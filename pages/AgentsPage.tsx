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

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Agent, Config, SortableAgentKey, SortDirection, Assistant, UserProfile } from '../types';
import * as api from '../services/apiService';
import Spinner from '../components/Spinner';
import AgentList from '../components/agents/AgentList';
import AgentForm from '../components/agents/AgentForm';
import AgentDetails from '../components/agents/AgentDetails';
import BulkAgentDatasourcesPanel from '../components/agents/BulkAgentDatasourcesPanel';
import ChatWindow from '../components/agents/ChatWindow';
import ProjectInput from '../components/ProjectInput';
import ConfirmationModal from '../components/ConfirmationModal';
import CloudConsoleButton from '../components/CloudConsoleButton';
import { usePersistedConfig } from '../hooks/usePersistedConfig';

type ViewMode = 'list' | 'form' | 'details' | 'bulk-datasources';

interface AgentsPageProps {
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
  accessToken: string;
  userProfile?: UserProfile | null;
  context?: any;
}

const AgentsPage: React.FC<AgentsPageProps> = ({ projectNumber, setProjectNumber, accessToken, userProfile = null, context }) => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [testingAgent, setTestingAgent] = useState<Agent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [togglingAgentId, setTogglingAgentId] = useState<string | null>(null);

  // Configuration state with persistent sessionStorage
  const [config, setConfig] = usePersistedConfig(
    'agentsPageConfig',
    {
      appLocation: 'global',
      appId: '',
      collectionId: 'default_collection',
      assistantId: 'default_assistant',
    },
    {
      migrate: (parsed) => ({
        appLocation: parsed?.appLocation || 'global',
        appId: parsed?.appId || '',
        collectionId: 'default_collection',
        assistantId: 'default_assistant',
      }),
    }
  );

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
        setConfig(prev => ({
          ...prev,
          appLocation: parsed.location,
          appId: parsed.engineId,
        }));
        setSelectedAgent(targetAgent);
        setViewMode('form');
      }
    }
  }, [context, setConfig]);
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [deletingAgentIds, setDeletingAgentIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  
  // State for delete confirmation modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [agentsToDelete, setAgentsToDelete] = useState<Agent[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: SortableAgentKey; direction: SortDirection }>({ key: 'displayName', direction: 'asc' });

  // State for dropdown options and their loading status
  const [apps, setApps] = useState<any[]>([]);
  const [isLoadingApps, setIsLoadingApps] = useState(false);

  const handleConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setConfig(prev => {
        const newConfig = { ...prev, [name]: value };
        // Reset children when parent changes
        if (name === 'appLocation') {
            newConfig.appId = '';
            setApps([]);
        }
        return newConfig;
    });
  };
  
  const handleProjectNumberChange = (newValue: string) => {
    setProjectNumber(newValue);
    // Reset dependent fields when project changes
    setConfig(prev => ({
        ...prev,
        appId: '',
    }));
    setApps([]);
  };

  const apiConfig: Omit<Config, 'accessToken'> = useMemo(() => ({
      ...config,
      projectId: projectNumber,
  }), [config, projectNumber]);

  // --- Effects to fetch dropdown data ---

  useEffect(() => {
    if (!projectNumber || !config.appLocation) {
        setApps([]);
        return;
    }
    const fetchApps = async () => {
        setIsLoadingApps(true);
        setApps([]);
        try {
            const response = await api.listResources('engines', {
                projectId: projectNumber,
                appLocation: config.appLocation,
                collectionId: config.collectionId || 'default_collection',
            } as Config);
            const fetchedApps = response.engines || [];
            setApps(fetchedApps);
            // Auto-select if there is only one option
            if (fetchedApps.length === 1) {
                const singleAppId = fetchedApps[0].name.split('/').pop();
                if (singleAppId) {
                    setConfig(prev => ({ ...prev, appId: singleAppId }));
                }
            }
        } catch (err) {
            console.error("Failed to fetch apps/engines:", err);
            setError("Failed to fetch apps/engines.");
        } finally {
            setIsLoadingApps(false);
        }
    };
    fetchApps();
  }, [projectNumber, config.appLocation, config.collectionId, setConfig]);

  const fetchAgents = useCallback(async () => {
    if (!apiConfig.projectId || !apiConfig.appId) {
      setAgents([]);
      if (apiConfig.projectId && !apiConfig.appId) {
        setError("Project and Gemini Enterprise must be selected to list agents.");
      }
      return;
    }
    setIsLoading(true);
    setError(null);
    
    try {
        const assistantsResponse = await api.listResources('assistants', apiConfig);
        const assistants: Assistant[] = assistantsResponse.assistants || [];
        
        if (assistants.length === 0) {
            setAgents([]);
            console.log("No assistants found for this engine. Cannot list agents.");
            return;
        }

        const agentPromises = assistants.map(assistant => {
            const assistantId = assistant.name.split('/').pop()!;
            const agentListConfig = { ...apiConfig, assistantId };
            return api.listResources('agents', agentListConfig);
        });

        const agentResults = await Promise.allSettled(agentPromises);

        const allAgents: Agent[] = [];
        const failedAssistants: string[] = [];

        agentResults.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                allAgents.push(...(result.value.agents || []));
            } else {
                const assistantName = assistants[index].displayName || assistants[index].name.split('/').pop()!;
                failedAssistants.push(assistantName);
                console.error(`Failed to fetch agents for assistant: ${assistantName}`, result.reason);
            }
        });
        
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

        const baseAgents = allAgents.map(agent => ({
          ...agent,
          agentType: inferLocalAgentType(agent),
          agentOrigin: inferLocalAgentOrigin(agent),
        }));

        // Render agents immediately without blocking on getAgentView calls
        setAgents(baseAgents);
        setIsLoading(false);

        const agentsNeedingView = baseAgents.filter(a => !a.agentType || !a.agentOrigin);
        if (agentsNeedingView.length > 0) {
          void Promise.all(
            agentsNeedingView.map(agent =>
              api.getAgentView(agent.name, apiConfig).catch(() => null)
            )
          ).then(agentViewResults => {
            const viewByName = new Map<string, any>();
            agentsNeedingView.forEach((a, idx) => {
              if (agentViewResults[idx]?.agentView) {
                viewByName.set(a.name, agentViewResults[idx]!.agentView);
              }
            });
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
        }
        
        if (failedAssistants.length > 0) {
            setError(`Could not fetch agents for some assistants: ${failedAssistants.join(', ')}. This may be expected for some engine types.`);
        }

    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred while fetching assistants or agents.');
      setAgents([]);
    } finally {
      setIsLoading(false);
    }
  }, [apiConfig]);

  useEffect(() => {
    if (config.appId) {
      fetchAgents();
    } else {
      setAgents([]); // Clear agents if app isn't selected
    }
    setSelectedAgents(new Set());
  }, [fetchAgents, config.appId]);

  const handleToggleStatus = async (agent: Agent) => {
    const agentId = agent.name.split('/').pop() || '';
    setTogglingAgentId(agentId);
    setError(null);
    try {
      const updatedAgent = agent.state === 'ENABLED'
        ? await api.disableAgent(agent.name, apiConfig)
        : await api.enableAgent(agent.name, apiConfig);

      setAgents(prev => prev.map(a => a.name === updatedAgent.name ? { ...a, ...updatedAgent } : a));
      if (selectedAgent?.name === updatedAgent.name) {
          setSelectedAgent(prev => prev ? { ...prev, ...updatedAgent } : updatedAgent);
      }
    } catch (err: any) {
      setError(err.message || `Failed to toggle status for agent ${agentId}.`);
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
    } catch (err: any) {
      setError(
        err.message ||
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
        agentsToDelete.map(a => api.deleteResource(a.name, apiConfig))
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
      await api.updateAgent(agent, payload, apiConfig);
      fetchAgents();
    } catch (e: unknown) {
      console.error("Failed to update agent name", e);
      setError(`Failed to rename agent '${agent.displayName}': ${toErrorMessage(e)}`);
      throw e;
    }
  };

  const handleAgentUpdatedInPlace = useCallback((updatedAgent: Agent) => {
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
      // Handle potentially undefined state property for private agents
      const aVal = a.state ? (a[sortConfig.key] || '') : (sortConfig.key === 'state' ? 'private' : a[sortConfig.key] || '');
      const bVal = b.state ? (b[sortConfig.key] || '') : (sortConfig.key === 'state' ? 'private' : b[sortConfig.key] || '');
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [agents, sortConfig]);

  const renderContent = () => {
    if (isLoading && agents.length === 0) {
      return <Spinner />;
    }

    switch (viewMode) {
      case 'form':
        return <AgentForm config={apiConfig} onSuccess={handleFormSuccess} onCancel={() => setViewMode('list')} agentToEdit={selectedAgent} />;
      case 'details':
        return selectedAgent ? <AgentDetails 
            agent={selectedAgent} 
            config={apiConfig}
            onBack={() => { setViewMode('list'); setSelectedAgent(null); }} 
            onEdit={() => setViewMode('form')}
            onDeleteSuccess={() => { setViewMode('list'); fetchAgents(); }}
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
            onRefreshAgents={fetchAgents}
            onSelectAgent={handleSelectAgent}
          />
        );
      case 'list':
      default:
        return (
          <>
            {error && !isLoading && <div className="text-center text-red-400 p-4 mb-4 bg-red-900/20 rounded-lg">{error}</div>}
            <AgentList
              agents={sortedAgents}
              onSelectAgent={handleSelectAgent}
              onEditAgent={handleEditAgent}
              onDeleteAgent={handleRequestDelete}
              onTestAgent={(agent) => setTestingAgent(agent)}
              onRegisterNew={() => { setSelectedAgent(null); setViewMode('form'); }}
              onOpenBulkDatasources={() => setViewMode('bulk-datasources')}
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
              canRestoreDeepResearch={Boolean(config.appId) && !isLoading && !hasDeepResearchAgent}
              isRestoringDeepResearch={isRestoringDeepResearch}
              onRestoreDeepResearch={handleRestoreDeepResearch}
            />
          </>
        );
    }
  };

 return (
    <div className="space-y-6">
      <div className="bg-gray-800 p-4 rounded-lg shadow-md">
        <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold text-white">Configuration</h2>
            <CloudConsoleButton 
                url={config.appId ? 
                    `https://console.cloud.google.com/gemini-enterprise/locations/${config.appLocation}/engines/${config.appId}/agentic/agents?project=${projectNumber}` : 
                    `https://console.cloud.google.com/vertex-ai/agents/agent-engines?referrer=search&project=${projectNumber}`
                }
            />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Project ID / Number</label>
            <ProjectInput value={projectNumber} onChange={handleProjectNumberChange} />
          </div>
          <div>
            <label htmlFor="appLocation" className="block text-sm font-medium text-gray-400 mb-1">Location</label>
            <select name="appLocation" value={config.appLocation} onChange={handleConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[42px]">
              <option value="global">global</option>
              <option value="us">us</option>
              <option value="eu">eu</option>
            </select>
          </div>
          <div>
            <label htmlFor="appId" className="block text-sm font-medium text-gray-400 mb-1">Gemini Enterprise ID</label>
            <select name="appId" value={config.appId} onChange={handleConfigChange} disabled={isLoadingApps || apps.length === 0} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[42px] disabled:bg-gray-700/50">
              <option value="">{isLoadingApps ? 'Loading...' : '-- Select Gemini Enterprise --'}</option>
              {apps.map(a => {
                  const appId = a.name.split('/').pop() || '';
                  return <option key={a.name} value={appId}>{a.displayName || appId}</option>
              })}
            </select>
          </div>
          {(viewMode === 'list' || viewMode === 'bulk-datasources') && (
             <div className="flex items-end">
                <button 
                    onClick={fetchAgents} 
                    disabled={isLoading}
                    className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500 h-[42px]"
                >
                    {isLoading ? 'Loading...' : 'Refresh Agents'}
                </button>
             </div>
          )}
        </div>
      </div>

      {(viewMode === 'list' || viewMode === 'bulk-datasources') && (
        <div className="flex items-center gap-2 border-b border-gray-700">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              viewMode === 'list'
                ? 'border-blue-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            Registered Agents ({agents.length})
          </button>
          <button
            type="button"
            onClick={() => setViewMode('bulk-datasources')}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              viewMode === 'bulk-datasources'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <span>Bulk Update No-Code Datasources</span>
            <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
              Experimental
            </span>
          </button>
        </div>
      )}

      {renderContent()}

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
              config={apiConfig}
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
    </div>
  );
};

export default AgentsPage;