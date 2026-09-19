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

// FIX: Replaced incorrect component code with proper type definitions.
export enum Page {
  AGENTS = 'GE Agent Manager',
  SKILLS_REGISTRY = 'Skills Registry',
  ASSISTANT = 'Engines & Assistants',
  AUTHORIZATIONS = 'Authorizations',
  AGENT_PERMISSIONS = 'Agent Permissions',
  AGENT_ENGINES = 'Agent Runtimes',
  A2A_TESTER = 'A2A Tester',
  AGENT_BUILDER = 'ADK Studio',
  CLOUD_RUN_AGENTS = 'Cloud Run Agents',
  DIALOGFLOW_AGENTS = 'Dialogflow Agents',
  CHAT = 'Test G.E. Agent',
  DATA_STORES = 'Connectors & Data Stores',
  MCP_SERVERS = 'MCP Servers',
  MODEL_ARMOR = 'Model Armor',
  OBSERVABILITY = 'Observability',
  BACKUP_RECOVERY = 'Backup & Recovery',
  ARCHITECTURE = 'Architecture',
  LICENSE = 'Licenses',
  GE_QUOTA_USAGE = 'Quota & Cost Estimator',
  CONFIG_AUDIT = 'App Config Audit',
}

export type SortableAgentKey = 'displayName' | 'state' | 'name' | 'updateTime' | 'agentType';
export type SortDirection = 'asc' | 'desc';

export interface UserProfile { name: string; email: string; picture: string; oid?: string; }

export interface SortConfig { key: SortableAgentKey; direction: SortDirection; }

export interface Config {
  projectId: string;
  appLocation: string;
  collectionId: string;
  appId: string;
  assistantId?: string;
  dataStoreId?: string;
  reasoningEngineLocation?: string;
  reasoningEngineId?: string;
  suppressErrorLog?: boolean;
}

export interface ResolvedModel {
  modelId?: string; // Optional because "Auto" has no modelId
  displayName: string;
  icon?: string;
  description?: string;
  isPreview?: boolean;
  adminView?: {
    adminOverridable?: boolean;
    enabledByDefault?: boolean;
    regions?: string[];
  };
}

export interface ModelConfigInfo {
  resolvedModels?: ResolvedModel[];
  defaultModelId?: string;
}

export interface WidgetConfig {
  name: string;
  accessSettings?: {
    enableWebApp?: boolean;
    workforceIdentityPoolProvider?: string;
    [key: string]: unknown;
  };
  uiSettings?: {
    enableAutocomplete?: boolean;
    enableQualityFeedback?: boolean;
    features?: Record<string, string>;
    modelConfigs?: Record<string, string>;
    modelConfigInfo?: ModelConfigInfo;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface StarterPrompt { text: string; }

export interface CannedQuery {
  name: string;
  displayName?: string;
  enabled?: boolean;
  googleDefined?: boolean;
  defaultTexts?: { title?: string; description?: string };
  [key: string]: unknown;
}

export interface AuthorizationConfig {
  oauth2ClientId?: string; // Made optional as it might be replaced by toolAuthorizations
  toolAuthorizations?: string[];
}

export interface LowCodeAgentDefinition {
  nodes?: { llmAgentNode?: { model?: string; [key: string]: unknown }; [key: string]: unknown }[];
  deployedNodes?: { llmAgentNode?: { model?: string; [key: string]: unknown }; [key: string]: unknown }[];
  [key: string]: unknown;
}

export interface WorkflowAgentDefinition {
  agentFlow?: {
    nodes?: { agentNode?: { model?: string; [key: string]: unknown }; [key: string]: unknown }[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface Agent {
  name: string;
  id?: string;
  displayName: string;
  description?: string;
  icon?: { uri: string };
  starterPrompts?: StarterPrompt[];
  adkAgentDefinition?: {
    toolSettings?: { toolDescription: string };
    provisionedReasoningEngine?: { reasoningEngine: string };
  };
  a2aAgentDefinition?: { jsonAgentCard: string };
  lowCodeAgentDefinition?: LowCodeAgentDefinition;
  managedAgentDefinition?: Record<string, unknown>;
  workflowAgentDefinition?: WorkflowAgentDefinition;
  skillAgentDefinition?: SkillAgentDefinition;
  authorizations?: string[]; // Deprecated
  authorizationConfig?: AuthorizationConfig;
  observabilityConfig?: {
    observabilityEnabled?: boolean;
    sensitiveLoggingEnabled?: boolean;
  };
  entitlements?: unknown[];
  iamPolicy?: IamPolicy;
  state?: 'ENABLED' | 'DISABLED' | 'PRIVATE' | 'CONFIGURED' | 'DEPLOYING' | 'DEPLOYMENT_FAILED' | 'SUSPENDED' | 'CREATING' | 'CREATION_FAILED' | string;
  sharingConfig?: { scope?: 'RESTRICTED' | 'ALL_USERS' | string };
  createTime?: string;
  updateTime?: string;
  agentType?: string;
  agentOrigin?: string;
}

export interface AgentViewResponse {
  agentView?: {
    agentType?: string;
    agentOrigin?: string;
    [key: string]: unknown;
  };
  agent?: Agent;
  [key: string]: unknown;
}

export interface Oauth2Config {
    clientId: string;
    clientSecret?: string; // Often write-only
    authorizationUri: string;
    tokenUri: string;
}

export interface Authorization {
  name: string;
  displayName?: string;
  serverSideOauth2?: Oauth2Config;
  serverClientId?: string;
}

export interface ReasoningEngine {
  name: string;
  displayName: string;
  sessionCount?: number;
  spec?: {
    packageSpec?: {
      pickleObjectGcsUri?: string;
      dependencyFilesGcsUri?: string;
      requirementsGcsUri?: string;
      pythonVersion?: string;
    };
    deploymentSpec?: {
      env?: EnvVar[];
    };
    agentFramework?: string;
  };
  createTime?: string;
  updateTime?: string;
}

export interface DialogflowAgent {
  name: string;
  displayName: string;
  description?: string;
  avatarUri?: string;
  timeZone?: string;
  defaultLanguageCode?: string;
  createTime?: string;
  updateTime?: string;
  startFlow?: string;
  startPlaybook?: string;
  genAppBuilderSettings?: { engine?: string };
  speechToTextSettings?: { enableSpeechAdaptation?: boolean };
  advancedSettings?: {
    loggingSettings?: Record<string, unknown>;
    speechSettings?: Record<string, unknown>;
    audioExportGcsDestination?: Record<string, unknown>;
  };
}

export interface PlanPart {
  executableCode?: { code: string };
  codeExecutionResult?: { output?: string };
  [key: string]: unknown;
}

export interface PlannerStep {
  planStep?: {
    parts?: PlanPart[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface CitationItem {
  documentMetadata?: {
    document?: string;
  };
  [key: string]: unknown;
}

export interface GroundingChunkItem {
  retrieved_context?: {
    document_name?: string;
  };
  [key: string]: unknown;
}

export interface GroundingMetadataItem {
  grounding_chunks?: GroundingChunkItem[];
  [key: string]: unknown;
}

export interface AnswerDetails {
  diagnostics?: {
    plannerSteps?: PlannerStep[];
    [key: string]: unknown;
  } | Record<string, unknown>;
  citations?: CitationItem[] | unknown[];
  groundingMetadata?: GroundingMetadataItem | Record<string, unknown>;
  [key: string]: unknown;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  answerDetails?: AnswerDetails;
}

// Types for Discovery Resources
export interface Collection {
    name: string;
    displayName?: string;
    description?: string;
    engines?: AppEngine[]; // For backup structure
    [key: string]: unknown;
}
export interface SearchEngineConfig {
  searchTier?: string;
  searchAddOns?: string[];
  requiredSubscriptionTier?: string;
  [key: string]: unknown;
}

export interface AppEngine { // Renamed from Engine to avoid conflict with ReasoningEngine
    name: string;
    displayName: string;
    solutionType?: string;
    assistants?: Assistant[]; // For backup structure
    dataStoreIds?: string[];
    // Add missing properties based on API response
    industryVertical?: string;
    appType?: string; // e.g. APP_TYPE_INTRANET
    searchEngineConfig?: SearchEngineConfig;
    observabilityConfig?: { observabilityEnabled?: boolean; sensitiveLoggingEnabled?: boolean };
  features?: Record<string, string>; // Map of feature name to 'FEATURE_STATE_ON'|'FEATURE_STATE_OFF'
  modelConfigs?: Record<string, string>; // Map of model name to 'MODEL_ENABLED'|'MODEL_DISABLED'
  mobileDeeplinkUrl?: string;
  widgetConfigConfigId?: string;
  commonConfig?: { companyName?: string; [key: string]: unknown };
  isExternalIdp?: boolean;
  cid?: string;
  disableAnalytics?: boolean;
  marketplaceAgentVisibility?: string;
  [key: string]: unknown;
}

export interface ScimTenant {
  name: string;
  displayName?: string;
  state?: string;
  serviceAgent?: string;
  baseUri?: string;
  claimMapping?: Record<string, string>;
  [key: string]: unknown;
}

export interface IdpConfig {
  idpType?: 'IDP_TYPE_UNSPECIFIED' | 'GSUITE' | 'THIRD_PARTY' | string;
  workforcePoolName?: string;
  externalIdpConfig?: {
    workforcePoolName?: string;
  };
  [key: string]: unknown;
}

export interface CustomerPolicy {
  modelArmorConfig?: {
    userPromptTemplate?: string;
    failureMode?: string;
    [key: string]: unknown;
  };
  bannedPhrases?: {
    bannedPhrases?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface AclConfig {
  name: string;
  idpConfig?: IdpConfig;
  [key: string]: unknown;
}

export interface Operation<T = Record<string, unknown>> {
  name: string;
  metadata?: Record<string, unknown>;
  done?: boolean;
  error?: {
    code?: number;
    message?: string;
    details?: unknown[];
  };
  response?: T;
}

export interface IamBinding {
  role: string;
  members?: string[];
  condition?: { title?: string; description?: string; expression?: string };
}

export interface IamPolicy {
  version?: number;
  bindings?: IamBinding[];
  etag?: string;
  auditConfigs?: unknown[];
}

export interface ServiceAccount {
  name: string;
  projectId?: string;
  uniqueId?: string;
  email: string;
  displayName?: string;
  etag?: string;
  description?: string;
  oauth2ClientId?: string;
  disabled?: boolean;
}

export interface WorkloadIdentityPool {
  name: string;
  displayName?: string;
  description?: string;
  state?: string;
  disabled?: boolean;
}

export interface WorkloadIdentityProvider {
  name: string;
  displayName?: string;
  description?: string;
  state?: string;
  disabled?: boolean;
  attributeCondition?: string;
  attributeMapping?: Record<string, string>;
  oidc?: { clientId?: string; issuerUri?: string; [key: string]: unknown };
  saml?: { entityId?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface CustomRole {
  name?: string;
  title: string;
  description?: string;
  includedPermissions: string[];
  stage?: string;
  etag?: string;
  deleted?: boolean;
}

export interface VertexAiAgentConfig {
    displayName: string;
    name: string;
    toolDescription: string;
}

export interface EnabledAction {
    actionInfo: {
        actionName: string;
        actionDisplayName: string;
    }[];
}

export interface EnabledTool {
    toolInfo: {
        toolName: string;
        toolDisplayName: string;
    }[];
}

export interface Assistant {
    name: string;
    displayName?: string;
    description?: string;
    agents?: Agent[]; // For backup structure
    styleAndFormattingInstructions?: string;
    generationConfig?: {
        systemInstruction?: {
            additionalSystemInstruction?: string;
        };
    };
    googleSearchGroundingEnabled?: boolean;
    webGroundingType?: string;
    defaultWebGroundingToggleOff?: boolean;
    customerPolicy?: CustomerPolicy;
    vertexAiAgentConfigs?: VertexAiAgentConfig[];
    enabledActions?: Record<string, EnabledAction>;
    enabledTools?: Record<string, EnabledTool>;
    vertexAiSearchToolConfig?: object;
    agentConfigs?: object[];
    enableEndUserAgentCreation?: boolean;
    disableLocationContext?: boolean;
}

export interface DataStore {
    name: string;
    displayName: string;
    industryVertical?: string;
    solutionTypes?: string[];
    contentConfig?: string;
    [key: string]: unknown;
}

export interface Document {
    name: string;
    id: string;
    displayName?: string;
    content?: {
        uri: string;
    };
    jsonData?: string;
    structData?: Record<string, unknown>;

}

export interface ModelArmorFilterResult {
  filterType?: string;
  outcome?: string;
  matchMetadata?: unknown;
  [key: string]: unknown;
}

export interface ModelArmorSanitizationResult {
  filterResults?: ModelArmorFilterResult[] | Record<string, unknown>;
  sanitizationVerdict?: string;
  sanitizationVerdictReason?: string;
  [key: string]: unknown;
}

export interface ModelArmorPayload {
  sanitizationResult?: ModelArmorSanitizationResult;
  sanitizationInput?: {
    text?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface LogEntry {
  logName?: string;
  receiveTimestamp?: string;
  timestamp?: string;
  severity?: 'ERROR' | 'WARNING' | 'INFO' | 'DEBUG' | 'DEFAULT' | string;
  protoPayload?: Record<string, unknown>;
  jsonPayload?: ModelArmorPayload | Record<string, unknown>;
  textPayload?: string;
  httpRequest?: {
    requestMethod?: string;
    requestUrl?: string;
    userAgent?: string;
    status?: number;
    latency?: string;
    [key: string]: unknown;
  };
  resource?: {
    type?: string;
    labels?: { [key: string]: string };
  };
  labels?: { [key: string]: string };
  [key: string]: unknown;
}

// GCS Types
export interface GcsBucket { id: string; name: string; }

export interface GcsObject { name: string; bucket: string; }

// Cloud Run Types
export interface EnvVar {
    name: string;
    value?: string;
    valueSource?: {
        secretKeyRef: {
            secret: string;
            version: string;
        }
    };
}

export interface Container {
    image: string;
    env: EnvVar[];
    resources?: {
        limits?: { [key: string]: string };
    };
}

export interface ServiceTemplate {
    containers: Container[];
    serviceAccount?: string;
    scaling?: Record<string, unknown>;
}

export interface CloudRunService {
    name: string;
    uri: string;
    location: string;
    labels?: Record<string, string>;
    createTime: string;
    updateTime: string;
    template?: ServiceTemplate;
}

// --- Compute Resources ---
export interface GlobalForwardingRule { name: string; IPAddress: string; target: string; creationTimestamp: string; description?: string; }

export interface ManagedSslCertificate {
    name: string;
    type: string;
    managed?: {
        domains: string[];
        status: string;
    };
    creationTimestamp: string;
}

export interface DataConnectorActionParams {
  mcp_server_description?: string;
  mcp_agent_instructions?: string;
  instance_uri?: string;
  auth_type?: string;
  scopes?: string;
  auth_uri?: string;
  token_uri?: string;
  auth_uri_params?: string;
  client_id?: string;
  client_secret?: string;
  mcp_server_source?: string;
  registry_mcp_server_name?: string;
  [key: string]: unknown;
}

export interface DataConnectorActionConfig {
  actionParams?: DataConnectorActionParams;
  [key: string]: unknown;
}

export interface DataConnectorBapConfig {
  enabledActions?: string[];
  [key: string]: unknown;
}

export interface DataConnectorDynamicTool {
  name: string;
  displayName?: string;
  description?: string;
  enabled?: boolean;
  [key: string]: unknown;
}

export interface DataConnectorParams {
  instance_uri?: string;
  static_ip_enabled?: boolean;
  structured_search_filter?: Record<string, unknown>;
  admin_filter?: Record<string, unknown>;
  structured_exclusion_search_filter?: Record<string, unknown>;
  admin_exclusion_filter?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DataConnector {
  name?: string;
  dataSource?: string;
  state?: string;
  displayName?: string;
  description?: string;
  actionConfig?: DataConnectorActionConfig;
  bapConfig?: DataConnectorBapConfig;
  dynamicTools?: DataConnectorDynamicTool[];
  params?: DataConnectorParams;
  refreshInterval?: string;
  staticIpEnabled?: boolean;
  latestRun?: {
    error?: {
      message?: string;
      code?: number;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  errorConfig?: {
    error?: {
      message?: string;
      code?: number;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  entities?: Array<{
    name?: string;
    params?: {
      inclusion_filters?: unknown;
      exclusion_filters?: unknown;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export type CollectionItem = Collection;

export interface ListResourcesResponse<T = unknown> {
  engines?: AppEngine[];
  collections?: Collection[];
  assistants?: Assistant[];
  agents?: Agent[];
  dataStores?: DataStore[];
  resources?: T[];
  nextPageToken?: string;
  [key: string]: unknown;
}

// Architecture Graph Types
export type NodeType = 'Project' | 'Location' | 'Collection' | 'Engine' | 'Assistant' | 'Agent' | 'ReasoningEngine' | 'DataStore' | 'Authorization' | 'CloudRunService';

export interface GraphNode {
  id: string; // full resource name
  type: NodeType;
  label: string; // short display name
  data: unknown; // full resource object
}

export interface GraphEdge { id: string; source: string; target: string; }

// Chat History Types
export interface DiscoverySession {
  name: string;
  state?: string;
  userPseudoId?: string;
  startTime?: string;
  endTime?: string;
  turns?: DiscoveryTurn[];
}

export interface DiscoveryTurn {
  query: {
    text: string;
  };
  assistAnswer?: string;
  answer: string | {
    reply: {
      replytext?: string;
      replyText?: string;
      summary?: {
        summaryText?: string;
        summarytext?: string;
      }
    };
    citations?: unknown[];
    references?: unknown[];
    answerText?: string; // For hydrated answers
    steps?: unknown[];
  };
}

export interface DiscoveryAnswerStep {
  description?: string;
  thought?: string;
  [key: string]: unknown;
}

export interface DiscoveryAnswer {
  answerText?: string;
  answer_text?: string;
  steps?: DiscoveryAnswerStep[];
  reply?: {
    replyText?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ReasoningEngineSession {
  name: string;
  createTime?: string;
  updateTime?: string;
  history?: {
    role: string;
    parts: { text: string }[];
  }[];
}

export interface ServiceAgentValidation {
  email: string;
  exists: boolean;
  hasRequiredRole: boolean;
  requiredRole: string;
  assignedRoles: string[];
  missingRecommendedRoles: string[];
  status: 'READY' | 'MISSING_ROLE' | 'NOT_FOUND' | 'PERMISSION_DENIED';
  errorMessage?: string;
}

export interface UserPermissionItem {
  permission: string;
  category: 'Discovery Engine Admin' | 'IAM & Security' | 'Service Management' | 'Vertex AI / Reasoning';
  granted: boolean;
  description: string;
  recommendedRole: string;
}

export interface UserPermissionsValidation {
  tested: boolean;
  canInspectIam: boolean;
  hasAdminAccess: boolean;
  grantedCount: number;
  totalCount: number;
  items: UserPermissionItem[];
  missingCritical: string[];
  notice?: string;
}

export interface ComprehensiveValidationResult {
  apis: { enabled: string[]; disabled: string[] };
  serviceAgent: ServiceAgentValidation | null;
  userPermissions: UserPermissionsValidation | null;
}

export interface UserMemory {
  name: string;
  fact?: string;
  description?: string;
  content?: string;
  createTime?: string;
  updateTime?: string;
  originalResourcePath?: string;
  [key: string]: unknown;
}

export interface ListMemoriesResponse {
  memories?: UserMemory[];
  nextPageToken?: string;
}

export interface SkillFile {
  fileName: string;
  mimeType?: string;
  content?: string;
}

export interface GeminiEnterpriseSkillConfig {
  dataConnectorSkillConfig?: {
    dependentTools?: string[];
    enabled?: boolean;
    dependentDataConnectorSourceOptions?: string[];
    skillKey?: string;
  };
  workspaceSkillConfig?: Record<string, unknown>;
  piperSkill?: boolean;
}

export interface SkillAgentDefinition {
  gcsUri?: string;
  importUri?: string;
  owner?: string;
  instruction?: string;
  dependentSkillAgents?: string[];
  geminiEnterpriseSkillConfig?: GeminiEnterpriseSkillConfig;
  session?: string;
  subfiles?: SkillFile[];
  agentRegistrySkill?: string;
  skillRegistrySkill?: string;
  zippedFilesystem?: string;
  contentDigest?: string;
}

export type SkillScope = 'ORGANIZATIONAL' | 'USER_CREATED' | 'FIRST_PARTY';

export interface SkillItem {
  agent: Agent;
  scope: SkillScope;
  sourceType: 'AGENT_REGISTRY' | 'GCS' | 'INLINE_INSTRUCTION' | '1P_CONNECTOR' | 'CUSTOM';
  sourceLocation?: string;
}

export interface RegistrySkillFrontmatter {
  name?: string;
  description?: string;
  packageId?: string;
  license?: string;
  [key: string]: unknown;
}

export interface RegistrySkillRevision {
  name: string;
  state?: string;
  sha256Hash?: string;
  frontmatter?: RegistrySkillFrontmatter;
  createTime?: string;
  sizeBytes?: string;
  uid?: string;
  archiveUploadSource?: { archiveContent?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface RegistrySkill {
  name: string; // projects/{project}/locations/{location}/skills/{skill}
  uid?: string;
  displayName: string;
  description?: string;
  type?: 'SIMPLE' | 'COMPOSITE' | string;
  state?: 'STATE_ACTIVE' | 'STATE_DRAFT' | 'STATE_DISABLED' | 'STATE_DEPRECATED' | 'STATE_DECOMMISSIONED' | string;
  targetState?: 'TARGET_STATE_ACTIVE' | 'TARGET_STATE_DRAFT' | 'TARGET_STATE_DISABLED' | 'TARGET_STATE_DEPRECATED' | string;
  defaultRevision?: string;
  publisher?: string;
  skillId?: string; // urn:skill:...
  createTime?: string;
  updateTime?: string;
  frontmatter?: RegistrySkillFrontmatter;
  initialRevision?: {
    frontmatter?: RegistrySkillFrontmatter;
    archiveUploadSource?: { archiveContent?: string; [key: string]: unknown };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ListRegistrySkillsResponse { skills?: RegistrySkill[]; nextPageToken?: string; }
export interface ListRegistrySkillRevisionsResponse { skillRevisions?: RegistrySkillRevision[]; nextPageToken?: string; }

export interface ConfigAuditItem {
  id: string;
  category: 'Engine & IdP' | 'Grounding DataStores' | 'Skills & Tools' | 'Licenses & Quotas' | 'Authorizations';
  name: string;
  sourceValue?: string | number | boolean | null;
  targetValue?: string | number | boolean | null;
  status: 'MATCH' | 'DRIFT' | 'MISSING_IN_TARGET' | 'INFO' | 'UNKNOWN';
  details?: string;
  remediation?: string;
  severity: 'OK' | 'WARNING' | 'ERROR';
}

export interface ConfigAuditSummary {
  overallScore: number | null;
  totalChecks: number;
  unknownCount: number;
  matchedCount: number;
  driftCount: number;
  missingCount: number;
  sourceProject: string;
  targetProject: string;
  sourceEngine: string;
  targetEngine: string;
  items: ConfigAuditItem[];
  timestamp: string;
}

export interface DistributeModalData { billingAccountId: string; billingAccountLicenseConfigId: string; currentProjectNumber: string; }
export interface RetractModalData { billingAccountId: string; billingAccountLicenseConfigId: string; licenseConfigName: string; allocatedCount: number; currentProjectNumber: string; }
export interface GroupLicensingEditConfig { billing_account_id?: string; projects?: Record<string, Array<{ subscription_tier?: string; groups?: string[]; location?: string }>>; }
export type { UserLicense, LicenseConfig, BillingAccount, BillingAccountLicenseConfig } from './components/license/types';
export type { TimeSeries, TimeSeriesPoint, LoggingSink } from './services/api/monitoring';
