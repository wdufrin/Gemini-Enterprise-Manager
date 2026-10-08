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

import { ConnectorChecklistDefinition } from './types';
import googleCloudWorkspaceCatalog from './catalog/google-cloud-workspace.json';
import microsoftEnterpriseCatalog from './catalog/microsoft-enterprise.json';
import atlassianDevtoolsCatalog from './catalog/atlassian-devtools.json';
import crmItsmErpCatalog from './catalog/crm-itsm-erp.json';
import collaborationProductivityCatalog from './catalog/collaboration-productivity.json';

interface ChecklistCatalogFile {
  catalogGroup: string;
  description: string;
  connectors: ConnectorChecklistDefinition[];
}

const ALL_CATALOGS: ChecklistCatalogFile[] = [
  googleCloudWorkspaceCatalog as unknown as ChecklistCatalogFile,
  microsoftEnterpriseCatalog as unknown as ChecklistCatalogFile,
  atlassianDevtoolsCatalog as unknown as ChecklistCatalogFile,
  crmItsmErpCatalog as unknown as ChecklistCatalogFile,
  collaborationProductivityCatalog as unknown as ChecklistCatalogFile,
];

/**
 * Deterministic Connector Checklist Registry built from human-editable JSON catalog files
 * in `components/connectors/checklist/catalog/*.json` (Zero LLM generation).
 */
export const CHECKLIST_REGISTRY: Record<string, ConnectorChecklistDefinition> =
  ALL_CATALOGS.reduce<Record<string, ConnectorChecklistDefinition>>(
    (acc, catalog) => {
      for (const connector of catalog.connectors || []) {
        acc[connector.vendorId] = connector;
      }
      return acc;
    },
    {}
  );

function matchesWordToken(source: string, target: string): boolean {
  if (!source || !target) return false;
  const s = source.toLowerCase();
  const t = target.toLowerCase();
  if (s === t) return true;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
  return regex.test(s);
}

/**
 * Intelligent connector vendor detection function.
 * Evaluates formal GCP Discovery Engine dataConnector fields (dataSource, connectorType),
 * followed by collection / connector displayName, dataStores, and configuration parameters.
 */
export function detectConnectorVendor(connector: any): string {
  if (!connector) return 'GENERIC';

  const connectorState = connector.connectorState || connector;
  const dataSource = (
    connectorState.dataSource ||
    connector.dataSource ||
    ''
  ).toLowerCase();

  const dataStoresStr = Array.isArray(connector.dataStores)
    ? connector.dataStores
        .map((ds: any) => `${ds?.displayName || ''} ${ds?.name || ''}`)
        .join(' ')
    : '';

  const nameString = (
    (connector.name || '') + ' ' +
    (connectorState.name || '') + ' ' +
    (connector.displayName || '') + ' ' +
    (connectorState.displayName || '') + ' ' +
    (connector.collectionDisplayName || '') + ' ' +
    (connector.title || '') + ' ' +
    dataStoresStr
  ).toLowerCase();

  const stateString = (
    JSON.stringify(connectorState) + ' ' +
    JSON.stringify(connector)
  ).toLowerCase();

  // 1. First-Party Google & BYO-MCP explicit detection
  if (
    dataSource === 'looker' ||
    dataSource === 'looker_mcp' ||
    dataSource === 'google_looker' ||
    nameString.includes('looker')
  ) {
    return 'LOOKER';
  }

  if (
    dataSource === 'custom_mcp' ||
    stateString.includes('custom_mcp') ||
    matchesWordToken(nameString, 'mcp') ||
    nameString.includes('byomcp') ||
    nameString.includes('byo-mcp')
  ) {
    return 'BYO_MCP';
  }

  if (
    dataSource === 'gmail' ||
    dataSource === 'google_mail' ||
    nameString.includes('gmail') ||
    nameString.includes('google-mail') ||
    nameString.includes('google_mail')
  ) {
    return 'GMAIL';
  }

  if (
    dataSource === 'people_custom' ||
    dataSource === 'custom_people' ||
    dataSource === 'people_bq' ||
    dataSource === 'people_gcs' ||
    nameString.includes('people_custom') ||
    nameString.includes('people-custom') ||
    nameString.includes('custom_people') ||
    nameString.includes('custom-people')
  ) {
    return 'GCP_PEOPLE_CUSTOM';
  }

  if (
    dataSource === 'gcp_people' ||
    dataSource === 'google_people' ||
    nameString.includes('gcp-people') ||
    nameString.includes('gcp_people') ||
    nameString.includes('gcp people') ||
    nameString.includes('google-people') ||
    nameString.includes('google people') ||
    nameString.includes('workspace-directory') ||
    nameString.includes('workspace directory') ||
    nameString.includes('people-directory') ||
    nameString.includes('people_directory') ||
    ((nameString.includes('people') || nameString.includes('directory')) &&
      (nameString.includes('google') || nameString.includes('workspace') || nameString.includes('gcp')))
  ) {
    return 'GCP_PEOPLE';
  }

  // Note: Check OneDrive BEFORE generic 'drive' substring so 'onedrive' never matches GCP_DRIVE
  if (
    dataSource.includes('onedrive') ||
    nameString.includes('onedrive') ||
    nameString.includes('one-drive') ||
    nameString.includes('one_drive')
  ) {
    return 'ONEDRIVE';
  }

  if (
    dataSource === 'drive' ||
    dataSource === 'gdrive' ||
    dataSource === 'google_drive' ||
    nameString.includes('gdrive') ||
    nameString.includes('google-drive') ||
    nameString.includes('google_drive') ||
    matchesWordToken(nameString, 'drive')
  ) {
    return 'GCP_DRIVE';
  }

  // 2. Data Center & variant specialized checks (must precede cloud substrings)
  if (
    dataSource.includes('jira_dc') ||
    dataSource.includes('jira-dc') ||
    dataSource.includes('jira_datacenter') ||
    dataSource.includes('jira-datacenter') ||
    nameString.includes('jira_dc') ||
    nameString.includes('jira-dc') ||
    nameString.includes('jira_datacenter') ||
    nameString.includes('jira-datacenter') ||
    nameString.includes('jiradc') ||
    nameString.includes('jira data center') ||
    stateString.includes('jira_dc') ||
    stateString.includes('jira-dc') ||
    stateString.includes('jira_datacenter') ||
    stateString.includes('jira-datacenter')
  ) {
    return 'JIRA_DC';
  }

  if (
    dataSource.includes('confluence_dc') ||
    dataSource.includes('confluence-dc') ||
    dataSource.includes('confluence_datacenter') ||
    dataSource.includes('confluence-datacenter') ||
    nameString.includes('confluence_dc') ||
    nameString.includes('confluence-dc') ||
    nameString.includes('confluence_datacenter') ||
    nameString.includes('confluence-datacenter') ||
    nameString.includes('confluencedc') ||
    nameString.includes('confluence data center') ||
    stateString.includes('confluence_dc') ||
    stateString.includes('confluence-dc') ||
    stateString.includes('confluence_datacenter') ||
    stateString.includes('confluence-datacenter')
  ) {
    return 'CONFLUENCE_DC';
  }

  if (
    dataSource.includes('outlookopenapi') ||
    dataSource.includes('outlook_openapi') ||
    nameString.includes('outlookopenapi') ||
    nameString.includes('outlook_openapi') ||
    nameString.includes('outlook-openapi')
  ) {
    return 'OUTLOOK_OPENAPI';
  }

  if (
    dataSource.includes('s4hana') ||
    nameString.includes('s4hana') ||
    nameString.includes('s/4hana')
  ) {
    return 'SAP_S4HANA';
  }

  if (
    dataSource.includes('zoho_books') ||
    dataSource.includes('zohobooks') ||
    nameString.includes('zoho_books') ||
    nameString.includes('zoho-books') ||
    nameString.includes('zohobooks')
  ) {
    return 'ZOHO_BOOKS';
  }

  if (
    dataSource.includes('zoho_desk') ||
    dataSource.includes('zohodesk') ||
    nameString.includes('zoho_desk') ||
    nameString.includes('zoho-desk') ||
    nameString.includes('zohodesk')
  ) {
    return 'ZOHO_DESK';
  }

  if (
    dataSource.includes('zoho_projects') ||
    dataSource.includes('zohoprojects') ||
    nameString.includes('zoho_projects') ||
    nameString.includes('zoho-projects') ||
    nameString.includes('zohoprojects')
  ) {
    return 'ZOHO_PROJECTS';
  }

  // 3. Exact or token match on known registry keys (prioritizing dataSources first, then nameSubstrings)
  const prioritySkip = new Set([
    'GENERIC',
    'GCP_PEOPLE_CUSTOM',
    'GCP_PEOPLE',
    'GCP_DRIVE',
    'GMAIL',
    'BYO_MCP',
    'ONEDRIVE',
    'JIRA_DC',
    'CONFLUENCE_DC',
    'OUTLOOK_OPENAPI',
    'SAP_S4HANA',
    'ZOHO_BOOKS',
    'ZOHO_DESK',
    'ZOHO_PROJECTS',
  ]);

  if (dataSource) {
    for (const [vendorId, def] of Object.entries(CHECKLIST_REGISTRY)) {
      if (prioritySkip.has(vendorId)) continue;
      if (def.detectionPatterns.dataSources?.some((ds) => matchesWordToken(dataSource, ds))) {
        return vendorId;
      }
    }
  }

  for (const [vendorId, def] of Object.entries(CHECKLIST_REGISTRY)) {
    if (prioritySkip.has(vendorId)) continue;
    if (def.detectionPatterns.nameSubstrings?.some((substr) => matchesWordToken(nameString, substr))) {
      return vendorId;
    }
  }

  // 4. Fallback to deep state string inspection
  for (const [vendorId, def] of Object.entries(CHECKLIST_REGISTRY)) {
    if (vendorId === 'GENERIC') continue;
    if (def.detectionPatterns.nameSubstrings?.some((substr) => matchesWordToken(stateString, substr))) {
      return vendorId;
    }
  }

  return 'GENERIC';
}

/**
 * Returns checklist definition for a vendor, falling back to GENERIC if not found.
 */
export function getChecklistDefinition(vendorId: string): ConnectorChecklistDefinition {
  return CHECKLIST_REGISTRY[vendorId] || CHECKLIST_REGISTRY.GENERIC;
}

/**
 * Returns list of all available vendors for dropdown selection.
 */
export interface VendorOption {
  id: string;
  name: string;
  category?: string;
}

export function getAllVendors(): VendorOption[] {
  return Object.values(CHECKLIST_REGISTRY).map((def) => ({
    id: def.vendorId,
    name: def.vendorDisplayName,
    category: def.category || 'Universal Fallback',
  }));
}
