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

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useInRouterContext, useSearchParams } from 'react-router-dom';
import { Agent, AppEngine, Assistant, Config, IamPolicy, Page, UserProfile } from '../types';
import * as api from '../services/apiService';
import ChatWindow from '../components/agents/ChatWindow';
import { PageShell } from '../components/layout/PageShell';
import { PageHeader } from '../components/layout/PageHeader';
import { ScopeBar } from '../components/layout/ScopeBar';
import { useWorkspaceScope } from '../context/WorkspaceScopeContext';
import { useToast } from '../context/ToastContext';
import { usePersistedConfig } from '../hooks/usePersistedConfig';
import {
  useAssistantList,
  AssistantRowData,
} from '../hooks/useAssistantList';
import { AssistantListTable } from '../components/assistants/page/AssistantListTable';
import {
  AssistantDetailView,
  AssistantDetailTab,
} from '../components/assistants/page/AssistantDetailView';
import {
  DEFAULT_BACKGROUND_CONCURRENCY,
  mapWithQuotaLimit,
} from '../utils/quotaGuard';

const VALID_DETAIL_TABS: readonly AssistantDetailTab[] = [
  'overview',
  'agents',
  'skills',
  'memories',
  'datastores',
  'notebooks',
  'history',
  'customize',
];

function readUrlTabParam(): AssistantDetailTab | null {
  if (typeof window === 'undefined') return null;
  const search =
    window.location.search ||
    (window.location.hash.includes('?')
      ? window.location.hash.slice(window.location.hash.indexOf('?'))
      : '');
  if (!search) return null;
  const raw = new URLSearchParams(search).get('tab');
  return raw && (VALID_DETAIL_TABS as readonly string[]).includes(raw)
    ? (raw as AssistantDetailTab)
    : null;
}

const AssistantUrlTabBridge: React.FC<{
  onUrlTab: (tab: AssistantDetailTab | null) => void;
  onClearedToRoot?: () => void;
  clearTabRef: React.MutableRefObject<(() => void) | null>;
}> = ({ onUrlTab, onClearedToRoot, clearTabRef }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const prevRawTabRef = useRef<string | null>(rawTab);

  clearTabRef.current = () => {
    if (searchParams.has('tab')) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('tab');
          return next;
        },
        { replace: true },
      );
    }
  };

  useEffect(() => {
    const valid =
      rawTab && (VALID_DETAIL_TABS as readonly string[]).includes(rawTab)
        ? (rawTab as AssistantDetailTab)
        : null;
    if (!rawTab && prevRawTabRef.current !== null) {
      onClearedToRoot?.();
    }
    prevRawTabRef.current = rawTab;
    onUrlTab(valid);
  }, [rawTab, onUrlTab, onClearedToRoot]);

  return null;
};

const toErrorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

interface AssistantPageProps {
  projectNumber: string;
  projectId?: string;
  setProjectNumber: (projectNumber: string) => void;
  accessToken: string;
  userProfile: UserProfile | null;
  onBuildTriggered?: (buildId: string, projectId?: string) => void;
  onNavigate?: (page: Page, context?: { appEngineId?: string }) => void;
  context?: { appEngineId?: string } | null;
}

const AssistantPage: React.FC<AssistantPageProps> = ({
  projectNumber,
  projectId,
  setProjectNumber: _setProjectNumber,
  accessToken,
  userProfile,
  onBuildTriggered,
  onNavigate,
  context,
}) => {
  const { toast } = useToast();
  const inRouter = useInRouterContext();
  const {
    appLocation: scopeLocation,
    appId: scopeAppId,
    setAppLocation: setScopeLocation,
    setAppId: setScopeAppId,
  } = useWorkspaceScope();

  const [config, setConfig] = usePersistedConfig<{ appLocation: string }>(
    'assistantPageConfig',
    { appLocation: scopeLocation || 'global' },
    {
      migrate: (parsed) => ({
        appLocation: parsed?.appLocation || scopeLocation || 'global',
      }),
    },
  );

  // Sync incoming WorkspaceScope location changes into local persisted config
  useEffect(() => {
    if (scopeLocation && scopeLocation !== config.appLocation) {
      setConfig((prev) =>
        prev.appLocation === scopeLocation ? prev : { ...prev, appLocation: scopeLocation },
      );
    }
  }, [scopeLocation, config.appLocation, setConfig]);

  const effectiveLocation = scopeLocation || config.appLocation || 'global';

  const baseApiConfig: Config = useMemo(
    () => ({
      projectId: projectId || projectNumber,
      appLocation: effectiveLocation,
      collectionId: 'default_collection',
      appId: '',
      assistantId: 'default_assistant',
    }),
    [projectNumber, projectId, effectiveLocation],
  );

  const {
    rows,
    setRows,
    sortedRows,
    isListLoading,
    listError,
    searchQuery,
    setSearchQuery,
    page,
    setPage,
    pageSize,
    filteredEngines,
    sortConfig,
    handleSort,
    fetchEngines,
  } = useAssistantList(projectNumber, baseApiConfig);

  // Detail View State
  const [selectedRow, setSelectedRow] = useState<AssistantRowData | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isEvaluateModalOpen, setIsEvaluateModalOpen] = useState(false);
  const [urlTab, setUrlTab] = useState<AssistantDetailTab | null>(readUrlTabParam);
  const [activeTab, setActiveTab] = useState<AssistantDetailTab>(
    () => readUrlTabParam() ?? 'overview',
  );
  const clearTabRef = useRef<(() => void) | null>(null);
  const autoSelectedUrlTabRef = useRef(false);
  const [aclProbeWarning, setAclProbeWarning] = useState<string | null>(null);
  const [agentDiscoveryWarning, setAgentDiscoveryWarning] = useState<string | null>(null);
  const [isDataStoreAclSupported, setIsDataStoreAclSupported] = useState<
    boolean | null
  >(() => {
    const override = localStorage.getItem('feature_flag_datastore_acls');
    if (override === 'true') return true;
    if (override === 'false') return false;
    return null;
  });

  // Chat Playground State
  const [chatTargetEngine, setChatTargetEngine] = useState<AppEngine | null>(null);
  const [activeChatConfig, setActiveChatConfig] = useState<{
    displayName: string;
    config: Config;
  } | null>(null);
  const handledContextEngineRef = useRef<string | null>(null);

  const handleUrlTabChange = useCallback((nextUrlTab: AssistantDetailTab | null) => {
    setUrlTab(nextUrlTab);
    if (nextUrlTab) {
      setActiveTab(nextUrlTab);
    }
  }, []);

  // Handle navigation context (e.g., "Test in Playground" from ArchitecturePage)
  useEffect(() => {
    const targetEngineName = context?.appEngineId;
    if (!targetEngineName || typeof targetEngineName !== 'string') return;

    const parts = targetEngineName.split('/');
    const targetLocation = parts.length >= 4 ? parts[3] : undefined;
    if (targetLocation && targetLocation !== effectiveLocation) {
      setScopeLocation(targetLocation);
      setConfig((prev) => ({ ...prev, appLocation: targetLocation }));
      return;
    }

    if (handledContextEngineRef.current === targetEngineName || rows.length === 0) {
      return;
    }

    const targetEngineId = parts.pop();
    const matchedRow = rows.find(
      (r) =>
        r.engine.name === targetEngineName ||
        (targetEngineId && r.engine.name.endsWith(`/${targetEngineId}`)),
    );
    if (matchedRow) {
      handledContextEngineRef.current = targetEngineName;
      const engineId = matchedRow.engine.name.split('/').pop()!;
      const assistantId = matchedRow.assistant?.name
        ? matchedRow.assistant.name.split('/').pop()!
        : 'default_assistant';
      setChatTargetEngine(matchedRow.engine);
      setActiveChatConfig({
        displayName: matchedRow.engine.displayName,
        config: {
          ...baseApiConfig,
          appId: engineId,
          assistantId,
        },
      });
    }
  }, [context, effectiveLocation, setScopeLocation, setConfig, rows, baseApiConfig]);

  // Probe DataStore ACL feature capability for this project/location
  useEffect(() => {
    if (!selectedRow?.engine) {
      setAclProbeWarning(null);
      return;
    }
    const override = localStorage.getItem('feature_flag_datastore_acls');
    if (override === 'true') {
      setIsDataStoreAclSupported(true);
      setAclProbeWarning(null);
      return;
    }
    if (override === 'false') {
      setIsDataStoreAclSupported(false);
      setAclProbeWarning(null);
      return;
    }

    let isMounted = true;
    const sampleDsId = selectedRow.engine.dataStoreIds?.[0];
    const engineConfig: Config = {
      ...baseApiConfig,
      appId: selectedRow.engine.name.split('/').pop()!,
    };
    setAclProbeWarning(null);
    api
      .checkDataStoreAclSupport(engineConfig, sampleDsId)
      .then((supported) => {
        if (isMounted) {
          setIsDataStoreAclSupported(supported);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setIsDataStoreAclSupported(false);
          setAclProbeWarning(
            `ACL capability probe (getAclConfig) failed${sampleDsId ? ` for data store "${sampleDsId}"` : ''}: ${toErrorMessage(err)}. Defaulting ACL status to unsupported.`,
          );
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedRow?.engine, baseApiConfig]);

  const handleLocationChange = useCallback(
    (nextLocation: string) => {
      setScopeLocation(nextLocation);
      setConfig((prev) => ({ ...prev, appLocation: nextLocation }));
      setSelectedRow(null);
      setAgents([]);
      setActiveTab('overview');
      setAclProbeWarning(null);
      setAgentDiscoveryWarning(null);
    },
    [setScopeLocation, setConfig],
  );

  const hydrationAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      hydrationAbortRef.current?.abort();
    };
  }, []);

  const fetchAgentsForAssistant = useCallback(
    async (appId: string, customAssistantId?: string) => {
      hydrationAbortRef.current?.abort();
      const abortController = new AbortController();
      hydrationAbortRef.current = abortController;

      setIsDetailLoading(true);
      setAgentDiscoveryWarning(null);
      const detailConfig = {
        ...baseApiConfig,
        appId,
        ...(customAssistantId ? { assistantId: customAssistantId } : {}),
      };
      try {
        const agentsResponse = await api.listResources('agents', detailConfig);
        if (abortController.signal.aborted) return;
        const baseAgents = agentsResponse.agents || [];

        if (baseAgents.length > 0) {
          const inferLocalAgentType = (agent: Agent): string | undefined => {
            if (agent.agentType) return agent.agentType;
            if (api.isGoogleManagedAgent(agent)) return 'MANAGED';
            if (agent.adkAgentDefinition) return 'ADK';
            if (agent.a2aAgentDefinition) return 'A2A';
            if (agent.skillAgentDefinition) return 'SKILL';
            if (
              agent.lowCodeAgentDefinition ||
              agent.workflowAgentDefinition ||
              agent.agentDesignerAgentDefinition ||
              agent.noCodeAgentDefinition
            ) {
              return 'LOW_CODE';
            }
            if (!agent.state || (agent.state !== 'ENABLED' && agent.state !== 'DISABLED')) {
              return 'LOW_CODE';
            }
            return undefined;
          };

          const inferLocalAgentOrigin = (agent: Agent): string | undefined => {
            if (agent.agentOrigin) return agent.agentOrigin;
            if (api.isGoogleManagedAgent(agent)) return 'GOOGLE';
            if (api.isCustomNoCodeAgent(agent)) return 'AGENT_DESIGNER';
            return undefined;
          };

          const locallyInferred = baseAgents.map((agent) => ({
            ...agent,
            agentType: inferLocalAgentType(agent),
            agentOrigin: inferLocalAgentOrigin(agent),
          }));

          // Render base list immediately without blocking on per-agent :getView RPCs
          setAgents(locallyInferred);

          const agentsNeedingView = locallyInferred.filter(
            (a) => !a.agentType || !a.agentOrigin,
          );

          if (agentsNeedingView.length > 0) {
            void mapWithQuotaLimit(
              agentsNeedingView,
              DEFAULT_BACKGROUND_CONCURRENCY,
              (agent) => api.getAgentView(agent.name, detailConfig),
              { signal: abortController.signal },
            ).then(({ outcomes }) => {
              if (abortController.signal.aborted) return;
              let rejectedCount = 0;
              const viewByName = new Map<string, { agentType?: string; agentOrigin?: string }>();
              outcomes.forEach((res, idx) => {
                if (res.status === 'rejected') rejectedCount += 1;
                if (res.status === 'fulfilled' && res.value?.agentView) {
                  viewByName.set(agentsNeedingView[idx].name, res.value.agentView);
                }
              });
              if (rejectedCount > 0) {
                setAgentDiscoveryWarning(
                  `Could not resolve AgentView (:getView) for ${rejectedCount} agent(s) on this assistant. Displaying locally inferred types.`,
                );
              }
              if (viewByName.size === 0) return;
              setAgents((prev) =>
                prev.map((a) => {
                  const v = viewByName.get(a.name);
                  if (!v) return a;
                  return {
                    ...a,
                    agentType: v.agentType || a.agentType,
                    agentOrigin: v.agentOrigin || a.agentOrigin,
                  };
                }),
              );
            });
          }

          const agentsNeedingIamOwner = locallyInferred.filter(
            (a) =>
              !api.isGoogleManagedAgent(a) &&
              !a.iamPolicy &&
              typeof api.getAgentIamPolicy === 'function',
          );
          if (agentsNeedingIamOwner.length > 0) {
            void mapWithQuotaLimit(
              agentsNeedingIamOwner,
              DEFAULT_BACKGROUND_CONCURRENCY,
              (agent) => api.getAgentIamPolicy(agent.name, detailConfig),
              { signal: abortController.signal },
            ).then(({ outcomes }) => {
              if (abortController.signal.aborted) return;
              const policyByName = new Map<string, IamPolicy>();
              outcomes.forEach((res, idx) => {
                if (res.status === 'fulfilled' && res.value?.bindings) {
                  policyByName.set(agentsNeedingIamOwner[idx].name, res.value);
                }
              });
              if (policyByName.size === 0) return;
              setAgents((prev) =>
                prev.map((agent) => {
                  const policy = policyByName.get(agent.name);
                  if (!policy) return agent;
                  return {
                    ...agent,
                    iamPolicy: policy,
                  };
                }),
              );
            });
          }
        } else {
          setAgents([]);
        }
      } catch (err: unknown) {
        console.error('Failed to fetch agents for assistant', err);
        setAgentDiscoveryWarning(`Agent discovery warning: ${toErrorMessage(err)}`);
        toast.error('Failed to load agents for this assistant.');
      } finally {
        setIsDetailLoading(false);
      }
    },
    [baseApiConfig, toast],
  );

  const openRowDetail = useCallback(
    (row: AssistantRowData, overrideTab?: AssistantDetailTab) => {
      if (!row.assistant) {
        toast.warning(
          `This engine (${row.engine.displayName}) has not been fully initialized with an assistant yet. Please open the Assistant configuration or check Discovery Engine status.`,
        );
        return;
      }
      const engineId = row.engine.name.split('/').pop()!;
      setScopeAppId(engineId);
      setSelectedRow(row);
      if (overrideTab) {
        setActiveTab(overrideTab);
      } else if (urlTab) {
        setActiveTab(urlTab);
      }
      const assistantId = row.assistant.name
        ? row.assistant.name.split('/').pop()
        : undefined;
      fetchAgentsForAssistant(engineId, assistantId);
    },
    [toast, setScopeAppId, urlTab, fetchAgentsForAssistant],
  );

  // Auto-select engine & boot into ?tab=customize when deep-linking to /assistant?tab=customize
  useEffect(() => {
    if (
      urlTab === 'customize' &&
      !selectedRow &&
      rows.length > 0 &&
      !autoSelectedUrlTabRef.current
    ) {
      const configuredRows = rows.filter((r) => Boolean(r.assistant));
      if (configuredRows.length === 0) return;

      const matchedByScope = scopeAppId
        ? configuredRows.find((r) => r.engine.name.endsWith(`/${scopeAppId}`))
        : undefined;
      const targetRow =
        matchedByScope ?? (configuredRows.length === 1 ? configuredRows[0] : undefined);

      if (targetRow) {
        autoSelectedUrlTabRef.current = true;
        openRowDetail(targetRow, 'customize');
      }
    }
  }, [urlTab, selectedRow, rows, scopeAppId, openRowDetail]);

  const handleRowClick = (row: AssistantRowData) => {
    openRowDetail(row);
  };

  const handleEvaluateClick = (row: AssistantRowData, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!row.assistant) {
      toast.warning(
        `This engine (${row.engine.displayName}) has not been fully initialized with an assistant yet.`,
      );
      return;
    }
    const engineId = row.engine.name.split('/').pop()!;
    setScopeAppId(engineId);
    setSelectedRow(row);
    setIsEvaluateModalOpen(true);
    const assistantId = row.assistant.name
      ? row.assistant.name.split('/').pop()
      : undefined;
    fetchAgentsForAssistant(engineId, assistantId);
  };

  const openPlaygroundForEngine = useCallback(
    (engine: AppEngine, assistant?: Assistant | null) => {
      const engineId = engine.name.split('/').pop()!;
      const assistantId = assistant?.name
        ? assistant.name.split('/').pop()!
        : 'default_assistant';
      const chatConfig: Config = {
        ...baseApiConfig,
        appId: engineId,
        assistantId,
      };
      setChatTargetEngine(engine);
      setActiveChatConfig({
        displayName: engine.displayName,
        config: chatConfig,
      });
    },
    [baseApiConfig],
  );

  const handleChatClick = (row: AssistantRowData, e: React.MouseEvent) => {
    e.stopPropagation();
    openPlaygroundForEngine(row.engine, row.assistant);
  };

  const handleBack = () => {
    clearTabRef.current?.();
    setUrlTab(null);
    setSelectedRow(null);
    setIsEvaluateModalOpen(false);
    setAgents([]);
    setActiveTab('overview');
    setAclProbeWarning(null);
    setAgentDiscoveryWarning(null);
    fetchEngines();
  };

  const handleAssistantUpdateSuccess = (updatedAssistant: Assistant) => {
    if (selectedRow) {
      setSelectedRow({ ...selectedRow, assistant: updatedAssistant });
    }
  };

  const handleEngineUpdateSuccess = (updatedEngine: AppEngine) => {
    if (selectedRow) {
      setSelectedRow({ ...selectedRow, engine: updatedEngine });
    }
    setRows((prev) =>
      prev.map((r) =>
        r.engine.name === updatedEngine.name
          ? { ...r, engine: updatedEngine }
          : r,
      ),
    );
  };

  return (
    <PageShell variant="wide" className="relative">
      {inRouter && (
        <AssistantUrlTabBridge
          onUrlTab={handleUrlTabChange}
          onClearedToRoot={() => {
            autoSelectedUrlTabRef.current = false;
            setSelectedRow(null);
            setActiveTab('overview');
          }}
          clearTabRef={clearTabRef}
        />
      )}

      {(aclProbeWarning || agentDiscoveryWarning) && (
        <div
          role="alert"
          data-testid="assistant-diagnostics-warning"
          className="bg-amber-900/25 border border-amber-700/60 rounded-lg px-4 py-2.5 text-xs text-amber-200 space-y-1"
        >
          {aclProbeWarning && <p>• {aclProbeWarning}</p>}
          {agentDiscoveryWarning && <p>• {agentDiscoveryWarning}</p>}
        </div>
      )}

      {/* Standardized Page Header & Scope Bar in List Mode */}
      {!selectedRow && (
        <PageHeader
          title="Engines & Assistants"
          subtitle="Configure Gemini Enterprise search & assistant apps, grounding policies, connected data stores, and custom domains."
          consolePage={Page.ASSISTANT}
          projectId={projectId}
          projectNumber={projectNumber}
          onRefresh={fetchEngines}
          isRefreshing={isListLoading}
        >
          <ScopeBar
            embedded
            locationId="appLocation"
            locationValue={effectiveLocation}
            onLocationChange={handleLocationChange}
          />
        </PageHeader>
      )}

      {selectedRow ? (
        <AssistantDetailView
          selectedRow={selectedRow}
          baseApiConfig={baseApiConfig}
          projectNumber={projectNumber}
          userProfile={userProfile}
          isDetailLoading={isDetailLoading}
          agents={agents}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isDataStoreAclSupported={isDataStoreAclSupported}
          isExportModalOpen={isExportModalOpen}
          setIsExportModalOpen={setIsExportModalOpen}
          isAuditModalOpen={isAuditModalOpen}
          setIsAuditModalOpen={setIsAuditModalOpen}
          isEvaluateModalOpen={isEvaluateModalOpen}
          setIsEvaluateModalOpen={setIsEvaluateModalOpen}
          onBack={handleBack}
          onBuildTriggered={onBuildTriggered}
          onEngineUpdateSuccess={handleEngineUpdateSuccess}
          onAssistantUpdateSuccess={handleAssistantUpdateSuccess}
          onOpenPlayground={() =>
            openPlaygroundForEngine(selectedRow.engine, selectedRow.assistant)
          }
          onOpenLatencyLab={
            onNavigate
              ? () =>
                  onNavigate(Page.LATENCY_LAB, {
                    appEngineId: selectedRow.engine.name,
                  })
              : undefined
          }
          onRefreshAgents={() =>
            fetchAgentsForAssistant(
              selectedRow.engine.name.split('/').pop()!,
              selectedRow.assistant
                ? selectedRow.assistant.name.split('/').pop()
                : undefined,
            )
          }
        />
      ) : (
        <AssistantListTable
          sortedRows={sortedRows}
          filteredEngines={filteredEngines}
          page={page}
          pageSize={pageSize}
          setPage={setPage}
          isListLoading={isListLoading}
          listError={listError}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          sortConfig={sortConfig}
          onSort={handleSort}
          onRefresh={fetchEngines}
          onRowClick={handleRowClick}
          onChatClick={handleChatClick}
          onEvaluateClick={handleEvaluateClick}
        />
      )}

      {/* Floating Chat Window */}
      {activeChatConfig && (
        <div
          data-engine-name={chatTargetEngine?.name}
          className="fixed bottom-4 right-4 z-50 w-[min(450px,calc(100vw-2rem))] h-[min(600px,calc(100vh-5rem))] shadow-2xl rounded-lg overflow-hidden border border-gray-700 bg-gray-800 flex flex-col"
        >
          <ChatWindow
            targetDisplayName={activeChatConfig.displayName}
            config={activeChatConfig.config}
            accessToken={accessToken}
            onClose={() => {
              setActiveChatConfig(null);
              setChatTargetEngine(null);
            }}
            userProfile={userProfile}
          />
        </div>
      )}
    </PageShell>
  );
};

export default AssistantPage;
