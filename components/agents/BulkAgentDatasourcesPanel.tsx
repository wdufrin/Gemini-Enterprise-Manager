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

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Agent, Config } from '../../types';
import * as api from '../../services/apiService';
import {
    AgentDatasourceBindings,
    AgentDatasourceMutation,
    BulkDatasourceAgentOutcome,
    BulkUpdateDatasourcesResult,
    DiscoveredConnectorOption,
    DiscoveredDataStoreOption,
} from '../../services/api/discovery/agentDatasources';
import { useToast } from '../../context/ToastContext';
import { toErrorMessage } from '../../utils/errors';
import Spinner from '../Spinner';

interface BulkAgentDatasourcesPanelProps {
    agents: Agent[];
    config: Config;
    initialSelectedAgentNames?: Set<string>;
    onBackToList: () => void;
    onRefreshAgents: () => void;
    onSelectAgent?: (agent: Agent) => void;
}

type BulkOperationMode =
    | 'replace_connector'
    | 'replace_datastore'
    | 'add_connector'
    | 'remove_connector'
    | 'add_datastore'
    | 'remove_datastore';

const BulkAgentDatasourcesPanel: React.FC<BulkAgentDatasourcesPanelProps> = ({
    agents,
    config,
    initialSelectedAgentNames,
    onBackToList,
    onRefreshAgents,
    onSelectAgent,
}) => {
    const { toast } = useToast();

    // Hydrated full agent definitions keyed by agent.name
    const [hydratedAgents, setHydratedAgents] = useState<Record<string, Agent>>({});
    const [isHydratingAgents, setIsHydratingAgents] = useState(false);
    const [hydrationError, setHydrationError] = useState<string | null>(null);

    // Discovered project connectors & data stores
    const [discoveredConnectors, setDiscoveredConnectors] = useState<DiscoveredConnectorOption[]>([]);
    const [discoveredDataStores, setDiscoveredDataStores] = useState<DiscoveredDataStoreOption[]>([]);
    const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
    const [catalogError, setCatalogError] = useState<string | null>(null);

    // Operation state
    const [mode, setMode] = useState<BulkOperationMode>('replace_connector');
    const [sourceConnector, setSourceConnector] = useState<string>('');
    const [targetConnector, setTargetConnector] = useState<string>('');
    const [customTargetConnector, setCustomTargetConnector] = useState<string>('');

    const [sourceDataStore, setSourceDataStore] = useState<string>('');
    const [targetDataStore, setTargetDataStore] = useState<string>('');
    const [customTargetDataStore, setCustomTargetDataStore] = useState<string>('');

    // Execution options
    const [autoDeployOrPublish, setAutoDeployOrPublish] = useState(true);
    const [autoRemapEntityDataStores, setAutoRemapEntityDataStores] = useState(true);
    const [autoClaimOwnershipOn403, setAutoClaimOwnershipOn403] = useState(false);
    const [onlyShowAffected, setOnlyShowAffected] = useState(false);

    // Selection & Execution state
    const [selectedAgentNames, setSelectedAgentNames] = useState<Set<string>>(new Set());
    const [isExecuting, setIsExecuting] = useState(false);
    const [progressStatus, setProgressStatus] = useState<{
        completed: number;
        total: number;
        currentName: string;
    } | null>(null);
    const [executionReport, setExecutionReport] = useState<BulkUpdateDatasourcesResult | null>(null);

    // Filter to custom no-code agents
    const noCodeAgents = useMemo(() => {
        return agents.filter((a) => {
            const hydrated = hydratedAgents[a.name] || a;
            return (
                api.isCustomNoCodeAgent(hydrated) ||
                Boolean(hydrated.lowCodeAgentDefinition) ||
                Boolean(hydrated.workflowAgentDefinition)
            );
        });
    }, [agents, hydratedAgents]);

    // Hydrate full agent specs and discover project datasources
    const loadAllData = useCallback(async () => {
        if (!config.projectId || !config.appId) return;

        setIsHydratingAgents(true);
        setHydrationError(null);
        setIsLoadingCatalog(true);
        setCatalogError(null);

        try {
            // 1. Discover project connectors & data stores concurrently with agent hydration
            const catalogPromise = api.discoverProjectDatasources(config).catch((err: unknown) => {
                setCatalogError(toErrorMessage(err) || 'Failed to discover project connectors and data stores.');
                return { connectors: [], dataStores: [] };
            });

            // 2. Hydrate candidate agents via getAgent
            const candidateAgents = agents.filter(
                (a) =>
                    api.isCustomNoCodeAgent(a) ||
                    a.agentType === 'LOW_CODE' ||
                    a.agentType === 'WORKFLOW_AGENT' ||
                    (!a.adkAgentDefinition && !a.a2aAgentDefinition)
            );

            const hydratedMap: Record<string, Agent> = {};
            await Promise.allSettled(
                candidateAgents.map(async (agent) => {
                    try {
                        const full = await api.getAgent(agent.name, config);
                        hydratedMap[agent.name] = {
                            ...agent,
                            ...full,
                            agentType: agent.agentType || full.agentType,
                            agentOrigin: agent.agentOrigin || full.agentOrigin,
                        };
                    } catch {
                        hydratedMap[agent.name] = agent;
                    }
                })
            );

            const catalog = await catalogPromise;
            setHydratedAgents(hydratedMap);
            setDiscoveredConnectors(catalog.connectors);
            setDiscoveredDataStores(catalog.dataStores);
        } catch (err: unknown) {
            setHydrationError(toErrorMessage(err) || 'Failed to inspect no-code agent definitions.');
        } finally {
            setIsHydratingAgents(false);
            setIsLoadingCatalog(false);
        }
    }, [agents, config]);

    useEffect(() => {
        loadAllData();
    }, [loadAllData]);

    // Summaries per agent
    const summariesByAgentName = useMemo(() => {
        const map: Record<string, AgentDatasourceBindings> = {};
        for (const a of noCodeAgents) {
            const full = hydratedAgents[a.name] || a;
            map[a.name] = api.extractAgentDatasources(full);
        }
        return map;
    }, [noCodeAgents, hydratedAgents]);

    // Aggregate all connectors currently bound across any no-code agent (including deleted/legacy ones)
    const boundConnectorOptions = useMemo(() => {
        const counts = new Map<
            string,
            { connectorName: string; collectionId: string; agentCount: number }
        >();
        for (const a of noCodeAgents) {
            const summary = summariesByAgentName[a.name];
            if (!summary) continue;
            const seenInAgent = new Set<string>();
            for (const c of summary.connectors) {
                const colId = c.collectionId || c.connectorName;
                if (seenInAgent.has(colId)) continue;
                seenInAgent.add(colId);
                const existing = counts.get(colId);
                if (existing) {
                    existing.agentCount += 1;
                } else {
                    counts.set(colId, {
                        connectorName: c.connectorName,
                        collectionId: colId,
                        agentCount: 1,
                    });
                }
            }
        }
        return Array.from(counts.values());
    }, [noCodeAgents, summariesByAgentName]);

    // Aggregate all data stores currently bound across any no-code agent
    const boundDataStoreOptions = useMemo(() => {
        const counts = new Map<
            string,
            { dataStore: string; dataStoreId: string; collectionId: string; agentCount: number }
        >();
        for (const a of noCodeAgents) {
            const summary = summariesByAgentName[a.name];
            if (!summary) continue;
            const seenInAgent = new Set<string>();
            for (const ds of summary.dataStores) {
                const colId = ds.collectionId || 'default_collection';
                const key = `${colId}/${ds.dataStoreId}`;
                if (seenInAgent.has(key)) continue;
                seenInAgent.add(key);
                const existing = counts.get(key);
                if (existing) {
                    existing.agentCount += 1;
                } else {
                    counts.set(key, {
                        dataStore: ds.dataStore,
                        dataStoreId: ds.dataStoreId,
                        collectionId: colId,
                        agentCount: 1,
                    });
                }
            }
        }
        return Array.from(counts.values());
    }, [noCodeAgents, summariesByAgentName]);

    // Active mutation object derived from current form inputs
    const activeMutation: AgentDatasourceMutation | null = useMemo(() => {
        switch (mode) {
            case 'replace_connector': {
                const target =
                    targetConnector === '__custom__' ? customTargetConnector.trim() : targetConnector;
                if (!sourceConnector || !target) return null;
                const matchedDisc = discoveredConnectors.find((c) =>
                    api.isSameConnectorReference(c.name, target)
                );
                return {
                    type: 'replace_connector',
                    oldConnectorName: sourceConnector,
                    newConnectorName: target,
                    newDataSource: matchedDisc?.dataSource,
                };
            }
            case 'replace_datastore': {
                const target =
                    targetDataStore === '__custom__' ? customTargetDataStore.trim() : targetDataStore;
                if (!sourceDataStore || !target) return null;
                return {
                    type: 'replace_datastore',
                    oldDataStore: sourceDataStore,
                    newDataStore: target,
                };
            }
            case 'add_connector': {
                const target =
                    targetConnector === '__custom__' ? customTargetConnector.trim() : targetConnector;
                if (!target) return null;
                const matchedDisc = discoveredConnectors.find((c) =>
                    api.isSameConnectorReference(c.name, target)
                );
                return {
                    type: 'add_connector',
                    connectorName: target,
                    dataSource: matchedDisc?.dataSource,
                };
            }
            case 'remove_connector': {
                const source =
                    sourceConnector === '__custom__' ? customTargetConnector.trim() : sourceConnector;
                if (!source) return null;
                return {
                    type: 'remove_connector',
                    connectorName: source,
                };
            }
            case 'add_datastore': {
                const target =
                    targetDataStore === '__custom__' ? customTargetDataStore.trim() : targetDataStore;
                if (!target) return null;
                return {
                    type: 'add_datastore',
                    dataStore: target,
                };
            }
            case 'remove_datastore': {
                const source =
                    sourceDataStore === '__custom__' ? customTargetDataStore.trim() : sourceDataStore;
                if (!source) return null;
                return {
                    type: 'remove_datastore',
                    dataStore: source,
                };
            }
        }
    }, [
        mode,
        sourceConnector,
        targetConnector,
        customTargetConnector,
        sourceDataStore,
        targetDataStore,
        customTargetDataStore,
        discoveredConnectors,
    ]);

    // Compute live dry-run preview for each no-code agent
    const previewByAgentName = useMemo(() => {
        const map: Record<
            string,
            {
                changed: boolean;
                changesSummary: string[];
                error?: string;
            }
        > = {};
        if (!activeMutation) return map;

        for (const a of noCodeAgents) {
            const full = hydratedAgents[a.name] || a;
            try {
                let effectiveMutation = activeMutation;
                if (
                    activeMutation.type === 'replace_connector' &&
                    autoRemapEntityDataStores
                ) {
                    const remap = api.buildEntityDataStoreRemap(
                        full,
                        activeMutation.oldConnectorName,
                        activeMutation.newConnectorName,
                        discoveredDataStores
                    );
                    effectiveMutation = {
                        ...activeMutation,
                        entityDataStoreRemap: remap,
                    };
                }

                const res = api.applyAgentDatasourceMutation(full, effectiveMutation, config);
                map[a.name] = {
                    changed: res.changedCount > 0,
                    changesSummary: res.changes,
                };
            } catch (err: unknown) {
                map[a.name] = {
                    changed: false,
                    changesSummary: [],
                    error: toErrorMessage(err),
                };
            }
        }
        return map;
    }, [
        noCodeAgents,
        hydratedAgents,
        activeMutation,
        autoRemapEntityDataStores,
        discoveredDataStores,
        config,
    ]);

    // Initialize selection when agents or activeMutation changes
    useEffect(() => {
        if (initialSelectedAgentNames && initialSelectedAgentNames.size > 0) {
            const validInitial = new Set(
                Array.from(initialSelectedAgentNames).filter((name) =>
                    noCodeAgents.some((a) => a.name === name)
                )
            );
            if (validInitial.size > 0) {
                setSelectedAgentNames(validInitial);
                return;
            }
        }
        if (activeMutation) {
            const affected = noCodeAgents
                .filter((a) => previewByAgentName[a.name]?.changed)
                .map((a) => a.name);
            setSelectedAgentNames(new Set(affected));
        }
    }, [activeMutation, noCodeAgents, previewByAgentName, initialSelectedAgentNames]);

    const displayedAgents = useMemo(() => {
        if (!onlyShowAffected || !activeMutation) return noCodeAgents;
        return noCodeAgents.filter(
            (a) => previewByAgentName[a.name]?.changed || previewByAgentName[a.name]?.error
        );
    }, [noCodeAgents, onlyShowAffected, activeMutation, previewByAgentName]);

    const handleToggleSelectAgent = (name: string) => {
        setSelectedAgentNames((prev) => {
            const next = new Set(prev);
            if (next.has(name)) {
                next.delete(name);
            } else {
                next.add(name);
            }
            return next;
        });
    };

    const handleSelectAllDisplayed = () => {
        const allDisplayedNames = displayedAgents.map((a) => a.name);
        const allSelected =
            allDisplayedNames.length > 0 &&
            allDisplayedNames.every((name) => selectedAgentNames.has(name));
        if (allSelected) {
            setSelectedAgentNames(new Set());
        } else {
            setSelectedAgentNames(new Set(allDisplayedNames));
        }
    };

    const handleSelectOnlyAffected = () => {
        const affected = noCodeAgents
            .filter((a) => previewByAgentName[a.name]?.changed)
            .map((a) => a.name);
        setSelectedAgentNames(new Set(affected));
    };

    const handleExecuteBulkUpdate = async () => {
        if (!activeMutation) {
            toast.error('Please complete the connector or data store selection first.');
            return;
        }
        const targets = noCodeAgents
            .filter((a) => selectedAgentNames.has(a.name))
            .map((a) => hydratedAgents[a.name] || a);

        if (targets.length === 0) {
            toast.error('Please select at least one no-code agent to update.');
            return;
        }

        setIsExecuting(true);
        setExecutionReport(null);
        setProgressStatus({
            completed: 0,
            total: targets.length,
            currentName: targets[0].displayName,
        });

        try {
            const report = await api.bulkUpdateNoCodeAgentDatasources(
                targets,
                activeMutation,
                config,
                {
                    autoDeployOrPublish,
                    autoClaimOwnershipOn403,
                    remapMatchingEntityDataStores: autoRemapEntityDataStores,
                    catalogDataStores: discoveredDataStores,
                    onProgress: (completed: number, total: number, latest: BulkDatasourceAgentOutcome) => {
                        setProgressStatus({
                            completed,
                            total,
                            currentName: latest.displayName,
                        });
                    },
                }
            );

            setExecutionReport(report);
            const updatedCount = report.updatedAndPublished + report.draftOnlyUpdated;
            if (report.failed > 0) {
                toast.warning(
                    `Bulk update finished: ${updatedCount} updated, ${report.failed} encountered errors.`
                );
            } else {
                toast.success(`Successfully updated ${updatedCount} no-code agent(s)!`);
            }

            await loadAllData();
            onRefreshAgents();
        } catch (err: unknown) {
            toast.error(toErrorMessage(err) || 'Bulk datasource update failed.');
        } finally {
            setIsExecuting(false);
            setProgressStatus(null);
        }
    };

    const getConnectorLabel = (connectorPath: string) => {
        const found = discoveredConnectors.find((c) =>
            api.isSameConnectorReference(c.name, connectorPath)
        );
        if (found) {
            return `${found.displayName} (${found.dataSource}${found.staticIpEnabled ? ' • VPC-SC' : ''})`;
        }
        return api.extractCollectionIdFromConnectorPath(connectorPath) || connectorPath;
    };

    const getDataStoreLabel = (dsPath: string) => {
        const found = discoveredDataStores.find((d) =>
            api.isSameDataStoreReference(d.name, dsPath)
        );
        if (found) {
            return `${found.displayName} (${found.dataStoreId})`;
        }
        return dsPath.split('/').pop() || dsPath;
    };

    const getAgentKindLabel = (agent: Agent): string => {
        if (agent.workflowAgentDefinition) return 'WORKFLOW_AGENT';
        if (agent.lowCodeAgentDefinition) return 'LOW_CODE';
        return agent.agentType || 'LOW_CODE';
    };

    return (
        <div className="bg-gray-800 shadow-xl rounded-lg border border-amber-500/30 overflow-hidden">
            {/* Header Banner */}
            <div className="p-5 bg-gradient-to-r from-amber-900/30 via-gray-800 to-cyan-900/30 border-b border-gray-700 flex flex-wrap justify-between items-start gap-4">
                <div>
                    <div className="flex items-center gap-2.5">
                        <span className="px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            Experimental
                        </span>
                        <h2 className="text-xl font-bold text-white">
                            Bulk No-Code Agent Datasource &amp; VPC-SC Connector Updater
                        </h2>
                    </div>
                    <p className="text-sm text-gray-300 mt-1.5 max-w-4xl">
                        Migrate, swap, add, or remove Data Connectors and Data Stores across multiple custom Low-Code and Workflow agents at once.
                        Ideal when rebuilding connectors for{' '}
                        <span className="text-emerald-300 font-medium">VPC-SC / Static IP compliance</span>{' '}
                        without manually re-creating every agent.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={loadAllData}
                        disabled={isHydratingAgents || isLoadingCatalog || isExecuting}
                        className="px-3.5 py-2 bg-gray-700 text-gray-200 text-xs font-semibold rounded-md hover:bg-gray-600 border border-gray-600 disabled:opacity-50"
                    >
                        {isHydratingAgents || isLoadingCatalog ? 'Scanning...' : 'Rescan Agents & Catalog'}
                    </button>
                    <button
                        type="button"
                        onClick={onBackToList}
                        className="px-3.5 py-2 bg-gray-700 text-white text-xs font-semibold rounded-md hover:bg-gray-600"
                    >
                        &larr; Back to Agent List
                    </button>
                </div>
            </div>

            <div className="p-6 space-y-6">
                {(hydrationError || catalogError) && (
                    <div className="p-3 bg-red-900/30 border border-red-700 rounded-md text-xs text-red-300 space-y-1">
                        {hydrationError && <p>{hydrationError}</p>}
                        {catalogError && <p>{catalogError}</p>}
                    </div>
                )}

                {/* Step 1: Select Operation Mode */}
                <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                            1. Choose Datasource Operation
                        </h3>
                        <div className="flex flex-wrap gap-1.5">
                            {(
                                [
                                    { id: 'replace_connector', label: 'Swap / Migrate Connector (VPC-SC)' },
                                    { id: 'replace_datastore', label: 'Swap Data Store' },
                                    { id: 'add_connector', label: 'Bulk Add Connector' },
                                    { id: 'remove_connector', label: 'Bulk Remove Connector' },
                                    { id: 'add_datastore', label: 'Bulk Add Data Store' },
                                    { id: 'remove_datastore', label: 'Bulk Remove Data Store' },
                                ] as { id: BulkOperationMode; label: string }[]
                            ).map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setMode(tab.id)}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                                        mode === tab.id
                                            ? 'bg-cyan-600 text-white shadow'
                                            : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Connector Swap / Add / Remove Form */}
                    {(mode === 'replace_connector' ||
                        mode === 'add_connector' ||
                        mode === 'remove_connector') && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-800">
                            {(mode === 'replace_connector' || mode === 'remove_connector') && (
                                <div>
                                    <label
                                        htmlFor="bulk-source-connector"
                                        className="block text-xs font-medium text-gray-300 mb-1"
                                    >
                                        {mode === 'replace_connector'
                                            ? 'Source Connector to Replace (Old / Non-VPC-SC Connector)'
                                            : 'Connector to Remove from Selected Agents'}
                                    </label>
                                    <select
                                        id="bulk-source-connector"
                                        value={sourceConnector}
                                        onChange={(e) => setSourceConnector(e.target.value)}
                                        className="bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full"
                                    >
                                        <option value="">-- Select Source Connector --</option>
                                        {boundConnectorOptions.length > 0 && (
                                            <optgroup label="Currently Bound in No-Code Agents">
                                                {boundConnectorOptions.map((opt) => (
                                                    <option
                                                        key={`bound-${opt.connectorName}`}
                                                        value={opt.connectorName}
                                                    >
                                                        {getConnectorLabel(opt.connectorName)} — used by{' '}
                                                        {opt.agentCount} agent(s) [{opt.collectionId}]
                                                    </option>
                                                ))}
                                            </optgroup>
                                        )}
                                        {discoveredConnectors.length > 0 && (
                                            <optgroup label="All Discovered Project Connectors">
                                                {discoveredConnectors.map((c) => (
                                                    <option key={`disc-${c.name}`} value={c.name}>
                                                        {c.displayName} ({c.dataSource}
                                                        {c.staticIpEnabled ? ' • VPC-SC' : ''}) [
                                                        {c.collectionId}]
                                                    </option>
                                                ))}
                                            </optgroup>
                                        )}
                                        {mode === 'remove_connector' && (
                                            <option value="__custom__">+ Enter custom connector path...</option>
                                        )}
                                    </select>
                                </div>
                            )}

                            {(mode === 'replace_connector' || mode === 'add_connector') && (
                                <div>
                                    <label
                                        htmlFor="bulk-target-connector"
                                        className="block text-xs font-medium text-gray-300 mb-1"
                                    >
                                        {mode === 'replace_connector'
                                            ? 'Target Replacement Connector (New / VPC-SC Compliant Connector)'
                                            : 'Connector to Add to Selected Agents'}
                                    </label>
                                    <select
                                        id="bulk-target-connector"
                                        value={targetConnector}
                                        onChange={(e) => setTargetConnector(e.target.value)}
                                        className="bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full"
                                    >
                                        <option value="">-- Select Target Connector --</option>
                                        {discoveredConnectors.map((c) => (
                                            <option key={c.name} value={c.name}>
                                                {c.displayName} ({c.dataSource}
                                                {c.staticIpEnabled ? ' • VPC-SC / Static IP' : ''}) [
                                                {c.collectionId}]
                                            </option>
                                        ))}
                                        <option value="__custom__">
                                            + Enter custom connector resource name...
                                        </option>
                                    </select>
                                </div>
                            )}

                            {(targetConnector === '__custom__' ||
                                (mode === 'remove_connector' && sourceConnector === '__custom__')) && (
                                <div className="md:col-span-2">
                                    <label
                                        htmlFor="bulk-custom-connector"
                                        className="block text-xs font-medium text-gray-400 mb-1"
                                    >
                                        Custom Connector Resource Name
                                    </label>
                                    <input
                                        id="bulk-custom-connector"
                                        type="text"
                                        value={customTargetConnector}
                                        onChange={(e) => setCustomTargetConnector(e.target.value)}
                                        placeholder="projects/{project}/locations/{loc}/collections/{collectionId}/dataConnector"
                                        className="bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-xs text-white font-mono w-full"
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Data Store Swap / Add / Remove Form */}
                    {(mode === 'replace_datastore' ||
                        mode === 'add_datastore' ||
                        mode === 'remove_datastore') && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-800">
                            {(mode === 'replace_datastore' || mode === 'remove_datastore') && (
                                <div>
                                    <label
                                        htmlFor="bulk-source-datastore"
                                        className="block text-xs font-medium text-gray-300 mb-1"
                                    >
                                        {mode === 'replace_datastore'
                                            ? 'Source Data Store to Replace'
                                            : 'Data Store to Remove from Selected Agents'}
                                    </label>
                                    <select
                                        id="bulk-source-datastore"
                                        value={sourceDataStore}
                                        onChange={(e) => setSourceDataStore(e.target.value)}
                                        className="bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full"
                                    >
                                        <option value="">-- Select Source Data Store --</option>
                                        {boundDataStoreOptions.length > 0 && (
                                            <optgroup label="Currently Bound in No-Code Agents">
                                                {boundDataStoreOptions.map((opt) => (
                                                    <option
                                                        key={`bound-ds-${opt.dataStore}`}
                                                        value={opt.dataStore}
                                                    >
                                                        {getDataStoreLabel(opt.dataStore)} — used by{' '}
                                                        {opt.agentCount} agent(s) [{opt.collectionId}]
                                                    </option>
                                                ))}
                                            </optgroup>
                                        )}
                                        {discoveredDataStores.length > 0 && (
                                            <optgroup label="All Discovered Project Data Stores">
                                                {discoveredDataStores.map((ds) => (
                                                    <option key={`disc-ds-${ds.name}`} value={ds.name}>
                                                        {ds.displayName} ({ds.dataStoreId} • {ds.collectionId})
                                                    </option>
                                                ))}
                                            </optgroup>
                                        )}
                                        {mode === 'remove_datastore' && (
                                            <option value="__custom__">
                                                + Enter custom Data Store resource name...
                                            </option>
                                        )}
                                    </select>
                                </div>
                            )}

                            {(mode === 'replace_datastore' || mode === 'add_datastore') && (
                                <div>
                                    <label
                                        htmlFor="bulk-target-datastore"
                                        className="block text-xs font-medium text-gray-300 mb-1"
                                    >
                                        {mode === 'replace_datastore'
                                            ? 'Target Replacement Data Store'
                                            : 'Data Store to Add to Selected Agents'}
                                    </label>
                                    <select
                                        id="bulk-target-datastore"
                                        value={targetDataStore}
                                        onChange={(e) => setTargetDataStore(e.target.value)}
                                        className="bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full"
                                    >
                                        <option value="">-- Select Target Data Store --</option>
                                        {discoveredDataStores.map((ds) => (
                                            <option key={ds.name} value={ds.name}>
                                                {ds.displayName} ({ds.dataStoreId} • {ds.collectionId})
                                            </option>
                                        ))}
                                        <option value="__custom__">
                                            + Enter custom Data Store resource name...
                                        </option>
                                    </select>
                                </div>
                            )}

                            {(targetDataStore === '__custom__' ||
                                (mode === 'remove_datastore' && sourceDataStore === '__custom__')) && (
                                <div className="md:col-span-2">
                                    <label
                                        htmlFor="bulk-custom-datastore"
                                        className="block text-xs font-medium text-gray-400 mb-1"
                                    >
                                        Custom Data Store Resource Name
                                    </label>
                                    <input
                                        id="bulk-custom-datastore"
                                        type="text"
                                        value={customTargetDataStore}
                                        onChange={(e) => setCustomTargetDataStore(e.target.value)}
                                        placeholder="projects/{project}/locations/{loc}/collections/{col}/dataStores/{dsId}"
                                        className="bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-xs text-white font-mono w-full"
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Execution Options */}
                    <div className="pt-3 border-t border-gray-800 flex flex-wrap items-center gap-6 text-xs text-gray-300">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={autoDeployOrPublish}
                                onChange={(e) => setAutoDeployOrPublish(e.target.checked)}
                                className="rounded bg-gray-700 border-gray-600 text-cyan-500 focus:ring-cyan-500"
                            />
                            <span>
                                Auto-publish / deploy after update (
                                <code className="text-cyan-300">:deployLowCode</code> /{' '}
                                <code className="text-cyan-300">:publish</code>)
                            </span>
                        </label>

                        {mode === 'replace_connector' && (
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={autoRemapEntityDataStores}
                                    onChange={(e) => setAutoRemapEntityDataStores(e.target.checked)}
                                    className="rounded bg-gray-700 border-gray-600 text-cyan-500 focus:ring-cyan-500"
                                />
                                <span>Also remap matching Connector Entity Data Stores</span>
                            </label>
                        )}

                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={autoClaimOwnershipOn403}
                                onChange={(e) => setAutoClaimOwnershipOn403(e.target.checked)}
                                className="rounded bg-gray-700 border-gray-600 text-amber-500 focus:ring-amber-500"
                            />
                            <span>
                                Auto-claim ownership (
                                <code className="text-amber-300">:transferAgentOwner</code>) if deploy
                                returns 403 on shared agents
                            </span>
                        </label>
                    </div>
                </div>

                {/* Step 2: Agent Selection & Live Blast-Radius Diff Preview */}
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                                2. Review Blast Radius &amp; Select Target No-Code Agents (
                                {selectedAgentNames.size} selected of {noCodeAgents.length})
                            </h3>
                            {(isHydratingAgents || isLoadingCatalog) && <Spinner />}
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={onlyShowAffected}
                                    onChange={(e) => setOnlyShowAffected(e.target.checked)}
                                    className="rounded bg-gray-700 border-gray-600 text-cyan-500"
                                />
                                <span>Show only affected agents</span>
                            </label>
                            {activeMutation && (
                                <button
                                    type="button"
                                    onClick={handleSelectOnlyAffected}
                                    className="px-2.5 py-1 text-xs font-semibold bg-gray-700 text-cyan-300 rounded hover:bg-gray-600 border border-gray-600"
                                >
                                    Select Affected Only
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={handleExecuteBulkUpdate}
                                disabled={
                                    isExecuting || !activeMutation || selectedAgentNames.size === 0
                                }
                                className="px-4 py-2 bg-cyan-600 text-white text-xs font-bold rounded-md hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed shadow"
                            >
                                {isExecuting
                                    ? `Updating (${progressStatus?.completed || 0}/${progressStatus?.total || selectedAgentNames.size})...`
                                    : `Execute Bulk Update on ${selectedAgentNames.size} Agent(s)`}
                            </button>
                        </div>
                    </div>

                    {/* Execution Results Summary */}
                    {executionReport && (
                        <div className="p-4 bg-gray-900/90 border border-gray-700 rounded-lg space-y-2">
                            <div className="flex items-center justify-between">
                                <h4 className="text-sm font-semibold text-white">
                                    Bulk Update Execution Report ({executionReport.updatedAndPublished}{' '}
                                    live, {executionReport.draftOnlyUpdated} draft,{' '}
                                    {executionReport.skipped} skipped, {executionReport.failed} failed)
                                </h4>
                                <button
                                    type="button"
                                    onClick={() => setExecutionReport(null)}
                                    className="text-xs text-gray-400 hover:text-white"
                                >
                                    Dismiss
                                </button>
                            </div>
                            <ul className="divide-y divide-gray-800 max-h-60 overflow-y-auto text-xs">
                                {executionReport.outcomes.map((res) => (
                                    <li
                                        key={res.agentName}
                                        className="py-2 flex flex-wrap items-start justify-between gap-2"
                                    >
                                        <div>
                                            <span className="font-semibold text-white">
                                                {res.displayName}
                                            </span>
                                            <span className="ml-2 font-mono text-gray-500">
                                                ({res.agentName.split('/').pop()})
                                            </span>
                                            {res.changes.length > 0 && (
                                                <ul className="mt-1 text-gray-300 list-disc list-inside">
                                                    {res.changes.map((line, i) => (
                                                        <li key={i}>{line}</li>
                                                    ))}
                                                </ul>
                                            )}
                                            {res.warning && (
                                                <p className="text-amber-300 mt-0.5">{res.warning}</p>
                                            )}
                                            {res.error && (
                                                <p className="text-red-400 mt-0.5">{res.error}</p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {res.ownershipClaimed && (
                                                <span className="px-2 py-0.5 rounded bg-amber-900/50 text-amber-300 border border-amber-700/50">
                                                    Ownership Claimed
                                                </span>
                                            )}
                                            {res.status === 'failed' ? (
                                                <span className="px-2.5 py-0.5 rounded font-semibold bg-red-900/50 text-red-300 border border-red-700">
                                                    Failed
                                                </span>
                                            ) : res.status === 'updated_and_published' ? (
                                                <span className="px-2.5 py-0.5 rounded font-semibold bg-emerald-900/50 text-emerald-300 border border-emerald-700">
                                                    Updated &amp; Live
                                                </span>
                                            ) : res.status === 'draft_updated' ? (
                                                <span className="px-2.5 py-0.5 rounded font-semibold bg-amber-900/50 text-amber-300 border border-amber-700">
                                                    Draft Updated
                                                </span>
                                            ) : (
                                                <span className="px-2.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
                                                    No Matching Binding
                                                </span>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Agents Table */}
                    {noCodeAgents.length === 0 && !isHydratingAgents ? (
                        <div className="p-6 text-center text-gray-400 bg-gray-900/40 rounded-lg border border-gray-700">
                            No custom Low-Code or Workflow agents found in this Gemini Enterprise engine.
                        </div>
                    ) : (
                        <div className="overflow-x-auto border border-gray-700 rounded-lg">
                            <table className="min-w-full divide-y divide-gray-700 text-sm">
                                <thead className="bg-gray-900/70">
                                    <tr>
                                        <th scope="col" className="px-4 py-3 w-10">
                                            <input
                                                type="checkbox"
                                                checked={
                                                    displayedAgents.length > 0 &&
                                                    displayedAgents.every((a) =>
                                                        selectedAgentNames.has(a.name)
                                                    )
                                                }
                                                onChange={handleSelectAllDisplayed}
                                                aria-label="Select all displayed no-code agents"
                                                className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-cyan-500"
                                            />
                                        </th>
                                        <th
                                            scope="col"
                                            className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase"
                                        >
                                            No-Code Agent
                                        </th>
                                        <th
                                            scope="col"
                                            className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase"
                                        >
                                            Kind / Status
                                        </th>
                                        <th
                                            scope="col"
                                            className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase"
                                        >
                                            Bound Connectors
                                        </th>
                                        <th
                                            scope="col"
                                            className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase"
                                        >
                                            Bound Data Stores
                                        </th>
                                        <th
                                            scope="col"
                                            className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase"
                                        >
                                            Dry-Run Diff Preview
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-gray-800 divide-y divide-gray-700">
                                    {displayedAgents.map((agent) => {
                                        const full = hydratedAgents[agent.name] || agent;
                                        const summary = summariesByAgentName[agent.name];
                                        const preview = previewByAgentName[agent.name];
                                        const isSelected = selectedAgentNames.has(agent.name);
                                        const agentId = agent.name.split('/').pop() || '';
                                        const isPrivate =
                                            !full.state ||
                                            (full.state !== 'ENABLED' && full.state !== 'DISABLED');

                                        return (
                                            <tr
                                                key={agent.name}
                                                className={`${
                                                    isSelected
                                                        ? 'bg-cyan-950/30'
                                                        : 'hover:bg-gray-700/40'
                                                } transition-colors`}
                                            >
                                                <td className="px-4 py-3 align-top">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() =>
                                                            handleToggleSelectAgent(agent.name)
                                                        }
                                                        aria-label={`Select ${agent.displayName}`}
                                                        className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-cyan-500"
                                                    />
                                                </td>
                                                <td className="px-4 py-3 align-top">
                                                    <div className="font-medium text-white flex items-center gap-2">
                                                        {onSelectAgent ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => onSelectAgent(full)}
                                                                className="text-left hover:text-cyan-400 underline decoration-dotted"
                                                            >
                                                                {agent.displayName}
                                                            </button>
                                                        ) : (
                                                            agent.displayName
                                                        )}
                                                    </div>
                                                    <div className="text-xs font-mono text-gray-400 mt-0.5">
                                                        {agentId}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 align-top whitespace-nowrap space-y-1">
                                                    <div>
                                                        <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-gray-700 text-gray-200">
                                                            {getAgentKindLabel(full)}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        {isPrivate ? (
                                                            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/40">
                                                                Private
                                                            </span>
                                                        ) : (
                                                            <span
                                                                className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                                                                    full.state === 'ENABLED'
                                                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                                                        : 'bg-red-500/20 text-red-300 border border-red-500/40'
                                                                }`}
                                                            >
                                                                {full.state}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 align-top">
                                                    {!summary || summary.connectors.length === 0 ? (
                                                        <span className="text-xs text-gray-500 italic">
                                                            None
                                                        </span>
                                                    ) : (
                                                        <ul className="space-y-1">
                                                            {summary.connectors.map((c) => (
                                                                <li
                                                                    key={c.id}
                                                                    className="text-xs bg-gray-900/60 px-2 py-1 rounded border border-gray-700"
                                                                >
                                                                    <div className="text-gray-200 font-medium">
                                                                        {getConnectorLabel(c.connectorName)}
                                                                    </div>
                                                                    <div className="text-[11px] font-mono text-gray-400 truncate max-w-xs">
                                                                        {c.collectionId || c.connectorName}
                                                                    </div>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 align-top">
                                                    {!summary || summary.dataStores.length === 0 ? (
                                                        <span className="text-xs text-gray-500 italic">
                                                            None
                                                        </span>
                                                    ) : (
                                                        <ul className="space-y-1">
                                                            {summary.dataStores.map((ds) => (
                                                                <li
                                                                    key={ds.id}
                                                                    className="text-xs bg-gray-900/60 px-2 py-1 rounded border border-gray-700"
                                                                >
                                                                    <div className="text-gray-200 font-medium">
                                                                        {getDataStoreLabel(ds.dataStore)}
                                                                    </div>
                                                                    <div className="text-[11px] font-mono text-gray-400 truncate max-w-xs">
                                                                        {ds.dataStoreId}
                                                                    </div>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 align-top">
                                                    {!activeMutation ? (
                                                        <span className="text-xs text-gray-500 italic">
                                                            Select operation parameters above to preview changes
                                                        </span>
                                                    ) : preview?.error ? (
                                                        <span className="text-xs text-red-400">
                                                            {preview.error}
                                                        </span>
                                                    ) : preview?.changed ? (
                                                        <ul className="space-y-1 text-xs text-emerald-300">
                                                            {preview.changesSummary.map((line, idx) => (
                                                                <li
                                                                    key={idx}
                                                                    className="flex items-start gap-1.5"
                                                                >
                                                                    <span className="text-emerald-400 font-bold">
                                                                        &rarr;
                                                                    </span>
                                                                    <span>{line}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    ) : (
                                                        <span className="text-xs text-gray-500">
                                                            No matching binding
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BulkAgentDatasourcesPanel;
