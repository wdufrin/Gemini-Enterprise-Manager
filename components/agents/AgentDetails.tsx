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


import React, { useState } from 'react';
import { Agent, Config, DataStore } from '../../types';
import * as api from '../../services/apiService';
import Spinner from '../Spinner';
import SetIamPolicyModal from './SetIamPolicyModal';

interface AgentDetailsProps {
    agent: Agent;
    config: Config;
    onBack: () => void;
    onEdit: () => void;
    onDeleteSuccess: () => void;
    onToggleStatus: (agent: Agent) => void;
    togglingAgentId: string | null;
    error: string | null;
}

const DetailItem: React.FC<{ label: string; value: string | undefined | null }> = ({ label, value }) => (
    <div className="py-2">
        <dt className="text-sm font-medium text-gray-400">{label}</dt>
        <dd className="mt-1 text-sm text-white font-mono bg-gray-700 p-2 rounded">{value || 'Not set'}</dd>
    </div>
);

const AgentDetails: React.FC<AgentDetailsProps> = ({ agent, config, onBack, onEdit, onDeleteSuccess, onToggleStatus, togglingAgentId, error: pageError }) => {
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [agentViewData, setAgentViewData] = useState<any | null>(null);
    const [isFetchingView, setIsFetchingView] = useState(false);
    const [viewError, setViewError] = useState<string | null>(null);
    const [iamPolicy, setIamPolicy] = useState<any | null>(null);
    const [isFetchingPolicy, setIsFetchingPolicy] = useState(false);
    const [policyError, setPolicyError] = useState<string | null>(null);
    const [isSetPolicyModalOpen, setIsSetPolicyModalOpen] = useState(false);
    const [policySuccess, setPolicySuccess] = useState<string | null>(null);
    
    // Sharing state
    const [isSharing, setIsSharing] = useState(false);
    const [shareError, setShareError] = useState<string | null>(null);

    // State for accessible data stores
    const [accessibleDataStores, setAccessibleDataStores] = useState<DataStore[] | null>(null);
    const [isFetchingDataStores, setIsFetchingDataStores] = useState(false);
    const [dataStoresError, setDataStoresError] = useState<string | null>(null);

    // State for copying agent card
    const [copyCardSuccess, setCopyCardSuccess] = useState<string | null>(null);

    // State for low-code model editing
    const [fullAgent, setFullAgent] = useState<Agent | null>(null);
    const [selectedModel, setSelectedModel] = useState<string>('');
    const [isSavingModel, setIsSavingModel] = useState(false);
    const [saveModelError, setSaveModelError] = useState<string | null>(null);

    const agentId = agent.name.split('/').pop() || '';

    React.useEffect(() => {
        const fetchFullAgent = async () => {
            try {
                const data = await api.getAgent(agent.name, config);
                setFullAgent(data);
                
                // Extract model
                if (data.lowCodeAgentDefinition?.nodes?.[0]?.llmAgentNode?.model) {
                    setSelectedModel(data.lowCodeAgentDefinition.nodes[0].llmAgentNode.model);
                } else if (data.workflowAgentDefinition?.agentFlow?.nodes) {
                     const agentNode = data.workflowAgentDefinition.agentFlow.nodes.find((n: any) => n.agentNode?.model);
                     if (agentNode?.agentNode?.model) {
                         setSelectedModel(agentNode.agentNode.model);
                     }
                }
            } catch (err) {
                console.error("Failed to fetch full agent details", err);
            }
        };
        fetchFullAgent();
    }, [agent.name, config]);

    const handleSaveModel = async () => {
        if (!fullAgent || !selectedModel) return;
        setIsSavingModel(true);
        setSaveModelError(null);
        try {
            const updatedAgent = { ...fullAgent };
            const payload: any = {};
            
            if (updatedAgent.lowCodeAgentDefinition?.nodes?.[0]?.llmAgentNode) {
                updatedAgent.lowCodeAgentDefinition.nodes[0].llmAgentNode.model = selectedModel;
                if (updatedAgent.lowCodeAgentDefinition.deployedNodes?.[0]?.llmAgentNode) {
                    updatedAgent.lowCodeAgentDefinition.deployedNodes[0].llmAgentNode.model = selectedModel;
                }
                payload.lowCodeAgentDefinition = updatedAgent.lowCodeAgentDefinition;
            } else if (updatedAgent.workflowAgentDefinition?.agentFlow?.nodes) {
                const agentNodeIndex = updatedAgent.workflowAgentDefinition.agentFlow.nodes.findIndex((n: any) => n.agentNode?.model);
                if (agentNodeIndex !== -1) {
                    updatedAgent.workflowAgentDefinition.agentFlow.nodes[agentNodeIndex].agentNode.model = selectedModel;
                }
                payload.workflowAgentDefinition = updatedAgent.workflowAgentDefinition;
            }
            
            await api.updateAgent(agent, payload, config);
            setFullAgent(updatedAgent);
            alert("Model updated successfully!");
        } catch (err: any) {
            setSaveModelError(err.message || 'Failed to save model.');
        } finally {
            setIsSavingModel(false);
        }
    };
    const isToggling = togglingAgentId === agentId;
    const statusColorClass = agent.state === 'ENABLED' ? 'bg-green-500' : agent.state === 'DISABLED' ? 'bg-red-500' : 'bg-yellow-500';

    const handleDelete = async () => {
        setIsDeleting(true);
        setDeleteError(null);
        try {
            await api.deleteResource(agent.name, config);
            onDeleteSuccess();
        } catch (err: any) {
            setDeleteError(err.message || 'Failed to delete agent.');
        } finally {
            setIsDeleting(false);
        }
    };
    
    const handleShare = async () => {
        setIsSharing(true);
        setShareError(null);
        try {
            await api.shareAgent(agent.name, config);
            // Refresh the page data by calling the back callback which usually triggers a list refresh or similar
            // In a more complex app we might update the local agent state or call a refresh prop.
            // For now, let's just go back to force a refresh of the list where this agent was selected.
            onBack();
        } catch (err: any) {
            setShareError(err.message || 'Failed to share agent.');
        } finally {
            setIsSharing(false);
        }
    };

    const handleFetchAgentView = async () => {
        setIsFetchingView(true);
        setViewError(null);
        setAgentViewData(null);
        try {
            const viewData = await api.getAgentView(agent.name, config);
            setAgentViewData(viewData);
        } catch (err: any) {
            setViewError(err.message || 'Failed to fetch agent view.');
        } finally {
            setIsFetchingView(false);
        }
    };

    const handleFetchIamPolicy = async () => {
        setIsFetchingPolicy(true);
        setPolicyError(null);
        setPolicySuccess(null);
        setIamPolicy(null);
        try {
            const policyData = await api.getAgentIamPolicy(agent.name, config);
            setIamPolicy(policyData);
        } catch (err: any) {
            setPolicyError(err.message || 'Failed to fetch IAM policy.');
        } finally {
            setIsFetchingPolicy(false);
        }
    };

    const handleSetPolicySuccess = (updatedPolicy: any) => {
        setIamPolicy(updatedPolicy);
        setIsSetPolicyModalOpen(false);
        setPolicySuccess("IAM Policy updated successfully.");
        setTimeout(() => setPolicySuccess(null), 5000);
    };

    const handleFetchDataStores = async () => {
        setIsFetchingDataStores(true);
        setDataStoresError(null);
        setAccessibleDataStores(null);
        try {
            const viewData = await api.getAgentView(agent.name, config).catch(() => null);

            const findDataStoreIds = (obj: any): string[] => {
                let ids: string[] = [];
                if (!obj || typeof obj !== 'object') return ids;

                for (const key in obj) {
                    if (Object.prototype.hasOwnProperty.call(obj, key)) {
                        const value = obj[key];
                        if (typeof value === 'string' && key.toLowerCase().includes('datastore') && value.startsWith('projects/') && value.includes('/dataStores/')) {
                            ids.push(value);
                        } else if (typeof value === 'object') {
                            ids = ids.concat(findDataStoreIds(value));
                        }
                    }
                }
                return ids;
            };

            const dataStoreIds = [...new Set(findDataStoreIds(viewData))];

            if (dataStoreIds.length === 0) {
                setAccessibleDataStores([]);
                return;
            }

            const dataStorePromises = dataStoreIds.map(id => api.getDataStore(id, config));
            const dataStoresResults = await Promise.all(dataStorePromises);
            setAccessibleDataStores(dataStoresResults);

        } catch (err: any) {
            setDataStoresError(err.message || 'Failed to fetch accessible data stores.');
        } finally {
            setIsFetchingDataStores(false);
        }
    };

    const handleCopyAgentCard = () => {
        if (agent.a2aAgentDefinition?.jsonAgentCard) {
            navigator.clipboard.writeText(agent.a2aAgentDefinition.jsonAgentCard);
            setCopyCardSuccess('Copied!');
            setTimeout(() => setCopyCardSuccess(null), 2000);
        }
    };


    const reasoningEngine = agent.adkAgentDefinition?.provisionedReasoningEngine?.reasoningEngine;
    const toolDescription = agent.adkAgentDefinition?.toolSettings?.toolDescription;
    
    let statusElement = null;
    let isPrivate = false;

    if (agent.state === 'ENABLED' || agent.state === 'DISABLED') {
        const isEnabled = agent.state === 'ENABLED';
        const statusProps = {
            text: isEnabled ? 'Enabled' : 'Disabled',
            colorClasses: isEnabled ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-red-500 text-white hover:bg-red-600',
        };
        statusElement = (
            <div className="py-2">
                <dt className="text-sm font-medium text-gray-400">Status</dt>
                <dd className="mt-1 text-sm">
                    {isToggling ? (
                         <div className="flex items-center space-x-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-gray-400"></div>
                            <span className="text-xs text-gray-400">Updating...</span>
                        </div>
                    ) : (
                         <button
                            onClick={() => onToggleStatus(agent)}
                            className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${statusProps.colorClasses}`}
                            disabled={isToggling}
                        >
                            {statusProps.text}
                        </button>
                    )}
                </dd>
            </div>
        );
    } else {
        isPrivate = true;
        statusElement = (
            <div className="py-2">
                <dt className="text-sm font-medium text-gray-400">Status</dt>
                <dd className="mt-1 text-sm">
                     <span className="px-3 py-1 text-xs font-semibold rounded-full bg-yellow-500 text-black">Private</span>
                </dd>
            </div>
        );
    }

    return (
        <div className="bg-gray-800 shadow-xl rounded-lg p-6">
            <div className="flex justify-between items-start">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center">
                        <span className={`h-3 w-3 rounded-full mr-3 shrink-0 ${statusColorClass}`}></span>
                        {agent.icon?.uri && <img src={agent.icon.uri} alt="icon" className="h-8 w-8 rounded-full mr-3" />}
                        {agent.displayName}
                    </h2>
                    <p className="text-gray-400 mt-1">{agent.description}</p>
                </div>
                <button onClick={onBack} className="text-gray-400 hover:text-white">&larr; Back to list</button>
            </div>

            <dl className="mt-6 border-t border-gray-700 pt-6 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
                <DetailItem label="Full Resource Name" value={agent.name} />
                <DetailItem label="Agent ID" value={agentId} />
                {statusElement}
                <div /> 
                <DetailItem label="Created On" value={agent.createTime ? new Date(agent.createTime).toLocaleString() : undefined} />
                <DetailItem label="Last Modified" value={agent.updateTime ? new Date(agent.updateTime).toLocaleString() : undefined} />
                {reasoningEngine && <DetailItem label="Agent Engine" value={reasoningEngine} />}
                {toolDescription && <DetailItem label="Tool Description" value={toolDescription} />}
                <DetailItem label="Authorizations" value={agent.authorizationConfig?.toolAuthorizations?.join(', ') || agent.authorizations?.join(', ')} />
            </dl>
            
            {agent.starterPrompts && agent.starterPrompts.length > 0 && (
                <div className="mt-6 border-t border-gray-700 pt-6">
                    <h3 className="text-lg font-semibold text-white">Starter Prompts</h3>
                    <ul className="mt-2 space-y-2">
                        {agent.starterPrompts.map((prompt, index) => (
                            <li key={index} className="text-sm text-gray-200 bg-gray-700 p-3 rounded-md font-mono">
                                {prompt.text}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {pageError && <p className="text-red-400 mt-4">{pageError}</p>}
            {deleteError && <p className="text-red-400 mt-4">{deleteError}</p>}
            {shareError && <p className="text-red-400 mt-4">{shareError}</p>}


            <div className="mt-8 border-t border-gray-700 pt-6">
                <div className="flex flex-wrap items-start gap-4">
                    {/* Primary Actions */}
                    <div className="flex flex-wrap gap-4 p-4 border border-gray-700 rounded-lg bg-gray-900/30">
                        <div>
                            <h4 className="font-semibold text-white">Primary Actions</h4>
                            <p className="text-xs text-gray-400 mb-2">Modify this agent.</p>
                            <div className="flex flex-wrap gap-4">
                                {(agent.state === 'ENABLED' || agent.state === 'DISABLED') && (
                                     <button 
                                        onClick={onEdit} 
                                        title="Update agent's display name, description, tools, etc."
                                        className="px-5 py-2.5 bg-gray-600 text-white font-semibold rounded-md hover:bg-gray-700"
                                    >
                                        Update Agent
                                    </button>
                                )}
                                {isPrivate && (
                                    <button 
                                        onClick={handleShare}
                                        disabled={isSharing}
                                        className="px-5 py-2.5 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 disabled:bg-indigo-800 flex items-center gap-2"
                                        title="Enable sharing for this private (no-code) agent"
                                    >
                                        {isSharing ? (
                                             <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                                        ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
                                            </svg>
                                        )}
                                        Share Agent
                                    </button>
                                )}
                                {agent.a2aAgentDefinition?.jsonAgentCard && (
                                    <button 
                                        onClick={handleCopyAgentCard}
                                        className="px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700"
                                        title="Copy the A2A Agent Card JSON to clipboard"
                                    >
                                        {copyCardSuccess || 'Copy Agent Card'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    {/* Other Actions */}
                    <div className="flex flex-wrap gap-4 p-4 border border-gray-700 rounded-lg bg-gray-900/30 flex-1">
                         <div>
                            <h4 className="font-semibold text-white">Advanced Actions</h4>
                             <p className="text-xs text-gray-400 mb-2">Inspect data or perform destructive actions.</p>
                            <div className="flex flex-wrap gap-4">
                                 <button onClick={handleFetchAgentView} disabled={isFetchingView} className="px-5 py-2.5 bg-teal-600 text-white font-semibold rounded-md hover:bg-teal-700 disabled:bg-teal-800">
                                    {isFetchingView ? 'Fetching...' : 'Get View'}
                                 </button>
                                <button onClick={handleFetchIamPolicy} disabled={isFetchingPolicy} className="px-5 py-2.5 bg-purple-600 text-white font-semibold rounded-md hover:bg-purple-700 disabled:bg-purple-800">
                                    {isFetchingPolicy ? 'Fetching...' : 'Get IAM Policy'}
                                </button>
                                 <button onClick={handleDelete} disabled={isDeleting} className="px-5 py-2.5 bg-red-600 text-white font-semibold rounded-md hover:bg-red-700 disabled:bg-red-800">
                                    {isDeleting ? 'Deleting...' : 'Delete'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {(agentViewData || viewError) && (
                <div className="mt-6 border-t border-gray-700 pt-6">
                    <h3 className="text-lg font-semibold text-white">Agent View Details</h3>
                    {viewError && <p className="text-red-400 mt-2">{viewError}</p>}
                    {agentViewData && (
                        <pre className="mt-2 bg-gray-900 text-white p-4 rounded-md text-xs overflow-x-auto">
                            <code>{JSON.stringify(agentViewData, null, 2)}</code>
                        </pre>
                    )}
                </div>
            )}

            {(iamPolicy || policyError || isFetchingPolicy || policySuccess) && (
                <div className="mt-6 border-t border-gray-700 pt-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-white">IAM Policy</h3>
                        <button 
                            onClick={() => setIsSetPolicyModalOpen(true)} 
                            disabled={!iamPolicy || isFetchingPolicy} 
                            className="px-3 py-1.5 text-xs bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 disabled:bg-indigo-800 disabled:cursor-not-allowed"
                            title={!iamPolicy ? "Fetch the policy first to get the required ETag" : "Edit IAM Policy"}
                        >
                            Edit Policy
                        </button>
                    </div>
                    {isFetchingPolicy && <Spinner />}
                    {policyError && <p className="text-red-400 mt-2">{policyError}</p>}
                    {policySuccess && <p className="text-green-400 mt-2">{policySuccess}</p>}
                    {iamPolicy && (
                        <pre className="mt-2 bg-gray-900 text-white p-4 rounded-md text-xs overflow-x-auto">
                            <code>{JSON.stringify(iamPolicy, null, 2)}</code>
                        </pre>
                    )}
                </div>
            )}

            {(fullAgent?.lowCodeAgentDefinition || fullAgent?.workflowAgentDefinition) && (
                <div className="mt-6 border-t border-gray-700 pt-6">
                    <h3 className="text-lg font-semibold text-white">Low-Code Agent Configuration</h3>
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                        <div>
                            <label htmlFor="agentModel" className="block text-sm font-medium text-gray-400 mb-1">Model</label>
                            <select 
                                id="agentModel"
                                value={selectedModel} 
                                onChange={(e) => setSelectedModel(e.target.value)}
                                className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[42px]"
                            >
                                <option value="">-- Select Model --</option>
                                <option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview</option>
                                <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                                <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                                <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                            </select>
                        </div>
                        <div>
                            <button 
                                onClick={handleSaveModel} 
                                disabled={isSavingModel || !selectedModel}
                                className="px-5 py-2.5 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 disabled:bg-gray-600 h-[42px]"
                            >
                                {isSavingModel ? 'Saving...' : 'Save Model'}
                            </button>
                        </div>
                    </div>
                    {saveModelError && <p className="text-red-400 mt-2 text-sm">{saveModelError}</p>}
                </div>
            )}

            <div className="mt-6 border-t border-gray-700 pt-6">
                <h3 className="text-lg font-semibold text-white">Accessible Data Stores</h3>
                <p className="text-sm text-gray-400 mt-1 mb-4">View the Vertex AI Search data stores this agent has access to via its tools.</p>
                
                <button onClick={handleFetchDataStores} disabled={isFetchingDataStores} className="px-5 py-2.5 bg-cyan-600 text-white font-semibold rounded-md hover:bg-cyan-700 disabled:bg-cyan-800">
                    {isFetchingDataStores ? 'Fetching...' : 'View Data Stores'}
                </button>
                
                <div className="mt-4">
                    {isFetchingDataStores && <Spinner />}
                    {dataStoresError && <p className="text-red-400 mt-2">{dataStoresError}</p>}
                    {accessibleDataStores && accessibleDataStores.length > 0 && (
                        <div className="bg-gray-900/50 rounded-lg border border-gray-700">
                             <ul className="divide-y divide-gray-700">
                                {accessibleDataStores.map(ds => (
                                    <li key={ds.name} className="p-3">
                                        <p className="font-medium text-white">{ds.displayName}</p>
                                        <p className="text-xs font-mono text-gray-400 mt-1">{ds.name.split('/').pop()}</p>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {accessibleDataStores && accessibleDataStores.length === 0 && (
                         <p className="text-sm text-gray-400 italic">No data stores found in this agent's tool configuration.</p>
                    )}
                </div>
            </div>
            {iamPolicy && (
                 <SetIamPolicyModal
                    isOpen={isSetPolicyModalOpen}
                    onClose={() => setIsSetPolicyModalOpen(false)}
                    onSuccess={handleSetPolicySuccess}
                    agent={agent}
                    config={config}
                    currentPolicy={iamPolicy}
                />
            )}
        </div>
    );
};

export default AgentDetails;
