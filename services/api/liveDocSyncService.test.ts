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
import {
  syncLiveDocChecklist,
  mergeLiveSectionsWithBaseline,
  clearLiveChecklistCache,
} from './liveDocSyncService';
import { ConnectorChecklistDefinition } from '../../components/connectors/checklist/types';
import { Config } from '../../types';
import * as core from './core';

vi.mock('./core', async () => {
  const actual = await vi.importActual<typeof import('./core')>('./core');
  return {
    ...actual,
    gapiRequest: vi.fn(),
  };
});

const mockConfig: Config = {
  projectId: 'test-proj',
  appLocation: 'us-central1',
  collectionId: 'default_collection',
  appId: 'default_engine',
  assistantId: 'default_assistant',
};

const mockBaseline: ConnectorChecklistDefinition = {
  vendorId: 'JIRA_CLOUD',
  vendorDisplayName: 'Atlassian Jira Cloud',
  detectionPatterns: {
    dataSources: ['jira_cloud'],
  },
  supportsDataModeToggle: true,
  documentationUrl: 'https://docs.cloud.google.com/gemini/enterprise/docs/connectors/jira-cloud/third-party-config',
  sections: [
    {
      id: 'step_oauth',
      title: 'OAuth 2.0 (3LO) Application Registration',
      stepNumber: 1,
      items: [
        {
          id: 'jira_client_creds',
          label: 'Client ID & Client Secret',
          badge: 'Required',
        },
        {
          id: 'jira_service_agent_probe',
          label: 'Discovery Engine Service Agent Role',
          badge: 'Automated',
          automatedProbe: {
            type: 'IAM_PERMISSION_CHECK',
            requiredPermissions: ['discoveryengine.dataStores.get'],
          },
        },
      ],
    },
  ],
};

// Storage mock for Vitest
const storageMap = new Map<string, string>();
const mockStorage: Storage = {
  getItem: (key: string) => storageMap.get(key) || null,
  setItem: (key: string, val: string) => { storageMap.set(key, String(val)); },
  removeItem: (key: string) => { storageMap.delete(key); },
  clear: () => { storageMap.clear(); },
  key: (index: number) => Array.from(storageMap.keys())[index] || null,
  get length() { return storageMap.size; },
};

Object.defineProperty(globalThis, 'localStorage', {
  value: mockStorage,
  writable: true,
});

describe('Live KB Documentation Synchronization Service', () => {
  beforeEach(() => {
    storageMap.clear();
    vi.clearAllMocks();
  });

  it('returns bundled baseline when projectId is missing', async () => {
    const config: Config = { ...mockConfig, projectId: '' };
    const result = await syncLiveDocChecklist(mockBaseline, config);
    expect(result.syncSource).toBe('BUNDLED');
    expect(result.vendorId).toBe('JIRA_CLOUD');
    expect(core.gapiRequest).not.toHaveBeenCalled();
  });

  it('returns cached checklist if within TTL and forceRefresh is false', async () => {
    const cachedDef = {
      ...mockBaseline,
      lastSyncedAt: new Date().toISOString(),
    };
    storageMap.set(
      'gem_live_checklist_JIRA_CLOUD',
      JSON.stringify({
        definition: cachedDef,
        timestamp: Date.now() - 5000, // 5 seconds ago
      })
    );

    const config: Config = { ...mockConfig };
    const result = await syncLiveDocChecklist(mockBaseline, config, false);
    expect(result.syncSource).toBe('CACHED');
    expect(core.gapiRequest).not.toHaveBeenCalled();
  });

  it('queries Vertex AI with search grounding when forceRefresh is true and parses JSON', async () => {
    const mockApiResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  sections: [
                    {
                      id: 'step_oauth',
                      title: 'OAuth 2.0 Registration',
                      stepNumber: 1,
                      items: [
                        {
                          id: 'jira_client_creds',
                          label: 'Client ID & Client Secret',
                          badge: 'Required',
                        },
                        {
                          id: 'new_scope_offline_access',
                          label: 'Offline Access Scope',
                          subLabel: 'Ensures refresh tokens are provisioned.',
                          badge: 'Required',
                          codeSnippet: 'offline_access',
                        },
                      ],
                    },
                  ],
                }),
              },
            ],
          },
        },
      ],
    };

    vi.mocked(core.gapiRequest).mockResolvedValueOnce(mockApiResponse);

    const config: Config = { ...mockConfig };
    const result = await syncLiveDocChecklist(mockBaseline, config, true);

    expect(core.gapiRequest).toHaveBeenCalledTimes(1);
    expect(result.syncSource).toBe('LIVE_KB');
    expect(result.sections.length).toBe(1);

    // Verify newly discovered item marked with isLiveDocUpdate
    const newItem = result.sections[0].items.find((i) => i.id === 'new_scope_offline_access');
    expect(newItem).toBeDefined();
    expect(newItem?.isLiveDocUpdate).toBe(true);
  });

  it('preserves automated probes during section merge', () => {
    const liveSections = [
      {
        id: 'step_oauth',
        title: 'OAuth 2.0 Registration',
        stepNumber: 1,
        items: [
          {
            id: 'jira_service_agent_probe',
            label: 'Discovery Engine Service Agent Role',
          },
          {
            id: 'brand_new_item',
            label: 'Brand New Live Doc Item',
          },
        ],
      },
    ];

    const merged = mergeLiveSectionsWithBaseline(mockBaseline, liveSections);
    expect(merged.syncSource).toBe('LIVE_KB');

    const probeItem = merged.sections[0].items.find((i) => i.id === 'jira_service_agent_probe');
    expect(probeItem?.automatedProbe).toBeDefined();
    expect(probeItem?.automatedProbe?.type).toBe('IAM_PERMISSION_CHECK');

    const brandNew = merged.sections[0].items.find((i) => i.id === 'brand_new_item');
    expect(brandNew?.isLiveDocUpdate).toBe(true);
    expect(brandNew?.badge).toBe('Live KB Verified');
  });

  it('falls back gracefully to bundled baseline if Vertex AI fails or returns error', async () => {
    vi.mocked(core.gapiRequest).mockRejectedValueOnce(new Error('PermissionDenied: 403'));

    const config: Config = { ...mockConfig };
    const result = await syncLiveDocChecklist(mockBaseline, config, true);

    expect(result.syncSource).toBe('BUNDLED');
    expect(result.sections).toEqual(mockBaseline.sections);
  });

  it('clears cache successfully with clearLiveChecklistCache', () => {
    storageMap.set('gem_live_checklist_JIRA_CLOUD', 'test-data');
    storageMap.set('gem_live_checklist_SALESFORCE', 'test-data-2');
    storageMap.set('unrelated_key', 'keep-me');

    clearLiveChecklistCache('JIRA_CLOUD');
    expect(storageMap.has('gem_live_checklist_JIRA_CLOUD')).toBe(false);
    expect(storageMap.has('gem_live_checklist_SALESFORCE')).toBe(true);

    clearLiveChecklistCache();
    expect(storageMap.has('gem_live_checklist_SALESFORCE')).toBe(false);
    expect(storageMap.has('unrelated_key')).toBe(true);
  });
});
