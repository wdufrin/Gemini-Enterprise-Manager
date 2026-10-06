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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  executeRestoreDataStores,
  executeRestoreAuthorizations,
  executeRestoreNotebooks,
  executeRestoreDiscovery,
  restoreAgentsIntoAssistant,
} from './restoreOperations';
import { assertRestoreComplete, RestoreIncompleteError } from './restoreOutcome';
import * as api from '../apiService';
import { Agent, AppEngine, Authorization, Collection, Config, DataStore } from '../../types';

vi.mock('../apiService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../apiService')>();
  return {
    ...actual,
    createCollection: vi.fn(),
    createDataStore: vi.fn(),
    createAuthorization: vi.fn(),
    createNotebook: vi.fn(),
    batchCreateNotebookSources: vi.fn(),
    createEngine: vi.fn(),
    updateAssistant: vi.fn(),
    createAgent: vi.fn(),
    setAgentIamPolicy: vi.fn(),
    getAuthorization: vi.fn(),
  };
});

const apiConfig: Omit<Config, 'accessToken'> = {
  projectId: 'test-project',
  appLocation: 'global',
  collectionId: 'default_collection',
  appId: 'default_app',
};

const noopLog = () => {};
const promptSecret = async () => 'secret-value';

/**
 * The restore loops sleep 1-2s between resources. Driving those timers
 * manually keeps the suite fast and deterministic instead of adding ~9s of
 * real waiting.
 */
const runWithTimers = async <T,>(start: () => Promise<T>): Promise<T> => {
  const pending = start();
  await vi.runAllTimersAsync();
  return pending;
};

describe('restore failure accounting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Each of these previously caught the error, appended "ERROR: ..." to the
  // log array and resolved normally. The caller then printed "Restore process
  // finished." -- so a restore that created nothing looked identical to one
  // that created everything.

  it('reports a data store that failed to create', async () => {
    vi.mocked(api.createDataStore)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error('PERMISSION_DENIED: caller lacks access'));

    const dataStores = [
      { name: 'projects/p/dataStores/ds-ok' },
      { name: 'projects/p/dataStores/ds-bad' },
    ] as DataStore[];

    const outcome = await runWithTimers(() =>
      executeRestoreDataStores({ dataStores }, apiConfig, noopLog)
    );

    expect(outcome.created).toEqual(['ds-ok']);
    expect(outcome.failed).toHaveLength(1);
    expect(outcome.failed[0].resourceId).toBe('ds-bad');
    expect(outcome.failed[0].reason).toMatch(/PERMISSION_DENIED/);
    expect(() => assertRestoreComplete(outcome, 'DataStores')).toThrow(
      RestoreIncompleteError
    );
  });

  it('treats ALREADY_EXISTS as skipped, not failed, so re-runs stay green', async () => {
    vi.mocked(api.createDataStore).mockRejectedValue(
      new Error('ALREADY_EXISTS: data store exists')
    );

    const outcome = await runWithTimers(() =>
      executeRestoreDataStores(
        { dataStores: [{ name: 'projects/p/dataStores/ds-1' }] as DataStore[] },
        apiConfig,
        noopLog
      )
    );

    expect(outcome.failed).toHaveLength(0);
    expect(outcome.skipped).toEqual(['ds-1']);
    expect(() => assertRestoreComplete(outcome, 'DataStores')).not.toThrow();
  });

  it('reports an authorization that failed to create', async () => {
    vi.mocked(api.createAuthorization).mockRejectedValue(new Error('INVALID_ARGUMENT'));

    const outcome = await runWithTimers(() =>
      executeRestoreAuthorizations(
        { authorizations: [{ name: 'projects/p/authorizations/auth-1' }] as Authorization[] },
        apiConfig,
        noopLog,
        promptSecret
      )
    );

    expect(outcome.failed).toHaveLength(1);
    expect(outcome.failed[0].resourceType).toBe('Authorization');
  });

  it('reports an agent that failed to create', async () => {
    vi.mocked(api.createAgent).mockRejectedValue(new Error('FAILED_PRECONDITION'));

    const agents = [
      { name: 'projects/p/.../agents/a-1', displayName: 'Support Bot' },
    ] as Agent[];

    const outcome = await runWithTimers(() =>
      restoreAgentsIntoAssistant(agents, apiConfig, noopLog, promptSecret)
    );

    expect(outcome.created).toHaveLength(0);
    expect(outcome.failed).toHaveLength(1);
    expect(outcome.failed[0].resourceId).toBe('Support Bot');
  });

  it('preserves deterministic agentId (deep_research), sharingConfig, and longRunningOperationsEnabled when restoring a Google-managed agent', async () => {
    const deepResearchAgent: Agent = {
      name: 'projects/p/locations/global/collections/default_collection/engines/default_app/assistants/default_assistant/agents/deep_research',
      displayName: 'Deep Research',
      description: 'Google built-in research assistant',
      managedAgentDefinition: {
        researchAssistantAgentConfig: { supportLroQueries: true },
      },
      sharingConfig: { scope: 'ALL_USERS' },
      longRunningOperationsEnabled: true,
    };

    vi.mocked(api.createAgent).mockResolvedValueOnce({
      ...deepResearchAgent,
      state: 'ENABLED',
    });

    const outcome = await runWithTimers(() =>
      restoreAgentsIntoAssistant([deepResearchAgent], apiConfig, noopLog, promptSecret)
    );

    expect(outcome.created).toEqual(['Deep Research']);
    expect(outcome.failed).toHaveLength(0);
    expect(api.createAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'Deep Research',
        managedAgentDefinition: {
          researchAssistantAgentConfig: { supportLroQueries: true },
        },
        sharingConfig: { scope: 'ALL_USERS' },
        longRunningOperationsEnabled: true,
      }),
      expect.objectContaining({ projectId: 'test-project' }),
      'deep_research'
    );
  });

  // A notebook restored without its sources is an empty shell. The old code
  // logged this and moved on, so the operator believed their research was back.
  it('reports a notebook whose sources failed even though the notebook was created', async () => {
    vi.mocked(api.createNotebook).mockResolvedValue({
      name: 'projects/p/notebooks/nb-1',
    } as never);
    vi.mocked(api.batchCreateNotebookSources).mockRejectedValue(
      new Error('RESOURCE_EXHAUSTED')
    );

    const outcome = await runWithTimers(() =>
      executeRestoreNotebooks(
        {
          notebooks: [
            {
              name: 'projects/p/notebooks/original',
              displayName: 'Q3 Research',
              sources: [{ title: 'Doc A', content: 'hello' }],
            },
          ],
        },
        apiConfig,
        noopLog
      )
    );

    expect(outcome.created).toEqual(['nb-1']);
    expect(outcome.failed).toHaveLength(1);
    expect(outcome.failed[0].resourceType).toBe('Notebook sources');
    expect(() => assertRestoreComplete(outcome, 'NotebookLM')).toThrow();
  });

  it('names every missing resource in the thrown error', async () => {
    vi.mocked(api.createDataStore).mockRejectedValue(new Error('boom'));

    const outcome = await runWithTimers(() =>
      executeRestoreDataStores(
        {
          dataStores: [
            { name: 'projects/p/dataStores/alpha' },
            { name: 'projects/p/dataStores/beta' },
          ] as DataStore[],
        },
        apiConfig,
        noopLog
      )
    );

    expect(() => assertRestoreComplete(outcome, 'DataStores')).toThrowError(
      /alpha.*beta/s
    );
  });

  it('restores collection dataStores, engines, and invokes restoreAssistantFn with nested agents during Full Discovery restore', async () => {
    vi.mocked(api.createCollection).mockResolvedValueOnce({} as never);
    vi.mocked(api.createDataStore).mockResolvedValueOnce({} as never);
    vi.mocked(api.createEngine).mockResolvedValueOnce({ done: true } as never);

    const restoreAssistantSpy = vi.fn().mockImplementation(async (backupData: { assistant?: { agents?: Agent[] } }) => ({
      created: (backupData.assistant?.agents || []).map((a) => a.displayName),
      skipped: [],
      failed: [],
    }));

    const outcome = await runWithTimers(() =>
      executeRestoreDiscovery(
        {
          collections: [
            {
              name: 'projects/p/locations/global/collections/default_collection',
              displayName: 'Default Collection',
              dataStores: [{ name: 'projects/p/locations/global/collections/default_collection/dataStores/ds-1' } as DataStore],
              engines: [
                {
                  name: 'projects/p/locations/global/collections/default_collection/engines/eng-1',
                  displayName: 'Enterprise App',
                  solutionType: 'SOLUTION_TYPE_SEARCH',
                  assistants: [
                    {
                      name: 'projects/p/locations/global/collections/default_collection/engines/eng-1/assistants/default_assistant',
                      displayName: 'Default Assistant',
                      generationConfig: { systemInstruction: { additionalSystemInstruction: 'Be concise' } },
                      agents: [
                        {
                          name: 'projects/p/locations/global/collections/default_collection/engines/eng-1/assistants/default_assistant/agents/agent-1',
                          displayName: 'Nested Agent',
                        } as Agent,
                      ],
                    },
                  ],
                } as AppEngine,
              ],
            } as Collection,
          ],
        },
        apiConfig,
        noopLog,
        restoreAssistantSpy
      )
    );

    expect(api.createCollection).toHaveBeenCalledTimes(1);
    expect(api.createDataStore).toHaveBeenCalledTimes(1);
    expect(api.createEngine).toHaveBeenCalledTimes(1);
    expect(restoreAssistantSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        assistant: expect.objectContaining({
          displayName: 'Default Assistant',
          agents: [expect.objectContaining({ displayName: 'Nested Agent' })],
        }),
      }),
      false
    );
    expect(outcome.created).toEqual(['default_collection', 'ds-1', 'eng-1', 'Nested Agent']);
    expect(outcome.failed).toHaveLength(0);
  });
});


