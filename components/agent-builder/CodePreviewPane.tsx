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
  ADK_TABS,
  A2A_TABS,
  hasAnyTools,
} from '../../services/adkTemplates';
import { isValidAdkAgentName } from '../../services/adkTemplates/agentName';

export const COMPONENT_PEDAGOGY: Record<string, { title: string; icon: string; description: string }> = {
  app: {
    title: 'app.py — Enterprise Server (Durable Sessions)',
    icon: '🖥️',
    description: 'Wraps your agent in StudioAdkApp (vertexai.agent_engines.AdkApp) providing persistent Vertex AI sessions, session CRUD, and synchronous endpoints.',
  },
  agent: {
    title: 'agent.py — The Brain (Agent Orchestrator)',
    icon: '🧠',
    description: 'Defines root agent instructions, model parameters, and tool orchestration using Google ADK (google.adk).',
  },
  tools: {
    title: 'tools.py — The Hands (Tool Integrations & MCP)',
    icon: '🛠️',
    description: 'Implements Python callables, Model Armor defense callbacks, MCP protocol connectors, and Gemini Enterprise Discovery Engine search.',
  },
  auth: {
    title: 'auth.py — Enterprise Authentication',
    icon: '🛂',
    description: 'Handles OAuth 2.0 user delegation for identity propagation with application default credentials fallback.',
  },
  deploy_re: {
    title: 'deploy_re.py — Agent Engine Deployer',
    icon: '🚀',
    description: 'Programmatic deployment script for Vertex AI Agent Engine with remote serialization.',
  },
  requirements: {
    title: 'requirements.txt — Pinned Dependencies',
    icon: '📦',
    description: 'Pinned Python dependencies ensuring reproducible local execution and Cloud Build deployments.',
  },
  makefile: {
    title: 'Makefile — Developer Shortcuts',
    icon: '⚡',
    description: 'Standardized CLI commands (make run, make test, make deploy) for fast developer iteration.',
  },
  readme: {
    title: 'README.md — Developer Guide',
    icon: '📖',
    description: 'Step-by-step instructions for running locally, testing, and deploying to Google Cloud.',
  },
  env: {
    title: '.env — Runtime Environment',
    icon: '⚙️',
    description: 'Local runtime configuration, project identifiers, and credentials (never committed to version control).',
  },
  init: {
    title: '__init__.py — Package Initializer',
    icon: '📄',
    description: 'Marks the directory as a Python package for clean modular imports.',
  },
  dockerfile: {
    title: 'Dockerfile — Container Image',
    icon: '🐳',
    description: 'Container specification for Cloud Run deployment with FastAPI & Uvicorn.',
  },
  cloudbuild: {
    title: 'cloudbuild.yaml — CI/CD Pipeline',
    icon: '🏗️',
    description: 'Automated build and test steps for Google Cloud Build.',
  },
  github_deploy: {
    title: '.github/workflows/deploy.yml — GitHub Actions',
    icon: '🐙',
    description: 'Reusable GitHub Actions workflow for continuous integration, evaluation, and deployment.',
  },
  main: {
    title: 'main.py — A2A Server',
    icon: '🧠',
    description: 'FastAPI service implementing the Agent-to-Agent protocol (/invoke, /.well-known/agent.json).',
  },
};

export type AdkFileKey =
  | 'app'
  | 'agent'
  | 'env'
  | 'requirements'
  | 'readme'
  | 'deploy_re'
  | 'auth'
  | 'tools'
  | 'init'
  | 'makefile'
  | 'dockerfile'
  | 'cloudbuild'
  | 'github_deploy';

export type A2aFileKey = 'main' | 'dockerfile' | 'requirements' | 'env';

export interface CodePreviewPaneProps {
  builderTab: 'adk' | 'a2a';
  adkCodeDisplay?: string;
  a2aCodeDisplay?: string;
  adkConfig: AdkAgentConfig;
  adkActiveTab: AdkFileKey;
  setAdkActiveTab: (tab: AdkFileKey) => void;
  a2aActiveTab: A2aFileKey;
  setA2aActiveTab: (tab: A2aFileKey) => void;
  adkCopySuccess: string;
  a2aCopySuccess: string;
  setAdkCopySuccess: React.Dispatch<React.SetStateAction<string>>;
  setA2aCopySuccess: React.Dispatch<React.SetStateAction<string>>;
  handleCopy: (code: string, setter: React.Dispatch<React.SetStateAction<string>>) => void;
  handleDownloadAdkZip: () => void;
  handleDownloadA2a: () => void;
  setIsAdkDeployModalOpen: (open: boolean) => void;
  setIsA2aDeployModalOpen: (open: boolean) => void;
  setIsRegisterModalOpen: (open: boolean) => void;
  registrationNotice: string | null;
  setRegistrationNotice: (notice: string | null) => void;
}

export const CodePreviewPane: React.FC<CodePreviewPaneProps> = ({
  builderTab,
  adkCodeDisplay,
  a2aCodeDisplay,
  adkConfig,
  adkActiveTab,
  setAdkActiveTab,
  a2aActiveTab,
  setA2aActiveTab,
  adkCopySuccess,
  a2aCopySuccess,
  setAdkCopySuccess,
  setA2aCopySuccess,
  handleCopy,
  handleDownloadAdkZip,
  handleDownloadA2a,
  setIsAdkDeployModalOpen,
  setIsA2aDeployModalOpen,
  setIsRegisterModalOpen,
  registrationNotice,
  setRegistrationNotice,
}) => {
  const activeTabKey = builderTab === 'adk' ? adkActiveTab : a2aActiveTab;
  const activeComponentInfo = COMPONENT_PEDAGOGY[activeTabKey] || {
    title: `${activeTabKey} — Component File`,
    icon: '📄',
    description: 'Component file for runtime agent configuration.',
  };

  return (
    <div className="flex-1 lg:w-3/5 flex flex-col min-h-0 bg-gray-800 rounded-lg shadow-md border border-gray-700 overflow-hidden">
      {/* Explorer Header / Actions Toolbar */}
      <div className="p-3.5 border-b border-gray-700 flex flex-wrap items-center justify-between gap-3 bg-gray-850 shrink-0">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span>2. Component & Code Explorer</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-900/60 text-blue-300 border border-blue-700 font-mono font-normal">
              {builderTab.toUpperCase()}
            </span>
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Inspect how each component works, explore the architecture, or export for local development.
          </p>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() =>
              handleCopy(
                (builderTab === 'adk' ? adkCodeDisplay : a2aCodeDisplay) || '',
                builderTab === 'adk' ? setAdkCopySuccess : setA2aCopySuccess
              )
            }
            className="px-2.5 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 hover:text-white text-xs font-medium rounded border border-gray-600 flex items-center gap-1.5 transition-colors"
            title="Copy active file content to clipboard"
          >
            <span>📋</span>
            <span>{(builderTab === 'adk' ? adkCopySuccess : a2aCopySuccess) || 'Copy File'}</span>
          </button>

          <button
            type="button"
            disabled={builderTab === 'adk' && !isValidAdkAgentName(adkConfig.name)}
            onClick={builderTab === 'adk' ? handleDownloadAdkZip : handleDownloadA2a}
            className={`px-3 py-1.5 text-xs font-semibold rounded border flex items-center gap-1.5 transition-colors ${
              builderTab === 'adk' && !isValidAdkAgentName(adkConfig.name)
                ? 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed'
                : 'bg-gray-700 hover:bg-gray-600 text-white border-gray-600'
            }`}
            title="Download full project archive (.zip)"
          >
            <span>📥</span>
            <span>Download .zip</span>
          </button>

          <button
            type="button"
            disabled={builderTab === 'adk' && !isValidAdkAgentName(adkConfig.name)}
            onClick={() =>
              builderTab === 'adk'
                ? setIsAdkDeployModalOpen(true)
                : setIsA2aDeployModalOpen(true)
            }
            className={`px-3.5 py-1.5 text-xs font-bold rounded shadow flex items-center gap-1.5 transition-all ${
              builderTab === 'adk' && !isValidAdkAgentName(adkConfig.name)
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-500 hover:to-teal-400 text-white shadow-blue-900/30'
            }`}
            title="Deploy to Google Cloud using Cloud Build"
          >
            <span>🚀</span>
            <span>Deploy...</span>
          </button>

          <button
            type="button"
            onClick={() => setIsRegisterModalOpen(true)}
            className="px-3.5 py-1.5 text-xs font-bold rounded shadow flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30 transition-colors"
            title="Register in Gemini Enterprise Discovery Engine"
          >
            <span>🔗</span>
            <span>Register in GE...</span>
          </button>
        </div>
      </div>

      {/* Registration Notice if recently registered */}
      {registrationNotice && (
        <div className="mx-4 mt-3 p-2.5 bg-emerald-900/30 border border-emerald-700 rounded-lg text-xs text-emerald-200 flex items-center justify-between shrink-0">
          <span>{registrationNotice}</span>
          <button
            type="button"
            onClick={() => setRegistrationNotice(null)}
            className="text-emerald-400 hover:text-emerald-200 font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* File Tabs Bar */}
      <div className="flex items-center gap-1 px-3 pt-2 bg-gray-900 border-b border-gray-700 overflow-x-auto shrink-0">
        {(builderTab === 'adk'
          ? ADK_TABS.filter(
              (t) =>
                (t.id !== 'auth' || adkConfig.enableOAuth) &&
                (t.id !== 'tools' || hasAnyTools(adkConfig))
            )
          : A2A_TABS
        ).map((tab) => {
          const isActive =
            (builderTab === 'adk' ? adkActiveTab : a2aActiveTab) === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() =>
                builderTab === 'adk'
                  ? setAdkActiveTab(tab.id as any)
                  : setA2aActiveTab(tab.id as any)
              }
              className={`px-3 py-2 text-xs font-mono font-medium rounded-t-md transition-colors flex items-center gap-1.5 border-t-2 ${
                isActive
                  ? 'bg-gray-950 text-blue-400 border-blue-500 shadow-inner'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 border-transparent'
              }`}
            >
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Plain-English Component Pedagogy Banner */}
      <div className="px-4 py-2 bg-blue-950/40 border-b border-blue-900/50 flex items-center gap-3 shrink-0">
        <span className="text-lg shrink-0">{activeComponentInfo.icon}</span>
        <div className="flex-1 min-w-0">
          <span className="text-xs font-bold text-blue-300 mr-2">
            {activeComponentInfo.title}:
          </span>
          <span className="text-xs text-gray-300">
            {activeComponentInfo.description}
          </span>
        </div>
      </div>

      {/* Code Canvas (100% full vertical height, zero squishing) */}
      <div className="bg-gray-950 flex-1 min-h-0 overflow-auto font-mono text-xs">
        <pre className="p-4 text-gray-300 whitespace-pre-wrap leading-relaxed">
          <code>{builderTab === 'adk' ? adkCodeDisplay : a2aCodeDisplay}</code>
        </pre>
      </div>
    </div>
  );
};

export default CodePreviewPane;
