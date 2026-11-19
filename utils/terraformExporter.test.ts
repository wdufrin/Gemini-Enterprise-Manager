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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  escapeHclString,
  toHclIdentifier,
  generateVanityUrlTerraform,
  generateDiscoveryProjectTerraform,
} from './terraformExporter';
import {
  buildPromotedAgentPayload,
  promoteAgentsToTarget,
  runConfigAudit,
} from '../services/configAuditService';
import * as api from '../services/apiService';
import { Agent, AppEngine, Assistant, Config } from '../types';

vi.mock('../services/apiService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/apiService')>();
  return {
    ...actual,
    getEngine: vi.fn(),
    getAssistant: vi.fn(),
    listResources: vi.fn(),
    listRegistrySkills: vi.fn(),
    listAuthorizations: vi.fn(),
    listLicenseConfigsUsageStats: vi.fn(),
    createAgent: vi.fn(),
    updateAgent: vi.fn(),
  };
});

/**
 * Verifies that an HCL double-quoted string body contains zero unescaped `${`
 * or `%{` template sequences and zero unescaped `"` characters.
 */
function assertNoUnescapedHclInterpolationOrQuotes(escaped: string): void {
  for (let i = 0; i < escaped.length; i++) {
    if (escaped[i] === '"') {
      // Must be preceded by an odd number of backslashes
      let backslashes = 0;
      for (let j = i - 1; j >= 0 && escaped[j] === '\\'; j--) {
        backslashes++;
      }
      expect(backslashes % 2).toBe(1);
    }
    if (escaped[i] === '{' && i > 0) {
      if (escaped[i - 1] === '$') {
        // Must be `$${`, meaning escaped[i - 2] === '$' and NOT `$$${` (escaped[i - 3] !== '$')
        expect(escaped[i - 2]).toBe('$');
        expect(escaped[i - 3]).not.toBe('$');
      }
      if (escaped[i - 1] === '%') {
        expect(escaped[i - 2]).toBe('%');
        expect(escaped[i - 3]).not.toBe('%');
      }
    }
  }
}

describe('escapeHclString & toHclIdentifier — Adversarial HCL Injection Defense', () => {
  it('neutralizes hostile HCL file() interpolation, directives, quotes, backslashes, and control chars', () => {
    const hostileInputs = [
      '${file("/etc/passwd")}',
      '"${file("/etc/passwd")}"',
      '$${file("/etc/shadow")}',
      '$$${file("/proc/self/environ")}',
      '%{if true}${file("/etc/passwd")}%{endif}',
      '%%{for k, v in var.secrets}${v}%{endfor}',
      'line1\nline2\r\n\t"quoted"\\trailing\\',
      'null\u0000bell\u0007del\u007f',
    ];

    for (const payload of hostileInputs) {
      const escaped = escapeHclString(payload);
      expect(escaped).not.toContain('\n');
      expect(escaped).not.toContain('\r');
      expect(escaped).not.toContain('\u0000');
      assertNoUnescapedHclInterpolationOrQuotes(escaped);
    }

    expect(escapeHclString('${file("/etc/passwd")}')).toBe('$${file(\\"/etc/passwd\\")}');
    expect(escapeHclString('%{if true}x%{endif}')).toBe('%%{if true}x%%{endif}');
    // Adversarial double-dollar attempt `$${...}` must NOT become `$$${...}` (which HCL lexes as `$` + active `${...}`)
    const doubleDollar = escapeHclString('$${file("/etc/passwd")}');
    expect(doubleDollar).toBe('\\u0024$${file(\\"/etc/passwd\\")}');
  });

  it('sanitizes arbitrary strings into valid HCL resource identifiers', () => {
    expect(toHclIdentifier('123-prod.engine/v1')).toBe('r_123-prod_engine_v1');
    expect(toHclIdentifier('"; resource "null_resource" "pwn" {}')).toBe(
      'resource_null_resource_pwn'
    );
    expect(toHclIdentifier('   ', 'fallback_id')).toBe('fallback_id');
  });
});

describe('generateVanityUrlTerraform', () => {
  it('generates Global External HTTPS Load Balancer HCL redirecting to Gemini Enterprise CID', () => {
    const hcl = generateVanityUrlTerraform({
      projectId: 'acme-prod-100',
      serviceName: 'gemini-portal',
      portalCid: 'cid-99887766',
      customDomain: 'ai.acme.example.com',
      isPrivateMode: false,
      automateDNS: true,
      dnsProjectId: 'acme-dns-host',
    });

    expect(hcl).toContain('resource "google_compute_global_address" "vanity_ip"');
    expect(hcl).toContain('resource "google_compute_managed_ssl_certificate" "vanity_cert"');
    expect(hcl).toContain('resource "google_compute_url_map" "vanity_redirect_map"');
    expect(hcl).toContain('host_redirect          = "vertexaisearch.cloud.google.com"');
    expect(hcl).toContain('path_redirect          = "/u/0/home/cid/${var.portal_cid}"');
    expect(hcl).toContain('resource "google_compute_target_https_proxy" "vanity_https_proxy"');
    expect(hcl).toContain(
      'resource "google_compute_global_forwarding_rule" "vanity_forwarding_rule"'
    );
    expect(hcl).toContain('default     = "acme-dns-host"');
  });

  it('generates Private PSC HCL without overwriting shared *.googleapis.com. DNS unless explicitly opted in', () => {
    const defaultPrivateHcl = generateVanityUrlTerraform({
      projectId: 'acme-vpc-sc',
      serviceName: 'ge-psc',
      portalCid: 'cid-private-1',
      isPrivateMode: true,
      vpcNetwork: 'shared-vpc',
      vpcSubnet: 'ilb-subnet',
      customDomain: 'ge.internal.acme.corp',
      useVpcScBundle: true,
      automatePrivateDns: true,
    });

    // Must default manage_shared_googleapis_dns to false!
    expect(defaultPrivateHcl).toMatch(
      /variable "manage_shared_googleapis_dns"[\s\S]*?default\s*=\s*false/
    );
    expect(defaultPrivateHcl).toContain('count       = var.manage_shared_googleapis_dns ? 1 : 0');
    expect(defaultPrivateHcl).toContain('default     = "vpc-sc"');
    expect(defaultPrivateHcl).toContain('resource "google_compute_address" "internal_redirect_ip"');
    expect(defaultPrivateHcl).toContain(
      'resource "google_compute_forwarding_rule" "internal_redirect_forwarding_rule"'
    );

    const optInPrivateHcl = generateVanityUrlTerraform({
      projectId: 'acme-vpc-sc',
      serviceName: 'ge-psc',
      portalCid: 'cid-private-1',
      isPrivateMode: true,
      manageSharedGoogleapisDns: true,
    });
    expect(optInPrivateHcl).toMatch(
      /variable "manage_shared_googleapis_dns"[\s\S]*?default\s*=\s*true/
    );
  });

  it('neutralizes hostile HCL injection inside Vanity URL parameters', () => {
    const hcl = generateVanityUrlTerraform({
      projectId: 'proj-${file("/etc/passwd")}',
      serviceName: 'svc"}\nresource "local_file" "exploit" {',
      portalCid: 'cid-%{if true}boom%{endif}',
      customDomain: 'evil.example.com',
    });

    expect(hcl).toContain('proj-$${file(\\"/etc/passwd\\")}');
    expect(hcl).not.toContain('\nresource "local_file" "exploit"');
  });
});

describe('generateDiscoveryProjectTerraform', () => {
  it('exports Search & Chat Engines, DataStores, Custom Roles, and redacts Authorization secrets in local_file bundle', () => {
    const hcl = generateDiscoveryProjectTerraform({
      projectId: 'ent-prod-01',
      location: 'global',
      dataStores: [
        {
          name: 'projects/ent-prod-01/locations/global/collections/default_collection/dataStores/confluence-kb',
          displayName: 'Confluence KB',
          industryVertical: 'GENERIC',
          contentConfig: 'CONTENT_REQUIRED',
          solutionTypes: ['SOLUTION_TYPE_SEARCH'],
        },
      ],
      engines: [
        {
          name: 'projects/ent-prod-01/locations/global/collections/default_collection/engines/ent-search',
          displayName: 'Enterprise Search',
          solutionType: 'SOLUTION_TYPE_SEARCH',
          dataStoreIds: ['confluence-kb'],
        },
        {
          name: 'projects/ent-prod-01/locations/global/collections/default_collection/engines/ent-chat',
          displayName: 'Enterprise Chat',
          solutionType: 'SOLUTION_TYPE_CHAT',
          dataStoreIds: ['confluence-kb'],
        },
      ],
      customRoles: [
        {
          name: 'projects/ent-prod-01/roles/geLeastPrivViewer',
          title: 'GE Viewer',
          description: 'Least privilege viewer',
          includedPermissions: ['discoveryengine.engines.get', 'discoveryengine.agents.list'],
          stage: 'GA',
        },
      ],
      assistants: [
        {
          name: 'projects/ent-prod-01/locations/global/collections/default_collection/engines/ent-search/assistants/default_assistant',
          displayName: 'Default Assistant',
          googleSearchGroundingEnabled: true,
        },
      ],
      agents: [
        {
          name: 'projects/ent-prod-01/locations/global/collections/default_collection/engines/ent-search/assistants/default_assistant/agents/agt-1',
          displayName: 'Hostile Agent ${file("/etc/passwd")}',
          description: 'Desc %{if true}leak%{endif}',
        },
      ],
      authorizations: [
        {
          name: 'projects/ent-prod-01/locations/global/authorizations/jira-oauth',
          serverSideOauth2: {
            clientId: 'client-123',
            clientSecret: 'SUPER_SECRET_LIVE_VALUE_DO_NOT_EXPORT',
            authorizationUri: 'https://auth.example.com/authorize',
            tokenUri: 'https://auth.example.com/token',
          },
        },
      ],
    });

    expect(hcl).toContain('resource "google_discovery_engine_data_store" "ds_confluence-kb"');
    expect(hcl).toContain('resource "google_discovery_engine_search_engine" "engine_ent-search"');
    expect(hcl).toContain('resource "google_discovery_engine_chat_engine" "engine_ent-chat"');
    expect(hcl).toContain(
      'data_store_ids    = [google_discovery_engine_data_store.ds_confluence-kb.data_store_id]'
    );
    expect(hcl).toContain('resource "google_project_iam_custom_role" "role_geleastprivviewer"');
    expect(hcl).toContain('resource "local_file" "gemini_enterprise_declarative_bundle"');

    // Secret must NEVER appear in exported HCL
    expect(hcl).not.toContain('SUPER_SECRET_LIVE_VALUE_DO_NOT_EXPORT');
    expect(hcl).toContain('REPLACE_WITH_SECRET_MANAGER_VALUE');

    // Nested agent `${file(...)}` inside declarative JSON bundle must be HCL-escaped!
    expect(hcl).not.toMatch(/[^$]$\{file\(/);
    expect(hcl).toContain('$${file(');
  });
});

describe('Cross-Project Agent Promotion & Assistant/Agent Parity Audit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rewrites project, authorizations, dataStoreSpecs, dataConnectors, and preserves regional ReasoningEngine location during promotion', () => {
    const devAgent: Agent = {
      name: 'projects/dev-proj/locations/global/collections/default_collection/engines/dev-eng/assistants/default_assistant/agents/sec-agent',
      displayName: 'SecOps Triage Agent',
      description: 'Triages alerts',
      state: 'ENABLED',
      authorizations: ['projects/dev-proj/locations/global/authorizations/pagerduty-dev'],
      observabilityConfig: { observabilityEnabled: true, sensitiveLoggingEnabled: false },
      dataStoreSpecs: {
        specs: [
          {
            dataStore:
              'projects/dev-proj/locations/global/collections/default_collection/dataStores/runbooks-dev',
          },
        ],
      },
      dataConnectors: [
        {
          name: 'projects/dev-proj/locations/global/collections/jira-dev/dataConnector',
          dataSource: 'jira',
        },
      ],
      adkAgentDefinition: {
        toolSettings: { toolDescription: 'Invoke SecOps ADK' },
        provisionedReasoningEngine: {
          reasoningEngine: 'projects/dev-proj/locations/us-central1/reasoningEngines/111222',
        },
      },
    };

    const prodConfig: Config = {
      projectId: 'prod-proj',
      appLocation: 'global',
      collectionId: 'default_collection',
      appId: 'prod-eng',
      assistantId: 'default_assistant',
    };

    const promoted = buildPromotedAgentPayload(devAgent, prodConfig, {
      dataStoreMap: { 'runbooks-dev': 'runbooks-prod' },
      connectorMap: { 'jira-dev': 'jira-prod' },
      authorizationMap: { 'pagerduty-dev': 'pagerduty-prod' },
      reasoningEngineMap: { '111222': '999888' },
    });

    // Legacy authorizations migrated to authorizationConfig and remapped
    expect(promoted.authorizations).toBeUndefined();
    expect(promoted.authorizationConfig?.toolAuthorizations).toEqual([
      'projects/prod-proj/locations/global/authorizations/pagerduty-prod',
    ]);
    // ReasoningEngine MUST stay in us-central1, NEVER global!
    expect(promoted.adkAgentDefinition?.provisionedReasoningEngine?.reasoningEngine).toBe(
      'projects/prod-proj/locations/us-central1/reasoningEngines/999888'
    );
    expect(promoted.dataStoreSpecs?.specs?.[0]?.dataStore).toBe(
      'projects/prod-proj/locations/global/collections/default_collection/dataStores/runbooks-prod'
    );
    expect(promoted.dataConnectors?.[0]?.name).toBe(
      'projects/prod-proj/locations/global/collections/jira-prod/dataConnector'
    );
    expect(promoted.observabilityConfig).toEqual({
      observabilityEnabled: true,
      sensitiveLoggingEnabled: false,
    });
  });

  it('promotes new agents via createAgent and existing matching agents via updateAgent', async () => {
    const prodConfig: Config = {
      projectId: 'prod-proj',
      appLocation: 'global',
      collectionId: 'default_collection',
      appId: 'prod-eng',
      assistantId: 'default_assistant',
    };

    const existingProdAgent: Agent = {
      name: 'projects/prod-proj/locations/global/collections/default_collection/engines/prod-eng/assistants/default_assistant/agents/existing-99',
      displayName: 'Existing Bot',
    };

    vi.mocked(api.listResources).mockResolvedValueOnce({ agents: [existingProdAgent] });
    vi.mocked(api.updateAgent).mockResolvedValueOnce({
      ...existingProdAgent,
      description: 'Updated',
    });
    vi.mocked(api.createAgent).mockResolvedValueOnce({
      name: 'projects/prod-proj/locations/global/collections/default_collection/engines/prod-eng/assistants/default_assistant/agents/new-77',
      displayName: 'Brand New Bot',
    });

    const outcomes = await promoteAgentsToTarget({
      agents: [
        {
          name: 'projects/dev-proj/locations/global/collections/default_collection/engines/dev-eng/assistants/default_assistant/agents/dev-1',
          displayName: 'Existing Bot',
          description: 'Updated',
        },
        {
          name: 'projects/dev-proj/locations/global/collections/default_collection/engines/dev-eng/assistants/default_assistant/agents/dev-2',
          displayName: 'Brand New Bot',
          description: 'Fresh',
        },
      ],
      targetConfig: prodConfig,
      updateExistingByName: true,
    });

    expect(outcomes).toEqual([
      expect.objectContaining({ displayName: 'Existing Bot', action: 'UPDATED' }),
      expect.objectContaining({ displayName: 'Brand New Bot', action: 'CREATED' }),
    ]);
    expect(api.updateAgent).toHaveBeenCalledTimes(1);
    expect(api.createAgent).toHaveBeenCalledTimes(1);
  });

  it('detects missing Model Armor policy on Target Assistant and missing/drifted Registered Agents in runConfigAudit', async () => {
    const srcCfg: Config = {
      projectId: 'dev-1',
      appLocation: 'global',
      collectionId: 'default_collection',
      appId: 'eng-1',
      assistantId: 'default_assistant',
    };
    const tgtCfg: Config = {
      projectId: 'prod-1',
      appLocation: 'global',
      collectionId: 'default_collection',
      appId: 'eng-1',
      assistantId: 'default_assistant',
    };

    vi.mocked(api.getEngine).mockImplementation(async (appId, cfg) => ({
      name: `projects/${cfg.projectId}/locations/global/collections/default_collection/engines/${appId}`,
      displayName: 'App',
      solutionType: 'SOLUTION_TYPE_SEARCH',
    } as AppEngine));

    vi.mocked(api.getAssistant).mockImplementation(async (_name, cfg) => {
      if (cfg.projectId === 'dev-1') {
        return {
          name: 'projects/dev-1/locations/global/collections/default_collection/engines/eng-1/assistants/default_assistant',
          customerPolicy: {
            modelArmorConfig: {
              userPromptTemplate: 'projects/dev-1/locations/global/templates/strict-prompt',
              failureMode: 'FAIL_CLOSED',
            },
          },
          googleSearchGroundingEnabled: true,
        } as Assistant;
      }
      return {
        name: 'projects/prod-1/locations/global/collections/default_collection/engines/eng-1/assistants/default_assistant',
        googleSearchGroundingEnabled: false,
      } as Assistant;
    });

    vi.mocked(api.listResources).mockImplementation(async (type, cfg) => {
      if (type === 'dataStores') return { dataStores: [] };
      if (type === 'agents') {
        if (cfg.projectId === 'dev-1') {
          return {
            agents: [
              {
                name: 'projects/dev-1/.../agents/hr-bot',
                displayName: 'HR Concierge',
                adkAgentDefinition: { provisionedReasoningEngine: { reasoningEngine: 're-1' } },
                state: 'ENABLED',
              },
            ],
          };
        }
        return { agents: [] };
      }
      return {};
    });
    vi.mocked(api.listRegistrySkills).mockResolvedValue([]);
    vi.mocked(api.listAuthorizations).mockResolvedValue({ authorizations: [] });
    vi.mocked(api.listLicenseConfigsUsageStats).mockResolvedValue({
      licenseConfigUsageStats: [],
    } as never);

    const summary = await runConfigAudit(srcCfg, tgtCfg);

    const maItem = summary.items.find((i) => i.id === 'assistant-customer-policy');
    expect(maItem?.status).toBe('MISSING_IN_TARGET');
    expect(maItem?.severity).toBe('ERROR');

    const groundingItem = summary.items.find((i) => i.id === 'assistant-grounding-flags');
    expect(groundingItem?.status).toBe('DRIFT');

    const agentItem = summary.items.find((i) => i.id === 'agent-hr-bot');
    expect(agentItem?.status).toBe('MISSING_IN_TARGET');
    expect(agentItem?.sourceValue).toContain('ADK');
  });
});
