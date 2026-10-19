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

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { CitationMappingRuleItem, DynamicToolItem } from './types';
import {
  validateCitationMappings,
  previewCitationExtraction,
  extractCandidatePointersFromSample,
  synthesizeSampleJsonFromRule,
  SAMPLE_MCP_RESPONSE_PRESETS,
  SampleMcpResponsePreset,
} from './citationPointerUtils';

interface CitationMappingsSectionProps {
  citationMappings: CitationMappingRuleItem[];
  dynamicTools: DynamicToolItem[];
  onAddCitationMapping: (rule: CitationMappingRuleItem) => void;
  onUpdateCitationMapping: (index: number, updated: CitationMappingRuleItem) => void;
  onRemoveCitationMapping: (index: number) => void;
  onClearAllCitationMappings: () => void;
  focusedToolName?: string | null;
  instanceUri?: string;
  onProbeLiveTool?: (
    toolName: string,
    toolArgs?: Record<string, unknown>
  ) => Promise<Record<string, unknown>>;
}

export const CitationMappingsSection: React.FC<CitationMappingsSectionProps> = ({
  citationMappings,
  dynamicTools,
  onAddCitationMapping,
  onUpdateCitationMapping,
  onRemoveCitationMapping,
  onClearAllCitationMappings,
  focusedToolName,
  instanceUri,
  onProbeLiveTool,
}) => {
  const [selectedToolToAdd, setSelectedToolToAdd] = useState<string>('');
  const [customToolNameInput, setCustomToolNameInput] = useState<string>('');
  const [showLivePreview, setShowLivePreview] = useState<boolean>(
    () => citationMappings.length > 0
  );
  const hasHydratedPreviewRef = useRef<boolean>(citationMappings.length > 0);
  const [previewToolName, setPreviewToolName] = useState<string>(() => {
    const firstNamed = citationMappings.find((r) => r.toolName !== '');
    return firstNamed?.toolName || 'search_docs';
  });
  const [sampleJsonText, setSampleJsonText] = useState<string>(() => {
    if (citationMappings.length > 0) {
      const firstNamed = citationMappings.find((r) => r.toolName !== '');
      const toolKey = firstNamed?.toolName || '';
      const activeRule = firstNamed || citationMappings[0];
      // If the rule uses custom pointers rather than the default /results + /link, synthesize a matching sample!
      const isDefaultPresetPointers =
        activeRule &&
        !activeRule.itemsIsRoot &&
        (activeRule.items === '/results' || activeRule.items === '') &&
        (activeRule.uri === '/link' || activeRule.uri === '');
      if (!isDefaultPresetPointers) {
        return synthesizeSampleJsonFromRule(toolKey, citationMappings);
      }
    }
    return SAMPLE_MCP_RESPONSE_PRESETS[0].sampleJson;
  });
  const [activePresetId, setActivePresetId] = useState<string>(() => {
    if (citationMappings.length > 0) {
      const firstNamed = citationMappings.find((r) => r.toolName !== '');
      const activeRule = firstNamed || citationMappings[0];
      const isDefaultPresetPointers =
        activeRule &&
        !activeRule.itemsIsRoot &&
        (activeRule.items === '/results' || activeRule.items === '') &&
        (activeRule.uri === '/link' || activeRule.uri === '');
      if (!isDefaultPresetPointers) {
        return 'custom_synthesized';
      }
    }
    return SAMPLE_MCP_RESPONSE_PRESETS[0].id;
  });
  const [isProbingTool, setIsProbingTool] = useState<boolean>(false);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [probeSuccessNote, setProbeSuccessNote] = useState<string | null>(null);
  const hasSyncedInitialSampleRef = useRef<boolean>(citationMappings.length > 0);

  useEffect(() => {
    if (!hasHydratedPreviewRef.current && citationMappings.length > 0) {
      hasHydratedPreviewRef.current = true;
      setShowLivePreview(true);
    }
    if (!hasSyncedInitialSampleRef.current && citationMappings.length > 0) {
      hasSyncedInitialSampleRef.current = true;
      const firstNamed = citationMappings.find((r) => r.toolName !== '');
      const toolKey = firstNamed?.toolName || '';
      const activeRule = firstNamed || citationMappings[0];
      if (firstNamed) {
        setPreviewToolName(firstNamed.toolName);
      }
      const isDefaultPresetPointers =
        activeRule &&
        !activeRule.itemsIsRoot &&
        (activeRule.items === '/results' || activeRule.items === '') &&
        (activeRule.uri === '/link' || activeRule.uri === '');
      if (!isDefaultPresetPointers) {
        setSampleJsonText(synthesizeSampleJsonFromRule(toolKey, citationMappings));
        setActivePresetId('custom_synthesized');
      }
    }
  }, [citationMappings]);

  useEffect(() => {
    if (focusedToolName) {
      setPreviewToolName(focusedToolName);
    }
  }, [focusedToolName]);

  const hasDefaultRule = useMemo(
    () => citationMappings.some((r) => r.toolName === ''),
    [citationMappings]
  );

  const defaultRule = useMemo(
    () => citationMappings.find((r) => r.toolName === ''),
    [citationMappings]
  );

  const mappedToolNames = useMemo(
    () => new Set(citationMappings.map((r) => r.toolName)),
    [citationMappings]
  );

  const unmappedDynamicTools = useMemo(
    () => dynamicTools.filter((t) => !mappedToolNames.has(t.name)),
    [dynamicTools, mappedToolNames]
  );

  const validationIssues = useMemo(
    () => validateCitationMappings(citationMappings),
    [citationMappings]
  );

  // Determine effective preview tool name
  const effectivePreviewTool = useMemo(() => {
    if (citationMappings.length === 0) return previewToolName || 'search_docs';
    const hasCurrent = citationMappings.some((r) => r.toolName === previewToolName);
    if (hasCurrent) return previewToolName;
    const firstNamed = citationMappings.find((r) => r.toolName !== '');
    if (firstNamed) return firstNamed.toolName;
    return previewToolName || 'search_docs';
  }, [citationMappings, previewToolName]);

  const activePreviewRule = useMemo(
    () =>
      citationMappings.find((r) => r.toolName === effectivePreviewTool) ||
      defaultRule,
    [citationMappings, effectivePreviewTool, defaultRule]
  );

  const discoveredSchema = useMemo(
    () =>
      extractCandidatePointersFromSample(
        sampleJsonText,
        activePreviewRule?.items,
        activePreviewRule?.itemsIsRoot
      ),
    [sampleJsonText, activePreviewRule?.items, activePreviewRule?.itemsIsRoot]
  );

  const previewResult = useMemo(
    () => previewCitationExtraction(sampleJsonText, effectivePreviewTool, citationMappings),
    [sampleJsonText, effectivePreviewTool, citationMappings]
  );

  const handleSynthesizeSampleForTool = (targetTool: string) => {
    const synthesized = synthesizeSampleJsonFromRule(targetTool, citationMappings);
    setSampleJsonText(synthesized);
    setActivePresetId('custom_synthesized');
    setProbeError(null);
    setProbeSuccessNote(null);
  };

  const handleRunLiveToolAndDiscover = async (targetToolName?: string) => {
    const toolToCall = targetToolName || effectivePreviewTool;
    if (!onProbeLiveTool || !toolToCall) return;

    setIsProbingTool(true);
    setProbeError(null);
    setProbeSuccessNote(null);

    try {
      const liveResult = await onProbeLiveTool(toolToCall, {});
      const formattedJson = JSON.stringify(liveResult, null, 2);
      setSampleJsonText(formattedJson);
      setActivePresetId('live_tool_response');
      setShowLivePreview(true);

      const schema = extractCandidatePointersFromSample(formattedJson);
      if (schema) {
        const targetIdx = citationMappings.findIndex((r) => r.toolName === toolToCall);
        if (targetIdx >= 0) {
          onUpdateCitationMapping(targetIdx, {
            ...citationMappings[targetIdx],
            ...schema.recommendedRule,
          });
        } else {
          onAddCitationMapping({
            toolName: toolToCall,
            ...schema.recommendedRule,
          });
        }
        setPreviewToolName(toolToCall);
        setProbeSuccessNote(
          `Executed "${toolToCall}" on live MCP server and auto-populated ${schema.fieldCandidates.length} discovered JSON pointers!`
        );
      } else {
        setProbeSuccessNote(`Fetched live response from "${toolToCall}".`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setProbeError(msg || `Failed to call tool "${toolToCall}" on MCP server.`);
    } finally {
      setIsProbingTool(false);
    }
  };

  const handleAddDefaultRule = () => {
    if (hasDefaultRule) return;
    onAddCitationMapping({
      toolName: '',
      items: '/results',
      itemsIsRoot: false,
      uri: '/link',
      title: '/name',
      snippet: '/summary',
      id: '/doc_id',
    });
  };

  const handleAddNamedToolRule = () => {
    const toolKey =
      selectedToolToAdd === '__custom__'
        ? customToolNameInput.trim()
        : selectedToolToAdd.trim() ||
          unmappedDynamicTools[0]?.name ||
          customToolNameInput.trim();

    if (!toolKey || mappedToolNames.has(toolKey)) return;

    onAddCitationMapping({
      toolName: toolKey,
      items: hasDefaultRule ? '' : '/results',
      itemsIsRoot: false,
      uri: hasDefaultRule && defaultRule?.uri ? '' : '/link',
      title: hasDefaultRule && defaultRule?.title ? '' : '/name',
      snippet: '',
      id: '',
    });

    setPreviewToolName(toolKey);
    setCustomToolNameInput('');
    setSelectedToolToAdd('');
  };

  const handleLoadSamplePreset = (preset: SampleMcpResponsePreset) => {
    setActivePresetId(preset.id);
    setSampleJsonText(preset.sampleJson);
    setProbeError(null);
    setProbeSuccessNote(null);
  };

  const handleApplyPresetToCurrentTool = (preset: SampleMcpResponsePreset) => {
    setActivePresetId(preset.id);
    setSampleJsonText(preset.sampleJson);

    const targetIdx = citationMappings.findIndex(
      (r) => r.toolName === effectivePreviewTool
    );
    if (targetIdx >= 0) {
      onUpdateCitationMapping(targetIdx, {
        ...citationMappings[targetIdx],
        ...preset.recommendedRule,
      });
    } else if (citationMappings.length > 0) {
      onUpdateCitationMapping(0, {
        ...citationMappings[0],
        ...preset.recommendedRule,
      });
    } else {
      const targetTool =
        dynamicTools[0]?.name || effectivePreviewTool || 'search_docs';
      onAddCitationMapping({
        toolName: targetTool,
        ...preset.recommendedRule,
      });
      setPreviewToolName(targetTool);
    }
  };

  const handleAutoDetectFromCurrentSample = () => {
    if (!discoveredSchema) return;
    const targetIdx = citationMappings.findIndex(
      (r) => r.toolName === effectivePreviewTool
    );
    if (targetIdx >= 0) {
      onUpdateCitationMapping(targetIdx, {
        ...citationMappings[targetIdx],
        ...discoveredSchema.recommendedRule,
      });
    } else if (citationMappings.length > 0) {
      onUpdateCitationMapping(0, {
        ...citationMappings[0],
        ...discoveredSchema.recommendedRule,
      });
    } else {
      const targetTool =
        dynamicTools[0]?.name || effectivePreviewTool || 'search_docs';
      onAddCitationMapping({
        toolName: targetTool,
        ...discoveredSchema.recommendedRule,
      });
      setPreviewToolName(targetTool);
    }
  };

  return (
    <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-800 space-y-4">
      {/* Section Header */}
      <div className="border-b border-gray-800 pb-3 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-bold text-gray-200 uppercase tracking-wider">
              MCP Tool Citation Mappings
            </h4>
            <span className="text-purple-400 font-mono text-[10px]">
              (actionParams.citation_mappings)
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
              GA • REST API Only
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            Map MCP tool JSON responses to native Gemini Enterprise source citation chips using{' '}
            <span className="text-gray-300 font-mono">RFC 6901</span> JSON Pointers (
            <span className="font-mono text-gray-300">items</span>,{' '}
            <span className="font-mono text-gray-300">uri</span>,{' '}
            <span className="font-mono text-gray-300">title</span>,{' '}
            <span className="font-mono text-gray-300">snippet</span>,{' '}
            <span className="font-mono text-gray-300">id</span>).
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowLivePreview(!showLivePreview)}
            className={`px-2.5 py-1.5 text-xs font-semibold rounded border transition-colors flex items-center gap-1.5 ${
              showLivePreview
                ? 'bg-purple-950/80 text-purple-200 border-purple-700'
                : 'bg-gray-800 text-gray-300 border-gray-700 hover:text-white'
            }`}
          >
            <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            {showLivePreview ? 'Hide Live Preview' : 'Live Citation Preview'}
          </button>

          {citationMappings.length > 0 && (
            <button
              type="button"
              onClick={onClearAllCitationMappings}
              className="px-2.5 py-1.5 text-xs font-semibold rounded bg-gray-800 hover:bg-red-950/60 text-gray-400 hover:text-red-300 border border-gray-700 hover:border-red-800 transition-colors"
              title="Removes all citation mappings (sends citation_mappings: {})"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Add Mapping Toolbar */}
      <div className="bg-gray-950/80 p-3 rounded-lg border border-gray-800/90 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Add Default ("") Entry */}
          <button
            type="button"
            onClick={handleAddDefaultRule}
            disabled={hasDefaultRule}
            className="px-3 py-1.5 bg-amber-950/60 hover:bg-amber-900/70 disabled:opacity-40 text-amber-300 text-xs font-semibold rounded border border-amber-800/80 transition-colors flex items-center gap-1.5"
            title='Adds the "" default mapping inherited by all tools on the connector'
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {hasDefaultRule ? 'Default ("") Added' : 'Add Default ("") Rule'}
          </button>

          <span className="text-gray-700 hidden sm:inline">|</span>

          {/* Select Discovered Tool or Custom Name */}
          <select
            aria-label="Select MCP tool for citation mapping"
            value={selectedToolToAdd}
            onChange={(e) => setSelectedToolToAdd(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">
              {unmappedDynamicTools.length > 0
                ? `Select discovered tool (${unmappedDynamicTools.length} available)...`
                : 'Select tool...'}
            </option>
            {unmappedDynamicTools.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name} {t.enabled ? '(Enabled)' : '(Disabled)'}
              </option>
            ))}
            <option value="__custom__">+ Enter custom bare tool name...</option>
          </select>

          {(selectedToolToAdd === '__custom__' || unmappedDynamicTools.length === 0) && (
            <input
              type="text"
              value={customToolNameInput}
              onChange={(e) => setCustomToolNameInput(e.target.value)}
              placeholder="e.g. search_docs"
              aria-label="Custom bare tool name"
              className="bg-gray-900 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-white font-mono placeholder-gray-500 focus:outline-none focus:border-blue-500 w-44"
            />
          )}

          <button
            type="button"
            onClick={handleAddNamedToolRule}
            disabled={
              selectedToolToAdd === '__custom__'
                ? !customToolNameInput.trim() || mappedToolNames.has(customToolNameInput.trim())
                : !selectedToolToAdd && !customToolNameInput.trim() && unmappedDynamicTools.length === 0
            }
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-semibold rounded transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Tool Mapping
          </button>
        </div>

        <div className="text-[11px] text-gray-400 flex items-center gap-2">
          <span>
            Configured: <strong className="text-gray-200">{citationMappings.length}</strong> / 101 max
          </span>
        </div>
      </div>

      {/* Validation Issues Banner */}
      {validationIssues.length > 0 && (
        <div className="space-y-1.5" role="alert">
          {validationIssues.map((issue, idx) => (
            <div
              key={idx}
              className={`p-2.5 rounded text-xs flex items-start gap-2 border ${
                issue.severity === 'error'
                  ? 'bg-red-950/40 border-red-800/80 text-red-300'
                  : 'bg-amber-950/40 border-amber-800/80 text-amber-300'
              }`}
            >
              <svg
                className={`w-4 h-4 shrink-0 mt-0.5 ${
                  issue.severity === 'error' ? 'text-red-400' : 'text-amber-400'
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div>
                <span className="font-bold uppercase text-[10px] mr-1.5">
                  {issue.severity === 'error' ? 'RFC 6901 / API Error:' : 'Configuration Hint:'}
                </span>
                <span>{issue.message}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Configured Mapping Rules List */}
      {citationMappings.length === 0 ? (
        <div className="bg-gray-950/60 p-5 rounded-lg border border-gray-800/80 text-center space-y-2">
          <div className="text-xs text-gray-400">
            No citation mappings configured for this MCP connector.
          </div>
          <div className="text-[11px] text-gray-500 max-w-xl mx-auto">
            Add a <span className="text-amber-300 font-mono">Default (&quot;&quot;)</span> rule to cover all tools with a shared JSON schema, or add individual tool rules above to map tool output fields to Gemini Enterprise citation chips.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {citationMappings.map((rule, idx) => {
            const isDefault = rule.toolName === '';
            const discoveredTool = dynamicTools.find((t) => t.name === rule.toolName);
            const ruleIssues = validationIssues.filter((i) => i.toolName === rule.toolName);

            const inheritedUri = !isDefault && defaultRule?.uri ? defaultRule.uri : '';
            const inheritedTitle = !isDefault && defaultRule?.title ? defaultRule.title : '';
            const inheritedItems =
              !isDefault && defaultRule
                ? defaultRule.itemsIsRoot
                  ? '"" (Root)'
                  : defaultRule.items
                : '';

            return (
              <div
                key={`${rule.toolName}-${idx}`}
                className={`p-3.5 rounded-lg border space-y-3 transition-colors ${
                  isDefault
                    ? 'bg-amber-950/10 border-amber-800/50'
                    : 'bg-gray-950/70 border-gray-800'
                }`}
              >
                {/* Rule Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800/80 pb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isDefault ? (
                      <>
                        <span className="px-2 py-0.5 rounded text-xs font-bold font-mono bg-amber-950 text-amber-300 border border-amber-700/80">
                          &quot;&quot; (Default Entry)
                        </span>
                        <span className="text-[11px] text-gray-400">
                          Applies to all tools on this connector unless overridden per role
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-xs text-gray-400 font-semibold">Tool Key:</span>
                        {dynamicTools.length > 0 ? (
                          <>
                            <input
                              type="text"
                              list={`mcp-tool-names-list-${idx}`}
                              value={rule.toolName}
                              aria-label={`Tool name for rule ${idx + 1}`}
                              onChange={(e) =>
                                onUpdateCitationMapping(idx, {
                                  ...rule,
                                  toolName: e.target.value,
                                })
                              }
                              className="bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-xs font-mono font-bold text-purple-300 focus:outline-none focus:border-blue-500"
                            />
                            <datalist id={`mcp-tool-names-list-${idx}`}>
                              {dynamicTools.map((dt) => (
                                <option key={dt.name} value={dt.name}>
                                  {dt.description ? dt.description.slice(0, 70) : dt.name}
                                </option>
                              ))}
                            </datalist>
                          </>
                        ) : (
                          <input
                            type="text"
                            value={rule.toolName}
                            aria-label={`Tool name for rule ${idx + 1}`}
                            onChange={(e) =>
                              onUpdateCitationMapping(idx, {
                                ...rule,
                                toolName: e.target.value,
                              })
                            }
                            className="bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-xs font-mono font-bold text-purple-300 focus:outline-none focus:border-blue-500"
                          />
                        )}
                        {discoveredTool && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              discoveredTool.enabled
                                ? 'bg-green-950 text-green-300 border border-green-800'
                                : 'bg-gray-800 text-gray-400 border border-gray-700'
                            }`}
                          >
                            {discoveredTool.enabled ? 'Enabled Tool' : 'Disabled Tool'}
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {!isDefault && onProbeLiveTool && instanceUri && (
                      <button
                        type="button"
                        disabled={isProbingTool || !rule.toolName.trim()}
                        onClick={() => handleRunLiveToolAndDiscover(rule.toolName)}
                        className="px-2 py-1 text-[11px] font-semibold rounded bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/80 disabled:opacity-40 transition-colors flex items-center gap-1"
                        title="Call this tool on the live MCP server and auto-discover its JSON output pointers"
                      >
                        <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Auto-Discover from Live Tool
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const tName = rule.toolName || 'search_docs';
                        setPreviewToolName(tName);
                        handleSynthesizeSampleForTool(rule.toolName);
                        setShowLivePreview(true);
                      }}
                      className="px-2 py-1 text-[11px] font-semibold rounded bg-gray-800 hover:bg-gray-700 text-blue-400 border border-gray-700 transition-colors"
                    >
                      Test in Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveCitationMapping(idx)}
                      aria-label={`Remove citation mapping for ${rule.toolName || 'default'}`}
                      className="p-1 text-gray-500 hover:text-red-400 rounded hover:bg-gray-800 transition-colors"
                      title="Remove tool mapping"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Role Pointers Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                  {/* items */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-gray-300 font-mono">
                        items <span className="text-gray-500 font-sans">(root list)</span>
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateCitationMapping(idx, {
                            ...rule,
                            itemsIsRoot: !rule.itemsIsRoot,
                            items: !rule.itemsIsRoot ? '' : rule.items,
                          })
                        }
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                          rule.itemsIsRoot
                            ? 'bg-blue-950 text-blue-300 border-blue-700 font-bold'
                            : 'bg-gray-900 text-gray-400 border-gray-700 hover:text-gray-200'
                        }`}
                        title='Set items to "" when the tool returns a single object or list at the root of the response'
                      >
                        Root (&quot;&quot;)
                      </button>
                    </div>
                    {rule.itemsIsRoot ? (
                      <div className="bg-blue-950/30 border border-blue-800/70 rounded p-2 text-xs text-blue-300 font-mono flex items-center justify-between">
                        <span>&quot;&quot; (Entire response)</span>
                      </div>
                    ) : (
                      <input
                        type="text"
                        list="discovered-items-pointers-list"
                        value={rule.items}
                        aria-label={`items pointer for ${rule.toolName || 'default'}`}
                        onChange={(e) =>
                          onUpdateCitationMapping(idx, {
                            ...rule,
                            items: e.target.value,
                            itemsIsRoot: false,
                          })
                        }
                        placeholder={
                          inheritedItems
                            ? `Inherited: ${inheritedItems}`
                            : 'Auto (/results, /items...)'
                        }
                        className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-xs text-white font-mono placeholder-gray-500 focus:outline-none focus:border-blue-500"
                      />
                    )}
                  </div>

                  {/* uri (Required) */}
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-300 font-mono mb-1">
                      uri <span className="text-red-400">*</span>{' '}
                      <span className="text-gray-500 font-sans">(chip link)</span>
                    </label>
                    <input
                      type="text"
                      list="discovered-field-pointers-list"
                      value={rule.uri}
                      aria-label={`uri pointer for ${rule.toolName || 'default'}`}
                      onChange={(e) =>
                        onUpdateCitationMapping(idx, { ...rule, uri: e.target.value })
                      }
                      placeholder={
                        inheritedUri ? `Inherited: ${inheritedUri}` : '/link or /url (Required)'
                      }
                      className={`w-full bg-gray-900 border rounded p-2 text-xs text-white font-mono placeholder-gray-500 focus:outline-none focus:border-blue-500 ${
                        ruleIssues.some((i) => i.role === 'uri' && i.severity === 'error')
                          ? 'border-red-600'
                          : 'border-gray-700'
                      }`}
                    />
                  </div>

                  {/* title */}
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-300 font-mono mb-1">
                      title <span className="text-gray-500 font-sans">(chip label)</span>
                    </label>
                    <input
                      type="text"
                      list="discovered-field-pointers-list"
                      value={rule.title}
                      aria-label={`title pointer for ${rule.toolName || 'default'}`}
                      onChange={(e) =>
                        onUpdateCitationMapping(idx, { ...rule, title: e.target.value })
                      }
                      placeholder={
                        inheritedTitle ? `Inherited: ${inheritedTitle}` : '/name or /title'
                      }
                      className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-xs text-white font-mono placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* snippet */}
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-300 font-mono mb-1">
                      snippet <span className="text-gray-500 font-sans">(excerpt)</span>
                    </label>
                    <input
                      type="text"
                      list="discovered-field-pointers-list"
                      value={rule.snippet}
                      aria-label={`snippet pointer for ${rule.toolName || 'default'}`}
                      onChange={(e) =>
                        onUpdateCitationMapping(idx, { ...rule, snippet: e.target.value })
                      }
                      placeholder="Auto (/snippet, /summary...)"
                      className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-xs text-white font-mono placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* id */}
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-300 font-mono mb-1">
                      id <span className="text-gray-500 font-sans">(source ID)</span>
                    </label>
                    <input
                      type="text"
                      list="discovered-field-pointers-list"
                      value={rule.id}
                      aria-label={`id pointer for ${rule.toolName || 'default'}`}
                      onChange={(e) =>
                        onUpdateCitationMapping(idx, { ...rule, id: e.target.value })
                      }
                      placeholder="Defaults to uri"
                      className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-xs text-white font-mono placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Shared HTML5 datalists populated from the current Sample/Live MCP Tool Response JSON */}
      {discoveredSchema && (
        <>
          <datalist id="discovered-items-pointers-list">
            {discoveredSchema.itemsCandidates
              .filter((c) => !c.isRoot && c.pointer)
              .map((c) => (
                <option key={c.pointer} value={c.pointer}>
                  {c.label}
                </option>
              ))}
          </datalist>
          <datalist id="discovered-field-pointers-list">
            {discoveredSchema.fieldCandidates.map((f) => (
              <option key={f.pointer} value={f.pointer}>
                {f.suggestedRole ? `[${f.suggestedRole.toUpperCase()}] ` : ''}
                {f.sampleValue}
              </option>
            ))}
          </datalist>
        </>
      )}

      {/* LIVE JSON POINTER & CITATION CHIP PREVIEWER */}
      {showLivePreview && (
        <div className="bg-gray-950/90 p-4 rounded-lg border border-purple-900/60 space-y-4">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 border-b border-gray-800 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                <h5 className="text-xs font-bold text-purple-200 uppercase tracking-wider">
                  Live RFC 6901 JSON Pointer & Citation Chip Previewer
                </h5>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Paste a sample MCP tool response, synthesize a payload from your pointers, or execute the live tool to auto-discover pointers.
              </p>
            </div>

            {/* Tool Selector for Preview */}
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-xs text-gray-400 font-semibold">Simulate Tool:</label>
              <input
                type="text"
                value={effectivePreviewTool}
                aria-label="Simulated tool name"
                onChange={(e) => setPreviewToolName(e.target.value)}
                placeholder="e.g. search_docs"
                className="bg-gray-900 border border-gray-700 rounded px-2.5 py-1 text-xs font-mono text-purple-300 focus:outline-none focus:border-purple-500 w-40"
              />
              {citationMappings.filter((r) => r.toolName !== '').length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  {citationMappings
                    .filter((r) => r.toolName !== '')
                    .map((r) => (
                      <button
                        key={r.toolName}
                        type="button"
                        onClick={() => {
                          setPreviewToolName(r.toolName);
                          if (activePresetId === 'custom_synthesized') {
                            setSampleJsonText(
                              synthesizeSampleJsonFromRule(r.toolName, citationMappings)
                            );
                          }
                        }}
                        className={`px-2 py-1 rounded text-[11px] font-mono transition-colors ${
                          effectivePreviewTool === r.toolName
                            ? 'bg-purple-600 text-white font-bold'
                            : 'bg-gray-800 text-gray-400 hover:text-white'
                        }`}
                      >
                        {r.toolName}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* Live Tool Probe Feedback Banners */}
          {probeSuccessNote && (
            <div className="p-2.5 rounded bg-emerald-950/40 border border-emerald-800/80 text-emerald-300 text-xs flex items-center justify-between gap-2">
              <span>{probeSuccessNote}</span>
              <button
                type="button"
                onClick={() => setProbeSuccessNote(null)}
                className="text-emerald-400 hover:text-white text-[11px]"
              >
                Dismiss
              </button>
            </div>
          )}
          {probeError && (
            <div className="p-2.5 rounded bg-red-950/40 border border-red-800/80 text-red-300 text-xs flex items-center justify-between gap-2">
              <span>{probeError}</span>
              <button
                type="button"
                onClick={() => setProbeError(null)}
                className="text-red-400 hover:text-white text-[11px]"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Sample Payload Presets Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-gray-900/70 p-2.5 rounded border border-gray-800">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-gray-400 mr-1">
                Sample Tool Outputs:
              </span>
              <button
                type="button"
                onClick={() => handleSynthesizeSampleForTool(effectivePreviewTool)}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors ${
                  activePresetId === 'custom_synthesized'
                    ? 'bg-purple-950 text-purple-200 border-purple-600'
                    : 'bg-gray-950 text-purple-300 border-purple-900/70 hover:border-purple-700'
                }`}
                title="Synthesize a sample JSON payload that matches the configured pointers for the current tool"
              >
                Match Current Pointers
              </button>
              {onProbeLiveTool && instanceUri && (
                <button
                  type="button"
                  disabled={isProbingTool || !effectivePreviewTool.trim()}
                  onClick={() => handleRunLiveToolAndDiscover(effectivePreviewTool)}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors flex items-center gap-1 ${
                    activePresetId === 'live_tool_response'
                      ? 'bg-emerald-950 text-emerald-200 border-emerald-600'
                      : 'bg-emerald-950/40 text-emerald-300 border-emerald-800/80 hover:bg-emerald-900/60'
                  } disabled:opacity-40`}
                  title="Execute tools/call on the live MCP server and populate the real JSON response"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  {isProbingTool ? 'Calling MCP Tool...' : 'Fetch Live Tool Output'}
                </button>
              )}
              {SAMPLE_MCP_RESPONSE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleLoadSamplePreset(preset)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${
                    activePresetId === preset.id
                      ? 'bg-blue-950 text-blue-300 border-blue-700'
                      : 'bg-gray-950 text-gray-400 border-gray-800 hover:text-gray-200'
                  }`}
                  title={preset.description}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleAutoDetectFromCurrentSample}
                disabled={!discoveredSchema}
                className="px-2.5 py-1 rounded text-[11px] font-semibold bg-emerald-900/60 hover:bg-emerald-800/80 disabled:opacity-40 text-emerald-200 border border-emerald-700/80 transition-colors"
                title="Inspect the JSON in the Sample box and auto-populate the best items, uri, title, snippet, and id pointers"
              >
                Auto-Detect Pointers from JSON
              </button>
              {SAMPLE_MCP_RESPONSE_PRESETS.some((p) => p.id === activePresetId) && (
                <button
                  type="button"
                  onClick={() => {
                    const preset =
                      SAMPLE_MCP_RESPONSE_PRESETS.find((p) => p.id === activePresetId) ||
                      SAMPLE_MCP_RESPONSE_PRESETS[0];
                    handleApplyPresetToCurrentTool(preset);
                  }}
                  className="px-2.5 py-1 rounded text-[11px] font-semibold bg-purple-900/60 hover:bg-purple-800/80 text-purple-200 border border-purple-700/80 transition-colors"
                  title="Apply the active preset's recommended pointers to the simulated tool"
                >
                  Apply Recommended Pointers
                </button>
              )}
            </div>
          </div>

          {/* Discovered JSON Pointers Quick-Assign Bar */}
          {discoveredSchema && discoveredSchema.fieldCandidates.length > 0 && (
            <div className="bg-gray-900/60 p-2.5 rounded border border-gray-800/90 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-gray-300">
                  Discovered JSON Pointers in Sample ({discoveredSchema.fieldCandidates.length} fields) — click any field to assign to &quot;{effectivePreviewTool}&quot;:
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar">
                {discoveredSchema.fieldCandidates.map((cand) => (
                  <div
                    key={cand.pointer}
                    className="inline-flex items-center gap-1 bg-gray-950 border border-gray-800 rounded px-2 py-0.5 text-[11px]"
                    title={`Sample value: ${cand.sampleValue}`}
                  >
                    <span className="font-mono text-purple-300 font-semibold">
                      {cand.pointer}
                    </span>
                    <span className="text-gray-500 truncate max-w-[140px]">
                      = &quot;{cand.sampleValue}&quot;
                    </span>
                    {(['uri', 'title', 'snippet', 'id'] as const).map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => {
                          const targetIdx = citationMappings.findIndex(
                            (r) => r.toolName === effectivePreviewTool
                          );
                          if (targetIdx >= 0) {
                            onUpdateCitationMapping(targetIdx, {
                              ...citationMappings[targetIdx],
                              [role]: cand.pointer,
                            });
                          }
                        }}
                        className={`px-1 py-0.2 rounded text-[9px] font-mono uppercase transition-colors ${
                          cand.suggestedRole === role
                            ? 'bg-purple-800/80 text-white font-bold'
                            : 'bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800'
                        }`}
                        title={`Set ${role}="${cand.pointer}" on ${effectivePreviewTool}`}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Two-Column Split: Sample JSON Input vs Extracted Citation Chips */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: Sample Tool Output JSON */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-300">
                  Sample MCP Tool Response JSON
                </label>
                <span className="text-[10px] font-mono text-gray-500">
                  {previewResult.wrapperType === 'mcp_text_json'
                    ? 'Wrapper: content[0].text (Auto-decoded)'
                    : previewResult.wrapperType === 'mcp_structured_content'
                      ? 'Wrapper: structuredContent'
                      : 'Direct JSON Payload'}
                </span>
              </div>
              <textarea
                rows={11}
                value={sampleJsonText}
                aria-label="Sample MCP tool response JSON"
                onChange={(e) => setSampleJsonText(e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 rounded p-2.5 text-xs text-gray-200 font-mono focus:outline-none focus:border-purple-500 custom-scrollbar"
                spellCheck={false}
              />
            </div>

            {/* Right: Live Resolution & Citation Chips */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-300">
                  Simulated Gemini Enterprise Citation Chips
                </span>
                {previewResult.ok && previewResult.toolCovered && (
                  <span className="text-[11px] text-gray-400">
                    {previewResult.chips.filter((c) => c.hasValidChip).length} valid chip(s)
                  </span>
                )}
              </div>

              {/* Effective Pointers Summary */}
              {previewResult.ok && previewResult.toolCovered && (
                <div className="bg-gray-900/80 p-2.5 rounded border border-gray-800 space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    Effective Pointers for &quot;{effectivePreviewTool}&quot;
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[11px] font-mono">
                    {(['items', 'uri', 'title', 'snippet', 'id'] as const).map((role) => {
                      const info = previewResult.effectivePointers[role];
                      const displayPtr =
                        info.pointer === undefined
                          ? 'auto'
                          : info.pointer === ''
                            ? '"" (root)'
                            : info.pointer;
                      return (
                        <span
                          key={role}
                          className="px-2 py-0.5 rounded bg-gray-950 border border-gray-800 text-gray-300 flex items-center gap-1"
                        >
                          <span className="text-purple-400">{role}:</span>
                          <span>{displayPtr}</span>
                          {info.source === 'default' && (
                            <span className="text-[9px] text-amber-400 font-sans">(inherited)</span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                  <div className="text-[11px] text-gray-400 pt-0.5">
                    {previewResult.itemsSourceDescription}
                  </div>
                </div>
              )}

              {/* Wrapper Note */}
              {previewResult.wrapperNote && (
                <div className="p-2 rounded bg-blue-950/30 border border-blue-900/60 text-blue-300 text-[11px]">
                  {previewResult.wrapperNote}
                </div>
              )}

              {/* Parse Error or Uncovered State */}
              {!previewResult.ok && previewResult.parseError && (
                <div className="p-3 rounded bg-red-950/40 border border-red-800 text-red-300 text-xs font-mono">
                  {previewResult.parseError}
                </div>
              )}

              {previewResult.ok && !previewResult.toolCovered && (
                <div className="p-3 rounded bg-amber-950/30 border border-amber-800/70 text-amber-300 text-xs">
                  {previewResult.uncoveredReason || previewResult.fallbackReason}
                </div>
              )}

              {/* Rendered Citation Chips */}
              {previewResult.ok && previewResult.toolCovered && (
                <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                  {previewResult.chips.map((chip) =>
                    chip.hasValidChip ? (
                      <div
                        key={chip.index}
                        className="p-3 rounded-lg bg-gray-900 border border-gray-700/90 hover:border-blue-500/60 transition-colors space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="px-1.5 py-0.5 rounded bg-blue-600/20 border border-blue-500/40 text-blue-300 font-mono text-[10px] font-bold shrink-0">
                              [{chip.index + 1}]
                            </span>
                            <span className="text-xs font-bold text-white truncate">
                              {chip.title}
                            </span>
                          </div>
                          {chip.id && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-950 text-gray-400 border border-gray-800 shrink-0">
                              id: {chip.id}
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] text-blue-400 font-mono truncate">
                          {chip.uri}
                        </div>

                        {chip.snippet ? (
                          <p className="text-xs text-gray-300 line-clamp-2 pt-0.5">
                            {chip.snippet}
                          </p>
                        ) : (
                          <p className="text-[11px] text-gray-500 italic">
                            No snippet extracted
                          </p>
                        )}
                      </div>
                    ) : (
                      <div
                        key={chip.index}
                        className="p-2.5 rounded bg-red-950/20 border border-red-900/50 text-red-300 text-xs"
                      >
                        <div className="font-semibold">
                          Item #{chip.index + 1}: No Citation Chip Rendered
                        </div>
                        <div className="text-[11px] text-red-400 mt-0.5">
                          {chip.missingUriReason} (Item is still used to generate the answer, but no citation chip link is shown.)
                        </div>
                      </div>
                    )
                  )}

                  {previewResult.fallbackTriggered && previewResult.fallbackReason && (
                    <div className="p-2.5 rounded bg-amber-950/30 border border-amber-800/70 text-amber-300 text-xs">
                      {previewResult.fallbackReason}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
