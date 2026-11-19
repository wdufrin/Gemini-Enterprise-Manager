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

    expect(screen.getByText(/1\. Verify Permissions/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Next Step/i }));

    expect(screen.getByText(/2\. Configure Observability/i)).toBeInTheDocument();
    expect(screen.getByText(/Telemetry Coverage Notice \(App vs Agent\)/i)).toBeInTheDocument();
    expect(screen.getByText(/App ~65% \| Agent ~35%/i)).toBeInTheDocument();
    expect(screen.getByText(/Also enforce OpenTelemetry on all child agents in this engine/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Log User IAM Principal when Sensitive Logging is Off \(Preview\)/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Artifact GCS Bucket URI/i)).toBeInTheDocument();
  });

  it('updates engine and enforces child agent telemetry when Apply Configuration is clicked', async () => {
    vi.mocked(api.updateEngine).mockResolvedValue({
      ...mockEngine,
      observabilityConfig: { observabilityEnabled: true, sensitiveLoggingEnabled: true },
    });

    vi.mocked(api.listResources).mockResolvedValue({
      agents: [
        { name: 'projects/test-project/.../agents/bot-1', displayName: 'Support Bot' },
      ],
    });

    vi.mocked(api.bulkEnforceAgentsObservability).mockResolvedValue({
      total: 1,
      updated: 1,
      alreadyCompliant: 0,
      failed: 0,
      legacyAuthCount: 0,
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

    fireEvent.click(screen.getByRole('button', { name: /Next Step/i }));

    const obsCheckbox = screen.getByLabelText(/Enable App-Level Usage Audit Logging/i);
    fireEvent.click(obsCheckbox);

    fireEvent.click(screen.getByRole('button', { name: /Apply Configuration/i }));

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

  it('persists v1alpha userPrincipalLoggingEnabled and artifactGcsBucket to both Engine and child agents', async () => {
    vi.mocked(api.updateEngine).mockResolvedValue({
      ...mockEngine,
      observabilityConfig: {
        observabilityEnabled: true,
        sensitiveLoggingEnabled: false,
        userPrincipalLoggingEnabled: true,
        artifactGcsBucket: 'gs://enterprise-audit-artifacts-01',
      },
    });
    vi.mocked(api.listResources).mockResolvedValue({
      agents: [{ name: 'projects/test-project/.../agents/bot-1', displayName: 'Support Bot' }],
    });
    vi.mocked(api.bulkEnforceAgentsObservability).mockResolvedValue({
      total: 1,
      updated: 1,
      alreadyCompliant: 0,
      failed: 0,
      legacyAuthCount: 0,
      errors: [],
    });

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

    fireEvent.click(screen.getByRole('button', { name: /Next Step/i }));
    fireEvent.click(screen.getByLabelText(/Enable App-Level Usage Audit Logging/i));
    fireEvent.click(
      screen.getByLabelText(/Log User IAM Principal when Sensitive Logging is Off \(Preview\)/i),
    );
    fireEvent.change(screen.getByLabelText(/Artifact GCS Bucket URI/i), {
      target: { value: '  gs://enterprise-audit-artifacts-01  ' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Apply Configuration/i }));

    await waitFor(() => {
      expect(api.updateEngine).toHaveBeenCalledWith(
        mockEngine.name,
        {
          observabilityConfig: {
            observabilityEnabled: true,
            sensitiveLoggingEnabled: false,
            userPrincipalLoggingEnabled: true,
            artifactGcsBucket: 'gs://enterprise-audit-artifacts-01',
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
          userPrincipalLoggingEnabled: true,
          artifactGcsBucket: 'gs://enterprise-audit-artifacts-01',
        },
      );
    });
  });

  it('rejects malformed gs:// artifact bucket URIs and prevents API mutation', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: /Next Step/i }));
    fireEvent.click(screen.getByLabelText(/Enable App-Level Usage Audit Logging/i));

    const bucketInput = screen.getByLabelText(/Artifact GCS Bucket URI/i);

    for (const hostileUri of [
      'https://storage.googleapis.com/my-bucket',
      'gs://',
      'gs://UPPERCASE_BUCKET',
      'gs://ab',
      'gs://bad..dots',
    ]) {
      fireEvent.change(bucketInput, { target: { value: hostileUri } });
      fireEvent.click(screen.getByRole('button', { name: /Apply Configuration/i }));

      const alerts = await screen.findAllByRole('alert');
      expect(alerts.length).toBeGreaterThan(0);
      expect(api.updateEngine).not.toHaveBeenCalled();
      expect(api.bulkEnforceAgentsObservability).not.toHaveBeenCalled();
    }
  });
});
