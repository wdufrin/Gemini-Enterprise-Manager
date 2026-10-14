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
    listResources: vi.fn(),
    getAgent: vi.fn(),
    getAgentView: vi.fn(),
    getAgentIamPolicy: vi.fn(),
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
});

