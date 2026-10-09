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
});
