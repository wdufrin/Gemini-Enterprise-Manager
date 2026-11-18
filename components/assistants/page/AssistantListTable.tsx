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

import React, { useState, useRef, useEffect } from 'react';
import { AppEngine } from '../../../types';
import {
  AssistantRowData,
  SortConfig,
  SortKey,
  SortDirection,
  determineAppType,
} from '../../../hooks/useAssistantList';

export type AssistantTableColumnKey =
  | 'displayName'
  | 'engineId'
  | 'solutionType'
  | 'webGrounding'
  | 'instructions'
  | 'policy'
  | 'vertexAgents';

interface AssistantColumnConfig {
  key: AssistantTableColumnKey;
  label: string;
  responsiveClass?: string;
}

const ASSISTANT_TABLE_COLUMNS: AssistantColumnConfig[] = [
  { key: 'displayName', label: 'Display Name' },
  { key: 'engineId', label: 'Engine ID', responsiveClass: 'gem-col-xl' },
  { key: 'solutionType', label: 'App Type' },
  { key: 'webGrounding', label: 'Web Grounding', responsiveClass: 'gem-col-lg' },
  {
    key: 'instructions',
    label: 'System Instructions',
    responsiveClass: 'gem-col-lg',
  },
  { key: 'policy', label: 'Customer Policy', responsiveClass: 'gem-col-xl' },
  {
    key: 'vertexAgents',
    label: 'Vertex Agents',
    responsiveClass: 'gem-col-2xl',
  },
];

const DEFAULT_VISIBLE_ASSISTANT_COLUMNS: Record<
  AssistantTableColumnKey,
  boolean
> = ASSISTANT_TABLE_COLUMNS.reduce(
  (acc, col) => ({ ...acc, [col.key]: true }),
  {} as Record<AssistantTableColumnKey, boolean>,
);

const StatusBadge: React.FC<{
  active: boolean;
  text?: string;
  activeColor?: 'green' | 'orange';
  onClick?: () => void;
  title?: string;
}> = ({ active, text, activeColor = 'green', onClick, title }) => {
  let activeClasses = 'bg-green-900/50 text-green-400 border border-green-700';
  if (activeColor === 'orange') {
    activeClasses =
      'bg-orange-950/80 text-orange-400 border border-orange-700/80 hover:bg-orange-900/80 hover:border-orange-600';
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium cursor-pointer transition-colors focus:outline-none focus:ring-1 focus:ring-orange-500 ${
          active
            ? activeClasses
            : 'bg-gray-700 text-gray-400 border border-gray-600 hover:bg-gray-650'
        }`}
      >
        {text || (active ? 'Enabled' : 'Disabled')}
      </button>
    );
  }

  return (
    <span
      title={title}
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        active
          ? activeClasses
          : 'bg-gray-700 text-gray-400 border border-gray-600'
      }`}
    >
      {text || (active ? 'Enabled' : 'Disabled')}
    </span>
  );
};

const CountBadge: React.FC<{ count: number }> = ({ count }) => (
  <span
    className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium ${count > 0 ? 'bg-blue-900/50 text-blue-300 border border-blue-700' : 'bg-gray-800 text-gray-500 border border-gray-700'}`}
  >
    {count}
  </span>
);

const SortIcon: React.FC<{ direction: SortDirection }> = ({ direction }) => {
  const path =
    direction === 'asc'
      ? 'M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z'
      : 'M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z';
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4 shrink-0"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path fillRule="evenodd" d={path} clipRule="evenodd" />
    </svg>
  );
};

const SortHeader: React.FC<{
  label: string;
  sortKey: SortKey;
  sortConfig: SortConfig;
  onSort: (key: SortKey) => void;
  align?: 'left' | 'center' | 'right';
  className?: string;
}> = ({ label, sortKey, sortConfig, onSort, align = 'left', className = '' }) => {
  const isSorted = sortConfig.key === sortKey;
  const sortAria = isSorted
    ? sortConfig.direction === 'asc'
      ? 'ascending'
      : 'descending'
    : 'none';
  return (
    <th
      scope="col"
      aria-sort={sortAria}
      className={`px-3 xl:px-5 py-3 text-${align} text-xs font-medium text-gray-300 uppercase tracking-wider whitespace-nowrap ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`flex items-center gap-1 group text-inherit uppercase font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 rounded p-0.5 transition-colors hover:text-white ${align === 'center' ? 'mx-auto' : align === 'right' ? 'ml-auto' : 'mr-auto'}`}
        aria-label={`Sort by ${label}, currently ${isSorted ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'unsorted'}`}
      >
        <span>{label}</span>
        <span
          className={`text-gray-400 ${isSorted ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}
          aria-hidden="true"
        >
          <SortIcon direction={isSorted ? sortConfig.direction : 'asc'} />
        </span>
      </button>
    </th>
  );
};

interface AssistantListTableProps {
  sortedRows: AssistantRowData[];
  filteredEngines: AppEngine[];
  page: number;
  pageSize: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  isListLoading: boolean;
  listError: string | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  sortConfig: SortConfig;
  onSort: (key: SortKey) => void;
  onRefresh: () => void;
  onRowClick: (row: AssistantRowData) => void;
  onChatClick: (row: AssistantRowData, e: React.MouseEvent) => void;
  onEvaluateClick?: (row: AssistantRowData, e: React.MouseEvent) => void;
}

export const AssistantListTable: React.FC<AssistantListTableProps> = ({
  sortedRows,
  filteredEngines,
  page,
  pageSize,
  setPage,
  isListLoading,
  listError,
  searchQuery,
  setSearchQuery,
  sortConfig,
  onSort,
  onRefresh,
  onRowClick,
  onChatClick,
  onEvaluateClick,
}) => {
  const [visibleColumns, setVisibleColumns] = useState<
    Record<AssistantTableColumnKey, boolean>
  >(DEFAULT_VISIBLE_ASSISTANT_COLUMNS);
  const [forcedColumns, setForcedColumns] = useState<
    Set<AssistantTableColumnKey>
  >(new Set());
  const [isColumnsOpen, setIsColumnsOpen] = useState(false);
  const columnsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isColumnsOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        columnsMenuRef.current &&
        !columnsMenuRef.current.contains(event.target as Node)
      ) {
        setIsColumnsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isColumnsOpen]);

  const toggleColumn = (key: AssistantTableColumnKey) => {
    setVisibleColumns((prev) => {
      const nextVal = !prev[key];
      const activeCount = Object.values(prev).filter(Boolean).length;
      if (!nextVal && activeCount <= 1) {
        return prev;
      }
      if (nextVal) {
        setForcedColumns((f) => new Set(f).add(key));
      } else {
        setForcedColumns((f) => {
          const next = new Set(f);
          next.delete(key);
          return next;
        });
      }
      return { ...prev, [key]: nextVal };
    });
  };

  const resetColumns = () => {
    setVisibleColumns(DEFAULT_VISIBLE_ASSISTANT_COLUMNS);
    setForcedColumns(new Set());
  };

  const showAllColumns = () => {
    setVisibleColumns(DEFAULT_VISIBLE_ASSISTANT_COLUMNS);
    setForcedColumns(
      new Set(ASSISTANT_TABLE_COLUMNS.map((col) => col.key)),
    );
  };

  const getColResponsiveClass = (key: AssistantTableColumnKey): string => {
    if (forcedColumns.has(key)) return '';
    return (
      ASSISTANT_TABLE_COLUMNS.find((c) => c.key === key)?.responsiveClass || ''
    );
  };

  const isEngineIdForced = forcedColumns.has('engineId');

  return (
    <div className="bg-gray-800 shadow-xl rounded-lg overflow-hidden border border-gray-700">
      <div className="p-4 border-b border-gray-700 flex flex-col sm:flex-row justify-between items-center gap-3">
        <h3 className="text-lg font-bold text-white shrink-0">
          Gemini Enterprise Engines
        </h3>

        {/* Search Control */}
        <div className="relative flex-1 w-full sm:max-w-sm">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <svg
              className="w-4 h-4 text-gray-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                clipRule="evenodd"
              ></path>
            </svg>
          </div>
          <input
            type="text"
            className="bg-gray-700 border border-gray-600 text-gray-200 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full pl-9 p-2"
            placeholder="Filter Engines..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Columns Customizer Dropdown */}
          <div className="relative" ref={columnsMenuRef}>
            <button
              type="button"
              onClick={() => setIsColumnsOpen((prev) => !prev)}
              aria-expanded={isColumnsOpen}
              aria-label="Customize engine table columns"
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-semibold rounded-md border border-gray-600 inline-flex items-center gap-1.5 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7"
                />
              </svg>
              <span>Columns</span>
            </button>

            {isColumnsOpen && (
              <div className="absolute right-0 mt-1.5 w-60 rounded-lg bg-gray-900 border border-gray-700 shadow-2xl z-30 p-3 space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-gray-800">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                    Visible Columns
                  </span>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={showAllColumns}
                      className="text-blue-400 hover:text-blue-300 font-medium"
                    >
                      Show All
                    </button>
                    <span className="text-gray-600">|</span>
                    <button
                      type="button"
                      onClick={resetColumns}
                      className="text-gray-400 hover:text-gray-200 font-medium"
                    >
                      Reset Auto
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-gray-500 leading-tight">
                  Secondary columns auto-hide on narrow screens unless pinned
                  here.
                </p>
                <div className="space-y-1 max-h-60 overflow-y-auto pt-1">
                  {ASSISTANT_TABLE_COLUMNS.map((col) => {
                    const checked = visibleColumns[col.key];
                    const isPinned = forcedColumns.has(col.key);
                    return (
                      <label
                        key={col.key}
                        className="flex items-center justify-between px-2 py-1 rounded hover:bg-gray-800 cursor-pointer text-xs text-gray-200"
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleColumn(col.key)}
                            className="h-3.5 w-3.5 rounded bg-gray-800 border-gray-600 text-blue-500 focus:ring-blue-500"
                          />
                          <span>{col.label}</span>
                        </span>
                        {col.responsiveClass && !isPinned && checked && (
                          <span className="text-[10px] text-gray-500 font-mono">
                            Auto
                          </span>
                        )}
                        {isPinned && (
                          <span className="text-[10px] text-blue-400 font-mono">
                            Pinned
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={onRefresh}
            disabled={isListLoading}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500 min-w-fit"
          >
            Refresh
          </button>
        </div>
      </div>

      {listError && (
        <div className="p-4 text-red-400 bg-red-900/20 text-center text-sm border-b border-red-900/50">
          {listError}
        </div>
      )}

      <div
        className="gem-table-container"
        role="region"
        aria-label="Gemini Enterprise Engines table"
        tabIndex={0}
      >
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-700/50">
            <tr>
              {visibleColumns.displayName && (
                <SortHeader
                  label="Display Name"
                  sortKey="displayName"
                  sortConfig={sortConfig}
                  onSort={onSort}
                />
              )}
              {visibleColumns.engineId && (
                <SortHeader
                  label="Engine ID"
                  sortKey="engineId"
                  sortConfig={sortConfig}
                  onSort={onSort}
                  className={getColResponsiveClass('engineId')}
                />
              )}
              {visibleColumns.solutionType && (
                <SortHeader
                  label="App Type"
                  sortKey="solutionType"
                  sortConfig={sortConfig}
                  onSort={onSort}
                />
              )}
              {visibleColumns.webGrounding && (
                <SortHeader
                  label="Web Grounding"
                  sortKey="webGrounding"
                  sortConfig={sortConfig}
                  onSort={onSort}
                  className={getColResponsiveClass('webGrounding')}
                />
              )}
              {visibleColumns.instructions && (
                <SortHeader
                  label="Instructions"
                  sortKey="instructions"
                  sortConfig={sortConfig}
                  onSort={onSort}
                  className={getColResponsiveClass('instructions')}
                />
              )}
              {visibleColumns.policy && (
                <SortHeader
                  label="Policy"
                  sortKey="policy"
                  sortConfig={sortConfig}
                  onSort={onSort}
                  className={getColResponsiveClass('policy')}
                />
              )}
              {visibleColumns.vertexAgents && (
                <SortHeader
                  label="Vertex Agents"
                  sortKey="vertexAgents"
                  sortConfig={sortConfig}
                  onSort={onSort}
                  align="center"
                  className={getColResponsiveClass('vertexAgents')}
                />
              )}
              <th
                scope="col"
                className="gem-sticky-action-th px-3 xl:px-5 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider whitespace-nowrap"
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-gray-800 divide-y divide-gray-700">
            {sortedRows.length === 0 && !isListLoading && (
              <tr>
                <td
                  colSpan={8}
                  className="px-6 py-8 text-center text-sm text-gray-500"
                >
                  No engines found in this location.
                </td>
              </tr>
            )}
            {sortedRows.map((row) => {
              const engineId = row.engine.name.split('/').pop()!;
              const assistant = row.assistant;
              const appType = determineAppType(row.engine);

              const hasWebGrounding =
                assistant?.webGroundingType ===
                  'WEB_GROUNDING_TYPE_GOOGLE_SEARCH' ||
                assistant?.webGroundingType ===
                  'WEB_GROUNDING_TYPE_ENTERPRISE_WEB_SEARCH';
              const hasInstructions = !!(
                assistant?.generationConfig?.systemInstruction
                  ?.additionalSystemInstruction ||
                assistant?.styleAndFormattingInstructions
              );
              const hasPolicy = !!(
                assistant?.customerPolicy &&
                Object.keys(assistant.customerPolicy).length > 0
              );
              const vertexAgentsCount =
                assistant?.vertexAiAgentConfigs?.length || 0;

              return (
                <tr
                  key={engineId}
                  className="hover:bg-gray-700/50 transition-colors"
                >
                  {visibleColumns.displayName && (
                    <td className="px-3 xl:px-5 py-3 whitespace-nowrap">
                      {assistant ? (
                        <button
                          type="button"
                          onClick={() => onRowClick(row)}
                          className="text-left text-sm font-medium text-white hover:text-blue-400 transition-colors block max-w-[190px] sm:max-w-[240px] xl:max-w-[300px] truncate"
                          title={`Open ${row.engine.displayName || engineId}`}
                        >
                          {row.engine.displayName}
                        </button>
                      ) : (
                        <div
                          className="text-sm font-medium text-white max-w-[190px] sm:max-w-[240px] xl:max-w-[300px] truncate"
                          title={row.engine.displayName}
                        >
                          {row.engine.displayName}
                        </div>
                      )}
                      {visibleColumns.engineId && !isEngineIdForced && (
                        <div
                          className="gem-hide-xl text-[11px] text-gray-400 font-mono truncate max-w-[190px] sm:max-w-[240px] mt-0.5"
                          title={engineId}
                        >
                          {engineId}
                        </div>
                      )}
                    </td>
                  )}
                  {visibleColumns.engineId && (
                    <td
                      className={`px-3 xl:px-5 py-3 whitespace-nowrap ${getColResponsiveClass('engineId')}`}
                    >
                      <div
                        className="text-xs text-gray-400 font-mono max-w-[180px] 2xl:max-w-[240px] truncate"
                        title={engineId}
                      >
                        {engineId}
                      </div>
                    </td>
                  )}
                  {visibleColumns.solutionType && (
                    <td className="px-3 xl:px-5 py-3 whitespace-nowrap">
                      <span
                        className={`text-xs xl:text-sm px-2 py-0.5 rounded border ${
                          appType === 'Gemini Enterprise'
                            ? 'text-purple-300 bg-purple-900/50 border-purple-700'
                            : appType === 'Chat'
                              ? 'text-blue-300 bg-blue-900/50 border-blue-700'
                              : 'text-gray-300 bg-gray-700/50 border-gray-600'
                        }`}
                      >
                        {appType}
                      </span>
                    </td>
                  )}
                  {assistant ? (
                    <>
                      {visibleColumns.webGrounding && (
                        <td
                          className={`px-3 xl:px-5 py-3 whitespace-nowrap ${getColResponsiveClass('webGrounding')}`}
                        >
                          <StatusBadge active={hasWebGrounding} />
                        </td>
                      )}
                      {visibleColumns.instructions && (
                        <td
                          className={`px-3 xl:px-5 py-3 whitespace-nowrap ${getColResponsiveClass('instructions')}`}
                        >
                          <StatusBadge
                            active={hasInstructions}
                            text={hasInstructions ? 'Yes' : 'No'}
                            activeColor="orange"
                            onClick={() => onRowClick(row)}
                            title={
                              hasInstructions
                                ? 'Custom system instructions configured (may cause issues for Gemini Enterprise). Click to view/edit.'
                                : 'No custom system instructions'
                            }
                          />
                        </td>
                      )}
                      {visibleColumns.policy && (
                        <td
                          className={`px-3 xl:px-5 py-3 whitespace-nowrap ${getColResponsiveClass('policy')}`}
                        >
                          <StatusBadge
                            active={hasPolicy}
                            text={hasPolicy ? 'Applied' : 'None'}
                          />
                        </td>
                      )}
                      {visibleColumns.vertexAgents && (
                        <td
                          className={`px-3 xl:px-5 py-3 whitespace-nowrap text-center ${getColResponsiveClass('vertexAgents')}`}
                        >
                          <CountBadge count={vertexAgentsCount} />
                        </td>
                      )}
                      <td className="gem-sticky-action-td px-3 xl:px-5 py-3 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2.5">
                          <button
                            type="button"
                            onClick={(e) => onChatClick(row, e)}
                            className="text-green-400 hover:text-green-300 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 rounded p-1"
                            title="Chat with Assistant"
                            aria-label={`Chat with assistant ${row.engine.displayName || engineId}`}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-5 w-5"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </button>
                          {onEvaluateClick && (
                            <button
                              type="button"
                              onClick={(e) => onEvaluateClick(row, e)}
                              className="text-purple-400 hover:text-purple-300 font-semibold inline-flex items-center gap-1 text-xs xl:text-sm"
                              title="Evaluate Assistant Configuration vs. Best Practices (Experimental)"
                              aria-label={`Evaluate assistant ${row.engine.displayName || engineId}`}
                              data-testid={`evaluate-assistant-row-${engineId}`}
                            >
                              <span>Evaluate</span>
                              <span className="hidden 2xl:inline px-1 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-950/80 text-amber-300 border border-amber-700/60">
                                Experimental
                              </span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onRowClick(row)}
                            className="px-2.5 py-1 rounded bg-blue-600/20 hover:bg-blue-600/35 border border-blue-500/40 text-blue-300 hover:text-white font-semibold text-xs xl:text-sm transition-colors"
                          >
                            View / Edit
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      {visibleColumns.webGrounding && (
                        <td
                          className={`px-3 xl:px-5 py-3 whitespace-nowrap text-xs text-gray-500 italic ${getColResponsiveClass('webGrounding')}`}
                        >
                          No Default Assistant Configured
                        </td>
                      )}
                      {visibleColumns.instructions && (
                        <td
                          className={`px-3 xl:px-5 py-3 whitespace-nowrap text-xs text-gray-600 ${getColResponsiveClass('instructions')}`}
                        >
                          —
                        </td>
                      )}
                      {visibleColumns.policy && (
                        <td
                          className={`px-3 xl:px-5 py-3 whitespace-nowrap text-xs text-gray-600 ${getColResponsiveClass('policy')}`}
                        >
                          —
                        </td>
                      )}
                      {visibleColumns.vertexAgents && (
                        <td
                          className={`px-3 xl:px-5 py-3 whitespace-nowrap text-center text-xs text-gray-600 ${getColResponsiveClass('vertexAgents')}`}
                        >
                          —
                        </td>
                      )}
                      <td className="gem-sticky-action-td px-3 xl:px-5 py-3 whitespace-nowrap text-right text-xs font-medium">
                        <span
                          className="text-gray-500 italic cursor-not-allowed"
                          title="No Default Assistant Configured"
                        >
                          No Assistant
                        </span>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {filteredEngines.length > 0 && (
        <div className="p-4 border-t border-gray-700 bg-gray-800 flex justify-between items-center">
          <div className="text-sm text-gray-400">
            Showing{' '}
            <span className="font-semibold text-white">
              {(page - 1) * pageSize + 1}
            </span>{' '}
            to{' '}
            <span className="font-semibold text-white">
              {Math.min(page * pageSize, filteredEngines.length)}
            </span>{' '}
            of{' '}
            <span className="font-semibold text-white">
              {filteredEngines.length}
            </span>{' '}
            engines
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || isListLoading}
              className="px-3 py-1 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() =>
                setPage((p) =>
                  Math.min(Math.ceil(filteredEngines.length / pageSize), p + 1),
                )
              }
              disabled={
                page * pageSize >= filteredEngines.length || isListLoading
              }
              className="px-3 py-1 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
