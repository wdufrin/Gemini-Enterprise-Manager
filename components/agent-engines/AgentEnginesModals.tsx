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

import React, { useMemo } from "react";
import { Agent, ReasoningEngine, Config, CloudRunService } from "../../types";
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
  agentsByResource?: Record<string, Agent[]>;
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
  agentsByResource = {},
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
  const dependentAgentsList = useMemo(() => {
    const entries: Array<{
      runtimeId: string;
      runtimeDisplayName: string;
      agent: Agent;
      engineLabel: string;
    }> = [];
    const seen = new Set<string>();
    for (const id of Array.from(selectedIds)) {
      const linked = agentsByResource[id] || [];
      const runtimeRes = resources.find((r) => r.id === id);
      const runtimeDisplayName =
        runtimeRes?.displayName || String(id).split("/").pop() || String(id);
      for (const agent of linked) {
        const dedupKey = `${id}::${agent.name}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
        const parts = (agent.name || "").split("/");
        const locIdx = parts.indexOf("locations");
        const engIdx = parts.indexOf("engines");
        const loc = locIdx >= 0 && parts[locIdx + 1] ? parts[locIdx + 1] : "";
        const eng = engIdx >= 0 && parts[engIdx + 1] ? parts[engIdx + 1] : "";
        entries.push({
          runtimeId: id,
          runtimeDisplayName,
          agent,
          engineLabel: loc && eng ? `${loc} / ${eng}` : eng || loc || "Gemini Enterprise",
        });
      }
    }
    return entries;
  }, [selectedIds, agentsByResource, resources]);

  return (
    <>
      {isDeleteModalOpen && (
        <ConfirmationModal
          isOpen={isDeleteModalOpen}
          onClose={onCloseDeleteModal}
          onConfirm={onConfirmDelete}
          title={`Confirm Deletion of ${selectedIds.size} Resource(s)`}
          confirmText={
            dependentAgentsList.length > 0
              ? `Force Delete & Break ${dependentAgentsList.length} Agent(s)`
              : "Delete"
          }
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
          {dependentAgentsList.length > 0 && (
            <div
              data-testid="active-agent-dependency-warning"
              className="mt-3 p-3.5 rounded-lg bg-red-950/70 border border-red-600/80 space-y-2"
            >
              <div className="flex items-center gap-2 text-xs font-bold text-red-200 uppercase tracking-wider">
                <span>Active Agent Dependency Warning</span>
                <span className="px-2 py-0.5 rounded bg-red-900 text-red-100 border border-red-500 font-mono">
                  {dependentAgentsList.length} Dependent Agent{dependentAgentsList.length === 1 ? "" : "s"}
                </span>
              </div>
              <p className="text-xs text-red-200 leading-relaxed">
                Deleting {selectedIds.size === 1 ? "this runtime" : "these runtimes"} will immediately break the following registered Gemini Enterprise agent{dependentAgentsList.length === 1 ? "" : "s"} (resulting in <code>404 NOT_FOUND</code> runtime errors for end users):
              </p>
              <ul className="max-h-36 overflow-y-auto space-y-1.5 bg-gray-900/80 border border-red-800/70 rounded p-2.5 text-xs">
                {dependentAgentsList.map(({ runtimeId, runtimeDisplayName, agent, engineLabel }) => (
                  <li
                    key={`${runtimeId}-${agent.name}`}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-semibold text-white">
                        {agent.displayName || agent.name.split("/").pop()}
                      </span>
                      <span className="ml-2 font-mono text-[11px] text-red-300">
                        ({agent.name.split("/").pop()})
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700 font-mono text-[11px]">
                      [{engineLabel}] &rarr; {runtimeDisplayName}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
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
