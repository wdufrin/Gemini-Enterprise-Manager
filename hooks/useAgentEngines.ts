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

import { useState, useCallback, useMemo, useEffect } from "react";
import { ReasoningEngine, Config, Agent, CloudRunService } from "../types";
import * as api from "../services/apiService";

export type ResourceType =
  | "Agent Engine"
  | "Cloud Run (A2A)"
  | "Cloud Run (Agent)"
  | "Cloud Run Service";

export interface UnifiedResource {
  id: string;
  shortId: string;
  displayName: string;
  type: ResourceType;
  location: string;
  data: ReasoningEngine | CloudRunService;
  sessionCount?: number;
  uri?: string;
}

export type SortColumn = "displayName" | "type" | "shortId" | "usedByAgents" | null;
export type SortDirection = "asc" | "desc";

export const analyzeCloudRunService = (
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

export function useAgentEngines(projectNumber: string, location: string) {
  const [resources, setResources] = useState<UnifiedResource[]>([]);
  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionWarnings, setPermissionWarnings] = useState<string[]>([]);

  const [sortColumn, setSortColumn] = useState<SortColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const [engineToClearSessions, setEngineToClearSessions] =
    useState<ReasoningEngine | null>(null);
  const [isClearingSessions, setIsClearingSessions] = useState(false);

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
              let matchingResource = resources.find(
                (r) => r.uri && agentUrl.startsWith(r.uri),
              );

              if (!matchingResource && agentUrl.includes("/reasoningEngines/")) {
                const parts = agentUrl.split("/reasoningEngines/");
                if (parts.length > 1) {
                  const engineId = parts[1].split("/")[0];
                  matchingResource = resources.find(
                    (r) =>
                      r.type === "Agent Engine" &&
                      r.id.endsWith(`/reasoningEngines/${engineId}`),
                  );
                }
              }

              if (matchingResource) {
                if (!acc[matchingResource.id]) acc[matchingResource.id] = [];
                acc[matchingResource.id].push(agent);
              }
            }
          } catch (e) {
            console.warn(
              `[AgentEngines] Could not parse jsonAgentCard for agent ` +
                `"${agent.name ?? "(unnamed)"}"; it will not be grouped under a runtime.`,
              e,
            );
          }
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
      setError("Project ID/Number and Location are required to list resources.");
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
                } catch (e) {
                  console.warn(
                    `[AgentEngines] Failed to enumerate agents under collection ` +
                      `"${col.name}" in "${loc}". Agent list may be incomplete.`,
                    e,
                  );
                }
              }
            } catch (e) {
              console.warn(
                `[AgentEngines] Failed to list collections in location "${loc}". ` +
                  `Agent list may be incomplete.`,
                e,
              );
            }
          }),
        );
        setAllAgents(agentsList);
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
      fetchResources();
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

  const pollVertexOperation = async (
    operation: any,
    maxAttempts: number = 60,
  ) => {
    let currentOperation = operation;
    let attempts = 0;
    while (!currentOperation.done) {
      if (attempts++ >= maxAttempts) {
        throw new Error(
          `Operation timed out after ${maxAttempts * 5}s waiting for completion. It may still be running in Google Cloud: ${operation.name}`,
        );
      }
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

    setIsDeleting(false);
    setIsDeleteModalOpen(false);
    setSelectedIds(new Set());
    await fetchResources();
  };

  const handleConfirmClearSessions = async () => {
    if (!engineToClearSessions) return;
    setIsClearingSessions(true);
    try {
      const sessionRes = await api.listReasoningEngineSessions(
        engineToClearSessions.name,
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

      setResources((prev) =>
        prev.map((r) =>
          r.id === engineToClearSessions.name ? { ...r, sessionCount: 0 } : r,
        ),
      );
      setEngineToClearSessions(null);
    } catch (e: any) {
      setError(`Failed to clear sessions: ${e.message}`);
    } finally {
      setIsClearingSessions(false);
    }
  };

  return {
    resources,
    allAgents,
    isLoading,
    error,
    permissionWarnings,
    selectedIds,
    isDeleting,
    isDeleteModalOpen,
    setIsDeleteModalOpen,
    engineToClearSessions,
    setEngineToClearSessions,
    isClearingSessions,
    sortColumn,
    sortDirection,
    apiConfig,
    agentsByResource,
    sortedResources,
    fetchResources,
    handleSort,
    handleToggleSelect,
    handleToggleSelectAll,
    openDeleteModal,
    confirmDelete,
    handleConfirmClearSessions,
  };
}
