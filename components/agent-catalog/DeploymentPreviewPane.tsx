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

interface DeploymentPreviewPaneProps {
  leftTab: 'architecture' | 'docs' | 'cloud_build';
  setLeftTab: (tab: 'architecture' | 'docs' | 'cloud_build') => void;
  readmeContent: string;
  entryModulePath: string;
  entryPoint: string;
  tools: string[];
  target: 'cloud_run' | 'reasoning_engine';
  previewBuildConfig: Record<string, unknown>;
  cloudRunDeployScript: string;
}

const NodeIcon: React.FC<{ type: string }> = ({ type }) => {
  switch (type) {
    case 'agent':
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6 text-pink-400"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
        </svg>
      );
    case 'tool':
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5 text-teal-400"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.532 1.532 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.532 1.532 0 01-.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
            clipRule="evenodd"
          />
        </svg>
      );
    default:
      return <div className="h-4 w-4 bg-gray-500 rounded-full"></div>;
  }
};

export const DeploymentPreviewPane: React.FC<DeploymentPreviewPaneProps> = ({
  leftTab,
  setLeftTab,
  readmeContent,
  entryModulePath,
  entryPoint,
  tools,
  target,
  previewBuildConfig,
  cloudRunDeployScript,
}) => {
  return (
    <div className="w-1/3 bg-gray-800/50 flex flex-col border-r border-gray-700">
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setLeftTab('docs')}
          className={`flex-1 py-3 text-sm font-medium ${
            leftTab === 'docs'
              ? 'text-white border-b-2 border-blue-500 bg-gray-700/50'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Documentation
        </button>
        <button
          onClick={() => setLeftTab('architecture')}
          className={`flex-1 py-3 text-sm font-medium ${
            leftTab === 'architecture'
              ? 'text-white border-b-2 border-blue-500 bg-gray-700/50'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Architecture
        </button>
        <button
          onClick={() => setLeftTab('cloud_build')}
          className={`flex-1 py-3 text-sm font-medium ${
            leftTab === 'cloud_build'
              ? 'text-white border-b-2 border-blue-500 bg-gray-700/50'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Cloud Build
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {leftTab === 'docs' ? (
          readmeContent ? (
            <div className="prose prose-invert prose-sm max-w-none">
              <pre className="whitespace-pre-wrap font-sans text-sm text-gray-300">
                {readmeContent}
              </pre>
            </div>
          ) : (
            <div className="text-center text-gray-500 mt-10">
              <p>No README.md found in this agent package.</p>
            </div>
          )
        ) : leftTab === 'architecture' ? (
          <div className="flex flex-col items-center space-y-6">
            {/* Agent Node */}
            <div className="flex flex-col items-center">
              <div className="w-20 h-20 bg-pink-900/50 border-2 border-pink-500 rounded-full flex items-center justify-center shadow-lg shadow-pink-900/20">
                <NodeIcon type="agent" />
              </div>
              <span className="mt-2 text-white font-medium text-sm">Agent</span>
              <span className="text-xs text-gray-500 font-mono mt-1">
                entry: {entryModulePath}.{entryPoint}
              </span>
            </div>

            {/* Connector */}
            {tools.length > 0 && <div className="h-8 w-0.5 bg-gray-600"></div>}

            {/* Tools Grid */}
            {tools.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 w-full">
                {tools.map((tool, i) => (
                  <div
                    key={i}
                    className="flex items-center p-3 bg-gray-700/30 border border-teal-500/30 rounded-lg"
                  >
                    <NodeIcon type="tool" />
                    <span className="ml-3 text-gray-300 text-xs font-medium">
                      {tool}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500 italic mt-4">
                No external tools detected via static analysis.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-gray-400">
              This is the configuration payload that will be sent to the Cloud Build
              API based on your current settings.
            </p>
            <div className="bg-black p-3 rounded-md overflow-x-auto border border-gray-700">
              <pre className="text-xs text-green-300 font-mono whitespace-pre-wrap">
                {JSON.stringify(previewBuildConfig, null, 2)}
              </pre>
            </div>
            {target === 'cloud_run' && (
              <div className="space-y-2">
                <p className="text-xs text-gray-400 font-bold">
                  Cloud Run Deploy Script (Bash)
                </p>
                <div className="bg-black p-3 rounded-md overflow-x-auto border border-gray-700">
                  <pre className="text-xs text-blue-300 font-mono whitespace-pre-wrap">
                    {cloudRunDeployScript}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
