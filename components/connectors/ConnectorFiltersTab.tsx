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
import { Config } from '../../types';
import { useConnectorFilters } from '../../hooks/useConnectorFilters';
import { FilterGuideSection } from './filters/FilterGuideSection';
import { FilterScopeSelector } from './filters/FilterScopeSelector';
import { FilterKeyGroupCard } from './filters/FilterKeyGroupCard';
import { FilterFooterActions } from './filters/FilterFooterActions';

export {
  CONNECTOR_FILTER_DEFINITIONS,
  DEFAULT_DEFINITIONS,
  type FilterKeyDefinition,
} from './filters/filterDefinitions';
export {
  countFilterRules,
  cleanFilterMap,
  areFilterMapsEqual,
  type FilterMap,
  type EntityFilterMap,
} from './filters/filterUtils';

interface ConnectorFiltersTabProps {
  connector: any;
  config: Config;
  onConnectorUpdated?: (updatedConnector: any) => void;
  onRefreshSuccess?: () => void;
}

const ConnectorFiltersTab: React.FC<ConnectorFiltersTabProps> = ({
  connector,
  config,
  onConnectorUpdated,
  onRefreshSuccess,
}) => {
  const {
    dataSource,
    activeDefinitions,
    definitionMap,
    activeFilterType,
    setActiveFilterType,
    customSqlFilter,
    setCustomSqlFilter,
    scopeMode,
    setScopeMode,
    selectedEntityName,
    setSelectedEntityName,
    showGuide,
    setShowGuide,
    editorMode,
    setEditorMode,
    rawJsonText,
    rawJsonError,
    newKeyInput,
    setNewKeyInput,
    newValueInputs,
    setNewValueInputs,
    isSaving,
    saveSuccess,
    setSaveSuccess,
    saveError,
    setSaveError,
    currentFilters,
    hasUnsavedChanges,
    unconfiguredDefinitions,
    totalInclusionCount,
    totalExclusionCount,
    hasEntities,
    handleAddKeyGroup,
    handleDeleteKeyGroup,
    handleAddValueToKey,
    handleRemoveValue,
    handleRawJsonChange,
    handleResetFilters,
    handleSaveFilters,
  } = useConnectorFilters({
    connector,
    config,
    onConnectorUpdated,
    onRefreshSuccess,
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header & Status Banner */}
      <div className="bg-gray-900/70 p-4 rounded-lg border border-gray-700/80 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Connector Filters
            </h3>
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-800 text-gray-300 border border-gray-700">
              {connector?.dataSource || 'Generic'}
            </span>
            {(totalInclusionCount > 0 || totalExclusionCount > 0) ? (
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-green-950/80 text-green-300 border border-green-800">
                {totalInclusionCount + totalExclusionCount} Filter Rules Configured
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-800 text-gray-400 border border-gray-700">
                No Active Filters
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Configure inclusion and exclusion rules (e.g. Sites, Paths, Projects, Repositories) to scope connector crawling and search queries.
          </p>
        </div>

        {/* View Toggle & Guide Button */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowGuide(!showGuide)}
            className={`px-3 py-1 text-xs font-semibold rounded border transition-colors flex items-center gap-1.5 ${
              showGuide
                ? 'bg-blue-900/40 text-blue-300 border-blue-700'
                : 'bg-gray-800 text-gray-400 hover:text-white border-gray-700'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Filter Guide
          </button>
          <div className="flex items-center gap-1 bg-gray-950 p-1 rounded-lg border border-gray-800">
            <button
              type="button"
              onClick={() => setEditorMode('visual')}
              className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
                editorMode === 'visual'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Visual Builder
            </button>
            <button
              type="button"
              onClick={() => setEditorMode('json')}
              className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
                editorMode === 'json'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Raw JSON
            </button>
          </div>
        </div>
      </div>

      {/* Expandable Connector-Specific Filter Reference Guide */}
      {showGuide && (
        <FilterGuideSection
          dataSourceName={connector?.dataSource}
          activeDefinitions={activeDefinitions}
          onClose={() => setShowGuide(false)}
        />
      )}

      {/* Save Success / Error Alerts */}
      {saveSuccess && (
        <div className="bg-green-950/40 border border-green-800/80 text-green-300 p-3.5 rounded-lg flex items-center justify-between animate-fadeIn text-sm">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>Filters updated successfully in Discovery Engine!</span>
          </div>
          <button
            type="button"
            onClick={() => setSaveSuccess(false)}
            className="text-green-400 hover:text-green-200 text-xs font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {saveError && (
        <div className="bg-red-950/40 border border-red-800/80 text-red-300 p-3.5 rounded-lg flex items-center justify-between animate-fadeIn text-sm">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{saveError}</span>
          </div>
          <button
            type="button"
            onClick={() => setSaveError(null)}
            className="text-red-400 hover:text-red-200 text-xs font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Visual Editor Mode */}
      {editorMode === 'visual' ? (
        <div className="space-y-6">
          <FilterScopeSelector
            hasEntities={hasEntities}
            entitiesCount={connector?.entities?.length || 0}
            entities={connector?.entities || []}
            scopeMode={scopeMode}
            setScopeMode={setScopeMode}
            selectedEntityName={selectedEntityName}
            setSelectedEntityName={setSelectedEntityName}
            activeFilterType={activeFilterType}
            setActiveFilterType={setActiveFilterType}
            totalInclusionCount={totalInclusionCount}
            totalExclusionCount={totalExclusionCount}
          />

          <FilterKeyGroupCard
            currentFilters={currentFilters}
            definitionMap={definitionMap}
            activeFilterType={activeFilterType}
            newValueInputs={newValueInputs}
            setNewValueInputs={setNewValueInputs}
            onAddValueToKey={handleAddValueToKey}
            onRemoveValue={handleRemoveValue}
            onDeleteKeyGroup={handleDeleteKeyGroup}
            unconfiguredDefinitions={unconfiguredDefinitions}
            onAddKeyGroup={handleAddKeyGroup}
            newKeyInput={newKeyInput}
            setNewKeyInput={setNewKeyInput}
            dataSource={dataSource}
            customSqlFilter={customSqlFilter}
            setCustomSqlFilter={setCustomSqlFilter}
          />
        </div>
      ) : (
        /* Raw JSON Editor Mode */
        <div className="space-y-3">
          <div className="flex justify-between items-center text-xs text-gray-400">
            <span>Directly edit the JSON representation of inclusion and exclusion filters:</span>
            {rawJsonError && <span className="text-red-400 font-semibold">{rawJsonError}</span>}
          </div>
          <textarea
            rows={12}
            value={rawJsonText}
            onChange={(e) => handleRawJsonChange(e.target.value)}
            className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-xs text-gray-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      )}

      {/* Action Footer */}
      <FilterFooterActions
        hasUnsavedChanges={hasUnsavedChanges}
        isSaving={isSaving}
        disableSave={isSaving || (editorMode === 'json' && !!rawJsonError)}
        onResetFilters={handleResetFilters}
        onSaveFilters={handleSaveFilters}
      />
    </div>
  );
};

export default ConnectorFiltersTab;
