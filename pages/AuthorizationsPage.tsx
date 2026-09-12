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
import { Authorization, Config, Agent } from '../types';
import * as api from '../services/apiService';
import Spinner from '../components/Spinner';
import AuthList from '../components/authorizations/AuthList';
import AuthForm from '../components/authorizations/AuthForm';
import ViewAuthModal from '../components/authorizations/ViewAuthModal';
import WorkforcePoolValidator from '../components/tools/WorkforcePoolValidator';
import ConfirmationModal from '../components/ConfirmationModal';
import PartialResultsBanner, { PartialFailure } from '../components/common/PartialResultsBanner';
import { toErrorMessage } from '../utils/errors';

interface AuthorizationsPageProps {
  projectNumber: string;
  projectId?: string;
  authorizations: Authorization[];
  setAuthorizations: React.Dispatch<React.SetStateAction<Authorization[]>>;
  authUsage: Record<string, Agent[]>;
  setAuthUsage: React.Dispatch<React.SetStateAction<Record<string, Agent[]>>>;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  isScanningAgents: boolean;
  setIsScanningAgents: React.Dispatch<React.SetStateAction<boolean>>;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  hasLoaded: boolean;
  setHasLoaded: React.Dispatch<React.SetStateAction<boolean>>;
}

const AuthorizationsPage: React.FC<AuthorizationsPageProps> = ({
  projectNumber,
  projectId,
  authorizations,
  setAuthorizations,
  authUsage,
  setAuthUsage,
  isLoading,
  setIsLoading,
  isScanningAgents,
  setIsScanningAgents,
  error,
  setError,
  hasLoaded,
  setHasLoaded
}) => {
  const [view, setView] = useState<'list' | 'form'>('list');
  const [authToEdit, setAuthToEdit] = useState<Authorization | null>(null);
  const [authToView, setAuthToView] = useState<Authorization | null>(null);
  const [authModalTab, setAuthModalTab] = useState<'config' | 'adk'>('config');
  const [region, setRegion] = useState<string>('global');
  
  // State for delete confirmation modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [partialFailures, setPartialFailures] = useState<PartialFailure[]>([]);

  const [showWorkforceValidator, setShowWorkforceValidator] = useState(false);

  const apiConfig: Omit<Config, 'accessToken'> = useMemo(() => ({
      projectId: projectId || projectNumber,
      appLocation: region, 
      collectionId: 'default_collection',
      appId: '',
      assistantId: 'default_assistant'
  }), [projectNumber, projectId, region]);

  const fetchData = useCallback(async () => {
    if (!projectNumber) {
        setAuthorizations([]);
        setPartialFailures([]);
        setError("Project ID/Number is required to list authorizations.");
        return;
    }
    setIsLoading(true);
    setIsScanningAgents(true);
    setError(null);
    setPartialFailures([]);
    setAuthUsage({});

    const failures: PartialFailure[] = [];

    try {
      const discoveryLocations = ['global', 'us', 'eu'];

      const authPromises = discoveryLocations.map(async (loc) => {
        try {
          const res = await api.listAuthorizations({ ...apiConfig, appLocation: loc });
          return res.authorizations || [];
        } catch (err: any) {
          console.error(`Failed to load auths for region ${loc}:`, err);
          failures.push({
            id: `authorizations-${loc}`,
            name: `Authorizations (${loc})`,
            resourceType: 'Authorizations',
            status: err?.status || err?.code || (toErrorMessage(err).includes('403') ? 403 : undefined),
            error: toErrorMessage(err),
            reason: `Failed to load authorizations for region '${loc}': ${toErrorMessage(err)}`,
          });
          return [];
        }
      });
      
      const agentPromise = (async () => {
        const agentsList: Agent[] = [];
          for (const discoveryLocation of discoveryLocations) {
              const locationConfig = { ...apiConfig, appLocation: discoveryLocation };
              try {
                  const collectionsResponse = await api.listResources('collections', locationConfig);
                  const collections = collectionsResponse.collections || [];
                  for (const collection of collections) {
                      const collectionId = collection.name.split('/').pop()!;
                      const collectionConfig = { ...locationConfig, collectionId };
                      try {
                          const appEnginesResponse = await api.listResources('engines', collectionConfig);
                          const appEngines = appEnginesResponse.engines || [];
                          for (const appEngine of appEngines) {
                              const appId = appEngine.name.split('/').pop()!;
                              const appConfig = { ...collectionConfig, appId };
                              try {
                                  const assistantsResponse = await api.listResources('assistants', appConfig);
                                  const assistants = assistantsResponse.assistants || [];
                                  for (const assistant of assistants) {
                                      const assistantId = assistant.name.split('/').pop()!;
                                      const assistantConfig = { ...appConfig, assistantId };
                                      try {
                                          const agentsResponse = await api.listResources('agents', assistantConfig);
                                          if (agentsResponse.agents) {
                                              agentsList.push(...agentsResponse.agents);
                                          }
                                      } catch (agentErr: any) {
                                          console.warn(`Could not list agents for assistant ${assistantId}:`, agentErr);
                                          failures.push({
                                              id: `agents-${assistantId}`,
                                              name: `Assistant ${assistantId}`,
                                              resourceType: 'Assistant Agents',
                                              status: agentErr?.status || agentErr?.code,
                                              error: toErrorMessage(agentErr),
                                              reason: `Could not list agents for assistant '${assistantId}': ${toErrorMessage(agentErr)}`,
                                          });
                                      }
                                  }
                              } catch (astErr: any) {
                                  console.warn(`Could not list assistants for app ${appId}:`, astErr);
                                  failures.push({
                                      id: `assistants-${appId}`,
                                      name: `Engine App ${appId}`,
                                      resourceType: 'Engine Assistants',
                                      status: astErr?.status || astErr?.code,
                                      error: toErrorMessage(astErr),
                                      reason: `Could not list assistants for app '${appId}': ${toErrorMessage(astErr)}`,
                                  });
                              }
                          }
                      } catch (engErr: any) {
                          console.warn(`Could not list engines for collection ${collectionId}:`, engErr);
                          failures.push({
                              id: `engines-${collectionId}`,
                              name: `Collection ${collectionId}`,
                              resourceType: 'Engines',
                              status: engErr?.status || engErr?.code,
                              error: toErrorMessage(engErr),
                              reason: `Could not list engines for collection '${collectionId}': ${toErrorMessage(engErr)}`,
                          });
                      }
                  }
              } catch (colErr: any) {
                  console.warn(`Could not list collections for location ${discoveryLocation}:`, colErr);
                  failures.push({
                      id: `collections-${discoveryLocation}`,
                      name: `Collections (${discoveryLocation})`,
                      resourceType: 'Collections',
                      status: colErr?.status || colErr?.code,
                      error: toErrorMessage(colErr),
                      reason: `Could not list collections for location '${discoveryLocation}': ${toErrorMessage(colErr)}`,
                  });
              }
          }
          return agentsList;
      })();

      const [authResults, allAgents] = await Promise.all([
        Promise.all(authPromises),
        agentPromise
      ]);
      const allAuths = authResults.flat();

      setAuthorizations(allAuths);
      setPartialFailures(failures);
      setHasLoaded(true);
      
      const usageMap: Record<string, Agent[]> = {};
      for (const agent of allAgents) {
        const usedAuths = new Set<string>();
          if (agent.authorizations) {
          agent.authorizations.forEach(a => usedAuths.add(a));
        }
        if (agent.authorizationConfig?.toolAuthorizations) {
          agent.authorizationConfig.toolAuthorizations.forEach(a => usedAuths.add(a));
        }

        for (const authName of usedAuths) {
          if (!usageMap[authName]) {
            usageMap[authName] = [];
          }
          usageMap[authName].push(agent);
          }
      }
      setAuthUsage(usageMap);

    } catch (err: any) {
      setError(toErrorMessage(err) || 'Failed to fetch authorizations or agent data.');
      setAuthorizations([]);
      setPartialFailures(failures);
    } finally {
      setIsLoading(false);
      setIsScanningAgents(false);
    }
  }, [projectNumber, apiConfig, setAuthUsage, setAuthorizations, setError, setHasLoaded, setIsLoading, setIsScanningAgents]);

  useEffect(() => {
    if (projectNumber) {
      if (!hasLoaded) {
          fetchData();
        }
    } else {
        setAuthorizations([]); // Clear if no project number is set
        setAuthUsage({});
      setHasLoaded(false);
    }
  }, [fetchData, projectNumber, hasLoaded, setAuthorizations, setAuthUsage, setHasLoaded]);
  
  const handleToggleSelect = (authId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(authId)) newSet.delete(authId);
      else newSet.add(authId);
      return newSet;
    });
  };

  const handleToggleSelectAll = () => {
    const displayedItems = authorizations.filter(auth => auth.name.includes(`/locations/${region}/`));
    if (selectedIds.size === displayedItems.length && displayedItems.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayedItems.map(a => a.name)));
    }
  };

  const openDeleteModal = (auth?: Authorization) => {
    if (auth) {
      setSelectedIds(new Set([auth.name]));
    }
    if (selectedIds.size > 0 || auth) {
      setIsDeleteModalOpen(true);
    }
  };

  const confirmDelete = async () => {
    if (selectedIds.size === 0) return;

    setIsDeleting(true);
    setIsDeleteModalOpen(false);
    setError(null);

    const failures: string[] = [];
    const authsToDelete = authorizations.filter(a => selectedIds.has(a.name));

    for (const auth of authsToDelete) {
      const authDisplayName = auth.displayName || auth.name.split('/').pop() || auth.name;
      try {
        await api.deleteAuthorization(auth.name, apiConfig);
      } catch (err: any) {
        failures.push(`- ${authDisplayName}: ${err.message}`);
      }
    }

    if (failures.length > 0) {
      setError(`Failed to delete some authorizations:\n${failures.join('\n')}`);
    }

    setSelectedIds(new Set());
    setIsDeleting(false);
    fetchData(); // Refresh list and usage map
  };

  const handleEdit = async (authId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      // Find the full auth object from the list to get the correct name (including location)
      const auth = authorizations.find(a => a.name.endsWith(`/${authId}`));
      if (!auth) {
        throw new Error(`Authorization with ID ${authId} not found in the current list.`);
      }

      // Use the full resource name which includes the correct location
      const authData = await api.getAuthorization(auth.name, apiConfig);
        setAuthToEdit(authData);
        setView('form');
    } catch (err: any) {
        setError(err.message || `Failed to fetch authorization ${authId} for editing.`);
    } finally {
        setIsLoading(false);
    }
  };

  const handleView = async (auth: Authorization, tab: 'config' | 'adk' = 'config') => {
    // We already have the auth object from the list, but it might be partial if we optimized the list call later.
    // For now, the list returns full objects, but let's fetch fresh details to be safe and consistent with Edit.
    setAuthModalTab(tab);
    setIsLoading(true);
    setError(null);
    try {
      const authData = await api.getAuthorization(auth.name, apiConfig);
      setAuthToView(authData);
    } catch (err: any) {
      setError(err.message || `Failed to fetch details for authorization.`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleShowCreateForm = () => {
    setAuthToEdit(null);
    setView('form');
  };

  const handleCancelForm = () => {
    setAuthToEdit(null);
    setView('list');
    setError(null);
  };

  const handleSuccess = () => {
    setView('list');
    setAuthToEdit(null);
    fetchData();
  };

  const renderContent = () => {
    if (isLoading && authorizations.length === 0) { return <Spinner />; }
    if (error && view === 'list') { return <div className="text-center text-red-400 mt-8">{error}</div>; }
    
    if (view === 'form') {
      return <AuthForm
        config={apiConfig}
        onSuccess={handleSuccess}
        onCancel={handleCancelForm}
        authToEdit={authToEdit}
      />;
    }

    const displayedAuthorizations = authorizations.filter(auth => auth.name.includes(`/locations/${region}/`));

    return (
      <AuthList
        authorizations={displayedAuthorizations}
        onDelete={openDeleteModal}
        onEdit={handleEdit}
        onView={handleView}
        onCreateNew={handleShowCreateForm}
        authUsage={authUsage}
        isScanningAgents={isScanningAgents}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onToggleSelectAll={handleToggleSelectAll}
        onDeleteSelected={() => openDeleteModal()}
      />
    );
  };

  return (
    <div>
      <div className="bg-gray-800 p-4 rounded-lg mb-6 shadow-md">
            <div className="flex justify-between items-center mb-3">
                <h2 className="text-lg font-semibold text-white">Configuration</h2>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Project ID / Number</label>
                <div className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-300 font-mono h-[38px] flex items-center">
                    {projectNumber || <span className="text-gray-500 italic">Not set (configure on Agents page)</span>}
                </div>
            </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-400 mb-1">Region</label>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          >
            <option value="global">Global</option>
            <option value="us">US (Multi-region)</option>
            <option value="eu">EU (Multi-region)</option>
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Select the region where you want to manage authorizations.
          </p>
        </div>

            {view === 'list' && (
                <button 
                    onClick={fetchData} 
                    disabled={isLoading}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500"
                >
                    {isLoading ? 'Loading...' : 'Refresh Authorizations'}
                </button>
            )}
      </div>

      {/* Tools Section */}
      {view === 'list' && (
        <div className="mb-6">
          <button
            onClick={() => setShowWorkforceValidator(!showWorkforceValidator)}
            className="text-sm text-blue-400 hover:text-blue-300 underline focus:outline-none"
          >
            {showWorkforceValidator ? 'Hide Tools' : 'Show Advanced Tools (Workforce Pool Validator)'}
          </button>

          {showWorkforceValidator && (
            <div className="mt-4 animate-fade-in-down">
              <WorkforcePoolValidator config={apiConfig} />
            </div>
          )}
        </div>
      )}

      {view === 'list' && partialFailures.length > 0 && (
        <div className="mb-6">
          <PartialResultsBanner
            partialFailures={partialFailures}
            onRetry={fetchData}
          />
        </div>
      )}
      {renderContent()}

      {isDeleteModalOpen && (
        <ConfirmationModal
            isOpen={isDeleteModalOpen}
            onClose={() => setIsDeleteModalOpen(false)}
            onConfirm={confirmDelete}
          title={`Confirm Deletion of ${selectedIds.size} Authorization(s)`}
            confirmText="Delete"
            isConfirming={isDeleting}
        >
          <p>Are you sure you want to permanently delete the following authorizations?</p>
          <ul className="mt-2 p-3 bg-gray-700/50 rounded-md border border-gray-600 max-h-48 overflow-y-auto space-y-1">
            {Array.from(selectedIds).map(id => {
              const auth = authorizations.find(a => a.name === id);
              return (
                <li key={id} className="text-sm">
                  <p className="font-bold text-white font-mono">{id.split('/').pop()}</p>
                  {auth && <p className="text-xs text-gray-400 mt-1">Client ID: {auth.serverSideOauth2?.clientId || 'N/A'}</p>}
                </li>
              )
            })}
          </ul>
          <p className="mt-4 text-sm text-yellow-300">This action cannot be undone and may break agents that rely on them.</p>
        </ConfirmationModal>
      )}

      {authToView && (
        <ViewAuthModal
          isOpen={!!authToView}
          onClose={() => setAuthToView(null)}
          authorization={authToView}
          initialTab={authModalTab}
        />
      )}
    </div>
  );
};

export default AuthorizationsPage;