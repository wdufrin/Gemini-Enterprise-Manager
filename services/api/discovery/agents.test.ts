import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as core from '../core';
import {
  updateAgent,
  bulkEnforceAgentsObservability,
  transferAgentOwner,
  formatTransferTargetPrincipal,
  buildTransferAgentOwnerPayload,
  isCustomNoCodeAgent,
  shareAgent,
  buildCloneAgentPayloadForCreate,
  formatSharedIamPrincipal,
  extractAgentOwnerHint,
  adminPublishAndShareForUser,
  isGoogleManagedAgent,
  isProtectedGoogleAgentResourceName,
  deleteResource,
  restoreDeepResearchAgent,
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

describe('agents API - shareAgent and Admin Publish & Share for User', () => {
  const mockConfig: Config = {
    projectId: 'test-project',
    appLocation: 'global',
    collectionId: 'default_collection',
    appId: 'test-engine',
    assistantId: 'default_assistant',
  };

  const privateAgentName =
    'projects/test-project/locations/global/collections/default_collection/engines/test-engine/assistants/default_assistant/agents/private-agent-1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shareAgent executes :deployLowCode -> :initIamPolicy -> :requestAgentReview -> :enableAgent for an undeployed low-code private agent', async () => {
    const mockPrivateAgent: Agent = {
      name: privateAgentName,
      displayName: 'User Draft Agent',
      state: 'PRIVATE',
      lowCodeAgentDefinition: {
        nodes: [{ id: 'root', llmAgentNode: { instruction: 'Help' } }],
        rootAgentId: 'root',
      },
    };

    vi.mocked(core.gapiRequest)
      // 1. getAgent (initial)
      .mockResolvedValueOnce(mockPrivateAgent)
      // 2. deployLowCodeAgent
      .mockResolvedValueOnce({
        ...mockPrivateAgent,
        lowCodeAgentDefinition: {
          ...mockPrivateAgent.lowCodeAgentDefinition,
          deployedRootAgentId: 'root',
        },
      })
      // 3. initIamPolicy
      .mockResolvedValueOnce({ bindings: [] })
      // 4. requestAgentReview
      .mockResolvedValueOnce({ ...mockPrivateAgent, state: 'DISABLED' })
      // 5. getAgent (afterReview check)
      .mockResolvedValueOnce({ ...mockPrivateAgent, state: 'DISABLED' })
      // 6. enableAgent (:enableAgent POST)
      .mockResolvedValueOnce({})
      // 7. enableAgent internal getAgent
      .mockResolvedValueOnce({ ...mockPrivateAgent, state: 'ENABLED' });

    const res = await shareAgent(privateAgentName, mockConfig);

    expect(res.state).toBe('ENABLED');
    expect(core.gapiRequest).toHaveBeenCalledTimes(7);
    const urls = vi.mocked(core.gapiRequest).mock.calls.map((c) => c[0]);
    expect(urls[0]).toBe(`https://discoveryengine.googleapis.com/v1alpha/${privateAgentName}`);
    expect(urls[1]).toBe(
      `https://discoveryengine.googleapis.com/v1alpha/${privateAgentName}:deployLowCode`,
    );
    expect(urls[2]).toBe(
      `https://discoveryengine.googleapis.com/v1alpha/${privateAgentName}:initIamPolicy`,
    );
    expect(urls[3]).toBe(
      `https://discoveryengine.googleapis.com/v1alpha/${privateAgentName}:requestAgentReview`,
    );
    expect(urls[4]).toBe(`https://discoveryengine.googleapis.com/v1alpha/${privateAgentName}`);
    expect(urls[5]).toBe(
      `https://discoveryengine.googleapis.com/v1alpha/${privateAgentName}:enableAgent`,
    );
  });

  it('shareAgent surfaces a clear explanation when a non-owner Admin hits 403 on a PRIVATE agent', async () => {
    const mockPrivateAgent: Agent = {
      name: privateAgentName,
      displayName: 'User Private Agent',
      state: 'PRIVATE',
      lowCodeAgentDefinition: {
        nodes: [{ id: 'root' }],
      },
    };

    vi.mocked(core.gapiRequest)
      .mockResolvedValueOnce(mockPrivateAgent)
      .mockRejectedValueOnce(
        new Error('403 PERMISSION_DENIED: User does not have permission to deploy the agent.'),
      );

    await expect(shareAgent(privateAgentName, mockConfig)).rejects.toThrow(
      /Only the agent owner can directly share a PRIVATE agent in-place.*Admin Publish & Share for User/i,
    );
  });

  it('buildCloneAgentPayloadForCreate promotes deployedNodes to nodes, strips server-rejected output-only fields, and migrates legacy authorizations', () => {
    const sourceAgent: Agent = {
      name: privateAgentName,
      displayName: 'Original User Agent',
      description: 'Analyzes tickets',
      state: 'PRIVATE',
      authorizations: ['projects/123/locations/global/authorizations/jira-auth'],
      lowCodeAgentDefinition: {
        deployedNodes: [{ id: 'root_1', llmAgentNode: { instruction: 'Run' } }],
        deployedRootAgentId: 'root_1',
        session: 'projects/test-project/locations/global/.../sessions/user-session-999',
        schedules: [
          {
            name: 'daily',
            cron: '0 9 * * *',
            timeZone: 'America/New_York',
            prompt: 'Summarize',
            disabled: false,
          } as unknown as Record<string, unknown>,
        ],
        deployedSchedules: [{ name: 'daily' }],
      } as Agent['lowCodeAgentDefinition'],
    };

    const payload = buildCloneAgentPayloadForCreate(sourceAgent, {
      displayName: 'Published Ticket Agent',
      sharingScope: 'ALL_USERS',
    });

    expect(payload.displayName).toBe('Published Ticket Agent');
    expect(payload.sharingConfig).toEqual({ scope: 'ALL_USERS' });
    expect(payload.authorizations).toBeUndefined();
    expect(payload.authorizationConfig).toEqual({
      toolAuthorizations: ['projects/123/locations/global/authorizations/jira-auth'],
    });
    expect(payload.lowCodeAgentDefinition?.nodes).toEqual([
      { id: 'root_1', llmAgentNode: { instruction: 'Run' } },
    ]);
    expect(payload.lowCodeAgentDefinition?.rootAgentId).toBe('root_1');
    expect(payload.lowCodeAgentDefinition?.deployedNodes).toBeUndefined();
    expect(payload.lowCodeAgentDefinition?.deployedRootAgentId).toBeUndefined();
    expect(payload.lowCodeAgentDefinition?.session).toBeUndefined();
    expect(
      (payload.lowCodeAgentDefinition as Record<string, unknown>)?.deployedSchedules,
    ).toBeUndefined();
    expect(
      (
        (payload.lowCodeAgentDefinition as Record<string, unknown>)
          ?.schedules as Array<Record<string, unknown>>
      )?.[0]?.disabled,
    ).toBeUndefined();
  });

  it('formatSharedIamPrincipal normalizes valid IAM members and rejects malformed or unsupported inputs', () => {
    expect(formatSharedIamPrincipal('alice@company.com')).toBe('user:alice@company.com');
    expect(formatSharedIamPrincipal('group:eng@company.com')).toBe('group:eng@company.com');
    expect(formatSharedIamPrincipal('domain:company.com')).toBe('domain:company.com');
    expect(formatSharedIamPrincipal('allUsers')).toBe('allUsers');
    expect(
      formatSharedIamPrincipal(
        '//iam.googleapis.com/locations/global/workforcePools/pool-1/group/team-a',
      ),
    ).toBe('principalSet://iam.googleapis.com/locations/global/workforcePools/pool-1/group/team-a');

    expect(() => formatSharedIamPrincipal('')).toThrow(/cannot be empty/i);
    expect(() => formatSharedIamPrincipal('invalid-member-without-at')).toThrow(
      /Invalid IAM principal/i,
    );
    expect(() => formatSharedIamPrincipal('role:admin@company.com')).toThrow(
      /Invalid IAM principal/i,
    );
  });

  it('extractAgentOwnerHint extracts creator/owner email from agent metadata when present', () => {
    expect(
      extractAgentOwnerHint({
        name: privateAgentName,
        displayName: 'Test',
        creatorEmail: 'creator@company.com',
      } as unknown as Agent),
    ).toBe('creator@company.com');
    expect(extractAgentOwnerHint(null)).toBeNull();
  });

  it('adminPublishAndShareForUser clones a user PRIVATE agent, deploys, activates sharing, grants IAM access, transfers ownership to user, and deletes the original draft', async () => {
    const sourceAgent: Agent = {
      name: privateAgentName,
      displayName: 'Alice Private Research Bot',
      description: 'Private bot built by Alice',
      state: 'PRIVATE',
      starterPrompts: [{ text: 'Summarize Q3' }],
      lowCodeAgentDefinition: {
        nodes: [{ id: 'root', llmAgentNode: { instruction: 'Research' } }],
        rootAgentId: 'root',
      },
    };

    const clonedAgentName =
      'projects/test-project/locations/global/collections/default_collection/engines/test-engine/assistants/default_assistant/agents/cloned-agent-99';

    const clonedAgent: Agent = {
      ...sourceAgent,
      name: clonedAgentName,
      state: 'PRIVATE',
    };

    vi.mocked(core.gapiRequest)
      // 1. getAgent (source)
      .mockResolvedValueOnce(sourceAgent)
      // 2. createAgent (POST .../agents)
      .mockResolvedValueOnce(clonedAgent)
      // 3. deployLowCodeAgent (:deployLowCode)
      .mockResolvedValueOnce({
        ...clonedAgent,
        lowCodeAgentDefinition: {
          ...clonedAgent.lowCodeAgentDefinition,
          deployedRootAgentId: 'root',
        },
      })
      // 4. initIamPolicy (:initIamPolicy)
      .mockResolvedValueOnce({ bindings: [] })
      // 5. requestAgentReview (:requestAgentReview)
      .mockResolvedValueOnce({ ...clonedAgent, state: 'DISABLED' })
      // 6. getAgent (afterReview)
      .mockResolvedValueOnce({ ...clonedAgent, state: 'DISABLED' })
      // 7. enableAgent (:enableAgent POST)
      .mockResolvedValueOnce({})
      // 8. enableAgent internal getAgent
      .mockResolvedValueOnce({ ...clonedAgent, state: 'ENABLED' })
      // 9. getAgentIamPolicy (:getIamPolicy)
      .mockResolvedValueOnce({
        etag: 'etag-1',
        bindings: [
          {
            role: 'roles/discoveryengine.agentOwner',
            members: ['user:admin@company.com'],
          },
        ],
      })
      // 10. setAgentIamPolicy (:setIamPolicy)
      .mockResolvedValueOnce({
        etag: 'etag-2',
        bindings: [
          {
            role: 'roles/discoveryengine.agentOwner',
            members: ['user:admin@company.com'],
          },
          {
            role: 'roles/discoveryengine.agentUser',
            members: ['group:sales@company.com'],
          },
        ],
      })
      // 11. transferAgentOwner (:transferAgentOwner)
      .mockResolvedValueOnce({})
      // 12. deleteResource (DELETE source private agent)
      .mockResolvedValueOnce({})
      // 13. final getAgent
      .mockResolvedValueOnce({
        ...clonedAgent,
        state: 'ENABLED',
        sharingConfig: { scope: 'RESTRICTED' },
      });

    const progressSteps: string[] = [];
    const result = await adminPublishAndShareForUser(
      sourceAgent,
      {
        displayName: 'Alice Shared Research Bot',
        targetOwnerPrincipal: 'alice@company.com',
        previousOwnerDisposition: 'KEEP_AS_AGENT_USER',
        sharingScope: 'RESTRICTED',
        sharedPrincipals: ['group:sales@company.com'],
        deleteOriginalPrivateAgent: true,
        onProgress: (msg) => progressSteps.push(msg),
      },
      mockConfig,
    );

    expect(result.agent.name).toBe(clonedAgentName);
    expect(result.agent.state).toBe('ENABLED');
    expect(result.transferredTo).toBe('user:alice@company.com');
    expect(result.deletedOriginal).toBe(true);
    expect(result.wasCloned).toBe(true);
    expect(progressSteps.length).toBeGreaterThanOrEqual(5);

    // Verify transferAgentOwner call payload
    const transferCall = vi
      .mocked(core.gapiRequest)
      .mock.calls.find((c) => String(c[0]).endsWith(':transferAgentOwner'));
    expect(transferCall).toBeDefined();
    expect(transferCall?.[4]).toEqual({
      targetPrincipal: { principal: 'user:alice@company.com' },
      previousOwnerDisposition: 'KEEP_AS_AGENT_USER',
    });

    // Verify delete original private agent call
    const deleteCall = vi
      .mocked(core.gapiRequest)
      .mock.calls.find((c) => c[1] === 'DELETE');
    expect(deleteCall?.[0]).toBe(
      `https://discoveryengine.googleapis.com/v1alpha/${privateAgentName}`,
    );
  });

  it('adminPublishAndShareForUser rejects invalid targetOwnerPrincipal before making mutating API calls', async () => {
    const sourceAgent: Agent = {
      name: privateAgentName,
      displayName: 'Draft Agent',
      state: 'PRIVATE',
      lowCodeAgentDefinition: { nodes: [{ id: 'root' }] },
    };

    await expect(
      adminPublishAndShareForUser(
        sourceAgent,
        {
          targetOwnerPrincipal: 'group:not-a-single-user@company.com',
        },
        mockConfig,
      ),
    ).rejects.toThrow(/single user identity/i);
    expect(core.gapiRequest).not.toHaveBeenCalled();
  });

  it('identifies Google-managed built-in agents via managedAgentDefinition, agentOrigin, agentType, or deterministic 1P agentId', () => {
    expect(
      isGoogleManagedAgent({
        name: 'projects/test-project/locations/global/collections/default_collection/engines/test-engine/assistants/default_assistant/agents/deep_research',
        displayName: 'Deep Research',
      }),
    ).toBe(true);

    expect(
      isGoogleManagedAgent({
        name: 'projects/test-project/locations/global/collections/default_collection/engines/test-engine/assistants/default_assistant/agents/custom_id',
        displayName: 'Managed Agent',
        managedAgentDefinition: {
          researchAssistantAgentConfig: { supportLroQueries: true },
        },
      }),
    ).toBe(true);

    expect(
      isGoogleManagedAgent({
        name: 'projects/test-project/locations/global/collections/default_collection/engines/test-engine/assistants/default_assistant/agents/custom_id',
        displayName: 'Google Origin Agent',
        agentOrigin: 'GOOGLE',
      }),
    ).toBe(true);

    expect(
      isGoogleManagedAgent({
        name: privateAgentName,
        displayName: 'Custom User Agent',
        lowCodeAgentDefinition: { nodes: [{ id: 'root' }] },
      }),
    ).toBe(false);

    expect(
      isProtectedGoogleAgentResourceName(
        'projects/test-project/locations/global/collections/default_collection/engines/test-engine/assistants/default_assistant/agents/deep_research',
      ),
    ).toBe(true);
    expect(
      isProtectedGoogleAgentResourceName(
        'projects/test-project/locations/global/collections/default_collection/engines/test-engine/assistants/default_assistant/agents/idea_generation',
      ),
    ).toBe(true);
    expect(isProtectedGoogleAgentResourceName(privateAgentName)).toBe(false);
  });

  it('deleteResource blocks deletion of protected Google built-in agents (e.g. deep_research) and never issues a DELETE request', async () => {
    const deepResearchResource =
      'projects/test-project/locations/global/collections/default_collection/engines/test-engine/assistants/default_assistant/agents/deep_research';

    await expect(deleteResource(deepResearchResource, mockConfig)).rejects.toThrow(
      /Deletion blocked: "deep_research" is a Google-managed built-in agent and cannot be deleted/i,
    );
    expect(core.gapiRequest).not.toHaveBeenCalled();
  });

  it('restoreDeepResearchAgent re-provisions deep_research with canonical managedAgentDefinition payload, deploys, and enables the agent', async () => {
    const deepResearchName =
      'projects/test-project/locations/global/collections/default_collection/engines/test-engine/assistants/default_assistant/agents/deep_research';

    vi.mocked(core.gapiRequest)
      // 1. createAgent (?agentId=deep_research)
      .mockResolvedValueOnce({
        name: deepResearchName,
        displayName: 'Deep Research',
        state: 'CONFIGURED',
      })
      // 2. deployAgent (:deploy)
      .mockResolvedValueOnce({})
      // 3. getAgent (check state)
      .mockResolvedValueOnce({
        name: deepResearchName,
        displayName: 'Deep Research',
        state: 'DISABLED',
      })
      // 4. enableAgent (:enableAgent)
      .mockResolvedValueOnce({})
      // 5. enableAgent internal getAgent
      .mockResolvedValueOnce({
        name: deepResearchName,
        displayName: 'Deep Research',
        state: 'ENABLED',
      });

    const restored = await restoreDeepResearchAgent(mockConfig);

    expect(restored.name).toBe(deepResearchName);
    expect(restored.state).toBe('ENABLED');

    const createCall = vi.mocked(core.gapiRequest).mock.calls[0];
    expect(createCall[0]).toBe(
      'https://discoveryengine.googleapis.com/v1alpha/projects/test-project/locations/global/collections/default_collection/engines/test-engine/assistants/default_assistant/agents?agentId=deep_research',
    );
    expect(createCall[1]).toBe('POST');
    expect(createCall[4]).toEqual({
      displayName: 'Deep Research',
      description: expect.stringContaining('gathers, analyzes, and understands information'),
      managedAgentDefinition: {
        toolSettings: {
          toolDescription: expect.stringContaining('gathers, analyzes, and understands information'),
        },
        researchAssistantAgentConfig: {
          supportLroQueries: true,
        },
      },
      sharingConfig: {
        scope: 'ALL_USERS',
      },
      longRunningOperationsEnabled: true,
    });

    const deployCall = vi.mocked(core.gapiRequest).mock.calls[1];
    expect(deployCall[0]).toBe(
      `https://discoveryengine.googleapis.com/v1alpha/${deepResearchName}:deploy`,
    );
    expect(deployCall[1]).toBe('POST');
  });
});


