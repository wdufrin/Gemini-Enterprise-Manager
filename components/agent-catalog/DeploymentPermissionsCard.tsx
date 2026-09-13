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

interface DeploymentPermissionsCardProps {
  target: 'cloud_run' | 'reasoning_engine';
  projectId: string;
  projectNumber: string;
  isPermissionsExpanded: boolean;
  setIsPermissionsExpanded: (val: boolean) => void;
  isRePermissionsExpanded: boolean;
  setIsRePermissionsExpanded: (val: boolean) => void;
  validationStatus: 'idle' | 'validating' | 'success' | 'error';
  missingCloudBuildRoles: string[];
  missingComputeRoles: string[];
  onValidatePermissions: () => Promise<void>;
}

export const DeploymentPermissionsCard: React.FC<DeploymentPermissionsCardProps> = ({
  target,
  projectId,
  projectNumber,
  isPermissionsExpanded,
  setIsPermissionsExpanded,
  isRePermissionsExpanded,
  setIsRePermissionsExpanded,
  validationStatus,
  missingCloudBuildRoles,
  missingComputeRoles,
  onValidatePermissions,
}) => {
  const cloudBuildSa = `${projectNumber}@cloudbuild.gserviceaccount.com`;
  const computeSa = `${projectNumber}-compute@developer.gserviceaccount.com`;

  const grantPermissionsCommand = `gcloud projects add-iam-policy-binding ${projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding ${projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding ${projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/storage.objectViewer"

# If your project uses Compute SA for Cloud Build:
gcloud projects add-iam-policy-binding ${projectId} \\
  --member="serviceAccount:${computeSa}" \\
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding ${projectId} \\
  --member="serviceAccount:${computeSa}" \\
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding ${projectId} \\
  --member="serviceAccount:${computeSa}" \\
  --role="roles/storage.objectViewer"`;

  const grantRePermissionsCommand = `gcloud projects add-iam-policy-binding ${projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/aiplatform.user"

gcloud projects add-iam-policy-binding ${projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/storage.objectViewer"

# If your project uses Compute SA for Cloud Build:
gcloud projects add-iam-policy-binding ${projectId} \\
  --member="serviceAccount:${computeSa}" \\
  --role="roles/aiplatform.user"

gcloud projects add-iam-policy-binding ${projectId} \\
  --member="serviceAccount:${computeSa}" \\
  --role="roles/storage.objectViewer"`;

  if (target === 'cloud_run') {
    return (
      <div className="bg-yellow-900/20 border border-yellow-700/50 p-3 rounded-md mb-4">
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
              Cloud Build needs <strong>Cloud Run Admin</strong>,{' '}
              <strong>Service Account User</strong>, and{' '}
              <strong>Storage Object Viewer</strong> roles to deploy this service.
              Run this once in your terminal:
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
            <div className="mt-3 flex items-center justify-between">
              <button
                onClick={onValidatePermissions}
                disabled={validationStatus === 'validating'}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md transition-colors disabled:bg-gray-600"
              >
                {validationStatus === 'validating'
                  ? 'Validating...'
                  : 'Validate Permissions'}
              </button>
              {validationStatus === 'success' && (
                <span className="text-xs text-green-400 flex items-center gap-1">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  All permissions granted!
                </span>
              )}
              {validationStatus === 'error' &&
                (missingCloudBuildRoles.length > 0 || missingComputeRoles.length > 0) && (
                  <span className="text-xs text-red-400 flex flex-col items-end">
                    {missingCloudBuildRoles.length > 0 && (
                      <>
                        <span>Missing on Cloud Build SA:</span>
                        {missingCloudBuildRoles.map((r) => (
                          <span key={r}>{r}</span>
                        ))}
                      </>
                    )}
                    {missingComputeRoles.length > 0 && (
                      <>
                        <span className="mt-1">Missing on Compute SA:</span>
                        {missingComputeRoles.map((r) => (
                          <span key={r}>{r}</span>
                        ))}
                      </>
                    )}
                  </span>
                )}
              {validationStatus === 'error' &&
                missingCloudBuildRoles.length === 0 &&
                missingComputeRoles.length === 0 && (
                  <span className="text-xs text-red-400">
                    Validation failed. Check console.
                  </span>
                )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-yellow-900/20 border border-yellow-700/50 p-3 rounded-md mb-4">
      <button
        onClick={() => setIsRePermissionsExpanded(!isRePermissionsExpanded)}
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
          Permissions Required
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-4 w-4 text-yellow-200 transition-transform ${
            isRePermissionsExpanded ? 'rotate-180' : ''
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
      {isRePermissionsExpanded && (
        <div className="mt-3">
          <p className="text-xs text-yellow-100 mb-2">
            Cloud Build needs <strong>Vertex AI User</strong> and{' '}
            <strong>Storage Object Viewer</strong> roles to create Agent Engines.
            Run this once:
          </p>
          <div className="bg-black/50 p-2 rounded border border-yellow-900/50 relative group">
            <pre className="text-[10px] text-yellow-50 whitespace-pre-wrap font-mono">
              {grantRePermissionsCommand}
            </pre>
            <button
              onClick={() => navigator.clipboard.writeText(grantRePermissionsCommand)}
              className="absolute top-2 right-2 px-2 py-1 bg-yellow-900/80 hover:bg-yellow-800 text-yellow-200 text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity"
            >
              Copy
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={onValidatePermissions}
              disabled={validationStatus === 'validating'}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md transition-colors disabled:bg-gray-600"
            >
              {validationStatus === 'validating'
                ? 'Validating...'
                : 'Validate Permissions'}
            </button>
            {validationStatus === 'success' && (
              <span className="text-xs text-green-400 flex items-center gap-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                All permissions granted!
              </span>
            )}
            {validationStatus === 'error' &&
              (missingCloudBuildRoles.length > 0 || missingComputeRoles.length > 0) && (
                <span className="text-xs text-red-400 flex flex-col items-end">
                  {missingCloudBuildRoles.length > 0 && (
                    <>
                      <span>Missing on Cloud Build SA:</span>
                      {missingCloudBuildRoles.map((r) => (
                        <span key={r}>{r}</span>
                      ))}
                    </>
                  )}
                  {missingComputeRoles.length > 0 && (
                    <>
                      <span className="mt-1">Missing on Compute SA:</span>
                      {missingComputeRoles.map((r) => (
                        <span key={r}>{r}</span>
                      ))}
                    </>
                  )}
                </span>
              )}
            {validationStatus === 'error' &&
              missingCloudBuildRoles.length === 0 &&
              missingComputeRoles.length === 0 && (
                <span className="text-xs text-red-400">
                  Validation failed. Check console.
                </span>
              )}
          </div>
        </div>
      )}
    </div>
  );
};
