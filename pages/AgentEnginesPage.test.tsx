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
import AgentEnginesPage from './AgentEnginesPage';
import EngineDetails from '../components/agent-engines/EngineDetails';
import DirectQueryChatWindow from '../components/agent-engines/DirectQueryChatWindow';
import * as api from '../services/apiService';
import { Config, ReasoningEngine } from '../types';

vi.mock('../services/apiService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/apiService')>();
  return {
    ...actual,
    listReasoningEngines: vi.fn(),
    getReasoningEngine: vi.fn(),
    listReasoningEngineSessions: vi.fn(),
    deleteReasoningEngineSession: vi.fn(),
    listCloudRunServices: vi.fn(),
    listResources: vi.fn(),
    streamQueryReasoningEngine: vi.fn(),
  };
});

const mockConfig: Config = {
  projectId: 'test-proj-123',
  appLocation: 'global',
  collectionId: 'default_collection',
  appId: 'eng-1',
  assistantId: 'default_assistant',
  reasoningEngineLocation: 'us-central1',
};

const sampleReasoningEngine: ReasoningEngine = {
  name: 'projects/test-proj-123/locations/us-central1/reasoningEngines/987654321',
  displayName: 'SupplyChain_ADK_Runtime',
  createTime: '2026-01-15T10:00:00Z',
  updateTime: '2026-01-15T11:00:00Z',
  spec: {
    agentFramework: 'google-adk',
    packageSpec: {
      pythonVersion: '3.12',
      pickleObjectGcsUri: 'gs://staging-bucket/agent.pkl',
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

describe('AgentEnginesPage, EngineDetails & DirectQueryChatWindow (F6: Module 5 Agent Runtimes)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageStore = {};
    Element.prototype.scrollIntoView = vi.fn();

    vi.mocked(api.listReasoningEngines).mockResolvedValue({
      reasoningEngines: [sampleReasoningEngine],
    });
    vi.mocked(api.listCloudRunServices).mockResolvedValue({ services: [] });
    vi.mocked(api.listResources).mockResolvedValue({ agents: [], engines: [] });
    vi.mocked(api.getReasoningEngine).mockResolvedValue(sampleReasoningEngine);
    vi.mocked(api.listReasoningEngineSessions).mockResolvedValue({
      sessions: [
        {
          name: `${sampleReasoningEngine.name}/sessions/sess-abc`,
        },
      ],
    });
  });

  it('renders AgentEnginesPage with project configuration and disambiguation guidance', async () => {
    render(
      <AgentEnginesPage
        projectNumber="test-proj-123"
        accessToken="test-token"
        onDirectQuery={vi.fn()}
      />
    );

    expect(screen.getByText('Configuration')).toBeInTheDocument();
    expect(await screen.findByText('SupplyChain_ADK_Runtime')).toBeInTheDocument();
  });

  it('auto-fetches active sessions on mount in EngineDetails and surfaces session fetch errors with Retry', async () => {
    const { unmount } = render(
      <EngineDetails
        engine={sampleReasoningEngine}
        usingAgents={[
          {
            name: 'projects/test-proj-123/locations/global/collections/default_collection/engines/eng-1/assistants/default_assistant/agents/ag-1',
            displayName: 'Supply Chain Assistant Agent',
            engineId: 'eng-1',
          } as never,
        ]}
        config={mockConfig}
        onBack={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(api.listReasoningEngineSessions).toHaveBeenCalledWith(
        sampleReasoningEngine.name,
        mockConfig
      );
      expect(screen.getByText('sess-abc')).toBeInTheDocument();
    });
    unmount();

    // Negative test: listReasoningEngineSessions rejects -> renders engine-sessions-error alert with Retry
    vi.mocked(api.listReasoningEngineSessions).mockRejectedValueOnce(
      new Error('403 Vertex AI Reasoning Engine sessions forbidden')
    );

    render(
      <EngineDetails
        engine={sampleReasoningEngine}
        usingAgents={[]}
        config={mockConfig}
        onBack={vi.fn()}
      />
    );

    const errBanner = await screen.findByTestId('engine-sessions-error');
    expect(errBanner.textContent).toMatch(/403 Vertex AI Reasoning Engine sessions forbidden/i);
  });

  it('streams :streamQuery responses in DirectQueryChatWindow', async () => {
    vi.mocked(api.streamQueryReasoningEngine).mockImplementation(
      async (_name, _msg, _userId, _cfg, _token, onChunk) => {
        onChunk({
          content: {
            parts: [{ text: 'Shipment #402 is on schedule.' }],
          },
        });
      }
    );

    render(
      <DirectQueryChatWindow
        engine={sampleReasoningEngine}
        config={mockConfig}
        accessToken="test-token"
        onClose={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText(/Type a direct query/i);
    fireEvent.change(input, { target: { value: 'Status of shipment 402?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText(/Shipment #402 is on schedule\./i)).toBeInTheDocument();
  });
});
