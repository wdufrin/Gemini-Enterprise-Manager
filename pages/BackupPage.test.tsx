import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BackupPage from './BackupPage';
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

vi.mock('../components/ProjectInput', () => ({
  default: ({ value }: { value: string }) => <div data-testid="project-input">{value}</div>,
}));

const mockedApi = vi.mocked(api);

describe('BackupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.listBuckets.mockResolvedValue({
      items: [{ id: 'glm-prod-backups', name: 'glm-prod-backups' }],
    });
    mockedApi.listGcsObjects.mockResolvedValue({
      items: [
        {
          name: 'agentspace-discovery-backup-2026.json',
          bucket: 'glm-prod-backups',
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
    mockedApi.listAllReasoningEngines.mockResolvedValue([]);
  });

  it('loads and displays GCS backup bucket and action cards', async () => {
    render(
      <BackupPage
        accessToken="mock-access-token"
        projectNumber="glm-prod"
        setProjectNumber={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/gs:\/\/glm-prod-backups/i)).toBeInTheDocument();
    });
    expect(screen.getByText('All Discovery Resources')).toBeInTheDocument();
  });

  it('surfaces backup-discovery-warnings alert banner when GCS or Discovery Engine discovery rejects with 403', async () => {
    mockedApi.listBuckets.mockRejectedValue(
      new Error('403 PERMISSION_DENIED: Cannot read GCS buckets')
    );

    render(
      <BackupPage
        accessToken="mock-access-token"
        projectNumber="glm-prod"
        setProjectNumber={vi.fn()}
      />
    );

    const warningBanner = await screen.findByTestId('backup-discovery-warnings');
    expect(warningBanner).toHaveTextContent(/403 PERMISSION_DENIED: Cannot read GCS buckets/);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('backup-discovery-warnings')).not.toBeInTheDocument();
  });
});
