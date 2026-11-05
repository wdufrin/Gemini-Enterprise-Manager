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
  sanitizeSkillDescription,
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
  sampleQueries?: string[];
  alreadyDeployedAgentName?: string;
}

export interface SkillBenchmarkQueryRun {
  query: string;
  totalLatencyMs: number;
  ttfbMs: number;
  answerPreview: string;
  thoughtSteps: string[];
  citationsCount: number;
  routedSources: string[];
  skillTriggered: boolean;
  skippedReason?: string;
  errorMessage?: string;
}

export type SkillDiagnosticMistakeCode =
  | 'TRIGGER_VOCABULARY_MISMATCH'
  | 'BROAD_FANOUT_INSTRUCTION'
  | 'MISSING_TARGET_SOURCE_IDENTIFIER'
  | 'LATENCY_REGRESSION_MULTI_HOP'
  | 'NO_GROUNDED_ANSWER'
  | 'THIN_OR_VAGUE_INSTRUCTION'
  | 'SKILL_INSTRUCTION_CONFLICT'
  | 'BEHAVIORAL_GROUNDING_CONFLICT';

export interface SkillDiagnosticMistake {
  code: SkillDiagnosticMistakeCode;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  explanation: string;
  suggestedFix: string;
  recommendedDescriptionPatch?: string;
  recommendedInstructionAppend?: string;
}

export interface SkillPerformanceBenchmarkPhase {
  ranAt: string;
  runs: SkillBenchmarkQueryRun[];
  avgLatencyMs: number;
  avgTtfbMs: number;
  skillTriggerRate: number;
}

export interface SkillPerformanceComparisonReport {
  skillId: string;
  baseline?: SkillPerformanceBenchmarkPhase;
  postSkill?: SkillPerformanceBenchmarkPhase;
  latencyDeltaMs?: number;
  latencyDeltaPercent?: number;
  ttfbDeltaMs?: number;
  improved: boolean;
  verdictSummary: string;
  mistakes: SkillDiagnosticMistake[];
}

export type ByomcpUseCaseArchetype =
  | 'DATABASE_SQL'
  | 'ISSUE_TRACKER_ITSM'
  | 'CRM_ERP_FINANCE'
  | 'DEVOPS_INFRA'
  | 'KNOWLEDGE_SEARCH'
  | 'GENERAL_MCP';

export interface ByomcpParameterDetail {
  name: string;
  type: string;
  required: boolean;
  description: string;
  enumValues?: string[];
  format?: string;
}

export interface ByomcpToolSummary {
  name: string;
  displayName: string;
  description: string;
  enabled: boolean;
  parameterNames: string[];
  requiredParams: string[];
  parameterDetails?: ByomcpParameterDetail[];
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
  connectedDataStoreResourceNames?: string[];
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
  /\b(search\s+(?:across\s+)?all\s+(?:data\s*stores|sources|tools|connectors)|always\s+query\s+(?:across\s+)?(?:all|every)|check\s+every\s+(?:data\s*store|source|connector))\b/i;

export function extractSchemaParams(inputSchema?: Record<string, unknown>): {
  parameterNames: string[];
  requiredParams: string[];
  parameterDetails: ByomcpParameterDetail[];
} {
  if (!inputSchema || typeof inputSchema !== 'object') {
    return { parameterNames: [], requiredParams: [], parameterDetails: [] };
  }
  const props =
    inputSchema.properties && typeof inputSchema.properties === 'object'
      ? (inputSchema.properties as Record<string, unknown>)
      : {};
  const parameterNames = Object.keys(props);
  const req = inputSchema.required;
  const requiredParams = Array.isArray(req)
    ? req.filter((r): r is string => typeof r === 'string')
    : [];
  const requiredSet = new Set(requiredParams);

  const parameterDetails: ByomcpParameterDetail[] = parameterNames.map((paramName) => {
    const rawProp =
      props[paramName] && typeof props[paramName] === 'object'
        ? (props[paramName] as Record<string, unknown>)
        : {};
    const rawType = rawProp.type;
    const typeStr =
      typeof rawType === 'string'
        ? rawType
        : Array.isArray(rawType)
        ? rawType.map(String).join('|')
        : 'string';
    const description =
      typeof rawProp.description === 'string' ? rawProp.description.trim() : '';
    const enumValues = Array.isArray(rawProp.enum)
      ? rawProp.enum.map((v) => String(v)).slice(0, 8)
      : undefined;
    const format = typeof rawProp.format === 'string' ? rawProp.format.trim() : undefined;

    return {
      name: paramName,
      type: typeStr,
      required: requiredSet.has(paramName),
      description,
      ...(enumValues && enumValues.length > 0 ? { enumValues } : {}),
      ...(format ? { format } : {}),
    };
  });

  return { parameterNames, requiredParams, parameterDetails };
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

const CUSTOM_DOMAIN_STOP_WORDS = new Set([
  'mcp',
  'byomcp',
  'onemcp',
  'custom',
  'server',
  'connector',
  'collection',
  'tool',
  'tools',
  'api',
  'service',
  'get',
  'list',
  'search',
  'find',
  'fetch',
  'read',
  'query',
  'create',
  'update',
  'delete',
  'remove',
  'run',
  'execute',
  'call',
  'with',
  'from',
  'that',
  'this',
  'for',
  'the',
  'and',
  'or',
  'by',
  'in',
  'to',
  'of',
  'on',
  'id',
  'ids',
  'name',
  'type',
  'value',
  'data',
  'item',
  'items',
  'record',
  'records',
  'result',
  'results',
  'limit',
  'offset',
  'page',
  'filter',
  'status',
  'prod',
  'dev',
  'staging',
  'internal',
  'corp',
  'enterprise',
  'http',
  'https',
  'sse',
]);

/**
 * Extracts domain-specific nouns and capability phrases from a custom MCP server's
 * displayName, tool names, tool descriptions, and parameter schemas so even bespoke
 * internal MCP servers get domain-accurate labels and trigger descriptions.
 */
export function inferCustomDomainSummary(
  displayName: string,
  tools: ByomcpToolSummary[],
): { customLabel: string; domainConcepts: string[]; capabilitySummary: string } {
  const tokenFreq = new Map<string, number>();
  const addTokens = (text: string, weight: number) => {
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9_ -]/g, ' ')
      .split(/[\s_-]+/)
      .filter((w) => w.length >= 3 && !CUSTOM_DOMAIN_STOP_WORDS.has(w) && !/^\d+$/.test(w));
    for (const w of words) {
      tokenFreq.set(w, (tokenFreq.get(w) || 0) + weight);
    }
  };

  addTokens(displayName, 3);
  tools.forEach((t) => {
    addTokens(t.name, 3);
    addTokens(t.displayName, 2);
    addTokens(t.description, 1);
    t.parameterNames.forEach((p) => addTokens(p, 1));
  });

  const sortedConcepts = Array.from(tokenFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .slice(0, 4);

  const capitalize = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
  const customLabel =
    sortedConcepts.length >= 2
      ? `${sortedConcepts.slice(0, 3).map(capitalize).join(', ')} & Domain Operations`
      : sortedConcepts.length === 1
      ? `${capitalize(sortedConcepts[0])} Domain Operations`
      : 'Custom Enterprise MCP Tool Server';

  const toolDescriptions = tools
    .filter((t) => t.enabled && t.description.trim().length > 5)
    .slice(0, 3)
    .map((t) => {
      const firstLineOrSentence =
        t.description
          .trim()
          .split(/\r?\n/)[0]
          .split(/(?<=\.)\s+/)[0] || t.description.trim();
      return sanitizeSkillDescription(firstLineOrSentence, 160).replace(/\.$/, '');
    });

  const capabilitySummary =
    toolDescriptions.length > 0
      ? sanitizeSkillDescription(toolDescriptions.join('; '), 420)
      : sortedConcepts.length > 0
      ? `querying and managing ${sortedConcepts.join(', ')} workflows`
      : 'executing live domain lookups and tool actions';

  return {
    customLabel,
    domainConcepts: sortedConcepts,
    capabilitySummary,
  };
}

export function inferByomcpArchetype(
  displayName: string,
  instanceUri: string,
  tools: ByomcpToolSummary[],
): { archetype: ByomcpUseCaseArchetype; label: string } {
  const primarySignal = [
    displayName,
    instanceUri,
    ...tools.map((t) => `${t.name} ${t.displayName} ${t.description}`),
  ]
    .join(' ')
    .toLowerCase();

  const paramSignal = tools
    .flatMap((t) => [
      ...t.parameterNames,
      ...(t.parameterDetails?.map((p) => p.description) || []),
    ])
    .join(' ')
    .toLowerCase();

  const fullSignal = `${primarySignal} ${paramSignal}`;

  const scoreMatches = (text: string, patterns: RegExp[], weight: number): number => {
    let score = 0;
    for (const pat of patterns) {
      if (pat.test(text)) score += weight;
    }
    return score;
  };

  const scores: Record<Exclude<ByomcpUseCaseArchetype, 'GENERAL_MCP'>, number> = {
    DATABASE_SQL:
      scoreMatches(
        primarySignal,
        [
          /\b(bigquery|postgres|postgresql|oracle|spanner|alloydb|snowflake|databricks|mysql|cloudsql|sql_query|execute_sql|execute_query|run_query)\b/,
        ],
        4,
      ) +
      scoreMatches(primarySignal, [/\b(sql|database|dataset|warehouse)\b/], 2) +
      scoreMatches(fullSignal, [/\b(table|schema|select)\b/], 1),

    ISSUE_TRACKER_ITSM:
      scoreMatches(
        primarySignal,
        [/\b(jira|servicenow|pagerduty|zendesk|linear|jql|itsm|buganizer)\b/],
        4,
      ) +
      scoreMatches(
        fullSignal,
        [/\b(incident|ticket|bug|issue|epic|sprint|backlog|assignee|issue_key)\b/],
        2,
      ),

    CRM_ERP_FINANCE:
      scoreMatches(
        primarySignal,
        [/\b(salesforce|sfdc|sap|erp|workday|netsuite|hubspot|crm)\b/],
        4,
      ) +
      scoreMatches(
        fullSignal,
        [/\b(opportunity|account|lead|invoice|order|pipeline|customer|revenue|quote)\b/],
        2,
      ),

    DEVOPS_INFRA:
      scoreMatches(
        primarySignal,
        [/\b(github|gitlab|kubernetes|k8s|pull_request|merge_request|cloud_run|ci_cd|jenkins|argocd)\b/],
        4,
      ) +
      scoreMatches(
        fullSignal,
        [/\b(commit|deploy|deployment|gce|logs|trace|monitoring|pipeline|repository|cluster)\b/],
        2,
      ),

    KNOWLEDGE_SEARCH:
      scoreMatches(
        primarySignal,
        [/\b(confluence|sharepoint|notion|wiki|gdrive|google_drive|handbook|slack)\b/],
        4,
      ) +
      scoreMatches(
        primarySignal,
        [/\b(document|article|knowledge|policy|manual|runbook)\b/],
        2,
      ),
  };

  const archetypeLabels: Record<Exclude<ByomcpUseCaseArchetype, 'GENERAL_MCP'>, string> = {
    DATABASE_SQL: 'Database, SQL & Structured Analytics',
    ISSUE_TRACKER_ITSM: 'Issue Tracking, Agile & ITSM Operations',
    CRM_ERP_FINANCE: 'CRM, ERP & Enterprise Business Records',
    DEVOPS_INFRA: 'DevOps, Code Repository & Cloud Infrastructure',
    KNOWLEDGE_SEARCH: 'Enterprise Knowledge Base & Document Retrieval',
  };

  const orderedArchetypes: Array<Exclude<ByomcpUseCaseArchetype, 'GENERAL_MCP'>> = [
    'DATABASE_SQL',
    'ISSUE_TRACKER_ITSM',
    'CRM_ERP_FINANCE',
    'DEVOPS_INFRA',
    'KNOWLEDGE_SEARCH',
  ];

  let bestArchetype: Exclude<ByomcpUseCaseArchetype, 'GENERAL_MCP'> | null = null;
  let bestScore = 0;

  for (const arch of orderedArchetypes) {
    if (scores[arch] > bestScore) {
      bestScore = scores[arch];
      bestArchetype = arch;
    }
  }

  if (bestArchetype && bestScore >= 2) {
    return {
      archetype: bestArchetype,
      label: archetypeLabels[bestArchetype],
    };
  }

  const customSummary = inferCustomDomainSummary(displayName, tools);
  return {
    archetype: 'GENERAL_MCP',
    label: customSummary.customLabel,
  };
}

function formatRichParameterSignature(tool: ByomcpToolSummary): string {
  if (tool.parameterDetails && tool.parameterDetails.length > 0) {
    const parts = tool.parameterDetails.map((p) => {
      const reqMarker = p.required ? '*' : '';
      const enumInfo =
        p.enumValues && p.enumValues.length > 0
          ? `=${p.enumValues.slice(0, 5).join('|')}`
          : '';
      const formatInfo = p.format ? ` (${p.format})` : '';
      const descSnippet = p.description
        ? ` — ${p.description.slice(0, 70)}${p.description.length > 70 ? '...' : ''}`
        : '';
      return `${p.name}${reqMarker}: ${p.type}${enumInfo}${formatInfo}${descSnippet}`;
    });
    const reqList =
      tool.requiredParams.length > 0
        ? `; required: ${tool.requiredParams.join(', ')}`
        : '';
    return ` (parameters: ${parts.join('; ')}${reqList})`;
  }

  if (tool.parameterNames.length > 0) {
    return ` (parameters: ${tool.parameterNames.join(', ')}${
      tool.requiredParams.length > 0
        ? `; required: ${tool.requiredParams.join(', ')}`
        : ''
    })`;
  }
  return '';
}

function buildToolWorkflowChainingGuidance(activeTools: ByomcpToolSummary[]): string {
  if (activeTools.length === 0) return '';

  const discoveryTools = activeTools.filter((t) =>
    /^(list|search|query|find|filter|browse)_|\b(list|search|query|find)\b/i.test(t.name),
  );
  const detailTools = activeTools.filter(
    (t) =>
      !discoveryTools.includes(t) &&
      (/^(get|read|describe|fetch|inspect)_|\b(get|detail|inspect)\b/i.test(t.name) ||
        t.requiredParams.some((p) => /(?:^|_)(id|key|uuid|slug|uri)$/i.test(p))),
  );
  const mutationTools = activeTools.filter((t) =>
    /^(create|update|delete|remove|assign|close|transition|post|send|trigger|approve|reject|patch|insert|drop|truncate)_|\b(create|update|delete|mutate|write)\b/i.test(
      t.name,
    ),
  );

  const workflowLines: string[] = [];
  if (discoveryTools.length > 0 && detailTools.length > 0) {
    workflowLines.push(
      `- **Step 1 (Discovery & ID Resolution)**: When the user provides a name, keyword, or filter criteria rather than an exact identifier, call ${discoveryTools
        .slice(0, 4)
        .map((t) => `\`${t.name}\``)
        .join(' or ')} first to resolve the exact record ID/key.`,
    );
    workflowLines.push(
      `- **Step 2 (Targeted Detail Retrieval)**: Pass the resolved identifier into ${detailTools
        .slice(0, 4)
        .map((t) => `\`${t.name}\``)
        .join(' or ')} to fetch full record details.`,
    );
  } else if (discoveryTools.length > 0) {
    workflowLines.push(
      `- **Scoped Discovery**: Use ${discoveryTools
        .slice(0, 4)
        .map((t) => `\`${t.name}\``)
        .join(', ')} with narrow filter arguments rather than broad unfiltered queries.`,
    );
  }

  if (mutationTools.length > 0) {
    workflowLines.push(
      `- **Write / Mutation Guardrails**: Tools ${mutationTools
        .slice(0, 4)
        .map((t) => `\`${t.name}\``)
        .join(', ')} modify live state. Verify all required parameters and confirm intent with the user before executing.`,
    );
  }

  return workflowLines.join('\n');
}

export function generateByomcpGuidance(
  displayName: string,
  collectionId: string,
  instanceUri: string,
  tools: ByomcpToolSummary[],
  alignmentContext?: {
    assistantSystemInstruction?: string;
    connectorReadOnly?: boolean;
  },
): {
  archetype: ByomcpUseCaseArchetype;
  useCaseLabel: string;
  recommendedServerDescription: string;
  recommendedAgentInstructions: string;
  recommendedCompanionSkill: RecommendedSkillTemplate;
} {
  const enabledTools = tools.filter((t) => t.enabled);
  const activeTools = enabledTools;
  const { archetype, label: useCaseLabel } = inferByomcpArchetype(
    displayName,
    instanceUri,
    activeTools.length > 0 ? activeTools : tools,
  );
  const cleanName = String(displayName || collectionId || 'Custom MCP');
  const customDomain = inferCustomDomainSummary(cleanName, activeTools);

  const toolNamesPreview =
    activeTools.length > 0
      ? activeTools
          .slice(0, 5)
          .map((t) => t.name)
          .join(', ')
      : 'enabled MCP tools';

  const toolBullets =
    activeTools.length > 0
      ? activeTools
          .map((t) => {
            const paramsInfo = formatRichParameterSignature(t);
            const descInfo = t.description
              ? `: ${t.description}`
              : ' — execute targeted domain lookups with narrow filter parameters.';
            return `- \`${t.name}\`${paramsInfo}${descInfo}`;
          })
          .join('\n')
      : `- Enable the required read/search tools on \`${collectionId}\` in BYOMCP Settings before routing live tool calls here, and invoke only the specific enabled tool matching the user's intent.`;

  const workflowChainingSection = buildToolWorkflowChainingGuidance(activeTools);
  const readOnlyNote = alignmentContext?.connectorReadOnly
    ? '\n- **Read-Only Connector Enforcement**: This connector is configured for read-only operations. Never invoke write, create, update, or delete mutations.'
    : '';

  let recommendedServerDescription = '';
  let archetypeRules = '';

  switch (archetype) {
    case 'DATABASE_SQL':
      recommendedServerDescription = `${cleanName} (${useCaseLabel}): Authoritative MCP server for inspecting schemas, table metadata, and executing scoped analytical/SQL queries via ${toolNamesPreview}. Route structured data, metrics, and record lookup questions here.`;
      archetypeRules = `1. SCHEMA-FIRST VERIFICATION: Always inspect table/dataset schemas or metadata before constructing a query. Never guess column names.
2. SCOPED QUERIES & LIMITS: Always apply explicit WHERE filters (date ranges, IDs, status) and enforce a maximum row limit (e.g., LIMIT 50) to prevent high-latency full-table scans.
3. READ-ONLY SAFETY: Never execute destructive DDL/DML statements (DROP, DELETE, TRUNCATE, UPDATE) unless the user explicitly requests a mutation and confirms the target records.
4. OUTPUT FORMATTING: Present multi-row query results in a clear, aligned tabular or structured list format (always respecting the Assistant's global formatting instructions if plain text or JSON is requested), followed by a concise analytical summary of key metrics.`;
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

    default: {
      const domainHint =
        customDomain.domainConcepts.length > 0
          ? ` covering ${customDomain.domainConcepts.join(', ')}`
          : '';
      recommendedServerDescription = `${cleanName} (${useCaseLabel}): Authoritative custom MCP server${domainHint} providing ${
        activeTools.length || 'domain'
      } tool(s) (${toolNamesPreview}) for ${customDomain.capabilitySummary}. Route questions or actions involving ${cleanName} here.`;
      archetypeRules = `1. SCHEMA-GROUNDED PARAMETER SELECTION: Populate all required parameters (${
        activeTools
          .flatMap((t) => t.requiredParams)
          .filter((v, i, a) => a.indexOf(v) === i)
          .slice(0, 6)
          .join(', ') || 'per tool inputSchema'
      }) and strictly respect allowed enum values before invoking ${toolNamesPreview}.
2. TARGETED TOOL INVOCATION: Select the single most specific enabled tool for the user's intent rather than calling multiple overlapping tools in parallel.
3. GROUNDED OUTPUT & CITATIONS: Attribute all returned data to ${cleanName} and render structured fields or source links clearly.`;
      break;
    }
  }

  const recommendedAgentInstructions = `ROLE & ROUTING GUIDELINES FOR ${cleanName.toUpperCase()} (${collectionId}):
Use this MCP server when the user asks about ${useCaseLabel.toLowerCase()} handled by ${cleanName}.

AVAILABLE ENABLED TOOLS & INVOCATION CONTRACTS:
${toolBullets}${
    workflowChainingSection ? `\n\nTOOL EXECUTION & CHAINING ORDER:\n${workflowChainingSection}` : ''
  }

OPERATIONAL & FORMATTING BEST PRACTICES:
${archetypeRules}
- CORE INSTRUCTION HARMONY: Always operate within the Assistant's global System and Style Instructions—preserving global persona, output formatting preferences, and safety guardrails.${readOnlyNote}`;

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

  // Build an intent-rich trigger description so the Gemini Enterprise Assistant planner
  // knows the exact domain concepts and tool capabilities that should trigger this Skill.
  const triggerDescription = sanitizeSkillDescription(
    `Routes ${useCaseLabel} queries, records, and metadata lookups to ${cleanName} (${collectionId}). Trigger when the user asks about ${
      customDomain.domainConcepts.length > 0
        ? `${customDomain.domainConcepts.join(', ')}, `
        : ''
    }${customDomain.capabilitySummary}, or high-priority updates via MCP tools (${toolNamesPreview}).`,
    900,
  );

  const primaryToolName = activeTools[0]?.name;
  const secondaryToolName = activeTools[1]?.name;
  const primaryConcept = customDomain.domainConcepts[0] || useCaseLabel.toLowerCase();
  const byomcpSampleQueries = [
    primaryToolName
      ? `Use ${cleanName} to search or list recent ${primaryConcept} records via ${primaryToolName}.`
      : `Search ${cleanName} for the latest ${primaryConcept} records and summarize their status.`,
    secondaryToolName
      ? `Look up detailed status and metadata in ${cleanName} using ${secondaryToolName}.`
      : `What are the active items or high-priority updates in ${cleanName}?`,
  ];

  const recommendedCompanionSkill: RecommendedSkillTemplate = {
    id: `skill-byomcp-${collectionId}`,
    skillIdSuggestion: `mcp-router-${safeSlug || 'custom'}`,
    displayName: companionDisplayName,
    description: triggerDescription,
    instruction: `# ${cleanName} — MCP Routing, Tool Chaining & Parameter Skill\n\n## When to Activate This Skill (Routing Triggers)\nActivate this skill whenever a user request involves **${useCaseLabel}**${
      customDomain.domainConcepts.length > 0
        ? ` (specifically **${customDomain.domainConcepts.join(', ')}**)`
        : ''
    } or requires live lookups/actions from **${cleanName}** (\`${collectionId}\`: ${customDomain.capabilitySummary}).\n- **Intent-First Source Selection**: Route each user query to the single most authoritative DataStore or MCP tool first (\`${collectionId}\` for ${useCaseLabel.toLowerCase()}). Do NOT fan out across all connected DataStores simultaneously unless the user explicitly asks for a cross-system comparison.\n- **Multi-Source Synthesis When Needed**: When a user question spans both live records in \`${cleanName}\` (\`${collectionId}\`) and reference documentation in another connected DataStore, query \`${collectionId}\` for the live record state and combine it with the relevant policy DataStore.${readOnlyNote}\n${
      workflowChainingSection
        ? `\n## Multi-Step Tool Chaining Workflow\n${workflowChainingSection}\n`
        : ''
    }\n## Enabled Tool Selection & JSON-Schema Parameter Contracts\n${toolBullets}\n\n## Latency, Quality & Core Instruction Harmony Rules\n${archetypeRules}\n- **Global Instruction Harmony**: Always respect the Assistant's global System and Style Instructions for persona, tone, output formatting, and organizational guardrails.`,
    rationale: `Provides the Gemini Enterprise Assistant planner with domain-specific routing triggers, multi-step tool chaining rules, and JSON-Schema parameter contracts for the "${cleanName}" BYOMCP server.`,
    targetSources: [collectionId],
    sampleQueries: byomcpSampleQueries,
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
  assistantSystemInstruction?: string,
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
      const { parameterNames, requiredParams, parameterDetails } = extractSchemaParams(
        t.inputSchema as Record<string, unknown> | undefined,
      );
      tools.push({
        name: t.name,
        displayName: t.displayName || t.name,
        description: (t.description || '').trim(),
        enabled: isEnabled,
        parameterNames,
        requiredParams,
        parameterDetails,
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
        parameterDetails: [],
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

  const connectorReadOnly =
    /\b(read-only|read\s+only\s+mode|never\s+(?:execute|run|call)\s+(?:write|mutation|create|update|delete|drop))\b/i.test(
      currentAgentInstructions,
    );

  const guidance = generateByomcpGuidance(
    displayName,
    collectionId,
    instanceUri,
    tools,
    {
      assistantSystemInstruction,
      connectorReadOnly,
    },
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
  } else if (SYSTEM_OVERRIDE_ANTIPATTERN_REGEX.test(currentServerDescription)) {
    issues.push(
      'Conflicting mcp_server_description: Contains system-prompt override phrasing ("ignore previous/system instructions"), which conflicts with core Assistant instructions.',
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
  } else {
    if (SYSTEM_OVERRIDE_ANTIPATTERN_REGEX.test(currentAgentInstructions)) {
      issues.push(
        'Conflicting mcp_agent_instructions: Contains system-prompt override phrasing ("ignore previous/system instructions"), which conflicts with core Assistant instructions and can trigger Model Armor blocks.',
      );
    }
    if (FANOUT_ANTI_PATTERN_REGEX.test(currentAgentInstructions)) {
      issues.push(
        'Conflicting mcp_agent_instructions: Contains an exhaustive fan-out directive ("search/call all tools/sources"), which increases latency.',
      );
    }
    const instLower = currentAgentInstructions.toLowerCase();
    const disabledToolsInMcpInst = tools
      .filter((t) => !t.enabled && t.name.length >= 4 && instLower.includes(t.name.toLowerCase()))
      .map((t) => t.name);
    if (disabledToolsInMcpInst.length > 0) {
      issues.push(
        `Conflicting mcp_agent_instructions: Explicitly references tool(s) (${disabledToolsInMcpInst.slice(0, 3).join(', ')}) that are currently disabled on this connector.`,
      );
    }
    if (
      assistantSystemInstruction &&
      /\b(never\s+use\s+(?:markdown\s+)?tables?|do\s+not\s+(?:use|output|render)\s+(?:markdown\s+)?tables?|plain\s+text\s+only|json\s+only)\b/i.test(
        assistantSystemInstruction,
      ) &&
      /\b(markdown\s+tables?)\b/i.test(currentAgentInstructions)
    ) {
      issues.push(
        'Conflicting mcp_agent_instructions: Mandates Markdown tables while the Assistant’s global System Instructions forbid tables or require plain-text/JSON output.',
      );
    }
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

export interface ThirdPartyConnectorEvaluation {
  collectionId: string;
  connectorName: string;
  displayName: string;
  connectorType: string;
  useCaseLabel: string;
  isAttachedToEngine: boolean;
  state: string;
  entityStoreIds: string[];
  entityNames: string[];
  enabledActions: string[];
  hasCoveringSkill: boolean;
  recommendedSkill: RecommendedSkillTemplate;
}

const SYSTEM_OVERRIDE_ANTIPATTERN_REGEX =
  /\b(ignore\s+(?:all\s+)?(?:previous|prior|system|above)\s+instructions|disregard\s+(?:all\s+)?(?:system|previous|prior)\s+(?:instructions|prompts?|rules)|override\s+(?:safety|guardrails|model\s+armor|system\s+prompt)|forget\s+all\s+(?:prior|previous)\s+rules)\b/i;

export function evaluateThirdPartyConnectorForSkill(
  collectionId: string,
  connector: DataConnector,
  isAttachedToEngine: boolean,
  attachedEntityStoreIds: string[],
  collectionDisplayName?: string,
): ThirdPartyConnectorEvaluation {
  const params = connector.params || {};
  const rawType = String(
    connector.dataSource || connector.connectorType || collectionId || 'THIRD_PARTY',
  );
  const displayName =
    collectionDisplayName ||
    (typeof params.display_name === 'string' ? params.display_name : '') ||
    collectionId;

  const entityNames: string[] = [];
  const entityStoreIdsSet = new Set<string>(attachedEntityStoreIds);
  if (Array.isArray(connector.entities)) {
    connector.entities.forEach((ent: Record<string, unknown>) => {
      if (typeof ent.entityName === 'string' && ent.entityName.trim()) {
        entityNames.push(ent.entityName.trim());
      }
      if (typeof ent.dataStore === 'string' && ent.dataStore.trim()) {
        const dsShort = ent.dataStore.split('/').pop() || ent.dataStore;
        if (dsShort) entityStoreIdsSet.add(dsShort);
      }
    });
  }
  if (entityStoreIdsSet.size === 0) {
    entityStoreIdsSet.add(collectionId);
  }
  const entityStoreIds = Array.from(entityStoreIdsSet);

  const bap = (connector.bapConfig || {}) as {
    enabledActions?: unknown;
    supportedActions?: unknown;
  };
  const enabledActions = Array.from(
    new Set([
      ...(Array.isArray(bap.enabledActions)
        ? bap.enabledActions.filter((a): a is string => typeof a === 'string')
        : []),
      ...(Array.isArray(bap.supportedActions)
        ? bap.supportedActions.filter((a): a is string => typeof a === 'string')
        : []),
    ]),
  );

  const signal = `${displayName} ${collectionId} ${rawType} ${entityNames.join(' ')}`.toLowerCase();

  let useCaseLabel = 'Enterprise 3rd-Party Connector';
  let domainTriggers =
    'active records, documents, domain entities, status summaries, and high-priority items';
  let filterGuidance =
    'Apply specific keyword, status, owner, and date-range filters rather than running broad unfiltered searches.';
  let sampleQueries: string[] = [
    `Search ${displayName} for the latest active records and summarize their status.`,
    `Find high-priority items or recent updates in ${displayName}.`,
  ];

  if (/\b(jira|atlassian_jira|buganizer|linear)\b/.test(signal)) {
    useCaseLabel = 'Jira & Issue Tracking Connector';
    domainTriggers =
      'Jira tickets, open engineering issues, bug reports, epics, status updates, stories, sprint backlogs, assignees, and sprint blockers';
    filterGuidance =
      'Filter by exact issue key (e.g., PROJ-123), project key, status (Open, In Progress, Blocked, Done), priority, or assignee. Query the `issue` entity store first before checking `comment` or `worklog` entity stores.';
    sampleQueries = [
      `Search ${displayName} for open high-priority engineering issues or sprint blockers and list their issue keys and assignees.`,
      `Find recent bug reports or epic status updates in ${displayName}.`,
    ];
  } else if (/\b(servicenow|service_now|itsm|pagerduty|zendesk)\b/.test(signal)) {
    useCaseLabel = 'ITSM & Incident Management Connector';
    domainTriggers =
      'active P1 or P2 incidents, IT incidents, service requests, change requests, standard change procedures, problem tickets, assignment groups, SLA breaches, and IT knowledge base articles';
    filterGuidance =
      'Filter by incident/ticket number (e.g., INC/RITM/CHG), severity/priority (P1/P2), state, or assignment group. Route active outage/ticket lookups to `incident` first and troubleshooting how-to questions to `kb_knowledge`.';
    sampleQueries = [
      `Search ${displayName} for active P1 or P2 incidents and summarize their current state and assignment group.`,
      `Find IT knowledge base articles or standard change procedures in ${displayName}.`,
    ];
  } else if (/\b(salesforce|sfdc|hubspot|crm|dynamics)\b/.test(signal)) {
    useCaseLabel = 'CRM & Customer Account Connector';
    domainTriggers =
      'active enterprise customer accounts, open sales opportunities, pipeline stages, leads, contacts, customer support cases, account activity, and renewal revenue';
    filterGuidance =
      'Resolve the exact `Account` or `Opportunity` record first before querying secondary `Case`, `Contact`, or `Task` entity stores. Preserve exact currency amounts, close dates, and pipeline stage names.';
    sampleQueries = [
      `Look up active enterprise accounts and open opportunities in ${displayName} and summarize their pipeline stage.`,
      `Find recent customer support cases or account activity in ${displayName}.`,
    ];
  } else if (/\b(confluence|wiki|notion)\b/.test(signal)) {
    useCaseLabel = 'Enterprise Wiki & Documentation Connector';
    domainTriggers =
      'architecture guidelines, design docs, engineering runbooks, system design documentation, product requirements, specifications, team wikis, and onboarding guides';
    filterGuidance =
      'Query the primary `page` entity store first with concise domain keywords and space/label filters. Avoid fanning out to `comment` or `attachment` stores unless the primary page search yields no matches.';
    sampleQueries = [
      `Search ${displayName} for architecture guidelines, engineering runbooks, or system design documentation.`,
      `Find the latest product requirements or team onboarding guides in ${displayName}.`,
    ];
  } else if (/\b(sharepoint|onedrive|office365|o365|box|gdrive|google_drive|drive)\b/.test(signal)) {
    useCaseLabel = 'Enterprise Document & Cloud Storage Connector';
    domainTriggers =
      'shared enterprise documents, official policy documents, executive presentations, spreadsheets, standard operating procedures, project charters, contract templates, policy manuals, and project folders';
    filterGuidance =
      'Formulate targeted document-title and topic queries, prioritize recently modified authoritative files, and cite exact document titles and links.';
    sampleQueries = [
      `Search ${displayName} for official policy documents, executive presentations, or standard operating procedures.`,
      `Find recent project charters or contract templates stored in ${displayName}.`,
    ];
  } else if (/\b(workday|bamboo|successfactors|hris|peoplesoft)\b/.test(signal)) {
    useCaseLabel = 'HRIS & People Operations Connector';
    domainTriggers =
      'employee profiles, department and org structure, PTO policies and balances, employee benefits policies, open job requisition guidelines, and onboarding procedures';
    filterGuidance =
      'Route policy/benefit questions to HR knowledge stores and specific employee/org lookups to the primary worker/organization entity store.';
    sampleQueries = [
      `Search ${displayName} for employee benefits, PTO policies, or onboarding procedures.`,
      `Look up department structure or open requisition guidelines in ${displayName}.`,
    ];
  } else if (/\b(github|gitlab|bitbucket)\b/.test(signal)) {
    useCaseLabel = 'Source Control & Engineering Repository Connector';
    domainTriggers =
      'pull requests, merge requests, code repositories, commits, release notes, open repository issues, code review guidelines, and repository documentation';
    filterGuidance =
      'Scope queries by repository name, PR/issue number, author, or branch. Query `pull_request` or `issue` entity stores first before scanning full commit histories.';
    sampleQueries = [
      `Search ${displayName} for recent pull requests, release notes, or open repository issues.`,
      `Find code review guidelines or repository documentation in ${displayName}.`,
    ];
  } else if (/\b(slack|teams|chat|gchat)\b/.test(signal)) {
    useCaseLabel = 'Enterprise Messaging & Channel History Connector';
    domainTriggers =
      'channel announcements, team discussions, incident resolution and war-room threads, shared links, release discussions, and shared decisions';
    filterGuidance =
      'Filter by channel name, thread participants, and recency window so stale conversational chatter does not dilute authoritative documentation.';
    sampleQueries = [
      `Search ${displayName} for recent channel announcements or incident resolution threads.`,
      `Find team discussions or shared links regarding recent releases in ${displayName}.`,
    ];
  }

  const safeSlug = String(collectionId || 'connector')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 38);

  const safePrefix = sanitizeSkillDisplayName(displayName).slice(0, 36).trim() || 'Connector';
  const skillDisplayName = sanitizeSkillDisplayName(
    `${safePrefix} Connector Query Optimizer`,
  );

  const entityBullets = entityStoreIds
    .slice(0, 8)
    .map((id, idx) => {
      const entName = entityNames[idx] || id.replace(`${collectionId}_`, '');
      return `- **\`${id}\`** (Entity: \`${entName}\`): Query this store only when the user specifically asks for \`${entName}\` records.`;
    })
    .join('\n');

  const actionSection =
    enabledActions.length > 0
      ? `\n## Read Retrieval vs. Live Connector Actions\n- **Enabled Connector Actions**: \`${enabledActions.slice(0, 8).join('`, `')}\`\n- Use indexed entity DataStores (${entityStoreIds.slice(0, 4).map((s) => `\`${s}\``).join(', ')}) for read/search questions. Only invoke live connector actions when the user explicitly requests a live record mutation or real-time action, and confirm required parameters with the user before executing write actions.\n`
      : '';

  const recommendedSkill: RecommendedSkillTemplate = {
    id: `skill-connector-${collectionId}`,
    skillIdSuggestion: `connector-${safeSlug}-router`,
    displayName: skillDisplayName,
    description: sanitizeSkillDescription(
      `Routes ${useCaseLabel} queries, records, and high-priority updates to ${displayName} (${collectionId}). Trigger when the user asks about ${domainTriggers} across ${entityStoreIds.slice(0, 5).join(', ')}.`,
      900,
    ),
    instruction: `# ${displayName} — 3rd-Party Connector Entity Routing & Query Skill

## When to Activate This Skill (Routing Triggers)
Activate this skill whenever a user request involves **${useCaseLabel}** (specifically **${domainTriggers}**) handled by **${displayName}** (\`${collectionId}\`).

## Single-Source First & Entity Store Disambiguation
This connector exposes **${entityStoreIds.length} entity DataStore(s)**. To prevent high-latency intra-connector fan-out, select ONLY the single primary entity DataStore matching the user's intent first:
${entityBullets}
- **Intent-First Source Selection**: Route each user query to the single most authoritative DataStore or MCP tool first. Do NOT fan out across all connected DataStores simultaneously unless the user explicitly asks for a cross-system comparison.
${actionSection}
## Connector-Specific Query & Filter Rules
1. **Scoped Filtering**: ${filterGuidance}
2. **Direct Single-Hop Execution**: Execute at most ONE targeted retrieval call against the primary entity store before synthesizing the answer. Only query secondary entity stores if the primary store returns zero matches.
3. **Grounded Citations**: Always include clickable source links, record IDs/keys, and last-updated timestamps from ${displayName}.
4. **Global Instruction Harmony**: Always respect the Assistant's global System and Style Instructions for persona, output formatting, and organizational guardrails.`,
    rationale: `Prevents intra-connector fan-out across ${entityStoreIds.length} entity store(s) (${entityStoreIds.slice(0, 4).join(', ')}) and optimizes query filtering for the "${displayName}" (${rawType}) 3rd-party connector.`,
    targetSources: entityStoreIds.slice(0, 8),
    sampleQueries,
  };

  return {
    collectionId,
    connectorName: connector.name || `collections/${collectionId}/dataConnector`,
    displayName,
    connectorType: rawType,
    useCaseLabel,
    isAttachedToEngine,
    state: connector.state || 'ACTIVE',
    entityStoreIds,
    entityNames,
    enabledActions,
    hasCoveringSkill: false,
    recommendedSkill,
  };
}

/**
 * Inspects the customer's live Assistant System/Style Instructions, Connector Instructions/Tools/Entities,
 * and active Organizational Skills to detect cross-resource contradictions WITHOUT embedding or exposing
 * any internal Google system prompts or proprietary planner code.
 */
export function detectSkillAndInstructionConflicts(params: {
  assistantSystemInstruction: string;
  enabledSkills: Agent[];
  byomcpEvaluations: ByomcpConnectorEvaluation[];
  thirdPartyConnectors: ThirdPartyConnectorEvaluation[];
  attachedDataStoreIds: Set<string>;
  attachedConnectorIds: Set<string>;
}): AssistantEvaluationFinding[] {
  const {
    assistantSystemInstruction,
    enabledSkills,
    byomcpEvaluations,
    thirdPartyConnectors,
    attachedDataStoreIds,
    attachedConnectorIds,
  } = params;

  const conflictFindings: AssistantEvaluationFinding[] = [];
  if (enabledSkills.length === 0) return conflictFindings;

  const sysLower = assistantSystemInstruction.toLowerCase();
  const sysHasFanout = FANOUT_ANTI_PATTERN_REGEX.test(assistantSystemInstruction);
  const sysForbidsTables =
    /\b(never\s+use\s+(?:markdown\s+)?tables?|do\s+not\s+(?:use|output|render)\s+(?:markdown\s+)?tables?|plain\s+text\s+only|json\s+only)\b/i.test(
      assistantSystemInstruction,
    );

  // Extract explicit source/tool prohibitions from Assistant System Instructions:
  // e.g. "never query jira", "do not use servicenow", "avoid searching confluence"
  const prohibitedSourcesInSys = new Set<string>();
  const prohibitionRegex =
    /\b(?:never|do\s+not|don't|must\s+not|prohibit(?:ed)?\s+from)\s+(?:use|using|query|querying|search|searching|call|calling|route\s+to|invoke|invoking)\s+(?:the\s+)?([a-z0-9_-]{3,35})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = prohibitionRegex.exec(sysLower)) !== null) {
    const token = match[1].trim();
    if (!['all', 'any', 'every', 'other', 'multiple', 'unrelated', 'external'].includes(token)) {
      prohibitedSourcesInSys.add(token);
    }
  }

  const assistantConflictDetails: string[] = [];
  const connectorConflictDetails: string[] = [];
  const overrideAntiPatternSkills: string[] = [];

  for (const skill of enabledSkills) {
    const skillName = skill.displayName || skill.name.split('/').pop() || 'Skill';
    const desc = (skill.description || '').trim();
    const inst = (skill.skillAgentDefinition?.instruction || '').trim();
    const combinedSkillText = `${desc}\n${inst}`;
    const skillLower = combinedSkillText.toLowerCase();

    // 1. Check for System-Override / Prompt-Injection Anti-Patterns inside Skill
    if (SYSTEM_OVERRIDE_ANTIPATTERN_REGEX.test(combinedSkillText)) {
      overrideAntiPatternSkills.push(skillName);
    }

    // 2. Check Skill vs. Assistant Global System Instructions
    const skillHasSingleSourceRule =
      /\b(single\s+most\s+authoritative|do\s+not\s+fan\s+out|intent-first\s+source\s+selection|single-source\s+first)\b/i.test(
        combinedSkillText,
      );
    if (sysHasFanout && skillHasSingleSourceRule) {
      assistantConflictDetails.push(
        `Skill "${skillName}" enforces Single-Source First routing, but the Assistant's global System Instructions command "search all datastores/sources", overriding the skill on every turn.`,
      );
    }

    if (
      sysForbidsTables &&
      /\b(markdown\s+tables?|render\s+tabular\s+results\s+in\s+clean\s+markdown\s+tables?)\b/i.test(
        combinedSkillText,
      )
    ) {
      assistantConflictDetails.push(
        `Skill "${skillName}" instructs rendering Markdown tables, which directly contradicts the Assistant's global System Instruction formatting constraint ("never use tables / JSON or plain text only").`,
      );
    }

    prohibitedSourcesInSys.forEach((forbiddenToken) => {
      const prioritizeRegex = new RegExp(
        `\\b(?:route|query|search|prioritize|use|call|activate)\\b[^.\\n]{0,60}\\b${forbiddenToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
        'i',
      );
      if (prioritizeRegex.test(combinedSkillText)) {
        assistantConflictDetails.push(
          `Skill "${skillName}" routes queries to "${forbiddenToken}", which the Assistant's global System Instructions explicitly prohibit querying.`,
        );
      }
    });

    // 3. Check Skill vs. BYOMCP Connector Instructions & Disabled Tools
    for (const mcp of byomcpEvaluations) {
      const mentionsThisMcp =
        skillLower.includes(mcp.collectionId.toLowerCase()) ||
        (mcp.displayName.length >= 4 && skillLower.includes(mcp.displayName.toLowerCase()));
      if (!mentionsThisMcp) continue;

      // 3a. Skill references a BYOMCP connector that is NOT attached to this Engine
      if (!mcp.isAttachedToEngine && attachedDataStoreIds.size > 0) {
        connectorConflictDetails.push(
          `Skill "${skillName}" routes queries to BYOMCP connector "${mcp.displayName}" (${mcp.collectionId}), which is currently detached from this Engine.`,
        );
      }

      // 3b. Skill explicitly instructs calling a tool that is DISABLED on the connector
      const disabledToolsReferenced = mcp.tools
        .filter((t) => !t.enabled && t.name.length >= 4 && skillLower.includes(t.name.toLowerCase()))
        .map((t) => t.name);
      if (disabledToolsReferenced.length > 0) {
        connectorConflictDetails.push(
          `Skill "${skillName}" instructs calling tool(s) (${disabledToolsReferenced.slice(0, 4).join(', ')}) that are currently DISABLED on BYOMCP connector "${mcp.displayName}".`,
        );
      }

      // 3c. Connector instructions enforce Read-Only safety while Skill instructs unguarded write mutations
      const mcpInstReadOnly =
        /\b(read-only|read\s+only\s+mode|never\s+(?:execute|run|call)\s+(?:write|mutation|create|update|delete|drop))\b/i.test(
          mcp.currentAgentInstructions,
        );
      const skillForcesMutation =
        /\b(always\s+(?:create|update|delete|modify)|automatically\s+(?:create|update|delete|close)\s+(?:tickets?|records?|issues?)\s+without\s+asking)\b/i.test(
          combinedSkillText,
        );
      if (mcpInstReadOnly && skillForcesMutation) {
        connectorConflictDetails.push(
          `Skill "${skillName}" instructs automatic record mutations on "${mcp.displayName}", conflicting with the connector's read-only mcp_agent_instructions.`,
        );
      }
    }

    // 4. Check Skill vs. 3rd-Party Connectors (Detached or Failed State)
    for (const tp of thirdPartyConnectors) {
      const mentionsTp =
        skillLower.includes(tp.collectionId.toLowerCase()) ||
        (tp.displayName.length >= 4 && skillLower.includes(tp.displayName.toLowerCase()));
      if (!mentionsTp) continue;

      if (!tp.isAttachedToEngine && attachedConnectorIds.size > 0) {
        connectorConflictDetails.push(
          `Skill "${skillName}" routes to 3rd-party connector "${tp.displayName}" (${tp.collectionId}), which is not attached to this Engine.`,
        );
      } else if (['FAILED', 'ERROR', 'CREATION_FAILED'].includes(tp.state.toUpperCase())) {
        connectorConflictDetails.push(
          `Skill "${skillName}" routes to 3rd-party connector "${tp.displayName}" (${tp.collectionId}), which is currently in ${tp.state} state.`,
        );
      }
    }
  }

  // 5. Check Skill-vs-Skill Overlapping Trigger Descriptions
  const tokenizeTrigger = (text: string): Set<string> =>
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, ' ')
        .split(/\s+/)
        .filter(
          (w) =>
            w.length >= 4 &&
            ![
              'route',
              'routes',
              'routing',
              'query',
              'queries',
              'skill',
              'when',
              'user',
              'asks',
              'about',
              'trigger',
              'enterprise',
              'datastore',
              'datastores',
              'connector',
              'across',
              'from',
              'with',
              'into',
              'this',
              'that',
              'requests',
              'lookups',
              'actions',
              'records',
              'metadata',
              'updates',
              'high-priority',
              'priority',
              'items',
              'status',
              'tools',
              'configured',
              'enabled',
            ].includes(w),
        ),
    );

  const extractTargetCollection = (desc: string): string | null =>
    desc.match(/\bto\s+[^(\n]{1,80}\(([a-z0-9_-]{3,64})\)/i)?.[1]?.toLowerCase() || null;

  const overlappingPairs: string[] = [];
  for (let i = 0; i < enabledSkills.length; i++) {
    for (let j = i + 1; j < enabledSkills.length; j++) {
      const sA = enabledSkills[i];
      const sB = enabledSkills[j];
      const targetA = extractTargetCollection(sA.description || '');
      const targetB = extractTargetCollection(sB.description || '');
      if (targetA && targetB && targetA !== targetB) {
        // Distinct per-connector skills scoped to different collection IDs
        continue;
      }
      const tokA = tokenizeTrigger(sA.description || '');
      const tokB = tokenizeTrigger(sB.description || '');
      if (tokA.size < 3 || tokB.size < 3) continue;
      let intersection = 0;
      tokA.forEach((t) => {
        if (tokB.has(t)) intersection++;
      });
      const union = new Set([...tokA, ...tokB]).size;
      const jaccard = union > 0 ? intersection / union : 0;
      if (jaccard >= 0.65) {
        overlappingPairs.push(
          `"${sA.displayName}" & "${sB.displayName}" (${Math.round(jaccard * 100)}% trigger overlap)`,
        );
      }
    }
  }

  if (assistantConflictDetails.length > 0) {
    conflictFindings.push({
      id: 'skills-conflict-with-assistant-instructions',
      category: 'SKILLS_AND_ROUTING',
      severity: 'CRITICAL',
      title: `Skill Instructions Conflict with Assistant Global System Instructions (${assistantConflictDetails.length})`,
      summary: assistantConflictDetails.join(' '),
      currentValue: `${assistantConflictDetails.length} Cross-Instruction Contradiction(s)`,
      recommendedValue: 'Harmonized Assistant Persona + Scoped Skill Routing Rules',
      impact:
        'When an active Skill contradicts the Assistant’s global System & Style Instructions, the planner receives conflicting directives on every turn—causing increased deliberation latency, ignored skill routing rules, or inconsistent output formatting.',
      remediation:
        'Remove conflicting fan-out or source-prohibition rules from Overview > Assistant Editor (System & Style Instructions), or update the Skill’s SKILL.md instructions so both resources align.',
      targetTab: 'skills',
    });
  }

  if (connectorConflictDetails.length > 0) {
    conflictFindings.push({
      id: 'skills-conflict-with-connector-config',
      category: 'SKILLS_AND_ROUTING',
      severity: 'WARNING',
      title: `Skill Instructions Conflict with Connector Capabilities or Instructions (${connectorConflictDetails.length})`,
      summary: connectorConflictDetails.join(' '),
      currentValue: `${connectorConflictDetails.length} Skill ↔ Connector Mismatch(es)`,
      recommendedValue: 'Skills reference only enabled tools & healthy attached connectors',
      impact:
        'Instructing the Assistant to call disabled MCP tools, mutate read-only connectors, or query unattached/failed connectors causes failed tool invocations and fallback latency spikes.',
      remediation:
        'Open the Skills tab (or Recommended Skills editor) to remove disabled tool names and align the Skill with the connector’s active tools and mcp_agent_instructions.',
      targetTab: 'skills',
    });
  }

  if (overlappingPairs.length > 0) {
    conflictFindings.push({
      id: 'skills-overlapping-routing-conflict',
      category: 'SKILLS_AND_ROUTING',
      severity: 'INFO',
      title: `Overlapping Trigger Descriptions Across Active Skills (${overlappingPairs.length} Pair${overlappingPairs.length === 1 ? '' : 's'})`,
      summary: `Active organizational skills have highly overlapping trigger descriptions: ${overlappingPairs.slice(0, 3).join('; ')}.`,
      currentValue: `${overlappingPairs.length} Overlapping Skill Pair(s)`,
      recommendedValue: 'Mutually exclusive domain triggers per Skill',
      impact:
        'Overlapping skill descriptions cause the Discovery Engine planner to activate multiple competing skills on the same turn or oscillate between skills, increasing TTFT latency.',
      remediation:
        'Differentiate each Skill’s Trigger Description so each skill owns a distinct set of connectors, DataStores, or user intents, or consolidate duplicate skills.',
      targetTab: 'skills',
    });
  }

  if (overrideAntiPatternSkills.length > 0) {
    conflictFindings.push({
      id: 'skills-system-override-antipattern',
      category: 'SECURITY_AND_GOVERNANCE',
      severity: 'CRITICAL',
      title: `Skill Contains System-Instruction Override Anti-Pattern (${overrideAntiPatternSkills.join(', ')})`,
      summary: `Active skill(s) (${overrideAntiPatternSkills.join(', ')}) contain "ignore previous/system instructions" or guardrail-override phrasing.`,
      currentValue: `System-override phrasing in ${overrideAntiPatternSkills.length} Skill(s)`,
      recommendedValue: 'Additive domain routing instructions without system-prompt overrides',
      impact:
        'Directives to ignore prior/system instructions conflict with the Assistant’s built-in orchestration framing and can trigger Model Armor Prompt Injection & Jailbreak blocks during turn execution.',
      remediation:
        'Edit the Skill’s SKILL.md instructions to remove "ignore previous/system instructions" phrasing and state routing rules positively.',
      targetTab: 'skills',
    });
  }

  return conflictFindings;
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
  const thirdPartyEvaluations: ThirdPartyConnectorEvaluation[] = [];

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
  // Ignore private/personal user skills (state === 'PRIVATE' or sharingConfig.scope === 'PRIVATE' or sharingScope === 'PRIVATE_PERSONAL')
  const allSkillAgents = agents.filter((a) => isSkillAgentResource(a));
  const skillAgents = allSkillAgents.filter((s) => {
    const state = (s.state || 'PRIVATE').toUpperCase();
    if (state === 'PRIVATE' || s.sharingConfig?.scope === 'PRIVATE') return false;
    const classification = classifySkillAgent(s);
    return classification.sharingScope === 'ORG_WIDE';
  });
  const conversationalAgents = agents.filter((a) => !isSkillAgentResource(a));

  const enabledSkills = skillAgents.filter(
    (s) => (s.state || '').toUpperCase() === 'ENABLED',
  );
  // Only organizational (ORG_WIDE / ALL_USERS) skills that were explicitly disabled are tracked here;
  // private/personal user skills are excluded completely.
  const privateOrDisabledSkills = skillAgents.filter(
    (s) => (s.state || '').toUpperCase() === 'DISABLED',
  );
  const skillsMissingDescription = enabledSkills.filter((s) => {
    const classification = classifySkillAgent(s);
    if (classification.origin === 'GOOGLE_1P') return false;
    return !(s.description || '').trim();
  });

  // Helper to check if a recommended organizational skill is already deployed
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

  const sysInst =
    assistant.generationConfig?.systemInstruction?.additionalSystemInstruction || '';
  const styleInst = assistant.styleAndFormattingInstructions || '';
  const combinedInst =
    sysInst.trim() && styleInst.trim() && sysInst.trim() !== styleInst.trim()
      ? `${sysInst.trim()}\n\n${styleInst.trim()}`
      : sysInst || styleInst;

  // Evaluate BYOMCP and 3rd-Party Connectors
  Object.entries(connectorsByCollectionId).forEach(([cid, connector]) => {
    const coll = collectionMap.get(cid);
    const entityStoreShortIds = Array.isArray(connector.entities)
      ? connector.entities
          .map((ent: Record<string, unknown>) =>
            typeof ent.dataStore === 'string'
              ? ent.dataStore.split('/').pop() || ent.dataStore
              : '',
          )
          .filter(Boolean)
      : [];
    const attachedFromEntities = entityStoreShortIds.filter((id) => attachedIds.has(id));
    const isAttached =
      attachedConnectorIds.has(cid) ||
      attachedIds.has(cid) ||
      attachedFromEntities.length > 0 ||
      Array.from(attachedIds).some((id) => id.startsWith(`${cid}_`));
    if (isByomcpConnector(connector, coll)) {
      const evalItem = evaluateByomcpConnector(
        cid,
        connector,
        isAttached,
        coll?.displayName,
        combinedInst,
      );
      byomcpEvaluations.push(evalItem);
    } else {
      const attachedEntityStores = Array.from(
        new Set([
          ...attachedFromEntities,
          ...Array.from(attachedIds).filter((id) => id === cid || id.startsWith(`${cid}_`)),
        ]),
      );
      const tpEval = evaluateThirdPartyConnectorForSkill(
        cid,
        connector,
        isAttached,
        attachedEntityStores,
        coll?.displayName,
      );
      const coveredByExistingSkill = enabledSkills.some((sk) => {
        const text = `${sk.displayName || ''} ${sk.description || ''} ${sk.skillAgentDefinition?.instruction || ''}`.toLowerCase();
        return (
          text.includes(cid.toLowerCase()) ||
          (tpEval.displayName.length >= 4 && text.includes(tpEval.displayName.toLowerCase())) ||
          tpEval.entityStoreIds.some((es) => text.includes(es.toLowerCase()))
        );
      });
      tpEval.hasCoveringSkill =
        coveredByExistingSkill || isSkillAlreadyDeployed(tpEval.recommendedSkill);
      thirdPartyEvaluations.push(tpEval);
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
    const inferStoreRoutingHint = (name: string, id: string, rawSource?: string): string => {
      const combined = `${name} ${id} ${rawSource || ''}`.toLowerCase();
      if (/\b(jira|bug|ticket|sprint|backlog|linear)\b/.test(combined)) {
        return 'Route engineering tickets, bugs, sprint status, and issue-tracking queries here.';
      }
      if (/\b(servicenow|incident|itsm|pagerduty|zendesk)\b/.test(combined)) {
        return 'Route IT incidents, service requests, change tickets, and SLA inquiries here.';
      }
      if (/\b(confluence|wiki|runbook|handbook|notion)\b/.test(combined)) {
        return 'Route internal wiki documentation, engineering runbooks, and architecture guides here.';
      }
      if (/\b(hr|benefit|workday|policy|policies|employee|onboarding|pto)\b/.test(combined)) {
        return 'Route employee HR policies, benefits, PTO, and people-operations questions here.';
      }
      if (/\b(salesforce|crm|account|opportunity|customer|revenue|sap|erp)\b/.test(combined)) {
        return 'Route customer account, sales opportunity, pipeline, and ERP order queries here.';
      }
      if (/\b(gdrive|drive|sharepoint|onedrive|box|gcs|document|contract)\b/.test(combined)) {
        return 'Route shared enterprise documents, decks, spreadsheets, and formal policy files here.';
      }
      if (/\b(bigquery|sql|alloydb|spanner|snowflake|analytics|warehouse)\b/.test(combined)) {
        return 'Route structured data tables, KPI metrics, and analytical SQL lookups here.';
      }
      return 'Route domain questions matching this source name and document scope here.';
    };

    const dsById = new Map<string, DataStore>();
    dataStores.forEach((ds) => {
      const dsId = ds.name.split('/').pop() || ds.name;
      if (dsId) dsById.set(dsId, ds);
    });

    const routerTargetIds =
      attachedIds.size > 0
        ? Array.from(attachedIds).slice(0, 12)
        : Array.from(attachedConnectorIds).slice(0, 12);

    const storeRoutingBullets: string[] = [];
    const storeDisplayLabels: string[] = [];

    routerTargetIds.forEach((dsId) => {
      const ds = dsById.get(dsId);
      const dsParts = (ds?.name || '').split('/');
      const collIdx = dsParts.indexOf('collections');
      const cidFromDs = collIdx !== -1 && dsParts[collIdx + 1] ? dsParts[collIdx + 1] : '';
      const matchedCid =
        cidFromDs ||
        Array.from(collectionMap.keys()).find((c) => dsId === c || dsId.startsWith(`${c}_`)) ||
        '';
      const conn = matchedCid ? connectorsByCollectionId[matchedCid] : undefined;
      const rawSource = conn?.dataSource || conn?.connectorType;
      const sourceType = typeof rawSource === 'string' ? rawSource : '';
      const collDisplay = matchedCid ? collectionMap.get(matchedCid)?.displayName : undefined;
      const label = ds?.displayName || collDisplay || dsId;
      storeDisplayLabels.push(label);
      const hint = inferStoreRoutingHint(label, dsId, sourceType);
      storeRoutingBullets.push(`- **${label}** (\`${dsId}\`) — ${hint}`);
    });

    const attachedMcpServers = byomcpEvaluations.filter((m) => m.isAttachedToEngine);
    attachedMcpServers.slice(0, 8).forEach((mcp) => {
      if (routerTargetIds.includes(mcp.collectionId)) return;
      const toolPreview =
        mcp.tools
          .filter((t) => t.enabled)
          .slice(0, 4)
          .map((t) => t.name)
          .join(', ') || 'enabled MCP tools';
      storeRoutingBullets.push(
        `- **${mcp.displayName}** (\`${mcp.collectionId}\` — BYOMCP: ${mcp.useCaseLabel}) — Route live ${mcp.useCaseLabel.toLowerCase()} lookups and tool actions (${toolPreview}) here.`,
      );
    });

    const storeListText = storeRoutingBullets.join('\n');

    const primaryStoreLabel =
      storeDisplayLabels[0] ||
      attachedDataStoreDisplayNames[0] ||
      routerTargetIds[0] ||
      'our primary knowledge base';
    const secondaryStoreLabel =
      storeDisplayLabels[1] ||
      attachedDataStoreDisplayNames[1] ||
      attachedMcpServers[0]?.displayName ||
      routerTargetIds[1] ||
      primaryStoreLabel;

    const routerSampleQueries = [
      `Search ${primaryStoreLabel} for the key architecture guidelines, policies, or standard operating procedures.`,
      `Find troubleshooting steps, recent updates, or reference documentation in ${secondaryStoreLabel}.`,
    ];

    const routerSkillTemplate: RecommendedSkillTemplate = {
      id: 'skill-datastore-router',
      skillIdSuggestion: 'enterprise-datastore-query-optimizer',
      displayName: sanitizeSkillDisplayName('Enterprise DataStore Query Router and Optimizer'),
      description: sanitizeSkillDescription(
        `Routes and optimizes enterprise search queries across ${primaryStoreLabel}${
          secondaryStoreLabel !== primaryStoreLabel ? `, ${secondaryStoreLabel},` : ''
        } and all ${connectedDataStoresCount} connected DataStore(s)${
          attachedMcpServers.length > 0 ? ` and ${attachedMcpServers.length} BYOMCP server(s)` : ''
        }. Trigger when the user searches for architecture guidelines, policies, standard operating procedures, troubleshooting steps, reference documentation, or domain records.`,
        900,
      ),
      instruction: `# Enterprise DataStore Query Router & Retrieval Optimizer

## Objective
You are connected to **${connectedDataStoresCount} enterprise DataStore(s)**${
        attachedMcpServers.length > 0
          ? ` and **${attachedMcpServers.length} BYOMCP tool server(s)**`
          : ''
      }. To prevent high-latency fan-out and noisy search results, follow this Source Routing Matrix and query optimization workflow before executing searches:

## Connected Enterprise Data Sources & Routing Matrix
${storeListText}

## Query Optimization & Routing Rules
1. **Intent-First Source Selection**: Match the user's intent to the single most authoritative DataStore or BYOMCP server listed above before searching. Do NOT fan out across all connected DataStores simultaneously unless the user explicitly asks for a cross-system comparison.
2. **Deconstruct Complex Prompts**: Rewrite conversational user prompts into concise, high-signal keyword/semantic queries stripped of conversational filler.
3. **Apply Metadata & Recency Filters**: Whenever the user mentions a timeframe, project, author, status, or document type, apply explicit filter constraints rather than retrieving unbounded document sets.
4. **Iterative Retrieval over Exhaustive Fan-Out**: Query the primary authoritative source first. Only expand to secondary DataStores if the primary source returns zero relevant passages.
5. **Grounded Synthesis & Citations**: Cite the exact source document title and link for every claim, and clearly state if information was not found in the queried store.
6. **Global Instruction Harmony**: Always respect the Assistant's global System and Style Instructions for persona, output formatting, and organizational guardrails.`,
      rationale: `Directly addresses high retrieval latency and unguided query fan-out across ${connectedDataStoresCount} connected DataStore(s) by teaching the Assistant which specific source handles each domain.`,
      targetSources: routerTargetIds.slice(0, 10),
      sampleQueries: routerSampleQueries,
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

  // Disabled Organizational Skills Check (Private/Personal user skills are intentionally ignored)
  if (privateOrDisabledSkills.length > 0) {
    const names = privateOrDisabledSkills
      .slice(0, 4)
      .map((s) => `${s.displayName} (DISABLED)`)
      .join(', ');
    const hasActiveOrgSkills = enabledSkills.length > 0;
    findings.push({
      id: 'skills-private-or-disabled-trap',
      category: 'SKILLS_AND_ROUTING',
      severity: hasActiveOrgSkills ? 'INFO' : 'WARNING',
      title: `${privateOrDisabledSkills.length} Organizational Skill(s) Are Currently DISABLED`,
      summary: `Found ${privateOrDisabledSkills.length} organizational skill(s) (${names}) in DISABLED state${
        hasActiveOrgSkills
          ? ` (alongside ${enabledSkills.length} active ENABLED organizational skill(s)).`
          : '.'
      }`,
      currentValue: `${privateOrDisabledSkills.length} Disabled Org Skill(s)`,
      recommendedValue: 'State = ENABLED (Shared Org-Wide) for production skills',
      impact:
        'Organizational skills in DISABLED state are inactive and will not be used by the Assistant to optimize DataStore queries.',
      remediation:
        'Enable the organizational skill(s) in the Skills tab if they should be active for end users, or delete obsolete disabled skills.',
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
    const isUnattachedInProject =
      !mcpEval.isAttachedToEngine && connectedDataStoresCount > 0;
    if (!isUnattachedInProject && !isSkillAlreadyDeployed(mcpEval.recommendedCompanionSkill)) {
      recommendedSkills.push(mcpEval.recommendedCompanionSkill);
    }

    if (mcpEval.status === 'NEEDS_ATTENTION') {
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
        ...(isUnattachedInProject
          ? {}
          : { recommendedSkillId: mcpEval.recommendedCompanionSkill.id }),
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
  // 3B. 3RD-PARTY CONNECTOR SKILL EVALUATION (Entity Disambiguation & Actions)
  // ============================================================================
  thirdPartyEvaluations.forEach((tpEval) => {
    const isUnattachedInProject =
      !tpEval.isAttachedToEngine && connectedDataStoresCount > 0;
    if (!isUnattachedInProject && !isSkillAlreadyDeployed(tpEval.recommendedSkill)) {
      recommendedSkills.push(tpEval.recommendedSkill);
    }

    if (
      !isUnattachedInProject &&
      !tpEval.hasCoveringSkill &&
      (tpEval.entityStoreIds.length >= 2 || tpEval.enabledActions.length > 0)
    ) {
      findings.push({
        id: `connector-skill-recommendation-${tpEval.collectionId}`,
        category: 'SKILLS_AND_ROUTING',
        severity: 'INFO',
        title: `3rd-Party Connector "${tpEval.displayName}" (${tpEval.useCaseLabel}): Dedicated Routing Skill Recommended`,
        summary: `Connector "${tpEval.displayName}" (${tpEval.collectionId}) exposes ${tpEval.entityStoreIds.length} entity DataStore(s) (${tpEval.entityStoreIds.slice(0, 4).join(', ')})${
          tpEval.enabledActions.length > 0
            ? ` and ${tpEval.enabledActions.length} live action(s)`
            : ''
        }, but no active organizational Skill explicitly disambiguates its entity stores.`,
        currentValue: `${tpEval.entityStoreIds.length} Entity Store(s) / No Dedicated Connector Skill`,
        recommendedValue: `Deploy "${tpEval.recommendedSkill.displayName}"`,
        impact:
          'Without entity-store routing instructions, queries targeting this 3rd-party connector can fan out across all of its entity DataStores simultaneously, increasing retrieval latency.',
        remediation: `Click "Review & Create Skill" to deploy the tailored "${tpEval.recommendedSkill.displayName}" skill for ${tpEval.displayName}.`,
        targetTab: 'skills',
        recommendedSkillId: tpEval.recommendedSkill.id,
      });
    }
  });

  // ============================================================================
  // 4. ASSISTANT & ENGINE CONFIGURATION HYGIENE + CROSS-INSTRUCTION HARMONY
  // ============================================================================
  // Run Zero-Internal-Prompt Cross-Resource Conflict Detection across Assistant Instructions,
  // Connector Instructions/Capabilities, and Active Organizational Skills
  const instructionConflictFindings = detectSkillAndInstructionConflicts({
    assistantSystemInstruction: combinedInst,
    enabledSkills,
    byomcpEvaluations,
    thirdPartyConnectors: thirdPartyEvaluations,
    attachedDataStoreIds: attachedIds,
    attachedConnectorIds,
  });
  findings.push(...instructionConflictFindings);

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
      const fc = (tpl.filterConfig || {}) as {
        raiSettings?: { raiFilters?: Array<{ confidenceLevel?: string }> };
        piAndJailbreakFilterSettings?: { filterEnforcement?: string };
        maliciousUriFilterSettings?: { filterEnforcement?: string };
        sdpSettings?: {
          basicConfig?: { filterEnforcement?: string };
          advancedConfig?: { inspectTemplate?: string; deidentifyTemplate?: string };
        };
        csamFilterfilterSettings?: { filterEnforcement?: string };
      };
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
          (f) => f?.confidenceLevel && f.confidenceLevel !== 'OFF',
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

  const matchedDataStores = dataStores.filter((ds) => {
    const dsId = ds.name.split('/').pop() || ds.name;
    return attachedIds.has(dsId);
  });
  const connectedDataStoreResourceNames =
    matchedDataStores.length > 0
      ? matchedDataStores.map((ds) => ds.name)
      : Array.from(attachedIds).map(
          (id) =>
            `projects/${config.projectId}/locations/${config.appLocation || 'global'}/collections/${
              config.collectionId || 'default_collection'
            }/dataStores/${id}`,
        );

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
    connectedDataStoreResourceNames,
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
    const raw = projCfgResult.value as {
      customerProvidedConfig?: {
        resourceAccessControlConfig?: { dataStoreAccessControlEnabled?: boolean };
      };
      customer_provided_config?: {
        resource_access_control_config?: { data_store_access_control_enabled?: boolean };
      };
    };
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

interface VertexGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

function resolveVertexAiLocation(appLocation?: string): string {
  if (!appLocation || appLocation === 'global' || appLocation === 'us') {
    return 'us-central1';
  }
  if (appLocation === 'eu') {
    return 'europe-west4';
  }
  return appLocation;
}

async function callVertexGeminiJson<T>(
  prompt: string,
  config: Config,
): Promise<T> {
  if (!config.projectId) {
    throw new Error('Project ID is required to synthesize custom guidance with Vertex AI Gemini.');
  }
  const validLoc = resolveVertexAiLocation(config.appLocation);
  const modelsToTry = ['gemini-2.5-flash', 'gemini-2.5-pro'];
  let response: VertexGenerateContentResponse | null = null;
  let lastError: unknown = null;

  for (const model of modelsToTry) {
    try {
      const url = `https://${validLoc}-aiplatform.googleapis.com/v1beta1/projects/${config.projectId}/locations/${validLoc}/publishers/google/models/${model}:generateContent`;
      const requestBody = {
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      };
      response = await api.gapiRequest<VertexGenerateContentResponse>(
        url,
        'POST',
        config.projectId,
        undefined,
        requestBody,
        undefined,
        true,
      );
      if (response?.candidates?.[0]?.content?.parts?.[0]?.text) {
        break;
      }
    } catch (err) {
      lastError = err;
    }
  }

  const rawText = response?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw (
      lastError ||
      new Error('No candidate content returned from Vertex AI Gemini. Verify Vertex AI API is enabled.')
    );
  }

  const jsonMatch =
    rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || rawText.match(/(\{[\s\S]*\})/);
  const cleanedJson = jsonMatch ? jsonMatch[1].trim() : rawText.trim();
  return JSON.parse(cleanedJson) as T;
}

function sanitizeHarmonizedSkillInstruction(
  rawInstruction: string,
  targetSources: string[],
  assistantSystemInstruction?: string,
): string {
  let cleaned = rawInstruction
    .replace(
      /\b(ignore\s+(?:all\s+)?(?:previous|prior|system|above)\s+instructions|disregard\s+(?:all\s+)?(?:system|previous|prior)\s+(?:instructions|prompts?|rules)|override\s+(?:safety|guardrails|model\s+armor|system\s+prompt)|forget\s+all\s+(?:prior|previous)\s+rules)\b/gi,
      'follow the Assistant global instructions',
    )
    .replace(
      /\b(search\s+(?:across\s+)?all\s+(?:data\s*stores|sources|tools|connectors)|always\s+query\s+(?:across\s+)?(?:all|every)|check\s+every\s+(?:data\s*store|source|connector))\b/gi,
      'query the single most authoritative source first',
    )
    .trim();

  if (
    assistantSystemInstruction &&
    /\b(never\s+use\s+(?:markdown\s+)?tables?|do\s+not\s+(?:use|output|render)\s+(?:markdown\s+)?tables?|plain\s+text\s+only|json\s+only)\b/i.test(
      assistantSystemInstruction,
    )
  ) {
    cleaned = cleaned.replace(
      /\b(render\s+tabular\s+results\s+in\s+clean\s+markdown\s+tables?|markdown\s+tables?)\b/gi,
      'structured output matching the Assistant global formatting instructions',
    );
  }

  const hasSingleSourceDirective = /\bintent-first source selection\b/i.test(cleaned);
  if (!hasSingleSourceDirective) {
    cleaned += `\n\n## Single-Source First & Fan-Out Prevention Rule\n- **Intent-First Source Selection**: Route each user query to the single most authoritative DataStore or MCP tool first. Do NOT fan out across all connected DataStores simultaneously unless the user explicitly asks for a cross-system comparison.`;
  }

  const lower = cleaned.toLowerCase();
  const missingSources = targetSources.filter(
    (src) => src.trim().length > 0 && !lower.includes(src.toLowerCase()),
  );
  if (missingSources.length > 0) {
    const bullets = missingSources
      .map((s) => `- **\`${s}\`**: Route domain queries targeting \`${s}\` directly to this source.`)
      .join('\n');
    cleaned += `\n\n## Explicit Source Identifiers\n${bullets}`;
  }

  return cleaned;
}

/**
 * Uses Vertex AI Gemini (`gemini-2.5-flash` / `gemini-2.5-pro`) to inspect the live
 * MCP server's full tool schemas (including parameter types, descriptions, and enums)
 * and synthesize a bespoke `mcp_server_description`, `mcp_agent_instructions`, and
 * Companion Skill tailored specifically to this MCP server.
 */
export async function synthesizeByomcpWithGemini(
  mcpEval: ByomcpConnectorEvaluation,
  connectedDataStoreNames: string[],
  config: Config,
  alignmentContext?: {
    assistantSystemInstruction?: string;
  },
): Promise<{
  serverDescription: string;
  agentInstructions: string;
  companionSkill: {
    displayName: string;
    description: string;
    instruction: string;
  };
}> {
  const enabledTools = mcpEval.tools.filter((t) => t.enabled);
  const toolSchemasPayload = enabledTools.map((t) => ({
    name: t.name,
    displayName: t.displayName,
    enabled: true,
    description: t.description,
    requiredParams: t.requiredParams,
    parameters: t.parameterDetails || t.parameterNames,
  }));

  const assistantInstSnippet = alignmentContext?.assistantSystemInstruction?.trim()
    ? sanitizeSkillDescription(alignmentContext.assistantSystemInstruction.trim(), 600)
    : 'None configured';

  const prompt = `You are a Principal Google Cloud Gemini Enterprise (Agentspace) Architect.
Analyze the following Custom BYOMCP Server and its enabled MCP Tool JSON Schemas, and synthesize a custom, high-precision configuration that harmonizes with the Assistant's core instructions.

MCP Server Display Name: "${mcpEval.displayName}"
Collection ID: "${mcpEval.collectionId}"
Endpoint URI: "${mcpEval.instanceUri || 'N/A'}"
Detected Domain: "${mcpEval.useCaseLabel}"
Other Connected DataStores on this Assistant: ${
    connectedDataStoreNames.length > 0 ? connectedDataStoreNames.join(', ') : 'None'
  }
Customer's Current Assistant System Instructions (DO NOT CONTRADICT):
${assistantInstSnippet}

Enabled MCP Tools & Parameter Schemas (ONLY reference enabled tools listed here):
${JSON.stringify(toolSchemasPayload, null, 2)}

CRITICAL HARMONY RULES:
1. Never include "ignore previous instructions" or system-prompt override phrasing.
2. Never contradict the Customer's Current Assistant System Instructions above (including persona and output formatting preferences).
3. Reference ONLY the enabled tools listed above and include exact Collection ID "${mcpEval.collectionId}" in the companionSkill instruction.

Return ONLY a valid JSON object matching this exact schema:
{
  "serverDescription": "Concise 1-2 sentence authoritative domain description (80-220 chars) for mcp_server_description telling the Gemini Enterprise planner exactly what domain questions and entities should route to this MCP server and naming its primary enabled tools.",
  "agentInstructions": "Structured multi-line plain-text instructions for mcp_agent_instructions covering: (1) Role & routing scope, (2) Exact tool invocation contracts with required parameters, types, and enum values, (3) Multi-step tool chaining order (e.g. search/list ID resolution before get/detail or create/update calls), and (4) Output formatting & safety guardrails aligned with the Assistant's global instructions.",
  "companionSkill": {
    "displayName": "Alphanumeric skill name (letters, numbers, spaces, hyphens ONLY, max 60 chars, no ampersands or punctuation)",
    "description": "Concise 1-2 sentence trigger description (100-400 chars, STRICT MAX 900 Unicode characters; Discovery Engine rejects agent.description > 1024 chars) used by the Gemini Enterprise planner to decide when to activate this skill based on user intent and domain nouns.",
    "instruction": "Comprehensive Markdown skill instructions teaching the planner when to route to this MCP server (${mcpEval.collectionId}) vs other DataStores, how to chain tools, how to populate filter parameters, and how to format grounded answers."
  }
}`;

  const parsed = await callVertexGeminiJson<{
    serverDescription?: string;
    agentInstructions?: string;
    companionSkill?: {
      displayName?: string;
      description?: string;
      instruction?: string;
    };
  }>(prompt, config);

  const serverDescription = (parsed.serverDescription || '').trim();
  const agentInstructions = (parsed.agentInstructions || '').trim();
  if (!serverDescription || !agentInstructions) {
    throw new Error('Gemini response did not include non-empty serverDescription and agentInstructions.');
  }

  const rawCompanionDesc =
    (parsed.companionSkill?.description || '').trim() ||
    mcpEval.recommendedCompanionSkill.description;
  let companionInst =
    (parsed.companionSkill?.instruction || '').trim() ||
    mcpEval.recommendedCompanionSkill.instruction;
  if (
    Array.from(rawCompanionDesc).length > 1024 &&
    !companionInst.includes(rawCompanionDesc.slice(0, 120))
  ) {
    companionInst = `${companionInst}\n\n## Extended Trigger & Scope Details\n${rawCompanionDesc}`;
  }
  companionInst = sanitizeHarmonizedSkillInstruction(
    companionInst,
    [mcpEval.collectionId],
    alignmentContext?.assistantSystemInstruction,
  );

  return {
    serverDescription,
    agentInstructions,
    companionSkill: {
      displayName: sanitizeSkillDisplayName(
        parsed.companionSkill?.displayName || mcpEval.recommendedCompanionSkill.displayName,
      ),
      description: sanitizeSkillDescription(rawCompanionDesc),
      instruction: companionInst,
    },
  };
}

/**
 * Uses Vertex AI Gemini (`gemini-2.5-flash` / `gemini-2.5-pro`) to synthesize a bespoke
 * Organizational Query-Routing Skill tailored to the Assistant's connected DataStores and BYOMCP servers.
 */
export async function synthesizeSkillWithGemini(
  template: RecommendedSkillTemplate,
  byomcpEvaluations: ByomcpConnectorEvaluation[],
  connectedDataStoreNames: string[],
  config: Config,
  alignmentContext?: {
    assistantSystemInstruction?: string;
    existingSkillNames?: string[];
  },
): Promise<{
  displayName: string;
  description: string;
  instruction: string;
}> {
  const attachedMcpSummary = byomcpEvaluations
    .filter((m) => m.isAttachedToEngine || byomcpEvaluations.length <= 5)
    .map((m) => ({
      displayName: m.displayName,
      collectionId: m.collectionId,
      domain: m.useCaseLabel,
      connectorAgentInstructions: m.currentAgentInstructions
        ? sanitizeSkillDescription(m.currentAgentInstructions, 300)
        : undefined,
      tools: m.tools
        .filter((t) => t.enabled)
        .map((t) => ({
          name: t.name,
          description: sanitizeSkillDescription(t.description, 220),
          requiredParams: t.requiredParams,
          parameters: t.parameterDetails || t.parameterNames,
        })),
    }));

  const assistantInstSnippet = alignmentContext?.assistantSystemInstruction?.trim()
    ? sanitizeSkillDescription(alignmentContext.assistantSystemInstruction.trim(), 600)
    : 'None configured';

  const prompt = `You are a Principal Google Cloud Gemini Enterprise (Agentspace) Architect.
Tailor and enhance the following Organizational Query-Routing Skill so it is 100% customized to the customer's actual connected DataStores and BYOMCP tool servers, and harmonizes with the Assistant's and Connectors' configured instructions.

Current Skill Template ID: "${template.skillIdSuggestion}"
Current Skill Display Name: "${template.displayName}"
Target Sources: ${template.targetSources.join(', ') || 'All connected sources'}
Connected Enterprise DataStores: ${
    connectedDataStoreNames.length > 0 ? connectedDataStoreNames.join(', ') : 'None'
  }
Customer's Current Assistant System Instructions (DO NOT CONTRADICT):
${assistantInstSnippet}
Connected BYOMCP Servers, Active Tools & Connector Instructions (ONLY reference enabled tools listed here):
${JSON.stringify(attachedMcpSummary, null, 2)}

Baseline Skill Instructions:
${template.instruction}

CRITICAL HARMONY RULES:
1. Never include "ignore previous instructions" or system-prompt override phrasing.
2. Never contradict the Customer's Current Assistant System Instructions or Connector Instructions above.
3. Only reference enabled tools and connected DataStores listed above.

Return ONLY a valid JSON object matching this exact schema:
{
  "displayName": "Alphanumeric skill display name (letters, numbers, spaces, hyphens ONLY, max 60 chars, no ampersands or special characters)",
  "description": "Concise 1-2 sentence planner trigger description (100-400 chars, STRICT MAX 900 Unicode characters; Discovery Engine API rejects agent.description > 1024 chars) naming the specific domains, systems, and user intents that should activate this skill.",
  "instruction": "Rich, well-structured Markdown skill instructions with an explicit Source Routing Matrix (mapping each DataStore/MCP server to its domain intents), multi-step tool chaining workflows, query decomposition rules, and citation standards."
}`;

  const parsed = await callVertexGeminiJson<{
    displayName?: string;
    description?: string;
    instruction?: string;
  }>(prompt, config);

  const rawDescription = (parsed.description || '').trim();
  let instruction = (parsed.instruction || '').trim();
  if (!rawDescription || !instruction) {
    throw new Error('Gemini response did not include non-empty skill description and instruction.');
  }

  if (
    Array.from(rawDescription).length > 1024 &&
    !instruction.includes(rawDescription.slice(0, 120))
  ) {
    instruction = `${instruction}\n\n## Extended Trigger & Scope Details\n${rawDescription}`;
  }
  instruction = sanitizeHarmonizedSkillInstruction(
    instruction,
    template.targetSources,
    alignmentContext?.assistantSystemInstruction,
  );

  return {
    displayName: sanitizeSkillDisplayName(parsed.displayName || template.displayName),
    description: sanitizeSkillDescription(rawDescription),
    instruction,
  };
}

const BENCHMARK_QUERY_STOPWORDS = new Set([
  'search',
  'find',
  'look',
  'what',
  'when',
  'where',
  'which',
  'from',
  'with',
  'using',
  'into',
  'about',
  'latest',
  'recent',
  'active',
  'status',
  'summary',
  'summarize',
  'details',
  'detailed',
  'records',
  'items',
  'updates',
  'list',
  'show',
  'tell',
  'give',
  'please',
  'their',
  'there',
  'these',
  'those',
  'that',
  'this',
  'have',
  'does',
  'without',
  'unrelated',
]);

/**
 * Returns default benchmark test queries tailored to a recommended skill template.
 */
export function generateDefaultBenchmarkQueriesForSkill(
  template: RecommendedSkillTemplate,
): string[] {
  if (template.sampleQueries && template.sampleQueries.length >= 2) {
    return [...template.sampleQueries];
  }
  const firstSource = template.targetSources[0] || template.displayName || 'our knowledge base';
  const secondSource = template.targetSources[1] || firstSource;
  return [
    `Search ${firstSource} for the key architecture guidelines, policies, or standard operating procedures.`,
    `Find troubleshooting steps, recent updates, or reference documentation in ${secondSource}.`,
  ];
}

/**
 * Executes a set of benchmark queries against the live `:streamAssist` endpoint (`api.streamChat`)
 * and captures end-to-end latency, Time-to-First-Byte (TTFB), planner thought steps, grounded citations,
 * and source/skill routing signals.
 */
export async function runSkillBenchmarkPhase(
  queries: string[],
  config: Config,
  skillDraft: {
    skillId: string;
    displayName: string;
    description: string;
    instruction: string;
    targetSources: string[];
  },
  dataStoreResourceNames: string[] = [],
  onProgress?: (step: string) => void,
): Promise<SkillPerformanceBenchmarkPhase> {
  const cleanQueries = queries.map((q) => q.trim()).filter(Boolean);
  if (cleanQueries.length === 0) {
    throw new Error('At least one non-empty test query is required to run the performance benchmark.');
  }

  const toolsSpec =
    dataStoreResourceNames.length > 0
      ? {
          vertexAiSearchSpec: {
            dataStoreSpecs: dataStoreResourceNames.map((ds) => ({ dataStore: ds })),
          },
        }
      : undefined;

  const runs: SkillBenchmarkQueryRun[] = [];

  for (let i = 0; i < cleanQueries.length; i++) {
    const query = cleanQueries[i];
    onProgress?.(`Running query ${i + 1}/${cleanQueries.length}: "${query.slice(0, 60)}..."`);

    const startMs = Date.now();
    let firstByteMs: number | null = null;
    const thoughtSteps: string[] = [];
    let answerText = '';
    let citationsCount = 0;
    let skippedReason: string | undefined;
    let diagnosticJson = '';
    let errorMessage: string | undefined;

    try {
      await api.streamChat(
        null,
        query,
        null,
        config,
        '',
        (chunk) => {
          if (chunk.answer?.diagnosticInfo) {
            try {
              diagnosticJson += JSON.stringify(chunk.answer.diagnosticInfo) + ' ';
            } catch {
              // Ignore circular serialization issues in diagnostic trace
            }
          }
          const skipped = chunk.answer?.assistSkippedReasons;
          if (Array.isArray(skipped) && skipped.length > 0) {
            skippedReason = skipped.join(', ');
          }

          if (chunk.answer?.replies) {
            for (const reply of chunk.answer.replies) {
              const refs = reply.groundedContent?.textGroundingMetadata?.references;
              if (Array.isArray(refs)) {
                citationsCount += refs.length;
              }
              const replyContent = reply.groundedContent?.content || reply.content;
              if (replyContent) {
                if (firstByteMs === null && (replyContent.text || replyContent.thought)) {
                  firstByteMs = Math.max(1, Date.now() - startMs);
                }
                if (replyContent.thought && replyContent.text) {
                  thoughtSteps.push(replyContent.text);
                } else if (replyContent.text) {
                  answerText += replyContent.text;
                }
              }
            }
          }
        },
        toolsSpec,
      );
    } catch (err: unknown) {
      errorMessage = toErrorMessage(err, 'Failed to execute :streamAssist query.');
    }

    const totalLatencyMs = Math.max(1, Date.now() - startMs);
    const ttfbMs = firstByteMs !== null ? firstByteMs : totalLatencyMs;

    const combinedTrace = `${thoughtSteps.join(' ')} ${diagnosticJson}`.toLowerCase();
    const routedSources = skillDraft.targetSources.filter((src) =>
      combinedTrace.includes(src.toLowerCase()),
    );

    const skillNameLower = skillDraft.displayName.trim().toLowerCase();
    const skillIdLower = skillDraft.skillId.trim().toLowerCase();
    const mentionsSkill =
      (skillNameLower.length >= 4 && combinedTrace.includes(skillNameLower)) ||
      (skillIdLower.length >= 4 && combinedTrace.includes(skillIdLower));

    const skillTriggered =
      !errorMessage &&
      !skippedReason &&
      (mentionsSkill || routedSources.length > 0 || (thoughtSteps.length > 0 && citationsCount > 0));

    runs.push({
      query,
      totalLatencyMs,
      ttfbMs,
      answerPreview: answerText.trim().slice(0, 320),
      thoughtSteps,
      citationsCount,
      routedSources,
      skillTriggered,
      ...(skippedReason ? { skippedReason } : {}),
      ...(errorMessage ? { errorMessage } : {}),
    });
  }

  const avgLatencyMs = Math.round(
    runs.reduce((sum, r) => sum + r.totalLatencyMs, 0) / Math.max(1, runs.length),
  );
  const avgTtfbMs = Math.round(
    runs.reduce((sum, r) => sum + r.ttfbMs, 0) / Math.max(1, runs.length),
  );
  const triggeredCount = runs.filter((r) => r.skillTriggered).length;
  const skillTriggerRate = Math.round((triggeredCount / Math.max(1, runs.length)) * 100);

  return {
    ranAt: new Date().toISOString(),
    runs,
    avgLatencyMs,
    avgTtfbMs,
    skillTriggerRate,
  };
}

/**
 * Analyzes Before vs. After `:streamAssist` latency and inspects the drafted Skill's
 * Trigger Description and Markdown Instructions to identify concrete mistakes (including
 * cross-instruction conflicts with the Assistant or Connectors) when performance did not
 * improve or when the Skill failed to trigger.
 */
export function diagnoseSkillPerformanceAndMistakes(
  skillDraft: {
    skillId: string;
    displayName: string;
    description: string;
    instruction: string;
    targetSources: string[];
  },
  queries: string[],
  baseline?: SkillPerformanceBenchmarkPhase,
  postSkill?: SkillPerformanceBenchmarkPhase,
  conflictContext?: {
    assistantSystemInstruction?: string;
    byomcpEvaluations?: ByomcpConnectorEvaluation[];
  },
): SkillPerformanceComparisonReport {
  const mistakes: SkillDiagnosticMistake[] = [];
  const activePhase = postSkill || baseline;

  // 1. Check for failed/skipped/empty responses
  if (activePhase) {
    const failedRuns = activePhase.runs.filter(
      (r) => Boolean(r.errorMessage) || Boolean(r.skippedReason) || !r.answerPreview.trim(),
    );
    if (failedRuns.length > 0) {
      const firstFail = failedRuns[0];
      const reason =
        firstFail.errorMessage ||
        (firstFail.skippedReason
          ? `Assistant skipped query (${firstFail.skippedReason})`
          : 'Assistant returned an empty response body');
      mistakes.push({
        code: 'NO_GROUNDED_ANSWER',
        severity: firstFail.errorMessage ? 'CRITICAL' : 'WARNING',
        title: `${failedRuns.length}/${activePhase.runs.length} Benchmark Query(s) Returned No Grounded Answer`,
        explanation: `Query "${firstFail.query}" did not produce a grounded answer: ${reason}. Conversational greetings or overly restrictive negative constraints in the skill can cause :streamAssist to skip or return empty output.`,
        suggestedFix:
          'Use specific, information-seeking domain questions in your benchmark queries, and ensure your Skill instructions do not prohibit answering when partial context is found.',
      });
    }
  }

  // 2. Check Trigger Description vocabulary coverage against test queries
  const descLower = skillDraft.description.toLowerCase();
  const queryTokens = Array.from(
    new Set(
      queries
        .join(' ')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, ' ')
        .split(/\s+/)
        .filter((tok) => tok.length >= 4 && !BENCHMARK_QUERY_STOPWORDS.has(tok)),
    ),
  );
  const missingQueryTokens = queryTokens.filter((tok) => !descLower.includes(tok));
  const triggerCoverageRatio =
    queryTokens.length > 0
      ? (queryTokens.length - missingQueryTokens.length) / queryTokens.length
      : 1;
  const lowTriggerRate = postSkill ? postSkill.skillTriggerRate < 50 : false;

  if (
    skillDraft.description.trim().length < 40 ||
    (missingQueryTokens.length >= 2 && (triggerCoverageRatio < 0.45 || lowTriggerRate))
  ) {
    const missingPreview = missingQueryTokens.slice(0, 6).join(', ');
    const baseDesc = sanitizeSkillDescription(skillDraft.description.trim(), 900).replace(
      /\.$/,
      '',
    );
    const patchedDescription = sanitizeSkillDescription(
      missingQueryTokens.length > 0
        ? `${baseDesc}. Trigger on queries involving ${missingQueryTokens.slice(0, 6).join(', ')}.`
        : `${baseDesc} across ${skillDraft.targetSources.join(', ') || 'connected enterprise sources'}.`,
    );

    mistakes.push({
      code: 'TRIGGER_VOCABULARY_MISMATCH',
      severity: lowTriggerRate ? 'CRITICAL' : 'WARNING',
      title: 'Trigger Description Missing Domain Keywords from Test Queries',
      explanation: `The Discovery Engine planner decides whether to activate "${skillDraft.displayName}" primarily by matching user query vocabulary against the Skill's Trigger Description. ${
        missingPreview
          ? `Key terms from your test queries (${missingPreview}) are absent from the Trigger Description`
          : 'Your Trigger Description is under 40 characters'
      }, which can cause the planner to bypass this Skill entirely.`,
      suggestedFix: `Add explicit domain nouns, system names, and user intents (${
        missingPreview || 'target source keywords'
      }) to the Trigger Description so the planner routes matching prompts to this Skill.`,
      recommendedDescriptionPatch: patchedDescription,
    });
  }

  // 3. Check Skill Instructions for Fan-Out Anti-Patterns or Missing Single-Source Directive
  const instText = skillDraft.instruction.trim();
  const hasFanoutAntiPattern = FANOUT_ANTI_PATTERN_REGEX.test(instText);
  const hasSingleSourceDirective =
    /\b(intent-first|single most authoritative|primary authoritative source first|do not fan out|prioritize\b.*?\bover)\b/i.test(
      instText,
    );

  if (hasFanoutAntiPattern || !hasSingleSourceDirective) {
    const appendRule = `\n\n## Single-Source First & Fan-Out Prevention Rule\n- **Intent-First Source Selection**: Route each user query to the single most authoritative DataStore or MCP tool first. Do NOT fan out across all connected DataStores simultaneously unless the user explicitly asks for a cross-system comparison.`;
    mistakes.push({
      code: 'BROAD_FANOUT_INSTRUCTION',
      severity: hasFanoutAntiPattern ? 'CRITICAL' : 'WARNING',
      title: hasFanoutAntiPattern
        ? 'Skill Instructions Contain Broad Multi-Store Fan-Out Directive'
        : 'Skill Instructions Lack an Explicit "Single-Source First" Routing Rule',
      explanation: hasFanoutAntiPattern
        ? 'Your Skill instructions explicitly tell the Assistant to search across all sources/datastores. This forces parallel/sequential fan-out across every connected connector and increases end-to-end latency.'
        : 'Your Skill instructions do not explicitly instruct the planner to query the single most authoritative source first and avoid multi-store fan-out.',
      suggestedFix:
        'Remove any "search all sources" phrasing and add an explicit Single-Source First routing rule so the planner stops after querying the primary store.',
      recommendedInstructionAppend: appendRule,
    });
  }

  // 4. Check if targetSources are missing from Skill Instructions
  const instLower = instText.toLowerCase();
  const unmentionedSources = skillDraft.targetSources.filter(
    (src) => src.trim().length > 0 && !instLower.includes(src.toLowerCase()),
  );
  if (unmentionedSources.length > 0) {
    const sourceBullets = unmentionedSources
      .map((s) => `- **\`${s}\`**: Route domain queries targeting \`${s}\` directly to this source.`)
      .join('\n');
    mistakes.push({
      code: 'MISSING_TARGET_SOURCE_IDENTIFIER',
      severity: 'WARNING',
      title: `${unmentionedSources.length} Target Source ID(s) Omitted from Skill Instructions`,
      explanation: `Target source identifier(s) (${unmentionedSources.join(', ')}) do not appear in your Skill Markdown Instructions. When exact DataStore/MCP IDs are omitted, the planner has to guess which backend store corresponds to your prose rules.`,
      suggestedFix: `Include the exact source identifier(s) (${unmentionedSources.join(', ')}) in the Skill's Source Routing Matrix.`,
      recommendedInstructionAppend: `\n\n## Explicit Source Identifiers\n${sourceBullets}`,
    });
  }

  // 5. Check for thin/vague instructions
  if (instText.length < 160) {
    mistakes.push({
      code: 'THIN_OR_VAGUE_INSTRUCTION',
      severity: 'WARNING',
      title: `Skill Instructions Are Too Brief (${instText.length} chars)`,
      explanation:
        'Skills with fewer than 160 characters rarely provide enough concrete routing criteria, parameter constraints, or query decomposition rules to reduce planner latency.',
      suggestedFix:
        'Use "✨ Tailor with Gemini" or expand the instructions with concrete source routing bullets and filter rules.',
    });
  }

  // 5B. Check for Cross-Resource Instruction Conflicts (Assistant System Instructions, Connector Tools, or System-Override Phrasing)
  const combinedSkillText = `${skillDraft.description}\n${instText}`;
  if (SYSTEM_OVERRIDE_ANTIPATTERN_REGEX.test(combinedSkillText)) {
    mistakes.push({
      code: 'SKILL_INSTRUCTION_CONFLICT',
      severity: 'CRITICAL',
      title: 'Skill Contains System-Prompt Override Anti-Pattern',
      explanation:
        'Your Skill contains "ignore previous/system instructions" or guardrail-override phrasing. This conflicts with the Assistant’s system framing and can trigger Model Armor Prompt Injection & Jailbreak blocks.',
      suggestedFix:
        'Remove any "ignore previous/system instructions" phrasing and state domain routing rules as additive guidelines.',
    });
  } else if (conflictContext) {
    const sysInst = conflictContext.assistantSystemInstruction || '';
    const disabledToolsInDraft: string[] = [];
    for (const mcp of conflictContext.byomcpEvaluations || []) {
      const mentionsMcp =
        instLower.includes(mcp.collectionId.toLowerCase()) ||
        skillDraft.targetSources.includes(mcp.collectionId);
      if (mentionsMcp) {
        mcp.tools.forEach((t) => {
          if (!t.enabled && t.name.length >= 4 && instLower.includes(t.name.toLowerCase())) {
            disabledToolsInDraft.push(`${t.name} (${mcp.displayName})`);
          }
        });
      }
    }
    if (disabledToolsInDraft.length > 0) {
      mistakes.push({
        code: 'SKILL_INSTRUCTION_CONFLICT',
        severity: 'WARNING',
        title: `Skill References Disabled Connector Tool(s) (${disabledToolsInDraft.slice(0, 3).join(', ')})`,
        explanation: `Your Skill instructions explicitly reference tool(s) (${disabledToolsInDraft.join(', ')}) that are currently disabled on the connector. The planner will waste deliberation steps attempting to resolve unavailable tools.`,
        suggestedFix:
          'Either enable the referenced tool(s) on the connector or restrict the Skill instructions to currently enabled tools.',
        recommendedInstructionAppend: `\n\n## Active Tool & Instruction Harmony Rule\n- Invoke ONLY currently enabled connector tools and respect the Assistant's global system persona and formatting constraints.`,
      });
    } else if (
      sysInst &&
      /\b(never\s+use\s+(?:markdown\s+)?tables?|plain\s+text\s+only|json\s+only)\b/i.test(
        sysInst,
      ) &&
      /\b(markdown\s+tables?)\b/i.test(instText)
    ) {
      mistakes.push({
        code: 'SKILL_INSTRUCTION_CONFLICT',
        severity: 'WARNING',
        title: 'Skill Output Formatting Conflicts with Assistant System Instructions',
        explanation:
          'Your Skill instructs rendering Markdown tables, while the Assistant’s global System Instructions specify plain-text/JSON-only or forbid tables.',
        suggestedFix:
          'Align the Skill output formatting rule with the Assistant’s global System Instructions.',
        recommendedInstructionAppend: `\n\n## Assistant System Instruction Alignment\n- Follow the Assistant's global System & Style Instructions for response formatting whenever a formatting rule is specified globally.`,
      });
    }
  }

  let latencyDeltaMs: number | undefined;
  let latencyDeltaPercent: number | undefined;
  let ttfbDeltaMs: number | undefined;
  let improved = false;
  let verdictSummary = '';

  if (baseline && postSkill) {
    latencyDeltaMs = postSkill.avgLatencyMs - baseline.avgLatencyMs;
    latencyDeltaPercent = Math.round(
      (latencyDeltaMs / Math.max(1, baseline.avgLatencyMs)) * 100,
    );
    ttfbDeltaMs = postSkill.avgTtfbMs - baseline.avgTtfbMs;

    // 6. Check for Behavioral Grounding / Citation Drop after enabling Skill
    const baseCitations = baseline.runs.reduce((s, r) => s + r.citationsCount, 0);
    const postCitations = postSkill.runs.reduce((s, r) => s + r.citationsCount, 0);
    if (baseCitations > 0 && postCitations === 0) {
      mistakes.push({
        code: 'BEHAVIORAL_GROUNDING_CONFLICT',
        severity: 'WARNING',
        title: `Grounding Citations Dropped from ${baseCitations} (Skill Disabled) to 0 (Skill Enabled)`,
        explanation: `When the Skill was disabled during Baseline testing, :streamAssist returned ${baseCitations} grounded citation(s), but after enabling the Skill, 0 citations were returned. Overly restrictive filter constraints or conflicting source routing rules in the Skill prevented the connector from returning grounded matches.`,
        suggestedFix:
          'Add a Fallback Broadened Retrieval rule so that if strict filter parameters return 0 hits, the Assistant immediately falls back to semantic keyword retrieval on the target store.',
        recommendedInstructionAppend: `\n\n## Fallback Grounding & Connector Compatibility Rule\n- **Graceful Filter Fallback**: If a strictly filtered query returns 0 matching documents or records, immediately fall back to a concise semantic keyword query against the same primary DataStore so grounded citations are preserved.`,
      });
    }

    // 7. Check for latency regression after skill deployment
    if (latencyDeltaMs > 0 && postSkill.avgLatencyMs > baseline.avgLatencyMs * 1.05) {
      const baseThoughts = baseline.runs.reduce((s, r) => s + r.thoughtSteps.length, 0);
      const postThoughts = postSkill.runs.reduce((s, r) => s + r.thoughtSteps.length, 0);
      mistakes.push({
        code: 'LATENCY_REGRESSION_MULTI_HOP',
        severity: latencyDeltaPercent >= 20 ? 'CRITICAL' : 'WARNING',
        title: `Post-Skill Latency Increased by +${latencyDeltaMs.toLocaleString()} ms (+${latencyDeltaPercent}%)`,
        explanation:
          postThoughts > baseThoughts
            ? `After deploying the Skill, planner thought steps increased from ${baseThoughts} to ${postThoughts}, indicating the Skill instructions caused multi-hop deliberation or sequential tool chaining.`
            : `Average query latency increased from ${baseline.avgLatencyMs.toLocaleString()} ms to ${postSkill.avgLatencyMs.toLocaleString()} ms. Complex multi-step rules or ambiguous source mapping can add extra planner turns.`,
        suggestedFix:
          'Add a "Direct Single-Hop Execution" constraint instructing the planner to execute at most 1 targeted retrieval call before synthesizing the final response.',
        recommendedInstructionAppend: `\n\n## Direct Single-Hop Execution Constraint\n- **Single-Turn Retrieval**: Execute at most ONE targeted retrieval/tool call against the primary matching source and synthesize the answer immediately. Do not chain secondary verification searches when the first call returns relevant results.`,
      });
    }

    improved = latencyDeltaMs < 0 && mistakes.filter((m) => m.severity === 'CRITICAL').length === 0;
    if (latencyDeltaMs < 0) {
      verdictSummary = `Performance improved by ${Math.abs(latencyDeltaPercent)}% (${Math.abs(
        latencyDeltaMs,
      ).toLocaleString()} ms faster average response, ${
        postSkill.skillTriggerRate
      }% skill/source routing match).`;
    } else if (latencyDeltaMs === 0) {
      verdictSummary = `Average latency unchanged (${postSkill.avgLatencyMs.toLocaleString()} ms). Review any diagnostic suggestions below to tighten source routing.`;
    } else {
      verdictSummary = `Post-skill average latency was +${latencyDeltaMs.toLocaleString()} ms (+${latencyDeltaPercent}%) slower than baseline. Review the ${mistakes.length} diagnostic finding(s) below to fix the Skill configuration.`;
    }
  } else if (postSkill) {
    improved =
      postSkill.skillTriggerRate >= 50 &&
      mistakes.filter((m) => m.severity !== 'INFO').length === 0;
    verdictSummary = `Post-skill benchmark completed: ${postSkill.avgLatencyMs.toLocaleString()} ms avg latency (${postSkill.avgTtfbMs.toLocaleString()} ms TTFB), ${postSkill.skillTriggerRate}% skill routing rate.${
      mistakes.length > 0
        ? ` Found ${mistakes.length} potential Skill issue(s) to review.`
        : ' No Skill configuration mistakes detected.'
    }`;
  } else if (baseline) {
    verdictSummary = `Baseline (Before Skill) recorded: ${baseline.avgLatencyMs.toLocaleString()} ms avg latency (${baseline.avgTtfbMs.toLocaleString()} ms TTFB). Deploy the Skill and run "2. Test After Skill" to measure improvement.`;
  }

  return {
    skillId: skillDraft.skillId,
    baseline,
    postSkill,
    latencyDeltaMs,
    latencyDeltaPercent,
    ttfbDeltaMs,
    improved,
    verdictSummary,
    mistakes,
  };
}


