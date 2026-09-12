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
import { Agent, Config } from '../../types';
import * as api from '../../services/apiService';
import { useToast } from '../../context/ToastContext';
import { toErrorMessage } from '../../utils/errors';

interface AgentListForAssistantProps {
  agents: Agent[];
  config: Config;
  onRefreshAgents: () => void;
}

const AgentListForAssistant: React.FC<AgentListForAssistantProps> = ({ agents, config, onRefreshAgents }) => {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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
    <div className="bg-gray-800 shadow-xl rounded-lg overflow-hidden flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-xl font-bold text-white">Registered Agents ({agents.length})</h2>
      </div>
      {agents.length === 0 ? (
        <p className="text-gray-400 p-6 text-center flex-1">No agents found for this assistant.</p>
      ) : (
        <div className="overflow-y-auto flex-1">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-700/50 sticky top-0">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Display Name</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
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
                                {agent.displayName}
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
    </div>
  );
};

export default AgentListForAssistant;