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

import React, { useState } from 'react';
import Spinner from '../Spinner';
import { getTemplateFilters, formatConfidenceLevel } from './types';

export interface ActivePoliciesViewerProps {
  templates: any[];
  associations: Record<string, string[]>;
  /** False when at least one app lookup failed, so "no association" is unproven. */
  associationsComplete: boolean;
  scanWarnings: string[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onClone: (template: any) => void;
}

export const ActivePoliciesViewer: React.FC<ActivePoliciesViewerProps> = ({
  templates,
  associations,
  associationsComplete,
  scanWarnings,
  isLoading,
  error,
  onRefresh,
  onClone,
}) => {
  const [expandedTemplates, setExpandedTemplates] = useState<Record<string, boolean>>({});

  const toggleExpanded = (templateName: string) => {
    setExpandedTemplates((prev) => ({
      ...prev,
      [templateName]: !prev[templateName],
    }));
  };

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-md p-6 space-y-4">
      <div className="flex justify-between items-center border-b border-gray-700 pb-3">
        <div>
          <h3 className="text-lg font-bold text-white">Active Protection Policies</h3>
          <p className="text-sm text-gray-400 mt-0.5">
            Existing Model Armor templates registered in the project, including Exclusion Rules (Preview) &amp;
            Streaming Sanitization compatibility.
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="px-3.5 py-1.5 bg-gray-700 hover:bg-gray-650 text-gray-200 text-xs font-semibold rounded border border-gray-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {isLoading && <div className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />}
          Refresh List
        </button>
      </div>

      {error && <div className="text-sm text-red-400 p-3 bg-red-950/20 rounded border border-red-900/50">{error}</div>}

      {!isLoading && scanWarnings.length > 0 && (
        <div className="text-xs text-amber-200 p-3 bg-amber-950/20 rounded border border-amber-900/50 space-y-1">
          <p className="font-semibold">
            Some apps could not be read, so &quot;Associated Apps&quot; below is incomplete. Anything shown as
            Unknown may or may not be protected.
          </p>
          <ul className="list-disc list-inside text-amber-300/90">
            {scanWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {isLoading && templates.length === 0 ? (
        <div className="flex items-center justify-center p-12">
          <Spinner />
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center p-8 text-gray-500 bg-gray-900/30 rounded border border-gray-800">
          No active Model Armor templates found in this project.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-800 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                <th className="pb-3 pl-3">Template ID</th>
                <th className="pb-3">Security Features</th>
                <th className="pb-3">RAI Filters</th>
                <th className="pb-3">Exclusion Rules &amp; Streaming</th>
                <th className="pb-3">Associated Apps</th>
                <th className="pb-3 pr-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 text-sm text-gray-300">
              {templates.map((temp) => {
                const templateId = temp.name.split('/').pop();
                const location = temp.name.split('/')[3];
                const filters = getTemplateFilters(temp);
                const ex = filters.exclusions;
                const isExpanded = Boolean(expandedTemplates[temp.name]);
                const templateSuffix = temp.name.match(/locations\/[^/]+\/templates\/[^/]+$/)?.[0];
                const apps =
                  associations[temp.name] ||
                  (templateSuffix ? associations[templateSuffix] : undefined) ||
                  [];

                return (
                  <React.Fragment key={temp.name}>
                    <tr className="hover:bg-gray-800/20 transition-colors">
                      <td className="py-4 pl-3 max-w-[200px] truncate">
                        <div className="font-mono font-semibold text-white truncate" title={templateId}>
                          {templateId}
                        </div>
                        <div className="text-xs text-gray-500 font-mono mt-0.5">{location}</div>
                      </td>
                      <td className="py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {filters.jailbreak && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-900/60 text-blue-200 border border-blue-800/60">
                              Jailbreak Defense
                            </span>
                          )}
                          {filters.maliciousUris && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-900/60 text-purple-200 border border-purple-800/60">
                              Malicious URI
                            </span>
                          )}
                          {filters.sdp && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-900/60 text-teal-200 border border-teal-800/60">
                              PII Redaction
                            </span>
                          )}
                          {!filters.jailbreak && !filters.maliciousUris && !filters.sdp && (
                            <span className="text-xs text-gray-500 italic">None</span>
                          )}
                        </div>
                      </td>
                      <td className="py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {filters.rai.length > 0 ? (
                            filters.rai.map((r: { type: string; level: string }) => (
                              <span
                                key={r.type}
                                className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-900/60 text-green-200 border border-green-800/60 flex items-center gap-1.5"
                              >
                                <span className="capitalize">{r.type.toLowerCase().replace('_', ' ')}</span>
                                <span className="text-green-300 font-mono text-[9px] bg-black/40 px-1 rounded border border-green-800/40">
                                  {formatConfidenceLevel(r.level)}
                                </span>
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-gray-500 italic">None</span>
                          )}
                        </div>
                      </td>
                      <td className="py-4">
                        {ex.hasExclusionRules ? (
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                data-testid={`exclusion-badge-${templateId}`}
                                className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-900/60 text-indigo-200 border border-indigo-700/60"
                              >
                                {ex.totalRules} Exclusion {ex.totalRules === 1 ? 'Rule' : 'Rules'}
                              </span>
                              {ex.streamingCompatibility === 'BUFFERED_ONLY' ? (
                                <span
                                  data-testid={`streaming-badge-${templateId}`}
                                  className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-900/60 text-red-200 border border-red-700/70"
                                  title={ex.streamingSummary}
                                >
                                  Buffered Streaming Only (FULL_MATCH)
                                </span>
                              ) : (
                                <span
                                  data-testid={`streaming-badge-${templateId}`}
                                  className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-900/50 text-emerald-200 border border-emerald-700/60"
                                  title={ex.streamingSummary}
                                >
                                  Realtime &amp; Buffered OK (PARTIAL_MATCH)
                                </span>
                              )}
                              {(ex.criticalIssues.length > 0 || ex.warnings.length > 0) && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-900/50 text-amber-200 border border-amber-700/60">
                                  {ex.criticalIssues.length + ex.warnings.length}{' '}
                                  {ex.criticalIssues.length + ex.warnings.length === 1 ? 'Issue' : 'Issues'}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-gray-400">
                              <span>
                                Targets:{' '}
                                {ex.targetedFilterTypes
                                  .map((ft) =>
                                    ft === 'PROMPT_INJECTION_AND_JAILBREAK'
                                      ? 'PI & Jailbreak'
                                      : ft === 'RESPONSIBLE_AI'
                                      ? 'RAI'
                                      : ft,
                                  )
                                  .join(', ')}
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleExpanded(temp.name)}
                                className="text-blue-400 hover:text-blue-300 underline font-medium"
                              >
                                {isExpanded ? 'Hide Details' : 'Inspect Rules'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500 italic">No exclusions</span>
                        )}
                      </td>
                      <td className="py-4">
                        {apps.length > 0 ? (
                          <div className="space-y-1">
                            {apps.map((app: string) => (
                              <span
                                key={app}
                                className="block text-xs bg-gray-900/60 px-2 py-1 rounded text-gray-300 border border-gray-800"
                              >
                                {app}
                              </span>
                            ))}
                          </div>
                        ) : associationsComplete ? (
                          <span
                            className="px-2.5 py-0.5 rounded text-[10px] font-semibold bg-gray-700/60 text-gray-400 border border-gray-650"
                            title="No assistant in this project references this template."
                          >
                            Not attached
                          </span>
                        ) : (
                          <span
                            className="px-2.5 py-0.5 rounded text-[10px] font-semibold bg-amber-900/50 text-amber-200 border border-amber-800"
                            title="At least one app could not be read, so we cannot say whether this template is attached."
                          >
                            Unknown
                          </span>
                        )}
                      </td>
                      <td className="py-4 pr-3 text-right">
                        <button
                          onClick={() => onClone(temp)}
                          className="px-2.5 py-1 bg-gray-700 hover:bg-gray-650 text-xs font-semibold rounded text-white border border-gray-650 flex items-center justify-center gap-1 ml-auto transition-colors"
                          title="Clone this template to another location or project"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"
                            />
                          </svg>
                          Clone
                        </button>
                      </td>
                    </tr>
                    {ex.hasExclusionRules && isExpanded && (
                      <tr className="bg-gray-900/60 border-b border-gray-800">
                        <td colSpan={6} className="p-4 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 pb-2">
                            <div className="text-xs font-semibold text-white">
                              Exclusion Rules (Preview) &amp; Streaming Sanitization Inspector &mdash;{' '}
                              <span className="font-mono text-indigo-300">{templateId}</span>
                            </div>
                            <span className="text-[11px] text-gray-400">
                              Cloud Logging (`logSanitizeOperations`):{' '}
                              <strong className={ex.logSanitizeOperationsEnabled ? 'text-green-400' : 'text-amber-300'}>
                                {ex.logSanitizeOperationsEnabled ? 'Enabled' : 'Disabled'}
                              </strong>
                            </span>
                          </div>

                          <div
                            className={`text-xs p-2.5 rounded border ${
                              ex.streamingCompatibility === 'BUFFERED_ONLY'
                                ? 'bg-red-950/30 border-red-800/60 text-red-200'
                                : 'bg-emerald-950/20 border-emerald-800/50 text-emerald-200'
                            }`}
                          >
                            <strong>Streaming Sanitization Mode:</strong> {ex.streamingSummary}
                          </div>

                          {(ex.criticalIssues.length > 0 || ex.warnings.length > 0) && (
                            <div className="space-y-1.5">
                              {ex.criticalIssues.map((issue, idx) => (
                                <div
                                  key={`crit-${idx}`}
                                  className="text-xs text-red-300 bg-red-950/30 border border-red-900/60 rounded p-2"
                                >
                                  <strong>Critical:</strong> {issue}
                                </div>
                              ))}
                              {ex.warnings.map((warn, idx) => (
                                <div
                                  key={`warn-${idx}`}
                                  className="text-xs text-amber-200 bg-amber-950/20 border border-amber-900/50 rounded p-2"
                                >
                                  <strong>Warning:</strong> {warn}
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {ex.rules.map((rule, rIdx) => (
                              <div
                                key={rIdx}
                                className="bg-gray-800/70 border border-gray-700 rounded-lg p-3 space-y-2 text-xs"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-1.5">
                                  <span className="font-bold text-indigo-300">
                                    Rule #{rIdx + 1}: {rule.ruleType === 'DICTIONARY' ? 'Dictionary WordList' : 'Regex Pattern'}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded font-mono text-[10px] border ${
                                      rule.matchingScope === 'MATCHING_SCOPE_FULL_MATCH'
                                        ? 'bg-red-900/40 text-red-200 border-red-800'
                                        : 'bg-blue-900/40 text-blue-200 border-blue-800'
                                    }`}
                                  >
                                    {rule.matchingScope}
                                  </span>
                                </div>
                                <div className="text-gray-400">
                                  Filter Target:{' '}
                                  <span className="font-mono text-gray-200">{rule.filterTypes.join(', ')}</span>
                                </div>
                                {rule.ruleType === 'DICTIONARY' ? (
                                  <div className="flex flex-wrap gap-1.5 pt-1">
                                    {rule.words.map((w, wIdx) => (
                                      <span
                                        key={wIdx}
                                        className="font-mono text-[11px] bg-gray-900 px-2 py-0.5 rounded border border-gray-700 text-gray-200"
                                      >
                                        &ldquo;{w}&rdquo;
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="pt-1">
                                    <code className="block font-mono text-[11px] bg-gray-900 p-2 rounded border border-gray-700 text-amber-300 break-all">
                                      {rule.regexPattern}
                                    </code>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
