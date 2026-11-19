/**
 * Copyright 2024 Google LLC
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

import { Config, DataConnector } from '../../../types';

export interface McpToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface DynamicToolItem {
  name: string;
  displayName?: string;
  description?: string;
  enabled: boolean;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: McpToolAnnotations;
  hitlMode?: string;
}

export interface CustomParamItem {
  key: string;
  value: string;
}

export interface BYOMCPConfigTabProps {
  connector: DataConnector;
  config: Config;
  onConnectorUpdated?: (updatedConnector: DataConnector) => void;
  onRefreshSuccess?: () => void;
}

export interface InstructionPreset {
  name: string;
  description: string;
  instructions: string;
  serverDescription: string;
  dynamicTools?: DynamicToolItem[];
}

export const INSTRUCTION_PRESETS: InstructionPreset[] = [
  {
    name: 'Enterprise Search',
    description: 'Executive summary, grouped results by source system, citations & quotes',
    instructions: `FORMATTING INSTRUCTIONS FOR SEARCH RESULTS:
1. When presenting retrieved information, always provide a concise executive summary first.
2. Group results by source system (e.g., Google Docs, Slack, Jira, Confluence).
3. For each item, include: [Document Title](URL), Author, and Last Modified Date.
4. Use blockquotes for exact quotes or excerpts from the source documents.
5. If multiple sources contain conflicting information, highlight the discrepancies.`,
    serverDescription: 'Enterprise search server to search across company docs, tickets, and communications.',
  },
  {
    name: 'Database / SQL Query Server',
    description: 'Schema verification, structured tabular output, result limits, and trend insights',
    instructions: `FORMATTING INSTRUCTIONS FOR DATABASE QUERY RESULTS:
1. Inspect the database schema and verify table/column names before executing queries.
2. Limit query results to 50 rows unless explicitly requested by the user.
3. Present multi-row query results in a clear, aligned tabular or structured list format (always respecting the Assistant's global formatting instructions if plain text or JSON is requested).
4. Provide a brief analytical commentary highlighting key numbers, trends, or outliers.
5. Never execute destructive DDL/DML statements (DROP, DELETE, TRUNCATE) without confirmation.`,
    serverDescription: 'MCP database server for inspecting schemas and executing analytical queries.',
  },
  {
    name: 'Issue Tracker & Project Management',
    description: 'Issue hierarchy, assignee details, status badges, and action items',
    instructions: `FORMATTING INSTRUCTIONS FOR PROJECT / ISSUE MANAGEMENT:
1. Clearly display Issue Key, Summary, Status, Priority, and Assignee.
2. Group tickets by project or epic hierarchy where applicable.
3. Highlight blocking issues or overdue items with explicit warning callouts.
4. Include clickable direct links to the issue tracking system.`,
    serverDescription: 'MCP issue tracker server for searching and managing project tasks and bugs.',
  },
  {
    name: 'General Enterprise Knowledge Server',
    description: 'General purpose tool output formatting with citations and source linking',
    instructions: `FORMATTING INSTRUCTIONS FOR MCP TOOLS:
1. Clearly identify which MCP tool was invoked to retrieve the information.
2. Present results objectively with concise summaries and source citations.
3. Provide direct reference links to documents or entities when available.
4. If an error or empty result occurs, provide a helpful diagnostic explanation.`,
    serverDescription: 'Custom MCP server for enterprise search and workflow integration.',
  },
];

export interface CitationMappingRuleItem {
  toolName: string;
  items: string;
  itemsIsRoot?: boolean;
  uri: string;
  title: string;
  snippet: string;
  id: string;
}

export const OAUTH_ACTION_PARAM_KEYS = new Set([
  'instance_uri',
  'auth_type',
  'auth_key',
  'scopes',
  'auth_uri',
  'token_uri',
  'auth_uri_params',
  'client_id',
  'client_secret',
  'refresh_token',
  'pkce_support_enabled',
  'client_secret_basic_override',
]);

export const VPC_EGRESS_ACTION_PARAM_KEYS = new Set([
  'use_agent_gateway_egress',
  'agent_gateway_engine',
  'egress_fqdns',
]);

export const SYSTEM_MANAGED_ACTION_PARAM_KEYS = new Set([
  'mcp_server_source',
  'registry_mcp_server_name',
  'requires_prod_creds',
  'tool_list',
]);

export const KNOWN_ACTION_PARAM_KEYS = new Set([
  'mcp_server_description',
  'mcp_agent_instructions',
  'citation_mappings',
  ...OAUTH_ACTION_PARAM_KEYS,
  ...VPC_EGRESS_ACTION_PARAM_KEYS,
  ...SYSTEM_MANAGED_ACTION_PARAM_KEYS,
]);

export interface ByomcpAuthBridgeState {
  pkceSupportEnabled: boolean;
  setPkceSupportEnabled: (val: boolean) => void;
  clientSecretBasicOverride: boolean;
  setClientSecretBasicOverride: (val: boolean) => void;
}

export interface ByomcpAdvancedBridgeState {
  useAgentGatewayEgress: boolean;
  setUseAgentGatewayEgress: (val: boolean) => void;
  agentGatewayEngine: string;
  setAgentGatewayEngine: (val: string) => void;
  egressFqdns: string;
  setEgressFqdns: (val: string) => void;
  serviceDirectoryServiceName: string;
  setServiceDirectoryServiceName: (val: string) => void;
}

const authBridgeMap = new WeakMap<object, ByomcpAuthBridgeState>();
const advancedBridgeMap = new WeakMap<object, ByomcpAdvancedBridgeState>();

export function registerByomcpAuthBridge(
  keys: ReadonlyArray<object | undefined>,
  state: ByomcpAuthBridgeState
): void {
  keys.forEach((k) => {
    if (k && (typeof k === 'object' || typeof k === 'function')) {
      authBridgeMap.set(k, state);
    }
  });
}

export function getByomcpAuthBridge(
  ...keys: ReadonlyArray<object | undefined>
): ByomcpAuthBridgeState | undefined {
  for (const k of keys) {
    if (k && (typeof k === 'object' || typeof k === 'function')) {
      const found = authBridgeMap.get(k);
      if (found) return found;
    }
  }
  return undefined;
}

export function registerByomcpAdvancedBridge(
  keys: ReadonlyArray<object | undefined>,
  state: ByomcpAdvancedBridgeState
): void {
  keys.forEach((k) => {
    if (k && (typeof k === 'object' || typeof k === 'function')) {
      advancedBridgeMap.set(k, state);
    }
  });
}

export function getByomcpAdvancedBridge(
  ...keys: ReadonlyArray<object | undefined>
): ByomcpAdvancedBridgeState | undefined {
  for (const k of keys) {
    if (k && (typeof k === 'object' || typeof k === 'function')) {
      const found = advancedBridgeMap.get(k);
      if (found) return found;
    }
  }
  return undefined;
}

