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
  Assistant,
  Config,
  WidgetConfig,
  ListMemoriesResponse,
  IdpConfig,
  AclConfig,
  WorkloadIdentityProvider,
  ScimTenant,
} from "../../../types";
import {
  gapiRequest,
  getDiscoveryEngineUrl,
  DISCOVERY_API_VERSION,
  DISCOVERY_API_BETA,
} from "../core";
import { getProjectNumber } from "../project";

export const getWidgetConfig = async (name: string, config: Config) => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/v1alpha/${name}/widgetConfigs/default_search_widget_config?model_info_view=ADMIN`;
  return gapiRequest<WidgetConfig>(url, "GET", projectId);
};

export const updateWidgetConfig = async (
  name: string,
  payload: Partial<WidgetConfig> | Record<string, unknown>,
  updateMask: string[],
  config: Config,
) => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/v1alpha/${name}/widgetConfigs/default_search_widget_config?updateMask=${updateMask.join(",")}`;
  return gapiRequest<WidgetConfig>(url, "PATCH", projectId, undefined, payload);
};

/**
 * Retrieves the Identity Provider configuration for the project/location via AclConfig.
 *
 * NOTE: Google Cloud Discovery Engine does not provide an engine-level `.../engines/{id}/idpConfig`
 * endpoint. IdP configuration is a regional setting on `projects/{project}/locations/{location}/aclConfig`.
 */
export const getIdpConfig = async (
  _name: string,
  config: Config,
): Promise<IdpConfig | undefined> => {
  const acl = await getAclConfig(config);
  return acl?.idpConfig;
};

/**
 * Updates the Identity Provider configuration for the project/location via AclConfig.
 */
export const updateIdpConfig = async (
  _name: string,
  payload: Partial<IdpConfig> | Record<string, unknown>,
  config: Config,
): Promise<IdpConfig | undefined> => {
  const acl = await updateAclConfig({ idpConfig: payload as IdpConfig }, config);
  return acl?.idpConfig;
};


export const getAclConfig = async (config: Config): Promise<AclConfig> => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_BETA}/projects/${projectId}/locations/${appLocation}/aclConfig`;
  return gapiRequest<AclConfig>(url, "GET", projectId);
};

export const updateAclConfig = async (
  payload: Partial<AclConfig> | Record<string, unknown>,
  config: Config,
): Promise<AclConfig> => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_BETA}/projects/${projectId}/locations/${appLocation}/aclConfig`;
  return gapiRequest<AclConfig>(url, "PATCH", projectId, undefined, payload);
};

export const getWorkforcePoolProviders = async (
  poolName: string,
  config: Config,
): Promise<{ workforcePoolProviders?: WorkloadIdentityProvider[] }> => {
  const poolId = poolName.split("/").pop();
  if (!poolId) return { workforcePoolProviders: [] };

  const url = `https://iam.googleapis.com/v1/locations/global/workforcePools/${poolId}/providers`;
  try {
    const response = await gapiRequest<{ workforcePoolProviders?: WorkloadIdentityProvider[] }>(url, "GET", config.projectId);
    return response;
  } catch (err) {
    console.error("Failed to fetch workforce pool providers:", err);
    return { workforcePoolProviders: [] };
  }
};

export const getWorkforcePoolProviderScimTenants = async (
  providerName: string,
  config: Config,
): Promise<{ workforcePoolProviderScimTenants?: ScimTenant[] }> => {
  const url = `https://iam.googleapis.com/v1/${providerName}/scimTenants?showDeleted=False`;
  try {
    const response = await gapiRequest<{ workforcePoolProviderScimTenants?: ScimTenant[] }>(url, "GET", config.projectId);
    return response;
  } catch (err) {
    console.error("Failed to fetch workforce pool provider SCIM tenants:", err);
    return { workforcePoolProviderScimTenants: [] };
  }
};

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
  payload: Partial<Assistant>,
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
  payload: Partial<Assistant> | Record<string, unknown>,
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
): Promise<Record<string, unknown>> => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${memoryName}`;
  return gapiRequest<Record<string, unknown>>(
    url,
    "DELETE",
    config.projectId,
    undefined,
    undefined,
    undefined,
    config.suppressErrorLog,
  );
};
