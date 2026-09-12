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
import { GraphNode, Page, ReasoningEngine, CloudRunService } from '../../types';

interface DetailsPanelProps {
    node: GraphNode | null;
    projectNumber: string;
    onClose: () => void;
    onNavigate: (page: Page, context?: any) => void;
    onDirectQuery: (engine: ReasoningEngine) => void;
}

const getGcpConsoleUrl = (node: GraphNode, projectNumber: string): string | null => {
    const { type, id, data } = node;
    const projectId = id.split('/')[1] || projectNumber;

    switch (type) {
        case 'Project':
            return `https://console.cloud.google.com/home/dashboard?project=${projectId}`;
        case 'ReasoningEngine':
            const reLocation = id.split('/')[3];
            const reId = id.split('/').pop();
            return `https://console.cloud.google.com/vertex-ai/reasoning-engines/locations/${reLocation}/engines/${reId}?project=${projectId}`;
        case 'Agent':
            const agentLocation = id.split('/')[3];
            const collectionId = id.split('/')[5];
            const engineId = id.split('/')[7];
            const agentId = id.split('/').pop();
            return `https://console.cloud.google.com/gen-app-builder/locations/${agentLocation}/collections/${collectionId}/engines/${engineId}/agents/${agentId}?project=${projectId}`;
        case 'DataStore':
            const dsLocation = id.split('/')[3];
            const dsCollectionId = id.split('/')[5];
            const dsId = id.split('/').pop();
             return `https://console.cloud.google.com/gen-app-builder/locations/${dsLocation}/collections/${dsCollectionId}/dataStores/${dsId}?project=${projectId}`;
        case 'Authorization':
            const authId = id.split('/').pop();
            return `https://console.cloud.google.com/gen-app-builder/authorizations/${authId}?project=${projectId}`;
        case 'Engine':
             const enLocation = id.split('/')[3];
             const enCollectionId = id.split('/')[5];
             const enId = id.split('/').pop();
             return `https://console.cloud.google.com/gen-app-builder/locations/${enLocation}/collections/${enCollectionId}/engines/${enId}?project=${projectId}`;
        case 'CloudRunService':
             const crLocation = id.split('/')[3];
             const crService = id.split('/').pop();
             return `https://console.cloud.google.com/run/detail/${crLocation}/${crService}/metrics?project=${projectId}`;
        default:
            return `https://console.cloud.google.com/?project=${projectId}`;
    }
};

const DetailItem: React.FC<{ label: string; value?: string | null; children?: React.ReactNode }> = ({ label, value, children }) => {
    if (!value && !children) return null;
    return (
        <div>
            <dt className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</dt>
            <dd className="mt-1 text-sm text-gray-200 font-mono break-all">{children || value}</dd>
        </div>
    );
};

const ActionButton: React.FC<React.PropsWithChildren<{ onClick: () => void }>> = ({ onClick, children }) => (
    <button
        onClick={onClick}
        className="w-full text-left px-3 py-2 text-sm font-medium text-blue-300 bg-gray-700/50 rounded-md hover:bg-blue-600 hover:text-white transition-colors flex items-center gap-3"
    >
        {children}
    </button>
);

const DetailsPanel: React.FC<DetailsPanelProps> = ({ node, projectNumber, onClose, onNavigate, onDirectQuery }) => {
    if (!node) return null;
    
    const consoleUrl = getGcpConsoleUrl(node, projectNumber);

    const renderDetails = () => {
        switch (node.type) {
            case 'Agent':
                return <>
                    <DetailItem label="Status" value={node.data.state} />
                    <DetailItem label="Description">{node.data.description || 'Not set'}</DetailItem>
                </>;
            case 'ReasoningEngine':
                return <DetailItem label="Location" value={node.id.split('/')[3]} />;
            case 'DataStore':
                return <DetailItem label="Content Config" value={node.data.contentConfig} />;
            case 'Engine':
                 return <DetailItem label="Solution Type" value={node.data.solutionType} />;
            case 'Authorization':
                return <DetailItem label="Client ID" value={node.data.serverSideOauth2?.clientId} />;
            case 'CloudRunService':
                const crService = node.data as CloudRunService;
                return <>
                    <DetailItem label="URL">{crService.uri}</DetailItem>
                    <DetailItem label="Location" value={crService.location} />
                    <DetailItem label="Image">{crService.template?.containers?.[0]?.image}</DetailItem>
                </>;
            default:
                return null;
        }
    };
    
    const renderActions = () => {
         switch (node.type) {
            case 'Agent':
                const engineId = node.id.split('/')[7];
                const engineLocation = node.id.split('/')[3];
                const agentContext = { appEngineId: `projects/${projectNumber}/locations/${engineLocation}/collections/default_collection/engines/${engineId}` };
                return (
                    <ActionButton onClick={() => onNavigate(Page.ASSISTANT, agentContext)}>
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2zM7 8H5v2h2V8zm2 0h2v2H9V8zm6 0h-2v2h2V8z" clipRule="evenodd" /></svg>
                         Test in Playground
                    </ActionButton>
                );
            case 'ReasoningEngine':
                 return (
                    <ActionButton onClick={() => onDirectQuery(node.data as ReasoningEngine)}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 2a8 8 0 100 16 8 8 0 000-16zM6 9a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg>
                        Direct Query
                    </ActionButton>
                 );
            case 'CloudRunService':
                 return (
                    <ActionButton onClick={() => onNavigate(Page.A2A_TESTER, { serviceToEdit: node.data })}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 01-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        Test A2A Endpoint
                    </ActionButton>
                 );
            default:
                return null;
        }
    }

    return (
        <div className="absolute right-4 top-20 w-96 bg-gray-800/95 backdrop-blur-sm rounded-xl shadow-2xl border border-gray-700 flex flex-col z-20 max-h-[calc(100%-6rem)] animate-fade-in-up overflow-hidden">
            <header className="p-4 border-b border-gray-700 flex justify-between items-start bg-gray-900/80 rounded-t-xl shrink-0">
                <div>
                    <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide">{node.type}</p>
                    <h2 className="text-lg font-bold text-white break-all leading-tight mt-1">{node.label}</h2>
                </div>
                <button 
                    onClick={onClose} 
                    className="text-gray-400 hover:text-white hover:bg-gray-700 rounded-full p-1 transition-colors" 
                    title="Close"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                </button>
            </header>
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
                <section>
                    <h3 className="text-sm font-semibold text-gray-400 mb-3 border-b border-gray-700 pb-1">Resource Details</h3>
                    <dl className="space-y-3">
                        <DetailItem label="Full Resource Name" value={node.id} />
                        <DetailItem label="Created" value={node.data.createTime ? new Date(node.data.createTime).toLocaleString() : 'N/A'} />
                        <DetailItem label="Last Updated" value={node.data.updateTime ? new Date(node.data.updateTime).toLocaleString() : 'N/A'} />
                        {renderDetails()}
                    </dl>
                </section>
                <section>
                    <h3 className="text-sm font-semibold text-gray-400 mb-3 border-b border-gray-700 pb-1">Actions</h3>
                    <div className="space-y-2">
                        {consoleUrl && (
                            <a href={consoleUrl} target="_blank" rel="noopener noreferrer" className="w-full text-left px-3 py-2 text-sm font-medium text-blue-300 bg-gray-700/50 rounded-md hover:bg-blue-600 hover:text-white transition-colors flex items-center gap-3">
                               <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" /><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" /></svg>
                               View in Cloud Console
                            </a>
                        )}
                        {renderActions()}
                    </div>
                </section>
            </div>
        </div>
    );
};

export default DetailsPanel;
