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


import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Agent, AppEngine, Assistant, Config, UserProfile } from '../types';
import * as api from '../services/apiService';
import ProjectInput from '../components/ProjectInput';
import Spinner from '../components/Spinner';
import AssistantDetailsForm from '../components/assistants/AssistantDetailsForm';
import EngineDetailsForm from '../components/assistants/EngineDetailsForm';
import AgentListForAssistant from '../components/assistants/AgentListForAssistant';
import ExportMetricsModal from '../components/assistants/ExportMetricsModal';
import AuditLoggingModal from '../components/assistants/AuditLoggingModal';
import ChatWindow from '../components/agents/ChatWindow';
import ChatHistoryViewer from '../components/assistants/ChatHistoryViewer';
import NotebookListViewer from '../components/assistants/NotebookListViewer';
import AgentEngineMetricsViewer from '../components/assistants/AgentEngineMetricsViewer';
import VanityUrlDeploymentForm from '../components/assistants/VanityUrlDeploymentForm';
import CloudConsoleButton from '../components/CloudConsoleButton';

interface AssistantPageProps {
  projectNumber: string;
  projectId?: string;
  setProjectNumber: (projectNumber: string) => void;
  accessToken: string;
  userProfile: UserProfile | null;
  onBuildTriggered?: (buildId: string, projectId?: string) => void;
}

interface AssistantRowData {
    engine: AppEngine;
    assistant: Assistant | null;
    error?: string;
}

type SortKey = 'displayName' | 'engineId' | 'solutionType' | 'webGrounding' | 'instructions' | 'policy' | 'vertexAgents';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
    key: SortKey;
    direction: SortDirection;
}

const getInitialConfig = () => {
  try {
    const savedConfig = sessionStorage.getItem('assistantPageConfig');
    if (savedConfig) return JSON.parse(savedConfig);
  } catch (e) { console.error("Failed to parse config", e); }
  return { appLocation: 'global' };
};

const StatusBadge: React.FC<{ active: boolean; text?: string }> = ({ active, text }) => (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${active ? 'bg-green-900/50 text-green-400 border border-green-700' : 'bg-gray-700 text-gray-400 border border-gray-600'}`}>
        {text || (active ? 'Enabled' : 'Disabled')}
    </span>
);

const CountBadge: React.FC<{ count: number }> = ({ count }) => (
    <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium ${count > 0 ? 'bg-blue-900/50 text-blue-300 border border-blue-700' : 'bg-gray-800 text-gray-500 border border-gray-700'}`}>
        {count}
    </span>
);

const SortIcon: React.FC<{ direction: SortDirection }> = ({ direction }) => {
    const path = direction === 'asc'
      ? "M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
      : "M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z";
    return (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d={path} clipRule="evenodd" />
      </svg>
    );
};

// Helper function to determine the nuanced app type
const determineAppType = (engine: AppEngine): string => {
    if (engine.solutionType === 'SOLUTION_TYPE_CHAT') {
        return 'Chat';
    }
    
    if (engine.solutionType === 'SOLUTION_TYPE_SEARCH') {
        // Only classify as Gemini Enterprise if appType is specifically APP_TYPE_INTRANET
        if (engine.appType === 'APP_TYPE_INTRANET') {
            return 'Gemini Enterprise';
        }
        return 'Search';
    }
    
    if (engine.solutionType === 'SOLUTION_TYPE_RECOMMENDATION') {
        return 'Recommendation';
    }
    
    if (engine.solutionType === 'SOLUTION_TYPE_GENERATIVE_CHAT') {
        return 'Gemini Enterprise';
    }
    
    // Fallback formatter
    return engine.solutionType?.replace('SOLUTION_TYPE_', '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) || 'Unknown';
};

const AssistantPage: React.FC<AssistantPageProps> = ({ projectNumber, projectId, setProjectNumber, accessToken, userProfile, onBuildTriggered }) => {
  const [config, setConfig] = useState(getInitialConfig);
  
  // List View State
    const [allEngines, setAllEngines] = useState<AppEngine[]>([]);
  const [rows, setRows] = useState<AssistantRowData[]>([]);
  const [isListLoading, setIsListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

    // Pagination & Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [page, setPage] = useState(1);
    const pageSize = 10;

  // Sorting State
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'displayName', direction: 'asc' });

    // Detail View State
    const [selectedRow, setSelectedRow] = useState<AssistantRowData | null>(null);
    const [agents, setAgents] = useState<Agent[]>([]);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'overview' | 'agents' | 'notebooks' | 'history' | 'customize'>('overview');

  // Chat State
  const [activeChatConfig, setActiveChatConfig] = useState<{ displayName: string; config: Config } | null>(null);

  useEffect(() => {
    sessionStorage.setItem('assistantPageConfig', JSON.stringify(config));
  }, [config]);

  const baseApiConfig: Config = useMemo(() => ({
    projectId: projectId || projectNumber,
    appLocation: config.appLocation,
    collectionId: 'default_collection',
    appId: '', // Dynamic
    assistantId: 'default_assistant'
  }), [projectNumber, projectId, config]);

  const handleConfigChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setConfig(prev => ({ ...prev, [name]: value }));
    setRows([]); // Clear list on location change
      setAllEngines([]);
    setSelectedRow(null);
      setPage(1);
      setSearchQuery('');
  };

  const handleSort = (key: SortKey) => {
      setSortConfig(current => ({
          key,
          direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
      }));
  };

  const getSortValue = (row: AssistantRowData, key: SortKey): string | number | boolean => {
      // If no assistant, return "empty" values for sorting to push them to bottom/top
      if (!row.assistant) {
          if (key === 'displayName') return row.engine.displayName;
          if (key === 'engineId') return row.engine.name.split('/').pop() || '';
          if (key === 'solutionType') return determineAppType(row.engine);
          return ''; // Treat others as empty/falsy
      }
      
      switch (key) {
          case 'displayName':
              return row.engine.displayName;
          case 'engineId':
              return row.engine.name.split('/').pop() || '';
          case 'solutionType':
              return determineAppType(row.engine);
          case 'webGrounding':
              return row.assistant.webGroundingType === 'WEB_GROUNDING_TYPE_GOOGLE_SEARCH';
          case 'instructions':
              return !!row.assistant.generationConfig?.systemInstruction?.additionalSystemInstruction;
          case 'policy':
              return !!(row.assistant.customerPolicy && Object.keys(row.assistant.customerPolicy).length > 0);
          case 'vertexAgents':
              return row.assistant.vertexAiAgentConfigs?.length || 0;
          default:
              return '';
      }
  };

  const sortedRows = useMemo(() => {
      return [...rows].sort((a, b) => {
          const aVal = getSortValue(a, sortConfig.key);
          const bVal = getSortValue(b, sortConfig.key);

          if (aVal === bVal) return 0;
          
          if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
              // False < True (0 < 1)
              return sortConfig.direction === 'asc' 
                  ? (aVal === bVal ? 0 : aVal ? 1 : -1) 
                  : (aVal === bVal ? 0 : aVal ? -1 : 1);
          }
          
          if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
          if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
      });
  }, [rows, sortConfig]);

    // 1. Fetch ALL Engines first (Cheap)
    const fetchEngines = useCallback(async () => {
    if (!projectNumber) {
        setListError("Project Number is required.");
        return;
    }
    setIsListLoading(true);
    setListError(null);
    setRows([]);
        setAllEngines([]);

        try {
        const enginesRes = await api.listResources('engines', { ...baseApiConfig, appId: '' });
        const engines: AppEngine[] = enginesRes.engines || [];
            setAllEngines(engines);
        } catch (err: any) {
            setListError(err.message || "Failed to fetch engines list.");
        } finally {
            setIsListLoading(false);
        }
    }, [baseApiConfig, projectNumber]);

    // Auto-refresh when config changes
    useEffect(() => {
        fetchEngines();
    }, [fetchEngines]);

    // Derived: Filtered Engines
    const filteredEngines = useMemo(() => {
        if (!searchQuery) return allEngines;
        const lowerQ = searchQuery.toLowerCase();
        return allEngines.filter(e =>
            e.displayName.toLowerCase().includes(lowerQ) ||
            e.name.split('/').pop()?.toLowerCase().includes(lowerQ)
        );
    }, [allEngines, searchQuery]);

    // Derived: Paginated Slice of Engines (we only fetch details for these)
    const paginatedEngines = useMemo(() => {
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        return filteredEngines.slice(start, end);
    }, [filteredEngines, page]);

    // 2. Fetch Assistants for Current Page ONLY (Active Slice)
    useEffect(() => {
        const fetchPageDetails = async () => {
            if (paginatedEngines.length === 0) {
                setRows([]);
                return;
            }

            setIsListLoading(true); // Show loading indicator while fetching slice details

            const rowPromises = paginatedEngines.map(async (engine) => {
                const appId = engine.name.split('/').pop()!;
                const assistantConfig = { ...baseApiConfig, appId, suppressErrorLog: true };
                const assistantName = `projects/${baseApiConfig.projectId}/locations/${baseApiConfig.appLocation}/collections/default_collection/engines/${appId}/assistants/default_assistant`;

                try {
                    const assistant = await api.getAssistant(assistantName, assistantConfig);
                    return { engine, assistant };
                } catch (e: any) {
                    return { engine, assistant: null, error: e.message };
                }
            });

            const results = await Promise.all(rowPromises);
            setRows(results);
            setIsListLoading(false);
        };

        fetchPageDetails();
    }, [paginatedEngines, baseApiConfig]);

    // Reset page when search or location changes
  useEffect(() => {
      setPage(1);
  }, [searchQuery, config.appLocation]);

  // Fetch Agents for a specific Assistant (Detail View)
  const fetchAgentsForAssistant = useCallback(async (appId: string) => {
      setIsDetailLoading(true);
      const detailConfig = { ...baseApiConfig, appId };
      try {
          const agentsResponse = await api.listResources('agents', detailConfig);
          const baseAgents = agentsResponse.agents || [];
          
          if (baseAgents.length > 0) {
            const agentViewPromises = baseAgents.map(agent => api.getAgentView(agent.name, detailConfig));
            const agentViewResults = await Promise.allSettled(agentViewPromises);
            
            const enrichedAgents = baseAgents.map((agent, index) => {
                const viewResult = agentViewResults[index];
                let agentType = viewResult.status === 'fulfilled' && viewResult.value?.agentView ? viewResult.value.agentView.agentType : undefined;
                let agentOrigin = viewResult.status === 'fulfilled' && viewResult.value?.agentView ? viewResult.value.agentView.agentOrigin : undefined;

                if (!agentType) {
                    if (agent.adkAgentDefinition) {
                        agentType = 'ADK';
                    } else if (agent.a2aAgentDefinition) {
                        agentType = 'A2A';
                    } else if (agent.lowCodeAgentDefinition || agent.workflowAgentDefinition) {
                        agentType = 'LOW_CODE';
                    } else if (!agent.state || (agent.state !== 'ENABLED' && agent.state !== 'DISABLED')) {
                        agentType = 'LOW_CODE';
                    }
                }

                return {
                    ...agent,
                    agentType,
                    agentOrigin,
                };
            });
            setAgents(enrichedAgents);
          } else {
              setAgents([]);
          }
      } catch (e) {
          console.error("Failed to fetch agents", e);
          setAgents([]);
      } finally {
          setIsDetailLoading(false);
      }
  }, [baseApiConfig]);

  const handleRowClick = (row: AssistantRowData) => {
      if (!row.assistant) return; // Cannot edit if assistant fetch failed
      setSelectedRow(row);
      fetchAgentsForAssistant(row.engine.name.split('/').pop()!);
  };

  const handleChatClick = (row: AssistantRowData, e: React.MouseEvent) => {
      e.stopPropagation();
      const engineId = row.engine.name.split('/').pop()!;
      // Create a full config for this specific engine
      const chatConfig: Config = {
          ...baseApiConfig,
          appId: engineId,
      };
      setActiveChatConfig({
          displayName: row.engine.displayName,
          config: chatConfig
      });
  };

  const handleBack = () => {
      setSelectedRow(null);
      setAgents([]);
      // Refresh list to show updated data
      fetchEngines(); 
  };

  const handleUpdateSuccess = (updatedAssistant: Assistant) => {
      if (selectedRow) {
          setSelectedRow({ ...selectedRow, assistant: updatedAssistant });
      }
  };

    const handleEngineUpdateSuccess = (updatedEngine: AppEngine) => {
        if (selectedRow) {
            setSelectedRow({ ...selectedRow, engine: updatedEngine });
        }
        // Also update the list row in background
        setRows(prev => prev.map(r => r.engine.name === updatedEngine.name ? { ...r, engine: updatedEngine } : r));
    };

  const SortHeader: React.FC<{ label: string; sortKey: SortKey; align?: 'left' | 'center' | 'right' }> = ({ label, sortKey, align = 'left' }) => {
      const isSorted = sortConfig.key === sortKey;
      return (
          <th 
            scope="col" 
            className={`px-6 py-3 text-${align} text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer group hover:bg-gray-700/50 transition-colors`}
            onClick={() => handleSort(sortKey)}
          >
              <div className={`flex items-center gap-1 ${align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start'}`}>
                  {label}
                  <span className={`text-gray-400 ${isSorted ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}>
                      <SortIcon direction={isSorted ? sortConfig.direction : 'asc'} />
                  </span>
              </div>
          </th>
      );
  };

  // --- Render List View ---
  const renderList = () => (
      <div className="bg-gray-800 shadow-xl rounded-lg overflow-hidden border border-gray-700">
          <div className="p-4 border-b border-gray-700 flex flex-col sm:flex-row justify-between items-center gap-4">
              <h3 className="text-lg font-bold text-white">Gemini Enterprise Engines</h3>

              {/* Search Control */}
              <div className="relative flex-1 max-w-sm">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                      <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"></path>
                      </svg>
                  </div>
                  <input
                      type="text"
                      className="bg-gray-700 border border-gray-600 text-gray-200 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 p-2.5"
                      placeholder="Filter Engines..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                  />
              </div>

              <button 
                  onClick={fetchEngines} 
                  disabled={isListLoading}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500 min-w-fit"
              >
                  Refresh
              </button>
          </div>
          
          {listError && <div className="p-4 text-red-400 bg-red-900/20 text-center text-sm border-b border-red-900/50">{listError}</div>}
          
          <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-700">
                  <thead className="bg-gray-700/50">
                      <tr>
                          <SortHeader label="Display Name" sortKey="displayName" />
                          <SortHeader label="Engine ID" sortKey="engineId" />
                          <SortHeader label="App Type" sortKey="solutionType" />
                          <SortHeader label="Web Grounding" sortKey="webGrounding" />
                          <SortHeader label="System Instructions" sortKey="instructions" />
                          <SortHeader label="Customer Policy" sortKey="policy" />
                          <SortHeader label="Vertex Agents" sortKey="vertexAgents" align="center" />
                          <th scope="col" className="relative px-6 py-3"><span className="sr-only">Edit</span></th>
                      </tr>
                  </thead>
                  <tbody className="bg-gray-800 divide-y divide-gray-700">
                      {sortedRows.length === 0 && !isListLoading && (
                          <tr>
                              <td colSpan={8} className="px-6 py-8 text-center text-sm text-gray-500">
                                  No engines found in this location.
                              </td>
                          </tr>
                      )}
                      {sortedRows.map((row) => {
                          const engineId = row.engine.name.split('/').pop()!;
                          const assistant = row.assistant;
                          const appType = determineAppType(row.engine);
                          
                          // Check if assistant exists to extract props, otherwise defaults
                          const hasWebGrounding = assistant?.webGroundingType === 'WEB_GROUNDING_TYPE_GOOGLE_SEARCH';
                          const hasInstructions = !!assistant?.generationConfig?.systemInstruction?.additionalSystemInstruction;
                          const hasPolicy = !!(assistant?.customerPolicy && Object.keys(assistant.customerPolicy).length > 0);
                          const vertexAgentsCount = assistant?.vertexAiAgentConfigs?.length || 0;
                          const toolsCount = Object.keys(assistant?.enabledTools || {}).length;
                          const actionsCount = Object.keys(assistant?.enabledActions || {}).length;

                          return (
                              <tr key={engineId} className="hover:bg-gray-700/50 transition-colors">
                                  <td className="px-6 py-4 whitespace-nowrap">
                                      <div className="text-sm font-medium text-white">{row.engine.displayName}</div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                      <div className="text-xs text-gray-400 font-mono">{engineId}</div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                      <span className={`text-sm px-2 py-1 rounded border ${
                                          appType === 'Gemini Enterprise' 
                                            ? 'text-purple-300 bg-purple-900/50 border-purple-700' 
                                            : appType === 'Chat' 
                                                ? 'text-blue-300 bg-blue-900/50 border-blue-700'
                                                : 'text-gray-300 bg-gray-700/50 border-gray-600'
                                      }`}>
                                          {appType}
                                      </span>
                                  </td>
                                  {assistant ? (
                                      <>
                                          <td className="px-6 py-4 whitespace-nowrap">
                                              <StatusBadge active={hasWebGrounding} />
                                          </td>
                                          <td className="px-6 py-4 whitespace-nowrap">
                                              <StatusBadge active={hasInstructions} text={hasInstructions ? 'Yes' : 'No'} />
                                          </td>
                                          <td className="px-6 py-4 whitespace-nowrap">
                                              <StatusBadge active={hasPolicy} text={hasPolicy ? 'Applied' : 'None'} />
                                          </td>
                                          <td className="px-6 py-4 whitespace-nowrap text-center">
                                              <CountBadge count={vertexAgentsCount} />
                                          </td>
                                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                              <div className="flex items-center justify-end gap-3">
                                                  <button 
                                                      onClick={(e) => handleChatClick(row, e)} 
                                                      className="text-green-400 hover:text-green-300 transition-colors" 
                                                      title="Chat with Assistant"
                                                  >
                                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                          <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                                                      </svg>
                                                  </button>
                                                  <button onClick={() => handleRowClick(row)} className="text-blue-400 hover:text-blue-300 font-semibold">
                                                      View / Edit
                                                  </button>
                                              </div>
                                          </td>
                                      </>
                                  ) : (
                                      <>
                                              <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500 italic">
                                              No Default Assistant Configured
                                          </td>
                                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                              <span className="text-gray-600 cursor-not-allowed">N/A</span>
                                          </td>
                                      </>
                                  )}
                              </tr>
                          );
                      })}
                  </tbody>
              </table>
          </div>

          {/* Pagination Controls */}
          {
              filteredEngines.length > 0 && (
                  <div className="p-4 border-t border-gray-700 bg-gray-800 flex justify-between items-center">
                      <div className="text-sm text-gray-400">
                          Showing <span className="font-semibold text-white">{(page - 1) * pageSize + 1}</span> to <span className="font-semibold text-white">{Math.min(page * pageSize, filteredEngines.length)}</span> of <span className="font-semibold text-white">{filteredEngines.length}</span> engines
                      </div>
                      <div className="flex gap-2">
                          <button
                              onClick={() => setPage(p => Math.max(1, p - 1))}
                              disabled={page === 1 || isListLoading}
                              className="px-3 py-1 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                              Previous
                          </button>
                          <button
                              onClick={() => setPage(p => Math.min(Math.ceil(filteredEngines.length / pageSize), p + 1))}
                              disabled={page * pageSize >= filteredEngines.length || isListLoading}
                              className="px-3 py-1 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                              Next
                          </button>
                      </div>
                  </div>
              )
          }
      </div>
  );

  // --- Render Detail View ---
  const renderDetail = () => {
      if (!selectedRow || !selectedRow.assistant) return null;
      
      const currentConfig = { 
          ...baseApiConfig, 
          appId: selectedRow.engine.name.split('/').pop()! 
      };

      return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="flex items-center justify-between bg-gray-800 p-4 rounded-lg shadow-md border border-gray-700">
                <div className="flex items-center gap-4">
                    <button onClick={handleBack} className="p-2 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                    <div>
                        <h2 className="text-xl font-bold text-white">{selectedRow.engine.displayName}</h2>
                        <p className="text-sm text-gray-400 font-mono">{currentConfig.appId}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setIsAuditModalOpen(true)}
                        className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 shadow-md flex items-center gap-1"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                        </svg>
                        Audit Logging
                    </button>
                    <button
                        onClick={() => setIsExportModalOpen(true)}
                        className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700 shadow-md"
                    >
                        Backup Analytics
                    </button>
                </div>
            </div>

            {isDetailLoading ? (
                <Spinner />
            ) : (
                      <div className="space-y-6">
                          {/* Tabs Navigation */}
                          <div className="border-b border-gray-700 flex justify-between items-center">
                              <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                                  {['overview', 'agents', 'notebooks', 'history', 'customize'].map((tab) => (
                                      <button
                                          key={tab}
                                          onClick={() => setActiveTab(tab as any)}
                                          className={`${activeTab === tab
                                              ? 'border-blue-500 text-blue-400'
                                              : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                                              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm capitalize`}
                                      >
                                          {tab}
                                      </button>
                                  ))}
                              </nav>
                          </div>
                          
                          {/* Tab Content */}
                          <div className="py-4">
                              {activeTab === 'overview' && (
                                  <>
                                      <EngineDetailsForm
                                          engine={selectedRow.engine}
                                          config={currentConfig}
                                          onUpdateSuccess={handleEngineUpdateSuccess}
                                          onLaunchWizard={() => setIsAuditModalOpen(true)}
                                      />
                                      <div className="mt-6">
                                          <AssistantDetailsForm
                                              assistant={selectedRow.assistant}
                                              config={currentConfig}
                                              onUpdateSuccess={handleUpdateSuccess}
                                          />
                                      </div>
                                      <AgentEngineMetricsViewer
                                          config={currentConfig}
                                          engineId={selectedRow.engine.name.split('/').pop() || ''}
                                      />
                                  </>
                              )}

                              {activeTab === 'agents' && (
                                  <AgentListForAssistant 
                                      agents={agents} 
                                      config={currentConfig}
                                      onRefreshAgents={() => fetchAgentsForAssistant(selectedRow.engine.name.split('/').pop()!)}
                                  />
                              )}

                              {activeTab === 'notebooks' && (
                                  <NotebookListViewer config={currentConfig} />
                              )}

                              {activeTab === 'history' && (
                                  <ChatHistoryViewer config={currentConfig} />
                              )}

                              {activeTab === 'customize' && (
                                  <VanityUrlDeploymentForm
                                      engine={selectedRow.engine}
                                      config={currentConfig}
                                      projectNumber={projectNumber}
                                      onBuildTriggered={onBuildTriggered}
                                  />
                              )}
                          </div>

                    <ExportMetricsModal
                        isOpen={isExportModalOpen}
                        onClose={() => setIsExportModalOpen(false)}
                        config={currentConfig}
                        onBuildTriggered={onBuildTriggered}
                        projectNumber={projectNumber}
                    />

                    <AuditLoggingModal
                        isOpen={isAuditModalOpen}
                        onClose={() => setIsAuditModalOpen(false)}
                        config={currentConfig}
                        engine={selectedRow.engine}
                        onUpdateSuccess={(updatedEngine) => {
                            setSelectedRow({ ...selectedRow, engine: updatedEngine });
                        }}
                        projectNumber={projectNumber}
                    />
                      </div>
            )}
        </div>
      );
  };

  return (
    <div className="space-y-6 relative">
      {/* Configuration Header */}
      {!selectedRow && (
          <div className="bg-gray-800 p-4 rounded-lg shadow-md border border-gray-700">
            <div className="flex justify-between items-center mb-3">
                <h2 className="text-lg font-semibold text-white">Project Configuration</h2>
                <CloudConsoleButton url={`https://console.cloud.google.com/gemini-enterprise/apps?project=${projectNumber}`} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Project ID / Number</label>
                <ProjectInput value={projectNumber} onChange={setProjectNumber} />
              </div>
              <div>
                <label htmlFor="appLocation" className="block text-sm font-medium text-gray-400 mb-1">Location</label>
                <select name="appLocation" value={config.appLocation} onChange={handleConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px] focus:ring-blue-500">
                  <option value="global">global</option>
                  <option value="us">us</option>
                  <option value="eu">eu</option>
                </select>
              </div>
            </div>
          </div>
      )}

      {selectedRow ? renderDetail() : renderList()}

      {/* Floating Chat Window */}
      {activeChatConfig && (
          <div className="fixed bottom-4 right-4 z-50 w-[450px] h-[600px] shadow-2xl rounded-lg overflow-hidden border border-gray-700 bg-gray-800 flex flex-col">
              <ChatWindow
                  targetDisplayName={activeChatConfig.displayName}
                  config={activeChatConfig.config}
                  accessToken={accessToken}
                  onClose={() => setActiveChatConfig(null)}
                      userProfile={userProfile}
              />
          </div>
      )}
    </div>
  );
};

export default AssistantPage;
