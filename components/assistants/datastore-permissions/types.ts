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

export const AGENTSPACE_USER_ROLE = 'roles/discoveryengine.agentspaceUser';
export const CUSTOM_ROLE_ID = 'customRestrictedEndUser';
export const BROAD_PROJECT_ROLES = [
  'roles/viewer',
  'roles/editor',
  'roles/owner',
  'roles/discoveryengine.admin',
  'roles/discoveryengine.editor',
  'roles/discoveryengine.user',
  'roles/discoveryengine.agentspaceUser',
  'roles/discoveryengine.viewer',
];
