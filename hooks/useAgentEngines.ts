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

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { ReasoningEngine, Config, Agent, CloudRunService } from "../types";
import * as api from "../services/apiService";
import {
  DEFAULT_BACKGROUND_CONCURRENCY,
  getOrLoadProjectAgentsUsage,
  invalidateProjectAgentsUsageCache,
  mapWithQuotaLimit,
} from "../utils/quotaGuard";

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
  const [isLoadingSessionCounts, setIsLoadingSessionCounts] = useState(false);

  const backgroundAbortRef = useRef<AbortController | null>(null);
  const sessionAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      backgroundAbortRef.current?.abort();
      sessionAbortRef.current?.abort();
    };
  }, []);

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
          const suffixMatch = reName.match(/\/locations\/[^/]+\/reasoningEngines\/[^/]+$/);
          const reSuffix = suffixMatch ? suffixMatch[0] : null;
          const matchingResource = resources.find(
            (r) =>
              r.type === "Agent Engine" &&
              (r.id === reName || (reSuffix !== null && r.id.endsWith(reSuffix))),
          );
          const key = matchingResource ? matchingResource.id : reName;
          if (!acc[key]) acc[key] = [];
          acc[key].push(agent);
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

  const fetchAllReasoningEnginesSafe = useCallback(async (): Promise<{
    reasoningEngines: ReasoningEngine[];
  }> => {
    const isAllMocked = Boolean(
      (api.listAllReasoningEngines as unknown as { mock?: unknown })?.mock,
    );
    const isSingleMocked = Boolean(
      (api.listReasoningEngines as unknown as { mock?: unknown })?.mock,
    );
    if (
      typeof api.listAllReasoningEngines === "function" &&
      (isAllMocked || !isSingleMocked)
    ) {
      const all = await api.listAllReasoningEngines(apiConfig);
      return { reasoningEngines: all || [] };
    }
    const collected: ReasoningEngine[] = [];
    let pageToken: string | undefined;
    let guard = 0;
    do {
      const res = pageToken
        ? await api.listReasoningEngines(apiConfig, pageToken)
        : await api.listReasoningEngines(apiConfig);
      if (res?.reasoningEngines) {
        collected.push(...res.reasoningEngines);
      }
      pageToken = res?.nextPageToken;
    } while (pageToken && ++guard < 50);
    return { reasoningEngines: collected };
  }, [apiConfig]);

  const fetchAllReasoningEngineSessionsSafe = useCallback(
    async (engineName: string): Promise<{ name: string }[]> => {
      const isAllMocked = Boolean(
        (api.listAllReasoningEngineSessions as unknown as { mock?: unknown })
          ?.mock,
      );
      const isSingleMocked = Boolean(
        (api.listReasoningEngineSessions as unknown as { mock?: unknown })
          ?.mock,
      );
      if (
        typeof api.listAllReasoningEngineSessions === "function" &&
        (isAllMocked || !isSingleMocked)
      ) {
        const all = await api.listAllReasoningEngineSessions(
          engineName,
          apiConfig,
        );
        return all || [];
      }
      const collected: { name: string }[] = [];
      let pageToken: string | undefined;
      let guard = 0;
      do {
        const res = pageToken
          ? await api.listReasoningEngineSessions(
              engineName,
              apiConfig,
              pageToken,
            )
          : await api.listReasoningEngineSessions(engineName, apiConfig);
        if (res?.sessions) {
          collected.push(...res.sessions);
        }
        pageToken = res?.nextPageToken;
      } while (pageToken && ++guard < 50);
      return collected;
    },
    [apiConfig],
  );

  const fetchResources = useCallback(
    async (options?: { forceRefresh?: boolean }) => {
      backgroundAbortRef.current?.abort();
      sessionAbortRef.current?.abort();

      if (!projectNumber || !location) {
        setResources([]);
        setError("Project ID/Number and Location are required to list resources.");
        return;
      }

      const abortController = new AbortController();
      backgroundAbortRef.current = abortController;

      setIsLoading(true);
      setError(null);
      setPermissionWarnings([]);
      setResources([]);
      setAllAgents([]);
      setSelectedIds(new Set());

      try {
        const unifiedList: UnifiedResource[] = [];
        const errors: string[] = [];

        // Phase 1: Fetch Reasoning Engines (paginated across all pages) and Cloud Run services in parallel
        // Session counts are intentionally NOT fetched eagerly per-engine on mount to avoid N+1 Vertex AI quota bursts.
        const [reSettled, crSettled] = await Promise.allSettled([
          fetchAllReasoningEnginesSafe(),
          api.listCloudRunServices(apiConfig, location),
        ]);

        if (abortController.signal.aborted) return;

        if (reSettled.status === "fulfilled") {
          const engines = reSettled.value.reasoningEngines || [];
          engines.forEach((engine) => {
            unifiedList.push({
              id: engine.name,
              shortId: engine.name.split("/").pop()!,
              displayName: engine.displayName,
              type: "Agent Engine",
              location: location,
              data: engine,
              sessionCount: undefined,
            });
          });
        } else {
          const reason = reSettled.reason;
          errors.push(
            `Agent Engines: ${reason instanceof Error ? reason.message : String(reason)}`,
          );
        }

        if (crSettled.status === "fulfilled") {
          const services = crSettled.value.services || [];
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
        } else {
          console.warn("Cloud Run fetch failed", crSettled.reason);
        }

        setResources(unifiedList);
        if (errors.length > 0) setError(errors.join(" | "));
        setIsLoading(false);

        // Phase 2: Non-blocking, cached, quota-throttled "Used By Agents" lookup across default_collection only
        // (Gemini Enterprise engines live exclusively in default_collection; skipping DataConnector collections eliminates dozens of wasted RPCs.)
        void getOrLoadProjectAgentsUsage(
          projectNumber,
          async () => {
            const agentsList: Agent[] = [];
            const warnings: string[] = [];
            const discoveryLocations = ["global", "us", "eu"];

            const enginesByLoc: Array<{ loc: string; appId: string }> = [];
            await mapWithQuotaLimit(
              discoveryLocations,
              DEFAULT_BACKGROUND_CONCURRENCY,
              async (loc) => {
                const locConfig = {
                  ...apiConfig,
                  appLocation: loc,
                  collectionId: "default_collection",
                };
                try {
                  const engines =
                    (await api.listResources("engines", locConfig))?.engines || [];
                  for (const eng of engines) {
                    const appId = eng.name.split("/").pop();
                    if (appId) enginesByLoc.push({ loc, appId });
                  }
                } catch (e: unknown) {
                  const errMsg = e instanceof Error ? e.message : String(e);
                  warnings.push(
                    `Could not list Discovery Engine apps in "${loc}": ${errMsg}. "Used By" status may be incomplete.`,
                  );
                }
              },
              { signal: abortController.signal },
            );

            if (abortController.signal.aborted) {
              return { agents: agentsList, warnings };
            }

            await mapWithQuotaLimit(
              enginesByLoc,
              DEFAULT_BACKGROUND_CONCURRENCY,
              async ({ loc, appId }) => {
                const engConfig = {
                  ...apiConfig,
                  appLocation: loc,
                  collectionId: "default_collection",
                  appId,
                };
                try {
                  const assistants =
                    (await api.listResources("assistants", engConfig))?.assistants || [];
                  for (const ast of assistants) {
                    if (abortController.signal.aborted) return;
                    const astConfig = {
                      ...engConfig,
                      assistantId: ast.name.split("/").pop()!,
                    };
                    const res = await api.listResources("agents", astConfig);
                    if (res?.agents) agentsList.push(...res.agents);
                  }
                } catch (e: unknown) {
                  const errMsg = e instanceof Error ? e.message : String(e);
                  warnings.push(
                    `Could not enumerate agents for engine "${appId}" (${loc}): ${errMsg}. "Used By" status may be incomplete.`,
                  );
                }
              },
              { signal: abortController.signal },
            );

            return { agents: agentsList, warnings };
          },
          { forceRefresh: options?.forceRefresh },
        )
        .then((snapshot) => {
          if (abortController.signal.aborted) return;
          setAllAgents(snapshot.agents);
          if (snapshot.warnings.length > 0) {
            setPermissionWarnings(snapshot.warnings);
          }
        })
        .catch((e: unknown) => {
          if (abortController.signal.aborted) return;
          const errMsg = e instanceof Error ? e.message : String(e);
          setPermissionWarnings([
            `Failed to fetch agent usage data: ${errMsg}`,
          ]);
        });
      } catch (err: unknown) {
        if (!abortController.signal.aborted) {
          setError(err instanceof Error ? err.message : "Failed to fetch resources.");
          setIsLoading(false);
        }
      }
    },
    [apiConfig, fetchAllReasoningEnginesSafe, location, projectNumber],
  );

  const loadSessionCounts = useCallback(async () => {
    const agentEngines = resources.filter((r) => r.type === "Agent Engine");
    if (agentEngines.length === 0) return;

    sessionAbortRef.current?.abort();
    const controller = new AbortController();
    sessionAbortRef.current = controller;
    setIsLoadingSessionCounts(true);

    try {
      const { outcomes, shortCircuited } = await mapWithQuotaLimit(
        agentEngines,
        DEFAULT_BACKGROUND_CONCURRENCY,
        async (res) => {
          const sessions = await fetchAllReasoningEngineSessionsSafe(res.id);
          return {
            id: res.id,
            count: sessions.length,
          };
        },
        { signal: controller.signal },
      );

      if (controller.signal.aborted) return;

      const countMap = new Map<string, number>();
      outcomes.forEach((outcome) => {
        if (outcome.status === "fulfilled" && outcome.value) {
          countMap.set(outcome.value.id, outcome.value.count);
        }
      });

      if (countMap.size > 0) {
        setResources((prev) =>
          prev.map((r) =>
            countMap.has(r.id) ? { ...r, sessionCount: countMap.get(r.id) } : r,
          ),
        );
      }
      if (shortCircuited) {
        setPermissionWarnings((prev) => [
          ...prev,
          "Paused remaining session count lookups because Vertex AI returned a quota/rate-limit (429) or auth error.",
        ]);
      }
    } finally {
      if (sessionAbortRef.current === controller) {
        setIsLoadingSessionCounts(false);
      }
    }
  }, [fetchAllReasoningEngineSessionsSafe, resources]);

  useEffect(() => {
    if (projectNumber) {
      void fetchResources();
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
            const sessions = await fetchAllReasoningEngineSessionsSafe(res.id);
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
    invalidateProjectAgentsUsageCache(projectNumber);
    await fetchResources({ forceRefresh: true });
  };

  const handleConfirmClearSessions = async () => {
    if (!engineToClearSessions) return;
    setIsClearingSessions(true);
    try {
      const sessions = await fetchAllReasoningEngineSessionsSafe(
        engineToClearSessions.name,
      );

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
    isLoadingSessionCounts,
    loadSessionCounts,
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
