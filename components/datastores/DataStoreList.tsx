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


import React, { useMemo, useState } from 'react';
import { DataStore } from '../../types';

type SortKey = 'displayName' | 'name' | 'solutionTypes';

interface DataStoreListProps {
  dataStores: DataStore[];
  onSelectDataStore: (dataStore: DataStore) => void;
  onDeleteDataStore: (dataStore: DataStore) => void;
  onEditDataStore: (dataStore: DataStore) => void;
  onManageIam?: (dataStore: DataStore) => void;
  deletingDataStoreIds: Set<string>;
  selectedDataStores: Set<string>;
  onToggleSelect: (name: string) => void;
  onToggleSelectAll: () => void;
  onDeleteSelected: () => void;
  onCreateNew: () => void;
  onSort: (key: SortKey) => void;
  sortConfig: { key: SortKey; direction: 'asc' | 'desc' };
  nextPageToken?: string | null;
  hasPrevPage?: boolean;
  currentPage?: number;
  onNextPage?: () => void;
  onPrevPage?: () => void;
  isLoading?: boolean;
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
  onManageIam,
  deletingDataStoreIds,
  selectedDataStores,
  onToggleSelect,
  onToggleSelectAll,
  onDeleteSelected,
  onCreateNew,
  onSort,
  sortConfig,
  nextPageToken,
  hasPrevPage,
  currentPage = 0,
  onNextPage,
  onPrevPage,
  isLoading,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredDataStores = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return dataStores;
    return dataStores.filter((store) => {
      const storeId = (store.name.split('/').pop() || '').toLowerCase();
      const displayName = (store.displayName || '').toLowerCase();
      const solutions = (store.solutionTypes || []).join(' ').toLowerCase();
      return (
        displayName.includes(q) ||
        storeId.includes(q) ||
        solutions.includes(q)
      );
    });
  }, [dataStores, searchQuery]);

  const isAllSelected =
    filteredDataStores.length > 0 &&
    filteredDataStores.every((ds) => selectedDataStores.has(ds.name));
  
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
        className={`px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider whitespace-nowrap ${className}`}
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
    <div className="bg-gray-900/90 border border-gray-800 shadow-xl rounded-xl overflow-hidden">
      <div className="p-4 border-b border-gray-800 flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-lg sm:text-xl font-bold text-white">Data Stores</h2>
          {dataStores.length > 0 && (
            <span className="px-2 py-0.5 text-xs font-mono rounded-full bg-gray-800 border border-gray-700 text-gray-300">
              {filteredDataStores.length}/{dataStores.length}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {dataStores.length > 0 && (
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter data stores..."
                aria-label="Search data stores"
                className="w-full h-9 bg-gray-950/90 border border-gray-700/90 rounded-lg pl-8 pr-7 text-xs sm:text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <svg
                className="w-4 h-4 text-gray-500 absolute left-2.5 top-2.5 pointer-events-none"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear data store search"
                  className="absolute right-2 top-2 text-gray-400 hover:text-white text-xs"
                >
                  ×
                </button>
              )}
            </div>
          )}

          {selectedDataStores.size > 0 && (
            <>
              <span className="text-xs sm:text-sm text-gray-300 whitespace-nowrap">{selectedDataStores.size} selected</span>
              <button
                type="button"
                onClick={onDeleteSelected}
                className="px-3.5 h-9 bg-red-600 text-white text-xs sm:text-sm font-semibold rounded-lg hover:bg-red-700 whitespace-nowrap shrink-0 transition-colors"
              >
                Delete Selected
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onCreateNew}
            className="px-4 h-9 bg-blue-600 text-white text-xs sm:text-sm font-semibold rounded-lg hover:bg-blue-500 whitespace-nowrap shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            Create New
          </button>
        </div>
      </div>
      {dataStores.length === 0 ? (
        <p className="text-gray-400 p-6 text-center">No data stores found for the provided configuration.</p>
      ) : filteredDataStores.length === 0 ? (
        <div className="p-8 text-center space-y-2.5">
          <p className="text-sm text-gray-400">No data stores match your search filter.</p>
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs font-semibold text-white rounded-lg transition-colors"
          >
            Clear Filter
          </button>
        </div>
      ) : (
        <div className="gem-table-container" role="region" aria-label="Data stores table" tabIndex={0}>
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-700/50">
              <tr>
                <th scope="col" className="px-3 xl:px-4 py-3 w-10">
                  <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={onToggleSelectAll}
                      aria-label="Select all data stores"
                      className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600"
                  />
                </th>
                <SortableHeader label="Display Name" sortKey="displayName" />
                <SortableHeader label="Data Store ID" sortKey="name" className="gem-col-xl" />
                <SortableHeader label="Solution Types" sortKey="solutionTypes" className="gem-col-lg" />
                <th scope="col" className="gem-sticky-action-th px-3 xl:px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {filteredDataStores.map((store) => {
                const isDeleting = deletingDataStoreIds.has(store.name);
                const isSelected = selectedDataStores.has(store.name);
                const storeId = store.name.split('/').pop() || '';

                return (
                  <tr key={store.name} className={`${isSelected ? 'bg-blue-900/50 gem-row-selected' : 'hover:bg-gray-700/50'} transition-colors`}>
                    <td className="px-3 xl:px-4 py-3">
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onToggleSelect(store.name)}
                            aria-label={`Select data store ${store.displayName}`}
                            className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600"
                        />
                    </td>
                    <td className="px-3 xl:px-4 py-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onSelectDataStore(store)}
                        className="text-left text-sm font-medium text-white hover:text-blue-400 transition-colors block max-w-[200px] xl:max-w-[280px] truncate"
                        title={store.displayName}
                      >
                        {store.displayName}
                      </button>
                      <div className="gem-hide-xl text-[11px] text-gray-400 font-mono truncate max-w-[200px] mt-0.5" title={storeId}>
                        {storeId}
                      </div>
                    </td>
                    <td className="gem-col-xl px-3 xl:px-4 py-3 whitespace-nowrap text-xs text-gray-400 font-mono max-w-[180px] xl:max-w-[240px] truncate" title={storeId}>{storeId}</td>
                    <td className="gem-col-lg px-3 xl:px-4 py-3 whitespace-nowrap text-xs xl:text-sm text-gray-300">{store.solutionTypes?.join(', ')}</td>
                    <td className="gem-sticky-action-td px-3 xl:px-4 py-3 whitespace-nowrap text-right text-sm font-medium space-x-2.5 xl:space-x-3">
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
                        {onManageIam && (
                          <button
                            onClick={() => onManageIam(store)}
                            className="font-semibold text-amber-400 hover:text-amber-300 disabled:text-gray-500"
                            disabled={isDeleting}
                            title={`Manage direct IAM policy for ${store.displayName}`}
                          >
                            IAM
                          </button>
                        )}
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
      {dataStores.length > 0 && (hasPrevPage || nextPageToken) && (
        <div className="p-4 border-t border-gray-700 bg-gray-800/80 flex justify-between items-center text-sm text-gray-400">
          <div>
            <span>Page {currentPage}</span>
            <span className="ml-2 text-xs text-gray-500">({dataStores.length} stores on this page)</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onPrevPage}
              disabled={!hasPrevPage || isLoading}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded text-xs font-medium transition-colors"
            >
              &larr; Previous
            </button>
            <button
              type="button"
              onClick={onNextPage}
              disabled={!nextPageToken || isLoading}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded text-xs font-medium transition-colors"
            >
              Next &rarr;
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataStoreList;
