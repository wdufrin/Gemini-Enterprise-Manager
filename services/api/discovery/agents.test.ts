import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as core from '../core';
import {
  updateAgent,
  bulkEnforceAgentsObservability,
  transferAgentOwner,
  formatTransferTargetPrincipal,
  buildTransferAgentOwnerPayload,
  isCustomNoCodeAgent,
} from './agents';
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

    vi.mocked(core.gapiRequest).mockResolvedValue({
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
    const [url, method, projectId, , payload] = vi.mocked(core.gapiRequest).mock.calls[0];

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

    vi.mocked(core.gapiRequest).mockResolvedValue({ name: 'updated' });

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

    vi.mocked(core.gapiRequest)
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

    vi.mocked(core.gapiRequest).mockRejectedValueOnce(
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

describe('agents API - Ownership Transfer (transferAgentOwner)', () => {
  const mockConfig: Config = {
    projectId: 'test-project',
    appLocation: 'global',
    collectionId: 'default_collection',
    appId: 'test-engine',
    assistantId: 'default_assistant',
  };

  const agentResourceName =
    'projects/test-project/locations/global/collections/default_collection/engines/test-engine/assistants/default_assistant/agents/nocode-agent-1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('isCustomNoCodeAgent identifies low-code, workflow, and no-code agents and excludes ADK/A2A agents', () => {
    expect(isCustomNoCodeAgent({ lowCodeAgentDefinition: { nodes: [] } })).toBe(true);
    expect(isCustomNoCodeAgent({ workflowAgentDefinition: { agentFlow: {} } })).toBe(true);
    expect(isCustomNoCodeAgent({ noCodeAgentDefinition: {} })).toBe(true);
    expect(isCustomNoCodeAgent({ agentType: 'LOW_CODE' })).toBe(true);
    expect(isCustomNoCodeAgent({ agentOrigin: 'AGENT_DESIGNER' })).toBe(true);
    expect(isCustomNoCodeAgent({ adkAgentDefinition: {} })).toBe(false);
    expect(isCustomNoCodeAgent({ a2aAgentDefinition: { jsonAgentCard: '{}' } })).toBe(false);
    expect(isCustomNoCodeAgent(null)).toBe(false);
  });

  it('formatTransferTargetPrincipal normalizes bare emails, user: emails, and WIF principals', () => {
    expect(formatTransferTargetPrincipal('alice@example.com')).toBe('user:alice@example.com');
    expect(formatTransferTargetPrincipal('  user:bob@example.com  ')).toBe('user:bob@example.com');
    expect(
      formatTransferTargetPrincipal(
        '//iam.googleapis.com/locations/global/workforcePools/corp-pool/subject/alice.smith',
      ),
    ).toBe(
      'principal://iam.googleapis.com/locations/global/workforcePools/corp-pool/subject/alice.smith',
    );
    expect(
      formatTransferTargetPrincipal(
        'principal://iam.googleapis.com/locations/global/workforcePools/corp-pool/subject/Bob.Jones',
      ),
    ).toBe(
      'principal://iam.googleapis.com/locations/global/workforcePools/corp-pool/subject/Bob.Jones',
    );
  });

  it('formatTransferTargetPrincipal rejects empty, malformed, public, group, domain, and serviceAccount principals', () => {
    expect(() => formatTransferTargetPrincipal('')).toThrow(/required/i);
    expect(() => formatTransferTargetPrincipal('   ')).toThrow(/required/i);
    expect(() => formatTransferTargetPrincipal('not-an-email')).toThrow(/Must be a valid email/i);
    expect(() => formatTransferTargetPrincipal('allUsers')).toThrow(/single user identity/i);
    expect(() => formatTransferTargetPrincipal('allAuthenticatedUsers')).toThrow(/single user identity/i);
    expect(() => formatTransferTargetPrincipal('group:eng@example.com')).toThrow(/single user identity/i);
    expect(() => formatTransferTargetPrincipal('domain:example.com')).toThrow(/single user identity/i);
    expect(() =>
      formatTransferTargetPrincipal('serviceAccount:bot@test-project.iam.gserviceaccount.com'),
    ).toThrow(/single user identity/i);
    expect(() =>
      formatTransferTargetPrincipal(
        'principalSet://iam.googleapis.com/locations/global/workforcePools/corp-pool/group/admins',
      ),
    ).toThrow(/single user identity/i);
    expect(() =>
      formatTransferTargetPrincipal('principal://iam.googleapis.com/locations/global/workforcePools/corp-pool'),
    ).toThrow(/Workforce Identity principal must match/i);
  });

  it('transferAgentOwner sends currentUser: {} and KEEP_AS_AGENT_USER when transferring to self', async () => {
    vi.mocked(core.gapiRequest).mockResolvedValue({});

    await transferAgentOwner(agentResourceName, { toSelf: true }, mockConfig);

    expect(core.gapiRequest).toHaveBeenCalledTimes(1);
    const [url, method, projectId, , payload] = vi.mocked(core.gapiRequest).mock.calls[0];
    expect(url).toBe(
      `https://discoveryengine.googleapis.com/v1alpha/${agentResourceName}:transferAgentOwner`,
    );
    expect(method).toBe('POST');
    expect(projectId).toBe('test-project');
    expect(payload).toEqual({
      currentUser: {},
      previousOwnerDisposition: 'KEEP_AS_AGENT_USER',
    });
  });

  it('transferAgentOwner sends targetPrincipal with normalized user: email and regional endpoint', async () => {
    vi.mocked(core.gapiRequest).mockResolvedValue({});

    await transferAgentOwner(
      'short-agent-id',
      {
        toSelf: false,
        targetPrincipal: 'newowner@example.com',
        previousOwnerDisposition: 'REMOVE',
      },
      { ...mockConfig, appLocation: 'us' },
    );

    expect(core.gapiRequest).toHaveBeenCalledTimes(1);
    const [url, method, , , payload] = vi.mocked(core.gapiRequest).mock.calls[0];
    expect(url).toBe(
      'https://us-discoveryengine.googleapis.com/v1alpha/projects/test-project/locations/us/collections/default_collection/engines/test-engine/assistants/default_assistant/agents/short-agent-id:transferAgentOwner',
    );
    expect(method).toBe('POST');
    expect(payload).toEqual({
      targetPrincipal: {
        principal: 'user:newowner@example.com',
      },
      previousOwnerDisposition: 'REMOVE',
    });
  });

  it('transferAgentOwner propagates 403 Permission Denied errors without swallowing', async () => {
    vi.mocked(core.gapiRequest).mockRejectedValueOnce(
      new Error('403 PERMISSION_DENIED: Caller lacks discoveryengine.agents.transferOwner'),
    );

    await expect(
      transferAgentOwner(
        agentResourceName,
        { toSelf: false, targetPrincipal: 'alice@example.com' },
        mockConfig,
      ),
    ).rejects.toThrow('403 PERMISSION_DENIED');

    expect( buildTransferAgentOwnerPayload({ toSelf: true }) ).toEqual({
      currentUser: {},
      previousOwnerDisposition: 'KEEP_AS_AGENT_USER',
    });
  });
});

