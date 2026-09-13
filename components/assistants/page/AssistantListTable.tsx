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

import React from 'react';
import { AppEngine } from '../../../types';
import {
  AssistantRowData,
  SortConfig,
  SortKey,
  SortDirection,
  determineAppType,
} from '../../../hooks/useAssistantList';

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
}) => {
  const SortHeader: React.FC<{
    label: string;
    sortKey: SortKey;
    align?: 'left' | 'center' | 'right';
  }> = ({ label, sortKey, align = 'left' }) => {
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
        className={`px-6 py-3 text-${align} text-xs font-medium text-gray-300 uppercase tracking-wider`}
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

  return (
    <div className="bg-gray-800 shadow-xl rounded-lg overflow-hidden border border-gray-700">
      <div className="p-4 border-b border-gray-700 flex flex-col sm:flex-row justify-between items-center gap-4">
        <h3 className="text-lg font-bold text-white">
          Gemini Enterprise Engines
        </h3>

        {/* Search Control */}
        <div className="relative flex-1 max-w-sm">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <svg
              className="w-5 h-5 text-gray-500"
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
            className="bg-gray-700 border border-gray-600 text-gray-200 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 p-2.5"
            placeholder="Filter Engines..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <button
          onClick={onRefresh}
          disabled={isListLoading}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500 min-w-fit"
        >
          Refresh
        </button>
      </div>

      {listError && (
        <div className="p-4 text-red-400 bg-red-900/20 text-center text-sm border-b border-red-900/50">
          {listError}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-700/50">
            <tr>
              <SortHeader label="Display Name" sortKey="displayName" />
              <SortHeader label="Engine ID" sortKey="engineId" />
              <SortHeader label="App Type" sortKey="solutionType" />
              <SortHeader label="Web Grounding" sortKey="webGrounding" />
              <SortHeader label="System Instructions" sortKey="instructions" />
              <SortHeader label="Customer Policy" sortKey="policy" />
              <SortHeader
                label="Vertex Agents"
                sortKey="vertexAgents"
                align="center"
              />
              <th scope="col" className="relative px-6 py-3">
                <span className="sr-only">Edit</span>
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
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-white">
                      {row.engine.displayName}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-xs text-gray-400 font-mono">
                      {engineId}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`text-sm px-2 py-1 rounded border ${
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
                  {assistant ? (
                    <>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge active={hasWebGrounding} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
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
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge
                          active={hasPolicy}
                          text={hasPolicy ? 'Applied' : 'None'}
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <CountBadge count={vertexAgentsCount} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-3">
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
                          <button
                            onClick={() => onRowClick(row)}
                            className="text-blue-400 hover:text-blue-300 font-semibold"
                          >
                            View / Edit
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td
                        colSpan={4}
                        className="px-6 py-4 text-center text-sm text-gray-500 italic"
                      >
                        No Default Assistant Configured
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <span className="text-gray-600 cursor-not-allowed">
                          N/A
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
