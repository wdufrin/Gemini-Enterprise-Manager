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
import { Config } from '../../types';
import { useExportMetrics } from '../../hooks/useExportMetrics';
import { useModalA11y } from '../../hooks/useModalA11y';

export interface ExportMetricsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: Config;
  onBuildTriggered?: (buildId: string, projectId?: string) => void;
  projectNumber: string;
}

export const ExportMetricsModal: React.FC<ExportMetricsModalProps> = ({
  isOpen,
  onClose,
  config,
  onBuildTriggered,
  projectNumber,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    datasetId,
    setDatasetId,
    tableId,
    setTableId,
    isExporting,
    status,
    error,
    datasets,
    tables,
    isLoadingDatasets,
    isLoadingTables,
    isCreationMode,
    setIsCreationMode,
    newDatasetId,
    setNewDatasetId,
    newTableId,
    setNewTableId,
    isCreating,
    isAutoBackupMode,
    setIsAutoBackupMode,
    baseTableId,
    setBaseTableId,
    backupDay,
    setBackupDay,
    deployMethod,
    setDeployMethod,
    isPermissionsExpanded,
    setIsPermissionsExpanded,
    buckets,
    selectedBucket,
    setSelectedBucket,
    isLoadingBuckets,
    isDeploying,
    deployError,
    bqLocation,
    pythonScript,
    requirementsTxt,
    cloudbuildYaml,
    deployCommand,
    grantPermissionsCommand,
    handleCreateResources,
    handleExport,
    handleCloudBuildDeploy,
    fetchDatasets,
    fetchTables,
  } = useExportMetrics(isOpen, config, projectNumber, onBuildTriggered);

  useModalA11y({
    isOpen,
    onClose,
    containerRef,
    preventClose: isExporting || isCreating || isDeploying,
  });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-metrics-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !(isExporting || isCreating || isDeploying)) onClose();
      }}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className={`bg-gray-800 rounded-lg shadow-xl w-full ${
          isAutoBackupMode ? 'max-w-4xl' : 'max-w-md'
        } p-6 border border-gray-700 font-sans max-h-[90vh] overflow-y-auto outline-none`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="export-metrics-title" className="text-xl font-bold text-white mb-2">
          {isAutoBackupMode ? 'Setup Auto-Backup (Cloud Function)' : 'Backup Analytics to BigQuery'}
        </h2>
        <p className="text-sm text-gray-400 mb-4">
          {isAutoBackupMode ? (
            'Generate a Cloud Function to automatically backup metrics to BigQuery every month with a timestamped table.'
          ) : (
            <>
              Export analytics metrics to BigQuery. Target location:{' '}
              <strong className="text-white">{bqLocation}</strong>.
            </>
          )}
        </p>

        {isAutoBackupMode ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300">
                  Target BigQuery Dataset
                </label>
                <select
                  value={datasetId}
                  onChange={(e) => setDatasetId(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 mt-1 text-white text-sm"
                  disabled={isLoadingDatasets}
                >
                  <option value="">
                    {isLoadingDatasets ? 'Loading...' : '-- Select Dataset --'}
                  </option>
                  {datasets.map((d) => (
                    <option
                      key={d.datasetReference.datasetId}
                      value={d.datasetReference.datasetId}
                    >
                      {d.datasetReference.datasetId}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300">Base Table Name</label>
                <input
                  type="text"
                  value={baseTableId}
                  onChange={(e) => setBaseTableId(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 mt-1 text-white text-sm"
                  placeholder="metrics_backup"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Will become e.g.{' '}
                  <span className="text-yellow-400">{baseTableId}_YYYY_MM</span>
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300">Day of Month to Run</label>
                <select
                  value={backupDay}
                  onChange={(e) => setBackupDay(Number(e.target.value))}
                  className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 mt-1 text-white text-sm"
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                    <option key={day} value={day}>
                      {day}
                      {day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">Runs at midnight on the selected day.</p>
              </div>
            </div>

            <div className="flex items-center space-x-4 mb-4">
              <span className="text-sm font-medium text-gray-300">Deployment Method:</span>
              <div className="flex bg-gray-800 rounded-lg p-1 border border-gray-700">
                <button
                  onClick={() => setDeployMethod('gcloud')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    deployMethod === 'gcloud'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  gcloud CLI
                </button>
                <button
                  onClick={() => setDeployMethod('cloud-build')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    deployMethod === 'cloud-build'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  Cloud Build
                </button>
              </div>
            </div>

            {deployMethod === 'cloud-build' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300">Staging Bucket</label>
                <select
                  value={selectedBucket}
                  onChange={(e) => setSelectedBucket(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 mt-1 mb-4 text-white text-sm"
                  disabled={isLoadingBuckets || isDeploying}
                >
                  <option value="">
                    {isLoadingBuckets ? 'Loading...' : '-- Select Bucket --'}
                  </option>
                  {buckets.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>

                <div className="bg-yellow-900/20 border border-yellow-700/50 p-3 rounded-md mb-2">
                  <button
                    onClick={() => setIsPermissionsExpanded(!isPermissionsExpanded)}
                    className="flex items-center justify-between w-full text-left"
                  >
                    <span className="text-sm font-semibold text-yellow-200 flex items-center gap-2">
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
                      Cloud Build Permissions Required
                    </span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 text-yellow-200 transition-transform ${
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
                      <p className="text-xs text-yellow-100 mb-2">
                        Cloud Build needs <strong>Cloud Functions Developer</strong>,{' '}
                        <strong>Cloud Scheduler Admin</strong>, and{' '}
                        <strong>Service Account User</strong> roles to deploy this metrics export
                        job. Run this once in your terminal:
                      </p>
                      <div className="bg-black/50 p-2 rounded border border-yellow-900/50 relative group">
                        <pre className="text-[10px] text-yellow-50 whitespace-pre-wrap font-mono">
                          {grantPermissionsCommand}
                        </pre>
                        <button
                          onClick={() => navigator.clipboard.writeText(grantPermissionsCommand)}
                          className="absolute top-2 right-2 px-2 py-1 bg-yellow-900/80 hover:bg-yellow-800 text-yellow-200 text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 font-mono text-xs text-gray-300 overflow-x-auto">
              <h4 className="text-gray-100 font-bold mb-2 pb-1 border-b border-gray-700 tracking-wider">
                main.py
              </h4>
              <pre>
                <code>{pythonScript}</code>
              </pre>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 font-mono text-xs text-gray-300 overflow-x-auto">
                <h4 className="text-gray-100 font-bold mb-2 pb-1 border-b border-gray-700 tracking-wider">
                  requirements.txt
                </h4>
                <pre>
                  <code>{requirementsTxt}</code>
                </pre>
              </div>
              {deployMethod === 'cloud-build' && (
                <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 font-mono text-xs text-gray-300 overflow-x-auto">
                  <h4 className="text-gray-100 font-bold mb-2 pb-1 border-b border-gray-700 tracking-wider">
                    cloudbuild.yaml
                  </h4>
                  <pre>
                    <code>{cloudbuildYaml}</code>
                  </pre>
                </div>
              )}
              {deployMethod === 'gcloud' && (
                <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 font-mono text-xs text-blue-300 overflow-x-auto">
                  <h4 className="text-blue-100 font-bold mb-2 pb-1 border-b border-gray-700 tracking-wider">
                    Deployment Command
                  </h4>
                  <pre>
                    <code>{deployCommand}</code>
                  </pre>
                </div>
              )}
            </div>

            {deployMethod === 'cloud-build' && (
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 font-mono text-xs text-blue-300 overflow-x-auto mt-4">
                <h4 className="text-blue-100 font-bold mb-2 pb-1 border-b border-gray-700 tracking-wider">
                  Deployment Command
                </h4>
                <pre>
                  <code>{deployCommand}</code>
                </pre>
              </div>
            )}
            <p className="text-sm text-yellow-400 mt-2">
              <strong>Instructions:</strong> Save the files locally, then run the Deployment Command
              in the same directory using Google Cloud Shell or Terminal.
            </p>
          </div>
        ) : isCreationMode ? (
          <div className="space-y-4 bg-gray-900/50 p-4 rounded-lg border border-gray-700 mb-4 shadow-inner">
            <h3 className="text-sm font-semibold text-white border-b border-gray-700 pb-2">
              Create New Resources
            </h3>
            <p className="text-xs text-gray-400">
              Fill in one or both to create them in your project.
            </p>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                New Dataset ID
              </label>
              <input
                type="text"
                value={newDatasetId}
                onChange={(e) => setNewDatasetId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-md p-2.5 text-white text-sm transition-colors"
                placeholder={
                  datasetId ? `Leave blank to use '${datasetId}'` : 'my_new_dataset'
                }
                disabled={isCreating}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">New Table ID</label>
              <input
                type="text"
                value={newTableId}
                onChange={(e) => setNewTableId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-md p-2.5 text-white text-sm transition-colors"
                placeholder="metrics_backup_v1"
                disabled={isCreating}
              />
            </div>
            <div className="flex justify-between items-center pt-3 border-t border-gray-800 mt-2">
              <button
                onClick={() => setIsCreationMode(false)}
                className="text-xs text-gray-400 hover:text-white transition-colors"
                disabled={isCreating}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateResources}
                disabled={isCreating || (!newDatasetId && !newTableId)}
                className="px-4 py-2 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isCreating ? 'Creating...' : 'Create & Select'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-300">BigQuery Dataset</label>
              <div className="flex gap-2 mt-1">
                <select
                  value={datasetId}
                  onChange={(e) => setDatasetId(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white text-sm"
                  disabled={isLoadingDatasets || isExporting}
                >
                  <option value="">
                    {isLoadingDatasets ? 'Loading...' : '-- Select Dataset --'}
                  </option>
                  {datasets.map((d) => (
                    <option
                      key={d.datasetReference.datasetId}
                      value={d.datasetReference.datasetId}
                    >
                      {d.datasetReference.datasetId}
                    </option>
                  ))}
                </select>
                <button
                  onClick={fetchDatasets}
                  className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 border border-gray-600 flex-shrink-0"
                  title="Refresh Datasets"
                >
                  ↻
                </button>
                <button
                  onClick={() => {
                    setIsCreationMode(true);
                    setNewDatasetId('');
                    setNewTableId('');
                  }}
                  className="px-3 py-2 bg-gray-700 hover:bg-teal-700 hover:text-white rounded text-teal-400 border border-gray-600 font-bold flex-shrink-0"
                  title="Create New Dataset"
                >
                  +
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300">BigQuery Table</label>
              <div className="flex gap-2 mt-1">
                <select
                  value={tableId}
                  onChange={(e) => setTableId(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white text-sm"
                  disabled={!datasetId || isLoadingTables || isExporting}
                >
                  <option value="">
                    {isLoadingTables ? 'Loading...' : '-- Select Table --'}
                  </option>
                  {tables.map((t) => (
                    <option
                      key={t.tableReference.tableId}
                      value={t.tableReference.tableId}
                    >
                      {t.tableReference.tableId}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => fetchTables(datasetId)}
                  disabled={!datasetId}
                  className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 border border-gray-600 disabled:opacity-50 flex-shrink-0"
                  title="Refresh Tables"
                >
                  ↻
                </button>
                <button
                  onClick={() => {
                    setIsCreationMode(true);
                    setNewDatasetId('');
                    setNewTableId('');
                  }}
                  disabled={!datasetId}
                  className="px-3 py-2 bg-gray-700 hover:bg-teal-700 hover:text-white rounded text-teal-400 border border-gray-600 disabled:opacity-50 font-bold flex-shrink-0"
                  title="Create New Table"
                >
                  +
                </button>
              </div>
            </div>
            <p className="text-xs text-yellow-400/80 mt-1">
              Note: Discovery Engine API currently limits exports to the last 30 days.
            </p>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-900/30 text-red-300 text-xs rounded-md border border-red-800 mb-3 whitespace-pre-wrap">
            {error}
          </div>
        )}
        {deployError && (
          <div className="p-3 bg-red-900/30 text-red-300 text-xs rounded-md border border-red-800 mb-3 whitespace-pre-wrap">
            {deployError}
          </div>
        )}
        {status && (
          <div className="p-3 bg-blue-900/30 text-blue-300 text-xs rounded-md border border-blue-800 mb-3">
            {status}
          </div>
        )}

        <div className="flex justify-between items-start pt-4 border-t border-gray-700">
          <div>
            <button
              onClick={onClose}
              disabled={isExporting || isCreating || isDeploying}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
            >
              Close
            </button>
          </div>

          <div className="flex flex-col items-end gap-3 min-w-[200px]">
            {isAutoBackupMode ? (
              <div className="flex flex-col gap-2 w-full">
                {deployMethod === 'cloud-build' && (
                  <button
                    onClick={handleCloudBuildDeploy}
                    disabled={isDeploying || !selectedBucket}
                    className="px-4 py-2 bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-500 hover:to-teal-400 text-white font-bold rounded-md shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isDeploying && (
                      <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                    )}
                    {isDeploying ? 'Deploying...' : 'Deploy with Cloud Build'}
                  </button>
                )}
                <button
                  onClick={() => setIsAutoBackupMode(false)}
                  className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 w-full text-center disabled:opacity-50"
                  disabled={isDeploying}
                >
                  Back to Manual Export
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 w-full">
                <button
                  onClick={handleExport}
                  disabled={isExporting || isCreating || isCreationMode}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center w-full"
                >
                  {isExporting && (
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                  )}
                  {isExporting ? 'Exporting...' : 'Export Analytics'}
                </button>
                <button
                  onClick={() => setIsAutoBackupMode(true)}
                  className="px-4 py-2 bg-teal-900/30 hover:bg-teal-800/50 rounded-md text-teal-300 border border-teal-800 transition-colors flex items-center justify-center text-sm w-full"
                >
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Setup Auto-Backup
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportMetricsModal;
