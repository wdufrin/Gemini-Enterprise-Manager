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

import React from "react";
import { ReasoningEngine, Agent, CloudRunService, Page } from "../../types";
import { UnifiedResource, SortColumn, SortDirection } from "../../hooks/useAgentEngines";

interface AgentEnginesTableProps {
  resources: UnifiedResource[];
  selectedIds: Set<string>;
  isDeleting: boolean;
  agentsByResource: Record<string, Agent[]>;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  permissionWarnings: string[];
  error: string | null;
  isLoading: boolean;
  isClearingSessions: boolean;
  engineToClearSessions: ReasoningEngine | null;
  onSort: (column: SortColumn) => void;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onOpenDeleteModal: (resource?: UnifiedResource) => void;
  onClearSessions: (engine: ReasoningEngine) => void;
  onDirectQuery: (engine: ReasoningEngine) => void;
  onAgentCard: (engine: ReasoningEngine) => void;
  onCloudRunQuery: (service: CloudRunService) => void;
  onViewResource: (resource: UnifiedResource) => void;
  onNavigate?: (page: Page, context?: any) => void;
}

export const AgentEnginesTable: React.FC<AgentEnginesTableProps> = ({
  resources,
  selectedIds,
  isDeleting,
  agentsByResource,
  sortColumn,
  sortDirection,
  permissionWarnings,
  error,
  isLoading,
  isClearingSessions,
  engineToClearSessions,
  onSort,
  onToggleSelect,
  onToggleSelectAll,
  onOpenDeleteModal,
  onClearSessions,
  onDirectQuery,
  onAgentCard,
  onCloudRunQuery,
  onViewResource,
  onNavigate,
}) => {
  const isAllSelected =
    selectedIds.size === resources.length && resources.length > 0;

  return (
    <div className="bg-gray-800 shadow-xl rounded-lg overflow-hidden">
      <div className="p-4 border-b border-gray-700 flex justify-between items-center">
        <h2 className="text-xl font-bold text-white">Available Agents</h2>
        <div className="flex items-center gap-4">
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-4 border-l border-gray-700 pl-4">
              <span className="text-sm text-gray-300">
                {selectedIds.size} selected
              </span>
              <button
                onClick={() => onOpenDeleteModal()}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-md hover:bg-red-700 disabled:bg-red-800"
              >
                Delete Selected
              </button>
            </div>
          )}
        </div>
      </div>
      {permissionWarnings.length > 0 && (
        <div className="p-4 bg-yellow-900/30 border-b border-yellow-800">
          {permissionWarnings.map((warn, i) => (
            <div
              key={i}
              className="text-yellow-200 text-sm flex items-start gap-2"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 shrink-0"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{warn}</span>
            </div>
          ))}
        </div>
      )}
      {error && (
        <div className="p-4 bg-red-900/20 text-red-300 text-sm rounded-b-lg whitespace-pre-wrap border-b border-red-800">
          {error}
        </div>
      )}
      {resources.length === 0 && !isLoading && !error && (
        <p className="text-gray-400 p-6 text-center">
          No available agent resources found in this location.
        </p>
      )}
      {resources.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-700/50">
              <tr>
                <th scope="col" className="px-6 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={onToggleSelectAll}
                    className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600"
                  />
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600/50 transition-colors"
                  onClick={() => onSort("displayName")}
                >
                  <div className="flex items-center gap-1">
                    Display Name
                    {sortColumn === "displayName" && (
                      <span className="text-gray-400">
                        {sortDirection === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600/50 transition-colors"
                  onClick={() => onSort("type")}
                >
                  <div className="flex items-center gap-1">
                    Type
                    {sortColumn === "type" && (
                      <span className="text-gray-400">
                        {sortDirection === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600/50 transition-colors"
                  onClick={() => onSort("shortId")}
                >
                  <div className="flex items-center gap-1">
                    Resource ID
                    {sortColumn === "shortId" && (
                      <span className="text-gray-400">
                        {sortDirection === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600/50 transition-colors"
                  onClick={() => onSort("usedByAgents")}
                >
                  <div className="flex items-center gap-1">
                    Used By Agents
                    {sortColumn === "usedByAgents" && (
                      <span className="text-gray-400">
                        {sortDirection === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {resources.map((res) => {
                const isSelected = selectedIds.has(res.id);
                const usingAgents = agentsByResource[res.id] || [];
                const isRE = res.type === "Agent Engine";
                const badgeClass = isRE
                  ? "bg-purple-900 text-purple-200"
                  : "bg-teal-900 text-teal-200";

                return (
                  <tr
                    key={res.id}
                    className={`${isSelected ? "bg-blue-900/50" : "hover:bg-gray-700/50"} transition-colors`}
                  >
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(res.id)}
                        className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                      {res.displayName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${badgeClass}`}
                      >
                        {res.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 font-mono">
                      {res.shortId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {usingAgents.length > 0 ? (
                        <ul className="space-y-1">
                          {usingAgents.map((agent) => (
                            <li
                              key={agent.name}
                              className="text-xs"
                              title={agent.name}
                            >
                              -{" "}
                              <button
                                onClick={() =>
                                  onNavigate &&
                                  onNavigate(Page.AGENTS, {
                                    agentToEdit: agent,
                                  })
                                }
                                className="text-blue-400 hover:text-blue-300 hover:underline text-left"
                              >
                                {agent.displayName}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-xs text-gray-500 italic">
                          Not in use
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end items-center gap-4">
                        {isRE ? (
                          <div className="flex items-center gap-2">
                            {typeof res.sessionCount === "number" && (
                              <button
                                onClick={() =>
                                  onClearSessions(res.data as ReasoningEngine)
                                }
                                disabled={
                                  res.sessionCount === 0 || isClearingSessions
                                }
                                className={`flex items-center justify-center text-xs font-bold rounded-full h-5 w-5 transition-colors ${res.sessionCount > 0 ? "bg-green-500 text-white hover:bg-green-400" : "bg-gray-600 text-gray-300 cursor-not-allowed"}`}
                                title={`${res.sessionCount} active session(s)`}
                              >
                                {isClearingSessions &&
                                engineToClearSessions?.name === res.id
                                  ? "..."
                                  : res.sessionCount}
                              </button>
                            )}
                            <button
                              onClick={() =>
                                onDirectQuery(res.data as ReasoningEngine)
                              }
                              className="font-semibold text-green-400 hover:text-green-300"
                            >
                              Direct Query
                            </button>
                            <button
                              onClick={() =>
                                onAgentCard(res.data as ReasoningEngine)
                              }
                              className="font-semibold text-indigo-400 hover:text-indigo-300"
                            >
                              Agent Card
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() =>
                              onCloudRunQuery(res.data as CloudRunService)
                            }
                            className="font-semibold text-green-400 hover:text-green-300"
                          >
                            Direct Query
                          </button>
                        )}
                        <button
                          onClick={() => onViewResource(res)}
                          className="font-semibold text-blue-400 hover:text-blue-300"
                        >
                          Details
                        </button>
                        <button
                          onClick={() => onOpenDeleteModal(res)}
                          disabled={isDeleting}
                          className="font-semibold text-red-400 hover:text-red-300 disabled:text-gray-500"
                        >
                          Delete
                        </button>
                      </div>
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
