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

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { OPERATIONAL_VIEWS, FALLBACK_SNAPSHOT } from '../components/dashboard/operational/analyticsData';
import { runBigQueryQuery } from '../services/apiService';

interface BigQueryTableRow {
    f?: Array<{ v?: unknown }>;
    [key: string]: unknown;
}

export interface OperationalLiveData {
    dailyActivity?: Array<{ date: string; count: number }>;
    agentPopularity?: Array<{ name: string; value: number }>;
    genaiTokens?: Array<{
        agent: string;
        inputTokens: number;
        outputTokens: number;
        calls: number;
        inferenceCount?: number;
    }>;
    toolInvocations?: Array<{ tool: string; count: number }>;
    connectorUsage?: Array<{ connector: string; calls: number }>;
    topConnectorUsers?: Array<{ user: string; calls: number }>;
    aiChoices?: Array<{ name: string; value: number }>;
    feedback?: Array<{ agent: string; thumbsUp: number; thumbsDown: number; total: number }>;
}

interface UseOperationalDashboardStateParams {
    projectId: string;
    projectNumber: string;
    datasetId?: string;
    tables: Array<{
        tableReference?: { datasetId?: string; tableId?: string; [key: string]: unknown };
        [key: string]: unknown;
    }>;
    onRefreshTables?: () => Promise<void>;
}

export function useOperationalDashboardState({
    projectId,
    projectNumber: _projectNumber,
    datasetId,
    tables = [],
    onRefreshTables
}: UseOperationalDashboardStateParams) {
    const getViewFromLocation = (): string => {
        if (typeof window === 'undefined') return 'overview';
        const hash = window.location.hash || '';
        // 1. Check query parameter in hash: #/observability?view=v_admin_feedback_review
        const qIndex = hash.indexOf('?');
        if (qIndex !== -1) {
            const params = new URLSearchParams(hash.slice(qIndex + 1));
            const viewParam = params.get('view');
            if (viewParam && (OPERATIONAL_VIEWS[viewParam] || viewParam === 'overview')) {
                return viewParam;
            }
        }
        // 2. Check standard search params: ?view=...
        if (window.location.search) {
            const params = new URLSearchParams(window.location.search);
            const viewParam = params.get('view');
            if (viewParam && (OPERATIONAL_VIEWS[viewParam] || viewParam === 'overview')) {
                return viewParam;
            }
        }
        // 3. Support bare legacy hash: #v_admin_feedback_review or #/v_admin_feedback_review
        const bare = hash.replace(/^#\/?/, '').split('?')[0];
        if (OPERATIONAL_VIEWS[bare] || bare === 'overview') {
            return bare;
        }
        // 4. Check sessionStorage
        try {
            const saved = sessionStorage.getItem('agentspace-observability-view');
            if (saved && (OPERATIONAL_VIEWS[saved] || saved === 'overview')) {
                return saved;
            }
        } catch {
            // Ignore storage error
        }
        return 'overview';
    };

    const [activeViewId, setActiveViewId] = useState<string>(getViewFromLocation);

    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [operatingViewId, setOperatingViewId] = useState<string | null>(null);
    const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [selectedDrawerRow, setSelectedDrawerRow] = useState<Record<string, unknown> | null>(null);

    const [viewRows, setViewRows] = useState<Record<string, Array<Record<string, unknown>>>>({});
    const [rowsLoading, setRowsLoading] = useState<Record<string, boolean>>({});

    const [liveData, setLiveData] = useState<OperationalLiveData>({});

    const [extraInstalledViews, setExtraInstalledViews] = useState<Set<string>>(new Set());
    const [droppedViews, setDroppedViews] = useState<Set<string>>(new Set());
    const droppedViewsRef = useRef<Set<string>>(new Set());
    const [brokenViews, setBrokenViews] = useState<Map<string, string>>(new Map());
    const brokenViewsRef = useRef<Map<string, string>>(new Map());

    const handleViewChange = (viewId: string) => {
        setActiveViewId(viewId);
        try {
            sessionStorage.setItem('agentspace-observability-view', viewId);
        } catch {
            // Ignore storage error
        }
        if (typeof window !== 'undefined') {
            const hash = window.location.hash || '';
            if (hash.startsWith('#/observability') || hash.startsWith('#/v_') || hash.startsWith('#v_')) {
                const targetHash = viewId === 'overview'
                    ? '#/observability'
                    : `#/observability?view=${encodeURIComponent(viewId)}`;
                if (window.location.hash !== targetHash) {
                    window.history.replaceState(null, '', targetHash);
                }
            } else if (hash.startsWith('#/')) {
                const [baseRoute] = hash.split('?');
                const targetHash = viewId === 'overview'
                    ? baseRoute
                    : `${baseRoute}?view=${encodeURIComponent(viewId)}`;
                if (window.location.hash !== targetHash) {
                    window.history.replaceState(null, '', targetHash);
                }
            }
        }
    };

    useEffect(() => {
        const onLocationChange = () => {
            if (typeof window !== 'undefined') {
                const view = getViewFromLocation();
                setActiveViewId(view);
            }
        };
        window.addEventListener('hashchange', onLocationChange);
        window.addEventListener('popstate', onLocationChange);
        return () => {
            window.removeEventListener('hashchange', onLocationChange);
            window.removeEventListener('popstate', onLocationChange);
        };
    }, []);

    const isNotFoundError = (msg: string) => {
        return (
            msg.includes('Not found: Table') ||
            msg.includes('404') ||
            msg.includes('NOT_FOUND') ||
            msg.includes('does not exist') ||
            msg.includes('Not found: Dataset')
        );
    };

    useEffect(() => {
        setLiveData({});
        setViewRows({});
        setExtraInstalledViews(new Set());
        setDroppedViews(new Set());
        droppedViewsRef.current = new Set();
        setBrokenViews(new Map());
        brokenViewsRef.current = new Map();
    }, [datasetId]);

    const VIEW_ALIASES: Record<string, string[]> = useMemo(
        () => ({
            v_consolidated_user_activity: ['v_consolidated_user_activity', 'v_user_activity'],
            v_gemini_genai_telemetry: ['v_gemini_genai_telemetry', 'v_genai_telemetry'],
            v_user_connector_usage: ['v_user_connector_usage'],
            v_user_connector_usage_30d: ['v_user_connector_usage_30d', 'v_user_connector_usage'],
            v_consolidated_ai_choices: ['v_consolidated_ai_choices', 'v_ai_choices'],
            v_agent_feedback: ['v_agent_feedback', 'v_feedback'],
            v_admin_feedback_review: ['v_admin_feedback_review'],
            v_agent_feedback_detailed: ['v_agent_feedback_detailed', 'v_detailed_feedback'],
            v_consolidated_user_messages: ['v_consolidated_user_messages', 'v_user_messages'],
            v_gemini_assist_activity: ['v_gemini_assist_activity', 'v_assist_activity'],
            v_gemini_search_activity: ['v_gemini_search_activity', 'v_search_activity']
        }),
        []
    );

    const currentDatasetTables = useMemo(() => {
        if (!datasetId) return [];
        return tables.filter((t) => !t.tableReference?.datasetId || t.tableReference.datasetId === datasetId);
    }, [tables, datasetId]);

    const installedViewsMap = useMemo(() => {
        const map = new Map<string, string>();
        const tableIds = new Set(currentDatasetTables.map((t) => t.tableReference?.tableId || ''));
        for (const [canonicalId, aliases] of Object.entries(VIEW_ALIASES)) {
            if (droppedViews.has(canonicalId)) continue;
            for (const alias of aliases) {
                if (tableIds.has(alias)) {
                    map.set(canonicalId, alias);
                    break;
                }
            }
        }
        return map;
    }, [currentDatasetTables, VIEW_ALIASES, droppedViews]);

    const installedViews = useMemo(() => {
        const set = new Set<string>();
        for (const key of installedViewsMap.keys()) {
            if (!droppedViews.has(key)) {
                set.add(key);
            }
        }
        extraInstalledViews.forEach((v) => {
            if (!droppedViews.has(v)) {
                set.add(v);
            }
        });
        return set;
    }, [installedViewsMap, extraInstalledViews, droppedViews]);

    const tableNames = useMemo(
        () => new Set(currentDatasetTables.map((t) => t.tableReference?.tableId || '')),
        [currentDatasetTables]
    );

    const fetchViewRows = useCallback(
        async (viewId: string) => {
            if (!projectId || !datasetId || !OPERATIONAL_VIEWS[viewId]) return;
            if (currentDatasetTables.length > 0 && !installedViews.has(viewId)) {
                setViewRows((prev) => ({ ...prev, [viewId]: FALLBACK_SNAPSHOT.rows[viewId] || [] }));
                return;
            }
            setRowsLoading((prev) => ({ ...prev, [viewId]: true }));
            try {
                const actualView = installedViewsMap.get(viewId) || viewId;
                const query = OPERATIONAL_VIEWS[viewId].getRowsQuery(projectId, datasetId);
                const actualQuery = actualView !== viewId
                    ? query.replace(new RegExp(`\\.${viewId}\`?`, 'g'), `.${actualView}\``)
                    : query;
                const res = await runBigQueryQuery(projectId, actualQuery, true);
                const fields = res?.schema?.fields || [];
                const rows = (res?.rows || []).map((r: BigQueryTableRow) => {
                    const obj: Record<string, unknown> = {};
                    r.f?.forEach((cell: { v?: unknown }, idx: number) => {
                        const colName =
                            fields[idx]?.name || OPERATIONAL_VIEWS[viewId].columns[idx]?.key || `col_${idx}`;
                        obj[colName] = cell?.v;
                    });
                    return obj;
                });

                setViewRows((prev) => ({ ...prev, [viewId]: rows }));
            } catch (err) {
                console.warn(`[OperationalAnalytics] Could not fetch rows for ${viewId}:`, err);
                setViewRows((prev) => ({ ...prev, [viewId]: [] }));
            } finally {
                setRowsLoading((prev) => ({ ...prev, [viewId]: false }));
            }
        },
        [projectId, datasetId, currentDatasetTables.length, installedViews, installedViewsMap]
    );

    useEffect(() => {
        if (activeViewId !== 'overview' && !viewRows[activeViewId] && !rowsLoading[activeViewId]) {
            fetchViewRows(activeViewId);
        }
    }, [activeViewId, viewRows, rowsLoading, fetchViewRows]);

    const fetchLiveData = useCallback(async () => {
        if (!projectId || !datasetId) return;

        // 1. User Activity View
        if (
            installedViews.has('v_consolidated_user_activity') &&
            !droppedViewsRef.current.has('v_consolidated_user_activity') &&
            !brokenViewsRef.current.has('v_consolidated_user_activity')
        ) {
            const actualView = installedViewsMap.get('v_consolidated_user_activity') || 'v_consolidated_user_activity';
            try {
                const queryDaily = `SELECT CAST(event_time AS DATE) as dt, COUNT(1) as cnt
                    FROM \`${projectId}.${datasetId}.${actualView}\`
                    GROUP BY dt ORDER BY dt ASC;`;
                const res = await runBigQueryQuery(projectId, queryDaily, true);
                const rows = (res?.rows || []) as BigQueryTableRow[];
                const parsedDaily = rows.map((r: BigQueryTableRow) => ({
                    date: String(r.f?.[0]?.v || ''),
                    count: parseInt(String(r.f?.[1]?.v || '0'), 10)
                }));
                setLiveData((prev) => ({ ...prev, dailyActivity: parsedDaily }));

                const queryAgents = `SELECT
                    COALESCE(agent_name, 'Default Assistant') as agent,
                    COUNT(1) as cnt
                    FROM \`${projectId}.${datasetId}.${actualView}\`
                    GROUP BY agent ORDER BY cnt DESC LIMIT 6;`;
                const resAgents = await runBigQueryQuery(projectId, queryAgents, true);
                const parsedAgents = ((resAgents?.rows || []) as BigQueryTableRow[]).map((r: BigQueryTableRow) => ({
                    name: String(r.f?.[0]?.v || 'Default'),
                    value: parseInt(String(r.f?.[1]?.v || '0'), 10)
                }));
                setLiveData((prev) => ({ ...prev, agentPopularity: parsedAgents }));
                brokenViewsRef.current.delete('v_consolidated_user_activity');
                setBrokenViews((prev) => {
                    const next = new Map(prev);
                    next.delete('v_consolidated_user_activity');
                    return next;
                });
            } catch (err: unknown) {
                const rawMsg = err instanceof Error ? err.message : String(err);
                const shortMsg = rawMsg.split('\n')[0].replace(/\[INVALID_INPUT\].*$/, '').trim();
                if (isNotFoundError(shortMsg)) {
                    droppedViewsRef.current.add('v_consolidated_user_activity');
                    setDroppedViews((prev) => new Set(prev).add('v_consolidated_user_activity'));
                } else {
                    brokenViewsRef.current.set('v_consolidated_user_activity', shortMsg || 'Query error');
                    setBrokenViews((prev) => new Map(prev).set('v_consolidated_user_activity', shortMsg || 'Query error'));
                }
            }
        }

        // 2. GenAI Telemetry & Tokens View
        if (
            installedViews.has('v_gemini_genai_telemetry') &&
            !droppedViewsRef.current.has('v_gemini_genai_telemetry') &&
            !brokenViewsRef.current.has('v_gemini_genai_telemetry')
        ) {
            const actualView = installedViewsMap.get('v_gemini_genai_telemetry') || 'v_gemini_genai_telemetry';
            try {
                const queryTokens = `SELECT
                    agent_name,
                    SUM(input_tokens) as total_input,
                    SUM(output_tokens) as total_output,
                    COUNT(1) as total_calls
                    FROM \`${projectId}.${datasetId}.${actualView}\`
                    WHERE agent_name IS NOT NULL
                    GROUP BY agent_name ORDER BY (total_input + total_output) DESC LIMIT 8;`;
                const res = await runBigQueryQuery(projectId, queryTokens, true);
                const rows = (res?.rows || []) as BigQueryTableRow[];
                const parsedTokens = rows.map((r: BigQueryTableRow) => ({
                    agent: String(r.f?.[0]?.v || 'Unknown'),
                    inputTokens: parseInt(String(r.f?.[1]?.v || '0'), 10),
                    outputTokens: parseInt(String(r.f?.[2]?.v || '0'), 10),
                    calls: parseInt(String(r.f?.[3]?.v || '0'), 10)
                }));
                setLiveData((prev) => ({ ...prev, genaiTokens: parsedTokens }));

                const queryTools = `SELECT
                    SPLIT(tool_calls, '(')[OFFSET(0)] as tool,
                    COUNT(1) as cnt
                    FROM \`${projectId}.${datasetId}.${actualView}\`
                    WHERE tool_calls IS NOT NULL AND tool_calls != ''
                    GROUP BY tool ORDER BY cnt DESC LIMIT 6;`;
                const resTools = await runBigQueryQuery(projectId, queryTools, true);
                const parsedTools = ((resTools?.rows || []) as BigQueryTableRow[]).map((r: BigQueryTableRow) => ({
                    tool: String(r.f?.[0]?.v || ''),
                    count: parseInt(String(r.f?.[1]?.v || '0'), 10)
                }));
                setLiveData((prev) => ({ ...prev, toolInvocations: parsedTools }));
                brokenViewsRef.current.delete('v_gemini_genai_telemetry');
                setBrokenViews((prev) => {
                    const next = new Map(prev);
                    next.delete('v_gemini_genai_telemetry');
                    return next;
                });
            } catch (err: unknown) {
                const rawMsg = err instanceof Error ? err.message : String(err);
                const shortMsg = rawMsg.split('\n')[0].replace(/\[INVALID_INPUT\].*$/, '').trim();
                if (isNotFoundError(shortMsg)) {
                    droppedViewsRef.current.add('v_gemini_genai_telemetry');
                    setDroppedViews((prev) => new Set(prev).add('v_gemini_genai_telemetry'));
                } else {
                    brokenViewsRef.current.set('v_gemini_genai_telemetry', shortMsg || 'Query error');
                    setBrokenViews((prev) => new Map(prev).set('v_gemini_genai_telemetry', shortMsg || 'Query error'));
                }
            }
        }

        // 3. Connector Usage View
        const connectorViewKey = installedViews.has('v_user_connector_usage_30d')
            ? 'v_user_connector_usage_30d'
            : installedViews.has('v_user_connector_usage')
                ? 'v_user_connector_usage'
                : null;

        if (
            connectorViewKey &&
            !droppedViewsRef.current.has(connectorViewKey) &&
            !brokenViewsRef.current.has(connectorViewKey)
        ) {
            const actualView = installedViewsMap.get(connectorViewKey) || connectorViewKey;
            try {
                const queryUsage = `SELECT
                    connector_name,
                    COUNT(1) as cnt
                    FROM \`${projectId}.${datasetId}.${actualView}\`
                    GROUP BY connector_name ORDER BY cnt DESC LIMIT 6;`;
                const res = await runBigQueryQuery(projectId, queryUsage, true);
                const rows = (res?.rows || []) as BigQueryTableRow[];
                const parsedUsage = rows.map((r: BigQueryTableRow) => ({
                    connector: String(r.f?.[0]?.v || ''),
                    calls: parseInt(String(r.f?.[1]?.v || '0'), 10)
                }));
                setLiveData((prev) => ({ ...prev, connectorUsage: parsedUsage }));

                const queryTopUsers = `SELECT
                    user_email,
                    COUNT(1) as cnt
                    FROM \`${projectId}.${datasetId}.${actualView}\`
                    WHERE user_email IS NOT NULL AND user_email != ''
                    GROUP BY user_email ORDER BY cnt DESC LIMIT 5;`;
                const resUsers = await runBigQueryQuery(projectId, queryTopUsers, true);
                const parsedTopUsers = ((resUsers?.rows || []) as BigQueryTableRow[]).map((r: BigQueryTableRow) => ({
                    user: String(r.f?.[0]?.v || ''),
                    calls: parseInt(String(r.f?.[1]?.v || '0'), 10)
                }));
                setLiveData((prev) => ({ ...prev, topConnectorUsers: parsedTopUsers }));
                brokenViewsRef.current.delete(connectorViewKey);
                setBrokenViews((prev) => {
                    const next = new Map(prev);
                    next.delete(connectorViewKey);
                    return next;
                });
            } catch (err: unknown) {
                const rawMsg = err instanceof Error ? err.message : String(err);
                const shortMsg = rawMsg.split('\n')[0].replace(/\[INVALID_INPUT\].*$/, '').trim();
                if (isNotFoundError(shortMsg)) {
                    droppedViewsRef.current.add(connectorViewKey);
                    setDroppedViews((prev) => new Set(prev).add(connectorViewKey));
                } else {
                    brokenViewsRef.current.set(connectorViewKey, shortMsg || 'Query error');
                    setBrokenViews((prev) => new Map(prev).set(connectorViewKey, shortMsg || 'Query error'));
                }
            }
        }

        // 4. AI Choices View
        if (
            installedViews.has('v_consolidated_ai_choices') &&
            !droppedViewsRef.current.has('v_consolidated_ai_choices') &&
            !brokenViewsRef.current.has('v_consolidated_ai_choices')
        ) {
            const actualView = installedViewsMap.get('v_consolidated_ai_choices') || 'v_consolidated_ai_choices';
            try {
                const queryChoices = `SELECT
                    finish_reason,
                    COUNT(1) as cnt
                    FROM \`${projectId}.${datasetId}.${actualView}\`
                    GROUP BY finish_reason ORDER BY cnt DESC;`;
                const res = await runBigQueryQuery(projectId, queryChoices, true);
                const rows = (res?.rows || []) as BigQueryTableRow[];
                const parsedChoices = rows.map((r: BigQueryTableRow) => ({
                    name: String(r.f?.[0]?.v || 'UNKNOWN'),
                    value: parseInt(String(r.f?.[1]?.v || '0'), 10)
                }));
                setLiveData((prev) => ({ ...prev, aiChoices: parsedChoices }));
                brokenViewsRef.current.delete('v_consolidated_ai_choices');
                setBrokenViews((prev) => {
                    const next = new Map(prev);
                    next.delete('v_consolidated_ai_choices');
                    return next;
                });
            } catch (err: unknown) {
                const rawMsg = err instanceof Error ? err.message : String(err);
                const shortMsg = rawMsg.split('\n')[0].replace(/\[INVALID_INPUT\].*$/, '').trim();
                if (isNotFoundError(shortMsg)) {
                    droppedViewsRef.current.add('v_consolidated_ai_choices');
                    setDroppedViews((prev) => new Set(prev).add('v_consolidated_ai_choices'));
                } else {
                    brokenViewsRef.current.set('v_consolidated_ai_choices', shortMsg || 'Query error');
                    setBrokenViews((prev) => new Map(prev).set('v_consolidated_ai_choices', shortMsg || 'Query error'));
                }
            }
        }

        // 5. Agent Feedback View
        if (
            installedViews.has('v_agent_feedback') &&
            !droppedViewsRef.current.has('v_agent_feedback') &&
            !brokenViewsRef.current.has('v_agent_feedback')
        ) {
            const actualView = installedViewsMap.get('v_agent_feedback') || 'v_agent_feedback';
            try {
                const query = `SELECT
                  agent_name,
                  COUNTIF(feedback IN ('LIKE', 'THUMBS_UP', 'POSITIVE')) AS thumbs_up,
                  COUNTIF(feedback IN ('DISLIKE', 'THUMBS_DOWN', 'NEGATIVE')) AS thumbs_down,
                  COUNT(1) AS total
                FROM \`${projectId}.${datasetId}.${actualView}\`
                GROUP BY agent_name
                ORDER BY total DESC;`;
                const res = await runBigQueryQuery(projectId, query, true);
                const rows = (res?.rows || []) as BigQueryTableRow[];
                const parsedFeedback = rows.map((r: BigQueryTableRow) => ({
                    agent: String(r.f?.[0]?.v || 'General'),
                    thumbsUp: parseInt(String(r.f?.[1]?.v || '0'), 10),
                    thumbsDown: parseInt(String(r.f?.[2]?.v || '0'), 10),
                    total: parseInt(String(r.f?.[3]?.v || '0'), 10)
                }));
                setLiveData((prev) => ({ ...prev, feedback: parsedFeedback }));
                brokenViewsRef.current.delete('v_agent_feedback');
                setBrokenViews((prev) => {
                    const next = new Map(prev);
                    next.delete('v_agent_feedback');
                    return next;
                });
            } catch (err: unknown) {
                const rawMsg = err instanceof Error ? err.message : String(err);
                const shortMsg = rawMsg.split('\n')[0].replace(/\[INVALID_INPUT\].*$/, '').trim();
                if (isNotFoundError(shortMsg)) {
                    droppedViewsRef.current.add('v_agent_feedback');
                    setDroppedViews((prev) => new Set(prev).add('v_agent_feedback'));
                } else {
                    brokenViewsRef.current.set('v_agent_feedback', shortMsg || 'Query error');
                    setBrokenViews((prev) => new Map(prev).set('v_agent_feedback', shortMsg || 'Query error'));
                }
            }
        }
    }, [projectId, datasetId, installedViews, installedViewsMap]);

    useEffect(() => {
        fetchLiveData();
    }, [fetchLiveData]);

    const handleCreateView = async (viewId: string) => {
        if (!projectId || !datasetId) return;
        const viewDef = OPERATIONAL_VIEWS[viewId];
        if (!viewDef) return;

        setOperatingViewId(viewId);
        setActionMessage(null);
        try {
            const ddl = viewDef.getDdl(projectId, datasetId, tableNames);
            await runBigQueryQuery(projectId, ddl);
            droppedViewsRef.current.delete(viewId);
            setDroppedViews((prev) => {
                const next = new Set(prev);
                next.delete(viewId);
                return next;
            });
            setExtraInstalledViews((prev) => new Set(prev).add(viewId));
            brokenViewsRef.current.delete(viewId);
            setBrokenViews((prev) => {
                const next = new Map(prev);
                next.delete(viewId);
                return next;
            });
            setActionMessage({
                type: 'success',
                text: `Successfully created view \`${datasetId}.${viewDef.viewName}\` in BigQuery!`
            });
            if (onRefreshTables) {
                await onRefreshTables();
            }
            await fetchLiveData();
            fetchViewRows(viewId);
        } catch (err: unknown) {
            setActionMessage({
                type: 'error',
                text: `Failed to create view: ${err instanceof Error ? err.message : String(err || 'Unknown error')}`
            });
        } finally {
            setOperatingViewId(null);
        }
    };

    const handleRepairAllBrokenViews = async () => {
        if (!projectId || !datasetId || brokenViews.size === 0) return;
        setOperatingViewId('all');
        setActionMessage(null);
        try {
            const viewIds = Array.from(brokenViews.keys());
            for (const vId of viewIds) {
                const viewDef = OPERATIONAL_VIEWS[vId];
                if (viewDef) {
                    const ddl = viewDef.getDdl(projectId, datasetId, tableNames);
                    await runBigQueryQuery(projectId, ddl);
                    brokenViewsRef.current.delete(vId);
                    droppedViewsRef.current.delete(vId);
                }
            }
            setBrokenViews(new Map());
            setDroppedViews((prev) => {
                const next = new Set(prev);
                viewIds.forEach((id) => next.delete(id));
                return next;
            });
            setActionMessage({
                type: 'success',
                text: `Successfully repaired and upgraded ${viewIds.length} view(s) in BigQuery!`
            });
            if (onRefreshTables) {
                await onRefreshTables();
            }
            await fetchLiveData();
        } catch (err: unknown) {
            setActionMessage({
                type: 'error',
                text: `Failed to repair views: ${err instanceof Error ? err.message : String(err || 'Unknown error')}`
            });
        } finally {
            setOperatingViewId(null);
        }
    };

    const handleDropView = async (viewId: string) => {
        if (!projectId || !datasetId) return;
        const viewDef = OPERATIONAL_VIEWS[viewId];
        if (!viewDef) return;

        setOperatingViewId(viewId);
        setActionMessage(null);
        try {
            const actualView = installedViewsMap.get(viewId) || viewDef.viewName;
            const dropQuery = `DROP VIEW IF EXISTS \`${projectId}.${datasetId}.${actualView}\`;`;
            await runBigQueryQuery(projectId, dropQuery);

            droppedViewsRef.current.add(viewId);
            setDroppedViews((prev) => new Set(prev).add(viewId));
            setExtraInstalledViews((prev) => {
                const next = new Set(prev);
                next.delete(viewId);
                return next;
            });
            brokenViewsRef.current.delete(viewId);
            setBrokenViews((prev) => {
                const next = new Map(prev);
                next.delete(viewId);
                return next;
            });

            setLiveData((prev) => {
                const next = { ...prev };
                if (viewId === 'v_consolidated_user_activity') {
                    delete next.dailyActivity;
                    delete next.agentPopularity;
                } else if (viewId === 'v_gemini_genai_telemetry') {
                    delete next.genaiTokens;
                    delete next.toolInvocations;
                } else if (viewId === 'v_user_connector_usage_30d') {
                    delete next.connectorUsage;
                    delete next.topConnectorUsers;
                } else if (viewId === 'v_consolidated_ai_choices') {
                    delete next.aiChoices;
                } else if (viewId === 'v_agent_feedback') {
                    delete next.feedback;
                }
                return next;
            });

            setActionMessage({
                type: 'success',
                text: `Successfully dropped view \`${datasetId}.${actualView}\` from BigQuery.`
            });
            if (onRefreshTables) {
                await onRefreshTables();
            }
        } catch (err: unknown) {
            setActionMessage({
                type: 'error',
                text: `Failed to drop view: ${err instanceof Error ? err.message : String(err || 'Unknown error')}`
            });
        } finally {
            setOperatingViewId(null);
        }
    };

    const isUserActivityLive = installedViews.has('v_consolidated_user_activity');
    const isGenAiTelemetryLive = installedViews.has('v_gemini_genai_telemetry');
    const isConnectorUsageLive = installedViews.has('v_user_connector_usage_30d');
    const isAiChoicesLive = installedViews.has('v_consolidated_ai_choices');
    const isFeedbackLive = installedViews.has('v_agent_feedback');

    const dailyActivityData = isUserActivityLive ? liveData.dailyActivity || [] : FALLBACK_SNAPSHOT.dailyActivity;
    const agentPopularityData = isUserActivityLive ? liveData.agentPopularity || [] : FALLBACK_SNAPSHOT.agentPopularity;
    const genaiTokensData = isGenAiTelemetryLive ? liveData.genaiTokens || [] : FALLBACK_SNAPSHOT.genaiTelemetryTokens;
    const toolInvocationsData = isGenAiTelemetryLive ? liveData.toolInvocations || [] : FALLBACK_SNAPSHOT.toolInvocations;
    const connectorUsageData = isConnectorUsageLive ? liveData.connectorUsage || [] : FALLBACK_SNAPSHOT.connectorUsage30d;
    const topConnectorUsersData = isConnectorUsageLive ? liveData.topConnectorUsers || [] : FALLBACK_SNAPSHOT.topConnectorUsers;
    const aiChoicesData = isAiChoicesLive ? liveData.aiChoices || [] : FALLBACK_SNAPSHOT.aiFinishReasons;
    const agentFeedbackData = isFeedbackLive ? liveData.feedback || [] : FALLBACK_SNAPSHOT.agentFeedback;

    const totalInteractions = useMemo(() => {
        if (isUserActivityLive) {
            return (liveData.dailyActivity || []).reduce((acc, curr) => acc + (curr.count || 0), 0);
        }
        return FALLBACK_SNAPSHOT.overviewKpis.totalInteractions;
    }, [isUserActivityLive, liveData.dailyActivity]);

    const totalTelemetry = useMemo(() => {
        if (isGenAiTelemetryLive) {
            return (liveData.genaiTokens || []).reduce((acc, curr) => acc + (curr.inferenceCount || curr.calls || 0), 0);
        }
        return FALLBACK_SNAPSHOT.overviewKpis.totalTelemetry;
    }, [isGenAiTelemetryLive, liveData.genaiTokens]);

    const tokensTrackedStr = useMemo(() => {
        if (isGenAiTelemetryLive) {
            const sum = (liveData.genaiTokens || []).reduce(
                (acc, curr) => acc + (curr.inputTokens || 0) + (curr.outputTokens || 0),
                0
            );
            if (sum >= 1_000_000) return `${(sum / 1_000_000).toFixed(1)}M`;
            if (sum >= 1_000) return `${(sum / 1_000).toFixed(1)}K`;
            return sum.toLocaleString();
        }
        return '35.7M';
    }, [isGenAiTelemetryLive, liveData.genaiTokens]);

    const activeConnectorsCount = useMemo(() => {
        if (isConnectorUsageLive) {
            return (liveData.connectorUsage || []).length;
        }
        return FALLBACK_SNAPSHOT.overviewKpis.activeConnectors;
    }, [isConnectorUsageLive, liveData.connectorUsage]);

    return {
        activeViewId,
        selectedCategory,
        operatingViewId,
        actionMessage,
        selectedDrawerRow,
        viewRows,
        rowsLoading,
        liveData,
        brokenViews,
        installedViews,
        installedViewsMap,
        tableNames,
        isUserActivityLive,
        isGenAiTelemetryLive,
        isConnectorUsageLive,
        isAiChoicesLive,
        isFeedbackLive,
        dailyActivityData,
        agentPopularityData,
        genaiTokensData,
        toolInvocationsData,
        connectorUsageData,
        topConnectorUsersData,
        aiChoicesData,
        agentFeedbackData,
        totalInteractions,
        totalTelemetry,
        tokensTrackedStr,
        activeConnectorsCount,
        handleViewChange,
        handleCreateView,
        handleDropView,
        handleRepairAllBrokenViews,
        fetchViewRows,
        setSelectedCategory,
        setSelectedDrawerRow,
        setActionMessage
    };
}
