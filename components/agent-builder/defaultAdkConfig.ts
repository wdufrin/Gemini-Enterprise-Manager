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

import { AdkAgentConfig } from '../../services/adkTemplates';

export const DEFAULT_ADK_CONFIG: AdkAgentConfig = {
  adkVersion: '1.35.1',
  name: '',
  description: 'An agent that can do awesome things.',
  model: 'gemini-2.5-flash',
  instruction: 'You are an awesome and helpful agent.',
  tools: [],
  useGoogleSearch: false,
  enableOAuth: false,
  authId: 'temp_oauth',
  allowAdcFallback: true,
  enableDiscoveryApi: false,
  discoveryConfig: {
    projectId: '',
    location: 'global',
    collection: 'default_collection',
    engineId: '',
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
  enableTelemetry: true,
  enableMessageLogging: false,
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
  enableEvaluation: false,
  enableCiCd: false,
  ciCdRunner: 'none',
  deploymentTarget: 'agent_engine',
  cloudRunAccess: 'authenticated',
  githubWifProvider: '',
  githubServiceAccount: '',
  customMcpEndpoints: [],
};
