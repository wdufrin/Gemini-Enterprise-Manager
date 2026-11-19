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
import {
  DEFAULT_BACKGROUND_CONCURRENCY,
  getOrLoadProjectAgentsUsage,
  mapWithQuotaLimit,
} from '../utils/quotaGuard';

interface AuthorizationsPageProps {
  projectNumber?: string;
  projectId?: string;
  config?: Config;
  authorizations?: Authorization[];
  setAuthorizations?: React.Dispatch<React.SetStateAction<Authorization[]>>;
  authUsage?: Record<string, Agent[]>;
  setAuthUsage?: React.Dispatch<React.SetStateAction<Record<string, Agent[]>>>;
  isLoading?: boolean;
  setIsLoading?: React.Dispatch<React.SetStateAction<boolean>>;
  isScanningAgents?: boolean;
  setIsScanningAgents?: React.Dispatch<React.SetStateAction<boolean>>;
  error?: string | null;
  setError?: React.Dispatch<React.SetStateAction<string | null>>;
  hasLoaded?: boolean;
  setHasLoaded?: React.Dispatch<React.SetStateAction<boolean>>;
}

const AuthorizationsPage: React.FC<AuthorizationsPageProps> = ({
  projectNumber: propProjectNumber,
  projectId: propProjectId,
  config,
  authorizations: propAuthorizations,
  setAuthorizations: propSetAuthorizations,
  authUsage: propAuthUsage,
  setAuthUsage: propSetAuthUsage,
  isLoading: propIsLoading,
  setIsLoading: propSetIsLoading,
  isScanningAgents: propIsScanningAgents,
  setIsScanningAgents: propSetIsScanningAgents,
  error: propError,
  setError: propSetError,
  hasLoaded: propHasLoaded,
  setHasLoaded: propSetHasLoaded,
}) => {
  const projectNumber = propProjectNumber || config?.projectId || '';
  const projectId = propProjectId || config?.projectId || projectNumber;

  const [internalAuthorizations, setInternalAuthorizations] = useState<Authorization[]>([]);
  const authorizations = propAuthorizations ?? internalAuthorizations;
  const setAuthorizations = propSetAuthorizations ?? setInternalAuthorizations;

  const [internalAuthUsage, setInternalAuthUsage] = useState<Record<string, Agent[]>>({});
  const authUsage = propAuthUsage ?? internalAuthUsage;
  const setAuthUsage = propSetAuthUsage ?? setInternalAuthUsage;

  const [internalIsLoading, setInternalIsLoading] = useState(false);
  const isLoading = propIsLoading ?? internalIsLoading;
  const setIsLoading = propSetIsLoading ?? setInternalIsLoading;

  const [internalIsScanningAgents, setInternalIsScanningAgents] = useState(false);
  const isScanningAgents = propIsScanningAgents ?? internalIsScanningAgents;
  const setIsScanningAgents = propSetIsScanningAgents ?? setInternalIsScanningAgents;

  const [internalError, setInternalError] = useState<string | null>(null);
  const error = propError !== undefined ? propError : internalError;
  const setError = propSetError ?? setInternalError;

  const [internalHasLoaded, setInternalHasLoaded] = useState(false);
  const hasLoaded = propHasLoaded ?? internalHasLoaded;
  const setHasLoaded = propSetHasLoaded ?? setInternalHasLoaded;
  const [view, setView] = useState<'list' | 'form'>('list');
  const [authToEdit, setAuthToEdit] = useState<Authorization | null>(null);
  const [authToView, setAuthToView] = useState<Authorization | null>(null);
  const [authModalTab, setAuthModalTab] = useState<'config' | 'adk'>('config');
  const [region, setRegion] = useState<string>('global');
  
  // State for delete confirmation modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [singleDeleteTargetId, setSingleDeleteTargetId] = useState<string | null>(null);
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

  const scanAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      scanAbortRef.current?.abort();
    };
  }, []);

  const fetchData = useCallback(async (forceRefresh = false) => {
    scanAbortRef.current?.abort();

    if (!projectNumber) {
        setAuthorizations([]);
        setPartialFailures([]);
        setError("Project ID/Number is required to list authorizations.");
        return;
    }

    const abortController = new AbortController();
    scanAbortRef.current = abortController;

    setIsLoading(true);
    setIsScanningAgents(true);
    setError(null);
    setPartialFailures([]);
    setAuthUsage({});

    const failures: PartialFailure[] = [];
    const getStatusCode = (e: unknown): number | undefined => {
      const rec = e as { status?: number; code?: number } | null | undefined;
      return rec?.status || rec?.code || (toErrorMessage(e).includes('403') ? 403 : undefined);
    };

    try {
      const discoveryLocations = ['global', 'us', 'eu'];

      const authPromises = discoveryLocations.map(async (loc) => {
        try {
          const res = (await api.listAuthorizations({ ...apiConfig, appLocation: loc })) || {};
          return res.authorizations || [];
        } catch (err: unknown) {
          console.error(`Failed to load auths for region ${loc}:`, err);
          failures.push({
            id: `authorizations-${loc}`,
            name: `Authorizations (${loc})`,
            resourceType: 'Authorizations',
            status: getStatusCode(err),
            error: toErrorMessage(err),
            reason: `Failed to load authorizations for region '${loc}': ${toErrorMessage(err)}`,
          });
          return [];
        }
      });
      
      // Query default_collection directly (skipping DataConnector collections, which never contain App Engines)
      // and cap background concurrency to protect customer Discovery Engine quotas.
      const agentPromise = getOrLoadProjectAgentsUsage(
        apiConfig.projectId || projectNumber,
        async () => {
          const agentsList: Agent[] = [];
          const enginesToScan: Array<{ loc: string; appId: string }> = [];

          await mapWithQuotaLimit(
            discoveryLocations,
            DEFAULT_BACKGROUND_CONCURRENCY,
            async (discoveryLocation) => {
              const locationConfig = {
                ...apiConfig,
                appLocation: discoveryLocation,
                collectionId: 'default_collection',
              };
              try {
                const appEnginesResponse =
                  (await api.listResources('engines', locationConfig)) || {};
                const appEngines = appEnginesResponse.engines || [];
                for (const appEngine of appEngines) {
                  const appId = appEngine.name.split('/').pop();
                  if (appId) enginesToScan.push({ loc: discoveryLocation, appId });
                }
              } catch (engErr: unknown) {
                console.warn(`Could not list engines for location ${discoveryLocation}:`, engErr);
                failures.push({
                  id: `engines-${discoveryLocation}`,
                  name: `Engines (${discoveryLocation})`,
                  resourceType: 'Engines',
                  status: getStatusCode(engErr),
                  error: toErrorMessage(engErr),
                  reason: `Could not list engines for location '${discoveryLocation}': ${toErrorMessage(engErr)}`,
                });
              }
            },
            { signal: abortController.signal },
          );

          if (abortController.signal.aborted) {
            return {
              agents: agentsList,
              warnings: failures.map((f) => f.reason || f.name),
            };
          }

          await mapWithQuotaLimit(
            enginesToScan,
            DEFAULT_BACKGROUND_CONCURRENCY,
            async ({ loc, appId }) => {
              const appConfig = {
                ...apiConfig,
                appLocation: loc,
                collectionId: 'default_collection',
                appId,
              };
              try {
                const assistantsResponse =
                  (await api.listResources('assistants', appConfig)) || {};
                const assistants = assistantsResponse.assistants || [];
                for (const assistant of assistants) {
                  if (abortController.signal.aborted) return;
                  const assistantId = assistant.name.split('/').pop()!;
                  const assistantConfig = { ...appConfig, assistantId };
                  try {
                    const agentsResponse =
                      (await api.listResources('agents', assistantConfig)) || {};
                    if (agentsResponse.agents) {
                      agentsList.push(...agentsResponse.agents);
                    }
                  } catch (agentErr: unknown) {
                    console.warn(`Could not list agents for assistant ${assistantId}:`, agentErr);
                    failures.push({
                      id: `agents-${assistantId}`,
                      name: `Assistant ${assistantId}`,
                      resourceType: 'Assistant Agents',
                      status: getStatusCode(agentErr),
                      error: toErrorMessage(agentErr),
                      reason: `Could not list agents for assistant '${assistantId}': ${toErrorMessage(agentErr)}`,
                    });
                  }
                }
              } catch (astErr: unknown) {
                console.warn(`Could not list assistants for app ${appId}:`, astErr);
                failures.push({
                  id: `assistants-${appId}`,
                  name: `Engine App ${appId}`,
                  resourceType: 'Engine Assistants',
                  status: getStatusCode(astErr),
                  error: toErrorMessage(astErr),
                  reason: `Could not list assistants for app '${appId}': ${toErrorMessage(astErr)}`,
                });
              }
            },
            { signal: abortController.signal },
          );

          return {
            agents: agentsList,
            warnings: failures.map((f) => f.reason || f.name),
          };
        },
        { forceRefresh },
      ).then((snapshot) => snapshot.agents);

      const [authResults, allAgents] = await Promise.all([
        Promise.all(authPromises),
        agentPromise
      ]);
      const seenNames = new Set<string>();
      const allAuths = authResults.flat().filter((a) => {
        if (!a?.name || seenNames.has(a.name)) return false;
        seenNames.add(a.name);
        return true;
      });

      setAuthorizations(allAuths);
      setPartialFailures(failures);
      setHasLoaded(true);
      
      const usageMap: Record<string, Agent[]> = {};
      const seenAgentPerAuth = new Map<string, Set<string>>();
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
            seenAgentPerAuth.set(authName, new Set());
          }
          if (!seenAgentPerAuth.get(authName)!.has(agent.name)) {
            seenAgentPerAuth.get(authName)!.add(agent.name);
            usageMap[authName].push(agent);
          }
        }
      }
      setAuthUsage(usageMap);

    } catch (err: unknown) {
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

  const deleteTargetIds = useMemo(
    () => (singleDeleteTargetId ? [singleDeleteTargetId] : Array.from(selectedIds)),
    [singleDeleteTargetId, selectedIds]
  );

  const usedByAgentsForDelete = useMemo(() => {
    const seenAgents = new Set<string>();
    const boundAgents: Agent[] = [];
    for (const targetId of deleteTargetIds) {
      const suffixMatch = targetId.match(/\/locations\/[^/]+\/authorizations\/[^/]+$/)?.[0];
      for (const [usageAuthKey, agents] of Object.entries(authUsage)) {
        const isMatch =
          usageAuthKey === targetId ||
          Boolean(suffixMatch && usageAuthKey.endsWith(suffixMatch));
        if (isMatch && Array.isArray(agents)) {
          for (const ag of agents) {
            const key = ag.name || ag.displayName || '';
            if (key && !seenAgents.has(key)) {
              seenAgents.add(key);
              boundAgents.push(ag);
            }
          }
        }
      }
    }
    return boundAgents;
  }, [deleteTargetIds, authUsage]);

  const openDeleteModal = (auth?: Authorization) => {
    if (auth) {
      setSingleDeleteTargetId(auth.name);
      setIsDeleteModalOpen(true);
    } else if (selectedIds.size > 0) {
      setSingleDeleteTargetId(null);
      setIsDeleteModalOpen(true);
    }
  };

  const confirmDelete = async () => {
    if (deleteTargetIds.length === 0) return;

    const targetSet = new Set(deleteTargetIds);
    const wasSingleDelete = Boolean(singleDeleteTargetId);

    setIsDeleting(true);
    setIsDeleteModalOpen(false);
    setError(null);

    const failures: string[] = [];
    const authsToDelete = authorizations.filter(a => targetSet.has(a.name));

    for (const auth of authsToDelete) {
      const authDisplayName = auth.displayName || auth.name.split('/').pop() || auth.name;
      try {
        await api.deleteAuthorization(auth.name, apiConfig);
      } catch (err: unknown) {
        failures.push(`- ${authDisplayName}: ${toErrorMessage(err)}`);
      }
    }

    const deleteErrorMsg =
      failures.length > 0
        ? `Failed to delete some authorizations:\n${failures.join('\n')}`
        : null;

    if (wasSingleDelete && singleDeleteTargetId) {
      setSingleDeleteTargetId(null);
      setSelectedIds(prev => {
        if (!prev.has(singleDeleteTargetId)) return prev;
        const next = new Set(prev);
        next.delete(singleDeleteTargetId);
        return next;
      });
    } else {
      setSelectedIds(new Set());
    }
    setIsDeleting(false);
    await fetchData(); // Refresh list and usage map
    if (deleteErrorMsg) {
      setError(deleteErrorMsg);
    }
  };

  const handleEdit = async (authId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      // Prefer matching full resource name or the active region first to prevent cross-region ID collisions
      const auth =
        authorizations.find(
          a =>
            a.name === authId ||
            (a.name.includes(`/locations/${region}/`) && a.name.endsWith(`/${authId}`))
        ) || authorizations.find(a => a.name.endsWith(`/${authId}`));
      if (!auth) {
        throw new Error(`Authorization with ID ${authId} not found in the current list.`);
      }

      // Use the full resource name which includes the correct location
      const authData = await api.getAuthorization(auth.name, apiConfig);
        setAuthToEdit(authData);
        setView('form');
    } catch (err: unknown) {
        setError(toErrorMessage(err) || `Failed to fetch authorization ${authId} for editing.`);
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
    } catch (err: unknown) {
      setError(toErrorMessage(err) || `Failed to fetch details for authorization.`);
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

    const displayedAuthorizations = authorizations.filter(
      auth => auth.name?.includes(`/locations/${region}/`) || (region === 'global' && !auth.name?.includes('/locations/'))
    );

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
            <h2 className="text-lg font-semibold text-white mb-3">Configuration</h2>
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
            onChange={(e) => {
              setRegion(e.target.value);
              setSelectedIds(new Set());
            }}
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
                    onClick={() => fetchData(true)} 
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
            onRetry={() => fetchData(true)}
          />
        </div>
      )}
      {renderContent()}

      {isDeleteModalOpen && (
        <ConfirmationModal
            isOpen={isDeleteModalOpen}
            onClose={() => {
              setIsDeleteModalOpen(false);
              setSingleDeleteTargetId(null);
            }}
            onConfirm={confirmDelete}
            title={`Confirm Deletion of ${deleteTargetIds.length} Authorization(s)`}
            confirmText="Delete"
            isConfirming={isDeleting}
        >
          <p>Are you sure you want to permanently delete the following authorizations?</p>
          <ul className="mt-2 p-3 bg-gray-700/50 rounded-md border border-gray-600 max-h-48 overflow-y-auto space-y-1">
            {deleteTargetIds.map(id => {
              const auth = authorizations.find(a => a.name === id);
              return (
                <li key={id} className="text-sm">
                  <p className="font-bold text-white font-mono">{id.split('/').pop()}</p>
                  {auth && <p className="text-xs text-gray-400 mt-1">Client ID: {auth.serverSideOauth2?.clientId || 'N/A'}</p>}
                </li>
              )
            })}
          </ul>
          {usedByAgentsForDelete.length > 0 && (
            <div
              data-testid="active-agent-dependency-warning"
              role="alert"
              className="mt-4 p-3.5 bg-red-950/80 border-2 border-red-600 rounded-lg text-red-100 space-y-2"
            >
              <div className="flex items-center gap-2 text-sm font-bold text-red-300 uppercase tracking-wide">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>Active Agent Dependency Warning ({usedByAgentsForDelete.length} Bound Agent{usedByAgentsForDelete.length === 1 ? '' : 's'})</span>
              </div>
              <p className="text-xs text-red-200 leading-relaxed">
                Deleting {deleteTargetIds.length === 1 ? 'this authorization' : 'these authorizations'} will immediately break OAuth 2.0 tool execution for the following live agent(s):
              </p>
              <ul className="list-disc list-inside text-xs font-mono text-white bg-black/40 p-2.5 rounded border border-red-800/80 max-h-32 overflow-y-auto space-y-1">
                {usedByAgentsForDelete.map((agent) => (
                  <li key={agent.name}>
                    <span className="font-semibold text-red-200">
                      {agent.displayName || agent.name.split('/').pop() || agent.name}
                    </span>{' '}
                    <span className="text-gray-400">({agent.name.split('/').pop()})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
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