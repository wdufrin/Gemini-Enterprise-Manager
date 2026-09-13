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
import { ReasoningEngine, Config, CloudRunService } from "../../types";
import { UnifiedResource } from "../../hooks/useAgentEngines";
import ConfirmationModal from "../ConfirmationModal";
import CloudRunQueryModal from "./CloudRunQueryModal";
import AgentCardModal from "./AgentCardModal";

interface AgentEnginesModalsProps {
  isDeleteModalOpen: boolean;
  onCloseDeleteModal: () => void;
  onConfirmDelete: () => void;
  selectedIds: Set<string>;
  resources: UnifiedResource[];
  isDeleting: boolean;
  engineToClearSessions: ReasoningEngine | null;
  onCloseClearSessions: () => void;
  onConfirmClearSessions: () => void;
  isClearingSessions: boolean;
  cloudRunQueryService: CloudRunService | null;
  onCloseCloudRunQuery: () => void;
  accessToken: string;
  agentCardEngine: ReasoningEngine | null;
  onCloseAgentCard: () => void;
  apiConfig: Omit<Config, "accessToken">;
}

export const AgentEnginesModals: React.FC<AgentEnginesModalsProps> = ({
  isDeleteModalOpen,
  onCloseDeleteModal,
  onConfirmDelete,
  selectedIds,
  resources,
  isDeleting,
  engineToClearSessions,
  onCloseClearSessions,
  onConfirmClearSessions,
  isClearingSessions,
  cloudRunQueryService,
  onCloseCloudRunQuery,
  accessToken,
  agentCardEngine,
  onCloseAgentCard,
  apiConfig,
}) => {
  return (
    <>
      {isDeleteModalOpen && (
        <ConfirmationModal
          isOpen={isDeleteModalOpen}
          onClose={onCloseDeleteModal}
          onConfirm={onConfirmDelete}
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
          onClose={onCloseClearSessions}
          onConfirm={onConfirmClearSessions}
          title="Terminate Sessions"
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
          onClose={onCloseCloudRunQuery}
          service={cloudRunQueryService}
          accessToken={accessToken}
        />
      )}

      {agentCardEngine && (
        <AgentCardModal
          isOpen={!!agentCardEngine}
          onClose={onCloseAgentCard}
          engineName={agentCardEngine.name}
          engineDisplayName={agentCardEngine.displayName}
          config={apiConfig}
        />
      )}
    </>
  );
};
