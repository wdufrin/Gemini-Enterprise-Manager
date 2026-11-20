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

import React, { useMemo } from 'react';
import { Page } from '../types';

interface CloudConsoleButtonProps {
  currentPage?: Page;
  projectId?: string;
  projectNumber?: string;
  url?: string;
  className?: string;
}

const CloudConsoleButton: React.FC<CloudConsoleButtonProps> = ({
  currentPage,
  projectId,
  projectNumber,
  url,
  className = '',
}) => {
  const consoleUrl = useMemo(() => {
    if (url) return url;
    const targetProject = projectId || projectNumber;
    if (!targetProject) return 'https://console.cloud.google.com/';

    switch (currentPage) {
      case Page.AGENTS:
      case Page.AGENT_BUILDER:
      case Page.ARCHITECTURE:
      case Page.ASSISTANT:
      case Page.LATENCY_LAB:
      case Page.DEV_TOOLS:
        return `https://console.cloud.google.com/gemini-enterprise/apps?project=${targetProject}`;
      case Page.AGENT_ENGINES:
        return `https://console.cloud.google.com/vertex-ai/agents/agent-engines?project=${targetProject}`;
      case Page.SKILLS_REGISTRY:
        return `https://console.cloud.google.com/vertex-ai/agents?project=${targetProject}`;
      case Page.DATA_STORES:
        return `https://console.cloud.google.com/gemini-enterprise/data-stores?project=${targetProject}`;
      case Page.CLOUD_RUN_AGENTS:
        return `https://console.cloud.google.com/run?project=${targetProject}`;
      case Page.DIALOGFLOW_AGENTS:
        return `https://console.cloud.google.com/dialogflow/cx?project=${targetProject}`;
      case Page.MODEL_ARMOR:
        return `https://console.cloud.google.com/security/model-armor?project=${targetProject}`;
      case Page.LICENSE:
        return `https://console.cloud.google.com/gemini-enterprise/user-license?project=${targetProject}`;
      case Page.GE_QUOTA_USAGE:
        return `https://console.cloud.google.com/gemini-enterprise/usage-and-spending?project=${targetProject}`;
      case Page.AUTHORIZATIONS:
        return `https://console.cloud.google.com/gen-app-builder/authorizations?project=${targetProject}`;
      case Page.AGENT_PERMISSIONS:
        return `https://console.cloud.google.com/iam-admin/iam?project=${targetProject}`;
      case Page.OBSERVABILITY:
      case Page.CONFIG_AUDIT:
        return `https://console.cloud.google.com/logs/query?project=${targetProject}`;
      case Page.BACKUP_RECOVERY:
        return `https://console.cloud.google.com/storage/browser?project=${targetProject}`;
      case Page.MCP_SERVERS:
      case Page.CHAT:
      case Page.A2A_TESTER:
      default:
        return `https://console.cloud.google.com/home/dashboard?project=${targetProject}`;
    }
  }, [currentPage, projectId, projectNumber, url]);

  return (
    <a
      href={consoleUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-xs sm:text-sm font-medium text-gray-200 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${className}`.trim()}
      title="Open in Google Cloud Console"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-4 w-4 text-blue-400 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
        />
      </svg>
      <span className="hidden sm:inline">Cloud Console</span>
    </a>
  );
};

export default CloudConsoleButton;
