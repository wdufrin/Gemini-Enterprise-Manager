import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BackupPage from './BackupPage';
import { AGENT_ENGINE_REGIONS } from '../components/backup/BackupConfigHeader';
import { ChatHistoryArchiveViewer } from '../components/backup/ChatHistoryArchiveViewer';
import { GEMINI_ENTERPRISE_LOCATION_IDS } from '../utils/locations';
import { WorkspaceScopeProvider } from '../context/WorkspaceScopeContext';
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

describe('BackupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
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

  it('loads and displays GCS backup bucket, all 10 GE locations, expanded Agent Engine regions, and action cards', async () => {
    render(
      <WorkspaceScopeProvider projectKey="glm-prod">
        <BackupPage
          accessToken="mock-access-token"
          projectNumber="glm-prod"
          projectId="glm-prod"
          setProjectNumber={vi.fn()}
        />
      </WorkspaceScopeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/gs:\/\/glm-prod-backups/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: /^Backup & Recovery$/ })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /^Backup & Restore Actions \(GCS\)$/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('All Discovery Resources')).toBeInTheDocument();

    // Verify all 10 Gemini Enterprise locations and expanded Agent Engine regions with h-9 height
    const discoverySelect = screen.getByLabelText(/Target Location \(Discovery\)/i) as HTMLSelectElement;
    expect(discoverySelect.className).toContain('h-9');
    expect(Array.from(discoverySelect.options).map((o) => o.value)).toEqual(
      GEMINI_ENTERPRISE_LOCATION_IDS,
    );

    const regionSelect = screen.getByLabelText(/Agent Engine Location/i) as HTMLSelectElement;
    expect(regionSelect.className).toContain('h-9');
    expect(Array.from(regionSelect.options).map((o) => o.value)).toEqual([...AGENT_ENGINE_REGIONS]);

    // Changing locations syncs into WorkspaceScopeContext (persisted in sessionStorage)
    fireEvent.change(discoverySelect, { target: { value: 'eu' } });
    fireEvent.change(regionSelect, { target: { value: 'europe-west4' } });
    const persisted = JSON.parse(sessionStorage.getItem('gem-workspace-scope-v1') || '{}');
    expect(persisted.appLocation).toBe('eu');
    expect(persisted.gcpRegion).toBe('europe-west4');
  });

  it('surfaces backup-discovery-warnings alert banner when GCS or Discovery Engine discovery rejects with 403', async () => {
    mockedApi.listBuckets.mockRejectedValue(
      new Error('403 PERMISSION_DENIED: Cannot read GCS buckets'),
    );

    render(
      <BackupPage
        accessToken="mock-access-token"
        projectNumber="glm-prod"
        setProjectNumber={vi.fn()}
      />,
    );

    const warningBanner = await screen.findByTestId('backup-discovery-warnings');
    expect(warningBanner).toHaveTextContent(/403 PERMISSION_DENIED: Cannot read GCS buckets/);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('backup-discovery-warnings')).not.toBeInTheDocument();
  });

  it('portals ChatHistoryArchiveViewer directly under document.body at z-[70] and closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <div data-testid="nested-wrapper">
        <ChatHistoryArchiveViewer
          sessions={[
            {
              name: 'projects/glm-prod/locations/global/collections/default_collection/engines/glm-app/sessions/s1',
              userPseudoId: 'alice@corp.com',
              state: 'IN_PROGRESS',
              turns: [],
            },
          ]}
          fileName="chat-archive-2026.json"
          onClose={onClose}
          config={{
            projectId: 'glm-prod',
            appLocation: 'global',
            collectionId: 'default_collection',
            appId: 'glm-app',
            assistantId: 'default_assistant',
          }}
        />
      </div>,
    );

    const dialog = screen.getByRole('dialog', { name: /Chat History Archive Viewer/i });
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.className).toContain('z-[70]');
    expect(screen.getByTestId('nested-wrapper').contains(dialog)).toBe(false);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
