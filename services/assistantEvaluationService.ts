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

import {
  Agent,
  AppEngine,
  Assistant,
  Collection,
  Config,
  DataConnector,
  DataStore,
  IamPolicy,
} from '../types';
import * as api from './apiService';
import {
  classifySkillAgent,
  isSkillAgentResource,
  sanitizeSkillDisplayName,
} from '../utils/skillExportUtils';
import { parseCitationMappingsFromApi } from '../components/connectors/byomcp/citationPointerUtils';
import { sanitizeByomcpActionParamsForPatch } from '../hooks/useBYOMCPConfig';
import { analyzeTemplateExclusionRules } from '../components/model-armor/types';
import { ModelArmorTemplate } from './api/modelArmor';
import { toErrorMessage } from '../utils/errors';

export type EvaluationSeverity = 'CRITICAL' | 'WARNING' | 'INFO' | 'PASS';

export type EvaluationCategory =
  | 'LATENCY_AND_DATASTORES'
  | 'SKILLS_AND_ROUTING'
  | 'BYOMCP_ADVISOR'
  | 'ASSISTANT_AND_ENGINE_CONFIG'
  | 'SECURITY_AND_GOVERNANCE';

export type EvaluationTargetTab =
  | 'overview'
  | 'agents'
  | 'skills'
  | 'datastores';

export interface RecommendedSkillTemplate {
  id: string;
  skillIdSuggestion: string;
  displayName: string;
  description: string;
  instruction: string;
  rationale: string;
  targetSources: string[];
}

export type ByomcpUseCaseArchetype =
  | 'DATABASE_SQL'
  | 'ISSUE_TRACKER_ITSM'
  | 'CRM_ERP_FINANCE'
  | 'DEVOPS_INFRA'
  | 'KNOWLEDGE_SEARCH'
  | 'GENERAL_MCP';

export interface ByomcpToolSummary {
  name: string;
  displayName: string;
  description: string;
  enabled: boolean;
  parameterNames: string[];
  requiredParams: string[];
}

export interface ByomcpConnectorEvaluation {
  collectionId: string;
  connectorName: string;
  displayName: string;
  isAttachedToEngine: boolean;
  instanceUri: string;
  state: string;
  useCaseArchetype: ByomcpUseCaseArchetype;
  useCaseLabel: string;
  currentServerDescription: string;
  currentAgentInstructions: string;
  recommendedServerDescription: string;
  recommendedAgentInstructions: string;
  tools: ByomcpToolSummary[];
  enabledToolsCount: number;
  totalToolsCount: number;
  toolsMissingDescription: string[];
  citationRulesCount: number;
  issues: string[];
  status: 'NEEDS_ATTENTION' | 'OPTIMAL';
  rawConnector: DataConnector;
  recommendedCompanionSkill: RecommendedSkillTemplate;
}

export interface AssistantEvaluationFinding {
  id: string;
  category: EvaluationCategory;
  severity: EvaluationSeverity;
  title: string;
  summary: string;
  currentValue: string;
  recommendedValue: string;
  impact: string;
  remediation: string;
  targetTab?: EvaluationTargetTab;
  recommendedSkillId?: string;
  byomcpCollectionId?: string;
}

export interface AssistantEvaluationMetrics {
  connectedDataStoresCount: number;
  totalProjectDataStoresCount: number;
  connectedConnectorsCount: number;
  byomcpConnectorsCount: number;
  enabledSkillsCount: number;
  privateOrDisabledSkillsCount: number;
  skillsMissingDescriptionCount: number;
  conversationalAgentsCount: number;
}

export interface EvaluationCategoryScore {
  category: EvaluationCategory;
  label: string;
  score: number;
  maxScore: number;
  criticalCount: number;
  warningCount: number;
  passCount: number;
}

export interface AssistantEvaluationReport {
  evaluatedAt: string;
  projectId: string;
  location: string;
  engineId: string;
  engineDisplayName: string;
  assistantId: string;
  assistantDisplayName: string;
  overallScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  latencyRiskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  categoryScores: Record<EvaluationCategory, EvaluationCategoryScore>;
  metrics: AssistantEvaluationMetrics;
  findings: AssistantEvaluationFinding[];
  byomcpEvaluations: ByomcpConnectorEvaluation[];
  recommendedSkills: RecommendedSkillTemplate[];
  probeWarnings: string[];
}

export interface EvaluateAssistantInput {
  engine: AppEngine;
  assistant: Assistant;
  agents: Agent[];
  config: Config;
  dataStores?: DataStore[];
  collections?: Collection[];
  connectorsByCollectionId?: Record<string, DataConnector>;
  engineIamPolicy?: IamPolicy | null;
  dataStoreAccessControlEnabled?: boolean | null;
  modelArmorTemplates?: ModelArmorTemplate[];
  probeWarnings?: string[];
}

const KNOWN_LEGACY_MODEL_IDS = new Set([
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  'gemini-1.0-pro',
  'gemini-pro',
  'gemini-2.5-flash-image',
]);

const FANOUT_ANTI_PATTERN_REGEX =
  /\b(search\s+all\s+(?:data\s*stores|sources|tools|connectors)|always\s+query\s+(?:all|every)|check\s+every\s+(?:data\s*store|source|connector))\b/i;

function extractSchemaParams(inputSchema?: Record<string, unknown>): {
  parameterNames: string[];
  requiredParams: string[];
} {
  if (!inputSchema || typeof inputSchema !== 'object') {
    return { parameterNames: [], requiredParams: [] };
  }
  const props = inputSchema.properties;
  const parameterNames =
    props && typeof props === 'object' ? Object.keys(props as Record<string, unknown>) : [];
  const req = inputSchema.required;
  const requiredParams = Array.isArray(req)
    ? req.filter((r): r is string => typeof r === 'string')
    : [];
  return { parameterNames, requiredParams };
}

export function isByomcpConnector(
  connector?: DataConnector | null,
  collection?: Collection | null,
): boolean {
  if (!connector && !collection) return false;
  const dataSource = String(connector?.dataSource || '').toLowerCase();
  const connectorType = String(connector?.connectorType || '').toUpperCase();
  if (
    dataSource === 'custom_mcp' ||
    dataSource.includes('mcp') ||
    connectorType === 'BYO_MCP' ||
    connector?.params?.custom_mcp === true
  ) {
    return true;
  }
  const actionParams = connector?.actionConfig?.actionParams || {};
  if (
    actionParams.mcp_server_source === 'BYO_MCP' ||
    typeof actionParams.mcp_server_description === 'string' ||
    typeof actionParams.mcp_agent_instructions === 'string' ||
    Boolean(actionParams.registry_mcp_server_name)
  ) {
    return true;
  }
  if (
    (Array.isArray(connector?.dynamicTools) && connector.dynamicTools.length > 0) ||
    (Array.isArray(connector?.actionConfig?.dynamicTools) &&
      connector.actionConfig.dynamicTools.length > 0)
  ) {
    return true;
  }
  const combinedName = `${collection?.name || ''} ${collection?.displayName || ''} ${connector?.name || ''}`.toLowerCase();
  return /\b(mcp|byomcp|custom_mcp|onemcp)\b/.test(combinedName);
}

export function inferByomcpArchetype(
  displayName: string,
  instanceUri: string,
  tools: ByomcpToolSummary[],
): { archetype: ByomcpUseCaseArchetype; label: string } {
  const signalText = [
    displayName,
    instanceUri,
    ...tools.map((t) => `${t.name} ${t.displayName} ${t.description} ${t.parameterNames.join(' ')}`),
  ]
    .join(' ')
    .toLowerCase();

  if (
    /\b(sql|database|bigquery|postgres|oracle|spanner|alloydb|snowflake|databricks|table|schema|execute_query|run_query|select)\b/.test(
      signalText,
    )
  ) {
    return {
      archetype: 'DATABASE_SQL',
      label: 'Database, SQL & Structured Analytics',
    };
  }

  if (
    /\b(jira|servicenow|incident|ticket|bug|issue|epic|sprint|linear|pagerduty|zendesk|backlog|assignee)\b/.test(
      signalText,
    )
  ) {
    return {
      archetype: 'ISSUE_TRACKER_ITSM',
      label: 'Issue Tracking, Agile & ITSM Operations',
    };
  }

  if (
    /\b(salesforce|crm|sap|erp|workday|opportunity|account|lead|invoice|order|pipeline|customer|revenue|quote)\b/.test(
      signalText,
    )
  ) {
    return {
      archetype: 'CRM_ERP_FINANCE',
      label: 'CRM, ERP & Enterprise Business Records',
    };
  }

  if (
    /\b(github|gitlab|commit|pull_request|merge_request|deploy|kubernetes|k8s|gce|cloud_run|logs|trace|monitoring|ci_cd|pipeline)\b/.test(
      signalText,
    )
  ) {
    return {
      archetype: 'DEVOPS_INFRA',
      label: 'DevOps, Code Repository & Cloud Infrastructure',
    };
  }

  if (
    /\b(search|document|wiki|confluence|sharepoint|drive|notion|slack|article|knowledge|policy|manual)\b/.test(
      signalText,
    )
  ) {
    return {
      archetype: 'KNOWLEDGE_SEARCH',
      label: 'Enterprise Knowledge Base & Document Retrieval',
    };
  }

  return {
    archetype: 'GENERAL_MCP',
    label: 'Custom Enterprise MCP Tool Server',
  };
}

export function generateByomcpGuidance(
  displayName: string,
  collectionId: string,
  instanceUri: string,
  tools: ByomcpToolSummary[],
): {
  archetype: ByomcpUseCaseArchetype;
  useCaseLabel: string;
  recommendedServerDescription: string;
  recommendedAgentInstructions: string;
  recommendedCompanionSkill: RecommendedSkillTemplate;
} {
  const { archetype, label: useCaseLabel } = inferByomcpArchetype(
    displayName,
    instanceUri,
    tools,
  );
  const enabledTools = tools.filter((t) => t.enabled);
  const activeTools = enabledTools.length > 0 ? enabledTools : tools;
  const cleanName = String(displayName || collectionId || 'Custom MCP');

  const toolNamesPreview =
    activeTools.length > 0
      ? activeTools
          .slice(0, 5)
          .map((t) => t.name)
          .join(', ')
      : 'configured MCP tools';

  const toolBullets =
    activeTools.length > 0
      ? activeTools
          .map((t) => {
            const paramsInfo =
              t.parameterNames.length > 0
                ? ` (parameters: ${t.parameterNames.join(', ')}${
                    t.requiredParams.length > 0
                      ? `; required: ${t.requiredParams.join(', ')}`
                      : ''
                  })`
                : '';
            const descInfo = t.description
              ? `: ${t.description}`
              : ' — execute targeted domain lookups with narrow filter parameters.';
            return `- \`${t.name}\`${paramsInfo}${descInfo}`;
          })
          .join('\n')
      : `- Invoke only the specific tool matching the user's intent and provide required filter arguments.`;

  let recommendedServerDescription = '';
  let archetypeRules = '';

  switch (archetype) {
    case 'DATABASE_SQL':
      recommendedServerDescription = `${cleanName} (${useCaseLabel}): Authoritative MCP server for inspecting schemas, table metadata, and executing scoped analytical/SQL queries via ${toolNamesPreview}. Route structured data, metrics, and record lookup questions here.`;
      archetypeRules = `1. SCHEMA-FIRST VERIFICATION: Always inspect table/dataset schemas or metadata before constructing a query. Never guess column names.
2. SCOPED QUERIES & LIMITS: Always apply explicit WHERE filters (date ranges, IDs, status) and enforce a maximum row limit (e.g., LIMIT 50) to prevent high-latency full-table scans.
3. READ-ONLY SAFETY: Never execute destructive DDL/DML statements (DROP, DELETE, TRUNCATE, UPDATE) unless the user explicitly requests a mutation and confirms the target records.
4. OUTPUT FORMATTING: Render tabular results in clean Markdown tables with aligned columns, followed by a brief analytical summary of key trends or anomalies.`;
      break;

    case 'ISSUE_TRACKER_ITSM':
      recommendedServerDescription = `${cleanName} (${useCaseLabel}): Authoritative MCP server for querying and managing tickets, incidents, bugs, and project status via ${toolNamesPreview}. Route issue tracking, sprint, and operational incident queries here.`;
      archetypeRules = `1. TARGETED FILTERING: Query by specific issue keys, project codes, assignee, or status filters rather than fetching unbounded ticket lists.
2. STRUCTURED PRESENTATION: Display Issue/Incident Key, Summary, Status, Priority/Severity, and Assignee clearly at the top of each result.
3. BLOCKER & SLA CALLOUTS: Highlight P0/P1 incidents, blocked items, or overdue tickets with explicit warning callouts.
4. CITATIONS & LINKS: Always include direct clickable links to the source ticket or incident record.`;
      break;

    case 'CRM_ERP_FINANCE':
      recommendedServerDescription = `${cleanName} (${useCaseLabel}): Authoritative MCP server for retrieving customer accounts, opportunities, orders, and financial records via ${toolNamesPreview}. Route CRM, revenue, and account lookup requests here.`;
      archetypeRules = `1. EXACT ENTITY RESOLUTION: Resolve specific account names, customer IDs, or opportunity identifiers before pulling detailed transaction records.
2. FINANCIAL & RECORD PRECISION: Preserve exact currency codes, timestamps, status stages, and record IDs without rounding or fabricating missing fields.
3. MUTATION GUARDRAILS: Confirm all field values with the user before invoking any create/update tool on CRM or ERP records.
4. EXECUTIVE SUMMARY: Start with an account/deal snapshot followed by structured details and source record links.`;
      break;

    case 'DEVOPS_INFRA':
      recommendedServerDescription = `${cleanName} (${useCaseLabel}): Authoritative MCP server for inspecting repositories, deployments, infrastructure state, and service logs via ${toolNamesPreview}. Route engineering, CI/CD, and cloud operations queries here.`;
      archetypeRules = `1. NARROW SCOPE PARAMETERS: Always pass explicit project, region, service name, or time-window parameters to avoid slow log/resource scans.
2. DIAGNOSTIC CLARITY: Separate healthy resources from failing deployments or error logs, and quote exact status codes or timestamps.
3. INFRASTRUCTURE SAFETY: Treat state-changing or teardown tools as privileged operations requiring explicit user confirmation.`;
      break;

    case 'KNOWLEDGE_SEARCH':
      recommendedServerDescription = `${cleanName} (${useCaseLabel}): Authoritative MCP server for searching internal documentation, knowledge base articles, and policies via ${toolNamesPreview}. Route domain documentation and policy questions here.`;
      archetypeRules = `1. SPECIFIC KEYWORD & FILTER FORMULATION: Distill the user's question into concise domain keywords and pass applicable category/date filters.
2. GROUNDED SYNTHESIS: Provide a concise executive answer first, then group supporting evidence by source document.
3. MANDATORY CITATIONS: For every retrieved item, cite [Document Title](URI), author/owner, and last modified date when available.`;
      break;

    default:
      recommendedServerDescription = `${cleanName} (${useCaseLabel}): Specialized MCP integration providing ${
        activeTools.length || 'custom'
      } domain tools (${toolNamesPreview}). Route requests requiring live data lookups or actions in ${cleanName} to this server.`;
      archetypeRules = `1. PRECISE TOOL SELECTION: Select the most specific MCP tool for the user's request and populate all required filter parameters.
2. AVOID REDUNDANT CALLS: Do not invoke multiple overlapping tools in parallel if a single targeted lookup answers the question.
3. STRUCTURED CITATIONS: Clearly attribute retrieved facts to the invoked tool and include clickable source links when returned.`;
      break;
  }

  const recommendedAgentInstructions = `ROLE & ROUTING GUIDELINES FOR ${cleanName.toUpperCase()}:
Use this MCP server when the user asks about ${useCaseLabel.toLowerCase()} handled by ${cleanName}.

AVAILABLE TOOLS & INVOCATION contracts:
${toolBullets}

OPERATIONAL & FORMATTING BEST PRACTICES:
${archetypeRules}`;

  const safeSlug = String(collectionId || 'custom')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  const safePrefix = sanitizeSkillDisplayName(cleanName).slice(0, 36).trim() || 'MCP';
  const companionDisplayName = sanitizeSkillDisplayName(
    `${safePrefix} Query and Tool Optimizer`,
  );

  const recommendedCompanionSkill: RecommendedSkillTemplate = {
    id: `skill-byomcp-${collectionId}`,
    skillIdSuggestion: `mcp-router-${safeSlug || 'custom'}`,
    displayName: companionDisplayName,
    description: `Optimizes query routing, parameter construction, and result formatting when invoking the ${cleanName} (${collectionId}) BYOMCP server tools (${toolNamesPreview}).`,
    instruction: `# ${cleanName} — MCP Query & Tool Routing Skill\n\n## When to Use This Skill\nActivate this skill whenever a user request involves **${useCaseLabel}** or requires live data/actions from **${cleanName}** (\`${collectionId}\`).\n\n## Tool Selection & Parameter Construction\n${toolBullets}\n\n## Latency & Quality Optimization Rules\n${archetypeRules}\n- Do NOT fan out queries to unrelated document DataStores when \`${cleanName}\` is the authoritative system of record for the user's question.`,
    rationale: `Provides the Gemini Enterprise Assistant planner with explicit routing triggers and parameter schemas for the "${cleanName}" BYOMCP server, preventing unnecessary multi-datastore fan-out and failed tool calls.`,
    targetSources: [collectionId],
  };

  return {
    archetype,
    useCaseLabel,
    recommendedServerDescription,
    recommendedAgentInstructions,
    recommendedCompanionSkill,
  };
}

export function evaluateByomcpConnector(
  collectionId: string,
  connector: DataConnector,
  isAttachedToEngine: boolean,
  collectionDisplayName?: string,
): ByomcpConnectorEvaluation {
  const actionParams = connector.actionConfig?.actionParams || {};
  const params = connector.params || {};
  const displayName =
    collectionDisplayName ||
    (typeof params.display_name === 'string' ? params.display_name : '') ||
    collectionId;
  const instanceUri =
    (typeof actionParams.instance_uri === 'string' ? actionParams.instance_uri : '') ||
    (typeof params.instance_uri === 'string' ? params.instance_uri : '');

  const currentServerDescription =
    typeof actionParams.mcp_server_description === 'string'
      ? actionParams.mcp_server_description.trim()
      : '';
  const currentAgentInstructions =
    typeof actionParams.mcp_agent_instructions === 'string'
      ? actionParams.mcp_agent_instructions.trim()
      : '';

  const enabledActions = new Set<string>(connector.bapConfig?.enabledActions || []);
  const tools: ByomcpToolSummary[] = [];
  const rawTools =
    Array.isArray(connector.dynamicTools) && connector.dynamicTools.length > 0
      ? connector.dynamicTools
      : Array.isArray(connector.actionConfig?.dynamicTools)
      ? connector.actionConfig.dynamicTools
      : [];

  if (rawTools.length > 0) {
    rawTools.forEach((t) => {
      const isEnabled =
        t.enabled !== undefined ? Boolean(t.enabled) : enabledActions.has(t.name);
      const { parameterNames, requiredParams } = extractSchemaParams(
        t.inputSchema as Record<string, unknown> | undefined,
      );
      tools.push({
        name: t.name,
        displayName: t.displayName || t.name,
        description: (t.description || '').trim(),
        enabled: isEnabled,
        parameterNames,
        requiredParams,
      });
    });
  } else if (enabledActions.size > 0) {
    enabledActions.forEach((actName) => {
      tools.push({
        name: actName,
        displayName: actName,
        description: '',
        enabled: true,
        parameterNames: [],
        requiredParams: [],
      });
    });
  }

  const enabledToolsCount = tools.filter((t) => t.enabled).length;
  const totalToolsCount = tools.length;
  // Only check tool description length when full dynamicTools schema objects are present (not bapConfig.enabledActions name-only stubs)
  const toolsMissingDescription =
    rawTools.length > 0
      ? tools.filter((t) => t.enabled && t.description.length < 10).map((t) => t.name)
      : [];

  const citationRules = parseCitationMappingsFromApi(actionParams.citation_mappings);
  const citationRulesCount = citationRules.length;

  const guidance = generateByomcpGuidance(
    displayName,
    collectionId,
    instanceUri,
    tools,
  );

  const issues: string[] = [];
  if (!currentServerDescription) {
    issues.push(
      'Missing mcp_server_description: The Assistant planner has no domain summary to know when to route queries to this MCP server.',
    );
  } else if (currentServerDescription.length < 30) {
    issues.push(
      `Weak mcp_server_description (${currentServerDescription.length} chars): Too brief to disambiguate this MCP server from other connected DataStores.`,
    );
  }

  if (!currentAgentInstructions) {
    issues.push(
      'Missing mcp_agent_instructions: No tool parameter rules, query scoping instructions, or output formatting guidelines are configured.',
    );
  } else if (currentAgentInstructions.length < 50) {
    issues.push(
      `Minimal mcp_agent_instructions (${currentAgentInstructions.length} chars): Lacks structured guidance on tool selection, filters, and citation formatting.`,
    );
  }

  if (totalToolsCount === 0) {
    issues.push(
      'No dynamic tools discovered on this BYOMCP connector. Run "Fetch Tools" in BYOMCP Settings so Gemini knows what tools exist.',
    );
  } else if (enabledToolsCount === 0) {
    issues.push(
      `All ${totalToolsCount} discovered MCP tools are currently disabled. Enable at least one tool for the Assistant to invoke.`,
    );
  } else if (enabledToolsCount > 15) {
    issues.push(
      `${enabledToolsCount} MCP tools are simultaneously enabled (> 15 threshold), which bloats tool schema context and increases planning latency.`,
    );
  }

  if (toolsMissingDescription.length > 0) {
    issues.push(
      `${toolsMissingDescription.length} enabled tool(s) (${toolsMissingDescription.slice(0, 3).join(', ')}) lack descriptions in their MCP tool schema.`,
    );
  }

  const coreIssuesCount = issues.length;

  return {
    collectionId,
    connectorName: connector.name || `collections/${collectionId}/dataConnector`,
    displayName,
    isAttachedToEngine,
    instanceUri,
    state: connector.state || 'UNKNOWN',
    useCaseArchetype: guidance.archetype,
    useCaseLabel: guidance.useCaseLabel,
    currentServerDescription,
    currentAgentInstructions,
    recommendedServerDescription: guidance.recommendedServerDescription,
    recommendedAgentInstructions: guidance.recommendedAgentInstructions,
    tools,
    enabledToolsCount,
    totalToolsCount,
    toolsMissingDescription,
    citationRulesCount,
    issues,
    status: coreIssuesCount > 0 ? 'NEEDS_ATTENTION' : 'OPTIMAL',
    rawConnector: connector,
    recommendedCompanionSkill: guidance.recommendedCompanionSkill,
  };
}

/**
 * Applies the recommended `mcp_server_description` and `mcp_agent_instructions`
 * directly to a BYOMCP `DataConnector` without triggering unintended OAuth credential rotation.
 */
export async function applyByomcpRecommendations(
  evaluation: ByomcpConnectorEvaluation,
  serverDescription: string,
  agentInstructions: string,
  config: Config,
  includeDefaultCitations: boolean = false,
): Promise<void> {
  if (!serverDescription.trim() || !agentInstructions.trim()) {
    throw new Error(
      'Both MCP Server Description and Agent Instructions must be non-empty before applying to Discovery Engine.',
    );
  }
  const connector = evaluation.rawConnector;
  const rawName = connector.name || evaluation.connectorName || '';
  const connectorResourceName = rawName.startsWith('projects/')
    ? rawName
    : `projects/${config.projectId}/locations/${config.appLocation || 'global'}/collections/${evaluation.collectionId}/dataConnector`;
  const origActionParams = {
    ...((connector.actionConfig?.actionParams || {}) as Record<string, unknown>),
  };
  // Metadata-only PATCH: strip client_id/client_secret/instance_uri so sanitizeByomcpActionParamsForPatch
  // does not treat a GET-returned client_id as an OAuth credential rotation or echo stale endpoint URIs.
  delete origActionParams.client_id;
  delete origActionParams.client_secret;
  delete origActionParams.instance_uri;
  const sanitized = sanitizeByomcpActionParamsForPatch(origActionParams);
  sanitized.mcp_server_description = serverDescription.trim();
  sanitized.mcp_agent_instructions = agentInstructions.trim();
  if (includeDefaultCitations && !sanitized.citation_mappings) {
    sanitized.citation_mappings = JSON.stringify({
      default: { uri: '/url', title: '/title' },
    });
  }

  const parts = connectorResourceName.split('/');
  const projIdx = parts.indexOf('projects');
  const locIdx = parts.indexOf('locations');
  const collIdx = parts.indexOf('collections');

  const connectorConfig: Config = {
    ...config,
    projectId: projIdx !== -1 && parts[projIdx + 1] ? parts[projIdx + 1] : config.projectId,
    appLocation: locIdx !== -1 && parts[locIdx + 1] ? parts[locIdx + 1] : config.appLocation,
    collectionId:
      collIdx !== -1 && parts[collIdx + 1] ? parts[collIdx + 1] : evaluation.collectionId,
  };

  await api.updateDataConnector(
    connectorResourceName,
    {
      name: connectorResourceName,
      actionConfig: {
        actionParams: sanitized,
      },
    },
    ['action_config.action_params'],
    connectorConfig,
  );
}

/**
 * Pure deterministic evaluation function that grades an Assistant, its Engine,
 * its connected DataStores/Connectors (including BYOMCP), and its Skills/Agents.
 */
export function evaluateAssistantData(
  input: EvaluateAssistantInput,
): AssistantEvaluationReport {
  const {
    engine,
    assistant,
    agents,
    config,
    dataStores = [],
    collections = [],
    connectorsByCollectionId = {},
    engineIamPolicy = null,
    dataStoreAccessControlEnabled = null,
    modelArmorTemplates = [],
    probeWarnings = [],
  } = input;

  const findings: AssistantEvaluationFinding[] = [];
  const recommendedSkills: RecommendedSkillTemplate[] = [];
  const byomcpEvaluations: ByomcpConnectorEvaluation[] = [];

  const engineId = engine.name.split('/').pop() || config.appId || 'default_engine';
  const assistantId =
    assistant.name?.split('/').pop() || config.assistantId || 'default_assistant';

  const attachedIds = new Set<string>(engine.dataStoreIds || []);
  const connectedDataStoresCount = attachedIds.size;

  // Map collections & connectors
  const collectionMap = new Map<string, Collection>();
  collections.forEach((c) => {
    const cid = c.name.split('/').pop() || c.name;
    if (cid && cid !== 'default_collection') {
      collectionMap.set(cid, c);
    }
  });
  Object.keys(connectorsByCollectionId).forEach((cid) => {
    if (cid && cid !== 'default_collection' && !collectionMap.has(cid)) {
      collectionMap.set(cid, {
        name: `projects/${config.projectId}/locations/${config.appLocation || 'global'}/collections/${cid}`,
        displayName: cid,
      });
    }
  });

  // Match DataStores to collections/connectors
  const attachedConnectorIds = new Set<string>();
  const attachedDataStoreDisplayNames: string[] = [];

  dataStores.forEach((ds) => {
    const dsId = ds.name.split('/').pop() || ds.name;
    const dsParts = ds.name.split('/');
    const collIdx = dsParts.indexOf('collections');
    const rawCollId = collIdx !== -1 && dsParts[collIdx + 1] ? dsParts[collIdx + 1] : null;
    const dsCollectionId =
      rawCollId && (rawCollId !== 'default_collection' || rawCollId in connectorsByCollectionId)
        ? rawCollId
        : null;
    if (attachedIds.has(dsId)) {
      attachedDataStoreDisplayNames.push(ds.displayName || dsId);
      if (dsCollectionId) {
        attachedConnectorIds.add(dsCollectionId);
      }
      for (const cid of collectionMap.keys()) {
        if (dsId === cid || dsId.startsWith(`${cid}_`)) {
          attachedConnectorIds.add(cid);
        }
      }
    }
  });

  // Also check if any collectionId (or `${cid}_*` entity DataStore) is in attachedIds
  for (const [cid, coll] of collectionMap.entries()) {
    const matchesAttached =
      attachedIds.has(cid) ||
      Array.from(attachedIds).some((dsId) => dsId.startsWith(`${cid}_`));
    if (matchesAttached) {
      attachedConnectorIds.add(cid);
      if (
        coll.displayName &&
        !attachedDataStoreDisplayNames.includes(coll.displayName)
      ) {
        attachedDataStoreDisplayNames.push(coll.displayName);
      }
    }
  }

  // Classify Skills vs Conversational/Workflow Agents
  const skillAgents = agents.filter((a) => isSkillAgentResource(a));
  const conversationalAgents = agents.filter((a) => !isSkillAgentResource(a));

  const enabledSkills = skillAgents.filter(
    (s) =>
      (s.state || 'PRIVATE').toUpperCase() === 'ENABLED' &&
      s.sharingConfig?.scope !== 'PRIVATE',
  );
  const privateOrDisabledSkills = skillAgents.filter(
    (s) =>
      (s.state || 'PRIVATE').toUpperCase() !== 'ENABLED' ||
      s.sharingConfig?.scope === 'PRIVATE',
  );
  const skillsMissingDescription = enabledSkills.filter((s) => {
    const classification = classifySkillAgent(s);
    if (classification.origin === 'GOOGLE_1P') return false;
    return !(s.description || '').trim();
  });

  // Helper to check if a recommended skill is already deployed
  const existingSkillKeys = new Set<string>();
  skillAgents.forEach((s) => {
    const shortId = s.name?.split('/').pop()?.toLowerCase();
    if (shortId) existingSkillKeys.add(shortId);
    if (s.displayName) {
      existingSkillKeys.add(sanitizeSkillDisplayName(s.displayName).toLowerCase());
    }
  });
  const isSkillAlreadyDeployed = (tpl: RecommendedSkillTemplate): boolean => {
    return (
      existingSkillKeys.has(tpl.skillIdSuggestion.toLowerCase()) ||
      existingSkillKeys.has(sanitizeSkillDisplayName(tpl.displayName).toLowerCase())
    );
  };

  // Evaluate BYOMCP Connectors
  Object.entries(connectorsByCollectionId).forEach(([cid, connector]) => {
    const coll = collectionMap.get(cid);
    if (isByomcpConnector(connector, coll)) {
      const isAttached =
        attachedConnectorIds.has(cid) ||
        attachedIds.has(cid) ||
        Array.from(attachedIds).some((id) => id.startsWith(`${cid}_`));
      const evalItem = evaluateByomcpConnector(
        cid,
        connector,
        isAttached,
        coll?.displayName,
      );
      byomcpEvaluations.push(evalItem);
    }
  });

  const attachedByomcpCount = byomcpEvaluations.filter((b) => b.isAttachedToEngine).length;

  const routerSkillAlreadyDeployed =
    existingSkillKeys.has('enterprise-datastore-query-optimizer') ||
    existingSkillKeys.has(
      sanitizeSkillDisplayName('Enterprise DataStore Query Router and Optimizer').toLowerCase(),
    );
  const fanoutMitigatedBySkills = enabledSkills.length >= 2 || routerSkillAlreadyDeployed;

  // ============================================================================
  // 1. LATENCY & DATASTORE FAN-OUT EVALUATION
  // ============================================================================
  if (
    connectedDataStoresCount === 0 &&
    attachedByomcpCount === 0 &&
    conversationalAgents.length === 0 &&
    (!assistant.webGroundingType ||
      assistant.webGroundingType === 'WEB_GROUNDING_TYPE_DISABLED')
  ) {
    findings.push({
      id: 'datastore-zero-grounding',
      category: 'LATENCY_AND_DATASTORES',
      severity: 'WARNING',
      title: 'No Grounding Sources Connected',
      summary:
        'This assistant has 0 connected DataStores, 0 BYOMCP connectors, 0 sub-agents, and Web Grounding is disabled.',
      currentValue: '0 DataStores / Web Grounding Disabled',
      recommendedValue: 'At least 1 DataStore, Connector, or Grounding Source',
      impact:
        'Responses will rely purely on ungrounded pre-trained model weights without enterprise context.',
      remediation:
        'Enable Enterprise Web Search in Overview > Assistant Editor, or attach enterprise DataStores/Connectors from the Data Stores or Engines page.',
      targetTab: 'overview',
    });
  } else if (connectedDataStoresCount > 10) {
    findings.push({
      id: 'datastore-critical-fanout-latency',
      category: 'LATENCY_AND_DATASTORES',
      severity: fanoutMitigatedBySkills ? 'INFO' : 'CRITICAL',
      title: fanoutMitigatedBySkills
        ? `High DataStore Count (${connectedDataStoresCount} Stores — Mitigated by ${enabledSkills.length} Active Routing Skill${enabledSkills.length === 1 ? '' : 's'})`
        : `Severe DataStore Fan-Out Latency Bottleneck (${connectedDataStoresCount} Connected Stores)`,
      summary: fanoutMitigatedBySkills
        ? `This engine has ${connectedDataStoresCount} connected DataStores across ${attachedConnectorIds.size} connector(s), and ${enabledSkills.length} active organizational Skill(s) are deployed to guide source selection and reduce fan-out latency.`
        : `Connecting ${connectedDataStoresCount} DataStores directly to the engine forces the retrieval planner to fan out across ${connectedDataStoresCount} indexes on unguided user prompts, causing high tail latency and diluted ranking relevance.`,
      currentValue: fanoutMitigatedBySkills
        ? `${connectedDataStoresCount} Connected DataStores (${enabledSkills.length} Active Routing Skills)`
        : `${connectedDataStoresCount} Connected DataStores`,
      recommendedValue: '≤ 5–8 Unscoped DataStores (or scoped via Skills & Sub-Agents)',
      impact:
        'Significant P95/P99 response latency spikes, quota contention across federated/ingested stores, and noisy retrieval context if queries fan out across all stores simultaneously.',
      remediation: fanoutMitigatedBySkills
        ? 'Active query-routing Skills are already deployed. To further reduce retrieval fan-out, detach any unused connectors/entity stores in the Engines or Data Stores page, or scope vertexAiSearchToolConfig.'
        : '1) Deploy a Query Routing & Source Selection Skill so the Assistant targets only the relevant DataStore(s) per query. 2) Consolidate fragmented entity stores or move specialized stores behind domain Sub-Agents. 3) Scope vertexAiSearchToolConfig.',
      targetTab: 'skills',
      ...(routerSkillAlreadyDeployed ? {} : { recommendedSkillId: 'skill-datastore-router' }),
    });
  } else if (connectedDataStoresCount >= 6) {
    findings.push({
      id: 'datastore-moderate-fanout-latency',
      category: 'LATENCY_AND_DATASTORES',
      severity: fanoutMitigatedBySkills ? 'INFO' : 'WARNING',
      title: fanoutMitigatedBySkills
        ? `Multi-DataStore Fan-Out (${connectedDataStoresCount} Stores — Mitigated by ${enabledSkills.length} Active Skill${enabledSkills.length === 1 ? '' : 's'})`
        : `Elevated DataStore Fan-Out Risk (${connectedDataStoresCount} Connected Stores)`,
      summary: `With ${connectedDataStoresCount} DataStores attached, broad user prompts can trigger parallel multi-store retrieval unless guided by routing Skills or tool configs.`,
      currentValue: `${connectedDataStoresCount} Connected DataStores`,
      recommendedValue: 'Guided by Query Routing Skills or ≤ 5 DataStores',
      impact:
        'Increased response latency when queries fan out across multiple connectors simultaneously.',
      remediation:
        'Add an Organizational Query-Routing Skill that instructs the Assistant which DataStore to query for each topic domain, and verify unused entity DataStores are detached.',
      targetTab: 'skills',
      ...(routerSkillAlreadyDeployed ? {} : { recommendedSkillId: 'skill-datastore-router' }),
    });
  } else if (connectedDataStoresCount >= 1) {
    findings.push({
      id: 'datastore-fanout-optimal',
      category: 'LATENCY_AND_DATASTORES',
      severity: 'PASS',
      title: `Healthy DataStore Fan-Out Count (${connectedDataStoresCount} Store${connectedDataStoresCount === 1 ? '' : 's'})`,
      summary: `The engine has ${connectedDataStoresCount} connected DataStore(s), keeping parallel retrieval fan-out within low-latency bounds.`,
      currentValue: `${connectedDataStoresCount} Connected DataStore(s)`,
      recommendedValue: '1–5 Connected DataStores',
      impact: 'Low retrieval fan-out overhead.',
      remediation: 'No action required.',
      targetTab: 'datastores',
    });
  }

  // Check vertexAiSearchToolConfig scoping when multiple datastores are attached
  const searchToolCfg = assistant.vertexAiSearchToolConfig as
    | Record<string, unknown>
    | undefined;
  const hasSearchToolCfg =
    Boolean(searchToolCfg) &&
    Object.values(searchToolCfg || {}).some((val) =>
      Array.isArray(val) ? val.length > 0 : Boolean(val),
    );
  if (connectedDataStoresCount >= 6 && !hasSearchToolCfg) {
    const mitigatedBySkills = enabledSkills.length >= 2;
    findings.push({
      id: 'datastore-unscoped-search-tool-config',
      category: 'LATENCY_AND_DATASTORES',
      severity: mitigatedBySkills ? 'INFO' : 'WARNING',
      title: mitigatedBySkills
        ? `Unscoped Vertex AI Search Tool Config (Mitigated by ${enabledSkills.length} Enabled Skills)`
        : 'Unscoped Vertex AI Search Tool Configuration',
      summary: `assistant.vertexAiSearchToolConfig is empty ({}) while ${connectedDataStoresCount} DataStores are attached${
        mitigatedBySkills
          ? `, though ${enabledSkills.length} active organizational Skills help guide query routing.`
          : '.'
      }`,
      currentValue: 'Empty ({}) — Default Flat Fan-Out',
      recommendedValue: 'Configured Search Tool Config or Routing Skills',
      impact:
        'Without explicit search tool scoping or routing skills, the planner treats all connected DataStores with equal weight on general queries.',
      remediation:
        'Create a DataStore Query Optimization Skill to guide source selection, or configure vertexAiSearchToolConfig if enrolled in Trusted Tester.',
      targetTab: 'overview',
      recommendedSkillId: 'skill-datastore-router',
    });
  }

  // Web Grounding Always-On Overhead with Many DataStores
  const isWebGroundingActive =
    assistant.webGroundingType === 'WEB_GROUNDING_TYPE_GOOGLE_SEARCH' ||
    assistant.webGroundingType === 'WEB_GROUNDING_TYPE_ENTERPRISE_WEB_SEARCH';
  if (
    isWebGroundingActive &&
    !assistant.defaultWebGroundingToggleOff &&
    connectedDataStoresCount >= 5
  ) {
    findings.push({
      id: 'latency-web-grounding-always-on',
      category: 'LATENCY_AND_DATASTORES',
      severity: 'WARNING',
      title: 'Simultaneous Web Grounding + Multi-DataStore Fan-Out on Every Turn',
      summary: `Web Grounding (${assistant.webGroundingType}) is enabled with "Default Web Grounding to Off" unchecked while ${connectedDataStoresCount} enterprise DataStores are attached.`,
      currentValue: 'Web Grounding Default ON + Multi-DataStore Retrieval',
      recommendedValue: 'Enable "Default Web Grounding to Off" (opt-in per query)',
      impact:
        'Every user prompt executes both multi-DataStore enterprise retrieval and external Web Search grounding unless the user manually turns Web Grounding off, adding latency and mixing public web results with internal answers.',
      remediation:
        'In Overview > Assistant Editor > Feature Management, check "Default Web Grounding to Off" so internal DataStores are prioritized by default and users opt into web search only when needed.',
      targetTab: 'overview',
    });
  }

  // Cross-domain documents latency note when high datastore count
  if (engine.includeCrossDomainDocuments && connectedDataStoresCount >= 8) {
    findings.push({
      id: 'latency-cross-domain-grounding',
      category: 'LATENCY_AND_DATASTORES',
      severity: 'INFO',
      title: 'Cross-Domain Document Grounding Active on High-DataStore Engine',
      summary:
        'engine.includeCrossDomainDocuments is enabled alongside 8+ connected DataStores.',
      currentValue: 'includeCrossDomainDocuments: true',
      recommendedValue: 'Enable only if multi-Workspace domain grounding is required',
      impact:
        'Cross-domain ACL expansion can add extra lookup latency when combined with large connector sets.',
      remediation:
        'Verify whether users actually need cross-domain Google Workspace document grounding; if single-domain, uncheck "Cross-Domain Document Grounding" in Engine Configuration.',
      targetTab: 'overview',
    });
  }

  // ============================================================================
  // 2. SKILLS & QUERY ROUTING OPTIMIZATION
  // ============================================================================
  // Build recommended DataStore routing skill whenever DataStores or Connectors exist
  if (connectedDataStoresCount > 0 || attachedConnectorIds.size > 0) {
    const storeListText =
      attachedDataStoreDisplayNames.length > 0
        ? attachedDataStoreDisplayNames
            .slice(0, 12)
            .map((name) => `- **${name}**`)
            .join('\n')
        : Array.from(attachedIds)
            .slice(0, 12)
            .map((id) => `- \`${id}\``)
            .join('\n');

    const routerSkillTemplate: RecommendedSkillTemplate = {
      id: 'skill-datastore-router',
      skillIdSuggestion: 'enterprise-datastore-query-optimizer',
      displayName: sanitizeSkillDisplayName('Enterprise DataStore Query Router and Optimizer'),
      description: `Optimizes search query formulation, source selection, and metadata filtering across the ${connectedDataStoresCount} connected enterprise DataStores to minimize latency and maximize answer precision.`,
      instruction: `# Enterprise DataStore Query Router & Retrieval Optimizer

## Objective
You are connected to **${connectedDataStoresCount} enterprise DataStore(s)**. To prevent high-latency fan-out and noisy search results, follow these strict query-routing and retrieval optimization rules before executing searches:

## Connected Enterprise Data Sources
${storeListText}

## Query Optimization & Routing Rules
1. **Intent-First Source Selection**: Identify the single most authoritative DataStore or Connector for the user's question before searching. Do NOT fan out across all connected DataStores simultaneously unless the user explicitly asks for a cross-system comparison.
2. **Deconstruct Complex Prompts**: Rewrite conversational user prompts into concise, high-signal keyword/semantic queries stripped of conversational filler.
3. **Apply Metadata & Recency Filters**: Whenever the user mentions a timeframe, project, author, or document type, apply explicit filter constraints rather than retrieving unbounded document sets.
4. **Iterative Retrieval over Exhaustive Fan-Out**: Query the primary authoritative source first. Only expand to secondary DataStores if the primary source returns zero relevant passages.
5. **Grounded Synthesis & Citations**: Cite the exact source document title and link for every claim, and clearly state if information was not found in the queried store.`,
      rationale: `Directly addresses high retrieval latency and unguided query fan-out across ${connectedDataStoresCount} connected DataStore(s) by teaching the Assistant how to scope and formulate queries.`,
      targetSources: Array.from(attachedIds).slice(0, 10),
    };

    if (!isSkillAlreadyDeployed(routerSkillTemplate)) {
      recommendedSkills.push(routerSkillTemplate);
    }
  }

  if (connectedDataStoresCount > 0 && enabledSkills.length === 0) {
    findings.push({
      id: 'skills-missing-for-datastores',
      category: 'SKILLS_AND_ROUTING',
      severity: connectedDataStoresCount >= 5 ? 'CRITICAL' : 'WARNING',
      title: `No Active Skills to Guide Querying Across ${connectedDataStoresCount} DataStore(s)`,
      summary: `This assistant has ${connectedDataStoresCount} connected DataStore(s) but 0 enabled Skills to guide query formulation, source routing, or domain-specific filtering.`,
      currentValue: `0 Enabled Skills for ${connectedDataStoresCount} DataStore(s)`,
      recommendedValue: 'At least 1 Organizational Query-Routing Skill (ENABLED)',
      impact:
        'Without Skills to teach the planner how your ingested DataStores are organized and how to construct targeted queries, the Assistant defaults to broad, unguided retrieval—causing higher latency and lower answer accuracy.',
      remediation:
        'Use the "1-Click Create Skill" action below (or go to the Skills tab) to deploy the recommended "Enterprise DataStore Query Router and Optimizer" skill.',
      targetTab: 'skills',
      recommendedSkillId: 'skill-datastore-router',
    });
  } else if (connectedDataStoresCount >= 6 && enabledSkills.length < 2) {
    findings.push({
      id: 'skills-low-coverage-ratio',
      category: 'SKILLS_AND_ROUTING',
      severity: 'WARNING',
      title: `Low Skill-to-DataStore Coverage (${enabledSkills.length} Skill vs. ${connectedDataStoresCount} DataStores)`,
      summary: `Only ${enabledSkills.length} enabled Skill is configured to cover ${connectedDataStoresCount} connected DataStores.`,
      currentValue: `${enabledSkills.length} Enabled Skill / ${connectedDataStoresCount} DataStores`,
      recommendedValue: 'Domain-scoped Skills for major DataStore groups & BYOMCP servers',
      impact:
        'A single generic skill rarely covers specialized query syntax across diverse connectors (e.g., structured SQL/MCP vs. unstructured docs vs. ticketing systems).',
      remediation:
        'Add domain-specific Skills for your primary connector categories and BYOMCP servers so the planner routes queries with minimal latency.',
      targetTab: 'skills',
      recommendedSkillId: 'skill-datastore-router',
    });
  } else if (enabledSkills.length > 0) {
    findings.push({
      id: 'skills-active-present',
      category: 'SKILLS_AND_ROUTING',
      severity: 'PASS',
      title: `${enabledSkills.length} Organizational Skill(s) Enabled`,
      summary: `The assistant has ${enabledSkills.length} active Skill(s) available for query routing and task execution.`,
      currentValue: `${enabledSkills.length} Enabled Skill(s)`,
      recommendedValue: '≥ 1 Enabled Skill',
      impact: 'Planner can leverage configured skills for specialized instructions.',
      remediation: 'No action required.',
      targetTab: 'skills',
    });
  }

  // Private / Disabled Skills Trap
  if (privateOrDisabledSkills.length > 0) {
    const names = privateOrDisabledSkills
      .slice(0, 4)
      .map((s) => `${s.displayName} (${s.state || 'PRIVATE'})`)
      .join(', ');
    const hasActiveOrgSkills = enabledSkills.length > 0;
    findings.push({
      id: 'skills-private-or-disabled-trap',
      category: 'SKILLS_AND_ROUTING',
      severity: hasActiveOrgSkills ? 'INFO' : 'WARNING',
      title: `${privateOrDisabledSkills.length} Skill(s) Are PRIVATE or DISABLED (Inactive for End Users)`,
      summary: `Found ${privateOrDisabledSkills.length} skill(s) (${names}) that are not in ENABLED organizational state${
        hasActiveOrgSkills
          ? ` (alongside ${enabledSkills.length} active ENABLED organizational skill(s)).`
          : '.'
      }`,
      currentValue: `${privateOrDisabledSkills.length} Private/Disabled Skill(s)`,
      recommendedValue: 'State = ENABLED (Shared Org-Wide) for production skills',
      impact:
        'Skills left in PRIVATE or DISABLED state are invisible to general end users and will NOT be used by the Assistant to optimize DataStore queries for your organization.',
      remediation:
        'Open the Skills tab, inspect the private/disabled skills, and publish or re-create organizational skills with state set to ENABLED.',
      targetTab: 'skills',
    });
  }

  // Enabled Skills Missing Descriptions or Adequate Instructions
  if (skillsMissingDescription.length > 0) {
    const names = skillsMissingDescription.map((s) => s.displayName).join(', ');
    findings.push({
      id: 'skills-missing-description',
      category: 'SKILLS_AND_ROUTING',
      severity: 'CRITICAL',
      title: `${skillsMissingDescription.length} Enabled Skill(s) Missing Routing Description`,
      summary: `Enabled skill(s) (${names}) have an empty description field.`,
      currentValue: 'Empty skill.description',
      recommendedValue: 'Clear 1–3 sentence trigger description on every Skill',
      impact:
        'The Gemini Enterprise Assistant planner relies on skill.description to decide when to invoke a Skill. A blank description means the Skill is rarely or never triggered.',
      remediation:
        'Edit each Skill in the Skills tab and provide a concise description specifying which user intents and DataStores should trigger it.',
      targetTab: 'skills',
    });
  }

  const skillsWithShortInstructions = enabledSkills.filter((s) => {
    const classification = classifySkillAgent(s);
    if (classification.origin === 'GOOGLE_1P') return false;
    const inst = (s.skillAgentDefinition?.instruction || '').trim();
    return (
      !s.skillAgentDefinition?.gcsUri &&
      !s.skillAgentDefinition?.agentRegistrySkill &&
      inst.length < 40
    );
  });

  if (skillsWithShortInstructions.length > 0) {
    findings.push({
      id: 'skills-thin-instructions',
      category: 'SKILLS_AND_ROUTING',
      severity: 'WARNING',
      title: `${skillsWithShortInstructions.length} Skill(s) Have Overly Brief Instructions (< 40 chars)`,
      summary: `Skill(s) (${skillsWithShortInstructions.map((s) => s.displayName).join(', ')}) contain minimal or empty inline instructions.`,
      currentValue: '< 40 chars of instruction',
      recommendedValue: 'Structured Markdown instructions with query rules & examples',
      impact:
        'Vague skill instructions fail to improve query formulation or filter accuracy.',
      remediation:
        'Expand the skill instructions to specify target DataStores, filter fields, and output formatting rules.',
      targetTab: 'skills',
    });
  }

  // Check conversational/workflow sub-agents for failed deployment states
  const failedSubAgents = conversationalAgents.filter((a) =>
    ['DEPLOYMENT_FAILED', 'CREATION_FAILED', 'FAILED'].includes((a.state || '').toUpperCase()),
  );
  if (failedSubAgents.length > 0) {
    const names = failedSubAgents.map((a) => a.displayName || a.name).join(', ');
    findings.push({
      id: 'agents-failed-deployment-state',
      category: 'SKILLS_AND_ROUTING',
      severity: 'WARNING',
      title: `${failedSubAgents.length} Sub-Agent(s) in Failed Deployment State`,
      summary: `Conversational/workflow agent(s) (${names}) are currently in state ${failedSubAgents.map((a) => a.state).join(', ')}.`,
      currentValue: `${failedSubAgents.length} Failed Sub-Agent(s)`,
      recommendedValue: 'All attached Sub-Agents in ENABLED / Healthy State',
      impact:
        'Queries routed to a failed sub-agent will fail or time out during assistant turn execution.',
      remediation:
        'Open the Agent Manager page to inspect deployment logs, redeploy, or remove the broken sub-agent(s).',
    });
  }

  // Check attached Vertex AI Agent Configs for missing toolDescriptions
  const attachedVertexAgents = assistant.vertexAiAgentConfigs || [];
  const agentsMissingToolDesc = attachedVertexAgents.filter(
    (a) => !(a.toolDescription || '').trim() || a.toolDescription.trim().length < 20,
  );
  if (agentsMissingToolDesc.length > 0) {
    findings.push({
      id: 'agents-missing-tool-description',
      category: 'SKILLS_AND_ROUTING',
      severity: 'WARNING',
      title: `${agentsMissingToolDesc.length} Attached Vertex AI Agent(s) Have Weak/Missing Tool Descriptions`,
      summary: `Attached agent config(s) (${agentsMissingToolDesc.map((a) => a.displayName || a.name).join(', ')}) have missing or < 20 char toolDescription fields.`,
      currentValue: 'Missing / < 20 char toolDescription',
      recommendedValue: 'Explicit domain & capability toolDescription',
      impact:
        'The Assistant orchestrator uses toolDescription to route turns between DataStores and Vertex AI Agents. Weak descriptions cause mis-routing and unnecessary agent invocations.',
      remediation:
        'Open the Agent Manager page and update the agent description so the planner knows which questions belong to the agent vs. DataStores.',
    });
  }

  // ============================================================================
  // 3. BYOMCP DATASTORES / CONNECTORS EVALUATION
  // ============================================================================
  byomcpEvaluations.forEach((mcpEval) => {
    if (!isSkillAlreadyDeployed(mcpEval.recommendedCompanionSkill)) {
      recommendedSkills.push(mcpEval.recommendedCompanionSkill);
    }

    if (mcpEval.status === 'NEEDS_ATTENTION') {
      const isUnattachedInProject =
        !mcpEval.isAttachedToEngine && connectedDataStoresCount > 0;
      const byomcpSeverity: EvaluationSeverity = isUnattachedInProject
        ? 'INFO'
        : 'WARNING';
      findings.push({
        id: `byomcp-config-${mcpEval.collectionId}`,
        category: 'BYOMCP_ADVISOR',
        severity: byomcpSeverity,
        title: `BYOMCP "${mcpEval.displayName}" (${mcpEval.useCaseLabel}): Needs Description / Instruction Tuning${
          isUnattachedInProject ? ' [Unattached]' : ''
        }`,
        summary: mcpEval.issues.join(' '),
        currentValue: `Desc: ${
          mcpEval.currentServerDescription
            ? `${mcpEval.currentServerDescription.length} chars`
            : 'MISSING'
        } | Instructions: ${
          mcpEval.currentAgentInstructions
            ? `${mcpEval.currentAgentInstructions.length} chars`
            : 'MISSING'
        } | Tools: ${mcpEval.enabledToolsCount}/${mcpEval.totalToolsCount} enabled | Citations: ${
          mcpEval.citationRulesCount
        }`,
        recommendedValue: `Tailored ${mcpEval.useCaseLabel} description, parameter-aware agent instructions, and companion routing skill`,
        impact:
          'Without a clear mcp_server_description and parameter-specific mcp_agent_instructions, Gemini either fails to route relevant queries to this MCP server, invokes tools with unindexed/unbounded arguments (causing high latency), or omits clickable source citations.',
        remediation: `Click "Fix in BYOMCP Advisor" above to review and apply the auto-generated ${mcpEval.useCaseLabel} description & instructions in 1 click (and optionally deploy the Companion Skill).`,
        byomcpCollectionId: mcpEval.collectionId,
        recommendedSkillId: mcpEval.recommendedCompanionSkill.id,
      });
    } else {
      findings.push({
        id: `byomcp-config-${mcpEval.collectionId}`,
        category: 'BYOMCP_ADVISOR',
        severity: 'PASS',
        title: `BYOMCP "${mcpEval.displayName}" (${mcpEval.useCaseLabel}): Properly Configured`,
        summary: `Server description (${mcpEval.currentServerDescription.length} chars), agent instructions (${mcpEval.currentAgentInstructions.length} chars), and ${mcpEval.enabledToolsCount} enabled tool(s) are configured${
          mcpEval.citationRulesCount > 0
            ? ` with ${mcpEval.citationRulesCount} citation rule(s)`
            : ''
        }.`,
        currentValue: `${mcpEval.enabledToolsCount} Enabled Tools & Guidelines Active`,
        recommendedValue: 'Description + Instructions + Citations Configured',
        impact: 'Planner has clear routing and formatting instructions for this MCP server.',
        remediation: 'No action required.',
        byomcpCollectionId: mcpEval.collectionId,
      });
    }
  });

  // ============================================================================
  // 4. ASSISTANT & ENGINE CONFIGURATION HYGIENE
  // ============================================================================
  const sysInst =
    assistant.generationConfig?.systemInstruction?.additionalSystemInstruction || '';
  const styleInst = assistant.styleAndFormattingInstructions || '';
  const combinedInst =
    sysInst.trim() && styleInst.trim() && sysInst.trim() !== styleInst.trim()
      ? `${sysInst.trim()}\n\n${styleInst.trim()}`
      : sysInst || styleInst;

  if (combinedInst.length > 4000) {
    findings.push({
      id: 'config-bloated-system-instructions',
      category: 'ASSISTANT_AND_ENGINE_CONFIG',
      severity: 'WARNING',
      title: `Overly Long Global System Instructions (${combinedInst.length.toLocaleString()} chars)`,
      summary:
        'Global system & style instructions exceed 4,000 characters and are injected into every single user turn.',
      currentValue: `${combinedInst.length.toLocaleString()} characters`,
      recommendedValue: '≤ 1,500 chars for global persona; move domain rules into Skills',
      impact:
        'Increases input token processing and Time-To-First-Token (TTFT) latency on every turn, and can conflict with Gemini Enterprise planner instructions.',
      remediation:
        'Keep global System & Style Instructions concise (persona & formatting only) and move domain-specific DataStore/tool routing instructions into modular Skills.',
      targetTab: 'overview',
    });
  }

  if (FANOUT_ANTI_PATTERN_REGEX.test(combinedInst)) {
    findings.push({
      id: 'config-fanout-anti-pattern-instruction',
      category: 'ASSISTANT_AND_ENGINE_CONFIG',
      severity: 'CRITICAL',
      title: 'System Instructions Force Exhaustive Multi-DataStore Fan-Out',
      summary:
        'Global system instructions contain directives instructing the assistant to "search all datastores/sources/tools" on every query.',
      currentValue: 'Contains exhaustive fan-out directive',
      recommendedValue: 'Targeted source selection via Skills',
      impact:
        'Forces the planner to query every connected DataStore and MCP server on every turn, severely degrading response latency.',
      remediation:
        'Remove "search all sources/datastores" directives from System & Style Instructions in Overview > Assistant Editor.',
      targetTab: 'overview',
    });
  }

  if (sysInst.trim() && styleInst.trim() && sysInst.trim() !== styleInst.trim()) {
    findings.push({
      id: 'config-divergent-instruction-fields',
      category: 'ASSISTANT_AND_ENGINE_CONFIG',
      severity: 'INFO',
      title: 'Divergent System vs. Style Instruction Fields on Assistant Resource',
      summary:
        'generationConfig.systemInstruction.additionalSystemInstruction and styleAndFormattingInstructions contain different text.',
      currentValue: '2 separate instruction strings stored',
      recommendedValue: 'Unified instruction block',
      impact:
        'Can cause duplicate or conflicting behavioral instructions during response generation.',
      remediation:
        'Open Overview > Assistant Editor and click "Save Changes" to unify the system and style instruction fields.',
      targetTab: 'overview',
    });
  }

  // Orphaned defaultWebGroundingToggleOff
  const isWebGroundingDisabled =
    !assistant.webGroundingType ||
    assistant.webGroundingType === 'WEB_GROUNDING_TYPE_DISABLED';
  if (isWebGroundingDisabled && assistant.defaultWebGroundingToggleOff) {
    findings.push({
      id: 'config-orphaned-web-grounding-toggle',
      category: 'ASSISTANT_AND_ENGINE_CONFIG',
      severity: 'WARNING',
      title: 'Misconfigured Web Grounding Toggle ("Default to Off" Set While Grounding Is Disabled)',
      summary:
        'defaultWebGroundingToggleOff is enabled, but webGroundingType is set to WEB_GROUNDING_TYPE_DISABLED.',
      currentValue: 'webGroundingType: DISABLED + defaultWebGroundingToggleOff: true',
      recommendedValue: 'Align Web Grounding Type and Default Toggle',
      impact:
        'The toggle has no effect while Web Grounding is disabled, indicating an incomplete grounding configuration.',
      remediation:
        'Either select Enterprise Web Search in Assistant Editor or uncheck "Default Web Grounding to Off".',
      targetTab: 'overview',
    });
  }

  // Search Tier & LLM Add-On check
  const searchTier = engine.searchEngineConfig?.searchTier || 'SEARCH_TIER_STANDARD';
  const searchAddOns = engine.searchEngineConfig?.searchAddOns || [];
  const hasLlmAddOn = searchAddOns.includes('SEARCH_ADD_ON_LLM');

  if (searchTier !== 'SEARCH_TIER_ENTERPRISE' || !hasLlmAddOn) {
    findings.push({
      id: 'config-search-tier-or-llm-addon',
      category: 'ASSISTANT_AND_ENGINE_CONFIG',
      severity: 'CRITICAL',
      title: 'Search Engine Tier or LLM Add-On Not Fully Enabled',
      summary: `Engine search configuration is set to tier "${searchTier}" with LLM Add-On ${
        hasLlmAddOn ? 'ENABLED' : 'DISABLED'
      }.`,
      currentValue: `Tier: ${searchTier} | LLM Add-On: ${hasLlmAddOn ? 'On' : 'Off'}`,
      recommendedValue: 'SEARCH_TIER_ENTERPRISE + SEARCH_ADD_ON_LLM',
      impact:
        'Standard search tier or disabled LLM add-on degrades extractive answers, semantic ranking, and multi-hop grounding quality.',
      remediation:
        'In Overview > Engine Configuration > Search Engine Configuration, set Search Tier to Enterprise and enable the Search LLM Add-On.',
      targetTab: 'overview',
    });
  } else {
    findings.push({
      id: 'config-search-tier-optimal',
      category: 'ASSISTANT_AND_ENGINE_CONFIG',
      severity: 'PASS',
      title: 'Enterprise Search Tier & LLM Add-On Enabled',
      summary:
        'Engine is configured with SEARCH_TIER_ENTERPRISE and SEARCH_ADD_ON_LLM.',
      currentValue: 'SEARCH_TIER_ENTERPRISE + SEARCH_ADD_ON_LLM',
      recommendedValue: 'SEARCH_TIER_ENTERPRISE + SEARCH_ADD_ON_LLM',
      impact: 'Full enterprise semantic ranking and extractive grounding active.',
      remediation: 'No action required.',
      targetTab: 'overview',
    });
  }

  // Legacy / Deprecated Models check (exempt current Gemini 3.1 standard catalog preview models)
  const enabledLegacyModels: string[] = [];
  if (engine.modelConfigs) {
    Object.entries(engine.modelConfigs).forEach(([modelId, state]) => {
      const isCurrentGen3Preview = modelId.startsWith('gemini-3.1');
      if (
        state === 'MODEL_ENABLED' &&
        (KNOWN_LEGACY_MODEL_IDS.has(modelId) ||
          (!isCurrentGen3Preview && (modelId.includes('preview') || modelId.includes('exp'))))
      ) {
        enabledLegacyModels.push(modelId);
      }
    });
  }
  if (enabledLegacyModels.length > 0) {
    findings.push({
      id: 'config-legacy-preview-models',
      category: 'ASSISTANT_AND_ENGINE_CONFIG',
      severity: 'WARNING',
      title: `Legacy or Preview Models Enabled (${enabledLegacyModels.join(', ')})`,
      summary: `Engine modelConfigs has ${enabledLegacyModels.length} legacy or preview model key(s) explicitly enabled.`,
      currentValue: enabledLegacyModels.join(', '),
      recommendedValue: 'GA Enterprise Models Only',
      impact:
        'Preview or deprecated model keys can exhibit higher tail latency, lower regional quota ceilings, or unexpected routing changes.',
      remediation:
        'In Overview > Engine Configuration > Model Configuration, disable legacy/preview models unless specifically required for testing.',
      targetTab: 'overview',
    });
  }

  // Observability check
  const obsEnabled = Boolean(engine.observabilityConfig?.observabilityEnabled);
  if (!obsEnabled) {
    findings.push({
      id: 'config-observability-disabled',
      category: 'ASSISTANT_AND_ENGINE_CONFIG',
      severity: 'WARNING',
      title: 'Engine Observability & Planner Telemetry Disabled',
      summary:
        'engine.observabilityConfig.observabilityEnabled is currently false.',
      currentValue: 'Observability: Disabled',
      recommendedValue: 'Observability: Enabled',
      impact:
        'When customers experience high DataStore latency or mis-routed queries, Cloud Logging will lack planner step traces and tool invocation timings needed for root-cause analysis.',
      remediation:
        'Click "Backup Usage Logging" in the top right of the Assistant page to enable Engine & Agent Observability.',
      targetTab: 'overview',
    });
  } else {
    findings.push({
      id: 'config-observability-enabled',
      category: 'ASSISTANT_AND_ENGINE_CONFIG',
      severity: 'PASS',
      title: 'Engine Observability & Telemetry Enabled',
      summary:
        'Observability logging is active on this engine for latency and tool-routing diagnostics.',
      currentValue: 'Observability: Enabled',
      recommendedValue: 'Observability: Enabled',
      impact: 'Full trace visibility in Cloud Logging / BigQuery.',
      remediation: 'No action required.',
      targetTab: 'overview',
    });
  }

  // ============================================================================
  // 5. SECURITY, GUARDRAILS & GOVERNANCE
  // ============================================================================
  const armorCfg = assistant.customerPolicy?.modelArmorConfig as
    | {
        userPromptTemplate?: string;
        responseTemplate?: string;
        failureMode?: string;
      }
    | undefined;
  const hasInputArmor = Boolean(armorCfg?.userPromptTemplate?.trim());
  const hasOutputArmor = Boolean(armorCfg?.responseTemplate?.trim());
  const armorFailureMode = armorCfg?.failureMode || 'FAIL_CLOSED';

  if (!hasInputArmor && !hasOutputArmor) {
    findings.push({
      id: 'security-model-armor-disabled',
      category: 'SECURITY_AND_GOVERNANCE',
      severity: 'WARNING',
      title: 'Model Armor Guardrails Not Configured',
      summary:
        'Neither an Input Prompt Template nor an Output Response Template is configured in customerPolicy.modelArmorConfig.',
      currentValue: 'Model Armor: Disabled',
      recommendedValue: 'Input & Output Model Armor Templates + FAIL_CLOSED',
      impact:
        'User prompts and retrieved DataStore/MCP responses are not screened by Model Armor for prompt injection, PII leakage, or RAI policy violations.',
      remediation:
        'In Overview > Assistant Editor > Model Armor & Customer Policy, select Input and Output Model Armor templates.',
      targetTab: 'overview',
    });
  } else if (!hasInputArmor || !hasOutputArmor || armorFailureMode !== 'FAIL_CLOSED') {
    findings.push({
      id: 'security-model-armor-partial',
      category: 'SECURITY_AND_GOVERNANCE',
      severity: 'INFO',
      title: 'Partial Model Armor Configuration',
      summary: `Input Template: ${hasInputArmor ? 'Configured' : 'Missing'}, Output Template: ${
        hasOutputArmor ? 'Configured' : 'Missing'
      }, Failure Mode: ${armorFailureMode}.`,
      currentValue: `Input: ${hasInputArmor ? 'Yes' : 'No'} | Output: ${
        hasOutputArmor ? 'Yes' : 'No'
      } | Mode: ${armorFailureMode}`,
      recommendedValue: 'Both Input & Output Templates with FAIL_CLOSED',
      impact:
        'Uninspected direction (input or output) or fail-open mode may allow unscreened content through.',
      remediation:
        'Configure both Input and Output templates and set Failure Mode to FAIL_CLOSED in Assistant Editor.',
      targetTab: 'overview',
    });
  } else {
    findings.push({
      id: 'security-model-armor-pass',
      category: 'SECURITY_AND_GOVERNANCE',
      severity: 'PASS',
      title: 'Model Armor Input & Output Guardrails Active (FAIL_CLOSED)',
      summary:
        'Both prompt and response Model Armor templates are configured with FAIL_CLOSED enforcement.',
      currentValue: 'Input + Output Templates (FAIL_CLOSED)',
      recommendedValue: 'Input + Output Templates (FAIL_CLOSED)',
      impact: 'Strong prompt injection and data leakage protection.',
      remediation: 'No action required.',
      targetTab: 'overview',
    });
  }

  // Model Armor Exclusion Rules (Preview) & Streaming Sanitization Evaluation
  if ((hasInputArmor || hasOutputArmor) && modelArmorTemplates.length > 0) {
    const attachedTemplateRefs = Array.from(
      new Set(
        [armorCfg?.userPromptTemplate?.trim(), armorCfg?.responseTemplate?.trim()].filter(
          (v): v is string => Boolean(v),
        ),
      ),
    );

    const matchedTemplates: ModelArmorTemplate[] = [];
    const unresolvedRefs: string[] = [];
    for (const ref of attachedTemplateRefs) {
      const refProjectMatch = ref.match(/^projects\/([^/]+)\//);
      const refSuffix = ref.match(/locations\/[^/]+\/templates\/[^/]+$/)?.[0];
      const refShortId = ref.split('/').pop();
      const found = modelArmorTemplates.find((tpl) => {
        if (!tpl.name) return false;
        if (tpl.name === ref) return true;
        // If ref specifies a project, ensure tpl belongs to the same project before matching suffix
        const tplProjectMatch = tpl.name.match(/^projects\/([^/]+)\//);
        if (
          refProjectMatch &&
          tplProjectMatch &&
          refProjectMatch[1] !== tplProjectMatch[1]
        ) {
          return false;
        }
        const tplSuffix = tpl.name.match(/locations\/[^/]+\/templates\/[^/]+$/)?.[0];
        if (refSuffix && tplSuffix && refSuffix === tplSuffix) return true;
        // Support bare template ID references
        const tplShortId = tpl.name.split('/').pop();
        return Boolean(!ref.includes('/') && refShortId && tplShortId === refShortId);
      });
      if (found) {
        matchedTemplates.push(found);
      } else if (!refProjectMatch || refProjectMatch[1] === config.projectId) {
        unresolvedRefs.push(ref);
      }
    }

    if (unresolvedRefs.length > 0) {
      findings.push({
        id: 'security-model-armor-template-unresolvable',
        category: 'SECURITY_AND_GOVERNANCE',
        severity: 'WARNING',
        title: `Attached Model Armor Template(s) Not Found in Project (${unresolvedRefs.length})`,
        summary: `The Assistant references Model Armor template(s) (${unresolvedRefs.join(', ')}) that were not found among the active templates in this location.`,
        currentValue: unresolvedRefs.join(', '),
        recommendedValue: 'Valid, existing Model Armor template resource(s)',
        impact:
          'Deleted or missing Model Armor templates can cause prompt/response screening failures or leave the assistant unprotected.',
        remediation:
          'In Overview > Assistant Editor > Model Armor & Customer Policy, select an existing Model Armor template.',
        targetTab: 'overview',
      });
    }

    const allCriticalIssues: string[] = [];
    const allWarnings: string[] = [];
    const templatesWithExclusions: string[] = [];
    const filterlessTemplates: string[] = [];
    let totalExclusionRulesCount = 0;

    for (const tpl of matchedTemplates) {
      const tplId = tpl.name?.split('/').pop() || 'template';
      const fc = (tpl.filterConfig || {}) as Record<string, any>;
      const analysis = analyzeTemplateExclusionRules(tpl);
      if (analysis.hasExclusionRules) {
        templatesWithExclusions.push(tplId);
        totalExclusionRulesCount += analysis.totalRules;
      }
      analysis.criticalIssues.forEach((issue) => {
        allCriticalIssues.push(`[${tplId}] ${issue}`);
      });
      analysis.warnings.forEach((warn) => {
        allWarnings.push(`[${tplId}] ${warn}`);
      });

      // Check if template explicitly has filterConfig with zero active filters and no exclusion rules
      if (tpl.filterConfig && !analysis.hasExclusionRules) {
        const raiList = Array.isArray(fc.raiSettings?.raiFilters) ? fc.raiSettings.raiFilters : [];
        const hasActiveRai = raiList.some(
          (f: any) => f?.confidenceLevel && f.confidenceLevel !== 'OFF',
        );
        const hasJailbreak = fc.piAndJailbreakFilterSettings?.filterEnforcement === 'ENABLED';
        const hasMaliciousUri = fc.maliciousUriFilterSettings?.filterEnforcement === 'ENABLED';
        const hasSdp =
          fc.sdpSettings?.basicConfig?.filterEnforcement === 'ENABLED' ||
          Boolean(fc.sdpSettings?.advancedConfig?.inspectTemplate) ||
          Boolean(fc.sdpSettings?.advancedConfig?.deidentifyTemplate);
        const hasCsam = fc.csamFilterfilterSettings?.filterEnforcement === 'ENABLED';
        if (!hasActiveRai && !hasJailbreak && !hasMaliciousUri && !hasSdp && !hasCsam) {
          filterlessTemplates.push(tplId);
        }
      }
    }

    if (filterlessTemplates.length > 0) {
      findings.push({
        id: 'security-model-armor-no-active-filters',
        category: 'SECURITY_AND_GOVERNANCE',
        severity: 'WARNING',
        title: `Attached Model Armor Template(s) Have All Safety Filters Disabled (${filterlessTemplates.join(', ')})`,
        summary: `Template(s) (${filterlessTemplates.join(', ')}) are attached to the Assistant, but have 0 active RAI, Prompt Injection/Jailbreak, SDP, Malicious URI, or CSAM filters enabled.`,
        currentValue: `0 Active Filters on ${filterlessTemplates.join(', ')}`,
        recommendedValue: 'At least Prompt Injection & Jailbreak + RAI / SDP Filters Enabled',
        impact:
          'Attaching an empty Model Armor template provides no runtime safety screening despite appearing active on the Assistant.',
        remediation:
          'Open the Model Armor page in the sidebar and enable Prompt Injection, RAI, SDP, or Malicious URI filters on the template.',
      });
    }

    if (allCriticalIssues.length > 0) {
      findings.push({
        id: 'security-model-armor-exclusion-streaming-conflict',
        category: 'SECURITY_AND_GOVERNANCE',
        severity: 'CRITICAL',
        title: `Model Armor Exclusion Rule Streaming / Safety Conflict (${templatesWithExclusions.join(', ') || 'Attached Template'})`,
        summary: allCriticalIssues.join(' '),
        currentValue: `Critical Exclusion Rule Issue (${templatesWithExclusions.join(', ')})`,
        recommendedValue:
          'MATCHING_SCOPE_PARTIAL_MATCH (or STREAMING_MODE_BUFFERED) with scoped multi-word phrases/regexes',
        impact:
          'Using MATCHING_SCOPE_FULL_MATCH in default real-time streaming mode (STREAMING_MODE_REALTIME) causes StreamSanitizeUserPrompt / StreamSanitizeModelResponse to fail with 400 INVALID_ARGUMENT. Unconstrained wildcard regexes completely disable safety filtering.',
        remediation:
          'Open the Model Armor page in the sidebar, inspect the template Exclusion Rules, switch FULL_MATCH rules to MATCHING_SCOPE_PARTIAL_MATCH (or configure STREAMING_MODE_BUFFERED), and replace any unconstrained wildcard patterns.',
      });
    }

    if (allWarnings.length > 0) {
      findings.push({
        id: 'security-model-armor-exclusion-warnings',
        category: 'SECURITY_AND_GOVERNANCE',
        severity: 'WARNING',
        title: `Model Armor Exclusion Rule Configuration Warnings (${templatesWithExclusions.join(', ') || 'Attached Template'})`,
        summary: allWarnings.join(' '),
        currentValue: `${allWarnings.length} Exclusion Rule Warning(s) on ${templatesWithExclusions.join(', ')}`,
        recommendedValue:
          'Multi-word contextual PARTIAL_MATCH rules, active target filters, ≤10 rules/ruleSet, and logSanitizeOperations: true',
        impact:
          'Broad single-word PARTIAL_MATCH rules override matchState to NO_MATCH_FOUND across the entire filter (including all 4 RAI categories) whenever that substring appears; missing logSanitizeOperations hides exclusion overrides in Cloud Logging.',
        remediation:
          'Open the Model Armor page in the sidebar to refine single-word exclusions into specific multi-word phrases, remove orphaned ruleSets targeting disabled filters, and enable templateMetadata.logSanitizeOperations.',
      });
    }

    if (
      templatesWithExclusions.length > 0 &&
      allCriticalIssues.length === 0 &&
      allWarnings.length === 0
    ) {
      findings.push({
        id: 'security-model-armor-exclusion-active',
        category: 'SECURITY_AND_GOVERNANCE',
        severity: 'PASS',
        title: `Model Armor Exclusion Rules Active & Real-Time Streaming Compatible (${totalExclusionRulesCount} Rule${totalExclusionRulesCount === 1 ? '' : 's'})`,
        summary: `Attached template(s) (${templatesWithExclusions.join(', ')}) define ${totalExclusionRulesCount} MATCHING_SCOPE_PARTIAL_MATCH exclusion rule(s) with Cloud Logging enabled, supporting both STREAMING_MODE_REALTIME and STREAMING_MODE_BUFFERED.`,
        currentValue: `${totalExclusionRulesCount} PARTIAL_MATCH Rule(s) on ${templatesWithExclusions.join(', ')}`,
        recommendedValue: 'PARTIAL_MATCH + logSanitizeOperations: true',
        impact:
          'Prevents false-positive blocks on benign domain terminology without breaking real-time streaming sanitization.',
        remediation: 'No action required.',
      });
    }
  }

  // Web Grounding Data Residency check
  if (assistant.webGroundingType === 'WEB_GROUNDING_TYPE_GOOGLE_SEARCH') {
    findings.push({
      id: 'security-web-grounding-residency',
      category: 'SECURITY_AND_GOVERNANCE',
      severity: 'WARNING',
      title: 'Non-Data-Residency Web Grounding Selected (Google Search)',
      summary:
        'webGroundingType is set to WEB_GROUNDING_TYPE_GOOGLE_SEARCH instead of WEB_GROUNDING_TYPE_ENTERPRISE_WEB_SEARCH.',
      currentValue: 'WEB_GROUNDING_TYPE_GOOGLE_SEARCH',
      recommendedValue: 'WEB_GROUNDING_TYPE_ENTERPRISE_WEB_SEARCH (or DISABLED)',
      impact:
        'Standard Google Search grounding is not Data Residency (DRZ) compliant for regulated enterprise workloads.',
      remediation:
        'In Overview > Assistant Editor, switch Web Grounding Type to "Enterprise Web Search (Data Residency compliant)".',
      targetTab: 'overview',
    });
  }

  // Public IAM bindings check on Engine
  if (engineIamPolicy?.bindings) {
    const publicMembers: string[] = [];
    engineIamPolicy.bindings.forEach((b) => {
      (b.members || []).forEach((m) => {
        const norm = m.trim().replace(/^user:/i, '').toLowerCase();
        if (norm === 'allusers' || norm === 'allauthenticatedusers') {
          publicMembers.push(`${m} (${b.role})`);
        }
      });
    });
    if (publicMembers.length > 0) {
      findings.push({
        id: 'security-public-iam-principal',
        category: 'SECURITY_AND_GOVERNANCE',
        severity: 'CRITICAL',
        title: 'Public Principal Granted Access on Engine IAM Policy',
        summary: `Engine IAM policy contains overly broad principal(s): ${publicMembers.join(', ')}.`,
        currentValue: publicMembers.join(', '),
        recommendedValue: 'Scoped user:, group:, or Workforce Pool principals only',
        impact:
          'Exposes the Gemini Enterprise Assistant and its connected DataStores to unauthorized users.',
        remediation:
          'Remove allUsers / allAuthenticatedUsers from App-level IAM Permissions in Overview or Connected DataStores.',
        targetTab: 'datastores',
      });
    }
  }

  // DataStore Access Control check when multiple stores connected
  if (connectedDataStoresCount > 1 && dataStoreAccessControlEnabled === false) {
    findings.push({
      id: 'security-datastore-acl-disabled',
      category: 'SECURITY_AND_GOVERNANCE',
      severity: 'INFO',
      title: 'Project-Level DataStore Access Control (ACL) Opt-In Disabled',
      summary: `dataStoreAccessControlEnabled is false while ${connectedDataStoresCount} DataStores are attached.`,
      currentValue: 'dataStoreAccessControlEnabled: false',
      recommendedValue: 'Enable if per-DataStore IAM isolation is required',
      impact:
        'All users with access to this Engine can query all attached DataStores unless per-DataStore ACLs are enabled.',
      remediation:
        'If different user groups require restricted access to specific DataStores, enable Resource Access Control in the Connected DataStores tab.',
      targetTab: 'datastores',
    });
  }

  // ============================================================================
  // SCORE & LATENCY RISK CALCULATION (5-PILLAR WEIGHTED MODEL)
  // ============================================================================
  const pillarBudgets: Record<EvaluationCategory, { maxScore: number; label: string }> = {
    LATENCY_AND_DATASTORES: { maxScore: 25, label: 'Retrieval & Fan-Out' },
    SKILLS_AND_ROUTING: { maxScore: 20, label: 'Skills & Query Routing' },
    ASSISTANT_AND_ENGINE_CONFIG: { maxScore: 25, label: 'Engine & Assistant Config' },
    SECURITY_AND_GOVERNANCE: { maxScore: 15, label: 'Security & Guardrails' },
    BYOMCP_ADVISOR: { maxScore: 15, label: 'BYOMCP Readiness' },
  };

  const computeStandardPillarScore = (category: EvaluationCategory): EvaluationCategoryScore => {
    const budget = pillarBudgets[category];
    const catFindings = findings.filter((f) => f.category === category);
    let criticalDeduction = 0;
    let warningDeduction = 0;
    let infoDeduction = 0;
    let criticalCount = 0;
    let warningCount = 0;
    let passCount = 0;

    catFindings.forEach((f) => {
      if (f.severity === 'CRITICAL') {
        criticalCount += 1;
        // If high DataStore fan-out is already mitigated by >= 2 active routing skills,
        // apply a lighter critical penalty so active skill investment is rewarded.
        if (f.id === 'datastore-critical-fanout-latency' && enabledSkills.length >= 2) {
          criticalDeduction += 10;
        } else {
          criticalDeduction += 14;
        }
      } else if (f.severity === 'WARNING') {
        warningCount += 1;
        warningDeduction += 5;
      } else if (f.severity === 'INFO') {
        infoDeduction += 1;
      } else if (f.severity === 'PASS') {
        passCount += 1;
      }
    });

    // Cap informational deductions at 2 pts per pillar so advisory hygiene never tanks a pillar
    const totalDeduction = criticalDeduction + warningDeduction + Math.min(2, infoDeduction);
    const score = Math.max(0, Math.min(budget.maxScore, budget.maxScore - totalDeduction));

    return {
      category,
      label: budget.label,
      score,
      maxScore: budget.maxScore,
      criticalCount,
      warningCount,
      passCount,
    };
  };

  const computeByomcpPillarScore = (): EvaluationCategoryScore => {
    const budget = pillarBudgets.BYOMCP_ADVISOR;
    const catFindings = findings.filter((f) => f.category === 'BYOMCP_ADVISOR');
    const criticalCount = catFindings.filter((f) => f.severity === 'CRITICAL').length;
    const warningCount = catFindings.filter((f) => f.severity === 'WARNING').length;
    const passCount = catFindings.filter((f) => f.severity === 'PASS').length;

    const attachedConnectors = byomcpEvaluations.filter((b) => b.isAttachedToEngine);
    // Do not penalize an engine's score for unattached BYOMCP connectors belonging to other apps in the project
    if (attachedConnectors.length === 0) {
      return {
        category: 'BYOMCP_ADVISOR',
        label: budget.label,
        score: budget.maxScore,
        maxScore: budget.maxScore,
        criticalCount: 0,
        warningCount: 0,
        passCount,
      };
    }

    const relevantConnectors = attachedConnectors;

    const readinessScores = relevantConnectors.map((mcp) => {
      let ratio = 0;
      // 1. Server description quality (30%)
      if (mcp.currentServerDescription.length >= 30) ratio += 0.3;
      else if (mcp.currentServerDescription.length > 0) ratio += 0.15;

      // 2. Agent instructions quality (30%)
      if (mcp.currentAgentInstructions.length >= 50) ratio += 0.3;
      else if (mcp.currentAgentInstructions.length > 0) ratio += 0.15;

      // 3. Tool discovery & scoping (30%)
      if (mcp.enabledToolsCount >= 1 && mcp.enabledToolsCount <= 15) {
        ratio += mcp.toolsMissingDescription.length === 0 ? 0.3 : 0.2;
      } else if (mcp.enabledToolsCount > 15) {
        ratio += 0.15;
      }

      // 4. Citations / baseline operational readiness (10%)
      if (mcp.citationRulesCount > 0 || mcp.status === 'OPTIMAL') {
        ratio += 0.1;
      } else if (mcp.enabledToolsCount > 0) {
        ratio += 0.05;
      }
      return Math.min(1, ratio);
    });

    const avgRatio =
      readinessScores.reduce((sum, r) => sum + r, 0) / Math.max(1, readinessScores.length);
    const anyToolsEnabled = relevantConnectors.some((m) => m.enabledToolsCount > 0);
    const rawScore = Math.round(avgRatio * budget.maxScore);
    const score = Math.max(anyToolsEnabled ? 3 : 0, Math.min(budget.maxScore, rawScore));

    return {
      category: 'BYOMCP_ADVISOR',
      label: budget.label,
      score,
      maxScore: budget.maxScore,
      criticalCount,
      warningCount,
      passCount,
    };
  };

  const categoryScores: Record<EvaluationCategory, EvaluationCategoryScore> = {
    LATENCY_AND_DATASTORES: computeStandardPillarScore('LATENCY_AND_DATASTORES'),
    SKILLS_AND_ROUTING: computeStandardPillarScore('SKILLS_AND_ROUTING'),
    ASSISTANT_AND_ENGINE_CONFIG: computeStandardPillarScore('ASSISTANT_AND_ENGINE_CONFIG'),
    SECURITY_AND_GOVERNANCE: computeStandardPillarScore('SECURITY_AND_GOVERNANCE'),
    BYOMCP_ADVISOR: computeByomcpPillarScore(),
  };

  const overallScore = Math.max(
    0,
    Math.min(
      100,
      Object.values(categoryScores).reduce((sum, p) => sum + p.score, 0),
    ),
  );

  const grade: AssistantEvaluationReport['grade'] =
    overallScore >= 88
      ? 'A'
      : overallScore >= 76
      ? 'B'
      : overallScore >= 62
      ? 'C'
      : overallScore >= 48
      ? 'D'
      : 'F';

  let latencyRiskLevel: AssistantEvaluationReport['latencyRiskLevel'] = 'LOW';
  const hasCriticalLatency = findings.some(
    (f) =>
      f.severity === 'CRITICAL' &&
      (f.category === 'LATENCY_AND_DATASTORES' ||
        f.id === 'config-fanout-anti-pattern-instruction' ||
        f.id === 'skills-missing-for-datastores'),
  );
  const hasWarnLatency = findings.some(
    (f) =>
      f.severity === 'WARNING' &&
      f.id !== 'datastore-zero-grounding' &&
      (f.category === 'LATENCY_AND_DATASTORES' || f.category === 'SKILLS_AND_ROUTING'),
  );

  if (hasCriticalLatency) {
    latencyRiskLevel = connectedDataStoresCount >= 6 ? 'CRITICAL' : 'HIGH';
  } else if (connectedDataStoresCount >= 6 || hasWarnLatency) {
    latencyRiskLevel = 'MODERATE';
  }

  // Sort findings: CRITICAL first, then WARNING, INFO, PASS
  const severityOrder: Record<EvaluationSeverity, number> = {
    CRITICAL: 0,
    WARNING: 1,
    INFO: 2,
    PASS: 3,
  };
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    evaluatedAt: new Date().toISOString(),
    projectId: config.projectId,
    location: config.appLocation || 'global',
    engineId,
    engineDisplayName: engine.displayName || engineId,
    assistantId,
    assistantDisplayName: assistant.displayName || assistantId,
    overallScore,
    grade,
    latencyRiskLevel,
    categoryScores,
    metrics: {
      connectedDataStoresCount,
      totalProjectDataStoresCount: dataStores.length,
      connectedConnectorsCount: attachedConnectorIds.size,
      byomcpConnectorsCount: byomcpEvaluations.length,
      enabledSkillsCount: enabledSkills.length,
      privateOrDisabledSkillsCount: privateOrDisabledSkills.length,
      skillsMissingDescriptionCount: skillsMissingDescription.length,
      conversationalAgentsCount: conversationalAgents.length,
    },
    findings,
    byomcpEvaluations,
    recommendedSkills,
    probeWarnings,
  };
}

/**
 * Fetches live project/engine context (DataStores, Collections, BYOMCP DataConnectors,
 * Engine IAM Policy, Project ACL Config, and Model Armor Templates) and runs `evaluateAssistantData`.
 */
export async function runLiveAssistantEvaluation(
  engine: AppEngine,
  assistant: Assistant,
  agents: Agent[],
  config: Config,
  onProgress?: (step: string) => void,
): Promise<AssistantEvaluationReport> {
  const probeWarnings: string[] = [];

  onProgress?.('Fetching latest Engine & Assistant configuration...');
  let latestEngine = engine;
  const engineId = engine.name.split('/').pop() || config.appId;
  if (engineId) {
    try {
      const fetched = await api.getEngine(engineId, config);
      if (fetched) {
        latestEngine = { ...engine, ...fetched };
      }
    } catch (err: unknown) {
      probeWarnings.push(`Could not refresh Engine details: ${toErrorMessage(err)}`);
    }
  }

  onProgress?.('Inspecting connected DataStores, Collections & Model Armor Templates...');
  let dataStores: DataStore[] = [];
  let collections: Collection[] = [];
  let modelArmorTemplates: ModelArmorTemplate[] = [];

  const [dsResult, collResult, iamResult, projCfgResult, maResult] = await Promise.allSettled([
    api.listResources('dataStores', config),
    api.listCollections(config),
    engineId ? api.getEngineIamPolicy(engineId, config) : Promise.resolve(null),
    config.projectId && typeof api.getDiscoveryProjectConfig === 'function'
      ? api.getDiscoveryProjectConfig(config.projectId, config.appLocation || 'global')
      : Promise.resolve(null),
    config.projectId && typeof api.fetchModelArmorTemplates === 'function'
      ? api.fetchModelArmorTemplates(config)
      : Promise.resolve(null),
  ]);

  if (dsResult.status === 'fulfilled') {
    dataStores = dsResult.value?.dataStores || [];
  } else {
    probeWarnings.push(`Could not list DataStores: ${toErrorMessage(dsResult.reason)}`);
  }

  if (collResult.status === 'fulfilled') {
    collections = collResult.value?.collections || [];
  } else {
    probeWarnings.push(`Could not list Collections: ${toErrorMessage(collResult.reason)}`);
  }

  if (maResult.status === 'fulfilled' && maResult.value?.templates) {
    modelArmorTemplates = maResult.value.templates;
  } else if (maResult.status === 'rejected') {
    probeWarnings.push(`Could not fetch Model Armor templates: ${toErrorMessage(maResult.reason)}`);
  }

  let engineIamPolicy: IamPolicy | null = null;
  if (iamResult.status === 'fulfilled') {
    engineIamPolicy = iamResult.value;
  } else {
    probeWarnings.push(`Could not inspect Engine IAM policy: ${toErrorMessage(iamResult.reason)}`);
  }

  let dataStoreAccessControlEnabled: boolean | null = null;
  if (projCfgResult.status === 'fulfilled' && projCfgResult.value) {
    const raw = projCfgResult.value as Record<string, any>;
    const camel =
      raw?.customerProvidedConfig?.resourceAccessControlConfig
        ?.dataStoreAccessControlEnabled;
    const snake =
      raw?.customer_provided_config?.resource_access_control_config
        ?.data_store_access_control_enabled;
    if (typeof (camel ?? snake) === 'boolean') {
      dataStoreAccessControlEnabled = Boolean(camel ?? snake);
    }
  } else if (projCfgResult.status === 'rejected') {
    probeWarnings.push(
      `Could not inspect Project ACL configuration: ${toErrorMessage(projCfgResult.reason)}`,
    );
  }

  // Identify collections to inspect for DataConnectors (prioritize attached collections + any MCP-named collections)
  const attachedIds = new Set<string>(latestEngine.dataStoreIds || []);
  const candidateCollections = collections.filter((c) => {
    const cid = c.name.split('/').pop() || '';
    if (!cid || cid === 'default_collection') return false;
    const isAttached =
      attachedIds.has(cid) ||
      Array.from(attachedIds).some((dsId) => dsId.startsWith(`${cid}_`));
    const looksLikeMcp = /\b(mcp|byomcp|custom_mcp|onemcp)\b/i.test(
      `${cid} ${c.displayName || ''}`,
    );
    return isAttached || looksLikeMcp || collections.length <= 20;
  });

  const connectorsByCollectionId: Record<string, DataConnector> = {};
  if (candidateCollections.length > 0) {
    onProgress?.(
      `Inspecting ${candidateCollections.length} DataConnector(s) & BYOMCP server(s)...`,
    );
    const connectorPromises = candidateCollections.map(async (c) => {
      const cid = c.name.split('/').pop()!;
      const conn = await api.getDataConnector({
        ...config,
        collectionId: cid,
        suppressErrorLog: true,
      });
      return { cid, conn };
    });

    const settledConnectors = await Promise.allSettled(connectorPromises);
    settledConnectors.forEach((res) => {
      if (res.status === 'fulfilled' && res.value.conn) {
        connectorsByCollectionId[res.value.cid] = res.value.conn;
      }
    });
  }

  onProgress?.('Running best-practices & latency evaluation rules...');
  return evaluateAssistantData({
    engine: latestEngine,
    assistant,
    agents,
    config,
    dataStores,
    collections,
    connectorsByCollectionId,
    engineIamPolicy,
    dataStoreAccessControlEnabled,
    modelArmorTemplates,
    probeWarnings,
  });
}

export function generateAssistantEvaluationMarkdown(
  report: AssistantEvaluationReport,
): string {
  const lines: string[] = [];
  lines.push(`# Gemini Enterprise Assistant Evaluation Report`);
  lines.push(``);
  lines.push(`- **Engine**: ${report.engineDisplayName} (\`${report.engineId}\`)`);
  lines.push(`- **Assistant**: ${report.assistantDisplayName} (\`${report.assistantId}\`)`);
  lines.push(`- **Project / Location**: \`${report.projectId}\` / \`${report.location}\``);
  lines.push(`- **Evaluated At**: ${report.evaluatedAt}`);
  lines.push(`- **Overall Health Score**: **${report.overallScore}/100 (Grade ${report.grade})**`);
  lines.push(`- **Latency & Fan-Out Risk**: **${report.latencyRiskLevel}**`);
  lines.push(``);
  if (report.probeWarnings && report.probeWarnings.length > 0) {
    lines.push(`## Probe Warnings`);
    report.probeWarnings.forEach((w) => {
      lines.push(`- ${w}`);
    });
    lines.push(``);
  }
  if (report.categoryScores) {
    lines.push(`## Weighted Pillar Score Breakdown`);
    lines.push(`| Pillar | Score | Max |`);
    lines.push(`| :--- | :--- | :--- |`);
    Object.values(report.categoryScores).forEach((p) => {
      lines.push(`| ${p.label} | ${p.score} | ${p.maxScore} |`);
    });
    lines.push(``);
  }
  lines.push(`## Environment Metrics`);
  lines.push(`| Metric | Count |`);
  lines.push(`| :--- | :--- |`);
  lines.push(`| Connected DataStores | ${report.metrics.connectedDataStoresCount} |`);
  lines.push(`| Connected Connectors | ${report.metrics.connectedConnectorsCount} |`);
  lines.push(`| BYOMCP Connectors Evaluated | ${report.metrics.byomcpConnectorsCount} |`);
  lines.push(`| Enabled Organizational Skills | ${report.metrics.enabledSkillsCount} |`);
  lines.push(`| Private / Disabled Skills | ${report.metrics.privateOrDisabledSkillsCount} |`);
  lines.push(`| Conversational / Sub-Agents | ${report.metrics.conversationalAgentsCount} |`);
  lines.push(``);

  const actionableFindings = report.findings.filter((f) => f.severity !== 'PASS');
  lines.push(`## Diagnostic Findings (${actionableFindings.length})`);
  lines.push(``);
  if (actionableFindings.length === 0) {
    lines.push(`No critical, warning, or informational issues detected.`);
    lines.push(``);
  } else {
    actionableFindings.forEach((f) => {
      lines.push(`### [${f.severity}] ${f.title}`);
      lines.push(`- **Category**: \`${f.category}\``);
      lines.push(`- **Current State**: ${f.currentValue}`);
      lines.push(`- **Best Practice**: ${f.recommendedValue}`);
      lines.push(`- **Summary**: ${f.summary}`);
      lines.push(`- **Customer Impact**: ${f.impact}`);
      lines.push(`- **Remediation**: ${f.remediation}`);
      lines.push(``);
    });
  }

  const actionableByomcp = report.byomcpEvaluations.filter((m) => m.status === 'NEEDS_ATTENTION');
  if (actionableByomcp.length > 0) {
    lines.push(`## BYOMCP Connector Descriptions & Instructions Advisor`);
    lines.push(``);
    actionableByomcp.forEach((mcp) => {
      lines.push(`### ${mcp.displayName} (\`${mcp.collectionId}\`) — ${mcp.useCaseLabel}`);
      lines.push(`- **Status**: ${mcp.status}`);
      lines.push(`- **Discovered Tools**: ${mcp.enabledToolsCount}/${mcp.totalToolsCount} enabled`);
      lines.push(`- **Citation Rules**: ${mcp.citationRulesCount}`);
      lines.push(``);
      lines.push(`#### Recommended \`mcp_server_description\``);
      lines.push('```text');
      lines.push(mcp.recommendedServerDescription);
      lines.push('```');
      lines.push(``);
      lines.push(`#### Recommended \`mcp_agent_instructions\``);
      lines.push('```text');
      lines.push(mcp.recommendedAgentInstructions);
      lines.push('```');
      lines.push(``);
    });
  }

  if (report.recommendedSkills.length > 0) {
    lines.push(`## Recommended Query-Optimization & Routing Skills`);
    lines.push(``);
    report.recommendedSkills.forEach((skill) => {
      lines.push(`### ${skill.displayName} (\`${skill.skillIdSuggestion}\`)`);
      lines.push(`- **Description**: ${skill.description}`);
      lines.push(`- **Rationale**: ${skill.rationale}`);
      lines.push(``);
      lines.push('```markdown');
      lines.push(skill.instruction);
      lines.push('```');
      lines.push(``);
    });
  }

  return lines.join('\n');
}
