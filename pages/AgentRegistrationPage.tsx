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


import React, { useState, useEffect, useMemo } from 'react';
import { Config, AppEngine, CloudRunService, Agent, Authorization } from '../types';
import * as api from '../services/apiService';
import ProjectInput from '../components/ProjectInput';

interface AgentRegistrationPageProps {
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
}

// Helper component for code blocks
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


const AgentRegistrationPage: React.FC<AgentRegistrationPageProps> = ({ projectNumber, setProjectNumber }) => {
    // State for configuration
    const [config, setConfig] = useState({
        location: 'global',
        collectionId: 'default_collection',
        engineId: '',
        cloudRunRegion: 'us-central1',
    });
    const [engines, setEngines] = useState<AppEngine[]>([]);
    const [isLoadingEngines, setIsLoadingEngines] = useState(false);
    
    // State for Cloud Run services
    const [cloudRunServices, setCloudRunServices] = useState<CloudRunService[]>([]);
    const [isLoadingServices, setIsLoadingServices] = useState(false);
    const [serviceLoadError, setServiceLoadError] = useState<string|null>(null);

    // State for agent registration form
    const [agentDetails, setAgentDetails] = useState({
        agentName: 'my-a2a-agent',
        agentDisplayName: 'My A2A Agent',
        agentDescription: 'A helpful agent that can perform a specific task.',
        providerOrganization: 'My Organization',
        agentUrl: '',

        iconUri: 'https://www.gstatic.com/lamda/images/gemini/google_bard_logo_32px_clr_r2.svg',
        authIds: '', // comma separated string (DEPRECATED - kept for state but unused in UI if we switch)
    });

    const [authorizations, setAuthorizations] = useState<Authorization[]>([]);
    const [isLoadingAuths, setIsLoadingAuths] = useState(false);
    // Dynamic list of selected authorization IDs (full resource names)
    const [authRows, setAuthRows] = useState<string[]>([]);

    // AI Rewrite State
    const [isRewriting, setIsRewriting] = useState(false);
    const [rewriteError, setRewriteError] = useState<string | null>(null);
    
    // State for IAM command generation (now auto-populated)
    const [iamServiceDetails, setIamServiceDetails] = useState({
        serviceName: '',
        region: 'us-central1'
    });
    
    // State for registration process
    const [isRegistering, setIsRegistering] = useState(false);
    const [registrationError, setRegistrationError] = useState<string | null>(null);
    const [registrationSuccess, setRegistrationSuccess] = useState<string | null>(null);

    // State for generated content
    const [iamCommand, setIamCommand] = useState('');
    const [copyStatus, setCopyStatus] = useState<{ [key: string]: string }>({});

    const apiConfig: Omit<Config, 'accessToken'> = useMemo(() => ({
      projectId: projectNumber,
      appLocation: config.location,
      collectionId: config.collectionId,
      appId: config.engineId, // Map engineId to appId for apiService
      assistantId: 'default_assistant'
    }), [projectNumber, config.location, config.collectionId, config.engineId]);
    
    // --- Effects for fetching data and generating code ---
    
    // Fetch engines when config changes
    useEffect(() => {
        if (!projectNumber || !config.location) {
            setEngines([]);
            return;
        }
        const fetchEngines = async () => {
            setIsLoadingEngines(true);
            setEngines([]);
            try {
                const listConfig = { ...apiConfig, appId: '', assistantId: '' }; // Use a broader config for listing
                const res = await api.listResources('engines', listConfig);
                setEngines(res.engines || []);
            } catch (err) {
                console.error("Failed to fetch engines", err);
            } finally {
                setIsLoadingEngines(false);
            }
        };
        fetchEngines();
    }, [projectNumber, config.location, apiConfig]);
    
    // Fetch Cloud Run services when project or region changes
    useEffect(() => {
        if (!projectNumber || !config.cloudRunRegion) {
            setCloudRunServices([]);
            return;
        }
        const fetchServices = async () => {
            setIsLoadingServices(true);
            setCloudRunServices([]);
            setServiceLoadError(null);
            try {
                const res = await api.listCloudRunServices({ projectId: projectNumber } as Config, config.cloudRunRegion);
                setCloudRunServices(res.services || []);
                if (!res.services || res.services.length === 0) {
                    setServiceLoadError(`No Cloud Run services found in ${config.cloudRunRegion}.`);
                }
            } catch (err: any) {
                setServiceLoadError(err.message || 'Failed to fetch Cloud Run services.');
            } finally {
                setIsLoadingServices(false);
            }
        };
        fetchServices();
    }, [projectNumber, config.cloudRunRegion]);

    // Fetch Authorizations
    useEffect(() => {
        if (!projectNumber || !config.location) {
            setAuthorizations([]);
            return;
        }
        const fetchAuths = async () => {
            setIsLoadingAuths(true);
            try {
                const res = await api.listAuthorizations(apiConfig);
                setAuthorizations(res.authorizations || []);
            } catch (err) {
                console.error("Failed to fetch authorizations", err);
            } finally {
                setIsLoadingAuths(false);
            }
        };
        fetchAuths();
    }, [projectNumber, config.location, apiConfig]);


    // Generate IAM command
    useEffect(() => {
        if (!projectNumber || !iamServiceDetails.serviceName) {
            setIamCommand('# Select a Cloud Run service to generate the command.');
            return;
        }
        const numericProject = /^\d+$/.test(projectNumber) ? projectNumber : '<NUMERIC_PROJECT_NUMBER>';
        const principal = `serviceAccount:service-${numericProject}@gcp-sa-discoveryengine.iam.gserviceaccount.com`;
        const command = `gcloud run services add-iam-policy-binding "${iamServiceDetails.serviceName}" \\
  --member="${principal}" \\
  --role="roles/run.invoker" \\
  --region="${iamServiceDetails.region}" \\
  --project="${projectNumber}"`;
        setIamCommand(command);
    }, [projectNumber, iamServiceDetails]);

    // --- Handlers ---
    
    const handleConfigChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const { name, value } = e.target;
        // Reset dependent fields when a parent config changes
        if (name === 'location') {
            setConfig(prev => ({ ...prev, engineId: '', [name]: value }));
        } else {
            setConfig(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleDetailsChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        if (name === 'agentName') {
            const sanitized = value.toLowerCase().replace(/[^a-z0-9-]/g, '').substring(0, 63);
            setAgentDetails(prev => ({ ...prev, [name]: sanitized }));
        } else {
            setAgentDetails(prev => ({ ...prev, [name]: value }));
        }
    };
    
    const handleServiceSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const serviceUri = e.target.value;
        const selectedService = cloudRunServices.find(s => s.uri === serviceUri);

        if (selectedService) {
            const serviceName = selectedService.name.split('/').pop() || '';
            const displayName = serviceName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

            setAgentDetails(prev => ({
                ...prev,
                agentUrl: selectedService.uri,
                agentName: serviceName, // auto-populate
                agentDisplayName: displayName // auto-populate
            }));

            // auto-populate IAM section too
            setIamServiceDetails({
                serviceName: serviceName,
                region: selectedService.location
            });
        } else {
            // Reset if they select the placeholder
            setAgentDetails(prev => ({ ...prev, agentUrl: '', agentName: 'my-a2a-agent', agentDisplayName: 'My A2A Agent' }));
            setIamServiceDetails({ serviceName: '', region: 'us-central1' });
        }
    };
    
    const handleRewrite = async () => {
        if (!agentDetails.agentDescription.trim()) {
            setRewriteError('Please enter some description to rewrite.');
            return;
        }
        setIsRewriting(true);
        setRewriteError(null);
        
        const prompt = `Rewrite the following agent description to be clear, concise, and user-friendly for a tool in an agentic system. Do not include markdown or multiple options. Just the single paragraph description.
        
        Original Description: "${agentDetails.agentDescription}"
        
        Rewritten Description:`;

        try {
            const text = await api.generateVertexContent(apiConfig, prompt, 'gemini-2.5-flash');
            const rewrittenText = text.trim().replace(/^["']|["']$/g, '').replace(/^```\w*\n?|\n?```$/g, '').trim();
            setAgentDetails(prev => ({ ...prev, agentDescription: rewrittenText }));

        } catch (err: any) {
            setRewriteError(`AI rewrite failed: ${err.message}`);
        } finally {
            setIsRewriting(false);
        }
    };



const handleAddAuthRow = () => {
    setAuthRows(prev => [...prev, '']);
};

const handleRemoveAuthRow = (index: number) => {
    setAuthRows(prev => prev.filter((_, i) => i !== index));
};

const handleAuthChange = (index: number, value: string) => {
    setAuthRows(prev => {
        const newRows = [...prev];
        newRows[index] = value;
        return newRows;
    });
};

    const handleRegisterAgent = async () => {
        setIsRegistering(true);
        setRegistrationError(null);
        setRegistrationSuccess(null);

        try {
            if (!config.engineId) throw new Error("Target Engine ID must be selected.");
            if (!agentDetails.agentName) throw new Error("Agent Name (ID) cannot be empty.");
            if (!agentDetails.agentUrl) throw new Error("Agent URL must be selected from a deployed service.");

            // Build the payloads
            const cardObject = {
                protocolVersion: "0.3.0",
                // IMPORTANT: The URL must point to the /invoke endpoint for POST requests.
                // We append this here to ensure the registered agent is configured correctly,
                // even if the deployed agent.json itself is slightly off.
                url: `${agentDetails.agentUrl.replace(/\/$/, '')}/invoke`,
                provider: {
                    organization: agentDetails.providerOrganization,
                    url: agentDetails.agentUrl,
                },
                name: agentDetails.agentDisplayName,
                description: agentDetails.agentDescription,
                capabilities: {},
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
            const cardString = JSON.stringify(cardObject);

            const apiPayload: any = {
                displayName: agentDetails.agentDisplayName,
                description: agentDetails.agentDescription,
                icon: { uri: agentDetails.iconUri },
                a2aAgentDefinition: { jsonAgentCard: cardString }
            };

            // Use selected auths from the dynamic list
            const validAuthRows = authRows.filter(id => id.trim());

            if (validAuthRows.length > 0) {
                apiPayload.authorizationConfig = {
                    toolAuthorizations: validAuthRows
                };
            } else if (agentDetails.authIds.trim()) {
                // Fallback to manual text input if populated (legacy support)
                const authIdsList = agentDetails.authIds.split(',').map(id => id.trim()).filter(id => id);
                if (authIdsList.length > 0) {
                    apiPayload.authorizationConfig = {
                        toolAuthorizations: authIdsList
                    };
                }
            }

            const newAgent = await api.registerA2aAgent(apiConfig, agentDetails.agentName, apiPayload);
            
            setRegistrationSuccess(`Agent "${newAgent.displayName}" registered successfully! Please proceed to the final step to grant invoker permissions.`);

        } catch (err: any) {
            setRegistrationError(err.message || 'An unknown error occurred during registration.');
        } finally {
            setIsRegistering(false);
        }
    };


    const handleCopy = (key: string, content: string) => {
        navigator.clipboard.writeText(content).then(() => {
            setCopyStatus(prev => ({...prev, [key]: 'Copied!' }));
            setTimeout(() => setCopyStatus(prev => ({...prev, [key]: '' })), 2000);
        });
    };
    
    const isRegisterDisabled = isRegistering || !config.engineId || !agentDetails.agentName || !agentDetails.agentUrl;

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-white">Agent Registration</h1>
            <p className="text-gray-400 -mt-4">
                Register your deployed A2A Cloud Run function with a Gemini Enterprise Engine to make it discoverable as a tool.
            </p>
            
            {/* Step 1: Configuration */}
            <div className="bg-gray-800 p-4 rounded-lg shadow-md">
                <h2 className="text-lg font-semibold text-white mb-3">Step 1: Configure Target</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Project ID / Number</label>
                        <ProjectInput value={projectNumber} onChange={setProjectNumber} />
                    </div>
                    <div>
                        <label htmlFor="location" className="block text-sm font-medium text-gray-400 mb-1">Engine Location</label>
                        <select id="location" name="location" value={config.location} onChange={handleConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[42px]">
                            <option value="global">global</option><option value="us">us</option><option value="eu">eu</option>
                        </select>
                    </div>
                     <div>
                        <label htmlFor="cloudRunRegion" className="block text-sm font-medium text-gray-400 mb-1">Cloud Run Service Region</label>
                        <select id="cloudRunRegion" name="cloudRunRegion" value={config.cloudRunRegion} onChange={handleConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]">
                            <option value="us-central1">us-central1</option><option value="us-east1">us-east1</option><option value="us-east4">us-east4</option><option value="us-west1">us-west1</option><option value="europe-west1">europe-west1</option><option value="europe-west2">europe-west2</option><option value="europe-west4">europe-west4</option><option value="asia-east1">asia-east1</option><option value="asia-southeast1">asia-southeast1</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="engineId" className="block text-sm font-medium text-gray-400 mb-1">Target Gemini Enterprise ID</label>
                        <select id="engineId" name="engineId" value={config.engineId} onChange={handleConfigChange} disabled={isLoadingEngines} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px] disabled:bg-gray-700/50">
                            <option value="">{isLoadingEngines ? 'Loading...' : '-- Select Target Engine --'}</option>
                            {engines.map(e => <option key={e.name} value={e.name.split('/').pop()!}>{e.displayName}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* Step 2: Allowlisting */}
            <div className="bg-gray-800 p-4 rounded-lg shadow-md">
                <h2 className="text-lg font-semibold text-white mb-3">Prerequisite: Allowlist Your Project</h2>
                <p className="text-sm text-gray-400 mb-3">Before registering an A2A agent, your project must be allowlisted. Please file a request with the following details.</p>
                <div className="space-y-3">
                     <CodeBlock
                        title="Allowlist Request Title"
                        content={`Gemini Enterprise A2A integration allowlist request: <customer name> / Internal`}
                        onCopy={() => handleCopy('allowlistTitle', `Gemini Enterprise A2A integration allowlist request: <customer name> / Internal`)}
                        copyText={copyStatus.allowlistTitle || 'Copy'}
                    />
                </div>
            </div>
            
            {/* Step 3: Agent Details */}
            <div className="bg-gray-800 p-4 rounded-lg shadow-md">
                <h2 className="text-lg font-semibold text-white mb-3">Step 2: Select Deployed Function & Review Details</h2>
                {rewriteError && <p className="text-red-400 text-sm mb-3">{rewriteError}</p>}
                <div className="space-y-4">
                    <div>
                        <label htmlFor="agentUrl" className="block text-sm font-medium text-gray-400 mb-1">Agent URL</label>
                        <select id="agentUrl" name="agentUrl" value={agentDetails.agentUrl} onChange={handleServiceSelect} disabled={isLoadingServices} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px] disabled:bg-gray-700/50">
                            <option value="">{isLoadingServices ? 'Loading...' : '-- Select a Deployed Service --'}</option>
                            {cloudRunServices.map(s => <option key={s.name} value={s.uri}>{s.name.split('/').pop()}</option>)}
                        </select>
                        {serviceLoadError && <p className="text-xs text-red-400 mt-1">{serviceLoadError}</p>}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="agentName" className="block text-sm font-medium text-gray-400 mb-1">Agent Name (ID)</label>
                            <input id="agentName" name="agentName" type="text" value={agentDetails.agentName} onChange={handleDetailsChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full" />
                        </div>
                        <div>
                            <label htmlFor="agentDisplayName" className="block text-sm font-medium text-gray-400 mb-1">Agent Display Name</label>
                            <input id="agentDisplayName" name="agentDisplayName" type="text" value={agentDetails.agentDisplayName} onChange={handleDetailsChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Authorizations (Optional)</label>

                        <div className="space-y-2">
                            {authRows.map((authId, index) => (
                                <div key={index} className="flex gap-2 items-center">
                                    <select
                                        value={authId}
                                        onChange={(e) => handleAuthChange(index, e.target.value)}
                                        className="flex-1 bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200"
                                    >
                                        <option value="">-- Select Authorization --</option>
                                        {authorizations.map(auth => (
                                            <option key={auth.name} value={auth.name}>
                                                {auth.displayName || auth.name.split('/').pop()}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveAuthRow(index)}
                                        className="p-2 text-gray-400 hover:text-white bg-gray-600 hover:bg-red-500 rounded-md transition-colors"
                                        title="Remove Authorization"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="flex gap-2 items-center mt-2">
                            <button
                                type="button"
                                onClick={handleAddAuthRow}
                                className="text-sm font-semibold text-blue-400 hover:text-blue-300 disabled:text-gray-500 disabled:cursor-not-allowed"
                            >
                                + Add Authorization
                            </button>
                            {isLoadingAuths && <span className="text-gray-400 text-xs italic ml-2">Loading authorizations...</span>}
                        </div>

                        {/* Advanced Manual Entry (Hidden helper for confirming state or fallback) */}
                        <div className="mt-2 text-xs text-gray-500">
                            <details>
                                <summary className="cursor-pointer hover:text-gray-300">Advanced: Manual ID Entry (Legacy)</summary>
                                <input
                                    id="authIds"
                                    name="authIds"
                                    type="text"
                                    value={agentDetails.authIds}
                                    onChange={handleDetailsChange}
                                    placeholder="Manually enter IDs (comma separated)"
                                    className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full font-mono placeholder-gray-500 mt-1"
                                />
                            </details>
                        </div>
                    </div>
                     <div>
                        <div className="flex justify-between items-center mb-1">
                            <label htmlFor="agentDescription" className="block text-sm font-medium text-gray-400">Agent Description</label>
                            <button
                                type="button"
                                onClick={handleRewrite}
                                disabled={isRewriting}
                                className="p-1 text-gray-400 bg-gray-700 hover:bg-indigo-600 hover:text-white rounded-md transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
                                title="Rewrite description with AI"
                            >
                                {isRewriting ? (
                                    <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-white"></div>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                                        <path d="M12.736 3.97a6 6 0 014.243 4.243l2.022-2.022a1 1 0 10-1.414-1.414L15.56 6.8A6.002 6.002 0 0112.736 3.97zM3.97 12.736a6 6 0 01-1.243-5.222L4.75 9.536a1 1 0 001.414-1.414L4.142 6.1A6.002 6.002 0 013.97 12.736z" />
                                    </svg>
                                )}
                            </button>
                        </div>
                        <textarea id="agentDescription" name="agentDescription" value={agentDetails.agentDescription} onChange={handleDetailsChange} rows={3} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full" />
                    </div>
                </div>
            </div>

            {/* Step 4: Registration & IAM */}
            <div className="bg-gray-800 p-4 rounded-lg shadow-md">
                <h2 className="text-lg font-semibold text-white mb-3">Step 3: Register Agent & Grant Permissions</h2>
                <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-1">
                        <h3 className="font-semibold text-gray-200 mb-2">Register via UI</h3>
                        <p className="text-sm text-gray-400 mb-4">Click the button below to automatically register your agent using your current access token.</p>
                         <button
                            onClick={handleRegisterAgent}
                            disabled={isRegisterDisabled}
                            className="w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed flex items-center justify-center"
                        >
                            {isRegistering ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                                    Registering...
                                </>
                            ) : 'Register Agent'}
                        </button>
                        {registrationSuccess && <p className="mt-3 text-sm text-green-400">{registrationSuccess}</p>}
                        {registrationError && <p className="mt-3 text-sm text-red-400">{registrationError}</p>}
                    </div>
                    <div className="flex-1">
                         <h3 className="font-semibold text-gray-200 mb-2">Final Step: Grant Permissions</h3>
                         <p className="text-sm text-gray-400 mb-4">After successful registration, run the command below from your terminal to allow Gemini Enterprise to securely call your new agent.</p>
                         <CodeBlock
                            title="gcloud IAM Command"
                            content={iamCommand}
                            onCopy={() => handleCopy('iam', iamCommand)}
                            copyText={copyStatus.iam || 'Copy'}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AgentRegistrationPage;
