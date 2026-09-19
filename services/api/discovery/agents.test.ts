import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as core from '../core';
import { updateAgent, bulkEnforceAgentsObservability } from './agents';
import { Agent, Config } from '../../../types';

vi.mock('../core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core')>();
  return {
    ...actual,
    gapiRequest: vi.fn(),
  };
});

describe('agents API - Observability policy and bulk enforcer', () => {
  const mockConfig: Config = {
    projectId: 'test-project',
    appLocation: 'global',
    collectionId: 'default_collection',
    appId: 'test-engine',
    assistantId: 'default_assistant',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updateAgent appends observabilityConfig to updateMask and sends payload via PATCH', async () => {
    const mockAgent: Agent = {
      name: 'projects/test-project/locations/global/collections/default_collection/engines/test-engine/assistants/default_assistant/agents/agent-123',
      displayName: 'Customer Support Bot',
    };

    (core.gapiRequest as any).mockResolvedValue({
      ...mockAgent,
      observabilityConfig: {
        observabilityEnabled: true,
        sensitiveLoggingEnabled: true,
      },
    });

    const res = await updateAgent(
      mockAgent,
      {
        observabilityConfig: {
          observabilityEnabled: true,
          sensitiveLoggingEnabled: true,
        },
      },
      mockConfig,
    );

    expect(core.gapiRequest).toHaveBeenCalledTimes(1);
    const [url, method, projectId, , payload] = (core.gapiRequest as any).mock.calls[0];

    expect(method).toBe('PATCH');
    expect(projectId).toBe('test-project');
    expect(url).toContain('updateMask=observabilityConfig');
    expect(url).toContain('agents/agent-123');
    expect(payload).toEqual({
      observabilityConfig: {
        observabilityEnabled: true,
        sensitiveLoggingEnabled: true,
      },
    });
    expect(res.observabilityConfig?.observabilityEnabled).toBe(true);
  });

  it('bulkEnforceAgentsObservability patches non-compliant agents and skips already compliant ones', async () => {
    const agents: Agent[] = [
      {
        name: 'projects/test-project/.../agents/agent-1',
        displayName: 'Agent 1 (needs update)',
        observabilityConfig: { observabilityEnabled: false },
      },
      {
        name: 'projects/test-project/.../agents/agent-2',
        displayName: 'Agent 2 (already compliant)',
        observabilityConfig: { observabilityEnabled: true, sensitiveLoggingEnabled: false },
      },
      {
        name: 'projects/test-project/.../agents/agent-3',
        displayName: 'Agent 3 (missing config)',
      },
    ];

    (core.gapiRequest as any).mockResolvedValue({ name: 'updated' });

    const result = await bulkEnforceAgentsObservability(agents, mockConfig, {
      observabilityEnabled: true,
      sensitiveLoggingEnabled: false,
    });

    expect(result.total).toBe(3);
    expect(result.updated).toBe(2);
    expect(result.alreadyCompliant).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.errors).toEqual([]);

    expect(core.gapiRequest).toHaveBeenCalledTimes(2);
  });

  it('bulkEnforceAgentsObservability handles API errors on individual agents without aborting the sweep', async () => {
    const agents: Agent[] = [
      {
        name: 'projects/test-project/.../agents/agent-ok',
        displayName: 'Healthy Agent',
        observabilityConfig: { observabilityEnabled: false },
      },
      {
        name: 'projects/test-project/.../agents/agent-failing',
        displayName: 'Failing Agent',
        observabilityConfig: { observabilityEnabled: false },
      },
    ];

    (core.gapiRequest as any)
      .mockResolvedValueOnce({ name: 'updated' })
      .mockRejectedValueOnce(new Error('Permission denied on AgentService.UpdateAgent'));

    const result = await bulkEnforceAgentsObservability(agents, mockConfig, {
      observabilityEnabled: true,
      sensitiveLoggingEnabled: true,
    });

    expect(result.total).toBe(2);
    expect(result.updated).toBe(1);
    expect(result.alreadyCompliant).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('Permission denied on AgentService.UpdateAgent');
  });

  it('bulkEnforceAgentsObservability detects legacy agent.authorizations errors and increments legacyAuthCount', async () => {
    const legacyAgent: Agent = {
      name: 'projects/test-project/.../agents/jira-legacy',
      displayName: 'JIRA',
      observabilityConfig: { observabilityEnabled: false },
    };

    (core.gapiRequest as any).mockRejectedValueOnce(
      new Error(
        "The 'agent.authorizations' field is deprecated. Please use 'agent.authorization_config' instead. [ORIGINAL ERROR] generic::invalid_argument: ...",
      ),
    );

    const result = await bulkEnforceAgentsObservability([legacyAgent], mockConfig, {
      observabilityEnabled: true,
    });

    expect(result.total).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.legacyAuthCount).toBe(1);
    expect(result.errors[0]).toContain('Legacy Schema: Created with deprecated \'agent.authorizations\' field');
    expect(result.errors[0]).not.toContain('[ORIGINAL ERROR]');
  });
});
