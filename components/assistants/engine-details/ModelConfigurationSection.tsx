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
import { EnterpriseModel } from './modelsCatalog';

interface ModelConfigurationSectionProps {
    modelConfigs: Record<string, boolean>;
    onModelChange: (modelId: string) => void;
    onAddCustomModel: (modelId: string) => void;
    dynamicModels: EnterpriseModel[];
    legacyModels: EnterpriseModel[];
    showLegacyModels: boolean;
    onToggleShowLegacyModels: () => void;
}

const MODEL_CATEGORIES = ['All', 'Pro / Reasoning', 'Flash / Speed', 'Vision & Image', 'Preview Models'];

export const ModelConfigurationSection: React.FC<ModelConfigurationSectionProps> = ({
    modelConfigs,
    onModelChange,
    onAddCustomModel,
    dynamicModels,
    legacyModels,
    showLegacyModels,
    onToggleShowLegacyModels
}) => {
    const [modelSearchQuery, setModelSearchQuery] = useState('');
    const [modelCategory, setModelCategory] = useState('All');
    const [customModelInput, setCustomModelInput] = useState('');

    const activeModelCount = useMemo(() => {
        return dynamicModels.filter(m => modelConfigs[m.id] === true).length;
    }, [dynamicModels, modelConfigs]);

    const filteredModels = useMemo(() => {
        return dynamicModels.filter(m => {
            const matchesCategory =
                modelCategory === 'All' ||
                (modelCategory === 'Preview Models' && m.isPreview) ||
                m.category === modelCategory;
            const matchesSearch = !modelSearchQuery.trim() ||
                m.displayName.toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
                m.id.toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
                m.description.toLowerCase().includes(modelSearchQuery.toLowerCase());
            return matchesCategory && matchesSearch;
        });
    }, [dynamicModels, modelCategory, modelSearchQuery]);

    const handleAddCustom = () => {
        const id = customModelInput.trim();
        if (id) {
            onAddCustomModel(id);
            setCustomModelInput('');
        }
    };

    return (
        <CollapsibleSection title="Model Configuration">
            <div className="space-y-4 p-4 bg-gray-900/40 rounded-md border border-gray-700/80">
                {/* Summary Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-3 border-b border-gray-700/60">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-900/60 text-purple-300 border border-purple-700">
                            {activeModelCount} of {dynamicModels.length} Models Enabled
                        </span>
                        <span className="text-xs text-gray-400">
                            Configure which Gemini foundation models end users can select in the assistant web chat interface.
                        </span>
                    </div>
                    {legacyModels.length > 0 && (
                        <button
                            type="button"
                            onClick={onToggleShowLegacyModels}
                            className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold rounded transition-colors border border-gray-700 whitespace-nowrap"
                        >
                            {showLegacyModels ? 'Hide Legacy Keys' : `Show ${legacyModels.length} Legacy Keys`}
                        </button>
                    )}
                </div>

                {/* Category Filter Pills & Search */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div className="flex flex-wrap gap-1.5">
                        {MODEL_CATEGORIES.map(cat => {
                            const count = cat === 'All'
                                ? dynamicModels.length
                                : cat === 'Preview Models'
                                    ? dynamicModels.filter(m => m.isPreview).length
                                    : dynamicModels.filter(m => m.category === cat).length;
                            return (
                                <button
                                    key={cat}
                                    type="button"
                                    onClick={() => setModelCategory(cat)}
                                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                                        modelCategory === cat
                                            ? 'bg-purple-600 text-white shadow-sm'
                                            : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                                    }`}
                                >
                                    <span>{cat}</span>
                                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                                        modelCategory === cat ? 'bg-purple-800 text-purple-200' : 'bg-gray-900 text-gray-400'
                                    }`}>
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="w-full sm:w-60">
                        <input
                            type="text"
                            placeholder="Search models by name or ID..."
                            value={modelSearchQuery}
                            onChange={(e) => setModelSearchQuery(e.target.value)}
                            className="w-full bg-gray-950 border border-gray-700 rounded-md px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:ring-1 focus:ring-purple-500 outline-none"
                        />
                    </div>
                </div>

                {/* Model Cards Grid or Empty State */}
                {filteredModels.length === 0 ? (
                    <div className="py-6 px-4 text-center bg-gray-950/50 rounded-lg border border-gray-800/80 text-xs text-gray-400 space-y-1.5">
                        <p className="text-gray-300 font-semibold">No active models categorized under &quot;{modelCategory}&quot;.</p>
                        <p className="text-[11px] text-gray-400 max-w-md mx-auto">
                            All current Gemini 2.5 and 3.x models in the active catalog are natively multimodal (processing images, documents, and diagrams in chat).
                        </p>
                        {legacyModels.some(m => modelCategory === 'All' || m.category === modelCategory) && !showLegacyModels && (
                            <button
                                type="button"
                                onClick={onToggleShowLegacyModels}
                                className="mt-2 inline-block px-3 py-1 bg-gray-800 hover:bg-gray-700 text-blue-400 text-xs font-semibold rounded border border-gray-700 transition-colors"
                            >
                                Show legacy vision/preview endpoints ({legacyModels.filter(m => modelCategory === 'All' || m.category === modelCategory).length})
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                        {filteredModels.map(model => (
                            <label
                                key={model.id}
                                className={`flex items-start space-x-2.5 p-3 rounded-lg border transition-all cursor-pointer ${
                                    modelConfigs[model.id]
                                        ? 'bg-gray-800/90 border-purple-600/40 shadow-sm'
                                        : 'bg-gray-900/60 border-gray-800 hover:border-gray-700'
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={modelConfigs[model.id] || false}
                                    onChange={() => onModelChange(model.id)}
                                    className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-purple-600 focus:ring-purple-500 flex-shrink-0 mt-0.5"
                                />
                                <div className="flex-grow min-w-0">
                                    <div className="flex items-center justify-between gap-1">
                                        <span className="text-xs font-bold text-gray-200 truncate">{model.displayName}</span>
                                        {model.isPreview && (
                                            <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-900/80 text-purple-200 border border-purple-600 flex-shrink-0">
                                                Preview
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-[10px] text-gray-500 font-mono block truncate mt-0.5">{model.id}</span>
                                    <p className="text-[11px] text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                                        {model.description}
                                    </p>
                                    <span className="inline-block mt-1 text-[9px] px-1.5 py-0.2 bg-gray-950/80 text-gray-400 rounded">
                                        {model.category}
                                    </span>
                                </div>
                            </label>
                        ))}
                    </div>
                )}

                {/* Custom Model ID Injector */}
                <div className="pt-3 border-t border-gray-800 flex flex-col sm:flex-row items-center gap-2">
                    <span className="text-xs text-gray-400 whitespace-nowrap">+ Add Custom Model ID:</span>
                    <input
                        type="text"
                        placeholder="e.g., gemini-3.1-flash-lite or gemini-exp-1206"
                        value={customModelInput}
                        onChange={(e) => setCustomModelInput(e.target.value)}
                        className="flex-1 bg-gray-950 border border-gray-700 rounded px-2.5 py-1 text-xs text-white font-mono placeholder-gray-600 focus:ring-1 focus:ring-purple-500 outline-none"
                    />
                    <button
                        type="button"
                        disabled={!customModelInput.trim()}
                        onClick={handleAddCustom}
                        className="px-3 py-1 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-xs font-semibold rounded transition-colors"
                    >
                        Add Model
                    </button>
                </div>
            </div>
        </CollapsibleSection>
    );
};

export default ModelConfigurationSection;
