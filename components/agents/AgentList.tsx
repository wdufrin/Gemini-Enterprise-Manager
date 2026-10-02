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

import React, { useState, useMemo } from 'react';
import { Agent, SortableAgentKey, SortConfig } from '../../types';
import * as api from '../../services/apiService';

interface AgentListProps {
  agents: Agent[];
  onSelectAgent: (agent: Agent) => void;
  onEditAgent: (agent: Agent) => void;
  onDeleteAgent: (agent: Agent) => void;
  onRegisterNew: () => void;
  onOpenBulkDatasources?: () => void;
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

type StatusFilter = 'ALL' | 'ENABLED' | 'DISABLED' | 'PRIVATE';
type ScopeFilter = 'ALL' | 'ALL_USERS' | 'RESTRICTED' | 'PRIVATE';

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

const getAgentSharingScope = (agent: Agent): 'ALL_USERS' | 'RESTRICTED' | 'PRIVATE' => {
  const isShared = agent.state === 'ENABLED' || agent.state === 'DISABLED';
  if (!isShared) return 'PRIVATE';
  return agent.sharingConfig?.scope === 'ALL_USERS' ? 'ALL_USERS' : 'RESTRICTED';
};

const AgentList: React.FC<AgentListProps> = ({ 
  agents, 
  onSelectAgent, 
  onEditAgent, 
  onDeleteAgent, 
  onRegisterNew, 
  onOpenBulkDatasources,
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

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('ALL');

  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    agents.forEach(a => {
      if (a.agentType) types.add(a.agentType);
    });
    return Array.from(types).sort();
  }, [agents]);

  const statusCounts = useMemo(() => {
    let enabled = 0;
    let disabled = 0;
    let priv = 0;
    agents.forEach(a => {
      if (a.state === 'ENABLED') enabled++;
      else if (a.state === 'DISABLED') disabled++;
      else priv++;
    });
    return { ALL: agents.length, ENABLED: enabled, DISABLED: disabled, PRIVATE: priv };
  }, [agents]);

  const filteredAgents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return agents.filter(agent => {
      if (statusFilter === 'ENABLED' && agent.state !== 'ENABLED') return false;
      if (statusFilter === 'DISABLED' && agent.state !== 'DISABLED') return false;
      if (statusFilter === 'PRIVATE' && (agent.state === 'ENABLED' || agent.state === 'DISABLED')) return false;

      if (typeFilter !== 'ALL' && (agent.agentType || 'N/A') !== typeFilter) return false;

      if (scopeFilter !== 'ALL' && getAgentSharingScope(agent) !== scopeFilter) return false;

      if (q) {
        const agentId = (agent.name.split('/').pop() || '').toLowerCase();
        const displayName = (agent.displayName || '').toLowerCase();
        const description = (agent.description || '').toLowerCase();
        const agentType = (agent.agentType || '').toLowerCase();
        const ownerHint = (api.extractAgentOwnerHint(agent) || '').toLowerCase();
        return (
          displayName.includes(q) ||
          agentId.includes(q) ||
          description.includes(q) ||
          agentType.includes(q) ||
          ownerHint.includes(q)
        );
      }
      return true;
    });
  }, [agents, searchQuery, statusFilter, typeFilter, scopeFilter]);

  const isAllSelected = filteredAgents.length > 0 && filteredAgents.every(a => selectedAgents.has(a.name));

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
    } catch {
      // Error handled by parent
    } finally {
      setIsSaving(false);
      setEditingId(null);
    }
  };

  const SortableHeader: React.FC<{ sortKey: SortableAgentKey; children: React.ReactNode; className?: string }> = ({ sortKey, children, className = '' }) => {
    const isSorted = sortConfig?.key === sortKey;
    const sortAria = isSorted
      ? sortConfig.direction === 'asc'
        ? 'ascending'
        : 'descending'
      : 'none';
    const labelText = typeof children === 'string' ? children : String(sortKey);
    return (
      <th 
        scope="col" 
        aria-sort={sortAria}
        className={`px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider ${className}`}
      >
        <button 
          type="button"
          onClick={() => onSort(sortKey)} 
          className="flex items-center space-x-1 group focus:outline-none focus:ring-2 focus:ring-blue-500 rounded p-0.5"
          aria-label={`Sort by ${labelText}, currently ${isSorted ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'unsorted'}`}
        >
          <span className="group-hover:text-white transition-colors">{children}</span>
          <div className="w-4 h-4" aria-hidden="true">
            {isSorted && <SortIcon direction={sortConfig.direction} />}
          </div>
        </button>
      </th>
    );
  };

  const hasActiveFilters = searchQuery.trim() !== '' || statusFilter !== 'ALL' || typeFilter !== 'ALL' || scopeFilter !== 'ALL';

  return (
    <div className="bg-gray-800 shadow-xl rounded-lg overflow-hidden">
      <div className="p-4 flex flex-wrap justify-between items-center gap-3 border-b border-gray-700">
        <div>
          <h2 className="text-xl font-bold text-white">Registered Agents</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Showing {filteredAgents.length} of {agents.length} agent{agents.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {selectedAgents.size > 0 && (
            <>
              <span className="text-sm text-gray-300 font-medium">{selectedAgents.size} selected</span>
              {onOpenBulkDatasources && (
                <button
                  type="button"
                  onClick={onOpenBulkDatasources}
                  className="px-3.5 py-2 bg-cyan-900/60 text-cyan-200 border border-cyan-600/60 text-sm font-semibold rounded-md hover:bg-cyan-800/70 flex items-center gap-2 transition-colors"
                  title="Bulk update or migrate Data Connectors and Data Stores for the selected agents"
                >
                  <span>Bulk Update Selected ({selectedAgents.size})</span>
                </button>
              )}
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

      {/* Search & Filter Toolbar */}
      {agents.length > 0 && (
        <div className="p-4 bg-gray-900/40 border-b border-gray-700 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, ID, owner, or description..."
              aria-label="Search agents"
              className="w-full bg-gray-700 border border-gray-600 rounded-md pl-9 pr-8 py-1.5 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-gray-400 hover:text-white text-xs"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status filter pills */}
            <div className="flex items-center bg-gray-900/80 p-1 rounded-md border border-gray-700">
              {(['ALL', 'ENABLED', 'DISABLED', 'PRIVATE'] as StatusFilter[]).map((st) => {
                const active = statusFilter === st;
                const label = st === 'ALL' ? 'All' : st === 'ENABLED' ? 'Enabled' : st === 'DISABLED' ? 'Disabled' : 'Private';
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                      active ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {label} ({statusCounts[st]})
                  </button>
                );
              })}
            </div>

            {/* Agent Type filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="Filter by Agent Type"
              className="bg-gray-700 border border-gray-600 rounded-md px-2.5 py-1.5 text-xs text-gray-200 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="ALL">All Types</option>
              {availableTypes.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            {/* Sharing Scope filter */}
            <select
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value as ScopeFilter)}
              aria-label="Filter by Sharing Scope"
              className="bg-gray-700 border border-gray-600 rounded-md px-2.5 py-1.5 text-xs text-gray-200 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="ALL">All Scopes</option>
              <option value="ALL_USERS">All Users</option>
              <option value="RESTRICTED">Restricted IAM</option>
              <option value="PRIVATE">Private</option>
            </select>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                  setTypeFilter('ALL');
                  setScopeFilter('ALL');
                }}
                className="px-2.5 py-1.5 text-xs text-blue-400 hover:text-blue-300 font-medium"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>
      )}

      {agents.length === 0 ? (
        <p className="text-gray-400 p-6 text-center">No agents found for the provided configuration.</p>
      ) : filteredAgents.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-gray-400 text-sm">No agents match your current search or filters.</p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('ALL');
              setTypeFilter('ALL');
              setScopeFilter('ALL');
            }}
            className="mt-3 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs font-semibold rounded-md"
          >
            Clear Filters
          </button>
        </div>
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
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                            Sharing & Owner
                        </th>
                        <SortableHeader sortKey="agentType">Agent Type</SortableHeader>
                        <SortableHeader sortKey="name">Agent ID</SortableHeader>
                        <SortableHeader sortKey="updateTime">Last Modified</SortableHeader>
                        <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
                            Actions
                        </th>
                    </tr>
                </thead>
                <tbody className="bg-gray-800 divide-y divide-gray-700">
                    {filteredAgents.map((agent) => {
                        const agentId = agent.name.split('/').pop() || '';
                        const isToggling = togglingAgentId === agentId;
                        const isDeleting = deletingAgentIds.has(agent.name);
                        const isSelected = selectedAgents.has(agent.name);
                        const statusColorClass = agent.state === 'ENABLED' ? 'bg-green-500' : agent.state === 'DISABLED' ? 'bg-red-500' : 'bg-yellow-500';
                        const sharingScope = getAgentSharingScope(agent);
                        const ownerHint = api.extractAgentOwnerHint(agent);

                        let statusButton: React.ReactNode = null;
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
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                                    <div className="flex items-center">
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
                                                <button
                                                    type="button"
                                                    onClick={() => onSelectAgent(agent)}
                                                    className="text-left hover:text-blue-400 transition-colors"
                                                >
                                                    {agent.displayName}
                                                </button>
                                                {onUpdateAgentName && (
                                                    <button 
                                                        type="button"
                                                        onClick={() => handleEditClick(agent)}
                                                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-gray-400 hover:text-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500 rounded p-0.5 transition-opacity"
                                                        title="Edit Name"
                                                        aria-label={`Edit name for ${agent.displayName}`}
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    {statusButton}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-xs">
                                    <div className="flex flex-col gap-1">
                                        {sharingScope === 'ALL_USERS' ? (
                                            <span className="inline-flex items-center w-fit px-2 py-0.5 rounded bg-emerald-900/50 text-emerald-300 border border-emerald-700/50 font-medium">
                                                All Users
                                            </span>
                                        ) : sharingScope === 'RESTRICTED' ? (
                                            <span className="inline-flex items-center w-fit px-2 py-0.5 rounded bg-blue-900/50 text-blue-300 border border-blue-700/50 font-medium">
                                                Restricted IAM
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center w-fit px-2 py-0.5 rounded bg-gray-700 text-gray-300 border border-gray-600 font-medium">
                                                Private
                                            </span>
                                        )}
                                        {ownerHint && (
                                            <span className="text-[11px] text-gray-400 font-mono truncate max-w-[180px]" title={`Owner: ${ownerHint}`}>
                                                {ownerHint}
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{agent.agentType || 'N/A'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 font-mono">{agentId}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                                    {agent.updateTime ? new Date(agent.updateTime).toLocaleString() : 'N/A'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
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