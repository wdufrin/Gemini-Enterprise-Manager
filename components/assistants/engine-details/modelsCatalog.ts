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

import { AppEngine, Config, WidgetConfig } from '../../../types';

export interface EnterpriseModel {
    id: string;
    displayName: string;
    description: string;
    isPreview: boolean;
    category: string;
}

export const formatModelDisplayName = (id: string): string => {
    if (id === 'gemini-flash-latest') return 'Gemini 2.x Flash (Latest Auto-Updating)';
    if (id === 'gemini-3.1-pro-preview') return 'Gemini 3.1 Pro (Thinking)';
    if (id === 'gemini-3.1-pro') return 'Gemini 3.1 Pro (Legacy)';
    if (id === 'gemini-3-flash-preview') return 'Gemini 3 Flash (Preview)';
    if (id === 'gemini-3-pro-preview') return 'Gemini 3 Pro (Preview)';
    if (id === 'gemini-3-pro-image-preview' || id === 'gemini-3-pro-image') return 'Gemini 3 Pro Image';
    if (id === 'gemini-3.1-flash-image-preview' || id === 'gemini-3.1-flash-image') return 'Gemini 3.1 Flash Image';
    if (id === 'gemini-3.8-flash') return 'Gemini 3.8 Flash';
    if (id === 'gemini-3.7-flash') return 'Gemini 3.7 Flash';
    if (id === 'gemini-3.6-flash') return 'Gemini 3.6 Flash';
    if (id === 'gemini-3.5-flash') return 'Gemini 3.5 Flash';
    if (id === 'gemini-3-flash') return 'Gemini 3 Flash';
    if (id === 'gemini-2.5-flash-image') return 'Gemini 2.5 Flash Image';
    if (id === 'gemini-2.5-pro') return 'Gemini 2.5 Pro';
    if (id === 'gemini-2.5-flash') return 'Gemini 2.5 Flash';
    if (id === 'gemini-1.5-pro') return 'Gemini 1.5 Pro (Legacy)';
    if (id === 'gemini-1.5-flash') return 'Gemini 1.5 Flash (Legacy)';
    if (id === 'claude-opus-5-5') return 'Claude Opus 5.5';
    if (id === 'claude-sonnet-5-5') return 'Claude Sonnet 5.5';
    if (id === 'claude-opus-5') return 'Claude Opus 5';
    if (id === 'claude-sonnet-5') return 'Claude Sonnet 5';
    if (id === 'claude-sonnet-4-5') return 'Claude Sonnet 4.5';

    return id
        .split('-')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
};

export const getModelDefaultDescription = (id: string): string => {
    if (id === 'gemini-3-pro-image-preview' || id === 'gemini-3-pro-image') {
        return 'Built for complex image generation use cases, with increased factuality.';
    }
    if (id === 'gemini-3.1-flash-image-preview' || id === 'gemini-3.1-flash-image') {
        return 'Efficient, high-quality image generation optimized for most creative projects.';
    }
    if (id.includes('image') || id.includes('vision')) {
        return 'Multimodal visual intelligence and image synthesis.';
    }
    if (id === 'gemini-3.8-flash') {
        return 'Our most intelligent Flash model.';
    }
    if (id === 'gemini-2.5-pro') {
        return 'More powerful model for complex tasks.';
    }
    if (id === 'gemini-3.1-pro-preview' || id === 'gemini-3.1-pro') {
        return 'State-of-the-art reasoning and deep multi-step thinking.';
    }
    if (id === 'gemini-3.5-flash' || id === 'gemini-3.6-flash' || id === 'gemini-3.7-flash') {
        return 'Frontier intelligence built for speed.';
    }
    if (id === 'gemini-2.5-flash') {
        return 'Fast, balanced intelligence built for speed.';
    }
    if (id.startsWith('claude-opus')) {
        return 'Frontier intelligence for complex reasoning and analysis.';
    }
    if (id.startsWith('claude-sonnet')) {
        return 'Balanced intelligence and speed for everyday tasks.';
    }
    if (id.includes('pro') || id.includes('ultra') || id.includes('thinking')) {
        return 'High-intelligence frontier model optimized for complex reasoning, multi-step problem solving, and analysis.';
    }
    return 'Frontier intelligence built for speed.';
};

export const STANDARD_ENTERPRISE_MODELS: EnterpriseModel[] = [
    {
        id: 'gemini-3.8-flash',
        displayName: 'Gemini 3.8 Flash',
        description: 'Our most intelligent Flash model.',
        isPreview: false,
        category: 'Flash / Speed'
    },
    {
        id: 'gemini-3.7-flash',
        displayName: 'Gemini 3.7 Flash',
        description: 'Frontier intelligence built for speed.',
        isPreview: false,
        category: 'Flash / Speed'
    },
    {
        id: 'gemini-3.6-flash',
        displayName: 'Gemini 3.6 Flash',
        description: 'Frontier intelligence built for speed.',
        isPreview: false,
        category: 'Flash / Speed'
    },
    {
        id: 'gemini-3.5-flash',
        displayName: 'Gemini 3.5 Flash',
        description: 'Frontier intelligence built for speed.',
        isPreview: false,
        category: 'Flash / Speed'
    },
    {
        id: 'gemini-3.1-pro-preview',
        displayName: 'Gemini 3.1 Pro (Thinking)',
        description: 'State-of-the-art reasoning and deep multi-step thinking.',
        isPreview: true,
        category: 'Pro / Reasoning'
    },
    {
        id: 'gemini-2.5-pro',
        displayName: 'Gemini 2.5 Pro',
        description: 'More powerful model for complex tasks.',
        isPreview: false,
        category: 'Pro / Reasoning'
    },
    {
        id: 'gemini-2.5-flash',
        displayName: 'Gemini 2.5 Flash',
        description: 'Fast, balanced intelligence built for speed.',
        isPreview: false,
        category: 'Flash / Speed'
    },
    {
        id: 'gemini-3-pro-image-preview',
        displayName: 'Gemini 3 Pro Image',
        description: 'Built for complex image generation use cases, with increased factuality.',
        isPreview: true,
        category: 'Vision & Image'
    },
    {
        id: 'gemini-3.1-flash-image-preview',
        displayName: 'Gemini 3.1 Flash Image',
        description: 'Efficient, high-quality image generation optimized for most creative projects.',
        isPreview: true,
        category: 'Vision & Image'
    }
];

/**
 * Extracts the parent Discovery Engine resource name (`projects/.../engines/{engineId}`)
 * from a full agent resource name or falls back to constructing it from `Config`.
 */
export const extractEngineNameFromAgentName = (
    agentName: string,
    config?: Config
): string | null => {
    const match = (agentName || '').match(
        /^(projects\/[^/]+\/locations\/[^/]+\/collections\/[^/]+\/engines\/[^/]+)/
    );
    if (match) return match[1];
    if (config?.projectId && config?.appLocation && config?.appId) {
        const col = config.collectionId || 'default_collection';
        return `projects/${config.projectId}/locations/${config.appLocation}/collections/${col}/engines/${config.appId}`;
    }
    return null;
};

const categorizeModel = (modelId: string): string => {
    if (modelId.includes('image') || modelId.includes('vision')) {
        return 'Vision & Image';
    }
    if (
        modelId.includes('pro') ||
        modelId.includes('ultra') ||
        modelId.includes('thinking') ||
        modelId.includes('opus')
    ) {
        return 'Pro / Reasoning';
    }
    return 'Flash / Speed';
};

/**
 * Resolves the list of LLM chat/agent models available on a Gemini Enterprise App / Assistant.
 *
 * Resolution order:
 * 1. Uses `widgetConfig.uiSettings.modelConfigInfo.resolvedModels` when returned by the API
 *    (which reflects regional availability and backend ModelRegistry resolution).
 * 2. Merges explicit admin overrides from `engine.modelConfigs` and `widgetConfig.uiSettings.modelConfigs`.
 * 3. Excludes standalone image-generation endpoints (`*image*`) that are not selectable as LLM agent node models.
 * 4. Filters out models explicitly set to `MODEL_DISABLED` when the App has active model configuration overrides.
 */
export const resolveAvailableAppModels = (
    engine?: AppEngine | null,
    widgetConfig?: WidgetConfig | null
): EnterpriseModel[] => {
    const overrides: Record<string, string> = {
        ...(engine?.modelConfigs || {}),
        ...(widgetConfig?.uiSettings?.modelConfigs || {}),
    };

    const candidateMap = new Map<string, EnterpriseModel>();
    const resolvedEnabledDefault = new Map<string, boolean>();

    const apiResolved = widgetConfig?.uiSettings?.modelConfigInfo?.resolvedModels;
    const hasApiResolvedModels = Array.isArray(apiResolved) && apiResolved.some(m => Boolean(m.modelId));

    if (hasApiResolvedModels && apiResolved) {
        apiResolved.forEach(m => {
            const id = m.modelId?.trim();
            if (!id || id.includes('image')) return;
            const isPreview = Boolean(m.isPreview || id.includes('preview') || id.includes('exp'));
            candidateMap.set(id, {
                id,
                displayName: m.displayName || formatModelDisplayName(id),
                description: m.description || getModelDefaultDescription(id),
                isPreview,
                category: categorizeModel(id),
            });
            if (m.adminView?.enabledByDefault !== undefined) {
                resolvedEnabledDefault.set(id, Boolean(m.adminView.enabledByDefault));
            }
        });
    }

    // Always include standard non-image enterprise models so the full catalog is represented
    // (preserving server order first when `resolvedModels` was provided).
    STANDARD_ENTERPRISE_MODELS.forEach(m => {
        if (m.id.includes('image')) return;
        if (!candidateMap.has(m.id)) {
            // If server returned resolvedModels and did not include this model, only append it if explicitly enabled
            if (!hasApiResolvedModels || overrides[m.id] === 'MODEL_ENABLED') {
                candidateMap.set(m.id, { ...m });
            }
        }
    });

    // Include any custom/extra models explicitly enabled in engine or widget modelConfigs
    Object.entries(overrides).forEach(([id, state]) => {
        if (state !== 'MODEL_ENABLED' || id.includes('image')) return;
        if (id === 'gemini-3.1-pro' && candidateMap.has('gemini-3.1-pro-preview')) return;
        if (!candidateMap.has(id)) {
            candidateMap.set(id, {
                id,
                displayName: formatModelDisplayName(id),
                description: getModelDefaultDescription(id),
                isPreview: id.includes('preview') || id.includes('exp'),
                category: categorizeModel(id),
            });
        }
    });

    const allCandidates = Array.from(candidateMap.values());
    const hasAnyExplicitEnabled = Object.entries(overrides).some(
        ([id, state]) => !id.includes('image') && state === 'MODEL_ENABLED'
    );

    const enabledModels = allCandidates.filter(m => {
        const directOverride =
            overrides[m.id] ??
            (m.id === 'gemini-3.1-pro-preview' ? overrides['gemini-3.1-pro'] : undefined);

        if (directOverride === 'MODEL_ENABLED') return true;
        if (directOverride === 'MODEL_DISABLED') return false;

        if (resolvedEnabledDefault.has(m.id)) {
            return resolvedEnabledDefault.get(m.id)!;
        }

        // If the admin has explicitly enabled a subset of models on the engine and no resolvedModels
        // metadata is present, keep models that aren't explicitly disabled.
        return !hasAnyExplicitEnabled || !hasApiResolvedModels;
    });

    return enabledModels.length > 0 ? enabledModels : allCandidates;
};

