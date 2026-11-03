/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { LogEntry, ModelArmorPayload } from '../../types';
import * as api from '../../services/apiService';
import { toErrorMessage } from '../../utils/errors';
import {
  EngineArmorState,
  extractLogExclusionAndStreamingInfo,
  evaluateLogEntryForExclusion,
  validateProposedExclusionRule,
} from './types';

export const VerdictBadge: React.FC<{ verdict: string }> = ({ verdict }) => {
  const isBlocked = verdict === 'BLOCKED' || verdict === 'MODEL_ARMOR_SANITIZATION_VERDICT_BLOCK';
  const isAllowed = verdict === 'ALLOWED' || verdict === 'NO_MATCH_FOUND';

  let colorClass = 'bg-gray-700 text-gray-300 border-gray-600';
  let icon: React.ReactNode = null;

  if (isBlocked) {
    colorClass = 'bg-red-900/50 text-red-200 border-red-800';
    icon = (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
          clipRule="evenodd"
        />
      </svg>
    );
  } else if (isAllowed) {
    colorClass = 'bg-green-900/50 text-green-200 border-green-800';
    icon = (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border flex items-center ${colorClass}`}>
      {icon}
      {verdict}
    </span>
  );
};

export const getTriggeredFilter = (
  rawFilterResults: unknown,
): { name: string; confidence?: string } | null => {
  const filterResults = rawFilterResults as
    | Record<string, Record<string, { matchState?: string; confidenceLevel?: string }>>
    | undefined
    | null;
  if (!filterResults) return null;
  for (const filterName in filterResults) {
    const result = filterResults[filterName];
    if (!result || typeof result !== 'object') continue;
    const filterResultKey = Object.keys(result)[0];
    if (result[filterResultKey]?.matchState === 'MATCH_FOUND') {
      return {
        name: filterName,
        confidence: result[filterResultKey]?.confidenceLevel,
      };
    }
  }
  return null;
};

export const parseAssistantFromCorrelationId = (correlationId: string): string => {
  if (!correlationId || !correlationId.startsWith('AS|')) {
    return 'N/A';
  }
  try {
    const parts = correlationId.split('|');
    if (parts.length > 1 && parts[1].startsWith('projects/')) {
      const path = parts[1];
      const pathParts = path.split('/');
      const assistantIndex = pathParts.indexOf('assistants');
      if (assistantIndex > 0 && assistantIndex < pathParts.length - 1) {
        const engineId = pathParts[assistantIndex - 1];
        const assistantId = pathParts[assistantIndex + 1];
        return `${engineId} / ${assistantId}`;
      }
      return path;
    }
  } catch {
    // Fallthrough
  }
  return 'N/A';
};

export interface LogEntryCardProps {
  log: LogEntry;
  projectNumber?: string;
  templates?: Array<{
    name?: string;
    filterConfig?: Record<string, unknown>;
    templateMetadata?: Record<string, unknown>;
  }>;
  enginesList?: EngineArmorState[];
  isPoliciesLoading?: boolean;
  onRequestPolicies?: () => void;
  onPolicyUpdated?: () => void;
}

export const LogEntryCard: React.FC<LogEntryCardProps> = ({
  log,
  projectNumber = '',
  templates = [],
  enginesList = [],
  isPoliciesLoading = false,
  onRequestPolicies,
  onPolicyUpdated,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showExclusionEvaluator, setShowExclusionEvaluator] = useState(false);

  const payload = log.jsonPayload as ModelArmorPayload | undefined;
  const sanitizationResult = payload?.sanitizationResult;
  const triggeredFilter = getTriggeredFilter(sanitizationResult?.filterResults);
  const exclusionInfo = extractLogExclusionAndStreamingInfo(log);

  const evaluation = useMemo(
    () => evaluateLogEntryForExclusion(log, templates, enginesList),
    [log, templates, enginesList],
  );

  const [selectedTemplateName, setSelectedTemplateName] = useState<string>(
    evaluation.detectedTemplateName || templates[0]?.name || '',
  );
  const [filterType, setFilterType] = useState<'PROMPT_INJECTION_AND_JAILBREAK' | 'RESPONSIBLE_AI'>(
    evaluation.mappedExclusionFilterType,
  );
  const [ruleType, setRuleType] = useState<'DICTIONARY' | 'REGEX'>(evaluation.recommendedRuleType);
  const [matchingScope, setMatchingScope] = useState<
    'MATCHING_SCOPE_PARTIAL_MATCH' | 'MATCHING_SCOPE_FULL_MATCH'
  >(evaluation.recommendedMatchingScope);
  const [dictionaryText, setDictionaryText] = useState<string>(evaluation.suggestedDictionaryPhrase);
  const [regexPattern, setRegexPattern] = useState<string>(evaluation.suggestedRegexPattern);
  const [enableLogSanitizeOps, setEnableLogSanitizeOps] = useState<boolean>(true);
  const [enforceDataResidency, setEnforceDataResidency] = useState<boolean>(true);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState<string | null>(null);

  // Sync detected template when templates/engines finish loading
  useEffect(() => {
    if (evaluation.detectedTemplateName) {
      setSelectedTemplateName(evaluation.detectedTemplateName);
    } else if (!selectedTemplateName && templates.length > 0 && templates[0]?.name) {
      setSelectedTemplateName(templates[0].name);
    }
  }, [evaluation.detectedTemplateName, templates, selectedTemplateName]);

  const ruleValidation = useMemo(
    () =>
      validateProposedExclusionRule({
        ruleType,
        matchingScope,
        dictionaryText,
        regexPattern,
        filterType,
      }),
    [ruleType, matchingScope, dictionaryText, regexPattern, filterType],
  );

  const handleToggleEvaluator = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextState = !showExclusionEvaluator;
    setShowExclusionEvaluator(nextState);
    if (nextState && templates.length === 0 && !isPoliciesLoading && onRequestPolicies) {
      onRequestPolicies();
    }
  };

  const handleApplyExclusionToPolicy = async () => {
    if (!projectNumber) {
      setApplyError('Project ID is required to update a Model Armor policy.');
      return;
    }
    if (!ruleValidation.valid) {
      setApplyError(ruleValidation.errors.join(' '));
      return;
    }

    const targetTemplate = templates.find((t) => t.name === selectedTemplateName);
    if (!targetTemplate) {
      setApplyError('Please select a target Model Armor policy template.');
      return;
    }

    setIsApplying(true);
    setApplyError(null);
    setApplySuccess(null);

    try {
      const exclusionRule =
        ruleType === 'DICTIONARY'
          ? {
              dictionary: {
                wordList: {
                  words: dictionaryText
                    .split(/\r?\n|,/)
                    .map((w) => w.trim())
                    .filter(Boolean),
                },
              },
              matchingScope,
            }
          : {
              regex: {
                pattern: regexPattern.trim(),
              },
              matchingScope,
            };

      const updated = await api.updateModelArmorTemplateExclusionRules(projectNumber, targetTemplate, {
        filterType,
        exclusionRule,
        enableLogSanitizeOperations: enableLogSanitizeOps,
        enforceDataResidencyCompliance: enforceDataResidency,
      });

      const templateShortId = (updated?.name || targetTemplate.name || '').split('/').pop();
      setApplySuccess(
        `Applied ${ruleType === 'DICTIONARY' ? 'Dictionary' : 'Regex'} (${matchingScope}) exclusion rule for ${filterType} to policy "${templateShortId}".`,
      );
      if (onPolicyUpdated) {
        onPolicyUpdated();
      }
    } catch (err: unknown) {
      setApplyError(toErrorMessage(err, 'Failed to apply exclusion rule to policy.'));
    } finally {
      setIsApplying(false);
    }
  };

  const correlationId = log.labels?.['modelarmor.googleapis.com/client_correlation_id'] || '';
  const sourceAssistant = parseAssistantFromCorrelationId(correlationId);

  const verdict =
    sanitizationResult?.sanitizationVerdict ||
    (sanitizationResult as { filterMatchState?: string } | undefined)?.filterMatchState ||
    'N/A';

  const verdictBadgeStyle =
    evaluation.verdict === 'LIKELY_FALSE_POSITIVE'
      ? 'bg-emerald-950/40 border-emerald-700/70 text-emerald-200'
      : evaluation.verdict === 'HIGH_RISK_TRUE_POSITIVE'
      ? 'bg-red-950/40 border-red-700/80 text-red-200'
      : evaluation.verdict === 'UNSUPPORTED_FILTER'
      ? 'bg-gray-900 border-gray-700 text-gray-300'
      : 'bg-amber-950/40 border-amber-700/70 text-amber-200';

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden shadow-sm transition-all hover:border-gray-600">
      {/* Header */}
      <div
        className="p-4 bg-gray-800 border-b border-gray-700/50 flex flex-col sm:flex-row justify-between sm:items-center gap-2 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-mono text-gray-400 bg-gray-900 px-2 py-1 rounded border border-gray-700">
            {log.receiveTimestamp ? new Date(log.receiveTimestamp).toLocaleString() : 'N/A'}
          </span>
          <span className="text-sm font-medium text-white" title={correlationId}>
            {sourceAssistant}
          </span>
          {exclusionInfo.streamChunkProcessed && (
            <span
              data-testid="log-streaming-chunk-badge"
              className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-900/50 text-cyan-200 border border-cyan-700/60"
              title="Sanitized via StreamSanitizeUserPrompt / StreamSanitizeModelResponse (streamChunkProcessed=true)"
            >
              Streaming Chunk
            </span>
          )}
          {exclusionInfo.overriddenFilters.length > 0 && (
            <span
              data-testid="log-exclusion-overridden-badge"
              className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-900/60 text-indigo-200 border border-indigo-700/70"
              title="modelarmor.googleapis.com/exclusion_rule_overridden_filters"
            >
              Exclusion Override: {exclusionInfo.overriddenFilters.join(', ')}
            </span>
          )}
          {(exclusionInfo.skippedFilters.length > 0 || exclusionInfo.skippedExecutionFilterKeys.length > 0) && (
            <span
              data-testid="log-exclusion-skipped-badge"
              className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-900/60 text-amber-200 border border-amber-700/70"
              title="modelarmor.googleapis.com/exclusion_rule_skipped_filters (EXECUTION_SKIPPED beyond 0.5 MB / 130k token scan limit)"
            >
              Exclusion Skipped (&gt;0.5MB):{' '}
              {(exclusionInfo.skippedFilters.length > 0
                ? exclusionInfo.skippedFilters
                : exclusionInfo.skippedExecutionFilterKeys
              ).join(', ')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            data-testid="evaluate-log-exclusion-button"
            onClick={handleToggleEvaluator}
            className={`px-2.5 py-1 rounded text-xs font-semibold border transition-colors flex items-center gap-1.5 ${
              showExclusionEvaluator
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-indigo-950/60 hover:bg-indigo-900/70 text-indigo-200 border-indigo-700/70'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
            {showExclusionEvaluator ? 'Hide Exclusion Evaluator' : 'Evaluate for Exclusion'}
          </button>
          <VerdictBadge verdict={verdict} />
          <button className="text-gray-500 hover:text-white transition-colors" aria-label="Toggle log details">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {/* Triggered Filter Info */}
          {triggeredFilter && (
            <div className="bg-red-900/10 border border-red-900/30 rounded-md p-3">
              <p className="text-xs font-bold text-red-300 uppercase mb-1">Triggered Filter</p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white font-medium">{triggeredFilter.name}</span>
                {triggeredFilter.confidence && (
                  <span className="text-xs text-red-200 bg-red-900/40 px-2 py-0.5 rounded">
                    Confidence: {triggeredFilter.confidence}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Exclusion Rule Activity Info */}
          {exclusionInfo.hasExclusionActivity && (
            <div className="bg-indigo-950/30 border border-indigo-800/50 rounded-md p-3 space-y-1.5 text-xs">
              <p className="font-bold text-indigo-300 uppercase">Model Armor Exclusion Rule Activity</p>
              {exclusionInfo.overriddenFilters.length > 0 && (
                <p className="text-indigo-100">
                  <strong>Overridden to NO_MATCH_FOUND:</strong>{' '}
                  <code className="font-mono bg-black/40 px-1.5 py-0.5 rounded text-indigo-200">
                    {exclusionInfo.overriddenFilters.join(', ')}
                  </code>{' '}
                  matched a template exclusion rule and bypassed violation blocking.
                </p>
              )}
              {(exclusionInfo.skippedFilters.length > 0 || exclusionInfo.skippedExecutionFilterKeys.length > 0) && (
                <p className="text-amber-200">
                  <strong>Skipped (`EXECUTION_SKIPPED` &gt; 0.5 MB / 130k tokens):</strong>{' '}
                  <code className="font-mono bg-black/40 px-1.5 py-0.5 rounded text-amber-200">
                    {(exclusionInfo.skippedFilters.length > 0
                      ? exclusionInfo.skippedFilters
                      : exclusionInfo.skippedExecutionFilterKeys
                    ).join(', ')}
                  </code>{' '}
                  triggered outside the initial 0.5 MB scanned by exclusion rules.
                </p>
              )}
            </div>
          )}

          {/* Explanation */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase mb-1">Reason</p>
            <p className="text-sm text-gray-300 bg-gray-900/50 p-2 rounded border border-gray-700/50">
              {sanitizationResult?.sanitizationVerdictReason || 'No detailed reason provided.'}
            </p>
          </div>
        </div>

        <div className="lg:col-span-1">
          <p className="text-xs font-bold text-gray-500 uppercase mb-1">Sanitized Input</p>
          <div className="bg-gray-900 p-3 rounded-md border border-gray-700/50 max-h-32 overflow-y-auto text-sm text-gray-300 font-mono whitespace-pre-wrap break-all">
            {payload?.sanitizationInput?.text || <span className="text-gray-600 italic">No input text available</span>}
          </div>
        </div>
      </div>

      {/* Exclusion Evaluator & Apply to Policy Panel */}
      {showExclusionEvaluator && (
        <div
          data-testid="log-exclusion-evaluator-panel"
          className="p-4 bg-gray-900/90 border-t border-indigo-800/60 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-800 pb-3">
            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Exclusion Rule Evaluator &amp; Policy Applicator</span>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-indigo-900/60 text-indigo-200 border border-indigo-700/60">
                  Preview
                </span>
              </h4>
              <p className="text-xs text-gray-400 mt-0.5">
                Assess false-positive eligibility, streaming sanitization compatibility, and apply an exclusion rule to
                an active Model Armor policy via live <code className="font-mono">PATCH</code>.
              </p>
            </div>
            {evaluation.detectedTemplateName && (
              <span className="text-[11px] font-mono bg-indigo-950/60 text-indigo-200 px-2.5 py-1 rounded border border-indigo-800/60">
                Matched Policy: {evaluation.detectedTemplateName.split('/').pop()} ({evaluation.detectedTemplateSource})
              </span>
            )}
          </div>

          {/* Verdict Banner */}
          <div data-testid="log-exclusion-verdict-banner" className={`p-3 rounded-lg border text-xs space-y-1 ${verdictBadgeStyle}`}>
            <div className="font-bold uppercase tracking-wide flex items-center justify-between">
              <span>Assessment: {evaluation.verdictLabel}</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-black/30">
                {evaluation.verdict}
              </span>
            </div>
            <p className="leading-relaxed opacity-95">{evaluation.verdictSummary}</p>
          </div>

          {evaluation.warnings.length > 0 && (
            <div className="space-y-1.5">
              {evaluation.warnings.map((w, idx) => (
                <div
                  key={idx}
                  className="text-xs text-amber-200 bg-amber-950/30 border border-amber-800/50 rounded p-2"
                >
                  <strong>Advisory:</strong> {w}
                </div>
              ))}
            </div>
          )}

          {evaluation.eligibleForExclusion && (
            <div className="bg-gray-800/80 border border-gray-700 rounded-lg p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Target Policy */}
                <div>
                  <label
                    htmlFor={`target-policy-${log.receiveTimestamp}`}
                    className="block text-[11px] font-semibold text-gray-400 mb-1"
                  >
                    Target Policy Template
                  </label>
                  <div className="flex gap-1.5">
                    <select
                      id={`target-policy-${log.receiveTimestamp}`}
                      aria-label="Target Policy for Exclusion"
                      value={selectedTemplateName}
                      onChange={(e) => setSelectedTemplateName(e.target.value)}
                      disabled={isPoliciesLoading || templates.length === 0}
                      className="w-full bg-gray-900 border border-gray-600 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                    >
                      {templates.length === 0 ? (
                        <option value="">
                          {isPoliciesLoading ? 'Loading policies...' : 'No active templates found'}
                        </option>
                      ) : (
                        templates.map((t) => {
                          const id = t.name?.split('/').pop() || t.name;
                          const loc = t.name?.split('/')[3] || 'global';
                          const isAuto = t.name === evaluation.detectedTemplateName;
                          return (
                            <option key={t.name} value={t.name}>
                              {id} ({loc}){isAuto ? ' ★ Auto-matched' : ''}
                            </option>
                          );
                        })
                      )}
                    </select>
                    {onRequestPolicies && (
                      <button
                        type="button"
                        onClick={onRequestPolicies}
                        disabled={isPoliciesLoading}
                        title="Refresh active Model Armor templates"
                        className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded border border-gray-600 text-xs shrink-0"
                      >
                        ↻
                      </button>
                    )}
                  </div>
                </div>

                {/* Target Filter */}
                <div>
                  <label
                    htmlFor={`target-filter-${log.receiveTimestamp}`}
                    className="block text-[11px] font-semibold text-gray-400 mb-1"
                  >
                    Target Safety Filter
                  </label>
                  <select
                    id={`target-filter-${log.receiveTimestamp}`}
                    aria-label="Exclusion Target Filter"
                    value={filterType}
                    onChange={(e) =>
                      setFilterType(e.target.value as 'PROMPT_INJECTION_AND_JAILBREAK' | 'RESPONSIBLE_AI')
                    }
                    className="w-full bg-gray-900 border border-gray-600 rounded px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value="PROMPT_INJECTION_AND_JAILBREAK">
                      Prompt Injection &amp; Jailbreak (PROMPT_INJECTION_AND_JAILBREAK)
                    </option>
                    <option value="RESPONSIBLE_AI">Responsible AI — All 4 Categories (RESPONSIBLE_AI)</option>
                  </select>
                </div>

                {/* Rule Type */}
                <div>
                  <label
                    htmlFor={`rule-type-${log.receiveTimestamp}`}
                    className="block text-[11px] font-semibold text-gray-400 mb-1"
                  >
                    Rule Mechanism
                  </label>
                  <select
                    id={`rule-type-${log.receiveTimestamp}`}
                    aria-label="Exclusion Rule Type"
                    value={ruleType}
                    onChange={(e) => setRuleType(e.target.value as 'DICTIONARY' | 'REGEX')}
                    className="w-full bg-gray-900 border border-gray-600 rounded px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value="DICTIONARY">Dictionary WordList (Exact/Substring Phrase)</option>
                    <option value="REGEX">Regular Expression (Word-Boundary Scoped)</option>
                  </select>
                </div>

                {/* Matching Scope */}
                <div>
                  <label
                    htmlFor={`matching-scope-${log.receiveTimestamp}`}
                    className="block text-[11px] font-semibold text-gray-400 mb-1"
                  >
                    Matching Scope &amp; Streaming
                  </label>
                  <select
                    id={`matching-scope-${log.receiveTimestamp}`}
                    aria-label="Exclusion Matching Scope"
                    value={matchingScope}
                    onChange={(e) =>
                      setMatchingScope(
                        e.target.value as 'MATCHING_SCOPE_PARTIAL_MATCH' | 'MATCHING_SCOPE_FULL_MATCH',
                      )
                    }
                    className="w-full bg-gray-900 border border-gray-600 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                  >
                    <option value="MATCHING_SCOPE_PARTIAL_MATCH">
                      MATCHING_SCOPE_PARTIAL_MATCH (Realtime &amp; Buffered OK)
                    </option>
                    <option value="MATCHING_SCOPE_FULL_MATCH">
                      MATCHING_SCOPE_FULL_MATCH (Buffered Streaming Only)
                    </option>
                  </select>
                </div>
              </div>

              {/* Editable Phrase or Regex Input */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <label
                    htmlFor={`exclusion-value-${log.receiveTimestamp}`}
                    className="text-[11px] font-semibold text-gray-300"
                  >
                    {ruleType === 'DICTIONARY'
                      ? 'Excluded Dictionary Phrase(s) (comma or newline separated, max 200 chars each)'
                      : 'Excluded Regular Expression Pattern (max 1,000 chars)'}
                  </label>
                  {evaluation.sanitizedInputText && (
                    <button
                      type="button"
                      onClick={() => {
                        if (ruleType === 'DICTIONARY') {
                          setDictionaryText(evaluation.suggestedDictionaryPhrase);
                        } else {
                          setRegexPattern(evaluation.suggestedRegexPattern);
                        }
                      }}
                      className="text-[11px] text-indigo-300 hover:text-indigo-200 underline"
                    >
                      Reset to Suggested {ruleType === 'DICTIONARY' ? 'Phrase' : 'Scoped Regex'}
                    </button>
                  )}
                </div>
                {ruleType === 'DICTIONARY' ? (
                  <input
                    id={`exclusion-value-${log.receiveTimestamp}`}
                    aria-label="Exclusion Phrase or Pattern"
                    type="text"
                    value={dictionaryText}
                    onChange={(e) => setDictionaryText(e.target.value)}
                    placeholder="e.g. ignore case when sorting this list"
                    className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-xs text-white font-mono"
                  />
                ) : (
                  <input
                    id={`exclusion-value-${log.receiveTimestamp}`}
                    aria-label="Exclusion Phrase or Pattern"
                    type="text"
                    value={regexPattern}
                    onChange={(e) => setRegexPattern(e.target.value)}
                    placeholder="e.g. (?i)\b(?:ignore\s+empty\s+rows)\b"
                    className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-xs text-amber-300 font-mono"
                  />
                )}
              </div>

              {/* Validation Warnings & Errors */}
              {ruleValidation.warnings.map((warn, idx) => (
                <div
                  key={`val-warn-${idx}`}
                  data-testid="log-exclusion-validation-warning"
                  className="text-xs text-amber-200 bg-amber-950/30 border border-amber-800/60 rounded p-2.5"
                >
                  <strong>Warning:</strong> {warn}
                </div>
              ))}
              {ruleValidation.errors.map((errMsg, idx) => (
                <div
                  key={`val-err-${idx}`}
                  data-testid="log-exclusion-validation-error"
                  className="text-xs text-red-300 bg-red-950/40 border border-red-800/70 rounded p-2.5"
                >
                  <strong>Validation Error:</strong> {errMsg}
                </div>
              ))}

              {/* Footer Actions */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-2 border-t border-gray-700/70">
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableLogSanitizeOps}
                      onChange={(e) => setEnableLogSanitizeOps(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-500 text-indigo-600 bg-gray-900"
                    />
                    <span>
                      Ensure <code className="font-mono text-indigo-300">templateMetadata.logSanitizeOperations</code>{' '}
                      is enabled
                    </span>
                  </label>

                  <label
                    className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer"
                    title="Required by Organization Policy constraints/modelarmor.managed.requireTemplateDataResidencyCompliance"
                  >
                    <input
                      type="checkbox"
                      checked={enforceDataResidency}
                      onChange={(e) => setEnforceDataResidency(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-500 text-indigo-600 bg-gray-900"
                    />
                    <span>
                      Enforce Data Residency (<code className="font-mono text-indigo-300">dataResidencyCompliant</code>)
                    </span>
                  </label>
                </div>

                <button
                  type="button"
                  data-testid="apply-exclusion-to-policy-button"
                  onClick={handleApplyExclusionToPolicy}
                  disabled={isApplying || !ruleValidation.valid || !selectedTemplateName}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed text-white text-xs font-bold rounded-md shadow transition-colors flex items-center justify-center gap-2 shrink-0"
                >
                  {isApplying && (
                    <div className="w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                  )}
                  Apply Exclusion to Policy
                </button>
              </div>

              {applyError && (
                <div
                  data-testid="apply-exclusion-error"
                  className="text-xs text-red-300 bg-red-950/40 border border-red-800 rounded p-2.5"
                >
                  {applyError}
                </div>
              )}

              {applySuccess && (
                <div
                  data-testid="apply-exclusion-success"
                  className="text-xs text-emerald-200 bg-emerald-950/40 border border-emerald-700 rounded p-2.5 font-medium"
                >
                  ✓ {applySuccess}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* JSON Expandable */}
      {isExpanded && (
        <div className="bg-black p-4 border-t border-gray-700">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-xs font-bold text-gray-500 uppercase">Raw Log Payload</h4>
            <button
              className="text-xs text-blue-400 hover:text-white"
              onClick={(e) => {
                e.stopPropagation();
                void navigator.clipboard.writeText(JSON.stringify(log.jsonPayload, null, 2));
              }}
            >
              Copy JSON
            </button>
          </div>
          <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-all overflow-x-auto max-h-96">
            {JSON.stringify(log.jsonPayload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

