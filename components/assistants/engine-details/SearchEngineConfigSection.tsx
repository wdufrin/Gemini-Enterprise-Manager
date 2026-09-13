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
import CollapsibleSection from './CollapsibleSection';
import InfoTooltip from '../../InfoTooltip';

interface SearchEngineConfigSectionProps {
    searchTier: string;
    requiredSubscriptionTier: string;
    searchAddOnLlm: boolean;
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
    projectLicenseConfigs: any[];
    isSubscriptionTierActive: (tier: string) => boolean | null;
}

export const SearchEngineConfigSection: React.FC<SearchEngineConfigSectionProps> = ({
    searchTier,
    requiredSubscriptionTier,
    searchAddOnLlm,
    onChange,
    projectLicenseConfigs,
    isSubscriptionTierActive
}) => {
    return (
        <CollapsibleSection title="Search Engine Configuration">
            <div className="space-y-4 p-4 bg-gray-900/30 rounded-md">
                <div>
                    <label htmlFor="searchTier" className="block text-sm font-medium text-gray-300 mb-1">
                        Search Tier <InfoTooltip text="Configures the capabilities and pricing tier of the search engine (Standard vs Enterprise)." />
                    </label>
                    <select
                        name="searchTier"
                        id="searchTier"
                        value={searchTier}
                        onChange={onChange}
                        className="block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm text-gray-200 focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2 px-3 h-[42px]"
                    >
                        <option value="SEARCH_TIER_STANDARD">Standard Search Tier</option>
                        <option value="SEARCH_TIER_ENTERPRISE">Enterprise Search Tier</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="requiredSubscriptionTier" className="block text-sm font-medium text-gray-300 mb-1">
                        Required Subscription Tier <InfoTooltip text="Configures the required subscription tier for this engine. Note: Web grounding requires SUBSCRIPTION_TIER_SEARCH_AND_ASSISTANT." />
                    </label>
                    <select
                        name="requiredSubscriptionTier"
                        id="requiredSubscriptionTier"
                        value={requiredSubscriptionTier}
                        onChange={onChange}
                        className="block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm text-gray-200 focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2 px-3 h-[42px]"
                    >
                        <option value="SUBSCRIPTION_TIER_UNSPECIFIED">Unspecified</option>
                        <option value="SUBSCRIPTION_TIER_SEARCH">Search Tier</option>
                        <option value="SUBSCRIPTION_TIER_SEARCH_AND_ASSISTANT">Search and Assistant Tier</option>
                        <option value="SUBSCRIPTION_TIER_NOTEBOOK_LM">NotebookLM Tier</option>
                        <option value="SUBSCRIPTION_TIER_FRONTLINE_WORKER">Frontline Worker Tier</option>
                        <option value="SUBSCRIPTION_TIER_AGENTSPACE_STARTER">Agentspace Starter Tier</option>
                        <option value="SUBSCRIPTION_TIER_AGENTSPACE_BUSINESS">Agentspace Business Tier</option>
                        <option value="SUBSCRIPTION_TIER_ENTERPRISE">Gemini Enterprise Plus Tier</option>
                        <option value="SUBSCRIPTION_TIER_FRONTLINE_STARTER">Gemini Frontline Starter Tier</option>
                        <option value="SUBSCRIPTION_TIER_CONSUMPTION_ONLY">Consumption Only (PAYG) Tier</option>
                    </select>

                    {projectLicenseConfigs.length > 0 && (
                        <div className="mt-2 space-y-1 bg-gray-900/40 p-2.5 rounded border border-gray-800">
                            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Detected Project Licenses:</span>
                            {projectLicenseConfigs.map(cfg => {
                                const skuId = cfg.name.split('/').pop() || '';
                                const tierLabel = cfg.subscriptionTier ? cfg.subscriptionTier.replace('SUBSCRIPTION_TIER_', '') : 'UNSPECIFIED';
                                return (
                                    <div key={cfg.name} className="flex justify-between items-center text-xs text-gray-300">
                                        <span className="font-medium text-white">{cfg.displayName || skuId}</span>
                                        <span className="text-gray-500 font-mono text-[10px]">SKU: {skuId} | Tier: {tierLabel}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {requiredSubscriptionTier !== 'SUBSCRIPTION_TIER_UNSPECIFIED' && 
                     isSubscriptionTierActive(requiredSubscriptionTier) === false && (
                        <p className="mt-2 text-xs text-yellow-400 flex items-center gap-1.5 bg-yellow-950/20 border border-yellow-900/40 p-2 rounded">
                            <span>⚠️</span> No active license configuration found for {requiredSubscriptionTier.replace('SUBSCRIPTION_TIER_', '')}. Make sure this matches your team&apos;s assigned licenses.
                        </p>
                    )}
                </div>
                <div className="flex items-center space-x-3 cursor-pointer">
                    <input
                        type="checkbox"
                        name="searchAddOnLlm"
                        id="searchAddOnLlm"
                        checked={searchAddOnLlm}
                        onChange={onChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="searchAddOnLlm" className="flex items-center text-sm font-medium text-gray-300 cursor-pointer">
                        Enable AI Overview (Generative Answers Add-on)
                        <InfoTooltip text="Allows the search engine to use Large Language Models (LLM) to generate natural language summaries of search results." />
                    </label>
                </div>
            </div>
        </CollapsibleSection>
    );
};

export default SearchEngineConfigSection;
