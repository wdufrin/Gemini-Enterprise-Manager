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

import {
  Config,
  ServiceAgentValidation,
  UserPermissionsValidation,
  UserPermissionItem,
  ComprehensiveValidationResult,
  ProjectEnrollmentStatus,
  ProjectEnrollmentCategory,
  IamPolicy,
  IamBinding,
  Operation,
  WorkloadIdentityPool,
} from "../../types";
import { gapiRequest } from "./core";
import { getProjectIamPolicy, setProjectIamPolicy } from "./iam";
import { toErrorMessage } from "../../utils/errors";

export const getProjectNumber = async (projectId: string): Promise<string> => {
  const response = await gapiRequest<{ projectNumber: string }>(
    `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}`,
    "GET",
    projectId,
  );
  return response.projectNumber;
};

export const getProject = async (
  projectNumberOrId: string,
): Promise<{ projectId: string; projectNumber: string; name?: string }> => {
  const response = await gapiRequest<{ projectId: string; projectNumber: string; name?: string }>(
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

  const response = await gapiRequest<{ services?: Array<{ config: { name: string } }> }>(
    `https://serviceusage.googleapis.com/v1/projects/${projectId}/services?filter=state:ENABLED&pageSize=200`,
    "GET",
    projectId,
  );
  const enabledServices = new Set(
    (response.services || []).map((s) => s.config.name),
  );

  const enabled: string[] = [];
  const disabled: string[] = [];

  requiredApis.forEach((api) => {
    if (enabledServices.has(api)) enabled.push(api);
    else disabled.push(api);
  });

  return { enabled, disabled };
};

export const batchEnableApis = async (projectId: string, apis: string[]): Promise<Operation> => {
  return gapiRequest<Operation>(
    `https://serviceusage.googleapis.com/v1/projects/${projectId}/services:batchEnable`,
    "POST",
    projectId,
    undefined,
    { serviceIds: apis },
  );
};

export const getServiceUsageOperation = async (name: string): Promise<Operation> => {
  return gapiRequest<Operation>(`https://serviceusage.googleapis.com/v1/${name}`);
};

export const generateDiscoveryEngineServiceIdentity = async (projectId: string): Promise<Record<string, unknown>> => {
  const url = `https://serviceusage.googleapis.com/v1beta1/projects/${projectId}/services/discoveryengine.googleapis.com:generateServiceIdentity`;
  return gapiRequest<Record<string, unknown>>(url, "POST", projectId, undefined, {});
};

export const checkDiscoveryEngineServiceAgent = async (
  projectId: string,
  projectNumber: string,
): Promise<ServiceAgentValidation> => {
  const email = `service-${projectNumber}@gcp-sa-discoveryengine.iam.gserviceaccount.com`;
  const memberKey = `serviceAccount:${email}`;
  const requiredRole = "roles/discoveryengine.serviceAgent";
  const recommendedRoles = [
    "roles/aiplatform.user",
    "roles/storage.objectViewer",
    "roles/bigquery.dataViewer",
  ];

  try {
    const policy = await getProjectIamPolicy(projectId);
    const assignedRoles: string[] = [];

    if (policy && policy.bindings) {
      for (const binding of policy.bindings) {
        if (
          binding.members &&
          binding.members.some((m: string) => m.toLowerCase() === memberKey.toLowerCase())
        ) {
          assignedRoles.push(binding.role);
        }
      }
    }

    const hasRequiredRole = assignedRoles.includes(requiredRole);
    const missingRecommendedRoles = recommendedRoles.filter(
      (r) => !assignedRoles.includes(r),
    );

    return {
      email,
      exists: true,
      hasRequiredRole,
      requiredRole,
      assignedRoles,
      missingRecommendedRoles,
      status: hasRequiredRole ? "READY" : "MISSING_ROLE",
    };
  } catch (err: unknown) {
    const errMsg = toErrorMessage(err);
    const isPermissionDenied =
      errMsg.includes("403") ||
      errMsg.toLowerCase().includes("permission") ||
      errMsg.toLowerCase().includes("forbidden");

    return {
      email,
      exists: true,
      hasRequiredRole: false,
      requiredRole,
      assignedRoles: [],
      missingRecommendedRoles: recommendedRoles,
      status: isPermissionDenied ? "PERMISSION_DENIED" : "NOT_FOUND",
      errorMessage: isPermissionDenied
        ? "Insufficient permissions to inspect project IAM policy (roles/resourcemanager.projectIamViewer or roles/owner required)."
        : `Could not check service agent status: ${errMsg}`,
    };
  }
};

export const grantDiscoveryEngineServiceAgentRole = async (
  projectId: string,
  projectNumber: string,
  extraRoles: string[] = [],
): Promise<IamPolicy> => {
  // 1. Ensure service identity is initialized by Google Service Usage
  try {
    await generateDiscoveryEngineServiceIdentity(projectId);
  } catch (e) {
    console.warn("generateServiceIdentity warning (may already exist):", e);
  }

  const email = `service-${projectNumber}@gcp-sa-discoveryengine.iam.gserviceaccount.com`;
  const memberKey = `serviceAccount:${email}`;
  const rolesToEnsure = ["roles/discoveryengine.serviceAgent", ...extraRoles];

  const policy = await getProjectIamPolicy(projectId);
  const bindings = policy.bindings || [];

  rolesToEnsure.forEach((role) => {
    const binding = bindings.find((b: IamBinding) => b.role === role);
    if (binding) {
      if (!binding.members) binding.members = [];
      if (
        !binding.members.some((m: string) => m.toLowerCase() === memberKey.toLowerCase())
      ) {
        binding.members.push(memberKey);
      }
    } else {
      bindings.push({
        role,
        members: [memberKey],
      });
    }
  });

  policy.bindings = bindings;
  return setProjectIamPolicy(projectId, policy);
};

export const validateUserPermissions = async (
  projectId: string,
): Promise<UserPermissionsValidation> => {
  const permissionsToCheck: {
    permission: string;
    category:
      | "Discovery Engine Admin"
      | "IAM & Security"
      | "Service Management"
      | "Vertex AI / Reasoning";
    description: string;
    recommendedRole: string;
    critical?: boolean;
  }[] = [
    {
      permission: "discoveryengine.engines.get",
      category: "Discovery Engine Admin",
      description: "View Assistants & App Engines",
      recommendedRole: "roles/discoveryengine.admin",
      critical: true,
    },
    {
      permission: "discoveryengine.engines.update",
      category: "Discovery Engine Admin",
      description: "Modify Assistant & Feature Configuration",
      recommendedRole: "roles/discoveryengine.admin",
      critical: true,
    },
    {
      permission: "discoveryengine.engines.list",
      category: "Discovery Engine Admin",
      description: "List all Assistants & App Engines",
      recommendedRole: "roles/discoveryengine.admin",
      critical: true,
    },
    {
      permission: "discoveryengine.dataStores.get",
      category: "Discovery Engine Admin",
      description: "View and query DataStores",
      recommendedRole: "roles/discoveryengine.admin",
    },
    {
      permission: "discoveryengine.assistants.get",
      category: "Discovery Engine Admin",
      description: "View Assistant chat configs & prompt chips",
      recommendedRole: "roles/discoveryengine.admin",
    },
    {
      permission: "resourcemanager.projects.get",
      category: "IAM & Security",
      description: "Get project metadata & number",
      recommendedRole: "roles/viewer",
    },
    {
      permission: "resourcemanager.projects.getIamPolicy",
      category: "IAM & Security",
      description: "Audit project IAM policy & service agents",
      recommendedRole: "roles/resourcemanager.projectIamAdmin",
    },
    {
      permission: "resourcemanager.projects.setIamPolicy",
      category: "IAM & Security",
      description: "Assign roles to service agents & users",
      recommendedRole: "roles/resourcemanager.projectIamAdmin",
    },
    {
      permission: "serviceusage.services.list",
      category: "Service Management",
      description: "Check enabled Google Cloud APIs",
      recommendedRole: "roles/serviceusage.serviceUsageViewer",
    },
    {
      permission: "serviceusage.services.enable",
      category: "Service Management",
      description: "1-click enable required Google APIs",
      recommendedRole: "roles/serviceusage.serviceUsageAdmin",
    },
    {
      permission: "aiplatform.reasoningEngines.list",
      category: "Vertex AI / Reasoning",
      description: "List Vertex AI Agent Engines",
      recommendedRole: "roles/aiplatform.user",
    },
  ];

  try {
    const rawPermissions = permissionsToCheck.map((p) => p.permission);
    const response = await gapiRequest<{ permissions?: string[] }>(
      `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:testIamPermissions`,
      "POST",
      projectId,
      undefined,
      { permissions: rawPermissions },
    );

    const grantedSet = new Set<string>(response.permissions || []);
    const items: UserPermissionItem[] = permissionsToCheck.map((p) => ({
      permission: p.permission,
      category: p.category,
      granted: grantedSet.has(p.permission),
      description: p.description,
      recommendedRole: p.recommendedRole,
    }));

    const missingCritical = permissionsToCheck
      .filter((p) => p.critical && !grantedSet.has(p.permission))
      .map((p) => p.permission);

    const grantedCount = items.filter((i) => i.granted).length;
    const canInspectIam = grantedSet.has("resourcemanager.projects.getIamPolicy");
    const hasAdminAccess = missingCritical.length === 0;

    return {
      tested: true,
      canInspectIam,
      hasAdminAccess,
      grantedCount,
      totalCount: items.length,
      items,
      missingCritical,
    };
  } catch (err: unknown) {
    const errMsg = toErrorMessage(err);
    return {
      tested: false,
      canInspectIam: false,
      hasAdminAccess: false,
      grantedCount: 0,
      totalCount: permissionsToCheck.length,
      items: permissionsToCheck.map((p) => ({
        permission: p.permission,
        category: p.category,
        granted: false,
        description: p.description,
        recommendedRole: p.recommendedRole,
      })),
      missingCritical: [],
      notice: `Could not test project IAM permissions: ${errMsg}. If you only have resource-scoped access, you can still proceed into the app.`,
    };
  }
};

const enrollmentCache = new Map<string, ProjectEnrollmentStatus>();
let lastActiveProjectId: string | null = null;

export const getCachedProjectEnrollment = (
  projectId?: string,
): ProjectEnrollmentStatus | null => {
  const key = projectId || lastActiveProjectId;
  if (!key) return null;
  return enrollmentCache.get(key) || null;
};

export const setCachedProjectEnrollment = (
  status: ProjectEnrollmentStatus,
): void => {
  if (!status.projectId) return;
  lastActiveProjectId = status.projectId;
  enrollmentCache.set(status.projectId, status);
};

export const clearCachedProjectEnrollment = (): void => {
  enrollmentCache.clear();
  lastActiveProjectId = null;
};

/**
 * Probes the active GCP project's visibility and preview allowlist enrollments
 * against Google Cloud ESF (`GOOGLE_INTERNAL`, `TRUSTED_TESTER`,
 * `NLME_API_USER` / `SPARK_PREVIEW`, and `agentregistry.googleapis.com`).
 */
export const probeProjectEnrollment = async (
  projectId: string,
): Promise<ProjectEnrollmentStatus> => {
  let googleInternal = false;
  let googleInternalProbed = false;
  let googleInternalReason =
    "Standard external customer project (GOOGLE_INTERNAL fields filtered by ESF).";

  try {
    const projectRes = await gapiRequest<Record<string, unknown>>(
      `https://discoveryengine.googleapis.com/v1alpha/projects/${projectId}`,
      "GET",
      projectId,
      undefined,
      undefined,
      undefined,
      true,
    );
    googleInternalProbed = true;
    const customerCfg = projectRes?.customerProvidedConfig as
      | Record<string, unknown>
      | undefined;
    const hasInternalFields =
      projectRes?.experienceState !== undefined ||
      projectRes?.documentSizeQuota !== undefined ||
      projectRes?.quotaUsageAndLimit !== undefined ||
      projectRes?.vpcScConfig !== undefined ||
      projectRes?.oauthClientId !== undefined ||
      customerCfg?.optOutDisableDataStoreServing !== undefined;

    if (hasInternalFields) {
      googleInternal = true;
      googleInternalReason =
        "Verified GOOGLE_INTERNAL visibility fields returned by Discovery Engine Project API.";
    }
  } catch (err: unknown) {
    googleInternal = false;
    googleInternalProbed = false;
    googleInternalReason = `Could not inspect Discovery Engine Project resource (${toErrorMessage(err)}); defaulting to external customer mode.`;
  }

  // 2. TRUSTED_TESTER / ASSISTANT_USER check
  let trustedTester = false;
  let trustedTesterProbed = false;
  let trustedTesterReason =
    "Project is not enrolled in TRUSTED_TESTER / ASSISTANT_USER allowlist.";

  if (googleInternal) {
    trustedTester = true;
    trustedTesterProbed = true;
    trustedTesterReason =
      "Implicitly granted via GOOGLE_INTERNAL project visibility.";
  } else {
    try {
      await gapiRequest<Record<string, unknown>>(
        `https://discoveryengine.googleapis.com/v1alpha/projects/${projectId}/locations/global:listConnectorSources`,
        "POST",
        projectId,
        undefined,
        { pageSize: 1 },
        undefined,
        true,
      );
      trustedTester = true;
      trustedTesterProbed = true;
      trustedTesterReason =
        "Verified TRUSTED_TESTER visibility via DataConnectorService.ListConnectorSources.";
    } catch (err: unknown) {
      trustedTester = false;
      trustedTesterProbed = true;
      trustedTesterReason = `Not enrolled in TRUSTED_TESTER allowlist (${toErrorMessage(err)}).`;
    }
  }

  // 3. NLME_API_USER / SPARK_PREVIEW check (NotebookLM :interactSources)
  let notebookLmApiUser = false;
  let notebookLmProbed = false;
  let notebookLmReason =
    "Project is not enrolled in NLME_API_USER / SPARK_PREVIEW allowlist.";

  if (googleInternal) {
    notebookLmApiUser = true;
    notebookLmProbed = true;
    notebookLmReason =
      "Implicitly granted via GOOGLE_INTERNAL project visibility.";
  } else {
    try {
      await gapiRequest<Record<string, unknown>>(
        `https://discoveryengine.googleapis.com/v1alpha/projects/${projectId}/locations/global/notebooks/_enrollment_probe_:interactSources`,
        "POST",
        projectId,
        undefined,
        {},
        undefined,
        true,
      );
      notebookLmApiUser = true;
      notebookLmProbed = true;
      notebookLmReason =
        "Verified NLME_API_USER / SPARK_PREVIEW visibility via NotebookService.InteractSources.";
    } catch (err: unknown) {
      const msg = toErrorMessage(err);
      notebookLmProbed = true;
      // If ESF passes the request through VISIBILITY_FILTER to the backend,
      // the backend returns 400 INVALID_ARGUMENT or a structured resource error
      // referencing '_enrollment_probe_'. If ESF blocks the method at the visibility
      // filter layer, it returns 403 PERMISSION_DENIED or a generic 404 method error.
      const reachedBackend =
        msg.includes("400") ||
        msg.includes("INVALID_ARGUMENT") ||
        msg.includes("_enrollment_probe_");
      if (reachedBackend) {
        notebookLmApiUser = true;
        notebookLmReason =
          "Verified NLME_API_USER / SPARK_PREVIEW visibility (request passed ESF visibility filter).";
      } else {
        notebookLmApiUser = false;
        notebookLmReason = `Not enrolled in NLME_API_USER / SPARK_PREVIEW allowlist (${msg}).`;
      }
    }
  }

  // 4. Cloud Agent Registry API enablement check
  const agentRegistryEnabled = await checkServiceEnabled(
    projectId,
    "agentregistry.googleapis.com",
  );
  const agentRegistryReason = agentRegistryEnabled
    ? "agentregistry.googleapis.com is enabled on this project."
    : "agentregistry.googleapis.com is disabled on this project.";

  const categories: ProjectEnrollmentCategory[] = [
    {
      id: "googleInternal",
      label: "Google Internal (GOOGLE_INTERNAL)",
      visibilityTag: "GOOGLE_INTERNAL",
      enrolled: googleInternal,
      probed: googleInternalProbed,
      reason: googleInternalReason,
      gatedFeatures: [
        "Native Connector Tool Refresh RPC (:refreshDataConnectorTools)",
        "Engine User Memories (KnowledgeGraphService /memories)",
        "Assistant Policy: agentReasoningHidden & toolConfig",
        "Engine: effectiveFeatures & includeCrossDomainDocuments",
      ],
    },
    {
      id: "trustedTester",
      label: "Trusted Tester & Assistant Preview (TRUSTED_TESTER)",
      visibilityTag: "TRUSTED_TESTER, ASSISTANT_USER",
      enrolled: trustedTester,
      probed: trustedTesterProbed,
      reason: trustedTesterReason,
      gatedFeatures: [
        "Assistant: vertexAiSearchToolConfig & mapsGroundingType",
        "DataConnector: connectorTools & supportsDynamicToolFetching",
        "WidgetConfig: actionConnector, starterTier, desktopEnabled",
      ],
    },
    {
      id: "notebookLmApiUser",
      label: "NotebookLM Source Interaction (NLME_API_USER / SPARK_PREVIEW)",
      visibilityTag: "NLME_API_USER, SPARK_PREVIEW",
      enrolled: notebookLmApiUser,
      probed: notebookLmProbed,
      reason: notebookLmReason,
      gatedFeatures: [
        "NotebookLM Interactive Source Chat (:interactSources)",
      ],
    },
    {
      id: "agentRegistryEnabled",
      label: "Cloud Agent & Skills Registry (v1alpha)",
      visibilityTag: "agentregistry.googleapis.com",
      enrolled: agentRegistryEnabled,
      probed: true,
      reason: agentRegistryReason,
      gatedFeatures: [
        "Skills Registry CRUD (createSkill, updateSkill, deleteSkill)",
        "MCP Server & Endpoint Registry Discovery",
      ],
    },
  ];

  const status: ProjectEnrollmentStatus = {
    projectId,
    checkedAt: new Date().toISOString(),
    googleInternal,
    trustedTester,
    notebookLmApiUser,
    agentRegistryEnabled,
    categories,
  };

  setCachedProjectEnrollment(status);
  return status;
};

export const runComprehensiveProjectValidation = async (
  projectId: string,
  projectNumber: string,
): Promise<ComprehensiveValidationResult> => {
  const [apis, serviceAgent, userPermissions, enrollment] = await Promise.all([
    validateEnabledApis(projectId),
    checkDiscoveryEngineServiceAgent(projectId, projectNumber),
    validateUserPermissions(projectId),
    probeProjectEnrollment(projectId),
  ]);

  if (projectNumber && projectNumber !== projectId) {
    enrollmentCache.set(projectNumber, enrollment);
  }

  return {
    apis,
    serviceAgent,
    userPermissions,
    enrollment,
  };
};

export const validateWorkforcePool = async (
  poolName: string,
  config: Config,
): Promise<WorkloadIdentityPool> => {
  const url = `https://iam.googleapis.com/v1/${poolName}`;
  return gapiRequest<WorkloadIdentityPool>(url, "GET", config.projectId);
};

export const checkServiceEnabled = async (
  projectId: string,
  serviceName: string,
): Promise<boolean> => {
  try {
    const response = await gapiRequest<{ state?: string }>(
      `https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${serviceName}`,
      "GET",
      projectId,
      undefined,
      undefined,
      undefined,
      true,
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
  await gapiRequest<Operation>(
    `https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${serviceName}:enable`,
    "POST",
    projectId,
  );
};
