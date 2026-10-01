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
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AgentDetails from './AgentDetails';
import { Agent, AppEngine, Config, WidgetConfig } from '../../types';
import * as api from '../../services/apiService';
import { resolveAvailableAppModels } from '../assistants/engine-details/modelsCatalog';

vi.mock('../../context/ToastContext', () => ({
    useToast: () => ({
        toast: {
            success: vi.fn(),
            error: vi.fn(),
            info: vi.fn(),
            warning: vi.fn(),
        },
    }),
}));

vi.mock('./AgentDatasourceEditor', () => ({
    default: () => <div data-testid="mock-datasource-editor" />,
}));

vi.mock('../../services/apiService', () => ({
    getAgent: vi.fn(),
    getEngine: vi.fn(),
    getWidgetConfig: vi.fn(),
    updateAndPublishNoCodeAgent: vi.fn(),
    deleteResource: vi.fn(),
    shareAgent: vi.fn(),
    isCustomNoCodeAgent: vi.fn(() => true),
    extractAgentDatasources: vi.fn(() => ({ connectors: [], dataStores: [] })),
}));

const mockConfig: Config = {
    projectId: 'test-proj',
    appLocation: 'global',
    collectionId: 'default_collection',
    appId: 'engine-123',
    assistantId: 'default_assistant',
};

const baseAgent: Agent = {
    name: 'projects/test-proj/locations/global/collections/default_collection/engines/engine-123/assistants/default_assistant/agents/agent-1',
    displayName: 'Support Low-Code Agent',
    state: 'ENABLED',
    lowCodeAgentDefinition: {
        nodes: [
            {
                id: 'root',
                displayName: 'Main Node',
                llmAgentNode: {
                    model: 'gemini-3.6-flash',
                    instruction: 'Help users.',
                },
            },
        ],
    },
};

describe('resolveAvailableAppModels & AgentDetails Low-Code Model Selector', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('includes gemini-3.8-flash, gemini-3.7-flash, gemini-3.6-flash, gemini-3.5-flash, gemini-3.1-pro-preview, gemini-2.5-pro, and gemini-2.5-flash by default while excluding image-only and retired 1.5 models', () => {
        const models = resolveAvailableAppModels(null, null);
        const ids = models.map(m => m.id);

        expect(ids).toContain('gemini-3.8-flash');
        expect(ids).toContain('gemini-3.7-flash');
        expect(ids).toContain('gemini-3.6-flash');
        expect(ids).toContain('gemini-3.5-flash');
        expect(ids).toContain('gemini-3.1-pro-preview');
        expect(ids).toContain('gemini-2.5-pro');
        expect(ids).toContain('gemini-2.5-flash');

        // Image generation models and retired 1.5 models must NOT be in the default LLM agent catalog
        expect(ids).not.toContain('gemini-3-pro-image-preview');
        expect(ids).not.toContain('gemini-3.1-flash-image-preview');
        expect(ids).not.toContain('gemini-1.5-pro');
        expect(ids).not.toContain('gemini-1.5-flash');
    });

    it('filters models to match the App/Assistant resolvedModels and excludes MODEL_DISABLED models', () => {
        const engine: AppEngine = {
            name: 'projects/test-proj/locations/global/collections/default_collection/engines/engine-123',
            displayName: 'Enterprise App',
            solutionType: 'SOLUTION_TYPE_GENERATIVE_CHAT',
            modelConfigs: {
                'gemini-3.8-flash': 'MODEL_ENABLED',
                'gemini-3.1-pro-preview': 'MODEL_ENABLED',
                'gemini-2.5-flash': 'MODEL_DISABLED',
            },
        };
        const widgetConfig: WidgetConfig = {
            name: `${engine.name}/widgetConfigs/default_search_widget_config`,
            uiSettings: {
                modelConfigInfo: {
                    resolvedModels: [
                        { displayName: 'Auto' }, // Auto sentinel without modelId
                        { modelId: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', adminView: { enabledByDefault: true } },
                        { modelId: 'gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro (Thinking)', isPreview: true, adminView: { enabledByDefault: true } },
                        { modelId: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', adminView: { enabledByDefault: true } },
                        { modelId: 'gemini-3-pro-image-preview', displayName: 'Gemini 3 Pro Image', isPreview: true },
                    ],
                },
            },
        };

        const models = resolveAvailableAppModels(engine, widgetConfig);
        const ids = models.map(m => m.id);

        expect(ids).toEqual(['gemini-3.8-flash', 'gemini-3.1-pro-preview']);
        expect(ids).not.toContain('gemini-2.5-flash');
        expect(ids).not.toContain('gemini-3-pro-image-preview');
    });

    it('populates the AgentDetails dropdown with the parent App/Assistant available models and saves updates across workflowAgentDefinition nodes even when model was previously unset', async () => {
        const workflowAgent: Agent = {
            ...baseAgent,
            lowCodeAgentDefinition: undefined,
            workflowAgentDefinition: {
                agentFlow: {
                    nodes: [
                        {
                            id: 'node_1',
                            title: 'Agent Step',
                            agentNode: {
                                instruction: 'Analyze ticket',
                                // model intentionally omitted (Auto)
                            },
                        },
                    ],
                },
            },
        };

        vi.mocked(api.getAgent).mockResolvedValue(workflowAgent);
        vi.mocked(api.getEngine).mockResolvedValue({
            name: 'projects/test-proj/locations/global/collections/default_collection/engines/engine-123',
            displayName: 'Enterprise App',
            solutionType: 'SOLUTION_TYPE_GENERATIVE_CHAT',
            modelConfigs: {
                'gemini-3.8-flash': 'MODEL_ENABLED',
                'claude-sonnet-5': 'MODEL_ENABLED',
                'gemini-2.5-pro': 'MODEL_DISABLED',
            },
        });
        vi.mocked(api.getWidgetConfig).mockResolvedValue({
            name: 'projects/test-proj/locations/global/collections/default_collection/engines/engine-123/widgetConfigs/default_search_widget_config',
            uiSettings: {
                modelConfigInfo: {
                    resolvedModels: [
                        { modelId: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash' },
                        { modelId: 'claude-sonnet-5', displayName: 'Claude Sonnet 5' },
                        { modelId: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' },
                    ],
                },
            },
        });
        vi.mocked(api.updateAndPublishNoCodeAgent).mockResolvedValue({
            updatedAgent: workflowAgent,
            deployedOrPublished: true,
            ownershipClaimed: false,
        });

        render(
            <AgentDetails
                agent={workflowAgent}
                config={mockConfig}
                onBack={vi.fn()}
                onEdit={vi.fn()}
                onDeleteSuccess={vi.fn()}
                onToggleStatus={vi.fn()}
                togglingAgentId={null}
                error={null}
            />
        );

        const select = (await screen.findByLabelText('Model')) as HTMLSelectElement;
        await waitFor(() => {
            expect(screen.getByText(/Synced with App \/ Assistant/i)).toBeTruthy();
        });

        const optionValues = Array.from(select.options).map(o => o.value);
        expect(optionValues).toContain('gemini-3.8-flash');
        expect(optionValues).toContain('claude-sonnet-5');
        expect(optionValues).not.toContain('gemini-2.5-pro');
        expect(optionValues).not.toContain('gemini-1.5-pro');

        fireEvent.change(select, { target: { value: 'gemini-3.8-flash' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save Model' }));

        await waitFor(() => {
            expect(api.updateAndPublishNoCodeAgent).toHaveBeenCalledWith(
                expect.objectContaining({
                    workflowAgentDefinition: {
                        agentFlow: {
                            nodes: [
                                expect.objectContaining({
                                    id: 'node_1',
                                    agentNode: expect.objectContaining({
                                        model: 'gemini-3.8-flash',
                                    }),
                                }),
                            ],
                        },
                    },
                }),
                expect.objectContaining({
                    workflowAgentDefinition: expect.any(Object),
                }),
                mockConfig,
                expect.any(Object)
            );
        });
    });

    it('preserves a legacy/disabled model currently set on the agent as a selectable option and falls back gracefully when getEngine/getWidgetConfig reject', async () => {
        const legacyAgent: Agent = {
            ...baseAgent,
            lowCodeAgentDefinition: {
                nodes: [
                    {
                        id: 'root',
                        llmAgentNode: {
                            model: 'gemini-1.5-pro',
                        },
                    },
                ],
            },
        };

        vi.mocked(api.getAgent).mockResolvedValue(legacyAgent);
        vi.mocked(api.getEngine).mockRejectedValue(new Error('403 Forbidden on Engine'));
        vi.mocked(api.getWidgetConfig).mockRejectedValue(new Error('403 Forbidden on WidgetConfig'));

        render(
            <AgentDetails
                agent={legacyAgent}
                config={mockConfig}
                onBack={vi.fn()}
                onEdit={vi.fn()}
                onDeleteSuccess={vi.fn()}
                onToggleStatus={vi.fn()}
                togglingAgentId={null}
                error={null}
            />
        );

        const select = (await screen.findByLabelText('Model')) as HTMLSelectElement;
        await waitFor(() => {
            expect(select.value).toBe('gemini-1.5-pro');
        });

        const optionTexts = Array.from(select.options).map(o => o.textContent || '');
        expect(optionTexts.some(t => t.includes('gemini-1.5-pro') && t.includes('Current on Agent'))).toBe(true);
        expect(optionTexts.some(t => t.includes('Gemini 3.8 Flash (gemini-3.8-flash)'))).toBe(true);
    });
});
