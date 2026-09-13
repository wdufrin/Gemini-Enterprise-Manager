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

import React, { useState, useMemo } from 'react';
import { UserAccessDetails, IsolateTarget } from './types';

interface UserAccessInspectorProps {
  allUsersList: UserAccessDetails[];
  appId: string;
  selectedUsersForIsolation: Set<string>;
  onToggleSelectUser: (member: string) => void;
  onSetSelectedUsers: (newSet: Set<string>) => void;
  onIsolateTarget: (target: IsolateTarget) => void;
  onConfigureDataStores: (member: string, hasCustomRole: boolean) => void;
}

export const UserAccessInspector: React.FC<UserAccessInspectorProps> = ({
  allUsersList,
  appId,
  selectedUsersForIsolation,
  onToggleSelectUser,
  onSetSelectedUsers,
  onIsolateTarget,
  onConfigureDataStores,
}) => {
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userFilterType, setUserFilterType] = useState<
    'all' | 'needs_isolation' | 'isolated' | 'engine_access'
  >('all');

  const filteredUsersList = useMemo(() => {
    return allUsersList.filter(u => {
      if (userFilterType === 'needs_isolation' && !u.hasBroadRoles) return false;
      if (userFilterType === 'isolated' && (!u.hasCustomRole || u.hasBroadRoles)) return false;
      if (userFilterType === 'engine_access' && !u.hasEngineAccess) return false;

      if (userSearchQuery.trim()) {
        const q = userSearchQuery.toLowerCase();
        const matchesMember = u.member.toLowerCase().includes(q);
        const matchesRole = u.projectRoles.some(r => r.toLowerCase().includes(q));
        const matchesDs = u.accessibleDataStores.some(d => d.toLowerCase().includes(q));
        if (!matchesMember && !matchesRole && !matchesDs) return false;
      }

      return true;
    });
  }, [allUsersList, userFilterType, userSearchQuery]);

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-md overflow-hidden">
      <div className="p-4 bg-gray-750 border-b border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600/30 text-indigo-400 flex items-center justify-center font-bold text-xs">
              👥
            </div>
            <h3 className="text-base font-bold text-white">Active Users & Access Inspector</h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-700 text-gray-300 border border-gray-600">
              {allUsersList.length} Identit{allUsersList.length === 1 ? 'y' : 'ies'} Found
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            Inspect current project & engine roles, identify broad roles that bypass DataStore ACLs, and isolate users with 1-click.
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          {selectedUsersForIsolation.size > 0 && (
            <button
              type="button"
              onClick={() =>
                onIsolateTarget({
                  members: Array.from(selectedUsersForIsolation),
                  broadRoles: Array.from(
                    new Set(
                      allUsersList
                        .filter(u => selectedUsersForIsolation.has(u.member))
                        .flatMap(u => u.broadRoles)
                    )
                  ),
                })
              }
              className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-1.5 animate-pulse"
            >
              <span>⚡ Isolate Selected ({selectedUsersForIsolation.size})</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 bg-gray-900/50 border-b border-gray-700/80 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: 'all', label: `All (${allUsersList.length})` },
            {
              key: 'needs_isolation',
              label: `⚠️ Broad Roles / Needs Isolation (${
                allUsersList.filter(u => u.hasBroadRoles).length
              })`,
            },
            {
              key: 'isolated',
              label: `🟢 Isolated & Ready (${
                allUsersList.filter(u => u.hasCustomRole && !u.hasBroadRoles).length
              })`,
            },
            {
              key: 'engine_access',
              label: `App Engine Members (${
                allUsersList.filter(u => u.hasEngineAccess).length
              })`,
            },
          ].map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setUserFilterType(tab.key as any)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                userFilterType === tab.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200 border border-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-64">
          <input
            type="text"
            placeholder="Search user / role / datastore..."
            value={userSearchQuery}
            onChange={e => setUserSearchQuery(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          {userSearchQuery && (
            <button
              type="button"
              onClick={() => setUserSearchQuery('')}
              className="absolute right-2.5 top-1.5 text-gray-400 hover:text-white text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* User Table */}
      <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
        <table className="min-w-full divide-y divide-gray-700 text-left text-xs">
          <thead className="bg-gray-900 text-gray-400 font-semibold sticky top-0 z-10">
            <tr>
              <th className="p-3 w-10">
                <input
                  type="checkbox"
                  checked={
                    filteredUsersList.length > 0 &&
                    filteredUsersList.every(u => selectedUsersForIsolation.has(u.member))
                  }
                  onChange={e => {
                    if (e.target.checked) {
                      const newSet = new Set(selectedUsersForIsolation);
                      filteredUsersList.forEach(u => newSet.add(u.member));
                      onSetSelectedUsers(newSet);
                    } else {
                      const newSet = new Set(selectedUsersForIsolation);
                      filteredUsersList.forEach(u => newSet.delete(u.member));
                      onSetSelectedUsers(newSet);
                    }
                  }}
                  className="rounded bg-gray-800 border-gray-600 text-blue-500 focus:ring-0"
                />
              </th>
              <th className="p-3">Identity (User / Group)</th>
              <th className="p-3">Project Roles & Status</th>
              <th className="p-3">App Engine Access</th>
              <th className="p-3">DataStore Grants</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/60 bg-gray-800/40">
            {filteredUsersList.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-gray-500 italic">
                  No users matching the current filter.
                </td>
              </tr>
            ) : (
              filteredUsersList.map(u => {
                const isSelected = selectedUsersForIsolation.has(u.member);
                return (
                  <tr
                    key={u.member}
                    className={`hover:bg-gray-750 transition-colors ${
                      u.hasBroadRoles ? 'bg-yellow-950/10' : ''
                    }`}
                  >
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelectUser(u.member)}
                        className="rounded bg-gray-800 border-gray-600 text-blue-500 focus:ring-0"
                      />
                    </td>

                    <td className="p-3 font-mono text-gray-200">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-bold uppercase ${
                            u.type === 'user'
                              ? 'bg-blue-900/60 text-blue-300 border border-blue-700/60'
                              : u.type === 'group'
                              ? 'bg-purple-900/60 text-purple-300 border border-purple-700/60'
                              : 'bg-gray-700 text-gray-300'
                          }`}
                        >
                          {u.type}
                        </span>
                        <span className="truncate max-w-[200px]" title={u.member}>
                          {u.member.replace(/^(user|group|serviceAccount):/, '')}
                        </span>
                      </div>
                    </td>

                    <td className="p-3">
                      <div className="space-y-1">
                        {u.hasBroadRoles ? (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-900/50 text-red-300 border border-red-700">
                              ⚠️ Bypasses ACLs
                            </span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {u.broadRoles.map(r => (
                                <span
                                  key={r}
                                  className="px-1.5 py-0.5 bg-gray-900 text-red-400 font-mono text-[10px] rounded border border-red-800/60"
                                >
                                  {r.replace('roles/', '')}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : u.hasCustomRole ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-green-900/50 text-green-400 border border-green-700">
                            🟢 customRestrictedEndUser
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-500 italic">No Project Custom Role</span>
                        )}
                      </div>
                    </td>

                    <td className="p-3">
                      {u.hasEngineAccess ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-green-900/50 text-green-400 border border-green-700">
                          ✓ Granted ({appId})
                        </span>
                      ) : (
                        <span className="text-[11px] text-gray-500 italic">No Engine Access</span>
                      )}
                    </td>

                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold font-mono ${
                            u.accessibleDataStoreCount > 0
                              ? 'bg-blue-900/50 text-blue-300 border border-blue-700'
                              : 'bg-gray-800 text-gray-500 border border-gray-700'
                          }`}
                        >
                          {u.accessibleDataStoreCount} of {u.totalDataStoreCount}
                        </span>
                        {u.accessibleDataStores.length > 0 && (
                          <span className="text-[10px] text-gray-400 truncate max-w-[120px]" title={u.accessibleDataStores.join(', ')}>
                            ({u.accessibleDataStores.slice(0, 2).join(', ')}{u.accessibleDataStores.length > 2 ? '...' : ''})
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {u.hasBroadRoles || !u.hasCustomRole ? (
                          <button
                            type="button"
                            onClick={() =>
                              onIsolateTarget({
                                members: [u.member],
                                broadRoles: u.broadRoles,
                              })
                            }
                            className="px-2.5 py-1 bg-yellow-600 hover:bg-yellow-500 text-white text-[11px] font-semibold rounded shadow-sm transition-colors flex items-center gap-1 whitespace-nowrap"
                          >
                            <span>⚡ Isolate</span>
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => {
                            const cleaned = u.member.replace(/^(user|group|serviceAccount):/, '');
                            onConfigureDataStores(cleaned, u.hasCustomRole);
                          }}
                          className="px-2.5 py-1 bg-blue-600/80 hover:bg-blue-600 text-white text-[11px] font-semibold rounded shadow-sm transition-colors whitespace-nowrap"
                        >
                          Configure DataStores ↓
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
