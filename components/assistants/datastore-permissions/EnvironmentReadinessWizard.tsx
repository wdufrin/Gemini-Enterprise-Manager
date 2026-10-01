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
  AGENTSPACE_RESTRICTED_USER_ROLE,
  ConnectorInconsistency,
  EnvironmentReadinessState,
  NOTEBOOK_LM_USER_ROLE,
  UserAccessDetails,
} from './types';

interface EnvironmentReadinessWizardProps {
  projectId: string;
  location: string;
  appId: string;
  readiness: EnvironmentReadinessState;
  allUsersList: UserAccessDetails[];
  inconsistentConnectorGrants: ConnectorInconsistency[];
  isTogglingProjectOptIn: boolean;
  isAutoEnablingEnvironment: boolean;
  isRepairingConnectors: boolean;
  onReEvaluate: () => void;
  onToggleProjectOptIn: (enabled: boolean) => void;
  onAutoEnableEnvironment: (onLog?: (msg: string) => void) => void;
  onRepairConnectorInconsistencies: () => void;
}

export const EnvironmentReadinessWizard: React.FC<EnvironmentReadinessWizardProps> = ({
  projectId,
  location,
  appId,
  readiness,
  allUsersList,
  inconsistentConnectorGrants,
  isTogglingProjectOptIn,
  isAutoEnablingEnvironment,
  isRepairingConnectors,
  onReEvaluate,
  onToggleProjectOptIn,
  onAutoEnableEnvironment,
  onRepairConnectorInconsistencies,
}) => {
  const [showManualCommands, setShowManualCommands] = useState(false);
  const [showRequirementsDetails, setShowRequirementsDetails] = useState(false);
  const [autoEnableLogs, setAutoEnableLogs] = useState<string[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const broadRoleUsers = allUsersList.filter(u => u.hasBroadRoles);

  const isFullyReady =
    readiness.dataStoreAccessControlEnabled === true &&
    readiness.v1IamApiSupported === true;

  const needsAutomatedSetup =
    readiness.dataStoreAccessControlEnabled !== true;

  const endpointPrefix =
    location === 'global'
      ? 'https://discoveryengine.googleapis.com'
      : `https://${location}-discoveryengine.googleapis.com`;

  // Manual CLI / cURL commands
  const cmdEnableProjectOptIn = `curl -X PATCH \\
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: ${projectId}" \\
  -d '{
    "customerProvidedConfig": {
      "resourceAccessControlConfig": {
        "dataStoreAccessControlEnabled": true
      }
    }
  }' \\
  "${endpointPrefix}/v1alpha/projects/${projectId}?updateMask=customerProvidedConfig.resourceAccessControlConfig.dataStoreAccessControlEnabled"`;

  const cmdCheckProjectOptIn = `curl -X GET \\
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \\
  -H "X-Goog-User-Project: ${projectId}" \\
  "${endpointPrefix}/v1alpha/projects/${projectId}"`;

  const cmdGrantBaselineProjectRoles = `gcloud projects add-iam-policy-binding ${projectId} \\
  --member="user:userA@example.com" \\
  --role="${AGENTSPACE_RESTRICTED_USER_ROLE}"

gcloud projects add-iam-policy-binding ${projectId} \\
  --member="user:userA@example.com" \\
  --role="${NOTEBOOK_LM_USER_ROLE}"`;

  const cmdVerifyV1Iam = `curl -X GET \\
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \\
  -H "X-Goog-User-Project: ${projectId}" \\
  "${endpointPrefix}/v1/projects/${projectId}/locations/${location}/collections/default_collection/engines/${appId}:getIamPolicy"`;

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-md overflow-hidden">
      {/* Top Readiness Banner */}
      <div className="p-5 bg-gray-800 border-b border-gray-700 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>Environment Readiness & Capability Enablement</span>
            </h3>
            {readiness.isEvaluating ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-900/50 text-blue-300 border border-blue-700">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                Evaluating Environment...
              </span>
            ) : isFullyReady ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-900/50 text-green-300 border border-green-700">
                <span>🟢</span> Environment Ready for Direct DataStore IAM
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-yellow-900/50 text-yellow-300 border border-yellow-700">
                <span>⚠️</span> Action Required to Enforce DataStore Restrictions
              </span>
            )}
            {readiness.lastEvaluatedAt && (
              <span className="text-[11px] text-gray-500 font-mono">
                Checked at {readiness.lastEvaluatedAt}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 max-w-3xl leading-relaxed">
            Evaluates whether Gemini Enterprise <strong>Resource Access Control</strong> (<code className="text-purple-300">dataStoreAccessControlEnabled</code>) is enabled in GE Settings for <code className="text-gray-200">{projectId}</code>, predefined project baseline roles (<code className="text-blue-300">{AGENTSPACE_RESTRICTED_USER_ROLE}</code> + <code className="text-purple-300">{NOTEBOOK_LM_USER_ROLE}</code>), <code className="text-green-300">v1</code> IAM API availability, and user role isolation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {needsAutomatedSetup && (
            <button
              type="button"
              disabled={isAutoEnablingEnvironment || readiness.isEvaluating}
              onClick={() => {
                setAutoEnableLogs([]);
                onAutoEnableEnvironment((msg) => setAutoEnableLogs(prev => [...prev, msg]));
              }}
              className="px-3.5 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-400 text-white text-xs font-bold rounded-lg shadow transition-colors flex items-center gap-1.5"
            >
              {isAutoEnablingEnvironment ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Enabling...
                </>
              ) : (
                <>
                  <span>⚡</span>
                  <span>Enable Resource Access Control</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowRequirementsDetails(!showRequirementsDetails)}
            className={`px-3 py-2 border text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
              showRequirementsDetails
                ? 'bg-blue-900/50 border-blue-500 text-blue-200'
                : 'bg-gray-700 hover:bg-gray-600 border-gray-600 text-gray-200'
            }`}
          >
            <span>📋 What&apos;s Required</span>
          </button>

          <button
            type="button"
            onClick={() => setShowManualCommands(!showManualCommands)}
            className={`px-3 py-2 border text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
              showManualCommands
                ? 'bg-purple-900/50 border-purple-500 text-purple-200'
                : 'bg-gray-700 hover:bg-gray-600 border-gray-600 text-gray-200'
            }`}
          >
            <span>💻 Manual CLI / cURL</span>
          </button>

          <button
            type="button"
            disabled={readiness.isEvaluating}
            onClick={onReEvaluate}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 border border-gray-600 text-gray-200 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
          >
            <span>🔄 Re-Evaluate</span>
          </button>
        </div>
      </div>

      {/* Expandable Requirements Architecture Summary */}
      {showRequirementsDetails && (
        <div className="p-5 bg-gray-900/80 border-b border-gray-700 space-y-4 text-xs text-gray-300">
          <div className="flex justify-between items-start">
            <h4 className="text-sm font-bold text-white">
              Architectural Requirements for Direct DataStore & DataConnector IAM Entitlements
            </h4>
            <button
              type="button"
              onClick={() => setShowRequirementsDetails(false)}
              className="text-gray-400 hover:text-white text-xs"
            >
              ✕ Close
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-800/90 p-3.5 rounded-lg border border-gray-700 space-y-1.5">
              <div className="font-bold text-white flex items-center gap-1.5">
                <span className="text-blue-400">1.</span> Enable Resource Access Control in GE Settings (<code className="text-purple-300">dataStoreAccessControlEnabled</code>)
              </div>
              <p className="text-gray-300 leading-relaxed">
                In the Cloud Console under <strong>Gemini Enterprise → Settings → Resource access control</strong>, turn on the <strong>Resource access control</strong> toggle (or enable it here via <code className="text-purple-300">customerProvidedConfig.resourceAccessControlConfig.dataStoreAccessControlEnabled = true</code>). When enabled, Gemini Enterprise filters apps, DataStores, and DataConnectors by each user&apos;s resource-level IAM permissions (~5 minutes to propagate).
              </p>
            </div>

            <div className="bg-gray-800/90 p-3.5 rounded-lg border border-gray-700 space-y-1.5">
              <div className="font-bold text-white flex items-center gap-1.5">
                <span className="text-green-400">2.</span> Predefined Project Baseline Roles
              </div>
              <p className="text-gray-300 leading-relaxed">
                Avoid granting broad project roles like <code className="text-red-300">roles/discoveryengine.agentspaceUser</code> or <code className="text-red-300">roles/discoveryengine.viewer</code> at the project level, which grant search across all DataStores. Instead, grant the predefined <code className="text-blue-300">{AGENTSPACE_RESTRICTED_USER_ROLE}</code> and <code className="text-purple-300">{NOTEBOOK_LM_USER_ROLE}</code> roles at the project level.
              </p>
            </div>

            <div className="bg-gray-800/90 p-3.5 rounded-lg border border-gray-700 space-y-1.5">
              <div className="font-bold text-white flex items-center gap-1.5">
                <span className="text-purple-400">3.</span> Single DataStores vs. DataConnector Entity Fan-Out
              </div>
              <ul className="list-disc pl-5 space-y-1 text-gray-300">
                <li>
                  <strong>Single / Legacy DataStores:</strong> Bind <code className="text-blue-300">roles/discoveryengine.agentspaceUser</code> on <code className="text-gray-200">collections/default_collection/dataStores/{'{DS_ID}'}</code>.
                </li>
                <li>
                  <strong>DataConnectors (1P & 3P):</strong> Must bind <code className="text-blue-300">roles/discoveryengine.agentspaceUser</code> on <strong>both</strong> the connector Collection (<code className="text-gray-200">collections/{'{CONNECTOR_ID}'}</code>) <strong>and every child Entity DataStore</strong> (<code className="text-gray-200">collections/default_collection/dataStores/{'{ENTITY_ID}'}</code>). Missing any entity causes the connector to be dropped or marked <em>Access inconsistent</em>.
                </li>
              </ul>
            </div>

            <div className="bg-gray-800/90 p-3.5 rounded-lg border border-gray-700 space-y-1.5">
              <div className="font-bold text-white flex items-center gap-1.5">
                <span className="text-blue-400">4.</span> What Predefined Project Roles Include
              </div>
              <p className="text-gray-300 leading-relaxed">
                <code className="text-blue-300">{AGENTSPACE_RESTRICTED_USER_ROLE}</code> + <code className="text-purple-300">{NOTEBOOK_LM_USER_ROLE}</code> provide baseline project capabilities without broad serving access:
              </p>
              <ul className="list-disc pl-5 space-y-0.5 text-green-300 font-mono text-[11px]">
                <li>discoveryengine.locations.buildAuthorizationUrl</li>
                <li>discoveryengine.devToolsConfigs.get</li>
                <li>discoveryengine.dataConnectors.acquireAndStoreRefreshToken</li>
                <li>discoveryengine.notebooks.* (NotebookLM Enterprise)</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* 5 Live Environment Readiness Check Cards */}
      <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 bg-gray-900/40">
        {/* Check 1: GE App Settings - Resource Access Control */}
        <div className="bg-gray-800/90 p-4 rounded-xl border border-gray-700 flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                1. GE App Settings
              </span>
              {readiness.dataStoreAccessControlEnabled === true ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-900/50 text-green-300 border border-green-700">
                  ✓ Enabled
                </span>
              ) : readiness.dataStoreAccessControlEnabled === false ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-900/50 text-yellow-300 border border-yellow-700">
                  Disabled
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-700 text-gray-300">
                  Checking...
                </span>
              )}
            </div>
            <h4 className="text-xs font-bold text-white">
              Resource Access Control
            </h4>
            <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
              <span className="text-blue-300">GE Settings → Resource access control</span>{' '}
              (<code className="text-purple-300 break-all">dataStoreAccessControlEnabled</code>)
            </p>
            <p className="text-[11px] text-gray-400 mt-1">
              {readiness.dataStoreAccessControlEnabled === true
                ? 'Active: Gemini Enterprise filters apps, DataStores & Connectors by per-user resource IAM permissions.'
                : 'Enable in Gemini Enterprise Settings (or click below) to enforce resource-level IAM bindings (~5 min propagation).'}
            </p>
          </div>

          <div className="pt-2 border-t border-gray-700/80 flex items-center justify-between gap-2">
            {readiness.dataStoreAccessControlEnabled === true ? (
              <button
                type="button"
                disabled={isTogglingProjectOptIn}
                onClick={() => onToggleProjectOptIn(false)}
                className="w-full px-2.5 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-semibold rounded transition-colors disabled:opacity-50"
              >
                {isTogglingProjectOptIn ? 'Updating...' : 'Disable Resource Access Control'}
              </button>
            ) : (
              <button
                type="button"
                disabled={isTogglingProjectOptIn}
                onClick={() => onToggleProjectOptIn(true)}
                className="w-full px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded shadow-sm transition-colors disabled:opacity-50"
              >
                {isTogglingProjectOptIn ? 'Enabling...' : '⚡ Enable Resource Access Control'}
              </button>
            )}
          </div>
        </div>

        {/* Check 2: Predefined Project Roles */}
        <div className="bg-gray-800/90 p-4 rounded-xl border border-gray-700 flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                2. Baseline Roles
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-900/50 text-green-300 border border-green-700">
                ✓ Predefined GA
              </span>
            </div>
            <h4 className="text-xs font-bold text-white">
              Predefined Project Roles
            </h4>
            <div className="mt-1.5 space-y-1">
              <div
                className="text-[10px] font-mono flex items-center gap-1 text-green-400"
                title={AGENTSPACE_RESTRICTED_USER_ROLE}
              >
                <span>✓</span>
                <span className="truncate">agentspaceRestrictedUser</span>
              </div>
              <div
                className="text-[10px] font-mono flex items-center gap-1 text-purple-300"
                title={NOTEBOOK_LM_USER_ROLE}
              >
                <span>✓</span>
                <span className="truncate">notebookLmUser</span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-gray-700/80">
            <span className="text-[11px] text-green-400 font-medium block text-center py-1">
              ✓ Standard Google Cloud IAM Roles
            </span>
          </div>
        </div>

        {/* Check 3: v1 IAM Policy API */}
        <div className="bg-gray-800/90 p-4 rounded-xl border border-gray-700 flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                3. v1 IAM API
              </span>
              {readiness.v1IamApiSupported === true ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-900/50 text-green-300 border border-green-700">
                  ✓ GA Active
                </span>
              ) : readiness.v1IamApiSupported === false ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-900/50 text-red-300 border border-red-700">
                  Error
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] bg-gray-700 text-gray-300">
                  Probing...
                </span>
              )}
            </div>
            <h4 className="text-xs font-bold text-white">
              DataStore & Collection IAM
            </h4>
            <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
              Verifies <code className="text-blue-300">/v1/...:getIamPolicy</code> and <code className="text-blue-300">:setIamPolicy</code> on Engine, Collections, and DataStores ({location}).
            </p>
            {readiness.v1IamApiError && (
              <p className="text-[10px] text-red-400 mt-1 line-clamp-2" title={readiness.v1IamApiError}>
                {readiness.v1IamApiError}
              </p>
            )}
          </div>

          <div className="pt-2 border-t border-gray-700/80 text-center">
            <span className="text-[11px] text-gray-400 font-mono">
              Endpoint: /v1 ({location})
            </span>
          </div>
        </div>

        {/* Check 4: Operator Admin Permissions */}
        <div className="bg-gray-800/90 p-4 rounded-xl border border-gray-700 flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                4. Admin Access
              </span>
              {!readiness.adminPermissionsTested ? (
                <span className="px-2 py-0.5 rounded text-[10px] bg-gray-700 text-gray-300">
                  Standard
                </span>
              ) : readiness.missingAdminPermissions.length === 0 ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-900/50 text-green-300 border border-green-700">
                  ✓ Full ({readiness.grantedAdminPermissions.length}/{readiness.grantedAdminPermissions.length})
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-900/50 text-yellow-300 border border-yellow-700">
                  Partial ({readiness.grantedAdminPermissions.length}/{readiness.grantedAdminPermissions.length + readiness.missingAdminPermissions.length})
                </span>
              )}
            </div>
            <h4 className="text-xs font-bold text-white">
              Caller IAM Capabilities
            </h4>
            <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
              {!readiness.adminPermissionsTested
                ? 'Requires Discovery Engine Admin + Project IAM Admin to modify policies.'
                : readiness.missingAdminPermissions.length === 0
                ? 'Your account has all required permissions to enable resource access control and set project & DataStore ACLs.'
                : `Missing: ${readiness.missingAdminPermissions.slice(0, 2).join(', ')}${
                    readiness.missingAdminPermissions.length > 2
                      ? ` (+${readiness.missingAdminPermissions.length - 2} more)`
                      : ''
                  }`}
            </p>
          </div>

          <div className="pt-2 border-t border-gray-700/80 text-center">
            <button
              type="button"
              onClick={() => setShowManualCommands(true)}
              className="text-[11px] text-blue-400 hover:text-blue-300 font-medium"
            >
              View CLI Fallback Commands →
            </button>
          </div>
        </div>

        {/* Check 5: User Isolation & Connector Entity Sync */}
        <div className="bg-gray-800/90 p-4 rounded-xl border border-gray-700 flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                5. Isolation & Sync
              </span>
              {broadRoleUsers.length === 0 && inconsistentConnectorGrants.length === 0 ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-900/50 text-green-300 border border-green-700">
                  ✓ Clean
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-900/50 text-yellow-300 border border-yellow-700">
                  {broadRoleUsers.length + inconsistentConnectorGrants.length} Warning(s)
                </span>
              )}
            </div>
            <h4 className="text-xs font-bold text-white">
              Policy Hygiene Audit
            </h4>
            <div className="mt-1 space-y-1 text-[11px] text-gray-400">
              <div>
                • Broad Role Bypasses:{' '}
                <strong className={broadRoleUsers.length > 0 ? 'text-yellow-300' : 'text-green-400'}>
                  {broadRoleUsers.length} principal(s)
                </strong>
              </div>
              <div>
                • Connector Entity Sync:{' '}
                <strong className={inconsistentConnectorGrants.length > 0 ? 'text-yellow-300' : 'text-green-400'}>
                  {inconsistentConnectorGrants.length === 0
                    ? 'Consistent'
                    : `${inconsistentConnectorGrants.length} Inconsistent`}
                </strong>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-gray-700/80">
            {inconsistentConnectorGrants.length > 0 ? (
              <button
                type="button"
                disabled={isRepairingConnectors}
                onClick={onRepairConnectorInconsistencies}
                className="w-full px-2.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded shadow-sm transition-colors disabled:opacity-50"
              >
                {isRepairingConnectors
                  ? 'Syncing Entities...'
                  : `🔧 Repair ${inconsistentConnectorGrants.length} Connector Sync(s)`}
              </button>
            ) : (
              <span className="text-[11px] text-gray-400 block text-center py-1">
                {broadRoleUsers.length > 0
                  ? 'Use Inspector below to isolate users'
                  : '✓ All connector entities synced'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Automated Enablement Execution Log */}
      {autoEnableLogs.length > 0 && (
        <div className="px-5 py-3 bg-gray-950 border-t border-gray-800 space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Automated Environment Enablement Log
            </span>
            <button
              type="button"
              onClick={() => setAutoEnableLogs([])}
              className="text-[11px] text-gray-500 hover:text-gray-300"
            >
              Clear
            </button>
          </div>
          <div className="font-mono text-xs space-y-1 max-h-40 overflow-y-auto">
            {autoEnableLogs.map((l, idx) => (
              <div
                key={idx}
                className={
                  l.includes('[VERIFIED ✓]') || l.includes('[COMPLETE ✓]')
                    ? 'text-green-400'
                    : l.includes('[ERROR')
                    ? 'text-red-400 font-bold'
                    : 'text-gray-300'
                }
              >
                {l}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expandable Manual CLI / cURL Enablement Commands */}
      {showManualCommands && (
        <div className="p-5 bg-gray-900/90 border-t border-gray-700 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <span>💻 Manual Environment Enablement Commands (CLI & REST)</span>
              </h4>
              <p className="text-xs text-gray-400 mt-0.5">
                Run these commands in Cloud Shell or your terminal if you prefer manual enablement or if your browser session lacks project-level write scopes.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowManualCommands(false)}
              className="text-xs text-gray-400 hover:text-white px-2.5 py-1 bg-gray-800 rounded border border-gray-700"
            >
              ✕ Close Commands
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Command 1: Enable Resource Access Control */}
            <div className="bg-gray-800/80 p-3.5 rounded-lg border border-gray-700 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-white">
                  Step 1a: Enable Resource Access Control in GE Settings (cURL)
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(cmdEnableProjectOptIn, 'cmd-optin')}
                  className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
                >
                  {copiedKey === 'cmd-optin' ? 'Copied ✓' : 'Copy'}
                </button>
              </div>
              <pre className="p-2.5 bg-gray-950 rounded text-[11px] font-mono text-green-300 overflow-x-auto select-all">
                {cmdEnableProjectOptIn}
              </pre>
              <p className="text-[11px] text-gray-400">
                Or in Cloud Console: <strong>Gemini Enterprise → Settings → Resource access control</strong> and toggle on.
              </p>
            </div>

            {/* Command 2: Grant Predefined Project Baseline Roles */}
            <div className="bg-gray-800/80 p-3.5 rounded-lg border border-gray-700 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-white">
                  Step 1b: Grant Predefined Baseline Roles on Project (gcloud)
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(cmdGrantBaselineProjectRoles, 'cmd-grant-roles')}
                  className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
                >
                  {copiedKey === 'cmd-grant-roles' ? 'Copied ✓' : 'Copy'}
                </button>
              </div>
              <pre className="p-2.5 bg-gray-950 rounded text-[11px] font-mono text-blue-200 overflow-x-auto select-all">
                {cmdGrantBaselineProjectRoles}
              </pre>
              <p className="text-[11px] text-gray-400">
                Grants <code className="text-blue-300">{AGENTSPACE_RESTRICTED_USER_ROLE}</code> and <code className="text-purple-300">{NOTEBOOK_LM_USER_ROLE}</code> at the project level.
              </p>
            </div>

            {/* Command 3: Verify Resource Access Control */}
            <div className="bg-gray-800/80 p-3.5 rounded-lg border border-gray-700 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-white">
                  Step 1c: Verify Resource Access Control Status (GET Project)
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(cmdCheckProjectOptIn, 'cmd-check-optin')}
                  className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
                >
                  {copiedKey === 'cmd-check-optin' ? 'Copied ✓' : 'Copy'}
                </button>
              </div>
              <pre className="p-2.5 bg-gray-950 rounded text-[11px] font-mono text-gray-200 overflow-x-auto select-all">
                {cmdCheckProjectOptIn}
              </pre>
            </div>

            {/* Command 4: Verify v1 IAM Policy API */}
            <div className="bg-gray-800/80 p-3.5 rounded-lg border border-gray-700 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-white">
                  Step 1d: Verify v1 Resource IAM Policy Endpoint
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(cmdVerifyV1Iam, 'cmd-verify-v1')}
                  className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
                >
                  {copiedKey === 'cmd-verify-v1' ? 'Copied ✓' : 'Copy'}
                </button>
              </div>
              <pre className="p-2.5 bg-gray-950 rounded text-[11px] font-mono text-gray-200 overflow-x-auto select-all">
                {cmdVerifyV1Iam}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
