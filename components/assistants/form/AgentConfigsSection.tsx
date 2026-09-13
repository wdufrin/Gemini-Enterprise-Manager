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
import { VertexAiAgentConfig } from '../../../types';
import InfoTooltip from '../../InfoTooltip';

export interface AgentConfigsSectionProps {
  agentConfigs: VertexAiAgentConfig[];
  handleRemoveAgentConfig: (index: number) => void;
}

export const AgentConfigsSection: React.FC<AgentConfigsSectionProps> = ({
  agentConfigs,
  handleRemoveAgentConfig,
}) => {
  return (
    <div className="border-t border-gray-700 pt-4">
      <h3 className="text-md font-semibold text-white mb-2">Attached Vertex AI Agent Configs</h3>
      {agentConfigs.length === 0 ? (
        <p className="text-sm text-gray-500 italic">
          No attached Vertex AI agents found. Management of Vertex AI agents is handled via the Agent API.
        </p>
      ) : (
        <div className="space-y-4">
          {agentConfigs.map((cfg, index) => (
            <div key={index} className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="font-semibold text-gray-300">Agent #{index + 1}</h4>
                <button
                  type="button"
                  onClick={() => handleRemoveAgentConfig(index)}
                  className="text-sm text-red-400 hover:text-red-300"
                >
                  Remove
                </button>
              </div>
              <div>
                <label className="flex items-center text-xs font-medium text-gray-400">
                  Agent Engine ID
                  <InfoTooltip text="The unique ID of the attached reasoning engine." />
                </label>
                <input
                  type="text"
                  value={cfg.name.split('/').pop() || cfg.name}
                  className="mt-1 block w-full bg-gray-700/50 border-gray-600 rounded-md shadow-sm text-gray-400 cursor-not-allowed text-xs font-mono px-3 py-1.5"
                  disabled
                />
              </div>
              <div>
                <label className="flex items-center text-xs font-medium text-gray-400">
                  Display Name
                  <InfoTooltip text="The name of the agent tool as exposed to the model." />
                </label>
                <input
                  type="text"
                  value={cfg.displayName}
                  className="mt-1 block w-full bg-gray-700/50 border-gray-600 rounded-md shadow-sm text-gray-400 cursor-not-allowed px-3 py-1.5"
                  disabled
                />
              </div>
              <div>
                <label className="flex items-center text-xs font-medium text-gray-400">
                  Tool Description
                  <InfoTooltip text="Description of what this agent tool does, used by the model to decide when to call it." />
                </label>
                <textarea
                  value={cfg.toolDescription}
                  rows={2}
                  className="mt-1 block w-full bg-gray-700/50 border-gray-600 rounded-md shadow-sm text-gray-400 cursor-not-allowed px-3 py-1.5"
                  disabled
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
