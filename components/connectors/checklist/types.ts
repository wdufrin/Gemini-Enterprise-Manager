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

export type ProbeType =
  | 'IAM_PERMISSION_CHECK'
  | 'MCP_CONNECTIVITY'
  | 'CONNECTOR_STATUS'
  | 'OAUTH_CONFIG_VALIDITY';

export interface ChecklistProbeConfig {
  type: ProbeType;
  requiredPermissions?: string[];
  description?: string;
  expectedState?: string;
}

export type ChecklistBadge = 'Required' | 'Optional' | 'Recommended' | 'Automated' | 'Live KB Verified';

export interface ChecklistItemDefinition {
  id: string;
  label: string;
  subLabel?: string;
  description?: string;
  badge?: ChecklistBadge;
  appliesToMode?: 'ALL' | 'INGESTION' | 'FEDERATED' | 'ACTIONS';
  documentationUrl?: string;
  codeSnippet?: string;
  automatedProbe?: ChecklistProbeConfig;
  isLiveDocUpdate?: boolean;
  isActionRequirement?: boolean;
}

export interface ChecklistSectionDefinition {
  id: string;
  title: string;
  stepNumber: number;
  description?: string;
  items: ChecklistItemDefinition[];
}

export interface ConnectorChecklistDefinition {
  vendorId: string;
  vendorDisplayName: string;
  category?: string;
  detectionPatterns: {
    dataSources?: string[];
    nameSubstrings?: string[];
    typeSubstrings?: string[];
  };
  supportsDataModeToggle: boolean;
  supportsActions?: boolean;
  documentationUrl?: string;
  sections: ChecklistSectionDefinition[];
  syncSource?: 'BUNDLED' | 'LIVE_KB' | 'CACHED';
  lastSyncedAt?: string;
}

export interface ProbeExecutionResult {
  status: 'pass' | 'fail' | 'warning' | 'running';
  message: string;
  details?: unknown;
  executedAt: string;
}

export interface ConnectorChecklistState {
  connectorName: string;
  lastUpdated: string;
  updatedBy?: string;
  checkedItems: Record<string, boolean>;
  probeResults?: Record<string, ProbeExecutionResult>;
}
