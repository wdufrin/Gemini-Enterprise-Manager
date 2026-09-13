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
import { FilterKeyDefinition } from './filterDefinitions';
import { FilterMap } from './filterUtils';

interface FilterKeyGroupCardProps {
  currentFilters: FilterMap;
  definitionMap: Record<string, FilterKeyDefinition>;
  activeFilterType: 'inclusion' | 'exclusion';
  newValueInputs: Record<string, string>;
  setNewValueInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onAddValueToKey: (key: string, valueToAdd?: string) => void;
  onRemoveValue: (key: string, valueIndex: number) => void;
  onDeleteKeyGroup: (key: string) => void;
  unconfiguredDefinitions: FilterKeyDefinition[];
  onAddKeyGroup: (keyName: string) => void;
  newKeyInput: string;
  setNewKeyInput: (val: string) => void;
  dataSource: string;
  customSqlFilter: string;
  setCustomSqlFilter: (val: string) => void;
}

export const FilterKeyGroupCard: React.FC<FilterKeyGroupCardProps> = ({
  currentFilters,
  definitionMap,
  activeFilterType,
  newValueInputs,
  setNewValueInputs,
  onAddValueToKey,
  onRemoveValue,
  onDeleteKeyGroup,
  unconfiguredDefinitions,
  onAddKeyGroup,
  newKeyInput,
  setNewKeyInput,
  dataSource,
  customSqlFilter,
  setCustomSqlFilter,
}) => {
  return (
    <div className="space-y-4">
      {/* Active Filter Key Groups */}
      <div className="space-y-4">
        {Object.keys(currentFilters).length === 0 ? (
          <div className="bg-gray-950/40 border border-dashed border-gray-700 rounded-lg p-6 text-center space-y-3">
            <div className="w-10 h-10 mx-auto rounded-full bg-gray-800/80 flex items-center justify-center text-gray-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-200">
                No {activeFilterType} filters configured
              </h4>
              <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
                Add a filter category below (e.g. Site, Path, Project) to restrict content.
              </p>
            </div>
            {unconfiguredDefinitions.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <span className="text-xs text-gray-400 font-medium mr-1">Quick Add:</span>
                {unconfiguredDefinitions.slice(0, 5).map((def) => (
                  <button
                    key={def.key}
                    type="button"
                    onClick={() => onAddKeyGroup(def.key)}
                    className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-blue-400 border border-gray-700 rounded-md text-xs font-semibold transition-colors flex items-center gap-1"
                    title={def.description}
                  >
                    <span>+ {def.key}</span>
                    <span className="text-[10px] text-gray-400 font-normal">({def.label})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          Object.entries(currentFilters).map(([key, values]) => {
            const def = definitionMap[key.toLowerCase()];
            const placeholderText = def
              ? `Add ${key} value (e.g. ${def.placeholder})...`
              : `Add ${key} value (e.g. URL, path, ID)...`;

            return (
              <div
                key={key}
                className="bg-gray-950/60 rounded-lg p-4 border border-gray-800 space-y-3 shadow-inner"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-800/80 pb-2 gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold font-mono uppercase tracking-wider text-gray-200">
                      {key}
                    </span>
                    {def && (
                      <span className="text-[11px] text-gray-400 font-medium">
                        &bull; {def.label}
                      </span>
                    )}
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        activeFilterType === 'inclusion'
                          ? 'bg-blue-950 text-blue-400 border border-blue-900'
                          : 'bg-red-950 text-red-400 border border-red-900'
                      }`}
                    >
                      {values.length} {values.length === 1 ? 'rule' : 'rules'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteKeyGroup(key)}
                    className="text-xs text-red-400 hover:text-red-300 font-medium flex items-center gap-1 transition-colors self-start sm:self-auto"
                    title={`Remove all ${key} filters`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete Group
                  </button>
                </div>

                {/* Key description if available */}
                {def && (
                  <p className="text-[11px] text-gray-400 italic">
                    {def.description} &bull; Example: <span className="text-gray-300 font-mono">{def.example}</span>
                  </p>
                )}

                {/* Values List */}
                {values.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {values.map((val, idx) => (
                      <div
                        key={idx}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-mono border transition-all ${
                          activeFilterType === 'inclusion'
                            ? 'bg-blue-950/80 text-blue-300 border-blue-800/80 shadow-sm'
                            : 'bg-red-950/80 text-red-300 border-red-800/80 shadow-sm'
                        }`}
                      >
                        <span className="truncate max-w-xs md:max-w-md select-all" title={val}>
                          {val}
                        </span>
                        <button
                          type="button"
                          onClick={() => onRemoveValue(key, idx)}
                          className="text-gray-400 hover:text-white ml-1 p-0.5 rounded hover:bg-white/10"
                          title="Remove value"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 italic">No values added yet for {key}.</p>
                )}

                {/* Add Value Input Form */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    onAddValueToKey(key);
                  }}
                  className="flex items-center gap-2 pt-1"
                >
                  <input
                    type="text"
                    placeholder={placeholderText}
                    value={newValueInputs[key] || ''}
                    onChange={(e) =>
                      setNewValueInputs((prev) => ({
                        ...prev,
                        [key]: e.target.value,
                      }))
                    }
                    className="flex-1 bg-gray-900 border border-gray-700 rounded-md px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                  <button
                    type="submit"
                    disabled={!(newValueInputs[key] || '').trim()}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                      activeFilterType === 'inclusion'
                        ? 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-800 disabled:text-gray-600'
                        : 'bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-800 disabled:text-gray-600'
                    }`}
                  >
                    + Add
                  </button>
                </form>
              </div>
            );
          })
        )}
      </div>

      {/* Add Category Section */}
      <div className="bg-gray-900/40 p-3.5 rounded-lg border border-gray-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-gray-300 mr-1">Add Filter Category:</span>
          {unconfiguredDefinitions.map((def) => (
            <button
              key={def.key}
              type="button"
              onClick={() => onAddKeyGroup(def.key)}
              className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-blue-400 border border-gray-700 rounded text-xs font-medium transition-colors flex items-center gap-1"
              title={def.description}
            >
              <span>+ {def.key}</span>
              <span className="text-[10px] text-gray-400 font-normal">({def.label})</span>
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onAddKeyGroup(newKeyInput);
          }}
          className="flex items-center gap-2 w-full sm:w-auto"
        >
          <input
            type="text"
            placeholder="Custom category name..."
            value={newKeyInput}
            onChange={(e) => setNewKeyInput(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-2.5 py-1 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={!newKeyInput.trim()}
            className="px-3 py-1 bg-gray-700 text-white text-xs font-semibold rounded hover:bg-gray-600 disabled:opacity-50 transition-colors shrink-0"
          >
            Add Category
          </button>
        </form>
      </div>

      {/* Custom SQL filter for EntraID / Azure AD */}
      {(dataSource === 'azure_active_directory' || dataSource === 'entraid') && (
        <div className="bg-gray-950/60 p-4 rounded-lg border border-gray-800 space-y-2">
          <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider">
            Global Custom SQL / OData Filter (Azure AD / Entra ID)
          </label>
          <textarea
            rows={2}
            value={customSqlFilter}
            onChange={(e) => setCustomSqlFilter(e.target.value)}
            placeholder="e.g. accountEnabled eq true and department eq 'Engineering'"
            className="w-full bg-gray-900 border border-gray-700 rounded-md p-2.5 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="text-[11px] text-gray-500">
            Optional OData / SQL query filter applied when syncing user and group profiles from Microsoft Entra ID.
          </p>
        </div>
      )}
    </div>
  );
};
