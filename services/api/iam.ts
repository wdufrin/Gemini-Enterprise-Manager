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
  CustomRole,
  IamPolicy,
  ServiceAccount,
  WorkloadIdentityPool,
  WorkloadIdentityProvider,
} from "../../types";
import { gapiRequest, getDiscoveryEngineUrl, DISCOVERY_API_VERSION } from "./core";

export const checkServiceAccountPermissions = async (
  projectId: string,
  saEmail: string,
  permissions: string[],
): Promise<{ hasAll: boolean; missing: string[] }> => {
  const response = await gapiRequest<{ permissions?: string[] }>(
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
): Promise<ServiceAccount[]> => {
  let allAccounts: ServiceAccount[] = [];
  let pageToken = "";
  do {
    let url = `https://iam.googleapis.com/v1/projects/${projectId}/serviceAccounts?pageSize=100`;
    if (pageToken) url += `&pageToken=${pageToken}`;
    const response = await gapiRequest<{ accounts?: ServiceAccount[]; nextPageToken?: string }>(url, "GET", projectId);
    if (response.accounts) {
      allAccounts = allAccounts.concat(response.accounts);
    }
    pageToken = response.nextPageToken || "";
  } while (pageToken);
  return allAccounts;
};

export const listWorkloadIdentityPools = async (
  projectId: string,
): Promise<WorkloadIdentityPool[]> => {
  let allPools: WorkloadIdentityPool[] = [];
  let pageToken = "";
  do {
    let url = `https://iam.googleapis.com/v1/projects/${projectId}/locations/global/workloadIdentityPools?pageSize=50`;
    if (pageToken) url += `&pageToken=${pageToken}`;
    const response = await gapiRequest<{
      workloadIdentityPools?: WorkloadIdentityPool[];
      workforcePools?: WorkloadIdentityPool[];
      nextPageToken?: string;
    }>(url, "GET", projectId);
    const pools = response.workloadIdentityPools || response.workforcePools;
    if (pools) {
      allPools = allPools.concat(
        pools.filter((p) => p.state !== "DELETED"),
      );
    }
    pageToken = response.nextPageToken || "";
  } while (pageToken);
  return allPools;
};

export const listWorkloadIdentityProviders = async (
  poolName: string,
  projectId: string,
): Promise<WorkloadIdentityProvider[]> => {
  let allProviders: WorkloadIdentityProvider[] = [];
  let pageToken = "";
  do {
    let url = `https://iam.googleapis.com/v1/${poolName}/providers?pageSize=50`;
    if (pageToken) url += `&pageToken=${pageToken}`;
    const response = await gapiRequest<{
      workloadIdentityProviders?: WorkloadIdentityProvider[];
      workforcePoolProviders?: WorkloadIdentityProvider[];
      nextPageToken?: string;
    }>(url, "GET", projectId);
    const providers = response.workloadIdentityProviders || response.workforcePoolProviders;
    if (providers) {
      allProviders = allProviders.concat(
        providers.filter((p) => p.state !== "DELETED"),
      );
    }
    pageToken = response.nextPageToken || "";
  } while (pageToken);
  return allProviders;
};

export const getServiceAccountIamPolicy = async (
  saEmail: string,
  projectId: string,
): Promise<IamPolicy> => {
  const url = `https://iam.googleapis.com/v1/projects/-/serviceAccounts/${saEmail}:getIamPolicy`;
  return gapiRequest<IamPolicy>(url, "POST", projectId, undefined, {});
};

export const getProjectIamPolicy = async (projectId: string): Promise<IamPolicy> => {
  const url = `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:getIamPolicy`;
  return gapiRequest<IamPolicy>(url, "POST", projectId, undefined, {
    options: { requestedPolicyVersion: 3 },
  });
};

export const setProjectIamPolicy = async (
  projectId: string,
  policy: IamPolicy,
): Promise<IamPolicy> => {
  const url = `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:setIamPolicy`;
  return gapiRequest<IamPolicy>(url, "POST", projectId, undefined, { policy });
};

export const getCustomRole = async (
  projectId: string,
  roleId: string,
): Promise<CustomRole> => {
  const url = `https://iam.googleapis.com/v1/projects/${projectId}/roles/${roleId}`;
  return gapiRequest<CustomRole>(url, "GET", projectId, undefined, undefined, undefined, true);
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
): Promise<CustomRole> => {
  const url = `https://iam.googleapis.com/v1/projects/${projectId}/roles`;
  return gapiRequest<CustomRole>(url, "POST", projectId, undefined, {
    roleId,
    role: {
      title: roleData.title,
      description: roleData.description,
      stage: roleData.stage || "GA",
      includedPermissions: roleData.includedPermissions,
    },
  });
};

export const getAgentIamPolicy = async (name: string, config: Config): Promise<IamPolicy> => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${name}:getIamPolicy`;
  return gapiRequest<IamPolicy>(url, "GET", config.projectId);
};

export const setAgentIamPolicy = async (
  name: string,
  policy: IamPolicy,
  config: Config,
): Promise<IamPolicy> => {
  const baseUrl = getDiscoveryEngineUrl(config.appLocation);
  const url = `${baseUrl}/${DISCOVERY_API_VERSION}/${name}:setIamPolicy`;

  // Read-modify-write concurrency protection: if etag is missing, fetch current policy first to obtain etag
  const finalPolicy: IamPolicy = { ...policy };
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

  return gapiRequest<IamPolicy>(url, "POST", config.projectId, undefined, { policy: finalPolicy });
};
