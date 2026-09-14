import React, { useMemo } from 'react';
import { Page } from '../types';

interface CloudConsoleButtonProps {
    currentPage?: Page;
    projectId?: string;
    projectNumber?: string;
    url?: string;
    className?: string;
}

const CloudConsoleButton: React.FC<CloudConsoleButtonProps> = ({ currentPage, projectId, projectNumber: _projectNumber, url, className = "" }) => {
    
    const consoleUrl = useMemo(() => {
        if (url) return url;
        if (!projectId) return 'https://console.cloud.google.com/';

        switch (currentPage) {
            case Page.AGENTS:
            case Page.AGENT_BUILDER:
            case Page.AGENT_ENGINES:
            case Page.ARCHITECTURE:
            case Page.ASSISTANT:
                return `https://console.cloud.google.com/gen-app-builder/engines?project=${projectId}`;
            case Page.DATA_STORES:
                return `https://console.cloud.google.com/gen-app-builder/data-stores?project=${projectId}`;
            case Page.CLOUD_RUN_AGENTS:
                return `https://console.cloud.google.com/run?project=${projectId}`;
            case Page.DIALOGFLOW_AGENTS:
                return `https://console.cloud.google.com/dialogflow/cx?project=${projectId}`;
            case Page.MODEL_ARMOR:
                return `https://console.cloud.google.com/security/model-armor?project=${projectId}`;
            case Page.LICENSE:
            case Page.GE_QUOTA_USAGE:
                return `https://console.cloud.google.com/gemini-enterprise/user-license?project=${projectId}`;
            case Page.AUTHORIZATIONS:
                return `https://console.cloud.google.com/gen-app-builder/authorizations?project=${projectId}`;
            case Page.MCP_SERVERS:
            case Page.BACKUP_RECOVERY:
            case Page.CHAT:
            case Page.A2A_TESTER:
            default:
                return `https://console.cloud.google.com/home/dashboard?project=${projectId}`;
        }
    }, [currentPage, projectId, url]);

    return (
        <a
            href={consoleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-md text-sm text-gray-200 transition-colors ${className}`}
            title="Open in Google Cloud Console"
        >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            <span className="hidden sm:inline">Cloud Console</span>
        </a>
    );
};

export default CloudConsoleButton;
