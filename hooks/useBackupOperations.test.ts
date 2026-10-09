import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useBackupOperations } from './useBackupOperations';
import * as api from '../services/apiService';

vi.mock('../services/apiService', () => ({
  listBuckets: vi.fn(),
  listGcsObjects: vi.fn(),
  listResources: vi.fn(),
  listAllReasoningEngines: vi.fn(),
  getGcsObjectContent: vi.fn(),
  deleteGcsObject: vi.fn(),
  downloadGcsObject: vi.fn(),
}));

const mockedApi = vi.mocked(api);

describe('useBackupOperations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.listBuckets.mockResolvedValue({
      items: [{ id: 'glm-enterprise-backups', name: 'glm-enterprise-backups' }],
    });
    mockedApi.listGcsObjects.mockResolvedValue({
      items: [
        {
          name: 'agentspace-agents-backup-2026-04-17.json',
          bucket: 'glm-enterprise-backups',
        },
      ],
    });
    mockedApi.listResources.mockResolvedValue({
      engines: [
        {
          name: 'projects/glm-prod/locations/global/collections/default_collection/engines/glm-app',
          displayName: 'GLM App',
          solutionType: 'SOLUTION_TYPE_CHAT',
        },
      ],
    });
    mockedApi.listAllReasoningEngines.mockResolvedValue([
      {
        name: 'projects/glm-prod/locations/us-central1/reasoningEngines/re-101',
        displayName: 'GLM Reasoning Engine',
      },
    ]);
  });

  it('discovers GCS buckets, backup JSON files, Discovery Engine apps, and Reasoning Engines', async () => {
    const { result } = renderHook(() =>
      useBackupOperations({
        accessToken: 'mock-access-token',
        projectNumber: 'glm-prod',
        setProjectNumber: vi.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.selectedBucket).toBe('glm-enterprise-backups');
      expect(result.current.backupFiles.Agents).toEqual([
        'agentspace-agents-backup-2026-04-17.json',
      ]);
      expect(result.current.apps).toHaveLength(1);
      expect(result.current.reasoningEngines).toHaveLength(1);
    });
    expect(result.current.discoveryWarnings).toEqual([]);
  });

  it('records discoveryWarnings when GCS bucket or Discovery Engine listing rejects with 403', async () => {
    mockedApi.listBuckets.mockRejectedValue(
      new Error('403 PERMISSION_DENIED: storage.buckets.list denied')
    );
    mockedApi.listResources.mockRejectedValue(
      new Error('403 PERMISSION_DENIED: discoveryengine.engines.list denied')
    );

    const { result } = renderHook(() =>
      useBackupOperations({
        accessToken: 'mock-access-token',
        projectNumber: 'glm-prod',
        setProjectNumber: vi.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.discoveryWarnings.length).toBeGreaterThanOrEqual(2);
    });
    expect(result.current.discoveryWarnings.join(' ')).toMatch(/storage\.buckets\.list denied/);
    expect(result.current.discoveryWarnings.join(' ')).toMatch(
      /discoveryengine\.engines\.list denied/
    );

    act(() => {
      result.current.clearDiscoveryWarnings();
    });
    expect(result.current.discoveryWarnings).toEqual([]);
  });

  it('rejects malformed backup JSON during handleRestore with an explicit parse error', async () => {
    mockedApi.getGcsObjectContent.mockResolvedValue('{corrupted-json');

    const { result } = renderHook(() =>
      useBackupOperations({
        accessToken: 'mock-access-token',
        projectNumber: 'glm-prod',
        setProjectNumber: vi.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.selectedBucket).toBe('glm-enterprise-backups');
    });

    act(() => {
      result.current.handleBackupSelectionChange(
        'Agents',
        'agentspace-agents-backup-2026-04-17.json'
      );
    });

    await act(async () => {
      await result.current.handleRestore('Agents', vi.fn());
    });

    expect(result.current.error).toMatch(/Failed to parse backup JSON/i);
  });
});
