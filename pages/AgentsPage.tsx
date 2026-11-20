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

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Agent, AppEngine, Config, IamPolicy, Page, SortableAgentKey, SortDirection, Assistant, UserProfile } from '../types';
import * as api from '../services/apiService';
import Spinner from '../components/Spinner';
import AgentList from '../components/agents/AgentList';
import AgentForm from '../components/agents/AgentForm';
import AgentDetails from '../components/agents/AgentDetails';
import BulkAgentDatasourcesPanel from '../components/agents/BulkAgentDatasourcesPanel';
import BulkEditSharePublishModal from '../components/agents/BulkEditSharePublishModal';
import ShadowEvalGateModal, { resolveAgentStreamConfig } from '../components/agents/ShadowEvalGateModal';
import ChatWindow from '../components/agents/ChatWindow';
import ConfirmationModal from '../components/ConfirmationModal';
import { PageShell } from '../components/layout/PageShell';
import { PageHeader } from '../components/layout/PageHeader';
import { ScopeBar } from '../components/layout/ScopeBar';
import { Tabs } from '../components/common/Tabs';
import { useWorkspaceScope } from '../context/WorkspaceScopeContext';
import { usePersistedConfig } from '../hooks/usePersistedConfig';
import { useToast } from '../context/ToastContext';
import { toErrorMessage } from '../utils/errors';
import {
  DEFAULT_BACKGROUND_CONCURRENCY,
  getCachedAgentIamPolicy,
  getCachedAgentView,
  invalidateAgentMetadataCache,
  invalidateProjectAgentsUsageCache,
  mapWithQuotaLimit,
  setCachedAgentIamPolicy,
  setCachedAgentView,
} from '../utils/quotaGuard';

export const ALL_ENGINES_VALUE = '__ALL_ENGINES__';

type ViewMode = 'list' | 'form' | 'details' | 'bulk-datasources';

interface AgentsPageProps {
  projectNumber: string;
  projectId?: string;
  setProjectNumber: (projectNumber: string) => void;
  accessToken: string;
  userProfile?: UserProfile | null;
  context?: { agentToEdit?: Agent } | null;
}

const AgentsPage: React.FC<AgentsPageProps> = ({
  projectNumber,
  projectId,
  setProjectNumber: _setProjectNumber,
  accessToken,
  userProfile = null,
  context,
}) => {
  const { toast } = useToast();
  const {
    appLocation: scopeLocation,
    appId: scopeAppId,
    updateScope,
  } = useWorkspaceScope();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [testingAgent, setTestingAgent] = useState<Agent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isHydratingAgents, setIsHydratingAgents] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrationWarning, setHydrationWarning] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [togglingAgentId, setTogglingAgentId] = useState<string | null>(null);

  // Monotonic sequence counters to invalidate in-flight requests when Location, Project, or App changes
  const appsFetchSeqRef = useRef(0);
  const agentsFetchSeqRef = useRef(0);
  const hydrationAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      hydrationAbortRef.current?.abort();
      invalidateAgentMetadataCache();
    };
  }, []);

  // Configuration state with persistent sessionStorage + WorkspaceScopeContext sync
  const [config, setConfig] = usePersistedConfig(
    'agentsPageConfig',
    {
      appLocation: scopeLocation || 'global',
      appId: scopeAppId || '',
      collectionId: 'default_collection',
      assistantId: 'default_assistant',
    },
    {
      migrate: (parsed) => ({
        appLocation: scopeLocation || parsed?.appLocation || 'global',
        appId: scopeAppId || parsed?.appId || '',
        collectionId: 'default_collection',
        assistantId: 'default_assistant',
      }),
    }
  );

  const prevScopeRef = useRef({ appLocation: scopeLocation, appId: scopeAppId });
  useEffect(() => {
    const prev = prevScopeRef.current;
    if (prev.appLocation === scopeLocation && prev.appId === scopeAppId) return;
    prevScopeRef.current = { appLocation: scopeLocation, appId: scopeAppId };
    setConfig((curr) => {
      const nextLoc = scopeLocation || curr.appLocation;
      const nextAppId =
        curr.appId === ALL_ENGINES_VALUE && prev.appLocation === scopeLocation
          ? curr.appId
          : scopeAppId;
      if (curr.appLocation === nextLoc && curr.appId === nextAppId) return curr;
      return { ...curr, appLocation: nextLoc, appId: nextAppId };
    });
  }, [scopeLocation, scopeAppId, setConfig]);

  // Reset dependent fields when project changes from top header
  const prevProjectRef = useRef(projectNumber);
  useEffect(() => {
    if (prevProjectRef.current === projectNumber) return;
    prevProjectRef.current = projectNumber;
    hydrationAbortRef.current?.abort();
    agentsFetchSeqRef.current += 1;
    appsFetchSeqRef.current += 1;
    setIsLoading(false);
    setIsHydratingAgents(false);
    setAgents([]);
    setSelectedAgents(new Set());
    setSelectedAgent(null);
    setHydrationWarning(null);
    setApps([]);
    prevScopeRef.current = { ...prevScopeRef.current, appId: '' };
    updateScope({ appId: '' });
    setConfig((prev) => ({ ...prev, appId: '' }));
  }, [projectNumber, updateScope, setConfig]);

  // Handle navigation context
  useEffect(() => {
    if (context && context.agentToEdit) {
      const targetAgent: Agent = context.agentToEdit;

      const parseAgentName = (name: string) => {
        const parts = name.split('/');
        if (parts.length >= 12) {
          return {
            location: parts[3],
            engineId: parts[7],
            assistantId: parts[9],
            agentId: parts[11],
          };
        }
        return null;
      };

      const parsed = parseAgentName(targetAgent.name);
      if (parsed) {
        prevScopeRef.current = { appLocation: parsed.location, appId: parsed.engineId };
        updateScope({ appLocation: parsed.location, appId: parsed.engineId });
        setConfig((prev) => ({
          ...prev,
          appLocation: parsed.location,
          appId: parsed.engineId,
        }));
        setSelectedAgent(targetAgent);
        setViewMode('form');
      }
    }
  }, [context, setConfig, updateScope]);
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [deletingAgentIds, setDeletingAgentIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  // State for delete confirmation & bulk edit/share/publish modals
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isBulkEditSharePublishOpen, setIsBulkEditSharePublishOpen] = useState(false);
  const [isShadowEvalOpen, setIsShadowEvalOpen] = useState(false);
  const [agentsToDelete, setAgentsToDelete] = useState<Agent[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: SortableAgentKey; direction: SortDirection }>({ key: 'displayName', direction: 'asc' });

  // State for dropdown options and their loading status
  const [apps, setApps] = useState<AppEngine[]>([]);
  const [isLoadingApps, setIsLoadingApps] = useState(false);

  const handleLocationSelectChange = useCallback(
    (nextLocation: string) => {
      hydrationAbortRef.current?.abort();
      agentsFetchSeqRef.current += 1;
      appsFetchSeqRef.current += 1;
      setIsLoading(false);
      setIsHydratingAgents(false);
      setAgents([]);
      setApps([]);
      setSelectedAgents(new Set());
      setSelectedAgent(null);
      setHydrationWarning(null);
      prevScopeRef.current = { appLocation: nextLocation, appId: '' };
      updateScope({ appLocation: nextLocation, appId: '' });
      setConfig((prev) => ({
        ...prev,
        appLocation: nextLocation,
        appId: '',
      }));
    },
    [setConfig, updateScope],
  );

  const handleEngineSelectChange = useCallback(
    (nextAppId: string) => {
      hydrationAbortRef.current?.abort();
      agentsFetchSeqRef.current += 1;
      setIsLoading(false);
      setIsHydratingAgents(false);
      setAgents([]);
      setSelectedAgents(new Set());
      setSelectedAgent(null);
      setHydrationWarning(null);
      const scopedId = nextAppId === ALL_ENGINES_VALUE ? '' : nextAppId;
      prevScopeRef.current = { ...prevScopeRef.current, appId: scopedId };
      updateScope({ appId: scopedId });
      setConfig((prev) => ({
        ...prev,
        appId: nextAppId,
      }));
    },
    [setConfig, updateScope],
  );

  const engineOptions = useMemo(
    () => [
      { value: ALL_ENGINES_VALUE, label: 'All Regions & Engines (Fleet View)' },
      ...apps.map((a) => {
        const id = a.name.split('/').pop() || '';
        return { value: id, label: a.displayName || id };
      }),
    ],
    [apps],
  );

  const apiConfig: Omit<Config, 'accessToken'> = useMemo(() => ({
      ...config,
      projectId: projectNumber,
  }), [config, projectNumber]);

  // --- Effects to fetch dropdown data ---

  useEffect(() => {
    if (!projectNumber || !config.appLocation) {
        setApps([]);
        setIsLoadingApps(false);
        return;
    }
    const fetchSeq = ++appsFetchSeqRef.current;
    const targetLocation = config.appLocation;
    const fetchApps = async () => {
        setIsLoadingApps(true);
        setApps([]);
        try {
            const response = await api.listResources('engines', {
                projectId: projectNumber,
                appLocation: targetLocation,
                collectionId: config.collectionId || 'default_collection',
            } as Config);
            if (fetchSeq !== appsFetchSeqRef.current) return;
            const fetchedApps = response.engines || [];
            setApps(fetchedApps);
            // Quota-conscious auto-selection:
            // - Auto-select automatically ONLY when the location has a single engine (zero ambiguity).
            // - When multiple engines exist, preserve any previously selected valid engine in sessionStorage,
            //   or clear stale selection from another location without firing 30+ hydration RPCs on an unrequested engine.
            if (fetchedApps.length === 1) {
                const singleAppId = fetchedApps[0].name.split('/').pop();
                if (singleAppId) {
                    setConfig(prev => {
                        if (prev.appLocation === targetLocation && !prev.appId) {
                            prevScopeRef.current = { appLocation: targetLocation, appId: singleAppId };
                            updateScope({ appId: singleAppId });
                            return { ...prev, appId: singleAppId };
                        }
                        return prev;
                    });
                }
            } else if (fetchedApps.length > 1) {
                setConfig(prev => {
                    if (prev.appLocation !== targetLocation || !prev.appId || prev.appId === ALL_ENGINES_VALUE) return prev;
                    const stillExists = fetchedApps.some(a => a.name.split('/').pop() === prev.appId);
                    if (!stillExists) {
                        prevScopeRef.current = { ...prevScopeRef.current, appId: '' };
                        updateScope({ appId: '' });
                        return { ...prev, appId: '' };
                    }
                    return prev;
                });
            }
        } catch (err) {
            if (fetchSeq !== appsFetchSeqRef.current) return;
            console.error("Failed to fetch apps/engines:", err);
            setError("Failed to fetch apps/engines.");
        } finally {
            if (fetchSeq === appsFetchSeqRef.current) {
                setIsLoadingApps(false);
            }
        }
    };
    fetchApps();
  }, [projectNumber, config.appLocation, config.collectionId, setConfig, updateScope]);

  const fetchAgents = useCallback(async () => {
    hydrationAbortRef.current?.abort();
    const abortController = new AbortController();
    hydrationAbortRef.current = abortController;

    const fetchSeq = ++agentsFetchSeqRef.current;
    const requestConfig = { ...apiConfig };

    if (!requestConfig.projectId || !requestConfig.appId) {
      setAgents([]);
      setIsLoading(false);
      setIsHydratingAgents(false);
      if (requestConfig.projectId && !requestConfig.appId) {
        setError("Project and Gemini Enterprise must be selected to list agents.");
      }
      return;
    }
    setIsLoading(true);
    setIsHydratingAgents(false);
    setError(null);
    setHydrationWarning(null);
    
    try {
        const allAgents: Agent[] = [];
        const failedAssistants: string[] = [];

        if (requestConfig.appId === ALL_ENGINES_VALUE) {
            const fleetLocations = ['global', 'us', 'eu'];
            const discoveredEngines: Array<{ loc: string; appId: string; name: string }> = [];
            const seenEngineNames = new Set<string>();

            await mapWithQuotaLimit(
                fleetLocations,
                DEFAULT_BACKGROUND_CONCURRENCY,
                async (loc) => {
                    const locConfig: Config = {
                        ...requestConfig,
                        appLocation: loc,
                        collectionId: requestConfig.collectionId || 'default_collection',
                        appId: '',
                    };
                    const res = await api.listResources('engines', locConfig);
                    const engs: AppEngine[] = res?.engines || [];
                    for (const eng of engs) {
                        if (!eng?.name || seenEngineNames.has(eng.name)) continue;
                        seenEngineNames.add(eng.name);
                        const parts = eng.name.split('/');
                        const locIdx = parts.indexOf('locations');
                        const engIdx = parts.indexOf('engines');
                        const parsedLoc =
                            locIdx >= 0 && parts[locIdx + 1] ? parts[locIdx + 1] : loc;
                        const parsedAppId =
                            engIdx >= 0 && parts[engIdx + 1]
                                ? parts[engIdx + 1]
                                : parts[parts.length - 1] || '';
                        if (parsedAppId) {
                            discoveredEngines.push({
                                loc: parsedLoc,
                                appId: parsedAppId,
                                name: eng.name,
                            });
                        }
                    }
                },
                { signal: abortController.signal },
            );

            if (fetchSeq !== agentsFetchSeqRef.current || abortController.signal.aborted) return;

            if (discoveredEngines.length === 0) {
                setAgents([]);
                return;
            }

            const seenAgentNames = new Set<string>();
            await mapWithQuotaLimit(
                discoveredEngines,
                DEFAULT_BACKGROUND_CONCURRENCY,
                async ({ loc, appId }) => {
                    const engConfig: Config = {
                        ...requestConfig,
                        appLocation: loc,
                        collectionId: requestConfig.collectionId || 'default_collection',
                        appId,
                    };
                    try {
                        const astRes = await api.listResources('assistants', engConfig);
                        const assistants: Assistant[] = astRes?.assistants || [];
                        for (const ast of assistants) {
                            if (abortController.signal.aborted) return;
                            const assistantId = ast.name.split('/').pop() || 'default_assistant';
                            const agRes = await api.listResources('agents', {
                                ...engConfig,
                                assistantId,
                            });
                            for (const ag of agRes?.agents || []) {
                                if (!seenAgentNames.has(ag.name)) {
                                    seenAgentNames.add(ag.name);
                                    allAgents.push(ag);
                                }
                            }
                        }
                    } catch (engErr: unknown) {
                        failedAssistants.push(`${loc}/${appId}`);
                        console.error(`Failed to fetch fleet agents for ${loc}/${appId}`, engErr);
                    }
                },
                { signal: abortController.signal },
            );

            if (fetchSeq !== agentsFetchSeqRef.current || abortController.signal.aborted) return;
        } else {
            const assistantsResponse = await api.listResources('assistants', requestConfig);
            if (fetchSeq !== agentsFetchSeqRef.current) return;

            const assistants: Assistant[] = assistantsResponse.assistants || [];
            
            if (assistants.length === 0) {
                setAgents([]);
                console.log("No assistants found for this engine. Cannot list agents.");
                return;
            }

            const agentPromises = assistants.map(assistant => {
                const assistantId = assistant.name.split('/').pop()!;
                const agentListConfig = { ...requestConfig, assistantId };
                return api.listResources('agents', agentListConfig);
            });

            const agentResults = await Promise.allSettled(agentPromises);
            if (fetchSeq !== agentsFetchSeqRef.current) return;

            agentResults.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    allAgents.push(...(result.value.agents || []));
                } else {
                    const assistantName = assistants[index].displayName || assistants[index].name.split('/').pop()!;
                    failedAssistants.push(assistantName);
                    console.error(`Failed to fetch agents for assistant: ${assistantName}`, result.reason);
                }
            });
        }
        
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
          if (!agent.state || (agent.state !== 'ENABLED' && agent.state !== 'DISABLED')) return 'LOW_CODE';
          return undefined;
        };

        const inferLocalAgentOrigin = (agent: Agent): string | undefined => {
          if (agent.agentOrigin) return agent.agentOrigin;
          if (api.isGoogleManagedAgent(agent)) return 'GOOGLE';
          if (api.isCustomNoCodeAgent(agent)) return 'AGENT_DESIGNER';
          return undefined;
        };

        const baseAgents = allAgents.map(agent => {
          const cachedView = getCachedAgentView(agent.name);
          const cachedIam = getCachedAgentIamPolicy(agent.name);
          return {
            ...agent,
            agentType: cachedView?.agentType || inferLocalAgentType(agent),
            agentOrigin: cachedView?.agentOrigin || inferLocalAgentOrigin(agent),
            iamPolicy: agent.iamPolicy || cachedIam,
          };
        });

        // Render agents immediately without blocking on getAgentView calls
        setAgents(baseAgents);
        setIsLoading(false);

        const agentsNeedingView = baseAgents.filter(
          a => !getCachedAgentView(a.name) && (!a.agentType || !a.agentOrigin)
        );
        const agentsNeedingIamOwner = baseAgents.filter(
          a =>
            !api.isGoogleManagedAgent(a) &&
            !a.iamPolicy &&
            !getCachedAgentIamPolicy(a.name) &&
            typeof api.getAgentIamPolicy === 'function'
        );

        const hydrationTasks: Promise<void>[] = [];

        if (agentsNeedingView.length > 0) {
          const failedAgentNames: string[] = [];
          const viewTask = mapWithQuotaLimit(
            agentsNeedingView,
            DEFAULT_BACKGROUND_CONCURRENCY,
            (agent) => api.getAgentView(agent.name, resolveAgentStreamConfig(agent, requestConfig)),
            { signal: abortController.signal },
          ).then(({ outcomes, shortCircuited }) => {
            if (fetchSeq !== agentsFetchSeqRef.current || abortController.signal.aborted) return;
            const viewByName = new Map<string, { agentType?: string; agentOrigin?: string }>();
            outcomes.forEach((res, idx) => {
              const agent = agentsNeedingView[idx];
              if (res.status === 'fulfilled' && res.value?.agentView) {
                setCachedAgentView(agent.name, res.value.agentView);
                viewByName.set(agent.name, res.value.agentView);
              } else if (res.status === 'rejected') {
                const label = agent.displayName || agent.name.split('/').pop() || agent.name;
                const reason = res.reason instanceof Error ? res.reason.message : String(res.reason);
                failedAgentNames.push(`${label}: ${reason}`);
              }
            });
            if (failedAgentNames.length > 0 || shortCircuited) {
              const quotaSuffix = shortCircuited
                ? ' Remaining background :getView calls were paused to protect GCP project quotas.'
                : '';
              setHydrationWarning(
                `Partial metadata hydration: Could not fetch runtime AgentView (:getView) for ${failedAgentNames.length} agent(s) (${failedAgentNames.join(', ')}). Displaying locally inferred agent types.${quotaSuffix}`,
              );
            }
            if (viewByName.size === 0) return;

            setAgents(prev =>
              prev.map(agent => {
                const view = viewByName.get(agent.name);
                if (!view) return agent;
                return {
                  ...agent,
                  agentType: view.agentType || agent.agentType || inferLocalAgentType(agent),
                  agentOrigin: view.agentOrigin || agent.agentOrigin || inferLocalAgentOrigin(agent),
                };
              })
            );
          });
          hydrationTasks.push(viewTask);
        }

        // Background-hydrate per-agent IAM policy (:getIamPolicy) with bounded concurrency (2)
        // and automatic 429 circuit-breaking so customer Discovery Engine quotas are never flooded.
        if (agentsNeedingIamOwner.length > 0) {
          const iamTask = mapWithQuotaLimit(
            agentsNeedingIamOwner,
            DEFAULT_BACKGROUND_CONCURRENCY,
            (agent) => api.getAgentIamPolicy(agent.name, resolveAgentStreamConfig(agent, requestConfig)),
            { signal: abortController.signal },
          ).then(({ outcomes, shortCircuited }) => {
            if (fetchSeq !== agentsFetchSeqRef.current || abortController.signal.aborted) return;
            if (shortCircuited) {
              setHydrationWarning(prev =>
                prev ||
                'Paused remaining per-agent IAM ownership (:getIamPolicy) lookups because Discovery Engine returned a quota/rate-limit (429) or auth error.',
              );
            }
            const policyByName = new Map<string, IamPolicy>();
            outcomes.forEach((res, idx) => {
              if (res.status === 'fulfilled' && res.value?.bindings) {
                setCachedAgentIamPolicy(agentsNeedingIamOwner[idx].name, res.value);
                policyByName.set(agentsNeedingIamOwner[idx].name, res.value);
              }
            });
            if (policyByName.size === 0) return;
            setAgents(prev =>
              prev.map(agent => {
                const policy = policyByName.get(agent.name);
                if (!policy) return agent;
                return {
                  ...agent,
                  iamPolicy: policy,
                };
              })
            );
          });
          hydrationTasks.push(iamTask);
        }

        if (hydrationTasks.length > 0) {
          setIsHydratingAgents(true);
          void Promise.allSettled(hydrationTasks).then(() => {
            if (fetchSeq === agentsFetchSeqRef.current) {
              setIsHydratingAgents(false);
            }
          });
        }
        
        if (failedAssistants.length > 0) {
            setError(`Could not fetch agents for some assistants: ${failedAssistants.join(', ')}. This may be expected for some engine types.`);
        }

    } catch (err: unknown) {
      if (fetchSeq !== agentsFetchSeqRef.current) return;
      setError(toErrorMessage(err) || 'An unexpected error occurred while fetching assistants or agents.');
      setAgents([]);
    } finally {
      if (fetchSeq === agentsFetchSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, [apiConfig]);

  useEffect(() => {
    if (config.appId) {
      fetchAgents();
    } else {
      agentsFetchSeqRef.current += 1;
      setAgents([]); // Clear agents if app isn't selected
      setIsLoading(false);
      setIsHydratingAgents(false);
    }
    setSelectedAgents(new Set());
  }, [fetchAgents, config.appId]);

  const handleToggleStatus = async (agent: Agent) => {
    const agentId = agent.name.split('/').pop() || '';
    setTogglingAgentId(agentId);
    setError(null);
    const targetConfig = resolveAgentStreamConfig(agent, apiConfig);
    try {
      const updatedAgent = agent.state === 'ENABLED'
        ? await api.disableAgent(agent.name, targetConfig)
        : await api.enableAgent(agent.name, targetConfig);

      invalidateAgentMetadataCache(agent.name);
      setAgents(prev => prev.map(a => a.name === updatedAgent.name ? { ...a, ...updatedAgent } : a));
      if (selectedAgent?.name === updatedAgent.name) {
          setSelectedAgent(prev => prev ? { ...prev, ...updatedAgent } : updatedAgent);
      }
    } catch (err: unknown) {
      setError(toErrorMessage(err) || `Failed to toggle status for agent ${agentId}.`);
    } finally {
      setTogglingAgentId(null);
    }
  };

  const [isRestoringDeepResearch, setIsRestoringDeepResearch] = useState(false);

  const hasDeepResearchAgent = useMemo(
    () =>
      agents.some(a => {
        const id = (a.name.split('/').pop() || a.id || '').toLowerCase();
        return (
          id === 'deep_research' ||
          id === 'deep_research_gem3' ||
          id === 'default_deep_research' ||
          Boolean(
            (a.managedAgentDefinition as Record<string, unknown> | undefined)
              ?.researchAssistantAgentConfig
          )
        );
      }),
    [agents]
  );

  const handleRestoreDeepResearch = async () => {
    if (!apiConfig.projectId || !apiConfig.appId) return;
    setIsRestoringDeepResearch(true);
    setError(null);
    try {
      await api.restoreDeepResearchAgent(apiConfig);
      await fetchAgents();
    } catch (err: unknown) {
      setError(
        toErrorMessage(err) ||
          'Failed to restore Deep Research agent. Ensure the Discovery Engine Service Agent has roles/discoveryengine.serviceAgent and CMEK does not block 1P agent creation.'
      );
    } finally {
      setIsRestoringDeepResearch(false);
    }
  };

  const handleToggleSelect = (agentName: string) => {
    const target = agents.find(a => a.name === agentName);
    if (target && api.isGoogleManagedAgent(target)) {
      return;
    }
    setSelectedAgents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(agentName)) {
        newSet.delete(agentName);
      } else {
        newSet.add(agentName);
      }
      return newSet;
    });
  };

  const handleToggleSelectAll = (selectableNames?: string[]) => {
    const candidateNames =
      selectableNames ||
      agents.filter(a => !api.isGoogleManagedAgent(a)).map(a => a.name);
    if (candidateNames.length === 0) {
      setSelectedAgents(new Set());
      return;
    }
    const allCandidatesSelected = candidateNames.every(name => selectedAgents.has(name));
    if (allCandidatesSelected) {
      setSelectedAgents(prev => {
        const next = new Set(prev);
        candidateNames.forEach(name => next.delete(name));
        return next;
      });
    } else {
      setSelectedAgents(prev => {
        const next = new Set(prev);
        candidateNames.forEach(name => next.add(name));
        return next;
      });
    }
  };

  const handleRequestDelete = (agent?: Agent) => {
    if (agent && api.isGoogleManagedAgent(agent)) {
      setError(
        `"${agent.displayName || agent.name.split('/').pop()}" is a Google-managed built-in agent and is protected from deletion. Toggle its status to Disabled instead.`
      );
      return;
    }

    let toDelete: Agent[] = [];
    if (agent) {
      toDelete = [agent];
    } else {
      toDelete = agents.filter(
        a => selectedAgents.has(a.name) && !api.isGoogleManagedAgent(a)
      );
    }

    if (toDelete.length > 0) {
      setAgentsToDelete(toDelete);
      setIsDeleteModalOpen(true);
    }
  };

  const confirmDelete = async () => {
    if (agentsToDelete.length === 0) return;

    setIsDeleting(true);
    setDeletingAgentIds(new Set(agentsToDelete.map(a => a.name)));
    setIsDeleteModalOpen(false);
    setError(null);

    const results = await Promise.allSettled(
        agentsToDelete.map(a => {
          invalidateAgentMetadataCache(a.name);
          return api.deleteResource(a.name, resolveAgentStreamConfig(a, apiConfig));
        })
    );

    const failures: string[] = [];
    results.forEach((result, index) => {
        if (result.status === 'rejected') {
            const agentName = agentsToDelete[index].displayName;
            const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
            failures.push(`- ${agentName}: ${reason}`);
        }
    });

    if (failures.length > 0) {
        setError(`Failed to delete ${failures.length} agent(s):\n${failures.join('\n')}`);
    }
    
    if (selectedAgent && agentsToDelete.some(a => a.name === selectedAgent.name)) {
        setViewMode('list');
        setSelectedAgent(null);
    }
    
    setAgentsToDelete([]);
    setSelectedAgents(new Set());
    await fetchAgents(); // Refresh the list

    setIsDeleting(false);
    setDeletingAgentIds(new Set());
  };

  const handleFormSuccess = () => {
    invalidateAgentMetadataCache();
    invalidateProjectAgentsUsageCache(projectNumber);
    setViewMode('list');
    fetchAgents();
  };

  const handleSelectAgent = (agent: Agent) => {
    setSelectedAgent(agent);
    setViewMode('details');
  };

  const handleEditAgent = (agent: Agent) => {
    setSelectedAgent(agent);
    setViewMode('details');
  };

  const handleSort = (key: SortableAgentKey) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const handleUpdateAgentName = async (agent: Agent, newName: string) => {
    try {
      const payload: Partial<Agent> = { displayName: newName };
      if (agent.lowCodeAgentDefinition) {
        payload.lowCodeAgentDefinition = {
          ...agent.lowCodeAgentDefinition,
          draftDisplayName: newName,
        };
      }
      await api.updateAgent(agent, payload, resolveAgentStreamConfig(agent, apiConfig));
      invalidateAgentMetadataCache(agent.name);
      fetchAgents();
    } catch (e: unknown) {
      console.error("Failed to update agent name", e);
      setError(`Failed to rename agent '${agent.displayName}': ${toErrorMessage(e)}`);
      throw e;
    }
  };

  const handleAgentUpdatedInPlace = useCallback((updatedAgent: Agent) => {
    invalidateAgentMetadataCache(updatedAgent.name);
    setSelectedAgent(updatedAgent);
    setAgents(prev => {
      const exists = prev.some(a => a.name === updatedAgent.name);
      if (exists) {
        return prev.map(a => (a.name === updatedAgent.name ? { ...a, ...updatedAgent } : a));
      }
      return [updatedAgent, ...prev];
    });
    fetchAgents();
  }, [fetchAgents]);

  const sortedAgents = useMemo(() => {
    if (!agents) return [];
    return [...agents].sort((a, b) => {
      let aVal = '';
      let bVal = '';
      if (sortConfig.key === 'owner') {
        aVal = (api.extractAgentOwnerHint(a) || '').toLowerCase();
        bVal = (api.extractAgentOwnerHint(b) || '').toLowerCase();
      } else if (sortConfig.key === 'state') {
        aVal = a.state ? a.state : 'private';
        bVal = b.state ? b.state : 'private';
      } else {
        aVal = String(a[sortConfig.key] || '');
        bVal = String(b[sortConfig.key] || '');
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [agents, sortConfig]);

  const renderContent = () => {
    if (isLoading && agents.length === 0) {
      return <Spinner />;
    }

    const effectiveFormConfig: Config = selectedAgent
      ? resolveAgentStreamConfig(selectedAgent, apiConfig)
      : apiConfig.appId === ALL_ENGINES_VALUE && apps[0]
        ? {
            ...apiConfig,
            appId: apps[0].name.split('/').pop() || '',
          }
        : apiConfig;

    switch (viewMode) {
      case 'form':
        return <AgentForm config={effectiveFormConfig} onSuccess={handleFormSuccess} onCancel={() => setViewMode('list')} agentToEdit={selectedAgent} />;
      case 'details':
        return selectedAgent ? <AgentDetails 
            agent={selectedAgent} 
            config={resolveAgentStreamConfig(selectedAgent, apiConfig)}
            onBack={() => { setViewMode('list'); setSelectedAgent(null); }} 
            onEdit={() => setViewMode('form')}
            onDeleteSuccess={() => { invalidateAgentMetadataCache(selectedAgent.name); setViewMode('list'); fetchAgents(); }}
            onToggleStatus={handleToggleStatus}
            togglingAgentId={togglingAgentId}
            error={error}
            onTestAgent={(agent) => setTestingAgent(agent)}
            onAgentUpdated={handleAgentUpdatedInPlace}
        /> : null;
      case 'bulk-datasources':
        return (
          <BulkAgentDatasourcesPanel
            agents={sortedAgents}
            config={apiConfig}
            initialSelectedAgentNames={selectedAgents}
            onBackToList={() => setViewMode('list')}
            onRefreshAgents={() => { invalidateAgentMetadataCache(); void fetchAgents(); }}
            onSelectAgent={handleSelectAgent}
          />
        );
      case 'list':
      default:
        return (
          <>
            {error && !isLoading && <div className="text-center text-red-400 p-4 mb-4 bg-red-900/20 rounded-lg">{error}</div>}
            {!config.appId && !isLoadingApps && apps.length > 1 && !error && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-blue-950/25 border border-blue-800/50 text-xs text-blue-200 flex items-center justify-between gap-3">
                <span>
                  Found <strong>{apps.length}</strong> Gemini Enterprise engines in <code>{config.appLocation}</code>. Select an engine above (or choose <strong>All Regions &amp; Engines (Fleet View)</strong>) to load registered agents.
                </span>
              </div>
            )}
            <AgentList
              agents={sortedAgents}
              config={apiConfig}
              isFleetView={config.appId === ALL_ENGINES_VALUE}
              onSelectAgent={handleSelectAgent}
              onEditAgent={handleEditAgent}
              onDeleteAgent={handleRequestDelete}
              onTestAgent={(agent) => setTestingAgent(agent)}
              onRegisterNew={() => { setSelectedAgent(null); setViewMode('form'); }}
              onOpenBulkDatasources={() => setViewMode('bulk-datasources')}
              onOpenBulkEditSharePublish={() => setIsBulkEditSharePublishOpen(true)}
              onOpenShadowEvalGate={() => setIsShadowEvalOpen(true)}
              onToggleAgentStatus={handleToggleStatus}
              togglingAgentId={togglingAgentId}
              deletingAgentIds={deletingAgentIds}
              selectedAgents={selectedAgents}
              onToggleSelect={handleToggleSelect}
              onToggleSelectAll={handleToggleSelectAll}
              onDeleteSelected={() => handleRequestDelete()}
              onSort={handleSort}
              sortConfig={sortConfig}
              onUpdateAgentName={handleUpdateAgentName}
              canRestoreDeepResearch={Boolean(config.appId) && config.appId !== ALL_ENGINES_VALUE && !isLoading && !hasDeepResearchAgent}
              isRestoringDeepResearch={isRestoringDeepResearch}
              onRestoreDeepResearch={handleRestoreDeepResearch}
            />
          </>
        );
    }
  };

  return (
    <PageShell variant="wide">
      {hydrationWarning && (
        <div
          role="alert"
          data-testid="agents-hydration-warning"
          className="bg-amber-900/25 border border-amber-700/60 rounded-lg px-4 py-2.5 text-xs text-amber-200 flex items-center justify-between gap-3"
        >
          <span>{hydrationWarning}</span>
          <button
            type="button"
            onClick={() => setHydrationWarning(null)}
            className="text-amber-300 hover:text-white underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      <PageHeader
        title="GE Agent Manager"
        subtitle="Govern, inspect, test, and share Discovery Engine, ADK, and A2A agents."
        consolePage={Page.AGENTS}
        consoleUrl={
          config.appId && config.appId !== ALL_ENGINES_VALUE
            ? `https://console.cloud.google.com/gemini-enterprise/locations/${config.appLocation}/engines/${config.appId}/agentic/agents?project=${projectId || projectNumber}`
            : undefined
        }
        projectId={projectId}
        projectNumber={projectNumber}
        onRefresh={
          viewMode === 'list' || viewMode === 'bulk-datasources'
            ? () => {
                invalidateAgentMetadataCache();
                void fetchAgents();
              }
            : undefined
        }
        isRefreshing={isLoading || isLoadingApps || isHydratingAgents}
      >
        <ScopeBar
          embedded
          locationId="appLocation"
          locationValue={config.appLocation}
          onLocationChange={handleLocationSelectChange}
          engineLabel="Gemini Enterprise App"
          engineId="appId"
          engineValue={config.appId}
          onEngineChange={handleEngineSelectChange}
          engineOptions={engineOptions}
          enginePlaceholder="-- Select Gemini Enterprise --"
          engineLoading={isLoadingApps}
          engineDisabled={!projectNumber || isLoadingApps}
        />
      </PageHeader>

      {(viewMode === 'list' || viewMode === 'bulk-datasources') && (
        <Tabs
          ariaLabel="Agent Manager Workspace"
          syncSearchParam="tab"
          activeTab={viewMode}
          onChange={(tabId) => setViewMode(tabId)}
          items={[
            {
              id: 'list',
              label: 'Registered Agents',
              count: agents.length,
            },
            {
              id: 'bulk-datasources',
              label: 'Bulk Update (IAM, Settings & Datasources)',
              badge: 'IAM · Settings · DataStores',
              testId: 'bulk-update-tab-btn',
            },
          ]}
        />
      )}

      {renderContent()}

      {/* Bulk Edit, Share & Publish Modal */}
      <BulkEditSharePublishModal
        isOpen={isBulkEditSharePublishOpen}
        onClose={() => setIsBulkEditSharePublishOpen(false)}
        agents={sortedAgents}
        initialSelectedAgentNames={selectedAgents}
        config={apiConfig}
        accessToken={accessToken}
        onOpenBulkDatasources={() => {
          setIsBulkEditSharePublishOpen(false);
          setViewMode('bulk-datasources');
        }}
        onComplete={(res) => {
          invalidateAgentMetadataCache();
          if (res.failed > 0) {
            toast.warning(
              `Bulk update finished: ${res.updated} updated, ${res.skipped} unchanged, ${res.failed} failed.`,
            );
          } else {
            toast.success(
              `Bulk update completed: ${res.updated} agent(s) updated (${res.skipped} unchanged).`,
            );
          }
          fetchAgents();
        }}
      />

      {/* Non-Destructive Shadow Evaluation & Regression Gate Modal */}
      <ShadowEvalGateModal
        isOpen={isShadowEvalOpen}
        onClose={() => setIsShadowEvalOpen(false)}
        agents={sortedAgents}
        initialSelectedAgentNames={selectedAgents}
        config={apiConfig}
        accessToken={accessToken}
      />

      {/* Scoped Agent Chat Test Modal */}
      {testingAgent && (
        <div
          className="fixed inset-0 bg-black/75 flex justify-center items-center z-50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Test Agent ${testingAgent.displayName}`}
          onClick={() => setTestingAgent(null)}
        >
          <div
            className="w-full max-w-4xl h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <ChatWindow
              targetDisplayName={`Agent: ${testingAgent.displayName}`}
              agentName={testingAgent.name}
              config={resolveAgentStreamConfig(testingAgent, apiConfig)}
              accessToken={accessToken}
              onClose={() => setTestingAgent(null)}
              userProfile={userProfile}
            />
          </div>
        </div>
      )}

      {agentsToDelete.length > 0 && (
        <ConfirmationModal
            isOpen={isDeleteModalOpen}
            onClose={() => setIsDeleteModalOpen(false)}
            onConfirm={confirmDelete}
            title={`Confirm Deletion of ${agentsToDelete.length} Agent(s)`}
            confirmText="Delete"
            isConfirming={isDeleting}
        >
            <p>Are you sure you want to permanently delete the following agent(s)?</p>
            <ul className="mt-2 p-3 bg-gray-700/50 rounded-md border border-gray-600 max-h-48 overflow-y-auto space-y-1">
                {agentsToDelete.map(a => (
                    <li key={a.name} className="text-sm">
                        <p className="font-bold text-white">{a.displayName}</p>
                        <p className="text-xs font-mono text-gray-400 mt-1">{a.name.split('/').pop()}</p>
                    </li>
                ))}
            </ul>
            <p className="mt-4 text-sm text-yellow-300">This action cannot be undone.</p>
        </ConfirmationModal>
      )}
    </PageShell>
  );
};

export default AgentsPage;