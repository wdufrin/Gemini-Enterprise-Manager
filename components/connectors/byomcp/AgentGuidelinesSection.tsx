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
import { INSTRUCTION_PRESETS, InstructionPreset } from './types';

interface AgentGuidelinesSectionProps {
  mcpServerDescription: string;
  setMcpServerDescription: (val: string) => void;
  mcpAgentInstructions: string;
  setMcpAgentInstructions: (val: string) => void;
  onApplyPreset: (preset: InstructionPreset) => void;
}

export const AgentGuidelinesSection: React.FC<AgentGuidelinesSectionProps> = ({
  mcpServerDescription,
  setMcpServerDescription,
  mcpAgentInstructions,
  setMcpAgentInstructions,
  onApplyPreset,
}) => {
  return (
    <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-800 space-y-4">
      <div className="flex justify-between items-center border-b border-gray-800 pb-2">
        <div>
          <h4 className="text-sm font-bold text-gray-200 uppercase tracking-wider">
            MCP Agent & Formatting Guidelines
          </h4>
          <p className="text-xs text-gray-400">
            Defines the purpose of this server and formatting rules provided to the AI agent.
          </p>
        </div>

        {/* Presets dropdown */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 font-medium hidden sm:inline">Templates:</span>
          <div className="flex flex-wrap gap-1.5">
            {INSTRUCTION_PRESETS.map((preset, idx) => (
              <button
                key={idx}
                onClick={() => onApplyPreset(preset)}
                title={preset.description}
                className="px-2.5 py-1 text-[11px] font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded border border-gray-700 transition-colors"
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Server Description */}
      <div>
        <label className="block text-xs font-semibold text-gray-300 mb-1">
          MCP Server Description <span className="text-purple-400 font-mono text-[10px]">(mcp_server_description)</span>
        </label>
        <input
          type="text"
          value={mcpServerDescription}
          onChange={(e) => setMcpServerDescription(e.target.value)}
          placeholder="e.g. Enterprise search server to search across company docs, tickets, and communications."
          className="w-full bg-gray-950 border border-gray-700 rounded p-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <p className="text-[11px] text-gray-500 mt-1">
          High-level description of what the MCP server searches or performs. Used by agent orchestrators for query routing.
        </p>
      </div>

      {/* Agent Instructions */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="block text-xs font-semibold text-gray-300">
            Agent Formatting & Behavioral Instructions <span className="text-purple-400 font-mono text-[10px]">(mcp_agent_instructions)</span>
          </label>
          <button
            onClick={() => setMcpAgentInstructions('')}
            className="text-[10px] text-gray-500 hover:text-red-400 transition-colors"
          >
            Clear
          </button>
        </div>
        <textarea
          value={mcpAgentInstructions}
          onChange={(e) => setMcpAgentInstructions(e.target.value)}
          rows={8}
          placeholder="FORMATTING INSTRUCTIONS FOR SEARCH RESULTS:&#10;1. Always provide a concise executive summary first.&#10;2. Group results by source system (e.g., Google Docs, Slack, Jira, Confluence).&#10;3. Include [Title](URL), Author, and Date."
          className="w-full bg-gray-950 border border-gray-700 rounded p-3 text-xs text-white font-mono placeholder-gray-600 focus:outline-none focus:border-blue-500 leading-relaxed custom-scrollbar"
        />
        <p className="text-[11px] text-gray-500 mt-1">
          Multi-line system prompt given to Gemini when executing actions or summarizing retrieved data from this MCP server.
        </p>
      </div>
    </div>
  );
};
