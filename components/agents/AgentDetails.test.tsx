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

import AgentList from './AgentList';
import AgentForm from './AgentForm';

vi.mock('./AgentDatasourceEditor', () => ({
    default: () => <div data-testid="mock-datasource-editor" />,
}));

vi.mock('../../services/apiService', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../services/apiService')>();
    return {
        ...actual,
        getAgent: vi.fn(),
        getEngine: vi.fn(),
        getWidgetConfig: vi.fn(),
        updateAgent: vi.fn(),
        updateAndPublishNoCodeAgent: vi.fn(),
        getAgentIamPolicy: vi.fn(),
        deleteResource: vi.fn(),
        shareAgent: vi.fn(),
        adminPublishAndShareForUser: vi.fn(),
        isCustomNoCodeAgent: vi.fn(() => true),
        extractAgentDatasources: vi.fn(() => ({ connectors: [], dataStores: [] })),
    };
});

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

    it('filters models to match the App/Assistant resolvedModels and excludes MODEL_DISABLED or proto3 omitted adminView.enabledByDefault=false models', () => {
        const engine: AppEngine = {
            name: 'projects/test-proj/locations/global/collections/default_collection/engines/engine-123',
            displayName: 'Enterprise App',
            solutionType: 'SOLUTION_TYPE_GENERATIVE_CHAT',
            modelConfigs: {
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
                        // In proto3 JSON (?model_info_view=ADMIN), enabled_by_default == false is omitted from adminView ({})
                        { modelId: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', adminView: {} },
                        { modelId: 'gemini-3.7-flash', displayName: 'Gemini 3.7 Flash', adminView: { enabledByDefault: true } },
                        { modelId: 'gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro (Thinking)', isPreview: true, adminView: {} },
                        { modelId: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', adminView: { enabledByDefault: true } },
                        { modelId: 'gemini-3-pro-image-preview', displayName: 'Gemini 3 Pro Image', isPreview: true },
                    ],
                },
            },
        };

        const models = resolveAvailableAppModels(engine, widgetConfig);
        const ids = models.map(m => m.id);

        // gemini-3.8-flash has adminView: {} (enabledByDefault omitted/false) and no MODEL_ENABLED override -> must be excluded!
        expect(ids).toEqual(['gemini-3.7-flash', 'gemini-3.1-pro-preview']);
        expect(ids).not.toContain('gemini-3.8-flash');
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
        expect(optionValues).toContain('');
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

    it('preserves a legacy/disabled model currently set on the agent, shows a warning banner, and allows resetting back to Auto (Engine Default)', async () => {
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
        vi.mocked(api.updateAndPublishNoCodeAgent).mockResolvedValue({
            updatedAgent: {
                ...legacyAgent,
                lowCodeAgentDefinition: {
                    nodes: [{ id: 'root', llmAgentNode: { model: '' } }],
                },
            },
            deployedOrPublished: true,
            ownershipClaimed: false,
        });

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

        expect(screen.getByText(/Pinned Model Not Enabled on App/i)).toBeTruthy();

        const optionTexts = Array.from(select.options).map(o => o.textContent || '');
        expect(optionTexts.some(t => t.includes('Auto (Engine Default — Recommended)'))).toBe(true);
        expect(optionTexts.some(t => t.includes('gemini-1.5-pro') && t.includes('Current on Agent'))).toBe(true);
        expect(optionTexts.some(t => t.includes('Gemini 3.8 Flash (gemini-3.8-flash)'))).toBe(true);

        // Reset back to Auto ('') and save
        fireEvent.change(select, { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save Model' }));

        await waitFor(() => {
            expect(api.updateAndPublishNoCodeAgent).toHaveBeenCalledWith(
                expect.objectContaining({
                    lowCodeAgentDefinition: {
                        nodes: [
                            expect.objectContaining({
                                id: 'root',
                                llmAgentNode: expect.objectContaining({
                                    model: '',
                                }),
                            }),
                        ],
                    },
                }),
                expect.any(Object),
                mockConfig,
                expect.any(Object)
            );
        });
    });

    it('renders Publish & Share for User on a PRIVATE agent, rejects invalid principals in modal, and executes adminPublishAndShareForUser on valid submission', async () => {
        const privateAgent: Agent = {
            ...baseAgent,
            displayName: 'User Private Agent',
            state: 'PRIVATE',
        };

        vi.mocked(api.getAgent).mockResolvedValue(privateAgent);
        vi.mocked(api.getEngine).mockResolvedValue(null as unknown as AppEngine);
        vi.mocked(api.getWidgetConfig).mockResolvedValue(null as unknown as WidgetConfig);
        vi.mocked(api.adminPublishAndShareForUser).mockResolvedValue({
            agent: {
                ...privateAgent,
                name: `${privateAgent.name}-published`,
                displayName: 'User Published Agent',
                state: 'ENABLED',
            },
            clonedFrom: privateAgent.name,
            wasCloned: true,
            deletedOriginal: true,
            transferredTo: 'user:alice@company.com',
            stepsCompleted: ['Done'],
        });

        const onBack = vi.fn();

        render(
            <AgentDetails
                agent={privateAgent}
                config={mockConfig}
                onBack={onBack}
                onEdit={vi.fn()}
                onDeleteSuccess={vi.fn()}
                onToggleStatus={vi.fn()}
                togglingAgentId={null}
                error={null}
            />
        );

        const publishBtn = await screen.findByRole('button', { name: /Publish & Share for User/i });
        fireEvent.click(publishBtn);

        expect(screen.getByRole('dialog')).toBeTruthy();

        // Negative test: submit with invalid target owner email
        const ownerInput = screen.getByLabelText(/Target Owner Email or Workforce Principal/i);
        fireEvent.change(ownerInput, { target: { value: 'not-an-email' } });
        fireEvent.click(screen.getByRole('button', { name: 'Publish & Share Agent' }));

        expect(await screen.findByRole('alert')).toBeTruthy();
        expect(screen.getByRole('alert').textContent).toMatch(/Must be a valid email/i);
        expect(api.adminPublishAndShareForUser).not.toHaveBeenCalled();

        // Valid submission with owner email, additional shared group, and delete original checked
        fireEvent.change(ownerInput, { target: { value: 'alice@company.com' } });
        const sharedPrincipalsInput = screen.getByLabelText(/Additional Users or Groups/i);
        fireEvent.change(sharedPrincipalsInput, { target: { value: 'group:sales@company.com' } });
        const deleteCheckbox = screen.getByRole('checkbox', {
            name: /Delete original unshared Private agent/i,
        });
        fireEvent.click(deleteCheckbox);

        fireEvent.click(screen.getByRole('button', { name: 'Publish & Share Agent' }));

        await waitFor(() => {
            expect(api.adminPublishAndShareForUser).toHaveBeenCalledWith(
                expect.objectContaining({ name: privateAgent.name }),
                expect.objectContaining({
                    displayName: 'User Private Agent',
                    keepAdminAsOwner: false,
                    targetOwnerPrincipal: 'user:alice@company.com',
                    previousOwnerDisposition: 'KEEP_AS_AGENT_USER',
                    sharingScope: 'RESTRICTED',
                    sharedPrincipals: ['group:sales@company.com'],
                    deleteOriginalPrivateAgent: true,
                    onProgress: expect.any(Function),
                }),
                mockConfig
            );
            expect(onBack).toHaveBeenCalledTimes(1);
        });
    });

    it('edits and saves System Instructions on a Low-Code agent and surfaces API errors on failure', async () => {
        vi.mocked(api.getAgent).mockResolvedValue(baseAgent);
        vi.mocked(api.getEngine).mockResolvedValue(null as unknown as AppEngine);
        vi.mocked(api.getWidgetConfig).mockResolvedValue(null as unknown as WidgetConfig);

        render(
            <AgentDetails
                agent={baseAgent}
                config={mockConfig}
                onBack={vi.fn()}
                onEdit={vi.fn()}
                onDeleteSuccess={vi.fn()}
                onToggleStatus={vi.fn()}
                togglingAgentId={null}
                error={null}
            />
        );

        const instructionTextarea = (await screen.findByLabelText('System Instruction')) as HTMLTextAreaElement;
        expect(instructionTextarea.value).toBe('Help users.');

        fireEvent.change(instructionTextarea, {
            target: { value: 'You are an enterprise IT support specialist. Always cite KB articles.' },
        });

        // Negative test: API rejects when saving instructions
        vi.mocked(api.updateAndPublishNoCodeAgent).mockRejectedValueOnce(new Error('403 Permission denied on node instruction'));
        fireEvent.click(screen.getByRole('button', { name: 'Save Instructions' }));

        expect(await screen.findByText(/403 Permission denied on node instruction/i)).toBeTruthy();

        // Positive test: API succeeds
        vi.mocked(api.updateAndPublishNoCodeAgent).mockResolvedValueOnce({
            updatedAgent: {
                ...baseAgent,
                lowCodeAgentDefinition: {
                    nodes: [
                        {
                            id: 'root',
                            displayName: 'Main Node',
                            llmAgentNode: {
                                model: 'gemini-3.6-flash',
                                instruction: 'You are an enterprise IT support specialist. Always cite KB articles.',
                            },
                        },
                    ],
                },
            },
            deployedOrPublished: true,
            ownershipClaimed: false,
        });

        fireEvent.click(screen.getByRole('button', { name: 'Save Instructions' }));

        await waitFor(() => {
            expect(api.updateAndPublishNoCodeAgent).toHaveBeenCalledWith(
                expect.objectContaining({
                    lowCodeAgentDefinition: {
                        nodes: [
                            expect.objectContaining({
                                id: 'root',
                                llmAgentNode: expect.objectContaining({
                                    instruction: 'You are an enterprise IT support specialist. Always cite KB articles.',
                                }),
                            }),
                        ],
                    },
                }),
                expect.any(Object),
                mockConfig,
                expect.any(Object)
            );
        });
    });

    it('switches to Sharing & IAM sub-tab, toggles Sharing Scope, and renders the visual IAM policy bindings table', async () => {
        vi.mocked(api.getAgent).mockResolvedValue(baseAgent);
        vi.mocked(api.getEngine).mockResolvedValue(null as unknown as AppEngine);
        vi.mocked(api.getWidgetConfig).mockResolvedValue(null as unknown as WidgetConfig);
        vi.mocked(api.updateAgent).mockResolvedValue({
            ...baseAgent,
            sharingConfig: { scope: 'ALL_USERS' },
        });
        vi.mocked(api.getAgentIamPolicy).mockResolvedValue({
            bindings: [
                {
                    role: 'roles/discoveryengine.agentOwner',
                    members: ['user:owner@company.com'],
                },
                {
                    role: 'roles/discoveryengine.agentUser',
                    members: ['group:eng@company.com'],
                },
            ],
            etag: 'BwW123',
        });

        render(
            <AgentDetails
                agent={baseAgent}
                config={mockConfig}
                onBack={vi.fn()}
                onEdit={vi.fn()}
                onDeleteSuccess={vi.fn()}
                onToggleStatus={vi.fn()}
                togglingAgentId={null}
                error={null}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /Sharing & IAM/i }));

        // Toggle scope to All Users in App
        fireEvent.click(screen.getByRole('button', { name: 'All Users in App' }));
        await waitFor(() => {
            expect(api.updateAgent).toHaveBeenCalledWith(
                expect.objectContaining({ name: baseAgent.name }),
                { sharingConfig: { scope: 'ALL_USERS' } },
                mockConfig
            );
        });

        // Fetch IAM policy and verify visual bindings table
        fireEvent.click(screen.getByRole('button', { name: 'Get IAM Policy' }));
        expect(await screen.findByText('roles/discoveryengine.agentOwner')).toBeTruthy();
        expect(screen.getByText('user:owner@company.com')).toBeTruthy();
        expect(screen.getByText('group:eng@company.com')).toBeTruthy();
    });

    it('filters agents by search query, status pill, and sharing scope in AgentList and does not render per-agent Test buttons', () => {
        const agents: Agent[] = [
            {
                ...baseAgent,
                name: 'projects/p/locations/global/collections/default_collection/engines/e/assistants/default_assistant/agents/ag-1',
                displayName: 'Alpha Support Agent',
                state: 'ENABLED',
                agentType: 'LOW_CODE',
                sharingConfig: { scope: 'ALL_USERS' },
            },
            {
                ...baseAgent,
                name: 'projects/p/locations/global/collections/default_collection/engines/e/assistants/default_assistant/agents/ag-2',
                displayName: 'Beta Finance Agent',
                state: 'PRIVATE',
                agentType: 'LOW_CODE',
            },
        ];

        render(
            <AgentList
                agents={agents}
                onSelectAgent={vi.fn()}
                onEditAgent={vi.fn()}
                onDeleteAgent={vi.fn()}
                onRegisterNew={vi.fn()}
                onToggleAgentStatus={vi.fn()}
                deletingAgentIds={new Set()}
                selectedAgents={new Set()}
                onToggleSelect={vi.fn()}
                onToggleSelectAll={vi.fn()}
                onDeleteSelected={vi.fn()}
                onSort={vi.fn()}
                sortConfig={{ key: 'displayName', direction: 'asc' }}
            />
        );

        expect(screen.getByText('Alpha Support Agent')).toBeTruthy();
        expect(screen.getByText('Beta Finance Agent')).toBeTruthy();

        // Filter by Private status pill
        fireEvent.click(screen.getByRole('button', { name: /Private \(1\)/i }));
        expect(screen.queryByText('Alpha Support Agent')).toBeNull();
        expect(screen.getByText('Beta Finance Agent')).toBeTruthy();

        // Reset to All and filter by search query
        fireEvent.click(screen.getByRole('button', { name: /All \(2\)/i }));
        fireEvent.change(screen.getByLabelText('Search agents'), { target: { value: 'Alpha' } });
        expect(screen.getByText('Alpha Support Agent')).toBeTruthy();
        expect(screen.queryByText('Beta Finance Agent')).toBeNull();

        // Verify per-agent Test button is not rendered
        expect(screen.queryByRole('button', { name: 'Test' })).toBeNull();
    });

    it('allows editing a shared Low-Code (no_code) agent in AgentForm, hides authorizationConfig (ADK/A2A only), and syncs lowCodeAgentDefinition.draftDisplayName & draftDescription', async () => {
        vi.mocked(api.getAgent).mockResolvedValue({
            ...baseAgent,
            description: 'Initial description',
        });
        vi.mocked(api.updateAgent).mockResolvedValue(baseAgent);

        const onSuccess = vi.fn();
        render(
            <AgentForm
                config={mockConfig}
                onSuccess={onSuccess}
                onCancel={vi.fn()}
                agentToEdit={{
                    ...baseAgent,
                    description: 'Initial description',
                }}
            />
        );

        // Should show the No-Code / Low-Code / Workflow info card rather than ADK Reasoning Engine required inputs
        expect(screen.getByText(/No-Code \/ Low-Code \/ Workflow Agent/i)).toBeTruthy();
        // Should explain that authorizationConfig only applies to ADK and A2A agents
        expect(screen.getByText(/Tool & Connector Authentication:/i)).toBeTruthy();
        expect(screen.queryByPlaceholderText('Type an Authorization ID')).toBeNull();

        const displayNameInput = screen.getByLabelText('Display Name');
        fireEvent.change(displayNameInput, { target: { value: 'Updated Low-Code Support Agent' } });

        const descriptionInput = screen.getByLabelText('Description');
        fireEvent.change(descriptionInput, { target: { value: 'Updated low-code description' } });

        fireEvent.click(screen.getByRole('button', { name: /Save Agent/i }));

        await waitFor(() => {
            expect(api.updateAgent).toHaveBeenCalledWith(
                expect.objectContaining({ name: baseAgent.name }),
                expect.objectContaining({
                    displayName: 'Updated Low-Code Support Agent',
                    description: 'Updated low-code description',
                    lowCodeAgentDefinition: expect.objectContaining({
                        draftDisplayName: 'Updated Low-Code Support Agent',
                        draftDescription: 'Updated low-code description',
                    }),
                }),
                mockConfig
            );
            // Verify it did NOT inject adkAgentDefinition, a2aAgentDefinition, or authorizationConfig onto the no-code agent
            const patchPayload = vi.mocked(api.updateAgent).mock.calls[0][1];
            expect(patchPayload.adkAgentDefinition).toBeUndefined();
            expect(patchPayload.a2aAgentDefinition).toBeUndefined();
            expect(patchPayload.authorizationConfig).toBeUndefined();
            expect(onSuccess).toHaveBeenCalledTimes(1);
        });
    });

    it('protects Google-managed built-in agents (Deep Research) from deletion in AgentList & AgentDetails and renders the Restore Deep Research banner when missing', async () => {
        const deepResearchAgent: Agent = {
            name: 'projects/test-proj/locations/global/collections/default_collection/engines/engine-123/assistants/default_assistant/agents/deep_research',
            displayName: 'Deep Research',
            state: 'ENABLED',
            agentType: 'MANAGED',
            agentOrigin: 'GOOGLE',
            managedAgentDefinition: {
                researchAssistantAgentConfig: { supportLroQueries: true },
            },
            sharingConfig: { scope: 'ALL_USERS' },
        };

        const onDeleteAgent = vi.fn();
        const onToggleSelectAll = vi.fn();
        const onRestoreDeepResearch = vi.fn();

        const { unmount } = render(
            <AgentList
                agents={[deepResearchAgent, baseAgent]}
                onSelectAgent={vi.fn()}
                onEditAgent={vi.fn()}
                onDeleteAgent={onDeleteAgent}
                onRegisterNew={vi.fn()}
                onToggleAgentStatus={vi.fn()}
                deletingAgentIds={new Set()}
                selectedAgents={new Set()}
                onToggleSelect={vi.fn()}
                onToggleSelectAll={onToggleSelectAll}
                onDeleteSelected={vi.fn()}
                onSort={vi.fn()}
                sortConfig={{ key: 'displayName', direction: 'asc' }}
                canRestoreDeepResearch={true}
                onRestoreDeepResearch={onRestoreDeepResearch}
            />
        );

        // Deep Research row must show "Google Built-in" and "Protected" instead of a Delete button
        expect(screen.getAllByText('Google Built-in').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('Protected')).toBeTruthy();

        // Deep Research checkbox must be disabled
        const deepResearchCheckbox = screen.getByLabelText('Select agent Deep Research') as HTMLInputElement;
        expect(deepResearchCheckbox.disabled).toBe(true);

        // Select All should only pass selectable (non-Google) agent names
        fireEvent.click(screen.getByLabelText('Select all agents'));
        expect(onToggleSelectAll).toHaveBeenCalledWith([baseAgent.name]);

        // Restore Deep Research button should trigger callback
        fireEvent.click(screen.getByRole('button', { name: 'Restore Deep Research' }));
        expect(onRestoreDeepResearch).toHaveBeenCalledTimes(1);

        unmount();

        // Now render AgentDetails for Deep Research and verify Delete is replaced by disabled "Protected Built-in"
        vi.mocked(api.getAgent).mockResolvedValue(deepResearchAgent);
        render(
            <AgentDetails
                agent={deepResearchAgent}
                config={mockConfig}
                onBack={vi.fn()}
                onEdit={vi.fn()}
                onDeleteSuccess={vi.fn()}
                onToggleStatus={vi.fn()}
                togglingAgentId={null}
                error={null}
            />
        );

        const protectedBtn = await screen.findByRole('button', { name: 'Protected Built-in' });
        expect((protectedBtn as HTMLButtonElement).disabled).toBe(true);
        expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
        expect(api.deleteResource).not.toHaveBeenCalled();
    });

    it('triggers onTestAgent for conversational agents in AgentList and AgentDetails, and hides Test for SKILL agents', async () => {
        const skillAgent: Agent = {
            ...baseAgent,
            name: 'projects/123/locations/global/collections/default_collection/engines/eng-1/assistants/default_assistant/agents/skill-1',
            displayName: 'BQ Skill',
            agentType: 'SKILL',
        };
        const onTestAgent = vi.fn();

        const { unmount } = render(
            <AgentList
                agents={[baseAgent, skillAgent]}
                onSelectAgent={vi.fn()}
                onEditAgent={vi.fn()}
                onDeleteAgent={vi.fn()}
                onTestAgent={onTestAgent}
                onRegisterNew={vi.fn()}
                onToggleAgentStatus={vi.fn()}
                togglingAgentId={null}
                deletingAgentIds={new Set()}
                selectedAgents={new Set()}
                onToggleSelect={vi.fn()}
                onToggleSelectAll={vi.fn()}
                onDeleteSelected={vi.fn()}
                onSort={vi.fn()}
                sortConfig={{ key: 'displayName', direction: 'asc' }}
            />
        );

        // Only 1 Test button should render (for baseAgent, not skillAgent)
        const testButtons = screen.getAllByRole('button', { name: 'Test' });
        expect(testButtons).toHaveLength(1);
        fireEvent.click(testButtons[0]);
        expect(onTestAgent).toHaveBeenCalledWith(baseAgent);

        unmount();

        // Render AgentDetails for baseAgent -> should show "Test Agent"
        vi.mocked(api.getAgent).mockResolvedValue(baseAgent);
        const { unmount: unmountDetails } = render(
            <AgentDetails
                agent={baseAgent}
                config={mockConfig}
                onBack={vi.fn()}
                onEdit={vi.fn()}
                onDeleteSuccess={vi.fn()}
                onToggleStatus={vi.fn()}
                togglingAgentId={null}
                error={null}
                onTestAgent={onTestAgent}
            />
        );

        const detailsTestBtn = await screen.findByRole('button', { name: 'Test Agent' });
        fireEvent.click(detailsTestBtn);
        expect(onTestAgent).toHaveBeenCalledTimes(2);
        unmountDetails();

        // Render AgentDetails for skillAgent -> should NOT show "Test Agent"
        vi.mocked(api.getAgent).mockResolvedValue(skillAgent);
        render(
            <AgentDetails
                agent={skillAgent}
                config={mockConfig}
                onBack={vi.fn()}
                onEdit={vi.fn()}
                onDeleteSuccess={vi.fn()}
                onToggleStatus={vi.fn()}
                togglingAgentId={null}
                error={null}
                onTestAgent={onTestAgent}
            />
        );

        expect(screen.queryByRole('button', { name: 'Test Agent' })).toBeNull();
    });
});


