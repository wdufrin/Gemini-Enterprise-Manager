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
  evaluateAssistantData,
  inferByomcpArchetype,
  generateByomcpGuidance,
  evaluateByomcpConnector,
  applyByomcpRecommendations,
  isByomcpConnector,
  generateAssistantEvaluationMarkdown,
  runLiveAssistantEvaluation,
} from './assistantEvaluationService';
import * as api from './apiService';
import { AppEngine, Assistant, Agent, Config, DataStore, DataConnector } from '../types';

vi.mock('./apiService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./apiService')>();
  return {
    ...actual,
    updateDataConnector: vi.fn(),
    getEngine: vi.fn(),
    getAssistant: vi.fn(),
    listResources: vi.fn(),
    getEngineIamPolicy: vi.fn(),
    getDiscoveryProjectConfig: vi.fn(),
    listCollections: vi.fn(),
    getDataConnector: vi.fn(),
  };
});

const baseConfig: Config = {
  projectId: '123456',
  appLocation: 'global',
  collectionId: 'default_collection',
  appId: 'enterprise-app',
  assistantId: 'default_assistant',
};

const baseEngine: AppEngine = {
  name: 'projects/123456/locations/global/collections/default_collection/engines/enterprise-app',
  displayName: 'Enterprise App',
  solutionType: 'SOLUTION_TYPE_SEARCH',
  searchEngineConfig: {
    searchTier: 'SEARCH_TIER_ENTERPRISE',
    searchAddOns: ['SEARCH_ADD_ON_LLM'],
  },
  observabilityConfig: {
    observabilityEnabled: true,
  },
  dataStoreIds: ['ds-hr-policies', 'ds-it-runbooks'],
};

const baseAssistant: Assistant = {
  name: 'projects/123456/locations/global/collections/default_collection/engines/enterprise-app/assistants/default_assistant',
  displayName: 'Default Assistant',
  webGroundingType: 'WEB_GROUNDING_TYPE_DISABLED',
  generationConfig: {
    systemInstruction: {
      additionalSystemInstruction:
        'You are an enterprise assistant for Acme Corp. Route HR questions to the HR Policy datastore and IT questions to IT Runbooks.',
    },
  },
  customerPolicy: {
    modelArmorConfig: {
      userPromptTemplate: 'projects/123456/locations/global/templates/prompt-guard',
      responseTemplate: 'projects/123456/locations/global/templates/response-guard',
      failureMode: 'FAIL_CLOSED',
    },
  },
};

const sampleDataStores: DataStore[] = [
  {
    name: 'projects/123456/locations/global/collections/default_collection/dataStores/ds-hr-policies',
    displayName: 'HR Policies & Benefits',
    industryVertical: 'GENERIC',
    solutionTypes: ['SOLUTION_TYPE_SEARCH'],
    contentConfig: 'CONTENT_REQUIRED',
  },
  {
    name: 'projects/123456/locations/global/collections/default_collection/dataStores/ds-it-runbooks',
    displayName: 'IT Engineering Runbooks',
    industryVertical: 'GENERIC',
    solutionTypes: ['SOLUTION_TYPE_SEARCH'],
    contentConfig: 'CONTENT_REQUIRED',
  },
];

const healthyOrgSkill: Agent = {
  name: 'projects/123456/locations/global/collections/default_collection/engines/enterprise-app/assistants/default_assistant/agents/skill-hr-it-router',
  displayName: 'HR & IT Domain Query Router',
  description: 'Routes employee benefits, PTO, and IT engineering runbook queries to the matching enterprise datastore.',
  state: 'ENABLED',
  sharingConfig: { scope: 'ALL_USERS' },
  skillAgentDefinition: {
    instruction:
      'Decompose employee questions into concise keyword phrases before querying HR Policies & Benefits or IT Engineering Runbooks. Cite the exact document title and section.',
  },
};

describe('assistantEvaluationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Healthy Configuration Baseline', () => {
    it('awards an A grade and LOW latency risk to a well-configured assistant with scoped datastores, org skills, and Model Armor', () => {
      const report = evaluateAssistantData({
        engine: baseEngine,
        assistant: baseAssistant,
        agents: [healthyOrgSkill],
        config: baseConfig,
        dataStores: sampleDataStores,
        connectorsByCollectionId: {},
        engineIamPolicy: {
          bindings: [{ role: 'roles/discoveryengine.viewer', members: ['group:employees@acme.com'] }],
        },
        dataStoreAccessControlEnabled: true,
      });

      expect(report.overallScore).toBeGreaterThanOrEqual(90);
      expect(report.grade).toBe('A');
      expect(report.latencyRiskLevel).toBe('LOW');
      expect(report.metrics.connectedDataStoresCount).toBe(2);
      expect(report.metrics.enabledSkillsCount).toBe(1);
      expect(
        Object.values(report.categoryScores).reduce((sum, p) => sum + p.maxScore, 0),
      ).toBe(100);
      expect(
        Object.values(report.categoryScores).reduce((sum, p) => sum + p.score, 0),
      ).toBe(report.overallScore);
    });

    it('calibrates 5-pillar weighted scoring so a large enterprise engine (38 DataStores, 10 Enabled Skills, 9 Private Skills, 6 BYOMCP connectors) scores a realistic C/B grade instead of 0/100', () => {
      const dsIds = Array.from({ length: 38 }, (_, i) => `ds-ent-${i + 1}`);
      const dsList: DataStore[] = dsIds.map((id, i) => ({
        name: `projects/123456/locations/global/collections/col-${i + 1}/dataStores/${id}`,
        displayName: `Enterprise Store ${i + 1}`,
        industryVertical: 'GENERIC',
        solutionTypes: ['SOLUTION_TYPE_SEARCH'],
        contentConfig: 'CONTENT_REQUIRED',
      }));

      const enabledSkills: Agent[] = Array.from({ length: 10 }, (_, i) => ({
        ...healthyOrgSkill,
        name: `projects/123456/locations/global/collections/default_collection/engines/cosmere/assistants/default_assistant/agents/skill-enabled-${i + 1}`,
        displayName: `Org Routing Skill ${i + 1}`,
      }));

      const privateSkills: Agent[] = Array.from({ length: 9 }, (_, i) => ({
        ...healthyOrgSkill,
        name: `projects/123456/locations/global/collections/default_collection/engines/cosmere/assistants/default_assistant/agents/skill-private-${i + 1}`,
        displayName: `Draft Skill ${i + 1}`,
        state: 'DISABLED',
        sharingConfig: { scope: 'PRIVATE' },
      }));

      const connectorsByCollectionId: Record<string, DataConnector> = {};
      for (let i = 1; i <= 6; i++) {
        const isOptimal = i === 1;
        connectorsByCollectionId[`col-${i}`] = {
          name: `projects/123456/locations/global/collections/col-${i}/dataConnector`,
          connectorType: 'BYO_MCP',
          state: 'ACTIVE',
          actionConfig: {
            actionParams: {
              instance_uri: `https://mcp-${i}.corp.internal/sse`,
              mcp_server_description: isOptimal
                ? 'Authoritative MCP tool server for enterprise analytics and domain queries.'
                : '',
              mcp_agent_instructions: isOptimal
                ? 'Always filter queries by project_id and date window and limit results to 25 rows.'
                : '',
            },
            dynamicTools: [
              {
                name: `query_domain_${i}`,
                displayName: `Query Domain ${i}`,
                description: `Queries domain records for service ${i}`,
                enabled: true,
              },
            ],
          },
        };
      }

      const report = evaluateAssistantData({
        engine: {
          ...baseEngine,
          dataStoreIds: dsIds,
          includeCrossDomainDocuments: true,
        },
        assistant: {
          ...baseAssistant,
          webGroundingType: 'WEB_GROUNDING_TYPE_ENTERPRISE_WEB_SEARCH',
          defaultWebGroundingToggleOff: false,
        },
        agents: [...enabledSkills, ...privateSkills],
        config: baseConfig,
        dataStores: dsList,
        connectorsByCollectionId,
      });

      // Must never collapse to 0/100 when core Engine, Guardrails, and 10 Skills are healthy
      expect(report.overallScore).toBeGreaterThanOrEqual(62);
      expect(report.overallScore).toBeLessThanOrEqual(86);
      expect(['B', 'C']).toContain(report.grade);
      expect(report.categoryScores.SKILLS_AND_ROUTING.score).toBeGreaterThanOrEqual(18);
      expect(report.categoryScores.BYOMCP_ADVISOR.score).toBeGreaterThanOrEqual(5);
      expect(
        Object.values(report.categoryScores).reduce((sum, p) => sum + p.score, 0),
      ).toBe(report.overallScore);
    });
  });

  describe('High DataStore Fan-Out Latency & Misconfiguration Detection', () => {
    it('flags CRITICAL fan-out latency risk when > 12 datastores are connected with always-on Web Grounding and zero skills', () => {
      const manyDataStoreIds = Array.from({ length: 14 }, (_, i) => `ds-store-${i + 1}`);
      const manyDataStores: DataStore[] = manyDataStoreIds.map((id, idx) => ({
        name: `projects/123456/locations/global/collections/col-${idx}/dataStores/${id}`,
        displayName: idx % 2 === 0 ? `Jira Tickets ${idx}` : `Confluence Wiki ${idx}`,
        industryVertical: 'GENERIC',
        solutionTypes: ['SOLUTION_TYPE_SEARCH'],
        contentConfig: 'CONTENT_REQUIRED',
      }));

      const latencyProneEngine: AppEngine = {
        ...baseEngine,
        dataStoreIds: manyDataStoreIds,
      };

      const misconfiguredAssistant: Assistant = {
        ...baseAssistant,
        webGroundingType: 'WEB_GROUNDING_TYPE_GOOGLE_SEARCH',
        defaultWebGroundingToggleOff: false,
        generationConfig: {
          systemInstruction: {
            additionalSystemInstruction:
              'Always search all datastores and check every source exhaustively before responding. '.repeat(60),
          },
        },
        customerPolicy: undefined,
      };

      const report = evaluateAssistantData({
        engine: latencyProneEngine,
        assistant: misconfiguredAssistant,
        agents: [],
        config: baseConfig,
        dataStores: manyDataStores,
        connectorsByCollectionId: {},
        engineIamPolicy: {
          bindings: [{ role: 'roles/discoveryengine.viewer', members: ['allAuthenticatedUsers'] }],
        },
        dataStoreAccessControlEnabled: false,
      });

      expect(report.latencyRiskLevel).toBe('CRITICAL');
      expect(report.grade).toBe('F');

      const findingIds = report.findings.map((f) => f.id);
      expect(findingIds).toContain('datastore-critical-fanout-latency');
      expect(findingIds).toContain('latency-web-grounding-always-on');
      expect(findingIds).toContain('skills-missing-for-datastores');
      expect(findingIds).toContain('config-bloated-system-instructions');
      expect(findingIds).toContain('config-fanout-anti-pattern-instruction');
      expect(findingIds).toContain('security-public-iam-principal');
      expect(findingIds).toContain('security-datastore-acl-disabled');

      // Should generate tailored recommended skill template to mitigate datastore fan-out
      expect(report.recommendedSkills.length).toBeGreaterThanOrEqual(1);
      expect(report.recommendedSkills[0].instruction).toContain('Query Optimization & Routing Rules');
    });

    it('detects private/disabled skills trap and skills missing routing descriptions', () => {
      const privateSkill: Agent = {
        name: 'projects/123/assistants/default_assistant/agents/s1',
        displayName: 'Private Draft Skill',
        description: 'Draft routing skill',
        state: 'DISABLED',
        sharingConfig: { scope: 'PRIVATE' },
        skillAgentDefinition: {
          instruction: 'Short prompt',
        },
      };

      const enabledSkillWithoutDesc: Agent = {
        name: 'projects/123/assistants/default_assistant/agents/s2',
        displayName: 'Unroutable Skill',
        description: '',
        state: 'ENABLED',
        sharingConfig: { scope: 'ALL_USERS' },
        skillAgentDefinition: {
          instruction: 'Too brief',
        },
      };

      const report = evaluateAssistantData({
        engine: baseEngine,
        assistant: baseAssistant,
        agents: [privateSkill, enabledSkillWithoutDesc],
        config: baseConfig,
        dataStores: sampleDataStores,
      });

      const findingIds = report.findings.map((f) => f.id);
      expect(findingIds).toContain('skills-private-or-disabled-trap');
      expect(findingIds).toContain('skills-missing-description');
      expect(findingIds).toContain('skills-thin-instructions');
    });

    it('detects Standard Search Tier, missing LLM Add-On, divergent instruction fields, and legacy model pins', () => {
      const legacyEngine: AppEngine = {
        ...baseEngine,
        searchEngineConfig: {
          searchTier: 'SEARCH_TIER_STANDARD',
          searchAddOns: [],
        },
        modelConfigs: {
          'gemini-3-flash-preview': 'MODEL_ENABLED',
        },
      };

      const divergentAssistant: Assistant = {
        ...baseAssistant,
        webGroundingType: 'WEB_GROUNDING_TYPE_DISABLED',
        defaultWebGroundingToggleOff: true,
        styleAndFormattingInstructions: 'Old instruction text A',
        generationConfig: {
          systemInstruction: {
            additionalSystemInstruction: 'New instruction text B',
          },
        },
      };

      const report = evaluateAssistantData({
        engine: legacyEngine,
        assistant: divergentAssistant,
        agents: [healthyOrgSkill],
        config: baseConfig,
        dataStores: sampleDataStores,
      });

      const findingIds = report.findings.map((f) => f.id);
      expect(findingIds).toContain('config-search-tier-or-llm-addon');
      expect(findingIds).toContain('config-legacy-preview-models');
      expect(findingIds).toContain('config-divergent-instruction-fields');
      expect(findingIds).toContain('config-orphaned-web-grounding-toggle');
    });
  });

  describe('BYOMCP Connector Evaluation & Guidance Generator', () => {
    it('accurately identifies BYOMCP connectors vs standard 1P connectors', () => {
      expect(isByomcpConnector({ connectorType: 'BYO_MCP', name: 'c1' })).toBe(true);
      expect(
        isByomcpConnector({
          name: 'c2',
          params: { custom_mcp: true },
        })
      ).toBe(true);
      expect(isByomcpConnector({ connectorType: 'THIRD_PARTY_JIRA', name: 'c3' })).toBe(false);
      expect(isByomcpConnector(null)).toBe(false);
    });

    it('infers archetypes from discovered MCP tools and generates tailored descriptions, instructions, and companion skill', () => {
      const sqlTools = [
        {
          name: 'list_tables',
          displayName: 'List Tables',
          description: 'Lists tables in the BigQuery dataset',
          enabled: true,
          parameterNames: ['dataset_id'],
          requiredParams: ['dataset_id'],
        },
        {
          name: 'execute_sql_readonly',
          displayName: 'Execute SQL ReadOnly',
          description: 'Runs a SELECT query against BigQuery',
          enabled: true,
          parameterNames: ['sql_query', 'max_rows'],
          requiredParams: ['sql_query'],
        },
      ];

      const inferred = inferByomcpArchetype(
        'Analytics Warehouse MCP',
        'https://mcp.analytics.internal/sse',
        sqlTools
      );
      expect(inferred.archetype).toBe('DATABASE_SQL');

      const guidance = generateByomcpGuidance(
        'Analytics Warehouse MCP',
        'bq-analytics-mcp',
        'https://mcp.analytics.internal/sse',
        sqlTools
      );

      expect(guidance.archetype).toBe('DATABASE_SQL');
      expect(guidance.recommendedServerDescription).toContain('execute_sql_readonly');
      expect(guidance.recommendedAgentInstructions).toContain('SCHEMA-FIRST VERIFICATION');
      expect(guidance.recommendedAgentInstructions).toContain('LIMIT 50');
      expect(guidance.recommendedCompanionSkill.displayName).toContain('Query and Tool Optimizer');
      expect(guidance.recommendedCompanionSkill.displayName.length).toBeLessThanOrEqual(64);
      expect(
        guidance.recommendedCompanionSkill.displayName.toLowerCase().replace(/\s+/g, '-'),
      ).toMatch(/^[a-z0-9-]+$/);
    });

    it('flags missing mcp_server_description, missing mcp_agent_instructions, excessive tools (>15), and unmapped citations on BYOMCP connectors', () => {
      const noisyTools = Array.from({ length: 18 }, (_, idx) => ({
        name: `jira_tool_${idx + 1}`,
        displayName: `Jira Tool ${idx + 1}`,
        description: idx < 3 ? '' : `Manages Jira issue workflow step ${idx + 1}`,
        enabled: true,
        inputSchema: {
          type: 'object',
          properties: { issue_key: { type: 'string' }, jql: { type: 'string' } },
          required: ['issue_key'],
        },
      }));

      const rawConnector: DataConnector = {
        name: 'projects/123456/locations/global/collections/jira-mcp-col/dataConnector',
        connectorType: 'BYO_MCP',
        state: 'ACTIVE',
        actionConfig: {
          actionParams: {
            instance_uri: 'https://jira-mcp.corp.internal/sse',
            mcp_server_description: '',
            mcp_agent_instructions: '',
          },
          dynamicTools: noisyTools,
        },
      };

      const evaluation = evaluateByomcpConnector(
        'jira-mcp-col',
        rawConnector,
        true,
        'Jira Engineering MCP'
      );

      expect(evaluation.useCaseArchetype).toBe('ISSUE_TRACKER_ITSM');
      expect(evaluation.enabledToolsCount).toBe(18);
      expect(evaluation.citationRulesCount).toBe(0);
      expect(evaluation.issues.length).toBeGreaterThanOrEqual(4);
      expect(evaluation.issues.some((i) => i.includes('Missing mcp_server_description'))).toBe(true);
      expect(evaluation.issues.some((i) => i.includes('Missing mcp_agent_instructions'))).toBe(true);
      expect(evaluation.issues.some((i) => i.includes('18 MCP tools are simultaneously enabled'))).toBe(true);
    });

    it('applyByomcpRecommendations strips OAuth credential keys from action_params before PATCH to prevent 400 credential-rotation errors', async () => {
      vi.mocked(api.updateDataConnector).mockResolvedValueOnce({ name: 'updated' } as never);

      const rawConnectorWithOAuthParams: DataConnector = {
        name: 'projects/123456/locations/global/collections/crm-mcp/dataConnector',
        connectorType: 'BYO_MCP',
        actionConfig: {
          actionParams: {
            instance_uri: 'https://crm-mcp.internal/sse',
            auth_type: 'OAUTH',
            auth_uri: 'https://idp.internal/authorize',
            token_uri: 'https://idp.internal/token',
            scopes: 'openid profile',
            client_id: 'my-client-id',
            citation_mappings: '{"default":{"uri":"/url","title":"/title"}}' as unknown as never,
            custom_header_flag: 'enabled',
          },
        },
      };

      const evalItem = evaluateByomcpConnector(
        'crm-mcp',
        rawConnectorWithOAuthParams,
        true,
        'CRM MCP'
      );

      await applyByomcpRecommendations(
        evalItem,
        'Authoritative CRM MCP server description for routing.',
        'Always filter CRM account queries by account_id or email and limit results to 25 rows.',
        baseConfig
      );

      expect(api.updateDataConnector).toHaveBeenCalledTimes(1);
      const [connectorName, payload, updateMask, passedConfig] = vi.mocked(api.updateDataConnector).mock.calls[0];
      expect(connectorName).toBe('projects/123456/locations/global/collections/crm-mcp/dataConnector');
      expect(updateMask).toEqual(['action_config.action_params']);
      expect(passedConfig.projectId).toBe('123456');
      expect(passedConfig.collectionId).toBe('crm-mcp');

      const sentParams = (payload as { actionConfig: { actionParams: Record<string, unknown> } }).actionConfig
        .actionParams;
      expect(sentParams.mcp_server_description).toBe('Authoritative CRM MCP server description for routing.');
      expect(sentParams.mcp_agent_instructions).toContain('Always filter CRM account queries');
      // Must preserve citation_mappings and custom keys
      expect(sentParams.citation_mappings).toBe('{"default":{"uri":"/url","title":"/title"}}');
      expect(sentParams.custom_header_flag).toBe('enabled');
      // Must strip OAuth keys so Discovery Engine does not reject the PATCH with 400 INVALID_ARGUMENT
      expect(sentParams).not.toHaveProperty('instance_uri');
      expect(sentParams).not.toHaveProperty('auth_uri');
      expect(sentParams).not.toHaveProperty('token_uri');
      expect(sentParams).not.toHaveProperty('scopes');
      expect(sentParams).not.toHaveProperty('client_id');
    });

    it('rejects with explicit error when applyByomcpRecommendations is called with empty description or instructions (negative test)', async () => {
      const dummyConnector: DataConnector = {
        name: 'projects/123/locations/global/collections/c1/dataConnector',
        connectorType: 'BYO_MCP',
      };
      const evalItem = evaluateByomcpConnector('c1', dummyConnector, true);

      await expect(
        applyByomcpRecommendations(evalItem, '   ', 'Valid instructions', baseConfig)
      ).rejects.toThrow(/Both MCP Server Description and Agent Instructions must be non-empty/i);

      expect(api.updateDataConnector).not.toHaveBeenCalled();
    });

    it('propagates API rejection when updateDataConnector fails (negative test)', async () => {
      vi.mocked(api.updateDataConnector).mockRejectedValueOnce(
        new Error('403 PERMISSION_DENIED: caller lacks discoveryengine.dataConnectors.update')
      );

      const dummyConnector: DataConnector = {
        name: 'projects/123/locations/global/collections/c1/dataConnector',
        connectorType: 'BYO_MCP',
      };
      const evalItem = evaluateByomcpConnector('c1', dummyConnector, true);

      await expect(
        applyByomcpRecommendations(evalItem, 'Valid description', 'Valid instructions', baseConfig)
      ).rejects.toThrow(/403 PERMISSION_DENIED/);
    });
  });

  describe('Live Orchestrator & Markdown Export', () => {
    it('records probeWarnings when live secondary endpoints return errors instead of swallowing them', async () => {
      vi.mocked(api.getEngine).mockRejectedValueOnce(new Error('503 UNAVAILABLE: Engine refresh timed out'));
      vi.mocked(api.listResources).mockRejectedValueOnce(new Error('403 Forbidden listing DataStores'));
      vi.mocked(api.listCollections).mockResolvedValueOnce({ collections: [] });
      vi.mocked(api.getEngineIamPolicy).mockResolvedValueOnce(null as never);

      const report = await runLiveAssistantEvaluation(
        baseEngine,
        baseAssistant,
        [healthyOrgSkill],
        baseConfig
      );

      expect(report.probeWarnings.length).toBeGreaterThanOrEqual(2);
      expect(report.probeWarnings.join(' ')).toContain('503 UNAVAILABLE');
      expect(report.probeWarnings.join(' ')).toContain('403 Forbidden listing DataStores');

      const md = generateAssistantEvaluationMarkdown(report);
      expect(md).toContain('# Gemini Enterprise Assistant Evaluation Report');
      expect(md).toContain('Overall Health Score');
      expect(md).not.toContain('### [PASS]');
    });
  });

  describe('Model Armor Exclusion Rules & Streaming Sanitization Evaluation (#exclusion-rules-streaming)', () => {
    it('flags CRITICAL security-model-armor-exclusion-streaming-conflict when an attached template uses MATCHING_SCOPE_FULL_MATCH or unconstrained wildcard regex (negative/adversarial test)', () => {
      const hostileTemplates = [
        {
          name: 'projects/123456/locations/global/templates/prompt-guard',
          templateMetadata: { logSanitizeOperations: false },
          filterConfig: {
            piAndJailbreakFilterSettings: { filterEnforcement: 'ENABLED' },
            raiSettings: { raiFilters: [] },
            filterRuleSettings: {
              ruleSets: [
                {
                  filterTypes: ['PROMPT_INJECTION_AND_JAILBREAK'],
                  rules: [
                    {
                      exclusionRule: {
                        dictionary: {
                          wordList: { words: ['ignore instructions 🚀'] },
                        },
                        matchingScope: 'MATCHING_SCOPE_FULL_MATCH',
                      },
                    },
                  ],
                },
                {
                  filterTypes: ['RESPONSIBLE_AI', 'SDP'],
                  rules: [
                    {
                      exclusionRule: {
                        regex: { pattern: '(?i).*' },
                        matchingScope: 'MATCHING_SCOPE_PARTIAL_MATCH',
                      },
                    },
                  ],
                },
              ],
            },
          },
        },
      ];

      const report = evaluateAssistantData({
        engine: baseEngine,
        assistant: baseAssistant,
        agents: [healthyOrgSkill],
        config: baseConfig,
        dataStores: sampleDataStores,
        modelArmorTemplates: hostileTemplates,
      });

      const conflictFinding = report.findings.find(
        (f) => f.id === 'security-model-armor-exclusion-streaming-conflict',
      );
      expect(conflictFinding).toBeDefined();
      expect(conflictFinding?.severity).toBe('CRITICAL');
      expect(conflictFinding?.summary).toContain('MATCHING_SCOPE_FULL_MATCH');
      expect(conflictFinding?.summary).toContain('400 INVALID_ARGUMENT');
      expect(conflictFinding?.summary).toContain('Unconstrained wildcard regex "(?i).*"');
      expect(conflictFinding?.summary).toContain('unsupported filterType "SDP"');

      const warningFinding = report.findings.find(
        (f) => f.id === 'security-model-armor-exclusion-warnings',
      );
      expect(warningFinding).toBeDefined();
      expect(warningFinding?.severity).toBe('WARNING');
      expect(warningFinding?.summary).toContain('Orphaned exclusion ruleSet: targets RESPONSIBLE_AI');
      expect(warningFinding?.summary).toContain('multi-byte UTF-8 characters');
      expect(warningFinding?.summary).toContain('logSanitizeOperations is not enabled');
    });

    it('emits PASS security-model-armor-exclusion-active when attached templates use scoped PARTIAL_MATCH rules with logSanitizeOperations enabled', () => {
      const healthyTemplates = [
        {
          name: 'projects/123456/locations/global/templates/prompt-guard',
          templateMetadata: { logSanitizeOperations: true },
          filterConfig: {
            piAndJailbreakFilterSettings: { filterEnforcement: 'ENABLED' },
            raiSettings: {
              raiFilters: [{ filterType: 'DANGEROUS_CONTENT', confidenceLevel: 'HIGH' }],
            },
            filterRuleSettings: {
              ruleSets: [
                {
                  filterTypes: ['PROMPT_INJECTION_AND_JAILBREAK'],
                  rules: [
                    {
                      exclusionRule: {
                        dictionary: {
                          wordList: { words: ['ignore case when sorting this list'] },
                        },
                        matchingScope: 'MATCHING_SCOPE_PARTIAL_MATCH',
                      },
                    },
                  ],
                },
              ],
            },
          },
        },
      ];

      const report = evaluateAssistantData({
        engine: baseEngine,
        assistant: baseAssistant,
        agents: [healthyOrgSkill],
        config: baseConfig,
        dataStores: sampleDataStores,
        modelArmorTemplates: healthyTemplates,
      });

      const passFinding = report.findings.find((f) => f.id === 'security-model-armor-exclusion-active');
      expect(passFinding).toBeDefined();
      expect(passFinding?.severity).toBe('PASS');
      expect(passFinding?.summary).toContain('STREAMING_MODE_REALTIME');
    });

    it('sanitizes and validates Skill displayName so normalized skill names never contain & or special characters or exceed 64 chars (negative test)', async () => {
      const { sanitizeSkillDisplayName, validateSkillDisplayName } = await import(
        '../utils/skillExportUtils'
      );

      // Negative test: raw name with '&' must be rejected by validateSkillDisplayName
      expect(validateSkillDisplayName('Enterprise DataStore Query Router & Optimizer')).toContain(
        'only contain letters, numbers, spaces, and hyphens',
      );
      // Negative test: > 64 chars must be rejected by validateSkillDisplayName
      expect(validateSkillDisplayName('A'.repeat(65))).toContain('at most 64 characters');

      // Sanitized output converts '&' -> 'and', strips special chars, and normalizes to ^[a-z0-9-]+$
      const sanitized = sanitizeSkillDisplayName(
        'Enterprise DataStore: Query Router & Optimizer (v2_prod)! @#$%^&* Extra Long Suffix That Exceeds Limit',
      );
      expect(sanitized.length).toBeLessThanOrEqual(64);
      expect(validateSkillDisplayName(sanitized)).toBeNull();
      const normalized = sanitized.toLowerCase().replace(/\s+/g, '-');
      expect(normalized).toMatch(/^[a-z0-9-]+$/);
      expect(normalized).toContain('enterprise-datastore-query-router-and-optimizer');
    });

    it('concatenates additionalSystemInstruction and styleAndFormattingInstructions, ignores bapConfig.enabledActions name-only stubs for missing tool descriptions, flags empty skill instructions, and deduplicates already-deployed skills', () => {
      const bapConnector: DataConnector = {
        name: 'projects/123456/locations/global/collections/default_collection/dataConnector',
        connectorType: 'BYO_MCP',
        state: 'ACTIVE',
        bapConfig: {
          enabledActions: ['run_sql_query', 'describe_table'],
        },
        actionConfig: {
          actionParams: {
            instance_uri: 'https://bq-mcp.corp.internal/sse',
            mcp_server_description:
              'Authoritative BigQuery MCP connector for warehouse SQL analytics.',
            mcp_agent_instructions:
              'Always qualify table names with dataset and include a LIMIT clause on SELECT queries.',
          },
        },
      };

      const bapEval = evaluateByomcpConnector('default_collection', bapConnector, true);
      expect(bapEval.enabledToolsCount).toBe(2);
      expect(bapEval.toolsMissingDescription).toEqual([]);
      expect(bapEval.status).toBe('OPTIMAL');

      // Unattached BYOMCP connector in another collection should not drag down engine score
      const unattachedConnector: DataConnector = {
        name: 'projects/123456/locations/global/collections/orphan-col/dataConnector',
        connectorType: 'BYO_MCP',
        state: 'ACTIVE',
        actionConfig: {
          actionParams: {
            instance_uri: 'https://orphan-mcp.corp.internal/sse',
          },
        },
      };

      const emptyInstSkill: Agent = {
        name: 'projects/123456/locations/global/collections/default_collection/engines/enterprise-app/assistants/default_assistant/agents/enterprise-datastore-query-optimizer',
        displayName: 'Enterprise DataStore Query Router and Optimizer',
        description: 'Routes queries across connected datastores with concise keyword decomposition.',
        state: 'ENABLED',
        sharingConfig: { scope: 'ALL_USERS' },
        skillAgentDefinition: {
          instruction: '',
        },
      };

      const report = evaluateAssistantData({
        engine: baseEngine,
        assistant: {
          ...baseAssistant,
          generationConfig: {
            systemInstruction: {
              additionalSystemInstruction: 'You are an enterprise assistant.',
            },
          },
          styleAndFormattingInstructions:
            'Always search all datastores on every query and cite every source.',
        },
        agents: [emptyInstSkill],
        config: baseConfig,
        dataStores: sampleDataStores,
        connectorsByCollectionId: {
          default_collection: bapConnector,
          'orphan-col': unattachedConnector,
        },
      });

      // Concatenated system + style instructions detect fan-out anti-pattern in styleAndFormattingInstructions
      expect(report.findings.some((f) => f.id === 'config-fanout-anti-pattern-instruction')).toBe(
        true,
      );
      expect(
        report.findings.some((f) => f.id === 'config-divergent-instruction-fields'),
      ).toBe(true);
      // Empty instruction string ("") on enabled skill must trigger skills-thin-instructions
      expect(report.findings.some((f) => f.id === 'skills-thin-instructions')).toBe(true);
      // Already-deployed enterprise-datastore-query-optimizer must be deduplicated from recommendedSkills
      expect(
        report.recommendedSkills.some(
          (sk) => sk.skillIdSuggestion === 'enterprise-datastore-query-optimizer',
        ),
      ).toBe(false);
      // Unattached connector must not penalize the engine's BYOMCP_ADVISOR pillar score, and OPTIMAL connector without citations gets full 15/15
      expect(report.categoryScores.BYOMCP_ADVISOR.score).toBe(15);
      expect(report.findings.some((f) => f.id === 'byomcp-citations-default_collection')).toBe(
        false,
      );

      // When > 10 datastores are connected AND organizational routing skills are deployed, datastore-critical-fanout-latency downgrades to INFO
      const twelveStoreIds = Array.from({ length: 12 }, (_, i) => `ds-${i + 1}`);
      const twelveStores = twelveStoreIds.map((id) => ({
        name: `projects/123456/locations/global/collections/default_collection/dataStores/${id}`,
        displayName: `Store ${id}`,
      }));
      const mitigatedFanoutReport = evaluateAssistantData({
        engine: {
          ...baseEngine,
          dataStoreIds: twelveStoreIds,
          features: { 'model-gemini-3.1-pro-preview': 'FEATURE_STATE_ON' },
        },
        assistant: baseAssistant,
        agents: [healthyOrgSkill, emptyInstSkill],
        config: baseConfig,
        dataStores: twelveStores,
      });
      const fanoutFinding = mitigatedFanoutReport.findings.find(
        (f) => f.id === 'datastore-critical-fanout-latency',
      );
      expect(fanoutFinding?.severity).toBe('INFO');
      expect(fanoutFinding?.recommendedSkillId).toBeUndefined();
      expect(mitigatedFanoutReport.latencyRiskLevel).toBe('MODERATE');
      expect(
        mitigatedFanoutReport.findings.some((f) => f.id === 'config-legacy-preview-models'),
      ).toBe(false);
    });

    it('flags grouped/dot wildcard exclusion regexes, unresolvable or filterless Model Armor templates, failed sub-agents, and normalizes spaced hyphens (Tier 2 negative tests)', async () => {
      const { sanitizeSkillDisplayName, validateSkillDisplayName } = await import(
        '../utils/skillExportUtils'
      );

      // Spaced hyphen "HR - Benefits" must collapse to "HR-Benefits" and pass validation without triple hyphens
      const spacedHyphenSanitized = sanitizeSkillDisplayName('HR - Benefits - Portal');
      expect(spacedHyphenSanitized).toBe('HR-Benefits-Portal');
      expect(validateSkillDisplayName('HR - Benefits')).toBeNull();

      const failedSubAgent: Agent = {
        name: 'projects/123456/locations/global/collections/default_collection/engines/enterprise-app/assistants/default_assistant/agents/sub-agent-broken',
        displayName: 'Broken Sub-Agent',
        state: 'DEPLOYMENT_FAILED',
      };

      const privateEnabledSkill: Agent = {
        ...healthyOrgSkill,
        name: 'projects/123456/locations/global/collections/default_collection/engines/enterprise-app/assistants/default_assistant/agents/private-skill',
        state: 'ENABLED',
        sharingConfig: { scope: 'PRIVATE' },
      };

      // Prompt template exists but has (.*) wildcard and response-guard is missing from modelArmorTemplates; plus an empty filterless template
      const templatesWithGroupedWildcardAndFilterless = [
        {
          name: 'projects/123456/locations/global/templates/prompt-guard',
          templateMetadata: { logSanitizeOperations: true },
          filterConfig: {
            piAndJailbreakFilterSettings: { filterEnforcement: 'ENABLED' },
            filterRuleSettings: {
              ruleSets: [
                {
                  filterTypes: ['PROMPT_INJECTION_AND_JAILBREAK'],
                  rules: [
                    {
                      exclusionRule: {
                        regex: { pattern: '(.*)' },
                        matchingScope: 'MATCHING_SCOPE_PARTIAL_MATCH',
                      },
                    },
                  ],
                },
              ],
            },
          },
        },
        {
          name: 'projects/123456/locations/global/templates/empty-response-guard',
          filterConfig: {
            piAndJailbreakFilterSettings: { filterEnforcement: 'DISABLED' },
            raiSettings: { raiFilters: [{ filterType: 'HATE_SPEECH', confidenceLevel: 'OFF' }] },
          },
        },
      ];

      const report = evaluateAssistantData({
        engine: baseEngine,
        assistant: {
          ...baseAssistant,
          customerPolicy: {
            modelArmorConfig: {
              userPromptTemplate: 'projects/123456/locations/global/templates/prompt-guard',
              responseTemplate: 'projects/123456/locations/global/templates/empty-response-guard',
              failureMode: 'FAIL_CLOSED',
            },
          },
        },
        agents: [failedSubAgent, privateEnabledSkill],
        config: baseConfig,
        dataStores: sampleDataStores,
        modelArmorTemplates: templatesWithGroupedWildcardAndFilterless,
      });

      // (.*) must be caught as an unconstrained wildcard
      const streamingConflict = report.findings.find(
        (f) => f.id === 'security-model-armor-exclusion-streaming-conflict',
      );
      expect(streamingConflict).toBeDefined();
      expect(streamingConflict?.summary).toContain('Unconstrained wildcard regex "(.*)"');

      // Filterless template must trigger security-model-armor-no-active-filters
      expect(
        report.findings.some((f) => f.id === 'security-model-armor-no-active-filters'),
      ).toBe(true);

      // Failed sub-agent must trigger agents-failed-deployment-state
      expect(report.findings.some((f) => f.id === 'agents-failed-deployment-state')).toBe(true);

      // PRIVATE skill must be counted in privateOrDisabledSkills, not organizational enabledSkills
      expect(report.metrics.enabledSkillsCount).toBe(0);
      expect(report.metrics.privateOrDisabledSkillsCount).toBe(1);
    });
  });
});


