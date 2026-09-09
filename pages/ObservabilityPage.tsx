import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import CloudConsoleButton from '../components/CloudConsoleButton';
import { listLoggingSinks, listBigQueryTables, runBigQueryQuery } from '../services/apiService';
import ObservabilityDashboard from '../components/dashboard/ObservabilityDashboard';
import { OperationalAnalyticsDashboard } from '../components/dashboard/operational/OperationalAnalyticsDashboard';

interface Props {
    projectNumber: string;
    projectId: string;
}

const ObservabilityPage: React.FC<Props> = ({ projectNumber, projectId }) => {
    const [sinks, setSinks] = useState<any[]>([]);
    const [tables, setTables] = useState<any[]>([]);
    const [dashboardData, setDashboardData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [timeRange, setTimeRange] = useState(1);
    const [activeDashboardTab, setActiveDashboardTab] = useState<'live' | 'operational'>('live');
    const [selectedSinkName, setSelectedSinkName] = useState<string | null>(null);
    const [sinksLoading, setSinksLoading] = useState(false);
    const [queryLoading, setQueryLoading] = useState(false);

    const queryCache = useRef<Map<string, any>>(new Map());

    // 1. Fetch Log Router Sinks (only on mount / projectNumber change)
    useEffect(() => {
        if (!projectNumber) return;
        const fetchSinks = async () => {
            setSinksLoading(true);
            setError(null);
            try {
                const sinksResponse = await listLoggingSinks(projectNumber);
                setSinks(sinksResponse.sinks || []);
            } catch (err: any) {
                setError(err.message || 'Failed to fetch log sinks');
            } finally {
                setSinksLoading(false);
            }
        };
        fetchSinks();
    }, [projectNumber]);

    const bqSinks = useMemo(() => {
        return sinks.filter(sink => sink.destination && sink.destination.startsWith('bigquery.googleapis.com/'));
    }, [sinks]);
    
    const preferredSink = useMemo(() => {
        if (!bqSinks.length) return undefined;

        // 1. Highest Priority: Sink whose filter captures all 4 core tables (gen_ai.* AND user_activity)
        const core4Sink = bqSinks.find((sink: any) => {
            const f = sink.filter || '';
            const hasGenAi = f.includes('gen_ai');
            const hasUserActivity = f.includes('gemini_enterprise_user_activity') || f.includes('user_activity');
            return hasGenAi && hasUserActivity;
        });
        if (core4Sink) return core4Sink;

        // 2. Priority: Sink with user_activity that is not solely restricted to Search
        const nonSearchActivitySink = bqSinks.find((sink: any) => {
            const f = sink.filter || '';
            const hasUserActivity = f.includes('gemini_enterprise_user_activity') || f.includes('user_activity');
            const isSolelySearch = f.includes('methodName="Search"') && !f.includes('NOT') && !f.includes('!=');
            return hasUserActivity && !isSolelySearch;
        });
        if (nonSearchActivitySink) return nonSearchActivitySink;

        // 3. Any sink matching user activity
        const anyActivitySink = bqSinks.find((sink: any) => {
            const f = sink.filter || '';
            return f.includes('gemini_enterprise_user_activity') || f.includes('user_activity');
        });
        if (anyActivitySink) return anyActivitySink;

        return bqSinks[0];
    }, [bqSinks]);

    const activeSink = (selectedSinkName ? bqSinks.find(s => s.name === selectedSinkName) : null) || preferredSink;
    const datasetId = activeSink ? activeSink.destination.split('/').pop() : undefined;

    // 2. Fetch BigQuery tables (only when projectNumber or active dataset changes)
    useEffect(() => {
        if (!projectNumber || !datasetId) {
            setTables([]);
            queryCache.current.clear();
            return;
        }
        queryCache.current.clear();
        setTables([]); // Immediately clear old tables so child dashboards don't query stale schemas
        let isCurrent = true;
        const fetchTables = async () => {
            try {
                const tablesResponse = await listBigQueryTables(projectId || projectNumber, datasetId);
                if (isCurrent) {
                    setTables(tablesResponse.tables || []);
                }
            } catch (err: any) {
                if (isCurrent) {
                    console.error('Failed to fetch tables:', err);
                }
            }
        };
        fetchTables();
        return () => {
            isCurrent = false;
        };
    }, [projectNumber, datasetId]);

    // 3. Query Dashboard Metrics (optimized query with subquery JSON serialization & in-memory caching)
    useEffect(() => {
        if (!projectId || !datasetId || tables.length === 0) return;

        const cacheKey = `${projectId}:${datasetId}:${timeRange}`;
        if (queryCache.current.has(cacheKey)) {
            setDashboardData(queryCache.current.get(cacheKey));
            return;
        }

        const runQuery = async () => {
            setQueryLoading(true);
            setError(null);
            try {
                const suffixDate = new Date();
                suffixDate.setDate(suffixDate.getDate() - timeRange);
                const suffixStart = suffixDate.toISOString().slice(0, 10).replace(/-/g, '');
                
                const startTime = new Date();
                startTime.setDate(startTime.getDate() - timeRange);
                const startTimeStr = startTime.toISOString();

                const matchingActivityTables = tables
                    .map((t: any) => t.tableReference?.tableId || '')
                    .filter((id: string) => {
                        if (id.startsWith('v_')) return false;
                        if (id === 'discoveryengine_googleapis_com_gemini_enterprise_user_activity') return true;
                        if (id.startsWith('discoveryengine_googleapis_com_gemini_enterprise_user_activity_')) {
                            const datePart = id.split('_').pop()!;
                            return /^\d{8}$/.test(datePart) ? datePart >= suffixStart : true;
                        }
                        return false;
                    });

                const dashboardData: any = {
                    volumeData: [],
                    agentData: [],
                    totalRequests: 0,
                    totalSessions: 0,
                    uniqueUsers: 0,
                    queries: {}
                };

                if (matchingActivityTables.length > 0) {
                    const timeFormat = timeRange === 30 ? '%Y-%m-%d' : (timeRange === 7 ? '%m-%d %H:00' : '%H:%M');
                    const truncUnit = timeRange === 30 ? 'DAY' : 'HOUR';
                    
                    let volumeTimeSelect = '';
                    if (timeRange === 1) {
                        volumeTimeSelect = `FORMAT_TIMESTAMP('%H:%M', TIMESTAMP_SECONDS(DIV(UNIX_SECONDS(event_time), 900) * 900))`;
                    } else {
                        volumeTimeSelect = `FORMAT_TIMESTAMP('${timeFormat}', TIMESTAMP_TRUNC(event_time, ${truncUnit}))`;
                    }

                    // Raw table union with early column filtering
                    const tableSelects = matchingActivityTables.map((t: string) => `
                      SELECT 
                        TO_JSON_STRING(jsonPayload) as jp,
                        timestamp as event_time,
                        trace,
                        insertId
                      FROM \`${projectId}.${datasetId}.${t}\`
                      WHERE timestamp >= TIMESTAMP('${startTimeStr}')
                        AND jsonPayload.logmetadata.methodname IN ('WriteUserEvent', 'StreamAssist', 'Assist', 'Search')
                    `);

                    const baseActivityCTE = `
                      raw_activity AS (
                        ${tableSelects.join('\nUNION ALL\n')}
                      ),
                      base_activity AS (
                        SELECT
                          COALESCE(
                            JSON_VALUE(jp, '$.useriamprincipal'),
                            JSON_VALUE(jp, '$.userIamPrincipal')
                          ) as user_email,
                          event_time,
                          COALESCE(
                            JSON_VALUE(jp, '$.request.userevent.agentspaceinfo.agentinfo.name'),
                            JSON_VALUE(jp, '$.response.agentinfo.displayname'),
                            IF(JSON_VALUE(jp, '$.logmetadata.methodname') = 'Search', 
                               CONCAT('Search (', COALESCE(REGEXP_EXTRACT(JSON_VALUE(jp, '$.request.servingconfig'), r'engines/([^/]+)'), 'default'), ')'), 
                               NULL)
                          ) as agent_name,
                          COALESCE(
                            JSON_VALUE(jp, '$.request.userevent.agentspaceinfo.agentinfo.agentid'),
                            JSON_VALUE(jp, '$.response.agentinfo.agent'),
                            IF(JSON_VALUE(jp, '$.logmetadata.methodname') = 'Search', 'search', NULL)
                          ) as agent_id,
                          COALESCE(
                            REGEXP_EXTRACT(JSON_VALUE(jp, '$.response.answer.name'), r'sessions/([^/]+)'), 
                            trace, 
                            insertId
                          ) as session_id,
                          JSON_VALUE(jp, '$.logmetadata.methodname') as method_name
                        FROM raw_activity
                      )
                    `;

                    const consolidatedQuery = `
                      WITH ${baseActivityCTE},
                      summary_metrics AS (
                        SELECT 
                          COUNTIF(method_name IN ('StreamAssist', 'Assist', 'Search')) as total_queries,
                          COUNT(DISTINCT IF(method_name IN ('StreamAssist', 'Assist', 'Search'), session_id, NULL)) as total_sessions,
                          COUNT(DISTINCT IF(method_name IN ('StreamAssist', 'Assist', 'Search') AND user_email IS NOT NULL, user_email, NULL)) as unique_users
                        FROM base_activity
                      ),
                      volume_metrics AS (
                        SELECT 
                          ${volumeTimeSelect} as event_time, 
                          COUNT(*) as requests
                        FROM base_activity
                        WHERE method_name IN ('StreamAssist', 'Assist', 'Search')
                        GROUP BY event_time
                      ),
                      combined AS (
                        SELECT 
                          user_email,
                          event_time,
                          agent_name,
                          agent_id,
                          CAST(NULL AS STRING) as session_id
                        FROM base_activity
                        WHERE method_name = 'WriteUserEvent' AND agent_name IS NOT NULL

                        UNION ALL

                        SELECT 
                          user_email,
                          event_time,
                          agent_name,
                          agent_id,
                          session_id
                        FROM base_activity
                        WHERE method_name IN ('StreamAssist', 'Assist', 'Search') AND session_id IS NOT NULL
                      ),
                      filled AS (
                        SELECT 
                          session_id,
                          COALESCE(
                            agent_name,
                            LAST_VALUE(agent_name IGNORE NULLS) OVER (
                              PARTITION BY user_email 
                              ORDER BY event_time 
                              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                            )
                          ) as resolved_agent_name,
                          COALESCE(
                            agent_id,
                            LAST_VALUE(agent_id IGNORE NULLS) OVER (
                              PARTITION BY user_email 
                              ORDER BY event_time 
                              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                            )
                          ) as resolved_agent_id
                        FROM combined
                      ),
                      mapped_agents AS (
                        SELECT 
                          COALESCE(resolved_agent_name, 'Global Assistant / Default') as agent_name,
                          COALESCE(resolved_agent_id, 'default') as agent_id
                        FROM filled
                        WHERE session_id IS NOT NULL
                      ),
                      agent_metrics AS (
                        SELECT 
                          agent_name,
                          agent_id,
                          COUNT(*) as count
                        FROM mapped_agents
                        GROUP BY agent_name, agent_id
                        ORDER BY count DESC
                      )
                      SELECT 'summary' as metric_type, CAST(total_queries AS STRING) as label, CAST(total_sessions AS STRING) as val1, CAST(unique_users AS STRING) as val2 FROM summary_metrics
                      UNION ALL
                      SELECT 'volume' as metric_type, event_time as label, CAST(requests AS STRING) as val1, NULL as val2 FROM volume_metrics
                      UNION ALL
                      SELECT 'agent' as metric_type, agent_name as label, CAST(count AS STRING) as val1, agent_id as val2 FROM agent_metrics
                    `;

                    dashboardData.queries.summaryQuery = `
                        WITH ${baseActivityCTE}
                        SELECT
                          COUNTIF(method_name IN ('StreamAssist', 'Assist', 'Search')) as total_queries,
                          COUNT(DISTINCT IF(method_name IN ('StreamAssist', 'Assist', 'Search'), session_id, NULL)) as total_sessions,
                          COUNT(DISTINCT IF(method_name IN ('StreamAssist', 'Assist', 'Search') AND user_email IS NOT NULL, user_email, NULL)) as unique_users
                        FROM base_activity
                    `;

                    dashboardData.queries.volumeQuery = `
                        WITH ${baseActivityCTE}
                        SELECT 
                          ${volumeTimeSelect} as event_time, 
                          COUNT(*) as requests
                        FROM base_activity
                        WHERE method_name IN ('StreamAssist', 'Assist', 'Search')
                        GROUP BY event_time
                        ORDER BY event_time
                    `;

                    dashboardData.queries.agentQuery = `
                        WITH ${baseActivityCTE},
                        combined AS (
                          SELECT 
                            user_email,
                            event_time,
                            agent_name,
                            agent_id,
                            CAST(NULL AS STRING) as session_id
                          FROM base_activity
                          WHERE method_name = 'WriteUserEvent' AND agent_name IS NOT NULL

                          UNION ALL

                          SELECT 
                            user_email,
                            event_time,
                            agent_name,
                            agent_id,
                            session_id
                          FROM base_activity
                          WHERE method_name IN ('StreamAssist', 'Assist', 'Search') AND session_id IS NOT NULL
                        ),
                        filled AS (
                          SELECT 
                            session_id,
                            COALESCE(
                              agent_name,
                              LAST_VALUE(agent_name IGNORE NULLS) OVER (
                                PARTITION BY user_email 
                                ORDER BY event_time 
                                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                              )
                            ) as resolved_agent_name,
                            COALESCE(
                              agent_id,
                              LAST_VALUE(agent_id IGNORE NULLS) OVER (
                                PARTITION BY user_email 
                                ORDER BY event_time 
                                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                              )
                            ) as resolved_agent_id
                          FROM combined
                        ),
                        mapped_agents AS (
                          SELECT 
                            COALESCE(resolved_agent_name, 'Global Assistant / Default') as agent_name,
                            COALESCE(resolved_agent_id, 'default') as agent_id
                          FROM filled
                          WHERE session_id IS NOT NULL
                        )
                        SELECT 
                          agent_name,
                          agent_id,
                          COUNT(*) as count
                        FROM mapped_agents
                        GROUP BY agent_name, agent_id
                        ORDER BY count DESC
                    `;

                    dashboardData.queries.userCountQuery = `
                        WITH ${baseActivityCTE}
                        SELECT COUNT(DISTINCT IF(method_name IN ('StreamAssist', 'Assist', 'Search') AND user_email IS NOT NULL, user_email, NULL)) as unique_users
                        FROM base_activity
                    `;

                    const result = await runBigQueryQuery(projectId, consolidatedQuery, true);
                    const rows = result?.rows || [];

                    rows.forEach((row: any) => {
                        const type = row.f[0].v;
                        const label = row.f[1].v;
                        const val1 = row.f[2].v;
                        const val2 = row.f[3].v;

                        if (type === 'summary') {
                            dashboardData.totalRequests = parseInt(label, 10);
                            dashboardData.totalSessions = parseInt(val1, 10);
                            dashboardData.uniqueUsers = parseInt(val2, 10);
                        } else if (type === 'volume') {
                            dashboardData.volumeData.push({
                                time: label,
                                requests: parseInt(val1, 10),
                                errors: 0
                            });
                        } else if (type === 'agent') {
                            dashboardData.agentData.push({
                                name: label,
                                id: val2,
                                count: parseInt(val1, 10)
                            });
                        }
                    });

                    dashboardData.uniqueAgents = dashboardData.agentData.length;
                }

                queryCache.current.set(cacheKey, dashboardData);
                setDashboardData(dashboardData);
            } catch (err: any) {
                setError(err.message || 'Failed to fetch dashboard data');
            } finally {
                setQueryLoading(false);
            }
        };

        runQuery();
    }, [projectId, datasetId, timeRange, tables]);

    const refreshTables = useCallback(async () => {
        if ((!projectId && !projectNumber) || !datasetId) return;
        try {
            queryCache.current.clear();
            const tablesResponse = await listBigQueryTables(projectId || projectNumber, datasetId);
            setTables(tablesResponse.tables || []);
        } catch (e) {
            console.error('Failed to refresh tables:', e);
        }
    }, [projectId, projectNumber, datasetId]);

    return (
        <div className="flex-1 overflow-auto bg-gray-900 border-l border-gray-800 custom-scrollbar">
            <div className="p-8 max-w-7xl mx-auto">
                <div className="mb-8 flex justify-between items-start">
                    <div>
                        <h1 className="text-3xl font-bold text-white tracking-tight">Observability</h1>
                        <p className="mt-2 text-sm text-gray-400">
                            Monitor and analyze your agent activities and performance.
                        </p>
                    </div>
                    <CloudConsoleButton url={`https://console.cloud.google.com/logs/query?project=${projectNumber}`} />
                </div>
                
                <div className="mt-6 bg-gray-800 p-6 rounded-lg border border-gray-700">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h2 className="text-xl font-semibold text-white">Log Router Sinks & Tables</h2>
                            <p className="text-xs text-gray-400 mt-0.5">Click any BigQuery sink below to switch the active dataset.</p>
                        </div>
                        {activeSink && (
                            <span className="text-xs text-gray-400 bg-gray-900 border border-gray-700 px-2.5 py-1 rounded">
                                Active Dataset: <code className="text-green-400 font-mono font-semibold">{datasetId}</code>
                            </span>
                        )}
                    </div>
                    
                    {sinksLoading && (
                        <div className="flex items-center justify-center p-4 text-sm text-blue-300">
                            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-400 mr-3"></div>
                            Discovering log sinks...
                        </div>
                    )}
                    
                    {error && (
                        <div className="mb-4 p-3.5 text-xs text-red-300 bg-red-900/30 rounded-lg border border-red-800 flex items-start justify-between gap-3">
                            <div className="flex-1 font-mono break-all line-clamp-3 hover:line-clamp-none">
                                {error}
                            </div>
                            <button
                                type="button"
                                onClick={() => setError(null)}
                                className="text-gray-400 hover:text-white font-bold ml-2 text-sm"
                                title="Dismiss error"
                            >
                                ×
                            </button>
                        </div>
                    )}
                    
                    {!sinksLoading && (
                        <div className="space-y-6">
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <h3 className="text-lg font-medium text-white">BigQuery Sinks</h3>
                                    <span className="text-xs text-gray-500">
                                        {bqSinks.length} sink{bqSinks.length !== 1 ? 's' : ''} detected
                                    </span>
                                </div>
                                {bqSinks.length === 0 ? (
                                    <p className="text-gray-400 text-sm">No BigQuery log sinks found.</p>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {bqSinks.map(sink => {
                                            const isActive = activeSink && sink.name === activeSink.name;
                                            const sinkDataset = sink.destination.split('/').pop();
                                            const hasCore4 = Boolean(
                                                sink.filter &&
                                                sink.filter.includes('gen_ai') &&
                                                (sink.filter.includes('gemini_enterprise_user_activity') || sink.filter.includes('user_activity'))
                                            );
                                            const isSearchOnly = Boolean(
                                                sink.filter &&
                                                sink.filter.includes('methodName="Search"') &&
                                                !sink.filter.includes('NOT') &&
                                                !sink.filter.includes('!=')
                                            );
                                            const isUserActivity = Boolean(
                                                sink.filter && (
                                                    sink.filter.includes('gemini_enterprise_user_activity') ||
                                                    sink.filter.includes('discoveryengine.googleapis.com%2Fgemini_enterprise_user_activity')
                                                )
                                            );

                                            return (
                                                <div
                                                    key={sink.name}
                                                    onClick={() => setSelectedSinkName(sink.name)}
                                                    className={`p-3.5 rounded-lg border transition-all cursor-pointer select-none ${
                                                        isActive
                                                            ? 'border-blue-500 bg-blue-950/30 ring-1 ring-blue-500/80 shadow-md shadow-blue-950/40'
                                                            : 'border-gray-700 bg-gray-900/70 hover:border-gray-500 hover:bg-gray-800/60'
                                                    }`}
                                                >
                                                    <div className="flex justify-between items-start gap-2">
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                                                <span className="text-sm font-semibold text-white truncate" title={sink.name}>
                                                                    {sink.name}
                                                                </span>
                                                                {isActive && (
                                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-600 text-white flex items-center gap-1">
                                                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-200 animate-pulse"></span>
                                                                        Active
                                                                    </span>
                                                                )}
                                                                {hasCore4 ? (
                                                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-700/80">
                                                                        4 Core Tables (Full Sink)
                                                                    </span>
                                                                ) : isSearchOnly ? (
                                                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-purple-900/60 text-purple-200 border border-purple-700/50">
                                                                        Search Logs Only
                                                                    </span>
                                                                ) : isUserActivity ? (
                                                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-200 border border-emerald-700/50">
                                                                        User & Assistant Logs
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700">
                                                                        BQ Sink
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-xs text-gray-400">
                                                                Dataset: <code className="text-green-400 font-mono font-medium">{sinkDataset}</code>
                                                            </p>
                                                        </div>
                                                        <div className="shrink-0 pt-0.5">
                                                            <span className={`text-[11px] font-medium ${isActive ? 'text-blue-400' : 'text-gray-500'}`}>
                                                                {isActive ? '● Selected' : 'Click to select'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {datasetId && (
                                <div>
                                    <h3 className="text-lg font-medium text-white mb-2">Tables in <code className="text-green-400">{datasetId}</code></h3>
                                    {tables.length === 0 ? (
                                        <p className="text-gray-400 text-sm">No tables found or unable to list.</p>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            {Array.from(new Set(tables.map(table => {
                                                const tableId = table.tableReference.tableId;
                                                return tableId.replace(/_\d{8}$/, '');
                                            }))).map(baseTableId => (
                                                <div key={baseTableId} className="p-2 bg-gray-900 rounded-md border border-gray-700 text-sm text-gray-300 font-mono flex justify-between items-center min-w-0" title={baseTableId}>
                                                    <span className="truncate mr-2">{baseTableId}</span>
                                                    <span className="text-xs text-gray-500 bg-gray-800 px-1 rounded shrink-0">Partitioned</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="mt-8">
                    {/* Dashboard Mode Tabs */}
                    <div className="flex border-b border-gray-700 mb-6">
                        <button
                            type="button"
                            onClick={() => setActiveDashboardTab('live')}
                            className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                                activeDashboardTab === 'live'
                                    ? 'border-blue-500 text-blue-400 font-semibold'
                                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600'
                            }`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            Live Activity
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveDashboardTab('operational')}
                            className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                                activeDashboardTab === 'operational'
                                    ? 'border-blue-500 text-blue-400 font-semibold'
                                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600'
                            }`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                            Operational Analytics
                            <span className="text-[10px] bg-blue-900/60 text-blue-300 px-1.5 py-0.5 rounded border border-blue-700/50">
                                11 Views
                            </span>
                        </button>
                    </div>

                    {activeDashboardTab === 'live' ? (
                        <div>
                            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                                <div className="flex items-center gap-3">
                                    <h2 className="text-xl font-semibold text-white">Live Activity Dashboard</h2>
                                    {queryLoading && (
                                        <div className="flex items-center gap-1.5 text-xs text-blue-300 bg-blue-950/70 border border-blue-800/70 px-2.5 py-0.5 rounded-full">
                                            <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-blue-400"></div>
                                            <span>Querying {timeRange}d BigQuery shards...</span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-400">Time Range:</span>
                                    <select
                                        value={timeRange}
                                        onChange={(e) => setTimeRange(parseInt(e.target.value, 10))}
                                        className="text-xs bg-gray-800 text-white border border-gray-700 rounded px-2 py-1 focus:outline-none focus:border-blue-500"
                                    >
                                        <option value={1}>1 Day</option>
                                        <option value={7}>7 Days</option>
                                        <option value={30}>30 Days</option>
                                    </select>
                                </div>
                            </div>
                            <ObservabilityDashboard datasetId={datasetId} customData={dashboardData} timeRange={timeRange} setTimeRange={setTimeRange} />
                        </div>
                    ) : (
                        <OperationalAnalyticsDashboard
                            projectId={projectId}
                            projectNumber={projectNumber}
                            datasetId={datasetId}
                            tables={tables}
                            onRefreshTables={refreshTables}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default ObservabilityPage;
