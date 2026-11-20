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

import React, { useEffect, useRef } from 'react';
import { AppEngine, ReasoningEngine, GcsBucket } from '../../types';
import { GEMINI_ENTERPRISE_LOCATIONS } from '../../utils/locations';
import { useWorkspaceScope } from '../../context/WorkspaceScopeContext';

export const AGENT_ENGINE_REGIONS = [
  'us-central1',
  'us-east1',
  'us-east4',
  'us-west1',
  'europe-west1',
  'europe-west2',
  'europe-west4',
  'asia-northeast1',
  'asia-east1',
] as const;

export interface BackupConfigHeaderProps {
  projectNumber?: string;
  onProjectNumberChange?: (val: string) => void;
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

const SELECT_CLASS =
  'w-full h-9 bg-gray-950/90 border border-gray-700/90 rounded-lg px-3 text-xs sm:text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50';

const LABEL_CLASS =
  'block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1';

export const BackupConfigHeader: React.FC<BackupConfigHeaderProps> = ({
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
  const workspaceScope = useWorkspaceScope();
  const lastSyncedScopeRef = useRef<{ appLocation: string; gcpRegion: string }>({
    appLocation: '',
    gcpRegion: '',
  });

  useEffect(() => {
    if (
      workspaceScope.appLocation &&
      workspaceScope.appLocation !== lastSyncedScopeRef.current.appLocation
    ) {
      lastSyncedScopeRef.current.appLocation = workspaceScope.appLocation;
      if (workspaceScope.appLocation !== config.appLocation) {
        onConfigChange({
          target: { name: 'appLocation', value: workspaceScope.appLocation },
        } as React.ChangeEvent<HTMLSelectElement>);
      }
    }
  }, [workspaceScope.appLocation, config.appLocation, onConfigChange]);

  useEffect(() => {
    if (
      workspaceScope.gcpRegion &&
      workspaceScope.gcpRegion !== lastSyncedScopeRef.current.gcpRegion &&
      (AGENT_ENGINE_REGIONS as readonly string[]).includes(workspaceScope.gcpRegion)
    ) {
      lastSyncedScopeRef.current.gcpRegion = workspaceScope.gcpRegion;
      if (workspaceScope.gcpRegion !== config.reasoningEngineLocation) {
        onConfigChange({
          target: { name: 'reasoningEngineLocation', value: workspaceScope.gcpRegion },
        } as React.ChangeEvent<HTMLSelectElement>);
      }
    }
  }, [workspaceScope.gcpRegion, config.reasoningEngineLocation, onConfigChange]);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'appLocation') {
      lastSyncedScopeRef.current.appLocation = value;
      workspaceScope.setAppLocation(value);
    } else if (name === 'reasoningEngineLocation') {
      lastSyncedScopeRef.current.gcpRegion = value;
      workspaceScope.setGcpRegion(value);
    } else if (name === 'appId') {
      workspaceScope.setAppId(value);
    }
    onConfigChange(e);
  };

  return (
    <section
      aria-label="Backup Scope & Target Configuration"
      className="bg-gray-900/75 border border-gray-800/90 rounded-xl p-4 sm:p-5 shadow-md"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5">
        <div>
          <label htmlFor="appLocation" className={LABEL_CLASS}>
            Target Location (Discovery)
          </label>
          <select
            id="appLocation"
            name="appLocation"
            value={config.appLocation}
            onChange={handleSelectChange}
            className={SELECT_CLASS}
          >
            {GEMINI_ENTERPRISE_LOCATIONS.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="appId" className={LABEL_CLASS}>
            Target Gemini Enterprise App
          </label>
          <select
            id="appId"
            name="appId"
            value={config.appId}
            onChange={handleSelectChange}
            disabled={isLoadingApps || apps.length === 0}
            className={SELECT_CLASS}
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
          <label htmlFor="reasoningEngineLocation" className={LABEL_CLASS}>
            Agent Engine Location
          </label>
          <select
            id="reasoningEngineLocation"
            name="reasoningEngineLocation"
            value={config.reasoningEngineLocation}
            onChange={handleSelectChange}
            className={SELECT_CLASS}
          >
            {AGENT_ENGINE_REGIONS.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="reasoningEngineId" className={LABEL_CLASS}>
            Target Agent Engine
          </label>
          <select
            id="reasoningEngineId"
            name="reasoningEngineId"
            value={config.reasoningEngineId}
            onChange={handleSelectChange}
            disabled={isLoadingReasoningEngines || reasoningEngines.length === 0}
            className={SELECT_CLASS}
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
          <label htmlFor="backupBucket" className={LABEL_CLASS}>
            Backup Bucket (GCS)
          </label>
          <select
            id="backupBucket"
            value={selectedBucket}
            onChange={(e) => onBucketChange(e.target.value)}
            className={SELECT_CLASS}
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
    </section>
  );
};

export default BackupConfigHeader;
