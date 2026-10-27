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

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Agent,
    AgentOwnerRemapCsvParseResult,
    BulkEditSharePublishOptions,
    BulkEditSharePublishResult,
    Config,
    PreviousOwnerDisposition,
} from '../../types';
import * as api from '../../services/apiService';
import {
    AgentDatasourceBindings,
    AgentDatasourceMutation,
    BulkDatasourceAgentOutcome,
    BulkUpdateDatasourcesResult,
    DiscoveredConnectorOption,
    DiscoveredDataStoreOption,
} from '../../services/api/discovery/agentDatasources';
import { STANDARD_ENTERPRISE_MODELS } from '../assistants/engine-details/modelsCatalog';
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

type BulkSectionFilter = 'all' | 'iam' | 'settings' | 'datasources';

const BulkAgentDatasourcesPanel: React.FC<BulkAgentDatasourcesPanelProps> = ({
    agents,
    config,
    initialSelectedAgentNames,
    onBackToList,
    onRefreshAgents,
    onSelectAgent,
}) => {
    const { toast } = useToast();
    const csvFileInputRef = useRef<HTMLInputElement>(null);

    // Active section view filter ('all' shows all 3 sections stacked clearly)
    const [activeSectionFilter, setActiveSectionFilter] = useState<BulkSectionFilter>('all');

    // Hydrated full agent definitions keyed by agent.name
    const [hydratedAgents, setHydratedAgents] = useState<Record<string, Agent>>({});
    const [isHydratingAgents, setIsHydratingAgents] = useState(false);
    const [hydrationError, setHydrationError] = useState<string | null>(null);

    // Discovered project connectors & data stores
    const [discoveredConnectors, setDiscoveredConnectors] = useState<DiscoveredConnectorOption[]>([]);
    const [discoveredDataStores, setDiscoveredDataStores] = useState<DiscoveredDataStoreOption[]>([]);
    const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
    const [catalogError, setCatalogError] = useState<string | null>(null);

    // ============================================================================
    // Section 1: IAM, Sharing & Publish Bulk Update State
    // ============================================================================
    const [publishDrafts, setPublishDrafts] = useState(false);
    const [lifecycleAction, setLifecycleAction] =
        useState<NonNullable<BulkEditSharePublishOptions['lifecycleAction']>>('NONE');
    const [sharingScope, setSharingScope] =
        useState<NonNullable<BulkEditSharePublishOptions['sharingScope']>>('UNCHANGED');
    const [sharedPrincipalsInput, setSharedPrincipalsInput] = useState('');
    const [sharedPrincipalMode, setSharedPrincipalMode] =
        useState<NonNullable<BulkEditSharePublishOptions['sharedPrincipalMode']>>('APPEND');
    const [deleteOriginalPrivateClone, setDeleteOriginalPrivateClone] = useState(false);
    const [ownerRemapByAgent, setOwnerRemapByAgent] = useState<Record<string, string>>({});
    const [defaultTargetOwner, setDefaultTargetOwner] = useState<string>('');
    const [previousOwnerDisposition, setPreviousOwnerDisposition] =
        useState<PreviousOwnerDisposition>('KEEP_AS_AGENT_USER');
    const [csvParseSummary, setCsvParseSummary] =
        useState<AgentOwnerRemapCsvParseResult | null>(null);
    const [csvFileName, setCsvFileName] = useState<string>('');

    // ============================================================================
    // Section 2: Agent Settings & Metadata Bulk Update State
    // ============================================================================
    const [descriptionMode, setDescriptionMode] =
        useState<NonNullable<BulkEditSharePublishOptions['descriptionMode']>>('UNCHANGED');
    const [descriptionText, setDescriptionText] = useState('');
    const [lowCodeModel, setLowCodeModel] = useState<string>('UNCHANGED');
    const [observabilityEnabled, setObservabilityEnabled] =
        useState<NonNullable<BulkEditSharePublishOptions['observabilityEnabled']>>('UNCHANGED');
    const [sensitiveLoggingEnabled, setSensitiveLoggingEnabled] =
        useState<NonNullable<BulkEditSharePublishOptions['sensitiveLoggingEnabled']>>('UNCHANGED');

    // Shared 403 Ownership Recovery option (applies to both IAM/Settings and Datastore updates)
    const [autoClaimOwnershipOn403, setAutoClaimOwnershipOn403] = useState(true);

    // IAM & Settings execution state
    const [isExecutingIamSettings, setIsExecutingIamSettings] = useState(false);
    const [iamSettingsError, setIamSettingsError] = useState<string | null>(null);
    const [iamSettingsProgress, setIamSettingsProgress] = useState<{
        completed: number;
        total: number;
        currentName: string;
    } | null>(null);
    const [iamSettingsReport, setIamSettingsReport] = useState<BulkEditSharePublishResult | null>(
        null
    );

    // ============================================================================
    // Section 3: Datastore & VPC-SC Connector Bulk Update State
    // ============================================================================
    const [mode, setMode] = useState<BulkOperationMode>('replace_connector');
    const [sourceConnector, setSourceConnector] = useState<string>('');
    const [targetConnector, setTargetConnector] = useState<string>('');
    const [customTargetConnector, setCustomTargetConnector] = useState<string>('');

    const [sourceDataStore, setSourceDataStore] = useState<string>('');
    const [targetDataStore, setTargetDataStore] = useState<string>('');
    const [customTargetDataStore, setCustomTargetDataStore] = useState<string>('');

    const [autoDeployOrPublish, setAutoDeployOrPublish] = useState(true);
    const [autoRemapEntityDataStores, setAutoRemapEntityDataStores] = useState(true);
    const [onlyShowAffected, setOnlyShowAffected] = useState(false);
    const [onlyShowNoCode, setOnlyShowNoCode] = useState(false);

    // Selection & Datastore Execution state
    const [selectedAgentNames, setSelectedAgentNames] = useState<Set<string>>(new Set());
    const [isExecuting, setIsExecuting] = useState(false);
    const [progressStatus, setProgressStatus] = useState<{
        completed: number;
        total: number;
        currentName: string;
    } | null>(null);
    const [executionReport, setExecutionReport] = useState<BulkUpdateDatasourcesResult | null>(null);

    // All non-Google-managed custom agents (ADK, A2A, Skill, Low-Code, Workflow)
    const selectableAgents = useMemo(
        () => agents.filter((a) => a.agentOrigin !== 'GOOGLE'),
        [agents]
    );

    // Filter to custom no-code / workflow agents (for Section 3 Datastore & Connector operations)
    const noCodeAgents = useMemo(() => {
        return selectableAgents.filter((a) => {
            const hydrated = hydratedAgents[a.name] || a;
            return (
                api.isCustomNoCodeAgent(hydrated) ||
                Boolean(hydrated.lowCodeAgentDefinition) ||
                Boolean(hydrated.workflowAgentDefinition)
            );
        });
    }, [selectableAgents, hydratedAgents]);

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
                        // Safe to fallback to list item if single-agent hydration fails
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
                    selectableAgents.some((a) => a.name === name)
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
    }, [activeMutation, selectableAgents, noCodeAgents, previewByAgentName, initialSelectedAgentNames]);

    const displayedAgents = useMemo(() => {
        let baseList =
            onlyShowNoCode || activeSectionFilter === 'datasources'
                ? noCodeAgents
                : selectableAgents;
        if (onlyShowAffected && activeMutation) {
            baseList = baseList.filter(
                (a) => previewByAgentName[a.name]?.changed || previewByAgentName[a.name]?.error
            );
        }
        return baseList;
    }, [
        selectableAgents,
        noCodeAgents,
        onlyShowNoCode,
        activeSectionFilter,
        onlyShowAffected,
        activeMutation,
        previewByAgentName,
    ]);

    const parsedPrincipals = useMemo(
        () =>
            sharedPrincipalsInput
                .split(/[\n,;]+/)
                .map((s) => s.trim())
                .filter(Boolean),
        [sharedPrincipalsInput]
    );

    const activeOwnerRemapCount = useMemo(() => {
        let count = 0;
        for (const a of selectableAgents) {
            if (!selectedAgentNames.has(a.name)) continue;
            const mapped =
                (ownerRemapByAgent[a.name] || '').trim() ||
                defaultTargetOwner.trim();
            if (mapped) count++;
        }
        return count;
    }, [selectableAgents, selectedAgentNames, ownerRemapByAgent, defaultTargetOwner]);

    const hasActiveIamAction =
        publishDrafts ||
        lifecycleAction !== 'NONE' ||
        sharingScope !== 'UNCHANGED' ||
        parsedPrincipals.length > 0 ||
        activeOwnerRemapCount > 0;

    const hasActiveSettingsAction =
        (descriptionMode !== 'UNCHANGED' && descriptionText.trim().length > 0) ||
        lowCodeModel !== 'UNCHANGED' ||
        observabilityEnabled !== 'UNCHANGED' ||
        sensitiveLoggingEnabled !== 'UNCHANGED';

    const hasActiveIamOrSettingsOperation = hasActiveIamAction || hasActiveSettingsAction;

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

    const handleAgentOwnerInputChange = (agentName: string, value: string) => {
        setOwnerRemapByAgent((prev) => {
            const next = { ...prev };
            if (!value.trim()) {
                delete next[agentName];
            } else {
                next[agentName] = value;
            }
            return next;
        });
        if (value.trim()) {
            setSelectedAgentNames((prev) => {
                if (prev.has(agentName)) return prev;
                const next = new Set(prev);
                next.add(agentName);
                return next;
            });
        }
    };

    const handleCsvFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIamSettingsError(null);
        try {
            const text =
                typeof file.text === 'function'
                    ? await file.text()
                    : await new Promise<string>((resolve, reject) => {
                          const reader = new FileReader();
                          reader.onload = () => resolve(String(reader.result || ''));
                          reader.onerror = () => reject(new Error('Failed to read CSV file.'));
                          reader.readAsText(file);
                      });
            const candidates = selectableAgents.map((a) => hydratedAgents[a.name] || a);
            const parsed = api.parseAgentOwnerRemapCsv(text, candidates);
            setCsvParseSummary(parsed);
            setCsvFileName(file.name);

            if (Object.keys(parsed.matchedMap).length > 0) {
                setOwnerRemapByAgent((prev) => ({
                    ...prev,
                    ...parsed.matchedMap,
                }));
                setSelectedAgentNames(new Set(parsed.matchedAgentNames));
                toast.success(
                    `CSV loaded: matched ${parsed.matchedAgentNames.length} agent(s) for owner remapping.`
                );
            } else if (parsed.validationErrors.length > 0) {
                const msg = parsed.validationErrors.join(' ');
                setIamSettingsError(msg);
                toast.error(msg);
            } else {
                toast.warning('No matching agents found in uploaded CSV.');
            }
        } catch (err: unknown) {
            const msg = toErrorMessage(err, 'Failed to read uploaded CSV file.');
            setIamSettingsError(msg);
            toast.error(msg);
        } finally {
            if (csvFileInputRef.current) {
                csvFileInputRef.current.value = '';
            }
        }
    };

    const handleDownloadOwnerTemplateCsv = () => {
        const candidates = selectableAgents.map((a) => hydratedAgents[a.name] || a);
        const csvContent = api.generateAgentOwnerRemapTemplateCsv(candidates);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ge-agents-owner-remap-${config.appId || 'engine'}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleClearOwnerRemaps = () => {
        setOwnerRemapByAgent({});
        setDefaultTargetOwner('');
        setCsvParseSummary(null);
        setCsvFileName('');
    };

    // Execute Section 1 (IAM/Sharing/Publish) & Section 2 (Settings/Metadata) Bulk Updates
    const handleExecuteIamAndSettingsUpdate = async () => {
        setIamSettingsError(null);
        setIamSettingsReport(null);

        const targets = selectableAgents
            .filter((a) => selectedAgentNames.has(a.name))
            .map((a) => hydratedAgents[a.name] || a);

        if (targets.length === 0) {
            setIamSettingsError('Please select at least one target agent from the table below.');
            toast.error('Please select at least one target agent.');
            return;
        }

        if (!hasActiveIamOrSettingsOperation) {
            setIamSettingsError(
                'Please configure at least one IAM/Sharing/Publish, Owner Remapping, or Agent Settings operation.'
            );
            toast.error('Please select at least one IAM, Owner Remap, or Settings operation to apply.');
            return;
        }

        if (descriptionMode !== 'UNCHANGED' && !descriptionText.trim()) {
            setIamSettingsError('Please enter text for the description update.');
            toast.error('Please enter text for the description update.');
            return;
        }

        try {
            for (const p of parsedPrincipals) {
                api.formatSharedIamPrincipal(p);
            }
            if (defaultTargetOwner.trim()) {
                api.formatTransferTargetPrincipal(defaultTargetOwner.trim());
            }
            for (const t of targets) {
                const indOwner = (ownerRemapByAgent[t.name] || '').trim();
                if (indOwner) {
                    api.formatTransferTargetPrincipal(indOwner);
                }
            }
        } catch (err: unknown) {
            const msg = toErrorMessage(err) || 'Invalid IAM or owner principal format.';
            setIamSettingsError(msg);
            toast.error(msg);
            return;
        }

        setIsExecutingIamSettings(true);
        setIamSettingsProgress({
            completed: 0,
            total: targets.length,
            currentName: targets[0].displayName,
        });

        try {
            const results = await api.bulkEditSharePublishAgents(
                targets,
                {
                    publishDrafts,
                    lifecycleAction,
                    sharingScope,
                    sharedPrincipals: parsedPrincipals,
                    sharedPrincipalMode,
                    ownerRemapByAgent,
                    defaultTargetOwner: defaultTargetOwner.trim() || undefined,
                    previousOwnerDisposition,
                    descriptionMode,
                    descriptionText: descriptionText.trim(),
                    lowCodeModel,
                    observabilityEnabled,
                    sensitiveLoggingEnabled,
                    claimOwnershipOn403: autoClaimOwnershipOn403,
                    autoClaimOwnershipOn403,
                    deleteOriginalPrivateClone,
                    onProgress: (completed, total, latest) => {
                        setIamSettingsProgress({
                            completed,
                            total,
                            currentName: latest.displayName,
                        });
                    },
                },
                config
            );

            setIamSettingsReport(results);
            const succeeded = results.updated;
            const failed = results.failed;

            if (failed === 0) {
                toast.success(`Successfully updated ${succeeded} agent(s)!`);
            } else {
                toast.warning(
                    `Bulk IAM & Settings update finished: ${succeeded} updated, ${failed} encountered errors.`
                );
            }

            await loadAllData();
            onRefreshAgents();
        } catch (err: unknown) {
            const msg = toErrorMessage(err) || 'Bulk IAM & Settings operation failed.';
            setIamSettingsError(msg);
            toast.error(msg);
        } finally {
            setIsExecutingIamSettings(false);
            setIamSettingsProgress(null);
        }
    };

    // Execute Section 3 (Datastore & VPC-SC Connector) Bulk Updates
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

    const showIamSection = activeSectionFilter === 'all' || activeSectionFilter === 'iam';
    const showSettingsSection =
        activeSectionFilter === 'all' || activeSectionFilter === 'settings';
    const showDatasourcesSection =
        activeSectionFilter === 'all' || activeSectionFilter === 'datasources';

    const selectedNoCodeCount = useMemo(
        () => noCodeAgents.filter((a) => selectedAgentNames.has(a.name)).length,
        [noCodeAgents, selectedAgentNames]
    );

    return (
        <div className="bg-gray-800 shadow-xl rounded-lg border border-amber-500/30 overflow-hidden">
            {/* Header Banner */}
            <div className="p-5 bg-gradient-to-r from-amber-900/30 via-gray-800 to-cyan-900/30 border-b border-gray-700 flex flex-wrap justify-between items-start gap-4">
                <div>
                    <div className="flex items-center gap-2.5">
                        <span className="px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            Bulk Operations Workspace
                        </span>
                        <h2 className="text-xl font-bold text-white">
                            Bulk Agent Updater: IAM, Settings &amp; Datasources
                        </h2>
                    </div>
                    <p className="text-sm text-gray-300 mt-1.5 max-w-4xl">
                        Apply bulk updates across three dedicated sections:{' '}
                        <span className="text-cyan-300 font-semibold">
                            1. IAM, Sharing &amp; Publish
                        </span>
                        ,{' '}
                        <span className="text-purple-300 font-semibold">
                            2. Agent Settings &amp; Metadata
                        </span>
                        , and{' '}
                        <span className="text-emerald-300 font-semibold">
                            3. Datastore &amp; VPC-SC Connector Updates
                        </span>
                        .
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={loadAllData}
                        disabled={
                            isHydratingAgents ||
                            isLoadingCatalog ||
                            isExecuting ||
                            isExecutingIamSettings
                        }
                        className="px-3.5 py-2 bg-gray-700 text-gray-200 text-xs font-semibold rounded-md hover:bg-gray-600 border border-gray-600 disabled:opacity-50"
                    >
                        {isHydratingAgents || isLoadingCatalog
                            ? 'Scanning...'
                            : 'Rescan Agents & Catalog'}
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

            {/* Section Filter Bar */}
            <div className="px-6 py-3 bg-gray-900/80 border-b border-gray-700 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Bulk update sections">
                    <button
                        type="button"
                        data-testid="bulk-section-tab-all"
                        onClick={() => setActiveSectionFilter('all')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                            activeSectionFilter === 'all'
                                ? 'bg-gray-200 text-gray-900 shadow'
                                : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
                        }`}
                    >
                        All 3 Sections
                    </button>
                    <button
                        type="button"
                        data-testid="bulk-section-tab-iam"
                        onClick={() => setActiveSectionFilter('iam')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                            activeSectionFilter === 'iam'
                                ? 'bg-cyan-600 text-white shadow'
                                : 'bg-gray-800 text-cyan-300 hover:bg-gray-700 border border-cyan-500/30'
                        }`}
                    >
                        1. IAM, Sharing &amp; Publish
                    </button>
                    <button
                        type="button"
                        data-testid="bulk-section-tab-settings"
                        onClick={() => setActiveSectionFilter('settings')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                            activeSectionFilter === 'settings'
                                ? 'bg-purple-600 text-white shadow'
                                : 'bg-gray-800 text-purple-300 hover:bg-gray-700 border border-purple-500/30'
                        }`}
                    >
                        2. Agent Settings &amp; Metadata
                    </button>
                    <button
                        type="button"
                        data-testid="bulk-section-tab-datasources"
                        onClick={() => setActiveSectionFilter('datasources')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                            activeSectionFilter === 'datasources'
                                ? 'bg-emerald-600 text-white shadow'
                                : 'bg-gray-800 text-emerald-300 hover:bg-gray-700 border border-emerald-500/30'
                        }`}
                    >
                        3. Datastore &amp; VPC-SC Connectors
                    </button>
                </div>
                <div className="text-xs text-gray-400">
                    Selected:{' '}
                    <span className="font-bold text-white">{selectedAgentNames.size}</span> of{' '}
                    {selectableAgents.length} custom agents ({selectedNoCodeCount} No-Code/Workflow)
                </div>
            </div>

            <div className="p-6 space-y-6">
                {(hydrationError || catalogError || iamSettingsError) && (
                    <div className="p-3 bg-red-900/30 border border-red-700 rounded-md text-xs text-red-300 space-y-1">
                        {iamSettingsError && <p>{iamSettingsError}</p>}
                        {hydrationError && <p>{hydrationError}</p>}
                        {catalogError && <p>{catalogError}</p>}
                    </div>
                )}

                {/* ============================================================================
                    SECTION 1: IAM, SHARING & PUBLISH BULK UPDATES
                   ============================================================================ */}
                {showIamSection && (
                    <div
                        data-testid="bulk-panel-section-iam"
                        className="bg-gray-900/60 border border-cyan-500/30 rounded-lg p-5 space-y-4"
                    >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 pb-3">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                                        Section 1
                                    </span>
                                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                                        1. IAM, Sharing &amp; Publish Bulk Updates
                                    </h3>
                                </div>
                                <p className="text-xs text-gray-400 mt-1">
                                    Deploy/publish agent drafts, change lifecycle state, configure organization sharing scope, and grant{' '}
                                    <code className="text-cyan-300">roles/discoveryengine.agentUser</code> IAM bindings across all selected agents.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Publish / Deploy + Lifecycle */}
                            <div className="p-3.5 bg-gray-800/70 rounded-lg border border-gray-700 space-y-3">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                                    Publish / Deploy &amp; Lifecycle Status
                                </h4>
                                <label className="flex items-start gap-2.5 text-sm text-gray-200 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        data-testid="bulk-iam-publish-drafts-checkbox"
                                        checked={publishDrafts}
                                        onChange={(e) => setPublishDrafts(e.target.checked)}
                                        className="mt-1 rounded bg-gray-700 border-gray-600 text-cyan-500 focus:ring-cyan-500"
                                    />
                                    <div>
                                        <span className="font-medium text-white">
                                            Publish / Deploy Drafts to Live Users
                                        </span>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            Calls <code className="text-cyan-300">:deployLowCode</code> for No-Code agents and{' '}
                                            <code className="text-cyan-300">:publish</code> for Workflow, ADK, A2A, and Skill agents.
                                        </p>
                                    </div>
                                </label>

                                <div>
                                    <label
                                        htmlFor="bulk-iam-lifecycle-action"
                                        className="block text-xs font-medium text-gray-300 mb-1"
                                    >
                                        Lifecycle Status Action
                                    </label>
                                    <select
                                        id="bulk-iam-lifecycle-action"
                                        value={lifecycleAction}
                                        onChange={(e) =>
                                            setLifecycleAction(
                                                e.target.value as NonNullable<
                                                    BulkEditSharePublishOptions['lifecycleAction']
                                                >
                                            )
                                        }
                                        className="bg-gray-800 border border-gray-600 rounded-md px-3 py-1.5 text-xs text-gray-200 w-full"
                                    >
                                        <option value="NONE">Leave Status Unchanged</option>
                                        <option value="ENABLE">
                                            Enable Agents (:enableAgent)
                                        </option>
                                        <option value="DISABLE">
                                            Suspend / Disable Agents (:disableAgent)
                                        </option>
                                    </select>
                                </div>
                            </div>

                            {/* Sharing Scope & IAM Principals */}
                            <div className="p-3.5 bg-gray-800/70 rounded-lg border border-gray-700 space-y-3">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                                    Sharing Scope &amp; IAM Principals
                                </h4>
                                <div>
                                    <label
                                        htmlFor="bulk-iam-sharing-scope"
                                        className="block text-xs font-medium text-gray-300 mb-1"
                                    >
                                        Target Sharing Scope
                                    </label>
                                    <select
                                        id="bulk-iam-sharing-scope"
                                        value={sharingScope}
                                        onChange={(e) =>
                                            setSharingScope(
                                                e.target.value as NonNullable<
                                                    BulkEditSharePublishOptions['sharingScope']
                                                >
                                            )
                                        }
                                        className="bg-gray-800 border border-gray-600 rounded-md px-3 py-1.5 text-xs text-gray-200 w-full"
                                    >
                                        <option value="UNCHANGED">Leave Sharing Scope Unchanged</option>
                                        <option value="ALL_USERS">
                                            Share with All Users in App (Organization-Wide)
                                        </option>
                                        <option value="RESTRICTED">
                                            Share with Specific Users / Groups Only
                                        </option>
                                        <option value="PRIVATE">
                                            Withdraw to Private (:withdrawAgent &amp; clear IAM)
                                        </option>
                                    </select>
                                </div>

                                {sharingScope !== 'PRIVATE' && (
                                    <div className="space-y-2 pt-1 border-t border-gray-700/60">
                                        <div className="flex items-center justify-between">
                                            <label
                                                htmlFor="bulk-iam-principals-input"
                                                className="text-xs font-medium text-gray-300"
                                            >
                                                Grant <code className="text-cyan-300">agentUser</code> IAM Principals
                                            </label>
                                            <select
                                                aria-label="Principal merge mode"
                                                value={sharedPrincipalMode}
                                                onChange={(e) =>
                                                    setSharedPrincipalMode(
                                                        e.target.value as NonNullable<
                                                            BulkEditSharePublishOptions['sharedPrincipalMode']
                                                        >
                                                    )
                                                }
                                                className="bg-gray-900 border border-gray-600 rounded px-2 py-0.5 text-[11px] text-gray-200"
                                            >
                                                <option value="APPEND">Append to existing</option>
                                                <option value="REPLACE">Replace existing</option>
                                            </select>
                                        </div>
                                        <textarea
                                            id="bulk-iam-principals-input"
                                            rows={2}
                                            value={sharedPrincipalsInput}
                                            onChange={(e) => setSharedPrincipalsInput(e.target.value)}
                                            placeholder="user:alice@example.com, group:eng@example.com, domain:example.com"
                                            className="bg-gray-900 border border-gray-600 rounded-md px-3 py-1.5 text-xs text-white font-mono w-full"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Owner Remapping Card (Individual Table + CSV Upload + Uniform Owner) */}
                        <div
                            data-testid="bulk-panel-owner-remapping-card"
                            className="p-4 bg-gray-800/80 rounded-md border border-cyan-500/30 space-y-3"
                        >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <h5 className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                                        Agent Owner Remapping (:transferAgentOwner)
                                    </h5>
                                    <p className="text-[11px] text-gray-400">
                                        Remap agent owners individually in the Target Agents table below, set a uniform fallback owner, or upload a CSV (<code className="text-cyan-300">agent_id,new_owner</code>) to auto-fill matching agents.
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <label
                                        data-testid="bulk-panel-upload-owner-csv-label"
                                        className="px-2.5 py-1.5 text-xs font-semibold rounded bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-200 border border-cyan-500/40 cursor-pointer transition-colors"
                                    >
                                        Upload Owner CSV
                                        <input
                                            data-testid="bulk-panel-owner-csv-input"
                                            type="file"
                                            accept=".csv,text/csv"
                                            onChange={handleCsvFileUpload}
                                            className="hidden"
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        data-testid="bulk-panel-download-owner-csv-template-btn"
                                        onClick={handleDownloadOwnerTemplateCsv}
                                        className="px-2.5 py-1.5 text-xs font-medium rounded bg-gray-700 hover:bg-gray-600 text-gray-200 border border-gray-600"
                                    >
                                        Download CSV Template
                                    </button>
                                    {(Object.keys(ownerRemapByAgent).length > 0 || defaultTargetOwner.trim()) && (
                                        <button
                                            type="button"
                                            onClick={handleClearOwnerRemaps}
                                            className="px-2 py-1.5 text-xs font-medium rounded bg-red-900/30 hover:bg-red-900/50 text-red-300 border border-red-500/40"
                                        >
                                            Clear Owner Remaps ({Object.values(ownerRemapByAgent).filter((v) => v?.trim()).length})
                                        </button>
                                    )}
                                </div>
                            </div>

                            {csvParseSummary && (
                                <div
                                    data-testid="bulk-panel-owner-csv-summary"
                                    className="p-2.5 rounded bg-gray-900/80 border border-cyan-500/30 text-xs space-y-1"
                                >
                                    <div className="flex items-center justify-between text-cyan-200 font-medium">
                                        <span>
                                            CSV Loaded ({csvFileName}):{' '}
                                            <strong className="text-emerald-300">
                                                {csvParseSummary.matchedAgentNames.length} matched
                                            </strong>
                                            {csvParseSummary.unmatchedRows.length > 0 && (
                                                <span className="text-amber-300 ml-2">
                                                    • {csvParseSummary.unmatchedRows.length} unmatched ({csvParseSummary.unmatchedRows.slice(0, 3).join(', ')})
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                    {csvParseSummary.validationErrors.length > 0 && (
                                        <ul className="list-disc list-inside text-[11px] text-red-300">
                                            {csvParseSummary.validationErrors.map((err, i) => (
                                                <li key={i}>{err}</li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                                <div>
                                    <label
                                        htmlFor="bulk-panel-default-target-owner"
                                        className="block text-xs text-gray-300 mb-1"
                                    >
                                        Uniform Target Owner (Optional fallback for selected agents without a per-agent row owner)
                                    </label>
                                    <input
                                        id="bulk-panel-default-target-owner"
                                        type="text"
                                        value={defaultTargetOwner}
                                        onChange={(e) => setDefaultTargetOwner(e.target.value)}
                                        placeholder="new-owner@example.com or serviceAccount:sa@proj.iam.gserviceaccount.com"
                                        className="w-full bg-gray-900 border border-gray-600 rounded-md px-2.5 py-1.5 text-xs text-white font-mono"
                                    />
                                </div>
                                <div>
                                    <label
                                        htmlFor="bulk-panel-prev-owner-disposition"
                                        className="block text-xs text-gray-300 mb-1"
                                    >
                                        Previous Owner Disposition
                                    </label>
                                    <select
                                        id="bulk-panel-prev-owner-disposition"
                                        value={previousOwnerDisposition}
                                        onChange={(e) =>
                                            setPreviousOwnerDisposition(
                                                e.target.value as PreviousOwnerDisposition
                                            )
                                        }
                                        className="w-full bg-gray-900 border border-gray-600 rounded-md px-2.5 py-1.5 text-xs text-white"
                                    >
                                        <option value="KEEP_AS_AGENT_USER">
                                            Keep Previous Owner as Agent User (DEFAULT)
                                        </option>
                                        <option value="REMOVE">
                                            Revoke Previous Owner Access Completely (REMOVE)
                                        </option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Admin 403 Ownership Recovery */}
                        <div className="p-3 bg-amber-950/20 rounded-md border border-amber-500/30 flex flex-wrap items-center justify-between gap-4 text-xs text-gray-200">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={autoClaimOwnershipOn403}
                                    onChange={(e) => setAutoClaimOwnershipOn403(e.target.checked)}
                                    className="rounded bg-gray-700 border-gray-600 text-amber-500 focus:ring-amber-500"
                                />
                                <span>
                                    <strong className="text-amber-200">Admin 403 Ownership Recovery:</strong>{' '}
                                    Auto-claim ownership (<code className="text-amber-300">:transferAgentOwner</code>) or Admin Clone-Publish-Share if a private user-owned agent returns 403
                                </span>
                            </label>
                            {autoClaimOwnershipOn403 && (
                                <label className="flex items-center gap-2 cursor-pointer text-gray-300">
                                    <input
                                        type="checkbox"
                                        checked={deleteOriginalPrivateClone}
                                        onChange={(e) =>
                                            setDeleteOriginalPrivateClone(e.target.checked)
                                        }
                                        className="rounded bg-gray-700 border-gray-600 text-amber-500 focus:ring-amber-500"
                                    />
                                    <span>Delete original locked private draft after cloning</span>
                                </label>
                            )}
                        </div>
                    </div>
                )}

                {/* ============================================================================
                    SECTION 2: AGENT SETTINGS & METADATA BULK UPDATES
                   ============================================================================ */}
                {showSettingsSection && (
                    <div
                        data-testid="bulk-panel-section-settings"
                        className="bg-gray-900/60 border border-purple-500/30 rounded-lg p-5 space-y-4"
                    >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 pb-3">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
                                        Section 2
                                    </span>
                                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                                        2. Agent Settings &amp; Metadata Bulk Updates
                                    </h3>
                                </div>
                                <p className="text-xs text-gray-400 mt-1">
                                    Bulk update agent descriptions, override No-Code/Workflow LLM models, and configure Observability &amp; Sensitive Prompt/Response logging.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Description & LLM Model Override */}
                            <div className="p-3.5 bg-gray-800/70 rounded-lg border border-gray-700 space-y-3">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-purple-300">
                                    Description &amp; LLM Model Override
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    <div>
                                        <label
                                            htmlFor="bulk-settings-description-mode"
                                            className="block text-xs font-medium text-gray-300 mb-1"
                                        >
                                            Description Mode
                                        </label>
                                        <select
                                            id="bulk-settings-description-mode"
                                            value={descriptionMode}
                                            onChange={(e) =>
                                                setDescriptionMode(
                                                    e.target.value as NonNullable<
                                                        BulkEditSharePublishOptions['descriptionMode']
                                                    >
                                                )
                                            }
                                            className="bg-gray-800 border border-gray-600 rounded-md px-2.5 py-1.5 text-xs text-gray-200 w-full"
                                        >
                                            <option value="UNCHANGED">Unchanged</option>
                                            <option value="PREFIX">Prepend Prefix</option>
                                            <option value="SUFFIX">Append Suffix</option>
                                            <option value="REPLACE">Replace Entirely</option>
                                        </select>
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label
                                            htmlFor="bulk-settings-description-text"
                                            className="block text-xs font-medium text-gray-300 mb-1"
                                        >
                                            Description Text
                                        </label>
                                        <input
                                            id="bulk-settings-description-text"
                                            type="text"
                                            disabled={descriptionMode === 'UNCHANGED'}
                                            value={descriptionText}
                                            onChange={(e) => setDescriptionText(e.target.value)}
                                            placeholder={
                                                descriptionMode === 'UNCHANGED'
                                                    ? 'Select a description mode first'
                                                    : 'e.g., [Prod Verified]'
                                            }
                                            className="bg-gray-800 border border-gray-600 rounded-md px-3 py-1.5 text-xs text-white w-full disabled:opacity-50"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label
                                        htmlFor="bulk-settings-lowcode-model"
                                        className="block text-xs font-medium text-gray-300 mb-1"
                                    >
                                        No-Code / Workflow LLM Model Override
                                    </label>
                                    <select
                                        id="bulk-settings-lowcode-model"
                                        value={lowCodeModel}
                                        onChange={(e) => setLowCodeModel(e.target.value)}
                                        className="bg-gray-800 border border-gray-600 rounded-md px-3 py-1.5 text-xs text-gray-200 w-full font-mono"
                                    >
                                        <option value="UNCHANGED">Leave LLM Model Unchanged</option>
                                        {STANDARD_ENTERPRISE_MODELS.map((m) => (
                                            <option key={m.id} value={m.id}>
                                                {m.displayName} ({m.id})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Observability & Sensitive Logging */}
                            <div className="p-3.5 bg-gray-800/70 rounded-lg border border-gray-700 space-y-3">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-purple-300">
                                    Observability &amp; Telemetry Settings
                                </h4>
                                <div>
                                    <label
                                        htmlFor="bulk-settings-observability"
                                        className="block text-xs font-medium text-gray-300 mb-1"
                                    >
                                        Observability Telemetry (<code className="text-purple-300">observabilityConfig</code>)
                                    </label>
                                    <select
                                        id="bulk-settings-observability"
                                        value={observabilityEnabled}
                                        onChange={(e) =>
                                            setObservabilityEnabled(
                                                e.target.value as NonNullable<
                                                    BulkEditSharePublishOptions['observabilityEnabled']
                                                >
                                            )
                                        }
                                        className="bg-gray-800 border border-gray-600 rounded-md px-3 py-1.5 text-xs text-gray-200 w-full"
                                    >
                                        <option value="UNCHANGED">Unchanged</option>
                                        <option value="ENABLE">Enable Observability</option>
                                        <option value="DISABLE">Disable Observability</option>
                                    </select>
                                </div>

                                <div>
                                    <label
                                        htmlFor="bulk-settings-sensitive-logging"
                                        className="block text-xs font-medium text-gray-300 mb-1"
                                    >
                                        Sensitive Prompt / Response Logging
                                    </label>
                                    <select
                                        id="bulk-settings-sensitive-logging"
                                        value={sensitiveLoggingEnabled}
                                        onChange={(e) =>
                                            setSensitiveLoggingEnabled(
                                                e.target.value as NonNullable<
                                                    BulkEditSharePublishOptions['sensitiveLoggingEnabled']
                                                >
                                            )
                                        }
                                        className="bg-gray-800 border border-gray-600 rounded-md px-3 py-1.5 text-xs text-gray-200 w-full"
                                    >
                                        <option value="UNCHANGED">Unchanged</option>
                                        <option value="ENABLE">Enable Sensitive Logging</option>
                                        <option value="DISABLE">Disable Sensitive Logging</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Action Bar & Execution Report for Section 1 (IAM) & Section 2 (Settings) */}
                {(showIamSection || showSettingsSection) && (
                    <div className="bg-gray-900/80 border border-gray-700 rounded-lg p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="text-xs text-gray-300">
                                <span className="font-semibold text-white">
                                    Ready to apply Section 1 (IAM &amp; Sharing) &amp; Section 2 (Agent Settings):
                                </span>{' '}
                                Targets{' '}
                                <span className="text-cyan-300 font-bold">
                                    {selectedAgentNames.size}
                                </span>{' '}
                                selected agent(s) across ADK, A2A, Skill, Low-Code, and Workflow agents.
                            </div>
                            <button
                                type="button"
                                data-testid="execute-bulk-iam-settings-btn"
                                onClick={handleExecuteIamAndSettingsUpdate}
                                disabled={
                                    isExecutingIamSettings ||
                                    !hasActiveIamOrSettingsOperation ||
                                    selectedAgentNames.size === 0
                                }
                                className="px-4 py-2 bg-cyan-600 text-white text-xs font-bold rounded-md hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed shadow"
                            >
                                {isExecutingIamSettings
                                    ? `Applying IAM & Settings (${iamSettingsProgress?.completed || 0}/${iamSettingsProgress?.total || selectedAgentNames.size})...`
                                    : `Execute IAM & Settings Update on ${selectedAgentNames.size} Agent(s)`}
                            </button>
                        </div>

                        {iamSettingsReport && (
                            <div
                                data-testid="iam-settings-execution-report"
                                className="p-3.5 bg-gray-950/80 border border-gray-700 rounded-lg space-y-2"
                            >
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                                        IAM &amp; Settings Execution Report ({iamSettingsReport.updated}{' '}
                                        updated, {iamSettingsReport.skipped} skipped,{' '}
                                        {iamSettingsReport.failed} failed)
                                    </h4>
                                    <button
                                        type="button"
                                        onClick={() => setIamSettingsReport(null)}
                                        className="text-xs text-gray-400 hover:text-white"
                                    >
                                        Dismiss
                                    </button>
                                </div>
                                <ul className="divide-y divide-gray-800 max-h-48 overflow-y-auto text-xs">
                                    {iamSettingsReport.outcomes.map((res) => (
                                        <li
                                            key={res.agentName}
                                            className="py-1.5 flex items-center justify-between gap-2"
                                        >
                                            <div>
                                                <span className="font-semibold text-white">
                                                    {res.displayName}
                                                </span>
                                                <span className="ml-2 text-gray-400">
                                                    — {res.actionsApplied.join(', ') || 'No changes'}
                                                </span>
                                                {res.warning && (
                                                    <p className="text-amber-300 mt-0.5">{res.warning}</p>
                                                )}
                                                {res.error && (
                                                    <p className="text-red-400 mt-0.5">{res.error}</p>
                                                )}
                                            </div>
                                            <span
                                                className={`px-2 py-0.5 rounded font-semibold ${
                                                    res.status === 'updated'
                                                        ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700'
                                                        : res.status === 'skipped'
                                                          ? 'bg-gray-800 text-gray-300 border border-gray-700'
                                                          : 'bg-red-900/50 text-red-300 border border-red-700'
                                                }`}
                                            >
                                                {res.status === 'updated'
                                                    ? 'Updated'
                                                    : res.status === 'skipped'
                                                      ? 'Skipped'
                                                      : 'Failed'}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                {/* ============================================================================
                    SECTION 3: DATASTORE & VPC-SC CONNECTOR BULK UPDATES
                   ============================================================================ */}
                {showDatasourcesSection && (
                    <div
                        data-testid="bulk-panel-section-datasources"
                        className="bg-gray-900/60 border border-emerald-500/30 rounded-lg p-5 space-y-4"
                    >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 pb-3">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                        Section 3
                                    </span>
                                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                                        3. Datastore &amp; VPC-SC Connector Bulk Updates
                                    </h3>
                                </div>
                                <p className="text-xs text-gray-400 mt-1">
                                    Swap, migrate, add, or remove Data Connectors and Data Stores across custom No-Code and Workflow agents with live dry-run diff preview.
                                </p>
                            </div>
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
                                                ? 'bg-emerald-600 text-white shadow'
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
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
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
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
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

                        {/* Datastore Execution Options & Action Button */}
                        <div className="pt-3 border-t border-gray-800 flex flex-wrap items-center justify-between gap-4 text-xs text-gray-300">
                            <div className="flex flex-wrap items-center gap-6">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={autoDeployOrPublish}
                                        onChange={(e) => setAutoDeployOrPublish(e.target.checked)}
                                        className="rounded bg-gray-700 border-gray-600 text-emerald-500 focus:ring-emerald-500"
                                    />
                                    <span>
                                        Auto-publish / deploy after update (
                                        <code className="text-emerald-300">:deployLowCode</code> /{' '}
                                        <code className="text-emerald-300">:publish</code>)
                                    </span>
                                </label>

                                {mode === 'replace_connector' && (
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={autoRemapEntityDataStores}
                                            onChange={(e) =>
                                                setAutoRemapEntityDataStores(e.target.checked)
                                            }
                                            className="rounded bg-gray-700 border-gray-600 text-emerald-500 focus:ring-emerald-500"
                                        />
                                        <span>Also remap matching Connector Entity Data Stores</span>
                                    </label>
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                {activeMutation && (
                                    <button
                                        type="button"
                                        onClick={handleSelectOnlyAffected}
                                        className="px-2.5 py-1.5 text-xs font-semibold bg-gray-700 text-emerald-300 rounded hover:bg-gray-600 border border-gray-600"
                                    >
                                        Select Affected Only
                                    </button>
                                )}
                                <button
                                    type="button"
                                    data-testid="execute-bulk-datasources-btn"
                                    onClick={handleExecuteBulkUpdate}
                                    disabled={
                                        isExecuting || !activeMutation || selectedNoCodeCount === 0
                                    }
                                    className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-md hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed shadow"
                                >
                                    {isExecuting
                                        ? `Updating (${progressStatus?.completed || 0}/${progressStatus?.total || selectedNoCodeCount})...`
                                        : `Execute Bulk Datastore Update on ${selectedNoCodeCount} Agent(s)`}
                                </button>
                            </div>
                        </div>

                        {/* Datastore Execution Results Summary */}
                        {executionReport && (
                            <div className="p-4 bg-gray-950/90 border border-gray-700 rounded-lg space-y-2">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-semibold text-white">
                                        Bulk Datastore Execution Report ({executionReport.updatedAndPublished}{' '}
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
                    </div>
                )}

                {/* ============================================================================
                    TARGET AGENTS SELECTION & LIVE DRY-RUN DIFF TABLE
                   ============================================================================ */}
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                                Target Agents &amp; Live Blast-Radius Preview (
                                {selectedAgentNames.size} selected of {displayedAgents.length} shown)
                            </h3>
                            {(isHydratingAgents || isLoadingCatalog) && <Spinner />}
                        </div>
                        <div className="flex flex-wrap items-center gap-4">
                            <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={onlyShowNoCode || activeSectionFilter === 'datasources'}
                                    disabled={activeSectionFilter === 'datasources'}
                                    onChange={(e) => setOnlyShowNoCode(e.target.checked)}
                                    className="rounded bg-gray-700 border-gray-600 text-cyan-500"
                                />
                                <span>Show only No-Code / Workflow agents ({noCodeAgents.length})</span>
                            </label>
                            <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={onlyShowAffected}
                                    onChange={(e) => setOnlyShowAffected(e.target.checked)}
                                    className="rounded bg-gray-700 border-gray-600 text-cyan-500"
                                />
                                <span>Show only affected by Datastore change</span>
                            </label>
                        </div>
                    </div>

                    {/* Agents Table */}
                    {displayedAgents.length === 0 && !isHydratingAgents ? (
                        <div className="p-6 text-center text-gray-400 bg-gray-900/40 rounded-lg border border-gray-700">
                            No matching custom agents found in this Gemini Enterprise engine.
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
                                                aria-label="Select all displayed agents"
                                                className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-cyan-500"
                                            />
                                        </th>
                                        <th
                                            scope="col"
                                            className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase"
                                        >
                                            Agent
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
                                            Current Owner &rarr; New Owner
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
                                        const currentOwner =
                                            api.extractAgentOwnerHint(full) || 'Unassigned';
                                        const newOwnerVal = ownerRemapByAgent[agent.name] || '';

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
                                                <td className="px-4 py-3 align-top min-w-[230px] space-y-1.5">
                                                    <div className="text-[11px] text-gray-400">
                                                        Current:{' '}
                                                        <span className="font-mono text-gray-200">
                                                            {currentOwner}
                                                        </span>
                                                    </div>
                                                    <input
                                                        type="text"
                                                        data-testid={`panel-owner-remap-input-${agentId}`}
                                                        aria-label={`New owner for ${agent.displayName}`}
                                                        value={newOwnerVal}
                                                        onChange={(e) =>
                                                            handleAgentOwnerInputChange(
                                                                agent.name,
                                                                e.target.value
                                                            )
                                                        }
                                                        placeholder={
                                                            defaultTargetOwner.trim() ||
                                                            'new-owner@example.com'
                                                        }
                                                        className={`w-full bg-gray-900 border rounded px-2 py-1 text-xs font-mono text-white ${
                                                            newOwnerVal.trim()
                                                                ? 'border-cyan-500 ring-1 ring-cyan-500/40'
                                                                : 'border-gray-600'
                                                        }`}
                                                    />
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
