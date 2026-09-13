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
import { useSearchParams } from 'react-router-dom';
import { Collection, Config, DataStore } from '../types';
import * as api from '../services/apiService';
import Spinner from '../components/Spinner';
import DataStoreList from '../components/datastores/DataStoreList';
import DataStoreDetails from '../components/datastores/DataStoreDetails';
import CreateDataStoreModal from '../components/datastores/CreateDataStoreModal';
import EditDataStoreModal from '../components/datastores/EditDataStoreModal';
import ConfirmationModal from '../components/ConfirmationModal';
import CloudConsoleButton from '../components/CloudConsoleButton';
import { usePersistedConfig } from '../hooks/usePersistedConfig';
import ConnectorsPage from './ConnectorsPage';

interface DataStoresPageProps {
  projectNumber: string;
  projectId?: string;
  accessToken?: string;
  setProjectNumber?: (projectNumber: string) => void;
  initialTab?: 'datastores' | 'connectors';
}

type SortKey = 'displayName' | 'name' | 'solutionTypes';
type SortDirection = 'asc' | 'desc';

const DataStoresPage: React.FC<DataStoresPageProps> = ({
  projectNumber,
  projectId,
  accessToken,
  setProjectNumber,
  initialTab,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'connectors' || initialTab === 'connectors' ? 'connectors' : 'datastores';

  const handleTabChange = (tab: 'datastores' | 'connectors') => {
    const newParams = new URLSearchParams(searchParams);
    if (tab === 'connectors') {
      newParams.set('tab', 'connectors');
    } else {
      newParams.delete('tab');
    }
    setSearchParams(newParams);
  };
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

  // Pagination State
  const [pageToken, setPageToken] = useState<string | undefined>(undefined);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [pageHistory, setPageHistory] = useState<string[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(1);

  // Collections State
  const [availableCollections, setAvailableCollections] = useState<Collection[]>([]);
  const [isLoadingCollections, setIsLoadingCollections] = useState(false);

  const [config, setConfig] = usePersistedConfig(
    'dataStoresPageConfig',
    {
      appLocation: 'global',
      collectionId: 'default_collection',
    },
    {
      migrate: (parsed) => ({
        appLocation: parsed?.appLocation || 'global',
        collectionId: parsed?.collectionId || 'default_collection',
      }),
    }
  );

  const handleConfigChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setConfig(prev => ({ ...prev, [name]: value }));
  };

  const apiConfig: Omit<Config, 'accessToken'> = useMemo(() => ({
      ...config,
      projectId: projectId || projectNumber,
      // Dummy values for other required config properties
      appId: '',
      assistantId: '',
  }), [config, projectNumber, projectId]);

  // Fetch available collections when project/location changes
  useEffect(() => {
    let isMounted = true;
    const fetchCollections = async () => {
      if (!projectNumber) return;
      setIsLoadingCollections(true);
      try {
        const res = await api.listCollections(apiConfig);
        if (isMounted && res.collections && res.collections.length > 0) {
          setAvailableCollections(res.collections);
        }
      } catch (err) {
        console.warn('Could not fetch custom collections, defaulting to default_collection:', err);
      } finally {
        if (isMounted) setIsLoadingCollections(false);
      }
    };
    fetchCollections();
    return () => {
      isMounted = false;
    };
  }, [projectNumber, config.appLocation]);

  const fetchDataStores = useCallback(async (token?: string) => {
    if (!projectNumber || !config.collectionId) {
        setDataStores([]);
        setError("Project ID/Number and Collection ID are required to list data stores.");
        return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.listResources('dataStores', apiConfig, token);
      setDataStores(response.dataStores || []);
      setNextPageToken(response.nextPageToken || null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data stores.');
      setDataStores([]);
      setNextPageToken(null);
    } finally {
      setIsLoading(false);
    }
  }, [apiConfig, projectNumber, config.collectionId]);
  
  // Auto-fetch data stores on mount or config change
  useEffect(() => {
    setPageToken(undefined);
    setNextPageToken(null);
    setPageHistory([]);
    setCurrentPageIndex(1);
    if (projectNumber && config.collectionId) {
        fetchDataStores();
    } else {
        setDataStores([]);
    }
    setSelectedDataStores(new Set());
  }, [fetchDataStores, projectNumber, config.appLocation, config.collectionId]);

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

    if (failures.length > 0) {
        setError(`Failed to delete ${failures.length} data store(s):\n${failures.join('\n')}`);
    }
    
    // If we were on the details page of one of the deleted items, go back to list
    if (selectedDataStore && dataStoresToDelete.some(ds => ds.name === selectedDataStore.name)) {
        setViewMode('list');
        setSelectedDataStore(null);
    }
    
    setDataStoresToDelete([]);
    setSelectedDataStores(new Set());
    await fetchDataStores(pageToken); // Refresh the current page

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
    if (config.collectionId) ids.add(config.collectionId);
    if (!ids.has('default_collection')) ids.add('default_collection');
    return Array.from(ids);
  }, [availableCollections, config.collectionId]);

  return (
    <div className="space-y-6">
      {/* Sub-tab Switcher: Data Stores vs Connectors */}
      <div className="flex border-b border-gray-700 gap-2">
        <button
          type="button"
          onClick={() => handleTabChange('datastores')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'datastores'
              ? 'text-blue-400 border-blue-400 font-semibold'
              : 'text-gray-400 border-transparent hover:text-white hover:border-gray-600'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4z" />
            <path d="M3 8a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V8z" />
            <path d="M3 12a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2z" />
          </svg>
          Data Stores
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('connectors')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'connectors'
              ? 'text-blue-400 border-blue-400 font-semibold'
              : 'text-gray-400 border-transparent hover:text-white hover:border-gray-600'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
          </svg>
          Connectors
        </button>
      </div>

      {activeTab === 'connectors' ? (
        <ConnectorsPage
          projectNumber={projectNumber}
          setProjectNumber={setProjectNumber || (() => {})}
          accessToken={accessToken || ''}
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
          <div className="bg-gray-800 p-4 rounded-lg shadow-md">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg font-semibold text-white">Configuration</h2>
              <CloudConsoleButton url={`https://console.cloud.google.com/gen-app-builder/data-stores?project=${projectNumber}`} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Project ID / Number</label>
                <div className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-300 font-mono h-[38px] flex items-center">
                  {projectNumber || <span className="text-gray-500 italic">Not set (configure on Agents page)</span>}
                </div>
              </div>
              <div>
                <label htmlFor="appLocation" className="block text-sm font-medium text-gray-400 mb-1">Location</label>
                <select name="appLocation" value={config.appLocation} onChange={handleConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[38px]">
                  <option value="global">global</option>
                  <option value="us">us</option>
                  <option value="eu">eu</option>
                </select>
              </div>
              <div>
                <label htmlFor="collectionId" className="block text-sm font-medium text-gray-400 mb-1">Collection ID</label>
                {collectionOptions.length > 1 ? (
                  <select
                    id="collectionId"
                    name="collectionId"
                    value={config.collectionId}
                    onChange={handleConfigChange}
                    className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[38px]"
                  >
                    {collectionOptions.map((id) => {
                      const colObj = availableCollections.find(c => (c.name.split('/').pop() || c.name) === id);
                      return (
                        <option key={id} value={id}>
                          {colObj?.displayName ? `${colObj.displayName} (${id})` : id}
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <div className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-300 font-mono h-[38px] flex items-center justify-between">
                    <span>{config.collectionId || 'default_collection'}</span>
                    {isLoadingCollections && <Spinner className="h-3.5 w-3.5 border-2 ml-2 shrink-0" />}
                  </div>
                )}
              </div>
            </div>
            {viewMode === 'list' && (
              <button 
                onClick={() => fetchDataStores(pageToken)} 
                disabled={isLoading}
                className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500"
              >
                {isLoading ? 'Loading...' : 'Fetch Data Stores'}
              </button>
            )}
          </div>
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
    </div>
  );
};

export default DataStoresPage;
