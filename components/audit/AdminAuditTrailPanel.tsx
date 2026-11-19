/**
 * Copyright 2026 Google LLC
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

import React, { useState, useEffect, useCallback } from 'react';
import {
  AUDIT_GOVERNANCE_SERVICES,
  AuditGovernanceService,
  AuditTimeWindow,
  ParsedAuditLogEntry,
  exportAuditLogsToCsv,
  fetchAdminAuditLogs,
  isAuditLogPermissionError,
} from '../../services/api/auditLogs';

export interface AdminAuditTrailPanelProps {
  projectId: string;
}

export const AdminAuditTrailPanel: React.FC<AdminAuditTrailPanelProps> = ({ projectId }) => {
  const [targetProject, setTargetProject] = useState<string>(projectId || '');
  const [timeWindow, setTimeWindow] = useState<AuditTimeWindow>('7d');
  const [serviceFilter, setServiceFilter] = useState<AuditGovernanceService>('ALL');
  const [principalFilter, setPrincipalFilter] = useState<string>('');
  const [methodFilter, setMethodFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [entries, setEntries] = useState<ParsedAuditLogEntry[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
  const [executedFilter, setExecutedFilter] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<unknown>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showFilterPreview, setShowFilterPreview] = useState<boolean>(false);

  useEffect(() => {
    if (projectId && !targetProject) {
      setTargetProject(projectId);
    }
  }, [projectId, targetProject]);

  const loadAuditLogs = useCallback(
    async (pageToken?: string) => {
      const cleanProj = targetProject.trim();
      if (!cleanProj) {
        setError(new Error('Please enter a Google Cloud Project ID or Number to query Cloud Audit Logs.'));
        return;
      }

      if (pageToken) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
        setError(null);
      }

      try {
        const result = await fetchAdminAuditLogs({
          projectId: cleanProj,
          timeWindow,
          serviceFilter,
          principalEmail: principalFilter,
          methodName: methodFilter,
          searchQuery,
          pageSize: 100,
          pageToken,
        });

        setExecutedFilter(result.executedFilter);
        setNextPageToken(result.nextPageToken);
        if (pageToken) {
          setEntries((prev) => [...prev, ...result.entries]);
        } else {
          setEntries(result.entries);
        }
      } catch (err: unknown) {
        setError(err);
        if (!pageToken) {
          setEntries([]);
          setNextPageToken(undefined);
        }
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [targetProject, timeWindow, serviceFilter, principalFilter, methodFilter, searchQuery]
  );

  useEffect(() => {
    if (targetProject.trim()) {
      void loadAuditLogs();
    }
    // Only auto-query on initial project availability or window/service pill change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeWindow, serviceFilter]);

  const handleExportCsv = () => {
    if (entries.length === 0) return;
    const csvContent = exportAuditLogsToCsv(entries);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `gemini-enterprise-audit-trail-${targetProject.trim() || 'project'}-${timeWindow}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyJson = async (id: string, payload: unknown) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
    } catch {
      // Ignore clipboard permission failure
    }
  };

  const isPermissionDenied = Boolean(error && isAuditLogPermissionError(error));
  const errorMessage =
    error instanceof Error ? error.message : error ? String(error) : null;

  const shortServiceBadge = (svc: string) => {
    if (svc.includes('discoveryengine')) return 'Discovery Engine';
    if (svc.includes('modelarmor')) return 'Model Armor';
    if (svc.includes('agentregistry')) return 'Agent Registry';
    if (svc.includes('aiplatform')) return 'Vertex AI';
    return svc;
  };

  return (
    <div className="space-y-5">
      {/* Filter & Controls Card */}
      <div className="bg-gray-800/90 rounded-xl p-5 border border-gray-700/80 shadow-lg space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-gray-700/60 pb-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-semibold text-white">
                Cloud Audit Logs — Admin &amp; Security Governance Trail
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-950/80 text-indigo-300 border border-indigo-700/60">
                cloudaudit.googleapis.com
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Live Admin Activity (<code className="font-mono text-gray-300">activity</code>) and IAM Policy (<code className="font-mono text-gray-300">policy</code>) mutations across Discovery Engine, Model Armor, Agent Registry, and Vertex AI.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {executedFilter && (
              <button
                type="button"
                onClick={() => setShowFilterPreview((v) => !v)}
                className="px-3 py-1.5 bg-gray-900 hover:bg-gray-700 text-gray-300 text-xs font-medium rounded-lg border border-gray-700 transition-colors"
              >
                {showFilterPreview ? 'Hide LQL Filter' : 'View LQL Filter'}
              </button>
            )}
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={entries.length === 0}
              className="px-3 py-1.5 bg-gray-900 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-gray-200 text-xs font-medium rounded-lg border border-gray-700 flex items-center gap-1.5 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-3.5 w-3.5 text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Export CSV ({entries.length})
            </button>
          </div>
        </div>

        {/* Filter Inputs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">
              GCP Project ID / Number
            </label>
            <input
              type="text"
              value={targetProject}
              onChange={(e) => setTargetProject(e.target.value)}
              placeholder="e.g. my-prod-project"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">Time Window</label>
            <select
              value={timeWindow}
              onChange={(e) => setTimeWindow(e.target.value as AuditTimeWindow)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">GCP Service</label>
            <select
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value as AuditGovernanceService)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL">All Governance Services</option>
              {AUDIT_GOVERNANCE_SERVICES.map((svc) => (
                <option key={svc} value={svc}>
                  {svc}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">
              Principal Email
            </label>
            <input
              type="text"
              value={principalFilter}
              onChange={(e) => setPrincipalFilter(e.target.value)}
              placeholder="admin@corp.com or SA"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-1">
              RPC Method Filter
            </label>
            <input
              type="text"
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              placeholder="e.g. CreateAgent, SetIamPolicy"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-col justify-end">
            <button
              type="button"
              onClick={() => void loadAuditLogs()}
              disabled={isLoading || !targetProject.trim()}
              className="w-full px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg shadow transition-colors flex items-center justify-center gap-2 h-[30px]"
            >
              {isLoading ? (
                <>
                  <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
                  <span>Querying...</span>
                </>
              ) : (
                <span>Query Audit Logs</span>
              )}
            </button>
          </div>
        </div>

        {/* Resource / Keyword Search Bar */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                void loadAuditLogs();
              }
            }}
            placeholder="Search resource path, engine ID, agent ID, template name, or principal (press Enter to query)..."
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="px-2.5 py-1.5 text-xs text-gray-400 hover:text-white bg-gray-900 border border-gray-700 rounded-lg"
            >
              Clear
            </button>
          )}
        </div>

        {showFilterPreview && executedFilter && (
          <div className="p-3 bg-gray-950/80 border border-gray-700 rounded-lg">
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">
              Executed Cloud Logging v2 Filter
            </div>
            <pre className="text-[11px] font-mono text-blue-300 whitespace-pre-wrap break-all">
              {executedFilter}
            </pre>
          </div>
        )}
      </div>

      {/* Honest 403 IAM Guidance Banner */}
      {isPermissionDenied && (
        <div
          role="alert"
          data-testid="audit-logs-iam-guidance"
          className="p-4 bg-amber-950/50 border border-amber-700/80 rounded-xl text-amber-100 text-xs space-y-2.5"
        >
          <div className="flex items-start gap-2.5">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-amber-400 shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div className="space-y-1.5 flex-1">
              <div className="font-bold text-amber-200 text-sm">
                Cloud Logging IAM Permission Required (HTTP 403 PERMISSION_DENIED)
              </div>
              <p className="text-amber-200/90 leading-relaxed">
                Your signed-in account lacks <code className="font-mono bg-amber-900/60 px-1 py-0.5 rounded">logging.logEntries.list</code> on project{' '}
                <code className="font-mono bg-amber-900/60 px-1 py-0.5 rounded">{targetProject.trim()}</code>. Grant{' '}
                <code className="font-mono bg-amber-900/60 px-1 py-0.5 rounded">roles/logging.viewer</code> (for Admin Activity &amp; Policy logs) or{' '}
                <code className="font-mono bg-amber-900/60 px-1 py-0.5 rounded">roles/logging.privateLogViewer</code> (if inspecting restricted/Data Access logs):
              </p>
              <pre className="p-2.5 bg-gray-950/90 border border-amber-800/60 rounded-lg font-mono text-[11px] text-amber-200 overflow-x-auto">
                {`gcloud projects add-iam-policy-binding ${targetProject.trim() || 'PROJECT_ID'} \\\n  --member="user:YOUR_EMAIL@DOMAIN.COM" \\\n  --role="roles/logging.viewer"`}
              </pre>
              {errorMessage && (
                <div className="text-[11px] text-amber-300/80 font-mono">
                  API detail: {errorMessage}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Non-403 API Error Banner */}
      {Boolean(error) && !isPermissionDenied && (
        <div
          role="alert"
          className="p-4 bg-red-950/50 border border-red-700/70 rounded-xl text-red-200 text-xs"
        >
          <div className="font-semibold text-red-300 mb-0.5">Failed to Query Cloud Audit Logs</div>
          <div className="font-mono text-[11px]">{errorMessage}</div>
        </div>
      )}

      {/* Audit Entries Table */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-900/80 text-gray-400 uppercase tracking-wider text-[10px] border-b border-gray-700">
              <tr>
                <th className="py-3 px-4">Timestamp (UTC)</th>
                <th className="py-3 px-4">Stream</th>
                <th className="py-3 px-4">Service</th>
                <th className="py-3 px-4">Method</th>
                <th className="py-3 px-4">Principal</th>
                <th className="py-3 px-4">Target Resource</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/60 text-gray-200">
              {entries.length === 0 && !isLoading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-gray-400">
                    No Cloud Audit Log entries found matching the current filters. Click{' '}
                    <strong className="text-gray-200">Query Audit Logs</strong> or widen the time window.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => {
                  const isExpanded = expandedId === entry.id;
                  const isFailed =
                    (entry.statusCode !== undefined && entry.statusCode !== 0) ||
                    entry.severity === 'ERROR';
                  const shortMethod = entry.methodName.split('.').slice(-2).join('.');

                  return (
                    <React.Fragment key={entry.id}>
                      <tr
                        onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                        className="hover:bg-gray-700/40 transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-4 font-mono text-[11px] text-gray-300 whitespace-nowrap">
                          {entry.timestamp
                            ? new Date(entry.timestamp).toISOString().replace('T', ' ').slice(0, 19)
                            : 'N/A'}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                              entry.logType === 'POLICY'
                                ? 'bg-purple-950/70 text-purple-300 border-purple-700/60'
                                : 'bg-blue-950/70 text-blue-300 border-blue-700/60'
                            }`}
                          >
                            {entry.logType === 'POLICY' ? 'IAM POLICY' : 'ADMIN'}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-gray-300 font-medium">
                          {shortServiceBadge(entry.serviceName)}
                        </td>
                        <td
                          className="py-3 px-4 font-mono text-[11px] text-white max-w-[220px] truncate"
                          title={entry.methodName}
                        >
                          {shortMethod || entry.methodName}
                        </td>
                        <td
                          className="py-3 px-4 font-mono text-[11px] text-emerald-300 max-w-[200px] truncate"
                          title={entry.principalEmail}
                        >
                          {entry.principalEmail}
                        </td>
                        <td
                          className="py-3 px-4 font-mono text-[11px] text-gray-400 max-w-[260px] truncate"
                          title={entry.resourceName}
                        >
                          {entry.resourceName || 'N/A'}
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {isFailed ? (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-950 text-red-300 border border-red-800">
                              ERR {entry.statusCode ?? ''}
                            </span>
                          ) : (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
                              OK
                            </span>
                          )}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-gray-900/90">
                          <td colSpan={7} className="p-4 border-l-2 border-indigo-500">
                            <div className="space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="space-x-4 text-[11px] text-gray-300">
                                  <span>
                                    <strong className="text-gray-400">Full Method:</strong>{' '}
                                    <code className="font-mono text-white">{entry.methodName}</code>
                                  </span>
                                  {entry.callerIp && (
                                    <span>
                                      <strong className="text-gray-400">Caller IP:</strong>{' '}
                                      <code className="font-mono text-gray-200">{entry.callerIp}</code>
                                    </span>
                                  )}
                                  {entry.statusMessage && (
                                    <span>
                                      <strong className="text-red-400">Status Message:</strong>{' '}
                                      <span className="text-red-200">{entry.statusMessage}</span>
                                    </span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleCopyJson(entry.id, entry.protoPayload);
                                  }}
                                  className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded border border-gray-700 text-[11px] font-medium"
                                >
                                  {copiedId === entry.id ? 'Copied JSON!' : 'Copy protoPayload JSON'}
                                </button>
                              </div>

                              {/* Request / Response / Policy Delta Inspector */}
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                {entry.request && (
                                  <div className="bg-gray-950/90 border border-gray-800 rounded-lg p-3">
                                    <div className="text-[10px] uppercase tracking-wider font-semibold text-blue-400 mb-1.5">
                                      protoPayload.request
                                    </div>
                                    <pre className="text-[11px] font-mono text-gray-200 overflow-x-auto max-h-64">
                                      {JSON.stringify(entry.request, null, 2)}
                                    </pre>
                                  </div>
                                )}

                                {entry.policyDelta ? (
                                  <div className="bg-gray-950/90 border border-purple-800/60 rounded-lg p-3">
                                    <div className="text-[10px] uppercase tracking-wider font-semibold text-purple-300 mb-1.5">
                                      IAM Policy Delta / Bindings Diff
                                    </div>
                                    <pre className="text-[11px] font-mono text-purple-100 overflow-x-auto max-h-64">
                                      {JSON.stringify(entry.policyDelta, null, 2)}
                                    </pre>
                                  </div>
                                ) : entry.response ? (
                                  <div className="bg-gray-950/90 border border-gray-800 rounded-lg p-3">
                                    <div className="text-[10px] uppercase tracking-wider font-semibold text-emerald-400 mb-1.5">
                                      protoPayload.response
                                    </div>
                                    <pre className="text-[11px] font-mono text-gray-200 overflow-x-auto max-h-64">
                                      {JSON.stringify(entry.response, null, 2)}
                                    </pre>
                                  </div>
                                ) : null}
                              </div>

                              {!entry.request && !entry.response && !entry.policyDelta && (
                                <div className="bg-gray-950/90 border border-gray-800 rounded-lg p-3">
                                  <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-1.5">
                                    Full protoPayload
                                  </div>
                                  <pre className="text-[11px] font-mono text-gray-200 overflow-x-auto max-h-64">
                                    {JSON.stringify(entry.protoPayload, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {nextPageToken && (
          <div className="p-3 bg-gray-900/60 border-t border-gray-700 flex justify-center">
            <button
              type="button"
              onClick={() => void loadAuditLogs(nextPageToken)}
              disabled={isLoadingMore}
              className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium rounded-lg border border-gray-600 transition-colors"
            >
              {isLoadingMore ? 'Loading older audit entries...' : 'Load More Entries'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminAuditTrailPanel;
