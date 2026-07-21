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

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { ReasoningEngine, Config, Agent, CloudRunService, Page } from "../types";
import * as api from "../services/apiService";
import Spinner from "../components/Spinner";
import ConfirmationModal from "../components/ConfirmationModal";
import EngineDetails from "../components/agent-engines/EngineDetails";
import McpServerDetails from "../components/mcp-servers/McpServerDetails";
import CloudRunQueryModal from "../components/agent-engines/CloudRunQueryModal";
import AgentCardModal from "../components/agent-engines/AgentCardModal";
import CloudConsoleButton from "../components/CloudConsoleButton";

interface AgentEnginesPageProps {
  projectNumber: string;
  accessToken: string;
  onDirectQuery: (engine: ReasoningEngine) => void;
  onNavigate?: (page: Page, context?: any) => void;
}

type ResourceType =
  | "Agent Engine"
  | "Cloud Run (A2A)"
  | "Cloud Run (Agent)"
  | "Cloud Run Service";

interface UnifiedResource {
  id: string; // Full resource name
  shortId: string;
  displayName: string;
  type: ResourceType;
  location: string;
  data: ReasoningEngine | CloudRunService;
  sessionCount?: number; // Only for Agent Engine
  uri?: string; // Only for Cloud Run
}

const analyzeCloudRunService = (
  service: CloudRunService,
): { isA2a: boolean; isAgent: boolean; displayName: string } => {
  const envVars = service.template?.containers?.[0]?.env || [];
  const getEnv = (name: string) => envVars.find((e) => e.name === name)?.value;

  const agentName = getEnv("AGENT_DISPLAY_NAME");
  const agentUrl = getEnv("AGENT_URL");
  const providerOrg = getEnv("PROVIDER_ORGANIZATION");

  const isA2a = !!(
    agentUrl ||
    providerOrg ||
    service.name.toLowerCase().includes("a2a")
  );
  const isAgent =
    isA2a || !!agentName || service.name.toLowerCase().includes("agent");

  const displayName =
    agentName || service.name.split("/").pop() || "Unknown Service";

  return { isA2a, isAgent, displayName };
};

const AgentEnginesPage: React.FC<AgentEnginesPageProps> = ({
  projectNumber,
  accessToken,
  onDirectQuery,
  onNavigate,
}) => {
  const [resources, setResources] = useState<UnifiedResource[]>([]);
  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionWarnings, setPermissionWarnings] = useState<string[]>([]);
  const [location, setLocation] = useState("us-central1");

  // State for view management
  const [viewMode, setViewMode] = useState<"list" | "details">("list");
  const [selectedResource, setSelectedResource] =
    useState<UnifiedResource | null>(null);

  type SortColumn = "displayName" | "type" | "shortId" | "usedByAgents" | null;
  type SortDirection = "asc" | "desc";
  const [sortColumn, setSortColumn] = useState<SortColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // State for multi-select and delete confirmation
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // State for clearing sessions (RE only)
  const [engineToClearSessions, setEngineToClearSessions] =
    useState<ReasoningEngine | null>(null);
  const [isClearingSessions, setIsClearingSessions] = useState(false);

  // State for Queries
  const [cloudRunQueryService, setCloudRunQueryService] =
    useState<CloudRunService | null>(null);

  // State for Agent Card Modal
  const [agentCardEngine, setAgentCardEngine] =
    useState<ReasoningEngine | null>(null);

  const apiConfig: Omit<Config, "accessToken"> = useMemo(
    () => ({
      projectId: projectNumber,
      reasoningEngineLocation: location,
      appLocation: "global",
      collectionId: "default_collection",
      appId: "",
      assistantId: "default_assistant",
    }),
    [projectNumber, location],
  );

  const agentsByResource = useMemo(() => {
    if (!allAgents.length) return {};

    return allAgents.reduce(
      (acc, agent) => {
        const reName =
          agent.adkAgentDefinition?.provisionedReasoningEngine?.reasoningEngine;
        if (reName) {
          if (!acc[reName]) acc[reName] = [];
          acc[reName].push(agent);
        }

        if (agent.a2aAgentDefinition?.jsonAgentCard) {
          try {
            const card = JSON.parse(agent.a2aAgentDefinition.jsonAgentCard);
            const agentUrl = card.url;
            if (agentUrl) {
              // 1. Try to match as a Cloud Run A2A URL (URI prefix match)
              let matchingResource = resources.find(
                (r) => r.uri && agentUrl.startsWith(r.uri),
              );

              // 2. Try to match as a Reasoning Engine A2A URL (path matching)
              if (!matchingResource && agentUrl.includes("/reasoningEngines/")) {
                const parts = agentUrl.split("/reasoningEngines/");
                if (parts.length > 1) {
                  const engineId = parts[1].split("/")[0];
                  matchingResource = resources.find(
                    (r) => r.type === "Agent Engine" && r.id.endsWith(`/reasoningEngines/${engineId}`),
                  );
                }
              }

              if (matchingResource) {
                if (!acc[matchingResource.id]) acc[matchingResource.id] = [];
                acc[matchingResource.id].push(agent);
              }
            }
          } catch (e) {}
        }
        return acc;
      },
      {} as { [key: string]: Agent[] },
    );
  }, [allAgents, resources]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const sortedResources = useMemo(() => {
    if (!sortColumn) return resources;

    return [...resources].sort((a, b) => {
      let valA: any = a[sortColumn as keyof UnifiedResource];
      let valB: any = b[sortColumn as keyof UnifiedResource];

      if (sortColumn === "usedByAgents") {
        valA = (agentsByResource[a.id] || []).length;
        valB = (agentsByResource[b.id] || []).length;
      }

      if (typeof valA === "string" && typeof valB === "string") {
        return sortDirection === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }

      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [resources, sortColumn, sortDirection, agentsByResource]);

  const fetchResources = useCallback(async () => {
    if (!projectNumber || !location) {
      setResources([]);
      setError(
        "Project ID/Number and Location are required to list resources.",
      );
      return;
    }
    setIsLoading(true);
    setError(null);
    setPermissionWarnings([]);
    setResources([]);
    setAllAgents([]);
    setSelectedIds(new Set());

    try {
      const unifiedList: UnifiedResource[] = [];
      const errors: string[] = [];

      try {
        const reResponse = await api.listReasoningEngines(apiConfig);
        const engines = reResponse.reasoningEngines || [];

        if (engines.length > 0) {
          const sessionPromises = engines.map((engine) =>
            api
              .listReasoningEngineSessions(engine.name, apiConfig)
              .then((res) => ({
                name: engine.name,
                count: res.sessions?.length || 0,
              }))
              .catch(() => ({ name: engine.name, count: undefined })),
          );
          const sessionCounts = await Promise.all(sessionPromises);
          const countMap = new Map(sessionCounts.map((s) => [s.name, s.count]));

          engines.forEach((engine) => {
            unifiedList.push({
              id: engine.name,
              shortId: engine.name.split("/").pop()!,
              displayName: engine.displayName,
              type: "Agent Engine",
              location: location,
              data: engine,
              sessionCount: countMap.get(engine.name),
            });
          });
        }
      } catch (e: any) {
        errors.push(`Agent Engines: ${e.message}`);
      }

      try {
        const crResponse = await api.listCloudRunServices(apiConfig, location);
        const services = crResponse.services || [];
        services.forEach((service) => {
          const analysis = analyzeCloudRunService(service);
          if (!analysis.isA2a) return;
          unifiedList.push({
            id: service.name,
            shortId: service.name.split("/").pop()!,
            displayName: analysis.displayName,
            type: "Cloud Run (A2A)",
            location: location,
            data: service,
            uri: service.uri,
          });
        });
      } catch (e: any) {
        console.warn("Cloud Run fetch failed", e);
      }

      setResources(unifiedList);
      if (errors.length > 0) setError(errors.join(" | "));

      try {
        const agentsList: Agent[] = [];
        const discoveryLocations = ["global", "us", "eu"];
        await Promise.all(
          discoveryLocations.map(async (loc) => {
            const locConfig = { ...apiConfig, appLocation: loc };
            try {
              const collections =
                (await api.listResources("collections", locConfig))
                  .collections || [];
              for (const col of collections) {
                const colConfig = {
                  ...locConfig,
                  collectionId: col.name.split("/").pop()!,
                };
                try {
                  const engines =
                    (await api.listResources("engines", colConfig)).engines ||
                    [];
                  for (const eng of engines) {
                    const engConfig = {
                      ...colConfig,
                      appId: eng.name.split("/").pop()!,
                    };
                    const assistants =
                      (await api.listResources("assistants", engConfig))
                        .assistants || [];
                    for (const ast of assistants) {
                      const astConfig = {
                        ...engConfig,
                        assistantId: ast.name.split("/").pop()!,
                      };
                      const res = await api.listResources("agents", astConfig);
                      if (res.agents) agentsList.push(...res.agents);
                    }
                  }
                } catch (e) {}
              }
            } catch (e) {}
          }),
        );
        setAllAgents(agentsList);
        sessionStorage.setItem(`engines_resources_${projectNumber}_${location}`, JSON.stringify(unifiedList));
        sessionStorage.setItem(`engines_agents_${projectNumber}_${location}`, JSON.stringify(agentsList));
      } catch (e) {
        console.warn("Failed to fetch usage data", e);
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch resources.");
    } finally {
      setIsLoading(false);
    }
  }, [apiConfig, location, projectNumber]);

  useEffect(() => {
    if (projectNumber) {
      const cachedResources = sessionStorage.getItem(`engines_resources_${projectNumber}_${location}`);
      const cachedAgents = sessionStorage.getItem(`engines_agents_${projectNumber}_${location}`);
      if (cachedResources && cachedAgents) {
        setResources(JSON.parse(cachedResources));
        setAllAgents(JSON.parse(cachedAgents));
      } else {
        fetchResources();
      }
    }
  }, [projectNumber, location, fetchResources]);

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.size === resources.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(resources.map((r) => r.id)));
  };

  const openDeleteModal = (resource?: UnifiedResource) => {
    if (resource) setSelectedIds(new Set([resource.id]));
    if (selectedIds.size > 0 || resource) setIsDeleteModalOpen(true);
  };

  const pollVertexOperation = async (operation: any) => {
    let currentOperation = operation;
    while (!currentOperation.done) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      currentOperation = await api.getVertexAiOperation(
        operation.name,
        apiConfig,
      );
    }
    if (currentOperation.error) {
      throw new Error(`Operation failed: ${currentOperation.error.message}`);
    }
    return currentOperation.response;
  };

  const confirmDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);
    setError(null);

    const resourcesToDelete = resources.filter((r) => selectedIds.has(r.id));

    const results = await Promise.allSettled(
      resourcesToDelete.map(async (res) => {
        if (res.type === "Agent Engine") {
          try {
            const sessionRes = await api.listReasoningEngineSessions(
              res.id,
              apiConfig,
            );
            const sessions = sessionRes.sessions || [];
            if (sessions.length > 0) {
              await Promise.allSettled(
                sessions.map((s) =>
                  api.deleteReasoningEngineSession(s.name, apiConfig),
                ),
              );
            }
          } catch (sessionErr) {
            console.warn(
              `Could not clear sessions for ${res.shortId}, force delete will proceed.`,
              sessionErr,
            );
          }

          const op = await api.deleteReasoningEngine(res.id, apiConfig);
          return pollVertexOperation(op);
        } else {
          return api.deleteCloudRunService(res.id, apiConfig);
        }
      }),
    );

    const failures: string[] = [];
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const resName = resourcesToDelete[index].shortId;
        const reason =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        failures.push(`- ${resName}: ${reason}`);
      }
    });

    if (failures.length > 0) {
      setError(`Failed to delete some resources:\n${failures.join("\n")}`);
    }

    setSelectedIds(new Set());
    setIsDeleting(false);
    setIsDeleteModalOpen(false);
    await fetchResources();
  };

  const handleViewResource = (resource: UnifiedResource) => {
    setSelectedResource(resource);
    setViewMode("details");
  };

  const handleConfirmClearSessions = async () => {
    if (!engineToClearSessions) return;
    setIsClearingSessions(true);
    try {
      const sessions =
        (
          await api.listReasoningEngineSessions(
            engineToClearSessions.name,
            apiConfig,
          )
        ).sessions || [];
      await Promise.all(
        sessions.map((s) =>
          api.deleteReasoningEngineSession(s.name, apiConfig),
        ),
      );
    } catch (err: any) {
      setError(`Failed to clear sessions: ${err.message}`);
    } finally {
      setIsClearingSessions(false);
      setEngineToClearSessions(null);
      fetchResources();
    }
  };

  const renderContent = () => {
    if (isLoading && viewMode === "list") return <Spinner />;

    if (viewMode === "details" && selectedResource) {
      if (selectedResource.type === "Agent Engine") {
        return (
          <EngineDetails
            engine={selectedResource.data as ReasoningEngine}
            usingAgents={agentsByResource[selectedResource.id] || []}
            onBack={() => {
              setViewMode("list");
              setSelectedResource(null);
            }}
            config={apiConfig}
          />
        );
      } else {
        return (
          <McpServerDetails
            service={selectedResource.data as CloudRunService}
            config={apiConfig}
            onBack={() => {
              setViewMode("list");
              setSelectedResource(null);
            }}
          />
        );
      }
    }

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
                  onClick={() => openDeleteModal()}
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
                      onChange={handleToggleSelectAll}
                      className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600"
                    />
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600/50 transition-colors"
                    onClick={() => handleSort("displayName")}
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
                    onClick={() => handleSort("type")}
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
                    onClick={() => handleSort("shortId")}
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
                    onClick={() => handleSort("usedByAgents")}
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
                {sortedResources.map((res) => {
                  const isSelected = selectedIds.has(res.id);
                  const usingAgents = agentsByResource[res.id] || [];
                  const isRE = res.type === "Agent Engine";
                  let badgeClass = isRE
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
                          onChange={() => handleToggleSelect(res.id)}
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
                                -{' '}
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
                                    setEngineToClearSessions(
                                      res.data as ReasoningEngine,
                                    )
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
                                  setAgentCardEngine(
                                    res.data as ReasoningEngine,
                                  )
                                }
                                className="font-semibold text-indigo-400 hover:text-indigo-300"
                              >
                                Agent Card
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() =>
                                setCloudRunQueryService(
                                  res.data as CloudRunService,
                                )
                              }
                              className="font-semibold text-green-400 hover:text-green-300"
                            >
                              Direct Query
                            </button>
                          )}
                          <button
                            onClick={() => handleViewResource(res)}
                            className="font-semibold text-blue-400 hover:text-blue-300"
                          >
                            Details
                          </button>
                          <button
                            onClick={() => openDeleteModal(res)}
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

  return (
    <div>
      <div className="bg-gray-800 p-4 rounded-lg mb-6 shadow-md">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-semibold text-white">Configuration</h2>
          <CloudConsoleButton
            url={`https://console.cloud.google.com/vertex-ai/agents/agent-engines?project=${projectNumber}`}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Project ID / Number
            </label>
            <div className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-300 font-mono h-[38px] flex items-center">
              {projectNumber || (
                <span className="text-gray-500 italic">Not set</span>
              )}
            </div>
          </div>
          <div>
            <label
              htmlFor="location"
              className="block text-sm font-medium text-gray-400 mb-1"
            >
              GCP Location
            </label>
            <select
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full"
            >
              <option value="us-central1">us-central1</option>
              <option value="us-east1">us-east1</option>
              <option value="us-east4">us-east4</option>
              <option value="us-west1">us-west1</option>
              <option value="europe-west1">europe-west1</option>
              <option value="europe-west2">europe-west2</option>
              <option value="europe-west4">europe-west4</option>
              <option value="asia-east1">asia-east1</option>
              <option value="asia-southeast1">asia-southeast1</option>
            </select>
          </div>
        </div>
        {viewMode === "list" && (
          <button
            onClick={fetchResources}
            disabled={isLoading}
            className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500"
          >
            {isLoading ? "Loading..." : "Refresh Resources"}
          </button>
        )}
      </div>
      {renderContent()}

      {isDeleteModalOpen && (
        <ConfirmationModal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          onConfirm={confirmDelete}
          title={`Confirm Deletion of ${selectedIds.size} Resource(s)`}
          confirmText="Delete"
          isConfirming={isDeleting}
        >
          <p>
            Are you sure you want to permanently delete the following resources?
          </p>
          <ul className="mt-2 p-3 bg-gray-700/50 rounded-md border border-gray-600 max-h-48 overflow-y-auto space-y-1">
            {Array.from(selectedIds).map((id) => {
              const res = resources.find((r) => r.id === id);
              return (
                <li key={id} className="text-sm">
                  <p className="font-bold text-white">
                    {res?.displayName || "Unknown Resource"}
                  </p>
                  <p className="text-xs font-mono text-gray-400 mt-1">
                    {String(id).split("/").pop()}
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-sm text-yellow-300">
            This action cannot be undone. Active sessions (direct queries) will
            be automatically terminated before deletion.
          </p>
        </ConfirmationModal>
      )}

      {engineToClearSessions && (
        <ConfirmationModal
          isOpen={!!engineToClearSessions}
          onClose={() => setEngineToClearSessions(null)}
          onConfirm={handleConfirmClearSessions}
          title={`Terminate Sessions`}
          confirmText={isClearingSessions ? "Terminating..." : "Terminate All"}
          isConfirming={isClearingSessions}
        >
          <p>
            Are you sure you want to terminate active sessions for{" "}
            <strong>{engineToClearSessions.displayName}</strong>?
          </p>
        </ConfirmationModal>
      )}

      {cloudRunQueryService && (
        <CloudRunQueryModal
          isOpen={!!cloudRunQueryService}
          onClose={() => setCloudRunQueryService(null)}
          service={cloudRunQueryService}
          accessToken={accessToken}
        />
      )}

      {agentCardEngine && (
        <AgentCardModal
          isOpen={!!agentCardEngine}
          onClose={() => setAgentCardEngine(null)}
          engineName={agentCardEngine.name}
          engineDisplayName={agentCardEngine.displayName}
          config={apiConfig}
        />
      )}
    </div>
  );
};

export default AgentEnginesPage;
