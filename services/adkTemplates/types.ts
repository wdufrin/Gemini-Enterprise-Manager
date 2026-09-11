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

export interface AgentTool {
  type: "VertexAiSearchTool" | "A2AClientTool";
  dataStoreId?: string;
  url?: string;
  variableName: string;
  displayName?: string;
}

export interface A2aConfig {
  serviceName: string;
  displayName: string;
  providerOrganization: string;
  model: string;
  region: string;
  memory: string;
  instruction: string;
  allowUnauthenticated: boolean;
  enableCors: boolean;
  useGoogleSearch: boolean;
  tools: AgentTool[];
}

export interface DiscoveryConfig {
  projectId: string;
  location: string;
  collection: string;
  engineId: string;
  dataStoreIds: string;
}

export interface AdkAgentConfig {
  adkVersion?: "1.35.1" | "2.2";
  name: string;
  description: string;
  model: string;
  instruction: string;
  tools: AgentTool[];
  useGoogleSearch: boolean;
  enableOAuth: boolean;
  authId: string;
  allowAdcFallback: boolean;
  enableDiscoveryApi: boolean;
  discoveryConfig: DiscoveryConfig;
  enableBqAnalytics: boolean;
  bqDatasetId: string;
  bqTableId: string;
  enableThinking: boolean;
  thinkingBudget: number;
  thinkingLevel: string;
  enableStreaming: boolean;
  enableBigQueryMcp: boolean;
  enableCodeExecution: boolean;
  enableGraphvizRendering: boolean;
  enableEmailTool: boolean;
  enableSecurityCommandCenterApi: boolean;
  enableRecommenderApi: boolean;
  enableServiceHealthApi: boolean;
  enableNetworkManagementApi: boolean;
  enableCloudAssistApi: boolean;
  enableCloudLoggingApi: boolean;
  enableCloudMonitoringApi: boolean;
  enableCloudRunApi: boolean;
  enableResourceManagerApi: boolean;
  enableAdminActivityApi: boolean;
  enableDatabaseFleetApi: boolean;
  enableCloudLoggingMcp: boolean;
  enableBigtableAdminMcp: boolean;
  enableCloudSqlMcp: boolean;
  enableCloudMonitoringMcp: boolean;
  enableComputeEngineMcp: boolean;
  enableFirestoreMcp: boolean;
  enableGkeMcp: boolean;
  enableResourceManagerMcp: boolean;
  enableSpannerMcp: boolean;
  enableDeveloperKnowledgeMcp: boolean;
  enableMapsGroundingMcp: boolean;
  enableTelemetry: boolean;
  enableMessageLogging: boolean;
  enableEvaluation: boolean;
  enableCiCd: boolean;
  ciCdRunner: "github_actions" | "google_cloud_build" | "none";
  deploymentTarget: "agent_engine" | "cloud_run";
  githubWifProvider?: string;
  githubServiceAccount?: string;
  customMcpEndpoints: { name: string; url: string }[];
}

export const ADK_TABS = [
  { id: "agent", label: "agent.py" },
  { id: "deploy_re", label: "deploy_re.py" },
  { id: "env", label: ".env" },
  { id: "requirements", label: "requirements.txt" },
  { id: "readme", label: "README.md" },
  { id: "auth", label: "auth.py" },
  { id: "tools", label: "tools.py" },
] as const;

export const A2A_TABS = [
  { id: "main", label: "main.py" },
  { id: "dockerfile", label: "Dockerfile" },
  { id: "requirements", label: "requirements.txt" },
  { id: "env", label: "env.yaml" },
] as const;
