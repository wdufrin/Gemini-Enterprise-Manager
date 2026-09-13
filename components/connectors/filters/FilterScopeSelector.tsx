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

interface FilterScopeSelectorProps {
  hasEntities: boolean;
  entitiesCount: number;
  entities: any[];
  scopeMode: 'all' | 'entity';
  setScopeMode: (mode: 'all' | 'entity') => void;
  selectedEntityName: string;
  setSelectedEntityName: (name: string) => void;
  activeFilterType: 'inclusion' | 'exclusion';
  setActiveFilterType: (type: 'inclusion' | 'exclusion') => void;
  totalInclusionCount: number;
  totalExclusionCount: number;
}

export const FilterScopeSelector: React.FC<FilterScopeSelectorProps> = ({
  hasEntities,
  entitiesCount,
  entities,
  scopeMode,
  setScopeMode,
  selectedEntityName,
  setSelectedEntityName,
  activeFilterType,
  setActiveFilterType,
  totalInclusionCount,
  totalExclusionCount,
}) => {
  return (
    <div className="space-y-4">
      {/* Scope selection if multiple entities */}
      {hasEntities && (
        <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-700/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-300">Entity Scope:</span>
            <button
              type="button"
              onClick={() => setScopeMode('all')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                scopeMode === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              All Entities ({entitiesCount})
            </button>
            <button
              type="button"
              onClick={() => setScopeMode('entity')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                scopeMode === 'entity'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              Per-Entity
            </button>
          </div>

          {scopeMode === 'entity' && (
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Select Entity:</span>
              <select
                value={selectedEntityName}
                onChange={(e) => setSelectedEntityName(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-2.5 py-1 text-white text-xs focus:ring-1 focus:ring-blue-500"
              >
                {entities.map((e: any) => (
                  <option key={e.entityName} value={e.entityName}>
                    {e.entityName}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Filter Type Tabs (Inclusion vs Exclusion) */}
      <div className="flex border-b border-gray-700">
        <button
          type="button"
          onClick={() => setActiveFilterType('inclusion')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeFilterType === 'inclusion'
              ? 'border-blue-500 text-blue-400 bg-blue-500/10'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Inclusion Filters ({totalInclusionCount})
        </button>
        <button
          type="button"
          onClick={() => setActiveFilterType('exclusion')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeFilterType === 'exclusion'
              ? 'border-red-500 text-red-400 bg-red-500/10'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
          Exclusion Filters ({totalExclusionCount})
        </button>
      </div>

      {/* Explanation banner */}
      <div className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
        activeFilterType === 'inclusion'
          ? 'bg-blue-950/20 border-blue-900/50 text-blue-300'
          : 'bg-red-950/20 border-red-900/50 text-red-300'
      }`}>
        <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          {activeFilterType === 'inclusion' ? (
            <span>
              <strong>Inclusion Rules:</strong> Only documents, sites, or folders matching these rules will be indexed and searched. If no inclusion rules are specified, all accessible content is indexed by default.
            </span>
          ) : (
            <span>
              <strong>Exclusion Rules:</strong> Any documents, sites, or paths matching these rules will be skipped during ingestion and excluded from search results.
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
