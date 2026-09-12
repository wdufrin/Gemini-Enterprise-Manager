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
import { CloudRunService, Config, Page } from '../types';
import * as api from '../services/apiService';
import ProjectInput from '../components/ProjectInput';
import Spinner from '../components/Spinner';

interface A2aTesterPageProps {
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
  onNavigate?: (page: Page, context: any) => void;
  accessToken: string;
}

const CodeBlock: React.FC<{ content: string; onCopy: () => void; copyText: string; title: string; }> = ({ content, onCopy, copyText, title }) => (
    <div className="bg-gray-900 rounded-lg overflow-hidden">
        <div className="flex justify-between items-center p-2 bg-gray-900/50">
            <span className="text-sm font-semibold text-gray-300">{title}</span>
            <button
                onClick={onCopy}
                className="px-3 py-1 bg-gray-600 text-white text-xs font-semibold rounded-md hover:bg-gray-500"
            >
                {copyText}
            </button>
        </div>
        <pre className="p-4 text-xs text-gray-300 whitespace-pre-wrap overflow-x-auto">
            <code>{content}</code>
        </pre>
    </div>
);

const A2aTesterPage: React.FC<A2aTesterPageProps> = ({ projectNumber, setProjectNumber, onNavigate, accessToken }) => {
    // State for configuration
    const [cloudRunRegion, setCloudRunRegion] = useState('us-central1');
    const [services, setServices] = useState<CloudRunService[]>([]);
    const [isLoadingServices, setIsLoadingServices] = useState(false);
    const [serviceUrl, setServiceUrl] = useState('');
    
    // State for fetching agent card
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isCorsError, setIsCorsError] = useState(false);
    const [agentCard, setAgentCard] = useState<any | null>(null);
    const [copyStatus, setCopyStatus] = useState('');

    // State for invocation testing
    const [prompt, setPrompt] = useState('Hello!');
    const [isInvoking, setIsInvoking] = useState(false);
    const [invokeResponse, setInvokeResponse] = useState<any | null>(null);
    const [invokeError, setInvokeError] = useState<string | null>(null);
    const [invokeCopyStatus, setInvokeCopyStatus] = useState('');

    // Fetch Cloud Run services when project or region changes
    useEffect(() => {
        if (!projectNumber || !cloudRunRegion) {
            setServices([]);
            setServiceUrl('');
            return;
        }
        const fetchServices = async () => {
            setIsLoadingServices(true);
            setServices([]);
            setServiceUrl('');
            setError(null);
            setAgentCard(null);
            try {
                const res = await api.listCloudRunServices({ projectId: projectNumber } as Config, cloudRunRegion);
                const fetchedServices = res.services || [];
                setServices(fetchedServices);
                if (fetchedServices.length === 0) {
                    setError(`No Cloud Run services found in ${cloudRunRegion}.`);
                }
            } catch (err: any) {
                setError(err.message || 'Failed to fetch Cloud Run services.');
            } finally {
                setIsLoadingServices(false);
            }
        };
        fetchServices();
    }, [projectNumber, cloudRunRegion]);

    const handleFetchCard = async () => {
        if (!serviceUrl || !accessToken) {
            setError("Please select a service and ensure you are authenticated.");
            return;
        }

        setIsLoading(true);
        setError(null);
        setIsCorsError(false);
        setAgentCard(null);

        const cleanServiceUrl = serviceUrl.replace(/\/$/, '');

        try {
            const result = await api.fetchA2aAgentCard(cleanServiceUrl, accessToken);
            setAgentCard(result);
        } catch (err: any) {
            const message = err.message || "An unknown error occurred.";
            setError(`Error fetching agent card: ${message}`);
            if (message.includes("CORS") || message.includes("Failed to fetch") || message.includes("Network error")) {
                setIsCorsError(true);
            }
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleInvoke = async () => {
        if (!serviceUrl || !accessToken) {
            setInvokeError("Please select a service and ensure you are authenticated.");
            return;
        }
        if (!prompt.trim()) {
            setInvokeError("Please enter a prompt.");
            return;
        }

        setIsInvoking(true);
        setInvokeError(null);
        setInvokeResponse(null);
        setIsCorsError(false);

        const cleanServiceUrl = serviceUrl.replace(/\/$/, '');

        try {
            const result = await api.invokeA2aAgent(cleanServiceUrl, prompt, accessToken);
            setInvokeResponse(result);
        } catch (err: any) {
            const message = err.message || "An unknown error occurred.";
            setInvokeError(`Error invoking agent: ${message}`);
            if (message.includes("CORS") || message.includes("Failed to fetch") || message.includes("Network error")) {
                setIsCorsError(true);
            }
        } finally {
            setIsInvoking(false);
        }
    };
    
    const handleFixCors = () => {
        if (!onNavigate) return;
        const selectedService = services.find(s => s.uri === serviceUrl);
        if (selectedService) {
            onNavigate(Page.AGENT_BUILDER, { serviceToEdit: selectedService });
        }
    };

    const cliTestCommand = serviceUrl
        ? `curl -H "Authorization: Bearer $(gcloud auth print-identity-token)" \\
  ${serviceUrl.replace(/\/$/, '')}/.well-known/agent.json`
        : `# Select a service to see the test command`;

    const handleCopyCommand = () => {
        navigator.clipboard.writeText(cliTestCommand).then(() => {
            setCopyStatus('Copied!');
            setTimeout(() => setCopyStatus(''), 2000);
        });
    };
    
    // JSON-RPC 2.0 payload with A2A structure
    const jsonRpcPayload = JSON.stringify({
        jsonrpc: "2.0",
        method: "chat",
        params: {
            message: {
                role: "user",
                parts: [
                    { text: prompt }
                ]
            }
        },
        id: "1"
    }).replace(/"/g, '\\"');

    const cliInvokeCommand = serviceUrl
        ? `curl -X POST -H "Authorization: Bearer $(gcloud auth print-identity-token)" \\
  -H "Content-Type: application/json" \\
  -d "${jsonRpcPayload}" \\
  ${serviceUrl.replace(/\/$/, '')}/invoke`
        : `# Select a service to see the invoke command`;

    const handleCopyInvokeCommand = () => {
        navigator.clipboard.writeText(cliInvokeCommand).then(() => {
            setInvokeCopyStatus('Copied!');
            setTimeout(() => setInvokeCopyStatus(''), 2000);
        });
    };

    return (
        <div className="flex flex-col h-full space-y-6">
            <h1 className="text-2xl font-bold text-white">A2A Agent Tester</h1>
            <p className="text-gray-400 -mt-4">
                Test your deployed A2A Cloud Run functions directly. Verify discovery endpoints and invoke the agent with prompts.
            </p>

            {/* Configuration */}
            <div className="bg-gray-800 p-4 rounded-lg shadow-md space-y-4">
                <h2 className="text-lg font-semibold text-white">Configuration</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Project ID / Number</label>
                        <ProjectInput value={projectNumber} onChange={setProjectNumber} />
                    </div>
                     <div>
                        <label htmlFor="cloudRunRegion" className="block text-sm font-medium text-gray-400 mb-1">Cloud Run Region</label>
                        <select id="cloudRunRegion" value={cloudRunRegion} onChange={(e) => setCloudRunRegion(e.target.value)} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]">
                            <option value="us-central1">us-central1</option><option value="us-east1">us-east1</option><option value="us-east4">us-east4</option><option value="us-west1">us-west1</option><option value="europe-west1">europe-west1</option><option value="europe-west2">europe-west2</option><option value="europe-west4">europe-west4</option><option value="asia-east1">asia-east1</option><option value="asia-southeast1">asia-southeast1</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="serviceUrl" className="block text-sm font-medium text-gray-400 mb-1">Agent to Test</label>
                        <select id="serviceUrl" value={serviceUrl} onChange={(e) => setServiceUrl(e.target.value)} disabled={isLoadingServices} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px] disabled:bg-gray-700/50">
                            <option value="">{isLoadingServices ? 'Loading...' : '-- Select a Service --'}</option>
                            {services.map(s => <option key={s.name} value={s.uri}>{s.name.split('/').pop()}</option>)}
                        </select>
                    </div>
                </div>
            </div>
            
            {isCorsError && (
                <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4">
                    <h3 className="text-sm font-bold text-yellow-400 mb-2">⚠️ CORS Configuration Required</h3>
                    <p className="text-xs text-gray-300 mb-2">
                        The request failed because your Cloud Run service prevented the browser from accessing the response. 
                        This security feature (CORS) is enforced by browsers, which is why the CLI command works but this page fails.
                    </p>
                    <p className="text-xs text-gray-300 mb-2">
                        <strong>To fix this:</strong> You must re-deploy your Cloud Run function with code that explicitly allows cross-origin requests.
                    </p>
                    <ul className="list-disc list-inside text-xs text-gray-300 space-y-1 mb-3">
                        <li>Click the button below to open the Function Builder.</li>
                        <li>It will pre-load your service configuration.</li>
                        <li>The generated code will automatically include the necessary CORS headers.</li>
                        <li>Run the deployment script to update your service.</li>
                    </ul>
                    {onNavigate && (
                        <button
                            onClick={handleFixCors}
                            className="mt-2 px-4 py-2 bg-yellow-600 text-white text-sm font-bold rounded-md hover:bg-yellow-700 border border-yellow-500 shadow-sm transition-colors w-full md:w-auto"
                        >
                            Fix Service (Go to Builder)
                        </button>
                    )}
                </div>
            )}

            {/* Discovery Test */}
            <div className="space-y-4 border-t border-gray-700 pt-6">
                <h2 className="text-lg font-semibold text-white">Test 1: Discovery Endpoint</h2>
                <p className="text-sm text-gray-400">Fetches <code>/.well-known/agent.json</code> to verify the agent is discoverable.</p>
                <button
                    onClick={handleFetchCard}
                    disabled={isLoading || !serviceUrl || !accessToken}
                    className="w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed flex items-center justify-center"
                >
                    {isLoading ? (
                        <>
                            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                            Fetching...
                        </>
                    ) : 'Fetch Agent Card'}
                </button>

                <div className="bg-gray-800 shadow-md rounded-lg border border-gray-700 min-h-[150px] flex flex-col">
                    <div className="p-2 bg-gray-900/50 border-b border-gray-700">
                        <h3 className="text-md font-semibold text-gray-300">Discovery Response</h3>
                    </div>
                    <div className="flex-1 p-4">
                        {isLoading && <Spinner />}
                        {error && <p className="text-red-400 text-sm whitespace-pre-wrap">{error}</p>}
                        {agentCard && (
                            <pre className="text-xs text-gray-200 whitespace-pre-wrap">
                                <code>{JSON.stringify(agentCard, null, 2)}</code>
                            </pre>
                        )}
                        {!isLoading && !error && !agentCard && (
                            <p className="text-gray-500 text-sm text-center pt-8">Results will be displayed here.</p>
                        )}
                    </div>
                </div>
                <CodeBlock 
                    title="CLI Command (Discovery)" 
                    content={cliTestCommand} 
                    copyText={copyStatus || 'Copy'} 
                    onCopy={handleCopyCommand} 
                />
            </div>
            
            {/* Invocation Test */}
            <div className="space-y-4 border-t border-gray-700 pt-6 pb-6">
                <h2 className="text-lg font-semibold text-white">Test 2: Direct Invocation</h2>
                <p className="text-sm text-gray-400">Sends a POST request to <code>/invoke</code> to chat with the agent directly.</p>
                
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">User Prompt</label>
                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            value={prompt} 
                            onChange={(e) => setPrompt(e.target.value)} 
                            className="flex-1 bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white"
                            placeholder="Enter a message for the agent..."
                        />
                        <button
                            onClick={handleInvoke}
                            disabled={isInvoking || !serviceUrl || !accessToken}
                            className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed flex items-center justify-center w-32"
                        >
                            {isInvoking ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                                    Sending...
                                </>
                            ) : 'Send'}
                        </button>
                    </div>
                </div>

                <div className="bg-gray-800 shadow-md rounded-lg border border-gray-700 min-h-[150px] flex flex-col">
                    <div className="p-2 bg-gray-900/50 border-b border-gray-700">
                        <h3 className="text-md font-semibold text-gray-300">Invocation Response</h3>
                    </div>
                    <div className="flex-1 p-4">
                        {isInvoking && <Spinner />}
                        {invokeError && <p className="text-red-400 text-sm whitespace-pre-wrap">{invokeError}</p>}
                        {invokeResponse && (
                            <pre className="text-xs text-gray-200 whitespace-pre-wrap">
                                <code>{JSON.stringify(invokeResponse, null, 2)}</code>
                            </pre>
                        )}
                        {!isInvoking && !invokeError && !invokeResponse && (
                            <p className="text-gray-500 text-sm text-center pt-8">Response will appear here.</p>
                        )}
                    </div>
                </div>
                <CodeBlock 
                    title="CLI Command (Invoke JSON-RPC)" 
                    content={cliInvokeCommand} 
                    copyText={invokeCopyStatus || 'Copy'} 
                    onCopy={handleCopyInvokeCommand} 
                />
            </div>
        </div>
    );
};

export default A2aTesterPage;
