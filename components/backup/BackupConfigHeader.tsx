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
import ProjectInput from '../ProjectInput';
import CloudConsoleButton from '../CloudConsoleButton';
import { AppEngine, ReasoningEngine, GcsBucket } from '../../types';

export interface BackupConfigHeaderProps {
  projectNumber: string;
  onProjectNumberChange: (val: string) => void;
  config: {
    appLocation: string;
    appId: string;
    reasoningEngineLocation: string;
    reasoningEngineId: string;
    collectionId: string;
    assistantId: string;
  };
  onConfigChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  apps: AppEngine[];
  isLoadingApps: boolean;
  reasoningEngines: ReasoningEngine[];
  isLoadingReasoningEngines: boolean;
  buckets: GcsBucket[];
  selectedBucket: string;
  onBucketChange: (bucket: string) => void;
  isLoadingBuckets: boolean;
}

export const BackupConfigHeader: React.FC<BackupConfigHeaderProps> = ({
  projectNumber,
  onProjectNumberChange,
  config,
  onConfigChange,
  apps,
  isLoadingApps,
  reasoningEngines,
  isLoadingReasoningEngines,
  buckets,
  selectedBucket,
  onBucketChange,
  isLoadingBuckets,
}) => {
  return (
    <div className="bg-gray-800 p-4 rounded-lg shadow-md">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-lg font-semibold text-white">Configuration for Backup & Restore</h2>
        <CloudConsoleButton
          url={`https://console.cloud.google.com/storage/browser/${selectedBucket}?project=${projectNumber}`}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">
            Target Project ID / Number
          </label>
          <ProjectInput value={projectNumber} onChange={onProjectNumberChange} />
        </div>
        <div>
          <label htmlFor="appLocation" className="block text-sm font-medium text-gray-400 mb-1">
            Target Location (Discovery)
          </label>
          <select
            name="appLocation"
            value={config.appLocation}
            onChange={onConfigChange}
            className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[42px]"
          >
            <option value="global">global</option>
            <option value="us">us</option>
            <option value="eu">eu</option>
          </select>
        </div>
        <div>
          <label htmlFor="appId" className="block text-sm font-medium text-gray-400 mb-1">
            Target Gemini Enterprise ID
          </label>
          <select
            name="appId"
            value={config.appId}
            onChange={onConfigChange}
            disabled={isLoadingApps || apps.length === 0}
            className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[42px] disabled:bg-gray-700/50"
          >
            <option value="">{isLoadingApps ? 'Loading...' : '-- Select App --'}</option>
            {apps.map((a) => {
              const id = a.name.split('/').pop() || '';
              return (
                <option key={a.name} value={id}>
                  {a.displayName || id}
                </option>
              );
            })}
          </select>
        </div>

        <div>
          <label
            htmlFor="reasoningEngineLocation"
            className="block text-sm font-medium text-gray-400 mb-1"
          >
            Agent Engine Location
          </label>
          <select
            name="reasoningEngineLocation"
            value={config.reasoningEngineLocation}
            onChange={onConfigChange}
            className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[42px]"
          >
            <option value="us-central1">us-central1</option>
            <option value="europe-west1">europe-west1</option>
            <option value="asia-east1">asia-east1</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="reasoningEngineId"
            className="block text-sm font-medium text-gray-400 mb-1"
          >
            Target Agent Engine
          </label>
          <select
            name="reasoningEngineId"
            value={config.reasoningEngineId}
            onChange={onConfigChange}
            disabled={isLoadingReasoningEngines || reasoningEngines.length === 0}
            className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[42px] disabled:bg-gray-700/50"
          >
            <option value="">
              {isLoadingReasoningEngines ? 'Loading...' : '-- Select Engine --'}
            </option>
            {reasoningEngines.map((re) => {
              const id = re.name.split('/').pop() || '';
              return (
                <option key={re.name} value={id}>
                  {re.displayName} ({id})
                </option>
              );
            })}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">
            Backup Bucket (GCS)
          </label>
          <div className="flex gap-2">
            <select
              value={selectedBucket}
              onChange={(e) => onBucketChange(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 h-[42px]"
              disabled={isLoadingBuckets || buckets.length === 0}
            >
              <option value="">
                {isLoadingBuckets ? 'Loading buckets...' : '-- Select Bucket --'}
              </option>
              {buckets.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BackupConfigHeader;
