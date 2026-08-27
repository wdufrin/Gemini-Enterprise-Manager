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

import React, { useState, useEffect, useMemo } from 'react';
import * as api from '../../services/apiService';
import { Config } from '../../types';

interface ConnectorFiltersTabProps {
  connector: any;
  config: Config;
  onConnectorUpdated?: (updatedConnector: any) => void;
  onRefreshSuccess?: () => void;
}

type FilterMap = Record<string, string[]>;

interface EntityFilterMap {
  inclusion: FilterMap;
  exclusion: FilterMap;
}

export interface FilterKeyDefinition {
  key: string;
  label: string;
  placeholder: string;
  description: string;
  example: string;
}

export const CONNECTOR_FILTER_DEFINITIONS: Record<string, FilterKeyDefinition[]> = {
  sharepoint: [
    {
      key: 'Path',
      label: 'Site / Folder Path (URL)',
      placeholder: 'https://tenant.sharepoint.com/sites/HR/*',
      description: 'Matches site or document library URL paths with wildcards (*)',
      example: 'https://tenant.sharepoint.com/sites/Finance/*',
    },
    {
      key: 'Site',
      label: 'Site Collection URL',
      placeholder: 'https://tenant.sharepoint.com/sites/Engineering',
      description: 'Restricts crawling to specific SharePoint site collections',
      example: 'https://tenant.sharepoint.com/sites/Engineering',
    },
    {
      key: 'Folder',
      label: 'Folder Path',
      placeholder: '/sites/Engineering/Shared Documents/2026',
      description: 'Restricts indexing to specific folder subdirectories',
      example: '/Shared Documents/General',
    },
    {
      key: 'InformationProtectionLabelId',
      label: 'MIP Sensitivity Label GUID',
      placeholder: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      description: 'Microsoft Information Protection (MIP) sensitivity label GUID for document exclusion',
      example: '9c5f89e2-6bfb-4876-9c42-0f0bf26d3663',
    },
    {
      key: 'FileType',
      label: 'File Extensions',
      placeholder: 'pdf, docx, pptx, xlsx',
      description: 'File extensions to include or exclude',
      example: 'pdf, docx',
    },
  ],
  onedrive: [
    {
      key: 'Path',
      label: 'OneDrive Folder / Drive Path',
      placeholder: 'https://tenant-my.sharepoint.com/personal/user_tenant_com/*',
      description: 'Path URL to restrict indexing within personal or shared OneDrive drives',
      example: 'https://tenant-my.sharepoint.com/personal/user_tenant_com/*',
    },
    {
      key: 'User',
      label: 'User Principal Name (Email)',
      placeholder: 'alice@company.com, bob@company.com',
      description: 'User email addresses whose drives should be synced or excluded',
      example: 'ceo@company.com',
    },
    {
      key: 'Folder',
      label: 'Folder Path',
      placeholder: '/Documents/Work',
      description: 'Folder path within OneDrive to scope crawling',
      example: '/Documents/Projects',
    },
    {
      key: 'FileType',
      label: 'File Extensions',
      placeholder: 'pdf, docx, pptx',
      description: 'File extensions to filter',
      example: 'pdf, docx',
    },
  ],
  jira: [
    {
      key: 'Project',
      label: 'Jira Project Key',
      placeholder: 'ENG, PROD, MOBILE, IT',
      description: 'Jira project keys to crawl or exclude',
      example: 'ENG, PROD',
    },
    {
      key: 'IssueType',
      label: 'Issue Type',
      placeholder: 'Bug, Story, Task, Epic',
      description: 'Jira issue types to include or exclude',
      example: 'Bug, Task',
    },
    {
      key: 'Status',
      label: 'Workflow Status',
      placeholder: 'Done, Closed, In Progress',
      description: 'Workflow status of Jira issues',
      example: 'Done, Closed',
    },
    {
      key: 'Site',
      label: 'Jira Cloud Site URL',
      placeholder: 'https://yourcompany.atlassian.net',
      description: 'Atlassian Cloud tenant URL',
      example: 'https://company.atlassian.net',
    },
  ],
  confluence: [
    {
      key: 'Space',
      label: 'Space Key (spaceKey)',
      placeholder: 'ENG, DOCS, PRODUCT, KB',
      description: 'Confluence space keys to include or exclude',
      example: 'ENG, PRODUCT',
    },
    {
      key: 'Ancestor',
      label: 'Ancestor Page ID',
      placeholder: '123456789',
      description: 'Confluence Page ID to scope crawling to its subpage hierarchy',
      example: '1048576',
    },
    {
      key: 'Label',
      label: 'Page Label / Tag',
      placeholder: 'published, internal, archived',
      description: 'Confluence labels attached to pages',
      example: 'gemini-search',
    },
    {
      key: 'Site',
      label: 'Confluence Site URL',
      placeholder: 'https://yourcompany.atlassian.net/wiki',
      description: 'Atlassian Cloud Confluence site URL',
      example: 'https://company.atlassian.net/wiki',
    },
  ],
  teams: [
    {
      key: 'Team',
      label: 'Team Name / ID',
      placeholder: 'Engineering Team, Marketing',
      description: 'Microsoft Teams names or group IDs to sync',
      example: 'Product Team',
    },
    {
      key: 'Channel',
      label: 'Channel Name',
      placeholder: 'general, announcements, dev',
      description: 'Teams channel names to filter',
      example: 'General',
    },
    {
      key: 'User',
      label: 'User Email',
      placeholder: 'user@company.com',
      description: 'User principal name or email',
      example: 'alice@company.com',
    },
  ],
  outlook: [
    {
      key: 'Folder',
      label: 'Mail Folder',
      placeholder: 'Inbox, Archive, Sent Items',
      description: 'Mailbox folders to index or exclude',
      example: 'Inbox, Archive',
    },
    {
      key: 'Sender',
      label: 'Sender Email / Domain',
      placeholder: 'alerts@service.com, @external.com',
      description: 'Filter emails by sender address or domain',
      example: '@company.com',
    },
    {
      key: 'Domain',
      label: 'Email Domain',
      placeholder: 'company.com',
      description: 'Filter emails by corporate domain',
      example: 'company.com',
    },
  ],
  azure_active_directory: [
    {
      key: 'Department',
      label: 'Department Name',
      placeholder: 'Engineering, Sales, HR, Legal',
      description: 'Directory department attribute filter',
      example: 'Engineering, Product',
    },
    {
      key: 'Company',
      label: 'Company Name',
      placeholder: 'Acme Corp, Subsidiary LLC',
      description: 'Company organization name in Entra ID',
      example: 'Acme Corp',
    },
    {
      key: 'City',
      label: 'Office City',
      placeholder: 'New York, London, Tokyo',
      description: 'Physical office city filter',
      example: 'New York, Seattle',
    },
    {
      key: 'Country',
      label: 'Country / Region',
      placeholder: 'US, UK, JP, Germany',
      description: 'Country or region attribute',
      example: 'US, CA',
    },
    {
      key: 'JobTitle',
      label: 'Job Title',
      placeholder: 'Software Engineer, Director, VP',
      description: 'Job title filter for user directory sync',
      example: 'Software Engineer',
    },
  ],
  entraid: [
    {
      key: 'Department',
      label: 'Department Name',
      placeholder: 'Engineering, Sales, HR, Legal',
      description: 'Directory department attribute filter',
      example: 'Engineering, Product',
    },
    {
      key: 'Company',
      label: 'Company Name',
      placeholder: 'Acme Corp, Subsidiary LLC',
      description: 'Company organization name in Entra ID',
      example: 'Acme Corp',
    },
    {
      key: 'City',
      label: 'Office City',
      placeholder: 'New York, London, Tokyo',
      description: 'Physical office city filter',
      example: 'New York, Seattle',
    },
    {
      key: 'Country',
      label: 'Country / Region',
      placeholder: 'US, UK, JP, Germany',
      description: 'Country or region attribute',
      example: 'US, CA',
    },
    {
      key: 'JobTitle',
      label: 'Job Title',
      placeholder: 'Software Engineer, Director, VP',
      description: 'Job title filter for user directory sync',
      example: 'Software Engineer',
    },
  ],
  servicenow: [
    {
      key: 'Table',
      label: 'ServiceNow Table Name',
      placeholder: 'kb_knowledge, incident, sc_cat_item',
      description: 'ServiceNow database table to index',
      example: 'kb_knowledge',
    },
    {
      key: 'Category',
      label: 'Knowledge Category',
      placeholder: 'IT Support, HR Benefits, Policies',
      description: 'Category name or sys_id',
      example: 'IT Support',
    },
    {
      key: 'Domain',
      label: 'Domain / Instance',
      placeholder: 'TOP, default',
      description: 'Domain-separated instance domain filter',
      example: 'TOP',
    },
  ],
  salesforce: [
    {
      key: 'Object',
      label: 'Salesforce Object',
      placeholder: 'Account, Contact, Case, Opportunity, Knowledge__kav',
      description: 'Standard or Custom Salesforce sObject API name',
      example: 'Knowledge__kav, Case',
    },
    {
      key: 'RecordType',
      label: 'Record Type Name / ID',
      placeholder: 'Customer_Support, Internal_Doc',
      description: 'Salesforce RecordType filter',
      example: 'Customer_Support',
    },
  ],
  github: [
    {
      key: 'Repository',
      label: 'Repository (org/repo)',
      placeholder: 'my-org/backend-service, my-org/docs',
      description: 'GitHub repository full path to index',
      example: 'google/gemini-enterprise',
    },
    {
      key: 'Org',
      label: 'Organization',
      placeholder: 'my-org, partner-org',
      description: 'GitHub organization account name',
      example: 'my-org',
    },
    {
      key: 'Branch',
      label: 'Branch Name',
      placeholder: 'main, master, release/*',
      description: 'Branch name or pattern to crawl',
      example: 'main',
    },
  ],
  box: [
    {
      key: 'Folder',
      label: 'Folder Name / ID',
      placeholder: '0, 123456789, /Corporate/Policies',
      description: 'Box folder ID (0 is root) or folder path',
      example: '0',
    },
    {
      key: 'Path',
      label: 'Path Pattern',
      placeholder: '/All Files/Company Wiki/*',
      description: 'Box path hierarchy to crawl or exclude',
      example: '/All Files/Public/*',
    },
  ],
  slack: [
    {
      key: 'Channel',
      label: 'Channel Name / ID',
      placeholder: 'C12345678, general, announcements',
      description: 'Slack public/private channel ID or name',
      example: 'C0123456789',
    },
    {
      key: 'Workspace',
      label: 'Enterprise Grid Workspace',
      placeholder: 'T12345678, corp-workspace',
      description: 'Slack team/workspace ID',
      example: 'T0123456789',
    },
  ],
  zendesk: [
    {
      key: 'Brand',
      label: 'Brand Name / ID',
      placeholder: 'brand-1, brand-2',
      description: 'Zendesk brand identifier',
      example: 'SupportBrand',
    },
    {
      key: 'Category',
      label: 'Guide Category',
      placeholder: 'Getting Started, FAQ',
      description: 'Zendesk Guide article category ID or name',
      example: 'FAQ',
    },
  ],
};

const DEFAULT_DEFINITIONS: FilterKeyDefinition[] = [
  {
    key: 'Site',
    label: 'Site / Workspace URL',
    placeholder: 'https://mysite.example.com',
    description: 'Target site collection or host URL',
    example: 'https://site.example.com',
  },
  {
    key: 'Path',
    label: 'Path Pattern',
    placeholder: '/documents/folder/*',
    description: 'Resource path pattern with optional wildcards',
    example: '/sites/HR/*',
  },
  {
    key: 'Project',
    label: 'Project Key / ID',
    placeholder: 'PROJ-1, PROJ-2',
    description: 'Project or workspace identifier',
    example: 'ENG',
  },
  {
    key: 'Folder',
    label: 'Folder Path',
    placeholder: '/Shared/Documents',
    description: 'Folder path to scope content',
    example: '/Documents/Work',
  },
  {
    key: 'Domain',
    label: 'Domain Name',
    placeholder: 'example.com',
    description: 'Domain filter',
    example: 'company.com',
  },
  {
    key: 'Category',
    label: 'Category',
    placeholder: 'Support, Knowledge',
    description: 'Category name or classification',
    example: 'Documentation',
  },
];

// Helper to sanitize and normalize filter maps
const cleanFilterMap = (map: FilterMap): FilterMap => {
  const result: FilterMap = {};
  Object.entries(map || {}).forEach(([key, values]) => {
    const trimmedKey = key.trim();
    if (!trimmedKey) return;
    const cleanValues = (Array.isArray(values) ? values : [values])
      .map((v) => (typeof v === 'string' ? v.trim() : String(v).trim()))
      .filter((v) => v.length > 0);
    if (cleanValues.length > 0) {
      result[trimmedKey] = Array.from(new Set(cleanValues));
    }
  });
  return result;
};

// Count total filter values across all keys in a map
export const countFilterRules = (map: FilterMap): number => {
  if (!map) return 0;
  return Object.values(map).reduce((acc, curr) => acc + (Array.isArray(curr) ? curr.length : 0), 0);
};

// Deep compare two filter maps
const areFilterMapsEqual = (a: FilterMap, b: FilterMap): boolean => {
  const cleanA = cleanFilterMap(a);
  const cleanB = cleanFilterMap(b);
  const keysA = Object.keys(cleanA).sort();
  const keysB = Object.keys(cleanB).sort();
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i];
    if (key !== keysB[i]) return false;
    const valsA = (cleanA[key] || []).slice().sort();
    const valsB = (cleanB[key] || []).slice().sort();
    if (valsA.length !== valsB.length) return false;
    for (let j = 0; j < valsA.length; j++) {
      if (valsA[j] !== valsB[j]) return false;
    }
  }
  return true;
};

const ConnectorFiltersTab: React.FC<ConnectorFiltersTabProps> = ({
  connector,
  config,
  onConnectorUpdated,
  onRefreshSuccess,
}) => {
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
    // Check entities if top-level is not set
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
    // Check entities if top-level is not set
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

    // Handle comma or newline separated values
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

      // 1. Entities mapping
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

      // 2. Top-level parameters mapping (for sources that support top-level params filters)
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
        <div className="bg-gray-950/90 border border-blue-900/60 p-4 rounded-lg space-y-3 animate-fadeIn text-xs shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2">
            <h4 className="font-bold text-blue-300 flex items-center gap-1.5">
              <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              Supported Filter Keys for {connector?.dataSource || 'this Connector'}
            </h4>
            <button onClick={() => setShowGuide(false)} className="text-gray-400 hover:text-white text-xs">
              Close &times;
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {activeDefinitions.map((def) => (
              <div key={def.key} className="bg-gray-900/80 p-2.5 rounded border border-gray-800 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-blue-400 text-[11px]">{def.key}</span>
                  <span className="text-[10px] text-gray-400 font-semibold">{def.label}</span>
                </div>
                <p className="text-gray-300 text-[11px]">{def.description}</p>
                <div className="text-[10px] text-gray-500 font-mono">
                  <span className="text-gray-400">Example:</span> {def.example}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-blue-950/30 p-2.5 rounded border border-blue-900/40 text-[11px] text-blue-300 space-y-1">
            <p>
              <strong>Tips & Wildcards:</strong> You can enter multiple values separated by commas or new lines. URL and path filters support trailing wildcards (e.g. <code className="bg-black/40 px-1 py-0.5 rounded text-blue-200">https://tenant.sharepoint.com/sites/Finance/*</code>).
            </p>
          </div>
        </div>
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
          <button onClick={() => setSaveSuccess(false)} className="text-green-400 hover:text-green-200 text-xs font-semibold">
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
          <button onClick={() => setSaveError(null)} className="text-red-400 hover:text-red-200 text-xs font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {/* Visual Editor Mode */}
      {editorMode === 'visual' ? (
        <div className="space-y-6">
          {/* Scope selection if multiple entities */}
          {hasEntities && (
            <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-700/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-300">Entity Scope:</span>
                <button
                  onClick={() => setScopeMode('all')}
                  className={`px-2.5 py-1 rounded font-medium transition-colors ${
                    scopeMode === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  All Entities ({connector.entities.length})
                </button>
                <button
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
                    {connector.entities.map((e: any) => (
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
                        onClick={() => handleAddKeyGroup(def.key)}
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
                        onClick={() => handleDeleteKeyGroup(key)}
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
                              onClick={() => handleRemoveValue(key, idx)}
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
                        handleAddValueToKey(key);
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
                  onClick={() => handleAddKeyGroup(def.key)}
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
                handleAddKeyGroup(newKeyInput);
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
      <div className="pt-4 border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-xs text-gray-400 flex items-center gap-2">
          {hasUnsavedChanges ? (
            <span className="text-yellow-400 font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
              You have unsaved filter changes
            </span>
          ) : (
            <span className="text-gray-500">Filters match current connector state</span>
          )}
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          <button
            onClick={handleResetFilters}
            disabled={!hasUnsavedChanges || isSaving}
            className="px-3.5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-xs font-semibold rounded-md border border-gray-700 transition-colors disabled:opacity-50"
          >
            Reset
          </button>
          <button
            onClick={handleSaveFilters}
            disabled={isSaving || (editorMode === 'json' && !!rawJsonError)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md shadow-md transition-colors flex items-center gap-2 disabled:bg-gray-700 disabled:text-gray-500"
          >
            {isSaving ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Saving Filters...
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Save & Apply Filters
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConnectorFiltersTab;
