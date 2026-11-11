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

export type ModelVisibility = 'GA' | 'PREVIEW' | 'INTERNAL';

export interface EnterpriseModel {
    id: string;
    displayName: string;
    description: string;
    isPreview: boolean;
    category: string;
    visibility?: ModelVisibility;
    visibilityNote?: string;
    isPartner?: boolean;
}

const KNOWN_INTERNAL_MODEL_IDS = new Set<string>([
    'gemini-4-hydrogen',
    'gemini-4-hydrogen-fast',
    'gemini-4-hydrogen-f-fast',
    'gemini-4-argon-fast',
    'gemini-3.8-flash-fast',
    'claude-fable-5-1',
    'gpt-6.1-sol',
    'gemini-early-exp',
    'gemini-early-exp2',
    'gemini-flash-early-exp',
    'gemini-pro-early-exp',
    'gemini-pro-early-exp2',
    'gemini-pro-early-exp3',
    'Ajax',
]);

export const isPartnerModelId = (id: string): boolean =>
    id.startsWith('claude-') || id.startsWith('gpt-');

export const inferModelVisibility = (
    id: string,
    isPreviewFlag?: boolean
): { visibility: ModelVisibility; visibilityNote?: string; isPartner?: boolean } => {
    const isPartner = isPartnerModelId(id);

    if (KNOWN_INTERNAL_MODEL_IDS.has(id) || id.includes('early-exp')) {
        return {
            visibility: 'INTERNAL',
            visibilityNote: 'Internal / EAP / Sobi-allowlisted model (not launched to general Prod)',
            isPartner,
        };
    }
    if (isPreviewFlag || id.includes('preview') || id.includes('exp')) {
        return {
            visibility: 'PREVIEW',
            visibilityNote: 'Preview / Limited Availability',
            isPartner,
        };
    }
    return {
        visibility: 'GA',
        ...(isPartner
            ? { visibilityNote: 'GA Partner (3P) model (pay-as-you-go + third-party ToS consent required)' }
            : {}),
        isPartner,
    };
};

export const formatModelDisplayName = (id: string): string => {
    if (id === 'gemini-4-argon') return 'Gemini 4 Argon';
    if (id === 'gemini-4-argon-fast') return 'Gemini 4 Argon Fast';
    if (id === 'gemini-4-carbon') return 'Gemini 4 Carbon';
    if (id === 'gemini-4-hydrogen') return 'Gemini 4 Hydrogen';
    if (id === 'gemini-4-hydrogen-fast') return 'Gemini 4 Hydrogen Fast';
    if (id === 'gemini-4-hydrogen-f-fast') return 'Gemini 4 Hydrogen (F-Fast)';
    if (id === 'gemini-flash-latest') return 'Gemini 2.x Flash (Latest Auto-Updating)';
    if (id === 'gemini-3.1-pro-preview') return 'Gemini 3.1 Pro (Thinking)';
    if (id === 'gemini-3.1-pro') return 'Gemini 3.1 Pro (Legacy)';
    if (id === 'gemini-3-flash-preview') return 'Gemini 3 Flash (Preview)';
    if (id === 'gemini-3-pro-preview') return 'Gemini 3 Pro (Preview)';
    if (id === 'gemini-3-pro-image-preview' || id === 'gemini-3-pro-image') return 'Gemini 3 Pro Image';
    if (id === 'gemini-3.1-flash-image-preview' || id === 'gemini-3.1-flash-image') return 'Gemini 3.1 Flash Image';
    if (id === 'gemini-3.8-flash') return 'Gemini 3.8 Flash';
    if (id === 'gemini-3.8-flash-fast') return 'Gemini 3.8 Flash Fast';
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
    if (id === 'claude-fable-5-1') return 'Claude Fable 5.1';
    if (id === 'claude-opus-5') return 'Claude Opus 5';
    if (id === 'claude-sonnet-5') return 'Claude Sonnet 5';
    if (id === 'claude-sonnet-4-5') return 'Claude Sonnet 4.5';
    if (id === 'gpt-6.1-sol') return 'GPT-6.1 Sol';

    return id
        .split('-')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
};

export const getModelDefaultDescription = (id: string): string => {
    if (id === 'gemini-4-argon' || id === 'gemini-4-argon-fast') {
        return 'Next-generation frontier reasoning model for complex analysis, coding, and agentic workflows.';
    }
    if (id === 'gemini-4-carbon') {
        return 'Next-generation balanced Gemini 4 intelligence model for web app, mobile, and Workflow Builder.';
    }
    if (id.startsWith('gemini-4-hydrogen')) {
        return 'Internal / Sobi experimental Gemini 4 Hydrogen model.';
    }
    if (id === 'gemini-3-pro-image-preview' || id === 'gemini-3-pro-image') {
        return 'Built for complex image generation use cases, with increased factuality.';
    }
    if (id === 'gemini-3.1-flash-image-preview' || id === 'gemini-3.1-flash-image') {
        return 'Efficient, high-quality image generation optimized for most creative projects.';
    }
    if (id === 'gemini-2.5-flash-image') {
        return 'Fast and efficient model for general image generation tasks (regional fallback in us and eu).';
    }
    if (id.includes('image') || id.includes('vision')) {
        return 'Multimodal visual intelligence and image synthesis.';
    }
    if (id === 'gemini-3.8-flash' || id === 'gemini-3.8-flash-fast') {
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
    if (id === 'claude-opus-5-5' || id.startsWith('claude-opus')) {
        return 'Anthropic Claude frontier intelligence for complex tasks (3P partner model).';
    }
    if (id === 'claude-sonnet-5-5' || id.startsWith('claude-sonnet')) {
        return 'Anthropic Claude model most efficient for everyday tasks and coding (3P partner model).';
    }
    if (id === 'claude-fable-5-1') {
        return 'Internal Sobi-allowlisted Anthropic Claude model for complex tasks.';
    }
    if (id === 'gpt-6.1-sol') {
        return 'Unlaunched / Sobi-gated OpenAI GPT-6.1 Sol model for complex tasks.';
    }
    if (id.includes('pro') || id.includes('ultra') || id.includes('thinking') || id.includes('argon')) {
        return 'High-intelligence frontier model optimized for complex reasoning, multi-step problem solving, and analysis.';
    }
    return 'Frontier intelligence built for speed.';
};

export const STANDARD_ENTERPRISE_MODELS: EnterpriseModel[] = [
    {
        id: 'gemini-4-argon',
        displayName: 'Gemini 4 Argon',
        description: 'Next-generation frontier reasoning model for complex analysis, coding, and agentic workflows.',
        isPreview: false,
        category: 'Pro / Reasoning',
        visibility: 'GA',
        visibilityNote: 'GA across global, us, and eu',
    },
    {
        id: 'gemini-4-carbon',
        displayName: 'Gemini 4 Carbon',
        description: 'Next-generation balanced Gemini 4 intelligence model for web app, mobile, and Workflow Builder.',
        isPreview: false,
        category: 'Pro / Reasoning',
        visibility: 'GA',
        visibilityNote: 'GA in web app, mobile, Workflow Builder, and AI Dev Tools (global, us, eu; opt-in)',
    },
    {
        id: 'gemini-3.8-flash',
        displayName: 'Gemini 3.8 Flash',
        description: 'Our most intelligent Flash model.',
        isPreview: false,
        category: 'Flash / Speed',
        visibility: 'GA',
        visibilityNote: 'GA across global, us, and eu',
    },
    {
        id: 'gemini-3.7-flash',
        displayName: 'Gemini 3.7 Flash',
        description: 'Frontier intelligence built for speed.',
        isPreview: false,
        category: 'Flash / Speed',
        visibility: 'GA',
    },
    {
        id: 'gemini-3.6-flash',
        displayName: 'Gemini 3.6 Flash',
        description: 'Frontier intelligence built for speed.',
        isPreview: false,
        category: 'Flash / Speed',
        visibility: 'GA',
    },
    {
        id: 'gemini-3.5-flash',
        displayName: 'Gemini 3.5 Flash',
        description: 'Frontier intelligence built for speed.',
        isPreview: false,
        category: 'Flash / Speed',
        visibility: 'GA',
    },
    {
        id: 'gemini-3.1-pro-preview',
        displayName: 'Gemini 3.1 Pro (Thinking)',
        description: 'State-of-the-art reasoning and deep multi-step thinking.',
        isPreview: true,
        category: 'Pro / Reasoning',
        visibility: 'PREVIEW',
        visibilityNote: 'Limited Availability / Preview (_TAG_PREVIEW in ModelRegistry)',
    },
    {
        id: 'gemini-2.5-pro',
        displayName: 'Gemini 2.5 Pro',
        description: 'More powerful model for complex tasks.',
        isPreview: false,
        category: 'Pro / Reasoning',
        visibility: 'GA',
        visibilityNote: 'GA in global, us, and eu (discontinued Oct 20, 2026 in ca and asia-northeast1)',
    },
    {
        id: 'gemini-2.5-flash',
        displayName: 'Gemini 2.5 Flash',
        description: 'Fast, balanced intelligence built for speed.',
        isPreview: false,
        category: 'Flash / Speed',
        visibility: 'GA',
        visibilityNote: 'GA regional fallback (au, kr, and non-3.5 Flash regions)',
    },
    {
        id: 'claude-opus-5-5',
        displayName: 'Claude Opus 5.5',
        description: 'Anthropic Claude frontier intelligence for complex tasks (3P partner model).',
        isPreview: false,
        category: 'Pro / Reasoning',
        visibility: 'GA',
        visibilityNote: 'GA Partner (3P) model in global, us, eu; pay-as-you-go + third-party ToS consent required (opt-in)',
        isPartner: true,
    },
    {
        id: 'claude-sonnet-5-5',
        displayName: 'Claude Sonnet 5.5',
        description: 'Anthropic Claude model most efficient for everyday tasks and coding (3P partner model).',
        isPreview: false,
        category: 'Flash / Speed',
        visibility: 'GA',
        visibilityNote: 'GA Partner (3P) model in global, us, eu; pay-as-you-go + third-party ToS consent required (opt-in)',
        isPartner: true,
    },
    {
        id: 'gemini-3.1-flash-image',
        displayName: 'Gemini 3.1 Flash Image',
        description: 'Efficient, high-quality image generation optimized for most creative projects.',
        isPreview: false,
        category: 'Vision & Image',
        visibility: 'GA',
        visibilityNote: 'GA (Nano Banana 2) default image generation model in global, us, and eu',
    },
    {
        id: 'gemini-3-pro-image',
        displayName: 'Gemini 3 Pro Image',
        description: 'Built for complex image generation use cases, with increased factuality.',
        isPreview: false,
        category: 'Vision & Image',
        visibility: 'GA',
        visibilityNote: 'GA (Nano Banana Pro) in global, us, and eu',
    },
    {
        id: 'gemini-2.5-flash-image',
        displayName: 'Gemini 2.5 Flash Image',
        description: 'Fast and efficient model for general image generation tasks (regional fallback in us and eu).',
        isPreview: false,
        category: 'Vision & Image',
        visibility: 'GA',
        visibilityNote: 'GA fallback image model in us and eu (replaced by 3.1 Flash Image in global)',
    },
];

/**
 * Non-image LLM models suitable for No-Code / Workflow Agent node overrides.
 */
export const WORKFLOW_ENTERPRISE_MODELS: EnterpriseModel[] = STANDARD_ENTERPRISE_MODELS.filter(
    m => !m.id.includes('image')
);

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

export const categorizeModel = (modelId: string): string => {
    if (modelId.includes('image') || modelId.includes('vision')) {
        return 'Vision & Image';
    }
    if (
        modelId.includes('pro') ||
        modelId.includes('ultra') ||
        modelId.includes('thinking') ||
        modelId.includes('argon') ||
        modelId.includes('carbon') ||
        modelId.includes('hydrogen') ||
        modelId.includes('opus') ||
        modelId.includes('fable') ||
        modelId.includes('sol')
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
            const inferred = inferModelVisibility(id, isPreview);
            candidateMap.set(id, {
                id,
                displayName: m.displayName || formatModelDisplayName(id),
                description: m.description || getModelDefaultDescription(id),
                isPreview,
                category: categorizeModel(id),
                visibility: inferred.visibility,
                visibilityNote: inferred.visibilityNote,
                isPartner: inferred.isPartner,
            });
            if (m.adminView !== undefined && m.adminView !== null) {
                // Note: In proto3 JSON (?model_info_view=ADMIN), enabled_by_default == false is omitted (undefined),
                // so Boolean(m.adminView.enabledByDefault) accurately resolves omitted fields to false.
                resolvedEnabledDefault.set(id, Boolean(m.adminView.enabledByDefault));
            } else {
                // Non-admin view only returns models that are enabled on the widget.
                resolvedEnabledDefault.set(id, true);
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
            const isPreview = id.includes('preview') || id.includes('exp');
            const inferred = inferModelVisibility(id, isPreview);
            candidateMap.set(id, {
                id,
                displayName: formatModelDisplayName(id),
                description: getModelDefaultDescription(id),
                isPreview,
                category: categorizeModel(id),
                visibility: inferred.visibility,
                visibilityNote: inferred.visibilityNote,
                isPartner: inferred.isPartner,
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

