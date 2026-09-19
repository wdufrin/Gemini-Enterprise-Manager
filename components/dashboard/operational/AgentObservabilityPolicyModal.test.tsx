import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AgentObservabilityPolicyModal } from './AgentObservabilityPolicyModal';
import * as api from '../../../services/apiService';

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

    // In coverage gap tab:
    expect(screen.getByText(/The Google Cloud Console Observability Default Reality/i)).toBeInTheDocument();
    expect(screen.getByText(/~65% of Total Logs/i)).toBeInTheDocument();
    expect(screen.getByText(/~35% Missing Blindspot/i)).toBeInTheDocument();
  });

  it('switches to Option 1 tab and displays Terraform manifest and Cloud Function code', () => {
    render(<AgentObservabilityPolicyModal {...defaultProps} />);

    const opt1Tab = screen.getByText(/Option 1: Eventarc Auto-Enabler/i);
    fireEvent.click(opt1Tab);

    expect(screen.getByText(/eventarc_agent_observability\.tf/i)).toBeInTheDocument();
    expect(screen.getByText(/main\.py \(Python 3\.11\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Event-Driven Policy Flow/i)).toBeInTheDocument();
  });

  it('switches to Option 2 tab, loads engines and agents, and performs bulk sweep', async () => {
    (api.listResources as any).mockImplementation((type: string) => {
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
    });

    (api.getAgent as any).mockResolvedValue({
      name: 'projects/test-project-123/locations/global/collections/default_collection/engines/engine-alpha/assistants/default_assistant/agents/bot-1',
      displayName: 'Support Agent',
      observabilityConfig: { observabilityEnabled: false },
    });

    (api.bulkEnforceAgentsObservability as any).mockResolvedValue({
      total: 1,
      updated: 1,
      alreadyCompliant: 0,
      failed: 0,
      errors: [],
    });

    render(<AgentObservabilityPolicyModal {...defaultProps} />);

    const opt2Tab = screen.getByText(/Option 2: Bulk Sweep in Manager/i);
    fireEvent.click(opt2Tab);

    await waitFor(() => {
      expect(screen.getByText(/Customer Assistant Engine/i)).toBeInTheDocument();
      expect(screen.getByText(/Support Agent/i)).toBeInTheDocument();
      expect(screen.getByText(/OFF \(Blindspot\)/i)).toBeInTheDocument();
    });

    const sweepBtn = screen.getByRole('button', {
      name: /Enforce Telemetry on All Non-Compliant Agents/i,
    });
    fireEvent.click(sweepBtn);

    await waitFor(() => {
      expect(api.bulkEnforceAgentsObservability).toHaveBeenCalled();
    });
    expect(screen.getByText(/Enforcement Sweep Completed Successfully!/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Patched/i).length).toBeGreaterThanOrEqual(1);
  });

  it('displays Legacy Schema badge and renders advisory when legacy auth errors occur', async () => {
    (api.listResources as any).mockImplementation((type: string) => {
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
    });

    (api.getAgent as any).mockResolvedValue({
      name: 'projects/test-project-123/locations/global/collections/default_collection/engines/engine-alpha/assistants/default_assistant/agents/jira-bot',
      displayName: 'JIRA',
      authorizations: ['projects/test-project-123/locations/global/authorizations/jira-auth'],
      observabilityConfig: { observabilityEnabled: false },
    });

    (api.bulkEnforceAgentsObservability as any).mockResolvedValue({
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

    const opt2Tab = screen.getByText(/Option 2: Bulk Sweep in Manager/i);
    fireEvent.click(opt2Tab);

    await waitFor(() => {
      expect(screen.getByText('JIRA')).toBeInTheDocument();
      expect(screen.getByText('Legacy Schema')).toBeInTheDocument();
      expect(screen.getByText('OFF (Legacy Blocked)')).toBeInTheDocument();
    });

    const sweepBtn = screen.getByRole('button', {
      name: /Enforce Telemetry on All Non-Compliant Agents/i,
    });
    fireEvent.click(sweepBtn);

    await waitFor(() => {
      expect(screen.getByText(/Enforcement Sweep Failed/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Google Cloud Discovery Engine API Constraint: Legacy Agent Schema/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Migration & Remediation Steps:/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Export the agent configuration as JSON/i),
      ).toBeInTheDocument();
    });
  });

  it('switches to Option 3 tab and displays Agent Gateway governance principles', () => {
    render(<AgentObservabilityPolicyModal {...defaultProps} />);

    const opt3Tab = screen.getByText(/Option 3: Agent Gateway Governance/i);
    fireEvent.click(opt3Tab);

    expect(screen.getByText(/Centralized Gateway Routing/i)).toBeInTheDocument();
    expect(screen.getByText(/Console Banner Reference/i)).toBeInTheDocument();
    expect(screen.getByText(/Summary Recommendation for Enterprise Architects/i)).toBeInTheDocument();
  });
});
