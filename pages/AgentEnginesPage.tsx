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

import React, { useState } from "react";
import { ReasoningEngine, CloudRunService, Page } from "../types";
import EngineDetails from "../components/agent-engines/EngineDetails";
import McpServerDetails from "../components/mcp-servers/McpServerDetails";
import CloudConsoleButton from "../components/CloudConsoleButton";
import { useAgentEngines, UnifiedResource } from "../hooks/useAgentEngines";
import { AgentEnginesTable } from "../components/agent-engines/AgentEnginesTable";
import { AgentEnginesModals } from "../components/agent-engines/AgentEnginesModals";

interface AgentEnginesPageProps {
  projectNumber: string;
  accessToken: string;
  onDirectQuery: (engine: ReasoningEngine) => void;
  onNavigate?: (page: Page, context?: any) => void;
}

const AgentEnginesPage: React.FC<AgentEnginesPageProps> = ({
  projectNumber,
  accessToken,
  onDirectQuery,
  onNavigate,
}) => {
  const [location, setLocation] = useState("us-central1");
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

      <AgentEnginesModals
        isDeleteModalOpen={isDeleteModalOpen}
        onCloseDeleteModal={() => setIsDeleteModalOpen(false)}
        onConfirmDelete={confirmDelete}
        selectedIds={selectedIds}
        resources={resources}
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
    </div>
  );
};

export default AgentEnginesPage;
