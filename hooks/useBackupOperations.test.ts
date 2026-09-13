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
import { renderHook, act, waitFor } from '@testing-library/react';
import { useBackupOperations } from './useBackupOperations';
import {
  createRestoreOutcome,
  recordCreated,
  recordFailure,
} from '../services/backup/restoreOutcome';
import { DataStore } from '../types';

vi.mock('../services/apiService', () => ({
  listBuckets: vi.fn().mockResolvedValue({ items: [] }),
  listGcsObjects: vi.fn().mockResolvedValue({ items: [] }),
  listResources: vi.fn().mockResolvedValue({ engines: [] }),
  listAllReasoningEngines: vi.fn().mockResolvedValue([]),
  deleteGcsObject: vi.fn(),
  getGcsObjectContent: vi.fn(),
  downloadGcsObject: vi.fn(),
  updateAssistant: vi.fn(),
  createAssistant: vi.fn(),
}));

const props = {
  // Avoids anything shaped like a real OAuth access token; realistic-looking
  // values trip the pre-commit secret scanner.
  accessToken: 'FAKE-OAUTH-TOKEN-FOR-TESTS',
  projectNumber: '123456789',
  setProjectNumber: vi.fn(),
};

const dataStores = [
  { name: 'projects/p/dataStores/alpha', displayName: 'Alpha' },
  { name: 'projects/p/dataStores/beta', displayName: 'Beta' },
] as DataStore[];

const selectedItems = dataStores.map((ds) => ({
  name: ds.name,
  displayName: ds.displayName,
}));

/**
 * Drives the hook through the real selective-restore path:
 * handleConfirmRestore stages the work, executeConfirmedRestore runs it.
 */
const runSelectiveRestore = async (
  result: { current: ReturnType<typeof useBackupOperations> },
  processor: Parameters<ReturnType<typeof useBackupOperations>['handleConfirmRestore']>[2]
) => {
  act(() => {
    result.current.handleConfirmRestore(
      'DataStores',
      selectedItems,
      processor,
      { dataStores }
    );
  });

  await act(async () => {
    result.current.executeConfirmedRestore();
  });
};

describe('useBackupOperations selective restore reporting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // This is the link that makes the whole RestoreOutcome refactor matter. The
  // service layer can report failures perfectly, but if the hook does not call
  // assertRestoreComplete the UI still shows a silent success -- which is the
  // exact defect that was being fixed.
  it('surfaces an error when the processor reports a failed resource', async () => {
    const { result } = renderHook(() => useBackupOperations(props));

    const processor = vi.fn(async () => {
      const outcome = createRestoreOutcome();
      recordCreated(outcome, 'alpha');
      recordFailure(outcome, 'Data Store', 'beta', 'PERMISSION_DENIED');
      return outcome;
    });

    await runSelectiveRestore(result, processor);

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
    expect(result.current.error).toMatch(/beta/);
    expect(result.current.error).toMatch(/PERMISSION_DENIED/);
  });

  it('names the unrestored resource in the log, not just the error banner', async () => {
    const { result } = renderHook(() => useBackupOperations(props));

    const processor = vi.fn(async () => {
      const outcome = createRestoreOutcome();
      recordFailure(outcome, 'Data Store', 'beta', 'PERMISSION_DENIED');
      return outcome;
    });

    await runSelectiveRestore(result, processor);

    await waitFor(() => {
      expect(result.current.logs.join('\n')).toMatch(/NOT RESTORED: Data Store 'beta'/);
    });
  });

  it('does not report success text when resources failed', async () => {
    const { result } = renderHook(() => useBackupOperations(props));

    const processor = vi.fn(async () => {
      const outcome = createRestoreOutcome();
      recordFailure(outcome, 'Data Store', 'beta', 'boom');
      return outcome;
    });

    await runSelectiveRestore(result, processor);

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
    // The bare "finished." line was the original ghost-success message.
    expect(result.current.logs).not.toContain('Restore process for Data Stores finished.');
  });

  it('stays clean when every resource restored', async () => {
    const { result } = renderHook(() => useBackupOperations(props));

    const processor = vi.fn(async () => {
      const outcome = createRestoreOutcome();
      recordCreated(outcome, 'alpha');
      recordCreated(outcome, 'beta');
      return outcome;
    });

    await runSelectiveRestore(result, processor);

    await waitFor(() => {
      expect(processor).toHaveBeenCalledTimes(1);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.logs.join('\n')).toMatch(/restored=2, skipped=0, failed=0/);
  });

  // Re-running a restore against an already-restored project must not be
  // reported as a failure, or every retry looks broken.
  it('treats an all-skipped restore as success', async () => {
    const { result } = renderHook(() => useBackupOperations(props));

    const processor = vi.fn(async () => {
      const outcome = createRestoreOutcome();
      outcome.skipped.push('alpha', 'beta');
      return outcome;
    });

    await runSelectiveRestore(result, processor);

    await waitFor(() => {
      expect(processor).toHaveBeenCalledTimes(1);
    });
    expect(result.current.error).toBeNull();
  });

  it('still supports processors that return nothing', async () => {
    const { result } = renderHook(() => useBackupOperations(props));

    const processor = vi.fn(async () => undefined);

    await runSelectiveRestore(result, processor);

    await waitFor(() => {
      expect(processor).toHaveBeenCalledTimes(1);
    });
    expect(result.current.error).toBeNull();
  });
});
