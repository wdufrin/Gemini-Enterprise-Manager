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

import React, { useMemo, useState } from "react";
import { ReasoningEngine, Agent, CloudRunService, Page } from "../../types";
import { UnifiedResource, SortColumn, SortDirection } from "../../hooks/useAgentEngines";
import { SegmentedControl } from "../common/Tabs";

export type RuntimeTypeFilter = "all" | "agent-engine" | "cloud-run";

const SortArrow: React.FC<{ direction: SortDirection }> = ({ direction }) => {
  const path =
    direction === "asc"
      ? "M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
      : "M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4 shrink-0"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path fillRule="evenodd" d={path} clipRule="evenodd" />
    </svg>
  );
};

const SortableHeader: React.FC<{
  label: string;
  column: Exclude<SortColumn, null>;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
  className?: string;
}> = ({
  label,
  column,
  sortColumn,
  sortDirection,
  onSort,
  className = "",
}) => {
  const isSorted = sortColumn === column;
  const sortAria = isSorted
    ? sortDirection === "asc"
      ? "ascending"
      : "descending"
    : "none";
  return (
    <th
      scope="col"
      aria-sort={sortAria}
      className={`px-3 xl:px-5 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider whitespace-nowrap ${className}`.trim()}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        aria-label={`Sort by ${label}, currently ${
          isSorted
            ? sortDirection === "asc"
              ? "ascending"
              : "descending"
            : "unsorted"
        }`}
        className="flex items-center gap-1 group text-inherit uppercase font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded p-0.5 transition-colors hover:text-white"
      >
        <span>{label}</span>
        <span
          className={`text-gray-400 ${
            isSorted ? "opacity-100" : "opacity-0 group-hover:opacity-50"
          }`}
          aria-hidden="true"
        >
          <SortArrow direction={isSorted ? sortDirection : "asc"} />
        </span>
      </button>
    </th>
  );
};

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
  const [searchQuery, setSearchQuery] = useState("");
  const [runtimeFilter, setRuntimeFilter] = useState<RuntimeTypeFilter>("all");

  const counts = useMemo(() => {
    let agentEngines = 0;
    let cloudRun = 0;
    for (const r of resources) {
      if (r.type === "Agent Engine") agentEngines += 1;
      else cloudRun += 1;
    }
    return {
      all: resources.length,
      agentEngines,
      cloudRun,
    };
  }, [resources]);

  const filteredResources = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return resources.filter((res) => {
      if (runtimeFilter === "agent-engine" && res.type !== "Agent Engine") {
        return false;
      }
      if (runtimeFilter === "cloud-run" && res.type === "Agent Engine") {
        return false;
      }
      if (!q) return true;
      const usingAgents = agentsByResource[res.id] || [];
      return (
        res.displayName.toLowerCase().includes(q) ||
        res.shortId.toLowerCase().includes(q) ||
        res.type.toLowerCase().includes(q) ||
        usingAgents.some((a) =>
          (a.displayName || "").toLowerCase().includes(q),
        )
      );
    });
  }, [resources, runtimeFilter, searchQuery, agentsByResource]);

  const isAllSelected =
    filteredResources.length > 0 &&
    filteredResources.every((r) => selectedIds.has(r.id));

  return (
    <div className="bg-gray-900/90 border border-gray-800 shadow-xl rounded-xl overflow-hidden">
      <div className="p-4 border-b border-gray-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-lg sm:text-xl font-bold text-white">
            Available Runtimes
          </h2>
          <span className="px-2 py-0.5 text-xs font-mono rounded-full bg-gray-800 border border-gray-700 text-gray-300">
            {filteredResources.length}/{resources.length}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {resources.length > 0 && (
            <>
              <div className="relative w-full sm:w-64">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter runtimes by name or ID..."
                  aria-label="Search agent runtimes"
                  className="w-full h-9 bg-gray-950/90 border border-gray-700/90 rounded-lg pl-8 pr-7 text-xs sm:text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <svg
                  className="w-4 h-4 text-gray-500 absolute left-2.5 top-2.5 pointer-events-none"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear runtime search"
                    className="absolute right-2 top-2 text-gray-400 hover:text-white text-xs"
                  >
                    ×
                  </button>
                )}
              </div>

              <SegmentedControl
                size="xs"
                ariaLabel="Filter by runtime type"
                value={runtimeFilter}
                onChange={setRuntimeFilter}
                items={[
                  { id: "all", label: "All", count: counts.all },
                  {
                    id: "agent-engine",
                    label: "Agent Engine",
                    count: counts.agentEngines,
                  },
                  {
                    id: "cloud-run",
                    label: "Cloud Run",
                    count: counts.cloudRun,
                  },
                ]}
              />
            </>
          )}

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2.5 border-l border-gray-700 pl-3">
              <span className="text-xs sm:text-sm text-gray-300 whitespace-nowrap">
                {selectedIds.size} selected
              </span>
              <button
                type="button"
                onClick={() => onOpenDeleteModal()}
                disabled={isDeleting}
                className="px-3.5 h-9 bg-red-600 text-white text-xs sm:text-sm font-semibold rounded-lg hover:bg-red-700 disabled:bg-red-800 transition-colors"
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
      {resources.length > 0 && filteredResources.length === 0 && (
        <div className="p-8 text-center space-y-2.5">
          <p className="text-sm text-gray-400">
            No runtimes match your current search or runtime type filter.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setRuntimeFilter("all");
            }}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs font-semibold text-white rounded-lg transition-colors"
          >
            Clear Filters
          </button>
        </div>
      )}
      {filteredResources.length > 0 && (
        <div className="gem-table-container" role="region" aria-label="Agent engines table" tabIndex={0}>
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-700/50">
              <tr>
                <th scope="col" className="px-3 xl:px-5 py-3 w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all runtimes"
                    checked={isAllSelected}
                    onChange={onToggleSelectAll}
                    className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600"
                  />
                </th>
                <SortableHeader
                  label="Display Name"
                  column="displayName"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={onSort}
                />
                <SortableHeader
                  label="Type"
                  column="type"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={onSort}
                />
                <SortableHeader
                  label="Resource ID"
                  column="shortId"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={onSort}
                  className="gem-col-xl"
                />
                <SortableHeader
                  label="Used By Agents"
                  column="usedByAgents"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={onSort}
                  className="gem-col-lg"
                />
                <th
                  scope="col"
                  className="gem-sticky-action-th px-3 xl:px-5 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider whitespace-nowrap"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {filteredResources.map((res) => {
                const isSelected = selectedIds.has(res.id);
                const usingAgents = agentsByResource[res.id] || [];
                const isRE = res.type === "Agent Engine";
                const badgeClass = isRE
                  ? "bg-purple-900 text-purple-200"
                  : "bg-teal-900 text-teal-200";

                return (
                  <tr
                    key={res.id}
                    className={`${isSelected ? "bg-blue-900/50 gem-row-selected" : "hover:bg-gray-700/50"} transition-colors`}
                  >
                    <td className="px-3 xl:px-5 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(res.id)}
                        className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600"
                      />
                    </td>
                    <td className="px-3 xl:px-5 py-3 whitespace-nowrap text-sm font-medium text-white">
                      <button
                        type="button"
                        onClick={() => onViewResource(res)}
                        className="text-left hover:text-blue-400 transition-colors block max-w-[190px] xl:max-w-[280px] truncate"
                        title={res.displayName}
                      >
                        {res.displayName}
                      </button>
                      <div className="gem-hide-xl text-[11px] text-gray-400 font-mono truncate max-w-[190px] mt-0.5" title={res.shortId}>
                        {res.shortId}
                      </div>
                    </td>
                    <td className="px-3 xl:px-5 py-3 whitespace-nowrap text-sm">
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${badgeClass}`}
                      >
                        {res.type}
                      </span>
                    </td>
                    <td className="gem-col-xl px-3 xl:px-5 py-3 whitespace-nowrap text-xs xl:text-sm text-gray-400 font-mono max-w-[180px] truncate" title={res.shortId}>
                      {res.shortId}
                    </td>
                    <td className="gem-col-lg px-3 xl:px-5 py-3 whitespace-nowrap text-sm text-gray-300">
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
                    <td className="gem-sticky-action-td px-3 xl:px-5 py-3 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end items-center gap-2.5 xl:gap-4">
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
                              className="font-semibold text-green-400 hover:text-green-300 text-xs xl:text-sm"
                            >
                              Direct Query
                            </button>
                            <button
                              onClick={() =>
                                onAgentCard(res.data as ReasoningEngine)
                              }
                              className="font-semibold text-indigo-400 hover:text-indigo-300 text-xs xl:text-sm"
                            >
                              Agent Card
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() =>
                              onCloudRunQuery(res.data as CloudRunService)
                            }
                            className="font-semibold text-green-400 hover:text-green-300 text-xs xl:text-sm"
                          >
                            Direct Query
                          </button>
                        )}
                        <button
                          onClick={() => onViewResource(res)}
                          className="font-semibold text-blue-400 hover:text-blue-300 text-xs xl:text-sm"
                        >
                          Details
                        </button>
                        <button
                          onClick={() => onOpenDeleteModal(res)}
                          disabled={isDeleting}
                          className="font-semibold text-red-400 hover:text-red-300 disabled:text-gray-500 text-xs xl:text-sm"
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
