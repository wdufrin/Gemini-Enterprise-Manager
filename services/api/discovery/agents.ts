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
  Agent,
  Config,
  CannedQuery,
  AgentViewResponse,
  TransferAgentOwnerRequest,
  TransferAgentOwnerOptions,
} from "../../../types";
import {
  gapiRequest,
  getDiscoveryEngineUrl,
  DISCOVERY_API_VERSION,
} from "../core";
import { getEngine, updateEngine } from "./engines";

export const getAgent = async (name: string, config: Config) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  return gapiRequest<Agent>(
    `${baseUrl}/${DISCOVERY_API_VERSION}/${name}`,
    "GET",
    config.projectId,
  );
};

export const getAgentView = async (name: string, config: Config): Promise<AgentViewResponse> => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  return gapiRequest<AgentViewResponse>(
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
  payload: Partial<Agent> | Record<string, unknown>,
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

export const createDiscoveryAgent = createAgent;

const resolveFullAgentResourceName = (name: string, config: Config): string => {
  if (name && name.startsWith("projects/")) {
    return name;
  }
  return `projects/${config.projectId}/locations/${config.appLocation}/collections/${config.collectionId || "default_collection"}/engines/${config.appId}/assistants/${config.assistantId || "default_assistant"}/agents/${name.split("/").pop() || name}`;
};

export const updateAgent = async (
  agent: Partial<Agent> & { name: string },
  payload: Partial<Agent> | Record<string, unknown>,
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
  if (payload.dataStoreSpecs) updateMask.push("data_store_specs");
  if (payload.dataConnectors) updateMask.push("data_connectors");
  if (payload.sharingConfig) updateMask.push("sharing_config");
  if (payload.authorizations) updateMask.push("authorizations");
  if (payload.authorizationConfig) updateMask.push("authorization_config");
  if (payload.observabilityConfig) updateMask.push("observabilityConfig");

  const sanitizedPayload: Record<string, unknown> = { ...payload };
  if (
    sanitizedPayload.lowCodeAgentDefinition &&
    typeof sanitizedPayload.lowCodeAgentDefinition === "object"
  ) {
    // Strip immutable/output-only subfields enforced by kLowCodeAgentImmutableSubFields in Discovery Engine
    const lowCodeClone = {
      ...(sanitizedPayload.lowCodeAgentDefinition as Record<string, unknown>),
    };
    delete lowCodeClone.deployedNodes;
    delete lowCodeClone.deployed_nodes;
    delete lowCodeClone.deploymentInfo;
    delete lowCodeClone.deployment_info;
    delete lowCodeClone.deployedRootAgentId;
    delete lowCodeClone.deployed_root_agent_id;
    delete lowCodeClone.validationErrors;
    delete lowCodeClone.validation_errors;
    delete lowCodeClone.ownerName;
    delete lowCodeClone.owner_name;
    sanitizedPayload.lowCodeAgentDefinition = lowCodeClone;
  }

  const agentName = resolveFullAgentResourceName(agent.name, config);

  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${agentName}?updateMask=${updateMask.join(",")}`;
  return gapiRequest<Agent>(url, "PATCH", config.projectId, undefined, sanitizedPayload);
};

/**
 * Deploys the draft nodes of a Low-Code agent (`low_code_agent_definition.nodes` -> `deployed_nodes`)
 * via `POST /v1alpha/{name}:deployLowCode`.
 */
export const deployLowCodeAgent = async (
  name: string,
  config: Config,
  deployMode: "DEPLOY" | "REFRESH_CREDENTIALS_ONLY" = "DEPLOY",
): Promise<Record<string, unknown>> => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const agentName = resolveFullAgentResourceName(name, config);
  return gapiRequest<Record<string, unknown>>(
    `${baseUrl}/${DISCOVERY_API_VERSION}/${agentName}:deployLowCode`,
    "POST",
    config.projectId,
    undefined,
    { deployMode },
  );
};

/**
 * Publishes a Workflow / Agent Designer agent (`workflow_agent_definition`) to a new active revision
 * via `POST /v1alpha/{name}:publish`.
 */
export const publishAgent = async (
  name: string,
  config: Config,
  options?: {
    label?: string;
    revisionId?: string;
    publishMode?: "PUBLISH" | "REFRESH_CREDENTIALS_ONLY";
  },
): Promise<{ agent?: Agent; [key: string]: unknown }> => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const agentName = resolveFullAgentResourceName(name, config);
  const body: Record<string, unknown> = {
    publishMode: options?.publishMode || "PUBLISH",
  };
  if (options?.label) body.label = options.label;
  if (options?.revisionId) body.revisionId = options.revisionId;

  return gapiRequest<{ agent?: Agent; [key: string]: unknown }>(
    `${baseUrl}/${DISCOVERY_API_VERSION}/${agentName}:publish`,
    "POST",
    config.projectId,
    undefined,
    body,
  );
};

export interface BulkObservabilityResult {
  total: number;
  updated: number;
  alreadyCompliant: number;
  failed: number;
  errors: string[];
  legacyAuthCount: number;
}

export const bulkEnforceAgentsObservability = async (
  agents: Agent[],
  config: Config,
  options: {
    observabilityEnabled?: boolean;
    sensitiveLoggingEnabled?: boolean;
  } = { observabilityEnabled: true, sensitiveLoggingEnabled: false },
): Promise<BulkObservabilityResult> => {
  const result: BulkObservabilityResult = {
    total: agents.length,
    updated: 0,
    alreadyCompliant: 0,
    failed: 0,
    errors: [],
    legacyAuthCount: 0,
  };

  const targetObs = options.observabilityEnabled !== false;
  const targetSensitive = Boolean(options.sensitiveLoggingEnabled);

  for (const agent of agents) {
    const currentObs = Boolean(agent.observabilityConfig?.observabilityEnabled);
    const currentSensitive = Boolean(agent.observabilityConfig?.sensitiveLoggingEnabled);

    if (currentObs === targetObs && currentSensitive === targetSensitive) {
      result.alreadyCompliant++;
      continue;
    }

    try {
      await updateAgent(
        agent,
        {
          observabilityConfig: {
            observabilityEnabled: targetObs,
            sensitiveLoggingEnabled: targetSensitive,
          },
        },
        config,
      );
      result.updated++;
    } catch (err: unknown) {
      result.failed++;
      const raw = (err as Error).message || String(err);
      let clean = raw;
      if (raw.includes("agent.authorizations") && raw.includes("deprecated")) {
        result.legacyAuthCount++;
        clean = "Legacy Schema: Created with deprecated 'agent.authorizations' field. Google Cloud API blocks in-place updates to this resource until re-created with 'authorizationConfig'.";
      } else if (clean.includes("[ORIGINAL ERROR]")) {
        clean = clean.split("[ORIGINAL ERROR]")[0].trim().replace(/\(\s*$/, "").trim();
      }
      result.errors.push(
        `${agent.displayName || agent.name.split("/").pop() || "Agent"}: ${clean}`,
      );
    }
  }

  return result;
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
  await ensureSkillSharingOnEngine(config);

  if (agent.state === "PRIVATE" || !agent.state) {
    try {
      await requestAgentReview(agent.name, config);
    } catch (e) {
      console.warn("requestAgentReview failed, attempting direct state update:", e);
    }
  }

  try {
    const current = await getAgent(agent.name, config);
    if (current.state === "DISABLED" || current.state === "SUSPENDED") {
      await enableAgent(agent.name, config);
    }
  } catch (e) {
    console.warn("enableAgent failed, proceeding to sharing_config:", e);
  }

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
  payload: Partial<Agent> | Record<string, unknown>,
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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WIF_SUBJECT_REGEX = /^(principal:)?\/\/iam\.googleapis\.com\/.+\/subject\/.+$/;

/**
 * Returns true if the agent is a custom no-code / low-code / workflow
 * employee-made agent that supports ownership transfer.
 */
export const isCustomNoCodeAgent = (agent: Partial<Agent> | null | undefined): boolean => {
  if (!agent) return false;
  if (
    agent.lowCodeAgentDefinition ||
    agent.workflowAgentDefinition ||
    agent.noCodeAgentDefinition
  ) {
    return true;
  }
  const normalizedType = (agent.agentType || "").toUpperCase();
  if (
    normalizedType === "LOW_CODE" ||
    normalizedType === "NO_CODE" ||
    normalizedType === "WORKFLOW" ||
    normalizedType === "LOW-CODE" ||
    normalizedType === "NO-CODE"
  ) {
    return true;
  }
  const normalizedOrigin = (agent.agentOrigin || "").toUpperCase();
  if (normalizedOrigin === "AGENT_DESIGNER" || normalizedOrigin === "EMPLOYEE_MADE") {
    return true;
  }
  return false;
};

/**
 * Validates and normalizes the target principal for TransferAgentOwner.
 * Accepts:
 * - Google/Cloud Identity email: `alice@example.com` or `user:alice@example.com` -> `user:alice@example.com`
 * - Workforce Identity Federation subject principal:
 *   `principal://iam.googleapis.com/locations/global/workforcePools/POOL_ID/subject/SUBJECT_ID`
 *   or `//iam.googleapis.com/locations/global/workforcePools/POOL_ID/subject/SUBJECT_ID`
 */
export const formatTransferTargetPrincipal = (rawPrincipal: string): string => {
  const trimmed = (rawPrincipal || "").trim();
  if (!trimmed) {
    throw new Error("A new owner email or Workforce Identity principal is required.");
  }

  const lower = trimmed.toLowerCase();
  if (
    lower === "allusers" ||
    lower === "allauthenticatedusers" ||
    lower.startsWith("group:") ||
    lower.startsWith("domain:") ||
    lower.startsWith("principalset://") ||
    lower.startsWith("//iam.googleapis.com/locations/global/workforcepools/") && lower.includes("/group/") ||
    lower.startsWith("serviceaccount:")
  ) {
    throw new Error(
      "Agent ownership can only be transferred to a single user identity (user:<email> or principal://iam.googleapis.com/.../subject/<subject_id>). Groups, domains, service accounts, and public principals are not supported.",
    );
  }

  if (trimmed.startsWith("principal://") || trimmed.startsWith("//iam.googleapis.com/")) {
    if (!WIF_SUBJECT_REGEX.test(trimmed)) {
      throw new Error(
        "Workforce Identity principal must match '//iam.googleapis.com/locations/global/workforcePools/<POOL_ID>/subject/<SUBJECT_ID>'.",
      );
    }
    return trimmed.startsWith("principal:") ? trimmed : `principal:${trimmed}`;
  }

  const emailCandidate = trimmed.startsWith("user:")
    ? trimmed.slice("user:".length).trim()
    : trimmed;

  if (!EMAIL_REGEX.test(emailCandidate)) {
    throw new Error(
      "Must be a valid email address (e.g. user@example.com) or a Workforce Identity principal ('principal://iam.googleapis.com/.../subject/<value>').",
    );
  }

  return `user:${emailCandidate}`;
};

export const buildTransferAgentOwnerPayload = (
  options: TransferAgentOwnerOptions,
): TransferAgentOwnerRequest => {
  const previousOwnerDisposition =
    options.previousOwnerDisposition || "KEEP_AS_AGENT_USER";

  if (options.toSelf) {
    return {
      currentUser: {},
      previousOwnerDisposition,
    };
  }

  const principal = formatTransferTargetPrincipal(options.targetPrincipal || "");
  return {
    targetPrincipal: {
      principal,
    },
    previousOwnerDisposition,
  };
};

/**
 * Transfers ownership of a shared custom no-code / low-code / workflow agent
 * via `POST /v1alpha/{name}:transferAgentOwner`.
 *
 * Requires `roles/discoveryengine.agentspaceAdmin` or `roles/discoveryengine.admin`.
 */
export const transferAgentOwner = async (
  name: string,
  options: TransferAgentOwnerOptions,
  config: Config,
): Promise<Record<string, unknown>> => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const agentName =
    name && name.startsWith("projects/")
      ? name
      : `projects/${config.projectId}/locations/${config.appLocation}/collections/${config.collectionId || "default_collection"}/engines/${config.appId}/assistants/${config.assistantId || "default_assistant"}/agents/${name.split("/").pop() || name}`;

  const payload = buildTransferAgentOwnerPayload(options);

  return gapiRequest<Record<string, unknown>>(
    `${baseUrl}/${DISCOVERY_API_VERSION}/${agentName}:transferAgentOwner`,
    "POST",
    config.projectId,
    undefined,
    payload,
  );
};

export const deleteResource = async (name: string, config: Config) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  return gapiRequest(
    `${baseUrl}/${DISCOVERY_API_VERSION}/${name}`,
    "DELETE",
    config.projectId,
  );
};

export const listPromptChips = async (engineName: string) => {
  const parts = engineName.split("/");
  const location = parts[3];
  const projectId = parts[1];
  const baseUrl = getDiscoveryEngineUrl(location);
  const url = `${baseUrl}/v1alpha/${engineName}/assistants/default_assistant/cannedQueries`;

  try {
    const response = await gapiRequest<{ cannedQueries?: CannedQuery[] }>(
      url,
      "GET",
      projectId,
      { pageSize: 1000 },
    );

    return (response.cannedQueries || []).map((item: CannedQuery) => ({
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
    return [];
  }
};

export const updatePromptChip = async (
  engineName: string,
  chipName: string,
  payload: Partial<CannedQuery> | Record<string, unknown>,
  params: Record<string, unknown> = {},
) => {
  const parts = engineName.split("/");
  const location = parts[3];
  const projectId = parts[1];
  const baseUrl = getDiscoveryEngineUrl(location);
  const url = `${baseUrl}/v1alpha/${engineName}/assistants/default_assistant/cannedQueries/${chipName}`;

  return gapiRequest<CannedQuery>(url, "PATCH", projectId, params, payload);
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

  return gapiRequest<Record<string, unknown>>(url, "DELETE", projectId);
};

export const createPromptChip = async (
  engineName: string,
  payload: Partial<CannedQuery> | Record<string, unknown>,
) => {
  const parts = engineName.split("/");
  const location = parts[3];
  const projectId = parts[1];
  const baseUrl = getDiscoveryEngineUrl(location);
  const chipName = (payload as { name?: string }).name || `custom_${Date.now()}`;
  const url = `${baseUrl}/v1alpha/${engineName}/assistants/default_assistant/cannedQueries`;

  return gapiRequest<CannedQuery>(
    url,
    "POST",
    projectId,
    { cannedQueryId: chipName },
    payload,
  );
};
