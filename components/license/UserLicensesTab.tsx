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
import { UserLicense, LicenseConfig, SortKey, SortDirection } from './types';

interface UserLicensesTabProps {
  projectNumber: string;
  userLicenses: UserLicense[];
  filteredUserLicenses: UserLicense[];
  sortedUserLicenses: UserLicense[];
  paginatedUserLicenses: UserLicense[];
  totalLicensesUsed: number;
  isLicensesLoading: boolean;
  licensesError: string | null;
  cacheTimestamp: number | null;
  fetchProgress: { loaded: number; isFetching: boolean } | null;
  fetchUserLicenses: (forceRefresh?: boolean) => void;
  licenseNames: Record<string, string>;
  // Pagination
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  pageSize: number;
  setPageSize: React.Dispatch<React.SetStateAction<number>>;
  totalPages: number;
  // Sorting
  sortConfig: { key: SortKey; direction: SortDirection };
  handleSort: (key: SortKey) => void;
  // Filtering
  filterPrincipal: string;
  setFilterPrincipal: (val: string) => void;
  inputPrincipal: string;
  setInputPrincipal: (val: string) => void;
  filterConfig: string;
  setFilterConfig: (val: string) => void;
  inputConfig: string;
  setInputConfig: (val: string) => void;
  filterStatus: string;
  setFilterStatus: (val: string) => void;
  filterDateOperator: '>' | '<' | '=';
  setFilterDateOperator: (val: '>' | '<' | '=') => void;
  filterDateValue: string;
  setFilterDateValue: (val: string) => void;
  inputDateValue: string;
  setInputDateValue: (val: string) => void;
  // Bulk Actions
  selectedUsers: Set<string>;
  handleSelectAll: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSelectUser: (principal: string) => void;
  bulkActionConfig: string;
  setBulkActionConfig: (val: string) => void;
  isBulkActionLoading: boolean;
  handleBulkActionClick: () => void;
  apiLicenseConfigs: LicenseConfig[];
  // Modals / Triggers
  setIsExportModalOpen: (open: boolean) => void;
  setIsPruneModalOpen: (open: boolean) => void;
  setIsDeploymentModalOpen: (open: boolean) => void;
  setJsonModalData: (data: UserLicense) => void;
  requestDelete: (license: UserLicense, type: 'revoke' | 'delete') => void;
  isActionLoading: boolean;
}

const SortIcon: React.FC<{ active: boolean; direction: SortDirection }> = ({ active, direction }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className={`h-4 w-4 ml-1 transition-opacity ${active ? 'opacity-100' : 'opacity-30'}`}
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden="true"
  >
    {active && direction === 'desc' ? (
      <path
        fillRule="evenodd"
        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    ) : (
      <path
        fillRule="evenodd"
        d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 010 1.414z"
        clipRule="evenodd"
      />
    )}
  </svg>
);

export const UserLicensesTab: React.FC<UserLicensesTabProps> = ({
  projectNumber,
  userLicenses,
  filteredUserLicenses,
  sortedUserLicenses,
  paginatedUserLicenses,
  totalLicensesUsed,
  isLicensesLoading,
  licensesError,
  cacheTimestamp,
  fetchProgress,
  fetchUserLicenses,
  licenseNames,
  currentPage,
  setCurrentPage,
  pageSize,
  setPageSize,
  totalPages,
  sortConfig,
  handleSort,
  filterPrincipal,
  setFilterPrincipal,
  inputPrincipal,
  setInputPrincipal,
  filterConfig,
  setFilterConfig,
  inputConfig,
  setInputConfig,
  filterStatus,
  setFilterStatus,
  filterDateOperator,
  setFilterDateOperator,
  filterDateValue,
  setFilterDateValue,
  inputDateValue,
  setInputDateValue,
  selectedUsers,
  handleSelectAll,
  handleSelectUser,
  bulkActionConfig,
  setBulkActionConfig,
  isBulkActionLoading,
  handleBulkActionClick,
  apiLicenseConfigs,
  setIsExportModalOpen,
  setIsPruneModalOpen,
  setIsDeploymentModalOpen,
  setJsonModalData,
  requestDelete,
  isActionLoading,
}) => {
  return (
    <>
      {/* Stats & Actions Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gray-800 p-6 rounded-lg shadow-md flex flex-col justify-center items-center border border-gray-700">
          <h3 className="text-gray-400 text-sm uppercase font-bold tracking-wider mb-1">Total Licenses Used</h3>
          {isLicensesLoading && userLicenses.length === 0 ? (
            <Spinner />
          ) : (
            <p className="text-5xl font-extrabold text-blue-400">{totalLicensesUsed}</p>
          )}
        </div>

        <div className="bg-gray-800 p-6 rounded-lg shadow-md md:col-span-2 flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-1">
              <h2 className="text-lg font-semibold text-white">Manage User Licenses</h2>
              {cacheTimestamp && !isLicensesLoading && (
                <div className="inline-flex items-center gap-2 text-xs text-gray-300 bg-gray-700/60 border border-gray-600/60 px-3 py-1 rounded-full w-fit">
                  <span className="w-2 h-2 rounded-full bg-green-400"></span>
                  <span>
                    Cached ({userLicenses.length.toLocaleString()} users) &bull; Synced{' '}
                    {new Date(cacheTimestamp).toLocaleTimeString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => fetchUserLicenses(true)}
                    className="text-blue-400 hover:text-blue-300 underline font-medium ml-1"
                  >
                    Sync Now
                  </button>
                </div>
              )}
              {fetchProgress?.isFetching && (
                <div className="inline-flex items-center gap-2 text-xs text-blue-300 bg-blue-900/40 border border-blue-700/60 px-3 py-1 rounded-full w-fit">
                  <Spinner className="w-3 h-3 text-blue-400" />
                  <span>Fetching from Google Cloud... {fetchProgress.loaded.toLocaleString()} loaded</span>
                </div>
              )}
            </div>
            <p className="text-gray-400 text-sm mb-4">View, filter, and manage the list of assigned licenses.</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                aria-label="Target License"
                value={bulkActionConfig}
                onChange={(e) => setBulkActionConfig(e.target.value)}
                className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white flex-grow h-[38px] min-w-0"
              >
                <option value="" disabled>
                  Select Target License...
                </option>
                <option value="REVOKE" className="text-yellow-400">
                  Revoke License
                </option>
                <option value="DELETE" className="text-red-400">
                  Delete Users
                </option>
                {apiLicenseConfigs.map((cfg) => {
                  const id = cfg.name.split('/').pop();
                  const exp =
                    cfg.endDate && cfg.endDate.year
                      ? `${cfg.endDate.year}-${String(cfg.endDate.month || 1).padStart(2, '0')}-${String(
                          cfg.endDate.day || 1
                        ).padStart(2, '0')}`
                      : '';
                  const optionText = cfg.displayName
                    ? `${cfg.displayName} (Exp: ${exp || 'None'})`
                    : `${id} (Exp: ${exp || 'None'})`;
                  return (
                    <option key={cfg.name} value={`license_config="${cfg.name}"`}>
                      Apply: {optionText}
                    </option>
                  );
                })}
              </select>
              <button
                onClick={handleBulkActionClick}
                disabled={isBulkActionLoading || selectedUsers.size === 0 || !bulkActionConfig}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center whitespace-nowrap h-[38px]"
              >
                {isBulkActionLoading ? 'Applying...' : `Apply (${selectedUsers.size})`}
              </button>
              <button
                onClick={() => fetchUserLicenses(true)}
                disabled={isLicensesLoading || !projectNumber}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-md hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center whitespace-nowrap h-[38px]"
              >
                {isLicensesLoading ? 'Loading...' : 'Refresh List'}
              </button>
              <button
                onClick={() => setIsExportModalOpen(true)}
                disabled={isLicensesLoading || !projectNumber || userLicenses.length === 0}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center whitespace-nowrap h-[38px]"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 mr-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Export Data
              </button>
              <button
                onClick={() => setIsPruneModalOpen(true)}
                disabled={isLicensesLoading || !projectNumber || userLicenses.length === 0}
                className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-md hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center whitespace-nowrap h-[38px]"
              >
                Prune Inactive
              </button>
              <button
                onClick={() => setIsDeploymentModalOpen(true)}
                disabled={!projectNumber}
                className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center whitespace-nowrap h-[38px]"
              >
                Setup Auto-Pruner
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* User Licenses Table */}
      <div className="bg-gray-800 shadow-xl rounded-lg overflow-hidden">
        {licensesError && (
          <div className="text-center text-red-400 p-4 bg-red-900/20 rounded-t-lg border-b border-red-800">
            {licensesError}
          </div>
        )}

        {userLicenses.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-700 bg-gray-900">
                <thead className="bg-gray-700/50">
                  <tr>
                    <th scope="col" className="px-6 py-3 border-b border-gray-700 bg-gray-700 w-10 text-center">
                      <input
                        type="checkbox"
                        aria-label="Select all users"
                        className="rounded border-gray-500 bg-gray-600 text-blue-500 focus:ring-blue-500 h-4 w-4"
                        onChange={handleSelectAll}
                        checked={
                          sortedUserLicenses.length > 0 &&
                          selectedUsers.size === sortedUserLicenses.filter((l) => Boolean(l.userPrincipal)).length
                        }
                      />
                    </th>
                    <th
                      scope="col"
                      aria-sort={sortConfig.key === 'userPrincipal' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
                    >
                      <button
                        type="button"
                        onClick={() => handleSort('userPrincipal')}
                        className="flex items-center text-inherit uppercase font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 rounded p-0.5 hover:text-white"
                        aria-label={`Sort by User Principal, currently ${sortConfig.key === 'userPrincipal' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'unsorted'}`}
                      >
                        User Principal
                        <SortIcon active={sortConfig.key === 'userPrincipal'} direction={sortConfig.direction} />
                      </button>
                    </th>
                    <th
                      scope="col"
                      aria-sort={sortConfig.key === 'licenseAssignmentState' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
                    >
                      <button
                        type="button"
                        onClick={() => handleSort('licenseAssignmentState')}
                        className="flex items-center text-inherit uppercase font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 rounded p-0.5 hover:text-white"
                        aria-label={`Sort by State, currently ${sortConfig.key === 'licenseAssignmentState' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'unsorted'}`}
                      >
                        State
                        <SortIcon active={sortConfig.key === 'licenseAssignmentState'} direction={sortConfig.direction} />
                      </button>
                    </th>
                    <th
                      scope="col"
                      aria-sort={sortConfig.key === 'licenseConfig' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
                    >
                      <button
                        type="button"
                        onClick={() => handleSort('licenseConfig')}
                        className="flex items-center text-inherit uppercase font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 rounded p-0.5 hover:text-white"
                        aria-label={`Sort by License Config, currently ${sortConfig.key === 'licenseConfig' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'unsorted'}`}
                      >
                        License Config
                        <SortIcon active={sortConfig.key === 'licenseConfig'} direction={sortConfig.direction} />
                      </button>
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
                    >
                      License ID
                    </th>
                    <th
                      scope="col"
                      aria-sort={sortConfig.key === 'lastLoginTime' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
                    >
                      <button
                        type="button"
                        onClick={() => handleSort('lastLoginTime')}
                        className="flex items-center text-inherit uppercase font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 rounded p-0.5 hover:text-white"
                        aria-label={`Sort by Last Login, currently ${sortConfig.key === 'lastLoginTime' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'unsorted'}`}
                      >
                        Last Login
                        <SortIcon active={sortConfig.key === 'lastLoginTime'} direction={sortConfig.direction} />
                      </button>
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                  {/* Filter Row */}
                  <tr>
                    <th className="px-6 py-2 bg-gray-800 border-b border-gray-700"></th>
                    <th className="px-6 py-2 bg-gray-800 border-b border-gray-700">
                      <input
                        type="text"
                        placeholder="Filter Principal..."
                        aria-label="Filter Principal"
                        value={inputPrincipal}
                        onChange={(e) => setInputPrincipal(e.target.value)}
                        onBlur={() => setFilterPrincipal(inputPrincipal)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') setFilterPrincipal(inputPrincipal);
                        }}
                        className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white"
                      />
                    </th>
                    <th className="px-6 py-2 bg-gray-800 border-b border-gray-700">
                      <select
                        value={filterStatus}
                        aria-label="Filter Status"
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white"
                      >
                        <option value="">All States</option>
                        <option value="ASSIGNED">ASSIGNED</option>
                        <option value="UNASSIGNED">UNASSIGNED</option>
                      </select>
                    </th>
                    <th className="px-6 py-2 bg-gray-800 border-b border-gray-700">
                      <input
                        type="text"
                        placeholder="Filter Config..."
                        aria-label="Filter Config"
                        value={inputConfig}
                        onChange={(e) => setInputConfig(e.target.value)}
                        onBlur={() => setFilterConfig(inputConfig)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') setFilterConfig(inputConfig);
                        }}
                        className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white"
                      />
                    </th>
                    <th className="px-6 py-2 bg-gray-800 border-b border-gray-700"></th>
                    <th className="px-6 py-2 bg-gray-800 border-b border-gray-700">
                      <div className="flex space-x-1">
                        <select
                          title="Date Operator"
                          aria-label="Date Operator"
                          value={filterDateOperator}
                          onChange={(e) => setFilterDateOperator(e.target.value as any)}
                          className="bg-gray-700 border border-gray-600 rounded px-1 py-1 text-xs text-white w-10 text-center"
                        >
                          <option value=">">&gt;</option>
                          <option value="<">&lt;</option>
                          <option value="=">=</option>
                        </select>
                        <input
                          title="Date Value"
                          aria-label="Date Value"
                          type="date"
                          value={inputDateValue}
                          onChange={(e) => setInputDateValue(e.target.value)}
                          onBlur={() => setFilterDateValue(inputDateValue)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') setFilterDateValue(inputDateValue);
                          }}
                          className="flex-grow bg-gray-700 border border-gray-600 rounded px-1 py-1 text-xs text-white min-w-0"
                        />
                        {filterDateValue && (
                          <button
                            title="Clear Date"
                            aria-label="Clear Date Filter"
                            onClick={() => {
                              setFilterDateValue('');
                              setInputDateValue('');
                            }}
                            className="text-gray-400 hover:text-white px-1 font-bold"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                    </th>
                    <th className="px-6 py-2 bg-gray-800 border-b border-gray-700 text-right">
                      {(filterPrincipal ||
                        inputPrincipal ||
                        filterStatus ||
                        filterConfig ||
                        inputConfig ||
                        filterDateValue ||
                        inputDateValue) && (
                        <button
                          onClick={() => {
                            setFilterPrincipal('');
                            setInputPrincipal('');
                            setFilterConfig('');
                            setInputConfig('');
                            setFilterStatus('');
                            setFilterDateValue('');
                            setInputDateValue('');
                          }}
                          className="text-xs text-blue-400 hover:text-blue-300 underline"
                        >
                          Clear All
                        </button>
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-gray-800 divide-y divide-gray-700">
                  {paginatedUserLicenses.map((license, idx) => {
                    const resourceName = license.licenseConfig || '';
                    const friendlyName = licenseNames[resourceName] || resourceName.split('/').pop() || 'N/A';
                    const isAssigned = license.licenseAssignmentState === 'ASSIGNED';
                    const licenseId = license.name ? (
                      license.name.split('/').pop()
                    ) : license.userPrincipal ? (
                      <span className="text-gray-500 italic">(will infer)</span>
                    ) : (
                      <span className="text-red-400 italic">Missing</span>
                    );

                    return (
                      <tr
                        key={license.name || `${license.userPrincipal}-${idx}`}
                        className={`hover:bg-gray-700/50 transition-colors ${
                          selectedUsers.has(license.userPrincipal) ? 'bg-blue-900/20' : ''
                        }`}
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          {license.userPrincipal && (
                            <input
                              type="checkbox"
                              aria-label={`Select ${license.userPrincipal}`}
                              className="rounded border-gray-500 bg-gray-600 text-blue-500 focus:ring-blue-500 h-4 w-4"
                              checked={selectedUsers.has(license.userPrincipal)}
                              onChange={() => handleSelectUser(license.userPrincipal)}
                            />
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                          {license.userPrincipal || 'Unknown User'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              isAssigned
                                ? 'bg-green-900/50 text-green-400 border border-green-700'
                                : 'bg-gray-700 text-gray-400'
                            }`}
                          >
                            {license.licenseAssignmentState}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300" title={resourceName}>
                          {friendlyName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 font-mono">
                          {licenseId}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                          {license.lastLoginTime ? new Date(license.lastLoginTime).toLocaleString() : 'Never'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              onClick={() => setJsonModalData(license)}
                              className="text-blue-400 hover:text-blue-300 flex items-center"
                              title="View Raw JSON"
                              aria-label={`View JSON for ${license.userPrincipal}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path
                                  fillRule="evenodd"
                                  d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 10 5.293 7.707a1 1 0 010-1.414zM11 12a1 1 0 100 2h3a1 1 0 100-2h-3z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={() => requestDelete(license, 'revoke')}
                              className="text-yellow-400 hover:text-yellow-300 flex items-center"
                              disabled={isActionLoading}
                              title="Revoke License"
                              aria-label={`Revoke license for ${license.userPrincipal}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                              </svg>
                            </button>
                            <button
                              onClick={() => requestDelete(license, 'delete')}
                              className="text-red-400 hover:text-red-300 flex items-center"
                              disabled={isActionLoading}
                              title="Delete User"
                              aria-label={`Delete user ${license.userPrincipal}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path
                                  fillRule="evenodd"
                                  d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {sortedUserLicenses.length > 0 && (
              <div className="bg-gray-800 px-6 py-3 border-t border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-400">
                <div className="flex items-center gap-2">
                  <span>Rows per page:</span>
                  <select
                    aria-label="Rows per page"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="bg-gray-700 border border-gray-600 text-white rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={250}>250</option>
                  </select>
                  <span className="ml-2">
                    Showing{' '}
                    <span className="font-semibold text-white">
                      {((currentPage - 1) * pageSize + 1).toLocaleString()}
                    </span>{' '}
                    to{' '}
                    <span className="font-semibold text-white">
                      {Math.min(currentPage * pageSize, sortedUserLicenses.length).toLocaleString()}
                    </span>{' '}
                    of{' '}
                    <span className="font-semibold text-white">
                      {sortedUserLicenses.length.toLocaleString()}
                    </span>{' '}
                    {filteredUserLicenses.length !== userLicenses.length && (
                      <span>(filtered from {userLicenses.length.toLocaleString()} total)</span>
                    )}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-2.5 py-1 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 hover:text-white disabled:opacity-40 disabled:hover:bg-gray-700 disabled:hover:text-gray-300 text-xs font-medium transition-colors"
                    title="First Page"
                    aria-label="First Page"
                  >
                    &laquo;
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 hover:text-white disabled:opacity-40 disabled:hover:bg-gray-700 disabled:hover:text-gray-300 text-xs font-medium transition-colors"
                    aria-label="Previous Page"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1 text-xs text-gray-300 font-medium">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 hover:text-white disabled:opacity-40 disabled:hover:bg-gray-700 disabled:hover:text-gray-300 text-xs font-medium transition-colors"
                    aria-label="Next Page"
                  >
                    Next
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-2.5 py-1 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 hover:text-white disabled:opacity-40 disabled:hover:bg-gray-700 disabled:hover:text-gray-300 text-xs font-medium transition-colors"
                    title="Last Page"
                    aria-label="Last Page"
                  >
                    &raquo;
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          !isLicensesLoading && (
            <div className="text-gray-500 text-center p-8 bg-gray-800">
              No user licenses found matching criteria.
            </div>
          )
        )}
      </div>
    </>
  );
};
