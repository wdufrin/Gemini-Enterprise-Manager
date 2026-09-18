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
import { runAutomatedProbe } from './probeRunner';
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
    expect(detectConnectorVendor({ name: 'confluence-docs' })).toBe('CONFLUENCE');
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

  it('contains at least 35 vendors with authentic categories in getAllVendors()', () => {
    const vendors = getAllVendors();
    expect(vendors.length).toBeGreaterThanOrEqual(35);
    expect(vendors.some((v) => v.id === 'GCP_PEOPLE')).toBe(true);
    expect(vendors.some((v) => v.id === 'BYO_MCP')).toBe(true);
    expect(vendors.some((v) => v.id === 'JIRA')).toBe(true);
    expect(vendors.some((v) => v.id === 'AIRTABLE')).toBe(true);
    expect(vendors.some((v) => v.id === 'STRIPE')).toBe(true);
    expect(vendors.some((v) => v.id === 'BIGQUERY')).toBe(true);
    expect(vendors.some((v) => v.id === 'GCS')).toBe(true);

    const validCategories = [
      'Google First-Party & MCP',
      'Enterprise Platforms',
      'Productivity & Tasks',
      'Customer Support & CRM',
      'Universal Fallback',
    ];
    for (const v of vendors) {
      expect(validCategories).toContain(v.category);
    }
  });

  it('validates dedicated pre-flight checklists for newly added connectors', () => {
    const newVendors = ['AIRTABLE', 'STRIPE', 'INTERCOM', 'FRESHSERVICE', 'MIRO', 'SMARTSHEET', 'BIGQUERY', 'GCS', 'GCAL', 'GCHAT'];
    for (const vendorId of newVendors) {
      const def = getChecklistDefinition(vendorId);
      expect(def.vendorId).toBe(vendorId);
      expect(def.sections.length).toBeGreaterThanOrEqual(2);
      expect(def.sections[0].items.length).toBeGreaterThan(0);
      expect(def.documentationUrl).toContain('google.com');
    }
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
    expect(screen.getByText(/Pre-Flight Readiness Progress/i)).toBeInTheDocument();

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

  it('unchecking Hide Unused reveals all 35+ connectors grouped by optgroup categories', () => {
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
    expect(optgroups.length).toBeGreaterThanOrEqual(4);

    const options = select.querySelectorAll('option');
    expect(options.length).toBeGreaterThanOrEqual(35);

    // Verify key categories exist as optgroups
    const groupLabels = Array.from(optgroups).map((og) => og.getAttribute('label'));
    expect(groupLabels).toContain('Google First-Party & MCP');
    expect(groupLabels).toContain('Enterprise Platforms');
    expect(groupLabels).toContain('Productivity & Tasks');
    expect(groupLabels).toContain('Customer Support & CRM');
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
});



