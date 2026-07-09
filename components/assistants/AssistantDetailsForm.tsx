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
import { Assistant, VertexAiAgentConfig, Config, EnabledAction, EnabledTool, ReasoningEngine } from '../../types';
import * as api from '../../services/apiService';
import InfoTooltip from '../InfoTooltip';
import { useGlobalDebug } from '../../context/GlobalDebugContext';

interface AssistantDetailsFormProps {
    assistant: Assistant;
    config: Config;
    onUpdateSuccess: (updatedAssistant: Assistant) => void;
}

const ALL_REASONING_ENGINE_LOCATIONS = [
    'us-central1', 'us-east1', 'us-east4', 'us-west1',
    'europe-west1', 'europe-west2', 'europe-west4',
    'asia-east1', 'asia-southeast1'
];

const CollapsibleSection: React.FC<React.PropsWithChildren<{ title: string }>> = ({ title, children }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="border-t border-gray-700 pt-4">
            <button type="button" onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center text-left">
                <h3 className="text-md font-semibold text-white">{title}</h3>
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
            </button>
            {isOpen && <div className="mt-2">{children}</div>}
        </div>
    );
};

const AssistantDetailsForm: React.FC<AssistantDetailsFormProps> = ({ assistant, config, onUpdateSuccess }) => {
    const { showCurlPreview } = useGlobalDebug();
    const [formData, setFormData] = useState({
        displayName: '',
        styleAndFormattingInstructions: '',
        additionalSystemInstruction: '',
        webGroundingType: 'WEB_GROUNDING_TYPE_DISABLED',
        customerPolicy: '{}',
        enableEndUserAgentCreation: false,
        disableLocationContext: false,
        defaultWebGroundingToggleOff: false,
        vertexAiSearchToolConfig: '{}',
        chatHistoryRetentionDays: '', // Added for Chat History Retention
    });
    const [agentConfigs, setAgentConfigs] = useState<VertexAiAgentConfig[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // State for fetching available reasoning engines
    const [availableEngines, setAvailableEngines] = useState<ReasoningEngine[]>([]);
    const [isLoadingEngines, setIsLoadingEngines] = useState(false);
    const [engineError, setEngineError] = useState<string | null>(null);

    // State for current engine details (for sessionConfig)
    const [currentEngine, setCurrentEngine] = useState<any>(null);
    const [iamPolicy, setIamPolicyLocal] = useState<any>(null);
    const [newMember, setNewMember] = useState('');
    const [memberType, setMemberType] = useState('user:');
    const [isLoadingIam, setIsLoadingIam] = useState(false);
    const [iamError, setIamError] = useState<string | null>(null);
    const [isIamDirty, setIsIamDirty] = useState(false);

    useEffect(() => {
        const policyObj = assistant.customerPolicy ? { ...(assistant.customerPolicy as any) } : {};
        
        // Use sessionTtl from currentEngine if available, otherwise default to empty
        const retention = currentEngine?.sessionConfig?.sessionTtl?.days !== undefined 
            ? String(currentEngine.sessionConfig.sessionTtl.days) 
            : '';

        setFormData({
            displayName: assistant.displayName || '',
            styleAndFormattingInstructions: assistant.styleAndFormattingInstructions || '',
            additionalSystemInstruction: assistant.generationConfig?.systemInstruction?.additionalSystemInstruction || '',
            webGroundingType: assistant.webGroundingType || 'WEB_GROUNDING_TYPE_DISABLED',
            customerPolicy: Object.keys(policyObj).length > 0 ? JSON.stringify(policyObj, null, 2) : '{}',
            enableEndUserAgentCreation: assistant.enableEndUserAgentCreation || false,
            disableLocationContext: assistant.disableLocationContext || false,
            defaultWebGroundingToggleOff: assistant.defaultWebGroundingToggleOff || false,
            vertexAiSearchToolConfig: assistant.vertexAiSearchToolConfig ? JSON.stringify(assistant.vertexAiSearchToolConfig, null, 2) : '{}',
            chatHistoryRetentionDays: retention,
        });
        setAgentConfigs(assistant.vertexAiAgentConfigs ? JSON.parse(JSON.stringify(assistant.vertexAiAgentConfigs)) : []);
    }, [assistant, currentEngine]);

    useEffect(() => {
        const fetchCurrentEngine = async () => {
            if (!config.appId) return;
            try {
                 // name is full resource name or just ID depending on apiService
                 const engine = await api.getEngine(config.appId, config);
                 setCurrentEngine(engine);
            } catch (e) {
                 console.warn("Failed to fetch current engine", e);
            }
        };
        fetchCurrentEngine();
    }, [config.appId]);

    useEffect(() => {
        const fetchIamPolicy = async () => {
            if (!config.appId) return;
            setIsLoadingIam(true);
            setIamError(null);
            try {
                const policy = await api.getEngineIamPolicy(config.appId, config);
                setIamPolicyLocal(policy);
            } catch (e: any) {
                setIamError(e.message || 'Failed to fetch IAM policy.');
            } finally {
                setIsLoadingIam(false);
            }
        };
        fetchIamPolicy();
    }, [config.appId, config]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
        setFormData({ ...formData, [e.target.name]: value });
    };

    const handleRemoveAgentConfig = (index: number) => {
        setAgentConfigs(agentConfigs.filter((_, i) => i !== index));
    };



    const handleAddIamMember = async () => {
        if (!newMember) return;
        let memberString = newMember;
        
        if (!memberString.includes(':') && !memberString.startsWith('principal://') && !memberString.startsWith('principalSet://')) {
            memberString = `${memberType}${memberString}`;
        }
        
        const updatedPolicy = { ...iamPolicy };
        if (!updatedPolicy.bindings) updatedPolicy.bindings = [];
        
        let binding = updatedPolicy.bindings.find((b: any) => b.role === 'roles/discoveryengine.user');
        if (!binding) {
            binding = { role: 'roles/discoveryengine.user', members: [] };
            updatedPolicy.bindings.push(binding);
        }
        
        if (!binding.members) binding.members = [];
        
        if (!binding.members.includes(memberString)) {
            binding.members.push(memberString);
        }
        
        setIamPolicyLocal({ ...updatedPolicy }); // Force new object for re-render
        setIsIamDirty(true);
        setNewMember('');

        try {
            setIamError(null);
            setIsLoadingIam(true);
            const projectPolicy = await api.getProjectIamPolicy(config.projectId);
            let notebookBinding = projectPolicy.bindings.find((b: any) => b.role === 'roles/discoveryengine.agentspaceRestrictedUser');
            if (!notebookBinding) {
                notebookBinding = { role: 'roles/discoveryengine.agentspaceRestrictedUser', members: [] };
                projectPolicy.bindings.push(notebookBinding);
            }
            if (!notebookBinding.members.includes(memberString)) {
                notebookBinding.members.push(memberString);
            }
            await api.setProjectIamPolicy(config.projectId, projectPolicy);
            setSuccess("Granted local permissions and mandatory project-level Agentspace Restricted User access.");
            setTimeout(() => setSuccess(null), 3000);
        } catch (e: any) {
            setIamError(`Failed to grant mandatory Agentspace Restricted User access: ${e.message}`);
        } finally {
            setIsLoadingIam(false);
        }
    };

    const handleRemoveIamMember = (member: string) => {
        const updatedPolicy = { ...iamPolicy };
        if (!updatedPolicy.bindings) return;
        
        const binding = updatedPolicy.bindings.find((b: any) => b.role === 'roles/discoveryengine.user');
        if (binding && binding.members) {
            binding.members = binding.members.filter((m: string) => m !== member);
        }
        
        setIamPolicyLocal({ ...updatedPolicy }); // Force new object for re-render
        setIsIamDirty(true);
    };

    const performUpdate = async () => {
        setIsSubmitting(true);
        setError(null);
        setSuccess(null);

        try {
            const payload: any = {};
            const updateMask: string[] = [];

            if (formData.styleAndFormattingInstructions !== (assistant.styleAndFormattingInstructions || '')) {
                payload.styleAndFormattingInstructions = formData.styleAndFormattingInstructions;
                updateMask.push('styleAndFormattingInstructions');
            }
            if (formData.additionalSystemInstruction !== (assistant.generationConfig?.systemInstruction?.additionalSystemInstruction || '')) {
                payload.generationConfig = {
                    systemInstruction: {
                        additionalSystemInstruction: formData.additionalSystemInstruction
                    }
                };
                updateMask.push('generationConfig.systemInstruction');
            }
            if (formData.webGroundingType !== (assistant.webGroundingType || 'WEB_GROUNDING_TYPE_DISABLED')) {
                payload.webGroundingType = formData.webGroundingType;
                updateMask.push('webGroundingType');
            }

            let policyObj: any;
            try {
                policyObj = JSON.parse(formData.customerPolicy);
            } catch (e) {
                setError("Customer Policy is not valid JSON.");
                setIsSubmitting(false);
                return;
            }

            const originalPolicyString = assistant.customerPolicy ? JSON.stringify(assistant.customerPolicy) : '{}';
            const currentPolicyString = JSON.stringify(policyObj);

            if (currentPolicyString !== originalPolicyString) {
                payload.customerPolicy = policyObj;
                updateMask.push('customerPolicy');
            }

            // Engine Update check for sessionTtl
            let engineUpdatePayload: any = null;
            const currentDays = currentEngine?.sessionConfig?.sessionTtl?.days;
            const newDays = formData.chatHistoryRetentionDays ? parseInt(formData.chatHistoryRetentionDays, 10) : undefined;

            if (newDays !== undefined && !isNaN(newDays)) {
                 if (newDays !== currentDays) {
                      engineUpdatePayload = {
                           sessionConfig: {
                                sessionTtl: {
                                     days: newDays
                                }
                           }
                      };
                 }
            } else if (currentDays !== undefined && formData.chatHistoryRetentionDays === "") {
                 // User cleared it? Maybe we want to clear or default it.
                 // Usually omitting it might keep current value, or we might pass something else.
                 // For now, assume update only if we have a number.
            }

            if (formData.enableEndUserAgentCreation !== (assistant.enableEndUserAgentCreation || false)) {
                payload.enableEndUserAgentCreation = formData.enableEndUserAgentCreation;
                updateMask.push('enableEndUserAgentCreation');
            }
            if (formData.disableLocationContext !== (assistant.disableLocationContext || false)) {
                payload.disableLocationContext = formData.disableLocationContext;
                updateMask.push('disableLocationContext');
            }
            if (formData.defaultWebGroundingToggleOff !== (assistant.defaultWebGroundingToggleOff || false)) {
                payload.defaultWebGroundingToggleOff = formData.defaultWebGroundingToggleOff;
                updateMask.push('defaultWebGroundingToggleOff');
            }

            let searchToolConfigObj;
            try {
                searchToolConfigObj = JSON.parse(formData.vertexAiSearchToolConfig);
            } catch (e) {
                setError("Vertex AI Search Tool Config is not valid JSON.");
                setIsSubmitting(false);
                return;
            }
            const originalSearchToolConfigString = assistant.vertexAiSearchToolConfig ? JSON.stringify(assistant.vertexAiSearchToolConfig) : '{}';
            const currentSearchToolConfigString = JSON.stringify(searchToolConfigObj);

            if (currentSearchToolConfigString !== originalSearchToolConfigString) {
                payload.vertexAiSearchToolConfig = searchToolConfigObj;
                updateMask.push('vertexAiSearchToolConfig');
            }


            const originalConfigsString = JSON.stringify(assistant.vertexAiAgentConfigs || []);
            const currentConfigsString = JSON.stringify(agentConfigs);

            if (originalConfigsString !== currentConfigsString) {
                for (const cfg of agentConfigs) {
                    if (!cfg.name || !cfg.displayName || !cfg.toolDescription) {
                        throw new Error("All fields for each Vertex AI Agent Config (Agent Engine, Display Name, Tool Description) are required.");
                    }
                }
                payload.vertexAiAgentConfigs = agentConfigs;
                updateMask.push('vertexAiAgentConfigs');
            }

            let assistantUpdated = false;
            let engineUpdated = false;
            let iamUpdated = false;

            if (isIamDirty && iamPolicy) {
                await api.setEngineIamPolicy(config.appId, iamPolicy, config);
                iamUpdated = true;
                setIsIamDirty(false);
                try {
                    const freshPolicy = await api.getEngineIamPolicy(config.appId, config);
                    setIamPolicyLocal(freshPolicy);
                } catch (e) {
                    console.warn("Failed to refresh IAM policy after update", e);
                }
            }

            if (updateMask.length > 0) {
                const updatedAssistant = await api.updateAssistant(assistant.name, payload, updateMask, config);
                onUpdateSuccess(updatedAssistant);
                assistantUpdated = true;
            }

            if (engineUpdatePayload) {
                await api.updateEngine(config.appId, engineUpdatePayload, ['sessionConfig.sessionTtl'], config);
                engineUpdated = true;
                try {
                    const updatedEngine = await api.getEngine(config.appId, config);
                    setCurrentEngine(updatedEngine);
                } catch (e) {
                    console.warn("Failed to reload engine after update", e);
                }
            }

            if (assistantUpdated || engineUpdated || iamUpdated) {
                setSuccess("Updates applied successfully!");
            } else {
                setSuccess("No changes detected.");
            }
            setTimeout(() => setSuccess(null), 3000);

        } catch (err: any) {
            setError(err.message || 'Failed to update assistant.');
        } finally {
            setIsSubmitting(false);
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await performUpdate();
    };

    // Dynamic cURL Command Generation
    const curlCommand = React.useMemo(() => {
        const payload: any = {};
        const updateMask: string[] = [];

        // Logic mirrors handleSubmit
        if (formData.styleAndFormattingInstructions !== (assistant.styleAndFormattingInstructions || '')) {
            payload.styleAndFormattingInstructions = formData.styleAndFormattingInstructions;
            updateMask.push('styleAndFormattingInstructions');
        }
        if (formData.additionalSystemInstruction !== (assistant.generationConfig?.systemInstruction?.additionalSystemInstruction || '')) {
            payload.generationConfig = {
                systemInstruction: {
                    additionalSystemInstruction: formData.additionalSystemInstruction
                }
            };
            updateMask.push('generationConfig.systemInstruction');
        }
        if (formData.webGroundingType !== (assistant.webGroundingType || 'WEB_GROUNDING_TYPE_DISABLED')) {
            payload.webGroundingType = formData.webGroundingType;
            updateMask.push('webGroundingType');
        }

        let policyObj: any;
        try {
            policyObj = JSON.parse(formData.customerPolicy);
        } catch (e) {
            // Ignore parse errors for preview
        }

        if (policyObj) {
            // Inject dedicated Chat History Retention field into the policy object for preview
            if (formData.chatHistoryRetentionDays) {
                const days = parseInt(formData.chatHistoryRetentionDays, 10);
                if (!isNaN(days)) {
                    policyObj.chatHistoryRetentionDays = days;
                }
            }
        }

        const originalPolicyString = assistant.customerPolicy ? JSON.stringify(assistant.customerPolicy) : '{}';
        const currentPolicyString = JSON.stringify(policyObj);

        if (policyObj && currentPolicyString !== originalPolicyString) {
            payload.customerPolicy = policyObj;
            updateMask.push('customerPolicy');
        }

        // Engine Update check for preview
        let enginePayload: any = null;
        const currentDays = currentEngine?.sessionConfig?.sessionTtl?.days;
        const newDays = formData.chatHistoryRetentionDays ? parseInt(formData.chatHistoryRetentionDays, 10) : undefined;

        if (newDays !== undefined && !isNaN(newDays) && newDays !== currentDays) {
            enginePayload = {
                sessionConfig: {
                    sessionTtl: {
                        days: newDays
                    }
                }
            };
        }

        if (formData.enableEndUserAgentCreation !== (assistant.enableEndUserAgentCreation || false)) {
            payload.enableEndUserAgentCreation = formData.enableEndUserAgentCreation;
            updateMask.push('enableEndUserAgentCreation');
        }
        if (formData.disableLocationContext !== (assistant.disableLocationContext || false)) {
            payload.disableLocationContext = formData.disableLocationContext;
            updateMask.push('disableLocationContext');
        }
        if (formData.defaultWebGroundingToggleOff !== (assistant.defaultWebGroundingToggleOff || false)) {
            payload.defaultWebGroundingToggleOff = formData.defaultWebGroundingToggleOff;
            updateMask.push('defaultWebGroundingToggleOff');
        }

        let searchToolConfigObj;
        try {
            searchToolConfigObj = JSON.parse(formData.vertexAiSearchToolConfig);
        } catch (e) {
            // Ignore
        }
        const originalSearchToolConfigString = assistant.vertexAiSearchToolConfig ? JSON.stringify(assistant.vertexAiSearchToolConfig) : '{}';
        const currentSearchToolConfigString = JSON.stringify(searchToolConfigObj);

        if (searchToolConfigObj && currentSearchToolConfigString !== originalSearchToolConfigString) {
            payload.vertexAiSearchToolConfig = searchToolConfigObj;
            updateMask.push('vertexAiSearchToolConfig');
        }

        const originalConfigsString = JSON.stringify(assistant.vertexAiAgentConfigs || []);
        const currentConfigsString = JSON.stringify(agentConfigs);

        if (originalConfigsString !== currentConfigsString) {
            payload.vertexAiAgentConfigs = agentConfigs;
            updateMask.push('vertexAiAgentConfigs');
        }

        if (updateMask.length === 0 && !enginePayload) return null;

        const baseUrl = config.appLocation === 'global'
            ? 'https://discoveryengine.googleapis.com'
            : `https://${config.appLocation}-discoveryengine.googleapis.com`;

        let result = "";
        if (updateMask.length > 0) {
             const assistantUrl = `${baseUrl}/v1alpha/${assistant.name}?updateMask=${updateMask.join(',')}`;
             result += `# Update Assistant\ncurl -X PATCH \\\n  "${assistantUrl}" \\\n  -H "Authorization: Bearer \\\$(gcloud auth print-access-token)" \\\n  -H "Content-Type: application/json" \\\n  -H "X-Goog-User-Project: ${config.projectId}" \\\n  -d '${JSON.stringify(payload, null, 2)}'\n`;
        }

        if (enginePayload) {
             const engineUrl = `${baseUrl}/v1alpha/projects/${config.projectId}/locations/global/collections/default_collection/engines/${config.appId}?updateMask=sessionConfig.sessionTtl`;
             if (result) result += "\n";
             result += `# Update Engine (Chat Retention)\ncurl -X PATCH \\\n  "${engineUrl}" \\\n  -H "Authorization: Bearer \\\$(gcloud auth print-access-token)" \\\n  -H "Content-Type: application/json" \\\n  -H "X-Goog-User-Project: ${config.projectId}" \\\n  -d '${JSON.stringify(enginePayload, null, 2)}'`;
        }

        return result;
    }, [formData, agentConfigs, assistant, currentEngine, config]);

    return (
        <div className="bg-gray-800 shadow-xl rounded-lg p-6">
            <h2 className="text-xl font-bold text-white mb-4">Assistant Editor</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* ... (rest of form fields) ... */}
                <div>
                    <label htmlFor="displayName" className="flex items-center text-sm font-medium text-gray-300">
                        Display Name (Read-only)
                        <InfoTooltip text="The name of the assistant as shown to users. This is currently read-only." />
                    </label>
                    <input type="text" name="displayName" value={formData.displayName} className="mt-1 block w-full bg-gray-700/50 border-gray-600 rounded-md shadow-sm text-gray-400 cursor-not-allowed" required disabled />
                </div>
                <div>
                    <label htmlFor="webGroundingType" className="flex items-center text-sm font-medium text-gray-300">
                        Web Grounding Type
                        <InfoTooltip text="Enables the assistant to use Google Search or Enterprise Web Search for grounding its responses." />
                    </label>
                    <select name="webGroundingType" value={formData.webGroundingType} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm">
                        <option value="WEB_GROUNDING_TYPE_DISABLED">Disabled</option>
                        <option value="WEB_GROUNDING_TYPE_GOOGLE_SEARCH">Google Search (not Data Residency compliant)</option>
                        <option value="WEB_GROUNDING_TYPE_ENTERPRISE_WEB_SEARCH">Enterprise Web Search (Data Residency compliant)</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="styleAndFormattingInstructions" className="flex items-center text-sm font-medium text-gray-300">
                        Style & Formatting Instructions
                        <InfoTooltip text="Guidelines for how the assistant should format its responses (e.g., specific tone, markdown usage)." />
                    </label>
                    <textarea name="styleAndFormattingInstructions" value={formData.styleAndFormattingInstructions} onChange={handleChange} rows={4} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm" />
                </div>
                <div>
                    <label htmlFor="additionalSystemInstruction" className="flex items-center text-sm font-medium text-gray-300">
                        System Instruction
                        <InfoTooltip text="Core instructions that define the assistant's behavior and persona." />
                    </label>
                    <textarea name="additionalSystemInstruction" value={formData.additionalSystemInstruction} onChange={handleChange} rows={6} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm" />
                </div>
                <div>
                    <label htmlFor="chatHistoryRetentionDays" className="flex items-center text-sm font-medium text-gray-300">
                        Chat History Retention (Days)
                        <InfoTooltip text="Number of days to retain chat history. stored in Customer Policy." />
                    </label>
                    <input 
                        type="number" 
                        name="chatHistoryRetentionDays" 
                        value={formData.chatHistoryRetentionDays} 
                        onChange={handleChange} 
                        min="1"
                        placeholder="e.g. 30"
                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm" 
                    />
                </div>
                <div>
                    <label htmlFor="customerPolicy" className="flex items-center text-sm font-medium text-gray-300">
                        Customer Policy (JSON Edit)
                        <InfoTooltip text="JSON configuration for defining customer-specific policies." />
                    </label>
                    <textarea name="customerPolicy" value={formData.customerPolicy} onChange={handleChange} rows={5} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm font-mono text-xs" />
                </div>

                <CollapsibleSection title="Feature Management">
                    <div className="space-y-3 p-4 bg-gray-900/30 rounded-md">
                        <label className="flex items-center space-x-3 cursor-pointer">
                            <div className="flex items-center">
                                <input type="checkbox" name="enableEndUserAgentCreation" checked={Boolean(formData.enableEndUserAgentCreation)} onChange={handleChange} className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500" />
                                <span className="text-sm text-gray-300 ml-3">Enable End-User Agent Creation</span>
                                <InfoTooltip text="Allows end-users to create their own custom agents within the chat interface." />
                            </div>
                        </label>
                        <label className="flex items-center space-x-3 cursor-pointer">
                            <div className="flex items-center">
                                <input type="checkbox" name="disableLocationContext" checked={Boolean(formData.disableLocationContext)} onChange={handleChange} className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500" />
                                <span className="text-sm text-gray-300 ml-3">Disable Location Context</span>
                                <InfoTooltip text="Prevents the location context from being sent to the agent. useful for privacy or testing." />
                            </div>
                        </label>
                        <label className="flex items-center space-x-3 cursor-pointer">
                            <div className="flex items-center">
                                <input type="checkbox" name="defaultWebGroundingToggleOff" checked={Boolean(formData.defaultWebGroundingToggleOff)} onChange={handleChange} className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500" />
                                <span className="text-sm text-gray-300 ml-3">Default Web Grounding to Off</span>
                                <InfoTooltip text="Sets the default state of the Web Grounding toggle in the chat UI to 'Off'." />
                            </div>
                        </label>
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title="Advanced Configuration">
                    <div className="space-y-3 p-4 bg-gray-900/30 rounded-md">
                        <div>
                            <label htmlFor="vertexAiSearchToolConfig" className="flex items-center text-sm font-medium text-gray-300 mb-1">
                                Vertex AI Search Tool Config (JSON)
                                <InfoTooltip text="Raw JSON configuration for the Vertex AI Search Tool. Caution: Invalid JSON here can break the search functionality." />
                            </label>
                            <textarea name="vertexAiSearchToolConfig" value={formData.vertexAiSearchToolConfig} onChange={handleChange} rows={5} className="block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm font-mono text-xs" />
                        </div>
                    </div>
                </CollapsibleSection>


                <CollapsibleSection title="App-level IAM Permissions">
                    <div className="space-y-3 p-4 bg-gray-900/30 rounded-md">
                        <div className="bg-amber-900/30 border border-amber-800 rounded-md p-3 mb-3 text-xs text-amber-200 flex gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <div>
                                <strong>Precedence Warning:</strong> Project-level IAM permissions take precedence over app-level policies. If a user is granted a role (like <code>roles/discoveryengine.user</code>) at the project level, they can access all apps in that project, regardless of any app-level permissions. To restrict a user to specific apps, ensure they do not have broad Discovery Engine roles at the project level. Use this panel to grant app-specific access once project-level access is removed.
                            </div>
                        </div>
                        <div className="bg-blue-900/30 border border-blue-800 rounded-md p-3 mb-3 text-xs text-blue-200 flex gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div>
                                <strong>Mandatory User Access:</strong> To ensure these users can use connectors, agents, and notebooks, they are also automatically granted the mandatory <code>roles/discoveryengine.agentspaceRestrictedUser</code> role at the project level upon addition.
                            </div>
                        </div>
                        
                        {isLoadingIam ? (
                            <div className="flex justify-center py-4">
                                <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
                            </div>
                        ) : iamError ? (
                            <p className="text-xs text-red-400">{iamError}</p>
                        ) : (
                            <div className="space-y-2">
                                {iamPolicy?.bindings?.find((b: any) => b.role === 'roles/discoveryengine.user')?.members?.length > 0 ? (
                                    iamPolicy.bindings.find((b: any) => b.role === 'roles/discoveryengine.user').members.map((member: string) => (
                                        <div key={member} className="flex justify-between items-center bg-gray-700/50 p-2 rounded-md">
                                            <span className="text-xs text-gray-300 font-mono">{member.replace('user:', '').replace('group:', '')}</span>
                                            <button 
                                                type="button" 
                                                onClick={() => handleRemoveIamMember(member)}
                                                className="text-xs text-red-400 hover:text-red-300"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-xs text-gray-500">No explicit app-level users found.</p>
                                )}
                                
                                <div className="flex flex-col sm:flex-row gap-2 mt-3">
                                    <select 
                                        value={memberType} 
                                        onChange={(e) => setMemberType(e.target.value)}
                                        className="bg-gray-700 border-gray-600 rounded-md shadow-sm text-xs text-white"
                                    >
                                        <option value="user:">Standard User (user:)</option>
                                        <option value="group:">Standard Group (group:)</option>
                                        <option value="serviceAccount:">Service Account (serviceAccount:)</option>
                                        <option value="principal://">WiF Principal (principal://)</option>
                                        <option value="principalSet://">WiF Group (principalSet://)</option>
                                    </select>
                                    
                                    <input 
                                        type="text" 
                                        value={newMember} 
                                        onChange={(e) => setNewMember(e.target.value)}
                                        placeholder="email or ID"
                                        className="block flex-1 bg-gray-700 border-gray-600 rounded-md shadow-sm text-xs placeholder-gray-500"
                                    />
                                    <button 
                                        type="button" 
                                        onClick={handleAddIamMember}
                                        className="px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-md hover:bg-blue-700 flex-shrink-0"
                                    >
                                        Add
                                    </button>
                                </div>
                                {/* Mandatory project-level grant is performed automatically */}
                                <div className="text-xs text-gray-400 mt-2 space-y-1 bg-gray-900/50 p-3 rounded-md border border-gray-800">
                                    <p className="font-semibold text-gray-300">Supported Formats:</p>
                                    <p><span className="text-blue-400">Standard User</span>: <code>user:email@example.com</code></p>
                                    <p><span className="text-blue-400">Standard Group</span>: <code>group:email@example.com</code></p>
                                    <p><span className="text-purple-400">IAM Service Account</span>: <code>serviceAccount:email@example.com</code></p>
                                    <p><span className="text-purple-400">WiF Principal</span>: <code>principal://iam.googleapis.com/locations/global/workforcePools/&lt;pool-id&gt;/subject/&lt;subject-id&gt;</code></p>
                                    <p><span className="text-purple-400">WiF Group</span>: <code>principalSet://iam.googleapis.com/locations/global/workforcePools/&lt;pool-id&gt;/group/&lt;group-id&gt;</code></p>
                                </div>
                            </div>
                        )}
                    </div>
                </CollapsibleSection>

                {/* Attached Vertex AI Agent Configs */}
                <div className="border-t border-gray-700 pt-4">
                    <h3 className="text-md font-semibold text-white mb-2">Attached Vertex AI Agent Configs</h3>
                    {agentConfigs.length === 0 ? (
                        <p className="text-sm text-gray-500 italic">No attached Vertex AI agents found. Management of Vertex AI agents is handled via the Agent API.</p>
                    ) : (
                        <div className="space-y-4">
                            {agentConfigs.map((cfg, index) => (
                                <div key={index} className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 space-y-3">
                                    <div className="flex justify-between items-center">
                                        <h4 className="font-semibold text-gray-300">Agent #{index + 1}</h4>
                                        <button type="button" onClick={() => handleRemoveAgentConfig(index)} className="text-sm text-red-400 hover:text-red-300">Remove</button>
                                    </div>
                                    <div>
                                        <label className="flex items-center text-xs font-medium text-gray-400">
                                            Agent Engine ID
                                            <InfoTooltip text="The unique ID of the attached reasoning engine." />
                                        </label>
                                        <input type="text" value={cfg.name.split('/').pop() || cfg.name} className="mt-1 block w-full bg-gray-700/50 border-gray-600 rounded-md shadow-sm text-gray-400 cursor-not-allowed text-xs font-mono" disabled />
                                    </div>
                                    <div>
                                        <label className="flex items-center text-xs font-medium text-gray-400">
                                            Display Name
                                            <InfoTooltip text="The name of the agent tool as exposed to the model." />
                                        </label>
                                        <input type="text" value={cfg.displayName} className="mt-1 block w-full bg-gray-700/50 border-gray-600 rounded-md shadow-sm text-gray-400 cursor-not-allowed" disabled />
                                    </div>
                                    <div>
                                        <label className="flex items-center text-xs font-medium text-gray-400">
                                            Tool Description
                                            <InfoTooltip text="Description of what this agent tool does, used by the model to decide when to call it." />
                                        </label>
                                        <textarea value={cfg.toolDescription} rows={2} className="mt-1 block w-full bg-gray-700/50 border-gray-600 rounded-md shadow-sm text-gray-400 cursor-not-allowed" disabled />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {error && <p className="text-red-400 text-sm">{error}</p>}
                {success && <p className="text-green-400 text-sm">{success}</p>}

                {/* API Command Preview (Only show if debug mode is active OR keep enabling it? User said "checkbox.. if checked, popup". The previous simple list is nice to have. I'll hide it if debug mode is ON, to avoid redundancy with the modal?) 
                    Actually, if debug mode is ON, seeing it inline is still useful. I'll leave it.
                */}
                {curlCommand && (
                    <div className="border-t border-gray-700 pt-4 mt-4">
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            API Command Preview (Pending Changes)
                        </label>
                        <div className="bg-gray-950 p-3 rounded-lg border border-gray-700 relative group overflow-hidden">
                            <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-all overflow-x-auto p-2">
                                {curlCommand}
                            </pre>
                            <button
                                type="button"
                                onClick={() => navigator.clipboard.writeText(curlCommand)}
                                className="absolute top-2 right-2 p-1.5 bg-gray-800 text-gray-400 rounded hover:text-white hover:bg-gray-700 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Copy to clipboard"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">This command reflects the changes you are about to save.</p>
                    </div>
                )}

                <div className="flex justify-end pt-4 border-t border-gray-700">
                    <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:bg-blue-800">
                        {isSubmitting ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </form>



        </div>
    );
};

export default AssistantDetailsForm;
