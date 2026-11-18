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
import AssistantPage from './AssistantPage';
import * as api from '../services/apiService';
import { ToastProvider } from '../context/ToastContext';

vi.mock('../services/apiService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/apiService')>();
  return {
    ...actual,
    listResources: vi.fn(),
    getEngine: vi.fn(),
    getAssistant: vi.fn(),
    getAclConfig: vi.fn(),
    checkDataStoreAclSupport: vi.fn(),
    getWidgetConfig: vi.fn(),
    listDiscoveryAgents: vi.fn(),
    listCollections: vi.fn(),
    listAuthorizations: vi.fn(),
  };
});

const sampleEngine = {
  name: 'projects/123456/locations/global/collections/default_collection/engines/enterprise-app-1',
  displayName: 'Enterprise Search & Assistant App',
  solutionType: 'SOLUTION_TYPE_SEARCH' as const,
  appType: 'APP_TYPE_INTRANET',
  dataStoreIds: ['ds-hr-1'],
};

const sampleAssistant = {
  name: 'projects/123456/locations/global/collections/default_collection/engines/enterprise-app-1/assistants/default_assistant',
  displayName: 'Default Assistant',
  webGroundingType: 'WEB_GROUNDING_TYPE_GOOGLE_SEARCH',
  generationConfig: {
    systemInstruction: {
      additionalSystemInstruction: 'Always cite internal HR policy documents.',
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

describe('AssistantPage (F4: Playground, Engine/Assistant Management & R2/R3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageStore = {};

    vi.mocked(api.listResources).mockImplementation(async (resourceType: string) => {
      if (resourceType === 'engines') {
        return { engines: [sampleEngine] };
      }
      if (resourceType === 'assistants') {
        return { assistants: [sampleAssistant] };
      }
      if (resourceType === 'agents') {
        return { agents: [] };
      }
      if (resourceType === 'dataStores') {
        return { dataStores: [] };
      }
      return {};
    });
    vi.mocked(api.getEngine).mockResolvedValue(sampleEngine);
    vi.mocked(api.getAssistant).mockResolvedValue(sampleAssistant);
    vi.mocked(api.getAclConfig).mockResolvedValue({ name: 'aclConfig' } as never);
    vi.mocked(api.checkDataStoreAclSupport).mockResolvedValue(true);
    vi.mocked(api.getWidgetConfig).mockResolvedValue({ name: 'widgetConfig' } as never);
    vi.mocked(api.listCollections).mockResolvedValue({ collections: [] });
  });

  const renderPage = (props?: Partial<React.ComponentProps<typeof AssistantPage>>) =>
    render(
      <ToastProvider>
        <AssistantPage
          projectNumber="123456"
          setProjectNumber={vi.fn()}
          accessToken="mock-access-token"
          userProfile={null}
          {...props}
        />
      </ToastProvider>
    );

  it('renders engine list and opens detail view when an engine row is selected', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Enterprise Search & Assistant App')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /View \/ Edit/i }));

    await waitFor(() => {
      expect(api.checkDataStoreAclSupport).toHaveBeenCalled();
    });
  });

  it('surfaces non-404 getAclConfig and agent discovery failures in assistant-diagnostics-warning alert banner', async () => {
    vi.mocked(api.checkDataStoreAclSupport).mockRejectedValueOnce(
      new Error('403 PERMISSION_DENIED: missing discoveryengine.aclConfigs.get')
    );
    vi.mocked(api.listResources).mockImplementation(async (resourceType: string) => {
      if (resourceType === 'engines') {
        return { engines: [sampleEngine] };
      }
      if (resourceType === 'assistants') {
        return { assistants: [sampleAssistant] };
      }
      if (resourceType === 'agents') {
        throw new Error('500 Internal error listing agents');
      }
      return {};
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Enterprise Search & Assistant App')).toBeInTheDocument();
    });

    // Click View / Edit on engine row to trigger handleSelectRow -> checkDataStoreAclSupport + fetchAgentsForAssistant
    fireEvent.click(screen.getByRole('button', { name: /View \/ Edit/i }));

    const warningAlert = await screen.findByTestId('assistant-diagnostics-warning');
    expect(warningAlert.textContent).toMatch(/403 PERMISSION_DENIED/i);
    expect(warningAlert.textContent).toMatch(/500 Internal error listing agents/i);
  });

  it('opens the Assistant Evaluation Modal from the table Evaluate button and allows deploying a recommended skill', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Enterprise Search & Assistant App')).toBeInTheDocument();
    });

    const evalBtn = screen.getByTestId('evaluate-assistant-row-enterprise-app-1');
    fireEvent.click(evalBtn);

    const modal = await screen.findByTestId('assistant-evaluation-modal');
    expect(modal).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('eval-overall-score')).toBeInTheDocument();
      expect(screen.getByTestId('eval-latency-risk-badge')).toBeInTheDocument();
    });

    // Passing checks must be hidden from the Diagnostic Findings list and severity dropdown
    expect(screen.queryByText('PASS')).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Passed/i })).not.toBeInTheDocument();

    // Switch to Recommended Query-Routing Skills tab
    fireEvent.click(screen.getByTestId('eval-tab-skills'));
    expect(screen.getByText(/1-Click Query Optimization & DataStore Routing Skills/i)).toBeInTheDocument();
    const deployBtn = screen.getByRole('button', { name: /Create Organizational Skill \(1-Click\)/i });
    expect(deployBtn).toBeInTheDocument();

    // Exercise 1-Click Skill deployment and verify createSkillAgent is invoked with ALL_USERS scope
    const createSkillSpy = vi.spyOn(api, 'createSkillAgent').mockResolvedValueOnce({
      name: 'projects/123456/locations/global/collections/default_collection/engines/enterprise-app-1/assistants/default_assistant/agents/skill-enterprise-datastore-router',
      displayName: 'Enterprise DataStore Query Router and Optimizer',
      state: 'ENABLED',
      sharingConfig: { scope: 'ALL_USERS' },
    } as never);

    fireEvent.click(deployBtn);

    await waitFor(() => {
      expect(createSkillSpy).toHaveBeenCalledTimes(1);
    });
    expect(createSkillSpy.mock.calls[0][0]).toMatchObject({
      displayName: 'Enterprise DataStore Query Router and Optimizer',
      state: 'ENABLED',
    });
    expect(createSkillSpy.mock.calls[0][2]).toBe('enterprise-datastore-query-optimizer');
    expect(createSkillSpy.mock.calls[0][3]).toBe(true);
  });

  it('keeps View / Edit pinned in sticky right Actions column, supports responsive column customization, maintains cell parity for unconfigured assistants, and blocks hiding the final column', async () => {
    const engineWithoutAssistant = {
      name: 'projects/123456/locations/global/collections/default_collection/engines/orphan-search-app',
      displayName: 'Orphan Search Engine',
      solutionType: 'SOLUTION_TYPE_SEARCH' as const,
    };

    vi.mocked(api.listResources).mockImplementation(async (resourceType: string) => {
      if (resourceType === 'engines') {
        return { engines: [sampleEngine, engineWithoutAssistant] };
      }
      if (resourceType === 'assistants') {
        return { assistants: [sampleAssistant] };
      }
      return {};
    });

    renderPage();

    const tableRegion = await screen.findByRole('region', {
      name: /Gemini Enterprise Engines table/i,
    });
    expect(tableRegion).toHaveClass('gem-table-container');

    // Actions header and action cells must carry sticky right positioning classes
    const headerCells = tableRegion.querySelectorAll('thead th');
    expect(headerCells.length).toBe(8);
    expect(headerCells[headerCells.length - 1]).toHaveClass('gem-sticky-action-th');

    // Secondary headers carry container-query responsive classes by default
    const engineIdTh = screen.getByRole('button', { name: /Sort by Engine ID/i }).closest('th')!;
    const vertexAgentsTh = screen.getByRole('button', { name: /Sort by Vertex Agents/i }).closest('th')!;
    expect(engineIdTh).toHaveClass('gem-col-xl');
    expect(vertexAgentsTh).toHaveClass('gem-col-2xl');

    // Both configured and unconfigured assistant rows must have exact column count parity with thead (no broken colSpan)
    const bodyRows = tableRegion.querySelectorAll('tbody tr');
    expect(bodyRows.length).toBe(2);
    bodyRows.forEach((row) => {
      const cells = row.querySelectorAll('td');
      expect(cells.length).toBe(headerCells.length);
      expect(cells[cells.length - 1]).toHaveClass('gem-sticky-action-td');
    });

    // Open Columns customizer and click "Show All" to pin responsive columns open
    fireEvent.click(screen.getByRole('button', { name: /Customize engine table columns/i }));
    fireEvent.click(screen.getByRole('button', { name: /Show All/i }));
    expect(engineIdTh).not.toHaveClass('gem-col-xl');
    expect(vertexAgentsTh).not.toHaveClass('gem-col-2xl');

    // Reset Auto restores container-query responsive classes
    fireEvent.click(screen.getByRole('button', { name: /Reset Auto/i }));
    expect(engineIdTh).toHaveClass('gem-col-xl');
    expect(vertexAgentsTh).toHaveClass('gem-col-2xl');

    // Adversarial check: attempt to uncheck all 7 data columns; the last remaining column must refuse to uncheck
    const checkboxes = tableRegion.parentElement!.querySelectorAll(
      'input[type="checkbox"]',
    ) as NodeListOf<HTMLInputElement>;
    expect(checkboxes.length).toBe(7);
    checkboxes.forEach((cb) => fireEvent.click(cb));

    const remainingHeaders = tableRegion.querySelectorAll('thead th');
    // 1 surviving data column + 1 sticky Actions column = 2 columns
    expect(remainingHeaders.length).toBe(2);
    tableRegion.querySelectorAll('tbody tr').forEach((row) => {
      expect(row.querySelectorAll('td').length).toBe(2);
    });

    // View / Edit remains accessible and clickable for every row even in minimal 2-column layout
    const viewEditBtns = screen.getAllByRole('button', { name: /View \/ Edit/i });
    expect(viewEditBtns.length).toBe(2);
    viewEditBtns.forEach((btn) => {
      expect(btn.closest('td')).toHaveClass('gem-sticky-action-td');
    });
    fireEvent.click(viewEditBtns[0]);
    expect(await screen.findByRole('button', { name: /Evaluate Config/i })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Enterprise Search & Assistant App' }),
    ).toBeInTheDocument();
  });
});

