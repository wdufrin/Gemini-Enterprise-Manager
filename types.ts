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
  ASSISTANT = 'Assistant',
  AUTHORIZATIONS = 'Authorizations',
  AGENT_PERMISSIONS = 'Agent Permissions',
  AGENT_ENGINES = 'Available Agents',
  A2A_TESTER = 'A2A Tester',
  AGENT_BUILDER = 'Agent Builder',
  AGENT_CATALOG = 'Agent Catalog',
  CLOUD_RUN_AGENTS = 'Cloud Run Agents',
  DIALOGFLOW_AGENTS = 'Dialogflow Agents',
  CHAT = 'Test G.E. Agent',
  DATA_STORES = 'Data Stores',
  MCP_SERVERS = 'MCP Servers',
  MODEL_ARMOR = 'Model Armor',
  OBSERVABILITY = 'Observability',
  BACKUP_RECOVERY = 'Backup & Recovery',
  ARCHITECTURE = 'Architecture',
  LICENSE = 'Licenses',
  CONNECTORS = 'Connectors',
  AGENT_STARTER_PACK = 'Agent Starter Pack',
  GE_QUOTA_USAGE = 'GE Quota Usage',
  VANITY_URLS = 'Redirect URLs',
}

export type SortableAgentKey = 'displayName' | 'state' | 'name' | 'updateTime' | 'agentType';
export type SortDirection = 'asc' | 'desc';

export interface UserProfile {
    name: string;
    email: string;
    picture: string;
    oid?: string;
}

export interface SortConfig {
  key: SortableAgentKey;
  direction: SortDirection;
}

export interface Config {
  projectId: string;
  appLocation: string;
  collectionId: string;
  appId: string;
  assistantId: string;
  dataStoreId?: string;
  reasoningEngineLocation?: string;
  reasoningEngineId?: string;
  suppressErrorLog?: boolean;
}

export interface WidgetConfig {
  name: string;
  accessSettings?: {
    enableWebApp?: boolean;
    workforceIdentityPoolProvider?: string;
  };
  uiSettings?: {
    enableAutocomplete?: boolean;
    enableQualityFeedback?: boolean;
  };
}

export interface StarterPrompt {
  text: string;
}

export interface AuthorizationConfig {
  oauth2ClientId?: string; // Made optional as it might be replaced by toolAuthorizations
  toolAuthorizations?: string[];
}

export interface Agent {
  name: string;
  displayName: string;
  description?: string;
  icon?: {
    uri: string;
  };
  starterPrompts?: StarterPrompt[];
  adkAgentDefinition?: {
    toolSettings?: {
      toolDescription: string;
    };
    provisionedReasoningEngine?: {
      reasoningEngine: string;
    };
  };
  a2aAgentDefinition?: {
    jsonAgentCard: string;
  };
  lowCodeAgentDefinition?: any;
  managedAgentDefinition?: any;
  workflowAgentDefinition?: any;
  authorizations?: string[]; // Deprecated
  authorizationConfig?: AuthorizationConfig;
  entitlements?: any[];
  state?: 'ENABLED' | 'DISABLED';
  createTime?: string;
  updateTime?: string;
  agentType?: string;
  agentOrigin?: string;
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
  serverSideOauth2: Oauth2Config;
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
  genAppBuilderSettings?: {
      engine?: string;
  };
  speechToTextSettings?: {
      enableSpeechAdaptation?: boolean;
  };
  advancedSettings?: {
      loggingSettings?: any;
      speechSettings?: any;
      audioExportGcsDestination?: any;
  };
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  answerDetails?: {
      diagnostics?: any;
      citations?: any[];
      groundingMetadata?: any;
  }
}

// Types for Discovery Resources
export interface Collection {
    name: string;
    displayName: string;
    engines?: AppEngine[]; // For backup structure
}
export interface AppEngine { // Renamed from Engine to avoid conflict with ReasoningEngine
    name: string;
    displayName: string;
    solutionType: string;
    assistants?: Assistant[]; // For backup structure
    dataStoreIds?: string[];
    // Add missing properties based on API response
    industryVertical?: string;
    appType?: string; // e.g. APP_TYPE_INTRANET
    searchEngineConfig?: any;
    observabilityConfig?: {
        observabilityEnabled?: boolean;
        sensitiveLoggingEnabled?: boolean;
    };
  features?: Record<string, string>; // Map of feature name to 'FEATURE_STATE_ON'|'FEATURE_STATE_OFF'
  modelConfigs?: Record<string, string>; // Map of model name to 'MODEL_ENABLED'|'MODEL_DISABLED'
  mobileDeeplinkUrl?: string;
}

export interface AclConfig {
  name: string;
  idpConfig?: {
    idpType?: 'IDP_TYPE_UNSPECIFIED' | 'GSUITE' | 'THIRD_PARTY';
    externalIdpConfig?: {
      workforcePoolName?: string;
    };
  };
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
    displayName: string;
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
    customerPolicy?: object;
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
    industryVertical: string;
    solutionTypes: string[];
    contentConfig: string;
}

export interface Document {
    name: string;
    id: string;
    displayName?: string;
    content?: {
        uri: string;
    };
    jsonData?: string;
    structData?: Record<string, any>;

}

export interface LogEntry {
  logName: string;
  receiveTimestamp: string;
  severity: 'ERROR' | 'WARNING' | 'INFO' | 'DEBUG' | 'DEFAULT';
  protoPayload?: any;
  jsonPayload?: any;
  textPayload?: string;
  resource: {
    type: string;
    labels: { [key: string]: string };
  };
  labels?: { [key: string]: string };
}

// GCS Types
export interface GcsBucket {
    id: string;
    name: string;
    }

export interface GcsObject {
    name: string;
    bucket: string;
}

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
    scaling?: any;
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
export interface GlobalForwardingRule {
    name: string;
    IPAddress: string;
    target: string;
    creationTimestamp: string;
    description?: string;
}

export interface ManagedSslCertificate {
    name: string;
    type: string;
    managed?: {
        domains: string[];
        status: string;
    };
    creationTimestamp: string;
}

// Architecture Graph Types
export type NodeType = 'Project' | 'Location' | 'Collection' | 'Engine' | 'Assistant' | 'Agent' | 'ReasoningEngine' | 'DataStore' | 'Authorization' | 'CloudRunService';

export interface GraphNode {
  id: string; // full resource name
  type: NodeType;
  label: string; // short display name
  data: any; // full resource object
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
}

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
    citations?: any[];
    references?: any[];
    answerText?: string; // For hydrated answers
    steps?: any[];
  };
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
