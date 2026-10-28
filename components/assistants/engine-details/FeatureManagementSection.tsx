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
import CollapsibleSection from './CollapsibleSection';
import InfoTooltip from '../../InfoTooltip';
import { FeatureDefinition, FEATURE_CATEGORIES, FEATURE_VISIBILITY_FILTERS, FeatureVisibilityFilter } from './featuresCatalog';

interface FeatureManagementSectionProps {
    features: Record<string, boolean>;
    onFeatureChange: (featureKey: string) => void;
    onAddCustomFeature: (featureKey: string) => void;
    onRemoveCustomFeature?: (featureKey: string) => void;
    allDynamicFeatures: FeatureDefinition[];
    isDataStoreAclSupported?: boolean | null;
    isSobiLocked?: boolean;
}

export const FeatureManagementSection: React.FC<FeatureManagementSectionProps> = ({
    features,
    onFeatureChange,
    onAddCustomFeature,
    onRemoveCustomFeature,
    allDynamicFeatures,
    isDataStoreAclSupported,
    isSobiLocked = false,
}) => {
    const [featureSearchQuery, setFeatureSearchQuery] = useState('');
    const [featureCategory, setFeatureCategory] = useState<string>('All');
    const [visibilityFilter, setVisibilityFilter] = useState<FeatureVisibilityFilter>('All');
    const [customFeatureInput, setCustomFeatureInput] = useState('');

    const featureNameByKey = useMemo(() => {
        const map = new Map<string, string>();
        allDynamicFeatures.forEach(f => map.set(f.key, f.displayName));
        return map;
    }, [allDynamicFeatures]);

    const activeFeatureCount = useMemo(() => {
        return allDynamicFeatures.filter(f => features[f.key] === true).length;
    }, [allDynamicFeatures, features]);

    const filteredFeatureDefs = useMemo(() => {
        return allDynamicFeatures.filter(f => {
            const matchesCategory = featureCategory === 'All' || f.category === featureCategory;
            const matchesVisibility =
                visibilityFilter === 'All' ||
                (visibilityFilter === 'Customer (GA & Preview)' && (f.visibility === 'GA' || f.visibility === 'PREVIEW')) ||
                (visibilityFilter === 'Customer GA Only' && f.visibility === 'GA') ||
                (visibilityFilter === 'Preview / Allowlist' && f.visibility === 'PREVIEW') ||
                (visibilityFilter === 'Internal / Unlaunched' && f.visibility === 'INTERNAL');
            const matchesSearch = !featureSearchQuery.trim() ||
                f.displayName.toLowerCase().includes(featureSearchQuery.toLowerCase()) ||
                f.key.toLowerCase().includes(featureSearchQuery.toLowerCase()) ||
                f.description.toLowerCase().includes(featureSearchQuery.toLowerCase());
            return matchesCategory && matchesVisibility && matchesSearch;
        });
    }, [allDynamicFeatures, featureCategory, visibilityFilter, featureSearchQuery]);

    const handleAddCustom = () => {
        const key = customFeatureInput.trim();
        if (key) {
            onAddCustomFeature(key);
            setCustomFeatureInput('');
            setFeatureCategory('All');
            setVisibilityFilter('All');
            setFeatureSearchQuery('');
        }
    };

    return (
        <CollapsibleSection title="Feature Management">
            <div className="space-y-4 p-4 bg-gray-900/40 rounded-md border border-gray-700/80">
                {/* Summary & Visibility Filter Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-3 border-b border-gray-700/60">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-900/60 text-blue-300 border border-blue-700">
                            {activeFeatureCount} of {allDynamicFeatures.length} Features Active
                        </span>
                        {isDataStoreAclSupported && (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-900/60 text-green-300 border border-green-700 flex items-center gap-1">
                                <span>🟢</span> DataStore-Level Direct ACLs: Active
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                        {FEATURE_VISIBILITY_FILTERS.map(tier => (
                            <button
                                key={tier}
                                type="button"
                                onClick={() => setVisibilityFilter(tier)}
                                className={`px-2 py-0.5 text-[11px] font-medium rounded border transition-colors ${
                                    visibilityFilter === tier
                                        ? 'bg-indigo-600/80 text-white border-indigo-500'
                                        : 'bg-gray-900 text-gray-400 border-gray-800 hover:text-gray-200 hover:border-gray-700'
                                }`}
                            >
                                {tier}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Category Filter Pills & Search */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div className="flex flex-wrap gap-1.5">
                        {FEATURE_CATEGORIES.map(cat => (
                            <button
                                key={cat}
                                type="button"
                                onClick={() => setFeatureCategory(cat)}
                                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                                    featureCategory === cat
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                                }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>

                    <div className="w-full sm:w-60">
                        <input
                            type="text"
                            placeholder="Search features or flags..."
                            value={featureSearchQuery}
                            onChange={(e) => setFeatureSearchQuery(e.target.value)}
                            className="w-full bg-gray-950 border border-gray-700 rounded-md px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                    </div>
                </div>

                {/* Feature Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                    {filteredFeatureDefs.map(feature => {
                        const isParentDisabled = Boolean(feature.parentKey && !features[feature.parentKey]);
                        const isLockedOn = feature.key === 'sobi' && isSobiLocked;
                        const tooltipParts = [feature.description];
                        if (feature.visibilityNote) tooltipParts.push(feature.visibilityNote);
                        if (feature.warning) tooltipParts.push(feature.warning);
                        const tooltipText = tooltipParts.join(' — ');

                        return (
                            <label
                                key={feature.key}
                                className={`flex items-start space-x-2.5 p-3 rounded-lg border transition-all ${
                                    isLockedOn
                                        ? 'bg-gray-800/70 border-amber-600/40 cursor-not-allowed'
                                        : isParentDisabled
                                        ? 'bg-gray-900/40 border-gray-800/80 opacity-65 cursor-pointer'
                                        : features[feature.key]
                                        ? 'bg-gray-800/90 border-blue-600/40 shadow-sm cursor-pointer'
                                        : 'bg-gray-900/60 border-gray-800 hover:border-gray-700 cursor-pointer'
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={features[feature.key] || false}
                                    disabled={isLockedOn}
                                    onChange={() => onFeatureChange(feature.key)}
                                    className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500 flex-shrink-0 mt-0.5 disabled:opacity-60"
                                />
                                <div className="flex-grow min-w-0">
                                    <div className="flex items-center justify-between gap-1">
                                        <span className="text-xs font-bold text-gray-200 truncate">{feature.displayName}</span>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            <InfoTooltip text={tooltipText} />
                                            {feature.isCustom && onRemoveCustomFeature && (
                                                <button
                                                    type="button"
                                                    title={`Remove custom flag ${feature.key}`}
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        onRemoveCustomFeature(feature.key);
                                                    }}
                                                    className="text-gray-500 hover:text-red-400 p-0.5 rounded transition-colors"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <span className="text-[10px] text-gray-500 font-mono block truncate mt-0.5">{feature.key}</span>
                                    <div className="flex flex-wrap items-center gap-1 mt-1">
                                        <span className="inline-block text-[9px] px-1.5 py-0.2 bg-gray-950/80 text-gray-400 rounded">
                                            {feature.category}
                                        </span>
                                        {feature.visibility === 'GA' && (
                                            <span className="inline-block text-[9px] px-1.5 py-0.2 bg-emerald-950/70 text-emerald-400 border border-emerald-800/50 rounded">
                                                GA
                                            </span>
                                        )}
                                        {feature.visibility === 'PREVIEW' && (
                                            <span
                                                title={feature.visibilityNote}
                                                className="inline-block text-[9px] px-1.5 py-0.2 bg-purple-950/70 text-purple-300 border border-purple-800/50 rounded"
                                            >
                                                Preview / Allowlist
                                            </span>
                                        )}
                                        {feature.visibility === 'INTERNAL' && (
                                            <span
                                                title={feature.visibilityNote}
                                                className="inline-block text-[9px] px-1.5 py-0.2 bg-rose-950/70 text-rose-300 border border-rose-800/50 rounded"
                                            >
                                                Internal / Unlaunched
                                            </span>
                                        )}
                                        {isLockedOn && (
                                            <span className="inline-block text-[9px] px-1.5 py-0.2 bg-amber-900/50 text-amber-300 border border-amber-700/60 rounded font-semibold">
                                                Locked (Irreversible)
                                            </span>
                                        )}
                                        {!isLockedOn && feature.warning && (
                                            <span className="inline-block text-[9px] px-1.5 py-0.2 bg-amber-950/70 text-amber-400 border border-amber-800/50 rounded">
                                                One-Way Lock
                                            </span>
                                        )}
                                        {isParentDisabled && feature.parentKey && (
                                            <span className="inline-block text-[9px] px-1.5 py-0.2 bg-yellow-950/60 text-yellow-400 border border-yellow-800/50 rounded">
                                                Requires {featureNameByKey.get(feature.parentKey) || feature.parentKey}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </label>
                        );
                    })}
                </div>

                {/* Custom Feature Key Injector */}
                <div className="pt-3 border-t border-gray-800 flex flex-col sm:flex-row items-center gap-2">
                    <span className="text-xs text-gray-400 whitespace-nowrap">+ Add Custom Feature Key:</span>
                    <input
                        type="text"
                        placeholder="e.g., custom-preview-flag"
                        value={customFeatureInput}
                        onChange={(e) => setCustomFeatureInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddCustom();
                            }
                        }}
                        className="flex-1 bg-gray-950 border border-gray-700 rounded px-2.5 py-1 text-xs text-white font-mono placeholder-gray-600 focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                    <button
                        type="button"
                        disabled={!customFeatureInput.trim()}
                        onClick={handleAddCustom}
                        className="px-3 py-1 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-xs font-semibold rounded transition-colors"
                    >
                        Add Flag
                    </button>
                </div>
            </div>
        </CollapsibleSection>
    );
};

export default FeatureManagementSection;
