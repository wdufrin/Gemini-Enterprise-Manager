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
import { Config } from "../../types";
import * as api from "../../services/apiService";
import Spinner from "../Spinner";

interface AgentCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  engineName: string; // The full name e.g., projects/.../locations/.../reasoningEngines/...
  engineDisplayName: string;
  config: Config;
}

const CodeBlock: React.FC<{ content: string }> = ({ content }) => {
  const [copyText, setCopyText] = useState("Copy");

  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopyText("Copied!");
      setTimeout(() => setCopyText("Copy"), 2000);
    });
  };

  return (
    <div className="bg-gray-900 rounded-lg overflow-hidden relative">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 px-2 py-1 bg-gray-600 text-white text-xs font-semibold rounded-md hover:bg-gray-500 z-10"
      >
        {copyText}
      </button>
      <pre className="p-4 text-xs text-gray-300 whitespace-pre-wrap overflow-x-auto max-h-[50vh] font-mono">
        <code>{content}</code>
      </pre>
    </div>
  );
};

const AgentCardModal: React.FC<AgentCardModalProps> = ({
  isOpen,
  onClose,
  engineName,
  engineDisplayName,
  config,
}) => {
  const [activeTab, setActiveTab] = useState<"visual" | "raw">("visual");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentCard, setAgentCard] = useState<any>(null);

  const getLoggingUrl = () => {
    const engineId = engineName.split("/").pop() || "";
    const query = encodeURIComponent(
      `resource.type="vertex_reasoning_engine"\nresource.labels.reasoning_engine_id="${engineId}"`,
    );
    return `https://console.cloud.google.com/logs/query;query=${query}?project=${config.projectId}`;
  };

  useEffect(() => {
    if (!isOpen || !engineName) return;

    const fetchCard = async () => {
      setIsLoading(true);
      setError(null);
      setAgentCard(null);
      try {
        const card = await api.fetchReasoningEngineAgentCard(
          engineName,
          config,
        );
        setAgentCard(card);
      } catch (err: any) {
        console.error("Failed to fetch agent card", err);
        setError(
          err.message ||
            "Failed to fetch agent card. Make sure the agent exposes a card.",
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchCard();
  }, [isOpen, engineName, config]);

  if (!isOpen) return null;

  const cardJsonString = agentCard ? JSON.stringify(agentCard, null, 2) : "";

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4"
      aria-modal="true"
      role="dialog"
    >
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <header className="p-4 border-b border-gray-700 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-xl font-bold text-white">Agent Card</h2>
            <p className="text-xs text-gray-400 font-mono mt-0.5">
              {engineDisplayName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl font-semibold"
          >
            &times;
          </button>
        </header>

        {isLoading ? (
          <div className="flex-1 flex justify-center items-center p-12">
            <Spinner />
          </div>
        ) : error ? (
          <div className="p-6 overflow-y-auto flex-1 flex flex-col items-center">
            <div className="text-red-400 bg-red-900/20 border border-red-800 p-4 rounded-md mb-6 w-full max-w-2xl text-xs whitespace-pre-wrap font-mono text-left">
              {error}
            </div>
            <div className="text-left w-full max-w-2xl bg-gray-900/50 border border-gray-700 p-5 rounded-lg space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-yellow-500"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
                Why is the Agent Card not accessible?
              </h3>
              <p className="text-xs text-gray-300">
                Reasoning Engine instances running in Vertex AI must be
                explicitly configured to support Agent-to-Agent (A2A) protocol
                endpoints. If A2A is not enabled, routing to the card under{" "}
                <code className="bg-gray-800 px-1 rounded">
                  /.well-known/agent-card.json
                </code>{" "}
                will fail.
              </p>
              <div>
                <h4 className="text-xs font-semibold text-gray-200 mb-1">
                  To enable A2A in python:
                </h4>
                <pre className="bg-gray-950 p-3 rounded text-xs text-gray-400 font-mono overflow-x-auto">
                  {`from vertexai.preview import reasoning_engines

app = reasoning_engines.AdkApp(
    agent=root_agent,
    enable_a2a=True, # Enables /.well-known/agent-card.json
    enable_tracing=False
)`}
                </pre>
              </div>
              <div className="pt-2 border-t border-gray-800 flex justify-between items-center gap-4">
                <span className="text-xs text-gray-400 italic">
                  Note: Standard reasoning engines deployed without AdkApp do
                  not serve this endpoint by default.
                </span>
                <a
                  href={getLoggingUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold flex items-center gap-1 transition-colors shrink-0"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-3.5 w-3.5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                  </svg>
                  View Cloud Logs
                </a>
              </div>
            </div>
          </div>
        ) : !agentCard ? (
          <div className="p-6 text-center text-gray-400 flex-1 flex justify-center items-center">
            No agent card data available.
          </div>
        ) : (
          <>
            <div className="px-6 pt-2 border-b border-gray-700 bg-gray-850 shrink-0">
              <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                <button
                  onClick={() => setActiveTab("visual")}
                  className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === "visual"
                      ? "border-blue-500 text-blue-400"
                      : "border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300"
                  }`}
                >
                  Visual Card
                </button>
                <button
                  onClick={() => setActiveTab("raw")}
                  className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === "raw"
                      ? "border-blue-500 text-blue-400"
                      : "border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300"
                  }`}
                >
                  Raw JSON
                </button>
              </nav>
            </div>

            <main className="p-6 overflow-y-auto flex-1 space-y-4">
              {activeTab === "visual" ? (
                <div className="space-y-6">
                  {/* Card Main Info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-gray-900/40 p-4 rounded-lg border border-gray-700/60">
                      <span className="text-xs text-gray-400 uppercase font-semibold">
                        Agent Info
                      </span>
                      <dl className="mt-2 space-y-2">
                        <div>
                          <dt className="text-xs text-gray-500 font-medium">
                            Schema Version
                          </dt>
                          <dd className="text-sm font-semibold text-white font-mono">
                            {agentCard.schema_version || "N/A"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500 font-medium">
                            Name
                          </dt>
                          <dd className="text-sm font-semibold text-white">
                            {agentCard.name || "N/A"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500 font-medium">
                            Display Name
                          </dt>
                          <dd className="text-sm font-semibold text-white">
                            {agentCard.display_name || "N/A"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500 font-medium">
                            Description
                          </dt>
                          <dd className="text-sm text-gray-300 mt-1 whitespace-pre-wrap">
                            {agentCard.description ||
                              "No description provided."}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <div className="bg-gray-900/40 p-4 rounded-lg border border-gray-700/60">
                      <span className="text-xs text-gray-400 uppercase font-semibold">
                        Deployment & Contacts
                      </span>
                      <dl className="mt-2 space-y-2">
                        <div>
                          <dt className="text-xs text-gray-500 font-medium">
                            Agent URL (Endpoint)
                          </dt>
                          <dd className="text-sm font-mono text-blue-400 break-all select-all">
                            {agentCard.url || "N/A"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-gray-500 font-medium">
                            Provider Organization
                          </dt>
                          <dd className="text-sm text-white">
                            {agentCard.provider_organization || "N/A"}
                          </dd>
                        </div>
                        {agentCard.contacts &&
                          agentCard.contacts.length > 0 && (
                            <div>
                              <dt className="text-xs text-gray-500 font-medium">
                                Contacts
                              </dt>
                              <dd className="text-sm text-gray-300 mt-1">
                                <ul className="list-disc list-inside space-y-0.5">
                                  {agentCard.contacts.map(
                                    (contact: any, i: number) => (
                                      <li key={i}>
                                        {contact.name || "Contact"}:{" "}
                                        {contact.email && (
                                          <span className="font-mono text-xs">
                                            {contact.email}
                                          </span>
                                        )}
                                      </li>
                                    ),
                                  )}
                                </ul>
                              </dd>
                            </div>
                          )}
                      </dl>
                    </div>
                  </div>

                  {/* Capabilities & APIs */}
                  {agentCard.api && (
                    <div className="bg-gray-900/20 p-4 rounded-lg border border-gray-700/60">
                      <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-2">
                        API Specification
                      </h3>
                      <dl className="space-y-3">
                        {agentCard.api.type && (
                          <div>
                            <dt className="text-xs text-gray-500 font-medium">
                              API Type
                            </dt>
                            <dd className="text-sm text-white font-mono">
                              {agentCard.api.type}
                            </dd>
                          </div>
                        )}
                        {agentCard.api.url && (
                          <div>
                            <dt className="text-xs text-gray-500 font-medium">
                              API OpenAPI Schema / Spec URL
                            </dt>
                            <dd className="text-sm font-mono text-gray-300 break-all">
                              {agentCard.api.url}
                            </dd>
                          </div>
                        )}
                        {agentCard.api.description && (
                          <div>
                            <dt className="text-xs text-gray-500 font-medium">
                              API Description
                            </dt>
                            <dd className="text-sm text-gray-300 mt-1">
                              {agentCard.api.description}
                            </dd>
                          </div>
                        )}
                      </dl>
                    </div>
                  )}

                  {/* Authentication & Security Settings */}
                  {agentCard.authorizations &&
                    agentCard.authorizations.length > 0 && (
                      <div className="bg-gray-900/20 p-4 rounded-lg border border-gray-700/60">
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-2">
                          Authorizations
                        </h3>
                        <div className="space-y-4">
                          {agentCard.authorizations.map(
                            (auth: any, index: number) => (
                              <div
                                key={index}
                                className="border-b border-gray-700/50 pb-3 last:border-0 last:pb-0"
                              >
                                <span className="text-xs font-semibold text-indigo-400 font-mono">
                                  Authorization #{index + 1}
                                </span>
                                <dl className="mt-1 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                  <div>
                                    <dt className="text-xs text-gray-500 font-medium">
                                      Auth ID
                                    </dt>
                                    <dd className="font-mono text-white">
                                      {auth.auth_id}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs text-gray-500 font-medium">
                                      Type
                                    </dt>
                                    <dd className="font-mono text-white">
                                      {auth.type}
                                    </dd>
                                  </div>
                                  {auth.authorization_uri && (
                                    <div className="md:col-span-2">
                                      <dt className="text-xs text-gray-500 font-medium">
                                        Authorization URI
                                      </dt>
                                      <dd className="font-mono text-gray-300 break-all">
                                        {auth.authorization_uri}
                                      </dd>
                                    </div>
                                  )}
                                  {auth.token_uri && (
                                    <div className="md:col-span-2">
                                      <dt className="text-xs text-gray-500 font-medium">
                                        Token URI
                                      </dt>
                                      <dd className="font-mono text-gray-300 break-all">
                                        {auth.token_uri}
                                      </dd>
                                    </div>
                                  )}
                                  {auth.scopes && auth.scopes.length > 0 && (
                                    <div className="md:col-span-2">
                                      <dt className="text-xs text-gray-500 font-medium">
                                        Required Scopes
                                      </dt>
                                      <dd className="mt-1 flex flex-wrap gap-1">
                                        {auth.scopes.map((scope: string) => (
                                          <span
                                            key={scope}
                                            className="px-2 py-0.5 bg-gray-700 text-gray-300 rounded text-xs font-mono"
                                          >
                                            {scope}
                                          </span>
                                        ))}
                                      </dd>
                                    </div>
                                  )}
                                </dl>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    )}
                </div>
              ) : (
                <CodeBlock content={cardJsonString} />
              )}
            </main>
          </>
        )}

        <footer className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
};

export default AgentCardModal;
