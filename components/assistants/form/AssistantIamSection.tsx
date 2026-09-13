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

export interface AssistantIamSectionProps {
  isLoadingIam: boolean;
  iamError: string | null;
  iamPolicy: any;
  memberType: string;
  setMemberType: (type: string) => void;
  newMember: string;
  setNewMember: (member: string) => void;
  handleAddIamMember: () => Promise<void>;
  handleRemoveIamMember: (member: string) => void;
}

export const AssistantIamSection: React.FC<AssistantIamSectionProps> = ({
  isLoadingIam,
  iamError,
  iamPolicy,
  memberType,
  setMemberType,
  newMember,
  setNewMember,
  handleAddIamMember,
  handleRemoveIamMember,
}) => {
  return (
    <div className="space-y-3 p-4 bg-gray-900/30 rounded-md">
      <div className="bg-amber-900/30 border border-amber-800 rounded-md p-3 mb-3 text-xs text-amber-200 flex gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div>
          <strong>Precedence Warning:</strong> Project-level IAM permissions take precedence over app-level policies. If a user is granted a role (like <code>roles/discoveryengine.user</code>) at the project level, they can access all apps in that project, regardless of any app-level permissions. To restrict a user to specific apps, ensure they do not have broad Discovery Engine roles at the project level. Use this panel to grant app-specific access once project-level access is removed.
        </div>
      </div>
      <div className="bg-blue-900/30 border border-blue-800 rounded-md p-3 mb-3 text-xs text-blue-200 flex gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <strong>Mandatory User Access:</strong> To ensure these users can use connectors, agents, and notebooks, they are also automatically granted the mandatory <code>roles/discoveryengine.agentspaceRestrictedUser</code> role at the project level upon addition.
        </div>
      </div>

      {isLoadingIam ? (
        <div className="flex justify-center py-4">
          <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        </div>
      ) : iamError ? (
        <p className="text-xs text-red-400">{iamError}</p>
      ) : (
        <div className="space-y-2">
          {iamPolicy?.bindings?.find((b: any) => b.role === 'roles/discoveryengine.user')?.members?.length > 0 ? (
            iamPolicy.bindings.find((b: any) => b.role === 'roles/discoveryengine.user').members.map((member: string) => (
              <div key={member} className="flex justify-between items-center bg-gray-700/50 p-2 rounded-md">
                <span className="text-xs text-gray-300 font-mono">{member.replace('user:', '').replace('group:', '')}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveIamMember(member)}
                  className="text-xs text-red-400 hover:text-red-300"
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
              value={memberType}
              onChange={(e) => setMemberType(e.target.value)}
              className="bg-gray-700 border-gray-600 rounded-md shadow-sm text-xs text-white"
            >
              <option value="user:">Standard User (user:)</option>
              <option value="group:">Standard Group (group:)</option>
              <option value="serviceAccount:">Service Account (serviceAccount:)</option>
              <option value="principal://">WiF Principal (principal://)</option>
              <option value="principalSet://">WiF Group (principalSet://)</option>
            </select>

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
            <p className="font-semibold text-gray-300">Supported Formats:</p>
            <p><span className="text-blue-400">Standard User</span>: <code>user:email@example.com</code></p>
            <p><span className="text-blue-400">Standard Group</span>: <code>group:email@example.com</code></p>
            <p><span className="text-purple-400">IAM Service Account</span>: <code>serviceAccount:email@example.com</code></p>
            <p><span className="text-purple-400">WiF Principal</span>: <code>principal://iam.googleapis.com/locations/global/workforcePools/&lt;pool-id&gt;/subject/&lt;subject-id&gt;</code></p>
            <p><span className="text-purple-400">WiF Group</span>: <code>principalSet://iam.googleapis.com/locations/global/workforcePools/&lt;pool-id&gt;/group/&lt;group-id&gt;</code></p>
          </div>
        </div>
      )}
    </div>
  );
};
