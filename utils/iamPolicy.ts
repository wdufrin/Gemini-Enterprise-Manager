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

import { CustomRole, IamBinding, IamPolicy } from '../types';
import { toErrorMessage } from './errors';

export const CUSTOM_RESTRICTED_END_USER_ROLE_ID = 'customRestrictedEndUser';
export const CUSTOM_RESTRICTED_ADMIN_ROLE_ID = 'customRestrictedAdmin';

/**
 * Minimum core permissions documented in Google Cloud's GA guide
 * (`Configure granular access controls for apps and data stores`) for `customRestrictedEndUser`.
 */
export const CUSTOM_RESTRICTED_END_USER_CORE_PERMISSIONS = [
  'discoveryengine.devToolsConfigs.get',
  'discoveryengine.locations.buildAuthorizationUrl',
] as const;

/**
 * Full GA-supported location-level end-user permissions for `customRestrictedEndUser`.
 * Includes OAuth connector user authorization, available action discovery, agent cards,
 * consent, and feedback permissions while strictly excluding `collections.get` and `dataStores.get`
 * so DataStore & DataConnector IAM isolation is preserved.
 */
export const CUSTOM_RESTRICTED_END_USER_PERMISSIONS = [
  'discoveryengine.authorizations.storeUserAuthorization',
  'discoveryengine.dataConnectors.queryAvailableActions',
  'discoveryengine.devToolsConfigs.get',
  'discoveryengine.locations.buildAuthorizationUrl',
  'discoveryengine.locations.fetchAgentCards',
  'discoveryengine.userEvents.create',
  'discoveryengine.users.get',
  'discoveryengine.users.update',
] as const;

/**
 * GA-documented project-level permissions for `customRestrictedAdmin` enabling delegated
 * administrators and viewers (`agentspaceAdmin` / `agentspaceViewer`) to load Cloud Console
 * listing pages without exposing unauthorized app or data store contents.
 */
export const CUSTOM_RESTRICTED_ADMIN_PERMISSIONS = [
  'discoveryengine.aclConfigs.get',
  'discoveryengine.collections.list',
  'discoveryengine.dataStores.list',
  'discoveryengine.devToolsConfigs.get',
  'discoveryengine.engines.list',
  'discoveryengine.licenseConfigs.list',
  'discoveryengine.locations.buildAuthorizationUrl',
  'discoveryengine.locations.getConnectorSource',
  'discoveryengine.locations.listConnectorSources',
  'discoveryengine.projects.get',
  'discoveryengine.userStores.listUserLicenses',
  'resourcemanager.projects.get',
] as const;

/**
 * Permissions that MUST NEVER be granted in a project-level custom role when
 * `dataStoreAccessControlEnabled = true`, because Discovery Engine filters DataStores and
 * DataConnectors using `discoveryengine.dataStores.get` and `discoveryengine.collections.get`
 * and checks connector-scoped `dataConnectors.*` execution permissions downward from the project.
 */
export const FORBIDDEN_DATASTORE_BYPASS_PERMISSIONS = [
  'discoveryengine.collections.get',
  'discoveryengine.dataStores.get',
  'discoveryengine.dataConnectors.acquireAccessToken',
  'discoveryengine.dataConnectors.acquireAndStoreRefreshToken',
  'discoveryengine.dataConnectors.buildActionInvocation',
  'discoveryengine.dataConnectors.checkRefreshToken',
  'discoveryengine.dataConnectors.executeAction',
] as const;

export type RestrictedRolePersona = 'endUser' | 'admin';

export const buildCustomRestrictedRoleName = (
  projectId: string,
  persona: RestrictedRolePersona = 'endUser',
): string => {
  const roleId =
    persona === 'admin'
      ? CUSTOM_RESTRICTED_ADMIN_ROLE_ID
      : CUSTOM_RESTRICTED_END_USER_ROLE_ID;
  return `projects/${projectId}/roles/${roleId}`;
};

/**
 * Extracts `dataStoreAccessControlEnabled` from a Discovery Engine `Project` resource payload
 * (`customerProvidedConfig.resourceAccessControlConfig.dataStoreAccessControlEnabled` or snake_case),
 * with fallback to a top-level boolean if present.
 */
export const extractDataStoreAccessControlEnabled = (
  projConfig: unknown,
): boolean => {
  if (!projConfig || typeof projConfig !== 'object') return false;
  const rec = projConfig as Record<string, unknown>;
  const custCfg = (rec.customerProvidedConfig ?? rec.customer_provided_config) as
    | Record<string, unknown>
    | undefined;
  const racCfg = (custCfg?.resourceAccessControlConfig ??
    custCfg?.resource_access_control_config) as Record<string, unknown> | undefined;
  const nestedVal =
    racCfg?.dataStoreAccessControlEnabled ?? racCfg?.data_store_access_control_enabled;
  if (typeof nestedVal === 'boolean') {
    return nestedVal;
  }
  return rec.dataStoreAccessControlEnabled === true;
};

export interface CustomRestrictedRoleInspection {
  valid: boolean;
  reason?: 'MISSING' | 'DELETED' | 'HAS_BYPASS_PERMISSIONS' | 'MISSING_REQUIRED_PERMISSIONS';
  missingRequiredPermissions: string[];
  missingRecommendedPermissions: string[];
  forbiddenPermissions: string[];
}

/**
 * Validates whether an existing GCP project `CustomRole` is safe and sufficient for
 * Gemini Enterprise DataStore Access Control (`endUser` or `admin` persona).
 */
export const inspectCustomRestrictedRole = (
  role: CustomRole | null | undefined,
  persona: RestrictedRolePersona,
): CustomRestrictedRoleInspection => {
  const requiredPerms: readonly string[] =
    persona === 'admin'
      ? CUSTOM_RESTRICTED_ADMIN_PERMISSIONS
      : CUSTOM_RESTRICTED_END_USER_CORE_PERMISSIONS;
  const recommendedPerms: readonly string[] =
    persona === 'admin'
      ? CUSTOM_RESTRICTED_ADMIN_PERMISSIONS
      : CUSTOM_RESTRICTED_END_USER_PERMISSIONS;

  if (!role || typeof role !== 'object') {
    return {
      valid: false,
      reason: 'MISSING',
      missingRequiredPermissions: [...requiredPerms],
      missingRecommendedPermissions: [...recommendedPerms],
      forbiddenPermissions: [],
    };
  }

  const included = new Set(role.includedPermissions || []);
  const forbiddenPermissions = FORBIDDEN_DATASTORE_BYPASS_PERMISSIONS.filter((p) =>
    included.has(p),
  );
  const missingRequiredPermissions = requiredPerms.filter((p) => !included.has(p));
  const missingRecommendedPermissions = recommendedPerms.filter((p) => !included.has(p));

  if (role.deleted) {
    return {
      valid: false,
      reason: 'DELETED',
      missingRequiredPermissions,
      missingRecommendedPermissions,
      forbiddenPermissions,
    };
  }

  if (forbiddenPermissions.length > 0) {
    return {
      valid: false,
      reason: 'HAS_BYPASS_PERMISSIONS',
      missingRequiredPermissions,
      missingRecommendedPermissions,
      forbiddenPermissions,
    };
  }

  if (missingRequiredPermissions.length > 0) {
    return {
      valid: false,
      reason: 'MISSING_REQUIRED_PERMISSIONS',
      missingRequiredPermissions,
      missingRecommendedPermissions,
      forbiddenPermissions,
    };
  }

  return {
    valid: true,
    missingRequiredPermissions: [],
    missingRecommendedPermissions,
    forbiddenPermissions: [],
  };
};

export interface EnsureCustomRestrictedRoleParams {
  projectId: string;
  persona: RestrictedRolePersona;
  getCustomRole: (projectId: string, roleId: string) => Promise<CustomRole>;
  createCustomRole: (
    projectId: string,
    roleId: string,
    roleData: {
      title: string;
      description: string;
      stage?: string;
      includedPermissions: string[];
    },
  ) => Promise<CustomRole>;
  updateCustomRole?: (
    projectId: string,
    roleId: string,
    roleData: {
      title: string;
      description: string;
      stage?: string;
      includedPermissions: string[];
      etag?: string;
    },
  ) => Promise<CustomRole>;
  undeleteCustomRole?: (projectId: string, roleId: string) => Promise<CustomRole>;
  onLog?: (msg: string) => void;
}

export interface EnsureCustomRestrictedRoleResult {
  roleName: string;
  roleId: string;
  action: 'verified' | 'created' | 'updated' | 'undeleted';
  role: CustomRole;
}

const isNotFoundError = (err: unknown): boolean => {
  if (!err) return false;
  if (typeof err === 'object') {
    const rec = err as { status?: unknown; code?: unknown };
    if (rec.status === 404 || rec.code === 404 || rec.code === 'NOT_FOUND') {
      return true;
    }
  }
  const msg = toErrorMessage(err, '');
  return /\b(404|NOT_FOUND|does not exist|was not found)\b/i.test(msg);
};

const isUnsupportedCustomPermissionError = (err: unknown): boolean => {
  if (!err) return false;
  if (typeof err === 'object') {
    const rec = err as { status?: unknown };
    if (rec.status !== undefined && rec.status !== 400) {
      return false;
    }
  }
  const msg = toErrorMessage(err, '');
  return /permission.*not.*(valid|supported)|invalid_argument|custom role/i.test(msg);
};

/**
 * Ensures the GA custom project-level role (`customRestrictedEndUser` or `customRestrictedAdmin`)
 * exists on `projectId`, is undeleted, includes required baseline permissions, and strips any
 * forbidden DataStore-bypass permissions (`collections.get`, `dataStores.get`, etc.).
 */
export const ensureCustomRestrictedProjectRole = async ({
  projectId,
  persona,
  getCustomRole,
  createCustomRole,
  updateCustomRole,
  undeleteCustomRole,
  onLog,
}: EnsureCustomRestrictedRoleParams): Promise<EnsureCustomRestrictedRoleResult> => {
  const roleId =
    persona === 'admin'
      ? CUSTOM_RESTRICTED_ADMIN_ROLE_ID
      : CUSTOM_RESTRICTED_END_USER_ROLE_ID;
  const roleName = buildCustomRestrictedRoleName(projectId, persona);
  const title =
    persona === 'admin'
      ? 'Custom Gemini Enterprise Restricted Admin'
      : 'Custom Gemini Enterprise Restricted End User';
  const description =
    persona === 'admin'
      ? 'Base project-level permissions to list and view Gemini Enterprise configuration pages.'
      : 'Base project-level permissions to access Gemini Enterprise apps without exposing unauthorized data stores.';
  const targetPermissions: string[] =
    persona === 'admin'
      ? [...CUSTOM_RESTRICTED_ADMIN_PERMISSIONS]
      : [...CUSTOM_RESTRICTED_END_USER_PERMISSIONS];

  let existing: CustomRole | null = null;
  try {
    existing = await getCustomRole(projectId, roleId);
  } catch (err: unknown) {
    if (!isNotFoundError(err)) {
      throw err;
    }
  }

  if (!existing) {
    onLog?.(`Creating custom project role '${roleName}' (${targetPermissions.length} permissions)...`);
    try {
      const created = await createCustomRole(projectId, roleId, {
        title,
        description,
        stage: 'GA',
        includedPermissions: targetPermissions,
      });
      return { roleName, roleId, action: 'created', role: created };
    } catch (createErr: unknown) {
      if (persona === 'endUser' && isUnsupportedCustomPermissionError(createErr)) {
        onLog?.(
          `Retrying '${roleName}' creation with minimal core GA permissions (${CUSTOM_RESTRICTED_END_USER_CORE_PERMISSIONS.join(', ')})...`,
        );
        const createdCore = await createCustomRole(projectId, roleId, {
          title,
          description,
          stage: 'GA',
          includedPermissions: [...CUSTOM_RESTRICTED_END_USER_CORE_PERMISSIONS],
        });
        return { roleName, roleId, action: 'created', role: createdCore };
      }
      throw createErr;
    }
  }

  let wasUndeleted = false;
  if (existing.deleted) {
    if (typeof undeleteCustomRole !== 'function') {
      throw new Error(
        `Custom role '${roleName}' is in DELETED state and undeleteCustomRole is unavailable.`,
      );
    }
    onLog?.(`Undeleting previously deleted custom role '${roleName}'...`);
    existing = await undeleteCustomRole(projectId, roleId);
    wasUndeleted = true;
  }

  const inspection = inspectCustomRestrictedRole(existing, persona);
  if (inspection.valid) {
    return {
      roleName,
      roleId,
      action: wasUndeleted ? 'undeleted' : 'verified',
      role: existing,
    };
  }

  if (typeof updateCustomRole !== 'function') {
    throw new Error(
      `Custom role '${roleName}' requires permission updates (${inspection.reason}), but updateCustomRole is unavailable.`,
    );
  }

  const forbiddenSet = new Set<string>(FORBIDDEN_DATASTORE_BYPASS_PERMISSIONS);
  const sanitizedExisting = (existing.includedPermissions || []).filter(
    (p) => !forbiddenSet.has(p),
  );
  const mergedPermissions = Array.from(new Set([...sanitizedExisting, ...targetPermissions]));

  onLog?.(
    `Updating custom role '${roleName}' (reason: ${inspection.reason}) to enforce GA DataStore isolation...`,
  );
  try {
    const updated = await updateCustomRole(projectId, roleId, {
      title: existing.title || title,
      description: existing.description || description,
      stage: existing.stage || 'GA',
      includedPermissions: mergedPermissions,
      etag: existing.etag,
    });
    return {
      roleName,
      roleId,
      action: wasUndeleted ? 'undeleted' : 'updated',
      role: updated,
    };
  } catch (updateErr: unknown) {
    if (persona === 'endUser' && isUnsupportedCustomPermissionError(updateErr)) {
      const mergedCore = Array.from(
        new Set([...sanitizedExisting, ...CUSTOM_RESTRICTED_END_USER_CORE_PERMISSIONS]),
      );
      const updatedCore = await updateCustomRole(projectId, roleId, {
        title: existing.title || title,
        description: existing.description || description,
        stage: existing.stage || 'GA',
        includedPermissions: mergedCore,
        etag: existing.etag,
      });
      return {
        roleName,
        roleId,
        action: wasUndeleted ? 'undeleted' : 'updated',
        role: updatedCore,
      };
    }
    throw updateErr;
  }
};

/**
 * Uses Regex Pattern Matching on single-line or multi-line English Google Cloud IAM
 * error messages indicating an optimistic-concurrency ETag conflict during `setIamPolicy`.
 *
 * Known limits: Matches standard English Cloud Resource Manager / Discovery Engine / Cloud IAM
 * conflict strings (e.g., "There were concurrent policy changes", "retry the whole read-modify-write",
 * "ETag ... did not match", "etag mismatch", "policy was modified concurrently"). Localized
 * non-English messages without structured HTTP 409 / gRPC `ABORTED` codes will not match this fallback.
 */
const CONCURRENT_IAM_POLICY_MESSAGE_REGEX =
  /concurrent policy changes|retry the whole read-modify-write|etag[\s\S]*did not match|did not match[\s\S]*etag|etag mismatch|policy was modified concurrently/i;

/**
 * Non-retryable HTTP client/auth error codes that must never be treated as optimistic-concurrency conflicts.
 */
const NON_CONCURRENCY_HTTP_STATUSES = new Set([400, 401, 403, 404]);

/**
 * Determines whether an unknown thrown error represents an IAM optimistic-concurrency
 * Read-Modify-Write conflict (HTTP 409 / gRPC `ABORTED` / stale `etag`).
 */
export const isIamConcurrentModificationError = (err: unknown): boolean => {
  if (!err) return false;

  if (typeof err === 'object') {
    const record = err as { status?: unknown; code?: unknown };
    const status = typeof record.status === 'number' ? record.status : undefined;
    const code = record.code;

    if (status !== undefined && NON_CONCURRENCY_HTTP_STATUSES.has(status)) {
      return false;
    }

    if (status === 409) {
      return true;
    }

    if (
      typeof code === 'string' &&
      code.toUpperCase() === 'ABORTED'
    ) {
      return true;
    }

    // gRPC canonical status code 10 = ABORTED
    if (code === 10) {
      return true;
    }

    if (status === 412 && CONCURRENT_IAM_POLICY_MESSAGE_REGEX.test(toErrorMessage(err, ''))) {
      return true;
    }
  }

  const msg = toErrorMessage(err, '');
  if (!msg) return false;

  // Reject explicit permission/auth failures in stringified errors without structured status
  if (/\b(401|403|PERMISSION_DENIED|UNAUTHENTICATED)\b/.test(msg)) {
    return false;
  }

  return CONCURRENT_IAM_POLICY_MESSAGE_REGEX.test(msg);
};

/**
 * Deep-clones an `IamPolicy` while preserving `version`, `etag`, `auditConfigs`,
 * and conditional bindings so mutations on one attempt never leak into retries.
 */
export const cloneIamPolicy = (policy: IamPolicy | null | undefined): IamPolicy => {
  if (!policy || typeof policy !== 'object') {
    return { bindings: [] };
  }

  const clonedBindings: IamBinding[] = Array.isArray(policy.bindings)
    ? policy.bindings.map((b) => ({
        role: b.role,
        members: Array.isArray(b.members) ? [...b.members] : [],
        ...(b.condition ? { condition: { ...b.condition } } : {}),
      }))
    : [];

  const clonedAuditConfigs =
    policy.auditConfigs !== undefined
      ? JSON.parse(JSON.stringify(policy.auditConfigs))
      : undefined;

  return {
    ...(policy.version !== undefined ? { version: policy.version } : {}),
    ...(policy.etag !== undefined ? { etag: policy.etag } : {}),
    ...(clonedAuditConfigs !== undefined ? { auditConfigs: clonedAuditConfigs } : {}),
    bindings: clonedBindings,
  };
};

/**
 * Adds `member` to each unconditional binding (`!b.condition`) for `roles` in `policy`.
 * Preserves existing conditional bindings untouched and returns `changed: false` when
 * `member` is already present in all target roles.
 */
export const addMemberToRoles = (
  policy: IamPolicy,
  roles: readonly string[],
  member: string,
  options?: { caseInsensitive?: boolean },
): { policy: IamPolicy; changed: boolean } => {
  const next = cloneIamPolicy(policy);
  const bindings = next.bindings || [];
  next.bindings = bindings;

  let changed = false;
  const caseInsensitive = Boolean(options?.caseInsensitive);
  const normalizedTarget = caseInsensitive ? member.toLowerCase() : member;

  for (const role of roles) {
    let binding = bindings.find((b) => b.role === role && !b.condition);
    if (!binding) {
      binding = { role, members: [member] };
      bindings.push(binding);
      changed = true;
      continue;
    }

    if (!Array.isArray(binding.members)) {
      binding.members = [];
    }

    const alreadyPresent = binding.members.some((m) =>
      caseInsensitive ? m.toLowerCase() === normalizedTarget : m === member,
    );
    if (!alreadyPresent) {
      binding.members.push(member);
      changed = true;
    }
  }

  return { policy: next, changed };
};

/**
 * Removes `member` from bindings matching `rolePredicate` (unconditional bindings by default,
 * or all matching bindings when `includeConditional` is true) and prunes empty bindings.
 */
export const removeMemberFromRoles = (
  policy: IamPolicy,
  rolePredicate: (role: string) => boolean,
  member: string,
  options?: { includeConditional?: boolean },
): { policy: IamPolicy; changed: boolean } => {
  const next = cloneIamPolicy(policy);
  const includeConditional = Boolean(options?.includeConditional);
  let changed = false;

  next.bindings = (next.bindings || [])
    .map((b) => {
      if (!rolePredicate(b.role)) return b;
      if (!includeConditional && b.condition) return b;
      const prevMembers = b.members || [];
      const filtered = prevMembers.filter((m) => m !== member);
      if (filtered.length !== prevMembers.length) {
        changed = true;
      }
      return { ...b, members: filtered };
    })
    .filter((b) => Array.isArray(b.members) && b.members.length > 0);

  return { policy: next, changed };
};

export interface IamRetryContext {
  attempt: number;
  maxRetries: number;
  delayMs: number;
  error: unknown;
}

export interface IamReadModifyWriteOptions {
  getPolicy: () => Promise<IamPolicy>;
  setPolicy: (policy: IamPolicy) => Promise<IamPolicy | void>;
  /**
   * Pure transformation applied to a fresh clone of the newly fetched `IamPolicy`
   * on every attempt. When `changed` is `false`, `setPolicy` is skipped.
   */
  modify: (currentPolicy: IamPolicy) => { policy: IamPolicy; changed: boolean };
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  sleepFn?: (ms: number) => Promise<void>;
  randomFn?: () => number;
  onRetry?: (ctx: IamRetryContext) => void;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Executes a full Google Cloud IAM Read-Modify-Write cycle (`getIamPolicy` -> `modify` -> `setIamPolicy`)
 * and retries the *entire* cycle with exponential backoff + jitter whenever a concurrent policy
 * modification (HTTP 409 `ABORTED` / stale `etag`) occurs.
 */
export const retryIamReadModifyWrite = async ({
  getPolicy,
  setPolicy,
  modify,
  maxRetries = 4,
  baseDelayMs = 250,
  maxDelayMs = 4000,
  jitterRatio = 0.25,
  sleepFn = defaultSleep,
  randomFn = Math.random,
  onRetry,
}: IamReadModifyWriteOptions): Promise<IamPolicy> => {
  if (!Number.isInteger(maxRetries) || maxRetries < 0) {
    throw new Error(`Invalid maxRetries: ${maxRetries}. Must be a non-negative integer.`);
  }
  if (baseDelayMs < 0 || maxDelayMs < 0) {
    throw new Error('Backoff delays must be non-negative.');
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const fetched = await getPolicy();
    const workingCopy = cloneIamPolicy(fetched);
    const { policy: modifiedPolicy, changed } = modify(workingCopy);

    if (!changed) {
      return workingCopy;
    }

    // Preserve IAM Policy v3 whenever any binding contains a CEL condition
    if (
      modifiedPolicy.bindings?.some((b) => Boolean(b.condition)) &&
      (!modifiedPolicy.version || modifiedPolicy.version < 3)
    ) {
      modifiedPolicy.version = 3;
    }

    try {
      const saved = await setPolicy(modifiedPolicy);
      return saved && typeof saved === 'object' ? saved : modifiedPolicy;
    } catch (err: unknown) {
      if (attempt < maxRetries && isIamConcurrentModificationError(err)) {
        const expDelay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
        const clampedRandom = Math.max(0, Math.min(1, randomFn()));
        const jitter = expDelay * Math.max(0, jitterRatio) * clampedRandom;
        const delayMs = Math.round(expDelay + jitter);
        onRetry?.({
          attempt: attempt + 1,
          maxRetries,
          delayMs,
          error: err,
        });
        await sleepFn(delayMs);
        continue;
      }
      throw err;
    }
  }

  throw new Error('IAM Read-Modify-Write unexpectedly exited retry loop.');
};
