import React, { useState, useEffect } from 'react';
import CloudConsoleButton from '../components/CloudConsoleButton';
import { listLoggingSinks, listBigQueryTables, runBigQueryQuery } from '../services/apiService';
import ObservabilityDashboard from '../components/dashboard/ObservabilityDashboard';

interface Props {
    projectNumber: string;
    projectId: string;
}

const ObservabilityPage: React.FC<Props> = ({ projectNumber, projectId }) => {
    const [sinks, setSinks] = useState<any[]>([]);
    const [tables, setTables] = useState<any[]>([]);
    const [dashboardData, setDashboardData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showAllSinks, setShowAllSinks] = useState(false);
    const [timeRange, setTimeRange] = useState(1);

    useEffect(() => {
        const fetchData = async () => {
            if (!projectNumber || !projectId) return;
            setLoading(true);
            setError(null);
            try {
                // 1. List log sinks
                const sinksResponse = await listLoggingSinks(projectNumber);
                const allSinks = sinksResponse.sinks || [];
                setSinks(allSinks);

                // 2. Find the sink for user logs
                const userLogSink = allSinks.find((sink: any) => 
                    sink.filter && (
                        sink.filter.includes('discoveryengine.googleapis.com%2Fgemini_enterprise_user_activity') ||
                        sink.filter.includes('discoveryengine.googleapis.com/gemini_enterprise_user_activity')
                    )
                );

                if (userLogSink && userLogSink.destination) {
                    const destParts = userLogSink.destination.split('/');
                    const dataset = destParts[destParts.length - 1];
                    
                    // 3. List tables in the dataset
                    const tablesResponse = await listBigQueryTables(projectNumber, dataset);
                    const allTables = tablesResponse.tables || [];
                    setTables(allTables);

                    // 4. Fetch real data for charts
                    const suffixDate = new Date();
                    suffixDate.setDate(suffixDate.getDate() - timeRange);
                    const suffixStart = suffixDate.toISOString().slice(0, 10).replace(/-/g, '');

                    const messageTableWildcard = `${projectId}.${dataset}.discoveryengine_googleapis_com_gen_ai_user_message_*`;
                    const activityTableWildcard = `${projectId}.${dataset}.discoveryengine_googleapis_com_gemini_enterprise_user_activity_*`;
                    
                    // Calculate start time based on timeRange
                    const startTime = new Date();
                    startTime.setDate(startTime.getDate() - timeRange);
                    const startTimeStr = startTime.toISOString();

                    // Collect matching sharded tables in range
                    const matchingActivityTables = allTables
                        .map((t: any) => t.tableReference.tableId)
                        .filter((id: string) => id.startsWith('discoveryengine_googleapis_com_gemini_enterprise_user_activity_') && id.split('_').pop()! >= suffixStart);

                    // 4. Construct unified dashboard query
                    let consolidatedQuery = '';
                    const tableSelects = matchingActivityTables.map((t: string) => `
                        SELECT 
                          jsonPayload.useriamprincipal as user_email,
                          timestamp as event_time,
                          JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.agentspaceinfo.agentinfo.name') as agent_name,
                          JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.request.userevent.agentspaceinfo.agentinfo.agentid') as agent_id,
                          COALESCE(REGEXP_EXTRACT(JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.response.answer.name'), r'sessions/([^/]+)'), trace) as session_id,
                          JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.logmetadata.methodname') as method_name,
                          insertId
                        FROM \`${projectId}.${dataset}.${t}\`
                        WHERE timestamp >= TIMESTAMP('${startTimeStr}')
                          AND (
                            JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.logmetadata.methodname') = 'WriteUserEvent' 
                            OR JSON_VALUE(TO_JSON_STRING(jsonPayload), '$.logmetadata.methodname') = 'StreamAssist'
                          )
                    `);

                    const dashboardData: any = {
                        volumeData: [],
                        agentData: [],
                        totalRequests: 0,
                        totalSessions: 0,
                        uniqueUsers: 0,
                        queries: {}
                    };

                    if (tableSelects.length > 0) {
                        const timeFormat = timeRange === 30 ? '%Y-%m-%d' : (timeRange === 7 ? '%m-%d %H:00' : '%H:%M');
                        const truncUnit = timeRange === 30 ? 'DAY' : 'HOUR';
                        
                        let volumeTimeSelect = '';
                        if (timeRange === 1) {
                            volumeTimeSelect = `FORMAT_TIMESTAMP('%H:%M', TIMESTAMP_SECONDS(DIV(UNIX_SECONDS(event_time), 900) * 900))`;
                        } else {
                            volumeTimeSelect = `FORMAT_TIMESTAMP('${timeFormat}', TIMESTAMP_TRUNC(event_time, ${truncUnit}))`;
                        }

                        consolidatedQuery = `
                            WITH base_activity AS (
                              ${tableSelects.join('\nUNION ALL\n')}
                            ),
                            summary_metrics AS (
                              SELECT 
                                COUNTIF(method_name = 'StreamAssist') as total_queries,
                                COUNT(DISTINCT IF(method_name = 'StreamAssist', session_id, NULL)) as total_sessions,
                                COUNT(DISTINCT IF(method_name = 'StreamAssist' AND user_email IS NOT NULL, user_email, NULL)) as unique_users
                              FROM base_activity
                            ),
                            volume_metrics AS (
                              SELECT 
                                ${volumeTimeSelect} as event_time, 
                                COUNT(*) as requests
                              FROM base_activity
                              WHERE method_name = 'StreamAssist'
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
                                CAST(NULL AS STRING) as agent_name,
                                CAST(NULL AS STRING) as agent_id,
                                session_id
                              FROM base_activity
                              WHERE method_name = 'StreamAssist' AND session_id IS NOT NULL
                            ),
                            filled AS (
                              SELECT 
                                session_id,
                                LAST_VALUE(agent_name IGNORE NULLS) OVER (
                                  PARTITION BY user_email 
                                  ORDER BY event_time 
                                  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                                ) as resolved_agent_name,
                                LAST_VALUE(agent_id IGNORE NULLS) OVER (
                                  PARTITION BY user_email 
                                  ORDER BY event_time 
                                  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
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
                            )
                            SELECT 'summary' as metric_type, CAST(total_queries AS STRING) as label, CAST(total_sessions AS STRING) as val1, CAST(unique_users AS STRING) as val2 FROM summary_metrics
                            UNION ALL
                            SELECT 'volume' as metric_type, event_time as label, CAST(requests AS STRING) as val1, NULL as val2 FROM volume_metrics
                            UNION ALL
                            SELECT 'agent' as metric_type, agent_name as label, CAST(count AS STRING) as val1, agent_id as val2 FROM agent_metrics
                        `;

                        dashboardData.queries.summaryQuery = `
                            WITH base_activity AS (
                              ${tableSelects.join('\nUNION ALL\n')}
                            )
                            SELECT
                              COUNTIF(method_name = 'StreamAssist') as total_queries,
                              COUNT(DISTINCT IF(method_name = 'StreamAssist', session_id, NULL)) as total_sessions,
                              COUNT(DISTINCT IF(method_name = 'StreamAssist' AND user_email IS NOT NULL, user_email, NULL)) as unique_users
                            FROM base_activity
                        `;

                        dashboardData.queries.volumeQuery = `
                            WITH base_activity AS (
                              ${tableSelects.join('\nUNION ALL\n')}
                            )
                            SELECT 
                              ${volumeTimeSelect} as event_time, 
                              COUNT(*) as requests
                            FROM base_activity
                            WHERE method_name = 'StreamAssist'
                            GROUP BY event_time
                            ORDER BY event_time
                        `;

                        dashboardData.queries.agentQuery = `
                            WITH base_activity AS (
                              ${tableSelects.join('\nUNION ALL\n')}
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
                                CAST(NULL AS STRING) as agent_name,
                                CAST(NULL AS STRING) as agent_id,
                                session_id
                              FROM base_activity
                              WHERE method_name = 'StreamAssist' AND session_id IS NOT NULL
                            ),
                            filled AS (
                              SELECT 
                                session_id,
                                LAST_VALUE(agent_name IGNORE NULLS) OVER (
                                  PARTITION BY user_email 
                                  ORDER BY event_time 
                                  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                                ) as resolved_agent_name,
                                LAST_VALUE(agent_id IGNORE NULLS) OVER (
                                  PARTITION BY user_email 
                                  ORDER BY event_time 
                                  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
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
                            WITH base_activity AS (
                              ${tableSelects.join('\nUNION ALL\n')}
                            )
                            SELECT COUNT(DISTINCT IF(method_name = 'StreamAssist' AND user_email IS NOT NULL, user_email, NULL)) as unique_users
                            FROM base_activity
                        `;
                    } else {
                        consolidatedQuery = `
                            SELECT 'summary' as metric_type, '0' as label, '0' as val1, '0' as val2
                            LIMIT 0
                        `;
                        dashboardData.queries.summaryQuery = `SELECT 0 as total_queries, 0 as total_sessions, 0 as unique_users`;
                        dashboardData.queries.volumeQuery = `SELECT CAST(NULL as STRING) as event_time, 0 as requests LIMIT 0`;
                        dashboardData.queries.agentQuery = `SELECT CAST(NULL as STRING) as agent_name, CAST(NULL as STRING) as agent_id, 0 as count LIMIT 0`;
                        dashboardData.queries.userCountQuery = `SELECT 0 as unique_users`;
                    }

                    if (tableSelects.length > 0) {
                        const result = await runBigQueryQuery(projectId, consolidatedQuery);
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
                    
                    setDashboardData(dashboardData);
                }
            } catch (err: any) {
                setError(err.message || 'Failed to fetch data');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [projectNumber, projectId, timeRange]);

    const bqSinks = sinks.filter(sink => sink.destination && sink.destination.startsWith('bigquery.googleapis.com/'));
    
    const userLogSink = sinks.find((sink: any) => 
        sink.filter && (
            sink.filter.includes('discoveryengine.googleapis.com%2Fgemini_enterprise_user_activity') ||
            sink.filter.includes('discoveryengine.googleapis.com/gemini_enterprise_user_activity')
        )
    );
    const datasetId = userLogSink ? userLogSink.destination.split('/').pop() : undefined;

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
                    <h2 className="text-xl font-semibold text-white mb-4">Log Router Sinks & Tables</h2>
                    
                    {loading && (
                        <div className="flex items-center justify-center p-4 text-sm text-blue-300">
                            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-400 mr-3"></div>
                            Loading data...
                        </div>
                    )}
                    
                    {error && (
                        <div className="p-4 text-sm text-red-300 bg-red-900/30 rounded-lg border border-red-800">
                            {error}
                        </div>
                    )}
                    
                    {!loading && !error && (
                        <div className="space-y-6">
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <h3 className="text-lg font-medium text-white">BigQuery Sinks</h3>
                                    <button
                                        onClick={() => setShowAllSinks(!showAllSinks)}
                                        className="text-xs text-blue-400 hover:text-blue-300 underline"
                                    >
                                        {showAllSinks ? 'Hide Other Sinks' : 'Show All Sinks'}
                                    </button>
                                </div>
                                {bqSinks.length === 0 ? (
                                    <p className="text-gray-400 text-sm">No BigQuery log sinks found.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {bqSinks.map(sink => {
                                            const isUserLogSink = sink === userLogSink;
                                            if (!showAllSinks && !isUserLogSink) return null;
                                            
                                            return (
                                                <div key={sink.name} className={`p-3 bg-gray-900 rounded-md border ${isUserLogSink ? 'border-green-700' : 'border-gray-700'}`}>
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <span className="text-sm font-semibold text-white">{sink.name}</span>
                                                            <p className="text-xs text-gray-500 mt-0.5">Dataset: <code className="text-green-400">{sink.destination.split('/').pop()}</code></p>
                                                        </div>
                                                        {isUserLogSink && (
                                                            <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-green-900 text-green-200">User Logs</span>
                                                        )}
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

                <div className="mt-6">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-semibold text-white">Live Dashboard</h2>
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
            </div>
        </div>
    );
};

export default ObservabilityPage;
