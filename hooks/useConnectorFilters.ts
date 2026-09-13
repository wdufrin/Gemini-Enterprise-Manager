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

import { useState, useEffect, useMemo } from 'react';
import * as api from '../services/apiService';
import { Config } from '../types';
import {
  CONNECTOR_FILTER_DEFINITIONS,
  DEFAULT_DEFINITIONS,
  FilterKeyDefinition,
} from '../components/connectors/filters/filterDefinitions';
import {
  FilterMap,
  EntityFilterMap,
  cleanFilterMap,
  countFilterRules,
  areFilterMapsEqual,
} from '../components/connectors/filters/filterUtils';

interface UseConnectorFiltersProps {
  connector: any;
  config: Config;
  onConnectorUpdated?: (updatedConnector: any) => void;
  onRefreshSuccess?: () => void;
}

export function useConnectorFilters({
  connector,
  config,
  onConnectorUpdated,
  onRefreshSuccess,
}: UseConnectorFiltersProps) {
  const dataSource = connector?.dataSource?.toLowerCase() || '';

  // Get available definitions for current connector type
  const activeDefinitions = useMemo<FilterKeyDefinition[]>(() => {
    return CONNECTOR_FILTER_DEFINITIONS[dataSource] || DEFAULT_DEFINITIONS;
  }, [dataSource]);

  // Helper map from key name to definition
  const definitionMap = useMemo<Record<string, FilterKeyDefinition>>(() => {
    const map: Record<string, FilterKeyDefinition> = {};
    activeDefinitions.forEach((def) => {
      map[def.key.toLowerCase()] = def;
    });
    DEFAULT_DEFINITIONS.forEach((def) => {
      if (!map[def.key.toLowerCase()]) {
        map[def.key.toLowerCase()] = def;
      }
    });
    return map;
  }, [activeDefinitions]);

  // Extract initial filters from connector
  const initialInclusionFilters = useMemo<FilterMap>(() => {
    if (!connector) return {};
    if (connector.params?.structured_search_filter) {
      return cleanFilterMap(connector.params.structured_search_filter);
    }
    if (connector.params?.admin_filter) {
      return cleanFilterMap(connector.params.admin_filter);
    }
    if (Array.isArray(connector.entities) && connector.entities.length > 0) {
      const merged: FilterMap = {};
      connector.entities.forEach((entity: any) => {
        const inc = entity.params?.inclusion_filters;
        if (inc && typeof inc === 'object') {
          Object.entries(inc).forEach(([k, vals]: [string, any]) => {
            if (Array.isArray(vals) && vals.length > 0) {
              merged[k] = Array.from(new Set([...(merged[k] || []), ...vals]));
            }
          });
        }
      });
      return cleanFilterMap(merged);
    }
    return {};
  }, [connector]);

  const initialExclusionFilters = useMemo<FilterMap>(() => {
    if (!connector) return {};
    if (connector.params?.structured_exclusion_search_filter) {
      return cleanFilterMap(connector.params.structured_exclusion_search_filter);
    }
    if (connector.params?.admin_exclusion_filter) {
      return cleanFilterMap(connector.params.admin_exclusion_filter);
    }
    if (Array.isArray(connector.entities) && connector.entities.length > 0) {
      const merged: FilterMap = {};
      connector.entities.forEach((entity: any) => {
        const exc = entity.params?.exclusion_filters;
        if (exc && typeof exc === 'object') {
          Object.entries(exc).forEach(([k, vals]: [string, any]) => {
            if (Array.isArray(vals) && vals.length > 0) {
              merged[k] = Array.from(new Set([...(merged[k] || []), ...vals]));
            }
          });
        }
      });
      return cleanFilterMap(merged);
    }
    return {};
  }, [connector]);

  const initialCustomSqlFilter = useMemo<string>(() => {
    return connector?.params?.global_custom_sql_filter || '';
  }, [connector]);

  const initialPerEntityFilters = useMemo<Record<string, EntityFilterMap>>(() => {
    if (!connector || !Array.isArray(connector.entities)) return {};
    const result: Record<string, EntityFilterMap> = {};
    connector.entities.forEach((e: any) => {
      const name = e.entityName || 'default';
      result[name] = {
        inclusion: cleanFilterMap(e.params?.inclusion_filters || {}),
        exclusion: cleanFilterMap(e.params?.exclusion_filters || {}),
      };
    });
    return result;
  }, [connector]);

  // Form State
  const [activeFilterType, setActiveFilterType] = useState<'inclusion' | 'exclusion'>('inclusion');
  const [inclusionFilters, setInclusionFilters] = useState<FilterMap>(initialInclusionFilters);
  const [exclusionFilters, setExclusionFilters] = useState<FilterMap>(initialExclusionFilters);
  const [customSqlFilter, setCustomSqlFilter] = useState<string>(initialCustomSqlFilter);
  const [perEntityFilters, setPerEntityFilters] = useState<Record<string, EntityFilterMap>>(initialPerEntityFilters);
  const [scopeMode, setScopeMode] = useState<'all' | 'entity'>('all');
  const [selectedEntityName, setSelectedEntityName] = useState<string>(() => {
    return connector?.entities?.[0]?.entityName || '';
  });

  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [editorMode, setEditorMode] = useState<'visual' | 'json'>('visual');
  const [rawJsonText, setRawJsonText] = useState<string>('');
  const [rawJsonError, setRawJsonError] = useState<string | null>(null);

  // New key / value inputs
  const [newKeyInput, setNewKeyInput] = useState<string>('');
  const [newValueInputs, setNewValueInputs] = useState<Record<string, string>>({});

  // Submission State
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reset state on connector change
  useEffect(() => {
    setInclusionFilters(initialInclusionFilters);
    setExclusionFilters(initialExclusionFilters);
    setCustomSqlFilter(initialCustomSqlFilter);
    setPerEntityFilters(initialPerEntityFilters);
    setSaveSuccess(false);
    setSaveError(null);
    if (connector?.entities?.[0]?.entityName) {
      setSelectedEntityName(connector.entities[0].entityName);
    }
  }, [connector, initialInclusionFilters, initialExclusionFilters, initialCustomSqlFilter, initialPerEntityFilters]);

  // Current active filter map depending on scope
  const currentFilters = useMemo<FilterMap>(() => {
    if (scopeMode === 'entity' && selectedEntityName && perEntityFilters[selectedEntityName]) {
      return activeFilterType === 'inclusion'
        ? perEntityFilters[selectedEntityName].inclusion
        : perEntityFilters[selectedEntityName].exclusion;
    }
    return activeFilterType === 'inclusion' ? inclusionFilters : exclusionFilters;
  }, [scopeMode, selectedEntityName, perEntityFilters, activeFilterType, inclusionFilters, exclusionFilters]);

  // Sync raw JSON text when switching to JSON mode
  useEffect(() => {
    if (editorMode === 'json') {
      const currentJson = {
        inclusion_filters: cleanFilterMap(inclusionFilters),
        exclusion_filters: cleanFilterMap(exclusionFilters),
        ...(customSqlFilter ? { global_custom_sql_filter: customSqlFilter } : {}),
      };
      setRawJsonText(JSON.stringify(currentJson, null, 2));
      setRawJsonError(null);
    }
  }, [editorMode, inclusionFilters, exclusionFilters, customSqlFilter]);

  // Check if there are unsaved changes
  const hasUnsavedChanges = useMemo<boolean>(() => {
    const incChanged = !areFilterMapsEqual(inclusionFilters, initialInclusionFilters);
    const excChanged = !areFilterMapsEqual(exclusionFilters, initialExclusionFilters);
    const sqlChanged = customSqlFilter.trim() !== initialCustomSqlFilter.trim();
    return incChanged || excChanged || sqlChanged;
  }, [inclusionFilters, exclusionFilters, customSqlFilter, initialInclusionFilters, initialExclusionFilters, initialCustomSqlFilter]);

  // Unconfigured suggested key definitions
  const unconfiguredDefinitions = useMemo<FilterKeyDefinition[]>(() => {
    const currentKeys = Object.keys(currentFilters);
    return activeDefinitions.filter(
      (def) => !currentKeys.some((ck) => ck.toLowerCase() === def.key.toLowerCase())
    );
  }, [activeDefinitions, currentFilters]);

  // Handler to update filter map
  const updateCurrentFilterMap = (newMap: FilterMap) => {
    setSaveSuccess(false);
    setSaveError(null);
    if (scopeMode === 'entity' && selectedEntityName) {
      setPerEntityFilters((prev) => ({
        ...prev,
        [selectedEntityName]: {
          ...prev[selectedEntityName],
          [activeFilterType]: newMap,
        },
      }));
    } else {
      if (activeFilterType === 'inclusion') {
        setInclusionFilters(newMap);
      } else {
        setExclusionFilters(newMap);
      }
    }
  };

  // Add a new key group
  const handleAddKeyGroup = (keyName: string) => {
    const trimmed = keyName.trim();
    if (!trimmed) return;
    if (currentFilters[trimmed]) return;

    const next = { ...currentFilters, [trimmed]: [] };
    updateCurrentFilterMap(next);
    setNewKeyInput('');
  };

  // Delete an entire key group
  const handleDeleteKeyGroup = (key: string) => {
    const next = { ...currentFilters };
    delete next[key];
    updateCurrentFilterMap(next);
  };

  // Add a value to a key group
  const handleAddValueToKey = (key: string, valueToAdd?: string) => {
    const val = (valueToAdd !== undefined ? valueToAdd : newValueInputs[key] || '').trim();
    if (!val) return;

    const parts = val
      .split(/[\n,]+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (parts.length === 0) return;

    const existing = currentFilters[key] || [];
    const merged = Array.from(new Set([...existing, ...parts]));
    const next = { ...currentFilters, [key]: merged };
    updateCurrentFilterMap(next);

    setNewValueInputs((prev) => ({ ...prev, [key]: '' }));
  };

  // Remove a specific value from a key group
  const handleRemoveValue = (key: string, valueIndex: number) => {
    const existing = currentFilters[key] || [];
    const nextList = existing.filter((_, idx) => idx !== valueIndex);
    const next = { ...currentFilters, [key]: nextList };
    updateCurrentFilterMap(next);
  };

  // Parse Raw JSON edits
  const handleRawJsonChange = (text: string) => {
    setRawJsonText(text);
    try {
      const parsed = JSON.parse(text);
      setRawJsonError(null);
      if (parsed.inclusion_filters && typeof parsed.inclusion_filters === 'object') {
        setInclusionFilters(cleanFilterMap(parsed.inclusion_filters));
      }
      if (parsed.exclusion_filters && typeof parsed.exclusion_filters === 'object') {
        setExclusionFilters(cleanFilterMap(parsed.exclusion_filters));
      }
      if (parsed.global_custom_sql_filter !== undefined) {
        setCustomSqlFilter(String(parsed.global_custom_sql_filter));
      }
    } catch (e: any) {
      setRawJsonError(`Invalid JSON: ${e.message}`);
    }
  };

  // Reset all filters to initial state
  const handleResetFilters = () => {
    setInclusionFilters(initialInclusionFilters);
    setExclusionFilters(initialExclusionFilters);
    setCustomSqlFilter(initialCustomSqlFilter);
    setPerEntityFilters(initialPerEntityFilters);
    setSaveSuccess(false);
    setSaveError(null);
  };

  // Save filters to Discovery Engine API
  const handleSaveFilters = async () => {
    if (!connector || !connector.name) {
      setSaveError('No valid connector configuration found.');
      return;
    }

    if (editorMode === 'json' && rawJsonError) {
      setSaveError('Please fix JSON syntax errors before saving.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const parts = connector.name.split('/');
      const projId = parts[parts.indexOf('projects') + 1] || config.projectId;
      const loc = parts[parts.indexOf('locations') + 1] || config.appLocation;
      const collId = parts[parts.indexOf('collections') + 1] || config.collectionId;

      const cleanInc = cleanFilterMap(inclusionFilters);
      const cleanExc = cleanFilterMap(exclusionFilters);

      const updateMaskSet = new Set<string>();
      const payload: any = {};

      if (Array.isArray(connector.entities) && connector.entities.length > 0) {
        const updatedEntities = connector.entities.map((entity: any) => {
          const entityName = entity.entityName || 'default';
          const entityParams = entity.params ? { ...entity.params } : {};

          if (scopeMode === 'entity' && perEntityFilters[entityName]) {
            entityParams.inclusion_filters = cleanFilterMap(perEntityFilters[entityName].inclusion);
            entityParams.exclusion_filters = cleanFilterMap(perEntityFilters[entityName].exclusion);
          } else {
            entityParams.inclusion_filters = cleanInc;
            entityParams.exclusion_filters = cleanExc;
          }

          return {
            ...entity,
            params: entityParams,
          };
        });

        payload.entities = updatedEntities;
        updateMaskSet.add('entities');
      }

      const topLevelFilterSources = [
        'sharepoint',
        'onedrive',
        'ms-onedrive',
        'box',
        'salesforce',
        'servicenow',
        'azure_active_directory',
        'entraid',
      ];

      if (topLevelFilterSources.includes(dataSource)) {
        payload.params = {
          structured_search_filter: cleanInc,
          structured_exclusion_search_filter: cleanExc,
        };

        if (customSqlFilter.trim()) {
          payload.params.global_custom_sql_filter = customSqlFilter.trim();
        }

        updateMaskSet.add('params');
      }

      if (updateMaskSet.size === 0) {
        updateMaskSet.add('entities');
      }

      const updateMask = Array.from(updateMaskSet);

      const response = await api.updateDataConnector(
        connector.name,
        payload,
        updateMask,
        { ...config, projectId: projId, appLocation: loc, collectionId: collId }
      );

      setSaveSuccess(true);
      if (onConnectorUpdated) {
        onConnectorUpdated(response);
      }
      if (onRefreshSuccess) {
        onRefreshSuccess();
      }
    } catch (err: any) {
      console.error('Failed to update connector filters:', err);
      setSaveError(err.message || 'Failed to update connector filters.');
    } finally {
      setIsSaving(false);
    }
  };

  const totalInclusionCount = countFilterRules(inclusionFilters);
  const totalExclusionCount = countFilterRules(exclusionFilters);
  const hasEntities = Array.isArray(connector?.entities) && connector.entities.length > 1;

  return {
    dataSource,
    activeDefinitions,
    definitionMap,
    activeFilterType,
    setActiveFilterType,
    inclusionFilters,
    exclusionFilters,
    customSqlFilter,
    setCustomSqlFilter,
    perEntityFilters,
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
  };
}
