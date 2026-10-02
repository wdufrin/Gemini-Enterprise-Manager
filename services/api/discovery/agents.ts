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
  AdminPublishAndShareOptions,
  AdminPublishAndShareResult,
  IamPolicy,
} from "../../../types";
import {
  gapiRequest,
  getDiscoveryEngineUrl,
  DISCOVERY_API_VERSION,
} from "../core";
import { getEngine, updateEngine } from "./engines";
import { getAgentIamPolicy, setAgentIamPolicy } from "../iam";

export const getAgent = async (name: string, config: Config) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const agentName = resolveFullAgentResourceName(name, config);
  return gapiRequest<Agent>(
    `${baseUrl}/${DISCOVERY_API_VERSION}/${agentName}`,
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
  if (payload.description !== undefined) updateMask.push("description");
  if (payload.icon) updateMask.push("icon");
  if (payload.starterPrompts) updateMask.push("starter_prompts");
  if (payload.adkAgentDefinition) updateMask.push("adk_agent_definition");
  if (payload.a2aAgentDefinition) updateMask.push("a2a_agent_definition");
  if (payload.lowCodeAgentDefinition)
    updateMask.push("low_code_agent_definition");
  if (payload.workflowAgentDefinition)
    updateMask.push("workflow_agent_definition");
  if (payload.agentDesignerAgentDefinition)
    updateMask.push("agent_designer_agent_definition");
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
    const draftNodes = Array.isArray(lowCodeClone.nodes) ? lowCodeClone.nodes : [];
    const deployedNodes = Array.isArray(lowCodeClone.deployedNodes)
      ? lowCodeClone.deployedNodes
      : Array.isArray(lowCodeClone.deployed_nodes)
        ? lowCodeClone.deployed_nodes
        : [];
    if (draftNodes.length === 0 && deployedNodes.length > 0) {
      lowCodeClone.nodes = deployedNodes;
    }
    if (!lowCodeClone.rootAgentId && lowCodeClone.deployedRootAgentId) {
      lowCodeClone.rootAgentId = lowCodeClone.deployedRootAgentId;
    }
    delete lowCodeClone.deployedNodes;
    delete lowCodeClone.deployed_nodes;
    delete lowCodeClone.deploymentInfo;
    delete lowCodeClone.deployment_info;
    delete lowCodeClone.deployedRootAgentId;
    delete lowCodeClone.deployed_root_agent_id;
    delete lowCodeClone.deployedSchedules;
    delete lowCodeClone.deployed_schedules;
    delete lowCodeClone.validationErrors;
    delete lowCodeClone.validation_errors;
    delete lowCodeClone.owner;
    delete lowCodeClone.ownerName;
    delete lowCodeClone.owner_name;
    delete lowCodeClone.session;
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

export const initIamPolicy = async (
  name: string,
  config: Config,
): Promise<Record<string, unknown>> => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const agentName = resolveFullAgentResourceName(name, config);
  return gapiRequest<Record<string, unknown>>(
    `${baseUrl}/${DISCOVERY_API_VERSION}/${agentName}:initIamPolicy`,
    "POST",
    config.projectId,
    undefined,
    {},
  );
};

export const requestAgentReview = async (name: string, config: Config) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const agentName = resolveFullAgentResourceName(name, config);
  return gapiRequest<Agent>(
    `${baseUrl}/${DISCOVERY_API_VERSION}/${agentName}:requestAgentReview`,
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
  const agentName = resolveFullAgentResourceName(name, config);
  return gapiRequest(
    `${baseUrl}/${DISCOVERY_API_VERSION}/${agentName}`,
    "DELETE",
    config.projectId,
  );
};

export const disableAgent = async (name: string, config: Config) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const agentName = resolveFullAgentResourceName(name, config);
  await gapiRequest(
    `${baseUrl}/${DISCOVERY_API_VERSION}/${agentName}:disableAgent`,
    "POST",
    config.projectId,
  );
  return getAgent(agentName, config);
};

export const enableAgent = async (name: string, config: Config) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const agentName = resolveFullAgentResourceName(name, config);
  await gapiRequest(
    `${baseUrl}/${DISCOVERY_API_VERSION}/${agentName}:enableAgent`,
    "POST",
    config.projectId,
  );
  return getAgent(agentName, config);
};

/**
 * Shares an employee-made agent in-place using the Discovery Engine v1main/v1alpha
 * lifecycle RPCs (`:deployLowCode`/`:publish` -> `:initIamPolicy` -> `:requestAgentReview` -> `:enableAgent`).
 *
 * Note: In Discovery Engine, `:initIamPolicy` and `:requestAgentReview` on a `PRIVATE` agent
 * strictly require `owner == caller_cpi`. If an Admin is sharing a `PRIVATE` agent owned by
 * another user, use `adminPublishAndShareForUser` instead.
 */
export const shareAgent = async (name: string, config: Config): Promise<Agent> => {
  const agentName = resolveFullAgentResourceName(name, config);
  const current = await getAgent(agentName, config);

  const isPermissionError = (err: unknown): boolean => {
    const msg = ((err as Error)?.message || String(err)).toLowerCase();
    return (
      msg.includes("403") ||
      msg.includes("permission_denied") ||
      msg.includes("permission denied") ||
      msg.includes("does not have permission to access the agent") ||
      msg.includes("does not have permission to deploy the low code agent")
    );
  };

  try {
    if (
      current.lowCodeAgentDefinition &&
      !current.lowCodeAgentDefinition.deployedRootAgentId
    ) {
      await deployLowCodeAgent(agentName, config, "DEPLOY");
    } else if (
      (current.workflowAgentDefinition ||
        current.agentDesignerAgentDefinition ||
        current.skillAgentDefinition) &&
      !current.activeRevision
    ) {
      await publishAgent(agentName, config, { publishMode: "PUBLISH" });
    }

    if (current.state === "PRIVATE" || !current.state) {
      await initIamPolicy(agentName, config);
      await requestAgentReview(agentName, config);
    }
  } catch (err: unknown) {
    if (isPermissionError(err)) {
      throw new Error(
        "Only the agent owner can directly share a PRIVATE agent in-place (Discovery Engine RequestAgentReview checks owner == caller). Use 'Admin Publish & Share for User' to clone, publish, share, and transfer ownership to the user.",
      );
    }
    throw err;
  }

  const afterReview = await getAgent(agentName, config);
  if (afterReview.state === "DISABLED" || afterReview.state === "SUSPENDED") {
    return enableAgent(agentName, config);
  }
  return afterReview;
};

const EMAIL_REGEX = /^[^\s@:]+@[^\s@:]+\.[^\s@:]+$/;
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
    agent.agentDesignerAgentDefinition ||
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
 * Extracts a human-readable owner hint (such as an email address or display name)
 * from the agent's definition if present.
 */
export const extractAgentOwnerHint = (
  agent: Partial<Agent> | null | undefined,
): string | null => {
  if (!agent) return null;
  const agentRec = agent as Record<string, unknown>;
  const candidates: unknown[] = [
    agent.lowCodeAgentDefinition?.ownerName,
    agent.lowCodeAgentDefinition?.owner,
    (agent.workflowAgentDefinition as Record<string, unknown> | undefined)?.ownerName,
    (agent.workflowAgentDefinition as Record<string, unknown> | undefined)?.owner,
    (agent.agentDesignerAgentDefinition as Record<string, unknown> | undefined)?.ownerName,
    (agent.agentDesignerAgentDefinition as Record<string, unknown> | undefined)?.owner,
    agent.skillAgentDefinition?.owner,
    (agent.noCodeAgentDefinition as Record<string, unknown> | undefined)?.ownerName,
    (agent.noCodeAgentDefinition as Record<string, unknown> | undefined)?.owner,
    agentRec.creatorEmail,
    agentRec.ownerEmail,
    agentRec.ownerName,
    agentRec.owner,
  ];
  for (const raw of candidates) {
    if (typeof raw === "string" && raw.trim()) {
      const cleaned = raw.trim();
      const withoutPrefix = cleaned.startsWith("user:")
        ? cleaned.slice("user:".length).trim()
        : cleaned;
      if (EMAIL_REGEX.test(withoutPrefix) || WIF_SUBJECT_REGEX.test(cleaned)) {
        return cleaned;
      }
    }
  }
  return null;
};

/**
 * Validates and normalizes an IAM principal for `roles/discoveryengine.agentUser` sharing bindings.
 * Supports:
 * - Bare email (`bob@example.com` -> `user:bob@example.com`)
 * - Explicit `user:`, `group:`, `domain:`, `serviceAccount:`
 * - Workforce Identity `principal://` or `principalSet://`
 * - `allUsers` / `allAuthenticatedUsers`
 */
export const formatSharedIamPrincipal = (rawPrincipal: string): string => {
  const trimmed = (rawPrincipal || "").trim();
  if (!trimmed) {
    throw new Error("IAM principal cannot be empty.");
  }
  if (trimmed === "allUsers" || trimmed === "allAuthenticatedUsers") {
    return trimmed;
  }
  if (
    trimmed.startsWith("user:") ||
    trimmed.startsWith("group:") ||
    trimmed.startsWith("domain:") ||
    trimmed.startsWith("serviceAccount:") ||
    trimmed.startsWith("principal://") ||
    trimmed.startsWith("principalSet://")
  ) {
    const valuePart = trimmed.split(":").slice(1).join(":").trim();
    if (!valuePart) {
      throw new Error(`Invalid IAM principal "${trimmed}".`);
    }
    return trimmed;
  }
  if (trimmed.startsWith("//iam.googleapis.com/")) {
    return trimmed.includes("/group/")
      ? `principalSet:${trimmed}`
      : `principal:${trimmed}`;
  }
  if (EMAIL_REGEX.test(trimmed)) {
    return `user:${trimmed}`;
  }
  throw new Error(
    `Invalid IAM principal "${trimmed}". Expected an email (alice@example.com), group:team@example.com, domain:example.com, or principal://iam.googleapis.com/...`,
  );
};

/**
 * Builds a clean `CreateAgent` payload from an existing user-owned agent so an Admin
 * can clone a `PRIVATE` agent, publish it, share it, and transfer ownership back to the user.
 *
 * Enforces all Discovery Engine `ValidateCreateAgentRequest` / `CreateAgentHandler` constraints:
 * - Ensures non-empty `displayName` and `description`.
 * - Migrates deprecated `authorizations` array to `authorizationConfig.toolAuthorizations`.
 * - For `lowCodeAgentDefinition`: promotes `deployedNodes` -> `nodes`, `deployedRootAgentId` -> `rootAgentId`,
 *   `deployedSchedules` -> `draftSchedules` (stripping output-only `disabled` on schedules), and strips
 *   `deployedNodes`, `deployedRootAgentId`, `deployedSchedules`, `deploymentInfo`, `validationErrors`,
 *   `owner`, `ownerName`, and `session` (which would otherwise fail `VerifySession` ownership check).
 * - For `workflowAgentDefinition` / `agentDesignerAgentDefinition` / `skillAgentDefinition`: strips `owner` / `ownerName`.
 */
export const buildCloneAgentPayloadForCreate = (
  sourceAgent: Agent,
  options?: { displayName?: string; sharingScope?: 'RESTRICTED' | 'ALL_USERS' },
): Partial<Agent> => {
  const displayName = (options?.displayName || sourceAgent.displayName || "").trim();
  if (!displayName) {
    throw new Error("Agent displayName is required to clone and publish the agent.");
  }

  const description = (
    sourceAgent.description ||
    sourceAgent.lowCodeAgentDefinition?.draftDescription ||
    displayName
  )
    .toString()
    .trim();

  const payload: Partial<Agent> = {
    displayName,
    description,
  };

  if (options?.sharingScope) {
    payload.sharingConfig = { scope: options.sharingScope };
  }

  if (sourceAgent.icon?.uri) {
    payload.icon = { uri: sourceAgent.icon.uri };
  }
  if (Array.isArray(sourceAgent.starterPrompts) && sourceAgent.starterPrompts.length > 0) {
    payload.starterPrompts = JSON.parse(JSON.stringify(sourceAgent.starterPrompts));
  }
  if (sourceAgent.dataStoreSpecs) {
    payload.dataStoreSpecs = JSON.parse(JSON.stringify(sourceAgent.dataStoreSpecs));
  }
  if (Array.isArray(sourceAgent.dataConnectors) && sourceAgent.dataConnectors.length > 0) {
    payload.dataConnectors = JSON.parse(JSON.stringify(sourceAgent.dataConnectors));
  }
  if (sourceAgent.observabilityConfig) {
    payload.observabilityConfig = {
      observabilityEnabled: Boolean(sourceAgent.observabilityConfig.observabilityEnabled),
      sensitiveLoggingEnabled: Boolean(sourceAgent.observabilityConfig.sensitiveLoggingEnabled),
    };
  }

  if (
    sourceAgent.authorizationConfig?.toolAuthorizations &&
    sourceAgent.authorizationConfig.toolAuthorizations.length > 0
  ) {
    payload.authorizationConfig = {
      toolAuthorizations: [...sourceAgent.authorizationConfig.toolAuthorizations],
    };
  } else if (Array.isArray(sourceAgent.authorizations) && sourceAgent.authorizations.length > 0) {
    payload.authorizationConfig = {
      toolAuthorizations: [...sourceAgent.authorizations],
    };
  }

  if (sourceAgent.lowCodeAgentDefinition) {
    const lowCodeClone: Record<string, unknown> = JSON.parse(
      JSON.stringify(sourceAgent.lowCodeAgentDefinition),
    );
    const draftNodes = Array.isArray(lowCodeClone.nodes) ? lowCodeClone.nodes : [];
    const deployedNodes = Array.isArray(lowCodeClone.deployedNodes)
      ? lowCodeClone.deployedNodes
      : Array.isArray(lowCodeClone.deployed_nodes)
        ? lowCodeClone.deployed_nodes
        : [];

    if (draftNodes.length === 0 && deployedNodes.length > 0) {
      lowCodeClone.nodes = deployedNodes;
    }

    const rootAgentId =
      (lowCodeClone.rootAgentId as string) ||
      (lowCodeClone.root_agent_id as string) ||
      (lowCodeClone.deployedRootAgentId as string) ||
      (lowCodeClone.deployed_root_agent_id as string) ||
      "";
    if (rootAgentId) {
      lowCodeClone.rootAgentId = rootAgentId;
    }

    const draftSchedules = Array.isArray(lowCodeClone.draftSchedules)
      ? lowCodeClone.draftSchedules
      : Array.isArray(lowCodeClone.deployedSchedules)
        ? lowCodeClone.deployedSchedules
        : [];
    if (draftSchedules.length > 0) {
      lowCodeClone.draftSchedules = draftSchedules.map((sched: Record<string, unknown>) => {
        const cleanSched = { ...sched };
        delete cleanSched.disabled;
        return cleanSched;
      });
    }
    if (Array.isArray(lowCodeClone.schedules)) {
      lowCodeClone.schedules = (lowCodeClone.schedules as Array<Record<string, unknown>>).map(
        (sched) => {
          const cleanSched = { ...sched };
          delete cleanSched.disabled;
          return cleanSched;
        },
      );
    }

    lowCodeClone.draftDisplayName =
      (lowCodeClone.draftDisplayName as string) || displayName;
    lowCodeClone.draftDescription =
      (lowCodeClone.draftDescription as string) || description;

    delete lowCodeClone.deployedNodes;
    delete lowCodeClone.deployed_nodes;
    delete lowCodeClone.deployedRootAgentId;
    delete lowCodeClone.deployed_root_agent_id;
    delete lowCodeClone.deployedSchedules;
    delete lowCodeClone.deployed_schedules;
    delete lowCodeClone.deploymentInfo;
    delete lowCodeClone.deployment_info;
    delete lowCodeClone.validationErrors;
    delete lowCodeClone.validation_errors;
    delete lowCodeClone.owner;
    delete lowCodeClone.ownerName;
    delete lowCodeClone.owner_name;
    delete lowCodeClone.session;

    payload.lowCodeAgentDefinition = lowCodeClone;
  } else if (sourceAgent.workflowAgentDefinition) {
    const workflowClone: Record<string, unknown> = JSON.parse(
      JSON.stringify(sourceAgent.workflowAgentDefinition),
    );
    delete workflowClone.owner;
    delete workflowClone.ownerName;
    delete workflowClone.owner_name;
    payload.workflowAgentDefinition = workflowClone;
  } else if (sourceAgent.agentDesignerAgentDefinition) {
    const designerClone: Record<string, unknown> = JSON.parse(
      JSON.stringify(sourceAgent.agentDesignerAgentDefinition),
    );
    delete designerClone.owner;
    delete designerClone.ownerName;
    delete designerClone.owner_name;
    payload.agentDesignerAgentDefinition = designerClone;
  } else if (sourceAgent.skillAgentDefinition) {
    const skillClone: Record<string, unknown> = JSON.parse(
      JSON.stringify(sourceAgent.skillAgentDefinition),
    );
    delete skillClone.owner;
    delete skillClone.ownerName;
    delete skillClone.owner_name;
    payload.skillAgentDefinition = skillClone;
  } else if (sourceAgent.noCodeAgentDefinition) {
    throw new Error(
      "Legacy no_code_agent_definition agents do not support the Discovery Engine sharing/review workflow. Recreate the agent as a Low-Code or Workflow agent.",
    );
  } else {
    throw new Error(
      "Agent does not contain a shareable Low-Code, Workflow, Agent Designer, or Skill definition.",
    );
  }

  return payload;
};

/**
 * Automates the Admin "Publish & Share for User" workflow:
 * 1. Fetches the full source agent definition (Admins have read access to PRIVATE agents).
 * 2. If the agent is in `PRIVATE` state (where `:requestAgentReview` and `:transferAgentOwner` block non-owners),
 *    clones the agent as the Admin (`CreateAgent`) so the Admin is the initial owner.
 * 3. Deploys (`:deployLowCode`) or publishes (`:publish`) the agent.
 * 4. Initializes the agent IAM policy (`:initIamPolicy`) and transitions out of `PRIVATE` (`:requestAgentReview`).
 * 5. Enables the agent (`:enableAgent`) if it entered `DISABLED` pending admin approval.
 * 6. Configures `sharingConfig` (`ALL_USERS` or `RESTRICTED`) and optional `roles/discoveryengine.agentUser` IAM bindings.
 * 7. Transfers `roles/discoveryengine.agentOwner` to the target user via `:transferAgentOwner`.
 * 8. Optionally deletes the original unshared `PRIVATE` draft.
 */
export const adminPublishAndShareForUser = async (
  sourceAgentOrName: Agent | string,
  options: AdminPublishAndShareOptions,
  config: Config,
): Promise<AdminPublishAndShareResult> => {
  const stepsCompleted: string[] = [];
  const reportStep = (step: string) => {
    stepsCompleted.push(step);
    options.onProgress?.(step);
  };

  let normalizedTargetOwner: string | undefined;
  if (!options.keepAdminAsOwner) {
    normalizedTargetOwner = formatTransferTargetPrincipal(
      options.targetOwnerPrincipal || "",
    );
  }

  const normalizedSharedPrincipals = (options.sharedPrincipals || [])
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => formatSharedIamPrincipal(p));

  const sourceName =
    typeof sourceAgentOrName === "string"
      ? resolveFullAgentResourceName(sourceAgentOrName, config)
      : resolveFullAgentResourceName(sourceAgentOrName.name, config);

  reportStep("Reading source agent definition");
  const sourceAgent = await getAgent(sourceName, config);

  const isSourcePrivate = sourceAgent.state === "PRIVATE" || !sourceAgent.state;
  let targetAgent: Agent = sourceAgent;
  let wasCloned = false;

  if (isSourcePrivate) {
    reportStep("Cloning private agent definition as Admin");
    const clonePayload = buildCloneAgentPayloadForCreate(sourceAgent, {
      displayName: options.displayName,
    });
    targetAgent = await createAgent(clonePayload, config);
    wasCloned = true;
  } else if (
    options.displayName &&
    options.displayName.trim() &&
    options.displayName.trim() !== sourceAgent.displayName
  ) {
    reportStep("Updating agent display name");
    targetAgent = await updateAgent(
      sourceAgent,
      { displayName: options.displayName.trim() },
      config,
    );
  }

  const targetAgentName = resolveFullAgentResourceName(targetAgent.name, config);

  if (targetAgent.lowCodeAgentDefinition || sourceAgent.lowCodeAgentDefinition) {
    reportStep("Deploying Low-Code agent (:deployLowCode)");
    await deployLowCodeAgent(targetAgentName, config, "DEPLOY");
  } else if (
    targetAgent.workflowAgentDefinition ||
    sourceAgent.workflowAgentDefinition ||
    targetAgent.agentDesignerAgentDefinition ||
    sourceAgent.agentDesignerAgentDefinition ||
    targetAgent.skillAgentDefinition ||
    sourceAgent.skillAgentDefinition
  ) {
    reportStep("Publishing agent revision (:publish)");
    await publishAgent(targetAgentName, config, { publishMode: "PUBLISH" });
  }

  if (wasCloned || targetAgent.state === "PRIVATE" || !targetAgent.state) {
    reportStep("Initializing IAM policy (:initIamPolicy)");
    await initIamPolicy(targetAgentName, config);

    reportStep("Transitioning agent out of PRIVATE (:requestAgentReview)");
    await requestAgentReview(targetAgentName, config);
  }

  const afterReview = await getAgent(targetAgentName, config);
  if (afterReview.state === "DISABLED" || afterReview.state === "SUSPENDED") {
    reportStep("Approving & enabling shared agent (:enableAgent)");
    await enableAgent(targetAgentName, config);
  }

  if (options.sharingScope === "ALL_USERS") {
    reportStep("Setting sharing scope to ALL_USERS");
    await updateAgent(
      { name: targetAgentName },
      { sharingConfig: { scope: "ALL_USERS" } },
      config,
    );
  }

  if (normalizedSharedPrincipals.length > 0) {
    reportStep("Granting roles/discoveryengine.agentUser in IAM policy (:setIamPolicy)");
    const currentPolicy: IamPolicy = await getAgentIamPolicy(
      targetAgentName,
      config,
    ).catch(() => ({ bindings: [] }));
    const bindings = [...(currentPolicy.bindings || [])];
    const agentUserRole = "roles/discoveryengine.agentUser";
    const existingBindingIndex = bindings.findIndex(
      (b) => b.role === agentUserRole,
    );
    if (existingBindingIndex >= 0) {
      const mergedMembers = Array.from(
        new Set([
          ...(bindings[existingBindingIndex].members || []),
          ...normalizedSharedPrincipals,
        ]),
      );
      bindings[existingBindingIndex] = {
        ...bindings[existingBindingIndex],
        members: mergedMembers,
      };
    } else {
      bindings.push({
        role: agentUserRole,
        members: Array.from(new Set(normalizedSharedPrincipals)),
      });
    }
    await setAgentIamPolicy(
      targetAgentName,
      { ...currentPolicy, bindings },
      config,
    );
  }

  if (normalizedTargetOwner) {
    reportStep(`Transferring ownership to ${normalizedTargetOwner} (:transferAgentOwner)`);
    await transferAgentOwner(
      targetAgentName,
      {
        toSelf: false,
        targetPrincipal: normalizedTargetOwner,
        previousOwnerDisposition:
          options.previousOwnerDisposition || "KEEP_AS_AGENT_USER",
      },
      config,
    );
  }

  let deletedOriginal = false;
  if (wasCloned && options.deleteOriginalPrivateAgent) {
    reportStep("Deleting original unshared PRIVATE agent draft");
    await deleteResource(sourceName, config);
    deletedOriginal = true;
  }

  const finalAgent = await getAgent(targetAgentName, config);
  return {
    agent: finalAgent,
    clonedFrom: wasCloned ? sourceName : undefined,
    wasCloned,
    deletedOriginal,
    transferredTo: normalizedTargetOwner,
    stepsCompleted,
  };
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
