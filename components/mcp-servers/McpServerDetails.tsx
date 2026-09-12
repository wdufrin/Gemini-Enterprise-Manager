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


import React, { useState, useEffect } from 'react';
import { CloudRunService, Config, EnvVar } from '../../types';
import * as api from '../../services/apiService';
import Spinner from '../Spinner';

interface McpServerDetailsProps {
    service: CloudRunService;
    config: Config;
    onBack: () => void;
    title?: string;
}

const DetailItem: React.FC<{ label: string; value?: string | null; children?: React.ReactNode; isMono?: boolean; }> = ({ label, value, children, isMono = true }) => (
    <div className="py-2">
        <dt className="text-sm font-medium text-gray-400">{label}</dt>
        <dd className={`mt-1 text-sm text-white bg-gray-700 p-2 rounded ${isMono ? 'font-mono' : 'font-sans'}`}>
            {children || value || <span className="text-gray-500 italic">Not set</span>}
        </dd>
    </div>
);

const McpServerDetails: React.FC<McpServerDetailsProps> = ({ service, config, onBack, title }) => {
    const [fullService, setFullService] = useState<CloudRunService | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isJsonExpanded, setIsJsonExpanded] = useState(false);
    const [copySuccess, setCopySuccess] = useState<string | null>(null);

    useEffect(() => {
        const fetchDetails = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const details = await api.getCloudRunService(service.name, config);
                setFullService(details);
            } catch (err: any) {
                setError(err.message || 'Failed to fetch service details.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchDetails();
    }, [service.name, config]);
    
    // Helper to extract A2A info
    const getA2aInfo = (svc: CloudRunService) => {
        const env = svc.template?.containers?.[0]?.env || [];
        const get = (n: string) => env.find(e => e.name === n)?.value;
        return {
            displayName: get('AGENT_DISPLAY_NAME'),
            description: get('AGENT_DESCRIPTION'),
            org: get('PROVIDER_ORGANIZATION'),
            model: get('MODEL'),
            url: get('AGENT_URL')
        };
    };

    const handleCopyAgentCard = () => {
        if (!fullService) return;
        const info = getA2aInfo(fullService);
        if (!info.url) return;

        const card = {
            name: info.displayName || '',
            description: info.description || '',
            url: `${info.url.replace(/\/$/, '')}/invoke`,
            provider: {
                organization: info.org || '',
                url: info.url
            },
            protocolVersion: "0.3.0",
            capabilities: {
                streaming: false
            },
            defaultInputModes: ["text/plain"],
            defaultOutputModes: ["text/plain"],
            skills: [{
                description: "Chat with the agent.",
                examples: ["Hello, world!"],
                id: "chat",
                name: "Chat Skill",
                tags: ["chat"]
            }],
            version: "1.0.0"
        };
        
        navigator.clipboard.writeText(JSON.stringify(card, null, 2));
        setCopySuccess('Copied!');
        setTimeout(() => setCopySuccess(null), 2000);
    };

    const renderContent = () => {
        if (isLoading) return <Spinner />;
        if (error) return <p className="text-red-400 text-center mt-4">{error}</p>;
        if (!fullService) return null;

        const container = fullService.template?.containers?.[0];
        const a2aInfo = getA2aInfo(fullService);
        const isA2a = !!(a2aInfo.displayName || a2aInfo.url || a2aInfo.org);

        return (
            <>
                {isA2a && (
                    <div className="mt-6 border-t border-gray-700 pt-6">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <h3 className="text-lg font-semibold text-white">A2A Agent Configuration</h3>
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-900 text-teal-200 border border-teal-700">DETECTED</span>
                            </div>
                            <button
                                onClick={handleCopyAgentCard}
                                className="px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-md hover:bg-blue-700"
                                title="Copy the JSON Agent Card definition"
                            >
                                {copySuccess || 'Copy Agent Card'}
                            </button>
                        </div>
                        <div className="bg-teal-900/10 border border-teal-800 rounded-lg p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DetailItem label="Agent Display Name" value={a2aInfo.displayName} isMono={false} />
                            <DetailItem label="Model" value={a2aInfo.model} />
                            <div className="md:col-span-2">
                                <DetailItem label="Description" value={a2aInfo.description} isMono={false} />
                            </div>
                            <DetailItem label="Provider Organization" value={a2aInfo.org} isMono={false} />
                            <DetailItem label="Agent Discovery URL" value={a2aInfo.url} />
                        </div>
                    </div>
                )}

                <div className="mt-6 border-t border-gray-700 pt-6">
                    <h3 className="text-lg font-semibold text-white">Labels</h3>
                     <div className="mt-2 text-sm text-white font-mono bg-gray-700 p-2 rounded">
                        {fullService.labels && Object.keys(fullService.labels).length > 0 ? (
                            <ul className="space-y-1">
                                {Object.entries(fullService.labels).map(([key, value]) => (
                                    <li key={key}><span className="text-gray-400">{key}:</span> {value}</li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-gray-500 italic">No labels set</p>
                        )}
                    </div>
                </div>

                <div className="mt-6 border-t border-gray-700 pt-6">
                    <h3 className="text-lg font-semibold text-white">Container Configuration</h3>
                    {container ? (
                        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                            <DetailItem label="Container Image URI" value={container.image} />
                            <DetailItem label="Service Account" value={fullService.template?.serviceAccount} />
                            <div className="md:col-span-2">
                                <DetailItem label="Environment Variables">
                                    {container.env && container.env.length > 0 ? (
                                        <ul className="space-y-1 max-h-48 overflow-y-auto">
                                            {container.env.map((env: EnvVar) => (
                                                <li key={env.name} className="flex items-start">
                                                    <span className="text-gray-400 mr-2 w-1/3 break-all">{env.name}:</span>
                                                    <span className="w-2/3 break-all">
                                                        {env.value ? `"${env.value}"` : <span className="text-indigo-400 italic">from Secret</span>}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-gray-500 italic">No environment variables set</p>
                                    )}
                                </DetailItem>
                            </div>
                        </dl>
                    ) : (
                        <p className="text-gray-400 mt-2">No container configuration found.</p>
                    )}
                </div>

                <div className="mt-6 border-t border-gray-700 pt-6">
                    <h3 className="text-lg font-semibold text-white mb-2">
                        <button onClick={() => setIsJsonExpanded(!isJsonExpanded)} className="flex items-center w-full text-left">
                           Raw Service JSON
                           <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ml-2 transition-transform ${isJsonExpanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                               <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                           </svg>
                        </button>
                    </h3>
                    {isJsonExpanded && (
                        <pre className="mt-2 bg-gray-900 text-white p-4 rounded-md text-xs overflow-x-auto max-h-96">
                            <code>{JSON.stringify(fullService, null, 2)}</code>
                        </pre>
                    )}
                </div>
            </>
        );
    };

    return (
        <div className="bg-gray-800 shadow-xl rounded-lg p-6">
            <div className="flex justify-between items-start">
                <div>
                    {title && (
                        <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-900 text-blue-200 border border-blue-700 uppercase tracking-wide mr-2">
                            {title}
                        </span>
                    )}
                    <h2 className="text-2xl font-bold text-white inline-block">
                       {service.name.split('/').pop() || ''}
                    </h2>
                </div>
                <button onClick={onBack} className="text-gray-400 hover:text-white">&larr; Back to list</button>
            </div>

            <dl className="mt-6 border-t border-gray-700 pt-6 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
                <DetailItem label="Full Resource Name" value={service.name} />
                <DetailItem label="Service URL" isMono={false}>
                    <a href={service.uri} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline break-all">{service.uri}</a>
                </DetailItem>
                <DetailItem label="Region" value={service.location} />
                <DetailItem label="Last Updated" value={new Date(service.updateTime).toLocaleString()} isMono={false}/>
            </dl>
            
            {renderContent()}
        </div>
    );
};

export default McpServerDetails;
