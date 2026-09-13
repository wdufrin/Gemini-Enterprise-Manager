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

import React, { useRef } from 'react';
import { usePrunerDeployment } from '../../hooks/usePrunerDeployment';
import { useModalA11y } from '../../hooks/useModalA11y';

export interface PrunerDeploymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectNumber: string;
  currentConfig: { appLocation: string; userStoreId: string };
  onBuildTriggered?: (buildId: string) => void;
}

export const PrunerDeploymentModal: React.FC<PrunerDeploymentModalProps> = ({
  isOpen,
  onClose,
  projectNumber,
  currentConfig,
  onBuildTriggered,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    config,
    setConfig,
    showAdvanced,
    setShowAdvanced,
    customSaEmail,
    setCustomSaEmail,
    isCheckingPermissions,
    permissionCheckResult,
    activeTab,
    setActiveTab,
    copySuccess,
    isResolvingId,
    buckets,
    selectedBucket,
    setSelectedBucket,
    isLoadingBuckets,
    isDeploying,
    deployError,
    isPermissionsExpanded,
    setIsPermissionsExpanded,
    hasGrantedPermissions,
    setHasGrantedPermissions,
    mainPy,
    deploySh,
    requirementsTxt,
    grantPermissionsCommand,
    handleCopy,
    handleCheckPermissions,
    handleDownload,
    handleCloudBuildDeploy,
  } = usePrunerDeployment(isOpen, onClose, projectNumber, currentConfig, onBuildTriggered);

  useModalA11y({
    isOpen,
    onClose,
    containerRef,
    preventClose: isDeploying,
  });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pruner-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeploying) onClose();
      }}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h2 id="pruner-modal-title" className="text-xl font-bold text-white">Setup Automated Pruner</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
            disabled={isDeploying}
            aria-label="Close dialog"
          >
            &times;
          </button>
        </header>

        <main className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-y-auto">
          {/* Left Config */}
          <div className="space-y-4">
            <div className="bg-blue-900/30 border border-blue-700 p-3 rounded-md text-sm text-blue-200">
              This tool generates a deployment package to run the pruning logic on Google Cloud
              Run, scheduled via Cloud Scheduler.
              <br />
              <br />
              <strong>Note:</strong> The deployment is specific to the selected location (
              <strong>{config.appLocation}</strong>). To prune multiple regions, run this setup for
              each location.
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400">
                Project ID (String) {isResolvingId && <span className="animate-pulse">...</span>}
              </label>
              <input
                type="text"
                value={config.projectId}
                onChange={(e) => setConfig({ ...config, projectId: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white"
                placeholder="my-project-id"
                disabled={isDeploying}
              />
              {/^\d+$/.test(config.projectId) && (
                <p className="text-xs text-yellow-400 mt-1">
                  Warning: Enter the string Project ID (e.g., &apos;my-app&apos;), not the number,
                  for gcloud scripts.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-400">Run Region</label>
                <select
                  value={config.runRegion}
                  onChange={(e) => setConfig({ ...config, runRegion: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white"
                  disabled={isDeploying}
                >
                  <option>us-central1</option>
                  <option>us-east1</option>
                  <option>europe-west1</option>
                  <option>asia-east1</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400">
                  Prune After (Days)
                </label>
                <input
                  type="number"
                  value={config.pruneDays}
                  onChange={(e) => {
                    const val = e.target.value;
                    setConfig({
                      ...config,
                      pruneDays: val === '' ? '' : Math.max(1, parseInt(val, 10) || 1),
                    });
                  }}
                  className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white"
                  disabled={isDeploying}
                  min="1"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400">User Store ID</label>
              <input
                type="text"
                value={config.userStoreId}
                onChange={(e) => setConfig({ ...config, userStoreId: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white"
                disabled={isDeploying}
              />
            </div>

            {/* Advanced Settings */}
            <div>
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-sm font-semibold text-gray-400 hover:text-white flex items-center mb-2"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className={`h-4 w-4 mr-1 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 01-1.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                Advanced Settings
              </button>
              {showAdvanced && (
                <div className="bg-gray-700/30 p-3 rounded-md border border-gray-600 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">
                      Use Existing Service Account Email
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customSaEmail}
                        onChange={(e) => setCustomSaEmail(e.target.value)}
                        placeholder="my-sa@project.iam.gserviceaccount.com"
                        className="w-full bg-gray-700 border border-gray-500 rounded-md p-1.5 text-xs text-white"
                        disabled={isDeploying}
                      />
                      <button
                        onClick={handleCheckPermissions}
                        disabled={isCheckingPermissions || !customSaEmail || isDeploying}
                        className="px-2 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 disabled:opacity-50 shrink-0"
                      >
                        {isCheckingPermissions ? 'Checking...' : 'Check Permissions'}
                      </button>
                    </div>
                    {permissionCheckResult.status && (
                      <p
                        className={`text-xs mt-1 ${
                          permissionCheckResult.status === 'success'
                            ? 'text-green-400'
                            : 'text-yellow-400'
                        }`}
                      >
                        {permissionCheckResult.message}
                      </p>
                    )}
                    <p className="text-[10px] text-gray-500 mt-1">
                      If specified, the script will use this SA instead of creating a new one.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-gray-700">
              <h3 className="text-sm font-semibold text-white mb-2">
                Cloud Build Staging Bucket
              </h3>
              <div className="flex gap-2">
                <select
                  value={selectedBucket}
                  onChange={(e) => setSelectedBucket(e.target.value)}
                  className="w-full bg-gray-700 border-gray-600 rounded-md p-2 text-sm text-white"
                  disabled={isLoadingBuckets || isDeploying}
                >
                  {buckets.length === 0 && (
                    <option value="">
                      {isLoadingBuckets ? 'Loading...' : 'No buckets found'}
                    </option>
                  )}
                  {buckets.map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Permissions Warning */}
            <div className="bg-orange-900/30 border border-orange-700 p-4 rounded-md">
              <button
                onClick={() => setIsPermissionsExpanded(!isPermissionsExpanded)}
                className="flex items-center justify-between w-full text-left"
              >
                <span className="text-sm font-bold text-orange-200 flex items-center gap-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  REQUIRED: Grant Cloud Build Permissions
                </span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className={`h-4 w-4 text-orange-200 transition-transform ${
                    isPermissionsExpanded ? 'rotate-180' : ''
                  }`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              {isPermissionsExpanded && (
                <div className="mt-3">
                  <p className="text-xs text-orange-100 mb-2">
                    The Cloud Build service account does not have permission to create Scheduler
                    jobs or Cloud Run services by default.
                  </p>
                  <p className="text-xs text-orange-100 mb-2 font-semibold">
                    🛡️ Recommended: Click &quot;Download .zip&quot; below and execute{' '}
                    <code>./deploy.sh</code> in your local terminal. This uses your personal
                    credentials and avoids granting broad Project IAM Admin rights to Cloud Build.
                  </p>
                  <p className="text-xs text-orange-100 mb-2">
                    Alternatively, if you wish to deploy directly from the UI via Cloud Build, you
                    must run these commands in Cloud Shell to grant Cloud Build the necessary
                    permissions:
                  </p>
                  <div className="bg-black/50 p-2 rounded border border-orange-800 relative group">
                    <pre className="text-[10px] text-orange-50 whitespace-pre-wrap font-mono">
                      {grantPermissionsCommand}
                    </pre>
                    <button
                      onClick={() => handleCopy(grantPermissionsCommand)}
                      className="absolute top-2 right-2 px-2 py-1 bg-orange-900/80 hover:bg-orange-800 text-orange-200 text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Copy
                    </button>
                  </div>
                  <div className="mt-3 flex items-start gap-2">
                    <input
                      type="checkbox"
                      id="confirm-perms"
                      checked={hasGrantedPermissions}
                      onChange={(e) => setHasGrantedPermissions(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500 shrink-0"
                    />
                    <label
                      htmlFor="confirm-perms"
                      className="text-xs text-gray-300 cursor-pointer select-none"
                    >
                      I have run the above commands to grant the necessary permissions.
                    </label>
                  </div>
                </div>
              )}
            </div>

            {deployError && <p className="text-red-400 text-sm">{deployError}</p>}

            <div className="flex gap-4 pt-2">
              <button
                onClick={handleCloudBuildDeploy}
                disabled={isDeploying || !selectedBucket || !hasGrantedPermissions}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-500 hover:to-teal-400 text-white font-bold rounded-lg shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeploying ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                    Deploying...
                  </>
                ) : (
                  'Deploy with Cloud Build'
                )}
              </button>
              <button
                onClick={handleDownload}
                disabled={isDeploying}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg border border-gray-600 disabled:opacity-50"
              >
                Download .zip
              </button>
            </div>
          </div>

          {/* Right Code */}
          <div className="flex flex-col h-[500px] bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
            <div className="flex bg-gray-800 border-b border-gray-700">
              <button
                onClick={() => setActiveTab('deploy')}
                className={`px-4 py-2 text-xs font-medium ${
                  activeTab === 'deploy' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                deploy.sh
              </button>
              <button
                onClick={() => setActiveTab('main')}
                className={`px-4 py-2 text-xs font-medium ${
                  activeTab === 'main' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                main.py
              </button>
              <button
                onClick={() => setActiveTab('requirements')}
                className={`px-4 py-2 text-xs font-medium ${
                  activeTab === 'requirements'
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                requirements.txt
              </button>
              <div className="flex-1"></div>
              <button
                onClick={() =>
                  handleCopy(
                    activeTab === 'deploy'
                      ? deploySh
                      : activeTab === 'main'
                      ? mainPy
                      : requirementsTxt,
                  )
                }
                className="px-3 text-xs text-blue-400 hover:text-white"
              >
                {copySuccess || 'Copy'}
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">
                {activeTab === 'deploy'
                  ? deploySh
                  : activeTab === 'main'
                  ? mainPy
                  : requirementsTxt}
              </pre>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default PrunerDeploymentModal;
