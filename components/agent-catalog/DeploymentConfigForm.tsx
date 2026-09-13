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
import {
  CLOUD_RUN_ACCESS_OPTIONS,
  CloudRunAccessMode,
} from '../../services/adkTemplates/types';
import { GcsBucket } from '../../types';
import { EnvVar } from './types';

interface DeploymentConfigFormProps {
  target: 'cloud_run' | 'reasoning_engine';
  setTarget: (target: 'cloud_run' | 'reasoning_engine') => void;
  accessMode: CloudRunAccessMode;
  setAccessMode: (mode: CloudRunAccessMode) => void;
  region: string;
  setRegion: (region: string) => void;
  selectedBucket: string;
  setSelectedBucket: (bucket: string) => void;
  buckets: GcsBucket[];
  isLoadingBuckets: boolean;
  isDeploying: boolean;
  onRefreshBuckets: () => Promise<void>;
  entryModulePath: string;
  setEntryModulePath: (path: string) => void;
  entryPoint: string;
  setEntryPoint: (point: string) => void;
  envVars: EnvVar[];
  onVarChange: (index: number, val: string) => void;
}

export const DeploymentConfigForm: React.FC<DeploymentConfigFormProps> = ({
  target,
  setTarget,
  accessMode,
  setAccessMode,
  region,
  setRegion,
  selectedBucket,
  setSelectedBucket,
  buckets,
  isLoadingBuckets,
  isDeploying,
  onRefreshBuckets,
  entryModulePath,
  setEntryModulePath,
  entryPoint,
  setEntryPoint,
  envVars,
  onVarChange,
}) => {
  return (
    <>
      {/* 1. Deployment Target */}
      <div>
        <h3 className="text-lg font-medium text-white mb-3">
          1. Deployment Target
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <label
            className={`cursor-pointer p-4 rounded-lg border-2 transition-all ${
              target === 'cloud_run'
                ? 'border-blue-500 bg-blue-900/20'
                : 'border-gray-600 bg-gray-700/30 hover:border-gray-500'
            }`}
          >
            <input
              type="radio"
              name="target"
              value="cloud_run"
              checked={target === 'cloud_run'}
              onChange={() => setTarget('cloud_run')}
              className="hidden"
            />
            <div className="font-bold text-white mb-1">Cloud Run</div>
            <div className="text-xs text-gray-400">
              Deploy as a scalable HTTP service with native A2A protocol support.
            </div>
          </label>
          <label
            className={`cursor-pointer p-4 rounded-lg border-2 transition-all ${
              target === 'reasoning_engine'
                ? 'border-red-500 bg-red-900/20'
                : 'border-gray-600 bg-gray-700/30 hover:border-gray-500'
            }`}
          >
            <input
              type="radio"
              name="target"
              value="reasoning_engine"
              checked={target === 'reasoning_engine'}
              onChange={() => setTarget('reasoning_engine')}
              className="hidden"
            />
            <div className="font-bold text-white mb-1">Agent Engine</div>
            <div className="text-xs text-gray-400">
              Deploy to Vertex AI runtime.
            </div>
          </label>
        </div>
      </div>

      {/* Access control -- Cloud Run only */}
      {target === 'cloud_run' && (
        <div>
          <h3 className="text-lg font-medium text-white mb-1">
            Who can call this service?
          </h3>
          <p className="text-xs text-gray-400 mb-3">
            Sets the authentication flags on the generated{' '}
            <code className="font-mono">gcloud run deploy</code> command.
          </p>
          <div className="space-y-2">
            {CLOUD_RUN_ACCESS_OPTIONS.map((option) => {
              const selected = accessMode === option.value;
              const selectedClasses = option.dangerous
                ? 'border-red-500 bg-red-900/20'
                : 'border-blue-500 bg-blue-900/20';
              return (
                <label
                  key={option.value}
                  className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                    selected
                      ? selectedClasses
                      : 'border-gray-600 bg-gray-700/30 hover:border-gray-500'
                  }`}
                >
                  <input
                    type="radio"
                    name="cloudRunAccess"
                    value={option.value}
                    checked={selected}
                    onChange={() => setAccessMode(option.value)}
                    className="mt-1 h-4 w-4 bg-gray-700 border-gray-600"
                  />
                  <span>
                    <span
                      className={`block font-medium ${
                        option.dangerous && selected
                          ? 'text-red-300'
                          : 'text-white'
                      }`}
                    >
                      {option.label}
                    </span>
                    <span className="block text-xs text-gray-400 mt-0.5">
                      {option.summary}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          {accessMode === 'public' && (
            <div className="mt-2 bg-red-900/30 border border-red-800 rounded-md p-3 text-xs text-red-300">
              <span className="font-semibold">
                This publishes the agent to the internet.
              </span>{' '}
              Anyone who learns the URL can invoke it with no login.
            </div>
          )}

          {accessMode === 'iap' && (
            <div className="mt-2 bg-yellow-900/20 border border-yellow-800 rounded-md p-3 text-xs text-yellow-200 space-y-1">
              <p className="font-semibold">
                IAP needs manual setup that this build cannot do for you.
              </p>
              <p>
                Grant <code className="font-mono">roles/run.invoker</code> to{' '}
                <code className="font-mono break-all">
                  service-PROJECT_NUMBER@gcp-sa-iap.iam.gserviceaccount.com
                </code>
                , and create the OAuth client in the Cloud Console -- OAuth clients
                cannot be created programmatically, so this Cloud Build step will
                fail if IAP has never been enabled in the project.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Location */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Region
        </label>
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="w-full bg-gray-700 border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-blue-500"
        >
          <option value="us-central1">us-central1</option>
          <option value="europe-west1">europe-west1</option>
          <option value="asia-east1">asia-east1</option>
        </select>
      </div>

      {/* Staging Bucket */}
      {target === 'reasoning_engine' && (
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Agent Engine Staging Bucket
            </label>
            <div className="flex gap-2">
              <select
                value={selectedBucket}
                onChange={(e) => setSelectedBucket(e.target.value)}
                className="w-full bg-gray-700 border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-blue-500"
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
              <button
                onClick={onRefreshBuckets}
                disabled={isLoadingBuckets || isDeploying}
                className="px-3 bg-gray-700 hover:bg-gray-600 rounded text-white text-xs border border-gray-600"
                title="Refresh Buckets"
              >
                ↻
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              GCS bucket to store the agent source code for Cloud Build.
            </p>
          </div>
        </div>
      )}

      {/* Env Variables */}
      <div>
        <h3 className="text-lg font-medium text-white mb-3 flex items-center">
          2. Configuration Variables
          <span className="ml-2 text-xs font-normal text-gray-400 bg-gray-700 px-2 py-0.5 rounded-full">
            Parsed from .env & .env.example & {entryModulePath}.py
          </span>
        </h3>
        <div className="space-y-3">
          {envVars.map((v, i) => (
            <div key={i}>
              <label className="block text-xs font-medium text-gray-400 mb-1 flex justify-between">
                <span>{v.key}</span>
                <span className="flex items-center gap-2">
                  {v.source === '.env' && (
                    <span className="text-[10px] bg-green-900 text-green-200 px-1.5 rounded">
                      .env
                    </span>
                  )}
                  {v.source === '.env.example' && (
                    <span className="text-[10px] bg-yellow-900 text-yellow-200 px-1.5 rounded">
                      example
                    </span>
                  )}
                  {v.source === 'code' && (
                    <span className="text-[10px] bg-gray-700 text-gray-300 px-1.5 rounded">
                      code
                    </span>
                  )}
                </span>
              </label>
              <input
                type="text"
                value={v.value}
                onChange={(e) => onVarChange(i, e.target.value)}
                className="w-full bg-gray-700 border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-teal-500 font-mono placeholder-gray-500"
                placeholder={v.placeholder || v.description}
              />
            </div>
          ))}
          {envVars.length === 0 && (
            <p className="text-sm text-gray-500 italic">
              No environment variables detected in code.
            </p>
          )}
        </div>
      </div>

      {/* Entry Point Config */}
      <div className="bg-gray-700/30 p-3 rounded-md border border-gray-600">
        <h3 className="text-lg font-medium text-white mb-3">
          3. Entry Point Configuration
        </h3>
        <p className="text-xs text-gray-400 mb-3">
          Modify these values if the auto-detection failed or if you are
          getting &quot;ImportError&quot; during deployment.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Entry Module Path
            </label>
            <input
              type="text"
              value={entryModulePath}
              onChange={(e) => setEntryModulePath(e.target.value)}
              className="w-full bg-gray-700 border-gray-500 rounded-md px-2 py-1.5 text-xs text-white font-mono"
              placeholder="e.g. academic_research.agent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Entry Object Name
            </label>
            <input
              type="text"
              value={entryPoint}
              onChange={(e) => setEntryPoint(e.target.value)}
              className="w-full bg-gray-700 border-gray-500 rounded-md px-2 py-1.5 text-xs text-white font-mono"
              placeholder="e.g. agent"
            />
          </div>
        </div>
      </div>
    </>
  );
};
