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

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Agent, Config, SortableAgentKey, SortConfig } from '../../types';
import * as api from '../../services/apiService';
import { runBigQueryQuery } from '../../services/api/bigquery';
import { toErrorMessage } from '../../utils/errors';
import ExportAgentRegistryModal from './ExportAgentRegistryModal';

export interface AgentAdoptionMetric {
  queryCount30d: number;
  activeUsers30d: number;
}

export function extractAgentFleetSource(
  agent: Agent,
): { location: string; engineId: string } | null {
  const parts = (agent.name || '').split('/');
  const locIdx = parts.indexOf('locations');
  const engIdx = parts.indexOf('engines');
  const location = locIdx >= 0 && parts[locIdx + 1] ? parts[locIdx + 1] : '';
  const engineId = engIdx >= 0 && parts[engIdx + 1] ? parts[engIdx + 1] : '';
  if (!location || !engineId) return null;
  return { location, engineId };
}

export function buildAgent30dAdoptionSql(
  projectId: string,
  datasetId: string,
): string {
  const cleanProject = (projectId || '').trim();
  const cleanDataset = (datasetId || '').trim();
  if (!cleanProject || !/^[A-Za-z0-9_.:-]+$/.test(cleanProject)) {
    throw new Error(
      `Invalid BigQuery project identifier "${projectId}". Only alphanumeric, hyphen, underscore, colon, and dot characters are permitted.`,
    );
  }
  if (!cleanDataset || !/^[A-Za-z0-9_]+$/.test(cleanDataset)) {
    throw new Error(
      `Invalid BigQuery dataset identifier "${datasetId}". Only letters, digits, and underscores are permitted.`,
    );
  }
  return `SELECT
  COALESCE(NULLIF(TRIM(agent_id), ''), NULLIF(TRIM(agent_name), '')) AS agent_key,
  ANY_VALUE(agent_name) AS any_agent_name,
  COUNT(1) AS query_count_30d,
  COUNT(DISTINCT NULLIF(TRIM(user_email), '')) AS active_users_30d
FROM (
  SELECT insert_id, event_time, user_email, agent_name, agent_id
  FROM \`${cleanProject}.${cleanDataset}.gem_accel_user_activity\`
  WHERE event_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
  QUALIFY ROW_NUMBER() OVER (PARTITION BY insert_id, event_time ORDER BY event_time) = 1
)
WHERE COALESCE(NULLIF(TRIM(agent_id), ''), NULLIF(TRIM(agent_name), '')) IS NOT NULL
GROUP BY agent_key`;
}

interface AgentListProps {
  agents: Agent[];
  config?: Config;
  isFleetView?: boolean;
  onSelectAgent: (agent: Agent) => void;
  onEditAgent: (agent: Agent) => void;
  onDeleteAgent: (agent: Agent) => void;
  onTestAgent?: (agent: Agent) => void;
  onRegisterNew: () => void;
  onOpenBulkDatasources?: () => void;
  onOpenBulkEditSharePublish?: () => void;
  onOpenShadowEvalGate?: () => void;
  onToggleAgentStatus: (agent: Agent) => void;
  togglingAgentId?: string | null;
  deletingAgentIds: Set<string>;
  selectedAgents: Set<string>;
  onToggleSelect: (name: string) => void;
  onToggleSelectAll: (selectableNames?: string[]) => void;
  onDeleteSelected: () => void;
  onSort: (key: SortableAgentKey) => void;
  sortConfig: SortConfig;
  onUpdateAgentName?: (agent: Agent, newName: string) => Promise<void>;
  canRestoreDeepResearch?: boolean;
  isRestoringDeepResearch?: boolean;
  onRestoreDeepResearch?: () => void;
}

type StatusFilter = 'ALL' | 'ENABLED' | 'DISABLED' | 'PRIVATE';
type ScopeFilter = 'ALL' | 'ALL_USERS' | 'RESTRICTED' | 'PRIVATE';

export type AgentListColumnKey =
  | 'displayName'
  | 'state'
  | 'owner'
  | 'sharing'
  | 'agentType'
  | 'agentOrigin'
  | 'description'
  | 'name'
  | 'createTime'
  | 'updateTime';

interface ColumnDefinition {
  key: AgentListColumnKey;
  label: string;
  defaultVisible: boolean;
  responsiveClass?: string;
}

const AGENT_LIST_COLUMNS: ColumnDefinition[] = [
  { key: 'displayName', label: 'Display Name', defaultVisible: true },
  { key: 'state', label: 'Status', defaultVisible: true },
  { key: 'owner', label: 'Agent Owner', defaultVisible: true, responsiveClass: 'gem-col-lg' },
  { key: 'sharing', label: 'Sharing Scope', defaultVisible: true, responsiveClass: 'gem-col-md' },
  { key: 'agentType', label: 'Agent Type', defaultVisible: true, responsiveClass: 'gem-col-xl' },
  { key: 'agentOrigin', label: 'Origin', defaultVisible: false, responsiveClass: 'gem-col-2xl' },
  { key: 'description', label: 'Description', defaultVisible: false, responsiveClass: 'gem-col-2xl' },
  { key: 'name', label: 'Agent ID', defaultVisible: true, responsiveClass: 'gem-col-2xl' },
  { key: 'createTime', label: 'Created On', defaultVisible: false, responsiveClass: 'gem-col-2xl' },
  { key: 'updateTime', label: 'Last Modified', defaultVisible: true, responsiveClass: 'gem-col-2xl' },
];

const DEFAULT_VISIBLE_COLUMNS: Record<AgentListColumnKey, boolean> = AGENT_LIST_COLUMNS.reduce(
  (acc, col) => ({ ...acc, [col.key]: col.defaultVisible }),
  {} as Record<AgentListColumnKey, boolean>,
);

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
  config,
  isFleetView = false,
  onSelectAgent, 
  onEditAgent: _onEditAgent, 
  onDeleteAgent, 
  onTestAgent,
  onRegisterNew, 
  onOpenBulkDatasources,
  onOpenBulkEditSharePublish,
  onOpenShadowEvalGate,
  onToggleAgentStatus, 
  togglingAgentId, 
  deletingAgentIds, 
  selectedAgents,
  onToggleSelect,
  onToggleSelectAll,
  onDeleteSelected,
  onSort, 
  sortConfig, 
  onUpdateAgentName,
  canRestoreDeepResearch,
  isRestoringDeepResearch,
  onRestoreDeepResearch,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('ALL');

  // Column visibility & Export state
  const [visibleColumns, setVisibleColumns] = useState<Record<AgentListColumnKey, boolean>>(DEFAULT_VISIBLE_COLUMNS);
  const [forcedColumns, setForcedColumns] = useState<Set<AgentListColumnKey>>(new Set());
  const [isColumnsOpen, setIsColumnsOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const columnsMenuRef = useRef<HTMLDivElement>(null);

  // 30-day BigQuery Adoption Overlay state
  const [isBqPopoverOpen, setIsBqPopoverOpen] = useState(false);
  const [bqDatasetId, setBqDatasetId] = useState<string>(() => {
    try {
      return (
        window.localStorage?.getItem('gem_agent_adoption_bq_dataset') ||
        'gemini_enterprise_logs'
      );
    } catch {
      return 'gemini_enterprise_logs';
    }
  });
  const [isLoadingAdoption, setIsLoadingAdoption] = useState(false);
  const [adoptionError, setAdoptionError] = useState<string | null>(null);
  const [adoptionLoaded, setAdoptionLoaded] = useState(false);
  const [adoptionByKey, setAdoptionByKey] = useState<
    Record<string, AgentAdoptionMetric>
  >({});
  const bqPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isBqPopoverOpen) return;
    const handleOutside = (event: MouseEvent) => {
      if (
        bqPopoverRef.current &&
        !bqPopoverRef.current.contains(event.target as Node)
      ) {
        setIsBqPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isBqPopoverOpen]);

  const showFleetSourceBadges = useMemo(() => {
    if (isFleetView) return true;
    const distinctEngines = new Set<string>();
    for (const a of agents) {
      const src = extractAgentFleetSource(a);
      if (src) distinctEngines.add(`${src.location}/${src.engineId}`);
      if (distinctEngines.size > 1) return true;
    }
    return false;
  }, [isFleetView, agents]);

  const resolveAgentAdoption = (agent: Agent): AgentAdoptionMetric | null => {
    if (!adoptionLoaded) return null;
    const fullLower = (agent.name || '').trim().toLowerCase();
    const shortLower = (agent.name.split('/').pop() || '').trim().toLowerCase();
    const dispLower = (agent.displayName || '').trim().toLowerCase();
    return (
      adoptionByKey[fullLower] ||
      (shortLower ? adoptionByKey[shortLower] : undefined) ||
      (dispLower ? adoptionByKey[dispLower] : undefined) || {
        queryCount30d: 0,
        activeUsers30d: 0,
      }
    );
  };

  const handleLoad30dAdoption = async () => {
    const projectId = (config?.projectId || '').trim();
    if (!projectId) {
      setAdoptionError('Select or enter a GCP Project ID before querying BigQuery.');
      return;
    }
    setIsLoadingAdoption(true);
    setAdoptionError(null);
    try {
      const sql = buildAgent30dAdoptionSql(projectId, bqDatasetId);
      try {
        window.localStorage?.setItem(
          'gem_agent_adoption_bq_dataset',
          bqDatasetId.trim(),
        );
      } catch {
        // Ignore storage quota issues
      }
      const res = await runBigQueryQuery<{
        agent_key?: string;
        any_agent_name?: string;
        query_count_30d?: number | string;
        active_users_30d?: number | string;
      }>(projectId, sql, true);

      if (res?.error || (res?.errors && res.errors.length > 0)) {
        const msg =
          res.error?.message ||
          res.errors?.[0]?.message ||
          'BigQuery query failed.';
        throw new Error(msg);
      }

      const nextMap: Record<string, AgentAdoptionMetric> = {};
      const recordEntry = (
        rawKey: unknown,
        rawName: unknown,
        rawQueries: unknown,
        rawUsers: unknown,
      ) => {
        const metric: AgentAdoptionMetric = {
          queryCount30d: Math.max(0, Number(rawQueries) || 0),
          activeUsers30d: Math.max(0, Number(rawUsers) || 0),
        };
        const keys = [rawKey, rawName]
          .map((v) => (v == null ? '' : String(v).trim().toLowerCase()))
          .filter(Boolean);
        for (const k of keys) {
          const shortKey = k.includes('/') ? k.split('/').pop() || k : k;
          const prev = nextMap[k];
          nextMap[k] = prev
            ? {
                queryCount30d: Math.max(prev.queryCount30d, metric.queryCount30d),
                activeUsers30d: Math.max(
                  prev.activeUsers30d,
                  metric.activeUsers30d,
                ),
              }
            : metric;
          if (shortKey && shortKey !== k) {
            const prevShort = nextMap[shortKey];
            nextMap[shortKey] = prevShort
              ? {
                  queryCount30d: Math.max(
                    prevShort.queryCount30d,
                    metric.queryCount30d,
                  ),
                  activeUsers30d: Math.max(
                    prevShort.activeUsers30d,
                    metric.activeUsers30d,
                  ),
                }
              : metric;
          }
        }
      };

      if (Array.isArray(res?.parsedRows) && res.parsedRows.length > 0) {
        for (const row of res.parsedRows) {
          recordEntry(
            row.agent_key,
            row.any_agent_name,
            row.query_count_30d,
            row.active_users_30d,
          );
        }
      } else if (Array.isArray(res?.rows)) {
        for (const row of res.rows) {
          const cells = row.f || [];
          recordEntry(
            cells[0]?.v,
            cells[1]?.v,
            cells[2]?.v,
            cells[3]?.v,
          );
        }
      }

      setAdoptionByKey(nextMap);
      setAdoptionLoaded(true);
      setIsBqPopoverOpen(false);
    } catch (err: unknown) {
      setAdoptionError(
        toErrorMessage(
          err,
          'Could not query gem_accel_user_activity in BigQuery.',
        ),
      );
    } finally {
      setIsLoadingAdoption(false);
    }
  };

  useEffect(() => {
    if (!isColumnsOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(event.target as Node)) {
        setIsColumnsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isColumnsOpen]);

  const toggleColumn = (key: AgentListColumnKey) => {
    setVisibleColumns(prev => {
      const nextVal = !prev[key];
      const activeCount = Object.values(prev).filter(Boolean).length;
      if (!nextVal && activeCount <= 1) {
        return prev; // Keep at least 1 column visible
      }
      if (nextVal) {
        setForcedColumns(f => new Set(f).add(key));
      } else {
        setForcedColumns(f => {
          const next = new Set(f);
          next.delete(key);
          return next;
        });
      }
      return { ...prev, [key]: nextVal };
    });
  };

  const resetColumns = () => {
    setVisibleColumns(DEFAULT_VISIBLE_COLUMNS);
    setForcedColumns(new Set());
  };

  const showAllColumns = () => {
    const allTrue = AGENT_LIST_COLUMNS.reduce(
      (acc, col) => ({ ...acc, [col.key]: true }),
      {} as Record<AgentListColumnKey, boolean>,
    );
    setVisibleColumns(allTrue);
    setForcedColumns(new Set(AGENT_LIST_COLUMNS.map(col => col.key)));
  };

  const getColResponsiveClass = (key: AgentListColumnKey): string => {
    if (forcedColumns.has(key)) return '';
    return AGENT_LIST_COLUMNS.find(c => c.key === key)?.responsiveClass || '';
  };

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
        const fleetSrc = extractAgentFleetSource(agent);
        const fleetLabel = fleetSrc
          ? `${fleetSrc.location} ${fleetSrc.engineId} ${fleetSrc.location}/${fleetSrc.engineId}`.toLowerCase()
          : '';
        return (
          displayName.includes(q) ||
          agentId.includes(q) ||
          description.includes(q) ||
          agentType.includes(q) ||
          ownerHint.includes(q) ||
          fleetLabel.includes(q)
        );
      }
      return true;
    });
  }, [agents, searchQuery, statusFilter, typeFilter, scopeFilter]);

  const selectableFilteredAgents = useMemo(
    () => filteredAgents.filter(a => !api.isGoogleManagedAgent(a)),
    [filteredAgents]
  );

  const isAllSelected =
    selectableFilteredAgents.length > 0 &&
    selectableFilteredAgents.every(a => selectedAgents.has(a.name));

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
      setEditingId(null);
    } catch {
      // Error surfaced by parent; keep inline editor open so user does not lose input
    } finally {
      setIsSaving(false);
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
        className={`px-3 xl:px-5 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider whitespace-nowrap ${className}`}
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
  const visibleColumnCount = Object.values(visibleColumns).filter(Boolean).length;

  const fallbackConfig: Config = config || {
    projectId: '',
    appLocation: 'global',
    collectionId: 'default_collection',
    appId: '',
    assistantId: 'default_assistant',
  };

  const allUsersCount = useMemo(
    () => agents.filter((a) => getAgentSharingScope(a) === 'ALL_USERS').length,
    [agents]
  );

  return (
    <div className="space-y-4">
      {agents.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-gray-900/90 border border-gray-800 rounded-xl p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Total Registered</div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-2xl font-display font-bold text-white tabular-nums">{agents.length}</span>
              <span className="text-[11px] text-blue-300 font-mono">{availableTypes.length} runtime{availableTypes.length === 1 ? '' : 's'}</span>
            </div>
          </div>
          <div className="bg-gray-900/90 border border-gray-800 rounded-xl p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Enabled &amp; Serving</div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-2xl font-display font-bold text-emerald-400 tabular-nums">{statusCounts.ENABLED}</span>
              <span className="text-[11px] text-gray-400">{statusCounts.DISABLED} disabled</span>
            </div>
          </div>
          <div className="bg-gray-900/90 border border-gray-800 rounded-xl p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Published Org-Wide</div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-2xl font-display font-bold text-blue-400 tabular-nums">{allUsersCount}</span>
              <span className="text-[11px] text-gray-400">{Math.round((allUsersCount / agents.length) * 100)}% coverage</span>
            </div>
          </div>
          <div className="bg-gray-900/90 border border-gray-800 rounded-xl p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Private / Draft</div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-2xl font-display font-bold text-amber-300 tabular-nums">{statusCounts.PRIVATE}</span>
              <span className="text-[11px] text-gray-400">Owner-scoped</span>
            </div>
          </div>
        </div>
      )}

      <div className="bg-gray-900/90 border border-gray-800 shadow-xl rounded-xl overflow-hidden">
      <div className="p-4 flex flex-wrap justify-between items-center gap-3 border-b border-gray-800">
        <div>
          <h2 className="text-xl font-bold text-white">Registered Agents</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Showing {filteredAgents.length} of {agents.length} agent{agents.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {selectedAgents.size > 0 && (
            <>
              <span className="text-sm text-gray-300 font-medium whitespace-nowrap">{selectedAgents.size} selected</span>
              {onOpenBulkDatasources && (
                <button
                  type="button"
                  onClick={onOpenBulkDatasources}
                  data-testid="open-bulk-update-selected-btn"
                  className="px-3.5 py-2 bg-cyan-900/60 text-cyan-200 border border-cyan-600/60 text-sm font-semibold rounded-md hover:bg-cyan-800/70 flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                  title="Open Bulk Update workspace (IAM & Sharing, Agent Settings, and Data Connectors / Data Stores) for the selected agents"
                >
                  <span>Bulk Update Selected ({selectedAgents.size})</span>
                </button>
              )}
              <button
                onClick={onDeleteSelected}
                className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-md hover:bg-red-700 whitespace-nowrap shrink-0"
              >
                Delete Selected
              </button>
            </>
          )}

          {/* Shadow Eval Gate Button */}
          {agents.length > 0 && onOpenShadowEvalGate && (
            <button
              type="button"
              onClick={onOpenShadowEvalGate}
              data-testid="open-shadow-eval-gate-btn"
              className="px-3.5 py-2 bg-emerald-900/60 hover:bg-emerald-800/70 text-emerald-200 border border-emerald-600/60 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              title="Run non-destructive Golden Q&A :streamAssist evaluation against selected agents in ephemeral sessions"
            >
              <svg className="w-4 h-4 text-emerald-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>
                Shadow Eval Gate{selectedAgents.size > 0 ? ` (${selectedAgents.size})` : ''}
              </span>
            </button>
          )}

          {/* Load 30d Adoption (BQ) Button & Popover */}
          {agents.length > 0 && (
            <div className="relative" ref={bqPopoverRef}>
              <button
                type="button"
                data-testid="open-bq-adoption-popover-btn"
                onClick={() => setIsBqPopoverOpen((prev) => !prev)}
                aria-expanded={isBqPopoverOpen}
                className="px-3 py-2 bg-purple-900/60 hover:bg-purple-800/70 text-purple-200 border border-purple-600/60 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                title="Overlay 30-day query count and active users from BigQuery gem_accel_user_activity"
              >
                <svg className="w-4 h-4 text-purple-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <span>
                  {adoptionLoaded ? '30d Adoption Loaded' : 'Load 30d Adoption (BQ)'}
                </span>
              </button>

              {isBqPopoverOpen && (
                <div
                  data-testid="bq-adoption-popover"
                  className="absolute right-0 mt-2 w-80 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-30 p-3.5 space-y-2.5"
                >
                  <div className="flex items-center justify-between border-b border-gray-800 pb-1.5">
                    <span className="text-xs font-bold text-gray-200 uppercase tracking-wider">
                      30d Fleet Adoption (BigQuery)
                    </span>
                    {adoptionLoaded && (
                      <button
                        type="button"
                        onClick={() => {
                          setAdoptionLoaded(false);
                          setAdoptionByKey({});
                        }}
                        className="text-[11px] text-gray-400 hover:text-white"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Queries <code className="text-gray-300">gem_accel_user_activity</code> over the last 30 days to overlay query volume and active user counts (and flag 0-query zombie agents).
                  </p>
                  <div>
                    <label
                      htmlFor="bq-adoption-dataset-input"
                      className="block text-[11px] font-medium text-gray-300 mb-1"
                    >
                      BigQuery Dataset ID
                    </label>
                    <input
                      id="bq-adoption-dataset-input"
                      type="text"
                      value={bqDatasetId}
                      disabled={isLoadingAdoption}
                      onChange={(e) => setBqDatasetId(e.target.value)}
                      placeholder="gemini_enterprise_logs"
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-gray-100 font-mono"
                    />
                  </div>
                  {adoptionError && (
                    <div className="p-2 rounded bg-red-950/60 border border-red-700 text-[11px] text-red-200">
                      {adoptionError}
                    </div>
                  )}
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsBqPopoverOpen(false)}
                      className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      data-testid="run-bq-adoption-query-btn"
                      onClick={() => void handleLoad30dAdoption()}
                      disabled={isLoadingAdoption}
                      className="px-3 py-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold rounded flex items-center gap-1.5"
                    >
                      {isLoadingAdoption && (
                        <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-white" />
                      )}
                      <span>{isLoadingAdoption ? 'Querying BQ...' : 'Query 30d Adoption'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Bulk Edit / Share / Publish Button */}
          {agents.length > 0 && onOpenBulkEditSharePublish && (
            <button
              type="button"
              onClick={onOpenBulkEditSharePublish}
              data-testid="open-bulk-edit-share-publish-btn"
              className="px-3.5 py-2 bg-indigo-900/70 hover:bg-indigo-800/80 text-indigo-200 border border-indigo-600/60 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              title="Bulk edit metadata/model, share (All Users / Restricted / Private & IAM principals), or publish/deploy selected agents"
            >
              <svg className="w-4 h-4 text-indigo-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span>
                Bulk Edit / Share / Publish{selectedAgents.size > 0 ? ` (${selectedAgents.size})` : ''}
              </span>
            </button>
          )}

          {/* Column Visibility Picker */}
          {agents.length > 0 && (
            <div className="relative" ref={columnsMenuRef}>
              <button
                type="button"
                onClick={() => setIsColumnsOpen(prev => !prev)}
                aria-expanded={isColumnsOpen}
                aria-label="Toggle table columns"
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 border border-gray-600 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                title="Show or hide table columns"
              >
                <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
                <span>Columns ({visibleColumnCount}/{AGENT_LIST_COLUMNS.length})</span>
              </button>

              {isColumnsOpen && (
                <div
                  role="menu"
                  aria-label="Visible columns"
                  className="absolute right-0 mt-2 w-60 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-30 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between pb-1.5 border-b border-gray-800">
                    <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Visible Fields</span>
                    <div className="flex items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={showAllColumns}
                        className="text-blue-400 hover:text-blue-300 font-medium"
                      >
                        All
                      </button>
                      <span className="text-gray-600">·</span>
                      <button
                        type="button"
                        onClick={resetColumns}
                        className="text-gray-400 hover:text-gray-200 font-medium"
                      >
                        Default
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {AGENT_LIST_COLUMNS.map(col => (
                      <label
                        key={col.key}
                        className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-gray-800 cursor-pointer text-xs text-gray-200"
                      >
                        <input
                          type="checkbox"
                          checked={visibleColumns[col.key]}
                          onChange={() => toggleColumn(col.key)}
                          className="h-3.5 w-3.5 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500"
                        />
                        <span>{col.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Export Registry & Automation Scripts Button */}
          {agents.length > 0 && (
            <button
              type="button"
              onClick={() => setIsExportModalOpen(true)}
              className="px-3.5 py-2 bg-blue-900/60 hover:bg-blue-800/70 text-blue-200 border border-blue-600/60 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              title="Export Registered Agents to local CSV/JSON or generate Python/BigQuery export scripts"
            >
              <svg className="w-4 h-4 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Export / BQ Script</span>
            </button>
          )}

          <button
            type="button"
            onClick={onRegisterNew}
            className="px-4 py-2 bg-blue-600 text-white text-xs sm:text-sm font-semibold rounded-lg hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 whitespace-nowrap shrink-0 transition-colors"
          >
            Register New Agent
          </button>
        </div>
      </div>

      {canRestoreDeepResearch && onRestoreDeepResearch && (
        <div className="px-4 py-3 bg-indigo-950/50 border-b border-indigo-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-2.5">
            <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-indigo-900/80 text-indigo-200 border border-indigo-600/60 shrink-0">
              Google Built-in
            </span>
            <p className="text-xs text-indigo-100">
              <strong>Deep Research (`deep_research`)</strong> is not currently registered on this Gemini Enterprise assistant. You can re-provision the built-in Google Deep Research agent in one click.
            </p>
          </div>
          <button
            type="button"
            onClick={onRestoreDeepResearch}
            disabled={isRestoringDeepResearch}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white text-xs font-semibold rounded-md shrink-0 whitespace-nowrap flex items-center gap-1.5 transition-colors"
          >
            {isRestoringDeepResearch && (
              <div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-b-2 border-white"></div>
            )}
            <span>{isRestoringDeepResearch ? 'Restoring Deep Research...' : 'Restore Deep Research'}</span>
          </button>
        </div>
      )}

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
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
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
                className="px-2.5 py-1.5 text-xs text-blue-400 hover:text-blue-300 font-medium whitespace-nowrap"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>
      )}

      {agents.length === 0 ? (
        <div data-testid="agent-list-empty-state" className="p-8 text-center space-y-4">
          <div className="max-w-xl mx-auto space-y-2">
            <p className="text-gray-200 font-semibold text-base">
              No agents found for the provided configuration.
            </p>
            <p className="text-xs text-gray-400 leading-relaxed">
              Why is this list empty? Either (1) no Gemini Enterprise Engine is selected in the configuration bar above, (2) your Engine is deployed in a different region (<code className="text-gray-300">global</code>, <code className="text-gray-300">us</code>, or <code className="text-gray-300">eu</code>), or (3) no custom ADK/A2A/Low-Code agents have been registered on <code className="text-gray-300">default_assistant</code> yet.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={onRegisterNew}
              data-testid="empty-state-register-agent-btn"
              className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-md hover:bg-blue-700 transition-colors"
            >
              + Register New Agent
            </button>
            {canRestoreDeepResearch && onRestoreDeepResearch && (
              <button
                type="button"
                onClick={onRestoreDeepResearch}
                data-testid="empty-state-restore-deep-research-btn"
                className="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-md hover:bg-indigo-700 transition-colors"
              >
                Restore Built-In Deep Research Agent
              </button>
            )}
          </div>
        </div>
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
        <div className="gem-table-container" role="region" aria-label="Registered agents table" tabIndex={0}>
            <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-700/50">
                    <tr>
                        <th scope="col" className="px-3 xl:px-5 py-3 w-10">
                          <input
                              type="checkbox"
                              checked={isAllSelected}
                              disabled={selectableFilteredAgents.length === 0}
                              onChange={() => onToggleSelectAll(selectableFilteredAgents.map(a => a.name))}
                              aria-label="Select all agents"
                              className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600 disabled:opacity-40"
                          />
                        </th>
                        {visibleColumns.displayName && (
                          <SortableHeader sortKey="displayName">Display Name</SortableHeader>
                        )}
                        {visibleColumns.state && (
                          <SortableHeader sortKey="state">Status</SortableHeader>
                        )}
                        {visibleColumns.owner && (
                          <SortableHeader sortKey="owner" className={getColResponsiveClass('owner')}>Agent Owner</SortableHeader>
                        )}
                        {visibleColumns.sharing && (
                          <th scope="col" className={`px-3 xl:px-5 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider whitespace-nowrap ${getColResponsiveClass('sharing')}`}>
                            Sharing Scope
                          </th>
                        )}
                        {visibleColumns.agentType && (
                          <SortableHeader sortKey="agentType" className={getColResponsiveClass('agentType')}>Agent Type</SortableHeader>
                        )}
                        {visibleColumns.agentOrigin && (
                          <th scope="col" className={`px-3 xl:px-5 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider whitespace-nowrap ${getColResponsiveClass('agentOrigin')}`}>
                            Origin
                          </th>
                        )}
                        {visibleColumns.description && (
                          <th scope="col" className={`px-3 xl:px-5 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider whitespace-nowrap ${getColResponsiveClass('description')}`}>
                            Description
                          </th>
                        )}
                        {visibleColumns.name && (
                          <SortableHeader sortKey="name" className={getColResponsiveClass('name')}>Agent ID</SortableHeader>
                        )}
                        {visibleColumns.createTime && (
                          <th scope="col" className={`px-3 xl:px-5 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider whitespace-nowrap ${getColResponsiveClass('createTime')}`}>
                            Created On
                          </th>
                        )}
                        {visibleColumns.updateTime && (
                          <SortableHeader sortKey="updateTime" className={getColResponsiveClass('updateTime')}>Last Modified</SortableHeader>
                        )}
                        <th scope="col" className="gem-sticky-action-th px-3 xl:px-5 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider whitespace-nowrap">
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
                        const isGoogleManaged = api.isGoogleManagedAgent(agent);
                        const statusColorClass = agent.state === 'ENABLED' ? 'bg-green-500' : agent.state === 'DISABLED' ? 'bg-red-500' : 'bg-yellow-500';
                        const sharingScope = getAgentSharingScope(agent);
                        const ownerHint = api.extractAgentOwnerHint(agent);
                        const fleetSrc = extractAgentFleetSource(agent);
                        const adoptionMetric = resolveAgentAdoption(agent);

                        let statusButton: React.ReactNode = null;
                        if (agent.state === 'ENABLED' || agent.state === 'DISABLED') {
                            const isEnabled = agent.state === 'ENABLED';
                            const statusProps = {
                                text: isEnabled ? 'Enabled' : 'Disabled',
                                colorClasses: isEnabled
                                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25'
                                  : 'bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25',
                            };
                            statusButton = (
                                isToggling ? (
                                    <div className="flex items-center space-x-2">
                                        <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-gray-400"></div>
                                        <span className="text-xs text-gray-400">Updating...</span>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => onToggleAgentStatus(agent)}
                                        className={`px-2.5 py-0.5 text-xs font-semibold rounded-full transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${statusProps.colorClasses}`}
                                        disabled={isToggling || isDeleting}
                                    >
                                        {statusProps.text}
                                    </button>
                                )
                            );
                        } else {
                            statusButton = <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 whitespace-nowrap">Private</span>
                        }

                        return (
                            <tr key={agent.name} className={`${isSelected ? 'bg-blue-900/50 gem-row-selected' : 'hover:bg-gray-700/50'} transition-colors`}>
                                <td className="px-3 xl:px-5 py-3">
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        disabled={isGoogleManaged}
                                        onChange={() => onToggleSelect(agent.name)}
                                        title={isGoogleManaged ? 'Google built-in agents are protected from bulk deletion' : undefined}
                                        aria-label={`Select agent ${agent.displayName}`}
                                        className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                    />
                                </td>
                                {visibleColumns.displayName && (
                                  <td className="px-3 xl:px-5 py-3 whitespace-nowrap text-sm font-medium text-white">
                                      <div className="flex items-center">
                                          <span className={`h-2.5 w-2.5 rounded-full mr-2.5 shrink-0 ${statusColorClass}`}></span>
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
                                              <div className="min-w-0">
                                                  <div className="flex items-center gap-2 group flex-wrap">
                                                      <button
                                                          type="button"
                                                          onClick={() => onSelectAgent(agent)}
                                                          className="text-left hover:text-blue-400 transition-colors max-w-[180px] xl:max-w-[260px] truncate"
                                                          title={agent.displayName}
                                                      >
                                                          {agent.displayName}
                                                      </button>
                                                      {showFleetSourceBadges && fleetSrc && (
                                                          <span
                                                              data-testid={`agent-fleet-source-${agentId}`}
                                                              className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-cyan-950/80 text-cyan-300 border border-cyan-700/60 whitespace-nowrap shrink-0"
                                                              title={`Engine: ${fleetSrc.engineId} (${fleetSrc.location})`}
                                                          >
                                                              [{fleetSrc.location} / {fleetSrc.engineId}]
                                                          </span>
                                                      )}
                                                      {adoptionMetric && (
                                                          adoptionMetric.queryCount30d > 0 ? (
                                                            <span
                                                                data-testid={`agent-adoption-badge-${agentId}`}
                                                                className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 whitespace-nowrap shrink-0"
                                                                title={`Last 30 days in BigQuery: ${adoptionMetric.queryCount30d} queries across ${adoptionMetric.activeUsers30d} active users`}
                                                            >
                                                                {adoptionMetric.queryCount30d} queries · {adoptionMetric.activeUsers30d} users (30d)
                                                            </span>
                                                          ) : (
                                                            <span
                                                                data-testid={`agent-adoption-badge-${agentId}`}
                                                                className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-950/80 text-amber-300 border border-amber-700/60 whitespace-nowrap shrink-0"
                                                                title="Zero recorded queries in gem_accel_user_activity over the last 30 days"
                                                            >
                                                                Zombie · 0 queries (30d)
                                                            </span>
                                                          )
                                                      )}
                                                      {isGoogleManaged && (
                                                          <span
                                                              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-950/90 text-indigo-300 border border-indigo-700/70 whitespace-nowrap shrink-0"
                                                              title="First-party Google-managed built-in agent (protected from deletion)."
                                                          >
                                                              Google Built-in
                                                          </span>
                                                      )}
                                                      {onUpdateAgentName && (
                                                          <button 
                                                              type="button"
                                                              onClick={() => handleEditClick(agent)}
                                                              className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-gray-400 hover:text-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500 rounded p-0.5 transition-opacity shrink-0"
                                                              title="Edit Name"
                                                              aria-label={`Edit name for ${agent.displayName}`}
                                                          >
                                                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                                                          </button>
                                                      )}
                                                  </div>
                                                  {visibleColumns.name && !forcedColumns.has('name') && (
                                                      <div
                                                          className="gem-hide-2xl text-[11px] text-gray-400 font-mono truncate max-w-[180px] xl:max-w-[240px]"
                                                          title={agentId}
                                                      >
                                                          {agentId}
                                                      </div>
                                                  )}
                                              </div>
                                          )}
                                      </div>
                                  </td>
                                )}
                                {visibleColumns.state && (
                                  <td className="px-3 xl:px-5 py-3 whitespace-nowrap text-sm">
                                      {statusButton}
                                  </td>
                                )}
                                {visibleColumns.owner && (
                                  <td className={`px-3 xl:px-5 py-3 whitespace-nowrap text-xs ${getColResponsiveClass('owner')}`}>
                                    {ownerHint ? (
                                      <span
                                        className="inline-flex items-center px-2 py-0.5 rounded bg-gray-900/70 text-cyan-300 border border-gray-700 font-mono truncate max-w-[180px]"
                                        title={`Agent Owner: ${ownerHint}`}
                                      >
                                        {ownerHint}
                                      </span>
                                    ) : (
                                      <span className="text-gray-500 italic">—</span>
                                    )}
                                  </td>
                                )}
                                {visibleColumns.sharing && (
                                  <td className={`px-3 xl:px-5 py-3 whitespace-nowrap text-xs ${getColResponsiveClass('sharing')}`}>
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
                                  </td>
                                )}
                                {visibleColumns.agentType && (
                                  <td className={`px-3 xl:px-5 py-3 whitespace-nowrap text-xs xl:text-sm text-gray-400 ${getColResponsiveClass('agentType')}`}>{agent.agentType || 'N/A'}</td>
                                )}
                                {visibleColumns.agentOrigin && (
                                  <td className={`px-3 xl:px-5 py-3 whitespace-nowrap text-xs text-gray-400 font-mono ${getColResponsiveClass('agentOrigin')}`}>{agent.agentOrigin || 'N/A'}</td>
                                )}
                                {visibleColumns.description && (
                                  <td className={`px-3 xl:px-5 py-3 text-xs text-gray-400 max-w-[240px] truncate ${getColResponsiveClass('description')}`} title={agent.description || ''}>
                                    {agent.description || '—'}
                                  </td>
                                )}
                                {visibleColumns.name && (
                                  <td className={`px-3 xl:px-5 py-3 whitespace-nowrap text-xs text-gray-400 font-mono max-w-[140px] xl:max-w-[200px] truncate ${getColResponsiveClass('name')}`} title={agentId}>{agentId}</td>
                                )}
                                {visibleColumns.createTime && (
                                  <td className={`px-3 xl:px-5 py-3 whitespace-nowrap text-xs text-gray-400 ${getColResponsiveClass('createTime')}`}>
                                    {agent.createTime ? new Date(agent.createTime).toLocaleString() : 'N/A'}
                                  </td>
                                )}
                                {visibleColumns.updateTime && (
                                  <td className={`px-3 xl:px-5 py-3 whitespace-nowrap text-xs xl:text-sm text-gray-400 ${getColResponsiveClass('updateTime')}`}>
                                      {agent.updateTime ? new Date(agent.updateTime).toLocaleString() : 'N/A'}
                                  </td>
                                )}
                                <td className="gem-sticky-action-td px-3 xl:px-5 py-3 whitespace-nowrap text-right text-sm font-medium space-x-2.5">
                                    {isDeleting ? (
                                        <span className="text-xs text-gray-400 italic">Deleting...</span>
                                    ) : (
                                        <>
                                            {onTestAgent && agent.agentType !== 'SKILL' && (
                                                <button
                                                    type="button"
                                                    onClick={() => onTestAgent(agent)}
                                                    disabled={isToggling}
                                                    className="font-semibold text-emerald-400 hover:text-emerald-300 disabled:text-gray-500"
                                                    title={`Test ${agent.displayName} via streamAssist (answerGenerationMode: AGENT)`}
                                                >
                                                    Test
                                                </button>
                                            )}
                                            <button
                                                onClick={() => onSelectAgent(agent)}
                                                disabled={isToggling}
                                                className="font-semibold text-blue-400 hover:text-blue-300 disabled:text-gray-500"
                                                title={isGoogleManaged ? 'View built-in Google agent details' : 'View and edit agent details, configuration, and permissions'}
                                            >
                                                {isGoogleManaged ? 'View' : 'View / Edit'}
                                            </button>
                                            {isGoogleManaged ? (
                                                <span
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-gray-700/80 text-gray-400 border border-gray-600 cursor-not-allowed select-none"
                                                    title="Google built-in agent cannot be deleted. Use the Enabled/Disabled status toggle to hide it from users."
                                                >
                                                    Protected
                                                </span>
                                            ) : (
                                                <button onClick={() => onDeleteAgent(agent)} disabled={isToggling} className="font-semibold text-red-400 hover:text-red-300 disabled:text-gray-500">
                                                    Delete
                                                </button>
                                            )}
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

      <ExportAgentRegistryModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        agents={filteredAgents}
        config={fallbackConfig}
      />
      </div>
    </div>
  );
};

export default AgentList;