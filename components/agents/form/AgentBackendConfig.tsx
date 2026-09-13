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
import { ReasoningEngine, CloudRunService, Config } from '../../../types';
import { AgentFormData, AgentType } from './types';

export interface AgentBackendConfigProps {
  config: Config;
  formData: AgentFormData;
  handleChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  agentType: AgentType;
  setAgentType: (type: AgentType) => void;
  agentToEdit: boolean;
  isEditingDisabled: boolean;
  isCrossProject: boolean;
  setIsCrossProject: (val: boolean) => void;
  sourceProjectId: string;
  setSourceProjectId: (id: string) => void;
  isLoadingEngines: boolean;
  engineLoadError: string | null;
  reasoningEngines: ReasoningEngine[];
  handleLoadEngines: () => Promise<void>;
  handleEngineSelect: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  useCloudRunPicker: boolean;
  setUseCloudRunPicker: (val: boolean) => void;
  cloudRunRegion: string;
  setCloudRunRegion: (region: string) => void;
  isLoadingServices: boolean;
  cloudRunServices: CloudRunService[];
  handleLoadServices: () => Promise<void>;
  handleServiceSelect: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  a2aStreaming: boolean;
  setA2aStreaming: (val: boolean) => void;
  a2aExtensions: any[];
  setA2aExtensions: React.Dispatch<React.SetStateAction<any[]>>;
}

export const AgentBackendConfig: React.FC<AgentBackendConfigProps> = ({
  config,
  formData,
  handleChange,
  agentType,
  setAgentType,
  agentToEdit,
  isEditingDisabled,
  isCrossProject,
  setIsCrossProject,
  sourceProjectId,
  setSourceProjectId,
  isLoadingEngines,
  engineLoadError,
  reasoningEngines,
  handleLoadEngines,
  handleEngineSelect,
  useCloudRunPicker,
  setUseCloudRunPicker,
  cloudRunRegion,
  setCloudRunRegion,
  isLoadingServices,
  cloudRunServices,
  handleLoadServices,
  handleServiceSelect,
  a2aStreaming,
  setA2aStreaming,
  a2aExtensions,
  setA2aExtensions,
}) => {
  return (
    <div className="space-y-4 border-t border-gray-700 p-4 rounded-md">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-white">Backend Configuration</h3>
        <div className="flex bg-gray-700 rounded-md p-1">
          <button
            type="button"
            onClick={() => !agentToEdit && setAgentType('reasoning_engine')}
            className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${
              agentType === 'reasoning_engine' ? 'bg-gray-600 text-white shadow' : 'text-gray-400 hover:text-white'
            } ${agentToEdit ? 'cursor-not-allowed opacity-70' : ''}`}
            disabled={agentToEdit}
          >
            Agent Engine
          </button>
          <button
            type="button"
            onClick={() => !agentToEdit && setAgentType('a2a')}
            className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${
              agentType === 'a2a' ? 'bg-gray-600 text-white shadow' : 'text-gray-400 hover:text-white'
            } ${agentToEdit ? 'cursor-not-allowed opacity-70' : ''}`}
            disabled={agentToEdit}
          >
            HTTP Service (A2A)
          </button>
        </div>
      </div>

      {agentType === 'reasoning_engine' ? (
        <>
          <div className="space-y-3">
            <div>
              <label htmlFor="createdBy" className="block text-sm font-medium text-gray-300">
                Created By
              </label>
              <input
                type="text"
                id="createdBy"
                name="createdBy"
                value={formData.createdBy}
                onChange={handleChange}
                placeholder="e.g., your-name@example.com"
                className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm disabled:bg-gray-700/50 disabled:cursor-not-allowed text-white px-3 py-2"
              />
            </div>
            <div>
              <label htmlFor="additionalInfo" className="block text-sm font-medium text-gray-300">
                Additional Info
              </label>
              <textarea
                id="additionalInfo"
                name="additionalInfo"
                value={formData.additionalInfo}
                onChange={handleChange}
                rows={3}
                className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm disabled:bg-gray-700/50 disabled:cursor-not-allowed text-white px-3 py-2"
              />
            </div>
          </div>
          <div className="flex items-center space-x-3 mb-2">
            <input
              type="checkbox"
              id="isCrossProject"
              checked={isCrossProject}
              onChange={(e) => {
                setIsCrossProject(e.target.checked);
                if (!e.target.checked) {
                  setSourceProjectId(config.projectId || '');
                }
              }}
              disabled={isEditingDisabled}
              className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
            />
            <label htmlFor="isCrossProject" className="text-sm font-medium text-gray-300">
              Cross-Project Agent Engine (Runtime)
            </label>
          </div>
          {isCrossProject && (
            <div className="mb-2">
              <label htmlFor="sourceProjectId" className="block text-sm font-medium text-gray-300">
                Source Project ID / Number
              </label>
              <input
                type="text"
                id="sourceProjectId"
                value={sourceProjectId}
                onChange={(e) => setSourceProjectId(e.target.value)}
                placeholder="e.g. 123456789012"
                disabled={isEditingDisabled}
                className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm text-white px-3 py-1.5"
                required
              />
            </div>
          )}
          <div>
            <label htmlFor="reasoningEngineLocation" className="block text-sm font-medium text-gray-300">
              Agent Engine Location
            </label>
            <div className="flex items-center space-x-2 mt-1">
              <input
                type="text"
                id="reasoningEngineLocation"
                name="reasoningEngineLocation"
                value={formData.reasoningEngineLocation}
                className="block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-gray-400 cursor-not-allowed px-3 py-2"
                disabled={isEditingDisabled}
                readOnly
              />
              <button
                type="button"
                onClick={handleLoadEngines}
                disabled={isLoadingEngines || !formData.reasoningEngineLocation || isEditingDisabled}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-md hover:bg-indigo-700 disabled:bg-gray-500"
              >
                {isLoadingEngines ? '...' : 'Load'}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              This is automatically set based on the Agent&apos;s Location (`{config.appLocation}`) to ensure compatibility.
            </p>
          </div>
          {engineLoadError && <p className="text-sm text-red-400">{engineLoadError}</p>}
          {reasoningEngines.length > 0 && (
            <div>
              <label htmlFor="engineSelect" className="block text-sm font-medium text-gray-300">
                Select an Agent Engine
              </label>
              <select
                id="engineSelect"
                onChange={handleEngineSelect}
                value={reasoningEngines.find(re => re.name.endsWith(`/${formData.reasoningEngineId}`))?.name || ''}
                className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-white disabled:bg-gray-700/50 disabled:cursor-not-allowed px-3 py-2"
              >
                <option value="">-- Manually Entered --</option>
                {reasoningEngines.map(engine => (
                  <option key={engine.name} value={engine.name}>
                    {engine.displayName} ({engine.name.split('/').pop()})
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="reasoningEngineId" className="block text-sm font-medium text-gray-300">
              Agent Engine ID
            </label>
            <input
              type="text"
              id="reasoningEngineId"
              name="reasoningEngineId"
              value={formData.reasoningEngineId}
              onChange={handleChange}
              className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm disabled:bg-gray-700/50 disabled:cursor-not-allowed text-white px-3 py-2"
              required
            />
          </div>
        </>
      ) : (
        <>
          <div>
            <label htmlFor="a2aUrl" className="block text-sm font-medium text-gray-300">
              Invoke URL (Required)
            </label>
            <div className="flex gap-2 items-center">
              <input
                type="url"
                id="a2aUrl"
                name="a2aUrl"
                value={formData.a2aUrl}
                onChange={handleChange}
                placeholder="https://my-service.run.app/invoke"
                className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm disabled:bg-gray-700/50 disabled:cursor-not-allowed text-white px-3 py-2"
                required
              />
              <button
                type="button"
                onClick={() => setUseCloudRunPicker(!useCloudRunPicker)}
                className="mt-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-md text-gray-300 text-xs whitespace-nowrap"
              >
                {useCloudRunPicker ? 'Cancel Scan' : 'Pick from Cloud Run'}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              The full HTTP endpoint used to invoke the agent (e.g. including `/invoke` or any custom path).
            </p>
          </div>

          {useCloudRunPicker && (
            <div className="bg-gray-900/50 p-3 rounded-md border border-gray-700 space-y-3">
              <h4 className="text-sm font-bold text-gray-300">Scan for Cloud Run Services</h4>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Region</label>
                  <select
                    value={cloudRunRegion}
                    onChange={(e) => setCloudRunRegion(e.target.value)}
                    className="w-full bg-gray-700 border-gray-600 rounded-md text-xs p-1.5 text-white"
                  >
                    <option value="us-central1">us-central1</option>
                    <option value="us-east1">us-east1</option>
                    <option value="us-east4">us-east4</option>
                    <option value="us-west1">us-west1</option>
                    <option value="europe-west1">europe-west1</option>
                    <option value="europe-west2">europe-west2</option>
                    <option value="europe-west4">europe-west4</option>
                    <option value="asia-east1">asia-east1</option>
                    <option value="asia-southeast1">asia-southeast1</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleLoadServices}
                    disabled={isLoadingServices}
                    className="w-full px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-md hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {isLoadingServices ? 'Scanning...' : 'Scan'}
                  </button>
                </div>
              </div>

              {cloudRunServices.length > 0 && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Select Service</label>
                  <select
                    onChange={handleServiceSelect}
                    value={formData.a2aUrl}
                    className="w-full bg-gray-700 border-gray-600 rounded-md text-xs p-1.5 text-white"
                  >
                    <option value="">-- Select a Service --</option>
                    {cloudRunServices.map(s => (
                      <option key={s.name} value={s.uri}>
                        {s.name.split('/').pop()} ({s.uri})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          <div>
            <label htmlFor="a2aOrg" className="block text-sm font-medium text-gray-300">
              Provider Organization
            </label>
            <input
              type="text"
              id="a2aOrg"
              name="a2aOrg"
              value={formData.a2aOrg}
              onChange={handleChange}
              className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm disabled:bg-gray-700/50 disabled:cursor-not-allowed text-white px-3 py-2"
            />
          </div>

          <div>
            <label className="flex items-center space-x-3 mb-2 cursor-pointer mt-4">
              <input
                type="checkbox"
                checked={a2aStreaming}
                onChange={(e) => setA2aStreaming(e.target.checked)}
                className="form-checkbox h-4 w-4 text-teal-500 rounded border-gray-600 bg-gray-800 focus:ring-teal-500"
                disabled={isEditingDisabled}
              />
              <span className="text-sm font-medium text-gray-300">Enable Streaming</span>
            </label>
          </div>

          {/* Extensions list */}
          <div className="mt-4 border-t border-gray-700/50 pt-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">Agent Extensions / DCR Registration</label>
            {a2aExtensions.map((ext, idx) => (
              <div key={idx} className="bg-gray-900/50 p-3 rounded-md border border-gray-700/50 mb-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-gray-400">Extension #{idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => setA2aExtensions(prev => prev.filter((_, i) => i !== idx))}
                    className="text-xs text-red-400 hover:underline"
                    disabled={isEditingDisabled}
                  >
                    Remove
                  </button>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500">Extension URI</label>
                  <input
                    type="text"
                    value={ext.uri || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setA2aExtensions(prev => prev.map((item, i) => i === idx ? { ...item, uri: val } : item));
                    }}
                    className="w-full bg-gray-800 border-gray-700 rounded text-xs p-1 mt-0.5 text-gray-300 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    disabled={isEditingDisabled}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500">Target Registration URL</label>
                  <input
                    type="text"
                    value={ext.params?.target_url || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setA2aExtensions(prev => prev.map((item, i) => i === idx ? { ...item, params: { ...item.params, target_url: val } } : item));
                    }}
                    className="w-full bg-gray-800 border-gray-700 rounded text-xs p-1 mt-0.5 text-gray-300 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    disabled={isEditingDisabled}
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setA2aExtensions(prev => [...prev, { uri: 'https://cloud.google.com/marketplace/docs/partners/ai-agents/setup-dcr', params: { target_url: '' } }])}
              className="w-full py-1 bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 font-semibold transition-colors"
              disabled={isEditingDisabled}
            >
              + Add Extension (DCR)
            </button>
          </div>
        </>
      )}
    </div>
  );
};
