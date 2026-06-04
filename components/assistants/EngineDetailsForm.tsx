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
import { AppEngine, Config } from '../../types';
import * as api from '../../services/apiService';
import InfoTooltip from '../InfoTooltip';
import PromptChipsTable from './PromptChipsTable';

interface EngineDetailsFormProps {
    engine: AppEngine;
    config: Config;
    onUpdateSuccess: (updatedEngine: AppEngine) => void;
    onLaunchWizard?: () => void;
}

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

const ScimTenantsList: React.FC<{ providerName: string, config: Config }> = ({ providerName, config }) => {
    const [tenants, setTenants] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const toggleExpand = async () => {
        if (!expanded && tenants.length === 0) {
            setLoading(true);
            try {
                const res = await api.getWorkforcePoolProviderScimTenants(providerName, config);
                setTenants(res.workforcePoolProviderScimTenants || []);
            } catch (e) {
                console.error("Failed to fetch scim tenants", e);
            }
            setLoading(false);
        }
        setExpanded(!expanded);
    }

    return (
        <div className="mt-4 pt-3 border-t border-gray-700">
            <button type="button" onClick={toggleExpand} className="flex items-center text-sm font-semibold text-gray-300 hover:text-white group">
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 mr-1 text-gray-400 group-hover:text-blue-400 transition-transform ${expanded ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                SCIM Tenants
            </button>
            {expanded && (
                <div className="mt-2 bg-gray-900 rounded p-3 text-xs">
                    {loading ? (
                        <div className="text-gray-500">Loading SCIM tenants...</div>
                    ) : tenants.length === 0 ? (
                        <div className="text-gray-500 italic">No SCIM tenants found for this provider.</div>
                    ) : (
                        <ul className="space-y-3">
                            {tenants.map(t => (
                                <li key={t.name} className="border border-gray-700 rounded p-2 bg-gray-800">
                                    <div className="flex justify-between items-center mb-1">
                                        <strong className="text-blue-400 text-sm">{t.displayName || 'No Name'}</strong>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${t.state === 'ACTIVE' ? 'bg-green-900/50 text-green-400 border border-green-700' : 'bg-red-900/50 text-red-400 border border-red-700'}`}>{t.state}</span>
                                    </div>
                                    <div className="text-gray-400 mb-1"><strong className="text-gray-500">ID:</strong> <span className="text-gray-300 font-mono text-[10px]">{t.name.split('/').pop()}</span></div>
                                    <div className="text-gray-400 break-all mb-1"><strong className="text-gray-500">Service Agent:</strong> <br/><span className="text-gray-300 font-mono text-[10px]">{t.serviceAgent}</span></div>
                                    <div className="text-gray-400 break-all"><strong className="text-gray-500">Base URI:</strong> <br/><span className="text-gray-300 font-mono text-[10px]"><a href={t.baseUri} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">{t.baseUri}</a></span></div>
                                    
                                    {t.claimMapping && (
                                        <div className="mt-2">
                                            <strong className="text-gray-500 block mb-1">Claim Mappings:</strong>
                                            <ul className="pl-2 space-y-1 border-l-2 border-gray-700">
                                                {Object.entries(t.claimMapping).map(([key, val]) => (
                                                    <li key={key} className="flex justify-between text-[11px] font-mono"><span className="text-gray-300 truncate pr-2">{key}</span><span className="text-yellow-500 text-right truncate">{String(val)}</span></li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
};

const EngineDetailsForm: React.FC<EngineDetailsFormProps> = ({ engine, config, onUpdateSuccess, onLaunchWizard }) => {
    const [formData, setFormData] = useState({
        displayName: '',
        disableAnalytics: false,
        observabilityEnabled: false,
        sensitiveLoggingEnabled: false,
    });
    const [features, setFeatures] = useState<Record<string, boolean>>({});
    const [modelConfigs, setModelConfigs] = useState<Record<string, boolean>>({});
    const [idpData, setIdpData] = useState({
        idpType: 'IDP_TYPE_UNSPECIFIED',
        workforcePoolName: ''
    });
    const [originalIdpData, setOriginalIdpData] = useState({
        idpType: 'IDP_TYPE_UNSPECIFIED',
        workforcePoolName: ''
    });
    const [widgetConfig, setWidgetConfig] = useState<any>(null);
    const [originalWidgetConfig, setOriginalWidgetConfig] = useState<any>(null);
    const [isLoadingIdp, setIsLoadingIdp] = useState(false);
    const [idpProviders, setIdpProviders] = useState<any[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Known features list from API docs
    // Mapped to descriptive tooltips
    const FEATURE_INFO: Record<string, string> = {
        'agent-gallery': 'Enables the Agent Gallery for discovering and using agents.',
        'no-code-agent-builder': 'Allows users to build agents without writing code.',
        'prompt-gallery': 'Provides a library of example prompts.',
        'model-selector': 'Lets users switch between different AI models.',
        'notebook-lm': 'Enables NotebookLM features for document analysis.',
        'people-search': 'Allows searching for people within the organization.',
        'people-search-org-chart': 'Displays organizational charts in people search results.',
        'bi-directional-audio': 'Enables two-way audio interaction.',
        'feedback': 'Allows users to provide feedback on responses.',
        'session-sharing': 'Enables users to share their chat sessions.',
        'personalization-memory': 'Allows the AI to remember user preferences and context.',
        'personalization-suggested-highlights': 'Provides AI-suggested personalized highlights.',
        'disable-agent-sharing': 'Prevents users from sharing custom agents.',
        'agent-sharing-without-admin-approval': 'Allows users to share custom agents without needing explicit admin approval.',
        'disable-image-generation': 'Disables image generation capabilities.',
        'disable-video-generation': 'Disables video generation capabilities.',
        'disable-onedrive-upload': 'Prevents uploading files from OneDrive.',
        'disable-talk-to-content': 'Disables Q&A on specific content.',
        'disable-google-drive-upload': 'Prevents uploading files from Google Drive.',
        'disable-welcome-emails': 'Prevents sending welcome emails to new users.',
        'disable-canvas': 'Disables the canvas feature.',
        'disable-canvas-workspace': 'Disables the canvas workspace.',
        'disable-skills': 'Disables the use of specialized skills.'
    };

    const KNOWN_FEATURES = Object.keys(FEATURE_INFO);

    // Known model configs list
    const KNOWN_MODELS = [
        'gemini-3.1-pro',
        'gemini-3-pro-preview',
        'gemini-3-pro-image-preview',
        'gemini-2.5-flash-image',
        'gemini-3-flash',
        'gemini-2.5-pro',
        'gemini-2.5-flash'
    ];

    useEffect(() => {
        setFormData({
            displayName: engine.displayName || '',
            disableAnalytics: (engine as any).disableAnalytics || false,
            observabilityEnabled: engine.observabilityConfig?.observabilityEnabled || false,
            sensitiveLoggingEnabled: engine.observabilityConfig?.sensitiveLoggingEnabled || false,
        });

        const currentFeatures: Record<string, boolean> = {};
        // Initialize all known features to false/off unless present in engine
        KNOWN_FEATURES.forEach(f => {
            currentFeatures[f] = engine.features?.[f] === 'FEATURE_STATE_ON';
        });
        // Also capture any other features present in the engine
        if (engine.features) {
            Object.keys(engine.features).forEach(key => {
                currentFeatures[key] = engine.features![key] === 'FEATURE_STATE_ON';
            });
        }
        setFeatures(currentFeatures);

        const currentModels: Record<string, boolean> = {};
        // Initialize known models or those present in engine
        KNOWN_MODELS.forEach(m => {
            currentModels[m] = engine.modelConfigs?.[m] === 'MODEL_ENABLED';
        });
        if (engine.modelConfigs) {
            Object.keys(engine.modelConfigs).forEach(key => {
                currentModels[key] = engine.modelConfigs![key] === 'MODEL_ENABLED';
            });
        }
        setModelConfigs(currentModels);
    }, [engine]);

    useEffect(() => {
        const fetchConfigs = async () => {
            setIsLoadingIdp(true);
            try {
                 const [acl, widget] = await Promise.all([
                     api.getAclConfig(config).catch(e => { console.error("Acl error", e); return null; }),
                     api.getWidgetConfig(engine.name, config).catch(e => { console.error("Widget error", e); return null; })
                 ]);

                 if (acl) {
                     const type = acl.idpConfig?.idpType || 'IDP_TYPE_UNSPECIFIED';
                     const poolName = acl.idpConfig?.externalIdpConfig?.workforcePoolName || '';
                     setIdpData({ idpType: type, workforcePoolName: poolName });
                     setOriginalIdpData({ idpType: type, workforcePoolName: poolName });

                     if (type === 'THIRD_PARTY' && poolName) {
                         const providerData = await api.getWorkforcePoolProviders(poolName, config);
                         if (providerData && providerData.workforcePoolProviders) {
                             setIdpProviders(providerData.workforcePoolProviders);
                         }
                     }
                 }

                 if (widget) {
                     setWidgetConfig(widget);
                     setOriginalWidgetConfig(JSON.parse(JSON.stringify(widget)));
                 } else {
                     const newConfig = { name: `${engine.name}/widgetConfigs/default_search_widget_config`, accessSettings: {} };
                     setWidgetConfig(newConfig);
                     setOriginalWidgetConfig(JSON.parse(JSON.stringify(newConfig)));
                 }
            } catch (e) {
                 console.error("Failed to load configs:", e);
                 // Gracefully fallback
            } finally {
                 setIsLoadingIdp(false);
            }
        };
        fetchConfigs();
    }, [config, engine.name]);




    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setFormData({ ...formData, [e.target.name]: value });
    };

    const handleFeatureChange = (feature: string) => {
        setFeatures(prev => ({
            ...prev,
            [feature]: !prev[feature]
        }));
    };

    const handleModelChange = (model: string) => {
        setModelConfigs(prev => ({
            ...prev,
            [model]: !prev[model]
        }));
    };

    const handleIdpChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
        setIdpData({ ...idpData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);
        setSuccess(null);

        try {
            const payload: any = {};
            const updateMask: string[] = [];

            if (formData.displayName !== engine.displayName) {
                payload.displayName = formData.displayName;
                updateMask.push('displayName');
            }

            if (formData.disableAnalytics !== ((engine as any).disableAnalytics || false)) {
                payload.disableAnalytics = formData.disableAnalytics;
                updateMask.push('disableAnalytics');
            }

            const currentObservability = engine.observabilityConfig?.observabilityEnabled || false;
            const currentSensitive = engine.observabilityConfig?.sensitiveLoggingEnabled || false;

            if (formData.observabilityEnabled !== currentObservability || formData.sensitiveLoggingEnabled !== currentSensitive) {
                payload.observabilityConfig = {
                    observabilityEnabled: formData.observabilityEnabled,
                    sensitiveLoggingEnabled: formData.sensitiveLoggingEnabled
                };
                updateMask.push('observabilityConfig');
            }

            // Calculate idp config changes
            let idpChanged = false;
            if (idpData.idpType !== originalIdpData.idpType || (idpData.idpType === 'THIRD_PARTY' && idpData.workforcePoolName !== originalIdpData.workforcePoolName)) {
                const aclPayload: any = {
                    idpConfig: {
                        idpType: idpData.idpType,
                    }
                };
                if (idpData.idpType === 'THIRD_PARTY') {
                    aclPayload.idpConfig.externalIdpConfig = { workforcePoolName: idpData.workforcePoolName };
                }
                const aclUpdateMask = ['idpConfig'];
                await api.updateAclConfig(aclPayload, aclUpdateMask, config);
                idpChanged = true;
            }

            // Calculate widget config changes
            let widgetChanged = false;
            if (widgetConfig && originalWidgetConfig) {
                const currentProvider = widgetConfig.accessSettings?.workforceIdentityPoolProvider || '';
                const origProvider = originalWidgetConfig.accessSettings?.workforceIdentityPoolProvider || '';
                if (currentProvider !== origProvider) {
                    await api.updateWidgetConfig(engine.name, { accessSettings: widgetConfig.accessSettings }, ['accessSettings'], config);
                    widgetChanged = true;
                }
            }

            // Calculate changed features
            const newFeaturesMap: Record<string, string> = { ...engine.features };
            let featuresChanged = false;

            Object.entries(features).forEach(([key, isEnabled]) => {
                const newState = isEnabled ? 'FEATURE_STATE_ON' : 'FEATURE_STATE_OFF';
                if (newFeaturesMap[key] !== newState) {
                    newFeaturesMap[key] = newState;
                    featuresChanged = true;
                }
            });

            if (featuresChanged) {
                payload.features = newFeaturesMap;
                updateMask.push('features');
            }

            // Calculate changed model configs
            const newModelConfigsMap: Record<string, string> = { ...engine.modelConfigs };
            let modelsChanged = false;

            Object.entries(modelConfigs).forEach(([key, isEnabled]) => {
                const newState = isEnabled ? 'MODEL_ENABLED' : 'MODEL_DISABLED';
                if (newModelConfigsMap[key] !== newState) {
                    newModelConfigsMap[key] = newState;
                    modelsChanged = true;
                }
            });

            if (modelsChanged) {
                payload.modelConfigs = newModelConfigsMap;
                updateMask.push('modelConfigs');
            }

            if (updateMask.length === 0 && !idpChanged && !widgetChanged) {
                setSuccess("No changes detected.");
                setTimeout(() => setSuccess(null), 3000);
                setIsSubmitting(false);
                return;
            }

            if (updateMask.length > 0) {
                const updatedEngine = await api.updateEngine(engine.name, payload, updateMask, config);
                onUpdateSuccess(updatedEngine);
            }

            if (idpChanged) {
               setOriginalIdpData(idpData); // keep it synced
            }

            if (widgetChanged) {
               setOriginalWidgetConfig(JSON.parse(JSON.stringify(widgetConfig)));
            }

            setSuccess("Engine updated successfully!");
            setTimeout(() => setSuccess(null), 3000);

        } catch (err: any) {
            setError(err.message || 'Failed to update engine.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="bg-gray-800 shadow-xl rounded-lg p-6 mb-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">Engine Configuration</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="displayName" className="block text-sm font-medium text-gray-300">Display Name</label>
                    <input type="text" name="displayName" value={formData.displayName} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-gray-200" />
                </div>

                <div className="flex items-center space-x-3">
                    <input type="checkbox" name="disableAnalytics" id="disableAnalytics" checked={Boolean(formData.disableAnalytics)} onChange={handleChange} className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500" />
                    <label htmlFor="disableAnalytics" className="flex items-center text-sm font-medium text-gray-300">
                        Disable Analytics
                        <InfoTooltip text="Disables the collection of analytics data for this engine." />
                    </label>
                </div>

                <CollapsibleSection title="Usage Audit Logging (Observability)">
                    <div className="space-y-4 p-4 bg-gray-900/30 rounded-md">
                        {onLaunchWizard && (
                            <div className="flex justify-between items-center border-b border-gray-700 pb-2 mb-2">
                                <span className="text-xs text-gray-400">Configure project-level audit logs and links.</span>
                                <button 
                                    type="button" 
                                    onClick={onLaunchWizard}
                                    className="flex items-center gap-1 text-xs bg-blue-900/50 hover:bg-blue-800/60 text-blue-300 border border-blue-700 px-2 py-1 rounded transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                    Launch Wizard
                                </button>
                            </div>
                        )}
                        <div className="flex items-center space-x-3 cursor-pointer">
                            <input
                                type="checkbox"
                                name="observabilityEnabled"
                                id="observabilityEnabled"
                                checked={Boolean(formData.observabilityEnabled)}
                                onChange={handleChange}
                                className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500"
                            />
                            <label htmlFor="observabilityEnabled" className="flex items-center text-sm font-medium text-gray-300 cursor-pointer">
                                Enable Usage Audit Logging
                                <InfoTooltip text="Captures request and response data, including prompts and grounding metadata, and stores it in Cloud Logging." />
                            </label>
                        </div>
                        
                        <div className={`flex items-center space-x-3 pl-6 transition-opacity ${formData.observabilityEnabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                            <input
                                type="checkbox"
                                name="sensitiveLoggingEnabled"
                                id="sensitiveLoggingEnabled"
                                checked={Boolean(formData.sensitiveLoggingEnabled)}
                                onChange={handleChange}
                                disabled={!formData.observabilityEnabled}
                                className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500"
                            />
                            <label htmlFor="sensitiveLoggingEnabled" className="flex items-center text-sm font-medium text-gray-300 cursor-pointer">
                                Enable Sensitive Data Logging
                                <InfoTooltip text="WARNING: Sensitive data isn't filtered out of the audit logs when this is enabled." />
                            </label>
                        </div>
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title="Identity Provider (IDP) Configuration (Applies to Location)">
                    <div className="space-y-4 p-4 bg-gray-900/30 rounded-md">
                        {isLoadingIdp ? (
                             <div className="text-gray-400 text-sm">Loading IDP Configuration...</div>
                        ) : (
                        <>
                        <div className="bg-yellow-900/40 border border-yellow-700 p-3 rounded-md mb-4">
                            <p className="text-yellow-400 text-sm">
                                <strong>Warning:</strong> IDP Configuration is shared across all engines in the <code>{config.appLocation}</code> location. Changing this setting will affect access to all data sources in this region.
                            </p>
                        </div>
                        <div>
                            <label htmlFor="idpType" className="block text-sm font-medium text-gray-300 mb-1">
                                IDP Type <InfoTooltip text="Configure the Identity Provider used for data source access control." />
                            </label>
                            <select
                                name="idpType"
                                value={idpData.idpType}
                                onChange={handleIdpChange}
                                className="block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm text-gray-200 focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2 px-3 h-[42px]"
                            >
                                <option value="IDP_TYPE_UNSPECIFIED">None (Unspecified)</option>
                                <option value="GSUITE">Google Workspace / Cloud Identity (GSUITE)</option>
                                <option value="THIRD_PARTY">Third-Party IdP via Workforce Identity Federation</option>
                            </select>
                        </div>

                        {idpData.idpType === 'THIRD_PARTY' && (
                            <div className="animate-fade-in-up mt-4">
                                <label htmlFor="workforcePoolName" className="block text-sm font-medium text-gray-300">
                                    Workforce Identity Pool Name
                                </label>
                                <input
                                    type="text"
                                    name="workforcePoolName"
                                    value={idpData.workforcePoolName}
                                    onChange={handleIdpChange}
                                    placeholder="locations/global/workforcePools/my-pool"
                                    className="mt-1 block w-full bg-gray-800 border-gray-600 rounded-md shadow-sm text-gray-200 sm:text-sm font-mono placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500 py-2 px-3"
                                    required={idpData.idpType === 'THIRD_PARTY'}
                                />
                            </div>
                        )}

                        {/* Render Identity Providers if we loaded any */}
                        {idpProviders.length > 0 && (
                                <div className="mt-6 space-y-4 border-t border-gray-700 pt-4">
                                    <h4 className="text-md font-medium text-gray-200 mb-2">Attached Providers</h4>
                                    <p className="text-sm text-gray-400 mb-4">Select the default provider that the Gemini Web App should use for authentication.</p>
                                    



                                    {idpProviders.map((provider: any, idx) => {
                                        const isSelected = widgetConfig?.accessSettings?.workforceIdentityPoolProvider === provider.name;
                                        return (
                                        <div key={idx} className={`border rounded-md p-4 text-sm transition-colors ${isSelected ? 'bg-blue-900/40 border-blue-500' : 'bg-gray-800 border-gray-600'}`}>
                                            <div className="flex justify-between items-center mb-3">
                                                <label className="flex items-center space-x-3 cursor-pointer group">
                                                    <input 
                                                        type="radio" 
                                                        name="activeProvider" 
                                                        checked={isSelected}
                                                        onChange={() => setWidgetConfig({
                                                            ...widgetConfig,
                                                            name: widgetConfig?.name || '',
                                                            accessSettings: {
                                                                ...widgetConfig?.accessSettings,
                                                                workforceIdentityPoolProvider: provider.name
                                                            }
                                                        })}
                                                        className="h-4 w-4 bg-gray-700 border-gray-500 text-blue-500 focus:ring-blue-500 focus:ring-opacity-50"
                                                    />
                                                    <span className="font-semibold text-white group-hover:text-blue-300 transition-colors">{provider.displayName || provider.name.split('/').pop()}</span>
                                                    {isSelected && <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full ml-2">Active</span>}
                                                </label>
                                                <span className="bg-gray-900 text-gray-300 px-2 py-1 rounded text-xs font-mono border border-gray-700">{provider.name.split('/').pop()}</span>
                                            </div>
                                            
                                            {provider.saml && (
                                                <div className="space-y-2 text-gray-300">
                                                    <div><strong className="text-gray-400">Protocol:</strong> SAML</div>
                                                    <div>
                                                        <strong className="text-gray-400">SSO Redirect URL:</strong>
                                                        <span className="font-mono text-xs block text-blue-400 break-all bg-gray-900/50 p-1 rounded mt-1 select-all">
                                                            https://auth.cloud.google/signin-callback/{provider.name}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <strong className="text-gray-400">Entity ID:</strong>
                                                        <span className="font-mono text-xs block text-blue-400 break-all bg-gray-900/50 p-1 rounded mt-1 select-all">
                                                            https://iam.googleapis.com/{provider.name}
                                                        </span>
                                                    </div>
                                                    <div><strong className="text-gray-400">SAML Metadata:</strong> <span className="font-mono text-xs block truncate" title={provider.saml.idpMetadataXml ? 'Included in XML metadata' : 'Unknown'}>{provider.saml.idpMetadataXml ? '(See SAML Metadata XML)' : 'Not Set'}</span></div>
                                                </div>
                                            )}
                                            {provider.oidc && (
                                                <div className="space-y-2 text-gray-300">
                                                    <div><strong className="text-gray-400">Protocol:</strong> OIDC</div>
                                                    <div>
                                                        <strong className="text-gray-400">SSO Redirect URL:</strong>
                                                        <span className="font-mono text-xs block text-blue-400 break-all bg-gray-900/50 p-1 rounded mt-1 select-all">
                                                            https://auth.cloud.google/signin-callback/{provider.name}
                                                        </span>
                                                    </div>
                                                    <div><strong className="text-gray-400">Issuer URI:</strong> <a href={provider.oidc.issuerUri} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline break-all">{provider.oidc.issuerUri}</a></div>
                                                    <div><strong className="text-gray-400">Client ID:</strong> <span className="font-mono text-xs break-all">{provider.oidc.clientId}</span></div>
                                                </div>
                                            )}

                                            <div className="mt-4 pt-3 border-t border-gray-700">
                                                <strong className="text-gray-400 block mb-2">Attribute Mappings:</strong>
                                                <div className="bg-gray-900 rounded p-2">
                                                    {provider.attributeMapping ? (
                                                        <ul className="space-y-1 font-mono text-xs">
                                                            {Object.entries(provider.attributeMapping).map(([key, val]) => (
                                                                <li key={key} className="flex flex-col sm:flex-row sm:justify-between border-b border-gray-800 last:border-0 pb-1">
                                                                    <span className="text-green-400 truncate pr-2">{key}</span>
                                                                    <span className="text-yellow-400 truncate">{String(val)}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    ) : (
                                                        <span className="text-gray-500 italic">No attribute mappings configured</span>
                                                    )}
                                                </div>
                                            </div>

                                            {provider.attributeCondition && (
                                                <div className="mt-3">
                                                    <strong className="text-gray-400 block mb-1">Attribute Condition:</strong>
                                                    <div className="bg-gray-900 rounded p-2 text-xs font-mono text-purple-400 break-all">
                                                        {provider.attributeCondition}
                                                    </div>
                                                </div>
                                            )}

                                            <ScimTenantsList providerName={provider.name} config={config} />

                                        </div>
                                    )})}
                                </div>
                            )}
                        </>
                        )}
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title="Feature Management">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-gray-900/30 rounded-md">
                        {KNOWN_FEATURES.map(feature => (
                            <label key={feature} className="flex items-center space-x-2 cursor-pointer p-2 hover:bg-gray-800 rounded transition-colors">
                                <input
                                    type="checkbox"
                                    checked={features[feature] || false}
                                    onChange={() => handleFeatureChange(feature)}
                                    className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500 flex-shrink-0"
                                />
                                <span className="text-sm text-gray-300 break-words truncate">{feature}</span>
                                <InfoTooltip text={FEATURE_INFO[feature] || feature} />
                            </label>
                        ))}
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title="Model Configuration">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-gray-900/30 rounded-md">
                        {KNOWN_MODELS.map(model => (
                            <label key={model} className="flex items-center space-x-2 cursor-pointer p-2 hover:bg-gray-800 rounded transition-colors">
                                <input
                                    type="checkbox"
                                    checked={modelConfigs[model] || false}
                                    onChange={() => handleModelChange(model)}
                                    className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500 flex-shrink-0"
                                />
                                <span className="text-sm text-gray-300 break-words truncate">{model}</span>
                                {/* Generic tooltip for models as we don't have descriptions in api docs for each */}
                                <InfoTooltip text={`Enable or disable the ${model} model.`} />
                            </label>
                        ))}
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title="Prompt Chips Administration">
                    <div className="p-4 bg-gray-900/30 rounded-md">
                        <PromptChipsTable engineName={engine.name} />
                    </div>
                </CollapsibleSection>

                {error && <p className="text-red-400 text-sm">{error}</p>}
                {success && <p className="text-green-400 text-sm">{success}</p>}

                <div className="flex justify-end pt-4 border-t border-gray-700">
                    <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:bg-blue-800">
                        {isSubmitting ? 'Saving...' : 'Save Engine Changes'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default EngineDetailsForm;
