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
import { Collection, Config, DataStore, IamPolicy, Page } from '../types';
import * as api from '../services/apiService';
import Spinner from '../components/Spinner';
import DataStoreList from '../components/datastores/DataStoreList';
import DataStoreDetails from '../components/datastores/DataStoreDetails';
import CreateDataStoreModal from '../components/datastores/CreateDataStoreModal';
import EditDataStoreModal from '../components/datastores/EditDataStoreModal';
import SetDataStoreIamPolicyModal from '../components/assistants/SetDataStoreIamPolicyModal';
import ConfirmationModal from '../components/ConfirmationModal';
import { PageShell } from '../components/layout/PageShell';
import { PageHeader } from '../components/layout/PageHeader';
import { ScopeBar } from '../components/layout/ScopeBar';
import { Tabs } from '../components/common/Tabs';
import { useWorkspaceScope } from '../context/WorkspaceScopeContext';
import { usePersistedConfig } from '../hooks/usePersistedConfig';
import ConnectorsPage from './ConnectorsPage';
import { toErrorMessage } from '../utils/errors';

function resolveInitialKnowledgeTab(
  initialTab?: 'datastores' | 'connectors',
): 'datastores' | 'connectors' {
  if (initialTab === 'connectors') return 'connectors';
  if (typeof window !== 'undefined') {
    const search =
      window.location.search ||
      (window.location.hash.includes('?')
        ? window.location.hash.slice(window.location.hash.indexOf('?'))
        : '');
    if (search && new URLSearchParams(search).get('tab') === 'connectors') {
      return 'connectors';
    }
  }
  return 'datastores';
}

interface DataStoresPageProps {
  projectNumber?: string;
  projectId?: string;
  accessToken?: string;
  setProjectNumber?: (projectNumber: string) => void;
  initialTab?: 'datastores' | 'connectors';
  config?: Config;
  onSelectDataStore?: (store: DataStore) => void;
}

type SortKey = 'displayName' | 'name' | 'solutionTypes';
type SortDirection = 'asc' | 'desc';

const DataStoresPage: React.FC<DataStoresPageProps> = ({
  projectNumber: propProjectNumber,
  projectId,
  accessToken,
  setProjectNumber,
  initialTab,
  config: propConfig,
}) => {
  const projectNumber = propProjectNumber ?? propConfig?.projectId ?? '';
  const {
    appLocation: scopeLocation,
    collectionId: scopeCollectionId,
    setAppLocation: setScopeLocation,
    setCollectionId: setScopeCollectionId,
  } = useWorkspaceScope();

  const [activeTab, setActiveTab] = useState<'datastores' | 'connectors'>(() =>
    resolveInitialKnowledgeTab(initialTab),
  );
  const [isConnectorsLoading, setIsConnectorsLoading] = useState(false);
  const connectorsRefreshRef = useRef<(() => void) | null>(null);
  const [dataStores, setDataStores] = useState<DataStore[]>([]);
  const [selectedDataStore, setSelectedDataStore] = useState<DataStore | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'details'>('list');

  // Sorting State
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'displayName', direction: 'asc' });

  // State for deletion
  const [selectedDataStores, setSelectedDataStores] = useState<Set<string>>(new Set());
  const [deletingDataStoreIds, setDeletingDataStoreIds] = useState<Set<string>>(new Set());
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [dataStoresToDelete, setDataStoresToDelete] = useState<DataStore[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // State for creation
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  
  // State for editing
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [dataStoreToEdit, setDataStoreToEdit] = useState<DataStore | null>(null);

  // State for direct DataStore IAM policy editing
  const [iamTargetDataStore, setIamTargetDataStore] = useState<DataStore | null>(null);
  const [iamTargetPolicy, setIamTargetPolicy] = useState<IamPolicy | null>(null);

  // Pagination State
  const [pageToken, setPageToken] = useState<string | undefined>(undefined);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [pageHistory, setPageHistory] = useState<string[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(1);

  // Collections State
  const [availableCollections, setAvailableCollections] = useState<Collection[]>([]);
  const [isLoadingCollections, setIsLoadingCollections] = useState(false);
  const [collectionWarning, setCollectionWarning] = useState<string | null>(null);

  const [config, setConfig] = usePersistedConfig(
    'dataStoresPageConfig',
    {
      appLocation: scopeLocation || 'global',
      collectionId: scopeCollectionId || 'default_collection',
    },
    {
      migrate: (parsed) => ({
        appLocation: scopeLocation || parsed?.appLocation || 'global',
        collectionId: scopeCollectionId || parsed?.collectionId || 'default_collection',
      }),
    }
  );

  // Sync WorkspaceScope location/collection changes into local persisted config
  useEffect(() => {
    setConfig((prev) => {
      const nextLoc = scopeLocation || prev.appLocation;
      const nextCol = scopeCollectionId || prev.collectionId;
      if (prev.appLocation === nextLoc && prev.collectionId === nextCol) return prev;
      return { ...prev, appLocation: nextLoc, collectionId: nextCol };
    });
  }, [scopeLocation, scopeCollectionId, setConfig]);

  const dataStoresFetchSeqRef = useRef(0);

  const handleLocationChange = useCallback(
    (nextLocation: string) => {
      dataStoresFetchSeqRef.current += 1;
      setDataStores([]);
      setAvailableCollections([]);
      setSelectedDataStore(null);
      setViewMode('list');
      setScopeLocation(nextLocation);
      setConfig((prev) => ({ ...prev, appLocation: nextLocation }));
    },
    [setScopeLocation, setConfig],
  );

  const handleCollectionChange = useCallback(
    (nextCollectionId: string) => {
      setScopeCollectionId(nextCollectionId);
      setConfig((prev) => ({ ...prev, collectionId: nextCollectionId }));
    },
    [setScopeCollectionId, setConfig],
  );

  const effectiveLocation = scopeLocation || config.appLocation || 'global';
  const effectiveCollectionId = scopeCollectionId || config.collectionId || 'default_collection';

  const apiConfig: Omit<Config, 'accessToken'> = useMemo(() => ({
      appLocation: effectiveLocation,
      collectionId: effectiveCollectionId,
      projectId: projectId || projectNumber,
      // Dummy values for other required config properties
      appId: '',
      assistantId: '',
  }), [effectiveLocation, effectiveCollectionId, projectNumber, projectId]);

  // Fetch available collections when project/location changes
  useEffect(() => {
    if (activeTab !== 'datastores') return;
    let isMounted = true;
    const fetchCollections = async () => {
      if (!projectNumber) return;
      setIsLoadingCollections(true);
      setCollectionWarning(null);
      try {
        const res = await api.listCollections(apiConfig);
        if (isMounted && res.collections && res.collections.length > 0) {
          setAvailableCollections(res.collections);
        }
      } catch (err: unknown) {
        const msg = toErrorMessage(err);
        console.warn('Could not fetch custom collections, defaulting to default_collection:', err);
        if (isMounted) {
          setCollectionWarning(
            `Could not list custom collections (${msg}). Defaulting to default_collection.`
          );
        }
      } finally {
        if (isMounted) setIsLoadingCollections(false);
      }
    };
    fetchCollections();
    return () => {
      isMounted = false;
    };
  }, [projectNumber, effectiveLocation, activeTab, apiConfig]);

  const fetchDataStores = useCallback(async (token?: string) => {
    const seq = ++dataStoresFetchSeqRef.current;
    if (!projectNumber || !effectiveCollectionId) {
        setDataStores([]);
        setError("Project ID/Number and Collection ID are required to list data stores.");
        setIsLoading(false);
        return;
    }
    setIsLoading(true);
    setError(null);
    if (!token) {
      setDataStores([]);
    }
    try {
      const response = await api.listResources('dataStores', apiConfig, token);
      if (seq !== dataStoresFetchSeqRef.current) return;
      setDataStores(response.dataStores || []);
      setNextPageToken(response.nextPageToken || null);
    } catch (err: any) {
      if (seq !== dataStoresFetchSeqRef.current) return;
      setError(err.message || 'Failed to fetch data stores.');
      setDataStores([]);
      setNextPageToken(null);
    } finally {
      if (seq === dataStoresFetchSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, [apiConfig, projectNumber, effectiveCollectionId]);

  // Auto-fetch data stores on mount or config change when Data Stores tab is active
  useEffect(() => {
    if (activeTab !== 'datastores') return;
    setPageToken(undefined);
    setNextPageToken(null);
    setPageHistory([]);
    setCurrentPageIndex(1);
    if (projectNumber && effectiveCollectionId) {
        fetchDataStores();
    } else {
        setDataStores([]);
    }
    setSelectedDataStores(new Set());
  }, [fetchDataStores, projectNumber, effectiveLocation, effectiveCollectionId, activeTab]);

  const handleNextPage = () => {
    if (!nextPageToken || isLoading) return;
    setPageHistory(prev => [...prev, pageToken || '']);
    setPageToken(nextPageToken);
    setCurrentPageIndex(prev => prev + 1);
    fetchDataStores(nextPageToken);
  };

  const handlePrevPage = () => {
    if (pageHistory.length === 0 || isLoading) return;
    const prevTokens = [...pageHistory];
    const prevToken = prevTokens.pop();
    const tokenToFetch = prevToken === '' ? undefined : prevToken;
    setPageHistory(prevTokens);
    setPageToken(tokenToFetch);
    setCurrentPageIndex(prev => Math.max(1, prev - 1));
    fetchDataStores(tokenToFetch);
  };

  const pollDiscoveryOperation = async (operation: any, maxAttempts: number = 60) => {
    let currentOperation = operation;
    let attempts = 0;
    while (!currentOperation.done) {
        if (attempts++ >= maxAttempts) {
          throw new Error(
            `Operation timed out after ${maxAttempts * 5}s waiting for completion. It may still be running in Google Cloud: ${operation.name}`,
          );
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
        currentOperation = await api.getDiscoveryOperation(operation.name, apiConfig, 'v1beta');
    }
    if (currentOperation.error) {
        throw new Error(`Operation failed: ${currentOperation.error.message}`);
    }
    return currentOperation.response;
  };

  const handleToggleSelect = (dataStoreName: string) => {
    setSelectedDataStores(prev => {
      const newSet = new Set(prev);
      if (newSet.has(dataStoreName)) {
        newSet.delete(dataStoreName);
      } else {
        newSet.add(dataStoreName);
      }
      return newSet;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedDataStores.size === dataStores.length) {
      setSelectedDataStores(new Set());
    } else {
      setSelectedDataStores(new Set(dataStores.map(ds => ds.name)));
    }
  };

  const handleRequestDelete = (dataStore?: DataStore) => {
    let toDelete: DataStore[] = [];
    if (dataStore) {
      toDelete = [dataStore];
    } else {
      toDelete = dataStores.filter(ds => selectedDataStores.has(ds.name));
    }

    if (toDelete.length > 0) {
      setDataStoresToDelete(toDelete);
      setIsDeleteModalOpen(true);
    }
  };

  const confirmDelete = async () => {
    if (dataStoresToDelete.length === 0) return;

    setIsDeleting(true);
    setDeletingDataStoreIds(new Set(dataStoresToDelete.map(ds => ds.name)));
    setIsDeleteModalOpen(false);
    setError(null);

    const results = await Promise.allSettled(
        dataStoresToDelete.map(ds => api.deleteDataStore(ds.name, apiConfig).then(op => pollDiscoveryOperation(op)))
    );

    const failures: string[] = [];
    results.forEach((result, index) => {
        if (result.status === 'rejected') {
            const dsName = dataStoresToDelete[index].displayName;
            const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
            failures.push(`- ${dsName}: ${reason}`);
        }
    });

    // If we were on the details page of one of the deleted items, go back to list
    if (selectedDataStore && dataStoresToDelete.some(ds => ds.name === selectedDataStore.name)) {
        setViewMode('list');
        setSelectedDataStore(null);
    }
    
    setDataStoresToDelete([]);
    setSelectedDataStores(new Set());
    await fetchDataStores(pageToken); // Refresh the current page

    if (failures.length > 0) {
        setError(`Failed to delete ${failures.length} data store(s):\n${failures.join('\n')}`);
    }

    setIsDeleting(false);
    setDeletingDataStoreIds(new Set());
  };


  const handleSelectDataStore = (dataStore: DataStore) => {
    setSelectedDataStore(dataStore);
    setViewMode('details');
  };

  const handleBackToList = () => {
    setSelectedDataStore(null);
    setViewMode('list');
  };
  
  const handleCreateSuccess = () => {
    setIsCreateModalOpen(false);
    setPageToken(undefined);
    setNextPageToken(null);
    setPageHistory([]);
    setCurrentPageIndex(1);
    fetchDataStores();
  };

  const handleRequestEdit = (dataStore: DataStore) => {
    setDataStoreToEdit(dataStore);
    setIsEditModalOpen(true);
  };

  const handleEditSuccess = (updatedDataStore: DataStore) => {
    setIsEditModalOpen(false);
    setDataStoreToEdit(null);
    setDataStores(prev => prev.map(ds => (ds.name === updatedDataStore.name ? updatedDataStore : ds)));
    if (viewMode === 'details' && selectedDataStore?.name === updatedDataStore.name) {
      setSelectedDataStore(updatedDataStore);
    }
  };

  const handleManageIam = async (dataStore: DataStore) => {
    setError(null);
    const dsId = dataStore.name.split('/').pop() || dataStore.name;
    try {
      const policy = await api.getDataStoreIamPolicy(dsId, apiConfig);
      setIamTargetDataStore(dataStore);
      setIamTargetPolicy(policy || { etag: '', bindings: [] });
    } catch (err: unknown) {
      setError(`Failed to load IAM policy for '${dataStore.displayName}': ${toErrorMessage(err)}`);
    }
  };

  // Sorting Logic
  const handleSort = (key: SortKey) => {
      setSortConfig(prev => ({
          key,
          direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
      }));
  };

  const sortedDataStores = useMemo(() => {
      return [...dataStores].sort((a, b) => {
          let aVal = '';
          let bVal = '';

          switch(sortConfig.key) {
              case 'displayName':
                  aVal = a.displayName || '';
                  bVal = b.displayName || '';
                  break;
              case 'name':
                  aVal = a.name.split('/').pop() || '';
                  bVal = b.name.split('/').pop() || '';
                  break;
              case 'solutionTypes':
                  aVal = (a.solutionTypes || []).join(', ');
                  bVal = (b.solutionTypes || []).join(', ');
                  break;
          }

          if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
          if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
      });
  }, [dataStores, sortConfig]);

  const renderContent = () => {
    if (isLoading) { return <Spinner />; }

    if (viewMode === 'details' && selectedDataStore) {
        return (
            <DataStoreDetails
                dataStore={selectedDataStore}
                config={apiConfig}
                onBack={handleBackToList}
                onDelete={handleRequestDelete}
                isDeleting={deletingDataStoreIds.has(selectedDataStore.name)}
                onEdit={handleRequestEdit}
                onManageIam={handleManageIam}
            />
        );
    }
    
    return (
      <>
        {error && <div className="text-center text-red-400 p-4 mb-4 bg-red-900/20 rounded-lg whitespace-pre-wrap">{error}</div>}
        <DataStoreList
            dataStores={sortedDataStores}
            onSelectDataStore={handleSelectDataStore}
            onDeleteDataStore={handleRequestDelete}
            onEditDataStore={handleRequestEdit}
            onManageIam={handleManageIam}
            deletingDataStoreIds={deletingDataStoreIds}
            selectedDataStores={selectedDataStores}
            onToggleSelect={handleToggleSelect}
            onToggleSelectAll={handleToggleSelectAll}
            onDeleteSelected={() => handleRequestDelete()}
            onCreateNew={() => setIsCreateModalOpen(true)}
            onSort={handleSort}
            sortConfig={sortConfig}
            nextPageToken={nextPageToken}
            hasPrevPage={pageHistory.length > 0}
            currentPage={currentPageIndex}
            onNextPage={handleNextPage}
            onPrevPage={handlePrevPage}
            isLoading={isLoading}
        />
      </>
    );
  };

  const collectionOptions = useMemo(() => {
    const ids = new Set(availableCollections.map(c => c.name.split('/').pop() || c.name));
    if (effectiveCollectionId) ids.add(effectiveCollectionId);
    if (!ids.has('default_collection')) ids.add('default_collection');
    return Array.from(ids);
  }, [availableCollections, effectiveCollectionId]);

  const handleHeaderRefresh = useCallback(() => {
    if (activeTab === 'connectors') {
      connectorsRefreshRef.current?.();
    } else {
      void fetchDataStores(pageToken);
    }
  }, [activeTab, fetchDataStores, pageToken]);

  return (
    <PageShell variant="wide">
      <PageHeader
        title="Connectors & Data Stores"
        subtitle="Manage Discovery Engine RAG Data Stores, 3P Enterprise SaaS Connectors, and BYO MCP servers."
        consolePage={Page.DATA_STORES}
        projectId={projectId}
        projectNumber={projectNumber}
        onRefresh={
          activeTab === 'connectors' || viewMode === 'list'
            ? handleHeaderRefresh
            : undefined
        }
        isRefreshing={activeTab === 'connectors' ? isConnectorsLoading : isLoading}
      />

      <Tabs
        ariaLabel="Knowledge and Integrations Sections"
        syncSearchParam="tab"
        activeTab={activeTab}
        onChange={setActiveTab}
        items={[
          { id: 'datastores', label: 'Data Stores' },
          { id: 'connectors', label: 'Enterprise Connectors' },
        ]}
      />

      {activeTab === 'connectors' ? (
        <ConnectorsPage
          projectNumber={projectNumber}
          setProjectNumber={setProjectNumber || (() => {})}
          accessToken={accessToken || ''}
          sharedLocation={effectiveLocation}
          onSharedLocationChange={handleLocationChange}
          onLoadingChange={setIsConnectorsLoading}
          registerRefresh={connectorsRefreshRef}
        />
      ) : (
        <>
          <CreateDataStoreModal
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            onSuccess={handleCreateSuccess}
            config={apiConfig}
          />
          <EditDataStoreModal
            isOpen={isEditModalOpen}
            onClose={() => setIsEditModalOpen(false)}
            onSuccess={handleEditSuccess}
            config={apiConfig}
            dataStore={dataStoreToEdit}
          />
          {iamTargetDataStore && (
            <SetDataStoreIamPolicyModal
              isOpen={!!iamTargetDataStore}
              onClose={() => {
                setIamTargetDataStore(null);
                setIamTargetPolicy(null);
              }}
              onSuccess={() => {
                setIamTargetDataStore(null);
                setIamTargetPolicy(null);
              }}
              resourceId={iamTargetDataStore.name.split('/').pop() || iamTargetDataStore.name}
              resourceDisplayName={iamTargetDataStore.displayName}
              resourceType="datastore"
              resourcePath={iamTargetDataStore.name}
              config={apiConfig}
              currentPolicy={iamTargetPolicy}
            />
          )}

          {viewMode === 'list' && (
            <ScopeBar
              locationId="appLocation"
              locationValue={effectiveLocation}
              onLocationChange={handleLocationChange}
              collectionValue={collectionOptions.length > 1 ? effectiveCollectionId : undefined}
              onCollectionChange={collectionOptions.length > 1 ? handleCollectionChange : undefined}
              collectionLabel="Collection ID"
              collectionOptions={
                collectionOptions.length > 1
                  ? collectionOptions.map((id) => {
                      const colObj = availableCollections.find(
                        (c) => (c.name.split('/').pop() || c.name) === id,
                      );
                      return {
                        value: id,
                        label: colObj?.displayName
                          ? `${colObj.displayName} (${id})`
                          : id,
                      };
                    })
                  : undefined
              }
            >
              {collectionOptions.length <= 1 && (
                <div className="min-w-[190px]">
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1 whitespace-nowrap">
                    Collection ID
                  </span>
                  <div className="h-9 bg-gray-950/90 border border-gray-700/90 rounded-lg px-3 text-xs sm:text-sm text-gray-300 font-mono flex items-center justify-between min-w-0 overflow-hidden">
                    <span className="truncate">{effectiveCollectionId || 'default_collection'}</span>
                    {isLoadingCollections && (
                      <Spinner className="h-3.5 w-3.5 border-2 ml-2 shrink-0" />
                    )}
                  </div>
                </div>
              )}
            </ScopeBar>
          )}

          {collectionWarning && (
            <div
              role="alert"
              data-testid="collection-discovery-warning"
              className="text-xs text-amber-300 bg-amber-900/30 border border-amber-700/60 p-2.5 rounded-lg flex items-center justify-between"
            >
              <span>
                <strong>Collection Discovery Notice:</strong> {collectionWarning}
              </span>
              <button
                type="button"
                onClick={() => setCollectionWarning(null)}
                className="ml-3 text-amber-400 hover:text-white text-xs underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {renderContent()}

          {dataStoresToDelete.length > 0 && (
            <ConfirmationModal
              isOpen={isDeleteModalOpen}
              onClose={() => setIsDeleteModalOpen(false)}
              onConfirm={confirmDelete}
              title={`Confirm Deletion of ${dataStoresToDelete.length} Data Store(s)`}
              confirmText="Delete"
              isConfirming={isDeleting}
            >
              <p>Are you sure you want to permanently delete the following data store(s)?</p>
              <ul className="mt-2 p-3 bg-gray-700/50 rounded-md border border-gray-600 max-h-48 overflow-y-auto space-y-1">
                {dataStoresToDelete.map(ds => (
                  <li key={ds.name} className="text-sm">
                    <p className="font-bold text-white">{ds.displayName}</p>
                    <p className="text-xs font-mono text-gray-400 mt-1">{ds.name.split('/').pop()}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-yellow-300">This action cannot be undone and will delete all documents within the store(s).</p>
            </ConfirmationModal>
          )}
        </>
      )}
    </PageShell>
  );
};

export default DataStoresPage;
