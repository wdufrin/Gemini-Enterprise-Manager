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
  restoreAgentsIntoAssistant,
} from './restoreOperations';
import { assertRestoreComplete, RestoreIncompleteError } from './restoreOutcome';
import * as api from '../apiService';
import { Agent, Authorization, Config, DataStore } from '../../types';

vi.mock('../apiService', () => ({
  createDataStore: vi.fn(),
  createAuthorization: vi.fn(),
  createNotebook: vi.fn(),
  batchCreateNotebookSources: vi.fn(),
  createAgent: vi.fn(),
  setAgentIamPolicy: vi.fn(),
  getAuthorization: vi.fn(),
}));

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
});
