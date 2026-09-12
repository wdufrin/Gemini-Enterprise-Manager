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
  ServiceAgentValidation,
  UserPermissionsValidation,
  UserPermissionItem,
  ComprehensiveValidationResult,
  UserMemory,
  ListMemoriesResponse,
  RegistrySkill,
  RegistrySkillRevision,
  ListRegistrySkillsResponse,
  ListRegistrySkillRevisionsResponse,
} from "../types";
import { getGapiClient } from "./gapiService";
import {
  isGoogleApiEndpoint,
  mayReceiveGoogleCredentials,
  buildValidatedUrl,
} from "./urlSecurity";
import { assertValidGcpResourceName } from "./shellSafety";
import { redactRequestBody } from "./redaction";

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

export class GapiError extends Error {
  status: number;
  code?: string | number;
  details?: any[];
  raw?: any;

  constructor(
    message: string,
    status: number = 0,
    code?: string | number,
    details?: any[],
    raw?: any,
  ) {
    super(message);
    this.name = "GapiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.raw = raw;
    Object.setPrototypeOf(this, GapiError.prototype);
  }
}

type AuthExpiredHandler = () => void;
const authExpiredHandlers = new Set<AuthExpiredHandler>();

export const onAuthExpired = (handler: AuthExpiredHandler): (() => void) => {
  authExpiredHandlers.add(handler);
  return () => {
    authExpiredHandlers.delete(handler);
  };
};

const notifyAuthExpired = () => {
  authExpiredHandlers.forEach((h) => {
    try {
      h();
    } catch (e) {
      console.error("Error in auth expired handler", e);
    }
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("gapi:auth-expired"));
  }
};

export function createConcurrencyLimiter(concurrency: number) {
  let activeCount = 0;
  const queue: (() => void)[] = [];

  const next = () => {
    activeCount--;
    if (queue.length > 0) {
      const run = queue.shift();
      if (run) run();
    }
  };

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (activeCount >= concurrency) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    activeCount++;
    try {
      return await fn();
    } finally {
      next();
    }
  };
}

// Global concurrency limiter: max 6 in-flight calls to prevent client-side socket saturation and 429 bursts
export const globalApiLimiter = createConcurrencyLimiter(6);

const MAX_API_RETRIES = 3;

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
  return globalApiLimiter(async () => {
    let lastError: any = null;
    for (let attempt = 0; attempt <= MAX_API_RETRIES; attempt++) {
      const client = await getGapiClient();
      const requestHeaders = headers ? { ...headers } : {};

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
        const token = client.getToken()?.access_token;
        const logHeaders = { ...requestHeaders };
        if (token) {
          logHeaders["Authorization"] = `Bearer $(gcloud auth print-access-token)`;
        }
        const logBody = redactRequestBody(body);
        const curlCommand = generateCurlCommand(path, method, logHeaders, logBody);
        debugLogger({
          method,
          url: path,
          headers: logHeaders,
          body: logBody,
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
        // Extract status, code, details, message
        let status = typeof error?.status === "number" ? error.status : 0;
        let code: string | number | undefined = error?.code;
        let details: any[] | undefined = undefined;
        let errorMessage = "Unknown API Error";

        if (error?.result?.error) {
          const apiErr = error.result.error;
          if (typeof apiErr.code === "number") status = apiErr.code;
          if (apiErr.status) code = apiErr.status;
          if (Array.isArray(apiErr.details)) details = apiErr.details;
          if (apiErr.message) {
            errorMessage = apiErr.message;
            if (details && details.length > 0) {
              const detailTexts = details
                .map((d: any) => d.detail || d.message)
                .filter(Boolean);
              if (detailTexts.length > 0) {
                errorMessage = `${errorMessage} (${detailTexts.join("; ").trim()})`;
              }
            }
          }
        } else if (error?.body) {
          try {
            const parsed = typeof error.body === "string" ? JSON.parse(error.body) : error.body;
            if (parsed?.error) {
              if (typeof parsed.error.code === "number") status = parsed.error.code;
              if (parsed.error.status) code = parsed.error.status;
              if (Array.isArray(parsed.error.details)) details = parsed.error.details;
              if (parsed.error.message) errorMessage = parsed.error.message;
              else errorMessage = typeof error.body === "string" ? error.body : JSON.stringify(error.body);
            } else {
              errorMessage = typeof error.body === "string" ? error.body : JSON.stringify(error.body);
            }
          } catch {
            errorMessage = String(error.body);
          }
        } else if (error?.message) {
          errorMessage = error.message;
        } else if (error?.result) {
          errorMessage = JSON.stringify(error.result, null, 2);
        } else if (typeof error === "object" && error !== null) {
          try {
            errorMessage = JSON.stringify(error, null, 2);
          } catch {
            errorMessage = "Complex Error Object (cannot stringify)";
          }
        } else if (error) {
          errorMessage = String(error);
        }

        // Retry on 429 (Too Many Requests / RESOURCE_EXHAUSTED) or 503 (Service Unavailable)
        if (
          (status === 429 || status === 503 || code === "RESOURCE_EXHAUSTED") &&
          attempt < MAX_API_RETRIES
        ) {
          const backoffMs =
            Math.pow(2, attempt + 1) * 1000 + Math.random() * 500;
          if (!suppressErrorLog) {
            console.warn(
              `[gapiRequest] Rate limited / service unavailable (${status} ${code || ""}). Retrying attempt ${attempt + 1}/${MAX_API_RETRIES} in ${Math.round(backoffMs)}ms...`,
            );
          }
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        // Auth expiration notification on 401 or UNAUTHENTICATED
        if (status === 401 || code === "UNAUTHENTICATED") {
          notifyAuthExpired();
        }

        if (!suppressErrorLog) {
          console.error("API Request Failed", error);
        }

        lastError = new GapiError(errorMessage, status, code, details, error);
        throw lastError;
      }
    }
    throw lastError || new GapiError("API request exceeded retry budget", 503);
  });
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
    "modelarmor.googleapis.com",
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

export const generateDiscoveryEngineServiceIdentity = async (projectId: string) => {
  const url = `https://serviceusage.googleapis.com/v1beta1/projects/${projectId}/services/discoveryengine.googleapis.com:generateServiceIdentity`;
  return gapiRequest<any>(url, "POST", projectId, undefined, {});
};

export const checkDiscoveryEngineServiceAgent = async (
  projectId: string,
  projectNumber: string
): Promise<ServiceAgentValidation> => {
  const email = `service-${projectNumber}@gcp-sa-discoveryengine.iam.gserviceaccount.com`;
  const memberKey = `serviceAccount:${email}`;
  const requiredRole = "roles/discoveryengine.serviceAgent";
  const recommendedRoles = [
    "roles/aiplatform.user",
    "roles/storage.objectViewer",
    "roles/bigquery.dataViewer"
  ];

  try {
    const policy = await getProjectIamPolicy(projectId);
    const assignedRoles: string[] = [];

    if (policy && policy.bindings) {
      for (const binding of policy.bindings) {
        if (binding.members && binding.members.some((m: string) => m.toLowerCase() === memberKey.toLowerCase())) {
          assignedRoles.push(binding.role);
        }
      }
    }

    const hasRequiredRole = assignedRoles.includes(requiredRole);
    const missingRecommendedRoles = recommendedRoles.filter(r => !assignedRoles.includes(r));

    return {
      email,
      exists: true,
      hasRequiredRole,
      requiredRole,
      assignedRoles,
      missingRecommendedRoles,
      status: hasRequiredRole ? 'READY' : 'MISSING_ROLE'
    };
  } catch (err: any) {
    const errMsg = err?.message || (typeof err === 'string' ? err : 'Unknown error');
    const isPermissionDenied = errMsg.includes('403') || errMsg.toLowerCase().includes('permission') || errMsg.toLowerCase().includes('forbidden');
    
    return {
      email,
      exists: true,
      hasRequiredRole: false,
      requiredRole,
      assignedRoles: [],
      missingRecommendedRoles: recommendedRoles,
      status: isPermissionDenied ? 'PERMISSION_DENIED' : 'NOT_FOUND',
      errorMessage: isPermissionDenied
        ? 'Insufficient permissions to inspect project IAM policy (roles/resourcemanager.projectIamViewer or roles/owner required).'
        : `Could not check service agent status: ${errMsg}`
    };
  }
};

export const grantDiscoveryEngineServiceAgentRole = async (
  projectId: string,
  projectNumber: string,
  extraRoles: string[] = []
): Promise<any> => {
  // 1. Ensure service identity is initialized by Google Service Usage
  try {
    await generateDiscoveryEngineServiceIdentity(projectId);
  } catch (e) {
    console.warn('generateServiceIdentity warning (may already exist):', e);
  }

  const email = `service-${projectNumber}@gcp-sa-discoveryengine.iam.gserviceaccount.com`;
  const memberKey = `serviceAccount:${email}`;
  const rolesToEnsure = ["roles/discoveryengine.serviceAgent", ...extraRoles];

  const policy = await getProjectIamPolicy(projectId);
  const bindings = policy.bindings || [];

  rolesToEnsure.forEach(role => {
    const binding = bindings.find((b: any) => b.role === role);
    if (binding) {
      if (!binding.members) binding.members = [];
      if (!binding.members.some((m: string) => m.toLowerCase() === memberKey.toLowerCase())) {
        binding.members.push(memberKey);
      }
    } else {
      bindings.push({
        role,
        members: [memberKey]
      });
    }
  });

  policy.bindings = bindings;
  return setProjectIamPolicy(projectId, policy);
};

export const validateUserPermissions = async (
  projectId: string
): Promise<UserPermissionsValidation> => {
  const permissionsToCheck: {
    permission: string;
    category: 'Discovery Engine Admin' | 'IAM & Security' | 'Service Management' | 'Vertex AI / Reasoning';
    description: string;
    recommendedRole: string;
    critical?: boolean;
  }[] = [
    {
      permission: 'discoveryengine.engines.get',
      category: 'Discovery Engine Admin',
      description: 'View Assistants & App Engines',
      recommendedRole: 'roles/discoveryengine.admin',
      critical: true
    },
    {
      permission: 'discoveryengine.engines.update',
      category: 'Discovery Engine Admin',
      description: 'Modify Assistant & Feature Configuration',
      recommendedRole: 'roles/discoveryengine.admin',
      critical: true
    },
    {
      permission: 'discoveryengine.engines.list',
      category: 'Discovery Engine Admin',
      description: 'List all Assistants & App Engines',
      recommendedRole: 'roles/discoveryengine.admin',
      critical: true
    },
    {
      permission: 'discoveryengine.dataStores.get',
      category: 'Discovery Engine Admin',
      description: 'View and query DataStores',
      recommendedRole: 'roles/discoveryengine.admin'
    },
    {
      permission: 'discoveryengine.assistants.get',
      category: 'Discovery Engine Admin',
      description: 'View Assistant chat configs & prompt chips',
      recommendedRole: 'roles/discoveryengine.admin'
    },
    {
      permission: 'resourcemanager.projects.get',
      category: 'IAM & Security',
      description: 'Get project metadata & number',
      recommendedRole: 'roles/viewer'
    },
    {
      permission: 'resourcemanager.projects.getIamPolicy',
      category: 'IAM & Security',
      description: 'Audit project IAM policy & service agents',
      recommendedRole: 'roles/resourcemanager.projectIamAdmin'
    },
    {
      permission: 'resourcemanager.projects.setIamPolicy',
      category: 'IAM & Security',
      description: 'Assign roles to service agents & users',
      recommendedRole: 'roles/resourcemanager.projectIamAdmin'
    },
    {
      permission: 'serviceusage.services.list',
      category: 'Service Management',
      description: 'Check enabled Google Cloud APIs',
      recommendedRole: 'roles/serviceusage.serviceUsageViewer'
    },
    {
      permission: 'serviceusage.services.enable',
      category: 'Service Management',
      description: '1-click enable required Google APIs',
      recommendedRole: 'roles/serviceusage.serviceUsageAdmin'
    },
    {
      permission: 'aiplatform.reasoningEngines.list',
      category: 'Vertex AI / Reasoning',
      description: 'List Vertex AI Agent Engines',
      recommendedRole: 'roles/aiplatform.user'
    }
  ];

  try {
    const rawPermissions = permissionsToCheck.map(p => p.permission);
    const response = await gapiRequest<any>(
      `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:testIamPermissions`,
      'POST',
      projectId,
      undefined,
      { permissions: rawPermissions }
    );

    const grantedSet = new Set<string>(response.permissions || []);
    const items: UserPermissionItem[] = permissionsToCheck.map(p => ({
      permission: p.permission,
      category: p.category,
      granted: grantedSet.has(p.permission),
      description: p.description,
      recommendedRole: p.recommendedRole
    }));

    const missingCritical = permissionsToCheck
      .filter(p => p.critical && !grantedSet.has(p.permission))
      .map(p => p.permission);

    const grantedCount = items.filter(i => i.granted).length;
    const canInspectIam = grantedSet.has('resourcemanager.projects.getIamPolicy');
    const hasAdminAccess = missingCritical.length === 0;

    return {
      tested: true,
      canInspectIam,
      hasAdminAccess,
      grantedCount,
      totalCount: items.length,
      items,
      missingCritical
    };
  } catch (err: any) {
    const errMsg = err?.message || (typeof err === 'string' ? err : 'Unknown error');
    return {
      tested: false,
      canInspectIam: false,
      hasAdminAccess: false,
      grantedCount: 0,
      totalCount: permissionsToCheck.length,
      items: permissionsToCheck.map(p => ({
        permission: p.permission,
        category: p.category,
        granted: false,
        description: p.description,
        recommendedRole: p.recommendedRole
      })),
      missingCritical: [],
      notice: `Could not test project IAM permissions: ${errMsg}. If you only have resource-scoped access, you can still proceed into the app.`
    };
  }
};

export const runComprehensiveProjectValidation = async (
  projectId: string,
  projectNumber: string
): Promise<ComprehensiveValidationResult> => {
  const [apis, serviceAgent, userPermissions] = await Promise.all([
    validateEnabledApis(projectId),
    checkDiscoveryEngineServiceAgent(projectId, projectNumber),
    validateUserPermissions(projectId)
  ]);

  return {
    apis,
    serviceAgent,
    userPermissions
  };
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
    const pools = response.workloadIdentityPools || response.workforcePools;
    if (pools) {
      allPools = allPools.concat(
        pools.filter((p: any) => p.state !== "DELETED"),
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
    const providers = response.workloadIdentityProviders || response.workforcePoolProviders;
    if (providers) {
      allProviders = allProviders.concat(
        providers.filter(
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

export const getCustomRole = async (
  projectId: string,
  roleId: string,
): Promise<any> => {
  const url = `https://iam.googleapis.com/v1/projects/${projectId}/roles/${roleId}`;
  return gapiRequest<any>(url, "GET", projectId, undefined, undefined, undefined, true);
};

export const createCustomRole = async (
  projectId: string,
  roleId: string,
  roleData: {
    title: string;
    description: string;
    stage?: string;
    includedPermissions: string[];
  },
): Promise<any> => {
  const url = `https://iam.googleapis.com/v1/projects/${projectId}/roles`;
  return gapiRequest<any>(url, "POST", projectId, undefined, {
    roleId,
    role: {
      title: roleData.title,
      description: roleData.description,
      stage: roleData.stage || "GA",
      includedPermissions: roleData.includedPermissions,
    },
  });
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

export const pollDiscoveryOperation = async (
  operation: any,
  config: Config,
  apiVersion: string = DISCOVERY_API_BETA,
  maxAttempts: number = 30,
  delayMs: number = 2000,
): Promise<any> => {
  if (!operation || !operation.name) {
    return operation;
  }
  if (operation.done) {
    if (operation.error) {
      throw new Error(
        operation.error.message ||
          `Operation failed with code ${operation.error.code}`,
      );
    }
    return operation;
  }

  let currentOp = operation;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    try {
      currentOp = await getDiscoveryOperation(operation.name, config, apiVersion);
      if (currentOp.done) {
        if (currentOp.error) {
          throw new Error(
            currentOp.error.message ||
              `Operation failed with code ${currentOp.error.code}`,
          );
        }
        return currentOp;
      }
    } catch (err: any) {
      if (err.message && err.message.includes("Operation failed")) {
        throw err;
      }
      console.warn("Polling operation encountered transient error, will retry:", err);
    }
  }
  return currentOp;
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

export const getDataStoreIamPolicy = async (
  name: string,
  config: Config,
): Promise<any> => {
  const {
    projectId,
    appLocation,
    collectionId = "default_collection",
  } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);

  const resourcePath = name.startsWith("projects/")
    ? name
    : `projects/${projectId}/locations/${appLocation}/collections/${collectionId}/dataStores/${name}`;

  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${resourcePath}:getIamPolicy`;
  return gapiRequest<any>(url, "GET", projectId);
};

export const setDataStoreIamPolicy = async (
  name: string,
  policy: any,
  config: Config,
): Promise<any> => {
  const {
    projectId,
    appLocation,
    collectionId = "default_collection",
  } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);

  const resourcePath = name.startsWith("projects/")
    ? name
    : `projects/${projectId}/locations/${appLocation}/collections/${collectionId}/dataStores/${name}`;

  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${resourcePath}:setIamPolicy`;
  return gapiRequest<any>(url, "POST", projectId, undefined, { policy });
};

export const getCollectionIamPolicy = async (
  name: string,
  config: Config,
): Promise<any> => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);

  const resourcePath = name.startsWith("projects/")
    ? name
    : `projects/${projectId}/locations/${appLocation}/collections/${name}`;

  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${resourcePath}:getIamPolicy`;
  return gapiRequest<any>(url, "GET", projectId);
};

export const setCollectionIamPolicy = async (
  name: string,
  policy: any,
  config: Config,
): Promise<any> => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);

  const resourcePath = name.startsWith("projects/")
    ? name
    : `projects/${projectId}/locations/${appLocation}/collections/${name}`;

  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${resourcePath}:setIamPolicy`;
  return gapiRequest<any>(url, "POST", projectId, undefined, { policy });
};

export const listCollections = async (
  config: Config,
): Promise<{ collections?: { name: string; displayName?: string }[] }> => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${appLocation}/collections`;
  return gapiRequest<any>(url, "GET", projectId, undefined, undefined, undefined, true);
};

export const checkDataStoreAclSupport = async (
  config: Config,
  sampleDataStoreId?: string
): Promise<boolean> => {
  const { projectId, appLocation, collectionId = "default_collection" } = config;
  if (!projectId || !appLocation) return false;
  const baseUrl = getDiscoveryEngineUrl(appLocation);

  try {
    let testPath = `projects/${projectId}/locations/${appLocation}/collections/${collectionId}`;
    if (sampleDataStoreId) {
      testPath += `/dataStores/${sampleDataStoreId}`;
    }
    const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${testPath}:getIamPolicy`;
    const res = await gapiRequest<any>(url, "GET", projectId);
    return !!(res && (res.etag !== undefined || res.bindings !== undefined));
  } catch (err: any) {
    // If the API returns an error (400 / 403 / 404 / FAILED_PRECONDITION), it's not allowlisted
    return false;
  }
};


export const getWidgetConfig = async (name: string, config: Config) => {
  // name is the engine name
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  // Widget configs use v1alpha in the user's curl payload, but we can try v1beta if available. We'll use v1alpha to match HAR capture safely.
  const url = `${baseUrl}/v1alpha/${name}/widgetConfigs/default_search_widget_config?model_info_view=ADMIN`;
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

export const getIdpConfig = async (name: string, config: Config) => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/v1alpha/${name}/idpConfig`;
  return gapiRequest<any>(url, "GET", projectId, undefined, undefined, undefined, true);
};

export const updateIdpConfig = async (
  name: string,
  payload: any,
  config: Config,
) => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/v1alpha/${name}/idpConfig`;
  return gapiRequest<any>(url, "PATCH", projectId, undefined, payload);
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
  // poolName is typically formatted as: "locations/global/workforcePools/example-okta"
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

export const listAssistants = async (
  config: Config,
  pageSize: number = 20,
  pageToken?: string,
): Promise<{ assistants?: Assistant[]; nextPageToken?: string }> => {
  const { projectId, appLocation, collectionId, appId } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  let url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${appLocation}/collections/${collectionId || "default_collection"}/engines/${appId}/assistants?pageSize=${pageSize}`;
  if (pageToken) {
    url += `&pageToken=${encodeURIComponent(pageToken)}`;
  }
  return gapiRequest<{ assistants?: Assistant[]; nextPageToken?: string }>(
    url,
    "GET",
    projectId,
    undefined,
    undefined,
    undefined,
    config.suppressErrorLog,
  );
};

// User Memories (Personalization)
export const listUserMemories = async (
  config: Config & { engineName?: string; projectNumber?: string },
  pageSize: number = 20,
  pageToken?: string,
): Promise<ListMemoriesResponse> => {
  const { projectId, appLocation, collectionId, appId, engineName, projectNumber } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);

  let parentPath: string;
  if (engineName && engineName.startsWith("projects/")) {
    parentPath = engineName;
  } else {
    let proj = projectNumber || projectId;
    if (proj && !/^\d+$/.test(proj)) {
      try {
        const resolved = await getProjectNumber(proj);
        if (resolved) proj = resolved;
      } catch (err) {
        console.warn("Could not resolve project number for memories API, falling back to projectId:", err);
      }
    }
    parentPath = `projects/${proj}/locations/${appLocation}/collections/${collectionId || "default_collection"}/engines/${appId}`;
  }

  let url = `${baseUrl}/${DISCOVERY_API_VERSION}/${parentPath}/memories?pageSize=${pageSize}`;
  if (pageToken) {
    url += `&pageToken=${encodeURIComponent(pageToken)}`;
  }
  return gapiRequest<ListMemoriesResponse>(
    url,
    "GET",
    projectId,
    undefined,
    undefined,
    undefined,
    config.suppressErrorLog,
  );
};

export const deleteUserMemory = async (
  memoryName: string,
  config: Config,
): Promise<any> => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${memoryName}`;
  return gapiRequest<any>(
    url,
    "DELETE",
    config.projectId,
    undefined,
    undefined,
    undefined,
    config.suppressErrorLog,
  );
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
  suppressErrorLog?: boolean,
) => {
  const { projectId, appLocation, collectionId, appId, assistantId } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  let url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}/assistants/${assistantId}/agents`;
  if (agentId) {
    url += `?agentId=${agentId}`;
  }
  return gapiRequest<Agent>(url, "POST", projectId, undefined, payload, undefined, suppressErrorLog);
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
  if (payload.skillAgentDefinition)
    updateMask.push("skill_agent_definition");
  if (payload.sharingConfig) updateMask.push("sharing_config");
  if (payload.authorizations) updateMask.push("authorizations");
  if (payload.authorizationConfig) updateMask.push("authorization_config");

  const agentName = agent.name && agent.name.startsWith("projects/")
    ? agent.name
    : `projects/${config.projectId}/locations/${config.appLocation}/collections/${config.collectionId || "default_collection"}/engines/${config.appId}/assistants/${config.assistantId || "default_assistant"}/agents/${(agent as any).id || agent.name}`;

  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${agentName}?updateMask=${updateMask.join(",")}`;
  return gapiRequest<Agent>(url, "PATCH", config.projectId, undefined, payload);
};

export const requestAgentReview = async (name: string, config: Config) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  return gapiRequest<Agent>(
    `${baseUrl}/${DISCOVERY_API_VERSION}/${name}:requestAgentReview`,
    "POST",
    config.projectId,
    undefined,
    {},
  );
};

export const ensureSkillSharingOnEngine = async (config: Config) => {
  try {
    const { projectId, appLocation, collectionId = "default_collection", appId } = config;
    if (!appId) return;
    const engine = await getEngine(appId, config);
    if (!engine) return;
    const features = { ...(engine.features || {}) };
    let needsUpdate = false;
    if (features["skill-sharing"] !== "FEATURE_STATE_ON") {
      features["skill-sharing"] = "FEATURE_STATE_ON";
      needsUpdate = true;
    }
    if (features["skill-sharing-without-admin-approval"] !== "FEATURE_STATE_ON") {
      features["skill-sharing-without-admin-approval"] = "FEATURE_STATE_ON";
      needsUpdate = true;
    }
    if (needsUpdate) {
      const engineName = engine.name || `projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}`;
      await updateEngine(engineName, { features }, ["features"], config);
    }
  } catch (err) {
    console.warn("Could not auto-enable skill-sharing features on engine:", err);
  }
};

export const promoteSkillToOrg = async (agent: Agent, config: Config): Promise<Agent> => {
  // 1. Ensure skill-sharing feature flags are enabled on the engine
  await ensureSkillSharingOnEngine(config);

  // 2. If in PRIVATE, request review to transition to ENABLED
  if (agent.state === "PRIVATE" || !agent.state) {
    try {
      await requestAgentReview(agent.name, config);
    } catch (e) {
      console.warn("requestAgentReview failed, attempting direct state update:", e);
    }
  }

  // 3. If in DISABLED, enable it
  try {
    const current = await getAgent(agent.name, config);
    if (current.state === "DISABLED" || current.state === "SUSPENDED") {
      await enableAgent(agent.name, config);
    }
  } catch (e) {
    console.warn("enableAgent failed, proceeding to sharing_config:", e);
  }

  // 4. Update sharing_config to ALL_USERS
  try {
    await updateAgent(agent, { sharingConfig: { scope: "ALL_USERS" } }, config);
  } catch (e) {
    console.warn("Failed to patch sharing_config:", e);
  }

  return getAgent(agent.name, config);
};

export const demoteSkillToPersonal = async (agent: Agent, config: Config): Promise<Agent> => {
  try {
    await updateAgent(agent, { sharingConfig: { scope: "RESTRICTED" } }, config);
  } catch (e) {
    console.warn("Failed to set RESTRICTED sharing_config:", e);
  }
  return getAgent(agent.name, config);
};

export const createSkillAgent = async (
  payload: any,
  config: Config,
  agentId?: string,
  isOrganizational: boolean = true,
) => {
  const agent = await createAgent(payload, config, agentId);
  if (isOrganizational || payload.state === "ENABLED") {
    try {
      return await promoteSkillToOrg(agent, config);
    } catch (e) {
      console.warn("Could not automatically promote skill to org-wide after creation:", e);
    }
  }
  return agent;
};

export const deleteSkillAgent = async (name: string, config: Config) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  return gapiRequest(
    `${baseUrl}/${DISCOVERY_API_VERSION}/${name}`,
    "DELETE",
    config.projectId,
  );
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

export const setUpDataConnector = async (
  payload: any,
  config: Config,
) => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${appLocation}:setUpDataConnector`;
  return gapiRequest<any>(url, "POST", projectId, undefined, payload);
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

export const listAllReasoningEngines = async (
  config: Config,
): Promise<ReasoningEngine[]> => {
  const allEngines: ReasoningEngine[] = [];
  let pageToken: string | undefined;
  do {
    const res = await listReasoningEngines(config, pageToken, 100);
    if (res.reasoningEngines) {
      allEngines.push(...res.reasoningEngines);
    }
    pageToken = res.nextPageToken;
  } while (pageToken);
  return allEngines;
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
  pageToken?: string,
  pageSize: number = 100,
) => {
  const location = engineName.split("/")[3];
  let url = `https://${location}-aiplatform.googleapis.com/v1beta1/${engineName}/sessions?pageSize=${pageSize}`;
  if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
  return gapiRequest<{ sessions: { name: string }[]; nextPageToken?: string }>(
    url,
    "GET",
    config.projectId,
  );
};

export const listAllReasoningEngineSessions = async (
  engineName: string,
  config: Config,
): Promise<{ name: string }[]> => {
  const allSessions: { name: string }[] = [];
  let pageToken: string | undefined;
  do {
    const res = await listReasoningEngineSessions(engineName, config, pageToken, 100);
    if (res.sessions) {
      allSessions.push(...res.sessions);
    }
    pageToken = res.nextPageToken;
  } while (pageToken);
  return allSessions;
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

  for (;;) {
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
              const cleanBuffer = buffer.trim();
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

  for (;;) {
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

  for (;;) {
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
        logs = text.split(/\r?\n/);

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

export const runBigQueryQuery = async (
  projectId: string,
  query: string,
  suppressErrorLog: boolean = false
) => {
  return gapiRequest<any>(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`,
    "POST",
    projectId,
    undefined,
    { query, useLegacySql: false },
    undefined,
    suppressErrorLog
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

export const fetchModelArmorTemplates = async (
  config: Omit<Config, 'accessToken'>
): Promise<any> => {
  const { projectId } = config;
  const url = `https://modelarmor.googleapis.com/v1/projects/${projectId}/locations/-/templates`;
  return gapiRequest<any>(
    url,
    "GET",
    projectId
  );
};

export const createModelArmorTemplate = async (
  projectId: string,
  location: string,
  templateId: string,
  payload: any
): Promise<any> => {
  const host = !location || location === 'global'
    ? 'modelarmor.googleapis.com'
    : `modelarmor.${location}.rep.googleapis.com`;
  const url = `https://${host}/v1/projects/${projectId}/locations/${location}/templates?templateId=${templateId}`;
  return gapiRequest<any>(
    url,
    "POST",
    projectId,
    undefined,
    payload
  );
};

const extractCloudRunServiceName = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith(".run.app")) return null;
    const subdomains = parsed.hostname.split(".");
    const firstPart = subdomains[0]; // e.g., "oracle-mcp-server-123456789012" or "multi-mcp-vpaohjgvxq-uc"
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

  // Read-modify-write concurrency protection: if etag is missing, fetch current policy first to obtain etag
  const finalPolicy = { ...policy };
  if (!finalPolicy.etag) {
    try {
      const current = await getAgentIamPolicy(name, config);
      if (current?.etag) {
        finalPolicy.etag = current.etag;
      }
    } catch (fetchErr) {
      console.warn("Could not fetch current agent IAM policy for etag concurrency check:", fetchErr);
    }
  }

  return gapiRequest<any>(url, "POST", config.projectId, undefined, { policy: finalPolicy });
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
  // SECURITY (F-01): `serviceName` is interpolated into a `bash -c` script that
  // runs in Cloud Build with the build service account. It is derived from
  // Compute Engine forwarding-rule names returned by the API, but "the API
  // would never return that" is not a security control. Validate against the
  // GCP resource-name allowlist -- which every legitimate forwarding-rule base
  // name already satisfies -- so no shell metacharacter can reach the script.
  // The validated (trimmed) value is what gets interpolated below.
  serviceName = assertValidGcpResourceName(serviceName, "Service name");
  const buildConfig = {
    steps: [
      {
        name: "gcr.io/google.com/cloudsdktool/cloud-sdk",
        entrypoint: "bash",
        args: [
          "-c",
          `
echo "========== STARTING REDIRECT URL & PRIVATE ROUTING INFRASTRUCTURE DISMANTLING =========="
CLEAN_SUFFIX=$$(echo "${serviceName}" | sed 's/assistant-//' | tr -d '_' | tr '[:upper:]' '[:lower:]' | cut -c1-12)
ALPHA_SUFFIX=$$(echo "${serviceName}" | sed 's/assistant-//' | tr -d '_' | tr -d '-' | tr '[:upper:]' '[:lower:]' | cut -c1-14)

FAILURES=0
SKIPPED=0
DELETED=0

teardown_resource() {
  local res_type="$$1"
  local res_name="$$2"
  shift 2
  echo "Dismantling $$res_type: $$res_name..."
  local out
  if out=$$("$$@" 2>&1); then
    echo "[SUCCESS] Deleted $$res_type: $$res_name"
    DELETED=$$((DELETED + 1))
  elif echo "$$out" | grep -qE "was not found|NOT_FOUND|notFound|could not be found"; then
    echo "[SKIPPED] $$res_type $$res_name was not present"
    SKIPPED=$$((SKIPPED + 1))
  else
    echo "[FAILED] Failed to delete $$res_type $$res_name:" >&2
    echo "$$out" >&2
    FAILURES=$$((FAILURES + 1))
  fi
}

# 1. Dismantling Public Global Load Balancer (if exists)
echo "1. Dismantling Global Forwarding Rules and certificates..."
teardown_resource "Forwarding Rule" "${serviceName}-fwd-rule" gcloud compute forwarding-rules delete "${serviceName}-fwd-rule" --global --quiet
teardown_resource "Target HTTPS Proxy" "${serviceName}-https-proxy" gcloud compute target-https-proxies delete "${serviceName}-https-proxy" --global --quiet
teardown_resource "URL Map" "${serviceName}-url-map" gcloud compute url-maps delete "${serviceName}-url-map" --global --quiet
teardown_resource "SSL Certificate" "${serviceName}-cert" gcloud compute ssl-certificates delete "${serviceName}-cert" --global --quiet

# 2. Dismantling Regional Internal Load Balancer (if exists)
echo "2. Dismantling Regional Forwarding Rules and subnets..."
LOCATION="us-central1"
teardown_resource "Internal Forwarding Rule" "${serviceName}-internal-fwd-rule" gcloud compute forwarding-rules delete "${serviceName}-internal-fwd-rule" --region="$$LOCATION" --quiet
teardown_resource "Internal Target HTTP Proxy" "${serviceName}-internal-target-proxy" gcloud compute target-http-proxies delete "${serviceName}-internal-target-proxy" --region="$$LOCATION" --quiet
teardown_resource "Internal URL Map" "${serviceName}-internal-map" gcloud compute url-maps delete "${serviceName}-internal-map" --region="$$LOCATION" --quiet
teardown_resource "Proxy Subnet" "${serviceName}-proxy-subnet" gcloud compute networks subnets delete "${serviceName}-proxy-subnet" --region="$$LOCATION" --quiet

# 3. Dismantling Private Service Connect (PSC) (if exists)
echo "3. Dismantling Private Service Connect (PSC) endpoints and IPs..."
teardown_resource "PSC Forwarding Rule (default)" "pscrldefa$$ALPHA_SUFFIX" gcloud compute forwarding-rules delete "pscrldefa$$ALPHA_SUFFIX" --global --quiet
teardown_resource "PSC Forwarding Rule (testcr)" "pscrltest$$ALPHA_SUFFIX" gcloud compute forwarding-rules delete "pscrltest$$ALPHA_SUFFIX" --global --quiet
teardown_resource "PSC Address (default)" "psc-ip-default-$$CLEAN_SUFFIX" gcloud compute addresses delete "psc-ip-default-$$CLEAN_SUFFIX" --global --quiet
teardown_resource "PSC Address (testcr)" "psc-ip-testcr-$$CLEAN_SUFFIX" gcloud compute addresses delete "psc-ip-testcr-$$CLEAN_SUFFIX" --global --quiet

# 4. Dismantling Cloud DNS Zones (if exists)
echo "4. Dismantling Private DNS Zones..."
teardown_resource "DNS Zone (custom)" "${serviceName}-custom-dns" gcloud dns managed-zones delete "${serviceName}-custom-dns" --quiet
teardown_resource "DNS Zone (apis)" "${serviceName}-apis-dns" gcloud dns managed-zones delete "${serviceName}-apis-dns" --quiet
teardown_resource "DNS Zone (cloud)" "${serviceName}-cloud-dns" gcloud dns managed-zones delete "${serviceName}-cloud-dns" --quiet
teardown_resource "DNS Zone (com)" "${serviceName}-com-dns" gcloud dns managed-zones delete "${serviceName}-com-dns" --quiet

echo "--------------------------------------------------"
echo "Teardown Summary: Deleted=$$DELETED, Skipped=$$SKIPPED, Failures=$$FAILURES"
if [ "$$FAILURES" -gt 0 ]; then
  echo "ERROR: Infrastructure dismantling completed with $$FAILURES failure(s)." >&2
  exit 1
fi

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
  const op = await gapiRequest<any>(url, "POST", projectId, undefined, body);
  if (op?.name && !op.done) {
    return pollDiscoveryOperation(op, config, "v1", 45, 2000);
  }
  return op;
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
  const op = await gapiRequest<any>(url, "POST", projectId, undefined, body);
  if (op?.name && !op.done) {
    return pollDiscoveryOperation(op, config, "v1", 45, 2000);
  }
  return op;
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
  const op = await gapiRequest<any>(url, "POST", projectId, undefined, body);
  if (op?.name && !op.done) {
    return pollDiscoveryOperation(op, config, "v1", 45, 2000);
  }
  return op;
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
  const url = buildValidatedUrl(serviceUrl, "/.well-known/agent.json");
  if (!url) {
    throw new Error(
      `A2A Discovery Error: invalid or non-HTTPS URL: ${serviceUrl}`,
    );
  }
  // SECURITY: only attach the Google bearer token to Google-hosted origins.
  // Other hosts are still reachable -- self-hosted A2A agents are a legitimate
  // case -- they simply do not receive the user's cloud-platform credentials.
  const sendCredentials = mayReceiveGoogleCredentials(url);
  const headers: Record<string, string> = {};
  if (sendCredentials) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(url, { method: "GET", headers });
  if (!response.ok) {
    if (!sendCredentials && (response.status === 401 || response.status === 403)) {
      throw new Error(
        `A2A Discovery Error: ${response.status}. Google credentials are not sent to ` +
          `non-Google hosts, so this endpoint must accept unauthenticated discovery ` +
          `or be hosted on *.run.app / *.cloudfunctions.net / *.googleapis.com.`,
      );
    }
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
  const url = buildValidatedUrl(serviceUrl, "/invoke");
  if (!url) {
    throw new Error(
      `A2A Invocation Error: invalid or non-HTTPS URL: ${serviceUrl}`,
    );
  }
  // SECURITY: see fetchA2aAgentCard. Same trust boundary, same reasoning.
  const sendCredentials = mayReceiveGoogleCredentials(url);

  // SECURITY: the access token is deliberately NOT included in `params.state`.
  // It previously appeared there as both `AUTH_ID` and `gcp_access_token`,
  // putting a live cloud-platform credential into a JSON-RPC payload that the
  // receiving agent may log, persist, or echo back. Verified unnecessary: the
  // generated A2A server authenticates from the Authorization header, and
  // `AUTH_ID` is an env-var key name rather than a token value.
  const body = {
    jsonrpc: "2.0",
    method: "chat",
    params: {
      message: { role: "user", parts: [{ text: prompt }] },
      state: {},
    },
    id: "1",
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (sendCredentials) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    if (!sendCredentials && (response.status === 401 || response.status === 403)) {
      throw new Error(
        `A2A Invocation Error: ${response.status}. Google credentials are not sent to ` +
          `non-Google hosts. Deploy the agent to *.run.app (or another Google-hosted ` +
          `origin) if it needs to authenticate with your Google identity.`,
      );
    }
    throw new Error(
      `A2A Invocation Error: ${response.status} - ${await response.text()}`,
    );
  }
  return response.json();
};

// --- Notebooks ---

export const listNotebooks = async (
  config: Config,
  pageToken?: string,
  pageSize: number = 100,
) => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  // API: v1alpha/projects/{projectsId}/locations/{locationsId}/notebooks:listRecentlyViewed
  let url = `${baseUrl}/v1alpha/projects/${projectId}/locations/${appLocation}/notebooks:listRecentlyViewed?pageSize=${pageSize}`;
  if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
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
  // Discovery Engine User Licenses are scoped to userStores (default_user_store).
  // The nonexistent projects.locations.userLicenses endpoint is replaced with the real userStores endpoint.
  return listUserStoreLicenses(config, "default_user_store", undefined, undefined, 100);
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
    const payload = {
      jsonrpc: "2.0",
      id: 0,
      method: "tools/list",
    };

    let response;
    if (
      mcpEndpointUrl.startsWith("https://") &&
      !isGoogleApiEndpoint(mcpEndpointUrl)
    ) {
      // Custom endpoint, use fetch to avoid gapi CORS/handling issues.
      //
      // SECURITY: do not leak the GCP OAuth bearer token to external endpoints.
      // This MUST be a parsed-hostname check. The previous implementation used
      // `mcpEndpointUrl.includes(".run.app")`, which happily matched
      // `https://untrusted.example.com/.run.app` and handed the user's cloud-platform token
      // to an attacker. See services/urlSecurity.ts.
      const isTrustedGoogleHost = mayReceiveGoogleCredentials(mcpEndpointUrl);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (isTrustedGoogleHost) {
        const client = await getGapiClient();
        const token = client.getToken()?.access_token;
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
        if (projectId) {
          headers["X-Goog-User-Project"] = projectId;
        }
      }

      const res = await fetch(mcpEndpointUrl, {
        method: "POST",
        headers,
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

    const tools = response?.result?.tools || response?.tools;
    if (Array.isArray(tools)) {
      return tools;
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
    // Note: Google Cloud has officially deprecated testMcpEnabled (returns HTTP 400:
    // "TestMcpEnabled is deprecated and has no effect. MCP server enablement is no longer required.
    // Enabling the underlying service is now sufficient.").
    // Verifying that the underlying service is enabled via Service Usage API is the authoritative check.
    return await checkServiceEnabled(projectId, serviceName);
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
  aligner: string = "ALIGN_SUM",
  alignmentPeriod: string = "86400s",
) => {
  // API: GET https://monitoring.googleapis.com/v3/projects/{projectId}/timeSeries
  // Requires monitoring.timeSeries.list permission
  const url = `https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries`;

  const params = new URLSearchParams({
    filter: metricFilter,
    "interval.startTime": startTime,
    "interval.endTime": endTime,
    "aggregation.perSeriesAligner": aligner,
    "aggregation.alignmentPeriod": alignmentPeriod,
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

// ==========================================
// Google Cloud Agent Registry Skills API
// ==========================================

export const AGENT_REGISTRY_BASE_URL = "https://agentregistry.googleapis.com";
export const AGENT_REGISTRY_API_VERSION = "v1alpha";

export const listRegistrySkills = async (config: Config): Promise<RegistrySkill[]> => {
  const { projectId, appLocation = "global" } = config;
  const url = `${AGENT_REGISTRY_BASE_URL}/${AGENT_REGISTRY_API_VERSION}/projects/${projectId}/locations/${appLocation}/skills`;
  const response = await gapiRequest<ListRegistrySkillsResponse>(
    url,
    "GET",
    projectId,
  );
  return response.skills || [];
};

export const getRegistrySkill = async (name: string, config: Config): Promise<RegistrySkill> => {
  const { projectId, appLocation = "global" } = config;
  const resourceName = name.startsWith("projects/")
    ? name
    : `projects/${projectId}/locations/${appLocation}/skills/${name}`;
  const url = `${AGENT_REGISTRY_BASE_URL}/${AGENT_REGISTRY_API_VERSION}/${resourceName}`;
  return gapiRequest<RegistrySkill>(url, "GET", projectId);
};

export const createRegistrySkill = async (
  payload: Partial<RegistrySkill>,
  config: Config,
  skillId?: string,
): Promise<any> => {
  const { projectId, appLocation = "global" } = config;
  const queryParam = skillId ? `?skillId=${encodeURIComponent(skillId)}` : "";
  const url = `${AGENT_REGISTRY_BASE_URL}/${AGENT_REGISTRY_API_VERSION}/projects/${projectId}/locations/${appLocation}/skills${queryParam}`;
  return gapiRequest<any>(url, "POST", projectId, undefined, payload);
};

export const updateRegistrySkill = async (
  name: string,
  payload: Partial<RegistrySkill>,
  updateMask: string[],
  config: Config,
): Promise<any> => {
  const { projectId, appLocation = "global" } = config;
  const resourceName = name.startsWith("projects/")
    ? name
    : `projects/${projectId}/locations/${appLocation}/skills/${name}`;
  const mask = updateMask.length > 0 ? `?updateMask=${updateMask.join(",")}` : "";
  const url = `${AGENT_REGISTRY_BASE_URL}/${AGENT_REGISTRY_API_VERSION}/${resourceName}${mask}`;
  return gapiRequest<any>(url, "PATCH", projectId, undefined, payload);
};

export const deleteRegistrySkill = async (name: string, config: Config): Promise<any> => {
  const { projectId, appLocation = "global" } = config;
  const resourceName = name.startsWith("projects/")
    ? name
    : `projects/${projectId}/locations/${appLocation}/skills/${name}`;
  const url = `${AGENT_REGISTRY_BASE_URL}/${AGENT_REGISTRY_API_VERSION}/${resourceName}`;
  return gapiRequest<any>(url, "DELETE", projectId);
};

export const listRegistrySkillRevisions = async (
  skillName: string,
  config: Config,
): Promise<RegistrySkillRevision[]> => {
  const { projectId, appLocation = "global" } = config;
  const resourceName = skillName.startsWith("projects/")
    ? skillName
    : `projects/${projectId}/locations/${appLocation}/skills/${skillName}`;
  const url = `${AGENT_REGISTRY_BASE_URL}/${AGENT_REGISTRY_API_VERSION}/${resourceName}/revisions`;
  const response = await gapiRequest<ListRegistrySkillRevisionsResponse>(
    url,
    "GET",
    projectId,
  );
  return response.skillRevisions || [];
};

export const createRegistrySkillRevision = async (
  skillName: string,
  payload: any,
  config: Config,
  revisionId?: string,
): Promise<any> => {
  const { projectId, appLocation = "global" } = config;
  const resourceName = skillName.startsWith("projects/")
    ? skillName
    : `projects/${projectId}/locations/${appLocation}/skills/${skillName}`;
  const queryParam = revisionId ? `?skillRevisionId=${encodeURIComponent(revisionId)}` : "";
  const url = `${AGENT_REGISTRY_BASE_URL}/${AGENT_REGISTRY_API_VERSION}/${resourceName}/revisions${queryParam}`;
  return gapiRequest<any>(url, "POST", projectId, undefined, payload);
};


