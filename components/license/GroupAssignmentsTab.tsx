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
import Spinner from '../Spinner';
import { CloudRunServiceItem, GroupLicensingRunReport, LicenseConfig } from './types';

interface GroupAssignmentsTabProps {
  isServicesLoading: boolean;
  servicesError: string | null;
  groupServices: CloudRunServiceItem[];
  lastRunTimes: Record<string, string>;
  serviceGroups?: Record<string, string[]>;
  runningServices?: Record<string, boolean>;
  serviceReports?: Record<string, GroupLicensingRunReport>;
  activeReport?: GroupLicensingRunReport | null;
  apiLicenseConfigs: LicenseConfig[];
  onNewAssignment: () => void;
  onRunService: (serviceOrUrl?: CloudRunServiceItem | string) => void;
  onViewReport?: (service: CloudRunServiceItem) => void;
  onCloseReport?: () => void;
  onEditService: (service: CloudRunServiceItem) => void;
  onDeleteService: (serviceName: string) => void;
}

const getStatusBadgeClasses = (status: GroupLicensingRunReport['status']) => {
  switch (status) {
    case 'success':
      return 'bg-emerald-900/40 text-emerald-300 border-emerald-700';
    case 'aborted':
      return 'bg-amber-900/40 text-amber-300 border-amber-700';
    case 'error':
      return 'bg-red-900/40 text-red-300 border-red-700';
    default:
      return 'bg-blue-900/40 text-blue-300 border-blue-700';
  }
};

const getStatusLabel = (report: GroupLicensingRunReport) => {
  const codeSuffix = report.httpStatus ? ` (HTTP ${report.httpStatus})` : '';
  switch (report.status) {
    case 'success':
      return `SUCCESS${codeSuffix}`;
    case 'aborted':
      return `SAFETY ABORTED${codeSuffix}`;
    case 'error':
      return `ERROR${codeSuffix}`;
    default:
      return 'RUNNING';
  }
};

export const GroupAssignmentsTab: React.FC<GroupAssignmentsTabProps> = ({
  isServicesLoading,
  servicesError,
  groupServices,
  lastRunTimes,
  serviceGroups = {},
  runningServices = {},
  serviceReports = {},
  activeReport = null,
  apiLicenseConfigs,
  onNewAssignment,
  onRunService,
  onViewReport,
  onCloseReport,
  onEditService,
  onDeleteService,
}) => {
  const [showRawLogs, setShowRawLogs] = useState(false);
  const [showManualGuide, setShowManualGuide] = useState(false);

  const summary = activeReport?.summary;
  const isCleanup = activeReport?.jobType === 'cleanup' || summary?.job === 'cleanup';
  const groupMemberEntries = summary?.groupMemberCounts
    ? Object.entries(summary.groupMemberCounts)
    : [];
  const affectedUsers = isCleanup
    ? summary?.revokedUsersSample || []
    : summary?.assignedUsersSample || [];
  const skippedUsers = summary?.skippedUnmanagedSample || [];
  const shortfalls = summary?.seatShortfalls || [];
  const warnings = summary?.warnings || [];

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 p-6 rounded-lg shadow-md border border-gray-700">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Group License Assignments</h3>
            <p className="text-gray-400 text-sm">
              Configure and deploy services to automate license assignment based on group membership.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowManualGuide((prev) => !prev)}
              className="px-3.5 py-2 bg-gray-700 hover:bg-gray-600 text-blue-300 hover:text-white text-sm font-medium rounded border border-gray-600 transition-colors"
            >
              {showManualGuide ? 'Hide Manual Setup Guide' : 'Manual Setup Guide (Console & CLI)'}
            </button>
            <button
              onClick={onNewAssignment}
              className="px-4 py-2 bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 flex items-center"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Assignment
            </button>
          </div>
        </div>

        {showManualGuide && (
          <div
            data-testid="group-assignments-manual-setup-panel"
            className="mb-6 bg-gray-900/80 border border-blue-800/70 rounded-lg p-5 space-y-4 text-sm text-gray-300"
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-700 pb-3">
              <div>
                <h4 className="text-base font-bold text-white">
                  Step-by-Step Manual Setup Guide (No Cloud Build Required)
                </h4>
                <p className="text-xs text-gray-400 mt-1">
                  If your organization blocks Cloud Build, follow these 4 steps to download the source package and set up the Cloud Run functions manually via the Google Cloud Console or CLI.
                </p>
              </div>
              <button
                type="button"
                onClick={onNewAssignment}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded shadow whitespace-nowrap"
              >
                Open Generator &amp; Download .zip &rarr;
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-gray-800/80 border border-gray-700 rounded-md p-3.5 space-y-1.5">
                <div className="font-semibold text-blue-300">
                  1. Generate &amp; Upload <code>entitlements.json</code>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-gray-300">
                  <li>Click <strong>New Assignment</strong> above, select your Project ID, Region, Subscription Tier, Google Groups, and GCS Bucket.</li>
                  <li>Click <strong>Download .zip</strong> to download <code>group-licensing-source.zip</code> (includes <code>main.py</code>, <code>requirements.txt</code>, <code>Dockerfile</code>, <code>entitlements.json</code>, <code>deploy.sh</code>, and <code>README-MANUAL-SETUP.md</code>).</li>
                  <li>Click <strong>Update Groups in GCS</strong> (or upload <code>entitlements.json</code> to <code>gs://&lt;your-bucket&gt;/config/entitlements.json</code> in the Cloud Storage Console or via <code>gcloud storage cp</code>).</li>
                </ol>
              </div>

              <div className="bg-gray-800/80 border border-gray-700 rounded-md p-3.5 space-y-1.5">
                <div className="font-semibold text-blue-300">
                  2. Create Service Account &amp; Grant IAM + Workspace Access
                </div>
                <ol className="list-decimal list-inside space-y-1 text-gray-300">
                  <li>Create service account <code>license-grouper-sa@&lt;project-id&gt;.iam.gserviceaccount.com</code> in <strong>IAM &amp; Admin &rarr; Service Accounts</strong>.</li>
                  <li>Grant Project roles: <code>Discovery Engine Editor</code>, <code>Logs Writer</code>, and <code>Service Usage Consumer</code>.</li>
                  <li>Grant Bucket role: <code>Storage Object Viewer</code> on your GCS bucket.</li>
                  <li>In <strong>Google Workspace Admin Console</strong> (<code>admin.google.com</code>), add the service account to an external-enabled security group and assign that group the <strong>Groups Reader</strong> admin role.</li>
                </ol>
              </div>

              <div className="bg-gray-800/80 border border-gray-700 rounded-md p-3.5 space-y-1.5">
                <div className="font-semibold text-blue-300">
                  3. Create the Cloud Run Functions (Console or Local Docker CLI)
                </div>
                <ul className="list-disc list-inside space-y-1 text-gray-300">
                  <li><strong>In Cloud Console (Inline Function Editor):</strong> Go to <strong>Cloud Run &rarr; Write a function</strong> and create <code>group-licensing-adder-&lt;location&gt;</code> and <code>group-licensing-cleanup-&lt;location&gt;</code> with Runtime <code>Python 3.11</code>, Entry point <code>handle_trigger</code>, Timeout <code>1800s</code>, Max instances <code>1</code>, Concurrency <code>1</code>, Require authentication, and Service account <code>license-grouper-sa</code>. Paste <code>main.py</code> and <code>requirements.txt</code> from the <code>.zip</code>.</li>
                  <li><strong>Environment Variables:</strong> Set <code>GOOGLE_CLOUD_PROJECT</code>, <code>PROJECT_NUMBER</code>, <code>LOCATION</code>, <code>USER_STORE_ID</code>, <code>CONFIG_GCS_URI</code>, <code>SUBSCRIPTION_TIER</code>, and <code>JOB_TYPE=adder</code> (or <code>cleanup</code> + <code>MAX_REVOCATION_PERCENT=5</code>, <code>MIN_REVOCATION_ALLOWANCE=50</code>).</li>
                  <li><strong>Via CLI without Cloud Build:</strong> Build locally with <code>docker build</code>, push to Artifact Registry, and run <code>gcloud run deploy --image=...</code> (full commands included in <code>README-MANUAL-SETUP.md</code>).</li>
                  <li>Grant <code>license-grouper-sa</code> the <strong>Cloud Run Invoker</strong> (<code>roles/run.invoker</code>) role on both services.</li>
                </ul>
              </div>

              <div className="bg-gray-800/80 border border-gray-700 rounded-md p-3.5 space-y-1.5">
                <div className="font-semibold text-blue-300">
                  4. Create Cloud Scheduler HTTP Jobs &amp; Verify
                </div>
                <ol className="list-decimal list-inside space-y-1 text-gray-300">
                  <li>In <strong>Cloud Scheduler</strong>, create HTTP POST job <code>trigger-group-licensing-adder-&lt;location&gt;</code> (schedule <code>0 4 * * *</code>) targeting the Adder URL.</li>
                  <li>Create HTTP POST job <code>trigger-group-licensing-cleanup-&lt;location&gt;</code> (schedule <code>0 */6 * * *</code>) targeting the Cleanup URL.</li>
                  <li>On both jobs, set <strong>Auth header</strong> to <code>Add OIDC token</code> using <code>license-grouper-sa</code> and <strong>Attempt deadline</strong> to <code>1800s</code>.</li>
                  <li>Refresh this tab — both services will appear below and can be tested immediately with <strong>Run</strong> and <strong>Report</strong>.</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {isServicesLoading ? (
          <div className="text-center p-4">
            <Spinner /> Loading services...
          </div>
        ) : servicesError ? (
          <div className="text-red-400 text-center p-4">{servicesError}</div>
        ) : groupServices.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-700 bg-gray-900 rounded-lg overflow-hidden">
              <thead className="bg-gray-700/50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Service Name
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Run Region
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    GE Region
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Subscription ID
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Groups
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Job Type
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Last Run
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-gray-800 divide-y divide-gray-700">
                {groupServices.map((service, idx) => {
                  const name = service.name || '';
                  const parts = name.split('/');
                  const id = parts[parts.length - 1];
                  const runRegion = parts[3] || 'N/A';
                  const labels = service.labels || {};
                  const env = service.template?.containers?.[0]?.env || [];
                  const envTier = env.find((e) => e.name === 'SUBSCRIPTION_TIER')?.value;
                  const envLocation = env.find((e) => e.name === 'LOCATION')?.value;
                  const envJobType = env.find((e) => e.name === 'JOB_TYPE')?.value;
                  const geRegion = envLocation || labels['ge-region'] || 'N/A';
                  const geSku = envTier || labels['ge-sku'] || 'N/A';
                  const jobType = envJobType || labels['job-type'] || 'N/A';
                  const groupsList = serviceGroups[id];
                  const groupsDisplay = groupsList && groupsList.length > 0 ? groupsList.join(', ') : 'N/A';
                  const lastRun = lastRunTimes[id] ? new Date(lastRunTimes[id]).toLocaleString() : 'N/A';
                  const isRunning = Boolean(runningServices[id]);
                  const cachedReport = serviceReports[id];

                  const matchConfig = apiLicenseConfigs.find((c) => {
                    const cfgId = c.name.split('/').pop() || '';
                    return cfgId === geSku || cfgId.toLowerCase() === geSku.toLowerCase();
                  });
                  const expDate =
                    matchConfig && matchConfig.endDate && matchConfig.endDate.year
                      ? `${matchConfig.endDate.year}-${String(matchConfig.endDate.month || 1).padStart(2, '0')}-${String(
                          matchConfig.endDate.day || 1
                        ).padStart(2, '0')}`
                      : '';

                  return (
                    <tr key={service.name || idx} className="hover:bg-gray-700/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{id}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{runRegion}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{geRegion}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                        {geSku} {expDate ? `(Exp: ${expDate})` : ''}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-300 max-w-xs truncate" title={groupsDisplay}>
                        {groupsDisplay}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{jobType}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{lastRun}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => onRunService(service)}
                          disabled={isRunning}
                          className="text-green-400 hover:text-green-300 disabled:opacity-50 mr-4"
                        >
                          {isRunning ? 'Running...' : 'Run'}
                        </button>
                        {onViewReport && (
                          <button
                            onClick={() => onViewReport(service)}
                            disabled={isRunning}
                            title={cachedReport ? `Last status: ${cachedReport.status}` : 'Fetch latest execution report'}
                            className="text-purple-400 hover:text-purple-300 disabled:opacity-50 mr-4"
                          >
                            Report
                          </button>
                        )}
                        <button
                          onClick={() => onEditService(service)}
                          className="text-blue-400 hover:text-blue-300 mr-4"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onDeleteService(name)}
                          className="text-red-400 hover:text-red-300"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-gray-500 text-center p-8 bg-gray-800 rounded-lg">
            No group licensing services found.
          </div>
        )}
      </div>

      {activeReport && (
        <div
          data-testid="group-licensing-run-report"
          className="bg-gray-800 p-6 rounded-lg shadow-md border border-gray-700 space-y-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-700 pb-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-3">
                <h4 className="text-base font-semibold text-white">
                  Execution Report: <span className="font-mono text-blue-300">{activeReport.serviceId}</span>
                </h4>
                <span
                  className={`px-2.5 py-0.5 text-xs font-semibold rounded border ${getStatusBadgeClasses(
                    activeReport.status
                  )}`}
                >
                  {getStatusLabel(activeReport)}
                </span>
                <span className="px-2 py-0.5 text-xs font-medium rounded bg-gray-700 text-gray-300 uppercase">
                  {isCleanup ? 'Cleanup (Revoker)' : 'Adder (Joiner)'}
                </span>
                {summary?.dryRun && (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded bg-indigo-900/50 text-indigo-300 border border-indigo-700">
                    DRY RUN
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400">
                Executed: {activeReport.timestamp ? new Date(activeReport.timestamp).toLocaleString() : 'N/A'}
                {activeReport.durationSeconds !== undefined ? ` • Duration: ${activeReport.durationSeconds}s` : ''}
                {activeReport.location ? ` • Location: ${activeReport.location}` : ''}
                {activeReport.subscriptionTier ? ` • Tier: ${activeReport.subscriptionTier}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {onViewReport && (
                <button
                  type="button"
                  onClick={() => {
                    const matchedService = groupServices.find(
                      (s) => s.name === activeReport.serviceName || s.name.endsWith(`/${activeReport.serviceId}`)
                    );
                    if (matchedService) {
                      onViewReport(matchedService);
                    }
                  }}
                  className="text-xs text-purple-300 hover:text-white px-2.5 py-1 rounded border border-purple-700/60 hover:border-purple-500"
                >
                  Refresh Report
                </button>
              )}
              {onCloseReport && (
                <button
                  type="button"
                  onClick={onCloseReport}
                  className="text-xs text-gray-400 hover:text-white px-2.5 py-1 rounded border border-gray-600 hover:border-gray-500"
                >
                  Close Report
                </button>
              )}
            </div>
          </div>

          {/* Summary Message Banner */}
          <div
            className={`p-3 rounded-md border text-sm ${
              activeReport.status === 'aborted'
                ? 'bg-amber-900/20 border-amber-700/60 text-amber-200'
                : activeReport.status === 'error'
                  ? 'bg-red-900/20 border-red-700/60 text-red-200'
                  : 'bg-gray-900/60 border-gray-700 text-gray-200'
            }`}
          >
            <div className="font-medium">{activeReport.message}</div>
            {warnings.length > 0 && (
              <ul className="mt-2 list-disc list-inside text-xs text-amber-300 space-y-1">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="bg-gray-900/70 border border-gray-700 rounded-md p-3">
              <div className="text-xs text-gray-400">Groups Scanned</div>
              <div className="text-lg font-semibold text-white mt-0.5">
                {summary?.groups !== undefined ? summary.groups : '—'}
              </div>
            </div>
            <div className="bg-gray-900/70 border border-gray-700 rounded-md p-3">
              <div className="text-xs text-gray-400">Entitled Users</div>
              <div className="text-lg font-semibold text-white mt-0.5">
                {summary?.entitledUsers !== undefined ? summary.entitledUsers : '—'}
              </div>
            </div>
            {isCleanup ? (
              <>
                <div className="bg-gray-900/70 border border-gray-700 rounded-md p-3">
                  <div className="text-xs text-gray-400">Licenses Revoked</div>
                  <div className="text-lg font-semibold text-amber-300 mt-0.5">
                    {summary?.plannedRevocations !== undefined ? summary.plannedRevocations : '—'}
                  </div>
                </div>
                <div className="bg-gray-900/70 border border-gray-700 rounded-md p-3">
                  <div className="text-xs text-gray-400">Managed Licenses</div>
                  <div className="text-lg font-semibold text-white mt-0.5">
                    {summary?.managedLicenses !== undefined ? summary.managedLicenses : '—'}
                  </div>
                </div>
                <div className="bg-gray-900/70 border border-gray-700 rounded-md p-3">
                  <div className="text-xs text-gray-400">Safety Limit</div>
                  <div className="text-lg font-semibold text-gray-300 mt-0.5">
                    {summary?.revocationLimit !== undefined ? summary.revocationLimit : '—'}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="bg-gray-900/70 border border-gray-700 rounded-md p-3">
                  <div className="text-xs text-gray-400">Newly Assigned</div>
                  <div className="text-lg font-semibold text-emerald-300 mt-0.5">
                    {summary?.plannedAssignments !== undefined ? summary.plannedAssignments : '—'}
                  </div>
                </div>
                <div className="bg-gray-900/70 border border-gray-700 rounded-md p-3">
                  <div className="text-xs text-gray-400">Already Up to Date</div>
                  <div className="text-lg font-semibold text-blue-300 mt-0.5">
                    {summary?.alreadyCorrect !== undefined ? summary.alreadyCorrect : '—'}
                  </div>
                </div>
                <div className="bg-gray-900/70 border border-gray-700 rounded-md p-3">
                  <div className="text-xs text-gray-400">Skipped (Unmanaged Tier)</div>
                  <div className="text-lg font-semibold text-gray-300 mt-0.5">
                    {summary?.skippedUnmanaged !== undefined ? summary.skippedUnmanaged : '0'}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Batch Write & End-State Verification Summary */}
          {(summary?.write || summary?.verification) && (
            <div className="bg-gray-900/50 border border-gray-700 rounded-md p-3 text-xs text-gray-300 flex flex-wrap gap-6">
              {summary.write && (
                <div>
                  <span className="text-gray-400 font-medium">LRO Batch Writes: </span>
                  <span>
                    {summary.write.succeeded}/{summary.write.submitted} confirmed across {summary.write.chunks} chunk(s)
                    {summary.write.failed > 0 ? ` (${summary.write.failed} failed)` : ''}
                  </span>
                </div>
              )}
              {summary.verification && (
                <div>
                  <span className="text-gray-400 font-medium">End-State Verification: </span>
                  {(summary.verification.missingAssignments || 0) === 0 &&
                  (summary.verification.lingeringRevocations || 0) === 0 ? (
                    <span className="text-emerald-400">All changes verified in User Store</span>
                  ) : (
                    <span className="text-amber-300">
                      {summary.verification.missingAssignments || summary.verification.lingeringRevocations} change(s)
                      pending visibility
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Group Member Breakdown */}
          {groupMemberEntries.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Resolved Group Membership
              </h5>
              <div className="flex flex-wrap gap-2">
                {groupMemberEntries.map(([groupEmail, count]) => (
                  <span
                    key={groupEmail}
                    className="px-2.5 py-1 rounded bg-gray-900 border border-gray-700 text-xs text-gray-200 font-mono"
                  >
                    {groupEmail}: <strong className="text-blue-300">{count}</strong> member(s)
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Seat Shortfalls */}
          {shortfalls.length > 0 && (
            <div className="bg-red-900/20 border border-red-700/60 rounded-md p-3 space-y-1">
              <h5 className="text-xs font-semibold text-red-300 uppercase tracking-wider">Seat Shortfalls</h5>
              {shortfalls.map((s, i) => (
                <p key={i} className="text-xs text-red-200">
                  Subscription <span className="font-mono">{s.licenseConfig}</span> ({s.reason}): needed {s.needed},
                  available {s.available} — {s.skipped} user(s) left unlicensed
                  {s.sample?.length ? ` (e.g. ${s.sample.join(', ')})` : ''}.
                </p>
              ))}
            </div>
          )}

          {/* Affected Users Sample */}
          {affectedUsers.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {isCleanup
                  ? `Revoked User Principals (${affectedUsers.length}${
                      (summary?.plannedRevocations || 0) > affectedUsers.length
                        ? ` of ${summary?.plannedRevocations}`
                        : ''
                    })`
                  : `Newly Assigned User Principals (${affectedUsers.length}${
                      (summary?.plannedAssignments || 0) > affectedUsers.length
                        ? ` of ${summary?.plannedAssignments}`
                        : ''
                    })`}
              </h5>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto bg-gray-900/70 p-2.5 rounded border border-gray-700">
                {affectedUsers.map((email) => (
                  <span
                    key={email}
                    className="px-2 py-0.5 text-xs font-mono rounded bg-gray-800 text-gray-200 border border-gray-700"
                  >
                    {email}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Skipped Unmanaged Users Sample */}
          {skippedUsers.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Skipped Users on Unmanaged Tiers ({skippedUsers.length})
              </h5>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto bg-gray-900/70 p-2.5 rounded border border-gray-700">
                {skippedUsers.map((email) => (
                  <span
                    key={email}
                    className="px-2 py-0.5 text-xs font-mono rounded bg-gray-800 text-gray-400 border border-gray-700"
                  >
                    {email}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Raw Execution Logs */}
          {activeReport.rawLogs.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowRawLogs((prev) => !prev)}
                className="text-xs text-blue-400 hover:text-blue-300 font-medium"
              >
                {showRawLogs
                  ? `Hide Execution Logs (${activeReport.rawLogs.length} lines)`
                  : `Show Execution Logs (${activeReport.rawLogs.length} lines)`}
              </button>
              {showRawLogs && (
                <pre className="mt-2 p-3 bg-gray-950 border border-gray-700 rounded text-xs text-gray-300 font-mono overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap">
                  {activeReport.rawLogs.join('\n')}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

