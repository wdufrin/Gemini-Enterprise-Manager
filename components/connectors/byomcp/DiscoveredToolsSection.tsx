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
import { DynamicToolItem } from './types';

interface DiscoveredToolsSectionProps {
  instanceUri: string;
  setInstanceUri: (val: string) => void;
  isTestingConnectivity: boolean;
  connectivityResult: { status: 'ok' | 'fail'; message: string } | null;
  onTestConnectivity: () => void;
  isRefreshingTools: boolean;
  refreshToolsSuccess: boolean;
  refreshToolsError: string | null;
  onRefreshTools: () => void;
  dynamicTools: DynamicToolItem[];
  onToggleTool: (toolName: string) => void;
  onToggleAllTools: (enable: boolean) => void;
}

export const DiscoveredToolsSection: React.FC<DiscoveredToolsSectionProps> = ({
  instanceUri,
  setInstanceUri,
  isTestingConnectivity,
  connectivityResult,
  onTestConnectivity,
  isRefreshingTools,
  refreshToolsSuccess,
  refreshToolsError,
  onRefreshTools,
  dynamicTools,
  onToggleTool,
  onToggleAllTools,
}) => {
  return (
    <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-800 space-y-4">
      <div className="border-b border-gray-800 pb-2 flex justify-between items-center">
        <div>
          <h4 className="text-sm font-bold text-gray-200 uppercase tracking-wider">
            MCP Server Endpoint & Discovered Tools
          </h4>
          <p className="text-xs text-gray-400">
            Configure server URL and toggle individual tools to enable or disable actions.
          </p>
        </div>
      </div>

      {/* Instance URI */}
      <div>
        <label className="block text-xs font-semibold text-gray-300 mb-1">
          MCP Instance URI <span className="text-purple-400 font-mono text-[10px]">(instance_uri)</span>
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={instanceUri}
            onChange={(e) => setInstanceUri(e.target.value)}
            placeholder="https://oracle-mcp-server-123456789012.us-central1.run.app/mcp"
            className="flex-1 bg-gray-950 border border-gray-700 rounded p-2.5 text-xs text-white font-mono placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={onTestConnectivity}
            disabled={isTestingConnectivity || !instanceUri.trim()}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold rounded border border-gray-700 disabled:opacity-50 transition-colors flex items-center gap-1.5 shrink-0"
          >
            {isTestingConnectivity ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-blue-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Testing...
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                Test Connectivity
              </>
            )}
          </button>
          <button
            onClick={onRefreshTools}
            disabled={isRefreshingTools || !instanceUri.trim()}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded disabled:opacity-50 transition-colors flex items-center gap-1.5 shrink-0 shadow-sm"
          >
            {isRefreshingTools ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Refreshing...
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3-3 3 3m-3-3v12" /></svg>
                Fetch Tools
              </>
            )}
          </button>
        </div>

        {/* Connectivity status banner */}
        {connectivityResult && (
          <div
            className={`mt-2 p-2.5 rounded text-xs flex items-center gap-2 ${
              connectivityResult.status === 'ok'
                ? 'bg-green-950/40 text-green-300 border border-green-900'
                : 'bg-red-950/40 text-red-300 border border-red-900'
            }`}
          >
            {connectivityResult.status === 'ok' ? (
              <svg className="w-4 h-4 shrink-0 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            ) : (
              <svg className="w-4 h-4 shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            )}
            <span>{connectivityResult.message}</span>
          </div>
        )}

        {refreshToolsSuccess && (
          <div className="mt-2 p-2 rounded bg-green-950/30 border border-green-900/50 text-green-300 text-xs flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Discovered {dynamicTools.length} tools from MCP server.
          </div>
        )}

        {refreshToolsError && (
          <div className="mt-2 p-2 rounded bg-red-950/30 border border-red-900/50 text-red-300 text-xs flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {refreshToolsError}
          </div>
        )}
      </div>

      {/* Discovered Tools List */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
            Dynamic MCP Tools ({dynamicTools.filter((t) => t.enabled).length}/{dynamicTools.length} enabled)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => onToggleAllTools(true)}
              className="text-[11px] text-blue-400 hover:text-blue-300 hover:underline"
            >
              Enable All
            </button>
            <span className="text-gray-600">|</span>
            <button
              onClick={() => onToggleAllTools(false)}
              className="text-[11px] text-gray-400 hover:text-gray-300 hover:underline"
            >
              Disable All
            </button>
          </div>
        </div>

        {dynamicTools.length === 0 ? (
          <div className="bg-gray-950 p-4 rounded border border-gray-800 text-center text-xs text-gray-500">
            No tools configured yet. Click <strong className="text-blue-400">Fetch Tools</strong> above to auto-discover tools from your MCP endpoint.
          </div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
            {dynamicTools.map((tool, idx) => (
              <div
                key={idx}
                className={`p-2.5 rounded border transition-colors flex items-start justify-between gap-3 ${
                  tool.enabled
                    ? 'bg-gray-950/70 border-gray-700/80 hover:border-gray-600'
                    : 'bg-gray-950/30 border-gray-800/60 opacity-60'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-purple-300">
                      {tool.name}
                    </span>
                    {tool.displayName && tool.displayName !== tool.name && (
                      <span className="text-[11px] text-gray-400">({tool.displayName})</span>
                    )}
                  </div>
                  {tool.description && (
                    <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2" title={tool.description}>
                      {tool.description}
                    </p>
                  )}
                </div>

                {/* Toggle Button */}
                <button
                  onClick={() => onToggleTool(tool.name)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded shrink-0 transition-colors ${
                    tool.enabled
                      ? 'bg-green-950 text-green-300 border border-green-800 hover:bg-green-900'
                      : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
                  }`}
                >
                  {tool.enabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
