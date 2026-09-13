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

import { useState, useEffect, useMemo, useCallback } from 'react';
import { AppEngine, Assistant, Config } from '../types';
import * as api from '../services/apiService';

export interface AssistantRowData {
  engine: AppEngine;
  assistant: Assistant | null;
  error?: string;
}

export type SortKey =
  | 'displayName'
  | 'engineId'
  | 'solutionType'
  | 'webGrounding'
  | 'instructions'
  | 'policy'
  | 'vertexAgents';
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}

export const determineAppType = (engine: AppEngine): string => {
  if (engine.solutionType === 'SOLUTION_TYPE_CHAT') {
    return 'Chat';
  }

  if (engine.solutionType === 'SOLUTION_TYPE_SEARCH') {
    if (engine.appType === 'APP_TYPE_INTRANET') {
      return 'Gemini Enterprise';
    }
    return 'Search';
  }

  if (engine.solutionType === 'SOLUTION_TYPE_RECOMMENDATION') {
    return 'Recommendation';
  }

  if (engine.solutionType === 'SOLUTION_TYPE_GENERATIVE_CHAT') {
    return 'Gemini Enterprise';
  }

  return (
    engine.solutionType
      ?.replace('SOLUTION_TYPE_', '')
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase()) || 'Unknown'
  );
};

export function useAssistantList(projectNumber: string, baseApiConfig: Config) {
  const [allEngines, setAllEngines] = useState<AppEngine[]>([]);
  const [rows, setRows] = useState<AssistantRowData[]>([]);
  const [isListLoading, setIsListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: 'displayName',
    direction: 'asc',
  });

  const handleSort = (key: SortKey) => {
    setSortConfig((current) => ({
      key,
      direction:
        current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const getSortValue = (
    row: AssistantRowData,
    key: SortKey,
  ): string | number | boolean => {
    if (!row.assistant) {
      if (key === 'displayName') return row.engine.displayName;
      if (key === 'engineId') return row.engine.name.split('/').pop() || '';
      if (key === 'solutionType') return determineAppType(row.engine);
      return '';
    }

    switch (key) {
      case 'displayName':
        return row.engine.displayName;
      case 'engineId':
        return row.engine.name.split('/').pop() || '';
      case 'solutionType':
        return determineAppType(row.engine);
      case 'webGrounding':
        return (
          row.assistant.webGroundingType ===
            'WEB_GROUNDING_TYPE_GOOGLE_SEARCH' ||
          row.assistant.webGroundingType ===
            'WEB_GROUNDING_TYPE_ENTERPRISE_WEB_SEARCH'
        );
      case 'instructions':
        return !!(
          row.assistant.generationConfig?.systemInstruction
            ?.additionalSystemInstruction ||
          row.assistant.styleAndFormattingInstructions
        );
      case 'policy':
        return !!(
          row.assistant.customerPolicy &&
          Object.keys(row.assistant.customerPolicy).length > 0
        );
      case 'vertexAgents':
        return row.assistant.vertexAiAgentConfigs?.length || 0;
      default:
        return '';
    }
  };

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const aVal = getSortValue(a, sortConfig.key);
      const bVal = getSortValue(b, sortConfig.key);

      if (aVal === bVal) return 0;

      if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
        return sortConfig.direction === 'asc'
          ? aVal === bVal
            ? 0
            : aVal
              ? 1
              : -1
          : aVal === bVal
            ? 0
            : aVal
              ? -1
              : 1;
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [rows, sortConfig]);

  const fetchEngines = useCallback(async () => {
    if (!projectNumber) {
      setListError('Project Number is required.');
      return;
    }
    setIsListLoading(true);
    setListError(null);
    setRows([]);
    setAllEngines([]);

    try {
      const enginesRes = await api.listResources('engines', {
        ...baseApiConfig,
        appId: '',
      });
      const engines: AppEngine[] = enginesRes.engines || [];
      setAllEngines(engines);
    } catch (err: any) {
      setListError(err.message || 'Failed to fetch engines list.');
    } finally {
      setIsListLoading(false);
    }
  }, [baseApiConfig, projectNumber]);

  useEffect(() => {
    fetchEngines();
  }, [fetchEngines]);

  const filteredEngines = useMemo(() => {
    if (!searchQuery) return allEngines;
    const lowerQ = searchQuery.toLowerCase();
    return allEngines.filter(
      (e) =>
        e.displayName.toLowerCase().includes(lowerQ) ||
        e.name.split('/').pop()?.toLowerCase().includes(lowerQ),
    );
  }, [allEngines, searchQuery]);

  const paginatedEngines = useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return filteredEngines.slice(start, end);
  }, [filteredEngines, page]);

  useEffect(() => {
    const fetchPageDetails = async () => {
      if (paginatedEngines.length === 0) {
        setRows([]);
        return;
      }

      setIsListLoading(true);

      const rowPromises = paginatedEngines.map(async (engine) => {
        const appId = engine.name.split('/').pop()!;
        const assistantConfig = {
          ...baseApiConfig,
          appId,
          suppressErrorLog: true,
        };
        const assistantName = `projects/${baseApiConfig.projectId}/locations/${baseApiConfig.appLocation}/collections/default_collection/engines/${appId}/assistants/default_assistant`;

        try {
          const assistant = await api.getAssistant(
            assistantName,
            assistantConfig,
          );
          return { engine, assistant };
        } catch (e: any) {
          try {
            const listRes = await api.listAssistants(assistantConfig, 1);
            if (listRes.assistants && listRes.assistants.length > 0) {
              return { engine, assistant: listRes.assistants[0] };
            }
          } catch {
            // Fallback attempt failed, preserve primary error
          }
          return { engine, assistant: null, error: e.message };
        }
      });

      const results = await Promise.all(rowPromises);
      setRows(results);
      setIsListLoading(false);
    };

    fetchPageDetails();
  }, [paginatedEngines, baseApiConfig]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, baseApiConfig.appLocation]);

  return {
    allEngines,
    rows,
    setRows,
    sortedRows,
    isListLoading,
    listError,
    searchQuery,
    setSearchQuery,
    page,
    setPage,
    pageSize,
    filteredEngines,
    sortConfig,
    handleSort,
    fetchEngines,
  };
}
