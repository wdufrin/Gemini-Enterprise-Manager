import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as core from '../core';
import {
    extractCollectionIdFromConnectorPath,
    validateConnectorResourceName,
    extractDataStoreInfo,
    validateDataStoreResourceName,
    isSameConnectorReference,
    isSameDataStoreReference,
    extractAgentDatasources,
    applyAgentDatasourceMutation,
    buildEntityDataStoreRemap,
    updateAndPublishNoCodeAgent,
    bulkUpdateNoCodeAgentDatasources,
    DiscoveredDataStoreOption,
} from './agentDatasources';
import { updateAgent, deployLowCodeAgent, publishAgent } from './agents';
import { Agent, Config } from '../../../types';

vi.mock('../core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../core')>();
    return {
        ...actual,
        gapiRequest: vi.fn(),
    };
});

describe('agentDatasources - Validators & Resource Path Parsers', () => {
    it('extractCollectionIdFromConnectorPath parses full and relative connector paths', () => {
        expect(
            extractCollectionIdFromConnectorPath(
                'projects/my-proj/locations/global/collections/jira_old_col/dataConnector'
            )
        ).toBe('jira_old_col');
        expect(extractCollectionIdFromConnectorPath('collections/jira_rel_col/dataConnector')).toBe(
            'jira_rel_col'
        );
    });

    it('validateConnectorResourceName accepts valid full and relative connector resource names', () => {
        const full =
            'projects/12345/locations/global/collections/salesforce_vpcsc_1/dataConnector';
        const rel = 'collections/salesforce_vpcsc_1/dataConnector';
        expect(validateConnectorResourceName(full)).toBe(full);
        expect(validateConnectorResourceName(`  ${rel}  `)).toBe(rel);
    });

    it('validateConnectorResourceName rejects malformed, empty, or hostile inputs (Adversarial)', () => {
        expect(() => validateConnectorResourceName('')).toThrow(/cannot be empty/i);
        expect(() => validateConnectorResourceName('   ')).toThrow(/cannot be empty/i);
        expect(() => validateConnectorResourceName('0.0.0.0/0')).toThrow(
            /Invalid DataConnector resource name/i
        );
        expect(() =>
            validateConnectorResourceName('projects/p/locations/l/collections/c/dataStores/ds1')
        ).toThrow(/Invalid DataConnector resource name/i);
        expect(() =>
            validateConnectorResourceName('collections/../evil/dataConnector')
        ).toThrow(/Invalid DataConnector resource name/i);
        expect(() => validateConnectorResourceName('{ "malformed": true }')).toThrow(
            /Invalid DataConnector resource name/i
        );
    });

    it('extractDataStoreInfo and validateDataStoreResourceName parse valid paths and reject malformed inputs (Adversarial)', () => {
        const validFull =
            'projects/test-proj/locations/us/collections/jira_col/dataStores/jira_col_issues';
        const validRel = 'collections/jira_col/dataStores/jira_col_issues';

        expect(validateDataStoreResourceName(validFull)).toBe(validFull);
        expect(
            validateDataStoreResourceName(validRel, {
                projectId: 'test-proj',
                appLocation: 'us',
            })
        ).toBe(validFull);
        expect(extractDataStoreInfo(validFull)).toEqual({
            collectionId: 'jira_col',
            dataStoreId: 'jira_col_issues',
        });

        expect(() => validateDataStoreResourceName('')).toThrow(/cannot be empty/i);
        expect(() =>
            validateDataStoreResourceName('projects/p/locations/l/collections/c/dataConnector')
        ).toThrow(/Invalid DataStore resource name/i);
        expect(() =>
            validateDataStoreResourceName('collections/c/dataStores/../secret')
        ).toThrow(/Invalid DataStore resource name/i);
        expect(() => validateDataStoreResourceName('0.0.0.0/0')).toThrow(
            /Invalid DataStore resource name/i
        );
    });

    it('isSameConnectorReference and isSameDataStoreReference match equivalent full and relative paths', () => {
        expect(
            isSameConnectorReference(
                'projects/123/locations/global/collections/servicenow_1/dataConnector',
                'collections/servicenow_1/dataConnector'
            )
        ).toBe(true);
        expect(
            isSameConnectorReference(
                'collections/servicenow_1/dataConnector',
                'collections/servicenow_2/dataConnector'
            )
        ).toBe(false);

        expect(
            isSameDataStoreReference(
                'projects/123/locations/global/collections/col_1/dataStores/ds_alpha',
                'collections/col_1/dataStores/ds_alpha'
            )
        ).toBe(true);
        expect(
            isSameDataStoreReference(
                'collections/col_1/dataStores/ds_alpha',
                'collections/col_2/dataStores/ds_alpha'
            )
        ).toBe(false);
    });
});

describe('agentDatasources - Extraction & Mutation on LOW_CODE and WORKFLOW_AGENT', () => {
    const sampleLowCodeAgent: Agent = {
        name: 'projects/p1/locations/global/collections/default_collection/engines/e1/assistants/default_assistant/agents/lc-1',
        displayName: 'Jira Triage Assistant',
        lowCodeAgentDefinition: {
            rootAgentId: '1',
            deployedRootAgentId: '1',
            nodes: [
                {
                    id: '1',
                    displayName: 'Root Node',
                    llmAgentNode: {
                        model: 'gemini-2.5-flash',
                        instruction: 'Help triage Jira tickets.',
                        dataConnectors: [
                            {
                                name: 'collections/jira_legacy/dataConnector',
                                dataSource: 'jira',
                            },
                        ],
                        dataStoreSpecs: {
                            specs: [
                                {
                                    dataStore:
                                        'projects/p1/locations/global/collections/jira_legacy/dataStores/jira_legacy_issue',
                                },
                            ],
                        },
                    },
                },
            ],
            deployedNodes: [
                {
                    id: '1',
                    displayName: 'Old Deployed Snapshot',
                },
            ],
        },
        dataConnectors: [
            {
                name: 'projects/p1/locations/global/collections/jira_legacy/dataConnector',
                dataSource: 'jira',
            },
        ],
        dataStoreSpecs: {
            specs: [
                {
                    dataStore:
                        'projects/p1/locations/global/collections/jira_legacy/dataStores/jira_legacy_issue',
                },
            ],
        },
    };

    const sampleWorkflowAgent: Agent = {
        name: 'projects/p1/locations/global/collections/default_collection/engines/e1/assistants/default_assistant/agents/wf-1',
        displayName: 'VPC-SC Incident Workflow',
        workflowAgentDefinition: {
            agentFlow: {
                nodes: [
                    {
                        id: 'trigger_1',
                        title: 'Jira Trigger',
                        connectorEventTrigger: {
                            dataConnector: {
                                name: 'projects/p1/locations/global/collections/jira_legacy/dataConnector',
                                dataSource: 'jira',
                            },
                            triggerKey: 'issue_created',
                        },
                    },
                    {
                        id: 'llm_step_1',
                        title: 'Analyze Incident',
                        agentNode: {
                            model: 'gemini-2.5-pro',
                            connectorToolSelections: [
                                {
                                    dataConnector: {
                                        name: 'projects/p1/locations/global/collections/jira_legacy/dataConnector',
                                        dataSource: 'jira',
                                    },
                                    enabled: true,
                                },
                            ],
                            dataStoreSpecs: {
                                specs: [
                                    {
                                        dataStore:
                                            'projects/p1/locations/global/collections/jira_legacy/dataStores/jira_legacy_issue',
                                    },
                                ],
                            },
                            knowledgeSources: [
                                {
                                    dataStoreKnowledgeSource: {
                                        dataStoreSpecs: {
                                            specs: [
                                                {
                                                    dataStore:
                                                        'projects/p1/locations/global/collections/jira_legacy/dataStores/jira_legacy_wiki',
                                                },
                                            ],
                                        },
                                    },
                                },
                            ],
                        },
                    },
                    {
                        id: 'loop_1',
                        title: 'Sub-loop',
                        forLoopNode: {
                            subAgentFlow: {
                                nodes: [
                                    {
                                        id: 'conn_action_1',
                                        title: 'Transition Issue',
                                        connectorNode: {
                                            dataConnector: {
                                                name: 'collections/jira_legacy/dataConnector',
                                                dataSource: 'jira',
                                            },
                                        },
                                    },
                                ],
                            },
                        },
                    },
                ],
            },
        },
    };

    it('extractAgentDatasources extracts all bound connectors and dataStores across Low-Code and Workflow agents', () => {
        const lcSummary = extractAgentDatasources(sampleLowCodeAgent);
        expect(lcSummary.connectors).toHaveLength(2);
        expect(lcSummary.connectors[0].collectionId).toBe('jira_legacy');
        expect(lcSummary.connectors[0].locationType).toBe('low_code_llm_node');
        expect(lcSummary.dataStores).toHaveLength(2);
        expect(lcSummary.dataStores[0].dataStoreId).toBe('jira_legacy_issue');

        const wfSummary = extractAgentDatasources(sampleWorkflowAgent);
        expect(wfSummary.connectors).toHaveLength(3);
        expect(wfSummary.dataStores).toHaveLength(2);
    });

    it('buildEntityDataStoreRemap maps old connector entity DataStores to new VPC-SC connector entity DataStores by suffix', () => {
        const catalog: DiscoveredDataStoreOption[] = [
            {
                name: 'projects/p1/locations/global/collections/jira_vpcsc/dataStores/jira_vpcsc_issue',
                dataStoreId: 'jira_vpcsc_issue',
                displayName: 'Jira Issues (VPC-SC)',
                collectionId: 'jira_vpcsc',
            },
            {
                name: 'projects/p1/locations/global/collections/jira_vpcsc/dataStores/jira_vpcsc_wiki',
                dataStoreId: 'jira_vpcsc_wiki',
                displayName: 'Jira Wiki (VPC-SC)',
                collectionId: 'jira_vpcsc',
            },
        ];

        const remap = buildEntityDataStoreRemap(
            sampleWorkflowAgent,
            'projects/p1/locations/global/collections/jira_legacy/dataConnector',
            'projects/p1/locations/global/collections/jira_vpcsc/dataConnector',
            catalog
        );

        expect(remap).toEqual({
            'projects/p1/locations/global/collections/jira_legacy/dataStores/jira_legacy_issue':
                'projects/p1/locations/global/collections/jira_vpcsc/dataStores/jira_vpcsc_issue',
            'projects/p1/locations/global/collections/jira_legacy/dataStores/jira_legacy_wiki':
                'projects/p1/locations/global/collections/jira_vpcsc/dataStores/jira_vpcsc_wiki',
        });
    });

    it('applyAgentDatasourceMutation replaces connector in Low-Code agent, preserves relative vs full format, and remaps entity dataStores', () => {
        const res = applyAgentDatasourceMutation(sampleLowCodeAgent, {
            type: 'replace_connector',
            oldConnectorName: 'projects/p1/locations/global/collections/jira_legacy/dataConnector',
            newConnectorName: 'projects/p1/locations/global/collections/jira_vpcsc/dataConnector',
            entityDataStoreRemap: {
                'projects/p1/locations/global/collections/jira_legacy/dataStores/jira_legacy_issue':
                    'projects/p1/locations/global/collections/jira_vpcsc/dataStores/jira_vpcsc_issue',
            },
        });

        expect(res.changedCount).toBeGreaterThan(0);
        // Root node had relative path 'collections/jira_legacy/dataConnector' -> should preserve relative format!
        expect(
            res.updatedAgent.lowCodeAgentDefinition?.nodes?.[0]?.llmAgentNode?.dataConnectors?.[0]
                ?.name
        ).toBe('collections/jira_vpcsc/dataConnector');
        // Top-level agent.dataConnectors had full path -> should preserve full format!
        expect(res.updatedAgent.dataConnectors?.[0]?.name).toBe(
            'projects/p1/locations/global/collections/jira_vpcsc/dataConnector'
        );
        // Entity DataStore remapped in both node and top-level
        expect(
            res.updatedAgent.lowCodeAgentDefinition?.nodes?.[0]?.llmAgentNode?.dataStoreSpecs
                ?.specs?.[0]?.dataStore
        ).toBe('projects/p1/locations/global/collections/jira_vpcsc/dataStores/jira_vpcsc_issue');
    });

    it('applyAgentDatasourceMutation replaces connector across all Workflow Agent nodes including nested ForLoop and remaps knowledgeSources', () => {
        const res = applyAgentDatasourceMutation(sampleWorkflowAgent, {
            type: 'replace_connector',
            oldConnectorName: 'collections/jira_legacy/dataConnector',
            newConnectorName: 'projects/p1/locations/global/collections/jira_vpcsc/dataConnector',
            entityDataStoreRemap: {
                'projects/p1/locations/global/collections/jira_legacy/dataStores/jira_legacy_issue':
                    'projects/p1/locations/global/collections/jira_vpcsc/dataStores/jira_vpcsc_issue',
                'projects/p1/locations/global/collections/jira_legacy/dataStores/jira_legacy_wiki':
                    'projects/p1/locations/global/collections/jira_vpcsc/dataStores/jira_vpcsc_wiki',
            },
        });

        expect(res.changedCount).toBe(5);
        const nodes = res.updatedAgent.workflowAgentDefinition?.agentFlow?.nodes || [];
        expect(nodes[0].connectorEventTrigger?.dataConnector?.name).toBe(
            'projects/p1/locations/global/collections/jira_vpcsc/dataConnector'
        );
        expect(nodes[1].agentNode?.connectorToolSelections?.[0]?.dataConnector?.name).toBe(
            'projects/p1/locations/global/collections/jira_vpcsc/dataConnector'
        );
        expect(nodes[1].agentNode?.dataStoreSpecs?.specs?.[0]?.dataStore).toBe(
            'projects/p1/locations/global/collections/jira_vpcsc/dataStores/jira_vpcsc_issue'
        );
        expect(
            nodes[1].agentNode?.knowledgeSources?.[0]?.dataStoreKnowledgeSource?.dataStoreSpecs
                ?.specs?.[0]?.dataStore
        ).toBe('projects/p1/locations/global/collections/jira_vpcsc/dataStores/jira_vpcsc_wiki');
        expect(
            nodes[2].forLoopNode?.subAgentFlow?.nodes?.[0]?.connectorNode?.dataConnector?.name
        ).toBe('collections/jira_vpcsc/dataConnector');
    });

    it('applyAgentDatasourceMutation supports add_connector, remove_connector, add_datastore, replace_datastore, and remove_datastore', () => {
        const newConn = 'projects/p1/locations/global/collections/servicenow_col/dataConnector';
        const addedConn = applyAgentDatasourceMutation(sampleLowCodeAgent, {
            type: 'add_connector',
            connectorName: newConn,
            dataSource: 'servicenow',
        });
        expect(addedConn.changedCount).toBeGreaterThan(0);
        expect(
            addedConn.updatedAgent.lowCodeAgentDefinition?.nodes?.[0]?.llmAgentNode?.dataConnectors
        ).toHaveLength(2);

        // Adding the same connector again should be a no-op (changedCount: 0)
        const duplicateAdd = applyAgentDatasourceMutation(addedConn.updatedAgent, {
            type: 'add_connector',
            connectorName: 'collections/servicenow_col/dataConnector',
        });
        expect(duplicateAdd.changedCount).toBe(0);

        // Removing the connector
        const removedConn = applyAgentDatasourceMutation(addedConn.updatedAgent, {
            type: 'remove_connector',
            connectorName: newConn,
        });
        expect(removedConn.changedCount).toBeGreaterThan(0);
        expect(
            removedConn.updatedAgent.lowCodeAgentDefinition?.nodes?.[0]?.llmAgentNode?.dataConnectors
        ).toHaveLength(1);

        // Add DataStore
        const newDs =
            'projects/p1/locations/global/collections/default_collection/dataStores/confluence_ds';
        const addedDs = applyAgentDatasourceMutation(sampleLowCodeAgent, {
            type: 'add_datastore',
            dataStore: newDs,
        });
        expect(addedDs.changedCount).toBeGreaterThan(0);
        expect(
            addedDs.updatedAgent.lowCodeAgentDefinition?.nodes?.[0]?.llmAgentNode?.dataStoreSpecs
                ?.specs
        ).toHaveLength(2);

        // Replace DataStore
        const replacedDs = applyAgentDatasourceMutation(addedDs.updatedAgent, {
            type: 'replace_datastore',
            oldDataStore: newDs,
            newDataStore:
                'projects/p1/locations/global/collections/default_collection/dataStores/confluence_vpcsc_ds',
        });
        expect(replacedDs.changedCount).toBeGreaterThan(0);

        // Remove DataStore
        const removedDs = applyAgentDatasourceMutation(replacedDs.updatedAgent, {
            type: 'remove_datastore',
            dataStore:
                'projects/p1/locations/global/collections/default_collection/dataStores/confluence_vpcsc_ds',
        });
        expect(removedDs.changedCount).toBeGreaterThan(0);
        expect(
            removedDs.updatedAgent.lowCodeAgentDefinition?.nodes?.[0]?.llmAgentNode?.dataStoreSpecs
                ?.specs
        ).toHaveLength(1);
    });

    it('applyAgentDatasourceMutation refuses to remove a connector bound only to dedicated Workflow action/trigger nodes (Adversarial)', () => {
        const triggerOnlyWorkflowAgent: Agent = {
            name: 'projects/p1/locations/global/collections/default_collection/engines/e1/assistants/default_assistant/agents/wf-trigger-only',
            displayName: 'Trigger Only Workflow',
            workflowAgentDefinition: {
                agentFlow: {
                    nodes: [
                        {
                            id: 'trigger_1',
                            connectorEventTrigger: {
                                dataConnector: {
                                    name: 'collections/jira_legacy/dataConnector',
                                },
                            },
                        },
                    ],
                },
            },
        };

        expect(() =>
            applyAgentDatasourceMutation(triggerOnlyWorkflowAgent, {
                type: 'remove_connector',
                connectorName: 'collections/jira_legacy/dataConnector',
            })
        ).toThrow(/bound to a dedicated Workflow Action, Trigger, or MCP node and cannot be removed/i);
    });
});

describe('agents & agentDatasources API - PATCH sanitization, Deploy/Publish, and Ownership Recovery', () => {
    const mockConfig: Config = {
        projectId: 'test-project',
        appLocation: 'global',
        collectionId: 'default_collection',
        appId: 'test-engine',
        assistantId: 'default_assistant',
    };

    const sampleLowCodeAgent: Agent = {
        name: 'projects/test-project/locations/global/collections/default_collection/engines/test-engine/assistants/default_assistant/agents/lc-agent-1',
        displayName: 'Sales Low-Code Agent',
        state: 'ENABLED',
        lowCodeAgentDefinition: {
            rootAgentId: '1',
            deployedRootAgentId: '1',
            ownerName: 'Old Owner',
            nodes: [
                {
                    id: '1',
                    displayName: 'Root',
                    llmAgentNode: {
                        model: 'gemini-2.5-flash',
                        dataConnectors: [
                            {
                                name: 'collections/old_sf/dataConnector',
                            },
                        ],
                    },
                },
            ],
            deployedNodes: [{ id: '1', displayName: 'Root' }],
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('updateAgent strips output-only fields from lowCodeAgentDefinition and includes data_connectors/data_store_specs in updateMask', async () => {
        vi.mocked(core.gapiRequest).mockResolvedValue(sampleLowCodeAgent);

        await updateAgent(
            sampleLowCodeAgent,
            {
                lowCodeAgentDefinition: sampleLowCodeAgent.lowCodeAgentDefinition,
                dataConnectors: [{ name: 'collections/new_sf/dataConnector' }],
            },
            mockConfig
        );

        expect(core.gapiRequest).toHaveBeenCalledTimes(1);
        const [url, method, , , payload] = vi.mocked(core.gapiRequest).mock.calls[0];
        expect(method).toBe('PATCH');
        expect(url).toContain('updateMask=low_code_agent_definition,data_connectors');
        const sentDef = (payload as Record<string, unknown>).lowCodeAgentDefinition as Record<
            string,
            unknown
        >;
        expect(sentDef.deployedNodes).toBeUndefined();
        expect(sentDef.deployedRootAgentId).toBeUndefined();
        expect(sentDef.ownerName).toBeUndefined();
        expect(sentDef.nodes).toBeDefined();
    });

    it('deployLowCodeAgent and publishAgent invoke :deployLowCode and :publish POST endpoints', async () => {
        vi.mocked(core.gapiRequest).mockResolvedValue(sampleLowCodeAgent);

        await deployLowCodeAgent(sampleLowCodeAgent.name, mockConfig);
        expect(vi.mocked(core.gapiRequest).mock.calls[0][0]).toContain(':deployLowCode');
        expect(vi.mocked(core.gapiRequest).mock.calls[0][1]).toBe('POST');

        await publishAgent(sampleLowCodeAgent.name, mockConfig);
        expect(vi.mocked(core.gapiRequest).mock.calls[1][0]).toContain(':publish');
        expect(vi.mocked(core.gapiRequest).mock.calls[1][1]).toBe('POST');
    });

    it('updateAndPublishNoCodeAgent claims ownership via :transferAgentOwner when :deployLowCode fails with 403 and autoClaimOwnershipOn403 is true', async () => {
        vi.mocked(core.gapiRequest)
            // 1. PATCH updateAgent succeeds
            .mockResolvedValueOnce(sampleLowCodeAgent)
            // 2. First POST :deployLowCode fails with 403 caller is not the owner
            .mockRejectedValueOnce(new Error('403 PERMISSION_DENIED: caller is not the owner'))
            // 3. POST :transferAgentOwner succeeds
            .mockResolvedValueOnce({})
            // 4. Retry POST :deployLowCode succeeds
            .mockResolvedValueOnce({})
            // 5. GET getAgent refresh succeeds
            .mockResolvedValueOnce({
                ...sampleLowCodeAgent,
                lowCodeAgentDefinition: {
                    ...sampleLowCodeAgent.lowCodeAgentDefinition,
                    deployedNodes: sampleLowCodeAgent.lowCodeAgentDefinition?.nodes,
                },
            });

        const result = await updateAndPublishNoCodeAgent(
            sampleLowCodeAgent,
            { lowCodeAgentDefinition: sampleLowCodeAgent.lowCodeAgentDefinition },
            mockConfig,
            {
                autoDeployOrPublish: true,
                autoClaimOwnershipOn403: true,
            }
        );

        expect(result.deployedOrPublished).toBe(true);
        expect(result.ownershipClaimed).toBe(true);
        expect(result.deployWarning).toBeUndefined();
        expect(core.gapiRequest).toHaveBeenCalledTimes(5);
        expect(vi.mocked(core.gapiRequest).mock.calls[2][0]).toContain(':transferAgentOwner');
        expect(vi.mocked(core.gapiRequest).mock.calls[3][0]).toContain(':deployLowCode');
    });

    it('updateAndPublishNoCodeAgent does NOT call :transferAgentOwner on PRIVATE Low-Code agents when :deployLowCode fails with 403 (Adversarial)', async () => {
        const privateLowCodeAgent: Agent = {
            ...sampleLowCodeAgent,
            state: 'PRIVATE',
        };

        vi.mocked(core.gapiRequest)
            // 1. PATCH updateAgent succeeds (Admin can PATCH private draft)
            .mockResolvedValueOnce(privateLowCodeAgent)
            // 2. POST :deployLowCode fails with 403 caller is not the owner
            .mockRejectedValueOnce(new Error('403 PERMISSION_DENIED: User does not have permission to access the Agent.'))
            // 3. GET getAgent refresh succeeds
            .mockResolvedValueOnce(privateLowCodeAgent);

        const result = await updateAndPublishNoCodeAgent(
            privateLowCodeAgent,
            { lowCodeAgentDefinition: privateLowCodeAgent.lowCodeAgentDefinition },
            mockConfig,
            {
                autoDeployOrPublish: true,
                autoClaimOwnershipOn403: true,
            }
        );

        expect(result.deployedOrPublished).toBe(false);
        expect(result.ownershipClaimed).toBe(false);
        expect(result.deployWarning).toMatch(/PRIVATE \(unshared\)/);
        // Must only call PATCH, :deployLowCode, and GET — NEVER :transferAgentOwner
        expect(core.gapiRequest).toHaveBeenCalledTimes(3);
        const calledUrls = vi.mocked(core.gapiRequest).mock.calls.map((c) => String(c[0]));
        expect(calledUrls.some((u) => u.includes(':transferAgentOwner'))).toBe(false);
    });

    it('updateAndPublishNoCodeAgent publishes PRIVATE Workflow agents directly via :publish without needing :transferAgentOwner', async () => {
        const privateWorkflowAgent: Agent = {
            name: 'projects/test-project/locations/global/collections/default_collection/engines/test-engine/assistants/default_assistant/agents/wf-private-1',
            displayName: 'Private Flow Agent',
            state: 'PRIVATE',
            workflowAgentDefinition: {
                agentFlow: {
                    nodes: [
                        {
                            id: 'agent_1',
                            agentNode: {
                                model: 'gemini-2.5-flash',
                            },
                        },
                    ],
                },
            },
        };

        vi.mocked(core.gapiRequest)
            // 1. PATCH updateAgent succeeds
            .mockResolvedValueOnce(privateWorkflowAgent)
            // 2. POST :publish succeeds directly for Admin even when PRIVATE
            .mockResolvedValueOnce({ agent: privateWorkflowAgent })
            // 3. GET getAgent refresh succeeds
            .mockResolvedValueOnce(privateWorkflowAgent);

        const result = await updateAndPublishNoCodeAgent(
            privateWorkflowAgent,
            { workflowAgentDefinition: privateWorkflowAgent.workflowAgentDefinition },
            mockConfig,
            {
                autoDeployOrPublish: true,
                autoClaimOwnershipOn403: false,
            }
        );

        expect(result.deployedOrPublished).toBe(true);
        expect(result.ownershipClaimed).toBe(false);
        expect(result.deployWarning).toBeUndefined();
        expect(core.gapiRequest).toHaveBeenCalledTimes(3);
        expect(vi.mocked(core.gapiRequest).mock.calls[1][0]).toContain(':publish');
    });

    it('bulkUpdateNoCodeAgentDatasources updates matching agents, skips non-matching agents, and reports progress', async () => {
        const untouchedAgent: Agent = {
            name: 'projects/test-project/locations/global/collections/default_collection/engines/test-engine/assistants/default_assistant/agents/lc-agent-2',
            displayName: 'Untouched HR Agent',
            lowCodeAgentDefinition: {
                nodes: [
                    {
                        id: '1',
                        llmAgentNode: {
                            dataConnectors: [{ name: 'collections/workday/dataConnector' }],
                        },
                    },
                ],
            },
        };

        vi.mocked(core.gapiRequest)
            .mockResolvedValueOnce(sampleLowCodeAgent) // PATCH lc-agent-1
            .mockResolvedValueOnce({}) // POST :deployLowCode lc-agent-1
            .mockResolvedValueOnce(sampleLowCodeAgent); // GET lc-agent-1

        const progressCalls: number[] = [];
        const report = await bulkUpdateNoCodeAgentDatasources(
            [sampleLowCodeAgent, untouchedAgent],
            {
                type: 'replace_connector',
                oldConnectorName: 'collections/old_sf/dataConnector',
                newConnectorName:
                    'projects/test-project/locations/global/collections/new_sf_vpcsc/dataConnector',
            },
            mockConfig,
            {
                autoDeployOrPublish: true,
                onProgress: (completed) => progressCalls.push(completed),
            }
        );

        expect(report.total).toBe(2);
        expect(report.updatedAndPublished).toBe(1);
        expect(report.skipped).toBe(1);
        expect(report.failed).toBe(0);
        expect(report.outcomes).toHaveLength(2);
        expect(report.outcomes[0].status).toBe('updated_and_published');
        expect(report.outcomes[1].status).toBe('skipped');
        expect(progressCalls).toEqual([1, 2]);
        expect(core.gapiRequest).toHaveBeenCalledTimes(3);
    });
});
