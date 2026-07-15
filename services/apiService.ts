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
 *
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  Agent,
  AppEngine,
  Assistant,
  Authorization,
  ChatMessage,
  Config,
  DataStore,
  Document,
  LogEntry,
  ReasoningEngine,
  CloudRunService,
  GcsBucket,
  GcsObject,
  DialogflowAgent,
  DiscoverySession,
  ReasoningEngineSession,
  WidgetConfig,
} from "../types";
import { getGapiClient } from "./gapiService";

const DISCOVERY_API_VERSION = "v1alpha";
const DISCOVERY_API_BETA = "v1beta";

// Helper to determine base URL for Discovery Engine
const getDiscoveryEngineUrl = (location: string) => {
  return location === "global"
    ? "https://discoveryengine.googleapis.com"
    : `https://${location}-discoveryengine.googleapis.com`;
};

// Debug Logger Callback Type
type DebugLogger = (log: {
  method: string;
  url: string;
  headers: any;
  body: any;
  curlCommand: string;
}) => void;

let debugLogger: DebugLogger | null = null;

export const setDebugLogger = (logger: DebugLogger | null) => {
  debugLogger = logger;
};

// Helper to generate cURL command
const generateCurlCommand = (
  url: string,
  method: string,
  headers: any,
  body: any,
): string => {
  let command = `curl -X ${method} \\\n  "${url}"`;

  Object.keys(headers).forEach((key) => {
    command += ` \\\n  -H "${key}: ${headers[key]}"`;
  });

  if (body) {
    // Ensure body is stringified if it's an object
    const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
    // Escape single quotes (basic escaping)
    const escapedBody = bodyStr.replace(/'/g, "'\\''");
    command += ` \\\n  -d '${escapedBody}'`;
  }

  return command;
};

// Generic gapi request wrapper
export const gapiRequest = async <T>(
  path: string,
  method: string = "GET",
  projectId?: string,
  params?: any,
  body?: any,
  headers?: any,
  suppressErrorLog: boolean = false,
): Promise<T> => {
  const client = await getGapiClient();
  const requestHeaders = headers || {};

  if (projectId) {
    requestHeaders["X-Goog-User-Project"] = projectId;
  }

  // Ensure Content-Type is set for POST/PUT if body exists
  if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
    if (!requestHeaders["Content-Type"]) {
      requestHeaders["Content-Type"] = "application/json";
    }
  }

  // Basic cURL logging
  if (debugLogger) {
    // Ensure we have the token for the curl command
    const token = client.getToken()?.access_token;
    const logHeaders = { ...requestHeaders };
    if (token) {
      logHeaders["Authorization"] = `Bearer $(gcloud auth print-access-token)`; // Use placeholder for cleaner display
    }

    const curlCommand = generateCurlCommand(path, method, logHeaders, body);
    debugLogger({
      method,
      url: path,
      headers: logHeaders,
      body,
      curlCommand,
    });
  }

  const requestOptions: any = {
    path,
    method,
    params,
    body,
    headers: requestHeaders,
  };

  try {
    const response = await client.request(requestOptions);
    return response.result;
  } catch (error: any) {
    if (!suppressErrorLog) {
      console.error("API Request Failed", error);
    }

    // Robust error message extraction to avoid [object Object]
    let errorMessage = "Unknown API Error";

    // Try to extract from gapi result error structure
    if (error?.result?.error?.message) {
      errorMessage = error.result.error.message;
    }
    // Try to extract from top-level error message
    else if (error?.message) {
      errorMessage = error.message;
    }
    // Otherwise, stringify the whole response result for maximum visibility
    else if (error?.result) {
      errorMessage = JSON.stringify(error.result, null, 2);
    }
    // Fallback to stringifying the error object itself
    else if (typeof error === "object" && error !== null) {
      try {
        errorMessage = JSON.stringify(error.result, null, 2);
      } catch (e) {
        errorMessage = "Complex Error Object (cannot stringify)";
      }
    } else if (error) {
      errorMessage = String(error);
    }

    throw new Error(errorMessage);
  }
};

// --- Project & IAM ---

export const getProjectNumber = async (projectId: string): Promise<string> => {
  const response = await gapiRequest<any>(
    `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}`,
    "GET",
    projectId,
  );
  return response.projectNumber;
};

export const getProject = async (
  projectNumberOrId: string,
): Promise<{ projectId: string; projectNumber: string; name?: string }> => {
  const response = await gapiRequest<any>(
    `https://cloudresourcemanager.googleapis.com/v1/projects/${projectNumberOrId}`,
    "GET",
    projectNumberOrId.match(/^\d+$/) ? undefined : projectNumberOrId,
  );
  return {
    projectId: response.projectId,
    projectNumber: response.projectNumber,
    name: response.name,
  };
};

export const validateEnabledApis = async (
  projectId: string,
): Promise<{ enabled: string[]; disabled: string[] }> => {
  const requiredApis = [
    "discoveryengine.googleapis.com",
    "aiplatform.googleapis.com",
    "run.googleapis.com",
    "cloudbuild.googleapis.com",
    "storage.googleapis.com",
    "bigquery.googleapis.com",
    "logging.googleapis.com",
    "cloudbilling.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    "serviceusage.googleapis.com",
    "dialogflow.googleapis.com",
  ];

  const response = await gapiRequest<any>(
    `https://serviceusage.googleapis.com/v1/projects/${projectId}/services?filter=state:ENABLED&pageSize=200`,
    "GET",
    projectId,
  );
  const enabledServices = new Set(
    (response.services || []).map((s: any) => s.config.name),
  );

  const enabled: string[] = [];
  const disabled: string[] = [];

  requiredApis.forEach((api) => {
    if (enabledServices.has(api)) enabled.push(api);
    else disabled.push(api);
  });

  return { enabled, disabled };
};

export const batchEnableApis = async (projectId: string, apis: string[]) => {
  return gapiRequest<any>(
    `https://serviceusage.googleapis.com/v1/projects/${projectId}/services:batchEnable`,
    "POST",
    projectId,
    undefined,
    { serviceIds: apis },
  );
};

export const getServiceUsageOperation = async (name: string) => {
  return gapiRequest<any>(`https://serviceusage.googleapis.com/v1/${name}`);
};

export const checkServiceAccountPermissions = async (
  projectId: string,
  saEmail: string,
  permissions: string[],
): Promise<{ hasAll: boolean; missing: string[] }> => {
  const response = await gapiRequest<any>(
    `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:testIamPermissions`,
    "POST",
    projectId,
    undefined,
    { permissions },
  );
  const granted = new Set(response.permissions || []);
  const missing = permissions.filter((p) => !granted.has(p));
  return { hasAll: missing.length === 0, missing };
};

export const listServiceAccounts = async (
  projectId: string,
): Promise<any[]> => {
  let allAccounts: any[] = [];
  let pageToken = "";
  do {
    let url = `https://iam.googleapis.com/v1/projects/${projectId}/serviceAccounts?pageSize=100`;
    if (pageToken) url += `&pageToken=${pageToken}`;
    const response = await gapiRequest<any>(url, "GET", projectId);
    if (response.accounts) {
      allAccounts = allAccounts.concat(response.accounts);
    }
    pageToken = response.nextPageToken || "";
  } while (pageToken);
  return allAccounts;
};

export const listWorkloadIdentityPools = async (
  projectId: string,
): Promise<any[]> => {
  let allPools: any[] = [];
  let pageToken = "";
  do {
    let url = `https://iam.googleapis.com/v1/projects/${projectId}/locations/global/workloadIdentityPools?pageSize=50`;
    if (pageToken) url += `&pageToken=${pageToken}`;
    const response = await gapiRequest<any>(url, "GET", projectId);
    if (response.workforcePools) {
      allPools = allPools.concat(
        response.workforcePools.filter((p: any) => p.state !== "DELETED"),
      );
    }
    pageToken = response.nextPageToken || "";
  } while (pageToken);
  return allPools;
};

export const listWorkloadIdentityProviders = async (
  poolName: string,
  projectId: string,
): Promise<any[]> => {
  let allProviders: any[] = [];
  let pageToken = "";
  do {
    let url = `https://iam.googleapis.com/v1/${poolName}/providers?pageSize=50`;
    if (pageToken) url += `&pageToken=${pageToken}`;
    const response = await gapiRequest<any>(url, "GET", projectId);
    if (response.workforcePoolProviders) {
      allProviders = allProviders.concat(
        response.workforcePoolProviders.filter(
          (p: any) => p.state !== "DELETED",
        ),
      );
    }
    pageToken = response.nextPageToken || "";
  } while (pageToken);
  return allProviders;
};

export const getServiceAccountIamPolicy = async (
  saEmail: string,
  projectId: string,
): Promise<any> => {
  const url = `https://iam.googleapis.com/v1/projects/-/serviceAccounts/${saEmail}:getIamPolicy`;
  return gapiRequest<any>(url, "POST", projectId, undefined, {});
};

export const getProjectIamPolicy = async (projectId: string): Promise<any> => {
  const url = `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:getIamPolicy`;
  return gapiRequest<any>(url, "POST", projectId, undefined, {
    options: { requestedPolicyVersion: 3 },
  });
};

export const setProjectIamPolicy = async (
  projectId: string,
  policy: any,
): Promise<any> => {
  const url = `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:setIamPolicy`;
  return gapiRequest<any>(url, "POST", projectId, undefined, { policy });
};

// --- BigQuery & Logging Sinks ---

export const getDataset = async (
  projectId: string,
  datasetId: string,
): Promise<any> => {
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${datasetId}`;
  return gapiRequest<any>(url, "GET", projectId);
};

export const updateDatasetAccess = async (
  projectId: string,
  datasetId: string,
  access: any[],
): Promise<any> => {
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${datasetId}`;
  const body = { access };
  return gapiRequest<any>(url, "PATCH", projectId, undefined, body);
};

export const createLoggingSink = async (
  projectId: string,
  sinkName: string,
  destination: string,
  filter: string,
): Promise<any> => {
  const url = `https://logging.googleapis.com/v2/projects/${projectId}/sinks`;
  const body = {
    name: sinkName,
    destination: destination,
    filter: filter,
  };
  const params = { uniqueWriterIdentity: true };
  return gapiRequest<any>(url, "POST", projectId, params, body);
};

export const getLoggingSink = async (
  projectId: string,
  sinkName: string,
): Promise<any> => {
  const url = `https://logging.googleapis.com/v2/projects/${projectId}/sinks/${sinkName}`;
  return gapiRequest<any>(url, "GET", projectId);
};

export const listLoggingSinks = async (projectId: string): Promise<any> => {
  const url = `https://logging.googleapis.com/v2/projects/${projectId}/sinks`;
  return gapiRequest<any>(url, "GET", projectId);
};

// --- Discovery Engine Resources ---

export const listResources = async (
  resourceType:
    | "agents"
    | "engines"
    | "dataStores"
    | "collections"
    | "assistants",
  config: Config,
  pageToken?: string,
  pageSize: number = 200,
  suppressErrorLog?: boolean,
): Promise<any> => {
  const { projectId, appLocation, collectionId, appId, assistantId } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  let url = "";

  switch (resourceType) {
    case "collections":
      url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${appLocation}/collections`;
      break;
    case "engines":
      url = `${baseUrl}/${DISCOVERY_API_BETA}/projects/${projectId}/locations/${appLocation}/collections/${collectionId || "default_collection"}/engines`;
      break;
    case "assistants":
      url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}/assistants`;
      break;
    case "agents":
      url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}/assistants/${assistantId}/agents`;
      break;
    case "dataStores":
      url = `${baseUrl}/${DISCOVERY_API_BETA}/projects/${projectId}/locations/${appLocation}/collections/${collectionId || "default_collection"}/dataStores`;
      break;
  }

  url += `?pageSize=${pageSize}`;
  if (pageToken) url += `&pageToken=${pageToken}`;

  return gapiRequest(
    url,
    "GET",
    projectId,
    undefined,
    undefined,
    undefined,
    suppressErrorLog,
  );
};

// FIX: Added missing createCollection function.
export const createCollection = async (
  collectionId: string,
  payload: any,
  config: Config,
) => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${appLocation}/collections?collectionId=${collectionId}`;
  return gapiRequest<any>(url, "POST", projectId, undefined, payload);
};

export const updateCollection = async (
  name: string,
  payload: any,
  updateMask: string[],
  config: Config,
) => {
  const { projectId } = config;
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${name}?updateMask=${updateMask.join(",")}`;
  return gapiRequest<any>(url, "PATCH", projectId, undefined, payload);
};

export const getDiscoveryOperation = async (
  name: string,
  config: Config,
  apiVersion: string = DISCOVERY_API_VERSION,
) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  return gapiRequest<any>(
    `${baseUrl}/${apiVersion}/${name}`,
    "GET",
    config.projectId,
  );
};

export const listOperations = async (config: Config, filter?: string) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  let url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${config.projectId}/locations/${config.appLocation}/collections/${config.collectionId || "default_collection"}/operations`;
  // Fallback to global operations if collection-specific fails or if we want broader scope?
  // User's curl example was: projects/.../locations/global/operations.
  // Let's support both or stick to the global one if that's what they asked.
  // The user asked for: `https://discoveryengine.googleapis.com/v1beta/projects/.../locations/global/operations`
  // So let's add a robust version.

  url = `${baseUrl}/${DISCOVERY_API_BETA}/projects/${config.projectId}/locations/${config.appLocation}/operations`;
  if (filter) {
    url += `?filter=${encodeURIComponent(filter)}`;
  }
  return gapiRequest<any>(url, "GET", config.projectId);
};

export const listDiscoverySessions = async (
  config: Config,
  pageToken?: string,
  pageSize: number = 50,
  suppressErrorLog?: boolean,
) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  // Logic: Sessions are usually under a Data Store for "Search" or an App for "Chat".
  // For "Chat" / "Gemini Enterprise" (Conversational), they are under `projects/.../conversations` OR `projects/.../collections/.../engines/.../sessions`.
  // Actually, for Vertex AI Search (Discovery Engine) "Chat" apps, sessions are:
  // `projects/{project}/locations/{location}/collections/{collection}/engines/{engine}/sessions`
  // OR `projects/{project}/locations/{location}/collections/{collection}/dataStores/{dataStore}/sessions`

  // We will assume Engine-based sessions if appId is present (which is typical for this app's "Engines/Apps").
  let url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${config.projectId}/locations/${config.appLocation}/collections/${config.collectionId || "default_collection"}/engines/${config.appId}/sessions?pageSize=${pageSize}`;
  if (pageToken) {
    url += `&pageToken=${pageToken}`;
  }
  return gapiRequest<{ sessions: DiscoverySession[]; nextPageToken?: string }>(
    url,
    "GET",
    config.projectId,
    undefined,
    undefined,
    undefined,
    suppressErrorLog,
  );
};

export const getDiscoveryAnswer = async (name: string, config: Config) => {
  // name is full resource name: projects/.../answers/...
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${name}`;
  return gapiRequest<any>(url, "GET", config.projectId);
};

export const createDiscoverySession = async (
  session: DiscoverySession,
  config: Config,
  accessToken?: string,
) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  // API: POST .../sessions (Server-generated ID)
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${config.projectId}/locations/${config.appLocation}/collections/${config.collectionId || "default_collection"}/engines/${config.appId}/sessions`;

  // Client-assigned IDs via 'session_id' query param are NOT supported in v1alpha/v1beta.
  // We must accept a new Session ID generated by the server.
  const finalUrl = url;

  const cleanPayload: any = {};
  if (session.userPseudoId) {
    cleanPayload.user_pseudo_id = session.userPseudoId;
  }
  // We include 'turns' to restore history.
  if (session.turns) cleanPayload.turns = session.turns;

  // UI Visibility Hacks for Restored Sessions
  if (session.state) cleanPayload.state = session.state;
  if (session.startTime) cleanPayload.startTime = session.startTime;

  // Pass through other fields if needed, but be careful of output-only ones.
  // if (session.labels) cleanPayload.labels = session.labels;

  if (accessToken) {
    const response = await fetch(finalUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Goog-User-Project": config.projectId,
      },
      body: JSON.stringify(cleanPayload),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to create session: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }
    return response.json() as Promise<DiscoverySession>;
  }

  return gapiRequest<DiscoverySession>(
    finalUrl,
    "POST",
    config.projectId,
    undefined,
    cleanPayload,
  );
};

export const getDiscoverySession = async (name: string, config: Config) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  // name is full resource name
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${name}`;
  return gapiRequest<DiscoverySession>(url, "GET", config.projectId);
};

export const getVertexAiOperation = async (name: string, config: Config) => {
  const parts = name.split("/");
  const locIndex = parts.indexOf("locations");
  const location =
    locIndex !== -1 && parts.length > locIndex + 1
      ? parts[locIndex + 1]
      : config.reasoningEngineLocation || "us-central1";

  const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${name}`;
  return gapiRequest<any>(url, "GET", config.projectId);
};

// Engines
// Engines
export const getEngine = async (name: string, config: Config) => {
  const {
    projectId,
    appLocation,
    collectionId = "default_collection",
  } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);

  const resourcePath = name.startsWith("projects/")
    ? name
    : `projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${name}`;

  const engine = await gapiRequest<AppEngine>(
    `${baseUrl}/${DISCOVERY_API_BETA}/${resourcePath}`,
    "GET",
    projectId,
  );
  console.log("[DEBUG] getEngine:", engine);
  return engine;
};

export const createEngine = async (
  engineId: string,
  payload: any,
  config: Config,
) => {
  const {
    projectId,
    appLocation,
    collectionId = "default_collection",
  } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_BETA}/projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines?engineId=${engineId}`;
  return gapiRequest<any>(url, "POST", projectId, undefined, payload);
};

export const updateEngine = async (
  name: string,
  payload: any,
  updateMask: string[],
  config: Config,
) => {
  const {
    projectId,
    appLocation,
    collectionId = "default_collection",
  } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);

  const resourcePath = name.startsWith("projects/")
    ? name
    : `projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${name}`;

  const url = `${baseUrl}/${DISCOVERY_API_BETA}/${resourcePath}?updateMask=${updateMask.join(",")}`;
  return gapiRequest<AppEngine>(url, "PATCH", projectId, undefined, payload);
};

export const getEngineIamPolicy = async (name: string, config: Config) => {
  const {
    projectId,
    appLocation,
    collectionId = "default_collection",
  } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);

  const resourcePath = name.startsWith("projects/")
    ? name
    : `projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${name}`;

  const url = `${baseUrl}/v1/${resourcePath}:getIamPolicy`;
  return gapiRequest<any>(url, "GET", projectId);
};

export const setEngineIamPolicy = async (
  name: string,
  policy: any,
  config: Config,
) => {
  const {
    projectId,
    appLocation,
    collectionId = "default_collection",
  } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);

  const resourcePath = name.startsWith("projects/")
    ? name
    : `projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${name}`;

  const url = `${baseUrl}/v1/${resourcePath}:setIamPolicy`;
  return gapiRequest<any>(url, "POST", projectId, undefined, { policy });
};

export const getWidgetConfig = async (name: string, config: Config) => {
  // name is the engine name
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  // Widget configs use v1alpha in the user's curl payload, but we can try v1beta if available. We'll use v1alpha to match HAR capture safely.
  const url = `${baseUrl}/v1alpha/${name}/widgetConfigs/default_search_widget_config`;
  return gapiRequest<WidgetConfig>(url, "GET", projectId);
};

export const updateWidgetConfig = async (
  name: string,
  payload: any,
  updateMask: string[],
  config: Config,
) => {
  // name is the engine name
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/v1alpha/${name}/widgetConfigs/default_search_widget_config?updateMask=${updateMask.join(",")}`;
  return gapiRequest<WidgetConfig>(url, "PATCH", projectId, undefined, payload);
};

// AclConfig (Location level IDP)
export const getAclConfig = async (config: Config) => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_BETA}/projects/${projectId}/locations/${appLocation}/aclConfig`;
  return gapiRequest<any>(url, "GET", projectId); // Type will be AclConfig
};

export const updateAclConfig = async (payload: any, config: Config) => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_BETA}/projects/${projectId}/locations/${appLocation}/aclConfig`;
  return gapiRequest<any>(url, "PATCH", projectId, undefined, payload); // Type will be AclConfig
};

// IAM Workforce Pool Providers
export const getWorkforcePoolProviders = async (
  poolName: string,
  config: Config,
) => {
  // poolName is typically formatted as: "locations/global/workforcePools/wdufrin-okta"
  const poolId = poolName.split("/").pop();
  if (!poolId) return { workforcePoolProviders: [] };

  // Use standard IAM API to get the providers for the given pool
  const url = `https://iam.googleapis.com/v1/locations/global/workforcePools/${poolId}/providers`;
  try {
    const response = await gapiRequest<any>(url, "GET", config.projectId);
    return response;
  } catch (err) {
    console.error("Failed to fetch workforce pool providers:", err);
    return { workforcePoolProviders: [] };
  }
};

export const getWorkforcePoolProviderScimTenants = async (
  providerName: string,
  config: Config,
) => {
  // providerName is typically formatted as: "locations/global/workforcePools/{poolId}/providers/{providerId}"
  const url = `https://iam.googleapis.com/v1/${providerName}/scimTenants?showDeleted=False`;
  try {
    const response = await gapiRequest<any>(url, "GET", config.projectId);
    return response;
  } catch (err) {
    console.error("Failed to fetch workforce pool provider SCIM tenants:", err);
    return { workforcePoolProviderScimTenants: [] };
  }
};

// Assistants
export const getAssistant = async (name: string, config: Config) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  return gapiRequest<Assistant>(
    `${baseUrl}/${DISCOVERY_API_VERSION}/${name}`,
    "GET",
    config.projectId,
    undefined,
    undefined,
    undefined,
    config.suppressErrorLog,
  );
};

export const updateAssistant = async (
  name: string,
  payload: any,
  updateMask: string[],
  config: Config,
) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${name}?updateMask=${updateMask.join(",")}`;
  return gapiRequest<Assistant>(
    url,
    "PATCH",
    config.projectId,
    undefined,
    payload,
  );
};

export const createAssistant = async (
  assistantId: string,
  payload: any,
  config: Config,
) => {
  const { projectId, appLocation, collectionId, appId } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}/assistants?assistantId=${assistantId}`;
  return gapiRequest<Assistant>(url, "POST", projectId, undefined, payload);
};

// Agents
export const getAgent = async (name: string, config: Config) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  return gapiRequest<Agent>(
    `${baseUrl}/${DISCOVERY_API_VERSION}/${name}`,
    "GET",
    config.projectId,
  );
};

export const getAgentView = async (name: string, config: Config) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  // Suppress error logging here because 403 Forbidden is expected for agents the user cannot view.
  return gapiRequest<any>(
    `${baseUrl}/${DISCOVERY_API_VERSION}/${name}:getAgentView`,
    "GET",
    config.projectId,
    undefined,
    undefined,
    undefined,
    true,
  );
};

export const createAgent = async (
  payload: any,
  config: Config,
  agentId?: string,
) => {
  const { projectId, appLocation, collectionId, appId, assistantId } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  let url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}/assistants/${assistantId}/agents`;
  if (agentId) {
    url += `?agentId=${agentId}`;
  }
  return gapiRequest<Agent>(url, "POST", projectId, undefined, payload);
};

export const updateAgent = async (
  agent: Agent,
  payload: any,
  config: Config,
) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const updateMask: string[] = [];
  if (payload.displayName) updateMask.push("display_name");
  if (payload.description) updateMask.push("description");
  if (payload.icon) updateMask.push("icon");
  if (payload.starterPrompts) updateMask.push("starter_prompts");
  if (payload.adkAgentDefinition) updateMask.push("adk_agent_definition");
  if (payload.a2aAgentDefinition) updateMask.push("a2a_agent_definition");
  if (payload.lowCodeAgentDefinition)
    updateMask.push("low_code_agent_definition");
  if (payload.workflowAgentDefinition)
    updateMask.push("workflow_agent_definition");
  if (payload.authorizations) updateMask.push("authorizations");
  if (payload.authorizationConfig) updateMask.push("authorization_config");

  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${agent.name}?updateMask=${updateMask.join(",")}`;
  return gapiRequest<Agent>(url, "PATCH", config.projectId, undefined, payload);
};

export const disableAgent = async (name: string, config: Config) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  await gapiRequest(
    `${baseUrl}/${DISCOVERY_API_VERSION}/${name}:disableAgent`,
    "POST",
    config.projectId,
  );
  return getAgent(name, config);
};

export const enableAgent = async (name: string, config: Config) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  await gapiRequest(
    `${baseUrl}/${DISCOVERY_API_VERSION}/${name}:enableAgent`,
    "POST",
    config.projectId,
  );
  return getAgent(name, config);
};

export const shareAgent = async (name: string, config: Config) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const flatName = name.replace("/assistants/default_assistant", "");
  await gapiRequest(
    `${baseUrl}/${DISCOVERY_API_VERSION}/${flatName}:share`,
    "POST",
    config.projectId,
  );
  return getAgent(name, config);
};

export const deleteResource = async (name: string, config: Config) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  return gapiRequest(
    `${baseUrl}/${DISCOVERY_API_VERSION}/${name}`,
    "DELETE",
    config.projectId,
  );
};

// Data Stores
export const getDataStore = async (name: string, config: Config) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  return gapiRequest<DataStore>(
    `${baseUrl}/${DISCOVERY_API_BETA}/${name}`,
    "GET",
    config.projectId,
  );
};

export const createDataStore = async (
  dataStoreId: string,
  payload: any,
  config: Config,
) => {
  const { projectId, appLocation, collectionId } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_BETA}/projects/${projectId}/locations/${appLocation}/collections/${collectionId || "default_collection"}/dataStores?dataStoreId=${dataStoreId}`;
  return gapiRequest<any>(url, "POST", projectId, undefined, payload);
};

export const updateDataStore = async (
  name: string,
  payload: any,
  config: Config,
) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const updateMask = Object.keys(payload).join(",");
  const url = `${baseUrl}/${DISCOVERY_API_BETA}/${name}?updateMask=${updateMask}`;
  return gapiRequest<DataStore>(
    url,
    "PATCH",
    config.projectId,
    undefined,
    payload,
  );
};

export const deleteDataStore = async (name: string, config: Config) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  return gapiRequest(
    `${baseUrl}/${DISCOVERY_API_BETA}/${name}`,
    "DELETE",
    config.projectId,
  );
};

export const getDataConnector = async (config: Config) => {
  const { projectId, appLocation, collectionId } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  // Note: The API is singleton per collection
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${appLocation}/collections/${collectionId || "default_collection"}/dataConnector`;
  return gapiRequest<any>(url, "GET", projectId);
};

export const updateDataConnector = async (
  name: string,
  payload: any,
  updateMask: string[],
  config: Config,
) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${name}?updateMask=${updateMask.join(",")}`;
  return gapiRequest<any>(url, "PATCH", config.projectId, undefined, payload);
};

export const listDocuments = async (dataStoreName: string, config: Config) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  return gapiRequest<{ documents: Document[] }>(
    `${baseUrl}/${DISCOVERY_API_BETA}/${dataStoreName}/branches/default_branch/documents`,
    "GET",
    config.projectId,
  );
};

export const searchDocuments = async (
  dataStoreName: string,
  config: Config,
  query: string = "*",
) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  // Construct Serving Config name from Data Store name
  // DataStore: projects/.../dataStores/ID
  // Serving: projects/.../dataStores/ID/servingConfigs/default_search
  const url = `${baseUrl}/${DISCOVERY_API_BETA}/${dataStoreName}/servingConfigs/default_search:search`;

  const body = {
    query: query,
    pageSize: 1,
    // We just need the ID to fetch full ACLs via getDocument, but sometimes search returns enough info.
  };

  return gapiRequest<{ results: { document: Document }[] }>(
    url,
    "POST",
    config.projectId,
    undefined,
    body,
  );
};

/**
 * Searches a Data Store using the Discovery Engine Search API.
 * Equivalent to the Python discoveryengine_v1beta.SearchServiceClient.search() method.
 */
export const queryDataStore = async (
  dataStoreName: string,
  config: Config,
  query: string,
  pageSize: number = 10,
  pageToken?: string,
  servingConfigId: string = "default_serving_config",
) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_BETA}/${dataStoreName}/servingConfigs/${servingConfigId}:search`;

  const body: any = {
    query,
    pageSize,
  };
  if (pageToken) {
    body.pageToken = pageToken;
  }

  return gapiRequest<{
    results: { id: string; document: Document }[];
    totalSize?: number;
    nextPageToken?: string;
    summary?: { summaryText?: string; summaryWithMetadata?: any };
    queryExpansionInfo?: any;
  }>(url, "POST", config.projectId, undefined, body);
};

// --- Workforce Identity Federation (WIF) ---

/**
 * Fetches the workforce pool provider configuration from GCP IAM.
 * Used to auto-discover the OIDC issuer and client ID for sign-in.
 */
export const fetchWorkforceProviderConfig = async (
  poolId: string,
  providerId: string,
): Promise<{
  name: string;
  displayName?: string;
  oidc?: {
    issuerUri: string;
    clientId: string;
    webSsoConfig?: {
      responseType: string;
      assertionClaimsMapping?: Record<string, string>;
    };
  };
  saml?: { idpMetadataXml: string };
  state?: string;
}> => {
  const url = `https://iam.googleapis.com/v1/locations/global/workforcePools/${poolId}/providers/${providerId}`;
  return gapiRequest(url, "GET");
};

/**
 * Opens an OIDC sign-in popup to the identity provider's authorization endpoint.
 * Returns the ID token from the redirect fragment.
 *
 * IMPORTANT: The redirect URI (window.location.origin) must be registered as a
 * redirect URI in the identity provider's application configuration.
 */
export const signInWithOidcPopup = (
  authorizationEndpoint: string,
  clientId: string,
  redirectUri: string,
  scope: string = "openid profile email",
): Promise<{ idToken: string; email?: string }> => {
  return new Promise((resolve, reject) => {
    const nonce = crypto.randomUUID();
    const state = crypto.randomUUID();

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "id_token",
      redirect_uri: redirectUri,
      scope,
      response_mode: "fragment",
      nonce,
      state,
    });

    const popupUrl = `${authorizationEndpoint}?${params.toString()}`;
    const popup = window.open(
      popupUrl,
      "wif-oidc-signin",
      "width=500,height=700,left=200,top=100",
    );

    if (!popup) {
      reject(
        new Error("Popup was blocked. Please allow popups for this site."),
      );
      return;
    }

    let settled = false;

    const pollInterval = setInterval(() => {
      try {
        if (popup.closed) {
          clearInterval(pollInterval);
          if (!settled) {
            settled = true;
            reject(
              new Error(
                "Sign-in window was closed before completing authentication.",
              ),
            );
          }
          return;
        }

        // Try to read popup URL — throws cross-origin error while on IdP domain
        const currentUrl = popup.location.href;

        // If we can read it and it starts with our redirect URI, capture the token
        if (currentUrl.startsWith(redirectUri)) {
          clearInterval(pollInterval);
          settled = true;

          const hash = popup.location.hash.substring(1);
          popup.close();

          const fragmentParams = new URLSearchParams(hash);
          const idToken = fragmentParams.get("id_token");
          const error = fragmentParams.get("error");
          const errorDescription = fragmentParams.get("error_description");

          if (error) {
            reject(
              new Error(
                `Identity provider error: ${errorDescription || error}`,
              ),
            );
            return;
          }

          if (!idToken) {
            reject(
              new Error("No ID token received from the identity provider."),
            );
            return;
          }

          if (fragmentParams.get("state") !== state) {
            reject(new Error("State mismatch — possible CSRF attack."));
            return;
          }

          // Decode JWT to extract email and validate nonce
          let email: string | undefined;
          try {
            const payload = JSON.parse(atob(idToken.split(".")[1]));
            if (payload && payload.nonce !== nonce) {
              reject(new Error("Nonce mismatch — possible replay attack."));
              return;
            }
            email =
              payload?.email || payload?.preferred_username || payload?.upn;
          } catch (err: any) {
            if (err.message && err.message.includes("Nonce mismatch")) {
              reject(err);
              return;
            }
            // Ignore decode errors for email claim extraction
          }

          resolve({ idToken, email });
        }
      } catch {
        // Cross-origin error while popup is on the IdP domain — expected, ignore
      }
    }, 500);

    // Timeout after 5 minutes
    setTimeout(
      () => {
        clearInterval(pollInterval);
        if (!popup.closed) popup.close();
        if (!settled) {
          settled = true;
          reject(new Error("Sign-in timed out after 5 minutes."));
        }
      },
      5 * 60 * 1000,
    );
  });
};

/**
 * Fetches the OIDC discovery document from an issuer URI.
 * Returns the authorization_endpoint and other metadata.
 */
export const fetchOidcDiscovery = async (
  issuerUri: string,
): Promise<{
  authorization_endpoint: string;
  token_endpoint: string;
  issuer: string;
  [key: string]: any;
}> => {
  const url = `${issuerUri.replace(/\/$/, "")}/.well-known/openid-configuration`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch OIDC discovery document from ${url}: ${response.statusText}`,
    );
  }
  return response.json();
};

export interface WifConfig {
  userProject: string;
  poolId: string;
  providerId: string;
  subjectToken: string;
  subjectTokenType: string;
}

/**
 * Exchanges an external IdP token for a Google Cloud STS access token
 * via the Security Token Service (Workforce Identity Federation).
 */
export const exchangeStsToken = async (
  wifConfig: WifConfig,
): Promise<{
  access_token: string;
  expires_in: number;
  token_type: string;
}> => {
  const audience = `//iam.googleapis.com/locations/global/workforcePools/${wifConfig.poolId}/providers/${wifConfig.providerId}`;

  const stsBody = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    audience,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
    subject_token_type: wifConfig.subjectTokenType,
    subject_token: wifConfig.subjectToken,
    options: JSON.stringify({ userProject: wifConfig.userProject }),
  });

  const response = await fetch("https://sts.googleapis.com/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: stsBody.toString(),
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error_description: response.statusText }));
    throw new Error(
      `STS Token Exchange failed: ${errorData.error_description || errorData.error || response.statusText}`,
    );
  }

  return response.json();
};

/**
 * Queries a Data Store using a custom access token (e.g. from WIF exchange)
 * instead of the default gapi OAuth session.
 */
export const queryDataStoreWithToken = async (
  dataStoreName: string,
  appLocation: string,
  projectId: string,
  accessToken: string,
  query: string,
  pageSize: number = 10,
  servingConfigId: string = "default_serving_config",
): Promise<{
  results: { id: string; document: Document }[];
  totalSize?: number;
  nextPageToken?: string;
}> => {
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_BETA}/${dataStoreName}/servingConfigs/${servingConfigId}:search`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Goog-User-Project": projectId,
    },
    body: JSON.stringify({ query, pageSize }),
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: { message: response.statusText } }));
    throw new Error(
      `Search failed: ${errorData.error?.message || response.statusText}`,
    );
  }

  return response.json();
};

export const getDocument = async (name: string, config: Config) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  return gapiRequest<Document>(
    `${baseUrl}/${DISCOVERY_API_BETA}/${name}`,
    "GET",
    config.projectId,
  );
};

export const importDocuments = async (
  dataStoreName: string,
  gcsUris: string[],
  bucket: string,
  config: Config,
) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const payload = {
    reconciliationMode: "INCREMENTAL",
    gcsSource: { inputUris: gcsUris, dataSchema: "content" },
  };
  return gapiRequest<any>(
    `${baseUrl}/${DISCOVERY_API_BETA}/${dataStoreName}/branches/default_branch/documents:import`,
    "POST",
    config.projectId,
    undefined,
    payload,
  );
};

export const listAuthorizations = async (
  config: Config,
  pageToken?: string,
  pageSize: number = 200,
) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  let url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${config.projectId}/locations/${config.appLocation}/authorizations?pageSize=${pageSize}`;
  if (pageToken) url += `&pageToken=${pageToken}`;
  return gapiRequest<{
    authorizations: Authorization[];
    nextPageToken?: string;
  }>(url, "GET", config.projectId);
};

// Helper to extract location from resource name
const getLocationFromResourceName = (name: string): string => {
  const match = name.match(/locations\/([a-zA-Z0-9-]+)\//);
  return match ? match[1] : "global";
};

export const getAuthorization = async (name: string, config: Config) => {
  const location = getLocationFromResourceName(name);
  const baseUrl = getDiscoveryEngineUrl(location);
  return gapiRequest<Authorization>(
    `${baseUrl}/${DISCOVERY_API_VERSION}/${name}`,
    "GET",
    config.projectId,
  );
};

export const createAuthorization = async (
  authId: string,
  payload: any,
  config: Config,
) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${config.projectId}/locations/${config.appLocation}/authorizations?authorizationId=${authId}`;
  return gapiRequest<Authorization>(
    url,
    "POST",
    config.projectId,
    undefined,
    payload,
  );
};

export const updateAuthorization = async (
  name: string,
  payload: any,
  updateMask: string[],
  config: Config,
) => {
  const location = getLocationFromResourceName(name);
  const baseUrl = getDiscoveryEngineUrl(location);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${name}?updateMask=${updateMask.join(",")}`;
  return gapiRequest<Authorization>(
    url,
    "PATCH",
    config.projectId,
    undefined,
    payload,
  );
};

export const deleteAuthorization = async (name: string, config: Config) => {
  // name might be full resource name or just ID?
  // If it's just ID, we need config.appLocation.
  // But typical usage for delete in this app passes the full object or name.
  // checking usage in AuthList: onDelete(auth).
  // auth.name IS the full resource name.
  // However, the previous signature was (authId, config).
  // Let's check if we need to change the signature or if it was already name.
  // Previous: deleteAuthorization(authId, config) -> url .../locations/${config.appLocation}/authorizations/${authId}
  // I should change it to accept full name to be safe, OR keep it and use config.appLocation if we are sure it matches.
  // Actually, AuthList passes `auth` to onDelete, and Page calls `api.deleteAuthorization(auth.name, config)`.
  // Wait, let's check AuthorizationsPage usage of delete.

  // If input is full name, use it. If not, construct it.
  if (name.startsWith("projects/")) {
    const location = getLocationFromResourceName(name);
    const baseUrl = getDiscoveryEngineUrl(location);
    const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${name}`;
    return gapiRequest(url, "DELETE", config.projectId);
  } else {
    const baseUrl = getDiscoveryEngineUrl(config.appLocation);
    const url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${config.projectId}/locations/${config.appLocation}/authorizations/${name}`;
    return gapiRequest(url, "DELETE", config.projectId);
  }
};

// Vertex AI Reasoning Engines
export const listReasoningEngines = async (
  config: Config,
  pageToken?: string,
  pageSize: number = 200,
) => {
  const location = config.reasoningEngineLocation || "us-central1";
  let url = `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${config.projectId}/locations/${location}/reasoningEngines?pageSize=${pageSize}`;
  if (pageToken) url += `&pageToken=${pageToken}`;
  return gapiRequest<{
    reasoningEngines: ReasoningEngine[];
    nextPageToken?: string;
  }>(url, "GET", config.projectId);
};

export const getReasoningEngine = async (name: string, config: Config) => {
  const location = name.split("/")[3];
  const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${name}`;
  return gapiRequest<ReasoningEngine>(url, "GET", config.projectId);
};

export const createReasoningEngine = async (config: Config, payload: any) => {
  const location = config.reasoningEngineLocation || "us-central1";
  const url = `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${config.projectId}/locations/${location}/reasoningEngines`;
  return gapiRequest<any>(url, "POST", config.projectId, undefined, payload);
};

export const deleteReasoningEngine = async (name: string, config: Config) => {
  const location = name.split("/")[3];
  // IMPORTANT: Added force=true to automatically handle child resources (sessions) as requested by the API error message.
  const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${name}?force=true`;
  return gapiRequest(url, "DELETE", config.projectId);
};

export const getReasoningEngineSession = async (
  name: string,
  config: Config,
) => {
  const location = name.split("/")[3];
  const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${name}`;
  return gapiRequest<ReasoningEngineSession>(url, "GET", config.projectId);
};

export const listReasoningEngineSessions = async (
  engineName: string,
  config: Config,
) => {
  const location = engineName.split("/")[3];
  const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${engineName}/sessions`;
  return gapiRequest<{ sessions: { name: string }[] }>(
    url,
    "GET",
    config.projectId,
  );
};

export const deleteReasoningEngineSession = async (
  sessionName: string,
  config: Config,
) => {
  const location = sessionName.split("/")[3];
  const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${sessionName}`;
  return gapiRequest(url, "DELETE", config.projectId);
};

export const fetchReasoningEngineAgentCard = async (
  name: string,
  config: Config,
) => {
  const location = name.split("/")[3];
  const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${name}/a2a/v1/card`;
  return gapiRequest<any>(url, "GET", config.projectId);
};

// Stream Assist API
export const streamChat = async (
  agentName: string | null,
  query: string,
  sessionId: string | null,
  config: Config,
  accessToken: string,
  onChunk: (chunk: any) => void,
  toolsSpec?: any,
) => {
  const { projectId, appLocation, collectionId, appId, assistantId } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/v1alpha/projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}/assistants/${assistantId}:streamAssist`;

  const body: any = {
    query: { text: query },
    toolsSpec: toolsSpec,
  };
  if (sessionId) {
    body.session = sessionId;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Goog-User-Project": projectId,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Chat API Faied", {
      status: response.status,
      statusText: response.statusText,
      url,
      body,
      errorText,
    });
    throw new Error(
      `Chat API Error: ${response.status} ${response.statusText} - ${errorText.substring(0, 500)}...`,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";
  let braceBalance = 0;
  let inString = false;
  let isEscaped = false;

  while (true) {
    const { done, value } = await reader.read();
    const chunk = decoder.decode(value || new Uint8Array(), { stream: !done });

    for (const char of chunk) {
      buffer += char;

      if (isEscaped) {
        isEscaped = false;
        continue;
      }
      if (char === "\\") {
        isEscaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === "{") {
          braceBalance++;
        } else if (char === "}") {
          braceBalance--;
          // Balance returns to zero: potentially a complete top-level object
          if (braceBalance === 0) {
            try {
              // Find the last opening brace that started this object
              // Actually, if we track balance from 0, the entire buffer (trimmed) might be the object if we reset buffer on success.
              // But since the stream might contain commas or brackets between objects (e.g. "[{...}, {...}]"), we need to be careful.
              // Simple approach: Try to parse the accumulated buffer if it looks like an object.

              // Remove leading comma or bracket if present and strictly matching an object
              let cleanBuffer = buffer.trim();
              // If it starts with ',' or '[', strip them for checking but we need to be careful not to strip valid parts if we are inside...
              // Actually, robust way: Find first '{'
              const firstBrace = cleanBuffer.indexOf("{");
              if (firstBrace !== -1) {
                const jsonCandidate = cleanBuffer.substring(firstBrace);
                // verify ends with '}'
                if (jsonCandidate.endsWith("}")) {
                  const chunk = JSON.parse(jsonCandidate);
                  onChunk(chunk);
                  buffer = ""; // Reset buffer on success
                }
              }
            } catch (e) {
              // It might be that we haven't reached the REAL end yet if braces were mismatched in logic, or standard parse error.
              // But with brace counting, we should be at a boundary.
              // If parse fails, we might want to keep accumulating?
              // No, if balance is 0, we MUST have finished a potential block.
              // If it fails, it's likely garbage or we need to respect the array structure more.
              // For this logic, we assume top-level objects are what we want.
              console.warn("Could not parse chat chunk via brace counting", e);
              // We don't reset buffer here? If we don't, we might append next object to this garbage.
              // Safest is to reset if we really think we hit a boundary, OR try to recover.
              // Let's reset to avoid infinite buffer growth.
              buffer = "";
            }
          }
        }
      }
    }
    if (done) break;
  }
};

// Stream Query API (Direct Reasoning Engine Query)
export const streamQueryReasoningEngine = async (
  engineName: string,
  query: string,
  userId: string,
  config: Config,
  accessToken: string,
  onChunk: (chunk: any) => void,
) => {
  const { projectId } = config;
  const location = engineName.split("/")[3];
  const url = `https://${location}-aiplatform.googleapis.com/v1beta1/${engineName}:streamQuery`;

  const body = {
    input: {
      message: query,
      user_id: userId,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Goog-User-Project": projectId,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Reasoning Engine Stream API Error: ${response.status} - ${errorText}`,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.trim() === "") continue;
      try {
        const chunk = JSON.parse(line);
        onChunk(chunk);
      } catch (e) {
        console.warn("Could not parse query chunk", line);
      }
    }
  }
};

// Generate Vertex Content (AI Helpers) with robust stream parsing
export const generateVertexContent = async (
  config: Config,
  prompt: string,
  model: string = "gemini-2.5-flash",
  maxOutputTokens: number = 2048,
) => {
  const location = "us-central1";
  const url = `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${config.projectId}/locations/${location}/publishers/google/models/${model}:streamGenerateContent`;

  const client = await getGapiClient();
  const token = client.getToken().access_token;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `Vertex AI Error: ${response.status} - ${await response.text()}`,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";
  let braceBalance = 0;
  let inString = false;
  let isEscaped = false;

  while (true) {
    const { done, value } = await reader.read();
    const chunk = decoder.decode(value || new Uint8Array(), { stream: !done });

    for (const char of chunk) {
      buffer += char;

      if (isEscaped) {
        isEscaped = false;
        continue;
      }
      if (char === "\\") {
        isEscaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === "{") {
          braceBalance++;
        } else if (char === "}") {
          braceBalance--;
          if (braceBalance === 0) {
            // Potential complete object found at top level (chunks are usually arrays of objects, but here we might get individual objects or the array wrapper)
            // Vertex streamGenerateContent returns a stream of Parseable JSON objects like [{...}] or just {...} depending on API version/format.
            // Actually, Vertex returns an array structure `[`, then Objects `{...},`, then `]`.
            // But brace counting logic is mainly for finding the `{...}` objects.

            try {
              const trimmed = buffer.trim();
              // If it starts with ',' or '[' we might need to be careful.
              // Simple heuristic: Try to find the first '{'
              const firstBrace = trimmed.indexOf("{");
              if (firstBrace !== -1) {
                const candidate = trimmed.substring(firstBrace);
                if (candidate.endsWith("}")) {
                  const json = JSON.parse(candidate);
                  // Extract text from the candidate object
                  const part = json.candidates?.[0]?.content?.parts?.[0];
                  if (part?.text) fullText += part.text;

                  buffer = ""; // Reset buffer on success
                }
              }
            } catch (e) {
              // Keep buffering if parse fails
            }
          }
        }
      }
    }
    if (done) break;
  }
  return fullText;
};

// --- Cloud Run Services ---

export const listCloudRunServices = async (config: Config, region: string) => {
  const url = `https://${region}-run.googleapis.com/v2/projects/${config.projectId}/locations/${region}/services`;
  return gapiRequest<any>(url, "GET", config.projectId);
};

export const getCloudRunService = async (name: string, config: Config) => {
  const region = name.split("/")[3];
  const url = `https://${region}-run.googleapis.com/v2/${name}`;
  return gapiRequest<CloudRunService>(url, "GET", config.projectId);
};

export const deleteCloudRunService = async (name: string, config: Config) => {
  const region = name.split("/")[3];
  const url = `https://${region}-run.googleapis.com/v2/${name}`;
  return gapiRequest<any>(url, "DELETE", config.projectId);
};

// --- GCS ---

export const listBuckets = async (projectId: string) => {
  return gapiRequest<any>(
    `https://storage.googleapis.com/storage/v1/b?project=${projectId}`,
    "GET",
    projectId,
  );
};

export const listGcsObjects = async (
  bucket: string,
  prefix: string,
  projectId: string,
) => {
  let url = `https://storage.googleapis.com/storage/v1/b/${bucket}/o`;
  if (prefix) url += `?prefix=${encodeURIComponent(prefix)}`;
  return gapiRequest<any>(url, "GET", projectId);
};

export const getGcsObjectContent = async (
  bucket: string,
  objectName: string,
  projectId: string,
) => {
  const url = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(objectName)}?alt=media`;
  const client = await getGapiClient();
  const response = await client.request({
    path: url,
    method: "GET",
    headers: { "X-Goog-User-Project": projectId },
  });
  return typeof response.body === "string"
    ? response.body
    : JSON.stringify(response.body);
};

export const uploadFileToGcs = async (
  bucket: string,
  objectName: string,
  file: File | Blob,
  projectId: string,
) => {
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;
  const client = await getGapiClient();
  const token = client.getToken().access_token;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Goog-User-Project": projectId,
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(
      `GCS Upload Failed: ${response.status} - ${await response.text()}`,
    );
  }
  return response.json();
};

export const deleteGcsObject = async (
  bucket: string,
  objectName: string,
  projectId: string,
) => {
  const url = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(objectName)}`;
  return gapiRequest<any>(url, "DELETE", projectId);
};

// --- Cloud Build ---

export const createCloudBuild = async (projectId: string, buildConfig: any) => {
  console.log(
    "Submitting Cloud Build with payload:",
    JSON.stringify(buildConfig),
  );
  return gapiRequest<any>(
    `https://cloudbuild.googleapis.com/v1/projects/${projectId}/builds`,
    "POST",
    projectId,
    undefined,
    buildConfig,
    {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  );
};

export const listCloudBuilds = async (projectId: string, filter?: string) => {
  let url = `https://cloudbuild.googleapis.com/v1/projects/${projectId}/builds`;
  if (filter) {
    url += `?filter=${encodeURIComponent(filter)}`;
  }
  return gapiRequest<any>(url, "GET", projectId);
};

export const getCloudBuild = async (projectId: string, buildId: string) => {
  return gapiRequest<any>(
    `https://cloudbuild.googleapis.com/v1/projects/${projectId}/builds/${buildId}`,
    "GET",
    projectId,
  );
};

export const fetchBuildLogs = async (
  projectId: string,
  buildId: string,
): Promise<string[]> => {
  try {
    const build = await getCloudBuild(projectId, buildId);

    // Strategy 1: Attempt direct log access via Cloud Logging (works if Cloud Logging is enabled)
    const filter = `resource.type="build" AND resource.labels.build_id="${buildId}"`;
    const res = await gapiRequest<any>(
      `https://logging.googleapis.com/v2/entries:list`,
      "POST",
      projectId,
      undefined,
      {
        resourceNames: [`projects/${projectId}`],
        filter: filter,
        orderBy: "timestamp asc",
        pageSize: 1000,
      },
    );

    let logs = (res.entries || []).map(
      (e: any) =>
        e.textPayload || JSON.stringify(e.jsonPayload || e.protoPayload),
    );

    if (logs.length > 0) {
      return logs;
    }

    // Strategy 2: If Cloud Logging returns nothing, fallback to the Legacy GCS bucket
    if (build.logsBucket) {
      const bucketName = build.logsBucket.replace("gs://", "");
      const objectName = `log-${buildId}.txt`;

      // Fetch media alt directly without JSON parsing wrapper
      const client = await getGapiClient();
      const token = client.getToken()?.access_token;
      const url = `https://storage.googleapis.com/storage/v1/b/${bucketName}/o/${encodeURIComponent(objectName)}?alt=media`;

      const gcsRes = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (gcsRes.ok) {
        const text = await gcsRes.text();
        logs = text.split("\\n");

        // Remove trailing empty line if it exists
        if (logs.length > 0 && logs[logs.length - 1] === "") {
          logs.pop();
        }

        // Return fallback message if completely empty file
        return logs.length > 0
          ? logs
          : ["Fetching logs from GCS... (Build is starting)"];
      } else if (gcsRes.status === 404) {
        return ["Fetching logs from GCS... (Build is starting)"];
      } else {
        return [`Failed to fetch from GCS: HTTP ${gcsRes.status}`];
      }
    }

    return ["Waiting for logs to stream..."];
  } catch (e) {
    console.warn("Failed to fetch build logs", e);
    return [`Error fetching logs: ${e}`];
  }
};

// --- BigQuery ---

export const listBigQueryDatasets = async (projectId: string) => {
  return gapiRequest<any>(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets`,
    "GET",
    projectId,
  );
};

export const createBigQueryDataset = async (
  projectId: string,
  datasetId: string,
  location: string = "US",
) => {
  const body = {
    datasetReference: { datasetId, projectId },
    location,
  };
  return gapiRequest<any>(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets`,
    "POST",
    projectId,
    undefined,
    body,
  );
};

export const listBigQueryTables = async (
  projectId: string,
  datasetId: string,
) => {
  return gapiRequest<any>(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${datasetId}/tables?maxResults=1000`,
    "GET",
    projectId,
  );
};

export const createBigQueryTable = async (
  projectId: string,
  datasetId: string,
  tableId: string,
) => {
  const body = {
    tableReference: { tableId, datasetId, projectId },
  };
  return gapiRequest<any>(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${datasetId}/tables`,
    "POST",
    projectId,
    undefined,
    body,
  );
};

export const createBigQueryTableWithSchema = async (
  projectId: string,
  datasetId: string,
  tableId: string,
  schema: any,
) => {
  const body = {
    tableReference: { tableId, datasetId, projectId },
    schema,
  };
  return gapiRequest<any>(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${datasetId}/tables`,
    "POST",
    projectId,
    undefined,
    body,
  );
};

export const insertBigQueryRows = async (
  projectId: string,
  datasetId: string,
  tableId: string,
  rows: any[],
) => {
  const body = {
    kind: "bigquery#tableDataInsertAllRequest",
    rows: rows.map((row) => ({
      json: row,
    })),
  };
  return gapiRequest<any>(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${datasetId}/tables/${tableId}/insertAll`,
    "POST",
    projectId,
    undefined,
    body,
  );
};

export const runBigQueryQuery = async (projectId: string, query: string) => {
  return gapiRequest<any>(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`,
    "POST",
    projectId,
    undefined,
    { query, useLegacySql: false },
  );
};

// --- Logging ---

export const fetchViolationLogs = async (
  config: Config,
  customFilter: string = "",
) => {
  const filter = `resource.type="modelarmor.googleapis.com/SanitizeOperation" ${customFilter ? "AND " + customFilter : ""}`;
  return gapiRequest<any>(
    `https://logging.googleapis.com/v2/entries:list`,
    "POST",
    config.projectId,
    undefined,
    {
      resourceNames: [`projects/${config.projectId}`],
      filter: filter,
      orderBy: "timestamp desc",
      pageSize: 50,
    },
  );
};

const extractCloudRunServiceName = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith(".run.app")) return null;
    const subdomains = parsed.hostname.split(".");
    const firstPart = subdomains[0]; // e.g., "oracle-mcp-server-180054373655" or "multi-mcp-vpaohjgvxq-uc"
    const parts = firstPart.split("-");

    if (parts.length <= 1) return firstPart;

    // Check new format: ends with -[10-char-hash]-[region-abbr]
    // e.g. parts = ['multi', 'mcp', 'vpaohjgvxq', 'uc']
    if (parts.length >= 3) {
      const secondToLast = parts[parts.length - 2];
      const lastPart = parts[parts.length - 1];
      const isNewFormat =
        /^[a-z0-9]{10}$/.test(secondToLast) && lastPart.length <= 4;
      if (isNewFormat) {
        parts.splice(-2, 2);
        return parts.join("-");
      }
    }

    // Check old format: ends with -[numeric-project-id-or-hash]
    const lastPart = parts[parts.length - 1];
    if (/^\d+$/.test(lastPart) || lastPart.length >= 8) {
      parts.pop();
    }
    return parts.join("-");
  } catch {
    return null;
  }
};

export const fetchConnectorLogs = async (
  config: Config,
  connectorName: string,
  hoursAgo: number = 24,
  instanceUri?: string,
) => {
  const connectorId = connectorName.split("/").pop();
  const startTime = new Date(
    Date.now() - hoursAgo * 60 * 60 * 1000,
  ).toISOString();

  let filter = `((resource.type="vertex_ai_search_connector" AND resource.labels.connector_id="${connectorId}") OR (jsonPayload.connectorRunPayload.dataConnector="${connectorName}")) AND severity>=ERROR`;

  if (instanceUri) {
    const serviceName = extractCloudRunServiceName(instanceUri);
    if (serviceName) {
      filter = `(${filter}) OR (resource.type="cloud_run_revision" AND resource.labels.service_name="${serviceName}" AND (severity>=WARNING OR httpRequest.status>=400))`;
    }
  }

  filter = `(${filter}) AND timestamp>="${startTime}"`;

  return gapiRequest<any>(
    `https://logging.googleapis.com/v2/entries:list`,
    "POST",
    config.projectId,
    undefined,
    {
      resourceNames: [`projects/${config.projectId}`],
      filter: filter,
      orderBy: "timestamp desc",
      pageSize: 50,
    },
  );
};

export const fetchLastRunLog = async (config: Config, serviceName: string) => {
  const filter = `resource.type="cloud_run_revision" AND resource.labels.service_name="${serviceName}"`;
  return gapiRequest<any>(
    "https://logging.googleapis.com/v2/entries:list",
    "POST",
    config.projectId,
    undefined,
    {
      resourceNames: [`projects/${config.projectId}`],
      filter: filter,
      orderBy: "timestamp desc",
      pageSize: 1,
    },
  );
};

// --- Dialogflow CX ---

export const listDialogflowAgents = async (config: Config) => {
  const location = config.reasoningEngineLocation || "us-central1";
  const url = `https://${location}-dialogflow.googleapis.com/v3/projects/${config.projectId}/locations/${location}/agents`;
  return gapiRequest<any>(url, "GET", config.projectId);
};

export const deleteDialogflowAgent = async (name: string, config: Config) => {
  const location = name.split("/")[3];
  const url = `https://${location}-dialogflow.googleapis.com/v3/${name}`;
  return gapiRequest<any>(url, "DELETE", config.projectId);
};

export const detectDialogflowIntent = async (
  agentName: string,
  query: string,
  sessionId: string,
  config: Config,
  accessToken: string,
) => {
  const location = agentName.split("/")[3];
  const sessionPath = `${agentName}/sessions/${sessionId}`;
  const url = `https://${location}-dialogflow.googleapis.com/v3/${sessionPath}:detectIntent`;

  const body = {
    queryInput: {
      text: { text: query },
      languageCode: "en",
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Goog-User-Project": config.projectId,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `Dialogflow DetectIntent Error: ${response.status} - ${await response.text()}`,
    );
  }
  return response.json();
};

// --- IAM Helper for Agents ---

export const getAgentIamPolicy = async (name: string, config: Config) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${name}:getIamPolicy`;
  return gapiRequest<any>(url, "GET", config.projectId);
};

export const setAgentIamPolicy = async (
  name: string,
  policy: any,
  config: Config,
) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${name}:setIamPolicy`;
  return gapiRequest<any>(url, "POST", config.projectId, undefined, { policy });
};

// --- Compute Engine ---

export const listGlobalForwardingRules = async (projectId: string) => {
  return gapiRequest<any>(
    `https://compute.googleapis.com/compute/v1/projects/${projectId}/global/forwardingRules`,
    "GET",
    projectId,
  );
};

export const listManagedSslCertificates = async (projectId: string) => {
  return gapiRequest<any>(
    `https://compute.googleapis.com/compute/v1/projects/${projectId}/global/sslCertificates`,
    "GET",
    projectId,
  );
};

export const listVpcNetworks = async (projectId: string) => {
  return gapiRequest<any>(
    `https://compute.googleapis.com/compute/v1/projects/${projectId}/global/networks`,
    "GET",
    projectId,
  );
};

export const listVpcSubnets = async (projectId: string, region: string) => {
  return gapiRequest<any>(
    `https://compute.googleapis.com/compute/v1/projects/${projectId}/regions/${region}/subnetworks`,
    "GET",
    projectId,
  );
};

export const listAggregatedForwardingRules = async (projectId: string) => {
  return gapiRequest<any>(
    `https://compute.googleapis.com/compute/v1/projects/${projectId}/aggregated/forwardingRules`,
    "GET",
    projectId,
  );
};

export const listDnsZones = async (projectId: string) => {
  return gapiRequest<any>(
    `https://dns.googleapis.com/dns/v1/projects/${projectId}/managedZones`,
    "GET",
    projectId,
  );
};

export const deleteVanityUrl = async (
  projectId: string,
  serviceName: string,
) => {
  const buildConfig = {
    steps: [
      {
        name: "gcr.io/google.com/cloudsdktool/cloud-sdk",
        entrypoint: "bash",
        args: [
          "-c",
          `
echo "========== STARTING REDIRECT URL & PRIVATE ROUTING INFRASTRUCTURE DISMANTLING =========="
CLEAN_SUFFIX=$(echo "${serviceName}" | sed 's/assistant-//' | tr -d '_' | tr '[:upper:]' '[:lower:]' | cut -c1-12)
ALPHA_SUFFIX=$(echo "${serviceName}" | sed 's/assistant-//' | tr -d '_' | tr -d '-' | tr '[:upper:]' '[:lower:]' | cut -c1-14)

# 1. Dismantling Public Global Load Balancer (if exists)
echo "1. Dismantling Global Forwarding Rules and certificates..."
gcloud compute forwarding-rules delete "${serviceName}-fwd-rule" --global --quiet || true
gcloud compute target-https-proxies delete "${serviceName}-https-proxy" --global --quiet || true
gcloud compute url-maps delete "${serviceName}-url-map" --global --quiet || true
gcloud compute ssl-certificates delete "${serviceName}-cert" --global --quiet || true

# 2. Dismantling Regional Internal Load Balancer (if exists)
echo "2. Dismantling Regional Forwarding Rules and subnets..."
LOCATION="us-central1"
gcloud compute forwarding-rules delete "${serviceName}-internal-fwd-rule" --region=$$LOCATION --quiet || true
gcloud compute target-http-proxies delete "${serviceName}-internal-target-proxy" --region=$$LOCATION --quiet || true
gcloud compute url-maps delete "${serviceName}-internal-map" --region=$$LOCATION --quiet || true
gcloud compute networks subnets delete "${serviceName}-proxy-subnet" --region=$$LOCATION --quiet || true

# 3. Dismantling Private Service Connect (PSC) (if exists)
echo "3. Dismantling Private Service Connect (PSC) endpoints and IPs..."
gcloud compute forwarding-rules delete "pscrldefa$$ALPHA_SUFFIX" --global --quiet || true
gcloud compute forwarding-rules delete "pscrltest$$ALPHA_SUFFIX" --global --quiet || true
gcloud compute addresses delete "psc-ip-default-$$CLEAN_SUFFIX" --global --quiet || true
gcloud compute addresses delete "psc-ip-testcr-$$CLEAN_SUFFIX" --global --quiet || true

# 4. Dismantling Cloud DNS Zones (if exists)
echo "4. Dismantling Private DNS Zones..."
gcloud dns managed-zones delete "${serviceName}-custom-dns" --quiet || true
gcloud dns managed-zones delete "${serviceName}-apis-dns" --quiet || true
gcloud dns managed-zones delete "${serviceName}-cloud-dns" --quiet || true
gcloud dns managed-zones delete "${serviceName}-com-dns" --quiet || true

echo "========== INFRASTRUCTURE DISMANTLING COMPLETE =========="
`,
        ],
      },
    ],
  };
  const buildOp = await createCloudBuild(projectId, buildConfig);
  return buildOp.metadata?.build?.id || "unknown";
};

// --- Assistant Export/Metrics ---

export const exportAnalyticsMetrics = async (
  config: Config,
  datasetId: string,
  tableId: string,
) => {
  const { projectId, appLocation, collectionId, appId } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/v1alpha/projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}/analytics:exportMetrics`;
  const payload: any = {
    outputConfig: {
      bigqueryDestination: {
        datasetId: datasetId,
        tableId: tableId,
      },
    },
  };
  // Note: The v1alpha exportMetrics API currently strictly limits to the last 30 days.
  return gapiRequest<any>(url, "POST", projectId, undefined, payload);
};

export const getAgentEngineToolLatencies = async (
  config: Config,
  resourceId: string,
  startTime: string,
  endTime: string,
  filterBy: "engine_id" | "tool_id" = "engine_id",
) => {
  let filter = "";
  if (filterBy === "engine_id") {
    filter = `metric.type="discoveryengine.googleapis.com/tool_total_latencies" AND resource.labels.engine_id="${resourceId}"`;
  } else {
    filter = `metric.type="discoveryengine.googleapis.com/tool_total_latencies" AND resource.labels.tool_id=has_substring("${resourceId}")`;
  }
  const url = `https://monitoring.googleapis.com/v3/projects/${config.projectId}/timeSeries?filter=${encodeURIComponent(filter)}&interval.startTime=${encodeURIComponent(startTime)}&interval.endTime=${encodeURIComponent(endTime)}`;

  // Using standard fetch because `gapiRequest` headers might interfere and the generic fetch is safer for alternative Google APIs.
  // However, monitoring.googleapis.com expects a standard Bearer token. gapiRequest handles token auth. Let's use it.
  return gapiRequest<any>(url, "GET", config.projectId);
};

export const listUserStoreLicenses = async (
  config: Config,
  userStoreId: string,
  filter?: string,
  pageToken?: string,
  pageSize: number = 20,
) => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  let url = `${baseUrl}/v1/projects/${projectId}/locations/${appLocation}/userStores/${userStoreId}/userLicenses?pageSize=${pageSize}`;
  if (filter) url += `&filter=${encodeURIComponent(filter)}`;
  if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
  return gapiRequest<any>(url, "GET", projectId);
};

export const downloadGcsObject = async (
  bucketInfo: string,
  objectName: string,
  accessToken: string,
) => {
  // API: GET https://storage.googleapis.com/storage/v1/b/{bucket}/o/{object}?alt=media
  const bucketArray = bucketInfo.split("/");
  const bucketName = bucketArray[bucketArray.length - 1]; // ensure we just have the name
  const url = `https://storage.googleapis.com/storage/v1/b/${bucketName}/o/${encodeURIComponent(objectName)}?alt=media`;

  // Using standard fetch because `gapiRequest` natively expects JSON and might try to parse non-json or fail
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `Failed to download object: ${response.status} - ${errText}`,
    );
  }

  return response.blob();
};

export const revokeUserLicenses = async (
  config: Config,
  userStoreId: string,
  userPrincipals: string[],
) => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/v1/projects/${projectId}/locations/${appLocation}/userStores/${userStoreId}:batchUpdateUserLicenses`;

  const body = {
    inlineSource: {
      userLicenses: userPrincipals.map((p) => ({ userPrincipal: p })),
      updateMask: { paths: ["userPrincipal", "licenseConfig"] },
    },
    deleteUnassignedUserLicenses: false,
  };
  return gapiRequest<any>(url, "POST", projectId, undefined, body);
};

export const assignUserLicenses = async (
  config: Config,
  userStoreId: string,
  userPrincipals: string[],
  targetLicenseConfigName: string,
) => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/v1/projects/${projectId}/locations/${appLocation}/userStores/${userStoreId}:batchUpdateUserLicenses`;

  // API limitation: updateMask breaks the reassignment payload, setting it to NO_LICENSE. Do not include it.
  const body = {
    inlineSource: {
      userLicenses: userPrincipals.map((p) => ({
        userPrincipal: p,
        licenseConfig: targetLicenseConfigName,
      })),
    },
  };
  return gapiRequest<any>(url, "POST", projectId, undefined, body);
};

export const deleteUserLicenses = async (
  config: Config,
  userStoreId: string,
  userPrincipals: string[],
) => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/v1/projects/${projectId}/locations/${appLocation}/userStores/${userStoreId}:batchUpdateUserLicenses`;

  const body = {
    inlineSource: {
      userLicenses: userPrincipals.map((p) => ({ userPrincipal: p })),
      updateMask: { paths: ["userPrincipal", "licenseConfig"] },
    },
    deleteUnassignedUserLicenses: true,
  };
  return gapiRequest<any>(url, "POST", projectId, undefined, body);
};

export const registerA2aAgent = async (
  config: Config,
  agentId: string,
  payload: any,
) => {
  return createAgent(payload, config, agentId);
};

export const fetchA2aAgentCard = async (
  serviceUrl: string,
  accessToken: string,
) => {
  const url = `${serviceUrl.replace(/\/$/, "")}/.well-known/agent.json`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(
      `A2A Discovery Error: ${response.status} - ${await response.text()}`,
    );
  }
  return response.json();
};

export const invokeA2aAgent = async (
  serviceUrl: string,
  prompt: string,
  accessToken: string,
) => {
  const url = `${serviceUrl.replace(/\/$/, "")}/invoke`;
  const body = {
    jsonrpc: "2.0",
    method: "chat",
    params: {
      message: { role: "user", parts: [{ text: prompt }] },
      state: {
        AUTH_ID: accessToken,
        gcp_access_token: accessToken,
      },
    },
    id: "1",
  };
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      `A2A Invocation Error: ${response.status} - ${await response.text()}`,
    );
  }
  return response.json();
};

// --- Notebooks ---

export const listNotebooks = async (config: Config) => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  // API: v1alpha/projects/{projectsId}/locations/{locationsId}/notebooks:listRecentlyViewed
  const url = `${baseUrl}/v1alpha/projects/${projectId}/locations/${appLocation}/notebooks:listRecentlyViewed`;
  return gapiRequest<any>(url, "GET", projectId);
};

export const getNotebook = async (config: Config, notebookId: string) => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  // API: v1alpha/projects/{projectsId}/locations/{locationsId}/notebooks/{notebookId}
  const url = `${baseUrl}/v1alpha/projects/${projectId}/locations/${appLocation}/notebooks/${notebookId}`;
  return gapiRequest<any>(url, "GET", projectId);
};

export const getNotebookSource = async (
  config: Config,
  notebookId: string,
  sourceId: string,
) => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  // API: v1alpha/projects/{project}/locations/{location}/notebooks/{notebookId}/sources/{sourceId}
  const url = `${baseUrl}/v1alpha/projects/${projectId}/locations/${appLocation}/notebooks/${notebookId}/sources/${sourceId}`;
  return gapiRequest<any>(url, "GET", projectId);
};

export const createNotebook = async (config: Config, payload: any) => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  // API: v1alpha/projects/{project}/locations/{location}/notebooks
  const url = `${baseUrl}/v1alpha/projects/${projectId}/locations/${appLocation}/notebooks`;
  return gapiRequest<any>(url, "POST", projectId, undefined, payload);
};

export const batchCreateNotebookSources = async (
  config: Config,
  notebookId: string,
  requests: any[],
) => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  // API: v1alpha/projects/{project}/locations/{location}/notebooks/{notebookId}/sources:batchCreate
  const url = `${baseUrl}/v1alpha/projects/${projectId}/locations/${appLocation}/notebooks/${notebookId}/sources:batchCreate`;
  const payload = { userContents: requests };
  return gapiRequest<any>(url, "POST", projectId, undefined, payload);
};

// Workforce Identity Pools
export const validateWorkforcePool = async (
  poolName: string,
  config: Config,
) => {
  // poolName should be full resource name: locations/{location}/workforcePools/{pool_id}
  // API endpoint: https://iam.googleapis.com/v1/{name}
  const url = `https://iam.googleapis.com/v1/${poolName}`;
  return gapiRequest<any>(url, "GET", config.projectId);
};

// --- License Management ---

export const listBillingAccounts = async (config: Config) => {
  // API: GET https://cloudbilling.googleapis.com/v1/billingAccounts
  const url = `https://cloudbilling.googleapis.com/v1/billingAccounts`;
  return gapiRequest<{ billingAccounts: any[] }>(url, "GET", config.projectId);
};

export const testBillingAccountPermissions = async (
  billingAccountId: string,
  config: Config,
) => {
  // API: POST https://cloudbilling.googleapis.com/v1/billingAccounts/{billingAccountId}:testIamPermissions
  const url = `https://cloudbilling.googleapis.com/v1/billingAccounts/${billingAccountId}:testIamPermissions`;
  return gapiRequest<{ permissions: string[] }>(
    url,
    "POST",
    config.projectId,
    undefined,
    {
      permissions: ["billing.accounts.get"],
    },
    undefined,
    true,
  );
};

export const listBillingAccountLicenseConfigs = async (
  billingAccountId: string,
  config: Config,
) => {
  // API: GET .../billingAccounts/{BILLING_ACCOUNT_ID}/billingAccountLicenseConfigs
  // Uses discoveryengine.googleapis.com (v1alpha)
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/billingAccounts/${billingAccountId}/billingAccountLicenseConfigs`;
  return gapiRequest<{ billingAccountLicenseConfigs: any[] }>(
    url,
    "GET",
    config.projectId,
  );
};

export const listLicenseConfigs = async (config: Config) => {
  // API: GET .../projects/{project}/locations/{location}/licenseConfigs
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${appLocation}/licenseConfigs`;
  return gapiRequest<{ licenseConfigs: any[] }>(url, "GET", projectId);
};

export const listLicenseConfigsUsageStats = async (
  config: Config,
  userStoreId: string = "default_user_store",
) => {
  // API: GET .../projects/{project}/locations/{location}/userStores/{user_store_id}/licenseConfigsUsageStats
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${appLocation}/userStores/${userStoreId}/licenseConfigsUsageStats`;
  return gapiRequest<{ licenseConfigUsageStats: any[] }>(url, "GET", projectId);
};

export const listUserLicenses = async (config: Config) => {
  // API: GET .../projects/{project}/locations/{location}/userLicenses
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${appLocation}/userLicenses`;
  return gapiRequest<{ userLicenses: any[] }>(url, "GET", projectId);
};

export const getLicenseConfig = async (name: string, config: Config) => {
  // name is the full resource name: projects/.../licenseConfigs/...
  // API: GET https://discoveryengine.googleapis.com/v1alpha/{name}
  const location = getLocationFromResourceName(name);
  const baseUrl = getDiscoveryEngineUrl(location);
  return gapiRequest<any>(
    `${baseUrl}/${DISCOVERY_API_VERSION}/${name}`,
    "GET",
    config.projectId,
  );
};

// Re-implementing the real append block:
export const distributeLicense = async (
  billingAccountId: string,
  billingAccountLicenseConfigId: string,
  payload: {
    projectNumber: string;
    location: string;
    licenseCount: number;
    licenseConfigId?: string;
  },
  config: Config,
) => {
  const { appLocation, projectId } = config; // We use config.projectId for X-Goog-User-Project header
  // Ideally appLocation should match payload.location or be global?
  // The user instruction says ENDPOINT_LOCATION should match LOCATION.
  const baseUrl = getDiscoveryEngineUrl(payload.location);

  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/billingAccounts/${billingAccountId}/billingAccountLicenseConfigs/${billingAccountLicenseConfigId}:distributeLicenseConfig`;

  // Payload needs: projectNumber, location, licenseCount, licenseConfigId
  return gapiRequest<any>(url, "POST", projectId, undefined, payload);
};

export const probeProjectLicense = async (
  billingAccountId: string,
  billingAccountLicenseConfigId: string,
  projectNumber: string,
  config: Config,
  projectLicenseConfigId?: string,
) => {
  // Probes the project license configuration by distributing 0 licenses.
  // This returns the current state of the license config for the project.
  const payload: any = {
    projectNumber,
    location: config.appLocation, // or 'global', based on config?
    licenseCount: 0,
  };
  if (projectLicenseConfigId) {
    payload.licenseConfigId = projectLicenseConfigId;
  }
  return distributeLicense(
    billingAccountId,
    billingAccountLicenseConfigId,
    payload,
    config,
  );
};

export const retractLicense = async (
  billingAccountId: string,
  billingAccountLicenseConfigId: string,
  payload: {
    licenseConfig: string; // Full resource name
    licenseCount: number; // Decremental count (amount to remove? No, instructions say "unused licenses to retract" but example says "licenseCount: 10" which implies the NEW count?
    // Wait, let's re-read carefully:
    // "LICENSE_COUNT: The number of unused licenses to retract. Note this is the decremental count not absolute count"
    // So if I want to remove 2, I send 2?
    // Example: "if there are 10 licenses on the project, and you want to keep 3 licenses on the project, you’ll need to put 7 here."
    // So it IS the amount to REMOVE.
  },
  config: Config,
) => {
  const { projectId } = config;
  // We need to determine the endpoint location.
  // The instructions say "ENDPOINT_LOCATION: It should match the LOCATION above."
  // We can extract location from the licenseConfig name.
  const location = getLocationFromResourceName(payload.licenseConfig);
  const baseUrl = getDiscoveryEngineUrl(location);

  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/billingAccounts/${billingAccountId}/billingAccountLicenseConfigs/${billingAccountLicenseConfigId}:retractLicenseConfig`;

  return gapiRequest<any>(url, "POST", projectId, undefined, payload);
};

export const checkServiceEnabled = async (
  projectId: string,
  serviceName: string,
): Promise<boolean> => {
  try {
    const response = await gapiRequest<any>(
      `https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${serviceName}`,
      "GET",
      projectId,
    );
    return response.state === "ENABLED";
  } catch (e) {
    console.warn(`Failed to check service ${serviceName}:`, e);
    return false;
  }
};

export const enableService = async (
  projectId: string,
  serviceName: string,
): Promise<void> => {
  await gapiRequest<any>(
    `https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${serviceName}:enable`,
    "POST",
    projectId,
  );
};

export const listMcpTools = async (
  projectId: string,
  mcpEndpointUrl: string,
): Promise<any[]> => {
  try {
    // HARDCODED BYPASS:
    // Gapi rewrites BigQuery hostname to content-bigquery causing a 404.
    // Fetch fails due to lack of CORS headers on the BigQuery MCP endpoint.
    // Therefore, we hardcode the known BigQuery tools for the UI browser.
    if (mcpEndpointUrl.includes("bigquery.googleapis.com")) {
      return [
        {
          name: "list_dataset_ids",
          description: "List BigQuery dataset IDs in a Google Cloud project.",
          inputSchema: {
            properties: { projectId: { type: "string" } },
            required: ["projectId"],
          },
        },
        {
          name: "get_dataset_info",
          description: "Get metadata information about a BigQuery dataset.",
          inputSchema: {
            properties: {
              projectId: { type: "string" },
              datasetId: { type: "string" },
            },
            required: ["projectId", "datasetId"],
          },
        },
        {
          name: "list_table_ids",
          description: "List table ids in a BigQuery dataset.",
          inputSchema: {
            properties: {
              projectId: { type: "string" },
              datasetId: { type: "string" },
            },
            required: ["projectId", "datasetId"],
          },
        },
        {
          name: "get_table_info",
          description: "Get metadata information about a BigQuery table.",
          inputSchema: {
            properties: {
              projectId: { type: "string" },
              datasetId: { type: "string" },
              tableId: { type: "string" },
            },
            required: ["projectId", "datasetId", "tableId"],
          },
        },
        {
          name: "execute_sql",
          description: "Run a SQL query in the project and return the result.",
          inputSchema: {
            properties: {
              projectId: { type: "string" },
              query: { type: "string" },
            },
            required: ["projectId", "query"],
          },
        },
      ];
    }

    if (mcpEndpointUrl.includes("bigtableadmin.googleapis.com")) {
      return [
        {
          name: "list_instances",
          description:
            "Lists information about Bigtable instances in a project.",
          inputSchema: {
            properties: { parent: { type: "string" } },
            required: ["parent"],
          },
        },
        {
          name: "list_tables",
          description: "Lists all tables served from a specified instance.",
          inputSchema: {
            properties: { parent: { type: "string" } },
            required: ["parent"],
          },
        },
        {
          name: "delete_table",
          description: "Delete a table.",
          inputSchema: {
            properties: { name: { type: "string" } },
            required: ["name"],
          },
        },
      ];
    }

    if (mcpEndpointUrl.includes("firestore.googleapis.com")) {
      return [
        {
          name: "run_query",
          description:
            "Runs a generic SQL-like query against Firestore databases.",
          inputSchema: {
            properties: {
              parent: { type: "string" },
              structuredQuery: { type: "object" },
            },
            required: ["parent", "structuredQuery"],
          },
        },
        {
          name: "get_document",
          description: "Gets a single document.",
          inputSchema: {
            properties: { name: { type: "string" } },
            required: ["name"],
          },
        },
        {
          name: "list_documents",
          description: "Lists documents.",
          inputSchema: {
            properties: {
              parent: { type: "string" },
              collectionId: { type: "string" },
            },
            required: ["parent", "collectionId"],
          },
        },
        {
          name: "list_indexes",
          description: "Lists composite indexes.",
          inputSchema: {
            properties: { parent: { type: "string" } },
            required: ["parent"],
          },
        },
        {
          name: "delete_index",
          description: "Delete a Firestore index.",
          inputSchema: {
            properties: { name: { type: "string" } },
            required: ["name"],
          },
        },
      ];
    }

    if (mcpEndpointUrl.includes("compute.googleapis.com")) {
      return [
        {
          annotations: {
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: false,
            readOnlyHint: false,
            title: "Create Google Compute Engine virtual machine (VM) Instance",
          },
          description:
            "Create a new Google Compute Engine virtual machine (VM) instance. Requires project, zone, and instance name as input. If machine_type is not provided, it defaults to `e2-medium`. If image_project and image_family are not provided, it defaults to `debian-12` image from `debian-cloud` project. guest_accelerator and maintenance_policy can be optionally provided. Proceed only if there is no error in response and the status of the operation is `DONE` without any errors. To get details of the operation, use the `get_zone_operation` tool.\n",
          inputSchema: {
            $defs: {
              AcceleratorConfig: {
                description:
                  "A specification of the type and number of accelerator cards attached to the instance.",
                properties: {
                  acceleratorCount: {
                    description:
                      "The number of the guest accelerator cards exposed to this instance.",
                    format: "int32",
                    type: "integer",
                  },
                  acceleratorType: {
                    description:
                      "Full or partial URL of the accelerator type resource to attach to this instance. For example: projects/my-project/zones/us-central1-c/acceleratorTypes/nvidia-tesla-p100 If you are creating an instance template, specify only the accelerator name. See GPUs on Compute Engine </compute/docs/gpus/#introduction> for a full list of accelerator types.",
                    type: "string",
                  },
                },
                type: "object",
              },
            },
            description: "Request message for creating an instance.",
            properties: {
              guestAccelerators: {
                description:
                  "Optional. The list of attached accelerators. Each entry specifies the accelerator type (short name or full/partial URL, e.g., 'nvidia-tesla-p4') and the count.",
                items: { $ref: "#/$defs/AcceleratorConfig" },
                type: "array",
              },
              imageFamily: {
                description: "Optional. The image family of the instance.",
                type: "string",
              },
              imageProject: {
                description: "Optional. The image project of the instance.",
                type: "string",
              },
              machineType: {
                description: "Optional. The machine type of the instance.",
                type: "string",
              },
              maintenancePolicy: {
                description:
                  "Optional. The maintenance policy option for the instance.",
                enum: ["MIGRATE", "TERMINATE"],
                type: "string",
                "x-google-enum-descriptions": [
                  "*[Default]* Allows Compute Engine to automatically migrate instances out of the way of maintenance events.",
                  "Tells Compute Engine to terminate and (optionally) restart the instance away from the maintenance activity. If you would like your instance to be restarted, set the automaticRestart flag to true. Your instance may be restarted more than once, and it may be restarted outside the window of maintenance events.",
                ],
              },
              name: {
                description: "Required. Identifier. The instance name.",
                type: "string",
                "x-google-identifier": true,
              },
              project: {
                description: "Required. Project ID for this request.",
                type: "string",
              },
              zone: {
                description: "Required. The zone of the instance.",
                type: "string",
              },
            },
            required: ["project", "zone", "name"],
            type: "object",
          },
          name: "create_instance",
          outputSchema: {
            description: "Response message for creating an instance.",
            properties: {
              operationName: {
                description: "The operation name of the instance creation.",
                type: "string",
              },
            },
            type: "object",
          },
        },
        {
          annotations: {
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: false,
            readOnlyHint: false,
            title: "Delete Google Compute Engine virtual machine (VM) Instance",
          },
          description:
            "Delete a Google Compute Engine virtual machine (VM) instance. Requires project, zone, and instance name as input. Proceed only if there is no error in response and the status of the operation is `DONE` without any errors. To get details of the operation, use the `get_zone_operation` tool.\n",
          inputSchema: {
            description: "Request message for deleting an instance.",
            properties: {
              name: {
                description: "Required. Identifier. The instance name.",
                type: "string",
                "x-google-identifier": true,
              },
              project: {
                description: "Required. Project ID for this request.",
                type: "string",
              },
              zone: {
                description: "Required. The zone of the instance.",
                type: "string",
              },
            },
            required: ["project", "zone", "name"],
            type: "object",
          },
          name: "delete_instance",
          outputSchema: {
            description: "Response message for deleting an instance.",
            properties: {
              operationName: {
                description: "The operation name of the instance deletion.",
                type: "string",
              },
            },
            type: "object",
          },
        },
        {
          annotations: {
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: false,
            readOnlyHint: false,
            title: "Start Google Compute Engine virtual machine (VM) Instance",
          },
          description:
            "Starts a Google Compute Engine virtual machine (VM) instance. Requires project, zone, and instance name as input. Proceed only if there is no error in response and the status of the operation is `DONE` without any errors. To get details of the operation, use the `get_zone_operation` tool.\n",
          inputSchema: {
            description: "Request message for starting an instance.",
            properties: {
              name: {
                description: "Required. Identifier. The instance name.",
                type: "string",
                "x-google-identifier": true,
              },
              project: {
                description: "Required. Project ID for this request.",
                type: "string",
              },
              zone: {
                description: "Required. The zone of the instance.",
                type: "string",
              },
            },
            required: ["project", "zone", "name"],
            type: "object",
          },
          name: "start_instance",
          outputSchema: {
            description: "Response message for starting an instance.",
            properties: {
              operationName: {
                description: "The operation name of the instance start.",
                type: "string",
              },
            },
            type: "object",
          },
        },
        {
          annotations: {
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: false,
            readOnlyHint: false,
            title: "Stop Google Compute Engine virtual machine (VM) instance",
          },
          description:
            "Stops a Google Compute Engine virtual machine (VM) instance. Requires project, zone, and instance name as input. Proceed only if there is no error in response and the status of the operation is `DONE` without any errors. To get details of the operation, use the `get_zone_operation` tool.\n",
          inputSchema: {
            description: "Request message for stopping an instance.",
            properties: {
              name: {
                description: "Required. Identifier. The instance name.",
                type: "string",
                "x-google-identifier": true,
              },
              project: {
                description: "Required. Project ID for this request.",
                type: "string",
              },
              zone: {
                description: "Required. The zone of the instance.",
                type: "string",
              },
            },
            required: ["project", "zone", "name"],
            type: "object",
          },
          name: "stop_instance",
          outputSchema: {
            description: "Response message for stopping an instance.",
            properties: {
              operationName: {
                description: "The operation name of the instance stop.",
                type: "string",
              },
            },
            type: "object",
          },
        },
        {
          annotations: {
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: false,
            readOnlyHint: false,
            title: "Reset Google Compute Engine virtual machine (VM) Instance",
          },
          description:
            "Resets a Google Compute Engine virtual machine (VM) instance. Requires project, zone, and instance name as input. Proceed only if there is no error in response and the status of the operation is `DONE` without any errors. To get details of the operation, use the `get_zone_operation` tool.\n",
          inputSchema: {
            description: "Request message for resetting an instance.",
            properties: {
              name: {
                description: "Required. Identifier. The instance name.",
                type: "string",
                "x-google-identifier": true,
              },
              project: {
                description: "Required. Project ID for this request.",
                type: "string",
              },
              zone: {
                description: "Required. The zone of the instance.",
                type: "string",
              },
            },
            required: ["project", "zone", "name"],
            type: "object",
          },
          name: "reset_instance",
          outputSchema: {
            description: "Response message for resetting an instance.",
            properties: {
              operationName: {
                description: "The operation name of the instance reset.",
                type: "string",
              },
            },
            type: "object",
          },
        },
        {
          annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true,
            title: "Get VM Instance Basic Info",
          },
          description:
            "Get basic information about a Compute Engine VM instance, including its name, ID, status, machine type, creation timestamp, and attached guest accelerators. Requires project, zone, and instance name as input.\n",
          inputSchema: {
            description: "Request message for getting instance basic info.",
            properties: {
              name: {
                description: "Required. Identifier. The instance name.",
                type: "string",
                "x-google-identifier": true,
              },
              project: {
                description: "Required. Project ID for this request.",
                type: "string",
              },
              zone: {
                description: "Required. The zone of the instance.",
                type: "string",
              },
            },
            required: ["project", "zone", "name"],
            type: "object",
          },
          name: "get_instance_basic_info",
          outputSchema: {
            $defs: {
              AcceleratorConfig: {
                description:
                  "A specification of the type and number of accelerator cards attached to the instance.",
                properties: {
                  acceleratorCount: {
                    description:
                      "The number of the guest accelerator cards exposed to this instance.",
                    format: "int32",
                    type: "integer",
                  },
                  acceleratorType: {
                    description:
                      "Full or partial URL of the accelerator type resource to attach to this instance. For example: projects/my-project/zones/us-central1-c/acceleratorTypes/nvidia-tesla-p100 If you are creating an instance template, specify only the accelerator name. See GPUs on Compute Engine </compute/docs/gpus/#introduction> for a full list of accelerator types.",
                    type: "string",
                  },
                },
                type: "object",
              },
            },
            description: "Response message for getting instance basic info.",
            properties: {
              createTime: {
                description: "Creation timestamp of the instance.",
                format: "date-time",
                type: "string",
              },
              guestAccelerators: {
                description: "Accelerators attached to the instance.",
                items: { $ref: "#/$defs/AcceleratorConfig" },
                type: "array",
              },
              id: {
                description: "The unique identifier for the instance.",
                format: "uint64",
                type: "string",
              },
              machineType: {
                description: "The machine type of the instance.",
                type: "string",
              },
              name: { description: "Name of the instance.", type: "string" },
              status: {
                description: "The status of the instance.",
                enum: [
                  "DEPROVISIONING",
                  "PENDING",
                  "PENDING_STOP",
                  "PROVISIONING",
                  "REPAIRING",
                  "RUNNING",
                  "STAGING",
                  "STOPPED",
                  "STOPPING",
                  "SUSPENDED",
                  "SUSPENDING",
                  "TERMINATED",
                ],
                type: "string",
                "x-google-enum-descriptions": [
                  "The instance is halted and we are performing tear down tasks like network deprogramming, releasing quota, IP, tearing down disks etc.",
                  "For Flex Start provisioning instance is waiting for available capacity from Dynamic Workload Scheduler (DWS).",
                  "The instance is gracefully shutting down.",
                  "Resources are being allocated for the instance.",
                  "The instance is in repair.",
                  "The instance is running.",
                  "All required resources have been allocated and the instance is being started.",
                  "The instance has stopped successfully.",
                  "The instance is currently stopping (either being deleted or killed).",
                  "The instance has suspended.",
                  "The instance is suspending.",
                  "The instance has stopped (either by explicit action or underlying failure).",
                ],
              },
            },
            type: "object",
          },
        },
        {
          annotations: {
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: false,
            readOnlyHint: false,
            title: "Set Machine Type",
          },
          description:
            "Sets the machine type for a stopped Google Compute Engine instance to the specified machine type. Requires project, zone, instance name and machine type as input. Proceed only if there is no error in response and the status of the operation is `DONE` without any errors. To get details of the operation, use the `get_zone_operation` tool.\n",
          inputSchema: {
            description: "Request message for setting machine type.",
            properties: {
              machineType: {
                description: "Required. The machine type of the instance.",
                type: "string",
              },
              name: {
                description: "Required. Identifier. The instance name.",
                type: "string",
                "x-google-identifier": true,
              },
              project: {
                description: "Required. Project ID for this request.",
                type: "string",
              },
              zone: {
                description: "Required. The zone of the instance.",
                type: "string",
              },
            },
            required: ["project", "zone", "name", "machineType"],
            type: "object",
          },
          name: "set_instance_machine_type",
          outputSchema: {
            description: "Response message for setting machine type.",
            properties: {
              operationName: {
                description:
                  "The operation name of the instance machine type change.",
                type: "string",
              },
            },
            type: "object",
          },
        },
        {
          annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true,
            title: "List Instance Attached Disks",
          },
          description:
            "Lists the disks attached to a Compute Engine virtual machine (VM) instance. For each attached disk, the response includes details such as kind, type, mode, saved state, source, device name, index, boot, initialize parameters, auto delete, licenses,, interface, guest OS features, disk encryption key, disk size, shielded instance initial state, force attach, and architecture. Requires project, zone, and instance name as input.\n",
          inputSchema: {
            description: "Request message for listing instance attached disks.",
            properties: {
              name: {
                description: "Required. Identifier. The instance name.",
                type: "string",
                "x-google-identifier": true,
              },
              project: {
                description: "Required. Project ID for this request.",
                type: "string",
              },
              zone: {
                description: "Required. The zone of the instance.",
                type: "string",
              },
            },
            required: ["project", "zone", "name"],
            type: "object",
          },
          name: "list_instance_attached_disks",
          outputSchema: {
            $defs: {
              AttachedDisk: {
                description: "An instance-attached disk resource.",
                properties: {
                  architecture: {
                    description:
                      "Output only. [Output Only] The architecture of the attached disk. Valid values are ARM64 or X86_64.",
                    enum: ["ARCHITECTURE_UNSPECIFIED", "ARM64", "X86_64"],
                    readOnly: true,
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Default value indicating Architecture is not set.",
                      "Machines with architecture ARM64",
                      "Machines with architecture X86_64",
                    ],
                  },
                  autoDelete: {
                    description:
                      "Specifies whether the disk will be auto-deleted when the instance is deleted (but not when the disk is detached from the instance).",
                    type: "boolean",
                  },
                  boot: {
                    description:
                      "Indicates that this is a boot disk. The virtual machine will use the first partition of the disk for its root filesystem.",
                    type: "boolean",
                  },
                  deviceName: {
                    description:
                      "Specifies a unique device name of your choice that is reflected into the /dev/disk/by-id/google-* tree of a Linux operating system running within the instance. This name can be used to reference the device for mounting, resizing, and so on, from within the instance. If not specified, the server chooses a default device name to apply to this disk, in the form persistent-disk-x, where x is a number assigned by Google Compute Engine. This field is only applicable for persistent disks.",
                    type: "string",
                  },
                  diskEncryptionKey: {
                    $ref: "#/$defs/CustomerEncryptionKey",
                    description:
                      "Encrypts or decrypts a disk using a customer-supplied encryption key </compute/docs/disks/customer-supplied-encryption>. If you are creating a new disk, this field encrypts the new disk using an encryption key that you provide. If you are attaching an existing disk that is already encrypted, this field decrypts the disk using the customer-supplied encryption key. If you encrypt a disk using a customer-supplied key, you must provide the same key again when you attempt to use this resource at a later time. For example, you must provide the key when you create a snapshot or an image from the disk or when you attach the disk to a virtual machine instance. If you do not provide an encryption key, then the disk will be encrypted using an automatically generated key and you do not need to provide a key to use the disk later. Note: Instance templates do not store customer-supplied encryption keys </compute/docs/disks/customer-supplied-encryption>, so you cannot use your own keys to encrypt disks in a managed instance group </compute/docs/instance-groups/>. You cannot create VMs that have disks with customer-supplied keys using the bulk insert method </compute/docs/reference/rest/v1/instances/bulkInsert>.",
                  },
                  diskSizeGb: {
                    description: "The size of the disk in GB.",
                    format: "int64",
                    type: "string",
                  },
                  forceAttach: {
                    description:
                      "[Input Only] Whether to force attach the regional disk even if it's currently attached to another instance. If you try to force attach a zonal disk to an instance, you will receive an error.",
                    type: "boolean",
                  },
                  guestOsFeatures: {
                    description:
                      "A list of features to enable on the guest operating system. Applicable only for bootable images. Read Enabling guest operating system features </compute/docs/images/create-delete-deprecate-private-images#guest-os-features> to see a list of available options.",
                    items: { $ref: "#/$defs/GuestOsFeature" },
                    type: "array",
                  },
                  index: {
                    description:
                      "Output only. [Output Only] A zero-based index to this disk, where 0 is reserved for the boot disk. If you have many disks attached to an instance, each disk would have a unique index number.",
                    format: "int32",
                    readOnly: true,
                    type: "integer",
                  },
                  initializeParams: {
                    $ref: "#/$defs/InitializeParams",
                    description:
                      "[Input Only] Specifies the parameters for a new disk that will be created alongside the new instance. Use initialization parameters to create boot disks or local SSDs attached to the new instance. This property is mutually exclusive with the source property; you can only define one or the other, but not both.",
                  },
                  interface: {
                    description:
                      "Specifies the disk interface to use for attaching this disk, which is either SCSI or NVME. For most machine types, the default is SCSI. Local SSDs can use either NVME or SCSI. In certain configurations, persistent disks can use NVMe. For more information, see About persistent disks <https://cloud.google.com/compute/docs/disks/persistent-disks>.",
                    enum: ["NVME", "SCSI"],
                    type: "string",
                    "x-google-enum-descriptions": ["", ""],
                  },
                  kind: {
                    default: "compute#attachedDisk",
                    description:
                      "Output only. [Output Only] Type of the resource. Always compute#attachedDisk for attached disks.",
                    readOnly: true,
                    type: "string",
                  },
                  licenses: {
                    description:
                      "Output only. [Output Only] Any valid publicly visible licenses.",
                    items: { type: "string" },
                    readOnly: true,
                    type: "array",
                  },
                  mode: {
                    description:
                      "The mode in which to attach this disk, either READ_WRITE or READ_ONLY. If not specified, the default is to attach the disk in READ_WRITE mode.",
                    enum: ["READ_ONLY", "READ_WRITE"],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Attaches this disk in read-only mode. Multiple virtual machines can use a disk in read-only mode at a time.",
                      "*[Default]* Attaches this disk in read-write mode. Only one virtual machine at a time can be attached to a disk in read-write mode.",
                    ],
                  },
                  savedState: {
                    description:
                      "Output only. For LocalSSD disks on VM Instances in STOPPED or SUSPENDED state, this field is set to PRESERVED if the LocalSSD data has been saved to a persistent location by customer request. (see the discard_local_ssd option on Stop/Suspend). Read-only in the api.",
                    enum: ["DISK_SAVED_STATE_UNSPECIFIED", "PRESERVED"],
                    readOnly: true,
                    type: "string",
                    "x-google-enum-descriptions": [
                      "*[Default]* Disk state has not been preserved.",
                      "Disk state has been preserved.",
                    ],
                  },
                  shieldedInstanceInitialState: {
                    $ref: "#/$defs/InitialStateConfig",
                    description:
                      "Output only. [Output Only] shielded vm initial state stored on disk",
                    readOnly: true,
                  },
                  source: {
                    description:
                      "Specifies a valid partial or full URL to an existing Persistent Disk resource. When creating a new instance boot disk, one of initializeParams.sourceImage or initializeParams.sourceSnapshot or disks.source is required. If desired, you can also attach existing non-root persistent disks using this property. This field is only applicable for persistent disks. Note that for InstanceTemplate, specify the disk name for zonal disk, and the URL for regional disk.",
                    type: "string",
                  },
                  type: {
                    description:
                      "Specifies the type of the disk, either SCRATCH or PERSISTENT. If not specified, the default is PERSISTENT.",
                    enum: ["PERSISTENT", "SCRATCH"],
                    type: "string",
                    "x-google-enum-descriptions": ["", ""],
                  },
                },
                type: "object",
              },
              CustomerEncryptionKey: {
                properties: {
                  kmsKeyName: {
                    description:
                      'The name of the encryption key that is stored in Google Cloud KMS. For example: "kmsKeyName": "projects/kms_project_id/locations/region/keyRings/ key_region/cryptoKeys/key The fully-qualifed key name may be returned for resource GET requests. For example: "kmsKeyName": "projects/kms_project_id/locations/region/keyRings/ key_region/cryptoKeys/key /cryptoKeyVersions/1 ',
                    type: "string",
                  },
                  kmsKeyServiceAccount: {
                    description:
                      'The service account being used for the encryption request for the given KMS key. If absent, the Compute Engine default service account is used. For example: "kmsKeyServiceAccount": "name@project_id.iam.gserviceaccount.com/ ',
                    type: "string",
                  },
                  rawKey: {
                    description:
                      'Specifies a 256-bit customer-supplied encryption key </compute/docs/disks/customer-supplied-encryption>, encoded in RFC 4648 base64 <https://tools.ietf.org/html/rfc4648#section-4> to either encrypt or decrypt this resource. You can provide either the rawKey or the rsaEncryptedKey. For example: "rawKey": "SGVsbG8gZnJvbSBHb29nbGUgQ2xvdWQgUGxhdGZvcm0=" ',
                    type: "string",
                  },
                  rsaEncryptedKey: {
                    description:
                      'Specifies an RFC 4648 base64 encoded, RSA-wrapped 2048-bit customer-supplied encryption key </compute/docs/disks/customer-supplied-encryption#rsa-encryption> to either encrypt or decrypt this resource. You can provide either the rawKey or the rsaEncryptedKey. For example: "rsaEncryptedKey": "ieCx/NcW06PcT7Ep1X6LUTc/hLvUDYyzSZPPVCVPTVEohpeHASqC8uw5TzyO9U+Fka9JFH z0mBibXUInrC/jEk014kCK/NPjYgEMOyssZ4ZINPKxlUh2zn1bV+MCaTICrdmuSBTWlUUiFoD D6PYznLwh8ZNdaheCeZ8ewEXgFQ8V+sDroLaN3Xs3MDTXQEMMoNUXMCZEIpg9Vtp9x2oe==" The key must meet the following requirements before you can provide it to Compute Engine: 1. The key is wrapped using a RSA public key certificate provided by Google. 2. After being wrapped, the key must be encoded in RFC 4648 base64 <https://tools.ietf.org/html/rfc4648#section-4> encoding. Gets the RSA public key certificate provided by Google at: https://cloud-certs.storage.googleapis.com/google-cloud-csek-ingress.pem ',
                    type: "string",
                  },
                  sha256: {
                    description:
                      "[Output only] The RFC 4648 base64 <https://tools.ietf.org/html/rfc4648#section-4> encoded SHA-256 hash of the customer-supplied encryption key </compute/docs/disks/customer-supplied-encryption> that protects this resource.",
                    type: "string",
                  },
                },
                type: "object",
              },
              FileContentBuffer: {
                properties: {
                  content: {
                    description: "The raw content in the secure keys file.",
                    format: "byte",
                    type: "string",
                  },
                  fileType: {
                    description: "The file type of source file.",
                    enum: ["BIN", "UNDEFINED", "X509"],
                    type: "string",
                    "x-google-enum-descriptions": ["", "", ""],
                  },
                },
                type: "object",
              },
              GuestOsFeature: {
                description: "Guest OS features.",
                properties: {
                  type: {
                    description:
                      "The ID of a supported feature. To add multiple values, use commas to separate values. Set to one or more of the following values: - VIRTIO_SCSI_MULTIQUEUE - WINDOWS - MULTI_IP_SUBNET - UEFI_COMPATIBLE - GVNIC - SEV_CAPABLE - SUSPEND_RESUME_COMPATIBLE - SEV_LIVE_MIGRATABLE_V2 - SEV_SNP_CAPABLE - TDX_CAPABLE - IDPF - SNP_SVSM_CAPABLE For more information, see Enabling guest operating system features </compute/docs/images/create-delete-deprecate-private-images#guest-os-features> .",
                    enum: [
                      "BARE_METAL_LINUX_COMPATIBLE",
                      "FEATURE_TYPE_UNSPECIFIED",
                      "GVNIC",
                      "IDPF",
                      "MULTI_IP_SUBNET",
                      "SECURE_BOOT",
                      "SEV_CAPABLE",
                      "SEV_LIVE_MIGRATABLE",
                      "SEV_LIVE_MIGRATABLE_V2",
                      "SEV_SNP_CAPABLE",
                      "SNP_SVSM_CAPABLE",
                      "TDX_CAPABLE",
                      "UEFI_COMPATIBLE",
                      "VIRTIO_SCSI_MULTIQUEUE",
                      "WINDOWS",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                    ],
                  },
                },
                type: "object",
              },
              InitialStateConfig: {
                description:
                  "Initial State for shielded instance, these are public keys which are safe to store in public",
                properties: {
                  dbs: {
                    description: "The Key Database (db).",
                    items: { $ref: "#/$defs/FileContentBuffer" },
                    type: "array",
                  },
                  dbxs: {
                    description: "The forbidden key database (dbx).",
                    items: { $ref: "#/$defs/FileContentBuffer" },
                    type: "array",
                  },
                  keks: {
                    description: "The Key Exchange Key (KEK).",
                    items: { $ref: "#/$defs/FileContentBuffer" },
                    type: "array",
                  },
                  pk: {
                    $ref: "#/$defs/FileContentBuffer",
                    description: "The Platform Key (PK).",
                  },
                },
                type: "object",
              },
              InitializeParams: {
                description:
                  "[Input Only] Specifies the parameters for a new disk that will be created alongside the new instance. Use initialization parameters to create boot disks or local SSDs attached to the new instance. This field is persisted and returned for instanceTemplate and not returned in the context of instance. This property is mutually exclusive with the source property; you can only define one or the other, but not both.",
                properties: {
                  architecture: {
                    description:
                      "The architecture of the attached disk. Valid values are arm64 or x86_64.",
                    enum: ["ARCHITECTURE_UNSPECIFIED", "ARM64", "X86_64"],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Default value indicating Architecture is not set.",
                      "Machines with architecture ARM64",
                      "Machines with architecture X86_64",
                    ],
                  },
                  description: {
                    description:
                      "An optional description. Provide this property when creating the disk.",
                    type: "string",
                  },
                  diskName: {
                    description:
                      "Specifies the disk name. If not specified, the default is to use the name of the instance. If a disk with the same name already exists in the given region, the existing disk is attached to the new instance and the new disk is not created.",
                    type: "string",
                  },
                  diskSizeGb: {
                    description:
                      "Specifies the size of the disk in base-2 GB. The size must be at least 10 GB. If you specify a sourceImage, which is required for boot disks, the default size is the size of the sourceImage. If you do not specify a sourceImage, the default disk size is 500 GB.",
                    format: "int64",
                    type: "string",
                  },
                  diskType: {
                    description:
                      "Specifies the disk type to use to create the instance. If not specified, the default is pd-standard, specified using the full URL. For example: https://www.googleapis.com/compute/v1/projects/project/zones/zone /diskTypes/pd-standard For a full list of acceptable values, see Persistent disk types </compute/docs/disks#disk-types>. If you specify this field when creating a VM, you can provide either the full or partial URL. For example, the following values are valid: - https://www.googleapis.com/compute/v1/projects/project/zones/zone /diskTypes/diskType - projects/project/zones/zone/diskTypes/diskType - zones/zone/diskTypes/diskType If you specify this field when creating or updating an instance template or all-instances configuration, specify the type of the disk, not the URL. For example: pd-standard.",
                    type: "string",
                  },
                  enableConfidentialCompute: {
                    description:
                      "Whether this disk is using confidential compute mode.",
                    type: "boolean",
                  },
                  labels: {
                    additionalProperties: { type: "string" },
                    description:
                      "Labels to apply to this disk. These can be later modified by the disks.setLabels method. This field is only applicable for persistent disks.",
                    type: "object",
                  },
                  licenses: {
                    description:
                      "A list of publicly visible licenses. Reserved for Google's use.",
                    items: { type: "string" },
                    type: "array",
                  },
                  onUpdateAction: {
                    description:
                      "Specifies which action to take on instance update with this disk. Default is to use the existing disk.",
                    enum: [
                      "RECREATE_DISK",
                      "RECREATE_DISK_IF_SOURCE_CHANGED",
                      "USE_EXISTING_DISK",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Always recreate the disk.",
                      "Recreate the disk if source (image, snapshot) of this disk is different from source of existing disk.",
                      "Use the existing disk, this is the default behaviour.",
                    ],
                  },
                  provisionedIops: {
                    description:
                      "Indicates how many IOPS to provision for the disk. This sets the number of I/O operations per second that the disk can handle. Values must be between 10,000 and 120,000. For more details, see the Extreme persistent disk documentation </compute/docs/disks/extreme-persistent-disk>.",
                    format: "int64",
                    type: "string",
                  },
                  provisionedThroughput: {
                    description:
                      "Indicates how much throughput to provision for the disk. This sets the number of throughput mb per second that the disk can handle. Values must greater than or equal to 1.",
                    format: "int64",
                    type: "string",
                  },
                  replicaZones: {
                    description:
                      "Required for each regional disk associated with the instance. Specify the URLs of the zones where the disk should be replicated to. You must provide exactly two replica zones, and one zone must be the same as the instance zone.",
                    items: { type: "string" },
                    type: "array",
                  },
                  resourceManagerTags: {
                    additionalProperties: { type: "string" },
                    description:
                      "Input only. Resource manager tags to be bound to the disk. Tag keys and values have the same definition as resource manager tags <https://cloud.google.com/resource-manager/docs/tags/tags-overview>. Keys and values can be either in numeric format, such as `tagKeys/{tag_key_id}` and `tagValues/456` or in namespaced format such as `{org_id|project_id}/{tag_key_short_name}` and `{tag_value_short_name}`. The field is ignored (both PUT & PATCH) when empty.",
                    type: "object",
                    writeOnly: true,
                  },
                  resourcePolicies: {
                    description:
                      "Resource policies applied to this disk for automatic snapshot creations. Specified using the full or partial URL. For instance template, specify only the resource policy name.",
                    items: { type: "string" },
                    type: "array",
                  },
                  sourceImage: {
                    description:
                      "The source image to create this disk. When creating a new instance boot disk, one of initializeParams.sourceImage or initializeParams.sourceSnapshot or disks.source is required. To create a disk with one of the public operating system images </compute/docs/images/os-details>, specify the image by its family name. For example, specify family/debian-9 to use the latest Debian 9 image: projects/debian-cloud/global/images/family/debian-9 Alternatively, use a specific version of a public operating system image: projects/debian-cloud/global/images/debian-9-stretch-vYYYYMMDD To create a disk with a custom image that you created, specify the image name in the following format: global/images/my-custom-image You can also specify a custom image by its image family, which returns the latest version of the image in that family. Replace the image name with family/family-name: global/images/family/my-image-family If the source image is deleted later, this field will not be set.",
                    type: "string",
                  },
                  sourceImageEncryptionKey: {
                    $ref: "#/$defs/CustomerEncryptionKey",
                    description:
                      "The customer-supplied encryption key </compute/docs/disks/customer-supplied-encryption> of the source image. Required if the source image is protected by a customer-supplied encryption key. InstanceTemplate and InstancePropertiesPatch do not store customer-supplied encryption keys </compute/docs/disks/customer-supplied-encryption>, so you cannot create disks for instances in a managed instance group </compute/docs/instance-groups/> if the source images are encrypted with your own keys.",
                  },
                  sourceSnapshot: {
                    description:
                      "The source snapshot to create this disk. When creating a new instance boot disk, one of initializeParams.sourceSnapshot or initializeParams.sourceImage or disks.source is required. To create a disk with a snapshot that you created, specify the snapshot name in the following format: global/snapshots/my-backup If the source snapshot is deleted later, this field will not be set. Note: You cannot create VMs in bulk using a snapshot as the source. Use an image instead when you create VMs using the bulk insert method </compute/docs/reference/rest/v1/instances/bulkInsert>.",
                    type: "string",
                  },
                  sourceSnapshotEncryptionKey: {
                    $ref: "#/$defs/CustomerEncryptionKey",
                    description:
                      "The customer-supplied encryption key </compute/docs/disks/customer-supplied-encryption> of the source snapshot.",
                  },
                  storagePool: {
                    description:
                      "The storage pool in which the new disk is created. You can provide this as a partial or full URL to the resource. For example, the following are valid values: - https://www.googleapis.com/compute/v1/projects/project/zones/zone /storagePools/storagePool - projects/project/zones/zone/storagePools/storagePool - zones/zone/storagePools/storagePool ",
                    type: "string",
                  },
                },
                type: "object",
              },
            },
            description:
              "Response message for listing instance attached disks.",
            properties: {
              attachedDisks: {
                description: "The list of attached disks.",
                items: { $ref: "#/$defs/AttachedDisk" },
                type: "array",
              },
            },
            type: "object",
          },
        },
        {
          annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true,
            title: "List VM Instances Basic Info",
          },
          description:
            "Lists Compute Engine virtual machine (VM) instances. Details for each instance include name, ID, status, machine type, creation timestamp, and attached guest accelerators. Use other tools to get more details about each instance. Requires project and zone as input.\n",
          inputSchema: {
            description: "Request message for listing instances basic info.",
            properties: {
              pageSize: {
                description:
                  "Optional. The maximum number of instances to return.",
                format: "int32",
                type: "integer",
              },
              pageToken: {
                description:
                  "Optional. A page token received from a previous call to list instances.",
                type: "string",
              },
              project: {
                description: "Required. Project ID for this request.",
                type: "string",
              },
              zone: {
                description: "Required. The zone of the instances.",
                type: "string",
              },
            },
            required: ["project", "zone"],
            type: "object",
          },
          name: "list_instances",
          outputSchema: {
            $defs: {
              AcceleratorConfig: {
                description:
                  "A specification of the type and number of accelerator cards attached to the instance.",
                properties: {
                  acceleratorCount: {
                    description:
                      "The number of the guest accelerator cards exposed to this instance.",
                    format: "int32",
                    type: "integer",
                  },
                  acceleratorType: {
                    description:
                      "Full or partial URL of the accelerator type resource to attach to this instance. For example: projects/my-project/zones/us-central1-c/acceleratorTypes/nvidia-tesla-p100 If you are creating an instance template, specify only the accelerator name. See GPUs on Compute Engine </compute/docs/gpus/#introduction> for a full list of accelerator types.",
                    type: "string",
                  },
                },
                type: "object",
              },
              InstanceBasicInfo: {
                description:
                  "Response message for getting instance basic info.",
                properties: {
                  createTime: {
                    description: "Creation timestamp of the instance.",
                    format: "date-time",
                    type: "string",
                  },
                  guestAccelerators: {
                    description: "Accelerators attached to the instance.",
                    items: { $ref: "#/$defs/AcceleratorConfig" },
                    type: "array",
                  },
                  id: {
                    description: "The unique identifier for the instance.",
                    format: "uint64",
                    type: "string",
                  },
                  machineType: {
                    description: "The machine type of the instance.",
                    type: "string",
                  },
                  name: {
                    description: "Name of the instance.",
                    type: "string",
                  },
                  status: {
                    description: "The status of the instance.",
                    enum: [
                      "DEPROVISIONING",
                      "PENDING",
                      "PENDING_STOP",
                      "PROVISIONING",
                      "REPAIRING",
                      "RUNNING",
                      "STAGING",
                      "STOPPED",
                      "STOPPING",
                      "SUSPENDED",
                      "SUSPENDING",
                      "TERMINATED",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "The instance is halted and we are performing tear down tasks like network deprogramming, releasing quota, IP, tearing down disks etc.",
                      "For Flex Start provisioning instance is waiting for available capacity from Dynamic Workload Scheduler (DWS).",
                      "The instance is gracefully shutting down.",
                      "Resources are being allocated for the instance.",
                      "The instance is in repair.",
                      "The instance is running.",
                      "All required resources have been allocated and the instance is being started.",
                      "The instance has stopped successfully.",
                      "The instance is currently stopping (either being deleted or killed).",
                      "The instance has suspended.",
                      "The instance is suspending.",
                      "The instance has stopped (either by explicit action or underlying failure).",
                    ],
                  },
                },
                type: "object",
              },
            },
            description: "Response message for listing instances basic info.",
            properties: {
              instances: {
                description: "The list of instances.",
                items: { $ref: "#/$defs/InstanceBasicInfo" },
                type: "array",
              },
              nextPageToken: {
                description:
                  "A token that can be sent as `page_token` to retrieve the next page. If this field is omitted, there are no subsequent pages.",
                type: "string",
              },
            },
            type: "object",
          },
        },
        {
          annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true,
            title: "Get Instance Group Manager Basic Info",
          },
          description:
            "Get basic information about a Compute Engine managed instance group (MIG), including its name, ID, instance template, base instance name, target size, target stopped size, target suspended size, status and creation timestamp. Requires project, zone, and MIG name as input.\n",
          inputSchema: {
            description:
              "Request message for getting instance group manager basic info.",
            properties: {
              name: {
                description:
                  "Required. Identifier. The instance group manager name.",
                type: "string",
                "x-google-identifier": true,
              },
              project: {
                description: "Required. Project ID for this request.",
                type: "string",
              },
              zone: {
                description:
                  "Required. The zone of the instance group manager.",
                type: "string",
              },
            },
            required: ["project", "zone", "name"],
            type: "object",
          },
          name: "get_instance_group_manager_basic_info",
          outputSchema: {
            $defs: {
              AllInstancesConfig: {
                properties: {
                  currentRevision: {
                    description:
                      "Output only. [Output Only] Current all-instances configuration revision. This value is in RFC3339 text format.",
                    readOnly: true,
                    type: "string",
                  },
                  effective: {
                    description:
                      "Output only. [Output Only] A bit indicating whether this configuration has been applied to all managed instances in the group.",
                    readOnly: true,
                    type: "boolean",
                  },
                },
                type: "object",
              },
              PerInstanceConfigs: {
                properties: {
                  allEffective: {
                    description:
                      "Output only. A bit indicating if all of the group's per-instance configurations (listed in the output of a listPerInstanceConfigs API call) have status EFFECTIVE or there are no per-instance-configs.",
                    readOnly: true,
                    type: "boolean",
                  },
                },
                type: "object",
              },
              Stateful: {
                properties: {
                  hasStatefulConfig: {
                    description:
                      "Output only. [Output Only] A bit indicating whether the managed instance group has stateful configuration, that is, if you have configured any items in a stateful policy or in per-instance configs. The group might report that it has no stateful configuration even when there is still some preserved state on a managed instance, for example, if you have deleted all PICs but not yet applied those deletions.",
                    readOnly: true,
                    type: "boolean",
                  },
                  perInstanceConfigs: {
                    $ref: "#/$defs/PerInstanceConfigs",
                    description:
                      "Output only. [Output Only] Status of per-instance configurations on the instances.",
                    readOnly: true,
                  },
                },
                type: "object",
              },
              Status: {
                properties: {
                  allInstancesConfig: {
                    $ref: "#/$defs/AllInstancesConfig",
                    description:
                      "Output only. [Output only] Status of all-instances configuration on the group.",
                    readOnly: true,
                  },
                  autoscaler: {
                    description:
                      "Output only. [Output Only] The URL of the Autoscaler </compute/docs/autoscaler/> that targets this instance group manager.",
                    readOnly: true,
                    type: "string",
                  },
                  isStable: {
                    description:
                      "Output only. [Output Only] A bit indicating whether the managed instance group is in a stable state. A stable state means that: none of the instances in the managed instance group is currently undergoing any type of change (for example, creation, restart, or deletion); no future changes are scheduled for instances in the managed instance group; and the managed instance group itself is not being modified.",
                    readOnly: true,
                    type: "boolean",
                  },
                  stateful: {
                    $ref: "#/$defs/Stateful",
                    description:
                      "Output only. [Output Only] Stateful status of the given Instance Group Manager.",
                    readOnly: true,
                  },
                  versionTarget: {
                    $ref: "#/$defs/VersionTarget",
                    description:
                      "Output only. [Output Only] A status of consistency of Instances' versions with their target version specified by version field on Instance Group Manager.",
                    readOnly: true,
                  },
                },
                type: "object",
              },
              VersionTarget: {
                properties: {
                  isReached: {
                    description:
                      "Output only. [Output Only] A bit indicating whether version target has been reached in this managed instance group, i.e. all instances are in their target version. Instances' target version are specified by version field on Instance Group Manager.",
                    readOnly: true,
                    type: "boolean",
                  },
                },
                type: "object",
              },
            },
            description: "Basic information about an instance group manager.",
            properties: {
              baseInstanceName: {
                description:
                  "The base instance name of the instance group manager.",
                type: "string",
              },
              createTime: {
                description:
                  "Creation timestamp of the instance group manager.",
                format: "date-time",
                type: "string",
              },
              id: {
                description:
                  "The unique identifier for the instance group manager.",
                format: "uint64",
                type: "string",
              },
              instanceTemplate: {
                description:
                  "The instance template of the instance group manager.",
                type: "string",
              },
              name: {
                description: "Name of the instance group manager.",
                type: "string",
              },
              status: {
                $ref: "#/$defs/Status",
                description: "The status of the instance group manager.",
              },
              targetSize: {
                description: "The target size of the instance group manager.",
                format: "int32",
                type: "integer",
              },
              targetStoppedSize: {
                description:
                  "The target stopped size of the instance group manager.",
                format: "int32",
                type: "integer",
              },
              targetSuspendedSize: {
                description:
                  "The target suspended size of the instance group manager.",
                format: "int32",
                type: "integer",
              },
            },
            type: "object",
          },
        },
        {
          annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true,
            title: "List Instance Group Managers Basic Info",
          },
          description:
            "Lists Compute Engine managed instance groups (MIGs). Details for each MIG include name, ID, instance template, base instance name, target size, target stopped size, target suspended size, status and creation timestamp. Requires project and zone as input.\n",
          inputSchema: {
            description:
              "Request message for listing instance group managers basic info.",
            properties: {
              pageSize: {
                description:
                  "Optional. The maximum number of instance group managers to return.",
                format: "int32",
                type: "integer",
              },
              pageToken: {
                description:
                  "Optional. A page token received from a previous call to list instance group managers.",
                type: "string",
              },
              project: {
                description: "Required. Project ID for this request.",
                type: "string",
              },
              zone: {
                description:
                  "Required. The zone of the instance group managers.",
                type: "string",
              },
            },
            required: ["project", "zone"],
            type: "object",
          },
          name: "list_instance_group_managers",
          outputSchema: {
            $defs: {
              AllInstancesConfig: {
                properties: {
                  currentRevision: {
                    description:
                      "Output only. [Output Only] Current all-instances configuration revision. This value is in RFC3339 text format.",
                    readOnly: true,
                    type: "string",
                  },
                  effective: {
                    description:
                      "Output only. [Output Only] A bit indicating whether this configuration has been applied to all managed instances in the group.",
                    readOnly: true,
                    type: "boolean",
                  },
                },
                type: "object",
              },
              InstanceGroupManagerBasicInfo: {
                description:
                  "Basic information about an instance group manager.",
                properties: {
                  baseInstanceName: {
                    description:
                      "The base instance name of the instance group manager.",
                    type: "string",
                  },
                  createTime: {
                    description:
                      "Creation timestamp of the instance group manager.",
                    format: "date-time",
                    type: "string",
                  },
                  id: {
                    description:
                      "The unique identifier for the instance group manager.",
                    format: "uint64",
                    type: "string",
                  },
                  instanceTemplate: {
                    description:
                      "The instance template of the instance group manager.",
                    type: "string",
                  },
                  name: {
                    description: "Name of the instance group manager.",
                    type: "string",
                  },
                  status: {
                    $ref: "#/$defs/Status",
                    description: "The status of the instance group manager.",
                  },
                  targetSize: {
                    description:
                      "The target size of the instance group manager.",
                    format: "int32",
                    type: "integer",
                  },
                  targetStoppedSize: {
                    description:
                      "The target stopped size of the instance group manager.",
                    format: "int32",
                    type: "integer",
                  },
                  targetSuspendedSize: {
                    description:
                      "The target suspended size of the instance group manager.",
                    format: "int32",
                    type: "integer",
                  },
                },
                type: "object",
              },
              PerInstanceConfigs: {
                properties: {
                  allEffective: {
                    description:
                      "Output only. A bit indicating if all of the group's per-instance configurations (listed in the output of a listPerInstanceConfigs API call) have status EFFECTIVE or there are no per-instance-configs.",
                    readOnly: true,
                    type: "boolean",
                  },
                },
                type: "object",
              },
              Stateful: {
                properties: {
                  hasStatefulConfig: {
                    description:
                      "Output only. [Output Only] A bit indicating whether the managed instance group has stateful configuration, that is, if you have configured any items in a stateful policy or in per-instance configs. The group might report that it has no stateful configuration even when there is still some preserved state on a managed instance, for example, if you have deleted all PICs but not yet applied those deletions.",
                    readOnly: true,
                    type: "boolean",
                  },
                  perInstanceConfigs: {
                    $ref: "#/$defs/PerInstanceConfigs",
                    description:
                      "Output only. [Output Only] Status of per-instance configurations on the instances.",
                    readOnly: true,
                  },
                },
                type: "object",
              },
              Status: {
                properties: {
                  allInstancesConfig: {
                    $ref: "#/$defs/AllInstancesConfig",
                    description:
                      "Output only. [Output only] Status of all-instances configuration on the group.",
                    readOnly: true,
                  },
                  autoscaler: {
                    description:
                      "Output only. [Output Only] The URL of the Autoscaler </compute/docs/autoscaler/> that targets this instance group manager.",
                    readOnly: true,
                    type: "string",
                  },
                  isStable: {
                    description:
                      "Output only. [Output Only] A bit indicating whether the managed instance group is in a stable state. A stable state means that: none of the instances in the managed instance group is currently undergoing any type of change (for example, creation, restart, or deletion); no future changes are scheduled for instances in the managed instance group; and the managed instance group itself is not being modified.",
                    readOnly: true,
                    type: "boolean",
                  },
                  stateful: {
                    $ref: "#/$defs/Stateful",
                    description:
                      "Output only. [Output Only] Stateful status of the given Instance Group Manager.",
                    readOnly: true,
                  },
                  versionTarget: {
                    $ref: "#/$defs/VersionTarget",
                    description:
                      "Output only. [Output Only] A status of consistency of Instances' versions with their target version specified by version field on Instance Group Manager.",
                    readOnly: true,
                  },
                },
                type: "object",
              },
              VersionTarget: {
                properties: {
                  isReached: {
                    description:
                      "Output only. [Output Only] A bit indicating whether version target has been reached in this managed instance group, i.e. all instances are in their target version. Instances' target version are specified by version field on Instance Group Manager.",
                    readOnly: true,
                    type: "boolean",
                  },
                },
                type: "object",
              },
            },
            description:
              "Response message for listing instance group managers basic info.",
            properties: {
              instanceGroupManagers: {
                description: "The list of instance group managers.",
                items: { $ref: "#/$defs/InstanceGroupManagerBasicInfo" },
                type: "array",
              },
              nextPageToken: {
                description:
                  "A token that can be sent as `page_token` to retrieve the next page. If this field is omitted, there are no subsequent pages.",
                type: "string",
              },
            },
            type: "object",
          },
        },
        {
          annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true,
            title: "List Managed Instances",
          },
          description:
            "Lists managed instances for a given managed instance group (MIG). For each instance, details include id, instance URL, instance status, and current action. Requires project, zone, and MIG name as input.\n",
          inputSchema: {
            description: "Request message for listing managed instances.",
            properties: {
              name: {
                description:
                  "Required. Identifier. The instance group manager name.",
                type: "string",
                "x-google-identifier": true,
              },
              pageSize: {
                description:
                  "Optional. The maximum number of managed instances to return.",
                format: "int32",
                type: "integer",
              },
              pageToken: {
                description:
                  "Optional. A page token received from a previous call to list managed instances.",
                type: "string",
              },
              project: {
                description: "Required. Project ID for this request.",
                type: "string",
              },
              zone: {
                description:
                  "Required. The zone of the instance group manager.",
                type: "string",
              },
            },
            required: ["project", "zone", "name"],
            type: "object",
          },
          name: "list_managed_instances",
          outputSchema: {
            $defs: {
              ErrorInfo: {
                description:
                  'Describes the cause of the error with structured details. Example of an error when contacting the "pubsub.googleapis.com" API when it is not enabled: { "reason": "API_DISABLED" "domain": "googleapis.com" "metadata": { "resource": "projects/123", "service": "pubsub.googleapis.com" } } This response indicates that the pubsub.googleapis.com API is not enabled. Example of an error that is returned when attempting to create a Spanner instance in a region that is out of stock: { "reason": "STOCKOUT" "domain": "spanner.googleapis.com", "metadata": { "availableRegions": "us-central1,us-east2" } }',
                properties: {
                  domain: {
                    description:
                      'The logical grouping to which the "reason" belongs. The error domain is typically the registered service name of the tool or product that generates the error. Example: "pubsub.googleapis.com". If the error is generated by some common infrastructure, the error domain must be a globally unique value that identifies the infrastructure. For Google API infrastructure, the error domain is "googleapis.com".',
                    type: "string",
                  },
                  metadatas: {
                    additionalProperties: { type: "string" },
                    description:
                      'Additional structured details about this error. Keys must match a regular expression of `a-z+` but should ideally be lowerCamelCase. Also, they must be limited to 64 characters in length. When identifying the current value of an exceeded limit, the units should be contained in the key, not the value. For example, rather than `{"instanceLimit": "100/request"}`, should be returned as, `{"instanceLimitPerRequest": "100"}`, if the client exceeds the number of instances that can be created in a single (batch) request.',
                    type: "object",
                  },
                  reason: {
                    description:
                      "The reason of the error. This is a constant value that identifies the proximate cause of the error. Error reasons are unique within a particular domain of errors. This should be at most 63 characters and match a regular expression of `A-Z+[A-Z0-9]`, which represents UPPER_SNAKE_CASE.",
                    type: "string",
                  },
                },
                type: "object",
              },
              Help: {
                description:
                  "Provides links to documentation or for performing an out of band action. For example, if a quota check failed with an error indicating the calling project hasn't enabled the accessed service, this can contain a URL pointing directly to the right place in the developer console to flip the bit.",
                properties: {
                  links: {
                    description:
                      "URL(s) pointing to additional information on handling the current error.",
                    items: { $ref: "#/$defs/Link" },
                    type: "array",
                  },
                },
                type: "object",
              },
              InstanceHealth: {
                properties: {
                  detailedHealthState: {
                    description:
                      "Output only. [Output Only] The current detailed instance health state.",
                    enum: [
                      "DRAINING",
                      "HEALTHY",
                      "TIMEOUT",
                      "UNHEALTHY",
                      "UNKNOWN",
                    ],
                    readOnly: true,
                    type: "string",
                    "x-google-enum-descriptions": [
                      "The instance is being drained. The existing connections to the instance have time to complete, but the new ones are being refused.",
                      "The instance is reachable i.e. a connection to the application health checking endpoint can be established, and conforms to the requirements defined by the health check.",
                      "The instance is unreachable i.e. a connection to the application health checking endpoint cannot be established, or the server does not respond within the specified timeout.",
                      "The instance is reachable, but does not conform to the requirements defined by the health check.",
                      "The health checking system is aware of the instance but its health is not known at the moment.",
                    ],
                  },
                  healthCheck: {
                    description:
                      "Output only. [Output Only] The URL for the health check that verifies whether the instance is healthy.",
                    readOnly: true,
                    type: "string",
                  },
                },
                type: "object",
              },
              IpAddress: {
                properties: {
                  address: {
                    description:
                      "The URL of the reservation for this IP address.",
                    type: "string",
                  },
                  literal: {
                    description:
                      "An IPv4 internal network address to assign to the instance for this network interface.",
                    type: "string",
                  },
                },
                type: "object",
              },
              LastAttempt: {
                properties: {
                  errors: {
                    description:
                      "Output only. [Output Only] Encountered errors during the last attempt to create or delete the instance.",
                    properties: {
                      errors: {
                        description:
                          "[Output Only] The array of errors encountered while processing this operation.",
                        items: {
                          properties: {
                            code: {
                              description:
                                "[Output Only] The error type identifier for this error.",
                              type: "string",
                            },
                            errorDetails: {
                              description:
                                "[Output Only] An optional list of messages that contain the error details. There is a set of defined message types to use for providing details.The syntax depends on the error code. For example, QuotaExceededInfo will have details when the error code is QUOTA_EXCEEDED.",
                              items: {
                                properties: {
                                  errorInfo: { $ref: "#/$defs/ErrorInfo" },
                                  help: { $ref: "#/$defs/Help" },
                                  localizedMessage: {
                                    $ref: "#/$defs/LocalizedMessage",
                                  },
                                  quotaInfo: {
                                    $ref: "#/$defs/QuotaExceededInfo",
                                  },
                                },
                                type: "object",
                              },
                              type: "array",
                            },
                            location: {
                              description:
                                "[Output Only] Indicates the field in the request that caused the error. This property is optional.",
                              type: "string",
                            },
                            message: {
                              description:
                                "[Output Only] An optional, human-readable error message.",
                              type: "string",
                            },
                          },
                          type: "object",
                        },
                        type: "array",
                      },
                    },
                    readOnly: true,
                    type: "object",
                  },
                },
                type: "object",
              },
              Link: {
                description: "Describes a URL link.",
                properties: {
                  description: {
                    description: "Describes what the link offers.",
                    type: "string",
                  },
                  url: { description: "The URL of the link.", type: "string" },
                },
                type: "object",
              },
              LocalizedMessage: {
                description:
                  "Provides a localized error message that is safe to return to the user which can be attached to an RPC error.",
                properties: {
                  locale: {
                    description:
                      'The locale used following the specification defined at https://www.rfc-editor.org/rfc/bcp/bcp47.txt. Examples are: "en-US", "fr-CH", "es-MX"',
                    type: "string",
                  },
                  message: {
                    description:
                      "The localized error message in the above locale.",
                    type: "string",
                  },
                },
                type: "object",
              },
              ManagedInstance: {
                description: "A Managed Instance resource.",
                properties: {
                  currentAction: {
                    description:
                      "Output only. [Output Only] The current action that the managed instance group has scheduled for the instance. Possible values: - NONE The instance is running, and the managed instance group does not have any scheduled actions for this instance. - CREATING The managed instance group is creating this instance. If the group fails to create this instance, it will try again until it is successful. - CREATING_WITHOUT_RETRIES The managed instance group is attempting to create this instance only once. If the group fails to create this instance, it does not try again and the group's targetSize value is decreased instead. - RECREATING The managed instance group is recreating this instance. - DELETING The managed instance group is permanently deleting this instance. - ABANDONING The managed instance group is abandoning this instance. The instance will be removed from the instance group and from any target pools that are associated with this group. - RESTARTING The managed instance group is restarting the instance. - REFRESHING The managed instance group is applying configuration changes to the instance without stopping it. For example, the group can update the target pool list for an instance without stopping that instance. - VERIFYING The managed instance group has created the instance and it is in the process of being verified. ",
                    enum: [
                      "ABANDONING",
                      "CREATING",
                      "CREATING_WITHOUT_RETRIES",
                      "DELETING",
                      "NONE",
                      "RECREATING",
                      "REFRESHING",
                      "RESTARTING",
                      "RESUMING",
                      "STARTING",
                      "STOPPING",
                      "SUSPENDING",
                      "VERIFYING",
                    ],
                    readOnly: true,
                    type: "string",
                    "x-google-enum-descriptions": [
                      "The managed instance group is abandoning this instance. The instance will be removed from the instance group and from any target pools that are associated with this group.",
                      "The managed instance group is creating this instance. If the group fails to create this instance, it will try again until it is successful.",
                      "The managed instance group is attempting to create this instance only once. If the group fails to create this instance, it does not try again and the group's targetSize value is decreased.",
                      "The managed instance group is permanently deleting this instance.",
                      "The managed instance group has not scheduled any actions for this instance.",
                      "The managed instance group is recreating this instance.",
                      "The managed instance group is applying configuration changes to the instance without stopping it. For example, the group can update the target pool list for an instance without stopping that instance.",
                      "The managed instance group is restarting this instance.",
                      "The managed instance group is resuming this instance.",
                      "The managed instance group is starting this instance.",
                      "The managed instance group is stopping this instance.",
                      "The managed instance group is suspending this instance.",
                      "The managed instance group is verifying this already created instance. Verification happens every time the instance is (re)created or restarted and consists of: 1. Waiting until health check specified as part of this managed instance group's autohealing policy reports HEALTHY. Note: Applies only if autohealing policy has a health check specified 2. Waiting for addition verification steps performed as post-instance creation (subject to future extensions).",
                    ],
                  },
                  id: {
                    description:
                      "Output only. [Output only] The unique identifier for this resource. This field is empty when instance does not exist.",
                    format: "uint64",
                    readOnly: true,
                    type: "string",
                  },
                  instance: {
                    description:
                      "Output only. [Output Only] The URL of the instance. The URL can exist even if the instance has not yet been created.",
                    readOnly: true,
                    type: "string",
                  },
                  instanceHealth: {
                    description:
                      "Output only. [Output Only] Health state of the instance per health-check.",
                    items: { $ref: "#/$defs/InstanceHealth" },
                    readOnly: true,
                    type: "array",
                  },
                  instanceStatus: {
                    description:
                      "Output only. [Output Only] The status of the instance. This field is empty when the instance does not exist.",
                    enum: [
                      "DEPROVISIONING",
                      "PENDING",
                      "PROVISIONING",
                      "REPAIRING",
                      "RUNNING",
                      "STAGING",
                      "STOPPED",
                      "STOPPING",
                      "SUSPENDED",
                      "SUSPENDING",
                      "TERMINATED",
                    ],
                    readOnly: true,
                    type: "string",
                    "x-google-enum-descriptions": [
                      "The instance is halted and we are performing tear down tasks like network deprogramming, releasing quota, IP, tearing down disks etc.",
                      "For Flex Start provisioning instance is waiting for available capacity from Dynamic Workload Scheduler (DWS).",
                      "Resources are being allocated for the instance.",
                      "The instance is in repair.",
                      "The instance is running.",
                      "All required resources have been allocated and the instance is being started.",
                      "The instance has stopped successfully.",
                      "The instance is currently stopping (either being deleted or killed).",
                      "The instance has suspended.",
                      "The instance is suspending.",
                      "The instance has stopped (either by explicit action or underlying failure).",
                    ],
                  },
                  lastAttempt: {
                    $ref: "#/$defs/LastAttempt",
                    description:
                      "Output only. [Output Only] Information about the last attempt to create or delete the instance.",
                    readOnly: true,
                  },
                  name: {
                    description:
                      "Output only. [Output Only] The name of the instance. The name always exists even if the instance has not yet been created.",
                    readOnly: true,
                    type: "string",
                  },
                  preservedStateFromConfig: {
                    $ref: "#/$defs/PreservedState",
                    description:
                      "Output only. [Output Only] Preserved state applied from per-instance config for this instance.",
                    readOnly: true,
                  },
                  preservedStateFromPolicy: {
                    $ref: "#/$defs/PreservedState",
                    description:
                      "Output only. [Output Only] Preserved state generated based on stateful policy for this instance.",
                    readOnly: true,
                  },
                  propertiesFromFlexibilityPolicy: {
                    $ref: "#/$defs/PropertiesFromFlexibilityPolicy",
                    description:
                      "Output only. [Output Only] Instance properties selected for this instance resulting from InstanceFlexibilityPolicy.",
                    readOnly: true,
                  },
                  version: {
                    $ref: "#/$defs/Version",
                    description:
                      "Output only. [Output Only] Intended version of this instance.",
                    readOnly: true,
                  },
                },
                type: "object",
              },
              PreservedDisk: {
                properties: {
                  autoDelete: {
                    description:
                      "These stateful disks will never be deleted during autohealing, update, instance recreate operations. This flag is used to configure if the disk should be deleted after it is no longer used by the group, e.g. when the given instance or the whole MIG is deleted. Note: disks attached in READ_ONLY mode cannot be auto-deleted.",
                    enum: ["NEVER", "ON_PERMANENT_INSTANCE_DELETION"],
                    type: "string",
                    "x-google-enum-descriptions": ["", ""],
                  },
                  mode: {
                    description:
                      "The mode in which to attach this disk, either READ_WRITE or READ_ONLY. If not specified, the default is to attach the disk in READ_WRITE mode.",
                    enum: ["READ_ONLY", "READ_WRITE"],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Attaches this disk in read-only mode. Multiple VM instances can use a disk in READ_ONLY mode at a time.",
                      "*[Default]* Attaches this disk in READ_WRITE mode. Only one VM instance at a time can be attached to a disk in READ_WRITE mode.",
                    ],
                  },
                  source: {
                    description:
                      "The URL of the disk resource that is stateful and should be attached to the VM instance.",
                    type: "string",
                  },
                },
                type: "object",
              },
              PreservedNetworkIp: {
                properties: {
                  autoDelete: {
                    description:
                      "These stateful IPs will never be released during autohealing, update or VM instance recreate operations. This flag is used to configure if the IP reservation should be deleted after it is no longer used by the group, e.g. when the given instance or the whole group is deleted.",
                    enum: ["NEVER", "ON_PERMANENT_INSTANCE_DELETION"],
                    type: "string",
                    "x-google-enum-descriptions": ["", ""],
                  },
                  ipAddress: {
                    $ref: "#/$defs/IpAddress",
                    description: "Ip address representation",
                  },
                },
                type: "object",
              },
              PreservedState: {
                description: "Preserved state for a given instance.",
                properties: {
                  disks: {
                    additionalProperties: { $ref: "#/$defs/PreservedDisk" },
                    description:
                      "Preserved disks defined for this instance. This map is keyed with the device names of the disks.",
                    type: "object",
                  },
                  externalIPs: {
                    additionalProperties: {
                      $ref: "#/$defs/PreservedNetworkIp",
                    },
                    description:
                      "Preserved external IPs defined for this instance. This map is keyed with the name of the network interface.",
                    type: "object",
                  },
                  internalIPs: {
                    additionalProperties: {
                      $ref: "#/$defs/PreservedNetworkIp",
                    },
                    description:
                      "Preserved internal IPs defined for this instance. This map is keyed with the name of the network interface.",
                    type: "object",
                  },
                  metadata: {
                    additionalProperties: { type: "string" },
                    description:
                      "Preserved metadata defined for this instance.",
                    type: "object",
                  },
                },
                type: "object",
              },
              PropertiesFromFlexibilityPolicy: {
                properties: {
                  machineType: {
                    description:
                      "Output only. The machine type to be used for this instance.",
                    readOnly: true,
                    type: "string",
                  },
                },
                type: "object",
              },
              QuotaExceededInfo: {
                description:
                  "Additional details for quota exceeded error for resource quota.",
                properties: {
                  dimensions: {
                    additionalProperties: { type: "string" },
                    description: "The map holding related quota dimensions.",
                    type: "object",
                  },
                  futureLimit: {
                    description:
                      "Future quota limit being rolled out. The limit's unit depends on the quota type or metric.",
                    format: "double",
                    type: "number",
                  },
                  limit: {
                    description:
                      "Current effective quota limit. The limit's unit depends on the quota type or metric.",
                    format: "double",
                    type: "number",
                  },
                  limitName: {
                    description: "The name of the quota limit.",
                    type: "string",
                  },
                  metricName: {
                    description: "The Compute Engine quota metric name.",
                    type: "string",
                  },
                  rolloutStatus: {
                    description: "Rollout status of the future quota limit.",
                    enum: ["IN_PROGRESS", "ROLLOUT_STATUS_UNSPECIFIED"],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "IN_PROGRESS - A rollout is in process which will change the limit value to future limit.",
                      "ROLLOUT_STATUS_UNSPECIFIED - Rollout status is not specified. The default value.",
                    ],
                  },
                },
                type: "object",
              },
              Version: {
                properties: {
                  instanceTemplate: {
                    description:
                      "Output only. [Output Only] The intended template of the instance. This field is empty when current_action is one of { DELETING, ABANDONING }.",
                    readOnly: true,
                    type: "string",
                  },
                  name: {
                    description:
                      "Output only. [Output Only] Name of the version.",
                    readOnly: true,
                    type: "string",
                  },
                },
                type: "object",
              },
            },
            description: "Response message for listing managed instances.",
            properties: {
              managedInstances: {
                description: "The list of managed instances.",
                items: { $ref: "#/$defs/ManagedInstance" },
                type: "array",
              },
              nextPageToken: {
                description:
                  "A token that can be sent as `page_token` to retrieve the next page. If this field is omitted, there are no subsequent pages.",
                type: "string",
              },
            },
            type: "object",
          },
        },
        {
          annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true,
            title: "List Instance Templates Basic Info",
          },
          description:
            "Lists Compute Engine instance templates. Details for each instance template include name, ID, description, machine type, region, and creation timestamp. Requires project as input.\n",
          inputSchema: {
            description:
              "Request message for listing instance templates basic info.",
            properties: {
              pageSize: {
                description:
                  "Optional. The maximum number of instance templates to return.",
                format: "int32",
                type: "integer",
              },
              pageToken: {
                description:
                  "Optional. A page token received from a previous call to list instance templates.",
                type: "string",
              },
              project: {
                description: "Required. Project ID for this request.",
                type: "string",
              },
            },
            required: ["project"],
            type: "object",
          },
          name: "list_instance_templates",
          outputSchema: {
            $defs: {
              InstanceTemplateBasicInfo: {
                description:
                  "InstanceTemplateBasicInfo contains basic information about an instance template.",
                properties: {
                  createTime: {
                    description: "Creation timestamp of the instance template.",
                    format: "date-time",
                    type: "string",
                  },
                  description: {
                    description: "Description of the instance template.",
                    type: "string",
                  },
                  id: {
                    description:
                      "The unique identifier for the instance template.",
                    format: "uint64",
                    type: "string",
                  },
                  machineType: {
                    description: "The machine type of the instance template.",
                    type: "string",
                  },
                  name: {
                    description: "Name of the instance template.",
                    type: "string",
                  },
                  region: {
                    description:
                      "The region of the instance template if it is a regional resource.",
                    type: "string",
                  },
                },
                type: "object",
              },
            },
            description:
              "Response message for listing instance templates basic info.",
            properties: {
              instanceTemplates: {
                description: "The list of instance templates.",
                items: { $ref: "#/$defs/InstanceTemplateBasicInfo" },
                type: "array",
              },
              nextPageToken: {
                description:
                  "A token that can be sent as `page_token` to retrieve the next page. If this field is omitted, there are no subsequent pages.",
                type: "string",
              },
            },
            type: "object",
          },
        },
        {
          annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true,
            title: "Get Instance Template Basic Info",
          },
          description:
            "Get basic information about a Compute Engine instance template, including its name, ID, description, machine type, region, and creation timestamp. Requires project and instance template name as input.\n",
          inputSchema: {
            description:
              "Request message for getting instance template basic info.",
            properties: {
              name: {
                description:
                  "Required. Identifier. Name of the instance template to return.",
                type: "string",
                "x-google-identifier": true,
              },
              project: {
                description: "Required. Project ID for this request.",
                type: "string",
              },
            },
            required: ["project", "name"],
            type: "object",
          },
          name: "get_instance_template_basic_info",
          outputSchema: {
            description:
              "InstanceTemplateBasicInfo contains basic information about an instance template.",
            properties: {
              createTime: {
                description: "Creation timestamp of the instance template.",
                format: "date-time",
                type: "string",
              },
              description: {
                description: "Description of the instance template.",
                type: "string",
              },
              id: {
                description: "The unique identifier for the instance template.",
                format: "uint64",
                type: "string",
              },
              machineType: {
                description: "The machine type of the instance template.",
                type: "string",
              },
              name: {
                description: "Name of the instance template.",
                type: "string",
              },
              region: {
                description:
                  "The region of the instance template if it is a regional resource.",
                type: "string",
              },
            },
            type: "object",
          },
        },
        {
          annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true,
            title: "Get Instance Template Properties",
          },
          description:
            "Get instance properties of a Compute Engine instance template. This includes properties such as description, tags, machine type, network interfaces, disks, metadata, service accounts, scheduling options, labels, guest accelerators, reservation affinity, and shielded/confidential instance configurations. Requires project and instance template name as input.\n",
          inputSchema: {
            description:
              "Request message for getting instance properties of an instance template.",
            properties: {
              name: {
                description:
                  "Required. Identifier. Name of the instance template to return.",
                type: "string",
                "x-google-identifier": true,
              },
              project: {
                description: "Required. Project ID for this request.",
                type: "string",
              },
            },
            required: ["project", "name"],
            type: "object",
          },
          name: "get_instance_template_properties",
          outputSchema: {
            $defs: {
              AcceleratorConfig: {
                description:
                  "A specification of the type and number of accelerator cards attached to the instance.",
                properties: {
                  acceleratorCount: {
                    description:
                      "The number of the guest accelerator cards exposed to this instance.",
                    format: "int32",
                    type: "integer",
                  },
                  acceleratorType: {
                    description:
                      "Full or partial URL of the accelerator type resource to attach to this instance. For example: projects/my-project/zones/us-central1-c/acceleratorTypes/nvidia-tesla-p100 If you are creating an instance template, specify only the accelerator name. See GPUs on Compute Engine </compute/docs/gpus/#introduction> for a full list of accelerator types.",
                    type: "string",
                  },
                },
                type: "object",
              },
              AccessConfig: {
                description:
                  "An access configuration attached to an instance's network interface. Only one access config per instance is supported.",
                properties: {
                  externalIpv6: {
                    description:
                      "Applies to ipv6AccessConfigs only. The first IPv6 address of the external IPv6 range associated with this instance, prefix length is stored in externalIpv6PrefixLength in ipv6AccessConfig. To use a static external IP address, it must be unused and in the same region as the instance's zone. If not specified, Google Cloud will automatically assign an external IPv6 address from the instance's subnetwork.",
                    type: "string",
                  },
                  externalIpv6PrefixLength: {
                    description:
                      "Applies to ipv6AccessConfigs only. The prefix length of the external IPv6 range.",
                    format: "int32",
                    type: "integer",
                  },
                  kind: {
                    default: "compute#accessConfig",
                    description:
                      "Output only. [Output Only] Type of the resource. Always compute#accessConfig for access configs.",
                    readOnly: true,
                    type: "string",
                  },
                  name: {
                    description:
                      "The name of this access configuration. In accessConfigs (IPv4), the default and recommended name is External NAT, but you can use any arbitrary string, such as My external IP or Network Access. In ipv6AccessConfigs, the recommend name is External IPv6.",
                    type: "string",
                  },
                  natIP: {
                    description:
                      "Applies to accessConfigs (IPv4) only. An external IP address </compute/docs/ip-addresses#externaladdresses> associated with this instance. Specify an unused static external IP address available to the project or leave this field undefined to use an IP from a shared ephemeral IP address pool. If you specify a static external IP address, it must live in the same region as the zone of the instance.",
                    type: "string",
                  },
                  networkTier: {
                    description:
                      "This signifies the networking tier used for configuring this access configuration and can only take the following values: PREMIUM, STANDARD. If an AccessConfig is specified without a valid external IP address, an ephemeral IP will be created with this networkTier. If an AccessConfig with a valid external IP address is specified, it must match that of the networkTier associated with the Address resource owning that IP.",
                    enum: [
                      "FIXED_STANDARD",
                      "PREMIUM",
                      "STANDARD",
                      "STANDARD_OVERRIDES_FIXED_STANDARD",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Public internet quality with fixed bandwidth.",
                      "High quality, Google-grade network tier, support for all networking products.",
                      "Public internet quality, only limited support for other networking products.",
                      "(Output only) Temporary tier for FIXED_STANDARD when fixed standard tier is expired or not configured.",
                    ],
                  },
                  publicPtrDomainName: {
                    description:
                      "The DNS domain name for the public PTR record. You can set this field only if the `setPublicPtr` field is enabled in accessConfig. If this field is unspecified in ipv6AccessConfig, a default PTR record will be created for first IP in associated external IPv6 range.",
                    type: "string",
                  },
                  securityPolicy: {
                    description:
                      "The resource URL for the security policy associated with this access config.",
                    type: "string",
                  },
                  setPublicPtr: {
                    description:
                      "Specifies whether a public DNS 'PTR' record should be created to map the external IP address of the instance to a DNS domain name. This field is not used in ipv6AccessConfig. A default PTR record will be created if the VM has external IPv6 range associated.",
                    type: "boolean",
                  },
                  type: {
                    description:
                      "The type of configuration. In accessConfigs (IPv4), the default and only option is ONE_TO_ONE_NAT. In ipv6AccessConfigs, the default and only option is DIRECT_IPV6.",
                    enum: ["DIRECT_IPV6", "ONE_TO_ONE_NAT"],
                    type: "string",
                    "x-google-enum-descriptions": ["", ""],
                  },
                },
                type: "object",
              },
              AdvancedMachineFeatures: {
                description:
                  "Specifies options for controlling advanced machine features. Options that would traditionally be configured in a BIOS belong here. Features that require operating system support may have corresponding entries in the GuestOsFeatures of an Image (e.g., whether or not the OS in the Image supports nested virtualization being enabled or disabled).",
                properties: {
                  enableNestedVirtualization: {
                    description:
                      "Whether to enable nested virtualization or not (default is false).",
                    type: "boolean",
                  },
                  enableUefiNetworking: {
                    description:
                      "Whether to enable UEFI networking for instance creation.",
                    type: "boolean",
                  },
                  performanceMonitoringUnit: {
                    description:
                      "Type of Performance Monitoring Unit requested on instance.",
                    enum: [
                      "ARCHITECTURAL",
                      "ENHANCED",
                      "PERFORMANCE_MONITORING_UNIT_UNSPECIFIED",
                      "STANDARD",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Architecturally defined non-LLC events.",
                      "Most documented core/L2 and LLC events.",
                      "",
                      "Most documented core/L2 events.",
                    ],
                  },
                  threadsPerCore: {
                    description:
                      "The number of threads per physical core. To disable simultaneous multithreading (SMT) set this to 1. If unset, the maximum number of threads supported per core by the underlying processor is assumed.",
                    format: "int32",
                    type: "integer",
                  },
                  turboMode: {
                    description:
                      "Turbo frequency mode to use for the instance. Supported modes include: * ALL_CORE_MAX Using empty string or not setting this field will use the platform-specific default turbo mode.",
                    type: "string",
                  },
                  visibleCoreCount: {
                    description:
                      "The number of physical cores to expose to an instance. Multiply by the number of threads per core to compute the total number of virtual CPUs to expose to the instance. If unset, the number of cores is inferred from the instance's nominal CPU count and the underlying platform's SMT width.",
                    format: "int32",
                    type: "integer",
                  },
                },
                type: "object",
              },
              AliasIpRange: {
                description:
                  "An alias IP range attached to an instance's network interface.",
                properties: {
                  ipCidrRange: {
                    description:
                      "The IP alias ranges to allocate for this interface. This IP CIDR range must belong to the specified subnetwork and cannot contain IP addresses reserved by system or used by other network interfaces. This range may be a single IP address (such as 10.2.3.4), a netmask (such as /24) or a CIDR-formatted string (such as 10.1.2.0/24).",
                    type: "string",
                  },
                  subnetworkRangeName: {
                    description:
                      "The name of a subnetwork secondary IP range from which to allocate an IP alias range. If not specified, the primary range of the subnetwork is used.",
                    type: "string",
                  },
                },
                type: "object",
              },
              AttachedDisk: {
                description: "An instance-attached disk resource.",
                properties: {
                  architecture: {
                    description:
                      "Output only. [Output Only] The architecture of the attached disk. Valid values are ARM64 or X86_64.",
                    enum: ["ARCHITECTURE_UNSPECIFIED", "ARM64", "X86_64"],
                    readOnly: true,
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Default value indicating Architecture is not set.",
                      "Machines with architecture ARM64",
                      "Machines with architecture X86_64",
                    ],
                  },
                  autoDelete: {
                    description:
                      "Specifies whether the disk will be auto-deleted when the instance is deleted (but not when the disk is detached from the instance).",
                    type: "boolean",
                  },
                  boot: {
                    description:
                      "Indicates that this is a boot disk. The virtual machine will use the first partition of the disk for its root filesystem.",
                    type: "boolean",
                  },
                  deviceName: {
                    description:
                      "Specifies a unique device name of your choice that is reflected into the /dev/disk/by-id/google-* tree of a Linux operating system running within the instance. This name can be used to reference the device for mounting, resizing, and so on, from within the instance. If not specified, the server chooses a default device name to apply to this disk, in the form persistent-disk-x, where x is a number assigned by Google Compute Engine. This field is only applicable for persistent disks.",
                    type: "string",
                  },
                  diskEncryptionKey: {
                    $ref: "#/$defs/CustomerEncryptionKey",
                    description:
                      "Encrypts or decrypts a disk using a customer-supplied encryption key </compute/docs/disks/customer-supplied-encryption>. If you are creating a new disk, this field encrypts the new disk using an encryption key that you provide. If you are attaching an existing disk that is already encrypted, this field decrypts the disk using the customer-supplied encryption key. If you encrypt a disk using a customer-supplied key, you must provide the same key again when you attempt to use this resource at a later time. For example, you must provide the key when you create a snapshot or an image from the disk or when you attach the disk to a virtual machine instance. If you do not provide an encryption key, then the disk will be encrypted using an automatically generated key and you do not need to provide a key to use the disk later. Note: Instance templates do not store customer-supplied encryption keys </compute/docs/disks/customer-supplied-encryption>, so you cannot use your own keys to encrypt disks in a managed instance group </compute/docs/instance-groups/>. You cannot create VMs that have disks with customer-supplied keys using the bulk insert method </compute/docs/reference/rest/v1/instances/bulkInsert>.",
                  },
                  diskSizeGb: {
                    description: "The size of the disk in GB.",
                    format: "int64",
                    type: "string",
                  },
                  forceAttach: {
                    description:
                      "[Input Only] Whether to force attach the regional disk even if it's currently attached to another instance. If you try to force attach a zonal disk to an instance, you will receive an error.",
                    type: "boolean",
                  },
                  guestOsFeatures: {
                    description:
                      "A list of features to enable on the guest operating system. Applicable only for bootable images. Read Enabling guest operating system features </compute/docs/images/create-delete-deprecate-private-images#guest-os-features> to see a list of available options.",
                    items: { $ref: "#/$defs/GuestOsFeature" },
                    type: "array",
                  },
                  index: {
                    description:
                      "Output only. [Output Only] A zero-based index to this disk, where 0 is reserved for the boot disk. If you have many disks attached to an instance, each disk would have a unique index number.",
                    format: "int32",
                    readOnly: true,
                    type: "integer",
                  },
                  initializeParams: {
                    $ref: "#/$defs/InitializeParams",
                    description:
                      "[Input Only] Specifies the parameters for a new disk that will be created alongside the new instance. Use initialization parameters to create boot disks or local SSDs attached to the new instance. This property is mutually exclusive with the source property; you can only define one or the other, but not both.",
                  },
                  interface: {
                    description:
                      "Specifies the disk interface to use for attaching this disk, which is either SCSI or NVME. For most machine types, the default is SCSI. Local SSDs can use either NVME or SCSI. In certain configurations, persistent disks can use NVMe. For more information, see About persistent disks <https://cloud.google.com/compute/docs/disks/persistent-disks>.",
                    enum: ["NVME", "SCSI"],
                    type: "string",
                    "x-google-enum-descriptions": ["", ""],
                  },
                  kind: {
                    default: "compute#attachedDisk",
                    description:
                      "Output only. [Output Only] Type of the resource. Always compute#attachedDisk for attached disks.",
                    readOnly: true,
                    type: "string",
                  },
                  licenses: {
                    description:
                      "Output only. [Output Only] Any valid publicly visible licenses.",
                    items: { type: "string" },
                    readOnly: true,
                    type: "array",
                  },
                  mode: {
                    description:
                      "The mode in which to attach this disk, either READ_WRITE or READ_ONLY. If not specified, the default is to attach the disk in READ_WRITE mode.",
                    enum: ["READ_ONLY", "READ_WRITE"],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Attaches this disk in read-only mode. Multiple virtual machines can use a disk in read-only mode at a time.",
                      "*[Default]* Attaches this disk in read-write mode. Only one virtual machine at a time can be attached to a disk in read-write mode.",
                    ],
                  },
                  savedState: {
                    description:
                      "Output only. For LocalSSD disks on VM Instances in STOPPED or SUSPENDED state, this field is set to PRESERVED if the LocalSSD data has been saved to a persistent location by customer request. (see the discard_local_ssd option on Stop/Suspend). Read-only in the api.",
                    enum: ["DISK_SAVED_STATE_UNSPECIFIED", "PRESERVED"],
                    readOnly: true,
                    type: "string",
                    "x-google-enum-descriptions": [
                      "*[Default]* Disk state has not been preserved.",
                      "Disk state has been preserved.",
                    ],
                  },
                  shieldedInstanceInitialState: {
                    $ref: "#/$defs/InitialStateConfig",
                    description:
                      "Output only. [Output Only] shielded vm initial state stored on disk",
                    readOnly: true,
                  },
                  source: {
                    description:
                      "Specifies a valid partial or full URL to an existing Persistent Disk resource. When creating a new instance boot disk, one of initializeParams.sourceImage or initializeParams.sourceSnapshot or disks.source is required. If desired, you can also attach existing non-root persistent disks using this property. This field is only applicable for persistent disks. Note that for InstanceTemplate, specify the disk name for zonal disk, and the URL for regional disk.",
                    type: "string",
                  },
                  type: {
                    description:
                      "Specifies the type of the disk, either SCRATCH or PERSISTENT. If not specified, the default is PERSISTENT.",
                    enum: ["PERSISTENT", "SCRATCH"],
                    type: "string",
                    "x-google-enum-descriptions": ["", ""],
                  },
                },
                type: "object",
              },
              ConfidentialInstanceConfig: {
                description: "A set of Confidential Instance options.",
                properties: {
                  confidentialInstanceType: {
                    description:
                      "Defines the type of technology used by the confidential instance.",
                    enum: [
                      "CONFIDENTIAL_INSTANCE_TYPE_UNSPECIFIED",
                      "SEV",
                      "SEV_SNP",
                      "TDX",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "No type specified. Do not use this value.",
                      "AMD Secure Encrypted Virtualization.",
                      "AMD Secure Encrypted Virtualization - Secure Nested Paging.",
                      "Intel Trust Domain eXtension.",
                    ],
                  },
                  enableConfidentialCompute: {
                    description:
                      "Defines whether the instance should have confidential compute enabled.",
                    type: "boolean",
                  },
                },
                type: "object",
              },
              CustomerEncryptionKey: {
                properties: {
                  kmsKeyName: {
                    description:
                      'The name of the encryption key that is stored in Google Cloud KMS. For example: "kmsKeyName": "projects/kms_project_id/locations/region/keyRings/ key_region/cryptoKeys/key The fully-qualifed key name may be returned for resource GET requests. For example: "kmsKeyName": "projects/kms_project_id/locations/region/keyRings/ key_region/cryptoKeys/key /cryptoKeyVersions/1 ',
                    type: "string",
                  },
                  kmsKeyServiceAccount: {
                    description:
                      'The service account being used for the encryption request for the given KMS key. If absent, the Compute Engine default service account is used. For example: "kmsKeyServiceAccount": "name@project_id.iam.gserviceaccount.com/ ',
                    type: "string",
                  },
                  rawKey: {
                    description:
                      'Specifies a 256-bit customer-supplied encryption key </compute/docs/disks/customer-supplied-encryption>, encoded in RFC 4648 base64 <https://tools.ietf.org/html/rfc4648#section-4> to either encrypt or decrypt this resource. You can provide either the rawKey or the rsaEncryptedKey. For example: "rawKey": "SGVsbG8gZnJvbSBHb29nbGUgQ2xvdWQgUGxhdGZvcm0=" ',
                    type: "string",
                  },
                  rsaEncryptedKey: {
                    description:
                      'Specifies an RFC 4648 base64 encoded, RSA-wrapped 2048-bit customer-supplied encryption key </compute/docs/disks/customer-supplied-encryption#rsa-encryption> to either encrypt or decrypt this resource. You can provide either the rawKey or the rsaEncryptedKey. For example: "rsaEncryptedKey": "ieCx/NcW06PcT7Ep1X6LUTc/hLvUDYyzSZPPVCVPTVEohpeHASqC8uw5TzyO9U+Fka9JFH z0mBibXUInrC/jEk014kCK/NPjYgEMOyssZ4ZINPKxlUh2zn1bV+MCaTICrdmuSBTWlUUiFoD D6PYznLwh8ZNdaheCeZ8ewEXgFQ8V+sDroLaN3Xs3MDTXQEMMoNUXMCZEIpg9Vtp9x2oe==" The key must meet the following requirements before you can provide it to Compute Engine: 1. The key is wrapped using a RSA public key certificate provided by Google. 2. After being wrapped, the key must be encoded in RFC 4648 base64 <https://tools.ietf.org/html/rfc4648#section-4> encoding. Gets the RSA public key certificate provided by Google at: https://cloud-certs.storage.googleapis.com/google-cloud-csek-ingress.pem ',
                    type: "string",
                  },
                  sha256: {
                    description:
                      "[Output only] The RFC 4648 base64 <https://tools.ietf.org/html/rfc4648#section-4> encoded SHA-256 hash of the customer-supplied encryption key </compute/docs/disks/customer-supplied-encryption> that protects this resource.",
                    type: "string",
                  },
                },
                type: "object",
              },
              Duration: {
                description:
                  'A Duration represents a fixed-length span of time represented as a count of seconds and fractions of seconds at nanosecond resolution. It is independent of any calendar and concepts like "day" or "month". Range is approximately 10,000 years.',
                properties: {
                  nanos: {
                    description:
                      "Span of time that's a fraction of a second at nanosecond resolution. Durations less than one second are represented with a 0 `seconds` field and a positive `nanos` field. Must be from 0 to 999,999,999 inclusive.",
                    format: "int32",
                    type: "integer",
                  },
                  seconds: {
                    description:
                      "Span of time at a resolution of a second. Must be from 0 to 315,576,000,000 inclusive. Note: these bounds are computed from: 60 sec/min * 60 min/hr * 24 hr/day * 365.25 days/year * 10000 years",
                    format: "int64",
                    type: "string",
                  },
                },
                type: "object",
              },
              FileContentBuffer: {
                properties: {
                  content: {
                    description: "The raw content in the secure keys file.",
                    format: "byte",
                    type: "string",
                  },
                  fileType: {
                    description: "The file type of source file.",
                    enum: ["BIN", "UNDEFINED", "X509"],
                    type: "string",
                    "x-google-enum-descriptions": ["", "", ""],
                  },
                },
                type: "object",
              },
              GuestOsFeature: {
                description: "Guest OS features.",
                properties: {
                  type: {
                    description:
                      "The ID of a supported feature. To add multiple values, use commas to separate values. Set to one or more of the following values: - VIRTIO_SCSI_MULTIQUEUE - WINDOWS - MULTI_IP_SUBNET - UEFI_COMPATIBLE - GVNIC - SEV_CAPABLE - SUSPEND_RESUME_COMPATIBLE - SEV_LIVE_MIGRATABLE_V2 - SEV_SNP_CAPABLE - TDX_CAPABLE - IDPF - SNP_SVSM_CAPABLE For more information, see Enabling guest operating system features </compute/docs/images/create-delete-deprecate-private-images#guest-os-features> .",
                    enum: [
                      "BARE_METAL_LINUX_COMPATIBLE",
                      "FEATURE_TYPE_UNSPECIFIED",
                      "GVNIC",
                      "IDPF",
                      "MULTI_IP_SUBNET",
                      "SECURE_BOOT",
                      "SEV_CAPABLE",
                      "SEV_LIVE_MIGRATABLE",
                      "SEV_LIVE_MIGRATABLE_V2",
                      "SEV_SNP_CAPABLE",
                      "SNP_SVSM_CAPABLE",
                      "TDX_CAPABLE",
                      "UEFI_COMPATIBLE",
                      "VIRTIO_SCSI_MULTIQUEUE",
                      "WINDOWS",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                    ],
                  },
                },
                type: "object",
              },
              InitialStateConfig: {
                description:
                  "Initial State for shielded instance, these are public keys which are safe to store in public",
                properties: {
                  dbs: {
                    description: "The Key Database (db).",
                    items: { $ref: "#/$defs/FileContentBuffer" },
                    type: "array",
                  },
                  dbxs: {
                    description: "The forbidden key database (dbx).",
                    items: { $ref: "#/$defs/FileContentBuffer" },
                    type: "array",
                  },
                  keks: {
                    description: "The Key Exchange Key (KEK).",
                    items: { $ref: "#/$defs/FileContentBuffer" },
                    type: "array",
                  },
                  pk: {
                    $ref: "#/$defs/FileContentBuffer",
                    description: "The Platform Key (PK).",
                  },
                },
                type: "object",
              },
              InitializeParams: {
                description:
                  "[Input Only] Specifies the parameters for a new disk that will be created alongside the new instance. Use initialization parameters to create boot disks or local SSDs attached to the new instance. This field is persisted and returned for instanceTemplate and not returned in the context of instance. This property is mutually exclusive with the source property; you can only define one or the other, but not both.",
                properties: {
                  architecture: {
                    description:
                      "The architecture of the attached disk. Valid values are arm64 or x86_64.",
                    enum: ["ARCHITECTURE_UNSPECIFIED", "ARM64", "X86_64"],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Default value indicating Architecture is not set.",
                      "Machines with architecture ARM64",
                      "Machines with architecture X86_64",
                    ],
                  },
                  description: {
                    description:
                      "An optional description. Provide this property when creating the disk.",
                    type: "string",
                  },
                  diskName: {
                    description:
                      "Specifies the disk name. If not specified, the default is to use the name of the instance. If a disk with the same name already exists in the given region, the existing disk is attached to the new instance and the new disk is not created.",
                    type: "string",
                  },
                  diskSizeGb: {
                    description:
                      "Specifies the size of the disk in base-2 GB. The size must be at least 10 GB. If you specify a sourceImage, which is required for boot disks, the default size is the size of the sourceImage. If you do not specify a sourceImage, the default disk size is 500 GB.",
                    format: "int64",
                    type: "string",
                  },
                  diskType: {
                    description:
                      "Specifies the disk type to use to create the instance. If not specified, the default is pd-standard, specified using the full URL. For example: https://www.googleapis.com/compute/v1/projects/project/zones/zone /diskTypes/pd-standard For a full list of acceptable values, see Persistent disk types </compute/docs/disks#disk-types>. If you specify this field when creating a VM, you can provide either the full or partial URL. For example, the following values are valid: - https://www.googleapis.com/compute/v1/projects/project/zones/zone /diskTypes/diskType - projects/project/zones/zone/diskTypes/diskType - zones/zone/diskTypes/diskType If you specify this field when creating or updating an instance template or all-instances configuration, specify the type of the disk, not the URL. For example: pd-standard.",
                    type: "string",
                  },
                  enableConfidentialCompute: {
                    description:
                      "Whether this disk is using confidential compute mode.",
                    type: "boolean",
                  },
                  labels: {
                    additionalProperties: { type: "string" },
                    description:
                      "Labels to apply to this disk. These can be later modified by the disks.setLabels method. This field is only applicable for persistent disks.",
                    type: "object",
                  },
                  licenses: {
                    description:
                      "A list of publicly visible licenses. Reserved for Google's use.",
                    items: { type: "string" },
                    type: "array",
                  },
                  onUpdateAction: {
                    description:
                      "Specifies which action to take on instance update with this disk. Default is to use the existing disk.",
                    enum: [
                      "RECREATE_DISK",
                      "RECREATE_DISK_IF_SOURCE_CHANGED",
                      "USE_EXISTING_DISK",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Always recreate the disk.",
                      "Recreate the disk if source (image, snapshot) of this disk is different from source of existing disk.",
                      "Use the existing disk, this is the default behaviour.",
                    ],
                  },
                  provisionedIops: {
                    description:
                      "Indicates how many IOPS to provision for the disk. This sets the number of I/O operations per second that the disk can handle. Values must be between 10,000 and 120,000. For more details, see the Extreme persistent disk documentation </compute/docs/disks/extreme-persistent-disk>.",
                    format: "int64",
                    type: "string",
                  },
                  provisionedThroughput: {
                    description:
                      "Indicates how much throughput to provision for the disk. This sets the number of throughput mb per second that the disk can handle. Values must greater than or equal to 1.",
                    format: "int64",
                    type: "string",
                  },
                  replicaZones: {
                    description:
                      "Required for each regional disk associated with the instance. Specify the URLs of the zones where the disk should be replicated to. You must provide exactly two replica zones, and one zone must be the same as the instance zone.",
                    items: { type: "string" },
                    type: "array",
                  },
                  resourceManagerTags: {
                    additionalProperties: { type: "string" },
                    description:
                      "Input only. Resource manager tags to be bound to the disk. Tag keys and values have the same definition as resource manager tags <https://cloud.google.com/resource-manager/docs/tags/tags-overview>. Keys and values can be either in numeric format, such as `tagKeys/{tag_key_id}` and `tagValues/456` or in namespaced format such as `{org_id|project_id}/{tag_key_short_name}` and `{tag_value_short_name}`. The field is ignored (both PUT & PATCH) when empty.",
                    type: "object",
                    writeOnly: true,
                  },
                  resourcePolicies: {
                    description:
                      "Resource policies applied to this disk for automatic snapshot creations. Specified using the full or partial URL. For instance template, specify only the resource policy name.",
                    items: { type: "string" },
                    type: "array",
                  },
                  sourceImage: {
                    description:
                      "The source image to create this disk. When creating a new instance boot disk, one of initializeParams.sourceImage or initializeParams.sourceSnapshot or disks.source is required. To create a disk with one of the public operating system images </compute/docs/images/os-details>, specify the image by its family name. For example, specify family/debian-9 to use the latest Debian 9 image: projects/debian-cloud/global/images/family/debian-9 Alternatively, use a specific version of a public operating system image: projects/debian-cloud/global/images/debian-9-stretch-vYYYYMMDD To create a disk with a custom image that you created, specify the image name in the following format: global/images/my-custom-image You can also specify a custom image by its image family, which returns the latest version of the image in that family. Replace the image name with family/family-name: global/images/family/my-image-family If the source image is deleted later, this field will not be set.",
                    type: "string",
                  },
                  sourceImageEncryptionKey: {
                    $ref: "#/$defs/CustomerEncryptionKey",
                    description:
                      "The customer-supplied encryption key </compute/docs/disks/customer-supplied-encryption> of the source image. Required if the source image is protected by a customer-supplied encryption key. InstanceTemplate and InstancePropertiesPatch do not store customer-supplied encryption keys </compute/docs/disks/customer-supplied-encryption>, so you cannot create disks for instances in a managed instance group </compute/docs/instance-groups/> if the source images are encrypted with your own keys.",
                  },
                  sourceSnapshot: {
                    description:
                      "The source snapshot to create this disk. When creating a new instance boot disk, one of initializeParams.sourceSnapshot or initializeParams.sourceImage or disks.source is required. To create a disk with a snapshot that you created, specify the snapshot name in the following format: global/snapshots/my-backup If the source snapshot is deleted later, this field will not be set. Note: You cannot create VMs in bulk using a snapshot as the source. Use an image instead when you create VMs using the bulk insert method </compute/docs/reference/rest/v1/instances/bulkInsert>.",
                    type: "string",
                  },
                  sourceSnapshotEncryptionKey: {
                    $ref: "#/$defs/CustomerEncryptionKey",
                    description:
                      "The customer-supplied encryption key </compute/docs/disks/customer-supplied-encryption> of the source snapshot.",
                  },
                  storagePool: {
                    description:
                      "The storage pool in which the new disk is created. You can provide this as a partial or full URL to the resource. For example, the following are valid values: - https://www.googleapis.com/compute/v1/projects/project/zones/zone /storagePools/storagePool - projects/project/zones/zone/storagePools/storagePool - zones/zone/storagePools/storagePool ",
                    type: "string",
                  },
                },
                type: "object",
              },
              Metadata: {
                description: "A metadata key/value entry.",
                properties: {
                  fingerprint: {
                    description:
                      "Specifies a fingerprint for this request, which is essentially a hash of the metadata's contents and used for optimistic locking. The fingerprint is initially generated by Compute Engine and changes after every request to modify or update metadata. You must always provide an up-to-date fingerprint hash in order to update or change metadata, otherwise the request will fail with error 412 conditionNotMet. To see the latest fingerprint, make a get() request to retrieve the resource.",
                    format: "byte",
                    type: "string",
                  },
                  items: {
                    description:
                      "Array of key/value pairs. The total size of all keys and values must be less than 512 KB.",
                    items: {
                      description: "Metadata",
                      properties: {
                        key: {
                          description:
                            "Key for the metadata entry. Keys must conform to the following regexp: [a-zA-Z0-9-_]+, and be less than 128 bytes in length. This is reflected as part of a URL in the metadata server. Additionally, to avoid ambiguity, keys must not conflict with any other metadata keys for the project.",
                          pattern: "[a-zA-Z0-9-_]{1,128}",
                          type: "string",
                        },
                        value: {
                          description:
                            "Value for the metadata entry. These are free-form strings, and only have meaning as interpreted by the image running in the instance. The only restriction placed on values is that their size must be less than or equal to 262144 bytes (256 KiB).",
                          type: "string",
                        },
                      },
                      type: "object",
                    },
                    type: "array",
                  },
                  kind: {
                    default: "compute#metadata",
                    description:
                      "Output only. [Output Only] Type of the resource. Always compute#metadata for metadata.",
                    readOnly: true,
                    type: "string",
                  },
                },
                type: "object",
              },
              NetworkInterface: {
                description:
                  "A network interface resource attached to an instance.",
                properties: {
                  accessConfigs: {
                    description:
                      "An array of configurations for this interface. Currently, only one access config, ONE_TO_ONE_NAT, is supported. If there are no accessConfigs specified, then this instance will have no external internet access.",
                    items: { $ref: "#/$defs/AccessConfig" },
                    type: "array",
                  },
                  aliasIpRanges: {
                    description:
                      "An array of alias IP ranges for this network interface. You can only specify this field for network interfaces in VPC networks.",
                    items: { $ref: "#/$defs/AliasIpRange" },
                    type: "array",
                  },
                  enableVpcScopedDns: {
                    description:
                      "Optional. If true, DNS resolution will be enabled over this interface. Only valid with network_attachment.",
                    type: "boolean",
                  },
                  fingerprint: {
                    description:
                      "Fingerprint hash of contents stored in this network interface. This field will be ignored when inserting an Instance or adding a NetworkInterface. An up-to-date fingerprint must be provided in order to update the NetworkInterface. The request will fail with error 400 Bad Request if the fingerprint is not provided, or 412 Precondition Failed if the fingerprint is out of date.",
                    format: "byte",
                    type: "string",
                  },
                  igmpQuery: {
                    description:
                      "Indicate whether igmp query is enabled on the network interface or not. If enabled, also indicates the version of IGMP supported.",
                    enum: ["IGMP_QUERY_DISABLED", "IGMP_QUERY_V2"],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "The network interface has disabled IGMP query.",
                      "The network interface has enabled IGMP query - v2.",
                    ],
                  },
                  internalIpv6PrefixLength: {
                    description:
                      "The prefix length of the primary internal IPv6 range.",
                    format: "int32",
                    type: "integer",
                  },
                  ipv6AccessConfigs: {
                    description:
                      "An array of IPv6 access configurations for this interface. Currently, only one IPv6 access config, DIRECT_IPV6, is supported. If there is no ipv6AccessConfig specified, then this instance will have no external IPv6 Internet access.",
                    items: { $ref: "#/$defs/AccessConfig" },
                    type: "array",
                  },
                  ipv6AccessType: {
                    description:
                      "Output only. [Output Only] One of EXTERNAL, INTERNAL to indicate whether the IP can be accessed from the Internet. This field is always inherited from its subnetwork. Valid only if stackType is IPV4_IPV6.",
                    enum: ["EXTERNAL", "INTERNAL"],
                    readOnly: true,
                    type: "string",
                    "x-google-enum-descriptions": [
                      "This network interface can have external IPv6.",
                      "This network interface can have internal IPv6.",
                    ],
                  },
                  ipv6Address: {
                    description:
                      "An IPv6 internal network address for this network interface. To use a static internal IP address, it must be unused and in the same region as the instance's zone. If not specified, Google Cloud will automatically assign an internal IPv6 address from the instance's subnetwork.",
                    type: "string",
                  },
                  kind: {
                    default: "compute#networkInterface",
                    description:
                      "Output only. [Output Only] Type of the resource. Always compute#networkInterface for network interfaces.",
                    readOnly: true,
                    type: "string",
                  },
                  name: {
                    description:
                      "[Output Only] The name of the network interface, which is generated by the server. For a VM, the network interface uses the nicN naming format. Where N is a value between 0 and 7. The default interface value is nic0.",
                    type: "string",
                  },
                  network: {
                    description:
                      "URL of the VPC network resource for this instance. When creating an instance, if neither the network nor the subnetwork is specified, the default network global/networks/default is used. If the selected project doesn't have the default network, you must specify a network or subnet. If the network is not specified but the subnetwork is specified, the network is inferred. If you specify this property, you can specify the network as a full or partial URL. For example, the following are all valid URLs: - https://www.googleapis.com/compute/v1/projects/project/global/networks/ network - projects/project/global/networks/network - global/networks/default ",
                    type: "string",
                  },
                  networkAttachment: {
                    description:
                      "The URL of the network attachment that this interface should connect to in the following format: projects/{project_number}/regions/{region_name}/networkAttachments/{network_attachment_name}.",
                    type: "string",
                  },
                  networkIP: {
                    description:
                      "An IPv4 internal IP address to assign to the instance for this network interface. If not specified by the user, an unused internal IP is assigned by the system.",
                    type: "string",
                  },
                  nicType: {
                    description:
                      "The type of vNIC to be used on this interface. This may be gVNIC or VirtioNet.",
                    enum: [
                      "GVNIC",
                      "IDPF",
                      "IRDMA",
                      "MRDMA",
                      "UNSPECIFIED_NIC_TYPE",
                      "VIRTIO_NET",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "GVNIC",
                      "IDPF",
                      "IRDMA",
                      "MRDMA",
                      "No type specified.",
                      "VIRTIO",
                    ],
                  },
                  parentNicName: {
                    description:
                      "Name of the parent network interface of a dynamic network interface.",
                    type: "string",
                  },
                  queueCount: {
                    description:
                      "The networking queue count that's specified by users for the network interface. Both Rx and Tx queues will be set to this number. It'll be empty if not specified by the users.",
                    format: "int32",
                    type: "integer",
                  },
                  stackType: {
                    description:
                      "The stack type for this network interface. To assign only IPv4 addresses, use IPV4_ONLY. To assign both IPv4 and IPv6 addresses, use IPV4_IPV6. If not specified, IPV4_ONLY is used. This field can be both set at instance creation and update network interface operations.",
                    enum: ["IPV4_IPV6", "IPV4_ONLY", "IPV6_ONLY"],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "The network interface can have both IPv4 and IPv6 addresses.",
                      "The network interface will only be assigned IPv4 addresses.",
                      "The network interface will only be assigned IPv6 addresses.",
                    ],
                  },
                  subnetwork: {
                    description:
                      "The URL of the Subnetwork resource for this instance. If the network resource is in legacy </vpc/docs/legacy> mode, do not specify this field. If the network is in auto subnet mode, specifying the subnetwork is optional. If the network is in custom subnet mode, specifying the subnetwork is required. If you specify this field, you can specify the subnetwork as a full or partial URL. For example, the following are all valid URLs: - https://www.googleapis.com/compute/v1/projects/project/regions/region /subnetworks/subnetwork - regions/region/subnetworks/subnetwork ",
                    type: "string",
                  },
                  vlan: {
                    description:
                      "VLAN tag of a dynamic network interface, must be an integer in the range from 2 to 255 inclusively.",
                    format: "int32",
                    type: "integer",
                  },
                },
                type: "object",
              },
              NetworkPerformanceConfig: {
                properties: {
                  totalEgressBandwidthTier: {
                    enum: ["DEFAULT", "TIER_1"],
                    type: "string",
                    "x-google-enum-descriptions": ["", ""],
                  },
                },
                type: "object",
              },
              NodeAffinity: {
                description:
                  "Node Affinity: the configuration of desired nodes onto which this Instance could be scheduled.",
                properties: {
                  key: {
                    description:
                      "Corresponds to the label key of Node resource.",
                    type: "string",
                  },
                  operator: {
                    description:
                      "Defines the operation of node selection. Valid operators are IN for affinity and NOT_IN for anti-affinity.",
                    enum: ["IN", "NOT_IN", "OPERATOR_UNSPECIFIED"],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Requires Compute Engine to seek for matched nodes.",
                      "Requires Compute Engine to avoid certain nodes.",
                      "",
                    ],
                  },
                  values: {
                    description:
                      "Corresponds to the label values of Node resource.",
                    items: { type: "string" },
                    type: "array",
                  },
                },
                type: "object",
              },
              OnInstanceStopAction: {
                description:
                  "Defines the behaviour for instances with the instance_termination_action STOP.",
                properties: {
                  discardLocalSsd: {
                    description:
                      "If true, the contents of any attached Local SSD disks will be discarded else, the Local SSD data will be preserved when the instance is stopped at the end of the run duration/termination time.",
                    type: "boolean",
                  },
                },
                type: "object",
              },
              ReservationAffinity: {
                description:
                  "Specifies the reservations that this instance can consume from.",
                properties: {
                  consumeReservationType: {
                    description:
                      "Specifies the type of reservation from which this instance can consume resources: ANY_RESERVATION (default), SPECIFIC_RESERVATION, or NO_RESERVATION. See Consuming reserved instances </compute/docs/instances/reserving-zonal-resources#consuming_reserved_instances> for examples.",
                    enum: [
                      "ANY_RESERVATION",
                      "NO_RESERVATION",
                      "SPECIFIC_RESERVATION",
                      "UNSPECIFIED",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": ["", "", "", ""],
                  },
                  key: {
                    description:
                      "Corresponds to the label key of a reservation resource. To target a SPECIFIC_RESERVATION by name, specify googleapis.com/reservation-name as the key and specify the name of your reservation as its value.",
                    type: "string",
                  },
                  values: {
                    description:
                      'Corresponds to the label values of a reservation resource. This can be either a name to a reservation in the same project or "projects/different-project/reservations/some-reservation-name" to target a shared reservation in the same zone but in a different project.',
                    items: { type: "string" },
                    type: "array",
                  },
                },
                type: "object",
              },
              Scheduling: {
                description: "Sets the scheduling options for an Instance.",
                properties: {
                  automaticRestart: {
                    description:
                      "Specifies whether the instance should be automatically restarted if it is terminated by Compute Engine (not terminated by a user). You can only set the automatic restart option for standard instances. Preemptible instances </compute/docs/instances/preemptible> cannot be automatically restarted. By default, this is set to true so an instance is automatically restarted if it is terminated by Compute Engine.",
                    type: "boolean",
                  },
                  availabilityDomain: {
                    description:
                      "Specifies the availability domain to place the instance in. The value must be a number between 1 and the number of availability domains specified in the spread placement policy attached to the instance.",
                    format: "int32",
                    type: "integer",
                  },
                  hostErrorTimeoutSeconds: {
                    description:
                      "Specify the time in seconds for host error detection, the value must be within the range of [90, 330] with the increment of 30, if unset, the default behavior of host error recovery will be used.",
                    format: "int32",
                    type: "integer",
                  },
                  instanceTerminationAction: {
                    description:
                      "Specifies the termination action for the instance.",
                    enum: [
                      "DELETE",
                      "INSTANCE_TERMINATION_ACTION_UNSPECIFIED",
                      "STOP",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Delete the VM.",
                      "Default value. This value is unused.",
                      "Stop the VM without storing in-memory content. default action.",
                    ],
                  },
                  localSsdRecoveryTimeout: {
                    $ref: "#/$defs/Duration",
                    description:
                      "Specifies the maximum amount of time a Local Ssd Vm should wait while recovery of the Local Ssd state is attempted. Its value should be in between 0 and 168 hours with hour granularity and the default value being 1 hour.",
                  },
                  locationHint: {
                    description:
                      "An opaque location hint used to place the instance close to other resources. This field is for use by internal tools that use the public API.",
                    type: "string",
                  },
                  maxRunDuration: {
                    $ref: "#/$defs/Duration",
                    description:
                      "Specifies the max run duration for the given instance. If specified, the instance termination action will be performed at the end of the run duration.",
                  },
                  minNodeCpus: {
                    description:
                      "The minimum number of virtual CPUs this instance will consume when running on a sole-tenant node.",
                    format: "int32",
                    type: "integer",
                  },
                  nodeAffinities: {
                    description:
                      "A set of node affinity and anti-affinity configurations. Refer to Configuring node affinity </compute/docs/nodes/create-nodes#affinity> for more information. Overrides reservationAffinity.",
                    items: { $ref: "#/$defs/NodeAffinity" },
                    type: "array",
                  },
                  onHostMaintenance: {
                    description:
                      "Defines the maintenance behavior for this instance. For standard instances, the default behavior is MIGRATE. For preemptible instances </compute/docs/instances/preemptible>, the default and only possible behavior is TERMINATE. For more information, see Set VM host maintenance policy </compute/docs/instances/host-maintenance-options>.",
                    enum: ["MIGRATE", "TERMINATE"],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "*[Default]* Allows Compute Engine to automatically migrate instances out of the way of maintenance events.",
                      "Tells Compute Engine to terminate and (optionally) restart the instance away from the maintenance activity. If you would like your instance to be restarted, set the automaticRestart flag to true. Your instance may be restarted more than once, and it may be restarted outside the window of maintenance events.",
                    ],
                  },
                  onInstanceStopAction: {
                    $ref: "#/$defs/OnInstanceStopAction",
                  },
                  preemptible: {
                    description:
                      "Defines whether the instance is preemptible. This can only be set during instance creation or while the instance is stopped </compute/docs/instances/stop-start-instance> and therefore, in a `TERMINATED` state. See Instance Life Cycle </compute/docs/instances/instance-life-cycle> for more information on the possible instance states.",
                    type: "boolean",
                  },
                  provisioningModel: {
                    description:
                      "Specifies the provisioning model of the instance.",
                    enum: [
                      "FLEX_START",
                      "RESERVATION_BOUND",
                      "SPOT",
                      "STANDARD",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Instance is provisioned using the Flex Start provisioning model and has a limited runtime.",
                      "Bound to the lifecycle of the reservation in which it is provisioned.",
                      "Heavily discounted, no guaranteed runtime.",
                      "Standard provisioning with user controlled runtime, no discounts.",
                    ],
                  },
                  skipGuestOsShutdown: {
                    description:
                      "Default is false and there will be 120 seconds between GCE ACPI G2 Soft Off <https://en.wikipedia.org/wiki/ACPI#Power_states> and ACPI G3 Mechanical Off <https://en.wikipedia.org/wiki/ACPI#Power_states> for Standard VMs and 30 seconds for Spot VMs.",
                    type: "boolean",
                  },
                  terminationTime: {
                    description:
                      "Specifies the timestamp, when the instance will be terminated, in RFC3339 <https://www.ietf.org/rfc/rfc3339.txt> text format. If specified, the instance termination action will be performed at the termination time.",
                    type: "string",
                  },
                },
                type: "object",
              },
              ServiceAccount: {
                description: "A service account.",
                properties: {
                  email: {
                    description: "Email address of the service account.",
                    type: "string",
                  },
                  scopes: {
                    description:
                      "The list of scopes to be made available for this service account.",
                    items: { type: "string" },
                    type: "array",
                  },
                },
                type: "object",
              },
              ShieldedInstanceConfig: {
                description: "A set of Shielded Instance options.",
                properties: {
                  enableIntegrityMonitoring: {
                    description:
                      "Defines whether the instance has integrity monitoring enabled. Enabled by default </compute/docs/instances/modifying-shielded-vm>.",
                    type: "boolean",
                  },
                  enableSecureBoot: {
                    description:
                      "Defines whether the instance has Secure Boot enabled. Disabled by default </compute/docs/instances/modifying-shielded-vm>.",
                    type: "boolean",
                  },
                  enableVtpm: {
                    description:
                      "Defines whether the instance has the vTPM enabled. Enabled by default </compute/docs/instances/modifying-shielded-vm>.",
                    type: "boolean",
                  },
                },
                type: "object",
              },
              Tags: {
                description: "A set of instance tags.",
                properties: {
                  fingerprint: {
                    description:
                      "Specifies a fingerprint for this request, which is essentially a hash of the tags' contents and used for optimistic locking. The fingerprint is initially generated by Compute Engine and changes after every request to modify or update tags. You must always provide an up-to-date fingerprint hash in order to update or change tags. To see the latest fingerprint, make get() request to the instance.",
                    format: "byte",
                    type: "string",
                  },
                  items: {
                    description:
                      "An array of tags. Each tag must be 1-63 characters long, and comply with RFC1035 <https://www.ietf.org/rfc/rfc1035.txt>.",
                    items: { type: "string" },
                    pattern: "[a-z](?:[-a-z0-9]{0,61}[a-z0-9])?",
                    type: "array",
                  },
                },
                type: "object",
              },
              WorkloadIdentityConfig: {
                properties: {
                  identity: { type: "string" },
                  identityCertificateEnabled: { type: "boolean" },
                },
                type: "object",
              },
            },
            properties: {
              advancedMachineFeatures: {
                $ref: "#/$defs/AdvancedMachineFeatures",
                description:
                  "Controls for advanced machine-related behavior features. Note that for MachineImage, this is not supported yet.",
              },
              canIpForward: {
                description:
                  "Enables instances created based on these properties to send packets with source IP addresses other than their own and receive packets with destination IP addresses other than their own. If these instances will be used as an IP gateway or it will be set as the next-hop in a Route resource, specify true. If unsure, leave this set to false. See the Enable IP forwarding </vpc/docs/using-routes#canipforward> documentation for more information.",
                type: "boolean",
              },
              confidentialInstanceConfig: {
                $ref: "#/$defs/ConfidentialInstanceConfig",
                description:
                  "Specifies the Confidential Instance options. Note that for MachineImage, this is not supported yet.",
              },
              description: {
                description:
                  "An optional text description for the instances that are created from these properties.",
                type: "string",
              },
              disks: {
                description:
                  "An array of disks that are associated with the instances that are created from these properties.",
                items: { $ref: "#/$defs/AttachedDisk" },
                type: "array",
              },
              guestAccelerators: {
                description:
                  "A list of guest accelerator cards' type and count to use for instances created from these properties.",
                items: { $ref: "#/$defs/AcceleratorConfig" },
                type: "array",
              },
              keyRevocationActionType: {
                description:
                  'KeyRevocationActionType of the instance. Supported options are "STOP" and "NONE". The default value is "NONE" if it is not specified.',
                enum: [
                  "KEY_REVOCATION_ACTION_TYPE_UNSPECIFIED",
                  "NONE",
                  "STOP",
                ],
                type: "string",
                "x-google-enum-descriptions": [
                  "Default value. This value is unused.",
                  "",
                  "",
                ],
              },
              labels: {
                additionalProperties: { type: "string" },
                description:
                  "Labels to apply to instances that are created from these properties.",
                type: "object",
              },
              machineType: {
                description:
                  "The machine type to use for instances that are created from these properties. This field only accepts a machine type name, for example `n2-standard-4`. If you use the machine type full or partial URL, for example `projects/my-l7ilb-project/zones/us-central1-a/machineTypes/n2-standard-4`, the request will result in an `INTERNAL_ERROR`.",
                type: "string",
              },
              metadata: {
                $ref: "#/$defs/Metadata",
                description:
                  "The metadata key/value pairs to assign to instances that are created from these properties. These pairs can consist of custom metadata or predefined keys. See Project and instance metadata </compute/docs/metadata#project_and_instance_metadata> for more information.",
              },
              minCpuPlatform: {
                description:
                  'Minimum cpu/platform to be used by instances. The instance may be scheduled on the specified or newer cpu/platform. Applicable values are the friendly names of CPU platforms, such as minCpuPlatform: "Intel Haswell" or minCpuPlatform: "Intel Sandy Bridge". For more information, read Specifying a Minimum CPU Platform </compute/docs/instances/specify-min-cpu-platform>.',
                type: "string",
              },
              networkInterfaces: {
                description:
                  "An array of network access configurations for this interface.",
                items: { $ref: "#/$defs/NetworkInterface" },
                type: "array",
              },
              networkPerformanceConfig: {
                $ref: "#/$defs/NetworkPerformanceConfig",
                description:
                  "Note that for MachineImage, this is not supported yet.",
              },
              privateIpv6GoogleAccess: {
                description:
                  "The private IPv6 google access type for VMs. If not specified, use INHERIT_FROM_SUBNETWORK as default. Note that for MachineImage, this is not supported yet.",
                enum: [
                  "ENABLE_BIDIRECTIONAL_ACCESS_TO_GOOGLE",
                  "ENABLE_OUTBOUND_VM_ACCESS_TO_GOOGLE",
                  "INHERIT_FROM_SUBNETWORK",
                ],
                type: "string",
                "x-google-enum-descriptions": [
                  "Bidirectional private IPv6 access to/from Google services. If specified, the subnetwork who is attached to the instance's default network interface will be assigned an internal IPv6 prefix if it doesn't have before.",
                  "Outbound private IPv6 access from VMs in this subnet to Google services. If specified, the subnetwork who is attached to the instance's default network interface will be assigned an internal IPv6 prefix if it doesn't have before.",
                  "Each network interface inherits PrivateIpv6GoogleAccess from its subnetwork.",
                ],
              },
              reservationAffinity: {
                $ref: "#/$defs/ReservationAffinity",
                description:
                  "Specifies the reservations that instances can consume from. Note that for MachineImage, this is not supported yet.",
              },
              resourceManagerTags: {
                additionalProperties: { type: "string" },
                description:
                  "Input only. Resource manager tags to be bound to the instance. Tag keys and values have the same definition as resource manager tags <https://cloud.google.com/resource-manager/docs/tags/tags-overview>. Keys must be in the format `tagKeys/{tag_key_id}`, and values are in the format `tagValues/456`. The field is ignored (both PUT & PATCH) when empty.",
                type: "object",
                writeOnly: true,
              },
              resourcePolicies: {
                description:
                  "Resource policies (names, not URLs) applied to instances created from these properties. Note that for MachineImage, this is not supported yet.",
                items: { type: "string" },
                type: "array",
              },
              scheduling: {
                $ref: "#/$defs/Scheduling",
                description:
                  "Specifies the scheduling options for the instances that are created from these properties.",
              },
              serviceAccounts: {
                description:
                  "A list of service accounts with specified scopes. Access tokens for these service accounts are available to the instances that are created from these properties. Use metadata queries to obtain the access tokens for these instances.",
                items: { $ref: "#/$defs/ServiceAccount" },
                type: "array",
              },
              shieldedInstanceConfig: {
                $ref: "#/$defs/ShieldedInstanceConfig",
                description:
                  "Note that for MachineImage, this is not supported yet.",
              },
              tags: {
                $ref: "#/$defs/Tags",
                description:
                  "A list of tags to apply to the instances that are created from these properties. The tags identify valid sources or targets for network firewalls. The setTags method can modify this list of tags. Each tag within the list must comply with RFC1035 <https://www.ietf.org/rfc/rfc1035.txt>.",
              },
              workloadIdentityConfig: {
                $ref: "#/$defs/WorkloadIdentityConfig",
              },
            },
            type: "object",
          },
        },
        {
          annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true,
            title: "Get Disk Basic Info",
          },
          description:
            "Get basic information about a Compute Engine disk, including its name, ID, description, creation timestamp, size, type, status, last attach timestamp, and last detach timestamp. Requires project, zone, and disk name as input.\n",
          inputSchema: {
            description: "Request message for getting disk basic info.",
            properties: {
              name: {
                description: "Required. Identifier. The disk name.",
                type: "string",
                "x-google-identifier": true,
              },
              project: {
                description: "Required. Project ID for this request.",
                type: "string",
              },
              zone: {
                description: "Required. The zone of the disk.",
                type: "string",
              },
            },
            required: ["project", "zone", "name"],
            type: "object",
          },
          name: "get_disk_basic_info",
          outputSchema: {
            description: "Basic information about a disk.",
            properties: {
              createTime: {
                description: "Creation timestamp of the disk.",
                format: "date-time",
                type: "string",
              },
              description: {
                description: "Description of the disk.",
                type: "string",
              },
              id: {
                description: "The unique identifier for the disk.",
                format: "uint64",
                type: "string",
              },
              lastAttachTimestamp: {
                description: "Last attach timestamp of the disk.",
                format: "date-time",
                type: "string",
              },
              lastDetachTimestamp: {
                description: "Last detach timestamp of the disk.",
                format: "date-time",
                type: "string",
              },
              name: { description: "Name of the disk.", type: "string" },
              sizeGb: {
                description: "Size of the disk in GB.",
                format: "int64",
                type: "string",
              },
              status: {
                description: "The status of the disk.",
                enum: [
                  "CREATING",
                  "DELETING",
                  "FAILED",
                  "READY",
                  "RESTORING",
                  "UNAVAILABLE",
                ],
                type: "string",
                "x-google-enum-descriptions": [
                  "Disk is provisioning",
                  "Disk is deleting.",
                  "Disk creation failed.",
                  "Disk is ready for use.",
                  "Source data is being copied into the disk.",
                  "Disk is currently unavailable and cannot be accessed, attached or detached.",
                ],
              },
              type: {
                description: "URL of the disk type resource.",
                type: "string",
              },
            },
            type: "object",
          },
        },
        {
          annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true,
            title: "Get Disk Performance Config",
          },
          description:
            "Get performance configuration of a Compute Engine disk, including its type, size, provisioned IOPS, provisioned throughput, physical block size, storage pool and access mode. Requires project, zone, and disk name as input.\n",
          inputSchema: {
            description:
              "Request message for getting disk performance configuration.",
            properties: {
              name: {
                description: "Required. Identifier. The disk name.",
                type: "string",
                "x-google-identifier": true,
              },
              project: {
                description: "Required. Project ID for this request.",
                type: "string",
              },
              zone: {
                description: "Required. The zone of the disk.",
                type: "string",
              },
            },
            required: ["project", "zone", "name"],
            type: "object",
          },
          name: "get_disk_performance_config",
          outputSchema: {
            description: "Performance configuration of a disk.",
            properties: {
              accessMode: {
                description: "The access mode of the disk.",
                enum: [
                  "READ_ONLY_MANY",
                  "READ_WRITE_MANY",
                  "READ_WRITE_SINGLE",
                ],
                type: "string",
                "x-google-enum-descriptions": [
                  "The AccessMode means the disk can be attached to multiple instances in RO mode.",
                  "The AccessMode means the disk can be attached to multiple instances in RW mode.",
                  "The default AccessMode, means the disk can be attached to single instance in RW mode.",
                ],
              },
              physicalBlockSizeBytes: {
                description:
                  "Physical block size of the persistent disk, in bytes.",
                format: "int64",
                type: "string",
              },
              provisionedIops: {
                description:
                  "Indicates how many IOPS to provision for the disk. This sets the number of I/O operations per second that the disk can handle.",
                format: "int64",
                type: "string",
              },
              provisionedThroughput: {
                description:
                  "Indicates how much throughput to provision for the disk. This sets the number of throughput mb per second that the disk can handle.",
                format: "int64",
                type: "string",
              },
              sizeGb: {
                description: "Size of the disk in GB.",
                format: "int64",
                type: "string",
              },
              storagePool: {
                description: "The storage pool of the disk.",
                type: "string",
              },
              type: {
                description: "URL of the disk type resource.",
                type: "string",
              },
            },
            type: "object",
          },
        },
        {
          annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true,
            title: "List Disks Basic Info",
          },
          description:
            "Lists Compute Engine disks. Details for each disk include name, ID, description, creation timestamp, size, type, status, last attach timestamp, and last detach timestamp. Requires project and zone as input.\n",
          inputSchema: {
            description: "Request message for listing disk basic info.",
            properties: {
              pageSize: {
                description:
                  "Optional. The maximum number of results per page that should be returned.",
                format: "int32",
                type: "integer",
              },
              pageToken: {
                description:
                  "Optional. The page token received from the previous call.",
                type: "string",
              },
              project: {
                description: "Required. Project ID for this request.",
                type: "string",
              },
              zone: {
                description: "Required. The zone of the disks to list.",
                type: "string",
              },
            },
            required: ["project", "zone"],
            type: "object",
          },
          name: "list_disks",
          outputSchema: {
            $defs: {
              DiskBasicInfo: {
                description: "Basic information about a disk.",
                properties: {
                  createTime: {
                    description: "Creation timestamp of the disk.",
                    format: "date-time",
                    type: "string",
                  },
                  description: {
                    description: "Description of the disk.",
                    type: "string",
                  },
                  id: {
                    description: "The unique identifier for the disk.",
                    format: "uint64",
                    type: "string",
                  },
                  lastAttachTimestamp: {
                    description: "Last attach timestamp of the disk.",
                    format: "date-time",
                    type: "string",
                  },
                  lastDetachTimestamp: {
                    description: "Last detach timestamp of the disk.",
                    format: "date-time",
                    type: "string",
                  },
                  name: { description: "Name of the disk.", type: "string" },
                  sizeGb: {
                    description: "Size of the disk in GB.",
                    format: "int64",
                    type: "string",
                  },
                  status: {
                    description: "The status of the disk.",
                    enum: [
                      "CREATING",
                      "DELETING",
                      "FAILED",
                      "READY",
                      "RESTORING",
                      "UNAVAILABLE",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Disk is provisioning",
                      "Disk is deleting.",
                      "Disk creation failed.",
                      "Disk is ready for use.",
                      "Source data is being copied into the disk.",
                      "Disk is currently unavailable and cannot be accessed, attached or detached.",
                    ],
                  },
                  type: {
                    description: "URL of the disk type resource.",
                    type: "string",
                  },
                },
                type: "object",
              },
            },
            description: "Response message for listing disk basic info.",
            properties: {
              disks: {
                description: "The list of disk basic info.",
                items: { $ref: "#/$defs/DiskBasicInfo" },
                type: "array",
              },
              nextPageToken: {
                description:
                  "The page token to retrieve the next page of results.",
                type: "string",
              },
            },
            type: "object",
          },
        },
        {
          annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true,
            title: "List Accelerator Types",
          },
          description:
            "Lists the available Google Compute Engine accelerator types. Requires project and zone as input. Returns accelerator types, including id, creation timestamp, name, description, deprecated, zone, and maximum cards per instance.\n",
          inputSchema: {
            description: "Request message for listing accelerator types.",
            properties: {
              project: {
                description: "Required. Project ID for this request.",
                type: "string",
              },
              zone: {
                description: "Required. The zone of the accelerator types.",
                type: "string",
              },
            },
            required: ["project", "zone"],
            type: "object",
          },
          name: "list_accelerator_types",
          outputSchema: {
            $defs: {
              AcceleratorType: {
                description:
                  "Represents an Accelerator Type resource. Google Cloud Platform provides graphics processing units (accelerators) that you can add to VM instances to improve or accelerate performance when working with intensive workloads. For more information, read GPUs on Compute Engine </compute/docs/gpus/>.",
                properties: {
                  creationTimestamp: {
                    description:
                      "[Output Only] Creation timestamp in RFC3339 <https://www.ietf.org/rfc/rfc3339.txt> text format.",
                    type: "string",
                  },
                  deprecated: {
                    $ref: "#/$defs/DeprecationStatus",
                    description:
                      "[Output Only] The deprecation status associated with this accelerator type.",
                  },
                  description: {
                    description:
                      "[Output Only] An optional textual description of the resource.",
                    type: "string",
                  },
                  id: {
                    description:
                      "[Output Only] The unique identifier for the resource. This identifier is defined by the server.",
                    format: "uint64",
                    type: "string",
                  },
                  kind: {
                    default: "compute#acceleratorType",
                    description:
                      "Output only. [Output Only] The type of the resource. Always compute#acceleratorType for accelerator types.",
                    readOnly: true,
                    type: "string",
                  },
                  maximumCardsPerInstance: {
                    description:
                      "[Output Only] Maximum number of accelerator cards allowed per instance.",
                    format: "int32",
                    type: "integer",
                  },
                  name: {
                    description: "[Output Only] Name of the resource.",
                    pattern: "[a-z](?:[-a-z0-9]{0,61}[a-z0-9])?",
                    type: "string",
                  },
                  selfLink: {
                    description:
                      "Output only. [Output Only] Server-defined, fully qualified URL for this resource.",
                    readOnly: true,
                    type: "string",
                  },
                  zone: {
                    description:
                      "[Output Only] The name of the zone where the accelerator type resides, such as us-central1-a. You must specify this field as part of the HTTP request URL. It is not settable as a field in the request body.",
                    type: "string",
                  },
                },
                type: "object",
              },
              DeprecationStatus: {
                description: "Deprecation status for a public resource.",
                properties: {
                  deleted: {
                    description:
                      "An optional RFC3339 <https://www.ietf.org/rfc/rfc3339.txt> timestamp on or after which the state of this resource is intended to change to DELETED. This is only informational and the status will not change unless the client explicitly changes it.",
                    type: "string",
                  },
                  deprecated: {
                    description:
                      "An optional RFC3339 <https://www.ietf.org/rfc/rfc3339.txt> timestamp on or after which the state of this resource is intended to change to DEPRECATED. This is only informational and the status will not change unless the client explicitly changes it.",
                    type: "string",
                  },
                  obsolete: {
                    description:
                      "An optional RFC3339 <https://www.ietf.org/rfc/rfc3339.txt> timestamp on or after which the state of this resource is intended to change to OBSOLETE. This is only informational and the status will not change unless the client explicitly changes it.",
                    type: "string",
                  },
                  replacement: {
                    description:
                      "The URL of the suggested replacement for a deprecated resource. The suggested replacement resource must be the same kind of resource as the deprecated resource.",
                    type: "string",
                  },
                  state: {
                    description:
                      "The deprecation state of this resource. This can be ACTIVE, DEPRECATED, OBSOLETE, or DELETED. Operations which communicate the end of life date for an image, can use ACTIVE. Operations which create a new resource using a DEPRECATED resource will return successfully, but with a warning indicating the deprecated resource and recommending its replacement. Operations which use OBSOLETE or DELETED resources will be rejected and result in an error.",
                    enum: ["ACTIVE", "DELETED", "DEPRECATED", "OBSOLETE"],
                    type: "string",
                    "x-google-enum-descriptions": ["", "", "", ""],
                  },
                },
                type: "object",
              },
            },
            description: "Response message for listing accelerator types.",
            properties: {
              acceleratorTypes: {
                description: "The list of accelerator types.",
                items: { $ref: "#/$defs/AcceleratorType" },
                type: "array",
              },
            },
            type: "object",
          },
        },
        {
          annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true,
            title: "List Machine Types",
          },
          description:
            "Lists the available Google Compute Engine machine types. Requires project and zone as input. Returns machine types, including id, creationTimestamp, name, description, guest cpus, memory, image space, maximum persistent disks, maximum persisten disks size, deprecated, zone, is shared cpu, accelerators, and architecture.\n",
          inputSchema: {
            description: "Request message for listing machine types.",
            properties: {
              project: {
                description: "Required. Project ID for this request.",
                type: "string",
              },
              zone: {
                description: "Required. The zone of the machine types.",
                type: "string",
              },
            },
            required: ["project", "zone"],
            type: "object",
          },
          name: "list_machine_types",
          outputSchema: {
            $defs: {
              BundledLocalSsds: {
                properties: {
                  defaultInterface: {
                    description:
                      "The default disk interface if the interface is not specified.",
                    type: "string",
                  },
                  partitionCount: {
                    description: "The number of partitions.",
                    format: "int32",
                    type: "integer",
                  },
                },
                type: "object",
              },
              DeprecationStatus: {
                description: "Deprecation status for a public resource.",
                properties: {
                  deleted: {
                    description:
                      "An optional RFC3339 <https://www.ietf.org/rfc/rfc3339.txt> timestamp on or after which the state of this resource is intended to change to DELETED. This is only informational and the status will not change unless the client explicitly changes it.",
                    type: "string",
                  },
                  deprecated: {
                    description:
                      "An optional RFC3339 <https://www.ietf.org/rfc/rfc3339.txt> timestamp on or after which the state of this resource is intended to change to DEPRECATED. This is only informational and the status will not change unless the client explicitly changes it.",
                    type: "string",
                  },
                  obsolete: {
                    description:
                      "An optional RFC3339 <https://www.ietf.org/rfc/rfc3339.txt> timestamp on or after which the state of this resource is intended to change to OBSOLETE. This is only informational and the status will not change unless the client explicitly changes it.",
                    type: "string",
                  },
                  replacement: {
                    description:
                      "The URL of the suggested replacement for a deprecated resource. The suggested replacement resource must be the same kind of resource as the deprecated resource.",
                    type: "string",
                  },
                  state: {
                    description:
                      "The deprecation state of this resource. This can be ACTIVE, DEPRECATED, OBSOLETE, or DELETED. Operations which communicate the end of life date for an image, can use ACTIVE. Operations which create a new resource using a DEPRECATED resource will return successfully, but with a warning indicating the deprecated resource and recommending its replacement. Operations which use OBSOLETE or DELETED resources will be rejected and result in an error.",
                    enum: ["ACTIVE", "DELETED", "DEPRECATED", "OBSOLETE"],
                    type: "string",
                    "x-google-enum-descriptions": ["", "", "", ""],
                  },
                },
                type: "object",
              },
              MachineType: {
                description:
                  "Represents a Machine Type resource. You can use specific machine types for your VM instances based on performance and pricing requirements. For more information, read Machine Types </compute/docs/machine-types>.",
                properties: {
                  accelerators: {
                    description:
                      "[Output Only] A list of accelerator configurations assigned to this machine type.",
                    items: {
                      properties: {
                        guestAcceleratorCount: {
                          description:
                            "Number of accelerator cards exposed to the guest.",
                          format: "int32",
                          type: "integer",
                        },
                        guestAcceleratorType: {
                          description:
                            "The accelerator type resource name, not a full URL, e.g. nvidia-tesla-t4.",
                          type: "string",
                        },
                      },
                      type: "object",
                    },
                    type: "array",
                  },
                  architecture: {
                    description:
                      "[Output Only] The architecture of the machine type.",
                    enum: ["ARCHITECTURE_UNSPECIFIED", "ARM64", "X86_64"],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Default value indicating Architecture is not set.",
                      "Machines with architecture ARM64",
                      "Machines with architecture X86_64",
                    ],
                  },
                  bundledLocalSsds: {
                    $ref: "#/$defs/BundledLocalSsds",
                    description:
                      "[Output Only] The configuration of bundled local SSD for the machine type.",
                  },
                  creationTimestamp: {
                    description:
                      "[Output Only] Creation timestamp in RFC3339 <https://www.ietf.org/rfc/rfc3339.txt> text format.",
                    type: "string",
                  },
                  deprecated: {
                    $ref: "#/$defs/DeprecationStatus",
                    description:
                      "[Output Only] The deprecation status associated with this machine type. Only applicable if the machine type is unavailable.",
                  },
                  description: {
                    description:
                      "[Output Only] An optional textual description of the resource.",
                    type: "string",
                  },
                  guestCpus: {
                    description:
                      "[Output Only] The number of virtual CPUs that are available to the instance.",
                    format: "int32",
                    type: "integer",
                  },
                  id: {
                    description:
                      "[Output Only] The unique identifier for the resource. This identifier is defined by the server.",
                    format: "uint64",
                    type: "string",
                  },
                  imageSpaceGb: {
                    description:
                      "[Deprecated] This property is deprecated and will never be populated with any relevant values.",
                    format: "int32",
                    type: "integer",
                  },
                  isSharedCpu: {
                    description:
                      "[Output Only] Whether this machine type has a shared CPU. See Shared-core machine types </compute/docs/machine-types#sharedcore> for more information.",
                    type: "boolean",
                  },
                  kind: {
                    default: "compute#machineType",
                    description:
                      "Output only. [Output Only] The type of the resource. Always compute#machineType for machine types.",
                    readOnly: true,
                    type: "string",
                  },
                  maximumPersistentDisks: {
                    description:
                      "[Output Only] Maximum persistent disks allowed.",
                    format: "int32",
                    type: "integer",
                  },
                  maximumPersistentDisksSizeGb: {
                    description:
                      "[Output Only] Maximum total persistent disks size (GB) allowed.",
                    format: "int64",
                    type: "string",
                  },
                  memoryMb: {
                    description:
                      "[Output Only] The amount of physical memory available to the instance, defined in MB.",
                    format: "int32",
                    type: "integer",
                  },
                  name: {
                    description: "[Output Only] Name of the resource.",
                    pattern: "[a-z](?:[-a-z0-9]{0,61}[a-z0-9])?",
                    type: "string",
                  },
                  selfLink: {
                    description:
                      "[Output Only] Server-defined URL for the resource.",
                    type: "string",
                  },
                  zone: {
                    description:
                      "[Output Only] The name of the zone where the machine type resides, such as us-central1-a.",
                    type: "string",
                  },
                },
                type: "object",
              },
            },
            description: "Response message for listing machine types.",
            properties: {
              machineTypes: {
                description: "The list of machine types.",
                items: { $ref: "#/$defs/MachineType" },
                type: "array",
              },
            },
            type: "object",
          },
        },
        {
          annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true,
            title: "List Images Basic Info",
          },
          description:
            "Lists Compute Engine Images. Details for each image include name, ID, status, family, and creation timestamp. Requires project as input.\n",
          inputSchema: {
            description: "Request message for listing images basic info.",
            properties: {
              pageSize: {
                description:
                  "Optional. The maximum number of images to return.",
                format: "int32",
                type: "integer",
              },
              pageToken: {
                description:
                  "Optional. A page token received from a previous call to list images.",
                type: "string",
              },
              project: {
                description: "Required. Project ID for this request.",
                type: "string",
              },
            },
            required: ["project"],
            type: "object",
          },
          name: "list_images",
          outputSchema: {
            $defs: {
              ImageBasicInfo: {
                description: "Basic information about an image.",
                properties: {
                  createTime: {
                    description: "Creation timestamp of the image.",
                    format: "date-time",
                    type: "string",
                  },
                  family: {
                    description: "The family of the image.",
                    type: "string",
                  },
                  id: {
                    description: "The unique identifier for the image.",
                    format: "uint64",
                    type: "string",
                  },
                  name: { description: "Name of the image.", type: "string" },
                  status: {
                    description: "The status of the image.",
                    enum: ["DELETING", "FAILED", "PENDING", "READY"],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Image is deleting.",
                      "Image creation failed due to an error.",
                      "Image hasn't been created as yet.",
                      "Image has been successfully created.",
                    ],
                  },
                },
                type: "object",
              },
            },
            description: "Response message for listing images basic info.",
            properties: {
              images: {
                description: "The list of images.",
                items: { $ref: "#/$defs/ImageBasicInfo" },
                type: "array",
              },
              nextPageToken: {
                description:
                  "A token that can be sent as `page_token` to retrieve the next page. If this field is omitted, there are no subsequent pages.",
                type: "string",
              },
            },
            type: "object",
          },
        },
        {
          annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true,
            title: "Get Zone Operation",
          },
          description:
            "Get details of a zone operation, including its id, name, status, creation timestamp, error, warning, HTTP error message and HTTP error status code. Requires project, zone, and operation name as input.\n",
          inputSchema: {
            description: "Request message for getting zone operation.",
            properties: {
              name: {
                description: "Required. Identifier. The operation name.",
                type: "string",
                "x-google-identifier": true,
              },
              project: {
                description: "Required. Project ID for this request.",
                type: "string",
              },
              zone: {
                description: "Required. The zone of the operation.",
                type: "string",
              },
            },
            required: ["project", "zone", "name"],
            type: "object",
          },
          name: "get_zone_operation",
          outputSchema: {
            $defs: {
              ErrorInfo: {
                description:
                  'Describes the cause of the error with structured details. Example of an error when contacting the "pubsub.googleapis.com" API when it is not enabled: { "reason": "API_DISABLED" "domain": "googleapis.com" "metadata": { "resource": "projects/123", "service": "pubsub.googleapis.com" } } This response indicates that the pubsub.googleapis.com API is not enabled. Example of an error that is returned when attempting to create a Spanner instance in a region that is out of stock: { "reason": "STOCKOUT" "domain": "spanner.googleapis.com", "metadata": { "availableRegions": "us-central1,us-east2" } }',
                properties: {
                  domain: {
                    description:
                      'The logical grouping to which the "reason" belongs. The error domain is typically the registered service name of the tool or product that generates the error. Example: "pubsub.googleapis.com". If the error is generated by some common infrastructure, the error domain must be a globally unique value that identifies the infrastructure. For Google API infrastructure, the error domain is "googleapis.com".',
                    type: "string",
                  },
                  metadatas: {
                    additionalProperties: { type: "string" },
                    description:
                      'Additional structured details about this error. Keys must match a regular expression of `a-z+` but should ideally be lowerCamelCase. Also, they must be limited to 64 characters in length. When identifying the current value of an exceeded limit, the units should be contained in the key, not the value. For example, rather than `{"instanceLimit": "100/request"}`, should be returned as, `{"instanceLimitPerRequest": "100"}`, if the client exceeds the number of instances that can be created in a single (batch) request.',
                    type: "object",
                  },
                  reason: {
                    description:
                      "The reason of the error. This is a constant value that identifies the proximate cause of the error. Error reasons are unique within a particular domain of errors. This should be at most 63 characters and match a regular expression of `A-Z+[A-Z0-9]`, which represents UPPER_SNAKE_CASE.",
                    type: "string",
                  },
                },
                type: "object",
              },
              Help: {
                description:
                  "Provides links to documentation or for performing an out of band action. For example, if a quota check failed with an error indicating the calling project hasn't enabled the accessed service, this can contain a URL pointing directly to the right place in the developer console to flip the bit.",
                properties: {
                  links: {
                    description:
                      "URL(s) pointing to additional information on handling the current error.",
                    items: { $ref: "#/$defs/Link" },
                    type: "array",
                  },
                },
                type: "object",
              },
              Link: {
                description: "Describes a URL link.",
                properties: {
                  description: {
                    description: "Describes what the link offers.",
                    type: "string",
                  },
                  url: { description: "The URL of the link.", type: "string" },
                },
                type: "object",
              },
              LocalizedMessage: {
                description:
                  "Provides a localized error message that is safe to return to the user which can be attached to an RPC error.",
                properties: {
                  locale: {
                    description:
                      'The locale used following the specification defined at https://www.rfc-editor.org/rfc/bcp/bcp47.txt. Examples are: "en-US", "fr-CH", "es-MX"',
                    type: "string",
                  },
                  message: {
                    description:
                      "The localized error message in the above locale.",
                    type: "string",
                  },
                },
                type: "object",
              },
              QuotaExceededInfo: {
                description:
                  "Additional details for quota exceeded error for resource quota.",
                properties: {
                  dimensions: {
                    additionalProperties: { type: "string" },
                    description: "The map holding related quota dimensions.",
                    type: "object",
                  },
                  futureLimit: {
                    description:
                      "Future quota limit being rolled out. The limit's unit depends on the quota type or metric.",
                    format: "double",
                    type: "number",
                  },
                  limit: {
                    description:
                      "Current effective quota limit. The limit's unit depends on the quota type or metric.",
                    format: "double",
                    type: "number",
                  },
                  limitName: {
                    description: "The name of the quota limit.",
                    type: "string",
                  },
                  metricName: {
                    description: "The Compute Engine quota metric name.",
                    type: "string",
                  },
                  rolloutStatus: {
                    description: "Rollout status of the future quota limit.",
                    enum: ["IN_PROGRESS", "ROLLOUT_STATUS_UNSPECIFIED"],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "IN_PROGRESS - A rollout is in process which will change the limit value to future limit.",
                      "ROLLOUT_STATUS_UNSPECIFIED - Rollout status is not specified. The default value.",
                    ],
                  },
                },
                type: "object",
              },
            },
            description: "Represents an operation.",
            properties: {
              createTime: {
                description: "Creation timestamp of the operation.",
                format: "date-time",
                type: "string",
              },
              error: {
                description:
                  "Errors encountered during the operation execution.",
                properties: {
                  errors: {
                    description:
                      "[Output Only] The array of errors encountered while processing this operation.",
                    items: {
                      properties: {
                        code: {
                          description:
                            "[Output Only] The error type identifier for this error.",
                          type: "string",
                        },
                        errorDetails: {
                          description:
                            "[Output Only] An optional list of messages that contain the error details. There is a set of defined message types to use for providing details.The syntax depends on the error code. For example, QuotaExceededInfo will have details when the error code is QUOTA_EXCEEDED.",
                          items: {
                            properties: {
                              errorInfo: { $ref: "#/$defs/ErrorInfo" },
                              help: { $ref: "#/$defs/Help" },
                              localizedMessage: {
                                $ref: "#/$defs/LocalizedMessage",
                              },
                              quotaInfo: { $ref: "#/$defs/QuotaExceededInfo" },
                            },
                            type: "object",
                          },
                          type: "array",
                        },
                        location: {
                          description:
                            "[Output Only] Indicates the field in the request that caused the error. This property is optional.",
                          type: "string",
                        },
                        message: {
                          description:
                            "[Output Only] An optional, human-readable error message.",
                          type: "string",
                        },
                      },
                      type: "object",
                    },
                    type: "array",
                  },
                },
                type: "object",
              },
              httpErrorMessage: {
                description:
                  "If the operation fails, this field contains the HTTP error message that corresponds to the HTTP error code generated for the audit log.",
                type: "string",
              },
              httpErrorStatusCode: {
                description:
                  "If the operation fails, this field contains the HTTP error status code that corresponds to the HTTP error message generated for the audit log.",
                format: "int32",
                type: "integer",
              },
              id: {
                description: "The unique identifier for the operation.",
                format: "uint64",
                type: "string",
              },
              name: { description: "Name of the operation.", type: "string" },
              status: {
                description: "The status of the operation.",
                enum: ["DONE", "PENDING", "RUNNING"],
                type: "string",
                "x-google-enum-descriptions": ["", "", ""],
              },
              warnings: {
                description:
                  "Warnings encountered during the operation execution.",
                items: {
                  properties: {
                    code: {
                      description:
                        "[Output Only] A warning code, if applicable. For example, Compute Engine returns NO_RESULTS_ON_PAGE if there are no results in the response.",
                      enum: [
                        "CLEANUP_FAILED",
                        "DEPRECATED_RESOURCE_USED",
                        "DEPRECATED_TYPE_USED",
                        "DISK_SIZE_LARGER_THAN_IMAGE_SIZE",
                        "EXPERIMENTAL_TYPE_USED",
                        "EXTERNAL_API_WARNING",
                        "FIELD_VALUE_OVERRIDEN",
                        "INJECTED_KERNELS_DEPRECATED",
                        "INVALID_HEALTH_CHECK_FOR_DYNAMIC_WIEGHTED_LB",
                        "LARGE_DEPLOYMENT_WARNING",
                        "LIST_OVERHEAD_QUOTA_EXCEED",
                        "MISSING_TYPE_DEPENDENCY",
                        "NEXT_HOP_ADDRESS_NOT_ASSIGNED",
                        "NEXT_HOP_CANNOT_IP_FORWARD",
                        "NEXT_HOP_INSTANCE_HAS_NO_IPV6_INTERFACE",
                        "NEXT_HOP_INSTANCE_NOT_FOUND",
                        "NEXT_HOP_INSTANCE_NOT_ON_NETWORK",
                        "NEXT_HOP_NOT_RUNNING",
                        "NOT_CRITICAL_ERROR",
                        "NO_RESULTS_ON_PAGE",
                        "PARTIAL_SUCCESS",
                        "QUOTA_INFO_UNAVAILABLE",
                        "REQUIRED_TOS_AGREEMENT",
                        "RESOURCE_IN_USE_BY_OTHER_RESOURCE_WARNING",
                        "RESOURCE_NOT_DELETED",
                        "SCHEMA_VALIDATION_IGNORED",
                        "SINGLE_INSTANCE_PROPERTY_TEMPLATE",
                        "UNDECLARED_PROPERTIES",
                        "UNREACHABLE",
                      ],
                      type: "string",
                      "x-google-enum-deprecated": [
                        false,
                        false,
                        false,
                        false,
                        false,
                        false,
                        true,
                        false,
                        false,
                        false,
                        false,
                        false,
                        false,
                        false,
                        false,
                        false,
                        false,
                        false,
                        false,
                        false,
                        false,
                        false,
                        false,
                        false,
                        false,
                        false,
                        false,
                        false,
                        false,
                      ],
                      "x-google-enum-descriptions": [
                        "Warning about failed cleanup of transient changes made by a failed operation.",
                        "A link to a deprecated resource was created.",
                        "When deploying and at least one of the resources has a type marked as deprecated",
                        "The user created a boot disk that is larger than image size.",
                        "When deploying and at least one of the resources has a type marked as experimental",
                        "Warning that is present in an external api call",
                        "Warning that value of a field has been overridden. Deprecated unused field.",
                        "The operation involved use of an injected kernel, which is deprecated.",
                        "A WEIGHTED_MAGLEV backend service is associated with a health check that is not of type HTTP/HTTPS/HTTP2.",
                        "When deploying a deployment with a exceedingly large number of resources",
                        "Resource can't be retrieved due to list overhead quota exceed which captures the amount of resources filtered out by user-defined list filter.",
                        "A resource depends on a missing type",
                        "The route's nextHopIp address is not assigned to an instance on the network.",
                        "The route's next hop instance cannot ip forward.",
                        "The route's nextHopInstance URL refers to an instance that does not have an ipv6 interface on the same network as the route.",
                        "The route's nextHopInstance URL refers to an instance that does not exist.",
                        "The route's nextHopInstance URL refers to an instance that is not on the same network as the route.",
                        "The route's next hop instance does not have a status of RUNNING.",
                        "Error which is not critical. We decided to continue the process despite the mentioned error.",
                        "No results are present on a particular list page.",
                        "Success is reported, but some results may be missing due to errors",
                        "Quota information is not available to client requests (e.g: regions.list).",
                        "The user attempted to use a resource that requires a TOS they have not accepted.",
                        "Warning that a resource is in use.",
                        "One or more of the resources set to auto-delete could not be deleted because they were in use.",
                        "When a resource schema validation is ignored.",
                        "Instance template used in instance group manager is valid as such, but its application does not make a lot of sense, because it allows only single instance in instance group.",
                        "When undeclared properties in the schema are present",
                        "A given scope cannot be reached.",
                      ],
                    },
                    data: {
                      description:
                        '[Output Only] Metadata about this warning in key: value format. For example: "data": [ { "key": "scope", "value": "zones/us-east1-d" } ',
                      items: {
                        properties: {
                          key: {
                            description:
                              "[Output Only] A key that provides more detail on the warning being returned. For example, for warnings where there are no results in a list request for a particular zone, this key might be scope and the key value might be the zone name. Other examples might be a key indicating a deprecated resource and a suggested replacement, or a warning about invalid network settings (for example, if an instance attempts to perform IP forwarding but is not enabled for IP forwarding).",
                            type: "string",
                          },
                          value: {
                            description:
                              "[Output Only] A warning data value corresponding to the key.",
                            type: "string",
                          },
                        },
                        type: "object",
                      },
                      type: "array",
                    },
                    message: {
                      description:
                        "[Output Only] A human-readable description of the warning code.",
                      type: "string",
                    },
                  },
                  type: "object",
                },
                type: "array",
              },
            },
            type: "object",
          },
        },
        {
          annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true,
            title: "Get Reservation Basic Info",
          },
          description:
            "Get Compute Engine reservation basic info including name, ID, creation timestamp, zone, status, specific reservation required, commitment, and linked commitments. Requires project, zone, and reservation name as input.\n",
          inputSchema: {
            description: "Request message for getting reservation basic info.",
            properties: {
              name: {
                description:
                  "Required. Identifier. Name of the reservation to retrieve.",
                type: "string",
                "x-google-identifier": true,
              },
              project: {
                description: "Required. Project ID for this request.",
                type: "string",
              },
              zone: {
                description: "Required. The zone of the reservation.",
                type: "string",
              },
            },
            required: ["project", "zone", "name"],
            type: "object",
          },
          name: "get_reservation_basic_info",
          outputSchema: {
            description: "Basic information about a reservation.",
            properties: {
              commitment: {
                description: "The commitment this reservation is tied to.",
                type: "string",
              },
              createTime: {
                description: "Creation timestamp of the reservation.",
                format: "date-time",
                type: "string",
              },
              id: {
                description: "The unique identifier for the reservation.",
                format: "uint64",
                type: "string",
              },
              linkedCommitments: {
                description: "The commitments linked to this reservation.",
                items: { type: "string" },
                type: "array",
              },
              name: { description: "Name of the reservation.", type: "string" },
              specificReservationRequired: {
                description:
                  'Indicates whether the reservation can be consumed by VMs with affinity for "any" reservation. If the field is set, then only VMs that target the reservation by name can consume from this reservation.',
                type: "boolean",
              },
              status: {
                description: "The status of the reservation.",
                enum: ["CREATING", "DELETING", "INVALID", "READY", "UPDATING"],
                type: "string",
                "x-google-enum-descriptions": [
                  "Reservation resources are being allocated.",
                  "Reservation deletion is in progress.",
                  "",
                  "Reservation resources have been allocated, and the reservation is ready for use.",
                  "Reservation update is in progress.",
                ],
              },
              zone: {
                description: "The zone of the reservation.",
                type: "string",
              },
            },
            type: "object",
          },
        },
        {
          annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true,
            title: "Get Reservation Details",
          },
          description:
            "Get Compute Engine reservation details. Returns reservation details including name, ID, status, creation timestamp, specific reservation properties like machine type, guest accelerators and local SSDs, aggregate reservation properties like VM family and reserved resources, commitment and linked commitments, sharing settings, and resource status. Requires project, zone, and reservation name as input.\n",
          inputSchema: {
            description: "Request message for getting reservation details.",
            properties: {
              name: {
                description:
                  "Required. Identifier. Name of the reservation to retrieve.",
                type: "string",
                "x-google-identifier": true,
              },
              project: {
                description: "Required. Project ID for this request.",
                type: "string",
              },
              zone: {
                description: "Required. The zone of the reservation.",
                type: "string",
              },
            },
            required: ["project", "zone", "name"],
            type: "object",
          },
          name: "get_reservation_details",
          outputSchema: {
            $defs: {
              Accelerator: {
                properties: {
                  acceleratorCount: {
                    description: "Number of accelerators of specified type.",
                    format: "int32",
                    type: "integer",
                  },
                  acceleratorType: {
                    description:
                      'Full or partial URL to accelerator type. e.g. "projects/{PROJECT}/zones/{ZONE}/acceleratorTypes/ct4l"',
                    type: "string",
                  },
                },
                type: "object",
              },
              AcceleratorConfig: {
                description:
                  "A specification of the type and number of accelerator cards attached to the instance.",
                properties: {
                  acceleratorCount: {
                    description:
                      "The number of the guest accelerator cards exposed to this instance.",
                    format: "int32",
                    type: "integer",
                  },
                  acceleratorType: {
                    description:
                      "Full or partial URL of the accelerator type resource to attach to this instance. For example: projects/my-project/zones/us-central1-c/acceleratorTypes/nvidia-tesla-p100 If you are creating an instance template, specify only the accelerator name. See GPUs on Compute Engine </compute/docs/gpus/#introduction> for a full list of accelerator types.",
                    type: "string",
                  },
                },
                type: "object",
              },
              AdvancedDeploymentControl: {
                description:
                  "Advance control for cluster management, applicable only to DENSE deployment type reservations.",
                properties: {
                  reservationOperationalMode: {
                    description:
                      "Indicates chosen reservation operational mode for the reservation.",
                    enum: [
                      "ALL_CAPACITY",
                      "HIGHLY_AVAILABLE_CAPACITY",
                      "RESERVATION_OPERATIONAL_MODE_UNSPECIFIED",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Google Cloud does not manage the failure of machines, but provides additional capacity, which is not guaranteed to be available.",
                      "Google Cloud manages the failure of machines to provide high availability.",
                      "",
                    ],
                  },
                },
                type: "object",
              },
              AggregateReservation: {
                description:
                  "This reservation type is specified by total resource amounts (e.g. total count of CPUs) and can account for multiple instance SKUs. In other words, one can create instances of varying shapes against this reservation.",
                properties: {
                  inUseResources: {
                    description:
                      "Output only. [Output only] List of resources currently in use.",
                    items: { $ref: "#/$defs/ReservedResourceInfo" },
                    readOnly: true,
                    type: "array",
                  },
                  reservedResources: {
                    description:
                      "List of reserved resources (CPUs, memory, accelerators).",
                    items: { $ref: "#/$defs/ReservedResourceInfo" },
                    type: "array",
                  },
                  vmFamily: {
                    description:
                      "The VM family that all instances scheduled against this reservation must belong to.",
                    enum: [
                      "VM_FAMILY_CLOUD_TPU_DEVICE_CT3",
                      "VM_FAMILY_CLOUD_TPU_LITE_DEVICE_CT5L",
                      "VM_FAMILY_CLOUD_TPU_LITE_POD_SLICE_CT5LP",
                      "VM_FAMILY_CLOUD_TPU_LITE_POD_SLICE_CT6E",
                      "VM_FAMILY_CLOUD_TPU_POD_SLICE_CT3P",
                      "VM_FAMILY_CLOUD_TPU_POD_SLICE_CT4P",
                      "VM_FAMILY_CLOUD_TPU_POD_SLICE_CT5P",
                      "VM_FAMILY_CLOUD_TPU_POD_SLICE_TPU7X",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                    ],
                  },
                  workloadType: {
                    description:
                      "The workload type of the instances that will target this reservation.",
                    enum: ["BATCH", "SERVING", "UNSPECIFIED"],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Reserved resources will be optimized for BATCH workloads, such as ML training.",
                      "Reserved resources will be optimized for SERVING workloads, such as ML inference.",
                      "",
                    ],
                  },
                },
                type: "object",
              },
              Duration: {
                description:
                  'A Duration represents a fixed-length span of time represented as a count of seconds and fractions of seconds at nanosecond resolution. It is independent of any calendar and concepts like "day" or "month". Range is approximately 10,000 years.',
                properties: {
                  nanos: {
                    description:
                      "Span of time that's a fraction of a second at nanosecond resolution. Durations less than one second are represented with a 0 `seconds` field and a positive `nanos` field. Must be from 0 to 999,999,999 inclusive.",
                    format: "int32",
                    type: "integer",
                  },
                  seconds: {
                    description:
                      "Span of time at a resolution of a second. Must be from 0 to 315,576,000,000 inclusive. Note: these bounds are computed from: 60 sec/min * 60 min/hr * 24 hr/day * 365.25 days/year * 10000 years",
                    format: "int64",
                    type: "string",
                  },
                },
                type: "object",
              },
              GroupMaintenanceInfo: {
                description: "Maintenance Info for ReservationBlocks.",
                properties: {
                  instanceMaintenanceOngoingCount: {
                    description:
                      "Describes number of instances that have ongoing maintenance.",
                    format: "int32",
                    type: "integer",
                  },
                  instanceMaintenancePendingCount: {
                    description:
                      "Describes number of instances that have pending maintenance.",
                    format: "int32",
                    type: "integer",
                  },
                  maintenanceOngoingCount: {
                    description:
                      "Progress for ongoing maintenance for this group of VMs/hosts. Describes number of hosts in the block that have ongoing maintenance.",
                    format: "int32",
                    type: "integer",
                  },
                  maintenancePendingCount: {
                    description:
                      "Progress for ongoing maintenance for this group of VMs/hosts. Describes number of hosts in the block that have pending maintenance.",
                    format: "int32",
                    type: "integer",
                  },
                  schedulingType: {
                    description: "The type of maintenance for the reservation.",
                    enum: [
                      "GROUPED",
                      "GROUP_MAINTENANCE_TYPE_UNSPECIFIED",
                      "INDEPENDENT",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Maintenance on all reserved instances in the reservation is synchronized.",
                      "Unknown maintenance type.",
                      "Maintenance is not synchronized for this reservation. Instead, each instance has its own maintenance window.",
                    ],
                  },
                  subblockInfraMaintenanceOngoingCount: {
                    description:
                      "Describes number of subblock Infrastructure that has ongoing maintenance. Here, Subblock Infrastructure Maintenance pertains to upstream hardware contained in the Subblock that is necessary for a VM Family(e.g. NVLink Domains). Not all VM Families will support this field.",
                    format: "int32",
                    type: "integer",
                  },
                  subblockInfraMaintenancePendingCount: {
                    description:
                      "Describes number of subblock Infrastructure that has pending maintenance. Here, Subblock Infrastructure Maintenance pertains to upstream hardware contained in the Subblock that is necessary for a VM Family (e.g. NVLink Domains). Not all VM Families will support this field.",
                    format: "int32",
                    type: "integer",
                  },
                  upcomingGroupMaintenance: {
                    $ref: "#/$defs/UpcomingMaintenance",
                    description:
                      "Maintenance information on this group of VMs.",
                  },
                },
                type: "object",
              },
              HealthInfo: {
                description: "Health information for the reservation.",
                properties: {
                  degradedBlockCount: {
                    description:
                      "The number of reservation blocks that are degraded.",
                    format: "int32",
                    type: "integer",
                  },
                  healthStatus: {
                    description: "The health status of the reservation.",
                    enum: ["DEGRADED", "HEALTHY", "HEALTH_STATUS_UNSPECIFIED"],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "The reservation is degraded.",
                      "The reservation is healthy.",
                      "The health status of the reservation is unspecified.",
                    ],
                  },
                  healthyBlockCount: {
                    description:
                      "The number of reservation blocks that are healthy.",
                    format: "int32",
                    type: "integer",
                  },
                },
                type: "object",
              },
              ProjectConfig: {
                description: "Config for each project in the share settings.",
                properties: {
                  projectId: {
                    description:
                      "The project ID, should be same as the key of this project config in the parent map.",
                    type: "string",
                  },
                },
                type: "object",
              },
              ReservationParams: {
                description: "Additional reservation params.",
                properties: {
                  resourceManagerTags: {
                    additionalProperties: { type: "string" },
                    description:
                      "Input only. Resource manager tags to be bound to the reservation. Tag keys and values have the same definition as resource manager tags <https://cloud.google.com/resource-manager/docs/tags/tags-overview>. Keys and values can be either in numeric format, such as `tagKeys/{tag_key_id}` and `tagValues/{tag_value_id}` or in namespaced format such as `{org_id|project_id}/{tag_key_short_name}` and `{tag_value_short_name}`. The field is ignored (both PUT & PATCH) when empty.",
                    type: "object",
                    writeOnly: true,
                  },
                },
                type: "object",
              },
              ReservationSharingPolicy: {
                properties: {
                  serviceShareType: {
                    description:
                      "Sharing config for all Google Cloud services.",
                    enum: [
                      "ALLOW_ALL",
                      "DISALLOW_ALL",
                      "SERVICE_SHARE_TYPE_UNSPECIFIED",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Allow all Google Cloud managed services to share reservations.",
                      "[Default] Disallow sharing with all Google Cloud services.",
                      "",
                    ],
                  },
                },
                type: "object",
              },
              ReservedDisk: {
                properties: {
                  diskSizeGb: {
                    description: "Specifies the size of the disk in base-2 GB.",
                    format: "int64",
                    type: "string",
                  },
                  interface: {
                    description:
                      "Specifies the disk interface to use for attaching this disk, which is either SCSI or NVME. The default is SCSI. For performance characteristics of SCSI over NVMe, see Local SSD performance </compute/docs/disks#localssds> .",
                    enum: ["NVME", "SCSI"],
                    type: "string",
                    "x-google-enum-descriptions": ["", ""],
                  },
                },
                type: "object",
              },
              ReservedInstanceProperties: {
                description:
                  "Properties of the SKU instances being reserved. Next ID: 10",
                properties: {
                  guestAccelerators: {
                    description: "Specifies accelerator type and count.",
                    items: { $ref: "#/$defs/AcceleratorConfig" },
                    type: "array",
                  },
                  localSsds: {
                    description:
                      "Specifies amount of local ssd to reserve with each instance. The type of disk is local-ssd.",
                    items: { $ref: "#/$defs/ReservedDisk" },
                    type: "array",
                  },
                  locationHint: {
                    description:
                      "An opaque location hint used to place the allocation close to other resources. This field is for use by internal tools that use the public API.",
                    type: "string",
                  },
                  machineType: {
                    description:
                      "Specifies type of machine (name only) which has fixed number of vCPUs and fixed amount of memory. This also includes specifying custom machine type following custom-NUMBER_OF_CPUS-AMOUNT_OF_MEMORY pattern.",
                    type: "string",
                  },
                  minCpuPlatform: {
                    description: "Minimum cpu platform the reservation.",
                    type: "string",
                  },
                },
                type: "object",
              },
              ReservedResourceInfo: {
                properties: {
                  accelerator: {
                    $ref: "#/$defs/Accelerator",
                    description:
                      "Properties of accelerator resources in this reservation.",
                  },
                },
                type: "object",
              },
              ResourceStatus: {
                description: "[Output Only] Contains output only fields.",
                properties: {
                  healthInfo: {
                    $ref: "#/$defs/HealthInfo",
                    description:
                      "[Output only] Health information for the reservation.",
                  },
                  reservationBlockCount: {
                    description:
                      "The number of reservation blocks associated with this reservation.",
                    format: "int32",
                    type: "integer",
                  },
                  reservationMaintenance: {
                    $ref: "#/$defs/GroupMaintenanceInfo",
                    description: "Maintenance information for this reservation",
                  },
                  specificSkuAllocation: {
                    $ref: "#/$defs/SpecificSKUAllocation",
                    description: "Allocation Properties of this reservation.",
                  },
                },
                type: "object",
              },
              ShareSettings: {
                description:
                  "The share setting for reservations and sole tenancy node groups.",
                properties: {
                  projectMap: {
                    additionalProperties: { $ref: "#/$defs/ProjectConfig" },
                    description:
                      "A map of project id and project config. This is only valid when share_type's value is SPECIFIC_PROJECTS.",
                    type: "object",
                  },
                  shareType: {
                    description: "Type of sharing for this shared-reservation",
                    enum: [
                      "LOCAL",
                      "ORGANIZATION",
                      "SHARE_TYPE_UNSPECIFIED",
                      "SPECIFIC_PROJECTS",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Default value.",
                      "Shared-reservation is open to entire Organization",
                      "Default value. This value is unused.",
                      "Shared-reservation is open to specific projects",
                    ],
                  },
                },
                type: "object",
              },
              SpecificSKUAllocation: {
                description: "Contains Properties set for the reservation.",
                properties: {
                  sourceInstanceTemplateId: {
                    description:
                      "ID of the instance template used to populate reservation properties.",
                    type: "string",
                  },
                  utilizations: {
                    additionalProperties: { format: "int64", type: "string" },
                    description:
                      "Per service utilization breakdown. The Key is the Google Cloud managed service name.",
                    type: "object",
                  },
                },
                type: "object",
              },
              SpecificSKUReservation: {
                description:
                  "This reservation type allows to pre allocate specific instance configuration.",
                properties: {
                  assuredCount: {
                    description:
                      "Output only. [Output Only] Indicates how many instances are actually usable currently.",
                    format: "int64",
                    readOnly: true,
                    type: "string",
                  },
                  count: {
                    description:
                      "Specifies the number of resources that are allocated.",
                    format: "int64",
                    type: "string",
                  },
                  inUseCount: {
                    description:
                      "Output only. [Output Only] Indicates how many instances are in use.",
                    format: "int64",
                    readOnly: true,
                    type: "string",
                  },
                  instanceProperties: {
                    $ref: "#/$defs/ReservedInstanceProperties",
                    description: "The instance properties for the reservation.",
                  },
                  sourceInstanceTemplate: {
                    description:
                      "Specifies the instance template to create the reservation. If you use this field, you must exclude the instanceProperties field. This field is optional, and it can be a full or partial URL. For example, the following are all valid URLs to an instance template: - https://www.googleapis.com/compute/v1/projects/project /global/instanceTemplates/instanceTemplate - projects/project/global/instanceTemplates/instanceTemplate - global/instanceTemplates/instanceTemplate ",
                    type: "string",
                  },
                },
                type: "object",
              },
              UpcomingMaintenance: {
                description: "Upcoming Maintenance notification information.",
                properties: {
                  canReschedule: {
                    description:
                      "Indicates if the maintenance can be customer triggered.",
                    type: "boolean",
                  },
                  latestWindowStartTime: {
                    description:
                      "The latest time for the planned maintenance window to start. This timestamp value is in RFC3339 text format.",
                    type: "string",
                  },
                  maintenanceOnShutdown: {
                    description:
                      "Indicates whether the UpcomingMaintenance will be triggered on VM shutdown.",
                    type: "boolean",
                  },
                  maintenanceReasons: {
                    description:
                      "The reasons for the maintenance. Only valid for vms.",
                    items: {
                      enum: [
                        "FAILURE_DISK",
                        "FAILURE_GPU",
                        "FAILURE_GPU_MULTIPLE_FAULTY_HOSTS_CUSTOMER_REPORTED",
                        "FAILURE_GPU_NVLINK_SWITCH_CUSTOMER_REPORTED",
                        "FAILURE_GPU_TEMPERATURE",
                        "FAILURE_GPU_XID",
                        "FAILURE_INFRA",
                        "FAILURE_INTERFACE",
                        "FAILURE_MEMORY",
                        "FAILURE_NETWORK",
                        "FAILURE_NVLINK",
                        "FAILURE_REDUNDANT_HARDWARE_FAULT",
                        "FAILURE_TPU",
                        "INFRASTRUCTURE_RELOCATION",
                        "MAINTENANCE_REASON_UNKNOWN",
                        "PLANNED_NETWORK_UPDATE",
                        "PLANNED_UPDATE",
                      ],
                      type: "string",
                      "x-google-enum-descriptions": [
                        "Maintenance due to disk errors.",
                        "Maintenance due to GPU errors.",
                        "Maintenance due to customer reported multiple faulty hosts via R&R Subblock API.",
                        "Maintenance due to customer reported NVLink switch failure via R&R Subblock API.",
                        "Maintenance due to high GPU temperature.",
                        "Maintenance due to GPU xid failure.",
                        "Maintenance due to infrastructure errors.",
                        "Maintenance due to interface errors.",
                        "Maintenance due to memory errors.",
                        "Maintenance due to network errors.",
                        "Maintenance due to NVLink failure.",
                        "Maintenance due to redundant hardware fault.",
                        "Maintenance due to TPU errors.",
                        "Maintenance due to infrastructure relocation.",
                        "Unknown maintenance reason. Do not use this value.",
                        "Maintenance due to planned network update.",
                        "Maintenance due to planned update to the instance.",
                      ],
                    },
                    type: "array",
                  },
                  maintenanceStatus: {
                    enum: ["ONGOING", "PENDING", "UNKNOWN"],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "There is ongoing maintenance on this VM.",
                      "There is pending maintenance.",
                      "Unknown maintenance status. Do not use this value.",
                    ],
                  },
                  type: {
                    description: "Defines the type of maintenance.",
                    enum: [
                      "MULTIPLE",
                      "SCHEDULED",
                      "UNKNOWN_TYPE",
                      "UNSCHEDULED",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Multiple maintenance types in one window. This is only intended to be used for groups.",
                      "Scheduled maintenance (e.g. maintenance after uptime guarantee is complete).",
                      "No type specified. Do not use this value.",
                      "Unscheduled maintenance (e.g. emergency maintenance during uptime guarantee).",
                    ],
                  },
                  windowEndTime: {
                    description:
                      "The time by which the maintenance disruption will be completed. This timestamp value is in RFC3339 text format.",
                    type: "string",
                  },
                  windowStartTime: {
                    description:
                      "The current start time of the maintenance window. This timestamp value is in RFC3339 text format.",
                    type: "string",
                  },
                },
                type: "object",
              },
            },
            description:
              "Represents a reservation resource. A reservation ensures that capacity is held in a specific zone even if the reserved VMs are not running. For more information, read Reserving zonal resources </compute/docs/instances/reserving-zonal-resources>.",
            properties: {
              advancedDeploymentControl: {
                $ref: "#/$defs/AdvancedDeploymentControl",
                description:
                  "Advanced control for cluster management, applicable only to DENSE deployment type reservations.",
              },
              aggregateReservation: {
                $ref: "#/$defs/AggregateReservation",
                description:
                  "Reservation for aggregated resources, providing shape flexibility.",
              },
              commitment: {
                description:
                  "Output only. [Output Only] Full or partial URL to a parent commitment. This field displays for reservations that are tied to a commitment.",
                readOnly: true,
                type: "string",
              },
              creationTimestamp: {
                description:
                  "Output only. [Output Only] Creation timestamp in RFC3339 <https://www.ietf.org/rfc/rfc3339.txt> text format.",
                readOnly: true,
                type: "string",
              },
              deleteAfterDuration: {
                $ref: "#/$defs/Duration",
                description:
                  "Duration time relative to reservation creation when Compute Engine will automatically delete this resource.",
              },
              deleteAtTime: {
                description:
                  "Absolute time in future when the reservation will be auto-deleted by Compute Engine. Timestamp is represented in RFC3339 <https://www.ietf.org/rfc/rfc3339.txt> text format.",
                type: "string",
              },
              deploymentType: {
                description:
                  "Specifies the deployment strategy for this reservation.",
                enum: ["DENSE", "DEPLOYMENT_TYPE_UNSPECIFIED"],
                type: "string",
                "x-google-enum-descriptions": [
                  "The reserved capacity is made up of densely deployed reservation blocks.",
                  "",
                ],
              },
              description: {
                description:
                  "An optional description of this resource. Provide this property when you create the resource.",
                type: "string",
              },
              earlyAccessMaintenance: {
                description:
                  "Indicates the early access maintenance for the reservation. If this field is absent or set to NO_EARLY_ACCESS, the reservation is not enrolled in early access maintenance and the standard notice applies.",
                enum: ["NO_EARLY_ACCESS", "WAVE1", "WAVE2"],
                type: "string",
                "x-google-enum-descriptions": [
                  "No early access.",
                  "Wave 1: Fastest notification period",
                  "Wave 2: Medium notification period",
                ],
              },
              enableEmergentMaintenance: {
                description:
                  "Indicates whether Compute Engine allows unplanned maintenance for your VMs; for example, to fix hardware errors.",
                type: "boolean",
              },
              id: {
                description:
                  "Output only. [Output Only] The unique identifier for the resource. This identifier is defined by the server.",
                format: "uint64",
                readOnly: true,
                type: "string",
              },
              kind: {
                default: "compute#reservation",
                description:
                  "Output only. [Output Only] Type of the resource. Always compute#reservations for reservations.",
                readOnly: true,
                type: "string",
              },
              linkedCommitments: {
                description:
                  "Output only. [Output Only] Full or partial URL to parent commitments. This field displays for reservations that are tied to multiple commitments.",
                items: { type: "string" },
                readOnly: true,
                type: "array",
              },
              name: {
                description:
                  "The name of the resource, provided by the client when initially creating the resource. The resource name must be 1-63 characters long, and comply with RFC1035 <https://www.ietf.org/rfc/rfc1035.txt>. Specifically, the name must be 1-63 characters long and match the regular expression `[a-z]([-a-z0-9]*[a-z0-9])?` which means the first character must be a lowercase letter, and all following characters must be a dash, lowercase letter, or digit, except the last character, which cannot be a dash.",
                pattern: "[a-z](?:[-a-z0-9]{0,61}[a-z0-9])?",
                type: "string",
              },
              params: {
                $ref: "#/$defs/ReservationParams",
                description:
                  "Input only. Additional params passed with the request, but not persisted as part of resource payload.",
                writeOnly: true,
              },
              protectionTier: {
                description:
                  "Protection tier for the workload which specifies the workload expectations in the event of infrastructure failures at data center (e.g. power and/or cooling failures).",
                enum: [
                  "CAPACITY_OPTIMIZED",
                  "PROTECTION_TIER_UNSPECIFIED",
                  "STANDARD",
                ],
                type: "string",
                "x-google-enum-descriptions": [
                  "CAPACITY_OPTIMIZED capacity leverages redundancies (e.g. power, cooling) at the data center during normal operating conditions. In the event of infrastructure failures at data center (e.g. power and/or cooling failures), this workload may be disrupted. As a consequence, it has a weaker availability SLO than STANDARD.",
                  "Unspecified protection tier.",
                  "STANDARD protection for workload that should be protected by redundancies (e.g. power, cooling) at the data center level. In the event of infrastructure failures at data center (e.g. power and/or cooling failures), this workload is expected to continue as normal using the redundancies.",
                ],
              },
              reservationSharingPolicy: {
                $ref: "#/$defs/ReservationSharingPolicy",
                description:
                  "Specify the reservation sharing policy. If unspecified, the reservation will not be shared with Google Cloud managed services.",
              },
              resourcePolicies: {
                additionalProperties: { type: "string" },
                description:
                  "Resource policies to be added to this reservation. The key is defined by user, and the value is resource policy url. This is to define placement policy with reservation.",
                type: "object",
              },
              resourceStatus: {
                $ref: "#/$defs/ResourceStatus",
                description:
                  "Output only. [Output Only] Status information for Reservation resource.",
                readOnly: true,
              },
              satisfiesPzs: {
                description:
                  "Output only. [Output Only] Reserved for future use.",
                readOnly: true,
                type: "boolean",
              },
              schedulingType: {
                description: "The type of maintenance for the reservation.",
                enum: [
                  "GROUPED",
                  "GROUP_MAINTENANCE_TYPE_UNSPECIFIED",
                  "INDEPENDENT",
                ],
                type: "string",
                "x-google-enum-descriptions": [
                  "Maintenance on all reserved instances in the reservation is synchronized.",
                  "Unknown maintenance type.",
                  "Maintenance is not synchronized for this reservation. Instead, each instance has its own maintenance window.",
                ],
              },
              selfLink: {
                description:
                  "Output only. [Output Only] Server-defined fully-qualified URL for this resource.",
                readOnly: true,
                type: "string",
              },
              shareSettings: {
                $ref: "#/$defs/ShareSettings",
                description:
                  "Specify share-settings to create a shared reservation. This property is optional. For more information about the syntax and options for this field and its subfields, see the guide for creating a shared reservation. <https://cloud.google.com/compute/docs/instances/reservations-shared#creating_a_shared_reservation>",
              },
              specificReservation: {
                $ref: "#/$defs/SpecificSKUReservation",
                description:
                  "Reservation for instances with specific machine shapes.",
              },
              specificReservationRequired: {
                description:
                  'Indicates whether the reservation can be consumed by VMs with affinity for "any" reservation. If the field is set, then only VMs that target the reservation by name can consume from this reservation.',
                type: "boolean",
              },
              status: {
                description:
                  "Output only. [Output Only] The status of the reservation. - CREATING: Reservation resources are being allocated. - READY: Reservation resources have been allocated, and the reservation is ready for use. - DELETING: Reservation deletion is in progress. - UPDATING: Reservation update is in progress. ",
                enum: ["CREATING", "DELETING", "INVALID", "READY", "UPDATING"],
                readOnly: true,
                type: "string",
                "x-google-enum-descriptions": [
                  "Reservation resources are being allocated.",
                  "Reservation deletion is in progress.",
                  "",
                  "Reservation resources have been allocated, and the reservation is ready for use.",
                  "Reservation update is in progress.",
                ],
              },
              zone: {
                description:
                  "Zone in which the reservation resides. A zone must be provided if the reservation is created within a commitment.",
                type: "string",
              },
            },
            type: "object",
          },
        },
        {
          annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true,
            title: "List Reservations Basic Info",
          },
          description:
            "Lists Compute Engine reservations. Details for each reservation include name, ID, creation timestamp, zone, status, specific reservation required, commitment, and linked commitments. Requires project and zone as input.\n",
          inputSchema: {
            description: "Request message for listing reservations basic info.",
            properties: {
              pageSize: {
                description:
                  "Optional. The maximum number of reservations to return.",
                format: "int32",
                type: "integer",
              },
              pageToken: {
                description:
                  "Optional. A page token received from a previous call to list reservations.",
                type: "string",
              },
              project: {
                description: "Required. Project ID for this request.",
                type: "string",
              },
              zone: {
                description: "Required. The zone of the reservations.",
                type: "string",
              },
            },
            required: ["project", "zone"],
            type: "object",
          },
          name: "list_reservations",
          outputSchema: {
            $defs: {
              ReservationBasicInfo: {
                description: "Basic information about a reservation.",
                properties: {
                  commitment: {
                    description: "The commitment this reservation is tied to.",
                    type: "string",
                  },
                  createTime: {
                    description: "Creation timestamp of the reservation.",
                    format: "date-time",
                    type: "string",
                  },
                  id: {
                    description: "The unique identifier for the reservation.",
                    format: "uint64",
                    type: "string",
                  },
                  linkedCommitments: {
                    description: "The commitments linked to this reservation.",
                    items: { type: "string" },
                    type: "array",
                  },
                  name: {
                    description: "Name of the reservation.",
                    type: "string",
                  },
                  specificReservationRequired: {
                    description:
                      'Indicates whether the reservation can be consumed by VMs with affinity for "any" reservation. If the field is set, then only VMs that target the reservation by name can consume from this reservation.',
                    type: "boolean",
                  },
                  status: {
                    description: "The status of the reservation.",
                    enum: [
                      "CREATING",
                      "DELETING",
                      "INVALID",
                      "READY",
                      "UPDATING",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Reservation resources are being allocated.",
                      "Reservation deletion is in progress.",
                      "",
                      "Reservation resources have been allocated, and the reservation is ready for use.",
                      "Reservation update is in progress.",
                    ],
                  },
                  zone: {
                    description: "The zone of the reservation.",
                    type: "string",
                  },
                },
                type: "object",
              },
            },
            description:
              "Response message for listing reservations basic info.",
            properties: {
              nextPageToken: {
                description:
                  "A token that can be sent as `page_token` to retrieve the next page. If this field is omitted, there are no subsequent pages.",
                type: "string",
              },
              reservations: {
                description: "The list of reservations.",
                items: { $ref: "#/$defs/ReservationBasicInfo" },
                type: "array",
              },
            },
            type: "object",
          },
        },
        {
          annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true,
            title: "List Region Commitments Basic Info",
          },
          description:
            "Lists Compute Engine Commitments in a region. Details for each commitment include name, ID, status, plan, type, resources, and creation, start and end timestamps. Requires project and region as input.\n",
          inputSchema: {
            description: "Request message for listing region commitments.",
            properties: {
              pageSize: {
                description:
                  "Optional. The maximum number of commitments to return.",
                format: "int32",
                type: "integer",
              },
              pageToken: {
                description:
                  "Optional. A page token received from a previous call to list commitments.",
                type: "string",
              },
              project: {
                description: "Required. Project ID for this request.",
                type: "string",
              },
              region: {
                description: "Required. The region of the commitments.",
                type: "string",
              },
            },
            required: ["project", "region"],
            type: "object",
          },
          name: "list_commitments",
          outputSchema: {
            $defs: {
              CommitmentBasicInfo: {
                description: "Basic information about a commitment.",
                properties: {
                  createTime: {
                    description: "Creation timestamp of the commitment.",
                    format: "date-time",
                    type: "string",
                  },
                  endTime: {
                    description: "End timestamp of the commitment.",
                    format: "date-time",
                    type: "string",
                  },
                  id: {
                    description: "The unique identifier for the commitment.",
                    format: "uint64",
                    type: "string",
                  },
                  name: {
                    description: "Name of the commitment.",
                    type: "string",
                  },
                  plan: {
                    description: "The plan of the commitment.",
                    enum: [
                      "INVALID",
                      "SIXTY_MONTH",
                      "THIRTY_SIX_MONTH",
                      "TWELVE_MONTH",
                      "TWENTY_FOUR_MONTH",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": ["", "", "", "", ""],
                  },
                  resources: {
                    description:
                      "A list of all the hardware resources of the commitment.",
                    items: { $ref: "#/$defs/ResourceCommitment" },
                    type: "array",
                  },
                  startTime: {
                    description: "Start timestamp of the commitment.",
                    format: "date-time",
                    type: "string",
                  },
                  status: {
                    description: "The status of the commitment.",
                    enum: [
                      "ACTIVE",
                      "CANCELED_EARLY_TERMINATION",
                      "CANCELED_MERGED",
                      "CANCELING",
                      "CANCELLED",
                      "CREATING",
                      "EXPIRED",
                      "NOT_YET_ACTIVE",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "",
                      "",
                      "",
                      "",
                      "Deprecate CANCELED status. Will use separate status to differentiate cancel by mergeCud or manual cancellation.",
                      "",
                      "",
                      "",
                    ],
                  },
                  type: {
                    description: "The type of the commitment.",
                    enum: [
                      "ACCELERATOR_OPTIMIZED",
                      "ACCELERATOR_OPTIMIZED_A3",
                      "ACCELERATOR_OPTIMIZED_A3_MEGA",
                      "ACCELERATOR_OPTIMIZED_A3_ULTRA",
                      "ACCELERATOR_OPTIMIZED_A4",
                      "ACCELERATOR_OPTIMIZED_A4X",
                      "ACCELERATOR_OPTIMIZED_A4X_MAX",
                      "CLOUD_TPU_LITE_DEVICE_CT4L",
                      "CLOUD_TPU_LITE_DEVICE_CT5L",
                      "CLOUD_TPU_LITE_POD_SLICE_CT5LP",
                      "CLOUD_TPU_POD_SLICE_CT4P",
                      "CLOUD_TPU_SLICE_CT5P",
                      "CLOUD_TPU_SLICE_CT6E",
                      "CLOUD_TPU_SLICE_CT6E_BATCH_OPTIMIZED",
                      "CLOUD_TPU_SLICE_TPU7",
                      "CLOUD_TPU_SLICE_TPU7X",
                      "CLOUD_TPU_SLICE_TPU7X_BATCH_OPTIMIZED",
                      "CLOUD_TPU_SLICE_TPU7_BATCH_OPTIMIZED",
                      "COMPUTE_OPTIMIZED",
                      "COMPUTE_OPTIMIZED_C2D",
                      "COMPUTE_OPTIMIZED_C3",
                      "COMPUTE_OPTIMIZED_C3A",
                      "COMPUTE_OPTIMIZED_C3D",
                      "COMPUTE_OPTIMIZED_H3",
                      "COMPUTE_OPTIMIZED_H4",
                      "COMPUTE_OPTIMIZED_H4D",
                      "GENERAL_PURPOSE",
                      "GENERAL_PURPOSE_C4",
                      "GENERAL_PURPOSE_C4A",
                      "GENERAL_PURPOSE_C4D",
                      "GENERAL_PURPOSE_E2",
                      "GENERAL_PURPOSE_E4A",
                      "GENERAL_PURPOSE_E5A",
                      "GENERAL_PURPOSE_N2",
                      "GENERAL_PURPOSE_N2D",
                      "GENERAL_PURPOSE_N3",
                      "GENERAL_PURPOSE_N4",
                      "GENERAL_PURPOSE_N4A",
                      "GENERAL_PURPOSE_N4D",
                      "GENERAL_PURPOSE_N5A",
                      "GENERAL_PURPOSE_N5I",
                      "GENERAL_PURPOSE_T2A",
                      "GENERAL_PURPOSE_T2D",
                      "GRAPHICS_OPTIMIZED",
                      "GRAPHICS_OPTIMIZED_G4",
                      "GRAPHICS_OPTIMIZED_G4D",
                      "MEMORY_OPTIMIZED",
                      "MEMORY_OPTIMIZED_M3",
                      "MEMORY_OPTIMIZED_M4",
                      "MEMORY_OPTIMIZED_M4_6TB",
                      "MEMORY_OPTIMIZED_REGIONAL_EXTENSION",
                      "MEMORY_OPTIMIZED_X4",
                      "MEMORY_OPTIMIZED_X4_1440_24T",
                      "MEMORY_OPTIMIZED_X4_16TB",
                      "MEMORY_OPTIMIZED_X4_1920_32T",
                      "MEMORY_OPTIMIZED_X4_24TB",
                      "MEMORY_OPTIMIZED_X4_32TB",
                      "MEMORY_OPTIMIZED_X4_480_6T",
                      "MEMORY_OPTIMIZED_X4_480_8T",
                      "MEMORY_OPTIMIZED_X4_960_12T",
                      "MEMORY_OPTIMIZED_X4_960_16T",
                      "NETWORK_OPTIMIZED_C4N",
                      "STORAGE_OPTIMIZED_Z3",
                      "STORAGE_OPTIMIZED_Z4D",
                      "TYPE_UNSPECIFIED",
                    ],
                    type: "string",
                    "x-google-enum-deprecated": [
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      true,
                      false,
                      false,
                      false,
                      false,
                      false,
                      true,
                      false,
                      false,
                      false,
                      true,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                      false,
                    ],
                    "x-google-enum-descriptions": [
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "G4D is deprecated, use G4 instead.",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "CUD bucket for X4 machine with 1440 vCPUs and 24TB of memory.",
                      "",
                      "CUD bucket for X4 machine with 1920 vCPUs and 32TB of memory.",
                      "",
                      "",
                      "CUD bucket for X4 machine with 480 vCPUs and 6TB of memory.",
                      "CUD bucket for X4 machine with 480 vCPUs and 8TB of memory.",
                      "CUD bucket for X4 machine with 960 vCPUs and 12TB of memory.",
                      "CUD bucket for X4 machine with 960 vCPUs and 16TB of memory.",
                      "CUD bucket for C4N (dual Diorite) machines.",
                      "",
                      "CUD bucket for Z4D (bare metal) machines.",
                      "Note for internal users: When adding a new enum Type for v1, make sure to also add it in the comment for the `optional Type type` definition. This ensures that the public documentation displays the new enum Type.",
                    ],
                  },
                },
                type: "object",
              },
              ResourceCommitment: {
                description:
                  "Commitment for a particular hardware resource (a commitment is composed of one or more of these).",
                properties: {
                  acceleratorType: {
                    description:
                      "Name of the accelerator type or GPU resource. Specify this field only when the type of hardware resource is ACCELERATOR.",
                    type: "string",
                  },
                  amount: {
                    description:
                      "The quantity of the hardware resource that you want to commit to purchasing (in a type-dependent unit). - For vCPUs, you must specify an integer value. - For memory, you specify the amount of MB that you want. The value you specify must be a multiple of 256 MB, with up to 6.5 GB of memory per every vCPU. - For GPUs, you must specify an integer value. - For Local SSD disks, you must specify the amount in GB. The size of a single Local SSD disk is 375 GB. ",
                    format: "int64",
                    type: "string",
                  },
                  type: {
                    description:
                      "The type of hardware resource that you want to specify. You can specify any of the following values: - VCPU - MEMORY - LOCAL_SSD - ACCELERATOR Specify as a separate entry in the list for each individual resource type.",
                    enum: [
                      "ACCELERATOR",
                      "LOCAL_SSD",
                      "MEMORY",
                      "UNSPECIFIED",
                      "VCPU",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": ["", "", "", "", ""],
                  },
                },
                type: "object",
              },
            },
            description: "Response message for listing region commitments.",
            properties: {
              commitments: {
                description: "The list of commitments.",
                items: { $ref: "#/$defs/CommitmentBasicInfo" },
                type: "array",
              },
              nextPageToken: {
                description:
                  "A token that can be sent as `page_token` to retrieve the next page. If this field is omitted, there are no subsequent pages.",
                type: "string",
              },
            },
            type: "object",
          },
        },
        {
          annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true,
            title: "Get Region Commitment Basic Info",
          },
          description:
            "Get basic information about a Compute Engine Commitment, including its name, ID, status, plan, type, resources, and creation, start and end timestamps. Requires project, region, and commitment name as input.\n",
          inputSchema: {
            description: "Request message for getting a region commitment.",
            properties: {
              name: {
                description:
                  "Required. Identifier. Name of the commitment to return.",
                type: "string",
                "x-google-identifier": true,
              },
              project: {
                description: "Required. Project ID for this request.",
                type: "string",
              },
              region: {
                description: "Required. The region of the commitment.",
                type: "string",
              },
            },
            required: ["project", "region", "name"],
            type: "object",
          },
          name: "get_commitment_basic_info",
          outputSchema: {
            $defs: {
              ResourceCommitment: {
                description:
                  "Commitment for a particular hardware resource (a commitment is composed of one or more of these).",
                properties: {
                  acceleratorType: {
                    description:
                      "Name of the accelerator type or GPU resource. Specify this field only when the type of hardware resource is ACCELERATOR.",
                    type: "string",
                  },
                  amount: {
                    description:
                      "The quantity of the hardware resource that you want to commit to purchasing (in a type-dependent unit). - For vCPUs, you must specify an integer value. - For memory, you specify the amount of MB that you want. The value you specify must be a multiple of 256 MB, with up to 6.5 GB of memory per every vCPU. - For GPUs, you must specify an integer value. - For Local SSD disks, you must specify the amount in GB. The size of a single Local SSD disk is 375 GB. ",
                    format: "int64",
                    type: "string",
                  },
                  type: {
                    description:
                      "The type of hardware resource that you want to specify. You can specify any of the following values: - VCPU - MEMORY - LOCAL_SSD - ACCELERATOR Specify as a separate entry in the list for each individual resource type.",
                    enum: [
                      "ACCELERATOR",
                      "LOCAL_SSD",
                      "MEMORY",
                      "UNSPECIFIED",
                      "VCPU",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": ["", "", "", "", ""],
                  },
                },
                type: "object",
              },
            },
            description: "Basic information about a commitment.",
            properties: {
              createTime: {
                description: "Creation timestamp of the commitment.",
                format: "date-time",
                type: "string",
              },
              endTime: {
                description: "End timestamp of the commitment.",
                format: "date-time",
                type: "string",
              },
              id: {
                description: "The unique identifier for the commitment.",
                format: "uint64",
                type: "string",
              },
              name: { description: "Name of the commitment.", type: "string" },
              plan: {
                description: "The plan of the commitment.",
                enum: [
                  "INVALID",
                  "SIXTY_MONTH",
                  "THIRTY_SIX_MONTH",
                  "TWELVE_MONTH",
                  "TWENTY_FOUR_MONTH",
                ],
                type: "string",
                "x-google-enum-descriptions": ["", "", "", "", ""],
              },
              resources: {
                description:
                  "A list of all the hardware resources of the commitment.",
                items: { $ref: "#/$defs/ResourceCommitment" },
                type: "array",
              },
              startTime: {
                description: "Start timestamp of the commitment.",
                format: "date-time",
                type: "string",
              },
              status: {
                description: "The status of the commitment.",
                enum: [
                  "ACTIVE",
                  "CANCELED_EARLY_TERMINATION",
                  "CANCELED_MERGED",
                  "CANCELING",
                  "CANCELLED",
                  "CREATING",
                  "EXPIRED",
                  "NOT_YET_ACTIVE",
                ],
                type: "string",
                "x-google-enum-descriptions": [
                  "",
                  "",
                  "",
                  "",
                  "Deprecate CANCELED status. Will use separate status to differentiate cancel by mergeCud or manual cancellation.",
                  "",
                  "",
                  "",
                ],
              },
              type: {
                description: "The type of the commitment.",
                enum: [
                  "ACCELERATOR_OPTIMIZED",
                  "ACCELERATOR_OPTIMIZED_A3",
                  "ACCELERATOR_OPTIMIZED_A3_MEGA",
                  "ACCELERATOR_OPTIMIZED_A3_ULTRA",
                  "ACCELERATOR_OPTIMIZED_A4",
                  "ACCELERATOR_OPTIMIZED_A4X",
                  "ACCELERATOR_OPTIMIZED_A4X_MAX",
                  "CLOUD_TPU_LITE_DEVICE_CT4L",
                  "CLOUD_TPU_LITE_DEVICE_CT5L",
                  "CLOUD_TPU_LITE_POD_SLICE_CT5LP",
                  "CLOUD_TPU_POD_SLICE_CT4P",
                  "CLOUD_TPU_SLICE_CT5P",
                  "CLOUD_TPU_SLICE_CT6E",
                  "CLOUD_TPU_SLICE_CT6E_BATCH_OPTIMIZED",
                  "CLOUD_TPU_SLICE_TPU7",
                  "CLOUD_TPU_SLICE_TPU7X",
                  "CLOUD_TPU_SLICE_TPU7X_BATCH_OPTIMIZED",
                  "CLOUD_TPU_SLICE_TPU7_BATCH_OPTIMIZED",
                  "COMPUTE_OPTIMIZED",
                  "COMPUTE_OPTIMIZED_C2D",
                  "COMPUTE_OPTIMIZED_C3",
                  "COMPUTE_OPTIMIZED_C3A",
                  "COMPUTE_OPTIMIZED_C3D",
                  "COMPUTE_OPTIMIZED_H3",
                  "COMPUTE_OPTIMIZED_H4",
                  "COMPUTE_OPTIMIZED_H4D",
                  "GENERAL_PURPOSE",
                  "GENERAL_PURPOSE_C4",
                  "GENERAL_PURPOSE_C4A",
                  "GENERAL_PURPOSE_C4D",
                  "GENERAL_PURPOSE_E2",
                  "GENERAL_PURPOSE_E4A",
                  "GENERAL_PURPOSE_E5A",
                  "GENERAL_PURPOSE_N2",
                  "GENERAL_PURPOSE_N2D",
                  "GENERAL_PURPOSE_N3",
                  "GENERAL_PURPOSE_N4",
                  "GENERAL_PURPOSE_N4A",
                  "GENERAL_PURPOSE_N4D",
                  "GENERAL_PURPOSE_N5A",
                  "GENERAL_PURPOSE_N5I",
                  "GENERAL_PURPOSE_T2A",
                  "GENERAL_PURPOSE_T2D",
                  "GRAPHICS_OPTIMIZED",
                  "GRAPHICS_OPTIMIZED_G4",
                  "GRAPHICS_OPTIMIZED_G4D",
                  "MEMORY_OPTIMIZED",
                  "MEMORY_OPTIMIZED_M3",
                  "MEMORY_OPTIMIZED_M4",
                  "MEMORY_OPTIMIZED_M4_6TB",
                  "MEMORY_OPTIMIZED_REGIONAL_EXTENSION",
                  "MEMORY_OPTIMIZED_X4",
                  "MEMORY_OPTIMIZED_X4_1440_24T",
                  "MEMORY_OPTIMIZED_X4_16TB",
                  "MEMORY_OPTIMIZED_X4_1920_32T",
                  "MEMORY_OPTIMIZED_X4_24TB",
                  "MEMORY_OPTIMIZED_X4_32TB",
                  "MEMORY_OPTIMIZED_X4_480_6T",
                  "MEMORY_OPTIMIZED_X4_480_8T",
                  "MEMORY_OPTIMIZED_X4_960_12T",
                  "MEMORY_OPTIMIZED_X4_960_16T",
                  "NETWORK_OPTIMIZED_C4N",
                  "STORAGE_OPTIMIZED_Z3",
                  "STORAGE_OPTIMIZED_Z4D",
                  "TYPE_UNSPECIFIED",
                ],
                type: "string",
                "x-google-enum-deprecated": [
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  true,
                  false,
                  false,
                  false,
                  false,
                  false,
                  true,
                  false,
                  false,
                  false,
                  true,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                  false,
                ],
                "x-google-enum-descriptions": [
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "G4D is deprecated, use G4 instead.",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "",
                  "CUD bucket for X4 machine with 1440 vCPUs and 24TB of memory.",
                  "",
                  "CUD bucket for X4 machine with 1920 vCPUs and 32TB of memory.",
                  "",
                  "",
                  "CUD bucket for X4 machine with 480 vCPUs and 6TB of memory.",
                  "CUD bucket for X4 machine with 480 vCPUs and 8TB of memory.",
                  "CUD bucket for X4 machine with 960 vCPUs and 12TB of memory.",
                  "CUD bucket for X4 machine with 960 vCPUs and 16TB of memory.",
                  "CUD bucket for C4N (dual Diorite) machines.",
                  "",
                  "CUD bucket for Z4D (bare metal) machines.",
                  "Note for internal users: When adding a new enum Type for v1, make sure to also add it in the comment for the `optional Type type` definition. This ensures that the public documentation displays the new enum Type.",
                ],
              },
            },
            type: "object",
          },
        },
        {
          annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true,
            title: "List Commitment Reservations",
          },
          description:
            "Lists reservations for a Compute Engine Commitment. Returns reservation details including name, ID, status, creation timestamp, specific reservation properties like machine type, guest accelerators and local SSDs, aggregate reservation properties like VM family and reserved resources, commitment and linked commitments, sharing settings, and resource status. Requires project, region, and commitment name as input.\n",
          inputSchema: {
            description:
              "Request message for listing reservations for a region commitment.",
            properties: {
              name: {
                description:
                  "Required. Identifier. Name of the commitment to look up reservations for.",
                type: "string",
                "x-google-identifier": true,
              },
              project: {
                description: "Required. Project ID for this request.",
                type: "string",
              },
              region: {
                description: "Required. The region of the commitment.",
                type: "string",
              },
            },
            required: ["project", "region", "name"],
            type: "object",
          },
          name: "list_commitment_reservations",
          outputSchema: {
            $defs: {
              Accelerator: {
                properties: {
                  acceleratorCount: {
                    description: "Number of accelerators of specified type.",
                    format: "int32",
                    type: "integer",
                  },
                  acceleratorType: {
                    description:
                      'Full or partial URL to accelerator type. e.g. "projects/{PROJECT}/zones/{ZONE}/acceleratorTypes/ct4l"',
                    type: "string",
                  },
                },
                type: "object",
              },
              AcceleratorConfig: {
                description:
                  "A specification of the type and number of accelerator cards attached to the instance.",
                properties: {
                  acceleratorCount: {
                    description:
                      "The number of the guest accelerator cards exposed to this instance.",
                    format: "int32",
                    type: "integer",
                  },
                  acceleratorType: {
                    description:
                      "Full or partial URL of the accelerator type resource to attach to this instance. For example: projects/my-project/zones/us-central1-c/acceleratorTypes/nvidia-tesla-p100 If you are creating an instance template, specify only the accelerator name. See GPUs on Compute Engine </compute/docs/gpus/#introduction> for a full list of accelerator types.",
                    type: "string",
                  },
                },
                type: "object",
              },
              AdvancedDeploymentControl: {
                description:
                  "Advance control for cluster management, applicable only to DENSE deployment type reservations.",
                properties: {
                  reservationOperationalMode: {
                    description:
                      "Indicates chosen reservation operational mode for the reservation.",
                    enum: [
                      "ALL_CAPACITY",
                      "HIGHLY_AVAILABLE_CAPACITY",
                      "RESERVATION_OPERATIONAL_MODE_UNSPECIFIED",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Google Cloud does not manage the failure of machines, but provides additional capacity, which is not guaranteed to be available.",
                      "Google Cloud manages the failure of machines to provide high availability.",
                      "",
                    ],
                  },
                },
                type: "object",
              },
              AggregateReservation: {
                description:
                  "This reservation type is specified by total resource amounts (e.g. total count of CPUs) and can account for multiple instance SKUs. In other words, one can create instances of varying shapes against this reservation.",
                properties: {
                  inUseResources: {
                    description:
                      "Output only. [Output only] List of resources currently in use.",
                    items: { $ref: "#/$defs/ReservedResourceInfo" },
                    readOnly: true,
                    type: "array",
                  },
                  reservedResources: {
                    description:
                      "List of reserved resources (CPUs, memory, accelerators).",
                    items: { $ref: "#/$defs/ReservedResourceInfo" },
                    type: "array",
                  },
                  vmFamily: {
                    description:
                      "The VM family that all instances scheduled against this reservation must belong to.",
                    enum: [
                      "VM_FAMILY_CLOUD_TPU_DEVICE_CT3",
                      "VM_FAMILY_CLOUD_TPU_LITE_DEVICE_CT5L",
                      "VM_FAMILY_CLOUD_TPU_LITE_POD_SLICE_CT5LP",
                      "VM_FAMILY_CLOUD_TPU_LITE_POD_SLICE_CT6E",
                      "VM_FAMILY_CLOUD_TPU_POD_SLICE_CT3P",
                      "VM_FAMILY_CLOUD_TPU_POD_SLICE_CT4P",
                      "VM_FAMILY_CLOUD_TPU_POD_SLICE_CT5P",
                      "VM_FAMILY_CLOUD_TPU_POD_SLICE_TPU7X",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                      "",
                    ],
                  },
                  workloadType: {
                    description:
                      "The workload type of the instances that will target this reservation.",
                    enum: ["BATCH", "SERVING", "UNSPECIFIED"],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Reserved resources will be optimized for BATCH workloads, such as ML training.",
                      "Reserved resources will be optimized for SERVING workloads, such as ML inference.",
                      "",
                    ],
                  },
                },
                type: "object",
              },
              Duration: {
                description:
                  'A Duration represents a fixed-length span of time represented as a count of seconds and fractions of seconds at nanosecond resolution. It is independent of any calendar and concepts like "day" or "month". Range is approximately 10,000 years.',
                properties: {
                  nanos: {
                    description:
                      "Span of time that's a fraction of a second at nanosecond resolution. Durations less than one second are represented with a 0 `seconds` field and a positive `nanos` field. Must be from 0 to 999,999,999 inclusive.",
                    format: "int32",
                    type: "integer",
                  },
                  seconds: {
                    description:
                      "Span of time at a resolution of a second. Must be from 0 to 315,576,000,000 inclusive. Note: these bounds are computed from: 60 sec/min * 60 min/hr * 24 hr/day * 365.25 days/year * 10000 years",
                    format: "int64",
                    type: "string",
                  },
                },
                type: "object",
              },
              GroupMaintenanceInfo: {
                description: "Maintenance Info for ReservationBlocks.",
                properties: {
                  instanceMaintenanceOngoingCount: {
                    description:
                      "Describes number of instances that have ongoing maintenance.",
                    format: "int32",
                    type: "integer",
                  },
                  instanceMaintenancePendingCount: {
                    description:
                      "Describes number of instances that have pending maintenance.",
                    format: "int32",
                    type: "integer",
                  },
                  maintenanceOngoingCount: {
                    description:
                      "Progress for ongoing maintenance for this group of VMs/hosts. Describes number of hosts in the block that have ongoing maintenance.",
                    format: "int32",
                    type: "integer",
                  },
                  maintenancePendingCount: {
                    description:
                      "Progress for ongoing maintenance for this group of VMs/hosts. Describes number of hosts in the block that have pending maintenance.",
                    format: "int32",
                    type: "integer",
                  },
                  schedulingType: {
                    description: "The type of maintenance for the reservation.",
                    enum: [
                      "GROUPED",
                      "GROUP_MAINTENANCE_TYPE_UNSPECIFIED",
                      "INDEPENDENT",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Maintenance on all reserved instances in the reservation is synchronized.",
                      "Unknown maintenance type.",
                      "Maintenance is not synchronized for this reservation. Instead, each instance has its own maintenance window.",
                    ],
                  },
                  subblockInfraMaintenanceOngoingCount: {
                    description:
                      "Describes number of subblock Infrastructure that has ongoing maintenance. Here, Subblock Infrastructure Maintenance pertains to upstream hardware contained in the Subblock that is necessary for a VM Family(e.g. NVLink Domains). Not all VM Families will support this field.",
                    format: "int32",
                    type: "integer",
                  },
                  subblockInfraMaintenancePendingCount: {
                    description:
                      "Describes number of subblock Infrastructure that has pending maintenance. Here, Subblock Infrastructure Maintenance pertains to upstream hardware contained in the Subblock that is necessary for a VM Family (e.g. NVLink Domains). Not all VM Families will support this field.",
                    format: "int32",
                    type: "integer",
                  },
                  upcomingGroupMaintenance: {
                    $ref: "#/$defs/UpcomingMaintenance",
                    description:
                      "Maintenance information on this group of VMs.",
                  },
                },
                type: "object",
              },
              HealthInfo: {
                description: "Health information for the reservation.",
                properties: {
                  degradedBlockCount: {
                    description:
                      "The number of reservation blocks that are degraded.",
                    format: "int32",
                    type: "integer",
                  },
                  healthStatus: {
                    description: "The health status of the reservation.",
                    enum: ["DEGRADED", "HEALTHY", "HEALTH_STATUS_UNSPECIFIED"],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "The reservation is degraded.",
                      "The reservation is healthy.",
                      "The health status of the reservation is unspecified.",
                    ],
                  },
                  healthyBlockCount: {
                    description:
                      "The number of reservation blocks that are healthy.",
                    format: "int32",
                    type: "integer",
                  },
                },
                type: "object",
              },
              ProjectConfig: {
                description: "Config for each project in the share settings.",
                properties: {
                  projectId: {
                    description:
                      "The project ID, should be same as the key of this project config in the parent map.",
                    type: "string",
                  },
                },
                type: "object",
              },
              Reservation: {
                description:
                  "Represents a reservation resource. A reservation ensures that capacity is held in a specific zone even if the reserved VMs are not running. For more information, read Reserving zonal resources </compute/docs/instances/reserving-zonal-resources>.",
                properties: {
                  advancedDeploymentControl: {
                    $ref: "#/$defs/AdvancedDeploymentControl",
                    description:
                      "Advanced control for cluster management, applicable only to DENSE deployment type reservations.",
                  },
                  aggregateReservation: {
                    $ref: "#/$defs/AggregateReservation",
                    description:
                      "Reservation for aggregated resources, providing shape flexibility.",
                  },
                  commitment: {
                    description:
                      "Output only. [Output Only] Full or partial URL to a parent commitment. This field displays for reservations that are tied to a commitment.",
                    readOnly: true,
                    type: "string",
                  },
                  creationTimestamp: {
                    description:
                      "Output only. [Output Only] Creation timestamp in RFC3339 <https://www.ietf.org/rfc/rfc3339.txt> text format.",
                    readOnly: true,
                    type: "string",
                  },
                  deleteAfterDuration: {
                    $ref: "#/$defs/Duration",
                    description:
                      "Duration time relative to reservation creation when Compute Engine will automatically delete this resource.",
                  },
                  deleteAtTime: {
                    description:
                      "Absolute time in future when the reservation will be auto-deleted by Compute Engine. Timestamp is represented in RFC3339 <https://www.ietf.org/rfc/rfc3339.txt> text format.",
                    type: "string",
                  },
                  deploymentType: {
                    description:
                      "Specifies the deployment strategy for this reservation.",
                    enum: ["DENSE", "DEPLOYMENT_TYPE_UNSPECIFIED"],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "The reserved capacity is made up of densely deployed reservation blocks.",
                      "",
                    ],
                  },
                  description: {
                    description:
                      "An optional description of this resource. Provide this property when you create the resource.",
                    type: "string",
                  },
                  earlyAccessMaintenance: {
                    description:
                      "Indicates the early access maintenance for the reservation. If this field is absent or set to NO_EARLY_ACCESS, the reservation is not enrolled in early access maintenance and the standard notice applies.",
                    enum: ["NO_EARLY_ACCESS", "WAVE1", "WAVE2"],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "No early access.",
                      "Wave 1: Fastest notification period",
                      "Wave 2: Medium notification period",
                    ],
                  },
                  enableEmergentMaintenance: {
                    description:
                      "Indicates whether Compute Engine allows unplanned maintenance for your VMs; for example, to fix hardware errors.",
                    type: "boolean",
                  },
                  id: {
                    description:
                      "Output only. [Output Only] The unique identifier for the resource. This identifier is defined by the server.",
                    format: "uint64",
                    readOnly: true,
                    type: "string",
                  },
                  kind: {
                    default: "compute#reservation",
                    description:
                      "Output only. [Output Only] Type of the resource. Always compute#reservations for reservations.",
                    readOnly: true,
                    type: "string",
                  },
                  linkedCommitments: {
                    description:
                      "Output only. [Output Only] Full or partial URL to parent commitments. This field displays for reservations that are tied to multiple commitments.",
                    items: { type: "string" },
                    readOnly: true,
                    type: "array",
                  },
                  name: {
                    description:
                      "The name of the resource, provided by the client when initially creating the resource. The resource name must be 1-63 characters long, and comply with RFC1035 <https://www.ietf.org/rfc/rfc1035.txt>. Specifically, the name must be 1-63 characters long and match the regular expression `[a-z]([-a-z0-9]*[a-z0-9])?` which means the first character must be a lowercase letter, and all following characters must be a dash, lowercase letter, or digit, except the last character, which cannot be a dash.",
                    pattern: "[a-z](?:[-a-z0-9]{0,61}[a-z0-9])?",
                    type: "string",
                  },
                  params: {
                    $ref: "#/$defs/ReservationParams",
                    description:
                      "Input only. Additional params passed with the request, but not persisted as part of resource payload.",
                    writeOnly: true,
                  },
                  protectionTier: {
                    description:
                      "Protection tier for the workload which specifies the workload expectations in the event of infrastructure failures at data center (e.g. power and/or cooling failures).",
                    enum: [
                      "CAPACITY_OPTIMIZED",
                      "PROTECTION_TIER_UNSPECIFIED",
                      "STANDARD",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "CAPACITY_OPTIMIZED capacity leverages redundancies (e.g. power, cooling) at the data center during normal operating conditions. In the event of infrastructure failures at data center (e.g. power and/or cooling failures), this workload may be disrupted. As a consequence, it has a weaker availability SLO than STANDARD.",
                      "Unspecified protection tier.",
                      "STANDARD protection for workload that should be protected by redundancies (e.g. power, cooling) at the data center level. In the event of infrastructure failures at data center (e.g. power and/or cooling failures), this workload is expected to continue as normal using the redundancies.",
                    ],
                  },
                  reservationSharingPolicy: {
                    $ref: "#/$defs/ReservationSharingPolicy",
                    description:
                      "Specify the reservation sharing policy. If unspecified, the reservation will not be shared with Google Cloud managed services.",
                  },
                  resourcePolicies: {
                    additionalProperties: { type: "string" },
                    description:
                      "Resource policies to be added to this reservation. The key is defined by user, and the value is resource policy url. This is to define placement policy with reservation.",
                    type: "object",
                  },
                  resourceStatus: {
                    $ref: "#/$defs/ResourceStatus",
                    description:
                      "Output only. [Output Only] Status information for Reservation resource.",
                    readOnly: true,
                  },
                  satisfiesPzs: {
                    description:
                      "Output only. [Output Only] Reserved for future use.",
                    readOnly: true,
                    type: "boolean",
                  },
                  schedulingType: {
                    description: "The type of maintenance for the reservation.",
                    enum: [
                      "GROUPED",
                      "GROUP_MAINTENANCE_TYPE_UNSPECIFIED",
                      "INDEPENDENT",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Maintenance on all reserved instances in the reservation is synchronized.",
                      "Unknown maintenance type.",
                      "Maintenance is not synchronized for this reservation. Instead, each instance has its own maintenance window.",
                    ],
                  },
                  selfLink: {
                    description:
                      "Output only. [Output Only] Server-defined fully-qualified URL for this resource.",
                    readOnly: true,
                    type: "string",
                  },
                  shareSettings: {
                    $ref: "#/$defs/ShareSettings",
                    description:
                      "Specify share-settings to create a shared reservation. This property is optional. For more information about the syntax and options for this field and its subfields, see the guide for creating a shared reservation. <https://cloud.google.com/compute/docs/instances/reservations-shared#creating_a_shared_reservation>",
                  },
                  specificReservation: {
                    $ref: "#/$defs/SpecificSKUReservation",
                    description:
                      "Reservation for instances with specific machine shapes.",
                  },
                  specificReservationRequired: {
                    description:
                      'Indicates whether the reservation can be consumed by VMs with affinity for "any" reservation. If the field is set, then only VMs that target the reservation by name can consume from this reservation.',
                    type: "boolean",
                  },
                  status: {
                    description:
                      "Output only. [Output Only] The status of the reservation. - CREATING: Reservation resources are being allocated. - READY: Reservation resources have been allocated, and the reservation is ready for use. - DELETING: Reservation deletion is in progress. - UPDATING: Reservation update is in progress. ",
                    enum: [
                      "CREATING",
                      "DELETING",
                      "INVALID",
                      "READY",
                      "UPDATING",
                    ],
                    readOnly: true,
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Reservation resources are being allocated.",
                      "Reservation deletion is in progress.",
                      "",
                      "Reservation resources have been allocated, and the reservation is ready for use.",
                      "Reservation update is in progress.",
                    ],
                  },
                  zone: {
                    description:
                      "Zone in which the reservation resides. A zone must be provided if the reservation is created within a commitment.",
                    type: "string",
                  },
                },
                type: "object",
              },
              ReservationParams: {
                description: "Additional reservation params.",
                properties: {
                  resourceManagerTags: {
                    additionalProperties: { type: "string" },
                    description:
                      "Input only. Resource manager tags to be bound to the reservation. Tag keys and values have the same definition as resource manager tags <https://cloud.google.com/resource-manager/docs/tags/tags-overview>. Keys and values can be either in numeric format, such as `tagKeys/{tag_key_id}` and `tagValues/{tag_value_id}` or in namespaced format such as `{org_id|project_id}/{tag_key_short_name}` and `{tag_value_short_name}`. The field is ignored (both PUT & PATCH) when empty.",
                    type: "object",
                    writeOnly: true,
                  },
                },
                type: "object",
              },
              ReservationSharingPolicy: {
                properties: {
                  serviceShareType: {
                    description:
                      "Sharing config for all Google Cloud services.",
                    enum: [
                      "ALLOW_ALL",
                      "DISALLOW_ALL",
                      "SERVICE_SHARE_TYPE_UNSPECIFIED",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Allow all Google Cloud managed services to share reservations.",
                      "[Default] Disallow sharing with all Google Cloud services.",
                      "",
                    ],
                  },
                },
                type: "object",
              },
              ReservedDisk: {
                properties: {
                  diskSizeGb: {
                    description: "Specifies the size of the disk in base-2 GB.",
                    format: "int64",
                    type: "string",
                  },
                  interface: {
                    description:
                      "Specifies the disk interface to use for attaching this disk, which is either SCSI or NVME. The default is SCSI. For performance characteristics of SCSI over NVMe, see Local SSD performance </compute/docs/disks#localssds> .",
                    enum: ["NVME", "SCSI"],
                    type: "string",
                    "x-google-enum-descriptions": ["", ""],
                  },
                },
                type: "object",
              },
              ReservedInstanceProperties: {
                description:
                  "Properties of the SKU instances being reserved. Next ID: 10",
                properties: {
                  guestAccelerators: {
                    description: "Specifies accelerator type and count.",
                    items: { $ref: "#/$defs/AcceleratorConfig" },
                    type: "array",
                  },
                  localSsds: {
                    description:
                      "Specifies amount of local ssd to reserve with each instance. The type of disk is local-ssd.",
                    items: { $ref: "#/$defs/ReservedDisk" },
                    type: "array",
                  },
                  locationHint: {
                    description:
                      "An opaque location hint used to place the allocation close to other resources. This field is for use by internal tools that use the public API.",
                    type: "string",
                  },
                  machineType: {
                    description:
                      "Specifies type of machine (name only) which has fixed number of vCPUs and fixed amount of memory. This also includes specifying custom machine type following custom-NUMBER_OF_CPUS-AMOUNT_OF_MEMORY pattern.",
                    type: "string",
                  },
                  minCpuPlatform: {
                    description: "Minimum cpu platform the reservation.",
                    type: "string",
                  },
                },
                type: "object",
              },
              ReservedResourceInfo: {
                properties: {
                  accelerator: {
                    $ref: "#/$defs/Accelerator",
                    description:
                      "Properties of accelerator resources in this reservation.",
                  },
                },
                type: "object",
              },
              ResourceStatus: {
                description: "[Output Only] Contains output only fields.",
                properties: {
                  healthInfo: {
                    $ref: "#/$defs/HealthInfo",
                    description:
                      "[Output only] Health information for the reservation.",
                  },
                  reservationBlockCount: {
                    description:
                      "The number of reservation blocks associated with this reservation.",
                    format: "int32",
                    type: "integer",
                  },
                  reservationMaintenance: {
                    $ref: "#/$defs/GroupMaintenanceInfo",
                    description: "Maintenance information for this reservation",
                  },
                  specificSkuAllocation: {
                    $ref: "#/$defs/SpecificSKUAllocation",
                    description: "Allocation Properties of this reservation.",
                  },
                },
                type: "object",
              },
              ShareSettings: {
                description:
                  "The share setting for reservations and sole tenancy node groups.",
                properties: {
                  projectMap: {
                    additionalProperties: { $ref: "#/$defs/ProjectConfig" },
                    description:
                      "A map of project id and project config. This is only valid when share_type's value is SPECIFIC_PROJECTS.",
                    type: "object",
                  },
                  shareType: {
                    description: "Type of sharing for this shared-reservation",
                    enum: [
                      "LOCAL",
                      "ORGANIZATION",
                      "SHARE_TYPE_UNSPECIFIED",
                      "SPECIFIC_PROJECTS",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Default value.",
                      "Shared-reservation is open to entire Organization",
                      "Default value. This value is unused.",
                      "Shared-reservation is open to specific projects",
                    ],
                  },
                },
                type: "object",
              },
              SpecificSKUAllocation: {
                description: "Contains Properties set for the reservation.",
                properties: {
                  sourceInstanceTemplateId: {
                    description:
                      "ID of the instance template used to populate reservation properties.",
                    type: "string",
                  },
                  utilizations: {
                    additionalProperties: { format: "int64", type: "string" },
                    description:
                      "Per service utilization breakdown. The Key is the Google Cloud managed service name.",
                    type: "object",
                  },
                },
                type: "object",
              },
              SpecificSKUReservation: {
                description:
                  "This reservation type allows to pre allocate specific instance configuration.",
                properties: {
                  assuredCount: {
                    description:
                      "Output only. [Output Only] Indicates how many instances are actually usable currently.",
                    format: "int64",
                    readOnly: true,
                    type: "string",
                  },
                  count: {
                    description:
                      "Specifies the number of resources that are allocated.",
                    format: "int64",
                    type: "string",
                  },
                  inUseCount: {
                    description:
                      "Output only. [Output Only] Indicates how many instances are in use.",
                    format: "int64",
                    readOnly: true,
                    type: "string",
                  },
                  instanceProperties: {
                    $ref: "#/$defs/ReservedInstanceProperties",
                    description: "The instance properties for the reservation.",
                  },
                  sourceInstanceTemplate: {
                    description:
                      "Specifies the instance template to create the reservation. If you use this field, you must exclude the instanceProperties field. This field is optional, and it can be a full or partial URL. For example, the following are all valid URLs to an instance template: - https://www.googleapis.com/compute/v1/projects/project /global/instanceTemplates/instanceTemplate - projects/project/global/instanceTemplates/instanceTemplate - global/instanceTemplates/instanceTemplate ",
                    type: "string",
                  },
                },
                type: "object",
              },
              UpcomingMaintenance: {
                description: "Upcoming Maintenance notification information.",
                properties: {
                  canReschedule: {
                    description:
                      "Indicates if the maintenance can be customer triggered.",
                    type: "boolean",
                  },
                  latestWindowStartTime: {
                    description:
                      "The latest time for the planned maintenance window to start. This timestamp value is in RFC3339 text format.",
                    type: "string",
                  },
                  maintenanceOnShutdown: {
                    description:
                      "Indicates whether the UpcomingMaintenance will be triggered on VM shutdown.",
                    type: "boolean",
                  },
                  maintenanceReasons: {
                    description:
                      "The reasons for the maintenance. Only valid for vms.",
                    items: {
                      enum: [
                        "FAILURE_DISK",
                        "FAILURE_GPU",
                        "FAILURE_GPU_MULTIPLE_FAULTY_HOSTS_CUSTOMER_REPORTED",
                        "FAILURE_GPU_NVLINK_SWITCH_CUSTOMER_REPORTED",
                        "FAILURE_GPU_TEMPERATURE",
                        "FAILURE_GPU_XID",
                        "FAILURE_INFRA",
                        "FAILURE_INTERFACE",
                        "FAILURE_MEMORY",
                        "FAILURE_NETWORK",
                        "FAILURE_NVLINK",
                        "FAILURE_REDUNDANT_HARDWARE_FAULT",
                        "FAILURE_TPU",
                        "INFRASTRUCTURE_RELOCATION",
                        "MAINTENANCE_REASON_UNKNOWN",
                        "PLANNED_NETWORK_UPDATE",
                        "PLANNED_UPDATE",
                      ],
                      type: "string",
                      "x-google-enum-descriptions": [
                        "Maintenance due to disk errors.",
                        "Maintenance due to GPU errors.",
                        "Maintenance due to customer reported multiple faulty hosts via R&R Subblock API.",
                        "Maintenance due to customer reported NVLink switch failure via R&R Subblock API.",
                        "Maintenance due to high GPU temperature.",
                        "Maintenance due to GPU xid failure.",
                        "Maintenance due to infrastructure errors.",
                        "Maintenance due to interface errors.",
                        "Maintenance due to memory errors.",
                        "Maintenance due to network errors.",
                        "Maintenance due to NVLink failure.",
                        "Maintenance due to redundant hardware fault.",
                        "Maintenance due to TPU errors.",
                        "Maintenance due to infrastructure relocation.",
                        "Unknown maintenance reason. Do not use this value.",
                        "Maintenance due to planned network update.",
                        "Maintenance due to planned update to the instance.",
                      ],
                    },
                    type: "array",
                  },
                  maintenanceStatus: {
                    enum: ["ONGOING", "PENDING", "UNKNOWN"],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "There is ongoing maintenance on this VM.",
                      "There is pending maintenance.",
                      "Unknown maintenance status. Do not use this value.",
                    ],
                  },
                  type: {
                    description: "Defines the type of maintenance.",
                    enum: [
                      "MULTIPLE",
                      "SCHEDULED",
                      "UNKNOWN_TYPE",
                      "UNSCHEDULED",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Multiple maintenance types in one window. This is only intended to be used for groups.",
                      "Scheduled maintenance (e.g. maintenance after uptime guarantee is complete).",
                      "No type specified. Do not use this value.",
                      "Unscheduled maintenance (e.g. emergency maintenance during uptime guarantee).",
                    ],
                  },
                  windowEndTime: {
                    description:
                      "The time by which the maintenance disruption will be completed. This timestamp value is in RFC3339 text format.",
                    type: "string",
                  },
                  windowStartTime: {
                    description:
                      "The current start time of the maintenance window. This timestamp value is in RFC3339 text format.",
                    type: "string",
                  },
                },
                type: "object",
              },
            },
            description:
              "Response message for listing reservations for a region commitment.",
            properties: {
              reservations: {
                description: "The list of reservations.",
                items: { $ref: "#/$defs/Reservation" },
                type: "array",
              },
            },
            type: "object",
          },
        },
        {
          annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true,
            title: "List Snapshots Basic Info",
          },
          description:
            "Lists snapshots in a project providing basic information per snapshot including name, id, status, creation time, disk size, storage bytes, source disk, and source disk id. Requires project as input.\n",
          inputSchema: {
            description: "Request message for listing snapshots basic info.",
            properties: {
              pageSize: {
                description:
                  "Optional. The maximum number of snapshots to return.",
                format: "int32",
                type: "integer",
              },
              pageToken: {
                description:
                  "Optional. A page token received from a previous call to list snapshots.",
                type: "string",
              },
              project: {
                description: "Required. Project ID for this request.",
                type: "string",
              },
            },
            required: ["project"],
            type: "object",
          },
          name: "list_snapshots",
          outputSchema: {
            $defs: {
              SnapshotBasicInfo: {
                description: "Basic information about a snapshot.",
                properties: {
                  createTime: {
                    description: "Creation timestamp of the snapshot.",
                    format: "date-time",
                    type: "string",
                  },
                  diskSizeGb: {
                    description: "Size of the source disk, specified in GB.",
                    format: "int64",
                    type: "string",
                  },
                  id: {
                    description: "The unique identifier for the snapshot.",
                    format: "uint64",
                    type: "string",
                  },
                  name: {
                    description: "Name of the snapshot.",
                    type: "string",
                  },
                  sourceDisk: {
                    description: "The source disk of the snapshot.",
                    type: "string",
                  },
                  sourceDiskId: {
                    description: "The source disk id of the snapshot.",
                    type: "string",
                  },
                  status: {
                    description: "The status of the snapshot.",
                    enum: [
                      "CREATING",
                      "DELETING",
                      "FAILED",
                      "READY",
                      "UPLOADING",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Snapshot creation is in progress.",
                      "Snapshot is currently being deleted.",
                      "Snapshot creation failed.",
                      "Snapshot has been created successfully.",
                      "Snapshot is being uploaded.",
                    ],
                  },
                  storageBytes: {
                    description: "A size of the storage used by the snapshot.",
                    format: "int64",
                    type: "string",
                  },
                },
                type: "object",
              },
            },
            description: "Response message for listing snapshots basic info.",
            properties: {
              nextPageToken: {
                description:
                  "A token that can be sent as `page_token` to retrieve the next page. If this field is omitted, there are no subsequent pages.",
                type: "string",
              },
              snapshots: {
                description: "The list of snapshots.",
                items: { $ref: "#/$defs/SnapshotBasicInfo" },
                type: "array",
              },
            },
            type: "object",
          },
        },
      ];
    }

    if (mcpEndpointUrl.includes("cloudresourcemanager.googleapis.com")) {
      return [
        {
          annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
            readOnlyHint: true,
          },
          description:
            "Searches for Google Cloud projects. This tool may be used whenever any tools or conversation context requires a GCP project. A SearchProjects call with an empty query will return all projects the user has access to, which can be used to determine a curated list of projects. The tool can find projects by parent (e.g., 'parent:folders/223'), project ID (e.g., 'projectId:my-project-id'), or other filters.",
          inputSchema: {
            description: "The request sent to the SearchProjects method.",
            properties: {
              pageSize: {
                description:
                  "Optional. The maximum number of projects to return in the response. The server can return fewer projects than requested. If unspecified, server picks an appropriate default.",
                format: "int32",
                type: "integer",
              },
              pageToken: {
                description:
                  "Optional. A pagination token returned from a previous call to ListProjects that indicates from where listing should continue.",
                type: "string",
              },
              query: {
                description:
                  "Optional. A query string for searching for projects that the caller has `resourcemanager.projects.get` permission to. If multiple fields are included in the query, then it will return results that match any of the fields. Some eligible fields are: ``` | Field | Description | |-------------------------|----------------------------------------------| | displayName, name | Filters by displayName. | | parent | Project's parent (for example: folders/123, organizations/*). Prefer parent field over parent.type and parent.id.| | parent.type | Parent's type: `folder` or `organization`. | | parent.id | Parent's id number (for example: 123) | | id, projectId | Filters by projectId. | | state, lifecycleState | Filters by state. | | labels | Filters by label name or value. | | labels.\\ (where *key* is the name of a label) | Filters by label name.| ``` Search expressions are case insensitive. Some examples queries: ``` | Query | Description | |------------------|-----------------------------------------------------| | name:how* | The project's name starts with \"how\". | | name:Howl | The project's name is `Howl` or `howl`. | | name:HOWL | Equivalent to above. | | NAME:howl | Equivalent to above. | | labels.color:* | The project has the label `color`. | | labels.color:red | The project's label `color` has the value `red`. | | labels.color:red labels.size:big | The project's label `color` has the value `red` or its label `size` has the value `big`. | ``` If no query is specified, the call will return projects for which the user has the `resourcemanager.projects.get` permission.",
                type: "string",
              },
            },
            type: "object",
          },
          name: "search_projects",
          outputSchema: {
            $defs: {
              Project: {
                description:
                  "A project is a high-level Google Cloud entity. It is a container for ACLs, APIs, App Engine Apps, VMs, and other Google Cloud Platform resources.",
                properties: {
                  configuredCapabilities: {
                    description:
                      "Output only. If this project is a Management Project, list of capabilities configured on the parent folder. Note, presence of any capability implies that this is a Management Project. Example: `folders/123/capabilities/app-management`. OUTPUT ONLY.",
                    items: { type: "string" },
                    readOnly: true,
                    type: "array",
                  },
                  createTime: {
                    description: "Output only. Creation time.",
                    format: "date-time",
                    readOnly: true,
                    type: "string",
                  },
                  deleteTime: {
                    description:
                      "Output only. The time at which this resource was requested for deletion.",
                    format: "date-time",
                    readOnly: true,
                    type: "string",
                  },
                  displayName: {
                    description:
                      "Optional. A user-assigned display name of the project. When present it must be between 4 to 30 characters. Allowed characters are: lowercase and uppercase letters, numbers, hyphen, single-quote, double-quote, space, and exclamation point. Example: `My Project`",
                    type: "string",
                  },
                  etag: {
                    description:
                      "Output only. A checksum computed by the server based on the current value of the Project resource. This may be sent on update and delete requests to ensure the client has an up-to-date value before proceeding.",
                    readOnly: true,
                    type: "string",
                  },
                  labels: {
                    additionalProperties: { type: "string" },
                    description:
                      'Optional. The labels associated with this project. Label keys must be between 1 and 63 characters long and must conform to the following regular expression: \\[a-z\\](\\[-a-z0-9\\]*\\[a-z0-9\\])?. Label values must be between 0 and 63 characters long and must conform to the regular expression (\\[a-z\\](\\[-a-z0-9\\]*\\[a-z0-9\\])?)?. No more than 64 labels can be associated with a given resource. Clients should store labels in a representation such as JSON that does not depend on specific characters being disallowed. Example: `"myBusinessDimension" : "businessValue"`',
                    type: "object",
                  },
                  name: {
                    description:
                      'Output only. The unique resource name of the project. It is an int64 generated number prefixed by "projects/". Example: `projects/415104041262`',
                    readOnly: true,
                    type: "string",
                  },
                  parent: {
                    description:
                      "Optional. A reference to a parent Resource. eg., `organizations/123` or `folders/876`.",
                    type: "string",
                  },
                  projectId: {
                    description:
                      "Immutable. The unique, user-assigned id of the project. It must be 6 to 30 lowercase ASCII letters, digits, or hyphens. It must start with a letter. Trailing hyphens are prohibited. Example: `tokyo-rain-123`",
                    type: "string",
                    "x-google-immutable": true,
                  },
                  state: {
                    description: "Output only. The project lifecycle state.",
                    enum: ["STATE_UNSPECIFIED", "ACTIVE", "DELETE_REQUESTED"],
                    readOnly: true,
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Unspecified state. This is only used/useful for distinguishing unset values.",
                      "The normal and active state.",
                      "The project has been marked for deletion by the user (by invoking DeleteProject) or by the system (Google Cloud Platform). This can generally be reversed by invoking UndeleteProject.",
                    ],
                  },
                  tags: {
                    additionalProperties: { type: "string" },
                    description:
                      'Optional. Input only. Immutable. Tag keys/values directly bound to this project. Each item in the map must be expressed as " : ". For example: "123/environment" : "production", "123/costCenter" : "marketing" Note: Currently this field is in Preview.',
                    type: "object",
                    writeOnly: true,
                    "x-google-immutable": true,
                  },
                  updateTime: {
                    description:
                      "Output only. The most recent time this resource was modified.",
                    format: "date-time",
                    readOnly: true,
                    type: "string",
                  },
                },
                type: "object",
              },
            },
            description:
              "A page of the response received from the SearchProjects method. A paginated response where more pages are available has `next_page_token` set. This token can be used in a subsequent request to retrieve the next request page.",
            properties: {
              nextPageToken: {
                description:
                  "Pagination token. If the result set is too large to fit in a single response, this token is returned. It encodes the position of the current result cursor. Feeding this value into a new list request with the `page_token` parameter gives the next page of the results. When `next_page_token` is not filled in, there is no next page and the list returned is the last page in the result set. Pagination tokens have a limited lifetime.",
                type: "string",
              },
              projects: {
                description:
                  "The list of Projects that matched the list filter query. This list can be paginated.",
                items: { $ref: "#/$defs/Project" },
                type: "array",
              },
            },
            type: "object",
          },
        },
      ];
    }

    if (mcpEndpointUrl.includes("maps.googleapis.com")) {
      return [
        {
          annotations: {
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
            readOnlyHint: true,
          },
          description:
            '\nCall this tool when the user\'s request is to find places, businesses, addresses, locations, points of interest, or any other Google Maps related search.\n\n**Input Requirements (CRITICAL):**\n\n1.  **`text_query` (string - MANDATORY):** The primary search query. This must clearly define what the user is looking for.\n\n    *   **Examples:** `\'restaurants in New York\'`, `\'coffee shops near Golden Gate Park\'`, `\'SF MoMA\'`, `\'1600 Amphitheatre Pkwy, Mountain View, CA, USA\'`, `\'pets friendly parks in Manhattan, New York\'`, `\'date night restaurants in Chicago\'`, `\'accessible public libraries in Los Angeles\'`.\n\n    *   **For specific place details:** Include the requested attribute (e.g., `\'Google Store Mountain View opening hours\'`, `\'SF MoMa phone number\'`, `\'Shoreline Park Mountain View address\'`).\n\n2.  **`location_bias` (object - OPTIONAL):** Use this to prioritize results near a specific geographic area.\n    *   **Format:** `{"location_bias": {"circle": {"center": {"latitude": [value], "longitude": [value]}, "radius_meters": [value (optional)]}}}`\n\n    *   **Usage:**\n        *   **To bias to a 5km radius:** `{"location_bias": {"circle": {"center": {"latitude": 34.052235, "longitude": -118.243683}, "radius_meters": 5000}}}`\n        *   **To bias strongly to the center point:** `{"location_bias": {"circle": {"center": {"latitude": 34.052235, "longitude": -118.243683}}}}` (omitting `radius_meters`).\n\n3. **`language_code` (string - OPTIONAL):** The language to show the search results summary in.\n    *   **Format:** A two-letter language code (ISO 639-1), optionally followed by an underscore and a two-letter country code (ISO 3166-1 alpha-2), e.g., `en`, `ja`, `en_US`, `zh_CN`, `es_MX`. If the language code is not provided, the results will be in English.\n\n4. **`region_code` (string - OPTIONAL):** The Unicode CLDR region code of the user. This parameter is used to display the place details, like region-specific place name, if available. The parameter canaffect results based on applicable law.\n    *   **Format:** A two-letter country code (ISO 3166-1 alpha-2), e.g., `US`, `CA`.\n\n**Instructions for Tool Call:**\n\n*   Location Information (CRITICAL): The search must contain sufficient location information. If the location is ambiguous (e.g., just "pizza places"), *you must* specify it in the `text_query` (e.g., "pizza places in New York") or use the `location_bias` parameter. Include city, state/province, and region/country name if needed for disambiguation.\n\n*   Always provide the most specific and contextually rich `text_query` possible.\n\n*   Only use `location_bias` if coordinates are explicitly provided or if inferring a location from a user\'s known context is appropriate *and* necessary for better results.\n',
          inputSchema: {
            $defs: {
              Circle: {
                description: "A circle defined by center point and radius.",
                properties: {
                  center: {
                    $ref: "#/$defs/LatLng",
                    description: "Required. The center point of the circle.",
                  },
                  radiusMeters: {
                    description:
                      "The radius of the circle in meters. The radius must be within 50,000 meters.",
                    format: "double",
                    type: "number",
                  },
                },
                required: ["center"],
                type: "object",
              },
              LatLng: {
                description:
                  "An object that represents a latitude/longitude pair. This is expressed as a pair of doubles to represent degrees latitude and degrees longitude. Unless specified otherwise, this object must conform to the WGS84 standard <https://en.wikipedia.org/wiki/World_Geodetic_System#1984_version>. Values must be within normalized ranges.",
                properties: {
                  latitude: {
                    description:
                      "The latitude in degrees. It must be in the range [-90.0, +90.0].",
                    format: "double",
                    type: "number",
                  },
                  longitude: {
                    description:
                      "The longitude in degrees. It must be in the range [-180.0, +180.0].",
                    format: "double",
                    type: "number",
                  },
                },
                type: "object",
              },
              LocationBias: {
                description:
                  "The region to bias the search results to. Places outside of this region may still be returned.",
                properties: {
                  circle: {
                    $ref: "#/$defs/Circle",
                    description:
                      "Optional. A circle defined by center point and radius. The `radius_meters` is optional. If not set, the results will be biased towards the center point.",
                  },
                },
                type: "object",
              },
            },
            description: "Request message for SearchText.",
            properties: {
              languageCode: {
                description:
                  'Optional. The language to request that the summary is returned in. If the language code is unspecified or unrecognized, the summary with a preference for English will be returned. For example, "en" for English. Current list of supported languages: https://developers.google.com/maps/faq#languagesupport.',
                type: "string",
              },
              locationBias: {
                $ref: "#/$defs/LocationBias",
                description:
                  "An optional region to bias the search results to. If an explicit location is in `text_query`, it will be used to bias the search results instead of this field.",
              },
              regionCode: {
                description:
                  'Optional. The Unicode country/region code (CLDR) of the location where the request is coming from. This parameter is used to display the place details, like region-specific place name, if available. The parameter can affect results based on applicable law. For example, "US" for United States. For more information, see https://www.unicode.org/cldr/charts/latest/supplemental/territory_language_information.html. Note that 3-digit region codes are not currently supported.',
                type: "string",
              },
              textQuery: {
                description: "Required. The text query.",
                type: "string",
              },
            },
            required: ["textQuery"],
            type: "object",
          },
          name: "search_places",
          outputSchema: {
            $defs: {
              GoogleMapsLinks: {
                description: "Links to trigger different Google Maps actions.",
                properties: {
                  directionsUrl: {
                    description:
                      "A link to show the directions to the place. The link only populates the destination location and uses the default travel mode `DRIVE`.",
                    type: "string",
                  },
                  photosUrl: {
                    description:
                      "A link to show photos of this place on Google Maps.",
                    type: "string",
                  },
                  placeUrl: {
                    description: "A link to show this place.",
                    type: "string",
                  },
                  reviewsUrl: {
                    description:
                      "A link to show reviews of this place on Google Maps.",
                    type: "string",
                  },
                  writeAReviewUrl: {
                    description:
                      "A link to write a review for this place on Google Maps.",
                    type: "string",
                  },
                },
                type: "object",
              },
              LatLng: {
                description:
                  "An object that represents a latitude/longitude pair. This is expressed as a pair of doubles to represent degrees latitude and degrees longitude. Unless specified otherwise, this object must conform to the WGS84 standard <https://en.wikipedia.org/wiki/World_Geodetic_System#1984_version>. Values must be within normalized ranges.",
                properties: {
                  latitude: {
                    description:
                      "The latitude in degrees. It must be in the range [-90.0, +90.0].",
                    format: "double",
                    type: "number",
                  },
                  longitude: {
                    description:
                      "The longitude in degrees. It must be in the range [-180.0, +180.0].",
                    format: "double",
                    type: "number",
                  },
                },
                type: "object",
              },
              PlaceView: {
                description: "A view of a place.",
                properties: {
                  googleMapsLinks: {
                    $ref: "#/$defs/GoogleMapsLinks",
                    description:
                      "Links to trigger different Google Maps actions.",
                  },
                  id: {
                    description: "The place ID of the underlying place.",
                    type: "string",
                  },
                  location: {
                    $ref: "#/$defs/LatLng",
                    description: "The position of this place.",
                  },
                  place: {
                    description:
                      'The resource name of the underlying place, in the format of "places/{id}".',
                    type: "string",
                  },
                },
                type: "object",
              },
            },
            description: "Response message for SearchText.",
            properties: {
              places: {
                description:
                  "Output only. The list of places that are mentioned in the summary.",
                items: { $ref: "#/$defs/PlaceView" },
                readOnly: true,
                type: "array",
              },
              summary: {
                description:
                  'Output only. A natural language summary of the search results. The summary may contain zero-based citations like "[0]", "[1]", "[2]" etc. These citations map to the corresponding places in the `places` field.',
                readOnly: true,
                type: "string",
              },
            },
            type: "object",
          },
        },
        {
          annotations: {
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
            readOnlyHint: true,
          },
          description:
            'Retrieves comprehensive weather data including current conditions, hourly, and daily forecasts.\n**Specific Data Available:** Temperature (Current, Feels Like, Max/Min, Heat Index), Wind (Speed, Gusts, Direction), Celestial Events (Sunrise/Sunset, Moon Phase), Precipitation (Type, Probability, Quantity/QPF), Atmospheric Conditions (UV Index, Humidity, Cloud Cover, Thunderstorm Probability), and Geocoded Location Address.\n**Location & Location Rules (CRITICAL):**\nThe location for which weather data is requested is specified using the \'location\' field.\nThis field is a \'oneof\' structure, meaning you MUST provide a value for ONLY ONE\nof the three location sub-fields below to ensure an accurate weather data lookup.\n1. Geographic Coordinates (lat_lng)\n  * Use it when you are provided with exact lat/lng coordinates.\n  * Example:\n    "lat_lng": { "latitude": 34.0522, "longitude": -118.2437 } // Los Angeles\n2. Place ID (place_id)\n  * An unambiguous string identifier (Google Maps Place ID).\n  * The place_id can be fetched from the search_places tool.\n  * Example:\n    "place_id": "ChIJLU7jZClu5kcR4PcOOO6p3I0" // Eiffel Tower\n3. Address String (address)\n  * A free-form string that requires specificity for geocoding.\n  * City & Region: Always include region/country (e.g., "London, UK", not "London").\n  * Street Address: Provide the full address (e.g., "1600 Pennsylvania Ave NW, Washington, DC").\n  * Postal/Zip Codes: MUST be accompanied by a country name (e.g., "90210, USA", NOT "90210").\n**Usage Modes:**\n1.  **Current Weather:** Provide `address` only. Do not specify `date` and `hour`.\n2.  **Hourly Forecast:** Provide `address`, `date`, and `hour` (0-23). Use for specific times (e.g., "at 5 PM") or terms like \'next few hours\' or \'later today.\'. If the user specifies minute, round down to the nearest hour. Hourly forecast beyond 48 hours from now is not supported.\n3.  **Daily Forecast:** Provide `address` and `date`. Do not specify `hour`. Use for general day requests (e.g., "weather for tomorrow", "weather on Friday", "weather on 12/25"). If today\'s date is not in the context, you should clarify it with the user. Daily forecast beyond 7 days including today is not supported. Historical weather is not supported.\n**Parameter Constraints:**\n*   **Timezones:** All `date` and `hour` inputs must be relative to the **location\'s local time zone**, not the user\'s time zone.\n*   **Date Format:** Inputs must be separated into `{year, month, day}` integers.\n*   **Units:** Defaults to `METRIC`. Set `units_system` to `IMPERIAL` for Fahrenheit/Miles if the user implies US standards or explicitly requests it.\n',
          inputSchema: {
            $defs: {
              Date: {
                description:
                  "Represents a whole or partial calendar date, such as a birthday. The time of day and time zone are either specified elsewhere or are insignificant. The date is relative to the Gregorian Calendar. This can represent one of the following: * A full date, with non-zero year, month, and day values. * A month and day, with a zero year (for example, an anniversary). * A year on its own, with a zero month and a zero day. * A year and month, with a zero day (for example, a credit card expiration date). Related types: * google.type.TimeOfDay * google.type.DateTime * google.protobuf.Timestamp",
                properties: {
                  day: {
                    description:
                      "Day of a month. Must be from 1 to 31 and valid for the year and month, or 0 to specify a year by itself or a year and month where the day isn't significant.",
                    format: "int32",
                    type: "integer",
                  },
                  month: {
                    description:
                      "Month of a year. Must be from 1 to 12, or 0 to specify a year without a month and day.",
                    format: "int32",
                    type: "integer",
                  },
                  year: {
                    description:
                      "Year of the date. Must be from 1 to 9999, or 0 to specify a date without a year.",
                    format: "int32",
                    type: "integer",
                  },
                },
                type: "object",
              },
              LatLng: {
                description:
                  "An object that represents a latitude/longitude pair. This is expressed as a pair of doubles to represent degrees latitude and degrees longitude. Unless specified otherwise, this object must conform to the WGS84 standard <https://en.wikipedia.org/wiki/World_Geodetic_System#1984_version>. Values must be within normalized ranges.",
                properties: {
                  latitude: {
                    description:
                      "The latitude in degrees. It must be in the range [-90.0, +90.0].",
                    format: "double",
                    type: "number",
                  },
                  longitude: {
                    description:
                      "The longitude in degrees. It must be in the range [-180.0, +180.0].",
                    format: "double",
                    type: "number",
                  },
                },
                type: "object",
              },
              Location: {
                description: "Represents a location for the weather request.",
                properties: {
                  address: {
                    description:
                      "Human readable address or a plus code. See https://plus.codes for details.",
                    type: "string",
                  },
                  latLng: {
                    $ref: "#/$defs/LatLng",
                    description:
                      "A point specified using geographic coordinates.",
                  },
                  placeId: {
                    description: "The Place ID associated with the location .",
                    type: "string",
                  },
                },
                type: "object",
              },
            },
            description:
              "Request for the LookupWeather method - represents the weather conditions at the requested location.",
            properties: {
              date: {
                $ref: "#/$defs/Date",
                description:
                  "Optional. The date of the required weather information. Note: This date is relative to the local timezone of the location specified in the location field. The date must be within the next 7 days.",
              },
              hour: {
                description:
                  "Optional. The hour of the requested weather information, in 24-hour format (0-23). This value is relative to the local timezone of the location specified in the location field. Hourly forecast is only supported for the next 48 hours from the current time.",
                format: "int32",
                type: "integer",
              },
              location: {
                $ref: "#/$defs/Location",
                description:
                  "Required. The location to get the weather conditions for.",
              },
              unitsSystem: {
                description:
                  "Optional. The units system to use for the returned weather conditions. If not provided, the returned weather conditions will be in the metric system (default = METRIC).",
                enum: ["UNITS_SYSTEM_UNSPECIFIED", "IMPERIAL", "METRIC"],
                type: "string",
                "x-google-enum-descriptions": [
                  "The units system is unspecified.",
                  "The imperial units system (e.g. Fahrenheit, miles, etc).",
                  "The metric units system (e.g. Celsius, kilometers, etc).",
                ],
              },
            },
            required: ["location"],
            type: "object",
          },
          name: "lookup_weather",
          outputSchema: {
            $defs: {
              AirPressure: {
                description:
                  "Represents the atmospheric air pressure conditions.",
                properties: {
                  meanSeaLevelMillibars: {
                    description:
                      "The mean sea level air pressure in millibars.",
                    format: "float",
                    type: "number",
                  },
                },
                type: "object",
              },
              LatLng: {
                description:
                  "An object that represents a latitude/longitude pair. This is expressed as a pair of doubles to represent degrees latitude and degrees longitude. Unless specified otherwise, this object must conform to the WGS84 standard <https://en.wikipedia.org/wiki/World_Geodetic_System#1984_version>. Values must be within normalized ranges.",
                properties: {
                  latitude: {
                    description:
                      "The latitude in degrees. It must be in the range [-90.0, +90.0].",
                    format: "double",
                    type: "number",
                  },
                  longitude: {
                    description:
                      "The longitude in degrees. It must be in the range [-180.0, +180.0].",
                    format: "double",
                    type: "number",
                  },
                },
                type: "object",
              },
              LocalizedText: {
                description:
                  "Localized variant of a text in a particular language.",
                properties: {
                  languageCode: {
                    description:
                      'The text\'s BCP-47 language code, such as "en-US" or "sr-Latn". For more information, see http://www.unicode.org/reports/tr35/#Unicode_locale_identifier.',
                    type: "string",
                  },
                  text: {
                    description:
                      "Localized string in the language corresponding to language_code below.",
                    type: "string",
                  },
                },
                type: "object",
              },
              Location: {
                description: "Represents a location for the weather request.",
                properties: {
                  address: {
                    description:
                      "Human readable address or a plus code. See https://plus.codes for details.",
                    type: "string",
                  },
                  latLng: {
                    $ref: "#/$defs/LatLng",
                    description:
                      "A point specified using geographic coordinates.",
                  },
                  placeId: {
                    description: "The Place ID associated with the location .",
                    type: "string",
                  },
                },
                type: "object",
              },
              MoonEvents: {
                description:
                  "Represents the events related to the moon (e.g. moonrise, moonset).",
                properties: {
                  moonPhase: {
                    description: "The moon phase (a.k.a. lunar phase).",
                    enum: [
                      "MOON_PHASE_UNSPECIFIED",
                      "NEW_MOON",
                      "WAXING_CRESCENT",
                      "FIRST_QUARTER",
                      "WAXING_GIBBOUS",
                      "FULL_MOON",
                      "WANING_GIBBOUS",
                      "LAST_QUARTER",
                      "WANING_CRESCENT",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Unspecified moon phase.",
                      "The moon is not illuminated by the sun.",
                      "The moon is lit by 0%-50% on its right side in the northern hemisphere \ud83c\udf12 and on its left side in the southern hemisphere \ud83c\udf18.",
                      "The moon is lit by 50.1% on its right side in the northern hemisphere \ud83c\udf13 and on its left side in the southern hemisphere \ud83c\udf17.",
                      "The moon is lit by 50%-100% on its right side in the northern hemisphere \ud83c\udf14 and on its left side in the southern hemisphere \ud83c\udf16.",
                      "The moon is fully illuminated.",
                      "The moon is lit by 50%-100% on its left side in the northern hemisphere \ud83c\udf16 and on its right side in the southern hemisphere \ud83c\udf14.",
                      "The moon is lit by 50.1% on its left side in the northern hemisphere \ud83c\udf17 and on its right side in the southern hemisphere \ud83c\udf13.",
                      "The moon is lit by 0%-50% on its left side in the northern hemisphere \ud83c\udf18 and on its right side in the southern hemisphere \ud83c\udf12.",
                    ],
                  },
                  moonriseTimes: {
                    description:
                      "The time when the upper limb of the moon appears above the horizon (see https://en.wikipedia.org/wiki/Moonrise_and_moonset). NOTE: For most cases, there'll be a single moon rise time per day. In other cases, the list might be empty (e.g. when the moon rises after next day midnight). However, in unique cases (e.g. in polar regions), the list may contain more than one value. In these cases, the values are sorted in ascending order.",
                    items: { format: "date-time", type: "string" },
                    type: "array",
                  },
                  moonsetTimes: {
                    description:
                      "The time when the upper limb of the moon disappears below the horizon (see https://en.wikipedia.org/wiki/Moonrise_and_moonset). NOTE: For most cases, there'll be a single moon set time per day. In other cases, the list might be empty (e.g. when the moon sets after next day midnight). However, in unique cases (e.g. in polar regions), the list may contain more than one value. In these cases, the values are sorted in ascending order.",
                    items: { format: "date-time", type: "string" },
                    type: "array",
                  },
                },
                type: "object",
              },
              Precipitation: {
                description:
                  "Represents a set of precipitation values at a given location.",
                properties: {
                  probability: {
                    $ref: "#/$defs/PrecipitationProbability",
                    description:
                      "The probability of precipitation (values from 0 to 100).",
                  },
                  qpf: {
                    $ref: "#/$defs/QuantitativePrecipitationForecast",
                    description:
                      "The amount of precipitation rain, measured as liquid water equivalent, that has accumulated over a period of time. Note: QPF is an abbreviation for Quantitative Precipitation Forecast (please see the QuantitativePrecipitationForecast definition for more details).",
                  },
                  snowQpf: {
                    $ref: "#/$defs/QuantitativePrecipitationForecast",
                    description:
                      "The amount of snow, measured as liquid water equivalent, that has accumulated over a period of time. Note: QPF is an abbreviation for Quantitative Precipitation Forecast (please see the QuantitativePrecipitationForecast definition for more details).",
                  },
                },
                type: "object",
              },
              PrecipitationProbability: {
                description:
                  "Represents the probability of precipitation at a given location.",
                properties: {
                  percent: {
                    description:
                      "A percentage from 0 to 100 that indicates the chances of precipitation.",
                    format: "int32",
                    type: "integer",
                  },
                  type: {
                    description:
                      "A code that indicates the type of precipitation.",
                    enum: [
                      "PRECIPITATION_TYPE_UNSPECIFIED",
                      "NONE",
                      "SNOW",
                      "RAIN",
                      "LIGHT_RAIN",
                      "HEAVY_RAIN",
                      "RAIN_AND_SNOW",
                      "SLEET",
                      "FREEZING_RAIN",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Unspecified precipitation type.",
                      "No precipitation.",
                      "Snow precipitation.",
                      "Rain precipitation.",
                      "Light rain precipitation.",
                      "Heavy rain precipitation.",
                      "Both rain and snow precipitations.",
                      "Sleet precipitation.",
                      "Freezing rain precipitation.",
                    ],
                  },
                },
                type: "object",
              },
              QuantitativePrecipitationForecast: {
                description:
                  "Represents the expected amount of melted precipitation accumulated over a specified time period over a specified area (reference: https://en.wikipedia.org/wiki/Quantitative_precipitation_forecast) - usually abbreviated QPF for short.",
                properties: {
                  quantity: {
                    description:
                      "The amount of precipitation, measured as liquid water equivalent, that has accumulated over a period of time.",
                    format: "float",
                    type: "number",
                  },
                  unit: {
                    description:
                      "The code of the unit used to measure the amount of accumulated precipitation.",
                    enum: ["UNIT_UNSPECIFIED", "MILLIMETERS", "INCHES"],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "Unspecified precipitation unit.",
                      "The amount of precipitation is measured in millimeters.",
                      "The amount of precipitation is measured in inches.",
                    ],
                  },
                },
                type: "object",
              },
              SunEvents: {
                description:
                  "Represents the events related to the sun (e.g. sunrise, sunset).",
                properties: {
                  sunriseTime: {
                    description:
                      "The time when the sun rises. NOTE: In some unique cases (e.g. north of the artic circle) there may be no sunrise time for a day. In these cases, this field will be unset.",
                    format: "date-time",
                    type: "string",
                  },
                  sunsetTime: {
                    description:
                      "The time when the sun sets. NOTE: In some unique cases (e.g. north of the artic circle) there may be no sunset time for a day. In these cases, this field will be unset.",
                    format: "date-time",
                    type: "string",
                  },
                },
                type: "object",
              },
              Temperature: {
                description: "Represents a temperature value.",
                properties: {
                  degrees: {
                    description:
                      "The temperature value (in degrees) in the specified unit.",
                    format: "float",
                    type: "number",
                  },
                  unit: {
                    description:
                      "The code for the unit used to measure the temperature value.",
                    enum: [
                      "TEMPERATURE_UNIT_UNSPECIFIED",
                      "CELSIUS",
                      "FAHRENHEIT",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "The temperature unit is unspecified.",
                      "The temperature is measured in Celsius.",
                      "The temperature is measured in Fahrenheit.",
                    ],
                  },
                },
                type: "object",
              },
              WeatherCondition: {
                description:
                  "Represents a weather condition for a given location at a given period of time. Disclaimer: Weather icons and condition codes are subject to change. Google may introduce new codes and icons or update existing ones as needed. We encourage you to refer to this documentation regularly for the most up-to-date information.",
                properties: {
                  description: {
                    $ref: "#/$defs/LocalizedText",
                    description:
                      "The textual description for this weather condition (localized).",
                  },
                  iconBaseUri: {
                    description:
                      'The base URI for the icon not including the file type extension. To display the icon, append a theme if desired and the file type extension (`.png` or `.svg`) to this URI. By default, the icon is light themed, but `_dark` can be appended for dark mode. For example: "https://maps.gstatic.com/weather/v1/dust.svg" or "https://maps.gstatic.com/weather/v1/dust_dark.svg", where `icon_base_uri` is "https://maps.gstatic.com/weather/v1/dust".',
                    type: "string",
                  },
                  type: {
                    description: "The type of weather condition.",
                    enum: [
                      "TYPE_UNSPECIFIED",
                      "CLEAR",
                      "MOSTLY_CLEAR",
                      "PARTLY_CLOUDY",
                      "MOSTLY_CLOUDY",
                      "CLOUDY",
                      "WINDY",
                      "WIND_AND_RAIN",
                      "LIGHT_RAIN_SHOWERS",
                      "CHANCE_OF_SHOWERS",
                      "SCATTERED_SHOWERS",
                      "RAIN_SHOWERS",
                      "HEAVY_RAIN_SHOWERS",
                      "LIGHT_TO_MODERATE_RAIN",
                      "MODERATE_TO_HEAVY_RAIN",
                      "RAIN",
                      "LIGHT_RAIN",
                      "HEAVY_RAIN",
                      "RAIN_PERIODICALLY_HEAVY",
                      "LIGHT_SNOW_SHOWERS",
                      "CHANCE_OF_SNOW_SHOWERS",
                      "SCATTERED_SNOW_SHOWERS",
                      "SNOW_SHOWERS",
                      "HEAVY_SNOW_SHOWERS",
                      "LIGHT_TO_MODERATE_SNOW",
                      "MODERATE_TO_HEAVY_SNOW",
                      "SNOW",
                      "LIGHT_SNOW",
                      "HEAVY_SNOW",
                      "SNOWSTORM",
                      "SNOW_PERIODICALLY_HEAVY",
                      "HEAVY_SNOW_STORM",
                      "BLOWING_SNOW",
                      "RAIN_AND_SNOW",
                      "HAIL",
                      "HAIL_SHOWERS",
                      "THUNDERSTORM",
                      "THUNDERSHOWER",
                      "LIGHT_THUNDERSTORM_RAIN",
                      "SCATTERED_THUNDERSTORMS",
                      "HEAVY_THUNDERSTORM",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "The weather condition is unspecified.",
                      "No clouds.",
                      "Periodic clouds.",
                      "Party cloudy (some clouds).",
                      "Mostly cloudy (more clouds than sun).",
                      "Cloudy (all clouds, no sun).",
                      "High wind.",
                      "High wind with precipitation.",
                      "Light intermittent rain.",
                      "Chance of intermittent rain.",
                      "Intermittent rain.",
                      "Showers are considered to be rainfall that has a shorter duration than rain, and is characterized by suddenness in terms of start and stop times, and rapid changes in intensity.",
                      "Intense showers.",
                      "Rain (light to moderate in quantity).",
                      "Rain (moderate to heavy in quantity).",
                      "Moderate rain.",
                      "Light rain.",
                      "Heavy rain.",
                      "Rain periodically heavy.",
                      "Light snow that is falling at varying intensities for brief periods of time.",
                      "Chance of snow showers.",
                      "Snow that is falling at varying intensities for brief periods of time.",
                      "Snow showers.",
                      "Heavy snow showers.",
                      "Light to moderate snow.",
                      "Moderate to heavy snow.",
                      "Moderate snow.",
                      "Light snow.",
                      "Heavy snow.",
                      "Snow with possible thunder and lightning.",
                      "Snow, at times heavy.",
                      "Heavy snow with possible thunder and lightning.",
                      "Snow with intense wind.",
                      "Rain and snow mix.",
                      "Hail.",
                      "Hail that is falling at varying intensities for brief periods of time.",
                      "Thunderstorm.",
                      "A shower of rain accompanied by thunder and lightning.",
                      "Light thunderstorm rain.",
                      "Thunderstorms that has rain in various intensities for brief periods of time.",
                      "Heavy thunderstorm.",
                    ],
                  },
                },
                type: "object",
              },
              Wind: {
                description: "Represents a set of wind properties.",
                properties: {
                  direction: {
                    $ref: "#/$defs/WindDirection",
                    description:
                      "The direction of the wind, the angle it is coming from.",
                  },
                  gust: {
                    $ref: "#/$defs/WindSpeed",
                    description:
                      "The wind gust (sudden increase in the wind speed).",
                  },
                  speed: {
                    $ref: "#/$defs/WindSpeed",
                    description: "The speed of the wind.",
                  },
                },
                type: "object",
              },
              WindDirection: {
                description:
                  "Represents the direction from which the wind originates.",
                properties: {
                  cardinal: {
                    description:
                      "The code that represents the cardinal direction from which the wind is blowing.",
                    enum: [
                      "CARDINAL_DIRECTION_UNSPECIFIED",
                      "NORTH",
                      "NORTH_NORTHEAST",
                      "NORTHEAST",
                      "EAST_NORTHEAST",
                      "EAST",
                      "EAST_SOUTHEAST",
                      "SOUTHEAST",
                      "SOUTH_SOUTHEAST",
                      "SOUTH",
                      "SOUTH_SOUTHWEST",
                      "SOUTHWEST",
                      "WEST_SOUTHWEST",
                      "WEST",
                      "WEST_NORTHWEST",
                      "NORTHWEST",
                      "NORTH_NORTHWEST",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "The cardinal direction is unspecified.",
                      "The north cardinal direction.",
                      "The north-northeast secondary intercardinal direction.",
                      "The northeast intercardinal direction.",
                      "The east-northeast secondary intercardinal direction.",
                      "The east cardinal direction.",
                      "The east-southeast secondary intercardinal direction.",
                      "The southeast intercardinal direction.",
                      "The south-southeast secondary intercardinal direction.",
                      "The south cardinal direction.",
                      "The south-southwest secondary intercardinal direction.",
                      "The southwest intercardinal direction.",
                      "The west-southwest secondary intercardinal direction.",
                      "The west cardinal direction.",
                      "The west-northwest secondary intercardinal direction.",
                      "The northwest intercardinal direction.",
                      "The north-northwest secondary intercardinal direction.",
                    ],
                  },
                  degrees: {
                    description:
                      "The direction of the wind in degrees (values from 0 to 360).",
                    format: "int32",
                    type: "integer",
                  },
                },
                type: "object",
              },
              WindSpeed: {
                description: "Represents the speed of the wind.",
                properties: {
                  unit: {
                    description:
                      "The code that represents the unit used to measure the wind speed.",
                    enum: [
                      "SPEED_UNIT_UNSPECIFIED",
                      "KILOMETERS_PER_HOUR",
                      "MILES_PER_HOUR",
                    ],
                    type: "string",
                    "x-google-enum-descriptions": [
                      "The speed unit is unspecified.",
                      "The speed is measured in kilometers per hour.",
                      "The speed is measured in miles per hour.",
                    ],
                  },
                  value: {
                    description: "The value of the wind speed.",
                    format: "float",
                    type: "number",
                  },
                },
                type: "object",
              },
            },
            description:
              "Response for the LookupWeather RPC - represents the weather conditions at the requested location. This response represent both Hourly and Daily information, therefore the response is split in three sections Hourly, Daily and Shared. Only-Hourly, Only-Daily fields are marked as optional. For fields that are shared between Hourly and Daily information, some are always present so they are not marked as optional while the rest are marked as optional because they are not always available. ",
            properties: {
              airPressure: {
                $ref: "#/$defs/AirPressure",
                description: "The hourly air pressure conditions.",
              },
              cloudCover: {
                description:
                  "The percentage of the sky covered by clouds (values from 0 to 100). define optional because it is not always available",
                format: "int32",
                type: "integer",
              },
              feelsLikeMaxTemperature: {
                $ref: "#/$defs/Temperature",
                description:
                  "The maximum (high) feels-like temperature throughout the day.",
              },
              feelsLikeMinTemperature: {
                $ref: "#/$defs/Temperature",
                description:
                  "The minimum (low) feels-like temperature throughout the day.",
              },
              feelsLikeTemperature: {
                $ref: "#/$defs/Temperature",
                description:
                  "The hourly measure of how the temperature feels like.",
              },
              heatIndex: {
                $ref: "#/$defs/Temperature",
                description: "The hourly heat index temperature.",
              },
              maxHeatIndex: {
                $ref: "#/$defs/Temperature",
                description:
                  "The maximum heat index temperature throughout the day.",
              },
              maxTemperature: {
                $ref: "#/$defs/Temperature",
                description:
                  "The maximum (high) temperature throughout the day.",
              },
              minTemperature: {
                $ref: "#/$defs/Temperature",
                description:
                  "The minimum (low) temperature throughout the day.",
              },
              moonEvents: {
                $ref: "#/$defs/MoonEvents",
                description:
                  "The events related to the moon (e.g. moonrise, moonset).",
              },
              precipitation: {
                $ref: "#/$defs/Precipitation",
                description:
                  "The precipitation probability and amount of precipitation accumulated",
              },
              relativeHumidity: {
                description:
                  "The percent of relative humidity (values from 0 to 100). define optional because it is not always available",
                format: "int32",
                type: "integer",
              },
              returnedLocation: {
                $ref: "#/$defs/Location",
                description:
                  'Required. The location where the weather information is returned. This location is identical to the location in the request, but can be different from it if the requested location is a free text address that looks up to a coarse location (e.g. "Mountain View, CA").',
              },
              sunEvents: {
                $ref: "#/$defs/SunEvents",
                description:
                  "The events related to the sun (e.g. sunrise, sunset).",
              },
              temperature: {
                $ref: "#/$defs/Temperature",
                description: "The hourly temperature",
              },
              thunderstormProbability: {
                description:
                  "The thunderstorm probability (values from 0 to 100). define optional because it is not always available",
                format: "int32",
                type: "integer",
              },
              uvIndex: {
                description:
                  "The maximum ultraviolet (UV) index. define optional because it is not always available",
                format: "int32",
                type: "integer",
              },
              weatherCondition: {
                $ref: "#/$defs/WeatherCondition",
                description: "The weather condition",
              },
              wind: {
                $ref: "#/$defs/Wind",
                description: "The wind conditions",
              },
            },
            type: "object",
          },
        },
        {
          annotations: {
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
            readOnlyHint: true,
          },
          description:
            'Computes a travel route between a specified origin and destination. **Supported Travel Modes:** DRIVE (default), WALK.\n\n**Input Requirements (CRITICAL):**\nRequires both **origin** and **destination**. Each must be provided using one of the following methods, nested within its respective field:\n\n*   **address:** (string, e.g., \'Eiffel Tower, Paris\'). Note: The more granular or specific the input address is, the better the results will be.\n\n*   **lat_lng:** (object, {"latitude": number, "longitude": number})\n\n*   **place_id:** (string, e.g., \'ChIJOwE_Id1w5EAR4Q27FkL6T_0\') Note: This id can be obtained from the search_places tool.\nAny combination of input types is allowed (e.g., origin by address, destination by lat_lng). If either the origin or destination is missing, **you MUST ask the user for clarification** before attempting to call the tool.\n\n**Example Tool Call:**\n{"origin":{"address":"Eiffel Tower"},"destination":{"place_id":"ChIJt_5xIthw5EARoJ71mGq7t74"},"travel_mode":"DRIVE"}\n',
          inputSchema: {
            $defs: {
              LatLng: {
                description:
                  "An object that represents a latitude/longitude pair. This is expressed as a pair of doubles to represent degrees latitude and degrees longitude. Unless specified otherwise, this object must conform to the WGS84 standard <https://en.wikipedia.org/wiki/World_Geodetic_System#1984_version>. Values must be within normalized ranges.",
                properties: {
                  latitude: {
                    description:
                      "The latitude in degrees. It must be in the range [-90.0, +90.0].",
                    format: "double",
                    type: "number",
                  },
                  longitude: {
                    description:
                      "The longitude in degrees. It must be in the range [-180.0, +180.0].",
                    format: "double",
                    type: "number",
                  },
                },
                type: "object",
              },
              Waypoint: {
                description:
                  "Encapsulates a waypoint. Waypoints mark both the beginning and end of a route.",
                properties: {
                  address: {
                    description:
                      "Human readable address or a plus code. See https://plus.codes for details.",
                    type: "string",
                  },
                  latLng: {
                    $ref: "#/$defs/LatLng",
                    description:
                      "A point specified using geographic coordinates.",
                  },
                  placeId: {
                    description: "The Place ID associated with the waypoint.",
                    type: "string",
                  },
                },
                type: "object",
              },
            },
            description: "ComputeRoutesRequest.",
            properties: {
              destination: {
                $ref: "#/$defs/Waypoint",
                description: "Required. Destination waypoint.",
              },
              origin: {
                $ref: "#/$defs/Waypoint",
                description: "Required. Origin waypoint.",
              },
              travelMode: {
                description: "Optional. Specifies the mode of transportation.",
                enum: ["ROUTE_TRAVEL_MODE_UNSPECIFIED", "DRIVE", "WALK"],
                type: "string",
                "x-google-enum-descriptions": [
                  "No travel mode specified. Defaults to `DRIVE`.",
                  "Travel by passenger car.",
                  "Travel by walking. NOTE: `WALK` routes are in beta and might sometimes be missing clear sidewalks or pedestrian paths. You must display this warning to the user for all walking that you display in your app.",
                ],
              },
            },
            required: ["origin", "destination"],
            type: "object",
          },
          name: "compute_routes",
          outputSchema: {
            $defs: {
              Route: {
                description: "Details about a route between two locations.",
                properties: {
                  distanceMeters: {
                    description: "The travel distance of the route, in meters.",
                    format: "int32",
                    type: "integer",
                  },
                  duration: {
                    description:
                      "The length of time needed to navigate the route.",
                    format: "google-duration",
                    type: "string",
                  },
                },
                type: "object",
              },
            },
            description: "ComputeRoutesResponse.",
            properties: {
              routes: {
                description:
                  "Contains routes between the requested origin and destination. Currently only one route is returned.",
                items: { $ref: "#/$defs/Route" },
                type: "array",
              },
            },
            type: "object",
          },
        },
      ];
    }

    const payload = {
      jsonrpc: "2.0",
      id: 0,
      method: "tools/list",
    };

    let response;
    if (
      mcpEndpointUrl.startsWith("https://") &&
      !mcpEndpointUrl.includes(".googleapis.com")
    ) {
      // Custom endpoint, use fetch to avoid gapi CORS/handling issues
      const client = await getGapiClient();
      const token = client.getToken()?.access_token;

      const res = await fetch(mcpEndpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Goog-User-Project": projectId,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`HTTP Error ${res.status}: ${await res.text()}`);
      }
      response = await res.json();
    } else {
      // Google API or relative path, use gapiRequest
      response = await gapiRequest<any>(
        mcpEndpointUrl,
        "POST",
        projectId,
        undefined, // params
        payload,
        { "X-Goog-User-Project": projectId },
      );
    }

    // Detailed logging of the JSON-RPC response body
    console.log(`[listMcpTools] Raw response from ${mcpEndpointUrl}:`, {
      fullResponse: response,
      hasResult: !!response?.result,
      hasError: !!response?.error,
      toolsCount: response?.result?.tools?.length,
    });

    if (response?.result && response?.result?.tools) {
      return response.result.tools;
    }

    console.warn(
      `[listMcpTools] ${mcpEndpointUrl} returned no tools. JSON-RPC Error:`,
      response?.error,
    );
    return [];
  } catch (e: any) {
    console.error(
      `[listMcpTools] FAILED to fetch tools from ${mcpEndpointUrl}. Project: ${projectId}. Error Details:`,
      e,
    );
    throw e;
  }
};

export const checkMcpCompliance = async (
  projectId: string,
  serviceName: string,
): Promise<boolean> => {
  try {
    const payload = {
      serviceName: `services/${serviceName}`,
    };
    const url = `https://serviceusage.googleapis.com/v2beta/projects/${projectId}:testMcpEnabled`;

    const response = await gapiRequest<any>(
      url,
      "POST",
      projectId,
      undefined, // params
      payload,
    );

    // If mcpEnableRules is present and has items, it's enabled/compliant
    // Alternatively, some APIs (like Bigtable/Firestore) just return the service name if enabled
    if (
      (response.mcpEnableRules && response.mcpEnableRules.length > 0) ||
      response.name
    ) {
      return true;
    }
    return false;
  } catch (e) {
    console.warn(`Failed to check MCP compliance for ${serviceName}:`, e);
    // If the check fails (e.g. 403, 404), assume disabled
    return false;
  }
};

// --- Cloud Monitoring ---

export const getCloudMonitoringMetrics = async (
  projectId: string,
  metricFilter: string,
  startTime: string,
  endTime: string,
) => {
  // API: GET https://monitoring.googleapis.com/v3/projects/{projectId}/timeSeries
  // Requires monitoring.timeSeries.list permission
  const url = `https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries`;

  const params = new URLSearchParams({
    filter: metricFilter,
    "interval.startTime": startTime,
    "interval.endTime": endTime,
  });

  return gapiRequest<any>(`${url}?${params.toString()}`, "GET", projectId);
};

// --- Prompt Chips (Canned Queries) ---

export const listPromptChips = async (engineName: string) => {
  const parts = engineName.split("/");
  const location = parts[3];
  const projectId = parts[1];
  const baseUrl = getDiscoveryEngineUrl(location);
  const url = `${baseUrl}/v1alpha/${engineName}/assistants/default_assistant/cannedQueries`;

  try {
    const response = await gapiRequest<{ cannedQueries?: any[] }>(
      url,
      "GET",
      projectId,
      { pageSize: 1000 },
    );

    // Map to UI format
    return (response.cannedQueries || []).map((item: any) => ({
      name: item.name.split("/").pop() || "",
      status: item.enabled ? "Enabled" : "Disabled",
      displayName: item.displayName || "-",
      title: item.defaultTexts?.title || "-",
      type: item.googleDefined ? "Google-made" : "Custom",
      raw: item,
    }));
  } catch (e) {
    console.error(
      `[listPromptChips] Failed to fetch canned queries for ${engineName}:`,
      e,
    );
    // Fallback to empty list or throw depending on UI preference
    return [];
  }
};

export const updatePromptChip = async (
  engineName: string,
  chipName: string,
  payload: any,
  params: any = {},
) => {
  const parts = engineName.split("/");
  const location = parts[3];
  const projectId = parts[1];
  const baseUrl = getDiscoveryEngineUrl(location);
  const url = `${baseUrl}/v1alpha/${engineName}/assistants/default_assistant/cannedQueries/${chipName}`;

  return gapiRequest<any>(url, "PATCH", projectId, params, payload);
};

export const deletePromptChip = async (
  engineName: string,
  chipName: string,
) => {
  const parts = engineName.split("/");
  const location = parts[3];
  const projectId = parts[1];
  const baseUrl = getDiscoveryEngineUrl(location);
  const url = `${baseUrl}/v1alpha/${engineName}/assistants/default_assistant/cannedQueries/${chipName}`;

  return gapiRequest<any>(url, "DELETE", projectId);
};

export const createPromptChip = async (engineName: string, payload: any) => {
  const parts = engineName.split("/");
  const location = parts[3];
  const projectId = parts[1];
  const baseUrl = getDiscoveryEngineUrl(location);
  const chipName = payload.name || `custom_${Date.now()}`;
  const url = `${baseUrl}/v1alpha/${engineName}/assistants/default_assistant/cannedQueries`;

  return gapiRequest<any>(
    url,
    "POST",
    projectId,
    { cannedQueryId: chipName },
    payload,
  );
};
