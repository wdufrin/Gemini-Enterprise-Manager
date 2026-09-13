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
import Spinner from '../Spinner';
import { LogEntry } from '../../types';
import { LogEntryCard } from './LogEntryCard';

const ShieldIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-6 w-6 text-blue-400"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
    />
  </svg>
);

const SearchIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-4 w-4 text-gray-400"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const InfoIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
    <path
      fillRule="evenodd"
      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
      clipRule="evenodd"
    />
  </svg>
);

export interface SanitizationAuditTabProps {
  projectNumber: string;
  logs: LogEntry[];
  isLoading: boolean;
  error: string | null;
  filterText: string;
  setFilterText: (text: string) => void;
  filterBlockedOnly: boolean;
  setFilterBlockedOnly: (blocked: boolean) => void;
  daysFilter: number;
  setDaysFilter: (days: number) => void;
  handleFetchLogs: () => void;
}

export const SanitizationAuditTab: React.FC<SanitizationAuditTabProps> = ({
  projectNumber,
  logs,
  isLoading,
  error,
  filterText,
  setFilterText,
  filterBlockedOnly,
  setFilterBlockedOnly,
  daysFilter,
  setDaysFilter,
  handleFetchLogs,
}) => {
  return (
    <>
      <div className="flex flex-col md:flex-row gap-4 items-end">
        <div className="flex-1 w-full">
          <label className="block text-xs font-medium text-gray-400 mb-1">Search Filters</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <SearchIcon />
            </div>
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder='e.g. jsonPayload.sanitizationResult.verdict="BLOCKED"'
              className="pl-10 block w-full bg-gray-900 border border-gray-600 rounded-md py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 h-[38px]"
            />
          </div>
        </div>

        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="flex flex-col min-w-[140px]">
            <label htmlFor="ma-time-range" className="block text-xs font-medium text-gray-400 mb-1">Time Range</label>
            <select
              id="ma-time-range"
              aria-label="Time Range"
              value={daysFilter}
              onChange={(e) => setDaysFilter(Number(e.target.value))}
              className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-blue-500 h-[38px]"
            >
              <option value={1}>Last 24 Hours</option>
              <option value={3}>Last 3 Days</option>
              <option value={7}>Last 7 Days</option>
              <option value={30}>Last 30 Days</option>
            </select>
          </div>

          <div className="flex items-center h-[38px] mt-auto">
            <label className="flex items-center cursor-pointer gap-2 px-3 py-2 bg-gray-700/50 rounded-md border border-gray-600 hover:bg-gray-700 transition-colors h-full">
              <input
                type="checkbox"
                checked={filterBlockedOnly}
                onChange={() => setFilterBlockedOnly(!filterBlockedOnly)}
                className="w-4 h-4 rounded border-gray-500 text-blue-600 focus:ring-blue-500 bg-gray-800"
              />
              <span className="text-sm text-gray-300 select-none">Blocked Only</span>
            </label>
          </div>

          <button
            onClick={handleFetchLogs}
            disabled={isLoading || !projectNumber}
            className="px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded-md hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed shadow-lg transition-all h-[38px] flex items-center justify-center min-w-[100px]"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
            ) : (
              'Fetch Logs'
            )}
          </button>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-gray-700/50 flex items-center gap-2 text-xs text-gray-500">
        <InfoIcon />
        <span>
          Querying:{' '}
          <code className="bg-gray-900 px-1 py-0.5 rounded text-gray-400 border border-gray-700">
            resource.type=&quot;modelarmor.googleapis.com/SanitizeOperation&quot;
          </code>
        </span>
      </div>

      {error && (
        <div className="text-center text-red-400 p-4 mt-4 bg-red-900/20 rounded-lg border border-red-800/50">
          {error}
        </div>
      )}

      {/* Content Area */}
      {!projectNumber ? (
        <div className="flex flex-col items-center justify-center p-12 bg-gray-800 rounded-lg border border-gray-700 border-dashed mt-4">
          <ShieldIcon />
          <p className="text-gray-400 mt-2">Please set your Project ID to view logs.</p>
        </div>
      ) : isLoading ? (
        <div className="mt-8">
          <Spinner />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {logs.length > 0 ? (
            logs.map((log, index) => (
              <LogEntryCard key={`${log.logName}-${log.receiveTimestamp}-${index}`} log={log} />
            ))
          ) : (
            <div className="text-center text-gray-400 mt-8 p-12 bg-gray-800 rounded-lg border border-gray-700">
              <ShieldIcon />
              <h3 className="text-lg font-semibold text-white mt-2">No Logs Found</h3>
              <p className="max-w-md mx-auto mt-1 text-sm">
                No violation logs matched your criteria. Try adjusting your filters or ensure Model Armor is active on
                your resources.
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
};
