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
  AdkAgentConfig,
  TEMPLATES,
} from '../../services/adkTemplates';
import {
  isValidAdkAgentName,
  ADK_AGENT_NAME_HINT,
} from '../../services/adkTemplates/agentName';
import { GcsBucket } from '../../types';
import * as api from '../../services/apiService';

export interface AdkBasicSettingsProps {
  adkConfig: AdkAgentConfig;
  setAdkConfig: React.Dispatch<React.SetStateAction<AdkAgentConfig>>;
  handleAdkConfigChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => void;
  vertexLocation: string;
  setVertexLocation: (loc: string) => void;
  stagingBucket: string;
  setStagingBucket: (bucket: string) => void;
  buckets: GcsBucket[];
  setBuckets: (buckets: GcsBucket[]) => void;
  isLoadingBuckets: boolean;
  setIsLoadingBuckets: (loading: boolean) => void;
  projectNumber: string;
  handleRewrite: (field: string) => void;
  rewritingField: string | null;
}

export const AdkBasicSettings: React.FC<AdkBasicSettingsProps> = ({
  adkConfig,
  setAdkConfig,
  handleAdkConfigChange,
  vertexLocation,
  setVertexLocation,
  stagingBucket,
  setStagingBucket,
  buckets,
  setBuckets,
  isLoadingBuckets,
  setIsLoadingBuckets,
  projectNumber,
  handleRewrite,
  rewritingField,
}) => {
  return (
    <>
      {/* Templates Selection */}
      <div className="mb-4 p-3 bg-gray-750 rounded-lg border border-gray-600">
        <label className="block text-sm font-medium text-blue-400 mb-2">
          🚀 Quick Start Templates
        </label>
        <select
          onChange={(e) => {
            const template = TEMPLATES.find((t) => t.id === e.target.value);
            if (template) {
              setAdkConfig((_prev) => {
                const cleanConfig: AdkAgentConfig = {
                  name: '',
                  description: 'An agent that can do awesome things.',
                  model: 'gemini-2.5-flash',
                  instruction: 'You are an awesome and helpful agent.',
                  tools: [],
                  useGoogleSearch: false,
                  enableOAuth: false,
                  authId: 'temp_oauth',
                  allowAdcFallback: true,
                  enableDiscoveryApi: false,
                  discoveryConfig: {
                    projectId: '',
                    location: 'global',
                    collection: 'default_collection',
                    engineId: '',
                    dataStoreIds: '',
                  },
                  enableBqAnalytics: false,
                  bqDatasetId: '',
                  bqTableId: '',
                  enableThinking: false,
                  thinkingBudget: 1024,
                  thinkingLevel: 'HIGH',
                  enableStreaming: false,
                  enableBigQueryMcp: false,
                  enableCodeExecution: false,
                  enableGraphvizRendering: false,
                  enableEmailTool: false,
                  enableSecurityCommandCenterApi: false,
                  enableRecommenderApi: false,
                  enableServiceHealthApi: false,
                  enableNetworkManagementApi: false,
                  enableCloudAssistApi: false,
                  enableTelemetry: true,
                  enableMessageLogging: false,
                  enableCloudLoggingApi: false,
                  enableCloudMonitoringApi: false,
                  enableCloudRunApi: false,
                  enableResourceManagerApi: false,
                  enableAdminActivityApi: false,
                  enableDatabaseFleetApi: false,
                  enableCloudLoggingMcp: false,
                  enableBigtableAdminMcp: false,
                  enableCloudSqlMcp: false,
                  enableCloudMonitoringMcp: false,
                  enableComputeEngineMcp: false,
                  enableFirestoreMcp: false,
                  enableGkeMcp: false,
                  enableResourceManagerMcp: false,
                  enableSpannerMcp: false,
                  enableDeveloperKnowledgeMcp: false,
                  enableMapsGroundingMcp: false,
                  enableEvaluation: false,
                  enableCiCd: false,
                  ciCdRunner: 'none',
                  deploymentTarget: 'agent_engine',
                  cloudRunAccess: 'authenticated',
                  githubWifProvider: '',
                  githubServiceAccount: '',
                  customMcpEndpoints: [],
                };

                return {
                  ...cleanConfig,
                  ...template.config,
                  discoveryConfig: {
                    ...cleanConfig.discoveryConfig,
                    ...(template.config.discoveryConfig || {}),
                  },
                };
              });
            }
          }}
          className="bg-gray-800 border border-gray-500 rounded-md px-3 py-2 text-sm text-white w-full hover:border-blue-500 focus:border-blue-500 transition-colors"
          defaultValue=""
        >
          <option value="" disabled>
            Select a template to auto-fill...
          </option>
          {TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} - {t.description}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-400 mb-1">Agent Name</label>
        <input
          name="name"
          type="text"
          required
          pattern="^[A-Za-z_][A-Za-z0-9_]*$"
          value={adkConfig.name}
          onChange={handleAdkConfigChange}
          className={`bg-gray-700 border rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px] focus:outline-none ${
            !isValidAdkAgentName(adkConfig.name)
              ? 'border-red-500 focus:ring-1 focus:ring-red-500'
              : 'border-gray-600 focus:ring-1 focus:ring-blue-500'
          }`}
        />
        {!isValidAdkAgentName(adkConfig.name) && (
          <p className="text-red-400 text-xs mt-1">{ADK_AGENT_NAME_HINT}</p>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-1">Description</label>
        <input
          name="description"
          type="text"
          value={adkConfig.description}
          onChange={handleAdkConfigChange}
          className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-1">Agent Location</label>
        <select
          value={vertexLocation}
          onChange={(e) => setVertexLocation(e.target.value)}
          className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]"
        >
          <option value="us-central1">us-central1</option>
          <option value="europe-west1">europe-west1</option>
          <option value="asia-east1">asia-east1</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-1">ADK Framework</label>
        <div className="bg-gray-700/60 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 h-[42px] flex items-center justify-between">
          <span className="font-medium text-blue-400">Google ADK 2.x</span>
          <span className="text-[10px] bg-blue-900/60 text-blue-300 border border-blue-700 px-2 py-0.5 rounded font-mono">
            google-adk &ge; 2.3.0
          </span>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-1">Model</label>
        <select
          name="model"
          value={adkConfig.model}
          onChange={handleAdkConfigChange}
          className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]"
        >
          <optgroup label="Gemini 3.x — Cutting-Edge Reasoning (Global)">
            <option value="gemini-3.5-flash">Gemini 3.5 Flash (Recommended - Reasoning Depth)</option>
            <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash Lite (Fast Reasoning)</option>
            <option value="gemini-3.8-flash">Gemini 3.8 Flash (Deep Reasoning)</option>
            <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Preview)</option>
            <option value="gemini-3-flash-preview">Gemini 3.0 Flash (Preview - Legacy)</option>
          </optgroup>
          <optgroup label="Gemini 2.x — Production & Auto-Updating">
            <option value="gemini-flash-latest">Gemini 2.x Flash (Latest Auto-Updating - Global)</option>
            <option value="gemini-2.5-flash">Gemini 2.5 Flash (Stable - Regional us-central1)</option>
            <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite (Stable - Regional us-central1)</option>
            <option value="gemini-2.5-pro">Gemini 2.5 Pro (Stable - Regional us-central1)</option>
          </optgroup>
        </select>
      </div>

      {/* Staging Bucket */}
      <div className="mt-2">
        <label className="block text-sm font-medium text-gray-400 mb-1">Staging Bucket</label>
        <div className="flex gap-2">
          <select
            value={stagingBucket}
            onChange={(e) => setStagingBucket(e.target.value)}
            className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full focus:ring-teal-500 focus:border-teal-500"
          >
            <option value="">-- Select Bucket --</option>
            {buckets.map((b) => (
              <option key={b.name} value={`gs://${b.name}`}>
                gs://{b.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              setIsLoadingBuckets(true);
              api.listBuckets(projectNumber).then((res) => {
                setBuckets(res.items || []);
                setIsLoadingBuckets(false);
              });
            }}
            disabled={isLoadingBuckets}
            className="px-3 py-2 bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600 disabled:opacity-50"
            title="Refresh Buckets"
          >
            &#x21bb;
          </button>
        </div>
        {!stagingBucket && (
          <p className="text-xs text-yellow-500 mt-1">Required for deployment.</p>
        )}
      </div>
      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="block text-sm font-medium text-gray-400">Instruction</label>
          <button
            onClick={() => handleRewrite('instruction')}
            disabled={rewritingField === 'instruction'}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            {rewritingField === 'instruction' ? '...' : 'AI Rewrite'}
          </button>
        </div>

        <textarea
          name="instruction"
          value={adkConfig.instruction}
          onChange={handleAdkConfigChange}
          rows={4}
          className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full mt-2"
        />
      </div>
      <div className="space-y-2 pt-2 border-t border-gray-600">
        <label className="flex items-center space-x-3 cursor-pointer">
          <input
            type="checkbox"
            name="useGoogleSearch"
            checked={adkConfig.useGoogleSearch}
            onChange={handleAdkConfigChange}
            className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
          />
          <span className="text-sm text-gray-300">Enable Google Search Tool</span>
        </label>
      </div>
    </>
  );
};

export default AdkBasicSettings;
