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

import { AppEngine, CmekConfig, Config, CollectionItem, ListResourcesResponse, IamPolicy, Operation } from "../../../types";
import {
  gapiRequest,
  getDiscoveryEngineUrl,
  DISCOVERY_API_VERSION,
  DISCOVERY_API_BETA,
} from "../core";
import { getCachedProjectEnrollment } from "../project";
import {
  GOOGLE_INTERNAL_ENGINE_UPDATE_FIELDS,
  isGoogleInternalEngineField,
} from "./engineFieldVisibility";

export const listDiscoveryEngines = async (
  config: Config,
  pageToken?: string,
  pageSize: number = 200,
  suppressErrorLog?: boolean,
) => {
  return listResources("engines", config, pageToken, pageSize, suppressErrorLog);
};

export const listResources = async <T = unknown>(
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
): Promise<ListResourcesResponse<T>> => {
  const { projectId, appLocation, collectionId, appId, assistantId } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  let endpointUrl = "";

  switch (resourceType) {
    case "collections":
      endpointUrl = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${appLocation}/collections`;
      break;
    case "engines":
      endpointUrl = `${baseUrl}/${DISCOVERY_API_BETA}/projects/${projectId}/locations/${appLocation}/collections/${collectionId || "default_collection"}/engines`;
      break;
    case "assistants":
      endpointUrl = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}/assistants`;
      break;
    case "agents":
      endpointUrl = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}/assistants/${assistantId}/agents`;
      break;
    case "dataStores":
      endpointUrl = `${baseUrl}/${DISCOVERY_API_BETA}/projects/${projectId}/locations/${appLocation}/collections/${collectionId || "default_collection"}/dataStores`;
      break;
  }

  const fetchSinglePage = async (
    token?: string,
  ): Promise<ListResourcesResponse<T>> => {
    let url = `${endpointUrl}?pageSize=${pageSize}`;
    if (token) url += `&pageToken=${encodeURIComponent(token)}`;

    return gapiRequest<ListResourcesResponse<T>>(
      url,
      "GET",
      projectId,
      undefined,
      undefined,
      undefined,
      suppressErrorLog,
    );
  };

  // If the caller explicitly supplied a pageToken, fetch that single page.
  if (pageToken !== undefined) {
    return fetchSinglePage(pageToken);
  }

  // Otherwise, automatically paginate through all pages so callers (such as Agent Manager,
  // Assistant Details, Agent Permissions, and Config Audit) never truncate at 200 items.
  const allItems: unknown[] = [];
  const seenTokens = new Set<string>();
  let currentToken: string | undefined = undefined;
  let lastResponse: ListResourcesResponse<T> = {};

  do {
    const response = await fetchSinglePage(currentToken);
    lastResponse = response || {};
    const pageItems = lastResponse[resourceType];
    if (Array.isArray(pageItems)) {
      allItems.push(...(pageItems as unknown[]));
    }
    const nextToken = lastResponse.nextPageToken;
    if (!nextToken || seenTokens.has(nextToken)) {
      currentToken = undefined;
    } else {
      seenTokens.add(nextToken);
      currentToken = nextToken;
    }
  } while (currentToken);

  return {
    ...lastResponse,
    [resourceType]: allItems,
    nextPageToken: undefined,
  } as ListResourcesResponse<T>;
};

export const createCollection = async (
  collectionId: string,
  payload: Partial<CollectionItem> | Record<string, unknown>,
  config: Config,
): Promise<CollectionItem | Operation<CollectionItem>> => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${appLocation}/collections?collectionId=${collectionId}`;
  return gapiRequest<CollectionItem | Operation<CollectionItem>>(url, "POST", projectId, undefined, payload);
};

export const updateCollection = async (
  name: string,
  payload: Partial<CollectionItem> | Record<string, unknown>,
  updateMask: string[],
  config: Config,
): Promise<CollectionItem | Operation<CollectionItem>> => {
  const { projectId } = config;
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${name}?updateMask=${updateMask.join(",")}`;
  return gapiRequest<CollectionItem | Operation<CollectionItem>>(url, "PATCH", projectId, undefined, payload);
};

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
  return engine;
};

export const createEngine = async (
  engineId: string,
  payload: Partial<AppEngine> | Record<string, unknown>,
  config: Config,
): Promise<Operation<AppEngine>> => {
  const {
    projectId,
    appLocation,
    collectionId = "default_collection",
  } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_BETA}/projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines?engineId=${engineId}`;
  return gapiRequest<Operation<AppEngine>>(url, "POST", projectId, undefined, payload);
};

/**
 * Read-only Engine fields (`OUTPUT_ONLY` in `v1main/engine.proto`) that must never be
 * included in an Engine PATCH payload or updateMask.
 */
const ENGINE_OUTPUT_ONLY_FIELDS: readonly string[] = [
  "effectiveFeatures",
  "effective_features",
  "associatedAgentRegistry",
  "associated_agent_registry",
  "cmekConfig",
  "cmek_config",
  "featurePolicyRejections",
  "feature_policy_rejections",
  "agentCloudConfig",
  "agent_cloud_config",
];

const isOutputOnlyEngineField = (maskField: string): boolean => {
  const topLevel = maskField.split(".")[0];
  return ENGINE_OUTPUT_ONLY_FIELDS.includes(topLevel);
};

/**
 * Strips OUTPUT_ONLY fields and, when the target project is known not to be enrolled
 * in GOOGLE_INTERNAL, strips GOOGLE_INTERNAL fields from an Engine update payload and updateMask.
 */
export const sanitizeEngineUpdateForEnrollment = (
  payload: Partial<AppEngine> | Record<string, unknown>,
  updateMask: string[],
  projectId?: string,
): { sanitizedPayload: Partial<AppEngine> | Record<string, unknown>; sanitizedMask: string[] } => {
  const sanitizedPayload: Record<string, unknown> = { ...payload };
  ENGINE_OUTPUT_ONLY_FIELDS.forEach((field) => {
    delete sanitizedPayload[field];
  });
  let sanitizedMask = updateMask.filter((field) => !isOutputOnlyEngineField(field));

  const enrollment = getCachedProjectEnrollment(projectId);
  if (!enrollment || enrollment.googleInternal) {
    return { sanitizedPayload, sanitizedMask };
  }

  GOOGLE_INTERNAL_ENGINE_UPDATE_FIELDS.forEach((field) => {
    delete sanitizedPayload[field];
  });

  sanitizedMask = sanitizedMask.filter(
    (field) => !isGoogleInternalEngineField(field),
  );

  return { sanitizedPayload, sanitizedMask };
};

const requiresV1AlphaEngineEndpoint = (
  payload: Partial<AppEngine> | Record<string, unknown>,
  updateMask: string[],
): boolean => {
  const obs = payload.observabilityConfig as Record<string, unknown> | undefined;
  if (
    obs &&
    (obs.artifactGcsBucket !== undefined || obs.userPrincipalLoggingEnabled !== undefined)
  ) {
    return true;
  }
  return updateMask.some(
    (f) =>
      f.includes("artifactGcsBucket") ||
      f.includes("artifact_gcs_bucket") ||
      f.includes("userPrincipalLoggingEnabled") ||
      f.includes("user_principal_logging_enabled") ||
      f.startsWith("importedTools") ||
      f.startsWith("imported_tools"),
  );
};

export const updateEngine = async (
  name: string,
  payload: Partial<AppEngine> | Record<string, unknown>,
  updateMask: string[],
  config: Config,
): Promise<AppEngine> => {
  const {
    projectId,
    appLocation,
    collectionId = "default_collection",
  } = config;
  const { sanitizedPayload, sanitizedMask } = sanitizeEngineUpdateForEnrollment(
    payload,
    updateMask,
    projectId,
  );
  const baseUrl = getDiscoveryEngineUrl(appLocation);

  const resourcePath = name.startsWith("projects/")
    ? name
    : `projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${name}`;

  const apiVer = requiresV1AlphaEngineEndpoint(sanitizedPayload, sanitizedMask)
    ? DISCOVERY_API_VERSION
    : DISCOVERY_API_BETA;
  const url = `${baseUrl}/${apiVer}/${resourcePath}?updateMask=${sanitizedMask.join(",")}`;
  return gapiRequest<AppEngine>(url, "PATCH", projectId, undefined, sanitizedPayload);
};

export const getEngineIamPolicy = async (name: string, config: Config): Promise<IamPolicy> => {
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
  return gapiRequest<IamPolicy>(url, "GET", projectId);
};

export const setEngineIamPolicy = async (
  name: string,
  policy: IamPolicy,
  config: Config,
): Promise<IamPolicy> => {
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
  return gapiRequest<IamPolicy>(url, "POST", projectId, undefined, { policy });
};

export const getCollectionIamPolicy = async (
  name: string,
  config: Config,
): Promise<IamPolicy> => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);

  const resourcePath = name.startsWith("projects/")
    ? name
    : `projects/${projectId}/locations/${appLocation}/collections/${name}`;

  const url = `${baseUrl}/v1/${resourcePath}:getIamPolicy`;
  return gapiRequest<IamPolicy>(url, "GET", projectId);
};

export const setCollectionIamPolicy = async (
  name: string,
  policy: IamPolicy,
  config: Config,
): Promise<IamPolicy> => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);

  const resourcePath = name.startsWith("projects/")
    ? name
    : `projects/${projectId}/locations/${appLocation}/collections/${name}`;

  const url = `${baseUrl}/v1/${resourcePath}:setIamPolicy`;
  return gapiRequest<IamPolicy>(url, "POST", projectId, undefined, { policy });
};

export const listCollections = async (
  config: Config,
): Promise<{ collections?: CollectionItem[] }> => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${appLocation}/collections`;
  return gapiRequest<{ collections?: CollectionItem[] }>(url, "GET", projectId, undefined, undefined, undefined, true);
};

export const getCmekConfig = async (
  config: Config,
  cmekConfigName?: string,
  suppressErrorLog?: boolean,
): Promise<CmekConfig> => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const resourcePath = cmekConfigName
    ? cmekConfigName.startsWith("projects/")
      ? cmekConfigName
      : `projects/${projectId}/locations/${appLocation}/cmekConfigs/${cmekConfigName}`
    : `projects/${projectId}/locations/${appLocation}/cmekConfig`;
  const url = `${baseUrl}/v1/${resourcePath}`;
  return gapiRequest<CmekConfig>(url, "GET", projectId, undefined, undefined, undefined, suppressErrorLog);
};

export const listCmekConfigs = async (
  config: Config,
  suppressErrorLog: boolean = true,
): Promise<{ cmekConfigs?: CmekConfig[] }> => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/v1/projects/${projectId}/locations/${appLocation}/cmekConfigs`;
  return gapiRequest<{ cmekConfigs?: CmekConfig[] }>(url, "GET", projectId, undefined, undefined, undefined, suppressErrorLog);
};
