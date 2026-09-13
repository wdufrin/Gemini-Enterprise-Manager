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

import { AppEngine, Config, CollectionItem, ListResourcesResponse, IamPolicy, Operation } from "../../../types";
import {
  gapiRequest,
  getDiscoveryEngineUrl,
  DISCOVERY_API_VERSION,
  DISCOVERY_API_BETA,
} from "../core";

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
  if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

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
  console.log("[DEBUG] getEngine:", engine);
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
  const baseUrl = getDiscoveryEngineUrl(appLocation);

  const resourcePath = name.startsWith("projects/")
    ? name
    : `projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${name}`;

  const url = `${baseUrl}/${DISCOVERY_API_BETA}/${resourcePath}?updateMask=${updateMask.join(",")}`;
  return gapiRequest<AppEngine>(url, "PATCH", projectId, undefined, payload);
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

  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${resourcePath}:getIamPolicy`;
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

  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${resourcePath}:setIamPolicy`;
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
