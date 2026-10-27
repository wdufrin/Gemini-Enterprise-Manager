/**
 * Copyright 2026 Google LLC
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
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AgentsPage from './AgentsPage';
import * as api from '../services/apiService';
import { ToastProvider } from '../context/ToastContext';

vi.mock('../services/apiService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/apiService')>();
  return {
    ...actual,
    gapiRequest: vi.fn(),
    listResources: vi.fn(),
    getAgent: vi.fn(),
    getAgentView: vi.fn(),
    getAgentIamPolicy: vi.fn(),
    setAgentIamPolicy: vi.fn(),
    updateAgent: vi.fn(),
    deployLowCodeAgent: vi.fn(),
    publishAgent: vi.fn(),
    enableAgent: vi.fn(),
    disableAgent: vi.fn(),
    withdrawAgent: vi.fn(),
    bulkEditSharePublishAgents: vi.fn(actual.bulkEditSharePublishAgents),
    getEngine: vi.fn(),
    getWidgetConfig: vi.fn(),
    listCollections: vi.fn(),
    listAuthorizations: vi.fn(),
  };
});

const sampleEngine = {
  name: 'projects/123456/locations/global/collections/default_collection/engines/eng-1',
  displayName: 'Primary Enterprise App',
  solutionType: 'SOLUTION_TYPE_GENERATIVE_CHAT' as const,
};

const sampleAgent = {
  name: 'projects/123456/locations/global/collections/default_collection/engines/eng-1/assistants/default_assistant/agents/agent-hr',
  displayName: 'HR Benefits Concierge',
  description: 'Answers employee benefits questions.',
  state: 'ENABLED' as const,
  adkAgentDefinition: {
    provisionedReasoningEngine: {
      reasoningEngine: 'projects/123456/locations/us-central1/reasoningEngines/re-1',
    },
  },
};

const sampleLowCodeAgent = {
  name: 'projects/123456/locations/global/collections/default_collection/engines/eng-1/assistants/default_assistant/agents/agent-lowcode',
  displayName: 'Sales Low-Code Assistant',
  description: 'Helps sales reps draft proposals.',
  state: 'DISABLED' as const,
  sharingConfig: { scope: 'RESTRICTED' as const },
  lowCodeAgentDefinition: {
    rootAgentId: 'root_1',
    nodes: [
      {
        id: 'root_1',
        displayName: 'Sales Root',
        llmAgentNode: {
          instruction: 'Help sales reps.',
          model: 'gemini-2.5-flash',
        },
      },
    ],
  },
};

const sampleGoogleManagedAgent = {
  name: 'projects/123456/locations/global/collections/default_collection/engines/eng-1/assistants/default_assistant/agents/deep_research',
  displayName: 'Deep Research',
  description: 'Google built-in research assistant.',
  state: 'ENABLED' as const,
  agentOrigin: 'GOOGLE',
  managedAgentDefinition: {
    researchAssistantAgentConfig: { supportLroQueries: true },
  },
};

let storageStore: Record<string, string> = {};
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: (k: string) => (k in storageStore ? storageStore[k] : null),
    setItem: (k: string, v: string) => {
      storageStore[k] = String(v);
    },
    removeItem: (k: string) => {
      delete storageStore[k];
    },
    clear: () => {
      storageStore = {};
    },
  },
  writable: true,
});

describe('AgentsPage (F5: Agent Manager, Consolidated Catalog & R2/R3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageStore = {};

    vi.mocked(api.listResources).mockImplementation(async (resourceType: string) => {
      if (resourceType === 'engines') {
        return { engines: [sampleEngine] };
      }
      if (resourceType === 'assistants') {
        return {
          assistants: [
            {
              name: `${sampleEngine.name}/assistants/default_assistant`,
              displayName: 'Default Assistant',
            },
          ],
        };
      }
      if (resourceType === 'agents') {
        return { agents: [sampleAgent] };
      }
      if (resourceType === 'dataStores') {
        return { dataStores: [] };
      }
      return {};
    });
    vi.mocked(api.getAgentView).mockResolvedValue({});
    vi.mocked(api.getAgentIamPolicy).mockResolvedValue({
      bindings: [
        {
          role: 'roles/discoveryengine.owner',
          members: ['user:hr-owner@example.com'],
        },
      ],
    });
    vi.mocked(api.listCollections).mockResolvedValue({ collections: [] });
  });

  const renderPage = () =>
    render(
      <ToastProvider>
        <AgentsPage
          projectNumber="123456"
          setProjectNumber={vi.fn()}
          accessToken="mock-access-token"
        />
      </ToastProvider>
    );

  it('renders registered agents list on mount', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('HR Benefits Concierge')).toBeInTheDocument();
    });
  });

  it('surfaces background getAgentView hydration failures in agents-hydration-warning alert banner', async () => {
    vi.mocked(api.getAgentView).mockRejectedValueOnce(
      new Error('403 PERMISSION_DENIED on getAgentView')
    );

    renderPage();

    const warningAlert = await screen.findByTestId('agents-hydration-warning');
    expect(warningAlert.textContent).toMatch(/HR Benefits Concierge/i);
    expect(warningAlert.textContent).toMatch(/403 PERMISSION_DENIED on getAgentView/i);
  });

  it('fetches per-agent :getIamPolicy to display roles/discoveryengine.owner in Agent Owner column, allows showing/hiding columns, and opens Export / BQ Script modal', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('HR Benefits Concierge')).toBeInTheDocument();
    });

    // Verify per-agent :getIamPolicy was invoked and Agent Owner column renders roles/discoveryengine.owner member
    expect(api.getAgentIamPolicy).toHaveBeenCalledWith(
      sampleAgent.name,
      expect.objectContaining({ projectId: '123456' })
    );
    expect(screen.getByText('Agent Owner')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('hr-owner@example.com')).toBeInTheDocument();
    });

    // Open Column Visibility menu and toggle Description column ON and Agent ID column OFF
    const columnsButton = screen.getByRole('button', { name: /Toggle table columns/i });
    fireEvent.click(columnsButton);

    const descCheckbox = screen.getByLabelText('Description');
    fireEvent.click(descCheckbox);
    expect(screen.getByText('Answers employee benefits questions.')).toBeInTheDocument();

    const agentIdCheckbox = screen.getByLabelText('Agent ID');
    fireEvent.click(agentIdCheckbox);
    expect(screen.queryByText('agent-hr')).not.toBeInTheDocument();

    // Open Export / BQ Script modal and verify scripts are generated with sanitized config
    const exportBtn = screen.getByRole('button', { name: /Export \/ BQ Script/i });
    fireEvent.click(exportBtn);

    expect(
      screen.getByText(/Export Registered Agents & Automation Scripts/i)
    ).toBeInTheDocument();

    const bqTab = screen.getByRole('button', {
      name: /3\. Python Script \(BigQuery Export\)/i,
    });
    fireEvent.click(bqTab);

    expect(screen.getByText(/insert_rows_json/i)).toBeInTheDocument();
  });

  it('serializes export rows accurately and neutralizes hostile SQL/shell characters in generated scripts', async () => {
    const {
      buildAgentRegistryExportRows,
      serializeAgentRegistryCsv,
      serializeAgentRegistryJsonl,
      generateBigQueryExportScript,
      generateCurlAndBqCliScript,
    } = await import('../components/agents/ExportAgentRegistryModal');

    const rows = buildAgentRegistryExportRows([
      {
        ...sampleAgent,
        description: 'Contains "quotes", commas, and\nnewlines',
        lowCodeAgentDefinition: {
          ownerName: 'sec-owner@example.com',
        },
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].agent_owner).toBe('sec-owner@example.com');
    expect(rows[0].agent_id).toBe('agent-hr');

    const csv = serializeAgentRegistryCsv(rows);
    expect(csv).toContain('"Contains ""quotes"", commas, and\nnewlines"');
    expect(csv).toContain('sec-owner@example.com');

    const jsonl = serializeAgentRegistryJsonl(rows);
    const parsed = JSON.parse(jsonl.trim());
    expect(parsed.agent_owner).toBe('sec-owner@example.com');

    // Adversarial test: hostile datasetId / tableId / projectId with shell/SQL injection characters
    const bqScript = generateBigQueryExportScript(
      {
        projectId: 'my-proj"; rm -rf / #',
        appLocation: 'global',
        collectionId: 'default_collection',
        appId: 'engine-1',
        assistantId: 'default_assistant',
      },
      'bad_dataset; DROP TABLE x;',
      'bad_table`whoami`'
    );
    expect(bqScript).not.toContain('; DROP TABLE');
    expect(bqScript).not.toContain('rm -rf');
    expect(bqScript).toContain('BQ_DATASET = "bad_datasetDROPTABLEx"');
    expect(bqScript).toContain('BQ_TABLE = "bad_tablewhoami"');

    const shellScript = generateCurlAndBqCliScript(
      {
        projectId: 'my-proj$( evil )',
        appLocation: 'global',
        collectionId: 'default_collection',
        appId: 'engine-1',
        assistantId: 'default_assistant',
      },
      'ds$(id)',
      'tbl;ls'
    );
    expect(shellScript).not.toContain('$( evil )');
    expect(shellScript).not.toContain('$(id)');
    expect(shellScript).toContain('BQ_DATASET="dsid"');
    expect(shellScript).toContain('BQ_TABLE="tblls"');
  });

  it('opens the 3-step Bulk Edit / Share / Publish Wizard, supports per-agent owner & metadata remapping (manual + CSV upload), rejects malformed principals, and executes bulk updates', async () => {
    vi.mocked(api.listResources).mockImplementation(async (resourceType: string) => {
      if (resourceType === 'engines') return { engines: [sampleEngine] };
      if (resourceType === 'assistants') {
        return {
          assistants: [
            {
              name: `${sampleEngine.name}/assistants/default_assistant`,
              displayName: 'Default Assistant',
            },
          ],
        };
      }
      if (resourceType === 'agents') {
        return { agents: [sampleAgent, sampleLowCodeAgent, sampleGoogleManagedAgent] };
      }
      return {};
    });

    vi.mocked(api.bulkEditSharePublishAgents).mockResolvedValueOnce({
      total: 2,
      updated: 2,
      skipped: 0,
      failed: 0,
      outcomes: [
        {
          agentName: sampleAgent.name,
          displayName: sampleAgent.displayName,
          status: 'updated',
          actionsApplied: [
            'Transferred agent owner to user:hr-new-lead@example.com (:transferAgentOwner)',
            'Updated description (prefix)',
            'Set sharing scope to ALL_USERS',
            'Granted roles/discoveryengine.agentUser (2 principals)',
          ],
        },
        {
          agentName: sampleLowCodeAgent.name,
          displayName: sampleLowCodeAgent.displayName,
          status: 'updated',
          actionsApplied: [
            'Transferred agent owner to user:sales-lead@example.com (:transferAgentOwner)',
            'Updated description (per-agent override)',
            'Deployed Low-Code draft (:deployLowCode)',
            'Set sharing scope to ALL_USERS',
            'Granted roles/discoveryengine.agentUser (2 principals)',
            'Enabled agent (:enableAgent)',
          ],
        },
      ],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Sales Low-Code Assistant')).toBeInTheDocument();
    });

    // Click Bulk Edit / Share / Publish button in AgentList toolbar
    const openBulkBtn = screen.getByTestId('open-bulk-edit-share-publish-btn');
    fireEvent.click(openBulkBtn);

    const modal = await screen.findByTestId('bulk-edit-share-publish-modal');
    expect(modal).toBeInTheDocument();

    // STEP 1: Select Agents panel is shown first
    expect(screen.getByTestId('wizard-step-1-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('wizard-next-to-step-2-btn'));

    // STEP 2: Choose What to Edit panel is shown
    expect(screen.getByTestId('wizard-step-2-panel')).toBeInTheDocument();
    // Owner, Sharing, and Publish are selected by default; also enable Metadata (Display Names & Descriptions)
    fireEvent.click(screen.getByTestId('wizard-module-card-metadata'));
    fireEvent.click(screen.getByTestId('wizard-next-to-step-3-btn'));

    // STEP 3: Make Edits & Apply panel is shown with Owner Remapping table (Agent | Current Owner | New Owner)
    expect(screen.getByTestId('wizard-step-3-panel')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-editor-owner')).toBeInTheDocument();

    // Negative test 1: Enter an invalid group: owner in the per-agent New Owner input and verify validation rejects it
    const hrOwnerInput = screen.getByTestId('modal-owner-remap-input-agent-hr');
    fireEvent.change(hrOwnerInput, { target: { value: 'group:cannot-own-agent@example.com' } });

    const submitBtn = screen.getByTestId('execute-bulk-edit-share-publish-btn');
    fireEvent.click(submitBtn);

    const ownerAlert = await screen.findByRole('alert');
    expect(ownerAlert.textContent).toMatch(/HR Benefits Concierge.*Agent ownership can only be transferred to a single user identity/i);
    expect(api.bulkEditSharePublishAgents).not.toHaveBeenCalled();

    // Fix per-agent owner for agent-hr manually, and upload a CSV to auto-fill agent-lowcode owner & description
    fireEvent.change(hrOwnerInput, { target: { value: 'hr-new-lead@example.com' } });

    const csvContent = [
      'agent_id,new_owner,new_description',
      'agent-lowcode,sales-lead@example.com,"CSV custom description for Sales Low-Code"',
    ].join('\n');
    const csvFile = new File([csvContent], 'remap.csv', { type: 'text/csv' });
    Object.defineProperty(csvFile, 'text', {
      value: async () => csvContent,
    });
    const csvInput = screen.getByTestId('modal-owner-remap-csv-input');
    fireEvent.change(csvInput, { target: { files: [csvFile] } });

    await waitFor(() => {
      const lowCodeOwnerInput = screen.getByTestId('modal-owner-remap-input-agent-lowcode') as HTMLInputElement;
      expect(lowCodeOwnerInput.value).toBe('user:sales-lead@example.com');
    });

    // Negative test 2: Enter a malformed IAM principal and verify validation rejects it
    const principalsInput = screen.getByLabelText(/Grant IAM Principals/i);
    fireEvent.change(principalsInput, { target: { value: 'not-an-email-or-principal' } });
    fireEvent.click(submitBtn);

    const iamAlert = await screen.findByRole('alert');
    expect(iamAlert.textContent).toMatch(/Invalid IAM principal/i);
    expect(api.bulkEditSharePublishAgents).not.toHaveBeenCalled();

    // Fix IAM principal, set sharingScope to ALL_USERS, description prefix, and Enable lifecycle
    fireEvent.change(principalsInput, {
      target: { value: 'sales-team@example.com, group:managers@example.com' },
    });

    const allUsersRadio = screen.getByDisplayValue('ALL_USERS');
    fireEvent.click(allUsersRadio);

    const descModeSelect = screen.getByLabelText(/Description Update Mode/i);
    fireEvent.change(descModeSelect, { target: { value: 'PREFIX' } });

    const descTextInput = screen.getByLabelText(/Description Text/i);
    fireEvent.change(descTextInput, { target: { value: '[Verified]' } });

    const lifecycleSelect = screen.getByLabelText(/Agent Status \(Enable \/ Disable\)/i);
    fireEvent.change(lifecycleSelect, { target: { value: 'ENABLE' } });

    fireEvent.click(submitBtn);

    // Wait for bulk execution report to render
    const reportBox = await screen.findByTestId('bulk-edit-share-publish-report');
    expect(reportBox.textContent).toMatch(/2 Updated/i);
    expect(reportBox.textContent).toMatch(/Transferred agent owner/i);

    // Verify bulkEditSharePublishAgents was invoked with per-agent owner & description remaps + uniform rules
    expect(api.bulkEditSharePublishAgents).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: sampleAgent.name }),
        expect.objectContaining({ name: sampleLowCodeAgent.name }),
      ]),
      expect.objectContaining({
        ownerRemapByAgent: {
          [sampleAgent.name]: 'hr-new-lead@example.com',
          [sampleLowCodeAgent.name]: 'user:sales-lead@example.com',
        },
        descriptionRemapByAgent: {
          [sampleLowCodeAgent.name]: 'CSV custom description for Sales Low-Code',
        },
        publishDrafts: true,
        lifecycleAction: 'ENABLE',
        sharingScope: 'ALL_USERS',
        sharedPrincipals: ['sales-team@example.com', 'group:managers@example.com'],
        descriptionMode: 'PREFIX',
        descriptionText: '[Verified]',
      }),
      expect.objectContaining({ projectId: '123456' })
    );
  });

  it('rejects empty agent list or missing description text in bulkEditSharePublishAgents and protects Google-managed agents', async () => {
    const mockConfig = {
      projectId: '123456',
      appLocation: 'global',
      collectionId: 'default_collection',
      appId: 'eng-1',
      assistantId: 'default_assistant',
    };

    await expect(
      api.bulkEditSharePublishAgents([], { publishDrafts: true }, mockConfig)
    ).rejects.toThrow(/At least one agent must be selected/i);

    await expect(
      api.bulkEditSharePublishAgents(
        [sampleAgent],
        { descriptionMode: 'REPLACE', descriptionText: '   ' },
        mockConfig
      )
    ).rejects.toThrow(/Description text is required/i);

    // Google-managed agent is skipped when metadata/sharing mutations are requested without lifecycle toggle
    const googleRes = await api.bulkEditSharePublishAgents(
      [sampleGoogleManagedAgent],
      { sharingScope: 'RESTRICTED', publishDrafts: true },
      mockConfig
    );
    expect(googleRes.skipped).toBe(1);
    expect(googleRes.updated).toBe(0);
    expect(googleRes.outcomes[0].warning).toMatch(/Google-managed built-in agent/i);
  });

  it('renders the Bulk Update workspace broken into 3 sections (IAM, Settings, Datastores), preserves all selected custom agents, validates IAM principals, and executes IAM & Settings bulk updates', async () => {
    vi.mocked(api.listResources).mockImplementation(async (resourceType: string) => {
      if (resourceType === 'engines') return { engines: [sampleEngine] };
      if (resourceType === 'assistants') {
        return {
          assistants: [
            {
              name: `${sampleEngine.name}/assistants/default_assistant`,
              displayName: 'Default Assistant',
            },
          ],
        };
      }
      if (resourceType === 'agents') {
        return { agents: [sampleAgent, sampleLowCodeAgent, sampleGoogleManagedAgent] };
      }
      return {};
    });

    vi.mocked(api.getAgent).mockImplementation(async (name: string) => {
      if (name === sampleLowCodeAgent.name) return sampleLowCodeAgent;
      return sampleAgent;
    });

    vi.mocked(api.bulkEditSharePublishAgents).mockResolvedValueOnce({
      total: 2,
      updated: 2,
      skipped: 0,
      failed: 0,
      outcomes: [
        {
          agentName: sampleAgent.name,
          displayName: sampleAgent.displayName,
          status: 'updated',
          actionsApplied: ['Set sharing scope to ALL_USERS', 'Enabled observability'],
        },
        {
          agentName: sampleLowCodeAgent.name,
          displayName: sampleLowCodeAgent.displayName,
          status: 'updated',
          actionsApplied: [
            'Deployed Low-Code draft (:deployLowCode)',
            'Set sharing scope to ALL_USERS',
            'Enabled observability',
          ],
        },
      ],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('HR Benefits Concierge')).toBeInTheDocument();
      expect(screen.getByText('Sales Low-Code Assistant')).toBeInTheDocument();
    });

    // Select both custom agents in AgentList and click "Bulk Update Selected (2)"
    const selectAllCheckbox = screen.getByLabelText(/Select all agents/i);
    fireEvent.click(selectAllCheckbox);

    const openBulkWorkspaceBtn = screen.getByTestId('open-bulk-update-selected-btn');
    expect(openBulkWorkspaceBtn.textContent).toMatch(/Bulk Update Selected \(2\)/i);
    fireEvent.click(openBulkWorkspaceBtn);

    // Verify all 3 sections render inside the Bulk Update workspace
    const iamSection = await screen.findByTestId('bulk-panel-section-iam');
    const settingsSection = screen.getByTestId('bulk-panel-section-settings');
    const datasourcesSection = screen.getByTestId('bulk-panel-section-datasources');
    expect(iamSection).toBeInTheDocument();
    expect(settingsSection).toBeInTheDocument();
    expect(datasourcesSection).toBeInTheDocument();

    // Verify section filter tabs toggle visibility between sections
    fireEvent.click(screen.getByTestId('bulk-section-tab-iam'));
    expect(screen.getByTestId('bulk-panel-section-iam')).toBeInTheDocument();
    expect(screen.queryByTestId('bulk-panel-section-settings')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bulk-panel-section-datasources')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('bulk-section-tab-all'));
    expect(screen.getByTestId('bulk-panel-section-settings')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-panel-section-datasources')).toBeInTheDocument();

    // Verify both selected agents (ADK + Low-Code) are retained in the workspace selection
    const executeIamSettingsBtn = screen.getByTestId('execute-bulk-iam-settings-btn');
    expect(executeIamSettingsBtn.textContent).toMatch(/Execute IAM & Settings Update on 2 Agent\(s\)/i);

    // Negative test: enter a malformed IAM principal in Section 1 and verify it is rejected
    const principalsTextarea = screen.getByLabelText(/Grant agentUser IAM Principals/i);
    fireEvent.change(principalsTextarea, { target: { value: 'invalid-principal-without-email' } });
    fireEvent.click(executeIamSettingsBtn);

    await waitFor(() => {
      expect(screen.getAllByText(/Invalid IAM principal/i).length).toBeGreaterThan(0);
    });
    expect(api.bulkEditSharePublishAgents).not.toHaveBeenCalled();

    // Configure valid Section 1 (IAM) & Section 2 (Settings) updates and execute
    fireEvent.change(principalsTextarea, { target: { value: 'user:alice@example.com' } });
    fireEvent.click(screen.getByTestId('bulk-iam-publish-drafts-checkbox'));
    fireEvent.change(screen.getByLabelText(/Target Sharing Scope/i), {
      target: { value: 'ALL_USERS' },
    });
    fireEvent.change(screen.getByLabelText(/Observability Telemetry/i), {
      target: { value: 'ENABLE' },
    });

    fireEvent.click(executeIamSettingsBtn);

    const report = await screen.findByTestId('iam-settings-execution-report');
    expect(report.textContent).toMatch(/2 updated/i);
    expect(api.bulkEditSharePublishAgents).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: sampleAgent.name }),
        expect.objectContaining({ name: sampleLowCodeAgent.name }),
      ]),
      expect.objectContaining({
        publishDrafts: true,
        sharingScope: 'ALL_USERS',
        sharedPrincipals: ['user:alice@example.com'],
        observabilityEnabled: 'ENABLE',
      }),
      expect.objectContaining({ projectId: '123456' })
    );
  });

  it('displays a loading spinner in the Refresh Agents button while agents are loading/hydrating and discards stale global region responses when switching to us region mid-flight', async () => {
    let resolveGlobalAgents!: (val: { agents: typeof sampleAgent[] }) => void;
    const globalAgentsDeferred = new Promise<{ agents: typeof sampleAgent[] }>((resolve) => {
      resolveGlobalAgents = resolve;
    });

    const usEngine = {
      name: 'projects/123456/locations/us/collections/default_collection/engines/eng-us',
      displayName: 'US Regional Enterprise App',
      solutionType: 'SOLUTION_TYPE_GENERATIVE_CHAT' as const,
    };
    const usAgent = {
      name: 'projects/123456/locations/us/collections/default_collection/engines/eng-us/assistants/default_assistant/agents/agent-us-1',
      displayName: 'US Regional Agent',
      description: 'Agent in US region.',
      state: 'ENABLED' as const,
      adkAgentDefinition: {
        provisionedReasoningEngine: {
          reasoningEngine: 'projects/123456/locations/us-central1/reasoningEngines/re-us',
        },
      },
    };

    vi.mocked(api.listResources).mockImplementation(async (resourceType: string, cfg: unknown) => {
      const loc = (cfg as { appLocation?: string })?.appLocation;
      if (resourceType === 'engines') {
        return loc === 'us' ? { engines: [usEngine] } : { engines: [sampleEngine] };
      }
      if (resourceType === 'assistants') {
        const engName = loc === 'us' ? usEngine.name : sampleEngine.name;
        return {
          assistants: [
            {
              name: `${engName}/assistants/default_assistant`,
              displayName: 'Default Assistant',
            },
          ],
        };
      }
      if (resourceType === 'agents') {
        if (loc === 'global') {
          return globalAgentsDeferred;
        }
        return { agents: [usAgent] };
      }
      return {};
    });

    renderPage();

    // While global agents are still loading, Refresh Agents button should show spinner and be disabled
    const refreshBtn = await screen.findByTestId('refresh-agents-btn');
    await waitFor(() => {
      expect(screen.getByTestId('refresh-agents-spinner')).toBeInTheDocument();
      expect(refreshBtn).toBeDisabled();
      expect(refreshBtn.textContent).toMatch(/Loading Agents/i);
    });

    // User switches Location from 'global' to 'us' BEFORE global agents finish loading
    const locationSelect = screen.getByDisplayValue('global');
    fireEvent.change(locationSelect, { target: { name: 'appLocation', value: 'us' } });

    // US Regional Agent loads
    await waitFor(() => {
      expect(screen.getByText('US Regional Agent')).toBeInTheDocument();
    });

    // Now the slow global agents request finally resolves late
    resolveGlobalAgents({ agents: [sampleAgent] });

    // Wait a tick and verify the stale global agent ("HR Benefits Concierge") did NOT overwrite the US region list
    await waitFor(() => {
      expect(screen.getByText('US Regional Agent')).toBeInTheDocument();
      expect(screen.queryByText('HR Benefits Concierge')).not.toBeInTheDocument();
    });
  });
});




