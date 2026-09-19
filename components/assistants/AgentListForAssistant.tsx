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

import React, { useState } from 'react';
import { Agent, AppEngine, Config } from '../../types';
import * as api from '../../services/apiService';
import { useToast } from '../../context/ToastContext';
import { toErrorMessage } from '../../utils/errors';
import InfoTooltip from '../InfoTooltip';

interface AgentListForAssistantProps {
  agents: Agent[];
  config: Config;
  engine?: AppEngine;
  onRefreshAgents: () => void;
}

const AgentListForAssistant: React.FC<AgentListForAssistantProps> = ({
  agents,
  config,
  engine,
  onRefreshAgents,
}) => {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isEnforcing, setIsEnforcing] = useState(false);
  const [enforcingAgentName, setEnforcingAgentName] = useState<string | null>(null);

  // App-level telemetry state from parent App Engine
  const isAppTelemetryEnabled = Boolean(engine?.observabilityConfig?.observabilityEnabled);
  const isAppSensitiveEnabled = Boolean(engine?.observabilityConfig?.sensitiveLoggingEnabled);

  // Option to include sensitive data logging when bulk enforcing
  const [bulkIncludeSensitive, setBulkIncludeSensitive] = useState<boolean>(isAppSensitiveEnabled);

  // Sync with engine when engine prop updates
  React.useEffect(() => {
    setBulkIncludeSensitive(isAppSensitiveEnabled);
  }, [isAppSensitiveEnabled]);

  // Modal state for fine-grained configuration of an individual agent
  const [configuringAgent, setConfiguringAgent] = useState<Agent | null>(null);
  const [configAgentObs, setConfigAgentObs] = useState<boolean>(false);
  const [configAgentSens, setConfigAgentSens] = useState<boolean>(false);

  // Breakdown counts for visual summary
  const fullCount = agents.filter(
    (a) => a.observabilityConfig?.observabilityEnabled && a.observabilityConfig?.sensitiveLoggingEnabled,
  ).length;

  const partialCount = agents.filter(
    (a) => a.observabilityConfig?.observabilityEnabled && !a.observabilityConfig?.sensitiveLoggingEnabled,
  ).length;

  const monitoredCount = fullCount + partialCount;
  const disabledCount = agents.length - monitoredCount;

  // Compliance check against the desired target policy
  const isAgentCompliant = (agent: Agent) => {
    const obs = Boolean(agent.observabilityConfig?.observabilityEnabled);
    const sens = Boolean(agent.observabilityConfig?.sensitiveLoggingEnabled);
    return obs === true && sens === bulkIncludeSensitive;
  };

  const allAgentsCompliant = agents.length > 0 && agents.every(isAgentCompliant);
  const isEnforceDisabled = !isAppTelemetryEnabled || isEnforcing || (agents.length > 0 && allAgentsCompliant);

  const handleEnforceAllTelemetry = async () => {
    if (!isAppTelemetryEnabled) return;
    setIsEnforcing(true);
    try {
      const res = await api.bulkEnforceAgentsObservability(agents, config, {
        observabilityEnabled: true,
        sensitiveLoggingEnabled: bulkIncludeSensitive,
      });
      if (res.failed > 0) {
        toast.warning(
          `Observability policy partially synchronized: ${res.updated} updated, ${res.alreadyCompliant} compliant, ${res.failed} skipped due to legacy schema blocks.`,
        );
      } else {
        toast.success(
          `Observability policy synchronized: ${res.updated} agent(s) updated (Traces: ON, Sensitive: ${bulkIncludeSensitive ? 'ON' : 'OFF'}, ${res.alreadyCompliant} already compliant).`,
        );
      }
      onRefreshAgents();
    } catch (e) {
      console.error('Failed to bulk-enforce observability', e);
      toast.error('Failed to enforce observability: ' + toErrorMessage(e));
    } finally {
      setIsEnforcing(false);
    }
  };

  const handleUpdateAgentObservability = async (
    agent: Agent,
    options: {
      observabilityEnabled: boolean;
      sensitiveLoggingEnabled: boolean;
    },
  ) => {
    setEnforcingAgentName(agent.name);
    try {
      await api.updateAgent(
        agent,
        {
          observabilityConfig: {
            observabilityEnabled: options.observabilityEnabled,
            sensitiveLoggingEnabled: options.sensitiveLoggingEnabled,
          },
        },
        config,
      );
      toast.success(
        `Updated telemetry for "${agent.displayName || 'Agent'}": Traces ${options.observabilityEnabled ? 'ON' : 'OFF'}, Sensitive Logs ${options.sensitiveLoggingEnabled ? 'ON' : 'OFF'}.`,
      );
      onRefreshAgents();
    } catch (e) {
      console.error('Failed to update agent telemetry', e);
      const errMsg = toErrorMessage(e);
      if (errMsg.includes('agent.authorizations') || errMsg.includes('deprecated') || errMsg.includes('Legacy Schema')) {
        toast.error(
          `Cannot update "${agent.displayName || 'Agent'}": Resource uses legacy 'authorizations' schema rejected by Google API. Download config and re-create agent.`,
        );
      } else {
        toast.error('Failed to update agent telemetry: ' + errMsg);
      }
    } finally {
      setEnforcingAgentName(null);
    }
  };

  const handleToggleSingleAgentTelemetry = async (agent: Agent) => {
    const currentObs = Boolean(agent.observabilityConfig?.observabilityEnabled);
    const nextObs = !currentObs;
    // When turning ON, align sensitive logging with the parent App Engine's setting
    const nextSensitive = nextObs ? isAppSensitiveEnabled : false;
    await handleUpdateAgentObservability(agent, {
      observabilityEnabled: nextObs,
      sensitiveLoggingEnabled: nextSensitive,
    });
  };

  const handleEditClick = (agent: Agent) => {
    setEditingId(agent.name);
    setEditName(agent.displayName);
  };

  const handleSaveName = async (agent: Agent) => {
    if (editName === agent.displayName || !editName.trim()) {
      setEditingId(null);
      return;
    }
    setIsSaving(true);
    try {
      await api.updateAgent(agent, { displayName: editName }, config);
      onRefreshAgents();
    } catch (e) {
      console.error("Failed to update agent name", e);
      toast.error("Failed to update agent name: " + toErrorMessage(e));
    } finally {
      setIsSaving(false);
      setEditingId(null);
    }
  };

  const handleDownloadAgentConfig = async (agent: Agent) => {
    try {
      const fullAgent = await api.getAgent(agent.name, config);
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(fullAgent, null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href",     dataStr);
      downloadAnchorNode.setAttribute("download", `${fullAgent.displayName.toLowerCase().replace(/\\s+/g, '_')}_config.json`);
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
    } catch (e) {
      console.error("Failed to download agent config", e);
      toast.error("Failed to download agent configuration: " + toErrorMessage(e));
    }
  };

  return (
    <div className="bg-gray-800 shadow-xl rounded-lg flex flex-col">
      <div className="p-4 border-b border-gray-700 flex justify-between items-center flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-xl font-bold text-white">Registered Agents ({agents.length})</h2>
          {agents.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                  fullCount === agents.length
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
                    : monitoredCount > 0
                    ? 'bg-blue-950/80 text-blue-300 border-blue-700/60'
                    : 'bg-gray-800 text-gray-400 border-gray-700'
                }`}
                title={`Telemetry coverage: ${fullCount} full (traces + sensitive), ${partialCount} partial (traces only), ${disabledCount} disabled`}
              >
                Telemetry: {monitoredCount} / {agents.length} Monitored
                {monitoredCount > 0 && (
                  <span className="text-[10px] text-blue-300/80 font-normal ml-1">
                    ({fullCount} Full · {partialCount} Partial)
                  </span>
                )}
              </span>

              {!isAppTelemetryEnabled && (
                <span
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-800/70 flex items-center gap-1"
                  title="App Engine usage audit logging is OFF. Enabling agent telemetry captures sub-agent traces, but top-level user prompts and search queries remain unlogged."
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                  App Telemetry: OFF
                </span>
              )}
            </div>
          )}
        </div>
        {agents.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {isAppTelemetryEnabled && (
              <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer bg-gray-900/60 px-2 py-1 rounded border border-gray-700/60">
                <input
                  type="checkbox"
                  checked={bulkIncludeSensitive}
                  onChange={(e) => setBulkIncludeSensitive(e.target.checked)}
                  disabled={isEnforcing}
                  className="h-3.5 w-3.5 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-[11px] text-gray-300">Include Sensitive Data</span>
              </label>
            )}

            <button
              type="button"
              onClick={handleEnforceAllTelemetry}
              disabled={isEnforceDisabled}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md shadow-sm transition-colors flex items-center gap-1.5 ${
                !isAppTelemetryEnabled
                  ? 'bg-gray-750 text-gray-500 border border-gray-700 cursor-not-allowed opacity-60'
                  : 'bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white'
              }`}
              title={
                !isAppTelemetryEnabled
                  ? "App-level usage audit logging is disabled on this App Engine. Enable telemetry on the App Engine first to enforce telemetry across child agents, or toggle individual agents manually."
                  : allAgentsCompliant
                  ? "All child agents already match the selected telemetry policy."
                  : "Synchronize child agent telemetry with the specified policy."
              }
            >
              {isEnforcing ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Enforcing Telemetry...</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>
                    {!isAppTelemetryEnabled
                      ? 'Enforce Telemetry Policy'
                      : allAgentsCompliant
                      ? 'All Agents Monitored'
                      : 'Enforce Telemetry Policy'}
                  </span>
                </>
              )}
            </button>
            <InfoTooltip
              title="Telemetry Policy"
              position="bottom"
              align="right"
              text={
                !isAppTelemetryEnabled
                  ? "App-level usage audit logging is disabled on this App Engine. Enable telemetry on the App Engine first to enforce telemetry across child agents, or toggle individual agents manually below."
                  : `Enforcing telemetry synchronizes all child agents to enable OpenTelemetry (Sensitive Logging: ${bulkIncludeSensitive ? 'Enabled' : 'Disabled'}). This ensures agent reasoning steps and tool execution traces are captured in Cloud Logging and BigQuery.`
              }
            />
          </div>
        )}
      </div>
      {agents.length === 0 ? (
        <p className="text-gray-400 p-6 text-center flex-1">No agents found for this assistant.</p>
      ) : (
        <div className="overflow-y-auto flex-1 rounded-b-lg">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-700/50 sticky top-0">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Display Name</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Telemetry</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Agent Type</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Agent ID</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {agents.map((agent) => {
                const agentId = agent.name.split('/').pop() || '';
                const statusColorClass = agent.state === 'ENABLED' ? 'bg-green-500' : agent.state === 'DISABLED' ? 'bg-red-500' : 'bg-yellow-500';
                const statusText = agent.state ? agent.state.charAt(0) + agent.state.slice(1).toLowerCase() : 'Private';
                const isObsEnabled = Boolean(agent.observabilityConfig?.observabilityEnabled);
                const isSensEnabled = Boolean(agent.observabilityConfig?.sensitiveLoggingEnabled);
                const hasLegacyAuth = Boolean(agent.authorizations && agent.authorizations.length > 0);

                return (
                  <tr key={agent.name} className="hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white flex items-center">
                        <span className={`h-2.5 w-2.5 rounded-full mr-3 shrink-0 ${statusColorClass}`}></span>
                        {editingId === agent.name ? (
                            <form 
                                onSubmit={(e) => { e.preventDefault(); handleSaveName(agent); }}
                                className="flex items-center gap-2"
                            >
                                <input 
                                    autoFocus
                                    type="text" 
                                    value={editName} 
                                    onChange={(e) => setEditName(e.target.value)} 
                                    className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white focus:outline-none focus:ring-1 focus:ring-blue-500" 
                                />
                                <button type="submit" disabled={isSaving} className="text-blue-400 hover:text-blue-300 font-semibold text-xs disabled:opacity-50">
                                    {isSaving ? '...' : 'Save'}
                                </button>
                                <button type="button" onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-300 font-semibold text-xs">
                                    Cancel
                                </button>
                            </form>
                        ) : (
                            <div className="flex items-center gap-2 group">
                                <span>{agent.displayName}</span>
                                {hasLegacyAuth && (
                                  <span
                                    className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-950/90 text-amber-300 border border-amber-700/70"
                                    title="Uses legacy agent.authorizations schema. In-place updates rejected by Google Cloud Discovery Engine API."
                                  >
                                    Legacy Schema
                                  </span>
                                )}
                                <button 
                                    onClick={() => handleEditClick(agent)}
                                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-400 transition-opacity"
                                    title="Edit Name"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                                </button>
                            </div>
                        )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusColorClass} ${statusText === 'Private' ? 'text-black' : 'text-white'}`}>
                            {statusText}
                        </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="space-y-1.5">
                        {/* Visual Status Indicator: Shows if All or Part are enabled */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {isObsEnabled && isSensEnabled ? (
                            <span
                              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-950/90 text-emerald-300 border border-emerald-700/60"
                              title="Full observability: OpenTelemetry distributed traces and sensitive prompt logging are both active."
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                              <span>All Enabled (Full)</span>
                            </span>
                          ) : isObsEnabled ? (
                            <span
                              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-950/90 text-blue-300 border border-blue-700/60"
                              title="Partial observability: OpenTelemetry distributed traces are active, but sensitive prompt payloads are excluded."
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                              <span>Part Enabled (Traces Only)</span>
                            </span>
                          ) : hasLegacyAuth ? (
                            <span
                              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-950/90 text-amber-300 border border-amber-700/60"
                              title="Telemetry disabled. Legacy authorizations schema prevents in-place updates. Download JSON and re-create to enable."
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                              <span>Disabled (Legacy Blocked)</span>
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-850 text-gray-400 border border-gray-700"
                              title="Telemetry is completely disabled for this agent."
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
                              <span>Disabled</span>
                            </span>
                          )}

                          {/* Primary toggle button */}
                          <button
                            type="button"
                            onClick={() => handleToggleSingleAgentTelemetry(agent)}
                            disabled={enforcingAgentName === agent.name}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border transition-colors ${
                              isObsEnabled
                                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60 hover:bg-emerald-900'
                                : 'bg-amber-950/80 text-amber-300 border border-amber-700/60 hover:bg-amber-900'
                            }`}
                            title={
                              isObsEnabled
                                ? 'OpenTelemetry active. Click to disable.'
                                : hasLegacyAuth
                                ? 'Legacy agent schema. In-place API updates rejected by Google.'
                                : 'Telemetry disabled. Click to turn ON OpenTelemetry & prompt logging.'
                            }
                          >
                            <span>{isObsEnabled ? 'ON' : 'OFF'}</span>
                            {isSensEnabled && (
                              <span className="text-[10px] text-emerald-400/80 font-normal">(Sensitive)</span>
                            )}
                            {!isObsEnabled && (
                              <span className="text-[10px] underline ml-0.5">
                                {hasLegacyAuth ? 'Legacy' : 'Enable'}
                              </span>
                            )}
                          </button>

                          {/* Configure 2 Options Gear Icon */}
                          <button
                            type="button"
                            onClick={() => {
                              setConfiguringAgent(agent);
                              setConfigAgentObs(isObsEnabled);
                              setConfigAgentSens(isSensEnabled);
                            }}
                            disabled={enforcingAgentName === agent.name}
                            className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                            title={`Configure both telemetry options for ${agent.displayName || 'this agent'}`}
                            aria-label={`Configure telemetry options for ${agent.displayName || 'agent'}`}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </button>
                        </div>

                        {/* Quick Two Options Controls */}
                        <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                          <span className="text-[10px] text-gray-500 uppercase font-mono">Options:</span>
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateAgentObservability(agent, {
                                observabilityEnabled: !isObsEnabled,
                                sensitiveLoggingEnabled: !isObsEnabled ? isSensEnabled : false,
                              })
                            }
                            disabled={enforcingAgentName === agent.name}
                            className={`px-1.5 py-0.5 rounded font-mono border transition-colors ${
                              isObsEnabled
                                ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700/60 hover:bg-emerald-900'
                                : 'bg-gray-800/80 text-gray-400 border-gray-700 hover:text-white hover:bg-gray-700'
                            }`}
                            title="Option 1: OpenTelemetry distributed tracing"
                          >
                            1. Traces: {isObsEnabled ? 'ON' : 'OFF'}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateAgentObservability(agent, {
                                observabilityEnabled: true,
                                sensitiveLoggingEnabled: !isSensEnabled,
                              })
                            }
                            disabled={enforcingAgentName === agent.name || !isObsEnabled}
                            className={`px-1.5 py-0.5 rounded font-mono border transition-colors ${
                              !isObsEnabled
                                ? 'bg-gray-900/40 text-gray-600 border-gray-800/50 cursor-not-allowed'
                                : isSensEnabled
                                ? 'bg-purple-950/70 text-purple-300 border-purple-700/60 hover:bg-purple-900'
                                : 'bg-gray-800/80 text-gray-400 border-gray-700 hover:text-white hover:bg-gray-700'
                            }`}
                            title={
                              !isObsEnabled
                                ? 'Enable Traces first to log sensitive prompts'
                                : 'Option 2: Sensitive prompt & payload data logging'
                            }
                          >
                            2. Sensitive: {isSensEnabled ? 'ON' : 'OFF'}
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{agent.agentType || 'N/A'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 font-mono">{agentId}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button 
                        onClick={() => handleDownloadAgentConfig(agent)} 
                        className="text-blue-400 hover:text-blue-300 font-semibold"
                        title="Download JSON Configuration"
                      >
                        Download
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Configure Agent Telemetry Modal */}
      {configuringAgent && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="configure-telemetry-title"
        >
          <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 id="configure-telemetry-title" className="text-base font-bold text-white">
                  Configure Agent Telemetry
                </h3>
                <p className="text-xs text-gray-400 mt-0.5 font-mono">
                  {configuringAgent.displayName || configuringAgent.name.split('/').pop()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfiguringAgent(null)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors"
                title="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed">
              Google Cloud Discovery Engine provides 2 separate telemetry options for each agent. Specify which telemetry streams to activate:
            </p>

            <div className="space-y-3 bg-gray-850 p-3.5 rounded-lg border border-gray-800 text-xs">
              {/* Option 1: OpenTelemetry */}
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={configAgentObs}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setConfigAgentObs(checked);
                    if (!checked) setConfigAgentSens(false);
                  }}
                  className="mt-0.5 h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="font-semibold text-white">1. OpenTelemetry Distributed Tracing</div>
                  <div className="text-gray-400 text-[11px] leading-relaxed mt-0.5">
                    Captures multi-turn reasoning steps, tool invocation inputs/outputs, and latency spans in Cloud Trace & BigQuery.
                  </div>
                </div>
              </label>

              {/* Option 2: Sensitive Data Logging */}
              <label className={`flex items-start gap-2.5 transition-opacity ${configAgentObs ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}>
                <input
                  type="checkbox"
                  checked={configAgentSens}
                  onChange={(e) => setConfigAgentSens(e.target.checked)}
                  disabled={!configAgentObs}
                  className="mt-0.5 h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="font-semibold text-white">2. Sensitive Prompt & Payload Logging</div>
                  <div className="text-gray-400 text-[11px] leading-relaxed mt-0.5">
                    Logs unredacted user prompts, search queries, and raw tool arguments. Required for deep audits, but subject to organizational data governance policies.
                  </div>
                </div>
              </label>
            </div>

            {/* Live Resulting Coverage Preview */}
            <div className="flex items-center justify-between p-2.5 bg-gray-950/80 rounded-lg border border-gray-800 text-xs">
              <span className="text-gray-400">Resulting Coverage:</span>
              {configAgentObs && configAgentSens ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-950/90 text-emerald-300 border border-emerald-700/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  All Enabled (Full)
                </span>
              ) : configAgentObs ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-950/90 text-blue-300 border border-blue-700/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                  Part Enabled (Traces Only)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-800 text-gray-400 border border-gray-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
                  Disabled
                </span>
              )}
            </div>

            <div className="flex justify-end items-center gap-2 pt-2 border-t border-gray-800">
              <button
                type="button"
                onClick={() => setConfiguringAgent(null)}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-gray-300 hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = configuringAgent;
                  setConfiguringAgent(null);
                  if (target) {
                    await handleUpdateAgentObservability(target, {
                      observabilityEnabled: configAgentObs,
                      sensitiveLoggingEnabled: configAgentSens,
                    });
                  }
                }}
                className="px-3.5 py-1.5 rounded-md text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-sm"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentListForAssistant;