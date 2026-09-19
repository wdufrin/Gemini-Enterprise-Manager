import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import AgentListForAssistant from './AgentListForAssistant';
import * as api from '../../services/apiService';
import { ToastProvider } from '../../context/ToastContext';
import { Agent, AppEngine, Config } from '../../types';

vi.mock('../../services/apiService', () => ({
  updateAgent: vi.fn(),
  getAgent: vi.fn(),
  bulkEnforceAgentsObservability: vi.fn(),
}));

describe('AgentListForAssistant - Telemetry Policy Controls', () => {
  const mockConfig: Config = {
    projectId: 'test-proj',
    appLocation: 'global',
    collectionId: 'default_collection',
    appId: 'engine-1',
    assistantId: 'default_assistant',
  };

  const mockAgents: Agent[] = [
    {
      name: 'projects/test-proj/.../agents/agent-1',
      displayName: 'Monitored Agent',
      state: 'ENABLED',
      observabilityConfig: {
        observabilityEnabled: true,
        sensitiveLoggingEnabled: true,
      },
    },
    {
      name: 'projects/test-proj/.../agents/agent-2',
      displayName: 'Unmonitored Agent',
      state: 'ENABLED',
      observabilityConfig: {
        observabilityEnabled: false,
      },
    },
  ];

  const mockEngineWithSensitiveDisabled: AppEngine = {
    name: 'projects/test-proj/.../engines/engine-1',
    displayName: 'Test Engine',
    observabilityConfig: {
      observabilityEnabled: true,
      sensitiveLoggingEnabled: false,
    },
  };

  const mockEngineWithSensitiveEnabled: AppEngine = {
    name: 'projects/test-proj/.../engines/engine-1',
    displayName: 'Test Engine Sensitive',
    observabilityConfig: {
      observabilityEnabled: true,
      sensitiveLoggingEnabled: true,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders telemetry status column, monitored count badge, and info tooltip button', () => {
    render(
      <ToastProvider>
        <AgentListForAssistant
          agents={mockAgents}
          config={mockConfig}
          engine={mockEngineWithSensitiveDisabled}
          onRefreshAgents={vi.fn()}
        />
      </ToastProvider>,
    );

    expect(screen.getByText('Telemetry: 1 / 2 Monitored')).toBeInTheDocument();
    expect(screen.getByText('Telemetry')).toBeInTheDocument();
    expect(screen.getByText('ON')).toBeInTheDocument();
    expect(screen.getByText('(Sensitive)')).toBeInTheDocument();
    expect(screen.getByText('OFF')).toBeInTheDocument();

    const infoButton = screen.getByRole('button', { name: /More information/i });
    expect(infoButton).toBeInTheDocument();

    // Hover or focus to reveal tooltip
    fireEvent.mouseEnter(infoButton);
    expect(screen.getByText(/Enforcing telemetry synchronizes all child agents to enable OpenTelemetry/i)).toBeInTheDocument();
  });

  it('toggles single agent telemetry and inherits engine sensitive logging policy', async () => {
    (api.updateAgent as any).mockResolvedValue({
      ...mockAgents[1],
      observabilityConfig: { observabilityEnabled: true, sensitiveLoggingEnabled: false },
    });

    const onRefreshMock = vi.fn();

    render(
      <ToastProvider>
        <AgentListForAssistant
          agents={mockAgents}
          config={mockConfig}
          engine={mockEngineWithSensitiveDisabled}
          onRefreshAgents={onRefreshMock}
        />
      </ToastProvider>,
    );

    const enableButton = screen.getByTitle(/Telemetry disabled\. Click to turn ON OpenTelemetry & prompt logging\./i);
    fireEvent.click(enableButton);

    await waitFor(() => {
      expect(api.updateAgent).toHaveBeenCalledWith(
        mockAgents[1],
        {
          observabilityConfig: {
            observabilityEnabled: true,
            // Sensitive logging is false because parent engine has sensitiveLoggingEnabled: false
            sensitiveLoggingEnabled: false,
          },
        },
        mockConfig,
      );
      expect(onRefreshMock).toHaveBeenCalledTimes(1);
    });
  });

  it('bulk enforces telemetry policy matching the App Engine configuration', async () => {
    (api.bulkEnforceAgentsObservability as any).mockResolvedValue({
      total: 2,
      updated: 2,
      alreadyCompliant: 0,
      failed: 0,
      errors: [],
    });

    const onRefreshMock = vi.fn();

    render(
      <ToastProvider>
        <AgentListForAssistant
          agents={mockAgents}
          config={mockConfig}
          engine={mockEngineWithSensitiveDisabled}
          onRefreshAgents={onRefreshMock}
        />
      </ToastProvider>,
    );

    const bulkButton = screen.getByRole('button', { name: /Enforce Telemetry Policy/i });
    fireEvent.click(bulkButton);

    await waitFor(() => {
      expect(api.bulkEnforceAgentsObservability).toHaveBeenCalledWith(
        mockAgents,
        mockConfig,
        {
          observabilityEnabled: true,
          sensitiveLoggingEnabled: false,
        },
      );
      expect(onRefreshMock).toHaveBeenCalledTimes(1);
    });
  });

  it('bulk enforces telemetry policy with sensitive logging enabled when parent engine enables it', async () => {
    (api.bulkEnforceAgentsObservability as any).mockResolvedValue({
      total: 2,
      updated: 1,
      alreadyCompliant: 1,
      failed: 0,
      errors: [],
    });

    const onRefreshMock = vi.fn();

    render(
      <ToastProvider>
        <AgentListForAssistant
          agents={mockAgents}
          config={mockConfig}
          engine={mockEngineWithSensitiveEnabled}
          onRefreshAgents={onRefreshMock}
        />
      </ToastProvider>,
    );

    const bulkButton = screen.getByRole('button', { name: /Enforce Telemetry Policy/i });
    fireEvent.click(bulkButton);

    await waitFor(() => {
      expect(api.bulkEnforceAgentsObservability).toHaveBeenCalledWith(
        mockAgents,
        mockConfig,
        {
          observabilityEnabled: true,
          sensitiveLoggingEnabled: true,
        },
      );
      expect(onRefreshMock).toHaveBeenCalledTimes(1);
    });
  });

  it('disables enforce button and shows All Agents Monitored when all agents match engine settings', () => {
    const compliantAgents: Agent[] = [
      {
        name: 'projects/test-proj/.../agents/agent-1',
        displayName: 'Compliant Agent 1',
        observabilityConfig: { observabilityEnabled: true, sensitiveLoggingEnabled: false },
      },
      {
        name: 'projects/test-proj/.../agents/agent-2',
        displayName: 'Compliant Agent 2',
        observabilityConfig: { observabilityEnabled: true, sensitiveLoggingEnabled: false },
      },
    ];

    render(
      <ToastProvider>
        <AgentListForAssistant
          agents={compliantAgents}
          config={mockConfig}
          engine={mockEngineWithSensitiveDisabled}
          onRefreshAgents={vi.fn()}
        />
      </ToastProvider>,
    );

    const button = screen.getByRole('button', { name: /All Agents Monitored/i });
    expect(button).toBeDisabled();
  });

  it('renders Legacy Schema badge for agents with legacy authorizations', () => {
    const legacyAgents: Agent[] = [
      {
        name: 'projects/test-proj/.../agents/jira-bot',
        displayName: 'JIRA Bot',
        authorizations: ['projects/test-proj/locations/global/authorizations/jira-auth'],
        observabilityConfig: { observabilityEnabled: false },
      },
    ];

    render(
      <ToastProvider>
        <AgentListForAssistant
          agents={legacyAgents}
          config={mockConfig}
          engine={mockEngineWithSensitiveDisabled}
          onRefreshAgents={vi.fn()}
        />
      </ToastProvider>,
    );

    expect(screen.getByText('JIRA Bot')).toBeInTheDocument();
    expect(screen.getByText('Legacy Schema')).toBeInTheDocument();
    expect(screen.getByText('Legacy')).toBeInTheDocument();
  });

  it('displays descriptive error toast when toggling an agent with deprecated authorizations', async () => {
    const legacyAgents: Agent[] = [
      {
        name: 'projects/test-proj/.../agents/jira-bot',
        displayName: 'JIRA Bot',
        authorizations: ['projects/test-proj/locations/global/authorizations/jira-auth'],
        observabilityConfig: { observabilityEnabled: false },
      },
    ];

    (api.updateAgent as any).mockRejectedValue(
      new Error("The 'agent.authorizations' field is deprecated. Please use 'agent.authorization_config' instead."),
    );

    render(
      <ToastProvider>
        <AgentListForAssistant
          agents={legacyAgents}
          config={mockConfig}
          engine={mockEngineWithSensitiveDisabled}
          onRefreshAgents={vi.fn()}
        />
      </ToastProvider>,
    );

    const legacyButton = screen.getByTitle(/Legacy agent schema\. In-place API updates rejected by Google\./i);
    fireEvent.click(legacyButton);

    await waitFor(() => {
      expect(
        screen.getByText(/Cannot update "JIRA Bot": Resource uses legacy 'authorizations' schema rejected by Google API\./i),
      ).toBeInTheDocument();
    });
  });

  it('shows warning toast when bulk enforcement has partial failures', async () => {
    (api.bulkEnforceAgentsObservability as any).mockResolvedValue({
      total: 2,
      updated: 1,
      alreadyCompliant: 0,
      failed: 1,
      legacyAuthCount: 1,
      errors: ['JIRA Bot: Legacy Schema'],
    });

    render(
      <ToastProvider>
        <AgentListForAssistant
          agents={mockAgents}
          config={mockConfig}
          engine={mockEngineWithSensitiveDisabled}
          onRefreshAgents={vi.fn()}
        />
      </ToastProvider>,
    );

    const bulkButton = screen.getByRole('button', { name: /Enforce Telemetry Policy/i });
    fireEvent.click(bulkButton);

    await waitFor(() => {
      expect(
        screen.getByText(/Observability policy partially synchronized: 1 updated, 0 compliant, 1 skipped due to legacy schema blocks\./i),
      ).toBeInTheDocument();
    });
  });

  it('greys out and disables bulk Enforce button when app-level telemetry is OFF, but allows manual agent toggling', async () => {
    const engineWithObsOff: AppEngine = {
      name: 'projects/test-proj/.../engines/engine-1',
      displayName: 'Engine Telemetry Disabled',
      observabilityConfig: {
        observabilityEnabled: false,
        sensitiveLoggingEnabled: false,
      },
    };

    (api.updateAgent as any).mockResolvedValue({
      ...mockAgents[1],
      observabilityConfig: { observabilityEnabled: true, sensitiveLoggingEnabled: false },
    });

    const onRefreshMock = vi.fn();

    render(
      <ToastProvider>
        <AgentListForAssistant
          agents={mockAgents}
          config={mockConfig}
          engine={engineWithObsOff}
          onRefreshAgents={onRefreshMock}
        />
      </ToastProvider>,
    );

    // Header badge indicates app telemetry is OFF
    expect(screen.getByText(/App Telemetry: OFF/i)).toBeInTheDocument();

    // Bulk enforce button is disabled and styled as greyed-out
    const bulkButton = screen.getByRole('button', { name: /Enforce Telemetry Policy/i });
    expect(bulkButton).toBeDisabled();
    expect(bulkButton).toHaveClass('cursor-not-allowed');
    expect(bulkButton).toHaveClass('opacity-60');

    // Bulk include sensitive checkbox is hidden when app telemetry is off
    expect(screen.queryByText(/Include Sensitive Data/i)).not.toBeInTheDocument();

    // But individual agents CAN STILL be toggled manually by admins
    const manualToggleBtn = screen.getByTitle(/Telemetry disabled\. Click to turn ON OpenTelemetry & prompt logging\./i);
    expect(manualToggleBtn).toBeEnabled();
    fireEvent.click(manualToggleBtn);

    await waitFor(() => {
      expect(api.updateAgent).toHaveBeenCalledWith(
        mockAgents[1],
        {
          observabilityConfig: {
            observabilityEnabled: true,
            sensitiveLoggingEnabled: false,
          },
        },
        mockConfig,
      );
      expect(onRefreshMock).toHaveBeenCalledTimes(1);
    });
  });

  it('renders visual coverage badges for All Enabled, Part Enabled, and Disabled', () => {
    const mixedAgents: Agent[] = [
      {
        name: 'projects/test-proj/.../agents/agent-full',
        displayName: 'Full Agent',
        observabilityConfig: {
          observabilityEnabled: true,
          sensitiveLoggingEnabled: true,
        },
      },
      {
        name: 'projects/test-proj/.../agents/agent-part',
        displayName: 'Part Agent',
        observabilityConfig: {
          observabilityEnabled: true,
          sensitiveLoggingEnabled: false,
        },
      },
      {
        name: 'projects/test-proj/.../agents/agent-none',
        displayName: 'Disabled Agent',
        observabilityConfig: {
          observabilityEnabled: false,
        },
      },
    ];

    render(
      <ToastProvider>
        <AgentListForAssistant
          agents={mixedAgents}
          config={mockConfig}
          engine={mockEngineWithSensitiveDisabled}
          onRefreshAgents={vi.fn()}
        />
      </ToastProvider>,
    );

    // Summary badge shows monitored count breakdown
    expect(screen.getByText('Telemetry: 2 / 3 Monitored')).toBeInTheDocument();
    expect(screen.getByText('(1 Full · 1 Partial)')).toBeInTheDocument();

    // Row level badges
    expect(screen.getByText('All Enabled (Full)')).toBeInTheDocument();
    expect(screen.getByText('Part Enabled (Traces Only)')).toBeInTheDocument();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('toggles Option 1 (Traces) and Option 2 (Sensitive) directly from the row controls', async () => {
    (api.updateAgent as any).mockResolvedValue({
      ...mockAgents[1],
      observabilityConfig: { observabilityEnabled: true, sensitiveLoggingEnabled: false },
    });

    const onRefreshMock = vi.fn();

    render(
      <ToastProvider>
        <AgentListForAssistant
          agents={mockAgents}
          config={mockConfig}
          engine={mockEngineWithSensitiveDisabled}
          onRefreshAgents={onRefreshMock}
        />
      </ToastProvider>,
    );

    // On agent-2 (currently disabled), Option 2 Sensitive should be disabled because Traces is OFF
    const opt2DisabledBtn = screen.getByTitle(/Enable Traces first to log sensitive prompts/i);
    expect(opt2DisabledBtn).toBeDisabled();

    // Toggle Option 1 (Traces) ON for agent-2
    const opt1Btn = screen.getByRole('button', { name: '1. Traces: OFF' });
    fireEvent.click(opt1Btn);

    await waitFor(() => {
      expect(api.updateAgent).toHaveBeenCalledWith(
        mockAgents[1],
        {
          observabilityConfig: {
            observabilityEnabled: true,
            sensitiveLoggingEnabled: false,
          },
        },
        mockConfig,
      );
    });
  });

  it('opens Configure Agent Telemetry Modal and updates options', async () => {
    (api.updateAgent as any).mockResolvedValue({
      ...mockAgents[1],
      observabilityConfig: { observabilityEnabled: true, sensitiveLoggingEnabled: true },
    });

    const onRefreshMock = vi.fn();

    render(
      <ToastProvider>
        <AgentListForAssistant
          agents={mockAgents}
          config={mockConfig}
          engine={mockEngineWithSensitiveDisabled}
          onRefreshAgents={onRefreshMock}
        />
      </ToastProvider>,
    );

    // Click gear button for agent-2
    const gearBtn = screen.getByLabelText(/Configure telemetry options for Unmonitored Agent/i);
    fireEvent.click(gearBtn);

    // Modal opens
    expect(screen.getByText('Configure Agent Telemetry')).toBeInTheDocument();
    expect(screen.getByText('Resulting Coverage:')).toBeInTheDocument();

    // In modal, check Option 1 (Traces)
    const traceCheckbox = screen.getByLabelText(/1\. OpenTelemetry Distributed Tracing/i);
    fireEvent.click(traceCheckbox);

    // Now sensitive checkbox is enabled, check it
    const sensitiveCheckbox = screen.getByLabelText(/2\. Sensitive Prompt & Payload Logging/i);
    expect(sensitiveCheckbox).toBeEnabled();
    fireEvent.click(sensitiveCheckbox);

    // Resulting coverage updates to All Enabled (Full)
    const modalCoverages = screen.getAllByText('All Enabled (Full)');
    expect(modalCoverages.length).toBeGreaterThan(0);

    // Click Save Settings
    const saveButton = screen.getByRole('button', { name: /Save Settings/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(api.updateAgent).toHaveBeenCalledWith(
        mockAgents[1],
        {
          observabilityConfig: {
            observabilityEnabled: true,
            sensitiveLoggingEnabled: true,
          },
        },
        mockConfig,
      );
      expect(onRefreshMock).toHaveBeenCalledTimes(1);
    });
  });
});
