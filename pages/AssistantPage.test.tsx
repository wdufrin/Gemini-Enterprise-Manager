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
});
