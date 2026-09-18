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

import React, { useState, useEffect } from 'react';
import { Config, DataConnector } from '../../../types';
import {
  ConnectorChecklistDefinition,
  ChecklistProbeConfig,
} from './types';
import { useChecklistState } from './useChecklistState';
import { runAutomatedProbe } from './probeRunner';

interface DynamicConnectorVerificationProps {
  connector: Partial<DataConnector> | Record<string, unknown>;
  checklistDef: ConnectorChecklistDefinition;
  dataMode: 'INGESTION' | 'FEDERATED';
  config: Config;
  actionsEnabled?: boolean;
  onActionsToggle?: (enabled: boolean) => void;
}

export const DynamicConnectorVerification: React.FC<DynamicConnectorVerificationProps> = ({
  connector,
  checklistDef,
  dataMode,
  config,
  actionsEnabled,
  onActionsToggle,
}) => {
  const connectorName =
    (connector as { name?: string })?.name ||
    (connector as { connectorState?: { name?: string } })?.connectorState?.name ||
    'unknown_connector';
  const { state, toggleItem, recordProbeResult, resetChecklist } = useChecklistState(connectorName);

  const [activeDef, setActiveDef] = useState<ConnectorChecklistDefinition>(checklistDef);
  const [enableActions, setEnableActions] = useState<boolean>(actionsEnabled ?? false);

  useEffect(() => {
    setActiveDef(checklistDef);
  }, [checklistDef]);

  useEffect(() => {
    if (actionsEnabled !== undefined) {
      setEnableActions(actionsEnabled);
    }
  }, [actionsEnabled]);

  const [runningProbes, setRunningProbes] = useState<Record<string, boolean>>({});
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
  const [copiedAudit, setCopiedAudit] = useState(false);

  // Check if checklist contains action items
  const hasActionItems = activeDef.sections.some((s) =>
    s.items.some((i) => i.isActionRequirement || i.appliesToMode === 'ACTIONS')
  );
  const supportsActions = activeDef.supportsActions ?? hasActionItems;

  // Filter items based on dataMode and actions toggle
  const visibleSections = activeDef.sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.isActionRequirement || item.appliesToMode === 'ACTIONS') {
          return enableActions;
        }
        return !item.appliesToMode || item.appliesToMode === 'ALL' || item.appliesToMode === dataMode;
      }),
    }))
    .filter((section) => section.items.length > 0);

  const allVisibleItems = visibleSections.flatMap((s) => s.items);
  const requiredItems = allVisibleItems.filter((i) => i.badge === 'Required' || i.badge === 'Automated');
  const checkedCount = allVisibleItems.filter((i) => state.checkedItems[i.id]).length;
  const totalCount = allVisibleItems.length;
  const isFullyReady = requiredItems.length > 0 && requiredItems.every((i) => state.checkedItems[i.id]);
  const progressPercent = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 100;


  const handleRunSingleProbe = async (itemId: string, probe: ChecklistProbeConfig) => {
    setRunningProbes((prev) => ({ ...prev, [itemId]: true }));
    try {
      const result = await runAutomatedProbe(probe, connector, config);
      recordProbeResult(itemId, result);
    } finally {
      setRunningProbes((prev) => ({ ...prev, [itemId]: false }));
    }
  };

  const handleRunAllProbes = async () => {
    const automatedItems = allVisibleItems.filter((item) => item.automatedProbe);
    for (const item of automatedItems) {
      if (item.automatedProbe) {
        await handleRunSingleProbe(item.id, item.automatedProbe);
      }
    }
  };

  const handleCopySnippet = (snippet: string) => {
    navigator.clipboard.writeText(snippet);
    setCopiedSnippet(snippet);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  const handleExportAuditReport = () => {
    const lines = [
      `# Pre-Flight Readiness Audit Sign-Off`,
      `**Connector**: \`${connectorName}\``,
      `**Vendor Profile**: ${checklistDef.vendorDisplayName}`,
      `**Data Mode**: ${dataMode}`,
      `**Assistant Actions Mode**: ${enableActions ? 'ENABLED (Write & Execution Scopes Active)' : 'DISABLED (Read-Only Search Scopes)'}`,
      `**Audit Timestamp**: ${new Date().toISOString()}`,
      `**Status**: ${isFullyReady ? (enableActions ? 'VERIFIED_READY (Indexing & Actions)' : 'VERIFIED_READY') : 'READINESS_PENDING'} (${checkedCount}/${totalCount} items verified)`,
      '',
      `## Verification Breakdown`,
    ];

    visibleSections.forEach((section) => {
      lines.push(`### Step ${section.stepNumber}: ${section.title}`);
      section.items.forEach((item) => {
        const isChecked = !!state.checkedItems[item.id];
        const probe = state.probeResults?.[item.id];
        const actionTag = item.isActionRequirement ? ' [Action / Write Scope]' : '';
        lines.push(
          `- [${isChecked ? 'x' : ' '}] **${item.label}** (${item.badge || 'Standard'})${actionTag}${
            probe ? ` [Automated Probe: ${probe.status.toUpperCase()} - ${probe.message}]` : ''
          }`
        );
      });
      lines.push('');
    });

    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedAudit(true);
    setTimeout(() => setCopiedAudit(false), 2500);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Readiness Progress Bar Card */}
      <div className="bg-gray-800/80 border border-gray-700 rounded-lg p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                Pre-Flight Readiness Progress
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  isFullyReady
                    ? 'bg-green-950 text-green-300 border border-green-800'
                    : 'bg-yellow-950/60 text-yellow-300 border border-yellow-800/60'
                }`}
              >
                {isFullyReady
                  ? enableActions
                    ? 'Ready (Indexing & Actions)'
                    : 'Ready for Indexing'
                  : 'Readiness Pending'}
              </span>

              {/* Verified Baseline Documentation Badge */}
              <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold border transition-colors bg-teal-950/70 text-teal-300 border-teal-700/80"
                title="Curated baseline documentation verified against Google Cloud Knowledge Base"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                Verified Baseline (Google KB)
              </span>
            </div>
            <div className="text-sm font-semibold text-white mt-0.5">
              {checkedCount} of {totalCount} checks attested ({progressPercent}%)
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {allVisibleItems.some((i) => i.automatedProbe) && (
              <button
                type="button"
                onClick={handleRunAllProbes}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Run Automated Probes
              </button>
            )}

            <button
              type="button"
              onClick={handleExportAuditReport}
              className="px-2.5 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-medium rounded border border-gray-600 transition-colors flex items-center gap-1"
              title="Copy audit sign-off markdown to clipboard"
            >
              <svg className="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-2M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m-6 9h6m-6 4h6" />
              </svg>
              {copiedAudit ? 'Copied Audit!' : 'Export Sign-Off'}
            </button>

            <button
              type="button"
              onClick={resetChecklist}
              className="px-2 py-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700/50 rounded text-xs transition-colors"
              title="Reset checklist progress"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Visual Progress Bar */}
        <div className="w-full bg-gray-900 rounded-full h-2 overflow-hidden border border-gray-700/60">
          <div
            className={`h-full transition-all duration-300 ${
              isFullyReady ? 'bg-green-500' : progressPercent > 50 ? 'bg-blue-500' : 'bg-yellow-500'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Connection Capability & Actions Mode Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-gray-700/60 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Connection Scope:</span>
            <span className="font-semibold text-gray-200">
              {dataMode === 'INGESTION' ? 'Data Ingestion' : 'Federated Search'}
              {enableActions ? ' + Assistant Actions' : ' (Read-Only Search)'}
            </span>
          </div>

          {supportsActions && (
            <label className="inline-flex items-center gap-2 cursor-pointer bg-gray-900/90 px-2.5 py-1.5 rounded border border-purple-900/60 hover:border-purple-500/80 transition-colors select-none">
              <input
                type="checkbox"
                aria-label="Include Assistant Actions & Write Scopes"
                checked={enableActions}
                onChange={(e) => {
                  const nextVal = e.target.checked;
                  setEnableActions(nextVal);
                  onActionsToggle?.(nextVal);
                }}
                className="rounded text-purple-600 focus:ring-purple-500 h-3.5 w-3.5 bg-gray-800 border-gray-600 cursor-pointer"
              />
              <div className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="text-[11px] font-medium text-purple-200">
                  Include Assistant Actions (Write Permissions & Redirect URIs)
                </span>
              </div>
              {enableActions ? (
                <span className="text-[9px] font-bold bg-purple-900/80 text-purple-300 border border-purple-700 px-1.5 py-0.2 rounded uppercase">
                  Active
                </span>
              ) : (
                <span className="text-[9px] text-gray-400">
                  Off
                </span>
              )}
            </label>
          )}
        </div>
      </div>

      {/* Sections and Items List */}
      {visibleSections.map((section) => (
        <div key={section.id} className="bg-gray-800/90 border border-gray-700 rounded-lg p-5 shadow-sm space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-white flex items-center gap-2">
              <span className="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                {section.stepNumber}
              </span>
              <span>{section.title}</span>
            </h4>
            {section.description && <p className="text-xs text-gray-400 mt-1 pl-7">{section.description}</p>}
          </div>

          <div className="space-y-2 pl-1 sm:pl-7">
            {section.items.map((item) => {
              const isChecked = !!state.checkedItems[item.id];
              const probeResult = state.probeResults?.[item.id];
              const isRunning = !!runningProbes[item.id];

              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-lg border transition-all ${
                    isChecked
                      ? 'bg-blue-950/20 border-blue-500/40 text-blue-100'
                      : 'bg-gray-900/50 text-gray-300 border-gray-700/80 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div
                      onClick={() => toggleItem(item.id)}
                      className="flex items-start gap-3 flex-1 cursor-pointer select-none"
                    >
                      {/* Checkbox box */}
                      <div
                        className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                          isChecked ? 'bg-blue-500 border-blue-500' : 'border-gray-500 bg-transparent'
                        }`}
                      >
                        {isChecked && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold font-mono text-gray-200">{item.label}</span>
                          {item.badge && (
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-semibold border ${
                                item.badge === 'Live KB Verified'
                                  ? 'bg-emerald-950 text-emerald-300 border-emerald-700 animate-pulse'
                                  : item.badge === 'Required'
                                  ? 'bg-blue-950 text-blue-300 border-blue-800'
                                  : item.badge === 'Automated'
                                  ? 'bg-purple-950 text-purple-300 border-purple-800'
                                  : item.badge === 'Recommended'
                                  ? 'bg-teal-950 text-teal-300 border-teal-800'
                                  : 'bg-gray-700 text-gray-300 border-gray-600'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                          {item.isActionRequirement && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold border bg-purple-950/90 text-purple-300 border-purple-800 flex items-center gap-1">
                              <svg className="w-2.5 h-2.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                              Action / Write Scope
                            </span>
                          )}
                          {item.isLiveDocUpdate && (
                            <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-blue-900/60 text-blue-200 border border-blue-600/60">
                              NEW FROM DOCS
                            </span>
                          )}
                        </div>

                        {item.subLabel && <p className="text-xs text-gray-400 leading-relaxed">{item.subLabel}</p>}
                      </div>
                    </div>

                    {/* Actions on right */}
                    <div className="flex items-center gap-2 shrink-0">
                      {item.automatedProbe && (
                        <button
                          type="button"
                          onClick={() => handleRunSingleProbe(item.id, item.automatedProbe!)}
                          disabled={isRunning}
                          className="px-2 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 text-xs font-medium rounded border border-gray-600 transition-colors flex items-center gap-1"
                        >
                          {isRunning ? (
                            <>
                              <svg className="animate-spin h-3 w-3 text-blue-400" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              <span>Testing...</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-3 h-3 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                              <span>Test Probe</span>
                            </>
                          )}
                        </button>
                      )}

                      {item.documentationUrl && (
                        <a
                          href={item.documentationUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-gray-400 hover:text-blue-400 p-1"
                          title="Open documentation"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Code snippet block if applicable */}
                  {item.codeSnippet && (
                    <div className="mt-2 pl-7 flex items-center gap-2">
                      <code className="text-[11px] bg-gray-950 px-2 py-1 rounded text-purple-300 font-mono border border-gray-800 break-all">
                        {item.codeSnippet}
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopySnippet(item.codeSnippet!)}
                        className="px-1.5 py-0.5 text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-700 shrink-0"
                      >
                        {copiedSnippet === item.codeSnippet ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  )}

                  {/* Automated Probe Result Banner */}
                  {probeResult && (
                    <div
                      className={`mt-2.5 ml-7 p-2 rounded text-xs flex items-start gap-2 ${
                        probeResult.status === 'pass'
                          ? 'bg-green-950/40 text-green-300 border border-green-800/60'
                          : probeResult.status === 'warning'
                          ? 'bg-yellow-950/40 text-yellow-300 border border-yellow-800/60'
                          : 'bg-red-950/40 text-red-300 border border-red-800/60'
                      }`}
                    >
                      {probeResult.status === 'pass' ? (
                        <svg className="w-4 h-4 text-green-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : probeResult.status === 'warning' ? (
                        <svg className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold uppercase tracking-wider text-[10px] mr-1.5">
                          {probeResult.status}:
                        </span>
                        <span>{probeResult.message}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
