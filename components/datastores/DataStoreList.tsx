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


import React from 'react';
import { DataStore } from '../../types';

type SortKey = 'displayName' | 'name' | 'solutionTypes';

interface DataStoreListProps {
  dataStores: DataStore[];
  onSelectDataStore: (dataStore: DataStore) => void;
  onDeleteDataStore: (dataStore: DataStore) => void;
  onEditDataStore: (dataStore: DataStore) => void;
  deletingDataStoreIds: Set<string>;
  selectedDataStores: Set<string>;
  onToggleSelect: (name: string) => void;
  onToggleSelectAll: () => void;
  onDeleteSelected: () => void;
  onCreateNew: () => void;
  onSort: (key: SortKey) => void;
  sortConfig: { key: SortKey; direction: 'asc' | 'desc' };
}

const SortIcon: React.FC<{ direction: 'asc' | 'desc' }> = ({ direction }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        {direction === 'asc' ? (
            <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
        ) : (
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        )}
    </svg>
);

const DataStoreList: React.FC<DataStoreListProps> = ({ 
  dataStores, 
  onSelectDataStore, 
  onDeleteDataStore, 
  onEditDataStore,
  deletingDataStoreIds,
  selectedDataStores,
  onToggleSelect,
  onToggleSelectAll,
  onDeleteSelected,
  onCreateNew,
  onSort,
  sortConfig
}) => {
  const isAllSelected = dataStores.length > 0 && selectedDataStores.size === dataStores.length;
  
  const SortableHeader: React.FC<{ label: string; sortKey: SortKey; className?: string }> = ({ label, sortKey, className = '' }) => {
    const isSorted = sortConfig.key === sortKey;
    const sortAria = isSorted
      ? sortConfig.direction === 'asc'
        ? 'ascending'
        : 'descending'
      : 'none';
    return (
      <th 
        scope="col" 
        aria-sort={sortAria}
        className={`px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider ${className}`}
      >
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          className="flex items-center gap-1 group text-inherit uppercase font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 rounded p-0.5 transition-colors hover:text-white"
          aria-label={`Sort by ${label}, currently ${isSorted ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'unsorted'}`}
        >
          <span>{label}</span>
          <span
            className={`text-gray-400 ${isSorted ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}
            aria-hidden="true"
          >
            <SortIcon direction={isSorted ? sortConfig.direction : 'asc'} />
          </span>
        </button>
      </th>
    );
  };

  return (
    <div className="bg-gray-800 shadow-xl rounded-lg overflow-hidden">
      <div className="p-4 border-b border-gray-700 flex justify-between items-center">
        <h2 className="text-xl font-bold text-white">Data Stores</h2>
        <div className="flex items-center gap-4">
          {selectedDataStores.size > 0 && (
            <>
              <span className="text-sm text-gray-300">{selectedDataStores.size} selected</span>
              <button
                onClick={onDeleteSelected}
                className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-md hover:bg-red-700"
              >
                Delete Selected
              </button>
            </>
          )}
           <button
                onClick={onCreateNew}
                className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700"
            >
                Create New
            </button>
        </div>
      </div>
      {dataStores.length === 0 ? (
        <p className="text-gray-400 p-6 text-center">No data stores found for the provided configuration.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-700/50">
              <tr>
                <th scope="col" className="px-6 py-3 w-10">
                  <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={onToggleSelectAll}
                      aria-label="Select all data stores"
                      className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600"
                  />
                </th>
                <SortableHeader label="Display Name" sortKey="displayName" />
                <SortableHeader label="Data Store ID" sortKey="name" />
                <SortableHeader label="Solution Types" sortKey="solutionTypes" />
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {dataStores.map((store) => {
                const isDeleting = deletingDataStoreIds.has(store.name);
                const isSelected = selectedDataStores.has(store.name);
                const storeId = store.name.split('/').pop() || '';

                return (
                  <tr key={store.name} className={`${isSelected ? 'bg-blue-900/50' : 'hover:bg-gray-700/50'} transition-colors`}>
                    <td className="px-6 py-4">
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onToggleSelect(store.name)}
                            aria-label={`Select data store ${store.displayName}`}
                            className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600"
                        />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{store.displayName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 font-mono">{storeId}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{store.solutionTypes?.join(', ')}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-4">
                        <button
                            onClick={() => onSelectDataStore(store)}
                            className="font-semibold text-blue-400 hover:text-blue-300 disabled:text-gray-500"
                            disabled={isDeleting}
                        >
                            View
                        </button>
                        <button
                            onClick={() => onEditDataStore(store)}
                            className="font-semibold text-indigo-400 hover:text-indigo-300 disabled:text-gray-500"
                            disabled={isDeleting}
                        >
                            Edit
                        </button>
                        <button
                            onClick={() => onDeleteDataStore(store)}
                            className="font-semibold text-red-400 hover:text-red-300 disabled:text-gray-500"
                            disabled={isDeleting}
                        >
                            {isDeleting ? 'Deleting...' : 'Delete'}
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
  );
};

export default DataStoreList;
