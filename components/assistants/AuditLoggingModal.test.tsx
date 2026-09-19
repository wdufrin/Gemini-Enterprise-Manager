import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import AuditLoggingModal from './AuditLoggingModal';
import * as api from '../../services/apiService';
import { AppEngine, Config } from '../../types';

vi.mock('../../services/apiService', () => ({
  updateEngine: vi.fn(),
  listResources: vi.fn(),
  bulkEnforceAgentsObservability: vi.fn(),
  listBuckets: vi.fn(),
  listBigQueryDatasets: vi.fn(),
  createBigQueryDataset: vi.fn(),
  createLoggingSink: vi.fn(),
  getLoggingSink: vi.fn(),
  getDataset: vi.fn(),
  updateDatasetAccess: vi.fn(),
}));

describe('AuditLoggingModal - Step 2 Observability & Child Agent Enforcement', () => {
  const mockConfig: Config = {
    projectId: 'test-project',
    appLocation: 'global',
    collectionId: 'default_collection',
    appId: 'test-engine',
    assistantId: 'default_assistant',
  };

  const mockEngine: AppEngine = {
    name: 'projects/test-project/locations/global/collections/default_collection/engines/test-engine',
    displayName: 'Test Assistant Engine',
    observabilityConfig: {
      observabilityEnabled: false,
      sensitiveLoggingEnabled: false,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('navigates to Step 2 and displays Telemetry Coverage Scope Notice', () => {
    render(
      <AuditLoggingModal
        isOpen={true}
        onClose={vi.fn()}
        config={mockConfig}
        engine={mockEngine}
        onUpdateSuccess={vi.fn()}
        projectNumber="123456"
      />,
    );

    // Step 1 is rendered initially
    expect(screen.getByText(/1\. Verify Permissions/i)).toBeInTheDocument();

    // Click Next Step
    const nextBtn = screen.getByRole('button', { name: /Next Step/i });
    fireEvent.click(nextBtn);

    // Step 2 is now visible
    expect(screen.getByText(/2\. Configure Observability/i)).toBeInTheDocument();
    expect(screen.getByText(/Telemetry Coverage Notice \(App vs Agent\)/i)).toBeInTheDocument();
    expect(screen.getByText(/App ~65% \| Agent ~35%/i)).toBeInTheDocument();
    expect(screen.getByText(/Also enforce OpenTelemetry on all child agents in this engine/i)).toBeInTheDocument();
  });

  it('updates engine and enforces child agent telemetry when Apply Configuration is clicked', async () => {
    (api.updateEngine as any).mockResolvedValue({
      ...mockEngine,
      observabilityConfig: { observabilityEnabled: true, sensitiveLoggingEnabled: true },
    });

    (api.listResources as any).mockResolvedValue({
      agents: [
        { name: 'projects/test-project/.../agents/bot-1', displayName: 'Support Bot' },
      ],
    });

    (api.bulkEnforceAgentsObservability as any).mockResolvedValue({
      total: 1,
      updated: 1,
      alreadyCompliant: 0,
      failed: 0,
      errors: [],
    });

    const onUpdateSuccessMock = vi.fn();

    render(
      <AuditLoggingModal
        isOpen={true}
        onClose={vi.fn()}
        config={mockConfig}
        engine={mockEngine}
        onUpdateSuccess={onUpdateSuccessMock}
        projectNumber="123456"
      />,
    );

    // Advance to Step 2
    fireEvent.click(screen.getByRole('button', { name: /Next Step/i }));

    // Toggle Enable App-Level Usage Audit Logging
    const obsCheckbox = screen.getByLabelText(/Enable App-Level Usage Audit Logging/i);
    fireEvent.click(obsCheckbox);

    // Click Apply Configuration
    const applyBtn = screen.getByRole('button', { name: /Apply Configuration/i });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(api.updateEngine).toHaveBeenCalledWith(
        mockEngine.name,
        {
          observabilityConfig: {
            observabilityEnabled: true,
            sensitiveLoggingEnabled: false,
          },
        },
        ['observabilityConfig'],
        mockConfig,
      );

      expect(api.bulkEnforceAgentsObservability).toHaveBeenCalledWith(
        expect.any(Array),
        mockConfig,
        {
          observabilityEnabled: true,
          sensitiveLoggingEnabled: false,
        },
      );

      expect(onUpdateSuccessMock).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Also enforced telemetry on 1 child agent\(s\)/i)).toBeInTheDocument();
    });
  });
});
