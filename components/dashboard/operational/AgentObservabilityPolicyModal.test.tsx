import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AgentObservabilityPolicyModal } from './AgentObservabilityPolicyModal';
import * as api from '../../../services/apiService';
import { GEMINI_ENTERPRISE_LOCATION_IDS } from '../../../utils/locations';

vi.mock('../../../services/apiService', () => ({
  listResources: vi.fn(),
  getAgent: vi.fn(),
  bulkEnforceAgentsObservability: vi.fn(),
}));

describe('AgentObservabilityPolicyModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    projectId: 'test-project-123',
    projectNumber: '123456789',
    activeDatasetId: 'gemini_enterprise_logs',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders modal header, coverage explanation, and tabs when open', () => {
    render(<AgentObservabilityPolicyModal {...defaultProps} />);

    expect(
      screen.getByRole('heading', { name: /Agent Observability Policy & Telemetry Governance/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/1\. Coverage Gap \(App vs Agent\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Option 1: Eventarc Auto-Enabler/i)).toBeInTheDocument();
    expect(screen.getByText(/Option 2: Bulk Sweep in Manager/i)).toBeInTheDocument();
    expect(screen.getByText(/Option 3: Agent Gateway Governance/i)).toBeInTheDocument();

    expect(screen.getByText(/The Google Cloud Console Observability Default Reality/i)).toBeInTheDocument();
    expect(screen.getByText(/~65% of Total Logs/i)).toBeInTheDocument();
    expect(screen.getByText(/~35% Missing Blindspot/i)).toBeInTheDocument();
  });

  it('switches to Option 1 tab and displays Terraform manifest and Cloud Function code', () => {
    render(<AgentObservabilityPolicyModal {...defaultProps} />);

    fireEvent.click(screen.getByText(/Option 1: Eventarc Auto-Enabler/i));

    expect(screen.getByText(/eventarc_agent_observability\.tf/i)).toBeInTheDocument();
    expect(screen.getByText(/main\.py \(Python 3\.11\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Event-Driven Policy Flow/i)).toBeInTheDocument();
  });

  it('switches to Option 2 tab, renders GEMINI_ENTERPRISE_LOCATION_IDS, loads engines and agents, and performs bulk sweep with v1alpha fields', async () => {
    vi.mocked(api.listResources).mockImplementation(((type: string) => {
      if (type === 'engines') {
        return Promise.resolve({
          engines: [
            {
              name: 'projects/test-project-123/locations/global/collections/default_collection/engines/engine-alpha',
              displayName: 'Customer Assistant Engine',
            },
          ],
        });
      }
      if (type === 'agents') {
        return Promise.resolve({
          agents: [
            {
              name: 'projects/test-project-123/locations/global/collections/default_collection/engines/engine-alpha/assistants/default_assistant/agents/bot-1',
              displayName: 'Support Agent',
              observabilityConfig: { observabilityEnabled: false },
            },
          ],
        });
      }
      return Promise.resolve({});
    }) as unknown as typeof api.listResources);

    vi.mocked(api.getAgent)
      .mockResolvedValueOnce({
        name: 'projects/test-project-123/locations/global/collections/default_collection/engines/engine-alpha/assistants/default_assistant/agents/bot-1',
        displayName: 'Support Agent',
        observabilityConfig: { observabilityEnabled: false },
      })
      .mockResolvedValueOnce({
        name: 'projects/test-project-123/locations/global/collections/default_collection/engines/engine-alpha/assistants/default_assistant/agents/bot-1',
        displayName: 'Support Agent',
        observabilityConfig: {
          observabilityEnabled: true,
          sensitiveLoggingEnabled: false,
          userPrincipalLoggingEnabled: true,
          artifactGcsBucket: 'gs://agent-sweep-artifacts',
        },
      });

    vi.mocked(api.bulkEnforceAgentsObservability).mockResolvedValue({
      total: 1,
      updated: 1,
      alreadyCompliant: 0,
      failed: 0,
      legacyAuthCount: 0,
      errors: [],
    });

    render(<AgentObservabilityPolicyModal {...defaultProps} />);

    fireEvent.click(screen.getByText(/Option 2: Bulk Sweep in Manager/i));

    // Verify location dropdown contains all GEMINI_ENTERPRISE_LOCATION_IDS
    const locationSelect = screen.getByLabelText('Target Location') as HTMLSelectElement;
    const optionValues = Array.from(locationSelect.options).map((o) => o.value);
    expect(optionValues).toEqual([...GEMINI_ENTERPRISE_LOCATION_IDS]);

    await waitFor(() => {
      expect(screen.getByText(/Customer Assistant Engine/i)).toBeInTheDocument();
      expect(screen.getByText(/Support Agent/i)).toBeInTheDocument();
      expect(screen.getByText(/OFF \(Blindspot\)/i)).toBeInTheDocument();
    });

    // Uncheck sensitive prompts, enable userPrincipalLoggingEnabled, set valid gs:// bucket
    fireEvent.click(screen.getByLabelText(/Include Sensitive Prompts/i));
    fireEvent.click(
      screen.getByLabelText(/Log User IAM Principal when Sensitive Logging is Off \(Preview\)/i),
    );
    fireEvent.change(screen.getByLabelText(/Artifact GCS Bucket URI/i), {
      target: { value: 'gs://agent-sweep-artifacts' },
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: /Enforce Telemetry on All Non-Compliant Agents/i,
      }),
    );

    await waitFor(() => {
      expect(api.bulkEnforceAgentsObservability).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ projectId: 'test-project-123', appLocation: 'global' }),
        {
          observabilityEnabled: true,
          sensitiveLoggingEnabled: false,
          userPrincipalLoggingEnabled: true,
          artifactGcsBucket: 'gs://agent-sweep-artifacts',
        },
      );
    });
    expect(screen.getByText(/Enforcement Sweep Completed Successfully!/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Principal On')).toBeInTheDocument();
      expect(screen.getByText('gs://agent-sweep-artifacts')).toBeInTheDocument();
    });
  });

  it('rejects invalid gs:// bucket URIs in Option 2 sweep without invoking bulkEnforceAgentsObservability', async () => {
    vi.mocked(api.listResources).mockImplementation(((type: string) => {
      if (type === 'engines') {
        return Promise.resolve({
          engines: [
            {
              name: 'projects/test-project-123/locations/global/collections/default_collection/engines/engine-alpha',
              displayName: 'Customer Assistant Engine',
            },
          ],
        });
      }
      if (type === 'agents') {
        return Promise.resolve({
          agents: [
            {
              name: 'projects/test-project-123/locations/global/collections/default_collection/engines/engine-alpha/assistants/default_assistant/agents/bot-1',
              displayName: 'Support Agent',
              observabilityConfig: { observabilityEnabled: false },
            },
          ],
        });
      }
      return Promise.resolve({});
    }) as unknown as typeof api.listResources);

    vi.mocked(api.getAgent).mockResolvedValue({
      name: 'projects/test-project-123/locations/global/collections/default_collection/engines/engine-alpha/assistants/default_assistant/agents/bot-1',
      displayName: 'Support Agent',
      observabilityConfig: { observabilityEnabled: false },
    });

    render(<AgentObservabilityPolicyModal {...defaultProps} />);
    fireEvent.click(screen.getByText(/Option 2: Bulk Sweep in Manager/i));

    await waitFor(() => {
      expect(screen.getByText('Support Agent')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Artifact GCS Bucket URI/i), {
      target: { value: 's3://wrong-cloud-bucket' },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: /Enforce Telemetry on All Non-Compliant Agents/i,
      }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/must start with "gs:\/\/"/i);
    expect(api.bulkEnforceAgentsObservability).not.toHaveBeenCalled();
  });

  it('displays Legacy Schema badge and renders advisory when legacy auth errors occur', async () => {
    vi.mocked(api.listResources).mockImplementation(((type: string) => {
      if (type === 'engines') {
        return Promise.resolve({
          engines: [
            {
              name: 'projects/test-project-123/locations/global/collections/default_collection/engines/engine-alpha',
              displayName: 'Cosmere Engine',
            },
          ],
        });
      }
      if (type === 'agents') {
        return Promise.resolve({
          agents: [
            {
              name: 'projects/test-project-123/locations/global/collections/default_collection/engines/engine-alpha/assistants/default_assistant/agents/jira-bot',
              displayName: 'JIRA',
              authorizations: ['projects/test-project-123/locations/global/authorizations/jira-auth'],
              observabilityConfig: { observabilityEnabled: false },
            },
          ],
        });
      }
      return Promise.resolve({});
    }) as unknown as typeof api.listResources);

    vi.mocked(api.getAgent).mockResolvedValue({
      name: 'projects/test-project-123/locations/global/collections/default_collection/engines/engine-alpha/assistants/default_assistant/agents/jira-bot',
      displayName: 'JIRA',
      authorizations: ['projects/test-project-123/locations/global/authorizations/jira-auth'],
      observabilityConfig: { observabilityEnabled: false },
    });

    vi.mocked(api.bulkEnforceAgentsObservability).mockResolvedValue({
      total: 1,
      updated: 0,
      alreadyCompliant: 0,
      failed: 1,
      legacyAuthCount: 1,
      errors: [
        "JIRA: Legacy Schema: Created with deprecated 'agent.authorizations' field. Google Cloud API blocks in-place updates to this resource until re-created with 'authorizationConfig'.",
      ],
    });

    render(<AgentObservabilityPolicyModal {...defaultProps} />);

    fireEvent.click(screen.getByText(/Option 2: Bulk Sweep in Manager/i));

    await waitFor(() => {
      expect(screen.getByText('JIRA')).toBeInTheDocument();
      expect(screen.getByText('Legacy Schema')).toBeInTheDocument();
      expect(screen.getByText('OFF (Legacy Blocked)')).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: /Enforce Telemetry on All Non-Compliant Agents/i,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(/Enforcement Sweep Failed/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Google Cloud Discovery Engine API Constraint: Legacy Agent Schema/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/Migration & Remediation Steps:/i)).toBeInTheDocument();
      expect(screen.getByText(/Export the agent configuration as JSON/i)).toBeInTheDocument();
    });
  });

  it('switches to Option 3 tab and displays Agent Gateway governance principles', () => {
    render(<AgentObservabilityPolicyModal {...defaultProps} />);

    fireEvent.click(screen.getByText(/Option 3: Agent Gateway Governance/i));

    expect(screen.getByText(/Centralized Gateway Routing/i)).toBeInTheDocument();
    expect(screen.getByText(/Console Banner Reference/i)).toBeInTheDocument();
    expect(screen.getByText(/Summary Recommendation for Enterprise Architects/i)).toBeInTheDocument();
  });

  it('excludes Google-managed agents from the compliance denominator and badges them as Google-Managed (Exempt)', async () => {
    vi.mocked(api.listResources).mockImplementation(((type: string) => {
      if (type === 'engines') {
        return Promise.resolve({
          engines: [
            {
              name: 'projects/test-project-123/locations/global/collections/default_collection/engines/engine-alpha',
              displayName: 'Enterprise Engine',
            },
          ],
        });
      }
      if (type === 'agents') {
        return Promise.resolve({
          agents: [
            {
              name: 'projects/test-project-123/locations/global/collections/default_collection/engines/engine-alpha/assistants/default_assistant/agents/custom-bot',
              displayName: 'Custom FinOps Bot',
              observabilityConfig: { observabilityEnabled: true, sensitiveLoggingEnabled: true },
            },
            {
              name: 'projects/test-project-123/locations/global/collections/default_collection/engines/engine-alpha/assistants/default_assistant/agents/deep_research',
              displayName: 'Deep Research',
              observabilityConfig: { observabilityEnabled: false },
            },
          ],
        });
      }
      return Promise.resolve({});
    }) as unknown as typeof api.listResources);

    vi.mocked(api.getAgent).mockImplementation(async (name: string) => {
      if (name.endsWith('/custom-bot')) {
        return {
          name,
          displayName: 'Custom FinOps Bot',
          observabilityConfig: { observabilityEnabled: true, sensitiveLoggingEnabled: true },
        };
      }
      return {
        name,
        displayName: 'Deep Research',
        observabilityConfig: { observabilityEnabled: false },
      };
    });

    render(<AgentObservabilityPolicyModal {...defaultProps} />);

    fireEvent.click(screen.getByText(/Option 2: Bulk Sweep in Manager/i));

    await waitFor(() => {
      expect(screen.getByText('Custom FinOps Bot')).toBeInTheDocument();
      expect(screen.getByText('Deep Research')).toBeInTheDocument();
    });

    expect(screen.getByText('Google-Managed (Exempt)')).toBeInTheDocument();
    expect(screen.getByText(/1 \/ 1 Agents Telemetry Enabled/i)).toBeInTheDocument();
  });
});
