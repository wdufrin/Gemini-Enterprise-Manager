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
  LowCodeAgentDefinition,
  LowCodeValidationError,
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

/**
 * Formats `lowCodeAgentDefinition.validationErrors` (populated by Discovery Engine's
 * `UpdateLowCodeAgentValidationStatus` in `agent_validator.cc`) into a human-readable string.
 */
export const formatLowCodeValidationErrors = (
  agent: Partial<Agent> | null | undefined,
): string | null => {
  const rawDef = agent?.lowCodeAgentDefinition as Record<string, unknown> | undefined;
  if (!rawDef) return null;
  const rawErrors = Array.isArray(rawDef.validationErrors)
    ? rawDef.validationErrors
    : Array.isArray(rawDef.validation_errors)
      ? rawDef.validation_errors
      : [];
  if (rawErrors.length === 0) return null;
  const parts = rawErrors
    .map((err: unknown) => {
      if (!err || typeof err !== "object") return String(err);
      const e = err as Record<string, unknown>;
      const field = typeof e.field === "string" ? e.field : "";
      const message = typeof e.message === "string" ? e.message : "";
      if (field && message) return `${field}: ${message}`;
      return field || message || "";
    })
    .filter(Boolean);
  return parts.length > 0 ? parts.join("; ") : null;
};

export interface NormalizedLowCodeDefinitionResult {
  lowCodeAgentDefinition: LowCodeAgentDefinition;
  needsPatch: boolean;
  repairedFields: string[];
  existingValidationErrors: LowCodeValidationError[];
}

const VALID_LOW_CODE_NODE_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

/**
 * Normalizes and repairs a `lowCodeAgentDefinition` so that it satisfies all
 * Discovery Engine `UpdateLowCodeAgentValidationStatus` (`agent_validator.cc`)
 * and `kLowCodeAgentImmutableSubFields` requirements:
 * - Promotes `deployedNodes` -> `nodes` when `nodes` is empty.
 * - Initializes a default root `llmAgentNode` if both `nodes` and `deployedNodes` are empty
 *   (which occurs when a brand-new draft is created in Agent Designer before saving a flow).
 * - Ensures every node has a valid unique `id` (`[a-zA-Z0-9_-]+`, not `"user"`) and non-empty `displayName`.
 * - Ensures `rootAgentId` is non-empty and matches a node `id` in `nodes`.
 * - Ensures every `llmAgentNode` has a non-empty `instruction` (falling back to the agent's
 *   `description` / `draftDescription` or display name).
 * - Strips server-rejected output-only fields (`deployedNodes`, `deployedRootAgentId`,
 *   `deployedSchedules`, `deploymentInfo`, `validationErrors`, `owner`, `ownerName`, `session`).
 */
export const normalizeLowCodeAgentDefinitionForDeploy = (
  agent: Partial<Agent>,
  options?: { displayName?: string; description?: string },
): NormalizedLowCodeDefinitionResult => {
  const rawDef = (agent.lowCodeAgentDefinition || {}) as Record<string, unknown>;
  const rawErrors = Array.isArray(rawDef.validationErrors)
    ? rawDef.validationErrors
    : Array.isArray(rawDef.validation_errors)
      ? rawDef.validation_errors
      : [];
  const existingValidationErrors: LowCodeValidationError[] = rawErrors
    .filter((e): e is Record<string, unknown> => Boolean(e && typeof e === "object"))
    .map((e) => ({
      field: typeof e.field === "string" ? e.field : undefined,
      message: typeof e.message === "string" ? e.message : undefined,
    }));

  const lowCodeClone: Record<string, unknown> = JSON.parse(JSON.stringify(rawDef));
  const repairedFields: string[] = [];

  const fallbackDisplayName =
    (
      options?.displayName ||
      (typeof agent.displayName === "string" ? agent.displayName : "") ||
      (typeof lowCodeClone.draftDisplayName === "string"
        ? lowCodeClone.draftDisplayName
        : "") ||
      (typeof lowCodeClone.draft_display_name === "string"
        ? (lowCodeClone.draft_display_name as string)
        : "") ||
      "Main Agent"
    ).trim() || "Main Agent";

  const fallbackDescription = (
    options?.description ||
    (typeof agent.description === "string" ? agent.description : "") ||
    (typeof lowCodeClone.draftDescription === "string"
      ? lowCodeClone.draftDescription
      : "") ||
    (typeof lowCodeClone.draft_description === "string"
      ? (lowCodeClone.draft_description as string)
      : "") ||
    ""
  ).trim();

  const fallbackInstruction =
    fallbackDescription ||
    `You are ${fallbackDisplayName}, a helpful enterprise assistant.`;

  const isValidNodeId = (id: string): boolean =>
    Boolean(id) && id !== "user" && VALID_LOW_CODE_NODE_ID_REGEX.test(id);

  const rawRootId = (
    (typeof lowCodeClone.rootAgentId === "string" ? lowCodeClone.rootAgentId : "") ||
    (typeof lowCodeClone.root_agent_id === "string"
      ? (lowCodeClone.root_agent_id as string)
      : "") ||
    (typeof lowCodeClone.deployedRootAgentId === "string"
      ? lowCodeClone.deployedRootAgentId
      : "") ||
    (typeof lowCodeClone.deployed_root_agent_id === "string"
      ? (lowCodeClone.deployed_root_agent_id as string)
      : "") ||
    ""
  ).trim();

  const draftNodes = Array.isArray(lowCodeClone.nodes)
    ? (lowCodeClone.nodes as Array<Record<string, unknown>>)
    : [];
  const deployedNodes = Array.isArray(lowCodeClone.deployedNodes)
    ? (lowCodeClone.deployedNodes as Array<Record<string, unknown>>)
    : Array.isArray(lowCodeClone.deployed_nodes)
      ? (lowCodeClone.deployed_nodes as Array<Record<string, unknown>>)
      : [];

  let nodes: Array<Record<string, unknown>> = draftNodes;
  if (nodes.length === 0 && deployedNodes.length > 0) {
    nodes = JSON.parse(JSON.stringify(deployedNodes));
    lowCodeClone.nodes = nodes;
    repairedFields.push("lowCodeAgentDefinition.nodes");
  }

  if (nodes.length === 0) {
    const rootId = isValidNodeId(rawRootId) ? rawRootId : "root_agent";
    nodes = [
      {
        id: rootId,
        displayName: fallbackDisplayName,
        llmAgentNode: {
          instruction: fallbackInstruction,
        },
      },
    ];
    lowCodeClone.nodes = nodes;
    lowCodeClone.rootAgentId = rootId;
    repairedFields.push("lowCodeAgentDefinition.nodes[0]");
    repairedFields.push("lowCodeAgentDefinition.rootAgentId");
  }

  const seenNodeIds = new Set<string>();
  nodes.forEach((rawNode, idx) => {
    const node: Record<string, unknown> = { ...(rawNode || {}) };
    nodes[idx] = node;

    const rawId = typeof node.id === "string" ? node.id.trim() : "";
    let nodeId = rawId;
    if (!isValidNodeId(nodeId) || seenNodeIds.has(nodeId)) {
      nodeId =
        idx === 0 && isValidNodeId(rawRootId) && !seenNodeIds.has(rawRootId)
          ? rawRootId
          : idx === 0 && !seenNodeIds.has("root_agent")
            ? "root_agent"
            : `node_${idx + 1}`;
      node.id = nodeId;
      repairedFields.push(`lowCodeAgentDefinition.nodes[${idx}].id`);
    }
    seenNodeIds.add(nodeId);

    const rawNodeDisplay = (
      (typeof node.displayName === "string" ? node.displayName : "") ||
      (typeof node.display_name === "string" ? (node.display_name as string) : "")
    ).trim();
    if (!rawNodeDisplay) {
      node.displayName = idx === 0 ? fallbackDisplayName : nodeId;
      delete node.display_name;
      repairedFields.push(`lowCodeAgentDefinition.nodes[${idx}].displayName`);
    } else if (!node.displayName && node.display_name) {
      node.displayName = rawNodeDisplay;
      delete node.display_name;
    }

    const hasOtherNodeType = Boolean(
      node.loopAgentNode ||
        node.loop_agent_node ||
        node.parallelAgentNode ||
        node.parallel_agent_node ||
        node.sequentialAgentNode ||
        node.sequential_agent_node,
    );

    if (!hasOtherNodeType) {
      const existingLlm =
        (node.llmAgentNode as Record<string, unknown> | undefined) ||
        (node.llm_agent_node as Record<string, unknown> | undefined);
      const llmNode: Record<string, unknown> = existingLlm
        ? { ...existingLlm }
        : {};
      if (!existingLlm) {
        repairedFields.push(`lowCodeAgentDefinition.nodes[${idx}].llmAgentNode`);
      }
      delete node.llm_agent_node;

      const currentInstruction =
        typeof llmNode.instruction === "string" ? llmNode.instruction.trim() : "";
      if (!currentInstruction) {
        llmNode.instruction = fallbackInstruction;
        repairedFields.push(
          `lowCodeAgentDefinition.nodes[${idx}].llmAgentNode.instruction`,
        );
      }

      if (
        llmNode.selectedTools &&
        typeof llmNode.selectedTools === "object" &&
        Array.isArray((llmNode.selectedTools as Record<string, unknown>).tool)
      ) {
        const tools = (
          (llmNode.selectedTools as Record<string, unknown>).tool as Array<
            Record<string, unknown>
          >
        ).filter((t) => typeof t?.name === "string" && t.name.trim().length > 0);
        llmNode.selectedTools = {
          ...(llmNode.selectedTools as Record<string, unknown>),
          tool: tools,
        };
      }

      if (Array.isArray(llmNode.dataConnectors)) {
        llmNode.dataConnectors = (
          llmNode.dataConnectors as Array<Record<string, unknown>>
        ).filter((dc) => typeof dc?.name === "string" && dc.name.trim().length > 0);
      }

      node.llmAgentNode = llmNode;
    }
  });

  const effectiveRootId =
    isValidNodeId(rawRootId) && seenNodeIds.has(rawRootId)
      ? rawRootId
      : String(nodes[0].id);
  if (lowCodeClone.rootAgentId !== effectiveRootId) {
    lowCodeClone.rootAgentId = effectiveRootId;
    repairedFields.push("lowCodeAgentDefinition.rootAgentId");
  }
  delete lowCodeClone.root_agent_id;

  const draftSchedules = Array.isArray(lowCodeClone.draftSchedules)
    ? lowCodeClone.draftSchedules
    : Array.isArray(lowCodeClone.deployedSchedules)
      ? lowCodeClone.deployedSchedules
      : [];
  if (draftSchedules.length > 0) {
    lowCodeClone.draftSchedules = draftSchedules.map(
      (sched: Record<string, unknown>) => {
        const cleanSched = { ...sched };
        delete cleanSched.disabled;
        return cleanSched;
      },
    );
  }
  if (Array.isArray(lowCodeClone.schedules)) {
    lowCodeClone.schedules = (
      lowCodeClone.schedules as Array<Record<string, unknown>>
    ).map((sched) => {
      const cleanSched = { ...sched };
      delete cleanSched.disabled;
      return cleanSched;
    });
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

  return {
    lowCodeAgentDefinition: lowCodeClone as LowCodeAgentDefinition,
    needsPatch: repairedFields.length > 0 || existingValidationErrors.length > 0,
    repairedFields,
    existingValidationErrors,
  };
};

/**
 * Returns true if the agent record contains deprecated `agent.authorizations`
 * or `adkAgentDefinition.authorizations` fields that trigger Discovery Engine's
 * `ValidateDeprecatedAuthorizationFieldsAreNotSet` error during `UpdateAgent` (`PATCH`).
 */
export const hasLegacyAgentAuthorizations = (
  agent: Partial<Agent> | null | undefined,
): boolean => {
  if (!agent) return false;
  if (Array.isArray(agent.authorizations) && agent.authorizations.length > 0) {
    return true;
  }
  const adkAuths = (agent.adkAgentDefinition as Record<string, unknown> | undefined)
    ?.authorizations;
  if (Array.isArray(adkAuths) && adkAuths.length > 0) {
    return true;
  }
  return false;
};

/**
 * Returns true if an error from Discovery Engine is caused by the deprecated
 * `agent.authorizations` or `adk_agent_definition.authorizations` field validation.
 */
export const isLegacyAuthorizationsDeprecationError = (err: unknown): boolean => {
  const msg = ((err as Error)?.message || String(err)).toLowerCase();
  return (
    msg.includes("authorizations") &&
    (msg.includes("deprecated") || msg.includes("authorization_config"))
  );
};

export const updateAgent = async (
  agent: Partial<Agent> & { name: string },
  payload: Partial<Agent> | Record<string, unknown>,
  config: Config,
) => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const sanitizedPayload: Record<string, unknown> = { ...payload };

  // Never send deprecated `authorizations` in `PATCH` (`authorizations` is in `kPublicAgentImmutablePaths`
  // and fails `ValidateDeprecatedAuthorizationFieldsAreNotSet`). Migrate to `authorizationConfig`.
  if (Array.isArray(sanitizedPayload.authorizations)) {
    const legacyAuths = (sanitizedPayload.authorizations as string[]).filter(Boolean);
    if (!sanitizedPayload.authorizationConfig) {
      sanitizedPayload.authorizationConfig = {
        toolAuthorizations: legacyAuths,
      };
    }
    delete sanitizedPayload.authorizations;
  }

  // If `agent.adkAgentDefinition` had deprecated nested `.authorizations`, or `sanitizedPayload.adkAgentDefinition`
  // has `.authorizations`, strip it from `adkAgentDefinition` (which IS in `kPublicAgentMutablePaths`)
  // and migrate to `authorizationConfig.toolAuthorizations`.
  const existingAdkAuths = Array.isArray(
    (agent.adkAgentDefinition as Record<string, unknown> | undefined)?.authorizations,
  )
    ? ((agent.adkAgentDefinition as Record<string, unknown>).authorizations as string[])
    : [];
  if (
    sanitizedPayload.adkAgentDefinition ||
    existingAdkAuths.length > 0
  ) {
    const adkClone: Record<string, unknown> = {
      ...((agent.adkAgentDefinition as Record<string, unknown> | undefined) || {}),
      ...((sanitizedPayload.adkAgentDefinition as Record<string, unknown> | undefined) || {}),
    };
    const payloadAdkAuths = Array.isArray(adkClone.authorizations)
      ? (adkClone.authorizations as string[])
      : [];
    const mergedAdkAuths = Array.from(
      new Set([...existingAdkAuths, ...payloadAdkAuths].filter(Boolean)),
    );
    delete adkClone.authorizations;
    sanitizedPayload.adkAgentDefinition = adkClone;

    if (mergedAdkAuths.length > 0 && !sanitizedPayload.authorizationConfig) {
      const existingToolAuths =
        agent.authorizationConfig?.toolAuthorizations || [];
      sanitizedPayload.authorizationConfig = {
        toolAuthorizations: Array.from(
          new Set([...existingToolAuths, ...mergedAdkAuths]),
        ),
      };
    }
  }

  const updateMask: string[] = [];
  if (sanitizedPayload.displayName) updateMask.push("display_name");
  if (sanitizedPayload.description !== undefined) updateMask.push("description");
  if (sanitizedPayload.icon) updateMask.push("icon");
  if (sanitizedPayload.starterPrompts) updateMask.push("starter_prompts");
  if (sanitizedPayload.adkAgentDefinition) updateMask.push("adk_agent_definition");
  if (sanitizedPayload.a2aAgentDefinition) updateMask.push("a2a_agent_definition");
  if (sanitizedPayload.lowCodeAgentDefinition)
    updateMask.push("low_code_agent_definition");
  if (sanitizedPayload.workflowAgentDefinition)
    updateMask.push("workflow_agent_definition");
  if (sanitizedPayload.agentDesignerAgentDefinition)
    updateMask.push("agent_designer_agent_definition");
  if (sanitizedPayload.skillAgentDefinition)
    updateMask.push("skill_agent_definition");
  if (sanitizedPayload.dataStoreSpecs) updateMask.push("data_store_specs");
  if (sanitizedPayload.dataConnectors) updateMask.push("data_connectors");
  if (sanitizedPayload.sharingConfig) updateMask.push("sharing_config");
  if (sanitizedPayload.authorizationConfig) updateMask.push("authorization_config");
  if (sanitizedPayload.observabilityConfig) updateMask.push("observabilityConfig");

  if (
    sanitizedPayload.lowCodeAgentDefinition &&
    typeof sanitizedPayload.lowCodeAgentDefinition === "object"
  ) {
    const normalized = normalizeLowCodeAgentDefinitionForDeploy({
      ...agent,
      ...(sanitizedPayload as Partial<Agent>),
      lowCodeAgentDefinition:
        sanitizedPayload.lowCodeAgentDefinition as LowCodeAgentDefinition,
    });
    sanitizedPayload.lowCodeAgentDefinition = normalized.lowCodeAgentDefinition;
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
 * Returns true if a custom No-Code / Low-Code / Workflow / Agent Designer / Skill agent
 * has been published or deployed out of draft (`deployedRootAgentId` / `deployedNodes` or `activeRevision`).
 */
export const isNoCodeAgentPublished = (
  agent: Partial<Agent> | null | undefined,
): boolean => {
  if (!agent) return false;
  if (agent.lowCodeAgentDefinition) {
    const lc = agent.lowCodeAgentDefinition as Record<string, unknown>;
    const deployedNodes = Array.isArray(lc.deployedNodes)
      ? lc.deployedNodes
      : Array.isArray(lc.deployed_nodes)
        ? lc.deployed_nodes
        : [];
    return Boolean(
      lc.deployedRootAgentId ||
        lc.deployed_root_agent_id ||
        deployedNodes.length > 0,
    );
  }
  if (
    agent.workflowAgentDefinition ||
    agent.agentDesignerAgentDefinition ||
    agent.skillAgentDefinition
  ) {
    const wf = (agent.workflowAgentDefinition ||
      agent.agentDesignerAgentDefinition ||
      agent.skillAgentDefinition) as Record<string, unknown>;
    return Boolean(
      agent.activeRevision || wf.activeRevision || wf.active_revision,
    );
  }
  return agent.state === "ENABLED" || agent.state === "DISABLED";
};

const isLowCodeValidationError = (err: unknown): boolean => {
  const msg = ((err as Error)?.message || String(err)).toLowerCase();
  return (
    msg.includes("agent has validation errors") ||
    msg.includes("validation_errors")
  );
};

/**
 * Deploys a Low-Code agent (`:deployLowCode`), automatically repairing any missing draft defaults
 * (`rootAgentId`, `nodes`, `node.id`, `node.displayName`, `llmAgentNode.instruction`) via `PATCH`
 * (`updateAgent`) before or upon encountering Discovery Engine's `"Agent has validation errors."`
 * (`DeployLowCodeAgentHandler` in `deploy_low_code_agent_handler.cc`).
 */
const deployLowCodeWithAutoRepair = async (
  currentAgent: Agent,
  config: Config,
): Promise<void> => {
  const agentName = resolveFullAgentResourceName(currentAgent.name, config);
  const normalized = normalizeLowCodeAgentDefinitionForDeploy(currentAgent);

  const rawDef = (currentAgent.lowCodeAgentDefinition || {}) as Record<
    string,
    unknown
  >;
  const rawNodes = Array.isArray(rawDef.nodes)
    ? (rawDef.nodes as Array<Record<string, unknown>>)
    : [];
  const rawRootId = (
    (rawDef.rootAgentId as string) ||
    (rawDef.root_agent_id as string) ||
    ""
  ).trim();
  const hasMissingCoreFields =
    rawNodes.length === 0 ||
    !rawRootId ||
    !rawNodes.some((n) => n?.id === rawRootId) ||
    rawNodes.some((n) => {
      const hasOtherType = Boolean(
        n?.loopAgentNode ||
          n?.loop_agent_node ||
          n?.parallelAgentNode ||
          n?.parallel_agent_node ||
          n?.sequentialAgentNode ||
          n?.sequential_agent_node,
      );
      if (hasOtherType) return false;
      const llm = (n?.llmAgentNode || n?.llm_agent_node) as
        | Record<string, unknown>
        | undefined;
      return (
        !llm || typeof llm.instruction !== "string" || !llm.instruction.trim()
      );
    });

  let latestAgent: Agent = currentAgent;
  let patchedBeforeDeploy = false;

  if (normalized.existingValidationErrors.length > 0 || hasMissingCoreFields) {
    latestAgent = await updateAgent(
      currentAgent,
      { lowCodeAgentDefinition: normalized.lowCodeAgentDefinition },
      config,
    );
    patchedBeforeDeploy = true;
  }

  try {
    await deployLowCodeAgent(agentName, config, "DEPLOY");
  } catch (err: unknown) {
    if (!patchedBeforeDeploy && isLowCodeValidationError(err)) {
      latestAgent = await updateAgent(
        currentAgent,
        { lowCodeAgentDefinition: normalized.lowCodeAgentDefinition },
        config,
      );
      try {
        await deployLowCodeAgent(agentName, config, "DEPLOY");
        return;
      } catch (retryErr: unknown) {
        if (isLowCodeValidationError(retryErr)) {
          const details =
            formatLowCodeValidationErrors(latestAgent) ||
            formatLowCodeValidationErrors(currentAgent);
          if (details) {
            throw new Error(
              `Agent has validation errors (${details}). Update the agent's System Instructions or node configuration and try again.`,
            );
          }
        }
        throw retryErr;
      }
    }
    if (isLowCodeValidationError(err)) {
      const details =
        formatLowCodeValidationErrors(latestAgent) ||
        formatLowCodeValidationErrors(currentAgent);
      if (details) {
        throw new Error(
          `Agent has validation errors (${details}). Update the agent's System Instructions or node configuration and try again.`,
        );
      }
    }
    throw err;
  }
};

/**
 * Publishes or deploys a No-Code (`lowCodeAgentDefinition`, `workflowAgentDefinition`,
 * `agentDesignerAgentDefinition`, or `skillAgentDefinition`) agent out of draft in-place
 * (`:deployLowCode` or `:publish`) WITHOUT sharing it or changing its `state` / `sharingConfig`.
 *
 * If the agent is in `PRIVATE` state, it remains `PRIVATE` (unshared and not IAM-sharable)
 * while its `deployedNodes`/`deployedRootAgentId` or `activeRevision` becomes live for the owner.
 */
export const publishNoCodeAgentOnly = async (
  name: string,
  config: Config,
): Promise<Agent> => {
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
    if (current.lowCodeAgentDefinition) {
      await deployLowCodeWithAutoRepair(current, config);
    } else if (
      current.workflowAgentDefinition ||
      current.agentDesignerAgentDefinition ||
      current.skillAgentDefinition
    ) {
      await publishAgent(agentName, config, { publishMode: "PUBLISH" });
    } else {
      throw new Error(
        "Agent does not contain a publishable Low-Code, Workflow, Agent Designer, or Skill definition.",
      );
    }
  } catch (err: unknown) {
    if (isPermissionError(err)) {
      throw new Error(
        "Only the agent owner can directly publish/deploy a PRIVATE agent in-place (Discovery Engine checks owner == caller). Use 'Admin Publish / Share' and select 'Keep Private (Publish Only)' or transfer ownership.",
      );
    }
    throw err;
  }

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
      await deployLowCodeWithAutoRepair(current, config);
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

/**
 * Transitions a shared No-Code (`lowCodeAgentDefinition`, `workflowAgentDefinition`,
 * `agentDesignerAgentDefinition`, or `skillAgentDefinition`) agent back to `PRIVATE`
 * (unshared) state in-place via `POST /v1alpha/{name}:withdrawAgent`.
 *
 * Why this solves the `agent.authorizations` deprecation error when making an agent private:
 * - In Discovery Engine (`withdraw_agent_handler.cc`), `WithdrawAgentHandler` sets
 *   `state = PRIVATE`, sets `sharing_config.scope = RESTRICTED`, resets the IAM policy
 *   to the owner alone (`ResetIamPolicyWithCurrentUserAsOwner`), and writes directly
 *   to Spanner **without calling `ValidateAgent`**.
 * - Because `WithdrawAgentHandler` requires `owner == caller_cpi`, if the caller is an Admin
 *   and receives a 403 permission error (`autoClaimOwnership !== false`), this function
 *   automatically claims ownership via `:transferAgentOwner` (`{ currentUser: {} }`, which
 *   also skips `ValidateAgent`) and retries `:withdrawAgent`.
 */
export const withdrawAgent = async (
  name: string,
  config: Config,
  options?: { autoClaimOwnership?: boolean },
): Promise<Agent> => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const agentName = resolveFullAgentResourceName(name, config);
  const withdrawUrl = `${baseUrl}/${DISCOVERY_API_VERSION}/${agentName}:withdrawAgent`;

  const isPermissionError = (err: unknown): boolean => {
    const msg = ((err as Error)?.message || String(err)).toLowerCase();
    return (
      msg.includes("403") ||
      msg.includes("permission_denied") ||
      msg.includes("permission denied") ||
      msg.includes("does not have permission") ||
      msg.includes("not the owner")
    );
  };

  try {
    await gapiRequest<Agent>(
      withdrawUrl,
      "POST",
      config.projectId,
      undefined,
      {},
    );
  } catch (err: unknown) {
    if (options?.autoClaimOwnership !== false && isPermissionError(err)) {
      await transferAgentOwner(
        agentName,
        { toSelf: true, previousOwnerDisposition: "KEEP_AS_AGENT_USER" },
        config,
      );
      await gapiRequest<Agent>(
        withdrawUrl,
        "POST",
        config.projectId,
        undefined,
        {},
      );
    } else {
      throw err;
    }
  }

  return getAgent(agentName, config);
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
 * Builds a clean `CreateAgent` payload from an existing agent so an Admin can clone a `PRIVATE`
 * agent or migrate a legacy agent that has deprecated `agent.authorizations` to `authorizationConfig`.
 *
 * Enforces all Discovery Engine `ValidateCreateAgentRequest` / `CreateAgentHandler` constraints:
 * - Ensures non-empty `displayName` and `description`.
 * - Migrates deprecated `authorizations` (and `adkAgentDefinition.authorizations`) to `authorizationConfig.toolAuthorizations`.
 * - For `lowCodeAgentDefinition`: promotes `deployedNodes` -> `nodes`, `deployedRootAgentId` -> `rootAgentId`,
 *   `deployedSchedules` -> `draftSchedules` (stripping output-only `disabled` on schedules), and strips
 *   `deployedNodes`, `deployedRootAgentId`, `deployedSchedules`, `deploymentInfo`, `validationErrors`,
 *   `owner`, `ownerName`, and `session` (which would otherwise fail `VerifySession` ownership check).
 * - For `workflowAgentDefinition` / `agentDesignerAgentDefinition` / `skillAgentDefinition`: strips `owner` / `ownerName`.
 * - For `adkAgentDefinition` / `a2aAgentDefinition` / `dialogflowAgentDefinition`: preserves the definition while stripping
 *   deprecated nested `authorizations` and output-only marketplace subfields.
 */
export const buildCloneAgentPayloadForCreate = (
  sourceAgent: Agent,
  options?: { displayName?: string; sharingScope?: 'PRIVATE' | 'RESTRICTED' | 'ALL_USERS' },
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

  const existingToolAuths = Array.isArray(sourceAgent.authorizationConfig?.toolAuthorizations)
    ? sourceAgent.authorizationConfig!.toolAuthorizations
    : [];
  const legacyTopAuths = Array.isArray(sourceAgent.authorizations)
    ? sourceAgent.authorizations
    : [];
  const legacyAdkAuths = Array.isArray(
    (sourceAgent.adkAgentDefinition as Record<string, unknown> | undefined)?.authorizations,
  )
    ? ((sourceAgent.adkAgentDefinition as Record<string, unknown>).authorizations as string[])
    : [];

  const mergedToolAuths = Array.from(
    new Set([...existingToolAuths, ...legacyTopAuths, ...legacyAdkAuths].filter(Boolean)),
  );
  if (mergedToolAuths.length > 0) {
    payload.authorizationConfig = {
      toolAuthorizations: mergedToolAuths,
    };
  }

  const sourceRec = sourceAgent as unknown as Record<string, unknown>;

  if (sourceAgent.lowCodeAgentDefinition) {
    const normalized = normalizeLowCodeAgentDefinitionForDeploy(sourceAgent, {
      displayName,
      description,
    });
    const lowCodeClone: Record<string, unknown> = {
      ...(normalized.lowCodeAgentDefinition as Record<string, unknown>),
    };
    lowCodeClone.draftDisplayName =
      (lowCodeClone.draftDisplayName as string) || displayName;
    lowCodeClone.draftDescription =
      (lowCodeClone.draftDescription as string) || description;

    payload.lowCodeAgentDefinition = lowCodeClone as LowCodeAgentDefinition;
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
  } else if (sourceAgent.adkAgentDefinition) {
    const adkClone: Record<string, unknown> = JSON.parse(
      JSON.stringify(sourceAgent.adkAgentDefinition),
    );
    delete adkClone.authorizations;
    payload.adkAgentDefinition = adkClone as Agent["adkAgentDefinition"];
  } else if (sourceAgent.a2aAgentDefinition) {
    const a2aClone: Record<string, unknown> = JSON.parse(
      JSON.stringify(sourceAgent.a2aAgentDefinition),
    );
    if (
      a2aClone.cloudMarketplaceConfig &&
      typeof a2aClone.cloudMarketplaceConfig === "object"
    ) {
      const mkt = {
        ...(a2aClone.cloudMarketplaceConfig as Record<string, unknown>),
      };
      delete mkt.order;
      delete mkt.procurementAccount;
      delete mkt.procurement_account;
      delete mkt.serviceName;
      delete mkt.service_name;
      a2aClone.cloudMarketplaceConfig = mkt;
    }
    payload.a2aAgentDefinition = a2aClone as Agent["a2aAgentDefinition"];
  } else if (sourceRec.dialogflowAgentDefinition) {
    (payload as Record<string, unknown>).dialogflowAgentDefinition = JSON.parse(
      JSON.stringify(sourceRec.dialogflowAgentDefinition),
    );
  } else if (sourceAgent.noCodeAgentDefinition) {
    throw new Error(
      "Legacy no_code_agent_definition agents do not support the Discovery Engine sharing/review workflow. Recreate the agent as a Low-Code or Workflow agent.",
    );
  } else {
    throw new Error(
      "Agent does not contain a supported Low-Code, Workflow, Agent Designer, Skill, ADK, or A2A definition.",
    );
  }

  return payload;
};

/**
 * Automates the Admin "Publish & Share for User" workflow:
 * 1. Fetches the full source agent definition (Admins have read access to PRIVATE agents).
 * 2. If the agent is in `PRIVATE` state (where `:requestAgentReview` and `:transferAgentOwner` block non-owners)
 *    or contains deprecated `agent.authorizations` (which blocks `UpdateAgent`), clones the agent as the Admin
 *    (`CreateAgent`) so the Admin is the initial owner and `authorizations` is migrated to `authorizationConfig`.
 * 3. Deploys (`:deployLowCode`) or publishes (`:publish`) the agent.
 * 4. Initializes the agent IAM policy (`:initIamPolicy`) and transitions out of `PRIVATE` (`:requestAgentReview`).
 * 5. Enables the agent (`:enableAgent`) if it entered `DISABLED` pending admin approval.
 * 6. Configures `sharingConfig` (`ALL_USERS` or `RESTRICTED`) and optional `roles/discoveryengine.agentUser` IAM bindings.
 * 7. Transfers `roles/discoveryengine.agentOwner` to the target user via `:transferAgentOwner`.
 * 8. Optionally deletes the original unshared `PRIVATE` or legacy draft.
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

  const keepPrivateUnshared = options.sharingScope === "PRIVATE";

  let normalizedTargetOwner: string | undefined;
  if (!keepPrivateUnshared && !options.keepAdminAsOwner) {
    normalizedTargetOwner = formatTransferTargetPrincipal(
      options.targetOwnerPrincipal || "",
    );
  }

  const normalizedSharedPrincipals = keepPrivateUnshared
    ? []
    : (options.sharedPrincipals || [])
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
  const hasLegacyAuth = hasLegacyAgentAuthorizations(sourceAgent);
  let targetAgent: Agent = sourceAgent;
  let wasCloned = false;

  if (isSourcePrivate || hasLegacyAuth) {
    reportStep(
      hasLegacyAuth && !isSourcePrivate
        ? "Cloning agent definition to migrate deprecated agent.authorizations to authorizationConfig"
        : "Cloning private agent definition as Admin",
    );
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
    if (wasCloned) {
      await deployLowCodeAgent(targetAgentName, config, "DEPLOY");
    } else {
      await deployLowCodeWithAutoRepair(targetAgent, config);
    }
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

  if (keepPrivateUnshared) {
    if (!wasCloned && !isSourcePrivate) {
      reportStep("Withdrawing shared agent to PRIVATE (:withdrawAgent)");
      await withdrawAgent(targetAgentName, config);
    }
  } else {
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
  }

  let deletedOriginal = false;
  if (wasCloned && options.deleteOriginalPrivateAgent) {
    reportStep("Deleting original agent draft");
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

export interface MigrateLegacyAgentOptions {
  displayName?: string;
  sharingScope?: 'PRIVATE' | 'RESTRICTED' | 'ALL_USERS';
  patchPayload?: Partial<Agent>;
  deleteLegacyAgent?: boolean;
}

export interface MigrateLegacyAgentResult {
  agent: Agent;
  migratedFrom: string;
  deletedLegacyAgent: boolean;
  inPlace: boolean;
}

/**
 * Migrates an agent that is blocked from `PATCH` (`UpdateAgent`) due to the deprecated
 * `agent.authorizations` field (`ValidateDeprecatedAuthorizationFieldsAreNotSet`) over to
 * `authorizationConfig.toolAuthorizations`, applying any requested `sharingScope` or `patchPayload`.
 *
 * How it works:
 * 1. If the deprecation is on `adk_agent_definition.authorizations` (and top-level `agent.authorizations`
 *    is not set), `adk_agent_definition` is in `kPublicAgentMutablePaths` and is migrated in-place via `PATCH`.
 * 2. If top-level `agent.authorizations` is set in Spanner (`"authorizations"` is in `kPublicAgentImmutablePaths`
 *    and cannot be cleared via `PATCH`), it safely creates the migrated agent with `authorizationConfig`
 *    (preserving `lowCodeAgentDefinition` / `workflowAgentDefinition` / `adkAgentDefinition` / `a2aAgentDefinition`,
 *    IAM `agentUser` bindings, and `sharingScope`) and deletes the legacy resource only after creation succeeds.
 */
export const migrateLegacyAgentAuthorizations = async (
  agentOrName: Agent | string,
  config: Config,
  options?: MigrateLegacyAgentOptions,
): Promise<MigrateLegacyAgentResult> => {
  const sourceName =
    typeof agentOrName === "string"
      ? resolveFullAgentResourceName(agentOrName, config)
      : resolveFullAgentResourceName(agentOrName.name, config);

  const sourceAgent = await getAgent(sourceName, config);
  const hasTopLevelLegacyAuth =
    Array.isArray(sourceAgent.authorizations) &&
    sourceAgent.authorizations.length > 0;
  const hasNestedAdkLegacyAuth = Array.isArray(
    (sourceAgent.adkAgentDefinition as Record<string, unknown> | undefined)
      ?.authorizations,
  );

  const desiredScope: 'PRIVATE' | 'RESTRICTED' | 'ALL_USERS' =
    options?.sharingScope ||
    (options?.patchPayload?.sharingConfig?.scope as
      | 'PRIVATE'
      | 'RESTRICTED'
      | 'ALL_USERS'
      | undefined) ||
    (sourceAgent.state === "PRIVATE"
      ? "PRIVATE"
      : sourceAgent.sharingConfig?.scope === "ALL_USERS"
        ? "ALL_USERS"
        : "RESTRICTED");

  // Case 1: If top-level `agent.authorizations` is NOT set (e.g. only `adk_agent_definition.authorizations`
  // was set), attempt an in-place PATCH first (`updateAgent` automatically strips `adk_agent_definition.authorizations`
  // and migrates it to `authorizationConfig`).
  if (!hasTopLevelLegacyAuth && hasNestedAdkLegacyAuth) {
    try {
      const inPlacePayload: Partial<Agent> = {
        ...(options?.patchPayload || {}),
      };
      if (options?.displayName) {
        inPlacePayload.displayName = options.displayName;
      }
      if (options?.sharingScope) {
        inPlacePayload.sharingConfig = { scope: options.sharingScope };
      }
      const updated = await updateAgent(sourceAgent, inPlacePayload, config);
      return {
        agent: updated,
        migratedFrom: sourceName,
        deletedLegacyAgent: false,
        inPlace: true,
      };
    } catch (err: unknown) {
      if (!isLegacyAuthorizationsDeprecationError(err)) {
        throw err;
      }
      // Fall through to full re-creation if Spanner also had top-level `authorizations`
    }
  }

  // Merge any requested patchPayload onto sourceAgent before building the clean CreateAgent payload
  const mergedSource: Agent = {
    ...sourceAgent,
    ...(options?.patchPayload || {}),
  };

  const isShareableNoCode = Boolean(
    mergedSource.lowCodeAgentDefinition ||
      mergedSource.workflowAgentDefinition ||
      mergedSource.agentDesignerAgentDefinition ||
      mergedSource.skillAgentDefinition,
  );

  // Preserve existing IAM `roles/discoveryengine.agentUser` principals when migrating a shared agent
  let existingAgentUsers: string[] = [];
  let existingPolicy: IamPolicy | null = null;
  if (sourceAgent.state !== "PRIVATE" && desiredScope !== "PRIVATE") {
    existingPolicy = await getAgentIamPolicy(sourceName, config).catch(
      () => null,
    );
    const userBinding = existingPolicy?.bindings?.find(
      (b) => b.role === "roles/discoveryengine.agentUser",
    );
    if (userBinding?.members?.length) {
      existingAgentUsers = userBinding.members;
    }
  }

  if (isShareableNoCode) {
    const res = await adminPublishAndShareForUser(
      mergedSource,
      {
        displayName:
          options?.displayName ||
          options?.patchPayload?.displayName ||
          mergedSource.displayName,
        sharingScope: desiredScope,
        sharedPrincipals: existingAgentUsers,
        keepAdminAsOwner: true,
        deleteOriginalPrivateAgent: options?.deleteLegacyAgent !== false,
      },
      config,
    );
    return {
      agent: res.agent,
      migratedFrom: sourceName,
      deletedLegacyAgent: res.deletedOriginal,
      inPlace: false,
    };
  }

  // Case 2: ADK / A2A / Dialogflow agent with top-level `agent.authorizations`
  const cleanPayload = buildCloneAgentPayloadForCreate(mergedSource, {
    displayName:
      options?.displayName ||
      options?.patchPayload?.displayName ||
      mergedSource.displayName,
    sharingScope: desiredScope,
  });

  // Create the replacement agent first so the customer never loses the agent if CreateAgent fails
  const created = await createAgent(cleanPayload, config);
  const createdName = resolveFullAgentResourceName(created.name, config);

  if (existingAgentUsers.length > 0 && desiredScope !== "PRIVATE") {
    try {
      const newPolicy: IamPolicy = await getAgentIamPolicy(
        createdName,
        config,
      ).catch(() => ({ bindings: [] }));
      const bindings = [...(newPolicy.bindings || [])];
      const agentUserRole = "roles/discoveryengine.agentUser";
      const idx = bindings.findIndex((b) => b.role === agentUserRole);
      if (idx >= 0) {
        bindings[idx] = {
          ...bindings[idx],
          members: Array.from(
            new Set([...(bindings[idx].members || []), ...existingAgentUsers]),
          ),
        };
      } else {
        bindings.push({
          role: agentUserRole,
          members: Array.from(new Set(existingAgentUsers)),
        });
      }
      await setAgentIamPolicy(
        createdName,
        { ...newPolicy, bindings },
        config,
      );
    } catch (iamErr) {
      console.warn(
        "[migrateLegacyAgentAuthorizations] Could not copy IAM bindings to migrated agent:",
        iamErr,
      );
    }
  }

  if (sourceAgent.state === "DISABLED") {
    try {
      await disableAgent(createdName, config);
    } catch (disErr) {
      console.warn(
        "[migrateLegacyAgentAuthorizations] Could not set DISABLED state on migrated agent:",
        disErr,
      );
    }
  }

  let deletedLegacyAgent = false;
  if (options?.deleteLegacyAgent !== false) {
    await deleteResource(sourceName, config);
    deletedLegacyAgent = true;
  }

  const finalAgent = await getAgent(createdName, config);
  return {
    agent: finalAgent,
    migratedFrom: sourceName,
    deletedLegacyAgent,
    inPlace: false,
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

/**
 * Canonical deterministic agent IDs provisioned by Discovery Engine (`Create1PAgent` in `agent_util.cc`)
 * for first-party Google-managed agents (such as Deep Research, Idea Generation, Data Insights, etc.).
 */
export const DEEP_RESEARCH_AGENT_ID = "deep_research";

export const KNOWN_GOOGLE_MANAGED_AGENT_IDS: ReadonlySet<string> = new Set([
  "deep_research",
  "deep_research_gem3",
  "default_deep_research",
  "idea_generation",
  "idea_forge",
  "data_insights_agent",
  "finance_research",
  "financial_research",
  "coscientist",
  "campus",
  "notebook_lm",
  "core_assistant",
]);

/**
 * Returns true if a Discovery Engine resource name targets a known Google-managed 1P agent
 * under `/assistants/{assistant}/agents/{agentId}` (or a bare 1P agent ID).
 */
export const isProtectedGoogleAgentResourceName = (
  name: string | null | undefined,
): boolean => {
  if (!name) return false;
  const trimmed = name.trim();
  if (!trimmed) return false;

  // Check if it is an agent resource path (`.../assistants/.../agents/<agentId>`)
  const agentMatch = trimmed.match(/\/assistants\/[^/]+\/agents\/([^/?#]+)$/i);
  if (agentMatch) {
    return KNOWN_GOOGLE_MANAGED_AGENT_IDS.has(agentMatch[1].toLowerCase());
  }

  // Also check if a bare agentId was passed
  if (!trimmed.includes("/")) {
    return KNOWN_GOOGLE_MANAGED_AGENT_IDS.has(trimmed.toLowerCase());
  }

  return false;
};

/**
 * Returns true if the given `Agent` is a Google-managed / system built-in agent
 * (e.g., Deep Research `deep_research`, Idea Generation `idea_generation`, Data Insights, etc.).
 *
 * Checks:
 * 1. `agent.managedAgentDefinition` is present (and non-empty object).
 * 2. `agent.agentOrigin` is `'GOOGLE'` or `'SYSTEM'`.
 * 3. `agent.agentType` is `'MANAGED'`, `'MANAGED_AGENT'`, or `'RESEARCH_ASSISTANT_AGENT'`.
 * 4. The trailing agent ID in `agent.name` (or `agent.id`) matches `KNOWN_GOOGLE_MANAGED_AGENT_IDS`.
 */
export const isGoogleManagedAgent = (
  agent: Partial<Agent> | null | undefined,
): boolean => {
  if (!agent) return false;

  if (
    agent.managedAgentDefinition &&
    typeof agent.managedAgentDefinition === "object" &&
    Object.keys(agent.managedAgentDefinition).length > 0
  ) {
    return true;
  }

  const normalizedOrigin = (agent.agentOrigin || "").toUpperCase();
  if (normalizedOrigin === "GOOGLE" || normalizedOrigin === "SYSTEM") {
    return true;
  }

  const normalizedType = (agent.agentType || "").toUpperCase();
  if (
    normalizedType === "MANAGED" ||
    normalizedType === "MANAGED_AGENT" ||
    normalizedType === "RESEARCH_ASSISTANT_AGENT"
  ) {
    return true;
  }

  if (agent.name && isProtectedGoogleAgentResourceName(agent.name)) {
    return true;
  }

  if (
    agent.id &&
    KNOWN_GOOGLE_MANAGED_AGENT_IDS.has(agent.id.trim().toLowerCase())
  ) {
    return true;
  }

  return false;
};

/**
 * Deploys a managed or custom agent via `POST /v1alpha/{name}:deploy`.
 */
export const deployAgent = async (
  name: string,
  config: Config,
): Promise<Record<string, unknown>> => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const agentName = resolveFullAgentResourceName(name, config);
  return gapiRequest<Record<string, unknown>>(
    `${baseUrl}/${DISCOVERY_API_VERSION}/${agentName}:deploy`,
    "POST",
    config.projectId,
    undefined,
    {},
  );
};

/**
 * Re-provisions the built-in Google Deep Research (`deep_research`) agent on an existing
 * Gemini Enterprise engine/assistant if it was accidentally deleted or failed initial provisioning.
 *
 * Uses the canonical `GetOrcasV1MainRaAgent` / `ConfigureManagedAgentDefinition` payload from
 * Discovery Engine (`cloud/ml/discoveryengine/common/utils/agent_util.cc`):
 * - `POST /v1alpha/{parent}/agents?agentId=deep_research`
 * - `managedAgentDefinition.researchAssistantAgentConfig.supportLroQueries = true`
 * - `sharingConfig.scope = "ALL_USERS"`
 * - `longRunningOperationsEnabled = true`
 * Followed by `:deploy` and `:enableAgent` if the returned state is not `ENABLED`.
 */
export const restoreDeepResearchAgent = async (
  config: Config,
): Promise<Agent> => {
  const description =
    "This agent is a specialized agent that gathers, analyzes, and understands information from internal and external sources. It generates a plan, an in-depth report, and a summary.";

  const payload: Partial<Agent> & Record<string, unknown> = {
    displayName: "Deep Research",
    description,
    managedAgentDefinition: {
      toolSettings: {
        toolDescription: description,
      },
      researchAssistantAgentConfig: {
        supportLroQueries: true,
      },
    },
    sharingConfig: {
      scope: "ALL_USERS",
    },
    longRunningOperationsEnabled: true,
  };

  const created = await createAgent(
    payload,
    {
      ...config,
      collectionId: config.collectionId || "default_collection",
      assistantId: config.assistantId || "default_assistant",
    },
    DEEP_RESEARCH_AGENT_ID,
  );

  const agentName = resolveFullAgentResourceName(
    created.name || DEEP_RESEARCH_AGENT_ID,
    config,
  );

  // Trigger `:deploy` if the newly created managed agent is in CONFIGURED / undeployed state
  if (created.state !== "ENABLED") {
    try {
      await deployAgent(agentName, config);
    } catch (deployErr) {
      console.warn(
        "[restoreDeepResearchAgent] :deploy returned non-fatal warning (may already be deployed inline):",
        deployErr,
      );
    }
  }

  // Ensure the agent is transitioned to ENABLED state
  try {
    const latest = await getAgent(agentName, config);
    if (latest.state && latest.state !== "ENABLED") {
      return await enableAgent(agentName, config);
    }
    return latest;
  } catch (getErr) {
    console.warn(
      "[restoreDeepResearchAgent] Could not re-fetch agent after creation, returning created resource:",
      getErr,
    );
    return created;
  }
};

export const deleteResource = async (
  name: string,
  config: Config,
  options?: { allowProtectedGoogleAgent?: boolean },
) => {
  if (
    !options?.allowProtectedGoogleAgent &&
    isProtectedGoogleAgentResourceName(name)
  ) {
    const agentId = name.split("/").pop() || name;
    throw new Error(
      `Deletion blocked: "${agentId}" is a Google-managed built-in agent and cannot be deleted. To hide it from users without permanently destroying its Spanner resource, toggle its status to Disabled instead.`,
    );
  }
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
