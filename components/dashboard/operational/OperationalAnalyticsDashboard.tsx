import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    AreaChart,
    Area,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';
import { ViewControlHeader } from './ViewControlHeader';
import { IndividualViewDetail } from './IndividualViewDetail';
import { DetailDrawer } from './DetailDrawer';
import { VIEW_CATEGORIES, OPERATIONAL_VIEWS, FALLBACK_SNAPSHOT } from './analyticsData';
import { runBigQueryQuery } from '../../../services/apiService';

interface Props {
    projectId: string;
    projectNumber: string;
    datasetId?: string;
    tables: any[];
    onRefreshTables?: () => Promise<void>;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316'];

const getFinishReasonColor = (reason: string, index: number = 0): string => {
    const norm = (reason || '').toUpperCase().trim();
    if (norm === 'STOP') return '#3B82F6';
    if (norm === 'MAX_TOKENS') return '#F59E0B';
    if (norm === 'SAFETY' || norm === 'BLOCKED') return '#EC4899';
    if (norm === 'RECITATION') return '#8B5CF6';
    if (norm.includes('ERROR') || norm === 'OTHER') return '#EF4444';
    return COLORS[index % COLORS.length];
};

const EmptyChartState: React.FC<{ message?: string; subtext?: string }> = ({
    message = 'No data available in this view',
    subtext = 'Live view is connected in BigQuery, but returned 0 records.'
}) => (
    <div className="h-64 flex flex-col items-center justify-center text-center p-4 bg-gray-950/40 rounded-lg border border-gray-800/80">
        <svg className="w-8 h-8 text-gray-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <p className="text-xs font-medium text-gray-300">{message}</p>
        <p className="text-[11px] text-gray-500 mt-1 max-w-xs">{subtext}</p>
    </div>
);

export const OperationalAnalyticsDashboard: React.FC<Props> = ({
    projectId,
    projectNumber,
    datasetId,
    tables = [],
    onRefreshTables
}) => {
    // Navigation state: 'overview' or viewId ('v_gemini_genai_telemetry', etc.)
    const [activeViewId, setActiveViewId] = useState<string>(() => {
        if (typeof window !== 'undefined' && window.location.hash) {
            const hash = window.location.hash.replace('#', '');
            if (OPERATIONAL_VIEWS[hash] || hash === 'overview') {
                return hash;
            }
        }
        return 'overview';
    });

    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [operatingViewId, setOperatingViewId] = useState<string | null>(null);
    const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [selectedDrawerRow, setSelectedDrawerRow] = useState<any | null>(null);

    // Row cache for DataTables
    const [viewRows, setViewRows] = useState<Record<string, any[]>>({});
    const [rowsLoading, setRowsLoading] = useState<Record<string, boolean>>({});

    // Live query aggregate states for Overview
    const [liveData, setLiveData] = useState<{
        dailyActivity?: any[];
        agentPopularity?: any[];
        genaiTokens?: any[];
        toolInvocations?: any[];
        connectorUsage?: any[];
        topConnectorUsers?: any[];
        aiChoices?: any[];
        feedback?: any[];
    }>({});

    const [extraInstalledViews, setExtraInstalledViews] = useState<Set<string>>(new Set());
    const [droppedViews, setDroppedViews] = useState<Set<string>>(new Set());
    const droppedViewsRef = useRef<Set<string>>(new Set());
    const [brokenViews, setBrokenViews] = useState<Map<string, string>>(new Map());
    const brokenViewsRef = useRef<Map<string, string>>(new Map());

    // Sync active view with window hash
    const handleViewChange = (viewId: string) => {
        setActiveViewId(viewId);
        if (typeof window !== 'undefined') {
            window.location.hash = viewId === 'overview' ? '' : viewId;
        }
    };

    useEffect(() => {
        const onHashChange = () => {
            if (typeof window !== 'undefined') {
                const hash = window.location.hash.replace('#', '');
                if (OPERATIONAL_VIEWS[hash] || hash === 'overview') {
                    setActiveViewId(hash);
                } else if (!hash) {
                    setActiveViewId('overview');
                }
            }
        };
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, []);

    // Helper to detect if an error indicates the table/view does not exist in BigQuery
    const isNotFoundError = (msg: string) => {
        return (
            msg.includes('Not found: Table') ||
            msg.includes('404') ||
            msg.includes('NOT_FOUND') ||
            msg.includes('does not exist') ||
            msg.includes('Not found: Dataset')
        );
    };

    // Reset states when datasetId changes
    useEffect(() => {
        setLiveData({});
        setViewRows({});
        setExtraInstalledViews(new Set());
        setDroppedViews(new Set());
        droppedViewsRef.current = new Set();
        setBrokenViews(new Map());
        brokenViewsRef.current = new Map();
    }, [datasetId]);

    // View aliases across all 11 views
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

    // Filter tables to strictly match the currently selected datasetId
    const currentDatasetTables = useMemo(() => {
        if (!datasetId) return [];
        return tables.filter((t) => !t.tableReference?.datasetId || t.tableReference.datasetId === datasetId);
    }, [tables, datasetId]);

    // Identify which views are installed in the currently selected dataset
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

    // Fetch live rows for a specific view when viewed in DataTable
    const fetchViewRows = useCallback(
        async (viewId: string) => {
            if (!projectId || !datasetId || !OPERATIONAL_VIEWS[viewId]) return;
            // If this view is not installed, provide simulated preview rows with the MOCK indicator
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
                const rows = (res?.rows || []).map((r: any) => {
                    const obj: Record<string, any> = {};
                    r.f?.forEach((cell: any, idx: number) => {
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

    // Auto-fetch rows when activeViewId is an individual view
    useEffect(() => {
        if (activeViewId !== 'overview' && !viewRows[activeViewId] && !rowsLoading[activeViewId]) {
            fetchViewRows(activeViewId);
        }
    }, [activeViewId, viewRows, rowsLoading, fetchViewRows]);

    // Fetch overview live data
    const fetchLiveData = useCallback(async () => {
        if (!projectId || !datasetId || currentDatasetTables.length === 0) return;

        // 1. User Activity View
        if (
            installedViews.has('v_consolidated_user_activity') &&
            !droppedViewsRef.current.has('v_consolidated_user_activity') &&
            !brokenViewsRef.current.has('v_consolidated_user_activity')
        ) {
            const actualView = installedViewsMap.get('v_consolidated_user_activity') || 'v_consolidated_user_activity';
            try {
                const query = `SELECT
                  DATE(event_time) AS event_date,
                  COALESCE(agent_name, 'General Assistant') AS agent_name,
                  COUNT(1) AS activity_count,
                  COUNT(DISTINCT session_id) AS session_count,
                  COUNT(DISTINCT user_email) AS unique_users
                FROM \`${projectId}.${datasetId}.${actualView}\`
                GROUP BY 1, 2
                ORDER BY 1 DESC, 3 DESC
                LIMIT 100;`;
                const res = await runBigQueryQuery(projectId, query, true);
                const rows = res?.rows || [];
                const activityMap = new Map<string, number>();
                const agentMap = new Map<string, number>();

                rows.forEach((r: any) => {
                    const date = r.f[0]?.v || '';
                    let agent = r.f[1]?.v || 'General';
                    const cleanMatch = agent.match(/^([a-zA-Z0-9_-]+?)(?:[-_][0-9]{10,})/);
                    if (cleanMatch) {
                        agent = cleanMatch[1];
                    }
                    const count = parseInt(r.f[2]?.v || '0', 10);

                    activityMap.set(date, (activityMap.get(date) || 0) + count);
                    agentMap.set(agent, (agentMap.get(agent) || 0) + count);
                });

                const parsedTimeline = Array.from(activityMap.entries())
                    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
                    .map(([date, count]) => ({ date: date.slice(5), count }));

                const parsedAgents = Array.from(agentMap.entries())
                    .map(([name, value]) => ({ name, value }))
                    .sort((a, b) => b.value - a.value)
                    .slice(0, 8);

                setLiveData((prev) => ({
                    ...prev,
                    dailyActivity: parsedTimeline,
                    agentPopularity: parsedAgents
                }));
                brokenViewsRef.current.delete('v_consolidated_user_activity');
                setBrokenViews((prev) => {
                    const next = new Map(prev);
                    next.delete('v_consolidated_user_activity');
                    return next;
                });
            } catch (err: any) {
                const shortMsg = (err?.message || String(err)).split('\n')[0].replace(/\[INVALID_INPUT\].*$/, '').trim();
                if (isNotFoundError(shortMsg)) {
                    droppedViewsRef.current.add('v_consolidated_user_activity');
                    setDroppedViews((prev) => new Set(prev).add('v_consolidated_user_activity'));
                    brokenViewsRef.current.delete('v_consolidated_user_activity');
                    setBrokenViews((prev) => {
                        const next = new Map(prev);
                        next.delete('v_consolidated_user_activity');
                        return next;
                    });
                } else {
                    brokenViewsRef.current.set('v_consolidated_user_activity', shortMsg || 'Query error');
                    setBrokenViews((prev) => new Map(prev).set('v_consolidated_user_activity', shortMsg || 'Query error'));
                }
            }
        }

        // 2. GenAI Telemetry View
        if (
            installedViews.has('v_gemini_genai_telemetry') &&
            !droppedViewsRef.current.has('v_gemini_genai_telemetry') &&
            !brokenViewsRef.current.has('v_gemini_genai_telemetry')
        ) {
            const actualView = installedViewsMap.get('v_gemini_genai_telemetry') || 'v_gemini_genai_telemetry';
            try {
                const tokenQuery = `SELECT
                  COALESCE(agent_name, 'General Assistant') AS agent_name,
                  SUM(input_tokens) AS total_input_tokens,
                  SUM(output_tokens) AS total_output_tokens,
                  COUNT(1) AS inference_count,
                  COUNTIF(tool_calls IS NOT NULL AND tool_calls != '') AS tool_calls_count
                FROM \`${projectId}.${datasetId}.${actualView}\`
                GROUP BY agent_name
                ORDER BY (total_input_tokens + total_output_tokens) DESC
                LIMIT 10;`;

                const toolsQuery = `WITH extracted_tools AS (
                  SELECT 
                    REGEXP_EXTRACT(call, r'^([a-zA-Z0-9_-]+)') as tool_name
                  FROM \`${projectId}.${datasetId}.${actualView}\`,
                  UNNEST(SPLIT(tool_calls, '; ')) as call
                  WHERE tool_calls IS NOT NULL AND tool_calls != ''
                )
                SELECT 
                  tool_name as tool, 
                  COUNT(1) as count
                FROM extracted_tools
                WHERE tool_name IS NOT NULL
                GROUP BY 1
                ORDER BY 2 DESC
                LIMIT 10;`;

                const [tokenRes, toolsRes] = await Promise.all([
                    runBigQueryQuery(projectId, tokenQuery, true),
                    runBigQueryQuery(projectId, toolsQuery, true).catch(() => ({ rows: [] }))
                ]);

                const tokenRows = tokenRes?.rows || [];
                const parsedTokens = tokenRows.map((r: any) => ({
                    agent: r.f[0]?.v || 'General',
                    inputTokens: parseInt(r.f[1]?.v || '0', 10),
                    outputTokens: parseInt(r.f[2]?.v || '0', 10),
                    inferenceCount: parseInt(r.f[3]?.v || '0', 10),
                    toolCalls: parseInt(r.f[4]?.v || '0', 10)
                }));

                const toolRows = toolsRes?.rows || [];
                const parsedTools = toolRows.map((r: any) => ({
                    tool: r.f[0]?.v || 'tool',
                    count: parseInt(r.f[1]?.v || '0', 10)
                }));

                setLiveData((prev) => ({
                    ...prev,
                    genaiTokens: parsedTokens,
                    toolInvocations: parsedTools
                }));
                brokenViewsRef.current.delete('v_gemini_genai_telemetry');
                setBrokenViews((prev) => {
                    const next = new Map(prev);
                    next.delete('v_gemini_genai_telemetry');
                    return next;
                });
            } catch (err: any) {
                const shortMsg = (err?.message || String(err)).split('\n')[0].replace(/\[INVALID_INPUT\].*$/, '').trim();
                if (isNotFoundError(shortMsg)) {
                    droppedViewsRef.current.add('v_gemini_genai_telemetry');
                    setDroppedViews((prev) => new Set(prev).add('v_gemini_genai_telemetry'));
                } else {
                    brokenViewsRef.current.set('v_gemini_genai_telemetry', shortMsg || 'Query error');
                    setBrokenViews((prev) => new Map(prev).set('v_gemini_genai_telemetry', shortMsg || 'Query error'));
                }
            }
        }

        // 3. Connector Usage (30d) View
        if (
            installedViews.has('v_user_connector_usage_30d') &&
            !droppedViewsRef.current.has('v_user_connector_usage_30d') &&
            !brokenViewsRef.current.has('v_user_connector_usage_30d')
        ) {
            const actualView = installedViewsMap.get('v_user_connector_usage_30d') || 'v_user_connector_usage_30d';
            try {
                const connQuery = `SELECT
                  connector_name,
                  connector_type,
                  SUM(usage_count) AS total_usage,
                  COUNT(DISTINCT user_email) AS unique_users
                FROM \`${projectId}.${datasetId}.${actualView}\`
                GROUP BY connector_name, connector_type
                ORDER BY total_usage DESC;`;

                const userQuery = `SELECT
                  user_email,
                  SUM(usage_count) AS total_usage
                FROM \`${projectId}.${datasetId}.${actualView}\`
                GROUP BY user_email
                ORDER BY total_usage DESC
                LIMIT 6;`;

                const [connRes, userRes] = await Promise.all([
                    runBigQueryQuery(projectId, connQuery, true),
                    runBigQueryQuery(projectId, userQuery, true).catch(() => ({ rows: [] }))
                ]);

                const connRows = connRes?.rows || [];
                const parsedConnectors = connRows.map((r: any) => ({
                    connector: r.f[0]?.v || 'Connector',
                    calls: parseInt(r.f[2]?.v || '0', 10),
                    users: parseInt(r.f[3]?.v || '0', 10)
                }));

                const userRows = userRes?.rows || [];
                const parsedUsers = userRows.map((r: any) => ({
                    user: r.f[0]?.v || 'User',
                    calls: parseInt(r.f[1]?.v || '0', 10)
                }));

                setLiveData((prev) => ({
                    ...prev,
                    connectorUsage: parsedConnectors,
                    topConnectorUsers: parsedUsers
                }));
                brokenViewsRef.current.delete('v_user_connector_usage_30d');
                setBrokenViews((prev) => {
                    const next = new Map(prev);
                    next.delete('v_user_connector_usage_30d');
                    return next;
                });
            } catch (err: any) {
                const shortMsg = (err?.message || String(err)).split('\n')[0].replace(/\[INVALID_INPUT\].*$/, '').trim();
                if (isNotFoundError(shortMsg)) {
                    droppedViewsRef.current.add('v_user_connector_usage_30d');
                    setDroppedViews((prev) => new Set(prev).add('v_user_connector_usage_30d'));
                } else {
                    brokenViewsRef.current.set('v_user_connector_usage_30d', shortMsg || 'Query error');
                    setBrokenViews((prev) => new Map(prev).set('v_user_connector_usage_30d', shortMsg || 'Query error'));
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
                const query = `SELECT
                  COALESCE(UPPER(finish_reason), 'STOP') AS finish_reason,
                  COUNT(1) AS count
                FROM \`${projectId}.${datasetId}.${actualView}\`
                GROUP BY 1
                ORDER BY count DESC;`;
                const res = await runBigQueryQuery(projectId, query, true);
                const rows = res?.rows || [];
                const parsedChoices = rows.map((r: any) => ({
                    name: (r.f[0]?.v || 'STOP').toUpperCase(),
                    value: parseInt(r.f[1]?.v || '0', 10)
                }));
                setLiveData((prev) => ({ ...prev, aiChoices: parsedChoices }));
                brokenViewsRef.current.delete('v_consolidated_ai_choices');
                setBrokenViews((prev) => {
                    const next = new Map(prev);
                    next.delete('v_consolidated_ai_choices');
                    return next;
                });
            } catch (err: any) {
                const shortMsg = (err?.message || String(err)).split('\n')[0].replace(/\[INVALID_INPUT\].*$/, '').trim();
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
                const rows = res?.rows || [];
                const parsedFeedback = rows.map((r: any) => ({
                    agent: r.f[0]?.v || 'General',
                    thumbsUp: parseInt(r.f[1]?.v || '0', 10),
                    thumbsDown: parseInt(r.f[2]?.v || '0', 10),
                    total: parseInt(r.f[3]?.v || '0', 10)
                }));
                setLiveData((prev) => ({ ...prev, feedback: parsedFeedback }));
                brokenViewsRef.current.delete('v_agent_feedback');
                setBrokenViews((prev) => {
                    const next = new Map(prev);
                    next.delete('v_agent_feedback');
                    return next;
                });
            } catch (err: any) {
                const shortMsg = (err?.message || String(err)).split('\n')[0].replace(/\[INVALID_INPUT\].*$/, '').trim();
                if (isNotFoundError(shortMsg)) {
                    droppedViewsRef.current.add('v_agent_feedback');
                    setDroppedViews((prev) => new Set(prev).add('v_agent_feedback'));
                } else {
                    brokenViewsRef.current.set('v_agent_feedback', shortMsg || 'Query error');
                    setBrokenViews((prev) => new Map(prev).set('v_agent_feedback', shortMsg || 'Query error'));
                }
            }
        }
    }, [projectId, datasetId, installedViews, installedViewsMap, currentDatasetTables.length]);

    useEffect(() => {
        fetchLiveData();
    }, [fetchLiveData]);

    // Handle Create View
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
        } catch (err: any) {
            setActionMessage({
                type: 'error',
                text: `Failed to create view: ${err.message || 'Unknown error'}`
            });
        } finally {
            setOperatingViewId(null);
        }
    };

    // Handle Repair All Broken Views
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
        } catch (err: any) {
            setActionMessage({
                type: 'error',
                text: `Failed to repair views: ${err.message || 'Unknown error'}`
            });
        } finally {
            setOperatingViewId(null);
        }
    };

    // Handle Drop View
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

            // Clear liveData for this view
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
        } catch (err: any) {
            setActionMessage({
                type: 'error',
                text: `Failed to drop view: ${err.message || 'Unknown error'}`
            });
        } finally {
            setOperatingViewId(null);
        }
    };

    // Live vs Mock flags
    const isUserActivityLive = installedViews.has('v_consolidated_user_activity');
    const isGenAiTelemetryLive = installedViews.has('v_gemini_genai_telemetry');
    const isConnectorUsageLive = installedViews.has('v_user_connector_usage_30d');
    const isAiChoicesLive = installedViews.has('v_consolidated_ai_choices');
    const isFeedbackLive = installedViews.has('v_agent_feedback');

    // Chart Data
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

    const categories = [
        { id: 'all', label: 'All Analytics Views' },
        { id: 'user_activity', label: 'User Activity', viewId: 'v_consolidated_user_activity' },
        { id: 'telemetry', label: 'GenAI Telemetry & Tokens', viewId: 'v_gemini_genai_telemetry' },
        { id: 'connectors', label: 'Connector Usage', viewId: 'v_user_connector_usage_30d' },
        { id: 'choices', label: 'AI Model Choices', viewId: 'v_consolidated_ai_choices' },
        { id: 'feedback', label: 'Agent Feedback', viewId: 'v_agent_feedback' }
    ];

    const showView = (id: string) => selectedCategory === 'all' || selectedCategory === id;

    return (
        <div className="space-y-6">
            {/* Header Banner & Status */}
            <div className="bg-gray-800 p-5 rounded-xl border border-gray-700 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <h2 className="text-xl font-bold text-white tracking-tight">
                                Extended Operational Analytics
                            </h2>
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-900/50 text-blue-300 border border-blue-700">
                                Recharts Native
                            </span>
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 font-mono">
                                11 Dedicated Views
                            </span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1.5 flex items-center flex-wrap gap-x-2 gap-y-1">
                            {datasetId ? (
                                <>
                                    <span>
                                        Target BigQuery Dataset:{' '}
                                        <code className="text-green-400 font-mono font-semibold">{datasetId}</code> (
                                        <strong className={installedViews.size > 0 ? 'text-emerald-400' : 'text-amber-400'}>
                                            {installedViews.size} of 11 Views deployed
                                        </strong>
                                        )
                                    </span>
                                    {installedViews.size < 11 && (
                                        <span className="text-amber-300/90 flex items-center gap-1 font-medium">
                                            <span>•</span>
                                            <span>
                                                Views labeled <strong className="text-amber-300">MOCK</strong> display simulated data until created in this dataset.
                                            </span>
                                        </span>
                                    )}
                                </>
                            ) : (
                                'No BigQuery dataset identified from log sinks. Showing offline mock analytics.'
                            )}
                        </div>
                    </div>

                    {/* View Switcher Controls */}
                    <div className="flex items-center gap-2.5 flex-wrap self-start md:self-center">
                        {/* Global Overview Tab */}
                        <button
                            type="button"
                            onClick={() => handleViewChange('overview')}
                            className={`px-3.5 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-all ${
                                activeViewId === 'overview'
                                    ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-400/50'
                                    : 'bg-gray-900 text-gray-300 hover:bg-gray-750 hover:text-white border border-gray-700'
                            }`}
                        >
                            <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                            </svg>
                            <span>Global Overview</span>
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                        </button>

                        {/* Detailed Views Dropdown Selector */}
                        <div className="relative">
                            <select
                                aria-label="Select Operational View"
                                value={activeViewId === 'overview' ? '' : activeViewId}
                                onChange={(e) => {
                                    if (e.target.value) handleViewChange(e.target.value);
                                }}
                                className={`bg-gray-900 border text-xs rounded-lg pl-3 pr-8 py-2 font-medium cursor-pointer transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none appearance-none ${
                                    activeViewId !== 'overview'
                                        ? 'border-blue-500 text-white bg-blue-950/40 ring-1 ring-blue-500/50 font-semibold'
                                        : 'border-gray-700 text-gray-300 hover:border-gray-600 hover:text-white'
                                }`}
                            >
                                <option value="" disabled>
                                    📊 Jump to Detailed View (11 Views)...
                                </option>
                                {VIEW_CATEGORIES.filter(cat => cat.title !== 'Dashboard').map((category) => (
                                    <optgroup key={category.title} label={`── ${category.title} ──`} className="bg-gray-800 text-gray-400 font-semibold">
                                        {category.items.map((item) => {
                                            const isInstalled = installedViews.has(item.id);
                                            return (
                                                <option
                                                    key={item.id}
                                                    value={item.id}
                                                    className="bg-gray-900 text-gray-100 py-1"
                                                >
                                                    {isInstalled ? '🟢 ' : '🟡 '}{item.title} [{isInstalled ? 'Live' : 'Mock'}]
                                                </option>
                                            );
                                        })}
                                    </optgroup>
                                ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-gray-400">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>

                        {/* Back to Overview shortcut when in a subview */}
                        {activeViewId !== 'overview' && (
                            <button
                                type="button"
                                onClick={() => handleViewChange('overview')}
                                className="px-3 py-2 bg-gray-700 hover:bg-gray-650 text-gray-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
                                title="Return to Global Overview"
                            >
                                <span>← Overview</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Sub-bar: Overview Category Filter Pills */}
                {activeViewId === 'overview' && (
                    <div className="mt-4 pt-3.5 border-t border-gray-700/60 flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mr-1.5 flex items-center gap-1">
                                <svg className="w-3.5 h-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                                </svg>
                                Filter Charts:
                            </span>
                            {categories.map((cat) => (
                                <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => setSelectedCategory(cat.id)}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                                        selectedCategory === cat.id
                                            ? 'bg-blue-600 text-white shadow-sm font-semibold'
                                            : 'bg-gray-900 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-700'
                                    }`}
                                >
                                    {cat.label}
                                </button>
                            ))}
                        </div>

                        <div className="text-[11px] text-gray-400 font-mono hidden sm:flex items-center gap-3">
                            <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                                Live View
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>
                                Mock Fallback
                            </span>
                        </div>
                    </div>
                )}

                {/* Status / Feedback Alert */}
                {actionMessage && (
                    <div
                        className={`mt-4 p-3 rounded-lg text-xs flex items-center justify-between ${
                            actionMessage.type === 'success'
                                ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300'
                                : 'bg-rose-950/80 border border-rose-800 text-rose-300'
                        }`}
                    >
                        <span>{actionMessage.text}</span>
                        <button
                            type="button"
                            onClick={() => setActionMessage(null)}
                            className="text-gray-400 hover:text-white font-bold ml-3"
                        >
                            ×
                        </button>
                    </div>
                )}

                {/* Repair Banner when Broken Views are detected */}
                {brokenViews.size > 0 && (
                    <div className="mt-4 p-3.5 bg-amber-950/40 border border-amber-800/80 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-200">
                        <div className="flex items-center gap-3">
                            <svg className="w-5 h-5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <div>
                                <p className="text-xs font-semibold text-white">
                                    {brokenViews.size} BigQuery view{brokenViews.size > 1 ? 's have' : ' has'} schema errors in BigQuery
                                </p>
                                <p className="text-[11px] text-amber-300/80 mt-0.5">
                                    Click repair to deploy updated view definitions with tool call argument extraction.
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            disabled={operatingViewId !== null}
                            onClick={handleRepairAllBrokenViews}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded shadow transition-colors shrink-0 disabled:opacity-50"
                        >
                            {operatingViewId === 'all' ? 'Repairing Views...' : 'Repair All Views'}
                        </button>
                    </div>
                )}
            </div>

            {/* Main Content Area - 100% Full Width */}
            <div className="w-full">
                    {activeViewId === 'overview' ? (
                        <div className="space-y-6">
                            {/* KPI Cards Row */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs text-gray-400 uppercase tracking-wide">Total Interactions</span>
                                        {isUserActivityLive ? (
                                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                                LIVE
                                            </span>
                                        ) : (
                                            <span
                                                className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/40"
                                                title="View not installed in dataset. Showing simulated mock data."
                                            >
                                                MOCK
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-2xl lg:text-3xl font-light text-white">
                                        {totalInteractions.toLocaleString()}
                                    </div>
                                    <div className={`text-[11px] mt-1 ${isUserActivityLive ? 'text-emerald-400' : 'text-amber-400/80'}`}>
                                        {isUserActivityLive ? '100% Agent Attributed' : 'Simulated Agent Attributed'}
                                    </div>
                                </div>

                                <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs text-gray-400 uppercase tracking-wide">Telemetry Events</span>
                                        {isGenAiTelemetryLive ? (
                                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                                LIVE
                                            </span>
                                        ) : (
                                            <span
                                                className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/40"
                                                title="View not installed in dataset. Showing simulated mock data."
                                            >
                                                MOCK
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-2xl lg:text-3xl font-light text-white">
                                        {totalTelemetry.toLocaleString()}
                                    </div>
                                    <div className={`text-[11px] mt-1 ${isGenAiTelemetryLive ? 'text-blue-400' : 'text-amber-400/80'}`}>
                                        {isGenAiTelemetryLive ? 'Model Inferences & Tools' : 'Simulated Inferences'}
                                    </div>
                                </div>

                                <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs text-gray-400 uppercase tracking-wide">Tokens Tracked</span>
                                        {isGenAiTelemetryLive ? (
                                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                                LIVE
                                            </span>
                                        ) : (
                                            <span
                                                className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/40"
                                                title="View not installed in dataset. Showing simulated mock data."
                                            >
                                                MOCK
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-2xl lg:text-3xl font-light text-white">{tokensTrackedStr}</div>
                                    <div className={`text-[11px] mt-1 ${isGenAiTelemetryLive ? 'text-emerald-400' : 'text-amber-400/80'}`}>
                                        {isGenAiTelemetryLive ? 'Input & Output Tokens' : 'Simulated Token Usage'}
                                    </div>
                                </div>

                                <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs text-gray-400 uppercase tracking-wide">Active Connectors</span>
                                        {isConnectorUsageLive ? (
                                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                                LIVE
                                            </span>
                                        ) : (
                                            <span
                                                className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/40"
                                                title="View not installed in dataset. Showing simulated mock data."
                                            >
                                                MOCK
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-2xl lg:text-3xl font-light text-white">
                                        {activeConnectorsCount}
                                    </div>
                                    <div className={`text-[11px] mt-1 ${isConnectorUsageLive ? 'text-emerald-400' : 'text-amber-400/80'}`}>
                                        {isConnectorUsageLive ? 'Active in Selected Dataset' : 'Simulated 30-Day Window'}
                                    </div>
                                </div>
                            </div>

                            {/* Section 1: User Activity */}
                            {showView('user_activity') && (
                                <div className="bg-gray-900 border border-gray-700 rounded-lg p-5 space-y-4">
                                    <ViewControlHeader
                                        title="User Interaction Activity & Agent Popularity"
                                        subtitle="Attributed user sessions, daily query volumes, and agent distribution."
                                        viewName={installedViewsMap.get('v_consolidated_user_activity') || 'v_consolidated_user_activity'}
                                        datasetId={datasetId}
                                        isInstalled={installedViews.has('v_consolidated_user_activity')}
                                        isOperating={operatingViewId === 'v_consolidated_user_activity'}
                                        isBroken={brokenViews.has('v_consolidated_user_activity')}
                                        errorMessage={brokenViews.get('v_consolidated_user_activity')}
                                        onCreate={() => handleCreateView('v_consolidated_user_activity')}
                                        onDrop={() => handleDropView('v_consolidated_user_activity')}
                                        ddlQuery={OPERATIONAL_VIEWS.v_consolidated_user_activity.getDdl(projectId, datasetId || 'your_dataset', tableNames)}
                                        selectQuery={OPERATIONAL_VIEWS.v_consolidated_user_activity.getQuery(projectId, datasetId || 'your_dataset')}
                                    />

                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
                                        <div className="lg:col-span-2">
                                            <div className="flex items-center justify-between mb-3">
                                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                                    Daily Interaction Volume
                                                </h4>
                                                <button
                                                    type="button"
                                                    onClick={() => handleViewChange('v_consolidated_user_activity')}
                                                    className="text-[11px] text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
                                                >
                                                    Open Interactive Table →
                                                </button>
                                            </div>
                                            {dailyActivityData.length === 0 ? (
                                                <EmptyChartState message="No interaction records found" subtext="The live view is connected in BigQuery, but returned 0 events." />
                                            ) : (
                                                <div className="h-64 w-full">
                                                    <ResponsiveContainer width="100%" height={256}>
                                                        <AreaChart data={dailyActivityData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                                                            <defs>
                                                                <linearGradient id="colorDaily" x1="0" y1="0" x2="0" y2="1">
                                                                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4} />
                                                                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
                                                                </linearGradient>
                                                            </defs>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                                            <XAxis dataKey="date" stroke="#9CA3AF" fontSize={11} />
                                                            <YAxis stroke="#9CA3AF" fontSize={11} />
                                                            <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#4B5563', color: '#F3F4F6' }} />
                                                            <Area type="monotone" dataKey="count" name="Queries" stroke="#3B82F6" strokeWidth={2} fillOpacity={1} fill="url(#colorDaily)" isAnimationActive={false} />
                                                        </AreaChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                                                Agent Popularity Share
                                            </h4>
                                            {agentPopularityData.length === 0 ? (
                                                <EmptyChartState message="No agent popularity records" subtext="No agent distribution found in this view." />
                                            ) : (
                                                <div className="h-64 w-full">
                                                    <ResponsiveContainer width="100%" height={256}>
                                                        <PieChart>
                                                            <Pie
                                                                data={agentPopularityData}
                                                                innerRadius={50}
                                                                outerRadius={80}
                                                                paddingAngle={3}
                                                                dataKey="value"
                                                                nameKey="name"
                                                                isAnimationActive={false}
                                                            >
                                                                {agentPopularityData.map((_, index) => (
                                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                                ))}
                                                            </Pie>
                                                            <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#4B5563', color: '#F3F4F6' }} />
                                                            <Legend layout="horizontal" verticalAlign="bottom" align="center" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px', color: '#9CA3AF' }} />
                                                        </PieChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Section 2: GenAI Telemetry & Tokens */}
                            {showView('telemetry') && (
                                <div className="bg-gray-900 border border-gray-700 rounded-lg p-5 space-y-4">
                                    <ViewControlHeader
                                        title="GenAI Telemetry & Token Consumption"
                                        subtitle="Input and output tokens per agent, model finish states, and tool invocations."
                                        viewName={installedViewsMap.get('v_gemini_genai_telemetry') || 'v_gemini_genai_telemetry'}
                                        datasetId={datasetId}
                                        isInstalled={installedViews.has('v_gemini_genai_telemetry')}
                                        isOperating={operatingViewId === 'v_gemini_genai_telemetry'}
                                        isBroken={brokenViews.has('v_gemini_genai_telemetry')}
                                        errorMessage={brokenViews.get('v_gemini_genai_telemetry')}
                                        onCreate={() => handleCreateView('v_gemini_genai_telemetry')}
                                        onDrop={() => handleDropView('v_gemini_genai_telemetry')}
                                        ddlQuery={OPERATIONAL_VIEWS.v_gemini_genai_telemetry.getDdl(projectId, datasetId || 'your_dataset', tableNames)}
                                        selectQuery={OPERATIONAL_VIEWS.v_gemini_genai_telemetry.getQuery(projectId, datasetId || 'your_dataset')}
                                    />

                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
                                        <div>
                                            <div className="flex items-center justify-between mb-3">
                                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                                    Token Consumption by Agent
                                                </h4>
                                                <button
                                                    type="button"
                                                    onClick={() => handleViewChange('v_gemini_genai_telemetry')}
                                                    className="text-[11px] text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
                                                >
                                                    Explore 1,813 Tool Calls →
                                                </button>
                                            </div>
                                            {genaiTokensData.length === 0 ? (
                                                <EmptyChartState message="No token consumption records" subtext="No token events recorded for models in this view." />
                                            ) : (
                                                <div className="h-64 w-full">
                                                    <ResponsiveContainer width="100%" height={256}>
                                                        <BarChart data={genaiTokensData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                                            <XAxis dataKey="agent" stroke="#9CA3AF" fontSize={11} interval={0} angle={-15} textAnchor="end" />
                                                            <YAxis stroke="#9CA3AF" fontSize={11} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
                                                            <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#4B5563', color: '#F3F4F6' }} />
                                                            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                                                            <Bar dataKey="inputTokens" name="Input Tokens" stackId="a" fill="#3B82F6" isAnimationActive={false} />
                                                            <Bar dataKey="outputTokens" name="Output Tokens" stackId="a" fill="#10B981" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                                                Tool Invocations by Tool Name
                                            </h4>
                                            {toolInvocationsData.length === 0 ? (
                                                <EmptyChartState message="No tool invocation records" subtext="No tool execution events recorded in this dataset." />
                                            ) : (
                                                <div className="h-64 w-full">
                                                    <ResponsiveContainer width="100%" height={256}>
                                                        <BarChart layout="vertical" data={toolInvocationsData} margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                                                            <XAxis type="number" stroke="#9CA3AF" fontSize={11} />
                                                            <YAxis type="category" dataKey="tool" stroke="#9CA3AF" fontSize={10} width={100} />
                                                            <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#4B5563', color: '#F3F4F6' }} />
                                                            <Bar dataKey="count" name="Invocations" fill="#F59E0B" radius={[0, 4, 4, 0]} isAnimationActive={false} />
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Section 3: Connector Usage (30d) */}
                            {showView('connectors') && (
                                <div className="bg-gray-900 border border-gray-700 rounded-lg p-5 space-y-4">
                                    <ViewControlHeader
                                        title="Connector Usage (Rolling 30 Days)"
                                        subtitle="Invocations across Sharepoint, Drive, Search, Jira, and top active employees."
                                        viewName={installedViewsMap.get('v_user_connector_usage_30d') || 'v_user_connector_usage_30d'}
                                        datasetId={datasetId}
                                        isInstalled={installedViews.has('v_user_connector_usage_30d')}
                                        isOperating={operatingViewId === 'v_user_connector_usage_30d'}
                                        isBroken={brokenViews.has('v_user_connector_usage_30d')}
                                        errorMessage={brokenViews.get('v_user_connector_usage_30d')}
                                        onCreate={() => handleCreateView('v_user_connector_usage_30d')}
                                        onDrop={() => handleDropView('v_user_connector_usage_30d')}
                                        ddlQuery={OPERATIONAL_VIEWS.v_user_connector_usage_30d.getDdl(projectId, datasetId || 'your_dataset', tableNames)}
                                        selectQuery={OPERATIONAL_VIEWS.v_user_connector_usage_30d.getQuery(projectId, datasetId || 'your_dataset')}
                                    />

                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
                                        <div>
                                            <div className="flex items-center justify-between mb-3">
                                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                                    Invocations by Connector
                                                </h4>
                                                <button
                                                    type="button"
                                                    onClick={() => handleViewChange('v_user_connector_usage_30d')}
                                                    className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1"
                                                >
                                                    View All 19 Tools Table →
                                                </button>
                                            </div>
                                            {connectorUsageData.length === 0 ? (
                                                <EmptyChartState message="No connector usage records in last 30 days" subtext="Live view is active, but no connector calls were recorded." />
                                            ) : (
                                                <div className="h-64 w-full">
                                                    <ResponsiveContainer width="100%" height={256}>
                                                        <BarChart layout="vertical" data={connectorUsageData} margin={{ top: 5, right: 30, left: 30, bottom: 5 }}>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                                                            <XAxis type="number" stroke="#9CA3AF" fontSize={11} />
                                                            <YAxis type="category" dataKey="connector" stroke="#9CA3AF" fontSize={10} width={90} />
                                                            <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#4B5563', color: '#F3F4F6' }} />
                                                            <Bar dataKey="calls" name="30-Day Invocations" fill="#10B981" radius={[0, 4, 4, 0]} isAnimationActive={false} />
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                                                Top Connector Users
                                            </h4>
                                            {topConnectorUsersData.length === 0 ? (
                                                <EmptyChartState message="No connector user records" subtext="No user email attribution available for connectors." />
                                            ) : (
                                                <div className="h-64 w-full">
                                                    <ResponsiveContainer width="100%" height={256}>
                                                        <BarChart layout="vertical" data={topConnectorUsersData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                                                            <XAxis type="number" stroke="#9CA3AF" fontSize={11} />
                                                            <YAxis type="category" dataKey="user" stroke="#9CA3AF" fontSize={9} width={140} tickFormatter={(v) => (v.length > 20 ? v.substring(0, 18) + '...' : v)} />
                                                            <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#4B5563', color: '#F3F4F6' }} />
                                                            <Bar dataKey="calls" name="Calls" fill="#3B82F6" radius={[0, 4, 4, 0]} isAnimationActive={false} />
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Section 4: AI Choices */}
                            {showView('choices') && (
                                <div className="bg-gray-900 border border-gray-700 rounded-lg p-5 space-y-4">
                                    <ViewControlHeader
                                        title="AI Generation Choices & Finish Reasons"
                                        subtitle="Monitoring model generation completions, token limits, and safety filters."
                                        viewName={installedViewsMap.get('v_consolidated_ai_choices') || 'v_consolidated_ai_choices'}
                                        datasetId={datasetId}
                                        isInstalled={installedViews.has('v_consolidated_ai_choices')}
                                        isOperating={operatingViewId === 'v_consolidated_ai_choices'}
                                        isBroken={brokenViews.has('v_consolidated_ai_choices')}
                                        errorMessage={brokenViews.get('v_consolidated_ai_choices')}
                                        onCreate={() => handleCreateView('v_consolidated_ai_choices')}
                                        onDrop={() => handleDropView('v_consolidated_ai_choices')}
                                        ddlQuery={OPERATIONAL_VIEWS.v_consolidated_ai_choices.getDdl(projectId, datasetId || 'your_dataset', tableNames)}
                                        selectQuery={OPERATIONAL_VIEWS.v_consolidated_ai_choices.getQuery(projectId, datasetId || 'your_dataset')}
                                    />

                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
                                        <div>
                                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                                                Model Finish Reasons Breakdown
                                            </h4>
                                            {aiChoicesData.length === 0 ? (
                                                <EmptyChartState message="No model finish reason records" subtext="No finish reasons found in view." />
                                            ) : (
                                                <div className="h-64 w-full">
                                                    <ResponsiveContainer width="100%" height={256}>
                                                        <PieChart>
                                                            <Pie data={aiChoicesData} innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" nameKey="name" isAnimationActive={false}>
                                                                {aiChoicesData.map((entry, index) => (
                                                                    <Cell key={`choice-${index}`} fill={getFinishReasonColor(entry.name, index)} />
                                                                ))}
                                                            </Pie>
                                                            <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#4B5563', color: '#F3F4F6' }} />
                                                            <Legend layout="horizontal" verticalAlign="bottom" align="center" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px', color: '#9CA3AF' }} />
                                                        </PieChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                                                Choice Frequency
                                            </h4>
                                            {aiChoicesData.length === 0 ? (
                                                <EmptyChartState message="No model choice records" subtext="No generation choices recorded." />
                                            ) : (
                                                <div className="h-64 w-full">
                                                    <ResponsiveContainer width="100%" height={256}>
                                                        <BarChart data={aiChoicesData} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                                            <XAxis dataKey="name" stroke="#9CA3AF" fontSize={10} interval={0} angle={-15} textAnchor="end" />
                                                            <YAxis stroke="#9CA3AF" fontSize={11} />
                                                            <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#4B5563', color: '#F3F4F6' }} />
                                                            <Bar dataKey="value" name="Generations" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                                                                {aiChoicesData.map((entry, index) => (
                                                                    <Cell key={`bar-choice-${index}`} fill={getFinishReasonColor(entry.name, index)} />
                                                                ))}
                                                            </Bar>
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Section 5: Agent Feedback */}
                            {showView('feedback') && (
                                <div className="bg-gray-900 border border-gray-700 rounded-lg p-5 space-y-4">
                                    <ViewControlHeader
                                        title="Agent Feedback & Sentiment"
                                        subtitle="Aggregated end-user ratings, thumbs up / thumbs down distributions, and feedback comments."
                                        viewName={installedViewsMap.get('v_agent_feedback') || 'v_agent_feedback'}
                                        datasetId={datasetId}
                                        isInstalled={installedViews.has('v_agent_feedback')}
                                        isOperating={operatingViewId === 'v_agent_feedback'}
                                        isBroken={brokenViews.has('v_agent_feedback')}
                                        errorMessage={brokenViews.get('v_agent_feedback')}
                                        onCreate={() => handleCreateView('v_agent_feedback')}
                                        onDrop={() => handleDropView('v_agent_feedback')}
                                        ddlQuery={OPERATIONAL_VIEWS.v_agent_feedback.getDdl(projectId, datasetId || 'your_dataset', tableNames)}
                                        selectQuery={OPERATIONAL_VIEWS.v_agent_feedback.getQuery(projectId, datasetId || 'your_dataset')}
                                    />

                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
                                        <div>
                                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                                                Feedback Ratings per Agent
                                            </h4>
                                            {agentFeedbackData.length === 0 ? (
                                                <EmptyChartState message="No agent feedback ratings submitted yet" subtext="Live view is active in BigQuery, but returned 0 feedback events." />
                                            ) : (
                                                <div className="h-64 w-full">
                                                    <ResponsiveContainer width="100%" height={256}>
                                                        <BarChart data={agentFeedbackData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                                            <XAxis dataKey="agent" stroke="#9CA3AF" fontSize={11} interval={0} angle={-15} textAnchor="end" />
                                                            <YAxis stroke="#9CA3AF" fontSize={11} />
                                                            <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#4B5563', color: '#F3F4F6' }} />
                                                            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                                                            <Bar dataKey="thumbsUp" name="Thumbs Up" fill="#10B981" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                                                            <Bar dataKey="thumbsDown" name="Thumbs Down" fill="#EF4444" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex flex-col justify-between space-y-4 bg-gray-950/60 p-5 rounded-lg border border-gray-800">
                                            <div>
                                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                                                    Quality & Satisfaction Summary
                                                </h4>
                                                <div className="grid grid-cols-3 gap-3">
                                                    <div className="p-3 bg-gray-900 rounded border border-gray-800">
                                                        <div className="text-[11px] text-emerald-400 font-semibold mb-1">Total Positive</div>
                                                        <div className="text-2xl font-bold text-white">
                                                            {agentFeedbackData.reduce((acc, d) => acc + d.thumbsUp, 0)}
                                                        </div>
                                                        <div className="text-[10px] text-gray-500 mt-1">Thumbs up ratings</div>
                                                    </div>
                                                    <div className="p-3 bg-gray-900 rounded border border-gray-800">
                                                        <div className="text-[11px] text-rose-400 font-semibold mb-1">Total Negative</div>
                                                        <div className="text-2xl font-bold text-white">
                                                            {agentFeedbackData.reduce((acc, d) => acc + d.thumbsDown, 0)}
                                                        </div>
                                                        <div className="text-[10px] text-gray-500 mt-1">Flagged responses</div>
                                                    </div>
                                                    <div className="p-3 bg-gray-900 rounded border border-gray-800">
                                                        <div className="text-[11px] text-blue-400 font-semibold mb-1">Satisfaction</div>
                                                        <div className="text-2xl font-bold text-white">
                                                            {(() => {
                                                                const pos = agentFeedbackData.reduce((acc, d) => acc + d.thumbsUp, 0);
                                                                const neg = agentFeedbackData.reduce((acc, d) => acc + d.thumbsDown, 0);
                                                                const total = pos + neg;
                                                                return total > 0 ? `${Math.round((pos / total) * 100)}%` : '—';
                                                            })()}
                                                        </div>
                                                        <div className="text-[10px] text-gray-500 mt-1">
                                                            {agentFeedbackData.reduce((acc, d) => acc + d.thumbsUp + d.thumbsDown, 0)} total reviews
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <p className="text-xs text-gray-400 leading-relaxed">
                                                Track satisfaction rates, turn-by-turn prompts, and sentiment triage across your assistants. Click{' '}
                                                <button
                                                    type="button"
                                                    onClick={() => handleViewChange('v_agent_feedback')}
                                                    className="text-blue-400 hover:underline font-mono"
                                                >
                                                    v_agent_feedback
                                                </button>{' '}
                                                or{' '}
                                                <button
                                                    type="button"
                                                    onClick={() => handleViewChange('v_agent_feedback_detailed')}
                                                    className="text-blue-400 hover:underline font-mono"
                                                >
                                                    v_agent_feedback_detailed
                                                </button>{' '}
                                                to inspect user comments and prompt logs.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Section 6: Explore All 11 Views Directory */}
                            <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 shadow-sm space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-base font-bold text-white tracking-tight">
                                            Operational Views Directory
                                        </h3>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            Click any card to launch the interactive DataTable and deep-dive drawer
                                        </p>
                                    </div>
                                    <span className="text-xs font-mono px-2 py-1 rounded bg-gray-800 text-gray-300 border border-gray-700">
                                        11 Views Available
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                                    {Object.values(OPERATIONAL_VIEWS).map((vDef) => {
                                        const isDepl = installedViews.has(vDef.id);
                                        return (
                                            <div
                                                key={vDef.id}
                                                onClick={() => handleViewChange(vDef.id)}
                                                className="p-3.5 bg-gray-950/70 border border-gray-800 hover:border-blue-600/70 hover:bg-gray-900/90 rounded-lg cursor-pointer transition-all group flex flex-col justify-between"
                                            >
                                                <div>
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <span className="text-[10px] uppercase font-semibold text-blue-400 font-mono tracking-wider">
                                                            {vDef.category}
                                                        </span>
                                                        {isDepl ? (
                                                            <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 uppercase">
                                                                LIVE
                                                            </span>
                                                        ) : (
                                                            <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-amber-500/15 text-amber-400 border border-amber-500/40 uppercase">
                                                                MOCK
                                                            </span>
                                                        )}
                                                    </div>
                                                    <h4 className="text-sm font-semibold text-white group-hover:text-blue-400 transition-colors">
                                                        {vDef.title}
                                                    </h4>
                                                    <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                                                        {vDef.description}
                                                    </p>
                                                </div>
                                                <div className="mt-3 pt-2.5 border-t border-gray-800/80 flex items-center justify-between text-[11px] text-gray-500 group-hover:text-blue-400 transition-colors">
                                                    <span className="font-mono">{vDef.columns.length} columns</span>
                                                    <span className="font-medium flex items-center gap-1">
                                                        Inspect Table →
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Individual Dedicated View with DataTable & Charts */
                        <IndividualViewDetail
                            viewId={activeViewId}
                            data={viewRows[activeViewId] || (installedViews.has(activeViewId) ? [] : (FALLBACK_SNAPSHOT.rows[activeViewId] || []))}
                            projectId={projectId}
                            datasetId={datasetId}
                            installedViews={installedViews}
                            installedViewsMap={installedViewsMap}
                            operatingViewId={operatingViewId}
                            brokenViews={brokenViews}
                            tableNames={tableNames}
                            onCreateView={handleCreateView}
                            onDropView={handleDropView}
                            onBackToOverview={() => handleViewChange('overview')}
                            onRowClick={(row) => setSelectedDrawerRow(row)}
                            isLoading={rowsLoading[activeViewId]}
                            overviewLiveData={liveData}
                        />
                    )}
            </div>

            {/* Slide-over Detail Drawer */}
            <DetailDrawer
                isOpen={!!selectedDrawerRow}
                onClose={() => setSelectedDrawerRow(null)}
                data={selectedDrawerRow}
                title={
                    activeViewId !== 'overview' && OPERATIONAL_VIEWS[activeViewId]
                        ? `${OPERATIONAL_VIEWS[activeViewId].title} Details`
                        : 'Log Record Details'
                }
            />
        </div>
    );
};
