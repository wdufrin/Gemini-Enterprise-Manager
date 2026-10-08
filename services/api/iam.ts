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

const ROLE_PERMISSION_PREFIX_MAP: Record<string, string[]> = {
  "roles/owner": ["*"],
  "roles/editor": ["*"],
  "roles/viewer": [
    "discoveryengine.dataStores.get",
    "discoveryengine.collections.get",
    "bigquery.tables.get",
    "bigquery.datasets.get",
    "storage.objects.get",
    "storage.objects.list",
    "storage.buckets.get",
    "alloydb.instances.get",
    "cloudsql.instances.get",
    "spanner.databases.get",
    "bigtable.tables.get",
    "datastore.entities.get",
  ],
  "roles/discoveryengine.serviceAgent": ["discoveryengine.", "bigquery."],
  "roles/discoveryengine.admin": ["discoveryengine."],
  "roles/discoveryengine.editor": ["discoveryengine."],
  "roles/discoveryengine.viewer": [
    "discoveryengine.dataStores.get",
    "discoveryengine.collections.get",
  ],
  "roles/bigquery.admin": ["bigquery."],
  "roles/bigquery.dataEditor": ["bigquery.tables.", "bigquery.datasets.get"],
  "roles/bigquery.dataViewer": [
    "bigquery.tables.get",
    "bigquery.tables.getData",
    "bigquery.tables.list",
    "bigquery.datasets.get",
  ],
  "roles/bigquery.jobUser": ["bigquery.jobs.create"],
  "roles/bigquery.user": ["bigquery.jobs.create", "bigquery.datasets.get", "bigquery.tables.list"],
  "roles/storage.admin": ["storage."],
  "roles/storage.objectAdmin": ["storage.objects.", "storage.buckets.get"],
  "roles/storage.objectCreator": ["storage.objects.create"],
  "roles/storage.objectViewer": ["storage.objects.get", "storage.objects.list", "storage.buckets.get"],
  "roles/alloydb.admin": ["alloydb."],
  "roles/alloydb.client": ["alloydb."],
  "roles/alloydb.viewer": ["alloydb.instances.get", "alloydb.instances.list", "alloydb.clusters.get"],
  "roles/alloydb.databaseUser": ["alloydb.instances.get", "alloydb.databases."],
  "roles/cloudsql.admin": ["cloudsql."],
  "roles/cloudsql.client": ["cloudsql."],
  "roles/cloudsql.viewer": ["cloudsql.instances.get", "cloudsql.instances.list"],
  "roles/cloudsql.instanceUser": ["cloudsql.instances.get", "cloudsql.instances.login"],
  "roles/spanner.admin": ["spanner."],
  "roles/spanner.databaseUser": ["spanner.databases.", "spanner.instances.get"],
  "roles/spanner.databaseReader": [
    "spanner.databases.get",
    "spanner.databases.read",
    "spanner.databases.select",
    "spanner.databases.beginReadOnlyTransaction",
    "spanner.sessions.",
  ],
  "roles/spanner.viewer": ["spanner.databases.get", "spanner.instances.get"],
  "roles/bigtable.admin": ["bigtable."],
  "roles/bigtable.user": ["bigtable.tables.", "bigtable.instances.get", "bigtable.clusters.get"],
  "roles/bigtable.reader": [
    "bigtable.tables.get",
    "bigtable.tables.readRows",
    "bigtable.tables.list",
    "bigtable.instances.get",
  ],
  "roles/bigtable.viewer": ["bigtable.tables.get", "bigtable.tables.list", "bigtable.instances.get"],
  "roles/datastore.owner": ["datastore."],
  "roles/datastore.importExportAdmin": ["datastore."],
  "roles/datastore.user": ["datastore.entities.", "datastore.databases.get", "datastore.indexes."],
  "roles/datastore.viewer": [
    "datastore.entities.get",
    "datastore.entities.list",
    "datastore.databases.get",
  ],
};

const roleGrantsRequirement = (boundRoles: Set<string>, requirement: string): boolean => {
  if (requirement.startsWith("roles/")) {
    return (
      boundRoles.has(requirement) ||
      boundRoles.has("roles/owner") ||
      boundRoles.has("roles/editor")
    );
  }
  for (const role of boundRoles) {
    const patterns = ROLE_PERMISSION_PREFIX_MAP[role];
    if (!patterns) continue;
    for (const pattern of patterns) {
      if (pattern === "*" || pattern === requirement || (pattern.endsWith(".") && requirement.startsWith(pattern))) {
        return true;
      }
    }
  }
  return false;
};

export const checkServiceAccountPermissions = async (
  projectId: string,
  saEmail: string,
  permissions: string[],
): Promise<{ hasAll: boolean; missing: string[] }> => {
  const hasRoleIdentifiers = permissions.some((p) => p.startsWith("roles/"));

  if (saEmail || hasRoleIdentifiers) {
    let resolvedSaEmail = saEmail;
    if (saEmail === "discoveryengine-service-agent") {
      if (/^\d+$/.test(projectId)) {
        resolvedSaEmail = `service-${projectId}@gcp-sa-discoveryengine.iam.gserviceaccount.com`;
      } else {
        try {
          const proj = await gapiRequest<{ projectNumber?: string }>(
            `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}`,
            "GET",
            projectId,
          );
          if (proj?.projectNumber) {
            resolvedSaEmail = `service-${proj.projectNumber}@gcp-sa-discoveryengine.iam.gserviceaccount.com`;
          }
        } catch {
          // Fall back to matching any @gcp-sa-discoveryengine.iam.gserviceaccount.com binding below
        }
      }
    }

    try {
      const policy = await getProjectIamPolicy(projectId);
      const boundRoles = new Set<string>();
      for (const binding of policy.bindings || []) {
        const members = binding.members || [];
        const matchesPrincipal = resolvedSaEmail
          ? members.some((m) =>
              resolvedSaEmail === "discoveryengine-service-agent"
                ? m.endsWith("@gcp-sa-discoveryengine.iam.gserviceaccount.com")
                : m === `serviceAccount:${resolvedSaEmail}` || m === resolvedSaEmail,
            )
          : true;
        if (matchesPrincipal && binding.role) {
          boundRoles.add(binding.role);
        }
      }
      if (boundRoles.size > 0 || hasRoleIdentifiers) {
        if (
          !hasRoleIdentifiers &&
          boundRoles.size > 0 &&
          (saEmail === "discoveryengine-service-agent" ||
            resolvedSaEmail.endsWith("@gcp-sa-discoveryengine.iam.gserviceaccount.com"))
        ) {
          boundRoles.add("roles/discoveryengine.serviceAgent");
        }
        const missing = permissions.filter((req) => !roleGrantsRequirement(boundRoles, req));
        return { hasAll: missing.length === 0, missing };
      }
      // If boundRoles is empty for a Google-managed service agent (implicit grant not in top-level policy.bindings)
      // and raw permissions were requested, fall through to projects:testIamPermissions below.
    } catch (err) {
      if (hasRoleIdentifiers) {
        throw err;
      }
      // If caller cannot read project IAM policy and requested raw permissions, fall back to testIamPermissions
    }
  }

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
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
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
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
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

export const listWorkforcePools = async (
  projectId: string,
): Promise<WorkloadIdentityPool[]> => {
  const ancestry = await gapiRequest<{
    ancestor?: Array<{ resourceId?: { type?: string; id?: string } }>;
  }>(
    `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:getAncestry`,
    "POST",
    projectId,
    undefined,
    {},
  );
  const orgEntry = (ancestry.ancestor || []).find(
    (a) => a.resourceId?.type === "organization" && a.resourceId?.id,
  );
  const orgId = orgEntry?.resourceId?.id;
  if (!orgId) {
    return [];
  }

  let allPools: WorkloadIdentityPool[] = [];
  let pageToken = "";
  do {
    let url = `https://iam.googleapis.com/v1/locations/global/workforcePools?parent=organizations/${encodeURIComponent(orgId)}&pageSize=50`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
    const response = await gapiRequest<{
      workforcePools?: WorkloadIdentityPool[];
      nextPageToken?: string;
    }>(url, "GET", projectId);
    if (response.workforcePools) {
      allPools = allPools.concat(
        response.workforcePools.filter((p) => p.state !== "DELETED"),
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
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
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

export const updateCustomRole = async (
  projectId: string,
  roleId: string,
  roleData: {
    title: string;
    description: string;
    stage?: string;
    includedPermissions: string[];
    etag?: string;
  },
): Promise<CustomRole> => {
  const updateMask = "title,description,stage,includedPermissions";
  const url = `https://iam.googleapis.com/v1/projects/${projectId}/roles/${roleId}?updateMask=${updateMask}`;
  return gapiRequest<CustomRole>(url, "PATCH", projectId, undefined, {
    title: roleData.title,
    description: roleData.description,
    stage: roleData.stage || "GA",
    includedPermissions: roleData.includedPermissions,
    ...(roleData.etag ? { etag: roleData.etag } : {}),
  });
};

export const undeleteCustomRole = async (
  projectId: string,
  roleId: string,
): Promise<CustomRole> => {
  const url = `https://iam.googleapis.com/v1/projects/${projectId}/roles/${roleId}:undelete`;
  return gapiRequest<CustomRole>(url, "POST", projectId, undefined, {});
};

export const testProjectIamPermissions = async (
  projectId: string,
  permissions: string[],
): Promise<string[]> => {
  const response = await gapiRequest<{ permissions?: string[] }>(
    `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:testIamPermissions`,
    "POST",
    projectId,
    undefined,
    { permissions },
    undefined,
    true,
  );
  return response.permissions || [];
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
