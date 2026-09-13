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

import { useState, useEffect, useCallback, useMemo } from 'react';
import { AppEngine, Config, LicenseConfig, WidgetConfig, WorkloadIdentityProvider } from '../types';
import { toErrorMessage } from '../utils/errors';
import * as api from '../services/apiService';
import { FeatureDefinition, FEATURE_DEFS } from '../components/assistants/engine-details/featuresCatalog';
import {
    EnterpriseModel,
    STANDARD_ENTERPRISE_MODELS,
    formatModelDisplayName,
    getModelDefaultDescription
} from '../components/assistants/engine-details/modelsCatalog';

interface UseEngineDetailsFormParams {
    engine: AppEngine;
    config: Config;
    onUpdateSuccess: (updatedEngine: AppEngine) => void;
}

export function useEngineDetailsForm({ engine, config, onUpdateSuccess }: UseEngineDetailsFormParams) {
    const [formData, setFormData] = useState({
        displayName: '',
        disableAnalytics: false,
        observabilityEnabled: false,
        sensitiveLoggingEnabled: false,
        marketplaceAgentVisibility: 'MARKETPLACE_AGENT_VISIBILITY_UNSPECIFIED',
        searchTier: 'SEARCH_TIER_STANDARD',
        searchAddOnLlm: false,
        requiredSubscriptionTier: 'SUBSCRIPTION_TIER_UNSPECIFIED',
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
    const [widgetConfig, setWidgetConfig] = useState<WidgetConfig | null>(null);
    const [originalWidgetConfig, setOriginalWidgetConfig] = useState<WidgetConfig | null>(null);
    const [isLoadingIdp, setIsLoadingIdp] = useState(false);
    const [idpProviders, setIdpProviders] = useState<WorkloadIdentityProvider[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [showLegacyModels, setShowLegacyModels] = useState(false);
    const [projectLicenseConfigs, setProjectLicenseConfigs] = useState<LicenseConfig[]>([]);

    const allDynamicFeatures = useMemo(() => {
        const knownKeys = new Set(FEATURE_DEFS.map(f => f.key));
        const result: FeatureDefinition[] = [...FEATURE_DEFS];

        if (engine.features) {
            Object.keys(engine.features).forEach(k => {
                if (!knownKeys.has(k) && k !== 'disable-mobile-app-access' && k !== 'enable-qr-code-widget') {
                    const isDisable = k.startsWith('disable-');
                    const cleanName = k
                        .replace(/^disable-/, '')
                        .replace(/^enable-/, '')
                        .split('-')
                        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                        .join(' ');
                    result.push({
                        key: k,
                        displayName: `${cleanName} (Custom)`,
                        description: `Custom engine feature key (${k})`,
                        isInverted: isDisable,
                        category: 'Models & Intelligence'
                    });
                }
            });
        }

        return result;
    }, [engine.features]);

    const { activeModels, legacyModels } = useMemo(() => {
        const activeMap = new Map<string, EnterpriseModel>();
        const legacyList: EnterpriseModel[] = [];

        STANDARD_ENTERPRISE_MODELS.forEach(m => {
            activeMap.set(m.id, { ...m });
        });

        const uiSettings = widgetConfig?.uiSettings as { modelConfigInfo?: { resolvedModels?: Array<{ id?: string; name?: string; displayName?: string; modelId?: string; isPreview?: boolean; description?: string }> } } | undefined;
        const apiModels = uiSettings?.modelConfigInfo?.resolvedModels;
        if (apiModels && Array.isArray(apiModels)) {
            apiModels.forEach((m) => {
                if (m.modelId) {
                    const isPreview = Boolean(m.isPreview || m.modelId.includes('preview') || m.modelId.includes('exp'));
                    let category = 'Flash / Speed';
                    if (m.modelId.includes('image') || m.modelId.includes('vision')) {
                        category = 'Vision & Image';
                    } else if (m.modelId.includes('pro') || m.modelId.includes('ultra') || m.modelId.includes('thinking')) {
                        category = 'Pro / Reasoning';
                    }

                    activeMap.set(m.modelId, {
                        id: m.modelId,
                        displayName: m.displayName || formatModelDisplayName(m.modelId),
                        description: m.description || getModelDefaultDescription(m.modelId),
                        isPreview,
                        category
                    });
                }
            });
        }

        const extraKeys = new Set<string>();
        if (engine.modelConfigs) {
            Object.keys(engine.modelConfigs).forEach(id => {
                if (!activeMap.has(id)) extraKeys.add(id);
            });
        }
        if (widgetConfig?.uiSettings?.modelConfigs) {
            Object.keys(widgetConfig.uiSettings.modelConfigs).forEach(id => {
                if (!activeMap.has(id)) extraKeys.add(id);
            });
        }

        extraKeys.forEach(id => {
            const isPreview = id.includes('preview') || id.includes('exp');
            let category = 'Flash / Speed';
            if (id.includes('image') || id.includes('vision')) {
                category = 'Vision & Image';
            } else if (id.includes('pro') || id.includes('ultra') || id.includes('thinking')) {
                category = 'Pro / Reasoning';
            }

            const isKnownLegacy = ['gemini-3-flash-preview', 'gemini-3-pro-preview', 'gemini-3.1-pro', 'gemini-2.5-flash-image', 'gemini-3-flash'].includes(id);

            if (isKnownLegacy) {
                legacyList.push({
                    id,
                    displayName: `${formatModelDisplayName(id)} (Legacy)`,
                    description: `Legacy engine key (${id})`,
                    isPreview,
                    category
                });
            } else {
                activeMap.set(id, {
                    id,
                    displayName: formatModelDisplayName(id),
                    description: getModelDefaultDescription(id),
                    isPreview,
                    category
                });
            }
        });

        return {
            activeModels: Array.from(activeMap.values()),
            legacyModels: legacyList
        };
    }, [engine.modelConfigs, widgetConfig]);

    const dynamicModels = useMemo(() => {
        return showLegacyModels ? [...activeModels, ...legacyModels] : activeModels;
    }, [activeModels, legacyModels, showLegacyModels]);

    const getConstructedDeeplinkUrl = useCallback((): string | null => {
        const providerName = widgetConfig?.accessSettings?.workforceIdentityPoolProvider;
        if (!providerName) return null;

        const provider = idpProviders.find(p => p.name === providerName);
        if (!provider) return null;

        const widgetId = widgetConfig.configId || engine.widgetConfigConfigId;
        if (!widgetId) return null;

        const clientId = provider.oidc?.clientId || provider.saml?.entityId;
        if (!clientId) return null;

        let tenantId = '';
        const issuer = provider.oidc?.issuerUri || '';
        if (issuer.includes('login.microsoftonline.com')) {
            const matches = issuer.match(/login\.microsoftonline\.com\/([^/]+)/);
            if (matches && matches[1]) {
                tenantId = matches[1];
            }
        }

        const projectNumber = engine.name.split('/')[1] || config.projectId;
        const location = engine.name.split('/')[3] || config.appLocation;

        let url = `https://vertexaisearch.cloud.google.com/mobile?cid=${widgetId}&cid_location=${location}&idp=${encodeURIComponent(providerName)}&client_id=${clientId}&project_id=${projectNumber}`;
        if (tenantId) {
            url += `&tenant_id=${tenantId}`;
        }
        return url;
    }, [widgetConfig, idpProviders, engine.name, engine.widgetConfigConfigId, config.projectId, config.appLocation]);

    const isSupportedIdpForQrCode = useCallback((): boolean => {
        if (idpData.idpType === 'GSUITE') return true;

        if (idpData.idpType === 'THIRD_PARTY') {
            const providerName = widgetConfig?.accessSettings?.workforceIdentityPoolProvider;
            if (!providerName) return false;
            
            const provider = idpProviders.find(p => p.name === providerName);
            if (!provider) return false;

            const issuer = provider.oidc?.issuerUri || '';
            if (issuer.includes('login.microsoftonline.com')) {
                return true;
            }
        }

        return false;
    }, [idpData.idpType, widgetConfig, idpProviders]);

    useEffect(() => {
        const fetchLicenses = async () => {
            if (!config.projectId) return;
            try {
                const res = await api.listLicenseConfigs({
                    projectId: config.projectId,
                    appLocation: config.appLocation,
                    collectionId: 'default_collection',
                    appId: '',
                });
                const activeConfigs = (res.licenseConfigs || []).filter((cfg: LicenseConfig) => cfg.state === 'ACTIVE');
                setProjectLicenseConfigs(activeConfigs);
            } catch (e) {
                console.error("Failed to fetch license configs in EngineDetailsForm", e);
            }
        };
        fetchLicenses();
    }, [config.projectId, config.appLocation]);

    const isSubscriptionTierActive = useCallback((tier: string) => {
        if (tier === 'SUBSCRIPTION_TIER_UNSPECIFIED' || tier === 'SUBSCRIPTION_TIER_CONSUMPTION_ONLY') {
            return true;
        }
        if (projectLicenseConfigs.length === 0) {
            return null;
        }
        
        return projectLicenseConfigs.some(cfg => {
            if (cfg.subscriptionTier && cfg.subscriptionTier !== 'SUBSCRIPTION_TIER_UNSPECIFIED') {
                return cfg.subscriptionTier === tier;
            }

            const skuId = (cfg.name.split('/').pop() || '').toLowerCase();
            const displayName = (cfg.displayName || '').toLowerCase();
            
            if (tier === 'SUBSCRIPTION_TIER_SEARCH') {
                return true;
            }
            if (tier === 'SUBSCRIPTION_TIER_SEARCH_AND_ASSISTANT') {
                return skuId.includes('enterprise-plus') || displayName.includes('enterprise plus') || skuId.includes('search_and_assistant');
            }
            if (tier === 'SUBSCRIPTION_TIER_ENTERPRISE') {
                return (skuId.includes('enterprise') && !skuId.includes('enterprise-plus')) || 
                       (displayName.includes('enterprise') && !displayName.includes('enterprise plus'));
            }
            if (tier === 'SUBSCRIPTION_TIER_AGENTSPACE_BUSINESS') {
                return skuId.includes('business') || displayName.includes('business');
            }
            if (tier === 'SUBSCRIPTION_TIER_AGENTSPACE_STARTER') {
                return skuId.includes('starter') || displayName.includes('starter');
            }
            if (tier === 'SUBSCRIPTION_TIER_FRONTLINE_WORKER') {
                return skuId.includes('frontline') || displayName.includes('frontline');
            }
            return false;
        });
    }, [projectLicenseConfigs]);

    useEffect(() => {
        setFormData({
            displayName: engine.displayName || '',
            disableAnalytics: engine.disableAnalytics || false,
            observabilityEnabled: engine.observabilityConfig?.observabilityEnabled || false,
            sensitiveLoggingEnabled: engine.observabilityConfig?.sensitiveLoggingEnabled || false,
            marketplaceAgentVisibility: engine.marketplaceAgentVisibility || 'MARKETPLACE_AGENT_VISIBILITY_UNSPECIFIED',
            searchTier: engine.searchEngineConfig?.searchTier || 'SEARCH_TIER_STANDARD',
            searchAddOnLlm: engine.searchEngineConfig?.searchAddOns?.includes('SEARCH_ADD_ON_LLM') || false,
            requiredSubscriptionTier: engine.searchEngineConfig?.requiredSubscriptionTier || 'SUBSCRIPTION_TIER_UNSPECIFIED',
            enableWebApp: widgetConfig?.accessSettings?.enableWebApp || false,
            enableAutocomplete: widgetConfig?.uiSettings?.enableAutocomplete || false,
            enableQualityFeedback: widgetConfig?.uiSettings?.enableQualityFeedback || false,
        });

        const currentFeatures: Record<string, boolean> = {};
        FEATURE_DEFS.forEach(f => {
            const apiVal = engine.features?.[f.key];
            if (f.isInverted) {
                currentFeatures[f.key] = apiVal !== 'FEATURE_STATE_ON';
            } else {
                currentFeatures[f.key] = apiVal === 'FEATURE_STATE_ON';
            }
        });

        const disableMobileVal = engine.features?.['disable-mobile-app-access'];
        const qrCodeVal = engine.features?.['mobile-app-access'];
        const mobileAppAccessEnabled = qrCodeVal !== undefined
            ? qrCodeVal === 'FEATURE_STATE_ON'
            : disableMobileVal !== 'FEATURE_STATE_ON';
            
        currentFeatures['mobile-app-access'] = mobileAppAccessEnabled;

        if (isSupportedIdpForQrCode()) {
            if (engine.mobileDeeplinkUrl) {
                currentFeatures['qr-code-widget'] = true;
            } else {
                const qrFeatureVal = engine.features?.['enable-qr-code-widget'];
                currentFeatures['qr-code-widget'] = qrFeatureVal === 'FEATURE_STATE_ON';
            }
        } else {
            currentFeatures['qr-code-widget'] = false;
        }

        setFeatures(currentFeatures);

        const currentModels: Record<string, boolean> = {};
        dynamicModels.forEach(m => {
            currentModels[m.id] = false;
        });
        if (engine.modelConfigs) {
            Object.keys(engine.modelConfigs).forEach(key => {
                currentModels[key] = engine.modelConfigs![key] === 'MODEL_ENABLED';
            });
        }
        const widgetOverrides = widgetConfig?.uiSettings?.modelConfigs;
        if (widgetOverrides) {
            Object.keys(widgetOverrides).forEach(key => {
                currentModels[key] = widgetOverrides[key] === 'MODEL_ENABLED';
            });
        }
        setModelConfigs(currentModels);
    }, [engine, widgetConfig, dynamicModels, isSupportedIdpForQrCode]);

    useEffect(() => {
        const fetchConfigs = async () => {
            setIsLoadingIdp(true);
            try {
                const idp = await api.getIdpConfig(engine.name, config);
                const widget = await api.getWidgetConfig(engine.name, config);

                if (idp) {
                    const type = idp.idpType || 'IDP_TYPE_UNSPECIFIED';
                    const poolName = idp.workforcePoolName || '';
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
            } finally {
                setIsLoadingIdp(false);
            }
        };
        fetchConfigs();
    }, [config, engine.name]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
        setFormData(prev => ({ ...prev, [e.target.name]: value }));
    };

    const handleFeatureChange = (feature: string) => {
        setFeatures(prev => ({
            ...prev,
            [feature]: !prev[feature]
        }));
    };

    const handleModelChange = (model: string) => {
        setModelConfigs(prev => {
            const nextVal = !prev[model];
            const updated = { ...prev, [model]: nextVal };
            if (model === 'gemini-3.1-pro-preview') {
                updated['gemini-3.1-pro'] = nextVal;
            } else if (model === 'gemini-3.1-pro') {
                updated['gemini-3.1-pro-preview'] = nextVal;
            }
            return updated;
        });
    };

    const handleIdpChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
        setIdpData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSelectProvider = (providerName: string) => {
        setWidgetConfig({
            ...widgetConfig,
            name: widgetConfig?.name || '',
            accessSettings: {
                ...widgetConfig?.accessSettings,
                workforceIdentityPoolProvider: providerName
            }
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);
        setSuccess(null);

        try {
            const payload: Partial<AppEngine> = {};
            const updateMask: string[] = [];

            if (formData.displayName !== engine.displayName) {
                payload.displayName = formData.displayName;
                updateMask.push('displayName');
            }

            if (formData.disableAnalytics !== (engine.disableAnalytics || false)) {
                payload.disableAnalytics = formData.disableAnalytics;
                updateMask.push('disableAnalytics');
            }

            if (formData.marketplaceAgentVisibility !== (engine.marketplaceAgentVisibility || 'MARKETPLACE_AGENT_VISIBILITY_UNSPECIFIED')) {
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
            const currentAddOnLlm = engine.searchEngineConfig?.searchAddOns?.includes('SEARCH_ADD_ON_LLM') || false;
            const currentRequiredSub = engine.searchEngineConfig?.requiredSubscriptionTier || 'SUBSCRIPTION_TIER_UNSPECIFIED';

            if (formData.searchTier !== currentSearchTier || formData.searchAddOnLlm !== currentAddOnLlm || formData.requiredSubscriptionTier !== currentRequiredSub) {
                const searchAddOns: string[] = [];
                if (formData.searchAddOnLlm) {
                    searchAddOns.push('SEARCH_ADD_ON_LLM');
                }
                payload.searchEngineConfig = {
                    searchTier: formData.searchTier,
                    searchAddOns: searchAddOns,
                    requiredSubscriptionTier: formData.requiredSubscriptionTier
                };
                updateMask.push('searchEngineConfig');
            }

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

            const mobileEnabled = features['mobile-app-access'];
            const disableMobileState = mobileEnabled ? 'FEATURE_STATE_OFF' : 'FEATURE_STATE_ON';
            const mobileState = mobileEnabled ? 'FEATURE_STATE_ON' : 'FEATURE_STATE_OFF';

            if (newFeaturesMap['disable-mobile-app-access'] !== disableMobileState) {
                newFeaturesMap['disable-mobile-app-access'] = disableMobileState;
                featuresChanged = true;
            }

            if (newFeaturesMap['mobile-app-access'] !== mobileState) {
                newFeaturesMap['mobile-app-access'] = mobileState;
                featuresChanged = true;
            }

            const qrCodeEnabled = features['qr-code-widget'];
            const qrState = qrCodeEnabled ? 'FEATURE_STATE_ON' : 'FEATURE_STATE_OFF';
            if (newFeaturesMap['enable-qr-code-widget'] !== qrState) {
                newFeaturesMap['enable-qr-code-widget'] = qrState;
                featuresChanged = true;
            }

            if (featuresChanged) {
                payload.features = newFeaturesMap;
                updateMask.push('features');
            }

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

            if (!qrCodeEnabled && engine.mobileDeeplinkUrl) {
                payload.mobileDeeplinkUrl = '';
                updateMask.push('mobileDeeplinkUrl');
            }

            let idpChanged = false;
            if (idpData.idpType !== originalIdpData.idpType || idpData.workforcePoolName !== originalIdpData.workforcePoolName) {
                await api.updateIdpConfig(engine.name, {
                    idpType: idpData.idpType,
                    workforcePoolName: idpData.idpType === 'THIRD_PARTY' ? idpData.workforcePoolName : ''
                }, config);
                idpChanged = true;
            }

            let widgetChanged = false;
            if (widgetConfig && originalWidgetConfig) {
                const currentProvider = idpData.idpType === 'THIRD_PARTY' ? idpData.workforcePoolName : '';
                const origProvider = originalWidgetConfig.accessSettings?.workforceIdentityPoolProvider || '';
                const currentEnableWebApp = formData.enableWebApp;
                const origEnableWebApp = originalWidgetConfig.accessSettings?.enableWebApp || false;

                const currentAutocomplete = formData.enableAutocomplete;
                const origAutocomplete = originalWidgetConfig.uiSettings?.enableAutocomplete || false;

                const currentFeedback = formData.enableQualityFeedback;
                const origFeedback = originalWidgetConfig.uiSettings?.enableQualityFeedback || false;

                const accessSettingsChanged = currentProvider !== origProvider || currentEnableWebApp !== origEnableWebApp;
                const uiSettingsChanged = currentAutocomplete !== origAutocomplete || currentFeedback !== origFeedback || modelsChanged;

                if (accessSettingsChanged || uiSettingsChanged) {
                    const updatePayload = {
                        accessSettings: {
                            ...widgetConfig.accessSettings,
                            enableWebApp: currentEnableWebApp,
                            workforceIdentityPoolProvider: currentProvider || null
                        },
                        uiSettings: {
                            ...widgetConfig.uiSettings,
                            enableAutocomplete: currentAutocomplete,
                            enableQualityFeedback: currentFeedback,
                            modelConfigs: newModelConfigsMap
                        }
                    };

                    const widgetMask: string[] = [];
                    if (accessSettingsChanged) {
                        widgetMask.push('accessSettings');
                    }
                    if (uiSettingsChanged) {
                        widgetMask.push('uiSettings');
                    }

                    const updatedWidget = await api.updateWidgetConfig(engine.name, updatePayload, widgetMask, config);
                    setWidgetConfig(updatedWidget);
                    widgetChanged = true;
                }
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
                setOriginalIdpData(idpData);
            }

            if (widgetChanged) {
                setOriginalWidgetConfig(JSON.parse(JSON.stringify(widgetConfig)));
            }

            setSuccess("Engine updated successfully!");
            setTimeout(() => setSuccess(null), 3000);

        } catch (err: unknown) {
            setError(toErrorMessage(err) || 'Failed to update engine.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const activeMobileLink = engine.mobileDeeplinkUrl || getConstructedDeeplinkUrl();

    return {
        formData,
        features,
        modelConfigs,
        idpData,
        widgetConfig,
        isLoadingIdp,
        idpProviders,
        isSubmitting,
        error,
        success,
        showLegacyModels,
        projectLicenseConfigs,
        allDynamicFeatures,
        dynamicModels,
        legacyModels,
        activeMobileLink,
        isSupportedIdpForQrCode: isSupportedIdpForQrCode(),
        isSubscriptionTierActive,
        handleChange,
        handleFeatureChange,
        handleModelChange,
        handleIdpChange,
        handleSelectProvider,
        handleSubmit,
        setFeatures,
        setModelConfigs,
        setShowLegacyModels,
    };
}
