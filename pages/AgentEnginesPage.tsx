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

import React, { useCallback, useState } from "react";
import { ReasoningEngine, CloudRunService, Page } from "../types";
import EngineDetails from "../components/agent-engines/EngineDetails";
import McpServerDetails from "../components/mcp-servers/McpServerDetails";
import { PageShell } from "../components/layout/PageShell";
import { PageHeader } from "../components/layout/PageHeader";
import { ScopeBar, ScopeOption } from "../components/layout/ScopeBar";
import { useWorkspaceScope } from "../context/WorkspaceScopeContext";
import { useAgentEngines, UnifiedResource } from "../hooks/useAgentEngines";
import { AgentEnginesTable } from "../components/agent-engines/AgentEnginesTable";
import { AgentEnginesModals } from "../components/agent-engines/AgentEnginesModals";

const GCP_REGION_OPTIONS: ScopeOption[] = [
  { value: "us-central1", label: "us-central1" },
  { value: "us-east1", label: "us-east1" },
  { value: "us-east4", label: "us-east4" },
  { value: "us-south1", label: "us-south1" },
  { value: "us-west1", label: "us-west1" },
  { value: "northamerica-northeast1", label: "northamerica-northeast1" },
  { value: "europe-west1", label: "europe-west1" },
  { value: "europe-west2", label: "europe-west2" },
  { value: "europe-west3", label: "europe-west3" },
  { value: "europe-west4", label: "europe-west4" },
  { value: "asia-east1", label: "asia-east1" },
  { value: "asia-northeast1", label: "asia-northeast1" },
  { value: "asia-southeast1", label: "asia-southeast1" },
  { value: "australia-southeast1", label: "australia-southeast1" },
];

interface AgentEnginesPageProps {
  projectNumber: string;
  projectId?: string;
  accessToken: string;
  onDirectQuery: (engine: ReasoningEngine) => void;
  onNavigate?: (page: Page, context?: any) => void;
}

const AgentEnginesPage: React.FC<AgentEnginesPageProps> = ({
  projectNumber,
  projectId,
  accessToken,
  onDirectQuery,
  onNavigate,
}) => {
  const { gcpRegion: location, setGcpRegion: setLocation } = useWorkspaceScope();
  const [viewMode, setViewMode] = useState<"list" | "details">("list");
  const [selectedResource, setSelectedResource] =
    useState<UnifiedResource | null>(null);

  const [cloudRunQueryService, setCloudRunQueryService] =
    useState<CloudRunService | null>(null);
  const [agentCardEngine, setAgentCardEngine] =
    useState<ReasoningEngine | null>(null);

  const {
    resources,
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
  } = useAgentEngines(projectNumber, location);

  const handleViewResource = (resource: UnifiedResource) => {
    setSelectedResource(resource);
    setViewMode("details");
  };

  const renderContent = () => {
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
            title={selectedResource.type}
            onBack={() => {
              setViewMode("list");
              setSelectedResource(null);
            }}
          />
        );
      }
    }

    return (
      <AgentEnginesTable
        resources={sortedResources}
        selectedIds={selectedIds}
        isDeleting={isDeleting}
        agentsByResource={agentsByResource}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        permissionWarnings={permissionWarnings}
        error={error}
        isLoading={isLoading}
        isClearingSessions={isClearingSessions}
        engineToClearSessions={engineToClearSessions}
        onSort={handleSort}
        onToggleSelect={handleToggleSelect}
        onToggleSelectAll={handleToggleSelectAll}
        onOpenDeleteModal={openDeleteModal}
        onClearSessions={(engine) => setEngineToClearSessions(engine)}
        onDirectQuery={onDirectQuery}
        onAgentCard={(engine) => setAgentCardEngine(engine)}
        onCloudRunQuery={(service) => setCloudRunQueryService(service)}
        onViewResource={handleViewResource}
        onNavigate={onNavigate}
      />
    );
  };

  const handleRefresh = useCallback(() => {
    void fetchResources({ forceRefresh: true });
  }, [fetchResources]);

  const handleRegionChange = useCallback(
    (nextRegion: string) => {
      setLocation(nextRegion);
      setViewMode("list");
      setSelectedResource(null);
    },
    [setLocation],
  );

  return (
    <PageShell variant="wide">
      <PageHeader
        title="Agent Runtimes"
        subtitle="Manage Vertex AI Reasoning Engines, Cloud Run A2A services, and active runtime sessions."
        consolePage={Page.AGENT_ENGINES}
        projectId={projectId}
        projectNumber={projectNumber}
        onRefresh={viewMode === "list" ? handleRefresh : undefined}
        isRefreshing={isLoading}
        secondaryActions={
          viewMode === "list" &&
          resources.some((r) => r.type === "Agent Engine") ? (
            <button
              type="button"
              onClick={loadSessionCounts}
              disabled={isLoading || isLoadingSessionCounts}
              title="Queries active session counts across Agent Engines (throttled to protect Vertex AI project quotas)"
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs sm:text-sm font-medium text-gray-200 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <span>
                {isLoadingSessionCounts
                  ? "Loading Sessions..."
                  : "Load Session Counts"}
              </span>
            </button>
          ) : undefined
        }
      >
        <ScopeBar
          embedded
          locationLabel="GCP Region"
          locationId="gcpLocation"
          locationValue={location}
          onLocationChange={handleRegionChange}
          locationOptions={GCP_REGION_OPTIONS}
        />
      </PageHeader>

      {renderContent()}

      <AgentEnginesModals
        isDeleteModalOpen={isDeleteModalOpen}
        onCloseDeleteModal={() => setIsDeleteModalOpen(false)}
        onConfirmDelete={confirmDelete}
        selectedIds={selectedIds}
        resources={resources}
        agentsByResource={agentsByResource}
        isDeleting={isDeleting}
        engineToClearSessions={engineToClearSessions}
        onCloseClearSessions={() => setEngineToClearSessions(null)}
        onConfirmClearSessions={handleConfirmClearSessions}
        isClearingSessions={isClearingSessions}
        cloudRunQueryService={cloudRunQueryService}
        onCloseCloudRunQuery={() => setCloudRunQueryService(null)}
        accessToken={accessToken}
        agentCardEngine={agentCardEngine}
        onCloseAgentCard={() => setAgentCardEngine(null)}
        apiConfig={apiConfig}
      />
    </PageShell>
  );
};

export default AgentEnginesPage;
