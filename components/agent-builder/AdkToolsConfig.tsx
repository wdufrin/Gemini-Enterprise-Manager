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

import React, { useState, useEffect } from 'react';
import { AdkAgentConfig } from '../../services/adkTemplates';
import { Authorization } from '../../types';
import { McpServiceCheck } from '../McpServiceCheck';

export type AdkConfigChangeEvent =
  | React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  | { target: { name: string; type: string; checked?: boolean; value?: string } };

export interface AdkToolsConfigProps {
  adkConfig: AdkAgentConfig;
  setAdkConfig: React.Dispatch<React.SetStateAction<AdkAgentConfig>>;
  handleAdkConfigChange: (e: AdkConfigChangeEvent) => void;
  deployProjectId: string;
  handleAddCustomMcp: () => void;
  handleUpdateCustomMcp: (index: number, field: 'name' | 'url', value: string) => void;
  handleRemoveCustomMcp: (index: number) => void;
  handleVerifyCustomMcp: (index: number, url: string) => void;
  customMcpStatus: {
    [key: number]: { loading: boolean; tools?: unknown[]; error?: string };
  };
  authInputMode: 'manual' | 'select';
  setAuthInputMode: React.Dispatch<React.SetStateAction<'manual' | 'select'>>;
  authorizations: Authorization[];
}

export const AdkToolsConfig: React.FC<AdkToolsConfigProps> = ({
  adkConfig,
  setAdkConfig: _setAdkConfig,
  handleAdkConfigChange,
  deployProjectId,
  handleAddCustomMcp,
  handleUpdateCustomMcp,
  handleRemoveCustomMcp,
  handleVerifyCustomMcp,
  customMcpStatus,
  authInputMode,
  setAuthInputMode,
  authorizations,
}) => {
  // Counts of enabled items per group
  const capabilitiesCount = [
    adkConfig.enableThinking,
    adkConfig.enableCodeExecution,
    adkConfig.enableGraphvizRendering,
  ].filter(Boolean).length;

  const mcpCount = [
    adkConfig.enableBigQueryMcp,
    adkConfig.enableCloudLoggingMcp,
    adkConfig.enableBigtableAdminMcp,
    adkConfig.enableCloudSqlMcp,
    adkConfig.enableCloudMonitoringMcp,
    adkConfig.enableComputeEngineMcp,
    adkConfig.enableFirestoreMcp,
    adkConfig.enableGkeMcp,
    adkConfig.enableResourceManagerMcp,
    adkConfig.enableSpannerMcp,
    adkConfig.enableDeveloperKnowledgeMcp,
    adkConfig.enableMapsGroundingMcp,
  ].filter(Boolean).length;

  const apiCount = [
    adkConfig.enableSecurityCommandCenterApi,
    adkConfig.enableRecommenderApi,
    adkConfig.enableServiceHealthApi,
    adkConfig.enableNetworkManagementApi,
    adkConfig.enableCloudLoggingApi,
    adkConfig.enableCloudMonitoringApi,
    adkConfig.enableCloudRunApi,
    adkConfig.enableResourceManagerApi,
    adkConfig.enableAdminActivityApi,
    adkConfig.enableDatabaseFleetApi,
    adkConfig.enableCloudAssistApi,
    adkConfig.enableEmailTool,
  ].filter(Boolean).length;

  const customEndpointCount = adkConfig.customMcpEndpoints?.length || 0;
  const oauthCount = adkConfig.enableOAuth ? 1 : 0;
  const observabilityCount = [adkConfig.enableTelemetry, adkConfig.enableMessageLogging].filter(Boolean).length;

  const isOAuthActive = Boolean(adkConfig.enableOAuth);

  // Tools that trigger or require OAuth delegation
  const oauthToolsCount = [
    adkConfig.enableOAuth,
    adkConfig.enableBigQueryMcp,
    adkConfig.enableCloudLoggingMcp,
    adkConfig.enableBigtableAdminMcp,
    adkConfig.enableCloudSqlMcp,
    adkConfig.enableCloudMonitoringMcp,
    adkConfig.enableComputeEngineMcp,
    adkConfig.enableFirestoreMcp,
    adkConfig.enableGkeMcp,
    adkConfig.enableResourceManagerMcp,
    adkConfig.enableSpannerMcp,
    adkConfig.enableDeveloperKnowledgeMcp,
    adkConfig.enableMapsGroundingMcp,
    adkConfig.enableSecurityCommandCenterApi,
    adkConfig.enableRecommenderApi,
    adkConfig.enableServiceHealthApi,
    adkConfig.enableNetworkManagementApi,
    adkConfig.enableCloudLoggingApi,
    adkConfig.enableCloudMonitoringApi,
    adkConfig.enableCloudRunApi,
    adkConfig.enableResourceManagerApi,
    adkConfig.enableAdminActivityApi,
    adkConfig.enableDatabaseFleetApi,
    adkConfig.enableCloudAssistApi,
    adkConfig.enableEmailTool,
    adkConfig.enableBqAnalytics,
  ].filter(Boolean).length;

  const [openSections, setOpenSections] = useState<{ [key: string]: boolean }>(() => ({
    capabilities: true,
    mcps: true,
    customEndpoints: customEndpointCount > 0,
    apis: apiCount > 0,
    oauth: isOAuthActive,
    observability: observabilityCount > 0,
  }));

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const toggleAll = (expand: boolean) => {
    setOpenSections({
      capabilities: expand,
      mcps: expand,
      customEndpoints: expand,
      apis: expand,
      oauth: expand,
      observability: expand,
    });
  };

  // If any checkboxes inside a hidden category are checked (or newly selected), ensure the category unhides (is not minimized)
  useEffect(() => {
    setOpenSections((prev) => {
      let changed = false;
      const next = { ...prev };
      if (capabilitiesCount > 0 && !next.capabilities) {
        next.capabilities = true;
        changed = true;
      }
      if (mcpCount > 0 && !next.mcps) {
        next.mcps = true;
        changed = true;
      }
      if (customEndpointCount > 0 && !next.customEndpoints) {
        next.customEndpoints = true;
        changed = true;
      }
      if (apiCount > 0 && !next.apis) {
        next.apis = true;
        changed = true;
      }
      if ((isOAuthActive || oauthCount > 0) && !next.oauth) {
        next.oauth = true;
        changed = true;
      }
      if (observabilityCount > 0 && !next.observability) {
        next.observability = true;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [
    capabilitiesCount,
    mcpCount,
    customEndpointCount,
    apiCount,
    oauthCount,
    isOAuthActive,
    oauthToolsCount,
    observabilityCount,
  ]);

  return (
    <div className="space-y-4 pt-2">
      {/* Header with Quick Expand/Collapse Controls */}
      <div className="flex items-center justify-between pb-1 border-b border-gray-700">
        <div>
          <h3 className="text-sm font-semibold text-white">Agent Tools &amp; Capabilities</h3>
          <p className="text-xs text-gray-400">
            Configure reasoning capabilities, MCP tool servers, and enterprise cloud integrations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => toggleAll(true)}
            className="text-[11px] text-blue-400 hover:text-blue-300 font-medium transition-colors"
          >
            Expand All
          </button>
          <span className="text-gray-600 text-xs">•</span>
          <button
            type="button"
            onClick={() => toggleAll(false)}
            className="text-[11px] text-gray-400 hover:text-gray-300 font-medium transition-colors"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* 1. Core Capabilities & Reasoning */}
      <div className="border border-gray-700 bg-gray-800/40 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('capabilities')}
          aria-expanded={openSections.capabilities}
          className="w-full flex items-center justify-between p-3.5 bg-gray-800/80 hover:bg-gray-800 transition-colors text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-base">🧠</span>
            <span className="text-xs font-semibold text-gray-200 uppercase tracking-wide">
              Core Capabilities &amp; Reasoning
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/50 text-blue-300 border border-blue-700/50">
              {capabilitiesCount} active
            </span>
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-4 w-4 text-gray-400 transform transition-transform ${openSections.capabilities ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {openSections.capabilities && (
          <div className="p-4 space-y-3.5 border-t border-gray-700/80">
            <div>
              <label className="flex items-start space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="enableThinking"
                  checked={adkConfig.enableThinking}
                  onChange={handleAdkConfigChange}
                  className="h-4 w-4 mt-0.5 bg-gray-700 border-gray-600 rounded text-blue-500 focus:ring-blue-600"
                />
                <div>
                  <span className="text-sm font-medium text-gray-200">Enable Thinking Details</span>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Surfaces internal step-by-step reasoning tokens before final response generation.
                  </p>
                </div>
              </label>
              {adkConfig.enableThinking && (
                <div className="ml-7 mt-2 p-2.5 rounded bg-gray-900/70 border border-gray-700 flex items-center gap-3">
                  {adkConfig.model?.startsWith('gemini-3') ||
                  adkConfig.model?.includes('3.5') ||
                  adkConfig.model?.includes('3.8') ||
                  adkConfig.model?.includes('3.1') ? (
                    <>
                      <span className="text-xs text-gray-300">Reasoning Depth:</span>
                      <select
                        name="thinkingLevel"
                        aria-label="Thinking Level"
                        value={adkConfig.thinkingLevel || 'HIGH'}
                        onChange={handleAdkConfigChange}
                        className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200"
                      >
                        <option value="HIGH">HIGH (Deep multi-hop reasoning)</option>
                        <option value="MEDIUM">MEDIUM (Balanced speed &amp; depth)</option>
                        <option value="LOW">LOW (Fast execution)</option>
                        <option value="MINIMAL">MINIMAL (Direct answers)</option>
                      </select>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-gray-300">Token Budget:</span>
                      <input
                        type="number"
                        name="thinkingBudget"
                        aria-label="Thinking Budget"
                        value={adkConfig.thinkingBudget || 1024}
                        onChange={handleAdkConfigChange}
                        placeholder="Limit (-1)"
                        className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 w-28 font-mono"
                      />
                      <span className="text-[11px] text-gray-500">(-1 for unlimited)</span>
                    </>
                  )}
                </div>
              )}
            </div>

            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="checkbox"
                name="enableCodeExecution"
                checked={adkConfig.enableCodeExecution}
                onChange={handleAdkConfigChange}
                className="h-4 w-4 mt-0.5 bg-gray-700 border-gray-600 rounded text-blue-500 focus:ring-blue-600"
              />
              <div>
                <span className="text-sm font-medium text-gray-200">Code Execution Sub-Agent</span>
                <p className="text-xs text-gray-400 mt-0.5">
                  Allows the agent to write and execute Python code in an isolated sandbox for math and analytics.
                </p>
              </div>
            </label>

            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="checkbox"
                name="enableGraphvizRendering"
                checked={adkConfig.enableGraphvizRendering}
                onChange={handleAdkConfigChange}
                className="h-4 w-4 mt-0.5 bg-gray-700 border-gray-600 rounded text-blue-500 focus:ring-blue-600"
              />
              <div>
                <span className="text-sm font-medium text-gray-200">Graphviz Local Renderer</span>
                <p className="text-xs text-gray-400 mt-0.5">
                  Renders architectural diagrams and graphs client-side using Graphviz DOT syntax.
                </p>
              </div>
            </label>
          </div>
        )}
      </div>

      {/* 2. Managed MCP Servers */}
      <div className="border border-gray-700 bg-gray-800/40 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('mcps')}
          aria-expanded={openSections.mcps}
          className="w-full flex items-center justify-between p-3.5 bg-gray-800/80 hover:bg-gray-800 transition-colors text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-base">🔌</span>
            <span className="text-xs font-semibold text-gray-200 uppercase tracking-wide">
              Managed MCP Tool Servers
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/50 text-blue-300 border border-blue-700/50">
              {mcpCount}/12 active
            </span>
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-4 w-4 text-gray-400 transform transition-transform ${openSections.mcps ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {openSections.mcps && (
          <div className="p-4 space-y-2.5 border-t border-gray-700/80">
            <p className="text-xs text-gray-400 mb-2">
              Model Context Protocol (MCP) servers run alongside your agent and provide structured tool calling:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <McpServiceCheck
                projectId={deployProjectId || ''}
                serviceName="bigquery.googleapis.com"
                mcpEndpoint="https://bigquery.googleapis.com/mcp"
                label="BigQuery MCP (SQL & Datasets)"
                checked={adkConfig.enableBigQueryMcp}
                onChange={(checked) =>
                  handleAdkConfigChange({
                    target: { name: 'enableBigQueryMcp', type: 'checkbox', checked },
                  })
                }
              />
              <McpServiceCheck
                projectId={deployProjectId || ''}
                serviceName="logging.googleapis.com"
                mcpEndpoint="https://logging.googleapis.com/mcp"
                label="Cloud Logging MCP"
                checked={adkConfig.enableCloudLoggingMcp}
                onChange={(checked) =>
                  handleAdkConfigChange({
                    target: { name: 'enableCloudLoggingMcp', type: 'checkbox', checked },
                  })
                }
              />
              <McpServiceCheck
                projectId={deployProjectId || ''}
                serviceName="bigtableadmin.googleapis.com"
                mcpEndpoint="https://bigtableadmin.googleapis.com/mcp"
                label="Bigtable Admin MCP"
                checked={adkConfig.enableBigtableAdminMcp}
                onChange={(checked) =>
                  handleAdkConfigChange({
                    target: { name: 'enableBigtableAdminMcp', type: 'checkbox', checked },
                  })
                }
              />
              <McpServiceCheck
                projectId={deployProjectId || ''}
                serviceName="sqladmin.googleapis.com"
                mcpEndpoint="https://sqladmin.googleapis.com/mcp"
                label="Cloud SQL Admin MCP"
                checked={adkConfig.enableCloudSqlMcp}
                onChange={(checked) =>
                  handleAdkConfigChange({
                    target: { name: 'enableCloudSqlMcp', type: 'checkbox', checked },
                  })
                }
              />
              <McpServiceCheck
                projectId={deployProjectId || ''}
                serviceName="monitoring.googleapis.com"
                mcpEndpoint="https://monitoring.googleapis.com/mcp"
                label="Cloud Monitoring MCP"
                checked={adkConfig.enableCloudMonitoringMcp}
                onChange={(checked) =>
                  handleAdkConfigChange({
                    target: { name: 'enableCloudMonitoringMcp', type: 'checkbox', checked },
                  })
                }
              />
              <McpServiceCheck
                projectId={deployProjectId || ''}
                serviceName="compute.googleapis.com"
                mcpEndpoint="https://compute.googleapis.com/mcp"
                label="Compute Engine MCP"
                checked={adkConfig.enableComputeEngineMcp}
                onChange={(checked) =>
                  handleAdkConfigChange({
                    target: { name: 'enableComputeEngineMcp', type: 'checkbox', checked },
                  })
                }
              />
              <McpServiceCheck
                projectId={deployProjectId || ''}
                serviceName="firestore.googleapis.com"
                mcpEndpoint="https://firestore.googleapis.com/mcp"
                label="Firestore MCP"
                checked={adkConfig.enableFirestoreMcp}
                onChange={(checked) =>
                  handleAdkConfigChange({
                    target: { name: 'enableFirestoreMcp', type: 'checkbox', checked },
                  })
                }
              />
              <McpServiceCheck
                projectId={deployProjectId || ''}
                serviceName="container.googleapis.com"
                mcpEndpoint="https://container.googleapis.com/mcp"
                label="GKE Kubernetes MCP"
                checked={adkConfig.enableGkeMcp}
                onChange={(checked) =>
                  handleAdkConfigChange({
                    target: { name: 'enableGkeMcp', type: 'checkbox', checked },
                  })
                }
              />
              <McpServiceCheck
                projectId={deployProjectId || ''}
                serviceName="cloudresourcemanager.googleapis.com"
                mcpEndpoint="https://cloudresourcemanager.googleapis.com/mcp"
                label="Resource Manager MCP"
                checked={adkConfig.enableResourceManagerMcp}
                onChange={(checked) =>
                  handleAdkConfigChange({
                    target: { name: 'enableResourceManagerMcp', type: 'checkbox', checked },
                  })
                }
              />
              <McpServiceCheck
                projectId={deployProjectId || ''}
                serviceName="spanner.googleapis.com"
                mcpEndpoint="https://spanner.googleapis.com/mcp"
                label="Cloud Spanner MCP"
                checked={adkConfig.enableSpannerMcp}
                onChange={(checked) =>
                  handleAdkConfigChange({
                    target: { name: 'enableSpannerMcp', type: 'checkbox', checked },
                  })
                }
              />
              <McpServiceCheck
                projectId={deployProjectId || ''}
                serviceName="developerknowledge.googleapis.com"
                mcpEndpoint="https://developerknowledge.googleapis.com/mcp"
                label="Developer Knowledge MCP"
                checked={adkConfig.enableDeveloperKnowledgeMcp}
                onChange={(checked) =>
                  handleAdkConfigChange({
                    target: { name: 'enableDeveloperKnowledgeMcp', type: 'checkbox', checked },
                  })
                }
              />
              <McpServiceCheck
                projectId={deployProjectId || ''}
                serviceName="mapstools.googleapis.com"
                mcpEndpoint="https://mapstools.googleapis.com/mcp"
                label="Maps Grounding Lite MCP"
                checked={adkConfig.enableMapsGroundingMcp}
                onChange={(checked) =>
                  handleAdkConfigChange({
                    target: { name: 'enableMapsGroundingMcp', type: 'checkbox', checked },
                  })
                }
              />
            </div>
          </div>
        )}
      </div>

      {/* 3. Enterprise GCP API Tools */}
      <div className="border border-gray-700 bg-gray-800/40 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('apis')}
          aria-expanded={openSections.apis}
          className="w-full flex items-center justify-between p-3.5 bg-gray-800/80 hover:bg-gray-800 transition-colors text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-base">⚡</span>
            <span className="text-xs font-semibold text-gray-200 uppercase tracking-wide">
              Advanced Enterprise GCP APIs
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/50 text-blue-300 border border-blue-700/50">
              {apiCount}/12 active
            </span>
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-4 w-4 text-gray-400 transform transition-transform ${openSections.apis ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {openSections.apis && (
          <div className="p-4 space-y-3 border-t border-gray-700/80">
            <p className="text-xs text-gray-400 mb-2">
              Direct API integrations that equip the ADK agent with specialized enterprise querying functions:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="flex items-start space-x-2.5 cursor-pointer bg-gray-900/40 p-2.5 rounded border border-gray-800">
                <input
                  type="checkbox"
                  name="enableSecurityCommandCenterApi"
                  checked={adkConfig.enableSecurityCommandCenterApi}
                  onChange={handleAdkConfigChange}
                  className="h-4 w-4 mt-0.5 bg-gray-700 border-gray-600 rounded text-blue-500"
                />
                <div>
                  <span className="text-xs font-medium text-gray-200">Security Command Center</span>
                  <p className="text-[11px] text-gray-400">Query security findings and vulnerability postures.</p>
                </div>
              </label>

              <label className="flex items-start space-x-2.5 cursor-pointer bg-gray-900/40 p-2.5 rounded border border-gray-800">
                <input
                  type="checkbox"
                  name="enableRecommenderApi"
                  checked={adkConfig.enableRecommenderApi}
                  onChange={handleAdkConfigChange}
                  className="h-4 w-4 mt-0.5 bg-gray-700 border-gray-600 rounded text-blue-500"
                />
                <div>
                  <span className="text-xs font-medium text-gray-200">GCP Recommender</span>
                  <p className="text-[11px] text-gray-400">Fetch cost, performance, and IAM recommendations.</p>
                </div>
              </label>

              <label className="flex items-start space-x-2.5 cursor-pointer bg-gray-900/40 p-2.5 rounded border border-gray-800">
                <input
                  type="checkbox"
                  name="enableServiceHealthApi"
                  checked={adkConfig.enableServiceHealthApi}
                  onChange={handleAdkConfigChange}
                  className="h-4 w-4 mt-0.5 bg-gray-700 border-gray-600 rounded text-blue-500"
                />
                <div>
                  <span className="text-xs font-medium text-gray-200">Service Health</span>
                  <p className="text-[11px] text-gray-400">Access live GCP incident and outage feeds.</p>
                </div>
              </label>

              <label className="flex items-start space-x-2.5 cursor-pointer bg-gray-900/40 p-2.5 rounded border border-gray-800">
                <input
                  type="checkbox"
                  name="enableNetworkManagementApi"
                  checked={adkConfig.enableNetworkManagementApi}
                  onChange={handleAdkConfigChange}
                  className="h-4 w-4 mt-0.5 bg-gray-700 border-gray-600 rounded text-blue-500"
                />
                <div>
                  <span className="text-xs font-medium text-gray-200">Network Management</span>
                  <p className="text-[11px] text-gray-400">Run VPC connectivity tests and reachability analysis.</p>
                </div>
              </label>

              <label className="flex items-start space-x-2.5 cursor-pointer bg-gray-900/40 p-2.5 rounded border border-gray-800">
                <input
                  type="checkbox"
                  name="enableCloudLoggingApi"
                  checked={adkConfig.enableCloudLoggingApi}
                  onChange={handleAdkConfigChange}
                  className="h-4 w-4 mt-0.5 bg-gray-700 border-gray-600 rounded text-blue-500"
                />
                <div>
                  <span className="text-xs font-medium text-gray-200">Cloud Logging API</span>
                  <p className="text-[11px] text-gray-400">Direct log entry filtering and streaming.</p>
                </div>
              </label>

              <label className="flex items-start space-x-2.5 cursor-pointer bg-gray-900/40 p-2.5 rounded border border-gray-800">
                <input
                  type="checkbox"
                  name="enableCloudMonitoringApi"
                  checked={adkConfig.enableCloudMonitoringApi}
                  onChange={handleAdkConfigChange}
                  className="h-4 w-4 mt-0.5 bg-gray-700 border-gray-600 rounded text-blue-500"
                />
                <div>
                  <span className="text-xs font-medium text-gray-200">Cloud Monitoring API</span>
                  <p className="text-[11px] text-gray-400">Query metric time-series and alert policies.</p>
                </div>
              </label>

              <label className="flex items-start space-x-2.5 cursor-pointer bg-gray-900/40 p-2.5 rounded border border-gray-800">
                <input
                  type="checkbox"
                  name="enableCloudRunApi"
                  checked={adkConfig.enableCloudRunApi}
                  onChange={handleAdkConfigChange}
                  className="h-4 w-4 mt-0.5 bg-gray-700 border-gray-600 rounded text-blue-500"
                />
                <div>
                  <span className="text-xs font-medium text-gray-200">Cloud Run Discovery</span>
                  <p className="text-[11px] text-gray-400">Inspect serverless services and traffic allocations.</p>
                </div>
              </label>

              <label className="flex items-start space-x-2.5 cursor-pointer bg-gray-900/40 p-2.5 rounded border border-gray-800">
                <input
                  type="checkbox"
                  name="enableResourceManagerApi"
                  checked={adkConfig.enableResourceManagerApi}
                  onChange={handleAdkConfigChange}
                  className="h-4 w-4 mt-0.5 bg-gray-700 border-gray-600 rounded text-blue-500"
                />
                <div>
                  <span className="text-xs font-medium text-gray-200">Resource Manager</span>
                  <p className="text-[11px] text-gray-400">Inspect folder trees and project metadata.</p>
                </div>
              </label>

              <label className="flex items-start space-x-2.5 cursor-pointer bg-gray-900/40 p-2.5 rounded border border-gray-800">
                <input
                  type="checkbox"
                  name="enableAdminActivityApi"
                  checked={adkConfig.enableAdminActivityApi}
                  onChange={handleAdkConfigChange}
                  className="h-4 w-4 mt-0.5 bg-gray-700 border-gray-600 rounded text-blue-500"
                />
                <div>
                  <span className="text-xs font-medium text-gray-200">Admin Activity Auditing</span>
                  <p className="text-[11px] text-gray-400">Track administrative configuration updates.</p>
                </div>
              </label>

              <label className="flex items-start space-x-2.5 cursor-pointer bg-gray-900/40 p-2.5 rounded border border-gray-800">
                <input
                  type="checkbox"
                  name="enableDatabaseFleetApi"
                  checked={adkConfig.enableDatabaseFleetApi}
                  onChange={handleAdkConfigChange}
                  className="h-4 w-4 mt-0.5 bg-gray-700 border-gray-600 rounded text-blue-500"
                />
                <div>
                  <span className="text-xs font-medium text-gray-200">Database Fleet Health</span>
                  <p className="text-[11px] text-gray-400">Monitor instances across Cloud SQL, Spanner &amp; AlloyDB.</p>
                </div>
              </label>

              <label className="flex items-start space-x-2.5 cursor-pointer bg-gray-900/40 p-2.5 rounded border border-gray-800">
                <input
                  type="checkbox"
                  name="enableCloudAssistApi"
                  checked={adkConfig.enableCloudAssistApi}
                  onChange={handleAdkConfigChange}
                  className="h-4 w-4 mt-0.5 bg-gray-700 border-gray-600 rounded text-blue-500"
                />
                <div>
                  <span className="text-xs font-medium text-gray-200">Gemini Cloud Assist</span>
                  <p className="text-[11px] text-gray-400">Incorporate Google Cloud operations intelligence.</p>
                </div>
              </label>

              <label className="flex items-start space-x-2.5 cursor-pointer bg-gray-900/40 p-2.5 rounded border border-gray-800">
                <input
                  type="checkbox"
                  name="enableEmailTool"
                  checked={adkConfig.enableEmailTool}
                  onChange={handleAdkConfigChange}
                  className="h-4 w-4 mt-0.5 bg-gray-700 border-gray-600 rounded text-blue-500"
                />
                <div>
                  <span className="text-xs font-medium text-gray-200">Email Dispatcher</span>
                  <p className="text-[11px] text-gray-400">Send alert emails and reports to designated contacts.</p>
                </div>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* 4. Custom MCP Endpoints */}
      <div className="border border-gray-700 bg-gray-800/40 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('customEndpoints')}
          aria-expanded={openSections.customEndpoints}
          className="w-full flex items-center justify-between p-3.5 bg-gray-800/80 hover:bg-gray-800 transition-colors text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-base">🌐</span>
            <span className="text-xs font-semibold text-gray-200 uppercase tracking-wide">
              Custom MCP Endpoints
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/50 text-blue-300 border border-blue-700/50">
              {customEndpointCount} configured
            </span>
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-4 w-4 text-gray-400 transform transition-transform ${openSections.customEndpoints ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {openSections.customEndpoints && (
          <div className="p-4 space-y-3 border-t border-gray-700/80">
            <div className="flex justify-between items-center mb-1">
              <p className="text-xs text-gray-400">
                Connect your agent to internal MCP servers or 3rd-party tool providers:
              </p>
              <button
                type="button"
                onClick={handleAddCustomMcp}
                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium transition-colors flex items-center gap-1"
              >
                <span>+</span> Add Endpoint
              </button>
            </div>

            <div className="space-y-3">
              {adkConfig.customMcpEndpoints.map((endpoint, index) => (
                <div
                  key={index}
                  className="flex space-x-2 items-start border border-gray-700 bg-gray-800 p-3 rounded-lg relative group"
                >
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-col">
                      <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                        Variable Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., custom_jira_mcp"
                        value={endpoint.name}
                        onChange={(e) =>
                          handleUpdateCustomMcp(
                            index,
                            'name',
                            e.target.value.replace(/\s+/g, '_')
                          )
                        }
                        className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs"
                      />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                        Endpoint URL
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., https://your-mcp-server.internal"
                        value={endpoint.url}
                        onChange={(e) =>
                          handleUpdateCustomMcp(index, 'url', e.target.value)
                        }
                        className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-mono"
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <button
                        type="button"
                        onClick={() => handleVerifyCustomMcp(index, endpoint.url)}
                        className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-xs transition-colors"
                      >
                        Verify Connection
                      </button>
                      {customMcpStatus[index] && (
                        <span
                          className={`text-xs ${customMcpStatus[index].error ? 'text-red-400' : 'text-green-400'}`}
                        >
                          {customMcpStatus[index].loading
                            ? 'Verifying...'
                            : customMcpStatus[index].error
                            ? `Error: ${customMcpStatus[index].error}`
                            : `Ready (${customMcpStatus[index].tools?.length || 0} tools detected)`}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveCustomMcp(index)}
                    className="text-gray-500 hover:text-red-400 p-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity absolute right-2 top-2"
                    title="Remove Endpoint"
                    aria-label={`Remove custom endpoint ${endpoint.name || index}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {adkConfig.customMcpEndpoints.length === 0 && (
                <p className="text-xs text-gray-500 italic py-1">
                  No custom endpoints configured yet.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 5. Authentication & OAuth Flow */}
      <div className="border border-gray-700 bg-gray-800/40 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('oauth')}
          aria-expanded={openSections.oauth}
          className="w-full flex items-center justify-between p-3.5 bg-gray-800/80 hover:bg-gray-800 transition-colors text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-base">🔐</span>
            <span className="text-xs font-semibold text-gray-200 uppercase tracking-wide">
              Authentication &amp; User Impersonation
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/50 text-blue-300 border border-blue-700/50">
              {oauthCount > 0 ? 'OAuth Active' : 'ADC / Service Account'}
            </span>
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-4 w-4 text-gray-400 transform transition-transform ${openSections.oauth ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {openSections.oauth && (
          <div className="p-4 space-y-3.5 border-t border-gray-700/80">
            <div>
              <label className="flex items-start space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="enableOAuth"
                  checked={adkConfig.enableOAuth}
                  onChange={handleAdkConfigChange}
                  className="h-4 w-4 mt-0.5 bg-gray-700 border-gray-600 rounded text-blue-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-200">Enable End-User OAuth Delegation</span>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Executes tools on behalf of the signed-in user instead of defaulting to the Cloud Run service account.
                  </p>
                </div>
              </label>

              {adkConfig.enableOAuth && (
                <div className="ml-7 mt-3 p-3 rounded bg-gray-900/70 border border-gray-700 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-300 font-medium">Authorizations Resource:</span>
                    {authInputMode === 'select' && authorizations.length > 0 ? (
                      <select
                        name="authId"
                        aria-label="Auth ID"
                        value={adkConfig.authId}
                        onChange={handleAdkConfigChange}
                        className="bg-gray-800 border border-gray-600 rounded-md px-2 py-1 text-xs text-gray-200 min-w-44"
                      >
                        <option value="">-- Select Auth ID --</option>
                        {authorizations.map((auth) => {
                          const aId = auth.name.split('/').pop() || '';
                          return (
                            <option key={auth.name} value={aId}>
                              {auth.displayName || aId}
                            </option>
                          );
                        })}
                      </select>
                    ) : (
                      <input
                        type="text"
                        name="authId"
                        aria-label="Auth ID"
                        value={adkConfig.authId}
                        onChange={handleAdkConfigChange}
                        placeholder="Auth ID (e.g. bq-oauth)"
                        className="bg-gray-800 border border-gray-600 rounded-md px-2 py-1 text-xs text-gray-200 w-36 font-mono"
                      />
                    )}
                    {authorizations.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setAuthInputMode((prev) => (prev === 'select' ? 'manual' : 'select'))
                        }
                        className="text-xs text-blue-400 hover:text-blue-300 underline font-semibold ml-2"
                      >
                        {authInputMode === 'select' ? 'Enter Custom ID' : 'Select from Registry'}
                      </button>
                    )}
                  </div>

                  <label
                    className="flex items-start space-x-2.5 cursor-pointer pt-2 border-t border-gray-800"
                    title="If disabled, tools will fail with an error if no user token is present, instead of defaulting to the service account."
                  >
                    <input
                      type="checkbox"
                      name="allowAdcFallback"
                      checked={adkConfig.allowAdcFallback}
                      onChange={handleAdkConfigChange}
                      className="h-4 w-4 mt-0.5 bg-gray-700 border-gray-600 rounded text-blue-500"
                    />
                    <div>
                      <span className="text-xs font-medium text-gray-300">
                        Allow fallback to Service Account (ADC)
                      </span>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        If no user OAuth token is present in the request header, fall back to default service account credentials.
                      </p>
                    </div>
                  </label>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 6. Observability & Telemetry */}
      <div className="border border-gray-700 bg-gray-800/40 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('observability')}
          aria-expanded={openSections.observability}
          className="w-full flex items-center justify-between p-3.5 bg-gray-800/80 hover:bg-gray-800 transition-colors text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-base">📊</span>
            <span className="text-xs font-semibold text-gray-200 uppercase tracking-wide">
              Observability &amp; Telemetry
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/50 text-blue-300 border border-blue-700/50">
              {observabilityCount} active
            </span>
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-4 w-4 text-gray-400 transform transition-transform ${openSections.observability ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {openSections.observability && (
          <div className="p-4 space-y-3.5 border-t border-gray-700/80">
            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="checkbox"
                name="enableTelemetry"
                checked={adkConfig.enableTelemetry}
                onChange={handleAdkConfigChange}
                className="h-4 w-4 mt-0.5 bg-gray-700 border-gray-600 rounded text-blue-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-200">
                  OpenTelemetry Traces &amp; Latency Metrics
                </span>
                <p className="text-xs text-gray-400 mt-0.5">
                  Populates the agent observability dashboard and streams spans to Google Cloud Trace.
                </p>
              </div>
            </label>

            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="checkbox"
                name="enableMessageLogging"
                checked={adkConfig.enableMessageLogging}
                onChange={handleAdkConfigChange}
                className="h-4 w-4 mt-0.5 bg-gray-700 border-gray-600 rounded text-blue-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-200">
                  Log Prompts &amp; Responses (Payload Logging)
                </span>
                <p className="text-xs text-amber-400/90 mt-0.5">
                  Stores raw user input and model completion bodies for audit and debugging. Ensure proper data residency and user consent.
                </p>
              </div>
            </label>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdkToolsConfig;
