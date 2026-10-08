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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  detectConnectorVendor,
  getChecklistDefinition,
  getAllVendors,
} from './checklistRegistry';
import {
  runAutomatedProbe,
  isRedactedOrWriteOnlyValue,
  extractDiagnosticSignals,
} from './probeRunner';
import { DynamicConnectorVerification } from './DynamicConnectorVerification';
import ConnectorVerificationTab from '../ConnectorVerificationTab';
import { Config } from '../../../types';
import * as api from '../../../services/apiService';

// Mock apiService
vi.mock('../../../services/apiService', () => ({
  checkServiceAccountPermissions: vi.fn(),
  listMcpTools: vi.fn(),
}));

// In-memory localStorage mock for node/vitest test environment
const storageStore = new Map<string, string>();
const localStorageMock: Storage = {
  getItem: (key: string) => storageStore.get(key) || null,
  setItem: (key: string, value: string) => {
    storageStore.set(key, String(value));
  },
  removeItem: (key: string) => {
    storageStore.delete(key);
  },
  clear: () => {
    storageStore.clear();
  },
  key: (index: number) => Array.from(storageStore.keys())[index] || null,
  length: storageStore.size,
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('Dynamic Checklist: Vendor Detection', () => {
  it('correctly detects gcp-people connector as GCP_PEOPLE (fixing user screenshot issue)', () => {
    const connector = {
      name: 'projects/180054373655/locations/global/collections/gcp-people_1763136179426/dataConnector',
      connectorState: {
        name: 'projects/180054373655/locations/global/collections/gcp-people_1763136179426/dataConnector',
        dataSource: 'gcp_people',
      },
    };

    const vendor = detectConnectorVendor(connector);
    expect(vendor).toBe('GCP_PEOPLE');
  });

  it('detects gcp-people by collection name even if dataSource is empty', () => {
    const connector = {
      name: 'gcp-people_1763136179426',
    };
    expect(detectConnectorVendor(connector)).toBe('GCP_PEOPLE');
  });

  it('correctly detects BYO_MCP connectors', () => {
    const connector = {
      name: 'custom-mcp-connector',
      connectorState: {
        dataSource: 'custom_mcp',
      },
    };
    expect(detectConnectorVendor(connector)).toBe('BYO_MCP');
  });

  it('correctly detects standard SaaS vendors', () => {
    expect(detectConnectorVendor({ name: 'jira-cloud-support' })).toBe('JIRA');
    expect(detectConnectorVendor({ name: 'jira_dc_production' })).toBe('JIRA_DC');
    expect(detectConnectorVendor({ connectorState: { dataSource: 'jira_datacenter' } })).toBe('JIRA_DC');
    expect(detectConnectorVendor({ connectorState: { dataSource: 'atlassian_jira_dc' } })).toBe('JIRA_DC');
    expect(detectConnectorVendor({ name: 'confluence-docs' })).toBe('CONFLUENCE');
    expect(detectConnectorVendor({ connectorState: { dataSource: 'confluence_datacenter' } })).toBe('CONFLUENCE_DC');
    expect(detectConnectorVendor({ connectorState: { dataSource: 'atlassian_confluence_dc' } })).toBe('CONFLUENCE_DC');
    expect(detectConnectorVendor({ name: 'sharepoint_intranet' })).toBe('SHAREPOINT');
    expect(detectConnectorVendor({ name: 'salesforce_crm' })).toBe('SALESFORCE');
  });

  it('correctly detects newly added dedicated enterprise and first-party connectors', () => {
    expect(detectConnectorVendor({ name: 'airtable_marketing_base' })).toBe('AIRTABLE');
    expect(detectConnectorVendor({ connectorState: { dataSource: 'stripe' } })).toBe('STRIPE');
    expect(detectConnectorVendor({ name: 'intercom_support_inbox' })).toBe('INTERCOM');
    expect(detectConnectorVendor({ name: 'freshservice_itsm' })).toBe('FRESHSERVICE');
    expect(detectConnectorVendor({ name: 'miro_whiteboards' })).toBe('MIRO');
    expect(detectConnectorVendor({ name: 'smartsheet_tracker' })).toBe('SMARTSHEET');
    expect(detectConnectorVendor({ connectorState: { dataSource: 'bigquery' } })).toBe('BIGQUERY');
    expect(detectConnectorVendor({ connectorState: { dataSource: 'cloud_storage' } })).toBe('GCS');
    expect(detectConnectorVendor({ name: 'google-calendar-sync' })).toBe('GCAL');
    expect(detectConnectorVendor({ name: 'google-chat-bot' })).toBe('GCHAT');
    expect(detectConnectorVendor({ name: 'trello_project_boards' })).toBe('TRELLO');
    expect(detectConnectorVendor({ connectorState: { dataSource: 'trello' } })).toBe('TRELLO');
    expect(detectConnectorVendor({ name: 'workday_hcm_sync' })).toBe('WORKDAY');
    expect(detectConnectorVendor({ connectorState: { dataSource: 'workday' } })).toBe('WORKDAY');
    expect(detectConnectorVendor({ connectorState: { dataSource: 'looker_mcp' } })).toBe('LOOKER');
    expect(detectConnectorVendor({ name: 'looker-mcp-analytics' })).toBe('LOOKER');
    expect(detectConnectorVendor({ connectorState: { dataSource: 'google_compute_engine' } })).toBe('GOOGLE_COMPUTE_ENGINE');
    expect(detectConnectorVendor({ connectorState: { dataSource: 'googlestitch' } })).toBe('GOOGLE_STITCH');
    expect(detectConnectorVendor({ connectorState: { dataSource: 'notebooklm' } })).toBe('NOTEBOOKLM');
    expect(detectConnectorVendor({ connectorState: { dataSource: 'knowledge_catalog' } })).toBe('KNOWLEDGE_CATALOG');
    expect(detectConnectorVendor({ connectorState: { dataSource: 'people_custom' } })).toBe('GCP_PEOPLE_CUSTOM');
    expect(detectConnectorVendor({ connectorState: { dataSource: 'outlookopenapi' } })).toBe('OUTLOOK_OPENAPI');
    expect(detectConnectorVendor({ connectorState: { dataSource: 's4hana' } })).toBe('SAP_S4HANA');
    expect(detectConnectorVendor({ connectorState: { dataSource: 'relativity' } })).toBe('RELATIVITY');
    expect(detectConnectorVendor({ connectorState: { dataSource: 'zoho_desk' } })).toBe('ZOHO_DESK');
    expect(detectConnectorVendor({ connectorState: { dataSource: 'zoho_books' } })).toBe('ZOHO_BOOKS');
    expect(detectConnectorVendor({ connectorState: { dataSource: 'zoho_projects' } })).toBe('ZOHO_PROJECTS');
    expect(detectConnectorVendor({ connectorState: { dataSource: 'supabase' } })).toBe('SUPABASE');
    expect(detectConnectorVendor({ connectorState: { dataSource: 'atlan' } })).toBe('ATLAN');
    expect(detectConnectorVendor({ connectorState: { dataSource: 'nexla' } })).toBe('NEXLA');
    expect(detectConnectorVendor({ connectorState: { dataSource: 'vanta' } })).toBe('VANTA');
    expect(detectConnectorVendor({ connectorState: { dataSource: 'gong' } })).toBe('GONG');
    expect(detectConnectorVendor({ connectorState: { dataSource: 'cisco_workspaces' } })).toBe('CISCO_WORKSPACES');
    expect(detectConnectorVendor({ connectorState: { dataSource: 'webex_meetings' } })).toBe('WEBEX_MEETINGS');
  });

  it('detects connectors by collection displayName when resource name is an opaque ID', () => {
    expect(
      detectConnectorVendor({
        name: 'projects/123/locations/global/collections/col_1773164923720/dataConnector',
        displayName: 'Github',
      })
    ).toBe('GITHUB');

    expect(
      detectConnectorVendor({
        name: 'projects/123/locations/global/collections/col_1773165319808/dataConnector',
        displayName: 'gmail with actions',
      })
    ).toBe('GMAIL');

    expect(
      detectConnectorVendor({
        name: 'col_999999999999',
        collectionDisplayName: 'Workday HR Directory',
      })
    ).toBe('WORKDAY');
  });

  it('falls back to GENERIC for completely unknown connector names', () => {
    expect(detectConnectorVendor({ name: 'xyz_unknown_repo_999' })).toBe('GENERIC');
  });
});

describe('Dynamic Checklist: Registry Definitions', () => {
  it('returns valid checklist definition with sections and items for GCP_PEOPLE', () => {
    const def = getChecklistDefinition('GCP_PEOPLE');
    expect(def.vendorId).toBe('GCP_PEOPLE');
    expect(def.vendorDisplayName).toContain('People & Directory');
    expect(def.sections.length).toBeGreaterThanOrEqual(2);
    expect(def.sections[0].items.some((i) => i.id === 'people_dwd')).toBe(true);
    expect(def.sections[0].items.some((i) => i.automatedProbe?.type === 'IAM_PERMISSION_CHECK')).toBe(true);
  });

  it('contains all 156 official Gemini Enterprise vendors with authentic categories in getAllVendors()', () => {
    const vendors = getAllVendors();
    expect(vendors.length).toBe(156);
    expect(vendors.some((v) => v.id === 'GCP_PEOPLE')).toBe(true);
    expect(vendors.some((v) => v.id === 'BYO_MCP')).toBe(true);
    expect(vendors.some((v) => v.id === 'JIRA')).toBe(true);
    expect(vendors.some((v) => v.id === 'JIRA_DC')).toBe(true);
    expect(vendors.some((v) => v.id === 'CONFLUENCE_DC')).toBe(true);
    expect(vendors.some((v) => v.id === 'AIRTABLE')).toBe(true);
    expect(vendors.some((v) => v.id === 'STRIPE')).toBe(true);
    expect(vendors.some((v) => v.id === 'BIGQUERY')).toBe(true);
    expect(vendors.some((v) => v.id === 'GCS')).toBe(true);
    expect(vendors.some((v) => v.id === 'ALLOYDB')).toBe(true);
    expect(vendors.some((v) => v.id === 'SPANNER')).toBe(true);
    expect(vendors.some((v) => v.id === 'LOOKER')).toBe(true);
    expect(vendors.some((v) => v.id === 'GOOGLE_COMPUTE_ENGINE')).toBe(true);
    expect(vendors.some((v) => v.id === 'GOOGLE_STITCH')).toBe(true);
    expect(vendors.some((v) => v.id === 'SAP_S4HANA')).toBe(true);
    expect(vendors.some((v) => v.id === 'RELATIVITY')).toBe(true);
    expect(vendors.some((v) => v.id === 'SUPABASE')).toBe(true);
    expect(vendors.some((v) => v.id === 'ATLAN')).toBe(true);
    expect(vendors.some((v) => v.id === 'NEXLA')).toBe(true);
    expect(vendors.some((v) => v.id === 'VANTA')).toBe(true);
    expect(vendors.some((v) => v.id === 'GONG')).toBe(true);
    expect(vendors.some((v) => v.id === 'CISCO_WORKSPACES')).toBe(true);
    expect(vendors.some((v) => v.id === 'WEBEX_MEETINGS')).toBe(true);
    // Explicitly ensure Website is NOT in the catalog (unsupported in Gemini Enterprise apps)
    expect(vendors.some((v) => v.id === 'WEBSITE')).toBe(false);

    const validCategories = [
      'Google First-Party & MCP',
      'Microsoft 365 & Identity',
      'Atlassian & DevTools',
      'Enterprise Platforms',
      'Collaboration & Storage',
      'Productivity & Tasks',
      'Customer Support & CRM',
      'Universal Fallback',
    ];
    for (const v of vendors) {
      expect(validCategories).toContain(v.category);
    }
  });

  it('validates dedicated pre-flight checklists for newly added connectors and ServiceNow 24 table ACLs', () => {
    const newVendors = [
      'AIRTABLE',
      'STRIPE',
      'INTERCOM',
      'FRESHSERVICE',
      'MIRO',
      'SMARTSHEET',
      'BIGQUERY',
      'GCS',
      'GCAL',
      'GCHAT',
      'GMAIL',
      'GSITES',
      'ALLOYDB',
      'CLOUD_SQL',
      'SPANNER',
      'BIGTABLE',
      'FIRESTORE',
      'GOOGLE_COMPUTE_ENGINE',
      'GOOGLE_STITCH',
      'LOOKER',
      'GOOGLE_GROUPS',
      'NOTEBOOKLM',
      'KNOWLEDGE_CATALOG',
      'GCP_PEOPLE_CUSTOM',
      'CUSTOM_CONNECTOR',
      'DYNAMICS365',
      'OUTLOOK_OPENAPI',
      'JIRA_DC',
      'CONFLUENCE_DC',
      'SOURCEGRAPH',
      'GRAFANA',
      'SUPABASE',
      'LOVABLE',
      'HEX',
      'ATLAN',
      'GLOBALPING',
      'NEXLA',
      'VANTA',
      'SAP_S4HANA',
      'FINNHUB',
      'SERVICEM8',
      'DB_RISK_ANALYTICS',
      'ORACLE_NETSUITE',
      'ZOHO_CRM',
      'ZOHO_BOOKS',
      'ZOHO_DESK',
      'ZOHO_PROJECTS',
      'ZOOMINFO',
      'RELATIVITY',
      'COURTLISTENER',
      'FISCAL_AI',
      'GONG',
      'LEGALZOOM',
      'MAILERLITE',
      'MERCURY',
      'EGNYTE',
      'ADOBE_WORKFRONT',
      'DOCUSIGN',
      'IMANAGE',
      'LUMAPPS',
      'WRIKE',
      'TRELLO',
      'WORKDAY',
      'CISCO_WORKSPACES',
      'GURU',
      'SURVEYMONKEY',
      'WEBEX_MEETINGS',
      'WIX',
    ];
    for (const vendorId of newVendors) {
      const def = getChecklistDefinition(vendorId);
      expect(def.vendorId).toBe(vendorId);
      expect(def.sections.length).toBeGreaterThanOrEqual(2);
      expect(def.sections[0].items.length).toBeGreaterThan(0);
      expect(def.documentationUrl).toContain('google.com');
    }

    // Verify ServiceNow includes all 24 individual table ACL checkboxes
    const snowDef = getChecklistDefinition('SERVICENOW');
    const snowAclSection = snowDef.sections.find((s) => s.id === 'snow_table_acls');
    expect(snowAclSection).toBeDefined();
    expect(snowAclSection!.items.length).toBeGreaterThanOrEqual(24);
  });
});

describe('Dynamic Checklist: Automated Probe Runner', () => {
  const config: Config = {
    projectId: 'test-project-123',
    appLocation: 'global',
    collectionId: 'default_collection',
    appId: '',
    assistantId: '',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports PASS when IAM permissions check succeeds', async () => {
    vi.mocked(api.checkServiceAccountPermissions).mockResolvedValueOnce({
      hasAll: true,
      missing: [],
    });

    const probe = {
      type: 'IAM_PERMISSION_CHECK' as const,
      requiredPermissions: ['discoveryengine.dataStores.get'],
    };

    const result = await runAutomatedProbe(probe, {}, config);
    expect(result.status).toBe('pass');
    expect(result.message).toContain('active');
  });

  it('reports FAIL when IAM permissions are missing', async () => {
    vi.mocked(api.checkServiceAccountPermissions).mockResolvedValueOnce({
      hasAll: false,
      missing: ['roles/discoveryengine.admin'],
    });

    const probe = {
      type: 'IAM_PERMISSION_CHECK' as const,
      requiredPermissions: ['roles/discoveryengine.admin'],
    };

    const result = await runAutomatedProbe(probe, {}, config);
    expect(result.status).toBe('fail');
    expect(result.message).toContain('Missing required IAM permissions');
  });

  it('detects CONNECTOR_STATUS failure truthfully', async () => {
    const connector = {
      connectorState: {
        state: 'FAILED',
        latestRun: { error: { message: 'OAuth Refresh Token expired' } },
      },
    };

    const probe = { type: 'CONNECTOR_STATUS' as const };
    const result = await runAutomatedProbe(probe, connector, config);
    expect(result.status).toBe('fail');
    expect(result.message).toContain('FAILED');
  });

  it('tests MCP_CONNECTIVITY truthfully', async () => {
    vi.mocked(api.listMcpTools).mockResolvedValueOnce([
      { name: 'search_crm' },
      { name: 'update_ticket' },
    ]);

    const connector = {
      connectorState: {
        params: { instance_uri: 'https://mcp-server.run.app/mcp' },
      },
    };

    const probe = { type: 'MCP_CONNECTIVITY' as const };
    const result = await runAutomatedProbe(probe, connector, config);
    expect(result.status).toBe('pass');
    expect(result.message).toContain('2 active dynamic tools');
  });

  it('passes OAUTH_CONFIG_VALIDITY when GCP redacts client_id/client_secret on GET but non-redacted tenant/endpoint params are valid', async () => {
    const sharepointConnectorFromGcpGet = {
      connectorState: {
        state: 'ACTIVE',
        dataSource: 'sharepoint',
        params: {
          auth_type: 'OAUTH',
          tenant_id: '5ae87d26-ea67-46a2-9e69-845111b8ad75',
          instance_uri: 'https://contoso.sharepoint.com',
          // Note: GCP omits client_id and client_secret on GET
        },
        actionConfig: {
          isActionConfigured: true,
          actionParams: {
            auth_type: 'OAUTH',
            tenant_id: '5ae87d26-ea67-46a2-9e69-845111b8ad75',
          },
        },
      },
    };

    const probe = { type: 'OAUTH_CONFIG_VALIDITY' as const };
    const result = await runAutomatedProbe(probe, sharepointConnectorFromGcpGet, config);
    expect(result.status).toBe('pass');
    expect(result.message).toContain('5ae87d26-ea67-46a2-9e69-845111b8ad75');
    expect(result.message).toContain('redacted by GCP');
  });

  it('fails OAUTH_CONFIG_VALIDITY when Discovery Engine reports 401/invalid_client or blockingReasons', async () => {
    const brokenOAuthConnector = {
      connectorState: {
        state: 'FAILED',
        dataSource: 'jira',
        latestRun: {
          error: { message: '401 Unauthorized: invalid_client or expired OAuth token' },
        },
      },
    };

    const probe = { type: 'OAUTH_CONFIG_VALIDITY' as const };
    const result = await runAutomatedProbe(probe, brokenOAuthConnector, config);
    expect(result.status).toBe('fail');
    expect(result.message).toContain('401 Unauthorized');
  });

  it('warns on BYO_MCP OAUTH_CONFIG_VALIDITY when auth_uri or token_uri is missing, and passes when present even without client_id', async () => {
    const probe = { type: 'OAUTH_CONFIG_VALIDITY' as const };

    const incompleteMcp = {
      connectorState: {
        dataSource: 'custom_mcp',
        actionConfig: {
          actionParams: {
            auth_type: 'OAUTH',
            // missing auth_uri and token_uri
          },
        },
      },
    };
    const warnResult = await runAutomatedProbe(probe, incompleteMcp, config);
    expect(warnResult.status).toBe('warning');
    expect(warnResult.message).toContain('auth_uri or token_uri is missing');

    const validMcp = {
      connectorState: {
        dataSource: 'custom_mcp',
        actionConfig: {
          actionParams: {
            auth_type: 'OAUTH',
            auth_uri: 'https://accounts.google.com/o/oauth2/v2/auth',
            token_uri: 'https://oauth2.googleapis.com/token',
            scopes: 'openid email',
          },
        },
      },
    };
    const passResult = await runAutomatedProbe(probe, validMcp, config);
    expect(passResult.status).toBe('pass');
    expect(passResult.message).toContain('BYO-MCP OAuth endpoints verified');
  });
});

describe('Dynamic Checklist: DynamicConnectorVerification Component', () => {
  const mockConfig: Config = {
    projectId: 'test-project',
    appLocation: 'global',
    collectionId: 'col-1',
    appId: '',
    assistantId: '',
  };

  const mockConnector = {
    name: 'projects/test-project/locations/global/collections/gcp-people_1763136179426/dataConnector',
    connectorState: {
      state: 'ACTIVE',
    },
  };

  beforeEach(() => {
    localStorage.clear();
  });

  it('renders sections and allows toggling checklist items with persistence', async () => {
    const def = getChecklistDefinition('GCP_PEOPLE');

    render(
      <DynamicConnectorVerification
        connector={mockConnector}
        checklistDef={def}
        dataMode="INGESTION"
        config={mockConfig}
      />
    );

    // Verify header progress is visible
    expect(screen.getByText(/Validation & Readiness Progress/i)).toBeInTheDocument();

    // Verify first item label is visible
    const dwdItem = screen.getByText(/Domain-Wide Delegation \(DWD\) Provisioned/i);
    expect(dwdItem).toBeInTheDocument();

    // Toggle the checkbox
    fireEvent.click(dwdItem);

    // Verify state was saved to localStorage
    const stored = localStorage.getItem('gem_connector_checklist_projects_test-project_locations_global_collections_gcp-people_1763136179426_dataConnector');
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.checkedItems.people_dwd).toBe(true);
  });

  it('renders Verified Baseline (Google KB) badge without runtime sync dependencies', () => {
    const def = getChecklistDefinition('JIRA');

    render(
      <DynamicConnectorVerification
        connector={{ name: 'jira-test' }}
        checklistDef={def}
        dataMode="FEDERATED"
        config={mockConfig}
      />
    );

    // Verify Verified Baseline badge is present
    expect(screen.getByText(/Verified Baseline \(Google KB\)/i)).toBeInTheDocument();

    // Verify no runtime live sync button exists
    expect(screen.queryByRole('button', { name: /Sync with Live KB/i })).toBeNull();
  });

  it('filters out action write scopes by default and reveals them when Actions are enabled', () => {
    const def = getChecklistDefinition('JIRA');

    const { rerender } = render(
      <DynamicConnectorVerification
        connector={{ name: 'jira-test' }}
        checklistDef={def}
        dataMode="INGESTION"
        config={mockConfig}
        actionsEnabled={false}
      />
    );

    // Ingestion read scopes should be visible
    expect(screen.getAllByText(/^read:jira-work/i).length).toBeGreaterThan(0);

    // Action write scopes should NOT be visible initially
    expect(screen.queryByText(/write:jira-work/i)).toBeNull();
    expect(screen.queryByText(/write:issue:jira/i)).toBeNull();
    expect(screen.queryByText(/Actions Redirect URI Allowlisted/i)).toBeNull();

    // Toggle Actions ON via checkbox
    const actionCheckbox = screen.getByRole('checkbox', {
      name: /Include Assistant Actions & Write Scopes/i,
    });
    fireEvent.click(actionCheckbox);

    // Action write scopes should now be visible
    expect(screen.getAllByText(/write:jira-work/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/write:issue:jira/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Actions Redirect URI Allowlisted/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Action \/ Write Scope/i).length).toBeGreaterThan(0);
  });

  it('verifies action requirements, write scopes, and standard action redirect URIs across major enterprise vendors', () => {
    const vendorsToVerify = [
      { id: 'JIRA', actionScope: 'write:jira-work', redirectUri: 'https://vertexaisearch.cloud.google.com/oauth-redirect' },
      { id: 'CONFLUENCE', actionScope: 'write:confluence-content', redirectUri: 'https://vertexaisearch.cloud.google.com/oauth-redirect' },
      { id: 'SERVICENOW', actionScope: 'itil', redirectUri: 'https://vertexaisearch.cloud.google.com/oauth-redirect' },
      { id: 'SALESFORCE', actionScope: 'Lead, Contact, Opportunity', redirectUri: 'https://vertexaisearch.cloud.google.com/oauth-redirect' },
      { id: 'OUTLOOK', actionScope: 'Mail.Send', redirectUri: 'https://vertexaisearch.cloud.google.com/oauth-redirect' },
      { id: 'TEAMS', actionScope: 'ChannelMessage.Send', redirectUri: 'https://vertexaisearch.cloud.google.com/oauth-redirect' },
      { id: 'SHAREPOINT', actionScope: 'Files.ReadWrite.All', redirectUri: 'https://vertexaisearch.cloud.google.com/oauth-redirect' },
      { id: 'SLACK', actionScope: 'chat:write', redirectUri: 'https://vertexaisearch.cloud.google.com/oauth-redirect' },
      { id: 'GITHUB', actionScope: 'issues:write', redirectUri: 'https://vertexaisearch.cloud.google.com/oauth-redirect' },
      { id: 'GITLAB', actionScope: 'api', redirectUri: 'https://vertexaisearch.cloud.google.com/oauth-redirect' },
      { id: 'ASANA', actionScope: 'default', redirectUri: 'https://vertexaisearch.cloud.google.com/oauth-redirect' },
      { id: 'ZENDESK', actionScope: 'tickets:write', redirectUri: 'https://vertexaisearch.cloud.google.com/oauth-redirect' },
      { id: 'GCP_DRIVE', actionScope: 'https://www.googleapis.com/auth/drive.file' },
    ];

    for (const v of vendorsToVerify) {
      const def = getChecklistDefinition(v.id);
      expect(def).toBeDefined();
      expect(def.supportsActions).toBe(true);

      const allItems = def.sections.flatMap((s) => s.items);
      const actionItems = allItems.filter((i) => i.isActionRequirement || i.appliesToMode === 'ACTIONS');
      expect(actionItems.length).toBeGreaterThan(0);

      // Verify specific action scope or label exists
      const hasActionScope = actionItems.some(
        (i) => (i.codeSnippet && i.codeSnippet.includes(v.actionScope)) ||
               (i.label && i.label.includes(v.actionScope)) ||
               (i.subLabel && i.subLabel.includes(v.actionScope))
      );
      expect(hasActionScope).toBe(true);

      // If redirect URI expected, verify it exists
      if (v.redirectUri) {
        const hasRedirect = actionItems.some(
          (i) => i.codeSnippet === v.redirectUri || (i.subLabel && i.subLabel.includes(v.redirectUri))
        );
        expect(hasRedirect).toBe(true);
      }
    }
  });
});

describe('ConnectorVerificationTab: Hide Unused Toggle & Filtering', () => {
  const mockConfig: Config = {
    projectId: 'test-project',
    appLocation: 'global',
    collectionId: 'col-1',
    appId: '',
    assistantId: '',
  };

  it('defaults to Hide Unused = true and displays only the active connector', () => {
    render(
      <ConnectorVerificationTab
        connector={{ name: 'jira-prod-connector' }}
        config={mockConfig}
      />
    );

    const checkbox = screen.getByTestId('hide-unused-checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    const select = screen.getByTestId('connector-vendor-select') as HTMLSelectElement;
    const options = select.querySelectorAll('option');
    expect(options.length).toBe(1);
    expect(options[0].value).toBe('JIRA');
  });

  it('unchecking Hide Unused reveals all 57 connectors grouped by optgroup categories', () => {
    render(
      <ConnectorVerificationTab
        connector={{ name: 'jira-prod-connector' }}
        config={mockConfig}
      />
    );

    const checkbox = screen.getByTestId('hide-unused-checkbox') as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);

    const select = screen.getByTestId('connector-vendor-select') as HTMLSelectElement;
    const optgroups = select.querySelectorAll('optgroup');
    expect(optgroups.length).toBeGreaterThanOrEqual(6);

    const options = select.querySelectorAll('option');
    expect(options.length).toBeGreaterThanOrEqual(57);

    // Verify key categories exist as optgroups
    const groupLabels = Array.from(optgroups).map((og) => og.getAttribute('label'));
    expect(groupLabels).toContain('Google First-Party & MCP');
    expect(groupLabels).toContain('Microsoft 365 & Identity');
    expect(groupLabels).toContain('Atlassian & DevTools');
    expect(groupLabels).toContain('Enterprise Platforms');
    expect(groupLabels).toContain('Collaboration & Storage');
    expect(groupLabels).toContain('Productivity & Tasks');
  });

  it('includes all activeVendors passed from project collections when Hide Unused is true', () => {
    render(
      <ConnectorVerificationTab
        connector={{ name: 'jira-prod-connector' }}
        config={mockConfig}
        activeVendors={['JIRA', 'SLACK', 'GCP_DRIVE']}
      />
    );

    const checkbox = screen.getByTestId('hide-unused-checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    const select = screen.getByTestId('connector-vendor-select') as HTMLSelectElement;
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.value);
    expect(options).toContain('JIRA');
    expect(options).toContain('SLACK');
    expect(options).toContain('GCP_DRIVE');
    expect(options).not.toContain('AIRTABLE');
    expect(options).not.toContain('MIRO');
  });

  it('auto-detects FEDERATED mode and Assistant Actions from connectorState', () => {
    render(
      <ConnectorVerificationTab
        connector={{
          name: 'projects/test-project/locations/global/collections/jira-fed/dataConnector',
          connectorState: {
            dataSource: 'jira',
            connectorModes: ['FEDERATED', 'ACTIONS'],
          },
        }}
        config={mockConfig}
      />
    );

    // Should auto-select Federated Search mode and enable Assistant Actions
    expect(screen.getByText(/Live real-time federated querying/i)).toBeInTheDocument();
    expect(screen.getByText(/Federated Search \+ Assistant Actions/i)).toBeInTheDocument();
    expect(screen.getAllByText(/write:jira-work/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Actions Redirect URI Allowlisted/i)).toBeInTheDocument();
  });
});

describe('Forensic Audit & Unified Diagnostics (M1: R1, R2, R3)', () => {
  const mockConfig: Config = {
    projectId: 'test-project-123',
    appLocation: 'global',
    collectionId: 'col-1',
    appId: '',
    assistantId: '',
  };

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('verifies all 6 newly upgraded enterprise connectors include OAUTH_CONFIG_VALIDITY probes and Miro uses canonical oauth-redirect URI', () => {
    const upgradedVendors = [
      'SOURCEGRAPH',
      'GRAFANA',
      'FRESHSERVICE',
      'INTERCOM',
      'SHOPIFY',
      'STRIPE',
    ];

    for (const vendorId of upgradedVendors) {
      const def = getChecklistDefinition(vendorId);
      const allItems = def.sections.flatMap((s) => s.items);
      const probes = allItems
        .map((i) => i.automatedProbe?.type)
        .filter(Boolean);
      expect(probes).toContain('OAUTH_CONFIG_VALIDITY');
      expect(probes).toContain('IAM_PERMISSION_CHECK');
      expect(probes).toContain('CONNECTOR_STATUS');
      expect(def.documentationUrl).toContain('https://cloud.google.com/gemini/enterprise/docs/connectors');
    }

    const miroDef = getChecklistDefinition('MIRO');
    const miroRedirect = miroDef.sections
      .flatMap((s) => s.items)
      .find((i) => i.id === 'miro_redirect_uri');
    expect(miroRedirect?.codeSnippet).toBe('https://vertexaisearch.cloud.google.com/oauth-redirect');

    const mcpDef = getChecklistDefinition('BYO_MCP');
    const mcpOAuthItem = mcpDef.sections
      .flatMap((s) => s.items)
      .find((i) => i.id === 'mcp_oauth_config');
    expect(mcpOAuthItem?.badge).toBe('Automated');
  });

  it('treats omitted or masked write-only credentials (client_id, client_secret, refresh_token, api_key) as redacted and never fails OAUTH_CONFIG_VALIDITY on them', async () => {
    expect(isRedactedOrWriteOnlyValue(undefined)).toBe(true);
    expect(isRedactedOrWriteOnlyValue(null)).toBe(true);
    expect(isRedactedOrWriteOnlyValue('')).toBe(true);
    expect(isRedactedOrWriteOnlyValue('***')).toBe(true);
    expect(isRedactedOrWriteOnlyValue('REDACTED')).toBe(true);
    expect(isRedactedOrWriteOnlyValue('••••••')).toBe(true);
    expect(isRedactedOrWriteOnlyValue('https://acme.my.salesforce.com')).toBe(false);

    const salesforceGetPayload = {
      connectorState: {
        state: 'ACTIVE',
        dataSource: 'salesforce',
        params: {
          instance_uri: 'https://acme.my.salesforce.com',
          client_id: '***',
          client_secret: 'REDACTED',
          // refresh_token completely omitted by GCP on GET
        },
      },
    };

    const res = await runAutomatedProbe(
      { type: 'OAUTH_CONFIG_VALIDITY' },
      salesforceGetPayload,
      mockConfig
    );
    expect(res.status).toBe('pass');
    expect(res.message).toContain('https://acme.my.salesforce.com');
    expect((res.details as { redactedCredentials?: string[] })?.redactedCredentials).toEqual(
      expect.arrayContaining(['client_id', 'client_secret', 'refresh_token'])
    );
  });

  it('unifies CONNECTOR_STATUS and OAUTH_CONFIG_VALIDITY with LRO rawOperations and Cloud Logging recentLogs', async () => {
    const recentIso = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    const connectorWithFailedOpAndAuthLog = {
      connectorState: {
        state: 'ACTIVE',
        dataSource: 'servicenow',
        params: {
          instance_uri: 'https://dev12345.service-now.com',
        },
      },
      rawOperations: [
        {
          name: 'projects/123/locations/global/collections/snow/operations/op-1',
          done: true,
          metadata: { updateTime: recentIso },
          error: {
            code: 7,
            message: '403 Forbidden: User lacks snc_read_only access on sys_db_object',
          },
        },
      ],
      recentLogs: [
        {
          timestamp: recentIso,
          severity: 'ERROR',
          textPayload: 'OAuth invalid_grant: token has been expired or revoked',
        },
      ],
    };

    const statusProbe = await runAutomatedProbe(
      { type: 'CONNECTOR_STATUS' },
      connectorWithFailedOpAndAuthLog,
      mockConfig
    );
    expect(statusProbe.status).toBe('fail');
    expect(statusProbe.verificationSource).toBe('DIAGNOSTICS_SIGNALS');
    expect(statusProbe.message).toContain('Sync Failures Detected');
    expect(statusProbe.remediation).toContain('ServiceNow');

    const oauthProbe = await runAutomatedProbe(
      { type: 'OAUTH_CONFIG_VALIDITY' },
      connectorWithFailedOpAndAuthLog,
      mockConfig
    );
    expect(oauthProbe.status).toBe('fail');
    expect(oauthProbe.verificationSource).toBe('DIAGNOSTICS_SIGNALS');
    expect(oauthProbe.message).toContain('403 Forbidden');
    expect(oauthProbe.remediation).toContain('ServiceNow');
  });

  it('auto-executes and hydrates automated probes on mount, renders Dual-Track summary cards, and blocks checking failing probes', async () => {
    vi.mocked(api.checkServiceAccountPermissions).mockResolvedValueOnce({
      hasAll: false,
      missing: ['bigquery.jobs.create'],
    });

    const def = getChecklistDefinition('BIGQUERY');
    const failingConnector = {
      name: 'projects/123456/locations/global/collections/bq-col/dataConnector',
      connectorState: {
        state: 'FAILED',
        dataSource: 'bigquery',
        latestRun: {
          error: { message: 'Caller does not have permission bigquery.jobs.create' },
        },
      },
      rawOperations: [],
      recentLogs: [],
    };

    render(
      <DynamicConnectorVerification
        connector={failingConnector}
        checklistDef={def}
        dataMode="INGESTION"
        config={mockConfig}
      />
    );

    // Dual-track summary cards and live diagnostics banner are rendered
    expect(screen.getByTestId('automated-probes-summary')).toBeInTheDocument();
    expect(screen.getByTestId('manual-attestation-summary')).toBeInTheDocument();
    expect(screen.getByTestId('checklist-live-diagnostics-banner')).toBeInTheDocument();

    // Wait for async IAM_PERMISSION_CHECK probe to finish alongside synchronous CONNECTOR_STATUS probe
    await waitFor(() => {
      expect(screen.getByTestId('probe-remediation-bq_iam_service_agent')).toBeInTheDocument();
    });
    expect(screen.getByTestId('probe-remediation-bq_connector_health')).toBeInTheDocument();

    // Verify failing automated probe item cannot be manually checked by clicking its label
    const statusLabel = screen.getByText(/Connector State Health/i);
    fireEvent.click(statusLabel);

    const storedRaw = localStorage.getItem(
      'gem_connector_checklist_projects_123456_locations_global_collections_bq-col_dataConnector'
    );
    expect(storedRaw).not.toBeNull();
    const stored = JSON.parse(storedRaw!);
    expect(stored.checkedItems.bq_connector_health).toBe(false);
    expect(stored.checkedItems.bq_iam_service_agent).toBe(false);
  });

  it('ignores timeless LRO operations in rawOperations so CONNECTOR_STATUS and OAUTH_CONFIG_VALIDITY do not contradict runConnectorDiagnostics (adv_1)', async () => {
    const connectorWithTimelessFailedOp = {
      connectorState: {
        state: 'ACTIVE',
        dataSource: 'ms-sharepoint',
        params: {
          tenant_id: '5ae87d26-ea67-46a2-9e69-845111b8ad75',
          instance_uri: 'https://contoso.sharepoint.com',
        },
      },
      rawOperations: [
        {
          name: 'projects/123456789/locations/global/collections/sharepoint_prod/operations/ancient-op',
          done: true,
          metadata: {},
          error: {
            code: 16,
            message: '401 Unauthorized: Historical error without metadata timestamps',
          },
        },
      ],
      recentLogs: [],
    };

    const signals = extractDiagnosticSignals(connectorWithTimelessFailedOp);
    expect(signals.hardOpFailures).toHaveLength(0);
    expect(signals.authOpErrors).toHaveLength(0);

    const statusRes = await runAutomatedProbe(
      { type: 'CONNECTOR_STATUS' },
      connectorWithTimelessFailedOp,
      mockConfig
    );
    expect(statusRes.status).toBe('pass');

    const oauthRes = await runAutomatedProbe(
      { type: 'OAUTH_CONFIG_VALIDITY' },
      connectorWithTimelessFailedOp,
      mockConfig
    );
    expect(oauthRes.status).toBe('pass');
  });

  it('downgrades unresolved Cloud Logging auth entries on an ACTIVE connector to warning in OAUTH_CONFIG_VALIDITY while failing when connector is FAILED (adv_2)', async () => {
    const recentIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const activeConnectorWithAuthLog = {
      connectorState: {
        state: 'ACTIVE',
        dataSource: 'sharepoint',
        params: {
          tenant_id: '5ae87d26-ea67-46a2-9e69-845111b8ad75',
          instance_uri: 'https://contoso.sharepoint.com',
        },
      },
      rawOperations: [],
      recentLogs: [
        {
          timestamp: recentIso,
          severity: 'ERROR',
          textPayload: '403 Forbidden: item-level permission denied on site document',
        },
      ],
    };

    const activeStatusRes = await runAutomatedProbe(
      { type: 'CONNECTOR_STATUS' },
      activeConnectorWithAuthLog,
      mockConfig
    );
    expect(activeStatusRes.status).toBe('warning');
    expect(activeStatusRes.verificationSource).toBe('DIAGNOSTICS_SIGNALS');

    const activeOAuthRes = await runAutomatedProbe(
      { type: 'OAUTH_CONFIG_VALIDITY' },
      activeConnectorWithAuthLog,
      mockConfig
    );
    expect(activeOAuthRes.status).toBe('warning');
    expect(activeOAuthRes.verificationSource).toBe('DIAGNOSTICS_SIGNALS');
    expect(activeOAuthRes.message).toContain('403 Forbidden');

    const failedConnectorWithAuthLog = {
      ...activeConnectorWithAuthLog,
      connectorState: {
        ...activeConnectorWithAuthLog.connectorState,
        state: 'FAILED',
      },
    };

    const failedOAuthRes = await runAutomatedProbe(
      { type: 'OAUTH_CONFIG_VALIDITY' },
      failedConnectorWithAuthLog,
      mockConfig
    );
    expect(failedOAuthRes.status).toBe('fail');
  });

  it('filters masked placeholder strings ("***", "REDACTED") on tenant/endpoint/MCP URIs and passes ACTIVE Microsoft connectors with redacted credentials (adv_3)', async () => {
    // 1. ACTIVE Microsoft Entra ID connector where GCP GET only returns redacted client credentials
    const activeEntraRedacted = {
      connectorState: {
        state: 'ACTIVE',
        dataSource: 'entraid',
        params: {
          client_id: '***',
          client_secret: 'REDACTED',
        },
      },
    };
    const entraRes = await runAutomatedProbe(
      { type: 'OAUTH_CONFIG_VALIDITY' },
      activeEntraRedacted,
      mockConfig
    );
    expect(entraRes.status).toBe('pass');
    expect(entraRes.message).not.toContain('tenant/instance ID: ***');

    // 2. Microsoft SharePoint connector where tenant_id and instance_uri themselves are masked placeholders
    const maskedMicrosoftParams = {
      connectorState: {
        state: 'ACTIVE',
        dataSource: 'sharepoint',
        params: {
          tenant_id: '***',
          instance_uri: 'REDACTED',
          client_id: '***',
          client_secret: 'REDACTED',
        },
      },
    };
    const maskedMsRes = await runAutomatedProbe(
      { type: 'OAUTH_CONFIG_VALIDITY' },
      maskedMicrosoftParams,
      mockConfig
    );
    expect(maskedMsRes.status).toBe('pass');
    expect(maskedMsRes.message).not.toContain('tenant/instance ID: ***');
    expect(maskedMsRes.message).not.toContain('endpoint: REDACTED');
    expect((maskedMsRes.details as { tenantOrInstanceId?: string })?.tenantOrInstanceId).toBeUndefined();
    expect((maskedMsRes.details as { hostUri?: string })?.hostUri).toBeUndefined();

    // 3. BYO_MCP connector with masked auth_uri / token_uri must warn (treating masked placeholders as missing)
    const maskedMcp = {
      connectorState: {
        state: 'ACTIVE',
        dataSource: 'custom_mcp',
        actionConfig: {
          actionParams: {
            auth_type: 'OAUTH',
            auth_uri: '***',
            token_uri: 'REDACTED',
          },
        },
      },
    };
    const maskedMcpRes = await runAutomatedProbe(
      { type: 'OAUTH_CONFIG_VALIDITY' },
      maskedMcp,
      mockConfig
    );
    expect(maskedMcpRes.status).toBe('warning');

    // 4. Unconfigured INACTIVE Microsoft connector with empty params still warns
    const unconfiguredMs = {
      connectorState: {
        state: 'INACTIVE',
        dataSource: 'sharepoint',
        params: {},
      },
    };
    const unconfiguredMsRes = await runAutomatedProbe(
      { type: 'OAUTH_CONFIG_VALIDITY' },
      unconfiguredMs,
      mockConfig
    );
    expect(unconfiguredMsRes.status).toBe('warning');
  });
});




