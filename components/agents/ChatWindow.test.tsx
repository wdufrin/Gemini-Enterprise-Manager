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
import ChatWindow from './ChatWindow';
import ResponseDetailsModal, { ExtendedAnswerDetails } from './ResponseDetailsModal';
import * as api from '../../services/apiService';
import { Config } from '../../types';

vi.mock('../../services/apiService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/apiService')>();
  return {
    ...actual,
    getEngine: vi.fn(),
    getWidgetConfig: vi.fn(),
    listResources: vi.fn(),
    createDiscoverySession: vi.fn(),
    listAuthorizations: vi.fn(),
    streamChat: vi.fn(),
  };
});

const testConfig: Config = {
  projectId: 'test-proj-123',
  appLocation: 'global',
  collectionId: 'default_collection',
  appId: 'engine-chat-1',
  assistantId: 'default_assistant',
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

describe('ChatWindow & ResponseDetailsModal (F4: :streamAssist Diagnostics, Error Surfacing & R2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageStore = {};
    Element.prototype.scrollIntoView = vi.fn();

    vi.mocked(api.getEngine).mockResolvedValue({
      name: 'projects/test-proj-123/locations/global/collections/default_collection/engines/engine-chat-1',
      displayName: 'Test Chat Engine',
      solutionType: 'SOLUTION_TYPE_GENERATIVE_CHAT',
    });
    vi.mocked(api.getWidgetConfig).mockResolvedValue({
      name: 'widgetConfig',
      uiSettings: { modelConfigInfo: { resolvedModels: [] } },
    } as never);
    vi.mocked(api.listResources).mockResolvedValue({ agents: [] });
    vi.mocked(api.createDiscoverySession).mockResolvedValue({
      name: 'projects/test-proj-123/locations/global/collections/default_collection/engines/engine-chat-1/sessions/sess-1',
    });
    vi.mocked(api.listAuthorizations).mockResolvedValue({ authorizations: [] });
  });

  it('surfaces background initialization failures in chat-diagnostics-banner and allows dismissing it', async () => {
    vi.mocked(api.getEngine).mockRejectedValueOnce(new Error('403 Engine model lookup denied'));

    render(
      <ChatWindow
        targetDisplayName="Enterprise Assistant"
        config={testConfig}
        accessToken="mock-access-token"
        onClose={vi.fn()}
        userProfile={null}
      />
    );

    const banner = await screen.findByTestId('chat-diagnostics-banner');
    expect(banner.textContent).toMatch(/403 Engine model lookup denied/i);

    fireEvent.click(screen.getByTestId('dismiss-chat-diagnostics-btn'));
    expect(screen.queryByTestId('chat-diagnostics-banner')).toBeNull();
  });

  it('always attaches Response Details button even when :streamAssist returns plain text without diagnosticInfo, and renders request/response inspection in ResponseDetailsModal', async () => {
    vi.mocked(api.streamChat).mockImplementation(
      async (_agent, _msg, _session, _cfg, _token, onChunk) => {
        onChunk({
          answer: {
            state: 'STREAMING',
            replies: [
              {
                groundedContent: {
                  content: {
                    role: 'model',
                    text: 'Here is the grounded answer from HR policy.',
                  },
                },
              },
            ],
          },
          sessionInfo: {
            session:
              'projects/test-proj-123/locations/global/collections/default_collection/engines/engine-chat-1/sessions/sess-1',
          },
        });
      }
    );

    render(
      <ChatWindow
        targetDisplayName="Enterprise Assistant"
        config={testConfig}
        accessToken="mock-access-token"
        onClose={vi.fn()}
        userProfile={null}
      />
    );

    const input = screen.getByPlaceholderText(/Type your message/i);
    fireEvent.change(input, { target: { value: 'What is our PTO policy?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(
      await screen.findByText(/Here is the grounded answer from HR policy\./i)
    ).toBeInTheDocument();

    // Info icon button ("Show response details") must appear even without diagnosticInfo
    const detailsBtn = screen.getByTitle('Show response details');
    fireEvent.click(detailsBtn);

    expect(await screen.findByTestId('response-details-request-response')).toBeInTheDocument();
    expect(screen.getByTestId('response-details-request-pane').textContent).toContain(
      'What is our PTO policy?'
    );
    expect(screen.getByTestId('response-details-response-pane').textContent).toContain(
      'Here is the grounded answer from HR policy.'
    );
  });

  it('extracts functionCall, thought, and executableCode planner steps in ResponseDetailsModal', () => {
    const detailsWithFunctionCall: ExtendedAnswerDetails = {
      state: 'SUCCEEDED',
      requestPayload: {
        endpoint: 'https://discoveryengine.googleapis.com/v1alpha/projects/123:streamAssist',
        method: 'POST',
        body: { query: { text: 'Check BigQuery sales' } },
      },
      diagnosticInfo: {
        plannerSteps: [
          {
            planStep: {
              parts: [{ thought: true, text: 'Routing query to BigQuery tool.' }],
            },
          },
          {
            toolStep: {
              parts: [
                {
                  functionCall: {
                    name: 'query_bigquery_sales',
                    args: { quarter: 'Q4' },
                  },
                },
              ],
            },
          },
        ],
      },
    };

    render(
      <ResponseDetailsModal
        isOpen={true}
        onClose={vi.fn()}
        details={detailsWithFunctionCall}
      />
    );

    expect(screen.getByTestId('response-details-request-response')).toBeInTheDocument();
    expect(screen.getByTestId('response-details-request-pane').textContent).toContain(
      'Check BigQuery sales'
    );
    expect(screen.getAllByText(/Routing query to BigQuery tool\./i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Function: query_bigquery_sales/i)).toBeInTheDocument();
  });
});
