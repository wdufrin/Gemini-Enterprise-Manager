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

import React, { useState, useEffect } from "react";
import { Agent, ReasoningEngine, Config, EnvVar } from "../../types";
import * as api from "../../services/apiService";
import Spinner from "../Spinner";
import ConfirmationModal from "../ConfirmationModal";
import AgentEngineMetricsViewer from "../assistants/AgentEngineMetricsViewer";
import CloudConsoleButton from "../CloudConsoleButton";
import AgentCardModal from "./AgentCardModal";

interface EngineDetailsProps {
  engine: ReasoningEngine;
  usingAgents: Agent[];
  onBack: () => void;
  config: Config;
}

const DetailItem: React.FC<{
  label: string;
  value: string | undefined | null;
  isMono?: boolean;
}> = ({ label, value, isMono = true }) => (
  <div className="py-2">
    <dt className="text-sm font-medium text-gray-400">{label}</dt>
    <dd
      className={`mt-1 text-sm text-white font-mono bg-gray-700 p-2 rounded ${isMono ? "font-mono" : "font-sans"}`}
    >
      {value || "Not set"}
    </dd>
  </div>
);

const ModelArmorModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  command: string;
}> = ({ isOpen, onClose, command }) => {
  const [copyText, setCopyText] = useState("Copy");
  if (!isOpen) return null;
  const handleCopy = () => {
    navigator.clipboard.writeText(command).then(() => {
      setCopyText("Copied!");
      setTimeout(() => setCopyText("Copy"), 2000);
    });
  };
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl">
        <header className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">Enable Model Armor</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            &times;
          </button>
        </header>
        <main className="p-6">
          <p className="text-sm text-gray-300 mb-4">
            To enable Model Armor for this Agent Engine, run the following
            command in your terminal. This registers the <code>:query</code>{" "}
            method with the Model Armor service.
          </p>
          <div className="bg-gray-900 rounded-lg overflow-hidden relative group">
            <button
              onClick={handleCopy}
              className="absolute top-2 right-2 px-2 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              {copyText}
            </button>
            <pre className="p-4 text-xs text-gray-300 whitespace-pre-wrap break-all font-mono">
              {command}
            </pre>
          </div>
        </main>
        <footer className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
};

const EngineDetails: React.FC<EngineDetailsProps> = ({
  engine,
  usingAgents,
  onBack,
  config,
}) => {
  const engineId = engine.name.split("/").pop() || "";

  const [fullEngine, setFullEngine] = useState<ReasoningEngine | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const [sessions, setSessions] = useState<{ name: string }[] | null>(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  // State for deleting sessions
  const [deletingSessionName, setDeletingSessionName] = useState<string | null>(
    null,
  );
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<{
    name: string;
  } | null>(null);

  // State for Model Armor
  const [isModelArmorModalOpen, setIsModelArmorModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "metrics">("details");
  const [isAgentCardOpen, setIsAgentCardOpen] = useState(false);

  useEffect(() => {
    const fetchDetails = async () => {
      setIsLoadingDetails(true);
      setDetailsError(null);
      try {
        const details = await api.getReasoningEngine(engine.name, config);
        setFullEngine(details);
      } catch (err: any) {
        setDetailsError(err.message || "Failed to fetch full engine details.");
      } finally {
        setIsLoadingDetails(false);
      }
    };
    fetchDetails();
  }, [engine.name, config]);

  const handleFetchSessions = async () => {
    setIsLoadingSessions(true);
    setSessionsError(null);
    setSessions(null);
    try {
      const response = await api.listReasoningEngineSessions(
        engine.name,
        config,
      );
      setSessions(response.sessions || []);
    } catch (err: any) {
      setSessionsError(err.message || "Failed to fetch active sessions.");
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const handleRequestDelete = (session: { name: string }) => {
    setSessionToDelete(session);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!sessionToDelete) return;

    setDeletingSessionName(sessionToDelete.name);
    setIsDeleteModalOpen(false);
    setSessionsError(null);

    try {
      await api.deleteReasoningEngineSession(sessionToDelete.name, config);
      // Refresh the list automatically after deletion
      await handleFetchSessions();
    } catch (err: any) {
      setSessionsError(
        err.message ||
          `Failed to delete session ${sessionToDelete.name.split("/").pop()}`,
      );
    } finally {
      setDeletingSessionName(null);
      setSessionToDelete(null);
    }
  };

  const getModelArmorCommand = () => {
    const location = engine.name.split("/")[3];
    // Construct the fully qualified method URL
    // Format: https://LOCATION-aiplatform.googleapis.com/v1beta1/projects/PROJECT_ID/locations/LOCATION/reasoningEngines/REASONING_ENGINE_ID:query
    const resourceUrl = `https://${location}-aiplatform.googleapis.com/v1beta1/${engine.name}:query`;

    return `gcloud services content-security add \\
  "${resourceUrl}" \\
  modelarmor.googleapis.com \\
  --project="${config.projectId}"`;
  };

  return (
    <>
      <ModelArmorModal
        isOpen={isModelArmorModalOpen}
        onClose={() => setIsModelArmorModalOpen(false)}
        command={getModelArmorCommand()}
      />

      <AgentCardModal
        isOpen={isAgentCardOpen}
        onClose={() => setIsAgentCardOpen(false)}
        engineName={engine.name}
        engineDisplayName={engine.displayName}
        config={config}
      />

      {sessionToDelete && (
        <ConfirmationModal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          onConfirm={handleConfirmDelete}
          title="Confirm Session Deletion"
          confirmText="Delete"
          isConfirming={!!deletingSessionName}
        >
          <p>
            Are you sure you want to permanently delete this active session?
          </p>
          <div className="mt-2 p-3 bg-gray-700/50 rounded-md border border-gray-600">
            <p className="text-xs font-mono text-gray-400">
              {sessionToDelete.name.split("/").pop()}
            </p>
          </div>
          <p className="mt-4 text-sm text-yellow-300">
            This action will terminate the session and may interrupt an ongoing
            conversation.
          </p>
        </ConfirmationModal>
      )}

      <div className="bg-gray-800 shadow-xl rounded-lg p-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center">
              {engine.displayName}
            </h2>
            <p className="text-gray-400 mt-1 font-mono">{engineId}</p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsAgentCardOpen(true)}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-md hover:bg-indigo-700 transition-colors"
            >
              Agent Card
            </button>
            <button onClick={onBack} className="text-gray-400 hover:text-white">
              &larr; Back to list
            </button>
          </div>
        </div>

        <div className="mt-4 border-b border-gray-700 flex justify-between items-center">
          <nav className="-mb-px flex space-x-4" aria-label="Tabs">
            <button
              onClick={() => setActiveTab("details")}
              className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${activeTab === "details" ? "border-blue-500 text-blue-400" : "border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300"}`}
            >
              Details
            </button>
            <button
              onClick={() => setActiveTab("metrics")}
              className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${activeTab === "metrics" ? "border-blue-500 text-blue-400" : "border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300"}`}
            >
              Metrics
            </button>
          </nav>
          <div className="py-2">
            <CloudConsoleButton
              url={
                activeTab === "details"
                  ? `https://console.cloud.google.com/vertex-ai/agents/agent-engines/locations/${engine.name.split("/")[3]}/agent-engines/${engineId}/dashboard?project=${config.projectId}&pageState=(%22timeRange%22:(%22duration%22:%22PT1H%22))`
                  : `https://console.cloud.google.com/monitoring?project=${config.projectId}`
              }
            />
          </div>
        </div>

        {activeTab === "details" && (
          <>
            {isLoadingDetails && (
              <div className="mt-6">
                <Spinner />
              </div>
            )}
            {detailsError && (
              <p className="text-red-400 mt-6">{detailsError}</p>
            )}

            {fullEngine && (
              <>
                <dl className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
                  <DetailItem
                    label="Full Resource Name"
                    value={fullEngine.name}
                  />
                  <DetailItem
                    label="Location"
                    value={fullEngine.name.split("/")[3]}
                  />
                  <DetailItem
                    label="Created On"
                    value={
                      fullEngine.createTime
                        ? new Date(fullEngine.createTime).toLocaleString()
                        : "N/A"
                    }
                    isMono={false}
                  />
                  <DetailItem
                    label="Last Modified"
                    value={
                      fullEngine.updateTime
                        ? new Date(fullEngine.updateTime).toLocaleString()
                        : "N/A"
                    }
                    isMono={false}
                  />
                </dl>

                <div className="mt-6 border-t border-gray-700 pt-6">
                  <h3 className="text-lg font-semibold text-white">
                    Deployment Specification
                  </h3>
                  {fullEngine.spec ? (
                    <div className="mt-2 space-y-4">
                      <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
                        <DetailItem
                          label="Agent Framework"
                          value={fullEngine.spec.agentFramework}
                        />
                        <DetailItem
                          label="Python Version"
                          value={fullEngine.spec.packageSpec?.pythonVersion}
                        />
                        <DetailItem
                          label="Pickle GCS URI"
                          value={
                            fullEngine.spec.packageSpec?.pickleObjectGcsUri
                          }
                        />
                        <DetailItem
                          label="Requirements GCS URI"
                          value={
                            fullEngine.spec.packageSpec?.requirementsGcsUri
                          }
                        />
                      </dl>
                      <div>
                        <h4 className="text-md font-semibold text-gray-200 mt-4">
                          Environment Variables
                        </h4>
                        {fullEngine.spec.deploymentSpec?.env &&
                        fullEngine.spec.deploymentSpec.env.length > 0 ? (
                          <div className="mt-2 text-sm text-white font-mono bg-gray-900/50 p-3 rounded-md border border-gray-700 max-h-48 overflow-y-auto">
                            <ul className="space-y-1">
                              {fullEngine.spec.deploymentSpec.env.map(
                                (envVar: EnvVar) => (
                                  <li key={envVar.name}>
                                    <span className="text-gray-400">
                                      {envVar.name}:
                                    </span>{" "}
                                    {envVar.value}
                                  </li>
                                ),
                              )}
                            </ul>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500 italic mt-2">
                            No environment variables defined in deployment spec.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-gray-400 italic">
                      No deployment specification found for this engine.
                    </p>
                  )}
                </div>
              </>
            )}

            <div className="mt-6 border-t border-gray-700 pt-6">
              <h3 className="text-lg font-semibold text-white">
                Agents Using This Engine ({usingAgents.length})
              </h3>
              {usingAgents.length > 0 ? (
                <ul className="mt-2 space-y-2 bg-gray-900/50 p-3 rounded-md">
                  {usingAgents.map((agent) => {
                    const agentEngineId = agent.name.split("/")[7];
                    return (
                      <li
                        key={agent.name}
                        className="p-2 rounded-md hover:bg-gray-700/50"
                      >
                        <span className="font-medium text-white">
                          {agentEngineId}/{agent.displayName}
                        </span>
                        <p
                          className="text-gray-400 font-mono text-xs"
                          title={agent.name}
                        >
                          ID: {agent.name.split("/").pop()}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-gray-400 italic">
                  No agents are currently using this engine.
                </p>
              )}
            </div>

            <div className="mt-6 border-t border-gray-700 pt-6">
              <h3 className="text-lg font-semibold text-white">
                Active Sessions
              </h3>
              <p className="text-sm text-gray-400 mt-1 mb-4">
                View and terminate sessions currently active for this engine.
              </p>
              <button
                onClick={handleFetchSessions}
                disabled={isLoadingSessions}
                className="px-5 py-2.5 bg-cyan-600 text-white font-semibold rounded-md hover:bg-cyan-700 disabled:bg-cyan-800"
              >
                {isLoadingSessions ? "Fetching..." : "View Active Sessions"}
              </button>

              <div className="mt-4">
                {isLoadingSessions && <Spinner />}
                {sessionsError && (
                  <p className="text-red-400 mt-2">{sessionsError}</p>
                )}
                {sessions !== null && (
                  <>
                    <p className="text-sm text-gray-300 mb-2">
                      Found {sessions.length} active session(s).
                    </p>
                    {sessions.length > 0 && (
                      <div className="bg-gray-900/50 rounded-lg border border-gray-700 max-h-48 overflow-y-auto">
                        <ul className="divide-y divide-gray-700">
                          {sessions.map((session) => {
                            const isDeletingThis =
                              deletingSessionName === session.name;
                            return (
                              <li
                                key={session.name}
                                className="p-3 flex justify-between items-center"
                              >
                                <span
                                  className="text-xs font-mono text-gray-400 truncate"
                                  title={session.name}
                                >
                                  {session.name.split("/").pop()}
                                </span>
                                <button
                                  onClick={() => handleRequestDelete(session)}
                                  disabled={!!deletingSessionName}
                                  className="text-red-500 hover:text-red-400 text-xs font-semibold disabled:text-gray-500 disabled:cursor-not-allowed shrink-0 ml-4"
                                >
                                  {isDeletingThis ? "Deleting..." : "Delete"}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="mt-6 border-t border-gray-700 pt-6">
              <h3 className="text-lg font-semibold text-white">
                Content Security
              </h3>
              <div className="mt-4 bg-gray-900/50 p-4 rounded-lg border border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h4 className="font-medium text-blue-400 flex items-center gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Model Armor
                  </h4>
                  <p className="text-sm text-gray-400 mt-1">
                    Protect your engine with content safety filters by
                    registering it with Model Armor.
                  </p>
                </div>
                <button
                  onClick={() => setIsModelArmorModalOpen(true)}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 whitespace-nowrap shrink-0"
                >
                  Enable via CLI
                </button>
              </div>
            </div>
          </>
        )}

        {activeTab === "metrics" && (
          <div className="mt-6">
            <AgentEngineMetricsViewer
              config={config}
              engineId={engineId}
              filterBy="tool_id"
            />
          </div>
        )}
      </div>
    </>
  );
};

export default EngineDetails;
