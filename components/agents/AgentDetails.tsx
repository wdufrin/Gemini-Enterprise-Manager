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


import React, { useState, useMemo } from 'react';
import { AdminPublishAndShareResult, Agent, AppEngine, Config, DataStore, IamPolicy, WidgetConfig } from '../../types';
import * as api from '../../services/apiService';
import Spinner from '../Spinner';
import SetIamPolicyModal from './SetIamPolicyModal';
import TransferAgentOwnershipModal from './TransferAgentOwnershipModal';
import AdminPublishAndShareModal from './AdminPublishAndShareModal';
import AgentDatasourceEditor from './AgentDatasourceEditor';
import {
    extractEngineNameFromAgentName,
    formatModelDisplayName,
    resolveAvailableAppModels,
} from '../assistants/engine-details/modelsCatalog';
import { useToast } from '../../context/ToastContext';
import { toErrorMessage } from '../../utils/errors';
import ConfirmationModal from '../ConfirmationModal';

type DetailsSubTab = 'overview' | 'datasources' | 'sharing' | 'raw';

interface AgentDetailsProps {
    agent: Agent;
    config: Config;
    onBack: () => void;
    onEdit: () => void;
    onDeleteSuccess: () => void;
    onToggleStatus: (agent: Agent) => void;
    togglingAgentId: string | null;
    error: string | null;
    onTestAgent?: (agent: Agent) => void;
    onAgentUpdated?: (agent: Agent) => void;
}

interface InstructionNodeDraft {
    nodeId: string;
    nodeLabel: string;
    instruction: string;
    kind: 'lowCode' | 'workflow';
}

const extractInstructionDrafts = (target: Agent | null): InstructionNodeDraft[] => {
    if (!target) return [];
    const drafts: InstructionNodeDraft[] = [];

    if (target.lowCodeAgentDefinition) {
        const nodes =
            target.lowCodeAgentDefinition.nodes && target.lowCodeAgentDefinition.nodes.length > 0
                ? target.lowCodeAgentDefinition.nodes
                : target.lowCodeAgentDefinition.deployedNodes || [];
        nodes.forEach((n, idx) => {
            if (n.llmAgentNode) {
                drafts.push({
                    nodeId: n.id || `node_${idx}`,
                    nodeLabel: n.displayName || n.id || `LLM Node ${idx + 1}`,
                    instruction: n.llmAgentNode.instruction || '',
                    kind: 'lowCode',
                });
            }
        });
    } else if (target.workflowAgentDefinition?.agentFlow?.nodes) {
        target.workflowAgentDefinition.agentFlow.nodes.forEach((n, idx) => {
            if (n.agentNode) {
                drafts.push({
                    nodeId: n.id || `node_${idx}`,
                    nodeLabel: n.title || n.id || `Workflow Agent Step ${idx + 1}`,
                    instruction: n.agentNode.instruction || '',
                    kind: 'workflow',
                });
            }
        });
    }

    return drafts;
};

const DetailItem: React.FC<{ label: string; value: string | undefined | null }> = ({ label, value }) => (
    <div className="py-2">
        <dt className="text-sm font-medium text-gray-400">{label}</dt>
        <dd className="mt-1 text-sm text-white font-mono bg-gray-700 p-2 rounded break-all">{value || 'Not set'}</dd>
    </div>
);

const AgentDetails: React.FC<AgentDetailsProps> = ({
    agent,
    config,
    onBack,
    onEdit,
    onDeleteSuccess,
    onToggleStatus,
    togglingAgentId,
    error: pageError,
    onTestAgent,
    onAgentUpdated,
}) => {
    const { toast } = useToast();
    const [activeSubTab, setActiveSubTab] = useState<DetailsSubTab>('overview');
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [agentViewData, setAgentViewData] = useState<Record<string, unknown> | null>(null);
    const [isFetchingView, setIsFetchingView] = useState(false);
    const [viewError, setViewError] = useState<string | null>(null);
    const [iamPolicy, setIamPolicy] = useState<IamPolicy | null>(null);
    const [isFetchingPolicy, setIsFetchingPolicy] = useState(false);
    const [policyError, setPolicyError] = useState<string | null>(null);
    const [isSetPolicyModalOpen, setIsSetPolicyModalOpen] = useState(false);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [isPublishAndShareModalOpen, setIsPublishAndShareModalOpen] = useState(false);
    const [policySuccess, setPolicySuccess] = useState<string | null>(null);

    // Sharing state
    const [isSharing, setIsSharing] = useState(false);
    const [shareError, setShareError] = useState<string | null>(null);
    const [isUpdatingScope, setIsUpdatingScope] = useState(false);

    // State for accessible data stores
    const [accessibleDataStores, setAccessibleDataStores] = useState<DataStore[] | null>(null);
    const [isFetchingDataStores, setIsFetchingDataStores] = useState(false);
    const [dataStoresError, setDataStoresError] = useState<string | null>(null);

    // State for copying agent card / raw JSON
    const [copyCardSuccess, setCopyCardSuccess] = useState<string | null>(null);
    const [copyRawJsonSuccess, setCopyRawJsonSuccess] = useState<string | null>(null);

    // State for low-code model & system instruction editing
    const [fullAgent, setFullAgent] = useState<Agent | null>(null);
    const [appEngine, setAppEngine] = useState<AppEngine | null>(null);
    const [appWidgetConfig, setAppWidgetConfig] = useState<WidgetConfig | null>(null);
    const [selectedModel, setSelectedModel] = useState<string>('');
    const [savedModel, setSavedModel] = useState<string>('');
    const [isSavingModel, setIsSavingModel] = useState(false);
    const [saveModelError, setSaveModelError] = useState<string | null>(null);

    const [instructionDrafts, setInstructionDrafts] = useState<InstructionNodeDraft[]>([]);
    const [isSavingInstructions, setIsSavingInstructions] = useState(false);
    const [saveInstructionsError, setSaveInstructionsError] = useState<string | null>(null);

    const availableAppModels = useMemo(
        () => resolveAvailableAppModels(appEngine, appWidgetConfig),
        [appEngine, appWidgetConfig]
    );
    const hasAppModelSource = Boolean(
        appWidgetConfig?.uiSettings?.modelConfigInfo?.resolvedModels?.length ||
            (appEngine?.modelConfigs && Object.keys(appEngine.modelConfigs).length > 0) ||
            (appWidgetConfig?.uiSettings?.modelConfigs &&
                Object.keys(appWidgetConfig.uiSettings.modelConfigs).length > 0)
    );

    const currentAgent = fullAgent || agent;
    const agentId = currentAgent.name.split('/').pop() || '';
    const ownerHint = api.extractAgentOwnerHint(currentAgent);

    React.useEffect(() => {
        const fetchFullAgentAndAppModels = async () => {
            const engineName = extractEngineNameFromAgentName(agent.name, config);
            const [agentRes, engineRes, widgetRes] = await Promise.allSettled([
                api.getAgent(agent.name, config),
                engineName && typeof api.getEngine === 'function'
                    ? api.getEngine(engineName, config)
                    : Promise.resolve(null),
                engineName && typeof api.getWidgetConfig === 'function'
                    ? api.getWidgetConfig(engineName, config)
                    : Promise.resolve(null),
            ]);

            if (engineRes.status === 'fulfilled' && engineRes.value) {
                setAppEngine(engineRes.value);
            }
            if (widgetRes.status === 'fulfilled' && widgetRes.value) {
                setAppWidgetConfig(widgetRes.value);
            }

            if (agentRes.status === 'fulfilled' && agentRes.value) {
                const data = agentRes.value;
                setFullAgent(data);
                setInstructionDrafts(extractInstructionDrafts(data));

                const lowCodeNodes =
                    data.lowCodeAgentDefinition?.nodes && data.lowCodeAgentDefinition.nodes.length > 0
                        ? data.lowCodeAgentDefinition.nodes
                        : data.lowCodeAgentDefinition?.deployedNodes || [];
                const llmNodeWithModel = lowCodeNodes.find(n => Boolean(n.llmAgentNode?.model));
                if (llmNodeWithModel?.llmAgentNode?.model) {
                    setSelectedModel(llmNodeWithModel.llmAgentNode.model);
                    setSavedModel(llmNodeWithModel.llmAgentNode.model);
                } else if (data.workflowAgentDefinition?.agentFlow?.nodes) {
                    const agentNode = data.workflowAgentDefinition.agentFlow.nodes.find(
                        (n: { agentNode?: { model?: string } }) => Boolean(n.agentNode?.model)
                    );
                    const pinned = agentNode?.agentNode?.model || '';
                    setSelectedModel(pinned);
                    setSavedModel(pinned);
                } else {
                    setSelectedModel('');
                    setSavedModel('');
                }
            } else if (agentRes.status === 'rejected') {
                console.error("Failed to fetch full agent details", agentRes.reason);
                setInstructionDrafts(extractInstructionDrafts(agent));
            }
        };
        fetchFullAgentAndAppModels();
    }, [agent, config]);

    const handleSaveModel = async () => {
        if (!fullAgent) return;
        setIsSavingModel(true);
        setSaveModelError(null);
        try {
            const updatedAgent: Agent = JSON.parse(JSON.stringify(fullAgent));
            const payload: Partial<Agent> = {};

            if (updatedAgent.lowCodeAgentDefinition) {
                const def = updatedAgent.lowCodeAgentDefinition;
                if ((!def.nodes || def.nodes.length === 0) && Array.isArray(def.deployedNodes)) {
                    def.nodes = JSON.parse(JSON.stringify(def.deployedNodes));
                }
                if (Array.isArray(def.nodes)) {
                    def.nodes.forEach(node => {
                        if (node.llmAgentNode) {
                            node.llmAgentNode.model = selectedModel;
                        }
                    });
                }
                payload.lowCodeAgentDefinition = def;
            } else if (updatedAgent.workflowAgentDefinition?.agentFlow?.nodes) {
                updatedAgent.workflowAgentDefinition.agentFlow.nodes.forEach(node => {
                    if (node.agentNode) {
                        node.agentNode.model = selectedModel;
                    }
                });
                payload.workflowAgentDefinition = updatedAgent.workflowAgentDefinition;
            }

            const res = await api.updateAndPublishNoCodeAgent(updatedAgent, payload, config, {
                autoDeployOrPublish: true,
                autoClaimOwnershipOn403: false,
            });
            setFullAgent(res.updatedAgent);
            setSavedModel(selectedModel);
            onAgentUpdated?.(res.updatedAgent);
            if (res.deployWarning) {
                toast.info(`Model saved to draft (${res.deployWarning})`);
            } else {
                toast.success(
                    selectedModel
                        ? `Model updated to ${selectedModel} and published to live agent!`
                        : 'Agent reset to Auto (Engine Default) model and published!'
                );
            }
        } catch (err: unknown) {
            setSaveModelError(toErrorMessage(err) || 'Failed to save model.');
        } finally {
            setIsSavingModel(false);
        }
    };

    const handleInstructionChange = (nodeId: string, newInstruction: string) => {
        setInstructionDrafts(prev =>
            prev.map(d => (d.nodeId === nodeId ? { ...d, instruction: newInstruction } : d))
        );
    };

    const handleSaveInstructions = async () => {
        const base = fullAgent || agent;
        if (!base || instructionDrafts.length === 0) return;
        setIsSavingInstructions(true);
        setSaveInstructionsError(null);
        try {
            const updatedAgent: Agent = JSON.parse(JSON.stringify(base));
            const payload: Partial<Agent> = {};
            const draftById = new Map<string, string>(instructionDrafts.map(d => [d.nodeId, d.instruction]));

            if (updatedAgent.lowCodeAgentDefinition) {
                const def = updatedAgent.lowCodeAgentDefinition;
                if ((!def.nodes || def.nodes.length === 0) && Array.isArray(def.deployedNodes)) {
                    def.nodes = JSON.parse(JSON.stringify(def.deployedNodes));
                }
                if (Array.isArray(def.nodes)) {
                    def.nodes.forEach((node, idx) => {
                        const key = node.id || `node_${idx}`;
                        if (node.llmAgentNode && draftById.has(key)) {
                            node.llmAgentNode.instruction = draftById.get(key) || '';
                        }
                    });
                }
                payload.lowCodeAgentDefinition = def;
            } else if (updatedAgent.workflowAgentDefinition?.agentFlow?.nodes) {
                updatedAgent.workflowAgentDefinition.agentFlow.nodes.forEach((node, idx) => {
                    const key = node.id || `node_${idx}`;
                    if (node.agentNode && draftById.has(key)) {
                        node.agentNode.instruction = draftById.get(key) || '';
                    }
                });
                payload.workflowAgentDefinition = updatedAgent.workflowAgentDefinition;
            }

            const res = await api.updateAndPublishNoCodeAgent(updatedAgent, payload, config, {
                autoDeployOrPublish: true,
                autoClaimOwnershipOn403: false,
            });
            setFullAgent(res.updatedAgent);
            setInstructionDrafts(extractInstructionDrafts(res.updatedAgent));
            onAgentUpdated?.(res.updatedAgent);
            if (res.deployWarning) {
                toast.info(`Instructions saved to draft (${res.deployWarning})`);
            } else {
                toast.success("System instructions updated and published to live agent!");
            }
        } catch (err: unknown) {
            setSaveInstructionsError(toErrorMessage(err) || 'Failed to save instructions.');
        } finally {
            setIsSavingInstructions(false);
        }
    };

    const isToggling = togglingAgentId === agentId;
    const isGoogleManaged = api.isGoogleManagedAgent(currentAgent);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const statusColorClass = currentAgent.state === 'ENABLED' ? 'bg-green-500' : currentAgent.state === 'DISABLED' ? 'bg-red-500' : 'bg-yellow-500';

    const handleDelete = async () => {
        if (isGoogleManaged) {
            setDeleteError(
                `"${currentAgent.displayName || agentId}" is a Google-managed built-in agent and cannot be deleted. Toggle its status to Disabled instead.`
            );
            setIsDeleteConfirmOpen(false);
            return;
        }
        setIsDeleting(true);
        setDeleteError(null);
        setIsDeleteConfirmOpen(false);
        try {
            await api.deleteResource(currentAgent.name, config);
            onDeleteSuccess();
        } catch (err: unknown) {
            setDeleteError(toErrorMessage(err) || 'Failed to delete agent.');
        } finally {
            setIsDeleting(false);
        }
    };
    
    const handleShare = async () => {
        setIsSharing(true);
        setShareError(null);
        try {
            const shared = await api.shareAgent(currentAgent.name, config);
            setFullAgent(shared);
            if (onAgentUpdated) {
                onAgentUpdated(shared);
                toast.success("Agent deployed and shared in-place!");
            } else {
                onBack();
            }
        } catch (err: unknown) {
            setShareError(toErrorMessage(err) || 'Failed to share agent.');
        } finally {
            setIsSharing(false);
        }
    };

    const handleToggleSharingScope = async (targetScope: 'ALL_USERS' | 'RESTRICTED') => {
        setIsUpdatingScope(true);
        setShareError(null);
        try {
            const updated = await api.updateAgent(
                currentAgent,
                { sharingConfig: { scope: targetScope } },
                config
            );
            setFullAgent(updated);
            onAgentUpdated?.(updated);
            toast.success(
                targetScope === 'ALL_USERS'
                    ? 'Sharing scope set to All Users in App.'
                    : 'Sharing scope set to Restricted (IAM Policy Only).'
            );
        } catch (err: unknown) {
            setShareError(toErrorMessage(err) || 'Failed to update sharing scope.');
        } finally {
            setIsUpdatingScope(false);
        }
    };

    const handleFetchAgentView = async () => {
        setIsFetchingView(true);
        setViewError(null);
        setAgentViewData(null);
        try {
            const viewData = await api.getAgentView(currentAgent.name, config);
            setAgentViewData(viewData);
        } catch (err: unknown) {
            setViewError(toErrorMessage(err) || 'Failed to fetch agent view.');
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
            const policyData = await api.getAgentIamPolicy(currentAgent.name, config);
            setIamPolicy(policyData);
        } catch (err: unknown) {
            setPolicyError(toErrorMessage(err) || 'Failed to fetch IAM policy.');
        } finally {
            setIsFetchingPolicy(false);
        }
    };

    const handleSetPolicySuccess = (updatedPolicy: IamPolicy) => {
        setIamPolicy(updatedPolicy);
        setIsSetPolicyModalOpen(false);
        setPolicySuccess("IAM Policy updated successfully.");
        setTimeout(() => setPolicySuccess(null), 5000);
    };

    const handleTransferOwnershipSuccess = async (updatedPolicy?: IamPolicy | null) => {
        setIsTransferModalOpen(false);
        if (updatedPolicy) {
            setIamPolicy(updatedPolicy);
        }
        setPolicySuccess("Agent ownership transferred successfully.");
        toast.success("Agent ownership transferred successfully!");
        setTimeout(() => setPolicySuccess(null), 5000);
        try {
            const refreshedAgent = await api.getAgent(currentAgent.name, config);
            setFullAgent(refreshedAgent);
            onAgentUpdated?.(refreshedAgent);
        } catch {
            // Non-fatal if re-fetching agent metadata fails
        }
    };

    const handlePublishAndShareSuccess = (result: AdminPublishAndShareResult) => {
        setIsPublishAndShareModalOpen(false);
        setShareError(null);
        const ownerNote = result.transferredTo
            ? ` and ownership transferred to ${result.transferredTo}`
            : '';
        toast.success(
            `Agent "${result.agent.displayName}" published, shared${ownerNote}!`
        );
        if (onAgentUpdated) {
            setFullAgent(result.agent);
            onAgentUpdated(result.agent);
        } else {
            onBack();
        }
    };

    const handleFetchDataStores = async () => {
        setIsFetchingDataStores(true);
        setDataStoresError(null);
        setAccessibleDataStores(null);
        try {
            const viewData = await api.getAgentView(currentAgent.name, config).catch(() => null);

            const findDataStoreIds = (obj: unknown): string[] => {
                let ids: string[] = [];
                if (!obj || typeof obj !== 'object') return ids;
                const rec = obj as Record<string, unknown>;

                for (const key in rec) {
                    if (Object.prototype.hasOwnProperty.call(rec, key)) {
                        const value = rec[key];
                        if (typeof value === 'string' && key.toLowerCase().includes('datastore') && value.startsWith('projects/') && value.includes('/dataStores/')) {
                            ids.push(value);
                        } else if (typeof value === 'object' && value !== null) {
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

        } catch (err: unknown) {
            setDataStoresError(toErrorMessage(err) || 'Failed to fetch accessible data stores.');
        } finally {
            setIsFetchingDataStores(false);
        }
    };

    const handleCopyAgentCard = () => {
        if (currentAgent.a2aAgentDefinition?.jsonAgentCard) {
            navigator.clipboard.writeText(currentAgent.a2aAgentDefinition.jsonAgentCard);
            setCopyCardSuccess('Copied!');
            setTimeout(() => setCopyCardSuccess(null), 2000);
        }
    };

    const handleCopyRawJson = () => {
        navigator.clipboard.writeText(JSON.stringify(currentAgent, null, 2));
        setCopyRawJsonSuccess('Copied!');
        setTimeout(() => setCopyRawJsonSuccess(null), 2000);
    };

    const reasoningEngine = currentAgent.adkAgentDefinition?.provisionedReasoningEngine?.reasoningEngine;
    const toolDescription = currentAgent.adkAgentDefinition?.toolSettings?.toolDescription;
    
    let statusElement: React.ReactNode = null;
    let isPrivate = false;

    if (currentAgent.state === 'ENABLED' || currentAgent.state === 'DISABLED') {
        const isEnabled = currentAgent.state === 'ENABLED';
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
                            onClick={() => onToggleStatus(currentAgent)}
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

    const isNoCodeAgent = api.isCustomNoCodeAgent(currentAgent) || isPrivate;
    const currentSharingScope = isPrivate
        ? 'PRIVATE'
        : currentAgent.sharingConfig?.scope === 'ALL_USERS'
            ? 'ALL_USERS'
            : 'RESTRICTED';

    return (
        <div className="bg-gray-800 shadow-xl rounded-lg p-6">
            {/* Top Header */}
            <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4">
                <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                        <span className={`h-3 w-3 rounded-full shrink-0 ${statusColorClass}`}></span>
                        {currentAgent.icon?.uri && <img src={currentAgent.icon.uri} alt="icon" className="h-8 w-8 rounded-full" />}
                        <h2 className="text-2xl font-bold text-white">{currentAgent.displayName}</h2>
                        {isGoogleManaged && (
                            <span
                                className="px-2.5 py-0.5 text-xs font-bold rounded bg-indigo-950/90 text-indigo-300 border border-indigo-700/70"
                                title="First-party Google-managed built-in agent (protected from deletion)."
                            >
                                Google Built-in
                            </span>
                        )}
                        {currentAgent.agentType && (
                            <span className="px-2.5 py-0.5 text-xs font-mono rounded bg-gray-700 text-gray-300 border border-gray-600">
                                {currentAgent.agentType}
                            </span>
                        )}
                        {currentSharingScope === 'ALL_USERS' ? (
                            <span className="px-2.5 py-0.5 text-xs font-medium rounded bg-emerald-900/50 text-emerald-300 border border-emerald-700/50">
                                Shared: All Users
                            </span>
                        ) : currentSharingScope === 'RESTRICTED' ? (
                            <span className="px-2.5 py-0.5 text-xs font-medium rounded bg-blue-900/50 text-blue-300 border border-blue-700/50">
                                Shared: Restricted IAM
                            </span>
                        ) : (
                            <span className="px-2.5 py-0.5 text-xs font-medium rounded bg-yellow-500/20 text-yellow-300 border border-yellow-600/50">
                                Private Draft
                            </span>
                        )}
                    </div>
                    {currentAgent.description && <p className="text-gray-400 mt-1.5 text-sm">{currentAgent.description}</p>}
                    {ownerHint && (
                        <p className="text-xs text-gray-400 mt-1 font-mono">
                            Creator / Owner Hint: <span className="text-gray-200">{ownerHint}</span>
                        </p>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    {onTestAgent && currentAgent.agentType !== 'SKILL' && (
                        <button
                            type="button"
                            onClick={() => onTestAgent(currentAgent)}
                            title="Open interactive chat to test this agent via streamAssist (answerGenerationMode: AGENT)"
                            className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-md hover:bg-emerald-500 transition-colors"
                        >
                            Test Agent
                        </button>
                    )}
                    {(currentAgent.state === 'ENABLED' || currentAgent.state === 'DISABLED') && (
                        <button 
                            onClick={onEdit} 
                            title="Update agent's display name, description, icon, or starter prompts"
                            className="px-4 py-2 bg-gray-600 text-white text-sm font-semibold rounded-md hover:bg-gray-500"
                        >
                            Update Agent
                        </button>
                    )}
                    {isPrivate && (
                        <>
                            <button 
                                onClick={handleShare}
                                disabled={isSharing}
                                className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-md hover:bg-indigo-700 disabled:bg-indigo-800 flex items-center gap-1.5"
                                title="Deploy and enable sharing in-place (requires caller to be the creator of this private agent)"
                            >
                                {isSharing && <div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-b-2 border-white"></div>}
                                Share Agent
                            </button>
                            <button
                                onClick={() => setIsPublishAndShareModalOpen(true)}
                                className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-md hover:bg-emerald-500 flex items-center gap-1.5"
                                title="Admin workflow: clone, deploy/publish, activate sharing, configure IAM access, and transfer ownership back to the user"
                            >
                                Publish &amp; Share for User
                            </button>
                        </>
                    )}
                    {isGoogleManaged ? (
                        <button
                            type="button"
                            disabled
                            title="Google built-in agents are protected from deletion. Toggle Status to Disabled to hide this agent from users."
                            className="px-4 py-2 bg-gray-700 text-gray-400 border border-gray-600 text-sm font-semibold rounded-md cursor-not-allowed select-none"
                        >
                            Protected Built-in
                        </button>
                    ) : (
                        <button
                            onClick={() => setIsDeleteConfirmOpen(true)}
                            disabled={isDeleting}
                            className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-md hover:bg-red-700 disabled:bg-red-800"
                        >
                            {isDeleting ? 'Deleting...' : 'Delete'}
                        </button>
                    )}
                    <button onClick={onBack} className="px-3 py-2 text-sm text-gray-300 hover:text-white">
                        &larr; Back to list
                    </button>
                </div>
            </div>

            {/* Error Banners */}
            {pageError && <p className="text-red-400 mt-4 text-sm">{pageError}</p>}
            {deleteError && <p className="text-red-400 mt-4 text-sm">{deleteError}</p>}
            {shareError && (
                <div className="mt-4 p-3.5 bg-red-900/30 border border-red-700/70 rounded-lg text-sm text-red-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <span>{shareError}</span>
                    {isPrivate && (
                        <button
                            type="button"
                            onClick={() => setIsPublishAndShareModalOpen(true)}
                            className="px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-md hover:bg-emerald-500 shrink-0"
                        >
                            Publish &amp; Share for User
                        </button>
                    )}
                </div>
            )}

            {/* Sub-Tab Navigation */}
            <div className="mt-6 border-b border-gray-700 flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => setActiveSubTab('overview')}
                    className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                        activeSubTab === 'overview'
                            ? 'border-blue-500 text-white'
                            : 'border-transparent text-gray-400 hover:text-gray-200'
                    }`}
                >
                    Overview &amp; Configuration
                </button>
                <button
                    type="button"
                    onClick={() => setActiveSubTab('datasources')}
                    className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                        activeSubTab === 'datasources'
                            ? 'border-cyan-400 text-cyan-300'
                            : 'border-transparent text-gray-400 hover:text-gray-200'
                    }`}
                >
                    Connectors &amp; Data Stores
                </button>
                <button
                    type="button"
                    onClick={() => setActiveSubTab('sharing')}
                    className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                        activeSubTab === 'sharing'
                            ? 'border-purple-400 text-purple-300'
                            : 'border-transparent text-gray-400 hover:text-gray-200'
                    }`}
                >
                    Sharing &amp; IAM
                </button>
                <button
                    type="button"
                    onClick={() => setActiveSubTab('raw')}
                    className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                        activeSubTab === 'raw'
                            ? 'border-teal-400 text-teal-300'
                            : 'border-transparent text-gray-400 hover:text-gray-200'
                    }`}
                >
                    Raw View &amp; JSON
                </button>
            </div>

            {/* TAB 1: OVERVIEW & CONFIGURATION */}
            {activeSubTab === 'overview' && (
                <div className="mt-6 space-y-6">
                    <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
                        <DetailItem label="Full Resource Name" value={currentAgent.name} />
                        <DetailItem label="Agent ID" value={agentId} />
                        {statusElement}
                        <DetailItem
                            label="Sharing Scope"
                            value={
                                currentSharingScope === 'ALL_USERS'
                                    ? 'All Users in App (ALL_USERS)'
                                    : currentSharingScope === 'RESTRICTED'
                                        ? 'Restricted (IAM Policy Only)'
                                        : 'Private (Creator Only)'
                            }
                        />
                        <DetailItem label="Created On" value={currentAgent.createTime ? new Date(currentAgent.createTime).toLocaleString() : undefined} />
                        <DetailItem label="Last Modified" value={currentAgent.updateTime ? new Date(currentAgent.updateTime).toLocaleString() : undefined} />
                        {reasoningEngine && <DetailItem label="Agent Engine" value={reasoningEngine} />}
                        {toolDescription && <DetailItem label="Tool Description" value={toolDescription} />}
                        <DetailItem
                            label="Authorizations"
                            value={
                                currentAgent.authorizationConfig?.toolAuthorizations?.join(', ') ||
                                currentAgent.authorizations?.join(', ') ||
                                (isNoCodeAgent ? 'Managed via bound Data Connectors (OAuth)' : undefined)
                            }
                        />
                    </dl>

                    {currentAgent.a2aAgentDefinition?.jsonAgentCard && (
                        <div className="border-t border-gray-700 pt-4 flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-semibold text-white">A2A Agent Card</h3>
                                <p className="text-xs text-gray-400">Copy the JSON Agent Card definition for this A2A agent.</p>
                            </div>
                            <button 
                                onClick={handleCopyAgentCard}
                                className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-md hover:bg-blue-700"
                                title="Copy the A2A Agent Card JSON to clipboard"
                            >
                                {copyCardSuccess || 'Copy Agent Card'}
                            </button>
                        </div>
                    )}

                    {currentAgent.starterPrompts && currentAgent.starterPrompts.length > 0 && (
                        <div className="border-t border-gray-700 pt-6">
                            <h3 className="text-lg font-semibold text-white">Starter Prompts</h3>
                            <ul className="mt-2 space-y-2">
                                {currentAgent.starterPrompts.map((prompt, index) => (
                                    <li key={index} className="text-sm text-gray-200 bg-gray-700 p-3 rounded-md font-mono">
                                        {prompt.text}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {(currentAgent.lowCodeAgentDefinition || currentAgent.workflowAgentDefinition) && (
                        <div className="border-t border-gray-700 pt-6 space-y-6">
                            <div>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <h3 className="text-lg font-semibold text-white">Low-Code Agent Configuration</h3>
                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-900/50 text-purple-300 border border-purple-700/60">
                                        {hasAppModelSource
                                            ? `Synced with App / Assistant (${availableAppModels.length} models available)`
                                            : `${availableAppModels.length} Enterprise Models Available`}
                                    </span>
                                </div>
                                {savedModel && !availableAppModels.some(m => m.id === savedModel) && (
                                    <div className="mt-3 p-3 bg-amber-900/30 border border-amber-600/60 rounded-md text-xs text-amber-200">
                                        <strong>Pinned Model Not Enabled on App:</strong> This agent is currently pinned to{' '}
                                        <code className="font-mono bg-amber-950/60 px-1.5 py-0.5 rounded text-amber-100">{savedModel}</code>,
                                        which is not enabled on this Gemini Enterprise app. Calling <code>:streamAssist</code> (<strong>Test Agent</strong>) will fail with{' '}
                                        <code>400 MODEL_NOT_ENABLED</code> until you switch this agent to{' '}
                                        <strong>Auto (Engine Default — Recommended)</strong> or one of the enabled models below and click <strong>Save Model</strong>.
                                    </div>
                                )}
                                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                                    <div>
                                        <label htmlFor="agentModel" className="block text-sm font-medium text-gray-400 mb-1">Model</label>
                                        <select 
                                            id="agentModel"
                                            value={selectedModel} 
                                            onChange={(e) => setSelectedModel(e.target.value)}
                                            className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 w-full h-[42px]"
                                        >
                                            <option value="">Auto (Engine Default — Recommended)</option>
                                            {selectedModel && !availableAppModels.some(m => m.id === selectedModel) && (
                                                <option value={selectedModel}>
                                                    {formatModelDisplayName(selectedModel)} ({selectedModel}) — Current on Agent (Not Enabled on App)
                                                </option>
                                            )}
                                            {availableAppModels.map(m => (
                                                <option key={m.id} value={m.id}>
                                                    {m.displayName} ({m.id})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <button 
                                            onClick={handleSaveModel} 
                                            disabled={isSavingModel}
                                            className="px-5 py-2.5 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 disabled:bg-gray-600 h-[42px]"
                                        >
                                            {isSavingModel ? 'Saving...' : 'Save Model'}
                                        </button>
                                    </div>
                                </div>
                                {saveModelError && <p className="text-red-400 mt-2 text-sm">{saveModelError}</p>}
                            </div>

                            {/* System Instruction Inspector & Editor */}
                            {instructionDrafts.length > 0 && (
                                <div className="p-4 bg-gray-900/40 border border-gray-700 rounded-lg space-y-4">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <h4 className="text-sm font-semibold text-white">System Instructions / Prompt</h4>
                                            <p className="text-xs text-gray-400">
                                                Inspect or update the system instructions configured on this agent&apos;s LLM node(s).
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleSaveInstructions}
                                            disabled={isSavingInstructions}
                                            className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-md hover:bg-blue-500 disabled:bg-gray-600"
                                        >
                                            {isSavingInstructions ? 'Saving Instructions...' : 'Save Instructions'}
                                        </button>
                                    </div>

                                    {instructionDrafts.map((draft) => (
                                        <div key={draft.nodeId} className="space-y-1.5">
                                            <label
                                                htmlFor={`instruction-${draft.nodeId}`}
                                                className="block text-xs font-medium text-gray-300"
                                            >
                                                {instructionDrafts.length > 1 ? `Node: ${draft.nodeLabel} (${draft.nodeId})` : 'System Instruction'}
                                            </label>
                                            <textarea
                                                id={`instruction-${draft.nodeId}`}
                                                rows={5}
                                                value={draft.instruction}
                                                onChange={(e) => handleInstructionChange(draft.nodeId, e.target.value)}
                                                placeholder="Enter system instructions for this agent..."
                                                className="w-full bg-gray-800 border border-gray-600 rounded-md p-3 text-xs text-gray-100 font-mono focus:ring-blue-500 focus:border-blue-500"
                                            />
                                        </div>
                                    ))}
                                    {saveInstructionsError && (
                                        <p className="text-red-400 text-xs">{saveInstructionsError}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* TAB 2: CONNECTORS & DATA STORES */}
            {activeSubTab === 'datasources' && (
                <div className="mt-6 space-y-6">
                    {isNoCodeAgent ? (
                        <AgentDatasourceEditor
                            agent={currentAgent}
                            config={config}
                            onAgentUpdated={(updated) => {
                                setFullAgent(updated);
                                onAgentUpdated?.(updated);
                            }}
                        />
                    ) : (
                        <div>
                            <h3 className="text-lg font-semibold text-white">Accessible Data Stores</h3>
                            <p className="text-sm text-gray-400 mt-1 mb-4">
                                View the Vertex AI Search data stores this agent has access to via its tools.
                            </p>
                            <button
                                onClick={handleFetchDataStores}
                                disabled={isFetchingDataStores}
                                className="px-5 py-2.5 bg-cyan-600 text-white font-semibold rounded-md hover:bg-cyan-700 disabled:bg-cyan-800"
                            >
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
                                                    <p className="text-xs font-mono text-gray-400 mt-1">{ds.name?.split('/').pop() || ''}</p>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {accessibleDataStores && accessibleDataStores.length === 0 && (
                                    <p className="text-sm text-gray-400 italic">
                                        No data stores found in this agent&apos;s tool configuration.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* TAB 3: SHARING & IAM */}
            {activeSubTab === 'sharing' && (
                <div className="mt-6 space-y-6">
                    {/* Sharing Status & Controls Card */}
                    <div className="p-4 bg-gray-900/40 border border-gray-700 rounded-lg space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div>
                                <h3 className="text-base font-semibold text-white">Sharing &amp; Ownership Controls</h3>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    {isPrivate
                                        ? 'This agent is currently Private. Share it in-place (if you are the creator) or use Publish & Share for User.'
                                        : 'Manage whether this shared agent is visible to all users in the app or restricted to specific IAM principals.'}
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                {isPrivate ? (
                                    <>
                                        <button
                                            onClick={handleShare}
                                            disabled={isSharing}
                                            className="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-md hover:bg-indigo-700 disabled:bg-indigo-800"
                                        >
                                            {isSharing ? 'Sharing...' : 'Share Agent (Creator)'}
                                        </button>
                                        <button
                                            onClick={() => setIsPublishAndShareModalOpen(true)}
                                            className="px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-md hover:bg-emerald-500"
                                        >
                                            Publish &amp; Share for User (Admin)
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <div className="flex items-center rounded-md overflow-hidden border border-gray-600">
                                            <button
                                                type="button"
                                                disabled={isUpdatingScope}
                                                onClick={() => handleToggleSharingScope('ALL_USERS')}
                                                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                                                    currentSharingScope === 'ALL_USERS'
                                                        ? 'bg-emerald-600 text-white'
                                                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                                }`}
                                            >
                                                All Users in App
                                            </button>
                                            <button
                                                type="button"
                                                disabled={isUpdatingScope}
                                                onClick={() => handleToggleSharingScope('RESTRICTED')}
                                                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                                                    currentSharingScope === 'RESTRICTED'
                                                        ? 'bg-blue-600 text-white'
                                                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                                }`}
                                            >
                                                Restricted IAM
                                            </button>
                                        </div>
                                        {isNoCodeAgent && (
                                            <button
                                                type="button"
                                                onClick={() => setIsTransferModalOpen(true)}
                                                className="px-4 py-2 bg-amber-600 text-white text-xs font-semibold rounded-md hover:bg-amber-500"
                                                title="Transfer ownership (roles/discoveryengine.agentOwner) of this shared custom no-code agent"
                                            >
                                                Transfer Ownership
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* IAM Policy Section */}
                    <div className="p-4 bg-gray-900/40 border border-gray-700 rounded-lg space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <h3 className="text-base font-semibold text-white">Agent IAM Policy</h3>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    Inspect and edit role bindings (`agentOwner`, `agentEditor`, `agentUser`) on this agent resource.
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleFetchIamPolicy}
                                    disabled={isFetchingPolicy}
                                    className="px-4 py-2 bg-purple-600 text-white text-xs font-semibold rounded-md hover:bg-purple-700 disabled:bg-purple-800"
                                >
                                    {isFetchingPolicy ? 'Fetching...' : 'Get IAM Policy'}
                                </button>
                                <button 
                                    onClick={() => setIsSetPolicyModalOpen(true)} 
                                    disabled={!iamPolicy || isFetchingPolicy} 
                                    className="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-md hover:bg-indigo-700 disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed"
                                    title={!iamPolicy ? "Fetch the policy first to get the required ETag" : "Edit IAM Policy"}
                                >
                                    Edit Policy
                                </button>
                            </div>
                        </div>

                        {isFetchingPolicy && <Spinner />}
                        {policyError && <p className="text-red-400 text-sm">{policyError}</p>}
                        {policySuccess && <p className="text-green-400 text-sm">{policySuccess}</p>}

                        {iamPolicy && (
                            <div className="space-y-4">
                                {iamPolicy.bindings && iamPolicy.bindings.length > 0 ? (
                                    <div className="overflow-x-auto border border-gray-700 rounded-lg">
                                        <table className="min-w-full divide-y divide-gray-700 text-left text-xs">
                                            <thead className="bg-gray-800 text-gray-300 uppercase">
                                                <tr>
                                                    <th className="px-4 py-2.5 font-semibold">Role</th>
                                                    <th className="px-4 py-2.5 font-semibold">Principals / Members</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-700 bg-gray-900/60">
                                                {iamPolicy.bindings.map((b, idx) => (
                                                    <tr key={`${b.role}-${idx}`}>
                                                        <td className="px-4 py-3 font-mono text-purple-300 align-top whitespace-nowrap">
                                                            {b.role}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {(b.members || []).map((m, mIdx) => (
                                                                    <span
                                                                        key={`${m}-${mIdx}`}
                                                                        className="px-2 py-0.5 rounded bg-gray-800 text-gray-200 border border-gray-600 font-mono"
                                                                    >
                                                                        {m}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-400 italic">No role bindings present in this IAM policy.</p>
                                )}

                                <details className="text-xs">
                                    <summary className="cursor-pointer text-gray-400 hover:text-white font-medium">
                                        Raw IAM Policy JSON
                                    </summary>
                                    <pre className="mt-2 bg-gray-900 text-white p-4 rounded-md text-xs overflow-x-auto">
                                        <code>{JSON.stringify(iamPolicy, null, 2)}</code>
                                    </pre>
                                </details>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 4: RAW VIEW & JSON */}
            {activeSubTab === 'raw' && (
                <div className="mt-6 space-y-6">
                    <div className="p-4 bg-gray-900/40 border border-gray-700 rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-base font-semibold text-white">Discovery Engine Agent View (`:getView`)</h3>
                                <p className="text-xs text-gray-400">
                                    Fetch the runtime AgentView metadata (`agentType`, `agentOrigin`, and resolved view card).
                                </p>
                            </div>
                            <button
                                onClick={handleFetchAgentView}
                                disabled={isFetchingView}
                                className="px-4 py-2 bg-teal-600 text-white text-xs font-semibold rounded-md hover:bg-teal-700 disabled:bg-teal-800"
                            >
                                {isFetchingView ? 'Fetching...' : 'Get View'}
                            </button>
                        </div>
                        {viewError && <p className="text-red-400 text-xs">{viewError}</p>}
                        {agentViewData && (
                            <pre className="bg-gray-900 text-white p-4 rounded-md text-xs overflow-x-auto border border-gray-700">
                                <code>{JSON.stringify(agentViewData, null, 2)}</code>
                            </pre>
                        )}
                    </div>

                    <div className="p-4 bg-gray-900/40 border border-gray-700 rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-base font-semibold text-white">Raw Agent Resource JSON</h3>
                                <p className="text-xs text-gray-400">
                                    Full Discovery Engine `Agent` resource payload currently loaded.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={handleCopyRawJson}
                                className="px-3 py-1.5 bg-gray-700 text-gray-200 text-xs font-semibold rounded-md hover:bg-gray-600"
                            >
                                {copyRawJsonSuccess || 'Copy JSON'}
                            </button>
                        </div>
                        <pre className="bg-gray-900 text-white p-4 rounded-md text-xs overflow-x-auto max-h-96 border border-gray-700">
                            <code>{JSON.stringify(currentAgent, null, 2)}</code>
                        </pre>
                    </div>
                </div>
            )}

            {iamPolicy && (
                 <SetIamPolicyModal
                    isOpen={isSetPolicyModalOpen}
                    onClose={() => setIsSetPolicyModalOpen(false)}
                    onSuccess={handleSetPolicySuccess}
                    agent={currentAgent}
                    config={config}
                    currentPolicy={iamPolicy}
                />
            )}
            <TransferAgentOwnershipModal
                isOpen={isTransferModalOpen}
                onClose={() => setIsTransferModalOpen(false)}
                onSuccess={handleTransferOwnershipSuccess}
                agent={currentAgent}
                config={config}
                currentPolicy={iamPolicy}
            />
            <AdminPublishAndShareModal
                isOpen={isPublishAndShareModalOpen}
                onClose={() => setIsPublishAndShareModalOpen(false)}
                onSuccess={handlePublishAndShareSuccess}
                agent={currentAgent}
                config={config}
            />
            <ConfirmationModal
                isOpen={isDeleteConfirmOpen}
                onClose={() => setIsDeleteConfirmOpen(false)}
                onConfirm={handleDelete}
                title={`Confirm Deletion of "${currentAgent.displayName}"`}
                confirmText="Delete Agent"
                isConfirming={isDeleting}
            >
                <p>Are you sure you want to permanently delete the agent <strong>{currentAgent.displayName}</strong> (<code className="text-xs font-mono text-gray-300">{agentId}</code>)?</p>
                <p className="mt-3 text-sm text-yellow-300">This action cannot be undone.</p>
            </ConfirmationModal>
        </div>
    );
};

export default AgentDetails;
