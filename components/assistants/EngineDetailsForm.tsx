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

interface FeatureDefinition {
    key: string;
    displayName: string;
    description: string;
    isInverted: boolean;
}

const FEATURE_DEFS: FeatureDefinition[] = [
    { key: 'agent-gallery', displayName: 'Enable Agent Gallery', description: 'Enables the Agent Gallery for discovering and using agents.', isInverted: false },
    { key: 'no-code-agent-builder', displayName: 'Enable No-Code Agent Builder', description: 'Allows users to build agents without writing code.', isInverted: false },
    { key: 'prompt-gallery', displayName: 'Enable Prompt Gallery', description: 'Provides a library of example prompts.', isInverted: false },
    { key: 'model-selector', displayName: 'Enable Model Selector', description: 'Lets users switch between different AI models.', isInverted: false },
    { key: 'notebook-lm', displayName: 'Enable NotebookLM features', description: 'Enables NotebookLM features for document analysis.', isInverted: false },
    { key: 'people-search', displayName: 'Enable People Search', description: 'Allows searching for people within the organization.', isInverted: false },
    { key: 'people-search-org-chart', displayName: 'Enable Org Chart in People Search', description: 'Displays organizational charts in people search results.', isInverted: false },
    { key: 'bi-directional-audio', displayName: 'Enable Bi-directional Audio', description: 'Enables two-way audio interaction.', isInverted: false },
    { key: 'feedback', displayName: 'Enable Quality Feedback', description: 'Allows users to provide feedback on responses.', isInverted: false },
    { key: 'session-sharing', displayName: 'Enable Session Sharing', description: 'Enables users to share their chat sessions.', isInverted: false },
    { key: 'personalization-memory', displayName: 'Enable Personalization Memory', description: 'Allows the AI to remember user preferences and context.', isInverted: false },
    { key: 'personalization-suggested-highlights', displayName: 'Enable Suggested Highlights', description: 'Provides AI-suggested personalized highlights.', isInverted: false },
    { key: 'disable-agent-sharing', displayName: 'Enable Agent Sharing', description: 'Allows team members to share and use agents within the team.', isInverted: true },
    { key: 'disable-image-generation', displayName: 'Enable Image Generation', description: 'Allows users to generate images in the web app.', isInverted: true },
    { key: 'disable-video-generation', displayName: 'Enable Video Generation', description: 'Allows users to generate videos in the web app.', isInverted: true },
    { key: 'disable-onedrive-upload', displayName: 'Enable OneDrive upload', description: 'Allows users to upload files from OneDrive as a data source.', isInverted: true },
    { key: 'disable-talk-to-content', displayName: 'Enable Talk to Content', description: 'Allows users to chat with and ask questions on specific content.', isInverted: true },
    { key: 'disable-google-drive-upload', displayName: 'Enable Google Drive upload', description: 'Allows users to upload files from Google Drive as a data source.', isInverted: true },
    { key: 'disable-welcome-emails', displayName: 'Enable Welcome Emails', description: 'Sends welcome emails to new users when they are added.', isInverted: true },
    { key: 'disable-skills', displayName: 'Enable specialized skills', description: 'Allows the assistant to use specialized developer skills.', isInverted: true },
    { key: 'disable-canvas', displayName: 'Enable Canvas', description: 'Enables side-by-side interactive document and slide generation.', isInverted: true },
    { key: 'disable-canvas-workspace', displayName: 'Enable Canvas Workspace', description: 'Allows users to interact with Canvas workspace views.', isInverted: true },

    { key: 'agent-sharing-without-admin-approval', displayName: 'Enable agent sharing without admin approval', description: 'Allows sharing agents with other team members without admin approval.', isInverted: false },
    { key: 'enable-end-user-sharing-with-groups', displayName: 'Enable sharing custom agents with Groups', description: 'Allows sharing custom agents with Google Groups.', isInverted: false },
    { key: 'cross-product-intelligence', displayName: 'Enable Cross-product Intelligence', description: 'Integrates contextual insights across workspace apps.', isInverted: false }
];

const EngineDetailsForm: React.FC<EngineDetailsFormProps> = ({ engine, config, onUpdateSuccess, onLaunchWizard }) => {
    const [formData, setFormData] = useState({
        displayName: '',
        disableAnalytics: false,
        observabilityEnabled: false,
        sensitiveLoggingEnabled: false,
        marketplaceAgentVisibility: 'MARKETPLACE_AGENT_VISIBILITY_UNSPECIFIED',
        searchTier: 'SEARCH_TIER_STANDARD',
        searchAddOnLlm: false,
        enableWebApp: false,
        enableAutocomplete: false,
        enableQualityFeedback: false,
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
    const [customIdp, setCustomIdp] = useState('');
    const [customTenantId, setCustomTenantId] = useState('');
    const [customClientId, setCustomClientId] = useState('');

    const computedDeeplinkUrl = (() => {
        if (engine.mobileDeeplinkUrl) return engine.mobileDeeplinkUrl;

        const widgetId = engine.widgetConfigConfigId || (widgetConfig?.name ? widgetConfig.name.split('/').pop() : 'default_search_widget_config');
        const projectNumber = engine.name?.split('/')[1] || config.projectId;

        if (idpData.idpType === 'GSUITE') {
            return `https://vertexaisearch.cloud.google.com/mobile?cid=${widgetId}&cid_location=${config.appLocation}`;
        }

        if (idpData.idpType === 'THIRD_PARTY' && widgetConfig?.accessSettings?.workforceIdentityPoolProvider) {
            const providerName = widgetConfig.accessSettings.workforceIdentityPoolProvider;
            const activeProvider = idpProviders.find(p => p.name === providerName);
            
            let url = `https://vertexaisearch.cloud.google.com/mobile?cid=${widgetId}&cid_location=${config.appLocation}&idp=${encodeURIComponent(providerName)}&project_id=${projectNumber}`;
            
            if (activeProvider?.oidc) {
                const clientId = activeProvider.oidc.clientId || '';
                const tenantIdMatch = activeProvider.oidc.issuerUri?.match(/microsoftonline\.com\/([a-zA-Z0-9-]+)/);
                const tenantId = tenantIdMatch ? tenantIdMatch[1] : '';
                
                if (clientId) url += `&client_id=${clientId}`;
                if (tenantId) url += `&tenant_id=${tenantId}`;
            }
            return url;
        }

        return '';
    })();

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
            marketplaceAgentVisibility: (engine as any).marketplaceAgentVisibility || 'MARKETPLACE_AGENT_VISIBILITY_UNSPECIFIED',
            searchTier: engine.searchEngineConfig?.searchTier || 'SEARCH_TIER_STANDARD',
            searchAddOnLlm: engine.searchEngineConfig?.searchAddOns?.includes('SEARCH_ADD_ON_LLM') || false,
            enableWebApp: widgetConfig?.accessSettings?.enableWebApp || false,
            enableAutocomplete: widgetConfig?.uiSettings?.enableAutocomplete || false,
            enableQualityFeedback: widgetConfig?.uiSettings?.enableQualityFeedback || false,
        });

        const currentFeatures: Record<string, boolean> = {};
        // Initialize based on FEATURE_DEFS mapping logic
        FEATURE_DEFS.forEach(f => {
            const apiVal = engine.features?.[f.key];
            if (f.isInverted) {
                // Inverted: if API is not FEATURE_STATE_ON (i.e. is OFF or undefined), then it is enabled (true).
                currentFeatures[f.key] = apiVal !== 'FEATURE_STATE_ON';
            } else {
                // Direct: if API is FEATURE_STATE_ON, it is enabled (true).
                currentFeatures[f.key] = apiVal === 'FEATURE_STATE_ON';
            }
        });

        // Explicitly read mobile app access (legacy key, inverted)
        const disableMobileVal = engine.features?.['disable-mobile-app-access'];
        currentFeatures['disable-mobile-app-access'] = disableMobileVal !== 'FEATURE_STATE_ON';

        // Explicitly read QR code login (new key, direct)
        const qrCodeVal = engine.features?.['mobile-app-access'];
        currentFeatures['mobile-app-access'] = qrCodeVal !== undefined
            ? qrCodeVal === 'FEATURE_STATE_ON'
            : !!(engine.mobileDeeplinkUrl || computedDeeplinkUrl);

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
    }, [engine, widgetConfig, idpData, idpProviders]);

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




    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
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

            if (formData.marketplaceAgentVisibility !== ((engine as any).marketplaceAgentVisibility || 'MARKETPLACE_AGENT_VISIBILITY_UNSPECIFIED')) {
                payload.marketplaceAgentVisibility = formData.marketplaceAgentVisibility;
                updateMask.push('marketplaceAgentVisibility');
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

            const currentSearchTier = engine.searchEngineConfig?.searchTier || 'SEARCH_TIER_STANDARD';
            const currentLlmAddon = engine.searchEngineConfig?.searchAddOns?.includes('SEARCH_ADD_ON_LLM') || false;

            if (formData.searchTier !== currentSearchTier || formData.searchAddOnLlm !== currentLlmAddon) {
                const addons = [];
                if (formData.searchAddOnLlm) {
                    addons.push('SEARCH_ADD_ON_LLM');
                }
                payload.searchEngineConfig = {
                    searchTier: formData.searchTier,
                    searchAddOns: addons
                };
                updateMask.push('searchEngineConfig');
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
                await api.updateAclConfig(aclPayload, config);
                idpChanged = true;
            }

            // Calculate widget config changes
            let widgetChanged = false;
            if (widgetConfig && originalWidgetConfig) {
                const currentProvider = widgetConfig.accessSettings?.workforceIdentityPoolProvider || '';
                const origProvider = originalWidgetConfig.accessSettings?.workforceIdentityPoolProvider || '';

                const currentEnableWebApp = formData.enableWebApp;
                const origEnableWebApp = originalWidgetConfig.accessSettings?.enableWebApp || false;

                const currentAutocomplete = formData.enableAutocomplete;
                const origAutocomplete = originalWidgetConfig.uiSettings?.enableAutocomplete || false;

                const currentFeedback = formData.enableQualityFeedback;
                const origFeedback = originalWidgetConfig.uiSettings?.enableQualityFeedback || false;

                if (currentProvider !== origProvider || currentEnableWebApp !== origEnableWebApp || currentAutocomplete !== origAutocomplete || currentFeedback !== origFeedback) {
                    const updatePayload: any = {
                        accessSettings: {
                            ...widgetConfig.accessSettings,
                            enableWebApp: currentEnableWebApp,
                            workforceIdentityPoolProvider: currentProvider || null
                        },
                        uiSettings: {
                            ...widgetConfig.uiSettings,
                            enableAutocomplete: currentAutocomplete,
                            enableQualityFeedback: currentFeedback
                        }
                    };

                    const widgetMask = [];
                    if (currentProvider !== origProvider || currentEnableWebApp !== origEnableWebApp) {
                        widgetMask.push('accessSettings');
                    }
                    if (currentAutocomplete !== origAutocomplete || currentFeedback !== origFeedback) {
                        widgetMask.push('uiSettings');
                    }

                    const updatedWidget = await api.updateWidgetConfig(engine.name, updatePayload, widgetMask, config);
                    setWidgetConfig(updatedWidget);
                    widgetChanged = true;
                }
            }

            // Calculate changed features
            const newFeaturesMap: Record<string, string> = { ...engine.features };
            let featuresChanged = false;

            FEATURE_DEFS.forEach(f => {
                const isEnabled = features[f.key];
                let apiState: string;
                if (f.isInverted) {
                    apiState = isEnabled ? 'FEATURE_STATE_OFF' : 'FEATURE_STATE_ON';
                } else {
                    apiState = isEnabled ? 'FEATURE_STATE_ON' : 'FEATURE_STATE_OFF';
                }

                if (newFeaturesMap[f.key] !== apiState) {
                    newFeaturesMap[f.key] = apiState;
                    featuresChanged = true;
                }
            });

            // Explicitly set both mobile app access keys independently
            const mobileEnabled = features['disable-mobile-app-access'];
            const disableMobileState = mobileEnabled ? 'FEATURE_STATE_OFF' : 'FEATURE_STATE_ON';

            const qrCodeEnabled = features['mobile-app-access'];

            if (newFeaturesMap['disable-mobile-app-access'] !== disableMobileState) {
                newFeaturesMap['disable-mobile-app-access'] = disableMobileState;
                featuresChanged = true;
            }

            if (qrCodeEnabled) {
                if (newFeaturesMap['mobile-app-access'] !== 'FEATURE_STATE_ON') {
                    newFeaturesMap['mobile-app-access'] = 'FEATURE_STATE_ON';
                    featuresChanged = true;
                }
            } else {
                if (newFeaturesMap['mobile-app-access'] !== undefined) {
                    delete newFeaturesMap['mobile-app-access'];
                    featuresChanged = true;
                }
            }

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

            // Calculate changed mobileDeeplinkUrl
            const expectedUrl = qrCodeEnabled ? computedDeeplinkUrl : '';
            if ((engine.mobileDeeplinkUrl || '') !== expectedUrl) {
                payload.mobileDeeplinkUrl = expectedUrl;
                updateMask.push('mobileDeeplinkUrl');
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

                <div>
                    <label htmlFor="marketplaceAgentVisibility" className="block text-sm font-medium text-gray-300 mb-1">
                        Marketplace Agent Visibility <InfoTooltip text="Configures which marketplace agents are visible to end-users in the agent gallery." />
                    </label>
                    <select
                        name="marketplaceAgentVisibility"
                        value={formData.marketplaceAgentVisibility}
                        onChange={handleChange}
                        className="block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-gray-200 focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2 px-3 h-[42px]"
                    >
                        <option value="MARKETPLACE_AGENT_VISIBILITY_UNSPECIFIED">Default / Unspecified</option>
                        <option value="SHOW_AVAILABLE_AGENTS_ONLY">Only Available Agents</option>
                        <option value="SHOW_AGENTS_ALREADY_INTEGRATED">Agents Already Integrated</option>
                        <option value="SHOW_AGENTS_ALREADY_PURCHASED">Agents Already Purchased</option>
                        <option value="SHOW_ALL_AGENTS">Show All Marketplace Agents</option>
                    </select>
                </div>

                <div className="flex items-center space-x-3">
                    <input type="checkbox" name="disableAnalytics" id="disableAnalytics" checked={Boolean(formData.disableAnalytics)} onChange={handleChange} className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500" />
                    <label htmlFor="disableAnalytics" className="flex items-center text-sm font-medium text-gray-300">
                        Disable Analytics
                        <InfoTooltip text="Disables the collection of analytics data for this engine." />
                    </label>
                </div>

                <CollapsibleSection title="Feature Management">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-gray-900/30 rounded-md">
                        {FEATURE_DEFS.map(feature => (
                            <label key={feature.key} className="flex items-center space-x-2 cursor-pointer p-2 hover:bg-gray-800 rounded transition-colors">
                                <input
                                    type="checkbox"
                                    checked={features[feature.key] || false}
                                    onChange={() => handleFeatureChange(feature.key)}
                                    className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500 flex-shrink-0"
                                />
                                <span className="text-sm text-gray-300 break-words truncate">{feature.displayName}</span>
                                <InfoTooltip text={feature.description} />
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

                <CollapsibleSection title="Search Engine Configuration">
                    <div className="space-y-4 p-4 bg-gray-900/30 rounded-md">
                        <div>
                            <label htmlFor="searchTier" className="block text-sm font-medium text-gray-300 mb-1">
                                Search Tier <InfoTooltip text="Configures the capabilities and pricing tier of the search engine (Standard vs Enterprise)." />
                            </label>
                            <select
                                name="searchTier"
                                value={formData.searchTier}
                                onChange={handleChange}
                                className="block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm text-gray-200 focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2 px-3 h-[42px]"
                            >
                                <option value="SEARCH_TIER_STANDARD">Standard Search Tier</option>
                                <option value="SEARCH_TIER_ENTERPRISE">Enterprise Search Tier</option>
                            </select>
                        </div>
                        <div className="flex items-center space-x-3 cursor-pointer">
                            <input
                                type="checkbox"
                                name="searchAddOnLlm"
                                id="searchAddOnLlm"
                                checked={Boolean(formData.searchAddOnLlm)}
                                onChange={handleChange}
                                className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500"
                            />
                            <label htmlFor="searchAddOnLlm" className="flex items-center text-sm font-medium text-gray-300 cursor-pointer">
                                Enable AI Overview (Generative Answers Add-on)
                                <InfoTooltip text="Allows the search engine to use Large Language Models (LLM) to generate natural language summaries of search results." />
                            </label>
                        </div>
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title="Gemini Web App UI Settings">
                    <div className="space-y-4 p-4 bg-gray-900/30 rounded-md">
                        <div className="flex items-center space-x-3 cursor-pointer">
                            <input
                                type="checkbox"
                                name="enableWebApp"
                                id="enableWebApp"
                                checked={Boolean(formData.enableWebApp)}
                                onChange={handleChange}
                                className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500"
                            />
                            <label htmlFor="enableWebApp" className="flex items-center text-sm font-medium text-gray-300 cursor-pointer">
                                Enable User-Facing Web App Endpoint
                                <InfoTooltip text="Enables or disables the default Google-hosted web interface portal for this assistant/search app." />
                            </label>
                        </div>
                        <div className="flex items-center space-x-3 cursor-pointer">
                            <input
                                type="checkbox"
                                name="enableAutocomplete"
                                id="enableAutocomplete"
                                checked={Boolean(formData.enableAutocomplete)}
                                onChange={handleChange}
                                className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500"
                            />
                            <label htmlFor="enableAutocomplete" className="flex items-center text-sm font-medium text-gray-300 cursor-pointer">
                                Enable Autocomplete Suggestions
                                <InfoTooltip text="Shows matching autocomplete suggestion dropdowns as users type queries in the search/chat bar." />
                            </label>
                        </div>
                        <div className="flex items-center space-x-3 cursor-pointer">
                            <input
                                type="checkbox"
                                name="enableQualityFeedback"
                                id="enableQualityFeedback"
                                checked={Boolean(formData.enableQualityFeedback)}
                                onChange={handleChange}
                                className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500"
                            />
                            <label htmlFor="enableQualityFeedback" className="flex items-center text-sm font-medium text-gray-300 cursor-pointer">
                                Enable Thumbs Up/Down Quality Ratings
                                <InfoTooltip text="Renders standard quality rating feedback icons (thumbs up/down) next to assistant/chat replies." />
                            </label>
                        </div>
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title="Mobile App Link & QR Code">
                    <div className="space-y-4 p-4 bg-gray-900/30 rounded-md">
                        <div className="flex flex-col md:flex-row md:items-center gap-6 pb-3 border-b border-gray-700/60 mb-4">
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    id="mobileAppAccessToggle"
                                    checked={features['disable-mobile-app-access'] || false}
                                    onChange={() => setFeatures(prev => ({
                                        ...prev,
                                        'disable-mobile-app-access': !prev['disable-mobile-app-access']
                                    }))}
                                    className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm font-semibold text-white">
                                    Enable Mobile App Access
                                </span>
                                <InfoTooltip text="Allows users to connect to this app from their mobile devices." />
                            </label>

                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    id="qrCodeLoginToggle"
                                    checked={features['mobile-app-access'] || false}
                                    onChange={() => setFeatures(prev => ({
                                        ...prev,
                                        'mobile-app-access': !prev['mobile-app-access']
                                    }))}
                                    className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm font-semibold text-white">
                                    Enable QR Code Login widget
                                </span>
                                <InfoTooltip text="Displays the login QR code widget on the user's web app homepage." />
                            </label>
                        </div>

                        {computedDeeplinkUrl ? (
                            <div className="space-y-4">
                                <div className="p-3 bg-blue-900/20 border border-blue-700/50 rounded-md text-sm text-blue-200">
                                    <strong>Mobile Deep Link Active:</strong> Generated mobile app configuration link for this engine.
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1">Mobile URL</label>
                                    <div className="flex gap-2">
                                        <input type="text" value={computedDeeplinkUrl} className="flex-1 bg-gray-700 border-gray-600 rounded px-3 py-1.5 text-xs text-gray-300 font-mono" readOnly />
                                        <button
                                            type="button"
                                            onClick={() => navigator.clipboard.writeText(computedDeeplinkUrl)}
                                            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded text-xs border border-gray-600 transition-colors"
                                        >
                                            Copy
                                        </button>
                                    </div>
                                </div>
                                <div className="flex flex-col items-center justify-center p-6 bg-white rounded-lg border border-gray-700 w-fit mx-auto">
                                    <img 
                                        src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(computedDeeplinkUrl)}`} 
                                        alt="Mobile Login QR Code" 
                                        className="mb-2" 
                                    />
                                    <span className="text-[10px] text-gray-500 font-medium">Scan to login via Mobile App</span>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="p-3 bg-yellow-900/20 border border-yellow-800 rounded-md text-sm text-yellow-200">
                                    <strong>No Live Mobile Link Found:</strong> Ensure you have configured a workforce identity pool provider under the IDP Configuration section below. 
                                </div>
                                <div className="border-t border-gray-700 pt-4 space-y-3">
                                    <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">Preview / Manual Link Generator</h4>
                                    <p className="text-xs text-gray-400">If you want to construct or preview the QR code manually for this client app before it is provisioned on Google Cloud, fill in the parameters below:</p>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[10px] font-medium text-gray-400">Identity Provider (IDP)</label>
                                            <input 
                                                type="text" 
                                                value={customIdp} 
                                                onChange={(e) => setCustomIdp(e.target.value)} 
                                                placeholder="locations/global/workforcePools/my-pool/providers/my-provider" 
                                                className="mt-1 block w-full bg-gray-800 border-gray-600 rounded px-2 py-1 text-xs text-gray-200" 
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-medium text-gray-400">Entra Tenant ID</label>
                                            <input 
                                                type="text" 
                                                value={customTenantId} 
                                                onChange={(e) => setCustomTenantId(e.target.value)} 
                                                placeholder="5ae87d26-ea67..." 
                                                className="mt-1 block w-full bg-gray-800 border-gray-600 rounded px-2 py-1 text-xs text-gray-200" 
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-medium text-gray-400">Client ID (Workforce Pool Client)</label>
                                            <input 
                                                type="text" 
                                                value={customClientId} 
                                                onChange={(e) => setCustomClientId(e.target.value)} 
                                                placeholder="b56052a7-6ac1..." 
                                                className="mt-1 block w-full bg-gray-800 border-gray-600 rounded px-2 py-1 text-xs text-gray-200" 
                                            />
                                        </div>
                                    </div>
                                    
                                    {customIdp && customTenantId && customClientId && (
                                        <div className="pt-4 border-t border-gray-800 space-y-3 animate-fadeIn">
                                            <div>
                                                <label className="block text-[10px] font-medium text-gray-400 mb-1">Generated Preview URL</label>
                                                <div className="flex gap-2">
                                                    <input 
                                                        type="text" 
                                                        value={`https://vertexaisearch.cloud.google.com/mobile?cid=${widgetConfig?.accessSettings?.workforceIdentityPoolProvider ? widgetConfig.name.split('/').pop() : 'cid-placeholder'}&cid_location=${config.appLocation}&idp=${encodeURIComponent(customIdp)}&tenant_id=${customTenantId}&client_id=${customClientId}&project_id=${config.projectId || 'project-placeholder'}`} 
                                                        className="flex-1 bg-gray-700 border-gray-600 rounded px-2 py-1 text-xs text-gray-300 font-mono" 
                                                        readOnly 
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const url = `https://vertexaisearch.cloud.google.com/mobile?cid=${widgetConfig?.accessSettings?.workforceIdentityPoolProvider ? widgetConfig.name.split('/').pop() : 'cid-placeholder'}&cid_location=${config.appLocation}&idp=${encodeURIComponent(customIdp)}&tenant_id=${customTenantId}&client_id=${customClientId}&project_id=${config.projectId || 'project-placeholder'}`;
                                                            navigator.clipboard.writeText(url);
                                                        }}
                                                        className="px-2 py-1 bg-gray-850 text-white rounded text-xs border border-gray-600"
                                                    >
                                                        Copy
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-center justify-center p-4 bg-white rounded-lg border border-gray-700 w-fit mx-auto">
                                                <img 
                                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(`https://vertexaisearch.cloud.google.com/mobile?cid=${widgetConfig?.accessSettings?.workforceIdentityPoolProvider ? widgetConfig.name.split('/').pop() : 'cid-placeholder'}&cid_location=${config.appLocation}&idp=${encodeURIComponent(customIdp)}&tenant_id=${customTenantId}&client_id=${customClientId}&project_id=${config.projectId || 'project-placeholder'}`)}`} 
                                                    alt="Mobile Login QR Code Preview" 
                                                    className="mb-2" 
                                                />
                                                <span className="text-[10px] text-gray-500 font-medium">Scan to login (Preview Code)</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
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

                <CollapsibleSection title="Prompt Chips Administration">
                    <div className="p-4 bg-gray-900/30 rounded-md">
                        <PromptChipsTable engineName={engine.name} />
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title="Raw GE App Configuration JSON">
                    <div className="bg-gray-950 p-4 rounded-md border border-gray-800 relative group overflow-hidden">
                        <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-all overflow-y-auto max-h-[400px] p-2">
                            {JSON.stringify(engine, null, 2)}
                        </pre>
                        <button
                            type="button"
                            onClick={() => navigator.clipboard.writeText(JSON.stringify(engine, null, 2))}
                            className="absolute top-2 right-2 p-1.5 bg-gray-800 text-gray-400 rounded hover:text-white hover:bg-gray-700 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Copy JSON"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                        </button>
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
