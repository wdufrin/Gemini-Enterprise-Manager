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
import {
  ServiceAgentValidation,
  UserPermissionsValidation,
} from '../../types';

interface ApiValidationPanelProps {
  projectNumber: string;
  apiValidationResult: { enabled: string[]; disabled: string[] } | null;
  serviceAgentValidation: ServiceAgentValidation | null;
  userPermissionsValidation: UserPermissionsValidation | null;
  isGrantingServiceAgent: boolean;
  serviceAgentActionFeedback: { type: 'success' | 'error'; message: string } | null;
  onGrantServiceAgent: () => void;
  apisToEnable: Set<string>;
  onToggleApiToEnable: (apiName: string) => void;
  onToggleAllApisToEnable: () => void;
  isApiEnablingLoading: boolean;
  onEnableApis: () => void;
}

export const ApiValidationPanel: React.FC<ApiValidationPanelProps> = ({
  projectNumber,
  apiValidationResult,
  serviceAgentValidation,
  userPermissionsValidation,
  isGrantingServiceAgent,
  serviceAgentActionFeedback,
  onGrantServiceAgent,
  apisToEnable,
  onToggleApiToEnable,
  onToggleAllApisToEnable,
  isApiEnablingLoading,
  onEnableApis,
}) => {
  const [showAllUserPermissions, setShowAllUserPermissions] = useState(false);
  const [activeValidationTab, setActiveValidationTab] = useState<
    'all' | 'apis' | 'serviceAgent' | 'permissions'
  >('all');

  if (
    !apiValidationResult &&
    !serviceAgentValidation &&
    !userPermissionsValidation
  ) {
    return null;
  }

  const renderList = (items: string[], isSuccess: boolean) => (
    <ul className="space-y-1.5">
      {items.map((item) => {
        const serviceUrl = `https://console.cloud.google.com/apis/library/${item}?project=${projectNumber}`;
        return (
          <li
            key={item}
            className={`flex items-center text-xs ${isSuccess ? 'text-green-300' : 'text-red-300'} bg-gray-950/40 px-2.5 py-1.5 rounded border ${isSuccess ? 'border-green-900/30' : 'border-red-900/40'}`}
          >
            {!isSuccess && (
              <input
                type="checkbox"
                checked={apisToEnable.has(item)}
                onChange={() => onToggleApiToEnable(item)}
                className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600 mr-2.5 shrink-0"
                disabled={isApiEnablingLoading}
              />
            )}
            {isSuccess ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 mr-2 text-green-400 shrink-0"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 mr-2 text-red-400 shrink-0"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            <span className="font-mono">{item}</span>
            {!isSuccess && (
              <a
                href={serviceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-xs text-blue-400 hover:underline"
              >
                [View in Console]
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="mt-6 space-y-4">
      {/* Validation Section Tabs */}
      <div className="flex border-b border-gray-700 gap-1 pb-1">
        {[
          { id: 'all', label: 'All Checks' },
          { id: 'serviceAgent', label: 'Service Agent' },
          { id: 'permissions', label: 'User Access' },
          {
            id: 'apis',
            label: `APIs (${apiValidationResult?.enabled.length || 0}/13)`,
          },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveValidationTab(tab.id as any)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-t-md transition-colors ${
              activeValidationTab === tab.id
                ? 'bg-gray-800 text-blue-400 border-t-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/40'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 1. Discovery Engine Service Agent Check */}
      {(activeValidationTab === 'all' ||
        activeValidationTab === 'serviceAgent') &&
        serviceAgentValidation && (
          <div className="p-4 bg-gray-900/60 rounded-lg border border-gray-700/80 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-indigo-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
                <h4 className="text-sm font-bold text-white">
                  Discovery Engine Service Agent
                </h4>
              </div>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border self-start sm:self-auto ${
                  serviceAgentValidation.hasRequiredRole
                    ? 'bg-green-900/50 text-green-300 border-green-700'
                    : serviceAgentValidation.status === 'PERMISSION_DENIED'
                      ? 'bg-yellow-900/40 text-yellow-300 border-yellow-700'
                      : 'bg-red-900/50 text-red-300 border-red-700'
                }`}
              >
                {serviceAgentValidation.hasRequiredRole
                  ? '🟢 Service Agent Authorized'
                  : serviceAgentValidation.status === 'PERMISSION_DENIED'
                    ? '⚠️ IAM Inspection Scoped'
                    : '❌ Missing Service Agent Role'}
              </span>
            </div>

            <div className="text-xs text-gray-300 space-y-1 bg-gray-950/60 p-3 rounded border border-gray-800 font-mono break-all">
              <span className="text-gray-500 block text-[11px] font-sans">
                Expected Service Identity:
              </span>
              <span className="text-blue-300">
                {serviceAgentValidation.email}
              </span>
            </div>

            {serviceAgentValidation.hasRequiredRole ? (
              <div className="space-y-2">
                <p className="text-xs text-green-300">
                  Primary role{' '}
                  <code className="bg-gray-800 px-1 py-0.5 rounded text-green-200">
                    roles/discoveryengine.serviceAgent
                  </code>{' '}
                  is actively bound on this project.
                </p>
                {serviceAgentValidation.assignedRoles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {serviceAgentValidation.assignedRoles.map((role) => (
                      <span
                        key={role}
                        className="text-[10px] bg-gray-800 text-gray-300 px-2 py-0.5 rounded border border-gray-700"
                      >
                        {role}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : serviceAgentValidation.status === 'PERMISSION_DENIED' ? (
              <div className="text-xs text-yellow-300 bg-yellow-950/30 p-3 rounded border border-yellow-900/50 space-y-1">
                <p className="font-semibold">
                  Notice: Current user cannot inspect project-level IAM policy.
                </p>
                <p className="text-yellow-400/80 text-[11px]">
                  {serviceAgentValidation.errorMessage} If assistants
                  experience execution errors, verify that{' '}
                  <code className="text-yellow-200">
                    {serviceAgentValidation.email}
                  </code>{' '}
                  has{' '}
                  <code className="text-yellow-200">
                    roles/discoveryengine.serviceAgent
                  </code>{' '}
                  in GCP IAM Console.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs text-red-300 bg-red-950/30 p-3 rounded border border-red-900/50 space-y-1">
                  <p className="font-bold">
                    Required Role Missing: roles/discoveryengine.serviceAgent
                  </p>
                  <p className="text-red-300/80 text-[11px]">
                    Discovery Engine uses this service identity to ground
                    search queries, crawl data stores, and orchestrate
                    reasoning engines. Without this role, agent execution and
                    data indexing will fail.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onGrantServiceAgent}
                  disabled={isGrantingServiceAgent}
                  className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 text-white text-xs font-bold rounded-md shadow transition-colors flex items-center justify-center gap-2"
                >
                  {isGrantingServiceAgent ? (
                    <>
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-b-2 border-white"></div>
                      Granting Service Agent Role...
                    </>
                  ) : (
                    '+ Grant Discovery Engine Service Agent Role'
                  )}
                </button>
              </div>
            )}

            {serviceAgentActionFeedback && (
              <div
                className={`p-2.5 rounded text-xs ${
                  serviceAgentActionFeedback.type === 'success'
                    ? 'bg-green-900/40 text-green-200 border border-green-800'
                    : 'bg-red-900/40 text-red-200 border border-red-800'
                }`}
              >
                {serviceAgentActionFeedback.message}
              </div>
            )}
          </div>
        )}

      {/* 2. User Permissions Audit */}
      {(activeValidationTab === 'all' ||
        activeValidationTab === 'permissions') &&
        userPermissionsValidation && (
          <div className="p-4 bg-gray-900/60 rounded-lg border border-gray-700/80 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-blue-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                <h4 className="text-sm font-bold text-white">
                  Caller / User Permissions Audit
                </h4>
              </div>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border self-start sm:self-auto ${
                  userPermissionsValidation.hasAdminAccess
                    ? 'bg-green-900/50 text-green-300 border-green-700'
                    : 'bg-yellow-900/40 text-yellow-300 border-yellow-700'
                }`}
              >
                {userPermissionsValidation.grantedCount} of{' '}
                {userPermissionsValidation.totalCount} Permissions Verified
              </span>
            </div>

            {userPermissionsValidation.missingCritical.length > 0 && (
              <div className="text-xs text-yellow-300 bg-yellow-950/30 p-3 rounded border border-yellow-900/50 space-y-1">
                <p className="font-bold">
                  Missing Core Discovery Engine Privileges
                </p>
                <p className="text-yellow-400/80 text-[11px]">
                  Your account is missing:{' '}
                  <code className="text-yellow-200">
                    {userPermissionsValidation.missingCritical.join(', ')}
                  </code>
                  . Request{' '}
                  <code className="text-yellow-200">
                    roles/discoveryengine.admin
                  </code>{' '}
                  or{' '}
                  <code className="text-yellow-200">
                    roles/discoveryengine.editor
                  </code>{' '}
                  from your project administrator.
                </p>
              </div>
            )}

            {userPermissionsValidation.notice && (
              <p className="text-xs text-gray-400 bg-gray-950/40 p-2.5 rounded border border-gray-800">
                {userPermissionsValidation.notice}
              </p>
            )}

            {/* Permissions Group Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {[
                'Discovery Engine Admin',
                'IAM & Security',
                'Service Management',
                'Vertex AI / Reasoning',
              ].map((cat) => {
                const groupItems = userPermissionsValidation.items.filter(
                  (i) => i.category === cat,
                );
                const grantedInGroup = groupItems.filter(
                  (i) => i.granted,
                ).length;
                const isAllGranted = grantedInGroup === groupItems.length;

                return (
                  <div
                    key={cat}
                    className="p-2.5 bg-gray-950/40 rounded border border-gray-800 text-xs space-y-1"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-gray-200">
                        {cat}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                          isAllGranted
                            ? 'bg-green-900/60 text-green-300'
                            : 'bg-yellow-900/60 text-yellow-300'
                        }`}
                      >
                        {grantedInGroup}/{groupItems.length}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400">
                      {isAllGranted
                        ? 'All capabilities verified.'
                        : 'Some management operations may be restricted.'}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() =>
                  setShowAllUserPermissions(!showAllUserPermissions)
                }
                className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
              >
                {showAllUserPermissions
                  ? '▲ Hide Granular Permissions'
                  : '▼ View All Granular Permissions Tested'}
              </button>

              {showAllUserPermissions && (
                <div className="mt-3 space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  {userPermissionsValidation.items.map((item) => (
                    <div
                      key={item.permission}
                      className="flex items-center justify-between p-2 rounded bg-gray-950/60 border border-gray-800 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        {item.granted ? (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4 text-green-400 shrink-0"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clipRule="evenodd"
                            />
                          </svg>
                        ) : (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4 text-red-400 shrink-0"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                        <div>
                          <span className="font-mono text-gray-200 block text-[11px]">
                            {item.permission}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {item.description}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] text-gray-500 font-mono ml-2 whitespace-nowrap">
                        {item.recommendedRole}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      {/* 3. API Validation Results */}
      {(activeValidationTab === 'all' || activeValidationTab === 'apis') &&
        apiValidationResult && (
          <div className="p-4 bg-gray-900/60 rounded-lg border border-gray-700/80 space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-green-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                Required Google Cloud APIs (
                {apiValidationResult.enabled.length} of 13 Enabled)
              </h4>
            </div>

            {apiValidationResult.disabled.length > 0 && (
              <div className="mb-4 space-y-2">
                <div className="flex justify-between items-center">
                  <div>
                    <h5 className="font-bold text-red-400 text-xs">
                      Disabled APIs ({apiValidationResult.disabled.length})
                    </h5>
                    <p className="text-[11px] text-red-300">
                      These APIs must be enabled for Gemini Enterprise to
                      function properly.
                    </p>
                  </div>
                  <label className="flex items-center text-xs text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      onChange={onToggleAllApisToEnable}
                      checked={
                        apiValidationResult.disabled.length > 0 &&
                        apisToEnable.size ===
                          apiValidationResult.disabled.length
                      }
                      disabled={isApiEnablingLoading}
                      className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600 mr-2"
                    />
                    Select All
                  </label>
                </div>
                {renderList(apiValidationResult.disabled, false)}

                <div className="mt-3 pt-3 border-t border-gray-800">
                  <button
                    onClick={onEnableApis}
                    disabled={apisToEnable.size === 0 || isApiEnablingLoading}
                    className="w-full px-4 py-2.5 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 text-white text-xs font-bold rounded-md shadow transition-colors flex items-center justify-center"
                  >
                    {isApiEnablingLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                        Enabling APIs...
                      </>
                    ) : (
                      `Enable ${apisToEnable.size} Selected API(s)`
                    )}
                  </button>
                </div>
              </div>
            )}

            {apiValidationResult.enabled.length > 0 && (
              <div>
                <h5 className="font-bold text-green-400 text-xs mb-2">
                  Enabled APIs ({apiValidationResult.enabled.length})
                </h5>
                {renderList(apiValidationResult.enabled, true)}
              </div>
            )}
          </div>
        )}
    </div>
  );
};
