import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ConfigAuditPage from './ConfigAuditPage';
import * as api from '../services/apiService';
import * as configAuditService from '../services/configAuditService';
import * as auditLogsApi from '../services/api/auditLogs';

vi.mock('../services/apiService', () => ({
  listResources: vi.fn(),
}));

vi.mock('../services/configAuditService', async () => {
  const actual = await vi.importActual<typeof import('../services/configAuditService')>(
    '../services/configAuditService',
  );
  return {
    ...actual,
    promoteAgentsToTarget: vi.fn(),
  };
});

vi.mock('../services/api/auditLogs', async () => {
  const actual = await vi.importActual<typeof import('../services/api/auditLogs')>(
    '../services/api/auditLogs',
  );
  return {
    ...actual,
    fetchAdminAuditLogs: vi.fn(),
  };
});

describe('ConfigAuditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.mocked(auditLogsApi.fetchAdminAuditLogs).mockResolvedValue({
      entries: [],
      executedFilter: 'logName:"cloudaudit.googleapis.com"',
      nextPageToken: undefined,
    });
  });

  it('renders the audit page with Gemini Enterprise App ID dropdown populated from api', async () => {
    vi.mocked(api.listResources).mockImplementation(async (type) => {
      if (type === 'engines') {
        return {
          engines: [
            {
              name: 'projects/123456789012/locations/global/collections/default_collection/engines/test-destination_1780931139203',
              displayName: 'test_destination',
              solutionType: 'SOLUTION_TYPE_SEARCH',
            },
            {
              name: 'projects/123456789012/locations/global/collections/default_collection/engines/testing-jira_1766765338880',
              displayName: 'Testing Jira',
              solutionType: 'SOLUTION_TYPE_SEARCH',
            },
          ],
        };
      }
      return {};
    });

    render(
      <ConfigAuditPage
        projectNumber="123456789012"
        projectId="my-project-123456"
        accessToken="mock-token"
      />,
    );

    // Verify header exists
    expect(screen.getByText('App Configuration Audit')).toBeInTheDocument();

    // Verify Gemini Enterprise App ID label exists
    const appLabels = screen.getAllByText('Gemini Enterprise App ID');
    expect(appLabels.length).toBeGreaterThanOrEqual(1);

    // Wait for the dropdown to populate with discovered engines
    await waitFor(() => {
      expect(screen.getByText(/test_destination \(test-destination_1780931139203\)/)).toBeInTheDocument();
      expect(screen.getByText(/Testing Jira \(testing-jira_1766765338880\)/)).toBeInTheDocument();
    });

    // Test toggle to enter manually
    const enterManuallyBtn = screen.getByText('Enter manually');
    fireEvent.click(enterManuallyBtn);

    // Now input fields should be shown
    const manualInputs = screen.getAllByPlaceholderText('default_engine');
    expect(manualInputs.length).toBeGreaterThanOrEqual(1);

    // Test toggle back to select from list
    const selectListBtn = screen.getByText('Select from list');
    fireEvent.click(selectListBtn);

    // Dropdown should be back
    expect(screen.getByText(/test_destination \(test-destination_1780931139203\)/)).toBeInTheDocument();
  });

  it('debounces rapid typing in Destination Environment project input (250ms) and updates Source & Audit Logs reactively when global project changes', async () => {
    vi.mocked(api.listResources).mockResolvedValue({ engines: [] });

    const { rerender } = render(
      <ConfigAuditPage
        projectNumber="111111"
        projectId="alpha-dev-proj"
        accessToken="mock-token"
      />,
    );

    await waitFor(() => {
      expect(api.listResources).toHaveBeenCalledWith(
        'engines',
        expect.objectContaining({ projectId: 'alpha-dev-proj' }),
        undefined,
        100,
        true,
      );
    });

    const sourceInput = screen.getByPlaceholderText(
      'e.g. my-source-project or 123456789',
    ) as HTMLInputElement;
    const targetInput = screen.getByPlaceholderText(
      'e.g. my-target-project or 987654321',
    ) as HTMLInputElement;
    expect(sourceInput.value).toBe('alpha-dev-proj');

    vi.mocked(api.listResources).mockClear();
    vi.useFakeTimers();

    // Rapid keystrokes into Destination project must NOT trigger intermediate API calls
    fireEvent.change(targetInput, { target: { value: 'p' } });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.change(targetInput, { target: { value: 'pr' } });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.change(targetInput, { target: { value: 'prod-cutover' } });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(api.listResources).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(60);
    });
    expect(api.listResources).toHaveBeenCalledTimes(1);
    expect(api.listResources).toHaveBeenCalledWith(
      'engines',
      expect.objectContaining({ projectId: 'prod-cutover' }),
      undefined,
      100,
      true,
    );

    vi.useRealTimers();

    // Switch global project in top-bar -> Source Environment and AdminAuditTrailPanel update reactively
    rerender(
      <ConfigAuditPage
        projectNumber="222222"
        projectId="beta-staging-proj"
        accessToken="mock-token"
      />,
    );

    await waitFor(() => {
      expect(
        (screen.getByPlaceholderText('e.g. my-source-project or 123456789') as HTMLInputElement)
          .value,
      ).toBe('beta-staging-proj');
    });

    // Switch to Cloud Audit Logs tab and verify targetProject tracks global project switch too
    fireEvent.click(screen.getByRole('tab', { name: /Cloud Audit Logs/i }));
    const auditProjInput = screen.getByPlaceholderText('e.g. my-prod-project') as HTMLInputElement;
    expect(auditProjInput.value).toBe('beta-staging-proj');

    rerender(
      <ConfigAuditPage
        projectNumber="333333"
        projectId="gamma-prod-proj"
        accessToken="mock-token"
      />,
    );

    await waitFor(() => {
      expect(
        (screen.getByPlaceholderText('e.g. my-prod-project') as HTMLInputElement).value,
      ).toBe('gamma-prod-proj');
    });
  });

  it('gates cross-project agent promotion behind a confirmation Modal before executing promoteAgentsToTarget', async () => {
    vi.mocked(api.listResources).mockImplementation(async (type) => {
      if (type === 'agents') {
        return {
          agents: [
            {
              name: 'projects/dev-proj/locations/global/collections/default_collection/engines/default_engine/assistants/default_assistant/agents/agt-1',
              displayName: 'HR Benefits Copilot',
              description: 'Answers HR questions',
              state: 'ENABLED',
            },
          ],
        };
      }
      return { engines: [] };
    });

    vi.mocked(configAuditService.promoteAgentsToTarget).mockResolvedValue([
      {
        sourceAgentName:
          'projects/dev-proj/locations/global/collections/default_collection/engines/default_engine/assistants/default_assistant/agents/agt-1',
        displayName: 'HR Benefits Copilot',
        action: 'CREATED',
        targetAgentName:
          'projects/prod-proj/locations/global/collections/default_collection/engines/prod_engine/assistants/default_assistant/agents/agt-1',
      },
    ]);

    render(
      <ConfigAuditPage
        projectNumber="111"
        projectId="dev-proj"
        accessToken="mock-token"
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: /Cross-Project Agent Promotion/i }));

    // Specify target project and load source agents
    fireEvent.change(screen.getByPlaceholderText('e.g. my-prod-project'), {
      target: { value: 'prod-proj' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Load Source Agents/i }));

    await waitFor(() => {
      expect(screen.getByText('HR Benefits Copilot')).toBeInTheDocument();
    });

    // Clicking Promote must open confirmation dialog WITHOUT calling promoteAgentsToTarget yet
    fireEvent.click(screen.getByTestId('open-promote-confirm-btn'));
    expect(
      screen.getByRole('dialog', { name: /Confirm Cross-Project Agent Promotion/i }),
    ).toBeInTheDocument();
    expect(configAuditService.promoteAgentsToTarget).not.toHaveBeenCalled();

    // Negative check: pressing Escape cancels the modal and does not execute writes
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(
      screen.queryByRole('dialog', { name: /Confirm Cross-Project Agent Promotion/i }),
    ).not.toBeInTheDocument();
    expect(configAuditService.promoteAgentsToTarget).not.toHaveBeenCalled();

    // Reopen and explicitly confirm promotion
    fireEvent.click(screen.getByTestId('open-promote-confirm-btn'));
    fireEvent.click(screen.getByTestId('confirm-promote-agents-btn'));

    await waitFor(() => {
      expect(configAuditService.promoteAgentsToTarget).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText(/\[CREATED\] HR Benefits Copilot/)).toBeInTheDocument();
  });
});
