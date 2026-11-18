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

import React from 'react';
import { IamPolicy } from '../../../types';

export interface AssistantIamSectionProps {
  isLoadingIam: boolean;
  iamError: string | null;
  iamPolicy: IamPolicy | null;
  memberType: string;
  setMemberType: (type: string) => void;
  appRole?: string;
  setAppRole?: (role: string) => void;
  projectId?: string;
  newMember: string;
  setNewMember: (member: string) => void;
  handleAddIamMember: () => Promise<void>;
  handleRemoveIamMember: (member: string) => void;
  dataStoreAccessControlEnabled?: boolean;
}

const APP_IAM_ROLES = [
  'roles/discoveryengine.agentspaceUser',
  'roles/discoveryengine.agentspaceAdmin',
  'roles/discoveryengine.agentspaceViewer',
  'roles/discoveryengine.user',
] as const;

const formatAppRoleBadge = (role: string): string => {
  switch (role) {
    case 'roles/discoveryengine.agentspaceAdmin':
      return 'Admin';
    case 'roles/discoveryengine.agentspaceViewer':
      return 'Viewer';
    case 'roles/discoveryengine.user':
      return 'User (Legacy)';
    case 'roles/discoveryengine.agentspaceUser':
    default:
      return 'User';
  }
};

export const AssistantIamSection: React.FC<AssistantIamSectionProps> = ({
  isLoadingIam,
  iamError,
  iamPolicy,
  memberType,
  setMemberType,
  appRole = 'roles/discoveryengine.agentspaceUser',
  setAppRole,
  projectId = 'PROJECT_ID',
  newMember,
  setNewMember,
  handleAddIamMember,
  handleRemoveIamMember,
  dataStoreAccessControlEnabled = false,
}) => {
  const memberRolesMap = new Map<string, string[]>();
  for (const b of iamPolicy?.bindings || []) {
    if ((APP_IAM_ROLES as readonly string[]).includes(b.role)) {
      for (const m of b.members || []) {
        const existing = memberRolesMap.get(m) || [];
        if (!existing.includes(b.role)) {
          existing.push(b.role);
        }
        memberRolesMap.set(m, existing);
      }
    }
  }
  const appLevelMembers = Array.from(memberRolesMap.entries());

  return (
    <div className="space-y-3 p-4 bg-gray-900/30 rounded-md">
      <div className="bg-amber-900/30 border border-amber-800 rounded-md p-3 mb-3 text-xs text-amber-200 flex gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div>
          <strong>Precedence Warning:</strong> Project-level IAM permissions take precedence over app-level policies. If a user holds a broad Discovery Engine role (such as <code>roles/discoveryengine.agentspaceUser</code>, <code>roles/discoveryengine.user</code>, or <code>roles/discoveryengine.agentspaceAdmin</code>) at the project level, they can access all apps in the project regardless of app-level bindings.
          {dataStoreAccessControlEnabled && (
            <>
              {' '}Additionally, when <strong>Resource Access Control</strong> is enabled, avoid granting <code>roles/discoveryengine.agentspaceRestrictedUser</code> at the project level because its <code>collections.get</code> and <code>dataStores.get</code> permissions bypass DataStore isolation.
            </>
          )}
        </div>
      </div>

      <div className="bg-blue-900/30 border border-blue-800 rounded-md p-3 mb-3 text-xs text-blue-200 flex gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <strong>GA Access Control Model:</strong>{' '}
          {dataStoreAccessControlEnabled ? (
            <>
              <strong>Granular App &amp; DataStore Access Control</strong> is active on this project. Adding an end user grants <code>roles/discoveryengine.agentspaceUser</code> on this App plus custom project role <code>projects/{projectId}/roles/customRestrictedEndUser</code> and <code>roles/discoveryengine.notebookLmUser</code> (or <code>customRestrictedAdmin</code> when delegating Admin/Viewer) so DataStore isolation is preserved. Remember to grant DataStore/Connector access in the <strong>DataStore Permissions</strong> tab.
            </>
          ) : (
            <>
              <strong>App-Only Access Control</strong> is active on this project. Adding an end user grants <code>roles/discoveryengine.agentspaceUser</code> on this App and predefined <code>roles/discoveryengine.agentspaceRestrictedUser</code> at the project level, restricting them to this App while allowing access to all DataStores linked to it (including NotebookLM &amp; OAuth connectors).
            </>
          )}
        </div>
      </div>

      {isLoadingIam ? (
        <div className="flex justify-center py-4">
          <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        </div>
      ) : iamError && !iamPolicy ? (
        <p role="alert" className="text-xs text-red-400">{iamError}</p>
      ) : (
        <div className="space-y-2">
          {iamError && (
            <p
              role="alert"
              className="text-xs text-red-300 bg-red-900/30 border border-red-800 rounded-md p-2.5"
            >
              {iamError}
            </p>
          )}
          {appLevelMembers.length > 0 ? (
            appLevelMembers.map(([member, roles]) => (
              <div key={member} className="flex justify-between items-center bg-gray-700/50 p-2 rounded-md gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span className="text-xs text-gray-300 font-mono truncate">
                    {member.replace('user:', '').replace('group:', '')}
                  </span>
                  {roles.map((r) => (
                    <span
                      key={r}
                      title={r}
                      className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-950/70 text-blue-300 border border-blue-800/80"
                    >
                      {formatAppRoleBadge(r)}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveIamMember(member)}
                  className="text-xs text-red-400 hover:text-red-300 shrink-0"
                >
                  Remove
                </button>
              </div>
            ))
          ) : (
            <p className="text-xs text-gray-500">No explicit app-level users found.</p>
          )}

          <div className="flex flex-col sm:flex-row gap-2 mt-3">
            <select
              aria-label="Principal Type"
              value={memberType}
              onChange={(e) => setMemberType(e.target.value)}
              className="bg-gray-700 border-gray-600 rounded-md shadow-sm text-xs text-white"
            >
              <option value="user:">Standard User (user:)</option>
              <option value="group:">Standard Group (group:)</option>
              <option value="domain:">Workspace Domain (domain:)</option>
              <option value="serviceAccount:">Service Account (serviceAccount:)</option>
              <option value="principal://">WiF Principal (principal://)</option>
              <option value="principalSet://">WiF Group / Pool (principalSet://)</option>
            </select>

            {setAppRole && (
              <select
                aria-label="App Role"
                value={appRole}
                onChange={(e) => setAppRole(e.target.value)}
                className="bg-gray-700 border-gray-600 rounded-md shadow-sm text-xs text-white font-mono"
              >
                <option value="roles/discoveryengine.agentspaceUser">User (agentspaceUser)</option>
                <option value="roles/discoveryengine.agentspaceAdmin">Admin (agentspaceAdmin)</option>
                <option value="roles/discoveryengine.agentspaceViewer">Viewer (agentspaceViewer)</option>
              </select>
            )}

            <input
              type="text"
              value={newMember}
              onChange={(e) => setNewMember(e.target.value)}
              placeholder="email or ID"
              className="block flex-1 bg-gray-700 border-gray-600 rounded-md shadow-sm text-xs placeholder-gray-500 text-white px-2 py-1"
            />
            <button
              type="button"
              onClick={handleAddIamMember}
              className="px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-md hover:bg-blue-700 flex-shrink-0"
            >
              Add
            </button>
          </div>

          <div className="text-xs text-gray-400 mt-2 space-y-1 bg-gray-900/50 p-3 rounded-md border border-gray-800">
            <p className="font-semibold text-gray-300">Supported Principal Formats (GA):</p>
            <p><span className="text-blue-400">Standard User</span>: <code>user:email@example.com</code></p>
            <p><span className="text-blue-400">Standard Group / Domain</span>: <code>group:team@example.com</code> or <code>domain:example.com</code></p>
            <p><span className="text-purple-400">IAM Service Account</span>: <code>serviceAccount:sa@project.iam.gserviceaccount.com</code></p>
            <p><span className="text-purple-400">Workforce Pool User</span>: <code>principal://iam.googleapis.com/locations/global/workforcePools/&lt;pool-id&gt;/subject/&lt;subject-id&gt;</code></p>
            <p><span className="text-purple-400">Workforce Pool Group / All</span>: <code>principalSet://iam.googleapis.com/locations/global/workforcePools/&lt;pool-id&gt;/group/&lt;group-id&gt;</code> or <code>.../*</code></p>
          </div>
        </div>
      )}
    </div>
  );
};
