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

import React, { useState } from 'react';
import { Authorization, Agent } from '../../types';

export type AuthColumnKey = 'authId' | 'region' | 'clientId' | 'usedBy' | 'actions';

const DEFAULT_VISIBLE_AUTH_COLUMNS: Record<AuthColumnKey, boolean> = {
  authId: true,
  region: true,
  clientId: true,
  usedBy: true,
  actions: true,
};

interface AuthListProps {
  authorizations: Authorization[];
  onDelete: (auth?: Authorization) => void;
  onEdit: (authId: string) => void;
  onCreateNew: () => void;
  authUsage: Record<string, Agent[]>;
  isScanningAgents: boolean;
  onView: (auth: Authorization, tab?: 'config' | 'adk') => void;
  selectedIds: Set<string>;
  onToggleSelect: (authId: string) => void;
  onToggleSelectAll: () => void;
  onDeleteSelected: () => void;
}

const AuthList: React.FC<AuthListProps> = ({
  authorizations,
  onDelete,
  onEdit,
  onCreateNew,
  authUsage,
  isScanningAgents,
  onView,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onDeleteSelected,
}) => {
  const isAllSelected = authorizations.length > 0 && selectedIds.size === authorizations.length;
  const [visibleColumns, setVisibleColumns] = useState<Record<AuthColumnKey, boolean>>(
    DEFAULT_VISIBLE_AUTH_COLUMNS,
  );
  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);
  const [copiedClientId, setCopiedClientId] = useState<string | null>(null);

  const toggleColumn = (key: AuthColumnKey) => {
    setVisibleColumns((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (!Object.values(next).some(Boolean)) return prev;
      return next;
    });
  };

  const handleCopyClientId = (authName: string, clientId: string) => {
    if (!clientId) return;
    void navigator.clipboard?.writeText(clientId);
    setCopiedClientId(authName);
    setTimeout(() => {
      setCopiedClientId((prev) => (prev === authName ? null : prev));
    }, 1500);
  };

  return (
    <div className="bg-gray-800 shadow-xl rounded-lg overflow-hidden w-full">
      <div className="p-4 flex flex-wrap justify-between items-center gap-3 border-b border-gray-700">
        <h2 className="text-xl font-bold text-white">Authorization Resources</h2>
        <div className="flex flex-wrap items-center gap-2.5">
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2.5">
              <span className="text-sm text-gray-300">{selectedIds.size} selected</span>
              <button
                onClick={onDeleteSelected}
                className="px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-red-500"
              >
                Delete Selected
              </button>
            </div>
          )}

          {/* Column Visibility Toggle */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsColumnMenuOpen((prev) => !prev)}
              aria-label="Toggle authorization table columns"
              className="px-3 py-1.5 bg-gray-700 text-gray-200 text-xs font-semibold rounded-md hover:bg-gray-600 border border-gray-600 flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
              Columns
            </button>
            {isColumnMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl z-30 p-2 space-y-1">
                {(
                  [
                    { key: 'authId', label: 'Auth ID' },
                    { key: 'region', label: 'Region' },
                    { key: 'clientId', label: 'Client ID' },
                    { key: 'usedBy', label: 'Used By Agent' },
                    { key: 'actions', label: 'Actions' },
                  ] as { key: AuthColumnKey; label: string }[]
                ).map((col) => (
                  <label
                    key={col.key}
                    className="flex items-center gap-2 px-2 py-1 text-xs text-gray-200 hover:bg-gray-700/60 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns[col.key]}
                      onChange={() => toggleColumn(col.key)}
                      className="h-3.5 w-3.5 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600"
                    />
                    <span>{col.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={onCreateNew}
            className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-green-500"
          >
            Create New Authorization
          </button>
        </div>
      </div>
      {authorizations.length === 0 && !isScanningAgents ? (
        <div
          data-testid="auth-empty-state"
          className="p-8 text-center bg-gray-800/60 border-t border-gray-700"
        >
          <div className="mx-auto w-12 h-12 rounded-xl bg-blue-900/30 border border-blue-700/50 flex items-center justify-center text-blue-400 mb-3">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-white">
            No authorizations found for the provided project number.
          </h3>
          <p className="text-xs text-gray-400 max-w-xl mx-auto mt-2 leading-relaxed">
            Discovery Engine <code className="text-blue-300 font-mono">serverSideOauth2</code> resources store OAuth 2.0 client credentials (Client ID, Authorization URI, and Token URI) so ADK agents and tools can securely request delegated end-user tokens for third-party APIs (Jira, ServiceNow, Salesforce, Microsoft Entra ID).
          </p>
          <div className="mt-4">
            <button
              type="button"
              data-testid="auth-empty-create-cta"
              onClick={onCreateNew}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <span>+ Register First OAuth Authorization</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="w-full">
          <table className="w-full table-fixed divide-y divide-gray-700">
            <thead className="bg-gray-700/50">
              <tr>
                <th scope="col" className="px-3 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={onToggleSelectAll}
                    aria-label="Select all authorizations"
                    className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600"
                  />
                </th>
                {visibleColumns.authId && (
                  <th scope="col" className="px-3 py-3 w-[22%] text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Auth ID
                  </th>
                )}
                {visibleColumns.region && (
                  <th scope="col" className="px-3 py-3 w-20 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Region
                  </th>
                )}
                {visibleColumns.clientId && (
                  <th scope="col" className="px-3 py-3 w-[26%] text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Client ID
                  </th>
                )}
                {visibleColumns.usedBy && (
                  <th scope="col" className="px-3 py-3 w-[22%] text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Used By Agent
                  </th>
                )}
                {visibleColumns.actions && (
                  <th scope="col" className="px-3 py-3 w-44 sm:w-52 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {authorizations.map((auth) => {
                const authName = auth?.name || '';
                const authId = authName.split('/').pop() || '';
                const location = authName.match(/locations\/([a-zA-Z0-9-]+)\//)?.[1] || 'global';
                const usingAgents = authUsage[authName] || [];
                const isSelected = selectedIds.has(authName);
                const oauth2 = auth?.serverSideOauth2 || ({} as NonNullable<Authorization['serverSideOauth2']>);
                const clientIdValue = oauth2.clientId || 'N/A';

                return (
                  <tr
                    key={authName}
                    className={`${isSelected ? 'bg-blue-900/50' : 'hover:bg-gray-700/50'} transition-colors`}
                  >
                    <td className="px-3 py-3.5 align-middle">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(authName)}
                        aria-label={`Select ${authId}`}
                        className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600"
                      />
                    </td>
                    {visibleColumns.authId && (
                      <td className="px-3 py-3.5 align-middle text-sm font-medium text-white font-mono">
                        <div className="truncate" title={authId}>
                          {authId}
                        </div>
                      </td>
                    )}
                    {visibleColumns.region && (
                      <td className="px-3 py-3.5 align-middle text-sm text-gray-300 font-mono">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                            location === 'global'
                              ? 'bg-blue-900 text-blue-200'
                              : 'bg-green-900 text-green-200'
                          }`}
                        >
                          {location}
                        </span>
                      </td>
                    )}
                    {visibleColumns.clientId && (
                      <td className="px-3 py-3.5 align-middle text-sm text-gray-300 font-mono">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate" title={clientIdValue}>
                            {clientIdValue}
                          </span>
                          {oauth2.clientId && (
                            <button
                              type="button"
                              onClick={() => handleCopyClientId(authName, oauth2.clientId)}
                              title="Copy full Client ID"
                              className="shrink-0 p-1 text-gray-400 hover:text-white rounded hover:bg-gray-700 transition-colors"
                            >
                              {copiedClientId === authName ? (
                                <span className="text-[10px] text-green-400 font-sans">Copied</span>
                              ) : (
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                    {visibleColumns.usedBy && (
                      <td className="px-3 py-3.5 align-middle text-sm text-gray-300">
                        {isScanningAgents ? (
                          <div className="flex items-center">
                            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-gray-500 mr-2 shrink-0"></div>
                            <span className="text-xs text-gray-500 truncate">Scanning...</span>
                          </div>
                        ) : usingAgents.length > 0 ? (
                          <ul className="space-y-1 min-w-0">
                            {usingAgents.map((agent) => (
                              <li
                                key={agent.name}
                                title={`${agent.displayName} (${agent.name})`}
                                className="truncate text-xs text-gray-200"
                              >
                                {agent.displayName}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-xs text-gray-500 italic">Not in use</span>
                        )}
                      </td>
                    )}
                    {visibleColumns.actions && (
                      <td className="px-3 py-3.5 align-middle text-right text-xs sm:text-sm font-medium">
                        <div className="flex flex-wrap items-center justify-end gap-x-2.5 gap-y-1">
                          <button
                            onClick={() => onView(auth, 'config')}
                            className="font-semibold text-blue-400 hover:text-blue-300"
                          >
                            View
                          </button>
                          <button
                            onClick={() => onView(auth, 'adk')}
                            className="font-semibold text-teal-400 hover:text-teal-300 inline-flex items-center gap-1"
                            title="View ADK Python Integration Code"
                          >
                            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                            </svg>
                            <span>ADK Code</span>
                          </button>
                          <button
                            onClick={() => onEdit(authId)}
                            className="font-semibold text-indigo-400 hover:text-indigo-300"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => onDelete(auth)}
                            className="font-semibold text-red-400 hover:text-red-300"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AuthList;