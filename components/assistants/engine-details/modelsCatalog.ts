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
    if (id === 'gemini-3.7-flash') return 'Gemini 3.7 Flash';
    if (id === 'gemini-3.6-flash') return 'Gemini 3.6 Flash';
    if (id === 'gemini-3.5-flash') return 'Gemini 3.5 Flash';
    if (id === 'gemini-3-flash') return 'Gemini 3 Flash';
    if (id === 'gemini-2.5-flash-image') return 'Gemini 2.5 Flash Image';
    if (id === 'gemini-2.5-pro') return 'Gemini 2.5 Pro';
    if (id === 'gemini-2.5-flash') return 'Gemini 2.5 Flash';

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
    if (id.includes('pro') || id.includes('ultra') || id.includes('thinking')) {
        return 'High-intelligence frontier model optimized for complex reasoning, multi-step problem solving, and analysis.';
    }
    return 'Frontier intelligence built for speed.';
};

export const STANDARD_ENTERPRISE_MODELS: EnterpriseModel[] = [
    {
        id: 'gemini-3.6-flash',
        displayName: 'Gemini 3.6 Flash',
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
        id: 'gemini-3.5-flash',
        displayName: 'Gemini 3.5 Flash',
        description: 'Frontier intelligence built for speed.',
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
