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
import { Collection, Config, DataStore } from '../types';
import * as api from '../services/apiService';
import Spinner from '../components/Spinner';
import DataStoreList from '../components/datastores/DataStoreList';
import DataStoreDetails from '../components/datastores/DataStoreDetails';
import ConfirmationModal from '../components/ConfirmationModal';
import CloudConsoleButton from '../components/CloudConsoleButton';

interface CreateDataStoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  config: Config;
}

const CreateDataStoreModal: React.FC<CreateDataStoreModalProps> = ({ isOpen, onClose, onSuccess, config }) => {
  const [displayName, setDisplayName] = useState('');
  const [dataStoreId, setDataStoreId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State for advanced parser config
  const [defaultParser, setDefaultParser] = useState<'digital' | 'layout' | 'ocr'>('digital');
  const [overrides, setOverrides] = useState<Record<string, 'default' | 'digital' | 'layout' | 'ocr'>>({
    pdf: 'default',
    docx: 'default',
    xlsx: 'default',
    pptx: 'default',
    html: 'default',
  });
  const SUPPORTED_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'pptx', 'html'];

  useEffect(() => {
    if (isOpen) {
      setDisplayName('');
      setDataStoreId('');
      setError(null);
      setDefaultParser('digital');
      setOverrides({
        pdf: 'default',
        docx: 'default',
        xlsx: 'default',
        pptx: 'default',
        html: 'default',
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;
  
  const handleOverrideChange = (ext: string, value: 'default' | 'digital' | 'layout' | 'ocr') => {
    setOverrides(prev => ({ ...prev, [ext]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim() || !dataStoreId.trim()) {
      setError("Display Name and Data Store ID are required.");
      return;
    }
    setIsSubmitting(true);
    setError(null);

    try {
        const buildDocumentProcessingConfig = () => {
            const config: any = { defaultParsingConfig: {} };
            if (defaultParser === 'layout') {
                config.defaultParsingConfig.layoutParsingConfig = {};
            } else if (defaultParser === 'ocr') {
                config.defaultParsingConfig.ocrParsingConfig = {};
            } else { // 'digital'
                config.defaultParsingConfig.digitalParsingConfig = {};
            }

            const parsingConfigOverrides: any = {};
            for (const ext of SUPPORTED_EXTENSIONS) {
                const overrideSetting = overrides[ext];
                if (overrideSetting !== 'default') {
                    parsingConfigOverrides[ext] = {};
                    if (overrideSetting === 'layout') {
                        parsingConfigOverrides[ext].layoutParsingConfig = {};
                    } else if (overrideSetting === 'ocr') {
                        parsingConfigOverrides[ext].ocrParsingConfig = {};
                    } else { // 'digital'
                        parsingConfigOverrides[ext].digitalParsingConfig = {};
                    }
                }
            }

            if (Object.keys(parsingConfigOverrides).length > 0) {
                config.parsingConfigOverrides = parsingConfigOverrides;
            }
            return config;
        };

      const payload = {
        displayName,
        industryVertical: 'GENERIC',
        solutionTypes: ["SOLUTION_TYPE_SEARCH"],
        contentConfig: "CONTENT_REQUIRED",
        documentProcessingConfig: buildDocumentProcessingConfig(),
      };
      const operation = await api.createDataStore(dataStoreId, payload, config);
      if (operation && operation.name) {
        await api.pollDiscoveryOperation(operation, config);
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to create data store.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          <header className="p-4 border-b border-gray-700">
            <h2 className="text-xl font-bold text-white">Create New Data Store</h2>
          </header>
          <main className="p-6 space-y-4 overflow-y-auto">
            <div>
              <label htmlFor="displayName" className="block text-sm font-medium text-gray-300">Display Name</label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm"
                required
              />
            </div>
            <div>
              <label htmlFor="dataStoreId" className="block text-sm font-medium text-gray-300">Data Store ID</label>
              <input
                id="dataStoreId"
                type="text"
                value={dataStoreId}
                onChange={(e) => setDataStoreId(e.target.value)}
                className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm"
                pattern="[a-z0-9-]{1,63}"
                title="Must be lowercase letters, numbers, and hyphens, up to 63 characters."
                required
              />
              <p className="mt-1 text-xs text-gray-400">A unique ID for the data store. Must use lowercase, numbers, and hyphens.</p>
            </div>
            
            <div className="pt-4 border-t border-gray-700">
              <h3 className="text-lg font-semibold text-white">Document Processing Configuration</h3>
              <p className="text-xs text-gray-400 mt-1 mb-3">
                Specify how to parse documents for ingestion.
                <a href="https://cloud.google.com/generative-ai-app-builder/docs/parse-chunk-documents" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline ml-1">
                  Learn more about parsing and chunking.
                </a>
              </p>
              
              <div className="space-y-4">
                <div>
                    <label htmlFor="defaultParser" className="block text-sm font-medium text-gray-300">Default Parser</label>
                    <select
                        id="defaultParser"
                        value={defaultParser}
                        onChange={(e) => setDefaultParser(e.target.value as 'digital' | 'layout' | 'ocr')}
                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm h-10"
                    >
                        <option value="digital">Digital Parser - Default for all file types unless overridden.</option>
                        <option value="layout">Layout Parser - Recommended for HTML, PDF, or DOCX files for RAG.</option>
                        <option value="ocr">OCR Parser - For scanned PDFs or PDFs with text inside images.</option>
                    </select>
                </div>

                <div>
                    <h4 className="text-md font-medium text-gray-300 mb-2">Parser Overrides</h4>
                    <div className="space-y-2 bg-gray-900/50 p-3 rounded-md">
                        {SUPPORTED_EXTENSIONS.map(ext => (
                            <div key={ext} className="grid grid-cols-3 items-center gap-4">
                                <label htmlFor={`override-${ext}`} className="text-sm font-mono text-gray-300 justify-self-end">.{ext}</label>
                                <select
                                    id={`override-${ext}`}
                                    value={overrides[ext]}
                                    onChange={(e) => handleOverrideChange(ext, e.target.value as 'default' | 'digital' | 'layout' | 'ocr')}
                                    className="col-span-2 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm h-9"
                                >
                                    <option value="default">Use Default ({defaultParser})</option>
                                    <option value="digital">Digital Parser</option>
                                    <option value="layout">Layout Parser</option>
                                    <option value="ocr">OCR Parser</option>
                                </select>
                            </div>
                        ))}
                    </div>
                </div>
              </div>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}
          </main>
          <footer className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-end space-x-3 shrink-0">
            <button type="button" onClick={onClose} disabled={isSubmitting} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-800">
              {isSubmitting ? 'Creating...' : 'Create'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};

interface EditDataStoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedDataStore: DataStore) => void;
  config: Config;
  dataStore: DataStore | null;
}

const EditDataStoreModal: React.FC<EditDataStoreModalProps> = ({ isOpen, onClose, onSuccess, config, dataStore }) => {
  const [displayName, setDisplayName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && dataStore) {
      setDisplayName(dataStore.displayName);
      setError(null);
    }
  }, [isOpen, dataStore]);

  if (!isOpen || !dataStore) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setError("Display Name is required.");
      return;
    }
    setIsSubmitting(true);
    setError(null);

    try {
      const payload = { displayName };
      const updatedDataStore = await api.updateDataStore(dataStore.name, payload, config);
      onSuccess(updatedDataStore);
    } catch (err: any) {
      setError(err.message || 'Failed to update data store.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-lg">
        <form onSubmit={handleSubmit}>
          <header className="p-4 border-b border-gray-700">
            <h2 className="text-xl font-bold text-white">Edit Data Store</h2>
          </header>
          <main className="p-6 space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-400">Data Store ID</label>
                <p className="mt-1 bg-gray-700 p-2 rounded-md text-sm font-mono text-gray-400">{dataStore.name.split('/').pop()}</p>
            </div>
            <div>
              <label htmlFor="displayName" className="block text-sm font-medium text-gray-300">Display Name</label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm"
                required
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
          </main>
          <footer className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-end space-x-3">
            <button type="button" onClick={onClose} disabled={isSubmitting} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-800">
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};


interface DataStoresPageProps {
  projectNumber: string;
  projectId?: string;
}

const getInitialConfig = () => {
  try {
    const savedConfig = sessionStorage.getItem('dataStoresPageConfig');
    if (savedConfig) {
      const parsed = JSON.parse(savedConfig);
      delete parsed.collectionId; // remove deprecated key
      return parsed;
    }
  } catch (e) {
    console.error("Failed to parse config from sessionStorage", e);
    sessionStorage.removeItem('dataStoresPageConfig');
  }
  return {
    appLocation: 'global',
  };
};

type SortKey = 'displayName' | 'name' | 'solutionTypes';
type SortDirection = 'asc' | 'desc';

const DataStoresPage: React.FC<DataStoresPageProps> = ({ projectNumber, projectId }) => {
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


  const [config, setConfig] = useState(() => ({
    ...getInitialConfig(),
    collectionId: 'default_collection',
  }));
  
  // Save config to session storage on change
  useEffect(() => {
    const { appLocation } = config;
    sessionStorage.setItem('dataStoresPageConfig', JSON.stringify({ appLocation }));
  }, [config]);

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

  const fetchDataStores = useCallback(async () => {
    if (!projectNumber || !config.collectionId) {
        setDataStores([]);
        setError("Project ID/Number and Collection ID are required to list data stores.");
        return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.listResources('dataStores', apiConfig);
      setDataStores(response.dataStores || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data stores.');
      setDataStores([]);
    } finally {
      setIsLoading(false);
    }
  }, [apiConfig, projectNumber, config.collectionId]);
  
  // Auto-fetch data stores on mount or config change
  useEffect(() => {
    if (projectNumber && config.collectionId) {
        fetchDataStores();
    } else {
        setDataStores([]);
    }
    setSelectedDataStores(new Set());
  }, [fetchDataStores]);

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
    await fetchDataStores(); // Refresh the list

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
        />
      </>
    );
  };

  return (
    <div className="space-y-6">
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
                    <label className="block text-sm font-medium text-gray-400 mb-1">Collection ID</label>
                    <div className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-300 font-mono h-[38px] flex items-center">
                        default_collection
                    </div>
                </div>
            </div>
            {viewMode === 'list' && (
                <button 
                    onClick={fetchDataStores} 
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
    </div>
  );
};

export default DataStoresPage;
