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

import { describe, it, expect } from 'vitest';
import { FEATURE_DEFS, IGNORED_LEGACY_FEATURE_KEYS } from './featuresCatalog';
import {
    STANDARD_ENTERPRISE_MODELS,
    WORKFLOW_ENTERPRISE_MODELS,
    categorizeModel,
    formatModelDisplayName,
    inferModelVisibility,
    resolveAvailableAppModels,
} from './modelsCatalog';

describe('featuresCatalog integrity and rollout visibility', () => {
    it('contains unique canonical feature keys and excludes migrated/obsolete keys', () => {
        const keys = FEATURE_DEFS.map(f => f.key);
        expect(new Set(keys).size).toBe(keys.length);
        const obsoleteKeys = [
            'disable-mobile-app-access',
            'enable-qr-code-widget',
            'disable-skills',
            'disable-projects',
            'disable-canvas-workspace',
            'cross-domain-documents',
        ];
        obsoleteKeys.forEach(k => {
            expect(IGNORED_LEGACY_FEATURE_KEYS.has(k)).toBe(true);
            expect(keys).not.toContain(k);
        });
    });

    it('validates parentKey references point to defined features', () => {
        const keySet = new Set(FEATURE_DEFS.map(f => f.key));
        FEATURE_DEFS.forEach(f => {
            if (f.parentKey) {
                expect(keySet.has(f.parentKey)).toBe(true);
            }
        });
    });

    it('classifies GA, Preview/Allowlist, and Internal/Unlaunched toggles accurately', () => {
        const byKey = new Map(FEATURE_DEFS.map(f => [f.key, f]));

        // GA features verified in Cloud Console + backend + public docs
        expect(byKey.get('speech-to-text')?.visibility).toBe('GA');
        expect(byKey.get('license-tier-badge')?.visibility).toBe('GA');
        expect(byKey.get('in-app-notifications')?.visibility).toBe('GA');
        expect(byKey.get('disable-canvas')?.visibility).toBe('GA');

        // Staged / Preview features
        expect(byKey.get('canvas-app-builder')?.visibility).toBe('PREVIEW');
        expect(byKey.get('skill-security-scan')?.visibility).toBe('PREVIEW');
        expect(byKey.get('remote-vm')?.visibility).toBe('PREVIEW');
        expect(byKey.get('code-extraction')?.visibility).toBe('PREVIEW');
        expect(byKey.get('agent-marketplace')?.visibility).toBe('PREVIEW');
        expect(byKey.get('agent-scheduling')?.visibility).toBe('PREVIEW');
        expect(byKey.get('preview-agents')?.visibility).toBe('PREVIEW');

        // Internal / Unlaunched features
        expect(byKey.get('canvas-workspace')?.visibility).toBe('INTERNAL');
        expect(byKey.get('personalization-suggested-highlights')?.visibility).toBe('INTERNAL');
        expect(byKey.get('single-agent-orchestration')?.visibility).toBe('INTERNAL');
        expect(byKey.get('multi-agent-orchestration')?.visibility).toBe('INTERNAL');
        expect(byKey.get('plugins')?.visibility).toBe('INTERNAL');
        expect(byKey.get('canvas-app-sharing')?.visibility).toBe('INTERNAL');
        expect(byKey.get('music-generation')?.visibility).toBe('INTERNAL');
        expect(byKey.get('speech-generation')?.visibility).toBe('INTERNAL');
    });
});

describe('modelsCatalog integrity, visibility inference, and workflow filtering', () => {
    it('contains GA Gemini 4, Claude 5.5 partner, and GA image models without internal/unlaunched IDs', () => {
        const ids = STANDARD_ENTERPRISE_MODELS.map(m => m.id);
        expect(new Set(ids).size).toBe(ids.length);

        expect(ids).toContain('gemini-4-argon');
        expect(ids).toContain('gemini-4-carbon');
        expect(ids).toContain('claude-opus-5-5');
        expect(ids).toContain('claude-sonnet-5-5');
        expect(ids).toContain('gemini-3.1-flash-image');
        expect(ids).toContain('gemini-3-pro-image');
        expect(ids).toContain('gemini-2.5-flash-image');

        // Internal / unlaunched models must NOT be in STANDARD_ENTERPRISE_MODELS
        expect(ids).not.toContain('gemini-4-hydrogen');
        expect(ids).not.toContain('gemini-4-hydrogen-f-fast');
        expect(ids).not.toContain('claude-fable-5-1');
        expect(ids).not.toContain('gpt-6.1-sol');

        // Superseded preview image IDs must NOT be in active STANDARD_ENTERPRISE_MODELS
        expect(ids).not.toContain('gemini-3-pro-image-preview');
        expect(ids).not.toContain('gemini-3.1-flash-image-preview');
    });

    it('excludes standalone image-generation models from WORKFLOW_ENTERPRISE_MODELS and resolveAvailableAppModels', () => {
        WORKFLOW_ENTERPRISE_MODELS.forEach(m => {
            expect(m.id.includes('image')).toBe(false);
        });
        expect(WORKFLOW_ENTERPRISE_MODELS.some(m => m.id === 'gemini-4-carbon')).toBe(true);

        const resolved = resolveAvailableAppModels(null, null);
        expect(resolved.some(m => m.id.includes('image'))).toBe(false);
        expect(resolved.some(m => m.id === 'gemini-4-carbon')).toBe(true);
    });

    it('classifies dynamically surfaced internal/EAP/partner models accurately', () => {
        expect(inferModelVisibility('gemini-4-hydrogen-f-fast').visibility).toBe('INTERNAL');
        expect(inferModelVisibility('claude-fable-5-1')).toMatchObject({
            visibility: 'INTERNAL',
            isPartner: true,
        });
        expect(inferModelVisibility('gpt-6.1-sol')).toMatchObject({
            visibility: 'INTERNAL',
            isPartner: true,
        });
        expect(inferModelVisibility('gemini-3.1-pro-preview').visibility).toBe('PREVIEW');
        expect(inferModelVisibility('claude-opus-5-5')).toMatchObject({
            visibility: 'GA',
            isPartner: true,
        });

        expect(formatModelDisplayName('gemini-4-carbon')).toBe('Gemini 4 Carbon');
        expect(formatModelDisplayName('gpt-6.1-sol')).toBe('GPT-6.1 Sol');
        expect(categorizeModel('gemini-4-carbon')).toBe('Pro / Reasoning');
    });
});
