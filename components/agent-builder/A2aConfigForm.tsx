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
import { A2aConfig, AgentTool } from '../../services/adkTemplates';
import { CloudRunService, DataStore } from '../../types';
import CloudRunAccessSelector from './CloudRunAccessSelector';

export interface A2aConfigFormProps {
  a2aConfig: A2aConfig;
  setA2aConfig: React.Dispatch<React.SetStateAction<A2aConfig>>;
  handleA2aConfigChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => void;
  deployProjectId: string;
  setDeployProjectId: (id: string) => void;
  fetchProjectId: () => void;
  isResolvingId: boolean;
  handleRewrite: (field: string) => void;
  rewritingField: string | null;
  dataStoreSearchTerm: string;
  setDataStoreSearchTerm: (term: string) => void;
  toolBuilderConfig: { dataStoreId: string };
  setToolBuilderConfig: React.Dispatch<
    React.SetStateAction<{ dataStoreId: string }>
  >;
  isLoadingDataStores: boolean;
  dataStores: (DataStore & { location: string })[];
  a2aSearchTerm: string;
  setA2aSearchTerm: (term: string) => void;
  selectedA2aService: string;
  setSelectedA2aService: (svc: string) => void;
  isLoadingServices: boolean;
  cloudRunServices: CloudRunService[];
  handleAddTool: (tool: AgentTool) => void;
  handleRemoveTool: (index: number) => void;
}

export const A2aConfigForm: React.FC<A2aConfigFormProps> = ({
  a2aConfig,
  setA2aConfig,
  handleA2aConfigChange,
  deployProjectId,
  setDeployProjectId,
  fetchProjectId,
  isResolvingId,
  handleRewrite,
  rewritingField,
  dataStoreSearchTerm,
  setDataStoreSearchTerm,
  toolBuilderConfig,
  setToolBuilderConfig,
  isLoadingDataStores,
  dataStores,
  a2aSearchTerm,
  setA2aSearchTerm,
  selectedA2aService,
  setSelectedA2aService,
  isLoadingServices,
  cloudRunServices,
  handleAddTool,
  handleRemoveTool,
}) => {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-1">Project ID</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={deployProjectId}
            onChange={(e) => setDeployProjectId(e.target.value)}
            className={`bg-gray-700 border rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px] ${
              /^\d+$/.test(deployProjectId) ? 'border-yellow-500' : 'border-gray-600'
            }`}
            placeholder="e.g. my-project-id"
          />
          <button
            onClick={fetchProjectId}
            disabled={isResolvingId}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-md text-white disabled:opacity-50"
          >
            {isResolvingId ? '...' : '↻'}
          </button>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-1">Service Name</label>
        <input
          name="serviceName"
          type="text"
          value={a2aConfig.serviceName}
          onChange={handleA2aConfigChange}
          className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-1">Display Name</label>
        <input
          name="displayName"
          type="text"
          value={a2aConfig.displayName}
          onChange={handleA2aConfigChange}
          className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-1">
          Provider Organization
        </label>
        <input
          name="providerOrganization"
          type="text"
          value={a2aConfig.providerOrganization}
          onChange={handleA2aConfigChange}
          className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-1">Model</label>
        <select
          name="model"
          value={a2aConfig.model}
          onChange={handleA2aConfigChange}
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

      <div>
        <label className="block text-sm font-medium text-gray-400 mb-1">Region</label>
        <select
          name="region"
          value={a2aConfig.region}
          onChange={handleA2aConfigChange}
          className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]"
        >
          <option value="us-central1">us-central1</option>
          <option value="europe-west1">europe-west1</option>
          <option value="asia-east1">asia-east1</option>
        </select>
      </div>
      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="block text-sm font-medium text-gray-400">System Instruction</label>
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
          value={a2aConfig.instruction}
          onChange={handleA2aConfigChange}
          rows={4}
          className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full"
        />
      </div>
      <div className="space-y-2 pt-2 border-t border-gray-600">
        <label className="flex items-center space-x-3 cursor-pointer">
          <input
            type="checkbox"
            name="useGoogleSearch"
            checked={a2aConfig.useGoogleSearch}
            onChange={handleA2aConfigChange}
            className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
          />
          <span className="text-sm text-gray-300">Enable Google Search Tool</span>
        </label>
      </div>

      <div className="pt-4 border-t border-gray-700">
        <h3 className="text-sm font-medium text-gray-300 mb-2">Add Tools</h3>
        <div className="bg-gray-700/50 p-3 rounded-md space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Vertex AI Search Data Store
            </label>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                placeholder="Search data stores..."
                value={dataStoreSearchTerm}
                onChange={(e) => setDataStoreSearchTerm(e.target.value)}
                className="bg-gray-600 border border-gray-500 rounded-md px-2 py-1 text-xs text-white w-full placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
              <div className="flex gap-2">
                <select
                  value={toolBuilderConfig.dataStoreId}
                  onChange={(e) =>
                    setToolBuilderConfig({
                      ...toolBuilderConfig,
                      dataStoreId: e.target.value,
                    })
                  }
                  className="bg-gray-600 border border-gray-500 rounded-md px-2 py-1 text-xs text-white w-full"
                  disabled={isLoadingDataStores}
                >
                  <option value="">-- Select Data Store --</option>
                  {dataStores
                    .filter(
                      (ds) =>
                        !dataStoreSearchTerm ||
                        ds.displayName
                          .toLowerCase()
                          .includes(dataStoreSearchTerm.toLowerCase()) ||
                        ds.name.includes(dataStoreSearchTerm)
                    )
                    .map((ds) => {
                      const dsId = ds.name.split('/').pop();
                      return (
                        <option key={ds.name} value={ds.name}>
                          {ds.displayName} ({dsId}) - {ds.location}
                        </option>
                      );
                    })}
                </select>
                <button
                  onClick={() =>
                    handleAddTool({
                      type: 'VertexAiSearchTool',
                      dataStoreId: toolBuilderConfig.dataStoreId,
                      variableName: `search_tool_${a2aConfig.tools.length + 1}`,
                    })
                  }
                  disabled={!toolBuilderConfig.dataStoreId}
                  className="px-2 py-1 bg-teal-600 text-white text-xs rounded hover:bg-teal-700 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Call Other Agent (A2A)
            </label>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                placeholder="Search A2A services..."
                value={a2aSearchTerm}
                onChange={(e) => setA2aSearchTerm(e.target.value)}
                className="bg-gray-600 border border-gray-500 rounded-md px-2 py-1 text-xs text-white w-full placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
              <div className="flex gap-2">
                <select
                  value={selectedA2aService}
                  onChange={(e) => setSelectedA2aService(e.target.value)}
                  className="bg-gray-600 border border-gray-500 rounded-md px-2 py-1 text-xs text-white w-full"
                  disabled={isLoadingServices}
                >
                  <option value="">-- Select A2A Service --</option>
                  {cloudRunServices
                    .filter(
                      (s) =>
                        !a2aSearchTerm ||
                        s.name.toLowerCase().includes(a2aSearchTerm.toLowerCase())
                    )
                    .map((s) => (
                      <option key={s.name} value={s.uri}>
                        {s.name.split('/').pop()}
                      </option>
                    ))}
                </select>
                <button
                  onClick={() =>
                    handleAddTool({
                      type: 'A2AClientTool',
                      url: selectedA2aService,
                      variableName: `a2a_agent_${a2aConfig.tools.length + 1}`,
                    })
                  }
                  disabled={!selectedA2aService}
                  className="px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {a2aConfig.tools.map((tool, i) => (
            <div
              key={i}
              className="flex justify-between items-center bg-gray-900 px-3 py-2 rounded border border-gray-700"
            >
              <div className="text-xs text-gray-300">
                <span className="font-bold text-teal-400">
                  {tool.type === 'VertexAiSearchTool' ? 'Search' : 'A2A'}
                </span>
                : {tool.variableName}
              </div>
              <button
                onClick={() => handleRemoveTool(i)}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="pt-4 border-t border-gray-700">
        <h3 className="text-sm font-medium text-gray-300 mb-2">Access &amp; Testing</h3>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-gray-500 mb-2">
              Controls the <code className="font-mono">gcloud run deploy</code> flags in the
              generated deploy script.
            </p>
            <CloudRunAccessSelector
              groupName="a2a"
              value={a2aConfig.cloudRunAccess ?? 'authenticated'}
              onChange={(mode) =>
                setA2aConfig((prev) => ({ ...prev, cloudRunAccess: mode }))
              }
            />
          </div>
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              name="enableCors"
              checked={a2aConfig.enableCors}
              onChange={handleA2aConfigChange}
              className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
            />
            <span className="text-sm text-gray-300">Enable CORS</span>
          </label>
        </div>
      </div>
    </>
  );
};

export default A2aConfigForm;
