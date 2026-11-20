/**
 * Copyright 2026 Google LLC
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

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Agent, Config, ConfigAuditItem, ConfigAuditSummary, Page } from '../types';
import {
  AgentPromotionOutcome,
  AgentPromotionRemapping,
  buildPromotedAgentPayload,
  exportProjectTerraformSnapshot,
  generateAuditMarkdown,
  inferAgentTypeLabel,
  promoteAgentsToTarget,
  runConfigAudit,
} from '../services/configAuditService';
import * as api from '../services/apiService';
import PageShell from '../components/layout/PageShell';
import PageHeader from '../components/layout/PageHeader';
import { Tabs, TabItem } from '../components/common/Tabs';
import { Modal } from '../components/common/Modal';
import ProjectEngineSelector, {
  ProjectEngineSelectorValue,
} from '../components/common/ProjectEngineSelector';
import AdminAuditTrailPanel from '../components/audit/AdminAuditTrailPanel';

interface ConfigAuditPageProps {
  projectNumber: string;
  projectId?: string;
  accessToken: string;
}

type AuditTabId = 'parity' | 'promotion' | 'audit-logs';

const AUDIT_TAB_ITEMS: readonly TabItem<AuditTabId>[] = [
  { id: 'parity', label: 'Environment Drift & Parity Audit' },
  { id: 'promotion', label: 'Cross-Project Agent Promotion (dev → prod)' },
  { id: 'audit-logs', label: 'Cloud Audit Logs (Admin Trail)' },
];

function getInitialAuditTab(): AuditTabId {
  if (typeof window === 'undefined') return 'parity';
  const search = window.location.search || window.location.hash.split('?')[1] || '';
  const tabParam = new URLSearchParams(search).get('tab');
  if (tabParam === 'parity' || tabParam === 'promotion' || tabParam === 'audit-logs') {
    return tabParam;
  }
  return 'parity';
}

function parseKeyValueLines(raw: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    const arrowIdx = trimmed.indexOf('->');
    if (arrowIdx > 0) {
      const k = trimmed.slice(0, arrowIdx).trim();
      const v = trimmed.slice(arrowIdx + 2).trim();
      if (k && v) map[k] = v;
    } else if (eqIdx > 0) {
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim();
      if (k && v) map[k] = v;
    }
  }
  return map;
}

const ConfigAuditPage: React.FC<ConfigAuditPageProps> = ({
  projectNumber,
  projectId,
}) => {
  const [activeTab, setActiveTab] = useState<AuditTabId>(getInitialAuditTab);

  const initialGlobalProject = projectId || projectNumber || '';
  const prevProjectPropsRef = useRef<{ projectId?: string; projectNumber: string }>({
    projectId,
    projectNumber,
  });

  // Source & Destination Environment State
  const [sourceEnv, setSourceEnv] = useState<ProjectEngineSelectorValue>(() => ({
    project: initialGlobalProject,
    location: 'global',
    engine: 'default_engine',
  }));

  const [targetEnv, setTargetEnv] = useState<ProjectEngineSelectorValue>({
    project: '',
    location: 'global',
    engine: 'default_engine',
  });

  // Keep source project reactively synced when global header project changes
  useEffect(() => {
    const prevProps = prevProjectPropsRef.current;
    const projectIdChanged = projectId !== prevProps.projectId;
    const projectNumberChanged = projectNumber !== prevProps.projectNumber;

    const effectiveNext =
      projectIdChanged && projectId
        ? projectId
        : projectNumberChanged && projectNumber
          ? projectIdChanged
            ? projectId || projectNumber
            : projectNumber
          : projectId || projectNumber || '';

    prevProjectPropsRef.current = { projectId, projectNumber };

    if ((projectIdChanged || projectNumberChanged) && effectiveNext) {
      setSourceEnv((prev) => {
        if (prev.project === effectiveNext) return prev;
        return {
          ...prev,
          project: effectiveNext,
          engine: 'default_engine',
        };
      });
      setSourceAgents([]);
      setSelectedAgentNames(new Set());
    } else if (effectiveNext) {
      setSourceEnv((prev) => (prev.project ? prev : { ...prev, project: effectiveNext }));
    }
  }, [projectNumber, projectId]);

  // -------------------------------------------------------------
  // Tab 1: Audit & Project Terraform Export State
  // -------------------------------------------------------------
  const [isAuditing, setIsAuditing] = useState<boolean>(false);
  const [auditProgress, setAuditProgress] = useState<{ step: string; percent: number }>({
    step: '',
    percent: 0,
  });
  const [auditSummary, setAuditSummary] = useState<ConfigAuditSummary | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<
    'ALL' | 'DIFFS_ONLY' | 'MATCHES_ONLY'
  >('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  // Project Terraform Exporter Modal / Drawer State
  const [isExportingTf, setIsExportingTf] = useState<boolean>(false);
  const [exportedTfHcl, setExportedTfHcl] = useState<string | null>(null);
  const [exportTfError, setExportTfError] = useState<string | null>(null);
  const [copiedProjectTf, setCopiedProjectTf] = useState<boolean>(false);

  // -------------------------------------------------------------
  // Tab 2: Cross-Project Agent Promotion State
  // -------------------------------------------------------------
  const [sourceAgents, setSourceAgents] = useState<Agent[]>([]);
  const [isLoadingSourceAgents, setIsLoadingSourceAgents] = useState<boolean>(false);
  const [sourceAgentsError, setSourceAgentsError] = useState<string | null>(null);
  const [selectedAgentNames, setSelectedAgentNames] = useState<Set<string>>(new Set());
  const [previewAgentName, setPreviewAgentName] = useState<string>('');

  const [dsRemapText, setDsRemapText] = useState<string>('');
  const [connRemapText, setConnRemapText] = useState<string>('');
  const [authRemapText, setAuthRemapText] = useState<string>('');
  const [reRemapText, setReRemapText] = useState<string>('');
  const [targetReLocation, setTargetReLocation] = useState<string>('');
  const [updateExistingByName, setUpdateExistingByName] = useState<boolean>(true);

  const [isPromoting, setIsPromoting] = useState<boolean>(false);
  const [isPromoteConfirmOpen, setIsPromoteConfirmOpen] = useState<boolean>(false);
  const [promotionOutcomes, setPromotionOutcomes] = useState<AgentPromotionOutcome[] | null>(null);
  const [promotionError, setPromotionError] = useState<string | null>(null);

  const handleRunAudit = async () => {
    if (!sourceEnv.project.trim() || !targetEnv.project.trim()) {
      setAuditError('Please specify both Source Project and Destination Project.');
      return;
    }

    setAuditError(null);
    setIsAuditing(true);
    setAuditProgress({ step: 'Initializing environment connection...', percent: 5 });

    const sourceConfig: Config = {
      projectId: sourceEnv.project.trim(),
      appLocation: sourceEnv.location,
      collectionId: 'default_collection',
      appId: sourceEnv.engine.trim() || 'default_engine',
      assistantId: 'default_assistant',
    };

    const targetConfig: Config = {
      projectId: targetEnv.project.trim(),
      appLocation: targetEnv.location,
      collectionId: 'default_collection',
      appId: targetEnv.engine.trim() || 'default_engine',
      assistantId: 'default_assistant',
    };

    try {
      const summary = await runConfigAudit(sourceConfig, targetConfig, (step, percent) => {
        setAuditProgress({ step, percent });
      });
      setAuditSummary(summary);
    } catch (err: unknown) {
      setAuditError(
        err instanceof Error ? err.message : 'Failed to complete configuration audit.'
      );
    } finally {
      setIsAuditing(false);
    }
  };

  const handleExportProjectTerraform = async () => {
    if (!sourceEnv.project.trim()) {
      setExportTfError('Please specify a Source Project ID or Number first.');
      return;
    }
    setIsExportingTf(true);
    setExportTfError(null);
    try {
      const hcl = await exportProjectTerraformSnapshot({
        projectId: sourceEnv.project.trim(),
        appLocation: sourceEnv.location || 'global',
        collectionId: 'default_collection',
        appId: sourceEnv.engine.trim() || 'default_engine',
        assistantId: 'default_assistant',
      });
      setExportedTfHcl(hcl);
    } catch (err: unknown) {
      setExportTfError(
        err instanceof Error ? err.message : 'Failed to export project Terraform snapshot.'
      );
    } finally {
      setIsExportingTf(false);
    }
  };

  const handleDownloadProjectTf = () => {
    if (!exportedTfHcl) return;
    const blob = new Blob([exportedTfHcl], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${sourceEnv.project.trim() || 'gemini-enterprise'}-main.tf`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyProjectTf = async () => {
    if (!exportedTfHcl) return;
    try {
      await navigator.clipboard.writeText(exportedTfHcl);
      setCopiedProjectTf(true);
      setTimeout(() => setCopiedProjectTf(false), 2000);
    } catch {
      // Ignore clipboard permission failure
    }
  };

  const handleDownloadMarkdown = () => {
    if (!auditSummary) return;
    const md = generateAuditMarkdown(auditSummary);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `ge-config-audit-${auditSummary.sourceProject}-to-${auditSummary.targetProject}.md`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadJson = () => {
    if (!auditSummary) return;
    const jsonStr = JSON.stringify(auditSummary, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `ge-config-audit-${auditSummary.sourceProject}-to-${auditSummary.targetProject}.json`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Load Source Agents for Promotion Tab
  const handleLoadSourceAgents = async () => {
    if (!sourceEnv.project.trim() || !sourceEnv.engine.trim()) {
      setSourceAgentsError('Specify Source Project and Gemini Enterprise App ID to load agents.');
      return;
    }
    setIsLoadingSourceAgents(true);
    setSourceAgentsError(null);
    try {
      const res = await api.listResources(
        'agents',
        {
          projectId: sourceEnv.project.trim(),
          appLocation: sourceEnv.location || 'global',
          collectionId: 'default_collection',
          appId: sourceEnv.engine.trim(),
          assistantId: 'default_assistant',
        },
        undefined,
        100,
        true
      );
      const fetched = res?.agents || [];
      setSourceAgents(fetched);
      setSelectedAgentNames(new Set(fetched.map((a) => a.name)));
      if (fetched.length > 0) {
        setPreviewAgentName(fetched[0].name);
      }
    } catch (err: unknown) {
      setSourceAgentsError(
        err instanceof Error ? err.message : 'Failed to list registered agents from source engine.'
      );
      setSourceAgents([]);
    } finally {
      setIsLoadingSourceAgents(false);
    }
  };

  const remappingConfig = useMemo<AgentPromotionRemapping>(
    () => ({
      dataStoreMap: parseKeyValueLines(dsRemapText),
      connectorMap: parseKeyValueLines(connRemapText),
      authorizationMap: parseKeyValueLines(authRemapText),
      reasoningEngineMap: parseKeyValueLines(reRemapText),
      targetReasoningEngineLocation: targetReLocation.trim() || undefined,
    }),
    [dsRemapText, connRemapText, authRemapText, reRemapText, targetReLocation]
  );

  const targetPromotionConfig = useMemo<Config>(
    () => ({
      projectId: targetEnv.project.trim() || 'TARGET_PROJECT_ID',
      appLocation: targetEnv.location || 'global',
      collectionId: 'default_collection',
      appId: targetEnv.engine.trim() || 'default_engine',
      assistantId: 'default_assistant',
      reasoningEngineLocation: targetReLocation.trim() || undefined,
    }),
    [targetEnv, targetReLocation]
  );

  const previewPromotedJson = useMemo(() => {
    const candidate =
      sourceAgents.find((a) => a.name === previewAgentName) ||
      sourceAgents.find((a) => selectedAgentNames.has(a.name)) ||
      sourceAgents[0];
    if (!candidate) return null;
    return buildPromotedAgentPayload(candidate, targetPromotionConfig, remappingConfig);
  }, [sourceAgents, previewAgentName, selectedAgentNames, targetPromotionConfig, remappingConfig]);

  const selectedSourceAgents = useMemo(
    () => sourceAgents.filter((a) => selectedAgentNames.has(a.name)),
    [sourceAgents, selectedAgentNames],
  );

  const handleRequestPromoteAgents = () => {
    if (!targetEnv.project.trim() || !targetEnv.engine.trim()) {
      setPromotionError('Please specify Target Project ID and Target Gemini Enterprise App ID.');
      return;
    }
    if (selectedSourceAgents.length === 0) {
      setPromotionError('Select at least one source agent to promote.');
      return;
    }
    setPromotionError(null);
    setIsPromoteConfirmOpen(true);
  };

  const handlePromoteSelectedAgents = async () => {
    if (!targetEnv.project.trim() || !targetEnv.engine.trim()) {
      setPromotionError('Please specify Target Project ID and Target Gemini Enterprise App ID.');
      setIsPromoteConfirmOpen(false);
      return;
    }
    if (selectedSourceAgents.length === 0) {
      setPromotionError('Select at least one source agent to promote.');
      setIsPromoteConfirmOpen(false);
      return;
    }
    setIsPromoting(true);
    setPromotionError(null);
    setPromotionOutcomes(null);
    try {
      const results = await promoteAgentsToTarget({
        agents: selectedSourceAgents,
        targetConfig: targetPromotionConfig,
        remapping: remappingConfig,
        updateExistingByName,
      });
      setPromotionOutcomes(results);
      setIsPromoteConfirmOpen(false);
    } catch (err: unknown) {
      setPromotionError(err instanceof Error ? err.message : 'Agent promotion failed.');
      setIsPromoteConfirmOpen(false);
    } finally {
      setIsPromoting(false);
    }
  };

  const toggleAgentSelection = (name: string) => {
    setSelectedAgentNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // Filtered Audit Items
  const filteredItems = useMemo(() => {
    if (!auditSummary) return [];
    return auditSummary.items.filter((item: ConfigAuditItem) => {
      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) {
        return false;
      }
      if (selectedStatusFilter === 'DIFFS_ONLY' && item.status === 'MATCH') {
        return false;
      }
      if (selectedStatusFilter === 'MATCHES_ONLY' && item.status !== 'MATCH') {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = item.name.toLowerCase().includes(q);
        const matchCategory = item.category.toLowerCase().includes(q);
        const matchSrc = String(item.sourceValue || '').toLowerCase().includes(q);
        const matchTgt = String(item.targetValue || '').toLowerCase().includes(q);
        const matchDetails = (item.details || '').toLowerCase().includes(q);
        return matchName || matchCategory || matchSrc || matchTgt || matchDetails;
      }
      return true;
    });
  }, [auditSummary, selectedCategory, selectedStatusFilter, searchQuery]);

  const categories = useMemo(() => {
    if (!auditSummary) return [];
    const set = new Set<string>();
    auditSummary.items.forEach((i) => set.add(i.category));
    return Array.from(set);
  }, [auditSummary]);

  return (
    <PageShell variant="wide" className="text-gray-100">
      <Modal
        isOpen={isPromoteConfirmOpen}
        onClose={() => !isPromoting && setIsPromoteConfirmOpen(false)}
        preventClose={isPromoting}
        size="lg"
        title="Confirm Cross-Project Agent Promotion"
        subtitle={`Live Discovery Engine write operation into ${targetEnv.project.trim()} (${targetEnv.location}/${targetEnv.engine.trim()})`}
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsPromoteConfirmOpen(false)}
              disabled={isPromoting}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-xs sm:text-sm font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="confirm-promote-agents-btn"
              onClick={() => void handlePromoteSelectedAgents()}
              disabled={isPromoting}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold rounded-lg shadow transition-colors"
            >
              {isPromoting
                ? 'Promoting Agents...'
                : `Confirm & Promote (${selectedSourceAgents.length})`}
            </button>
          </>
        }
      >
        <div className="space-y-4 text-xs text-gray-300">
          <div className="bg-amber-950/40 border border-amber-700/70 rounded-lg p-3 text-amber-100 leading-relaxed">
            You are about to execute live <code className="font-mono text-amber-200">createAgent</code>
            {updateExistingByName && (
              <>
                {' '}
                / <code className="font-mono text-amber-200">updateAgent</code> (in-place overwrite enabled)
              </>
            )}{' '}
            mutations against destination project{' '}
            <strong className="font-mono text-white">{targetEnv.project.trim()}</strong>.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-gray-900/80 border border-gray-700 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-blue-400 mb-1">
                Source Baseline
              </div>
              <div className="font-mono text-white truncate">{sourceEnv.project.trim()}</div>
              <div className="text-gray-400 mt-0.5">
                {sourceEnv.location} &bull; {sourceEnv.engine.trim() || 'default_engine'}
              </div>
            </div>
            <div className="bg-gray-900/80 border border-emerald-800/70 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-emerald-400 mb-1">
                Destination Target
              </div>
              <div className="font-mono text-white truncate">{targetEnv.project.trim()}</div>
              <div className="text-gray-400 mt-0.5">
                {targetEnv.location} &bull; {targetEnv.engine.trim() || 'default_engine'}
              </div>
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wider font-semibold text-gray-400 mb-1.5">
              Selected Agents ({selectedSourceAgents.length})
            </div>
            <ul className="bg-gray-900 border border-gray-700 rounded-lg divide-y divide-gray-800 max-h-44 overflow-y-auto">
              {selectedSourceAgents.map((agt) => (
                <li key={agt.name} className="px-3 py-2 flex items-center justify-between gap-2">
                  <span className="font-medium text-white truncate">
                    {agt.displayName || agt.name.split('/').pop()}
                  </span>
                  <span className="font-mono text-[11px] text-blue-300 shrink-0">
                    {inferAgentTypeLabel(agt)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Modal>

      <PageHeader
        title="App Configuration Audit"
        subtitle="Audit Source vs. Destination parity (Engines, Assistants, Registered Agents, DataStores, Skills), promote agents across environments, export Terraform HCL, and inspect Cloud Audit Logs."
        consolePage={Page.CONFIG_AUDIT}
        projectId={projectId}
        projectNumber={projectNumber}
        badges={
          <>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-900/80 text-blue-300 border border-blue-700/50 whitespace-nowrap">
              Drift, IaC &amp; Governance
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-900/80 text-emerald-300 border border-emerald-700/50 whitespace-nowrap">
              Enterprise Cutover Suite
            </span>
          </>
        }
        secondaryActions={
          <>
            {activeTab === 'parity' && (
              <button
                type="button"
                onClick={() => void handleExportProjectTerraform()}
                disabled={isExportingTf || !sourceEnv.project.trim()}
                data-testid="export-project-terraform-btn"
                className="px-3.5 h-9 bg-indigo-950/80 hover:bg-indigo-900 disabled:opacity-50 text-indigo-200 text-xs font-semibold rounded-lg border border-indigo-700/70 flex items-center gap-1.5 transition-colors shadow-sm whitespace-nowrap shrink-0"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 text-indigo-400 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                  />
                </svg>
                {isExportingTf ? 'Exporting HCL...' : 'Export Project as Terraform (.tf)'}
              </button>
            )}

            {activeTab === 'parity' && auditSummary && (
              <>
                <button
                  type="button"
                  onClick={handleDownloadMarkdown}
                  className="px-3 h-9 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium rounded-lg border border-gray-700 flex items-center gap-1.5 transition-colors shadow-sm whitespace-nowrap shrink-0"
                  title="Download Executive Markdown Report"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 text-gray-400 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  Export Report (.md)
                </button>
                <button
                  type="button"
                  onClick={handleDownloadJson}
                  className="px-3 h-9 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium rounded-lg border border-gray-700 flex items-center gap-1.5 transition-colors shadow-sm whitespace-nowrap shrink-0"
                  title="Download JSON Summary"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 text-gray-400 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Export JSON
                </button>
              </>
            )}
          </>
        }
      />

      <Tabs
        items={AUDIT_TAB_ITEMS}
        activeTab={activeTab}
        onChange={setActiveTab}
        ariaLabel="Configuration Governance Tabs"
        syncSearchParam="tab"
      />

      {/* Exported Project Terraform Preview Panel */}
      {activeTab === 'parity' && (exportedTfHcl || exportTfError) && (
        <div
          data-testid="project-terraform-export-panel"
          className="bg-gray-900/95 border border-indigo-700/60 rounded-xl p-5 space-y-3 shadow-xl"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white">
                Exported Source Project Infrastructure (<code className="font-mono text-indigo-300">main.tf</code>)
              </h3>
              <p className="text-xs text-gray-400">
                Includes discovered Discovery Engine Apps, Grounding DataStores, Custom IAM Roles, and sanitized declarative JSON bundle for Assistants, Agents, and OAuth Authorizations.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {exportedTfHcl && (
                <>
                  <button
                    type="button"
                    onClick={() => void handleCopyProjectTf()}
                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-600 rounded-lg text-xs font-medium"
                  >
                    {copiedProjectTf ? 'Copied!' : 'Copy HCL'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadProjectTf}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold"
                  >
                    Download .tf
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  setExportedTfHcl(null);
                  setExportTfError(null);
                }}
                className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg text-xs"
              >
                Close
              </button>
            </div>
          </div>

          {exportTfError ? (
            <div className="p-3 bg-red-950/50 border border-red-700 rounded-lg text-xs text-red-200">
              {exportTfError}
            </div>
          ) : (
            <pre className="bg-gray-950 border border-gray-800 rounded-lg p-3.5 text-[11px] font-mono text-gray-200 overflow-x-auto max-h-96">
              {exportedTfHcl}
            </pre>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 1: ENVIRONMENT DRIFT & PARITY AUDIT                           */}
      {/* ================================================================= */}
      {activeTab === 'parity' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <ProjectEngineSelector
              title="Source Environment (Baseline)"
              subtitle="Baseline Config"
              badgeColor="blue"
              value={sourceEnv}
              onChange={setSourceEnv}
              projectPlaceholder="e.g. my-source-project or 123456789"
              disabled={isAuditing}
            />

            <ProjectEngineSelector
              title="Destination Environment (Target)"
              subtitle="Target Config"
              badgeColor="emerald"
              value={targetEnv}
              onChange={setTargetEnv}
              projectPlaceholder="e.g. my-target-project or 987654321"
              disabled={isAuditing}
            />
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 bg-gray-800/60 p-4 rounded-xl border border-gray-800">
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-blue-400 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>
                Executes read-only parity checks across Engines, Assistants (Model Armor &amp; grounding flags), Registered Agents, DataStores, Skills Registry, and IdP modes.
              </span>
            </div>

            <button
              onClick={handleRunAudit}
              disabled={isAuditing || !sourceEnv.project.trim() || !targetEnv.project.trim()}
              className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium text-sm rounded-lg shadow-md transition-all flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
            >
              {isAuditing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  <span>Auditing ({auditProgress.percent}%)...</span>
                </>
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span>Run Parity Audit</span>
                </>
              )}
            </button>
          </div>

          {auditError && (
            <div className="mb-6 p-4 bg-red-900/40 border border-red-700/60 rounded-xl text-red-200 text-sm flex items-start gap-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <div className="font-semibold text-red-300">Audit Failed</div>
                <div className="text-xs text-red-200 mt-0.5">{auditError}</div>
              </div>
            </div>
          )}

          {isAuditing && (
            <div className="mb-6 p-4 bg-gray-800 rounded-xl border border-gray-700 shadow-md">
              <div className="flex items-center justify-between text-xs text-gray-300 mb-2">
                <span className="font-medium">{auditProgress.step}</span>
                <span className="font-semibold text-blue-400">{auditProgress.percent}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${auditProgress.percent}%` }}
                ></div>
              </div>
            </div>
          )}

          {auditSummary && (
            <div className="space-y-6">
              <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 shadow-lg">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-16 h-16 rounded-full flex items-center justify-center font-bold text-xl border-4 ${
                        auditSummary.overallScore === null
                          ? 'border-gray-500 text-gray-400 bg-gray-950/30'
                          : auditSummary.overallScore >= 90
                            ? 'border-emerald-500 text-emerald-400 bg-emerald-950/30'
                            : auditSummary.overallScore >= 70
                              ? 'border-amber-500 text-amber-400 bg-amber-950/30'
                              : 'border-red-500 text-red-400 bg-red-950/30'
                      }`}
                    >
                      {auditSummary.overallScore === null ? '?' : `${auditSummary.overallScore}%`}
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 uppercase tracking-wider font-semibold">
                        Parity Readiness
                      </div>
                      <div className="text-lg font-bold text-white">
                        {auditSummary.overallScore === null
                          ? 'Unable to assess'
                          : auditSummary.overallScore >= 90
                            ? 'Ready for Cutover'
                            : auditSummary.overallScore >= 70
                              ? 'Minor Remediations Recommended'
                              : 'Blockers Detected in Target'}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {auditSummary.totalChecks} configurations audited
                        {auditSummary.unknownCount > 0 && (
                          <span className="text-amber-400 ml-1">
                            ({auditSummary.unknownCount} unknown)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="flex-1 md:flex-initial px-4 py-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-center">
                      <div className="text-xs text-emerald-400 font-medium">Matched</div>
                      <div className="text-xl font-bold text-emerald-300">
                        {auditSummary.matchedCount}
                      </div>
                    </div>

                    <div className="flex-1 md:flex-initial px-4 py-2.5 rounded-lg bg-amber-950/40 border border-amber-800/60 text-center">
                      <div className="text-xs text-amber-400 font-medium">Configuration Drift</div>
                      <div className="text-xl font-bold text-amber-300">
                        {auditSummary.driftCount}
                      </div>
                    </div>

                    <div className="flex-1 md:flex-initial px-4 py-2.5 rounded-lg bg-red-950/40 border border-red-800/60 text-center">
                      <div className="text-xs text-red-400 font-medium">Missing in Target</div>
                      <div className="text-xl font-bold text-red-300">
                        {auditSummary.missingCount}
                      </div>
                    </div>

                    {auditSummary.unknownCount > 0 && (
                      <div className="flex-1 md:flex-initial px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-center">
                        <div className="text-xs text-gray-400 font-medium">Unknown</div>
                        <div className="text-xl font-bold text-gray-300">
                          {auditSummary.unknownCount}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
                  <button
                    onClick={() => setSelectedCategory('ALL')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      selectedCategory === 'ALL'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                    }`}
                  >
                    All ({auditSummary.items.length})
                  </button>
                  {categories.map((cat) => {
                    const count = auditSummary.items.filter((i) => i.category === cat).length;
                    return (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                          selectedCategory === cat
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                        }`}
                      >
                        {cat} ({count})
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <select
                    value={selectedStatusFilter}
                    onChange={(e) =>
                      setSelectedStatusFilter(
                        e.target.value as 'ALL' | 'DIFFS_ONLY' | 'MATCHES_ONLY'
                      )
                    }
                    className="bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="DIFFS_ONLY">Differences Only</option>
                    <option value="MATCHES_ONLY">Matches Only</option>
                  </select>

                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search audit items..."
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full sm:w-48"
                  />
                </div>
              </div>

              <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-900/80 text-gray-400 uppercase tracking-wider text-[10px] border-b border-gray-700">
                      <tr>
                        <th className="py-3 px-4">Pillar</th>
                        <th className="py-3 px-4">Asset / Component</th>
                        <th className="py-3 px-4">Source Setting</th>
                        <th className="py-3 px-4">Destination Setting</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4">Guidance / Remediation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700/60 text-gray-300">
                      {filteredItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-gray-500">
                            No audit items match the selected filter.
                          </td>
                        </tr>
                      ) : (
                        filteredItems.map((item) => {
                          const isExpanded = expandedItemId === item.id;
                          return (
                            <React.Fragment key={item.id}>
                              <tr
                                onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                                className="hover:bg-gray-700/40 transition-colors cursor-pointer group"
                              >
                                <td className="py-3 px-4 font-semibold text-gray-300 whitespace-nowrap">
                                  {item.category}
                                </td>
                                <td className="py-3 px-4 font-medium text-white flex items-center gap-1.5">
                                  <span>{item.name}</span>
                                  {item.remediation && (
                                    <span className="text-[10px] text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                      (click for details)
                                    </span>
                                  )}
                                </td>
                                <td
                                  className="py-3 px-4 font-mono text-[11px] text-gray-400 max-w-[180px] truncate"
                                  title={
                                    typeof item.sourceValue === 'object' &&
                                    item.sourceValue !== null
                                      ? JSON.stringify(item.sourceValue)
                                      : String(item.sourceValue ?? 'N/A')
                                  }
                                >
                                  {typeof item.sourceValue === 'object' &&
                                  item.sourceValue !== null
                                    ? JSON.stringify(item.sourceValue)
                                    : String(item.sourceValue ?? 'N/A')}
                                </td>
                                <td
                                  className="py-3 px-4 font-mono text-[11px] text-gray-400 max-w-[180px] truncate"
                                  title={
                                    typeof item.targetValue === 'object' &&
                                    item.targetValue !== null
                                      ? JSON.stringify(item.targetValue)
                                      : String(item.targetValue ?? 'N/A')
                                  }
                                >
                                  {typeof item.targetValue === 'object' &&
                                  item.targetValue !== null
                                    ? JSON.stringify(item.targetValue)
                                    : String(item.targetValue ?? 'N/A')}
                                </td>
                                <td className="py-3 px-4 text-center whitespace-nowrap">
                                  {item.status === 'MATCH' && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
                                      MATCH
                                    </span>
                                  )}
                                  {item.status === 'DRIFT' && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950 text-amber-300 border border-amber-800">
                                      DRIFT
                                    </span>
                                  )}
                                  {item.status === 'MISSING_IN_TARGET' && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-950 text-red-300 border border-red-800 animate-pulse">
                                      MISSING IN TARGET
                                    </span>
                                  )}
                                  {item.status === 'INFO' && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-700 text-gray-300">
                                      INFO
                                    </span>
                                  )}
                                  {item.status === 'UNKNOWN' && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-800 text-gray-400 border border-gray-600">
                                      UNKNOWN
                                    </span>
                                  )}
                                </td>
                                <td
                                  className="py-3 px-4 text-gray-400 max-w-xs truncate"
                                  title={item.remediation || item.details}
                                >
                                  {item.remediation ? (
                                    <span className="text-amber-300/90 font-medium">
                                      {item.remediation}
                                    </span>
                                  ) : (
                                    <span>{item.details || 'OK'}</span>
                                  )}
                                </td>
                              </tr>

                              {isExpanded && (
                                <tr className="bg-gray-900/90 text-xs">
                                  <td colSpan={6} className="p-4 border-l-2 border-blue-500">
                                    <div className="space-y-2">
                                      <div>
                                        <span className="font-semibold text-gray-300">
                                          Diagnostic Details:{' '}
                                        </span>
                                        <span className="text-gray-400">
                                          {item.details || 'No additional details.'}
                                        </span>
                                      </div>
                                      {item.remediation && (
                                        <div className="p-2.5 bg-gray-950 rounded-lg border border-gray-700/80">
                                          <span className="font-semibold text-amber-400">
                                            Recommended Cutover Remediation:{' '}
                                          </span>
                                          <div className="text-gray-200 mt-1 font-mono text-[11px]">
                                            {item.remediation}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {!auditSummary && !isAuditing && (
            <div className="bg-gray-800/50 border border-gray-800 rounded-xl p-12 text-center max-w-2xl mx-auto my-8">
              <div className="w-12 h-12 rounded-full bg-blue-900/40 text-blue-400 flex items-center justify-center mx-auto mb-4 border border-blue-700/50">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                  />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-white mb-2">No Audit Performed Yet</h3>
              <p className="text-xs text-gray-400 max-w-md mx-auto mb-6">
                Enter your Source Project and Destination Project credentials above, then click{' '}
                <strong>Run Parity Audit</strong> to compare Engines, Assistant Model Armor policies, Registered Agents, DataStores, and Skills.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-left">
                <div className="p-3 bg-gray-800 rounded-lg border border-gray-700 text-xs">
                  <div className="font-semibold text-gray-200">1. Engine &amp; Policy</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    IdP, Model Armor &amp; grounding
                  </div>
                </div>
                <div className="p-3 bg-gray-800 rounded-lg border border-gray-700 text-xs">
                  <div className="font-semibold text-gray-200">2. DataStores</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">Grounding store alignment</div>
                </div>
                <div className="p-3 bg-gray-800 rounded-lg border border-gray-700 text-xs">
                  <div className="font-semibold text-gray-200">3. Agents &amp; Skills</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    Registered agents &amp; scan policy
                  </div>
                </div>
                <div className="p-3 bg-gray-800 rounded-lg border border-gray-700 text-xs">
                  <div className="font-semibold text-gray-200">4. Quotas &amp; Auth</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    Seats &amp; OAuth authorizations
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ================================================================= */}
      {/* TAB 2: CROSS-PROJECT AGENT PROMOTION (dev -> prod)                */}
      {/* ================================================================= */}
      {activeTab === 'promotion' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ProjectEngineSelector
              title="Source Environment (e.g. dev / staging)"
              subtitle="Promote From"
              badgeColor="blue"
              value={sourceEnv}
              onChange={setSourceEnv}
              projectPlaceholder="e.g. my-dev-project"
              disabled={isPromoting}
            />
            <ProjectEngineSelector
              title="Target Environment (e.g. prod)"
              subtitle="Promote Into"
              badgeColor="emerald"
              value={targetEnv}
              onChange={setTargetEnv}
              projectPlaceholder="e.g. my-prod-project"
              disabled={isPromoting}
            />
          </div>

          {/* Step 1: Discover Source Registered Agents */}
          <div className="bg-gray-800/90 rounded-xl p-5 border border-gray-700/80 shadow-lg space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">
                  1. Select Registered Agents from Source Engine
                </h2>
                <p className="text-xs text-gray-400">
                  Loads live agents registered under <code className="font-mono text-gray-300">{sourceEnv.engine || 'default_engine'}/assistants/default_assistant</code>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleLoadSourceAgents()}
                disabled={isLoadingSourceAgents || !sourceEnv.project.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                {isLoadingSourceAgents ? 'Loading Source Agents...' : 'Load Source Agents'}
              </button>
            </div>

            {sourceAgentsError && (
              <div className="p-3 bg-red-950/50 border border-red-700/70 rounded-lg text-xs text-red-200">
                {sourceAgentsError}
              </div>
            )}

            {sourceAgents.length > 0 && (
              <div className="border border-gray-700 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-900 text-gray-400 uppercase text-[10px] border-b border-gray-700">
                    <tr>
                      <th className="py-2.5 px-3 w-10">Promote</th>
                      <th className="py-2.5 px-3">Display Name</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">State</th>
                      <th className="py-2.5 px-3 text-right">Payload Preview</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700/60">
                    {sourceAgents.map((agt) => {
                      const checked = selectedAgentNames.has(agt.name);
                      const isPreviewed = previewAgentName === agt.name;
                      return (
                        <tr key={agt.name} className="hover:bg-gray-700/30">
                          <td className="py-2.5 px-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleAgentSelection(agt.name)}
                              className="rounded border-gray-600 bg-gray-900 text-blue-500"
                            />
                          </td>
                          <td className="py-2.5 px-3 font-medium text-white">
                            <div>{agt.displayName}</div>
                            <div className="text-[10px] font-mono text-gray-400 truncate max-w-xs">
                              {agt.name.split('/').pop()}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-blue-300">
                            {inferAgentTypeLabel(agt)}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-gray-300">
                            {agt.state || 'ENABLED'}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => setPreviewAgentName(agt.name)}
                              className={`px-2.5 py-1 rounded text-[11px] font-medium border ${
                                isPreviewed
                                  ? 'bg-indigo-600 text-white border-indigo-500'
                                  : 'bg-gray-900 text-gray-300 border-gray-700 hover:bg-gray-700'
                              }`}
                            >
                              {isPreviewed ? 'Inspecting' : 'Preview JSON'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Step 2: Resource ID Remapping + Live Rewritten Payload Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-800/90 rounded-xl p-5 border border-gray-700/80 shadow-lg space-y-4">
              <div>
                <h2 className="text-base font-semibold text-white">
                  2. Optional Resource ID Remapping
                </h2>
                <p className="text-xs text-gray-400">
                  Project &amp; Location paths are rewritten automatically. Add <code className="font-mono text-gray-300">dev_id=prod_id</code> lines below when destination resource IDs differ.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-gray-300 mb-1">
                    DataStore ID Map (<code className="font-mono">src=tgt</code>)
                  </label>
                  <textarea
                    rows={3}
                    value={dsRemapText}
                    onChange={(e) => setDsRemapText(e.target.value)}
                    placeholder="hr-docs-dev=hr-docs-prod"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs font-mono text-gray-200 placeholder-gray-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-300 mb-1">
                    Connector Collection Map (<code className="font-mono">src=tgt</code>)
                  </label>
                  <textarea
                    rows={3}
                    value={connRemapText}
                    onChange={(e) => setConnRemapText(e.target.value)}
                    placeholder="jira-dev=jira-prod"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs font-mono text-gray-200 placeholder-gray-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-300 mb-1">
                    Authorization ID Map (<code className="font-mono">src=tgt</code>)
                  </label>
                  <textarea
                    rows={3}
                    value={authRemapText}
                    onChange={(e) => setAuthRemapText(e.target.value)}
                    placeholder="oauth-dev=oauth-prod"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs font-mono text-gray-200 placeholder-gray-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-300 mb-1">
                    ReasoningEngine ID Map (<code className="font-mono">src=tgt</code>)
                  </label>
                  <textarea
                    rows={3}
                    value={reRemapText}
                    onChange={(e) => setReRemapText(e.target.value)}
                    placeholder="111222333=999888777"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs font-mono text-gray-200 placeholder-gray-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-medium text-gray-300 mb-1">
                    Target Reasoning Engine Region (Optional)
                  </label>
                  <input
                    type="text"
                    value={targetReLocation}
                    onChange={(e) => setTargetReLocation(e.target.value)}
                    placeholder="Preserves source region (e.g. us-central1)"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-200 placeholder-gray-500"
                  />
                </div>

                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={updateExistingByName}
                      onChange={(e) => setUpdateExistingByName(e.target.checked)}
                      className="rounded border-gray-600 bg-gray-900 text-emerald-500"
                    />
                    <span>Update in-place if matching agent exists in Target</span>
                  </label>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  data-testid="open-promote-confirm-btn"
                  onClick={handleRequestPromoteAgents}
                  disabled={
                    isPromoting ||
                    selectedAgentNames.size === 0 ||
                    !targetEnv.project.trim() ||
                    !targetEnv.engine.trim()
                  }
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg shadow transition-colors"
                >
                  {isPromoting
                    ? 'Promoting Agents to Target Engine...'
                    : `Promote ${selectedAgentNames.size} Selected Agent(s) to ${targetEnv.project.trim() || 'Target'}`}
                </button>
              </div>

              {promotionError && (
                <div className="p-3 bg-red-950/50 border border-red-700 rounded-lg text-xs text-red-200">
                  {promotionError}
                </div>
              )}

              {promotionOutcomes && (
                <div className="space-y-2 pt-2">
                  <div className="text-xs font-semibold text-gray-200">Promotion Results</div>
                  {promotionOutcomes.map((out) => (
                    <div
                      key={out.sourceAgentName}
                      className={`p-2.5 rounded-lg border text-xs flex items-start justify-between gap-2 ${
                        out.action === 'FAILED'
                          ? 'bg-red-950/40 border-red-800 text-red-200'
                          : 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
                      }`}
                    >
                      <div>
                        <div className="font-semibold">
                          [{out.action}] {out.displayName}
                        </div>
                        {out.targetAgentName && (
                          <div className="font-mono text-[10px] text-emerald-300/80 break-all">
                            {out.targetAgentName}
                          </div>
                        )}
                        {out.error && <div className="text-[11px] mt-0.5">{out.error}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Live Rewritten JSON Inspector */}
            <div className="bg-gray-800/90 rounded-xl p-5 border border-gray-700/80 shadow-lg flex flex-col">
              <div className="mb-3">
                <h2 className="text-base font-semibold text-white">
                  3. Rewritten Target Payload Preview
                </h2>
                <p className="text-xs text-gray-400">
                  Exact Discovery Engine JSON body that will be sent via <code className="font-mono text-gray-300">createAgent</code> / <code className="font-mono text-gray-300">updateAgent</code>.
                </p>
              </div>
              <pre className="flex-1 bg-gray-950 border border-gray-800 rounded-lg p-3.5 text-[11px] font-mono text-gray-200 overflow-auto max-h-[480px]">
                {previewPromotedJson
                  ? JSON.stringify(previewPromotedJson, null, 2)
                  : '// Load source agents above to preview the rewritten target payload JSON.'}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 3: CLOUD AUDIT LOGS (ADMIN GOVERNANCE TRAIL)                  */}
      {/* ================================================================= */}
      {activeTab === 'audit-logs' && (
        <AdminAuditTrailPanel projectId={projectId || projectNumber || sourceEnv.project} />
      )}
    </PageShell>
  );
};

export default ConfigAuditPage;
