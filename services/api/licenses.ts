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

import { Config, Operation, UserStore, ProjectOverageConfig } from "../../types";
import {
  UserLicense,
  LicenseConfig,
  BillingAccount,
  BillingAccountLicenseConfig,
} from "../../components/license/types";
import {
  gapiRequest,
  getDiscoveryEngineUrl,
  getLocationFromResourceName,
  DISCOVERY_API_VERSION,
} from "./core";
import { pollDiscoveryOperation } from "./discoveryEngine";

export const listUserStoreLicenses = async (
  config: Config,
  userStoreId: string,
  filter?: string,
  pageToken?: string,
  pageSize: number = 20,
): Promise<{ userLicenses?: UserLicense[]; nextPageToken?: string }> => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  let url = `${baseUrl}/v1/projects/${projectId}/locations/${appLocation}/userStores/${userStoreId}/userLicenses?pageSize=${pageSize}`;
  if (filter) url += `&filter=${encodeURIComponent(filter)}`;
  if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
  return gapiRequest<{ userLicenses?: UserLicense[]; nextPageToken?: string }>(url, "GET", projectId);
};

export const revokeUserLicenses = async (
  config: Config,
  userStoreId: string,
  userPrincipals: string[],
): Promise<Operation> => {
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
  const op = await gapiRequest<Operation>(url, "POST", projectId, undefined, body);
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
): Promise<Operation> => {
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
  const op = await gapiRequest<Operation>(url, "POST", projectId, undefined, body);
  if (op?.name && !op.done) {
    return pollDiscoveryOperation(op, config, "v1", 45, 2000);
  }
  return op;
};

export const deleteUserLicenses = async (
  config: Config,
  userStoreId: string,
  userPrincipals: string[],
): Promise<Operation> => {
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
  const op = await gapiRequest<Operation>(url, "POST", projectId, undefined, body);
  if (op?.name && !op.done) {
    return pollDiscoveryOperation(op, config, "v1", 45, 2000);
  }
  return op;
};

export const listBillingAccounts = async (config: Config): Promise<{ billingAccounts?: BillingAccount[] }> => {
  const url = `https://cloudbilling.googleapis.com/v1/billingAccounts`;
  return gapiRequest<{ billingAccounts?: BillingAccount[] }>(url, "GET", config.projectId);
};

export const testBillingAccountPermissions = async (
  billingAccountId: string,
  config: Config,
) => {
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
): Promise<{ billingAccountLicenseConfigs?: BillingAccountLicenseConfig[] }> => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/billingAccounts/${billingAccountId}/billingAccountLicenseConfigs`;
  return gapiRequest<{ billingAccountLicenseConfigs?: BillingAccountLicenseConfig[] }>(
    url,
    "GET",
    config.projectId,
  );
};

export const listLicenseConfigs = async (config: Config): Promise<{ licenseConfigs?: LicenseConfig[] }> => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${appLocation}/licenseConfigs`;
  return gapiRequest<{ licenseConfigs?: LicenseConfig[] }>(url, "GET", projectId);
};

export interface LicenseConfigUsageStat {
  licenseConfig?: string;
  assignedCount?: number | string;
  activeCount?: number | string;
  [key: string]: unknown;
}

export const listLicenseConfigsUsageStats = async (
  config: Config,
  userStoreId: string = "default_user_store",
): Promise<{ licenseConfigUsageStats?: LicenseConfigUsageStat[] }> => {
  const { projectId, appLocation } = config;
  const baseUrl = getDiscoveryEngineUrl(appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${appLocation}/userStores/${userStoreId}/licenseConfigsUsageStats`;
  return gapiRequest<{ licenseConfigUsageStats?: LicenseConfigUsageStat[] }>(url, "GET", projectId);
};

export const listUserLicenses = async (config: Config) => {
  return listUserStoreLicenses(config, "default_user_store", undefined, undefined, 100);
};

export const getLicenseConfig = async (name: string, config: Config): Promise<LicenseConfig> => {
  const location = getLocationFromResourceName(name);
  const baseUrl = getDiscoveryEngineUrl(location);
  return gapiRequest<LicenseConfig>(
    `${baseUrl}/${DISCOVERY_API_VERSION}/${name}`,
    "GET",
    config.projectId,
  );
};

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
): Promise<Operation | Record<string, unknown>> => {
  const { projectId } = config;
  const baseUrl = getDiscoveryEngineUrl(payload.location);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/billingAccounts/${billingAccountId}/billingAccountLicenseConfigs/${billingAccountLicenseConfigId}:distributeLicenseConfig`;

  return gapiRequest<Operation | Record<string, unknown>>(url, "POST", projectId, undefined, payload);
};

export const probeProjectLicense = async (
  billingAccountId: string,
  billingAccountLicenseConfigId: string,
  projectNumber: string,
  config: Config,
  projectLicenseConfigId?: string,
) => {
  const payload: {
    projectNumber: string;
    location: string;
    licenseCount: number;
    licenseConfigId?: string;
  } = {
    projectNumber,
    location: config.appLocation,
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
    licenseConfig: string;
    licenseCount: number;
  },
  config: Config,
): Promise<Operation | Record<string, unknown>> => {
  const { projectId } = config;
  const location = getLocationFromResourceName(payload.licenseConfig);
  const baseUrl = getDiscoveryEngineUrl(location);

  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/billingAccounts/${billingAccountId}/billingAccountLicenseConfigs/${billingAccountLicenseConfigId}:retractLicenseConfig`;

  return gapiRequest<Operation | Record<string, unknown>>(url, "POST", projectId, undefined, payload);
};

export const getUserStore = async (
  config: Pick<Config, "projectId" | "appLocation">,
  userStoreId: string = "default_user_store",
): Promise<UserStore> => {
  const projectId = (config.projectId || "").trim();
  if (!projectId) {
    throw new Error("Project ID is required to fetch UserStore.");
  }
  const storeId = (userStoreId || "default_user_store").trim();
  if (!storeId || !/^[a-zA-Z0-9_-]+$/.test(storeId)) {
    throw new Error(`Invalid userStoreId: "${userStoreId}"`);
  }
  const location = (config.appLocation || "global").trim().toLowerCase();
  const baseUrl = getDiscoveryEngineUrl(location);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${location}/userStores/${storeId}`;
  return gapiRequest<UserStore>(url, "GET", projectId);
};

export const updateUserStore = async (
  userStore: Partial<UserStore>,
  updateMask: string[],
  config: Pick<Config, "projectId" | "appLocation">,
  userStoreId: string = "default_user_store",
): Promise<UserStore> => {
  const projectId = (config.projectId || "").trim();
  if (!projectId) {
    throw new Error("Project ID is required to update UserStore.");
  }
  if (!Array.isArray(updateMask) || updateMask.length === 0) {
    throw new Error("updateMask must contain at least one field when updating UserStore.");
  }
  const storeId = (userStoreId || "default_user_store").trim();
  if (!storeId || !/^[a-zA-Z0-9_-]+$/.test(storeId)) {
    throw new Error(`Invalid userStoreId: "${userStoreId}"`);
  }
  const location = (config.appLocation || "global").trim().toLowerCase();
  const baseUrl = getDiscoveryEngineUrl(location);
  const resourceName = `projects/${projectId}/locations/${location}/userStores/${storeId}`;
  const maskParam = encodeURIComponent(updateMask.join(","));
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${resourceName}?updateMask=${maskParam}`;
  return gapiRequest<UserStore>(url, "PATCH", projectId, undefined, {
    name: resourceName,
    ...userStore,
  });
};

export const getProjectOverageConfig = async (
  config: Pick<Config, "projectId" | "appLocation">,
  checkEligibility: boolean = true,
): Promise<ProjectOverageConfig> => {
  const projectId = (config.projectId || "").trim();
  if (!projectId) {
    throw new Error("Project ID is required to fetch ProjectOverageConfig.");
  }
  const location = (config.appLocation || "global").trim().toLowerCase();
  const baseUrl = getDiscoveryEngineUrl(location);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/projects/${projectId}/locations/${location}/projectOverageConfig?checkBillingAccountEligibility=${Boolean(checkEligibility)}`;
  return gapiRequest<ProjectOverageConfig>(url, "GET", projectId);
};

export const updateProjectOverageConfig = async (
  overageConfig: Partial<ProjectOverageConfig>,
  updateMask: string[],
  config: Pick<Config, "projectId" | "appLocation">,
): Promise<ProjectOverageConfig> => {
  const projectId = (config.projectId || "").trim();
  if (!projectId) {
    throw new Error("Project ID is required to update ProjectOverageConfig.");
  }
  if (!Array.isArray(updateMask) || updateMask.length === 0) {
    throw new Error("updateMask must contain at least one field when updating ProjectOverageConfig.");
  }
  const location = (config.appLocation || "global").trim().toLowerCase();
  const baseUrl = getDiscoveryEngineUrl(location);
  const resourceName = `projects/${projectId}/locations/${location}/projectOverageConfig`;
  const maskParam = encodeURIComponent(updateMask.join(","));
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${resourceName}?updateMask=${maskParam}`;
  return gapiRequest<ProjectOverageConfig>(url, "PATCH", projectId, undefined, {
    name: resourceName,
    ...overageConfig,
  });
};
