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
import { AppEngine, Config } from '../../types';
import InfoTooltip from '../InfoTooltip';
import PromptChipsTable from './PromptChipsTable';
import CollapsibleSection from './engine-details/CollapsibleSection';
import FeatureManagementSection from './engine-details/FeatureManagementSection';
import ModelConfigurationSection from './engine-details/ModelConfigurationSection';
import SearchEngineConfigSection from './engine-details/SearchEngineConfigSection';
import WebAppUiSettingsSection from './engine-details/WebAppUiSettingsSection';
import MobileAccessSection from './engine-details/MobileAccessSection';
import IdpConfigurationSection from './engine-details/IdpConfigurationSection';
import { useEngineDetailsForm } from '../../hooks/useEngineDetailsForm';

interface EngineDetailsFormProps {
    engine: AppEngine;
    config: Config;
    onUpdateSuccess: (updatedEngine: AppEngine) => void;
    onLaunchWizard?: () => void;
    onNavigateToDataStores?: () => void;
    isDataStoreAclSupported?: boolean | null;
}

const EngineDetailsForm: React.FC<EngineDetailsFormProps> = ({
    engine,
    config,
    onUpdateSuccess,
    onNavigateToDataStores,
    isDataStoreAclSupported
}) => {
    const {
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
        isSupportedIdpForQrCode,
        isSubscriptionTierActive,
        handleChange,
        handleFeatureChange,
        handleModelChange,
        handleIdpChange,
        handleSelectProvider,
        handleSubmit,
        handleAddCustomFeature,
        handleRemoveCustomFeature,
        handleAddCustomModel,
        setFeatures,
        setModelConfigs,
        setShowLegacyModels,
    } = useEngineDetailsForm({ engine, config, onUpdateSuccess });

    return (
        <div className="bg-gray-800 shadow-xl rounded-lg p-6 mb-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">Engine Configuration</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="displayName" className="block text-sm font-medium text-gray-300">Display Name</label>
                    <input
                        type="text"
                        name="displayName"
                        id="displayName"
                        value={formData.displayName}
                        onChange={handleChange}
                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-gray-200"
                    />
                </div>

                <div>
                    <label htmlFor="marketplaceAgentVisibility" className="block text-sm font-medium text-gray-300">
                        Marketplace Agent Visibility
                        <InfoTooltip text="Configures whether end users can see all agents, only purchased/integrated agents, or available marketplace agents." />
                    </label>
                    <select
                        id="marketplaceAgentVisibility"
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
                    <input
                        type="checkbox"
                        name="disableAnalytics"
                        id="disableAnalytics"
                        checked={Boolean(formData.disableAnalytics)}
                        onChange={handleChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="disableAnalytics" className="flex items-center text-sm font-medium text-gray-300">
                        Disable Analytics
                        <InfoTooltip text="Disables the collection of analytics data for this engine." />
                    </label>
                </div>

                <FeatureManagementSection
                    features={features}
                    onFeatureChange={handleFeatureChange}
                    onAddCustomFeature={handleAddCustomFeature}
                    onRemoveCustomFeature={handleRemoveCustomFeature}
                    allDynamicFeatures={allDynamicFeatures}
                    isDataStoreAclSupported={isDataStoreAclSupported}
                />

                <ModelConfigurationSection
                    modelConfigs={modelConfigs}
                    onModelChange={handleModelChange}
                    onAddCustomModel={handleAddCustomModel}
                    dynamicModels={dynamicModels}
                    legacyModels={legacyModels}
                    showLegacyModels={showLegacyModels}
                    onToggleShowLegacyModels={() => setShowLegacyModels(!showLegacyModels)}
                />

                <SearchEngineConfigSection
                    searchTier={formData.searchTier}
                    requiredSubscriptionTier={formData.requiredSubscriptionTier}
                    searchAddOnLlm={Boolean(formData.searchAddOnLlm)}
                    onChange={handleChange}
                    projectLicenseConfigs={projectLicenseConfigs}
                    isSubscriptionTierActive={isSubscriptionTierActive}
                />

                <WebAppUiSettingsSection
                    enableWebApp={Boolean(formData.enableWebApp)}
                    enableAutocomplete={Boolean(formData.enableAutocomplete)}
                    enableQualityFeedback={Boolean(formData.enableQualityFeedback)}
                    onChange={handleChange}
                />

                <MobileAccessSection
                    mobileAppAccess={Boolean(features['mobile-app-access'])}
                    qrCodeWidget={Boolean(features['qr-code-widget'])}
                    onToggleMobileAppAccess={() => setFeatures(prev => ({
                        ...prev,
                        'mobile-app-access': !prev['mobile-app-access']
                    }))}
                    onToggleQrCodeWidget={() => {
                        if (isSupportedIdpForQrCode) {
                            setFeatures(prev => ({
                                ...prev,
                                'qr-code-widget': !prev['qr-code-widget']
                            }));
                        }
                    }}
                    isSupportedIdpForQrCode={isSupportedIdpForQrCode}
                    activeMobileLink={activeMobileLink}
                />

                <IdpConfigurationSection
                    config={config}
                    isLoadingIdp={isLoadingIdp}
                    idpData={idpData}
                    onIdpChange={handleIdpChange}
                    idpProviders={idpProviders}
                    widgetConfig={widgetConfig}
                    onSelectProvider={handleSelectProvider}
                />

                {isDataStoreAclSupported && (
                    <CollapsibleSection title="Connected DataStores & Permissions (Beta)">
                        <div className="p-4 bg-gray-900/50 rounded-md border border-gray-700 space-y-3">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-sm font-bold text-white">Datastore-Level ACL Controls</h4>
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-900/60 text-purple-300 border border-purple-600">
                                            Beta
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-1 max-w-xl">
                                        Manage fine-grained IAM permissions for end users and groups on this App Engine and its connected DataStores / DataConnectors without granting project-wide privileges.
                                    </p>
                                </div>
                                {onNavigateToDataStores && (
                                    <button
                                        type="button"
                                        onClick={onNavigateToDataStores}
                                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-md transition-colors whitespace-nowrap shadow-sm"
                                    >
                                        Manage DataStore Permissions →
                                    </button>
                                )}
                            </div>

                            <div className="pt-2">
                                <span className="text-xs text-gray-400 font-semibold block mb-1.5">Attached DataStores:</span>
                                {engine.dataStoreIds && engine.dataStoreIds.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {engine.dataStoreIds.map(id => (
                                            <span key={id} className="px-2.5 py-1 bg-gray-800 border border-gray-700 text-blue-300 rounded text-xs font-mono">
                                                {id}
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-500 italic">No DataStores currently attached to this engine.</p>
                                )}
                            </div>
                        </div>
                    </CollapsibleSection>
                )}

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
