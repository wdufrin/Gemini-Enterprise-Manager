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
import { Authorization, Agent } from '../../types';

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

const AuthList: React.FC<AuthListProps> = ({ authorizations, onDelete, onEdit, onCreateNew, authUsage, isScanningAgents, onView, selectedIds, onToggleSelect, onToggleSelectAll, onDeleteSelected }) => {
  const isAllSelected = authorizations.length > 0 && selectedIds.size === authorizations.length;
  return (
    <div className="bg-gray-800 shadow-xl rounded-lg overflow-hidden">
      <div className="p-4 flex justify-between items-center border-b border-gray-700">
        <h2 className="text-xl font-bold text-white">Authorization Resources</h2>
        <div className="flex items-center gap-4">
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-300">{selectedIds.size} selected</span>
              <button
                onClick={onDeleteSelected}
                className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-red-500"
              >
                Delete Selected
              </button>
            </div>
          )}
          <button
            onClick={onCreateNew}
            className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-green-500"
          >
            Create New Authorization
          </button>
        </div>
      </div>
      {authorizations.length === 0 && !isScanningAgents ? (
        <p className="text-gray-400 p-6 text-center">No authorizations found for the provided project number.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-700/50">
              <tr>
                  <th scope="col" className="px-6 py-3 w-10">
                    <input type="checkbox" checked={isAllSelected} onChange={onToggleSelectAll} className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600" />
                  </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Auth ID</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Region</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Client ID</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Used By Agent</th>
                <th scope="col" className="relative px-6 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {authorizations.map((auth) => {
                const authId = auth.name.split('/').pop() || '';
                const location = auth.name.match(/locations\/([a-zA-Z0-9-]+)\//)?.[1] || 'unknown';
                const usingAgents = authUsage[auth.name] || [];
                const isSelected = selectedIds.has(auth.name);
                return (
                  <tr key={auth.name} className={`${isSelected ? 'bg-blue-900/50' : 'hover:bg-gray-700/50'} transition-colors`}>
                    <td className="px-6 py-4">
                      <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(auth.name)} className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600" />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white font-mono">{authId}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 font-mono">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${location === 'global' ? 'bg-blue-900 text-blue-200' : 'bg-green-900 text-green-200'}`}>
                        {location}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 font-mono">{auth.serverSideOauth2?.clientId || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {isScanningAgents ? (
                        <div className="flex items-center">
                            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-gray-500 mr-2"></div>
                            <span className="text-xs text-gray-500">Scanning...</span>
                        </div>
                      ) : usingAgents.length > 0 ? (
                        <ul className="space-y-1">
                          {usingAgents.map(agent => (
                            <li key={agent.name} title={agent.name} className="truncate max-w-xs">
                              {agent.displayName}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-xs text-gray-500 italic">Not in use</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                      <button onClick={() => onView(auth, 'config')} className="font-semibold text-blue-400 hover:text-blue-300">
                        View
                      </button>
                      <button
                        onClick={() => onView(auth, 'adk')}
                        className="font-semibold text-teal-400 hover:text-teal-300 inline-flex items-center gap-1"
                        title="View ADK Python Integration Code"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                        </svg>
                        ADK Code
                      </button>
                      <button onClick={() => onEdit(authId)} className="font-semibold text-indigo-400 hover:text-indigo-300">
                        Edit
                      </button>
                      <button onClick={() => onDelete(auth)} className="font-semibold text-red-400 hover:text-red-300">
                        Delete
                      </button>
                    </td>
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