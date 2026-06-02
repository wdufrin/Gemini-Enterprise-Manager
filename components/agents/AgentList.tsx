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
import { Agent, SortableAgentKey, SortConfig } from '../../types';

interface AgentListProps {
  agents: Agent[];
  onSelectAgent: (agent: Agent) => void;
  onEditAgent: (agent: Agent) => void;
  onDeleteAgent: (agent: Agent) => void;
  onRegisterNew: () => void;
  onToggleAgentStatus: (agent: Agent) => void;
  togglingAgentId?: string | null;
  deletingAgentIds: Set<string>;
  selectedAgents: Set<string>;
  onToggleSelect: (name: string) => void;
  onToggleSelectAll: () => void;
  onDeleteSelected: () => void;
  onSort: (key: SortableAgentKey) => void;
  sortConfig: SortConfig;
  onUpdateAgentName?: (agent: Agent, newName: string) => Promise<void>;
}

const SortIcon: React.FC<{ direction: 'asc' | 'desc' }> = ({ direction }) => {
  const path = direction === 'asc'
    ? "M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
    : "M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z";
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d={path} clipRule="evenodd" />
    </svg>
  );
};

const AgentList: React.FC<AgentListProps> = ({ 
  agents, 
  onSelectAgent, 
  onEditAgent, 
  onDeleteAgent, 
  onRegisterNew, 
  onToggleAgentStatus, 
  togglingAgentId, 
  deletingAgentIds, 
  selectedAgents,
  onToggleSelect,
  onToggleSelectAll,
  onDeleteSelected,
  onSort, 
  sortConfig, 
  onUpdateAgentName 
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const isAllSelected = agents.length > 0 && selectedAgents.size === agents.length;

  const handleEditClick = (agent: Agent) => {
    setEditingId(agent.name);
    setEditName(agent.displayName);
  };

  const handleSaveName = async (agent: Agent) => {
    if (!onUpdateAgentName) {
      setEditingId(null);
      return;
    }
    if (editName === agent.displayName || !editName.trim()) {
      setEditingId(null);
      return;
    }
    setIsSaving(true);
    try {
      await onUpdateAgentName(agent, editName);
    } catch (e) {
      // Error handled by parent
    } finally {
      setIsSaving(false);
      setEditingId(null);
    }
  };

  const SortableHeader: React.FC<{ sortKey: SortableAgentKey; children: React.ReactNode; className?: string }> = ({ sortKey, children, className = '' }) => {
    const isSorted = sortConfig?.key === sortKey;
    return (
      <th scope="col" className={`px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider ${className}`}>
        <button onClick={() => onSort(sortKey)} className="flex items-center space-x-1 group focus:outline-none">
          <span className="group-hover:text-white transition-colors">{children}</span>
          <div className="w-4 h-4">
            {isSorted && <SortIcon direction={sortConfig.direction} />}
          </div>
        </button>
      </th>
    );
  };

  return (
    <div className="bg-gray-800 shadow-xl rounded-lg overflow-hidden">
      <div className="p-4 flex justify-between items-center border-b border-gray-700">
        <h2 className="text-xl font-bold text-white">Registered Agents</h2>
        <div className="flex items-center gap-4">
          {selectedAgents.size > 0 && (
            <>
              <span className="text-sm text-gray-300">{selectedAgents.size} selected</span>
              <button
                onClick={onDeleteSelected}
                className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-md hover:bg-red-700"
              >
                Delete Selected
              </button>
            </>
          )}
          <button
            onClick={onRegisterNew}
            className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-green-500"
          >
            Register New Agent
          </button>
        </div>
      </div>
      {agents.length === 0 ? (
        <p className="text-gray-400 p-6 text-center">No agents found for the provided configuration.</p>
      ) : (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-700/50">
                    <tr>
                        <th scope="col" className="px-6 py-3 w-10">
                          <input
                              type="checkbox"
                              checked={isAllSelected}
                              onChange={onToggleSelectAll}
                              aria-label="Select all agents"
                              className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600"
                          />
                        </th>
                        <SortableHeader sortKey="displayName">Display Name</SortableHeader>
                        <SortableHeader sortKey="state">Status</SortableHeader>
                        <SortableHeader sortKey="agentType">Agent Type</SortableHeader>
                        <SortableHeader sortKey="name">Agent ID</SortableHeader>
                        <SortableHeader sortKey="updateTime">Last Modified</SortableHeader>
                        <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
                            Actions
                        </th>
                    </tr>
                </thead>
                <tbody className="bg-gray-800 divide-y divide-gray-700">
                    {agents.map((agent) => {
                        const agentId = agent.name.split('/').pop() || '';
                        const isToggling = togglingAgentId === agentId;
                        const isDeleting = deletingAgentIds.has(agent.name);
                        const isSelected = selectedAgents.has(agent.name);
                        const statusColorClass = agent.state === 'ENABLED' ? 'bg-green-500' : agent.state === 'DISABLED' ? 'bg-red-500' : 'bg-yellow-500';

                        let statusButton = null;
                        if (agent.state === 'ENABLED' || agent.state === 'DISABLED') {
                            const isEnabled = agent.state === 'ENABLED';
                            const statusProps = {
                                text: isEnabled ? 'Enabled' : 'Disabled',
                                colorClasses: isEnabled ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-red-500 text-white hover:bg-red-600',
                            };
                            statusButton = (
                                isToggling ? (
                                    <div className="flex items-center space-x-2">
                                        <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-gray-400"></div>
                                        <span className="text-xs text-gray-400">Updating...</span>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => onToggleAgentStatus(agent)}
                                        className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${statusProps.colorClasses}`}
                                        disabled={isToggling || isDeleting}
                                    >
                                        {statusProps.text}
                                    </button>
                                )
                            );
                        } else {
                            statusButton = <span className="px-3 py-1 text-xs font-semibold rounded-full bg-yellow-500 text-black">Private</span>
                        }

                        return (
                            <tr key={agent.name} className={`${isSelected ? 'bg-blue-900/50' : 'hover:bg-gray-700/50'} transition-colors`}>
                                <td className="px-6 py-4">
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => onToggleSelect(agent.name)}
                                        aria-label={`Select agent ${agent.displayName}`}
                                        className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600"
                                    />
                                </td>
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
                                            {onUpdateAgentName && (
                                                <button 
                                                    onClick={() => handleEditClick(agent)}
                                                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-400 transition-opacity"
                                                    title="Edit Name"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    {statusButton}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{agent.agentType || 'N/A'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 font-mono">{agentId}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                                    {agent.updateTime ? new Date(agent.updateTime).toLocaleString() : 'N/A'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-4">
                                    {isDeleting ? (
                                        <span className="text-xs text-gray-400 italic">Deleting...</span>
                                    ) : (
                                        <>
                                            <button onClick={() => onSelectAgent(agent)} disabled={isToggling} className="font-semibold text-blue-400 hover:text-blue-300 disabled:text-gray-500">
                                                View
                                            </button>
                                            {(agent.state === 'ENABLED' || agent.state === 'DISABLED') && (
                                                <button 
                                                    onClick={() => onEditAgent(agent)} 
                                                    disabled={isToggling} 
                                                    className="font-semibold text-indigo-400 hover:text-indigo-300 disabled:text-gray-500"
                                                    title="Edit Agent"
                                                >
                                                    Edit
                                                </button>
                                            )}
                                            <button onClick={() => onDeleteAgent(agent)} disabled={isToggling} className="font-semibold text-red-400 hover:text-red-300 disabled:text-gray-500">
                                                Delete
                                            </button>
                                        </>
                                    )}
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

export default AgentList;