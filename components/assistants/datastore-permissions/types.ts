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

import { AppEngine, Config } from '../../../types';
import { ResourceType } from '../SetDataStoreIamPolicyModal';

export interface IamBinding {
  role: string;
  members?: string[];
  condition?: {
    title?: string;
    description?: string;
    expression?: string;
  };
}

export interface IamPolicy {
  version?: number;
  etag?: string;
  bindings?: IamBinding[];
}

export interface ConnectedDataStorePermissionsProps {
  engine: AppEngine;
  config: Config;
  projectNumber: string;
}

export interface ConnectorEntity {
  id: string;
  name: string;
  displayName?: string;
  policy?: IamPolicy;
}

export interface ConnectorResource {
  id: string;
  name: string;
  displayName?: string;
  policy?: IamPolicy;
  entities: ConnectorEntity[];
  isAttached: boolean;
}

export interface LegacyDataStoreResource {
  id: string;
  name: string;
  displayName?: string;
  policy?: IamPolicy;
  isAttached: boolean;
}

export interface PrincipalAccess {
  member: string;
  hasProjectRole: boolean;
  hasEngineAccess: boolean;
  resourceAccess: Record<string, boolean>; // resourceId -> boolean
}

export interface UserAccessDetails {
  member: string;
  type: 'user' | 'group' | 'serviceAccount' | 'domain' | 'other';
  projectRoles: string[];
  broadRoles: string[];
  hasBroadRoles: boolean;
  hasCustomRole: boolean;
  hasEngineAccess: boolean;
  accessibleDataStoreCount: number;
  totalDataStoreCount: number;
  accessibleDataStores: string[];
}

export interface EditingResource {
  id: string;
  displayName: string;
  type: ResourceType;
  path: string;
  policy: IamPolicy | null;
}

export interface RevokeTarget {
  member: string;
  resourceType: ResourceType;
  resourceId: string;
  resourceDesc: string;
}

export interface IsolateTarget {
  members: string[];
  broadRoles: string[];
}

export interface ConnectorInconsistency {
  connectorId: string;
  connectorDisplayName: string;
  member: string;
  hasCollectionAccess: boolean;
  missingEntityIds: string[];
  grantedEntityIds: string[];
}

export interface EnvironmentReadinessState {
  isEvaluating: boolean;
  lastEvaluatedAt: string | null;
  /** Project-level CustomerProvidedConfig.resourceAccessControlConfig.dataStoreAccessControlEnabled */
  dataStoreAccessControlEnabled: boolean | null;
  projectConfigError: string | null;
  /** v1 IAM Meta API (:getIamPolicy) reachability */
  v1IamApiSupported: boolean | null;
  v1IamApiError: string | null;
  /** Custom role status */
  customRoleStatus: 'ready' | 'needs_upgrade' | 'deleted' | 'missing' | 'checking';
  customRoleIncludedPermissions: string[];
  customRoleMissingPermissions: string[];
  /** Admin operator permissions */
  adminPermissionsTested: boolean;
  grantedAdminPermissions: string[];
  missingAdminPermissions: string[];
}

export const AGENTSPACE_USER_ROLE = 'roles/discoveryengine.agentspaceUser';
export const CUSTOM_ROLE_ID = 'customRestrictedEndUser';

/**
 * Required permissions for the project-level customRestrictedEndUser role
 * per go/ge-end-user-ds-permission-control (updated Sep 18, 2026).
 */
export const REQUIRED_CUSTOM_ROLE_PERMISSIONS = [
  'discoveryengine.locations.buildAuthorizationUrl',
  'discoveryengine.devToolsConfigs.get',
];

/**
 * Permissions checked via projects.testIamPermissions to verify if the current
 * operator can configure project opt-in, custom roles, and resource IAM policies.
 */
export const REQUIRED_ADMIN_PERMISSIONS = [
  'discoveryengine.projects.get',
  'discoveryengine.projects.update',
  'resourcemanager.projects.getIamPolicy',
  'resourcemanager.projects.setIamPolicy',
  'iam.roles.get',
  'iam.roles.create',
  'iam.roles.update',
  'discoveryengine.engines.getIamPolicy',
  'discoveryengine.engines.setIamPolicy',
  'discoveryengine.dataStores.getIamPolicy',
  'discoveryengine.dataStores.setIamPolicy',
  'discoveryengine.collections.getIamPolicy',
  'discoveryengine.collections.setIamPolicy',
];

/**
 * Project-level roles that grant discoveryengine.dataStores.get or discoveryengine.collections.get
 * across the entire project and therefore bypass DataStore-level IAM restrictions.
 * Note: roles/discoveryengine.agentspaceRestrictedUser had dataStores.get and collections.get
 * added on Aug 20, 2026 (cl/967961387), so it only restricts at the App level, NOT DataStore level.
 */
export const BROAD_PROJECT_ROLES = [
  'roles/viewer',
  'roles/editor',
  'roles/owner',
  'roles/discoveryengine.admin',
  'roles/discoveryengine.agentspaceAdmin',
  'roles/discoveryengine.editor',
  'roles/discoveryengine.user',
  'roles/discoveryengine.agentspaceUser',
  'roles/discoveryengine.agentspaceRestrictedUser',
  'roles/discoveryengine.viewer',
  'roles/discoveryengine.agentspaceViewer',
];
