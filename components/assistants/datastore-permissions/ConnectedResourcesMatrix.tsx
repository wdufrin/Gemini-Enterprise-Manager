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
import { AppEngine, Config } from '../../../types';
import {
  AGENTSPACE_USER_ROLE,
  ConnectorResource,
  EditingResource,
  IamPolicy,
  LegacyDataStoreResource,
  PrincipalAccess,
} from './types';

interface ConnectedResourcesMatrixProps {
  engine: AppEngine;
  config: Config;
  projectId: string;
  appId: string;
  enginePolicy: IamPolicy | null;
  connectors: ConnectorResource[];
  legacyDataStores: LegacyDataStoreResource[];
  principalMatrix: PrincipalAccess[];
  onEditResource: (resource: EditingResource) => void;
  onRevokeApp: (member: string) => void;
}

export const ConnectedResourcesMatrix: React.FC<ConnectedResourcesMatrixProps> = ({
  engine,
  config,
  projectId,
  appId,
  enginePolicy,
  connectors,
  legacyDataStores,
  principalMatrix,
  onEditResource,
  onRevokeApp,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredMatrix = useMemo(() => {
    if (!searchQuery) return principalMatrix;
    const lower = searchQuery.toLowerCase();
    return principalMatrix.filter(p => p.member.toLowerCase().includes(lower));
  }, [principalMatrix, searchQuery]);

  const exportToCsv = () => {
    if (filteredMatrix.length === 0) return;

    const headers = [
      'Member',
      'Project Custom Role',
      'App Engine Access',
      ...connectors.map(c => `Connector: ${c.id}`),
      ...connectors.flatMap(c => c.entities.map(e => `Entity: ${e.id}`)),
      ...legacyDataStores.map(ds => `DataStore: ${ds.id}`),
    ];

    const rows = [headers.join(',')];

    filteredMatrix.forEach(p => {
      const row = [
        `"${p.member}"`,
        p.hasProjectRole ? 'Granted' : 'Missing',
        p.hasEngineAccess ? 'Granted' : 'Missing',
        ...connectors.map(c => (p.resourceAccess[`connector:${c.id}`] ? 'Granted' : 'None')),
        ...connectors.flatMap(c =>
          c.entities.map(e => (p.resourceAccess[`entity:${e.id}`] ? 'Granted' : 'None'))
        ),
        ...legacyDataStores.map(ds =>
          p.resourceAccess[`datastore:${ds.id}`] ? 'Granted' : 'None'
        ),
      ];
      rows.push(row.join(','));
    });

    const csvBlob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(csvBlob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${appId}_datastore_permissions_audit.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* 1. Connected Resources Grid */}
      <div className="bg-gray-800 p-5 rounded-xl border border-gray-700 shadow-md space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-base font-bold text-white">Connected DataStores & Connectors Status</h3>
            <p className="text-xs text-gray-400">
              Attached to this App Engine ({engine.dataStoreIds?.length || 0} attached)
            </p>
          </div>
          <span className="text-xs text-gray-400 font-mono">
            Location: {config.appLocation || 'global'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* App Engine Card */}
          <div className="bg-gray-900/70 p-4 rounded-xl border border-blue-900/40 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start mb-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950 text-blue-300 border border-blue-800">
                  App Engine
                </span>
                <span className="text-xs text-gray-500 font-mono">
                  {enginePolicy?.bindings?.length || 0} bindings
                </span>
              </div>
              <h4 className="text-sm font-bold text-white truncate">{engine.displayName}</h4>
              <p className="text-xs text-gray-400 font-mono truncate">{appId}</p>

              <div className="mt-3">
                <span className="text-[11px] text-gray-400 block font-semibold mb-1">
                  Active Agentspace Users:
                </span>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {enginePolicy?.bindings?.find(b => b.role === AGENTSPACE_USER_ROLE)?.members?.map(m => (
                    <div key={m} className="text-[11px] font-mono text-gray-300 bg-gray-800 px-2 py-0.5 rounded truncate">
                      {m}
                    </div>
                  )) || <span className="text-xs text-gray-500 italic">None assigned</span>}
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-gray-800 flex justify-end">
              <button
                onClick={() =>
                  onEditResource({
                    id: appId,
                    displayName: engine.displayName,
                    type: 'engine',
                    path: `projects/${projectId}/locations/${config.appLocation}/collections/default_collection/engines/${appId}`,
                    policy: enginePolicy,
                  })
                }
                className="px-3 py-1.5 bg-blue-600/80 hover:bg-blue-600 text-white text-xs font-semibold rounded-md transition-colors"
              >
                Edit Policy
              </button>
            </div>
          </div>

          {/* Connectors Cards */}
          {connectors.map(conn => {
            const agentspaceUsers = conn.policy?.bindings?.find(
              b => b.role === AGENTSPACE_USER_ROLE
            )?.members || [];

            return (
              <div
                key={conn.id}
                className={`bg-gray-900/70 p-4 rounded-xl border shadow-sm flex flex-col justify-between ${
                  conn.isAttached ? 'border-purple-900/50' : 'border-gray-800 opacity-80'
                }`}
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800">
                      DataConnector
                    </span>
                    {conn.isAttached ? (
                      <span className="text-[10px] font-semibold text-green-400">Attached ✓</span>
                    ) : (
                      <span className="text-[10px] text-gray-500">Unlinked</span>
                    )}
                  </div>
                  <h4 className="text-sm font-bold text-white font-mono truncate">{conn.id}</h4>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {conn.entities.length} Sub-Entit{conn.entities.length === 1 ? 'y' : 'ies'}
                  </p>

                  <div className="mt-3">
                    <span className="text-[11px] text-gray-400 block font-semibold mb-1">
                      Collection Level Users:
                    </span>
                    <div className="space-y-1 max-h-20 overflow-y-auto">
                      {agentspaceUsers.length > 0 ? (
                        agentspaceUsers.map(m => (
                          <div key={m} className="text-[11px] font-mono text-gray-300 bg-gray-800 px-2 py-0.5 rounded truncate">
                            {m}
                          </div>
                        ))
                      ) : (
                        <span className="text-xs text-gray-500 italic">None assigned</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-800 flex justify-between items-center">
                  <span className="text-[11px] text-gray-500">
                    ETag: {conn.policy?.etag ? `${conn.policy.etag.slice(0, 8)}...` : 'None'}
                  </span>
                  <button
                    onClick={() =>
                      onEditResource({
                        id: conn.id,
                        displayName: conn.displayName || conn.id,
                        type: 'connector',
                        path: `projects/${projectId}/locations/${config.appLocation}/collections/${conn.id}`,
                        policy: conn.policy || null,
                      })
                    }
                    className="px-3 py-1.5 bg-purple-600/80 hover:bg-purple-600 text-white text-xs font-semibold rounded-md transition-colors"
                  >
                    Edit Policy
                  </button>
                </div>
              </div>
            );
          })}

          {/* Legacy DataStores Cards */}
          {legacyDataStores.map(ds => {
            const agentspaceUsers = ds.policy?.bindings?.find(
              b => b.role === AGENTSPACE_USER_ROLE
            )?.members || [];

            return (
              <div
                key={ds.id}
                className={`bg-gray-900/70 p-4 rounded-xl border shadow-sm flex flex-col justify-between ${
                  ds.isAttached ? 'border-gray-700' : 'border-gray-800 opacity-80'
                }`}
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950 text-blue-300 border border-blue-800">
                      Legacy DataStore
                    </span>
                    {ds.isAttached ? (
                      <span className="text-[10px] font-semibold text-green-400">Attached ✓</span>
                    ) : (
                      <span className="text-[10px] text-gray-500">Unlinked</span>
                    )}
                  </div>
                  <h4 className="text-sm font-bold text-white font-mono truncate">{ds.id}</h4>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{ds.displayName || ds.id}</p>

                  <div className="mt-3">
                    <span className="text-[11px] text-gray-400 block font-semibold mb-1">
                      DataStore Users:
                    </span>
                    <div className="space-y-1 max-h-20 overflow-y-auto">
                      {agentspaceUsers.length > 0 ? (
                        agentspaceUsers.map(m => (
                          <div key={m} className="text-[11px] font-mono text-gray-300 bg-gray-800 px-2 py-0.5 rounded truncate">
                            {m}
                          </div>
                        ))
                      ) : (
                        <span className="text-xs text-gray-500 italic">None assigned</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-800 flex justify-between items-center">
                  <span className="text-[11px] text-gray-500">
                    ETag: {ds.policy?.etag ? `${ds.policy.etag.slice(0, 8)}...` : 'None'}
                  </span>
                  <button
                    onClick={() =>
                      onEditResource({
                        id: ds.id,
                        displayName: ds.displayName || ds.id,
                        type: 'datastore',
                        path: `projects/${projectId}/locations/${config.appLocation}/collections/default_collection/dataStores/${ds.id}`,
                        policy: ds.policy || null,
                      })
                    }
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs font-semibold rounded-md transition-colors"
                  >
                    Edit Policy
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Principals & Permissions Audit Matrix Table */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-md overflow-hidden">
        <div className="p-4 border-b border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-750">
          <div>
            <h3 className="text-base font-bold text-white">Active Permissions Matrix & Audit</h3>
            <p className="text-xs text-gray-400">
              Consolidated breakdown of principals with project roles, engine access, and datastore grants
            </p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <input
              type="text"
              placeholder="Filter by user / group email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-gray-900 border border-gray-600 text-xs text-gray-200 rounded-lg px-3 py-2 outline-none w-full sm:w-64"
            />
            <button
              onClick={exportToCsv}
              disabled={filteredMatrix.length === 0}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-200 text-xs font-medium rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700 text-left">
            <thead className="bg-gray-900/60 text-xs uppercase tracking-wider text-gray-400 font-semibold">
              <tr>
                <th className="px-6 py-3.5">Principal / Member</th>
                <th className="px-6 py-3.5">Project Custom Role</th>
                <th className="px-6 py-3.5">App Engine ({appId})</th>
                <th className="px-6 py-3.5">Connected DataStores & Connectors</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700 bg-gray-800/40 text-xs">
              {filteredMatrix.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500 italic">
                    No explicit member permissions discovered for this App or connected DataStores. Use the wizard above to grant access.
                  </td>
                </tr>
              ) : (
                filteredMatrix.map((p) => {
                  const displayMember = p.member.replace(/^(user:|group:|serviceAccount:)/, '');
                  const memberType = p.member.startsWith('group:')
                    ? 'Group'
                    : p.member.startsWith('serviceAccount:')
                    ? 'SA'
                    : 'User';

                  return (
                    <tr key={p.member} className="hover:bg-gray-700/40 transition-colors">
                      {/* Principal */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              memberType === 'Group'
                                ? 'bg-purple-900/50 text-purple-300 border border-purple-700'
                                : memberType === 'SA'
                                ? 'bg-yellow-900/50 text-yellow-300 border border-yellow-700'
                                : 'bg-blue-900/50 text-blue-300 border border-blue-700'
                            }`}
                          >
                            {memberType}
                          </span>
                          <span className="font-mono text-white text-xs">{displayMember}</span>
                        </div>
                      </td>

                      {/* Project Custom Role */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {p.hasProjectRole ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-green-900/40 text-green-300 border border-green-700">
                            ✓ customRestrictedEndUser
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] text-gray-500 bg-gray-900 border border-gray-700">
                            Missing
                          </span>
                        )}
                      </td>

                      {/* App Engine Access */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {p.hasEngineAccess ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-900/40 text-blue-300 border border-blue-700">
                            ✓ agentspaceUser
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] text-gray-500 bg-gray-900 border border-gray-700">
                            Not Granted
                          </span>
                        )}
                      </td>

                      {/* DataStores Breakdown */}
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1.5 max-w-md">
                          {/* Connectors */}
                          {connectors.map(c => {
                            const hasConn = p.resourceAccess[`connector:${c.id}`];
                            return (
                              <span
                                key={c.id}
                                className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                                  hasConn
                                    ? 'bg-purple-900/50 text-purple-200 border-purple-700 font-semibold'
                                    : 'bg-gray-900 text-gray-600 border-gray-800 line-through'
                                }`}
                                title={`Connector: ${c.id}`}
                              >
                                {c.id}
                              </span>
                            );
                          })}

                          {/* Entities */}
                          {connectors.flatMap(c =>
                            c.entities.map(e => {
                              const hasEnt = p.resourceAccess[`entity:${e.id}`];
                              return (
                                <span
                                  key={e.id}
                                  className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                                    hasEnt
                                      ? 'bg-blue-900/50 text-blue-200 border-blue-700 font-semibold'
                                      : 'bg-gray-900 text-gray-600 border-gray-800 line-through'
                                  }`}
                                  title={`Entity: ${e.id}`}
                                >
                                  {e.id}
                                </span>
                              );
                            })
                          )}

                          {/* Legacy DataStores */}
                          {legacyDataStores.map(ds => {
                            const hasDs = p.resourceAccess[`datastore:${ds.id}`];
                            return (
                              <span
                                key={ds.id}
                                className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                                  hasDs
                                    ? 'bg-green-900/50 text-green-200 border-green-700 font-semibold'
                                    : 'bg-gray-900 text-gray-600 border-gray-800 line-through'
                                }`}
                                title={`DataStore: ${ds.id}`}
                              >
                                {ds.id}
                              </span>
                            );
                          })}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 whitespace-nowrap text-right text-xs">
                        <button
                          onClick={() => onRevokeApp(p.member)}
                          className="text-red-400 hover:text-red-300 font-medium px-2 py-1 rounded hover:bg-red-900/30 transition-colors"
                        >
                          Revoke App
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
