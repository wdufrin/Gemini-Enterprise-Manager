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
                const userLogFilter = `logName="projects/${projectId}/logs/discoveryengine.googleapis.com%2Fgemini_enterprise_user_activity" OR logName=~"projects/${projectId}/logs/discoveryengine.googleapis.com%2Fgen_ai.*"`;
                const userLogSink = allSinks.find((sink: any) => 
                    sink.filter && sink.filter === userLogFilter
                );

                if (userLogSink && userLogSink.destination) {
                    const destParts = userLogSink.destination.split('/');
                    const dataset = destParts[destParts.length - 1];
                    
                    // 3. List tables in the dataset
                    const tablesResponse = await listBigQueryTables(projectNumber, dataset);
                    const allTables = tablesResponse.tables || [];
                    setTables(allTables);

                    // 4. Fetch real data for charts
                    const messageTablePrefix = `${projectId}.${dataset}.v_consolidated_user_messages`;
                    const activityTablePrefix = `${projectId}.${dataset}.v_consolidated_user_activity`;
                    
                    // Calculate start time based on timeRange
                    const startTime = new Date();
                    startTime.setDate(startTime.getDate() - timeRange);
                    const startTimeStr = startTime.toISOString();
                    
                    // Query 1: Messages by Role (with fix for mixed data types)
                    const roleQuery = `
                        SELECT 
                          jsonPayload.content.role as role, 
                          COUNT(*) as count
                        FROM \`${messageTablePrefix}\`
                        WHERE jsonPayload.content.role IS NOT NULL
                          AND timestamp >= TIMESTAMP('${startTimeStr}')
                        GROUP BY role
                    `;
                    
                    // Query 2: Request Volume
                    let volumeQuery = '';
                    if (timeRange === 30) {
                        volumeQuery = `
                            SELECT 
                                FORMAT_TIMESTAMP('%Y-%m-%d', TIMESTAMP_TRUNC(timestamp, DAY)) as event_time, 
                                COUNT(*) as requests
                            FROM (
                              SELECT timestamp FROM \`${messageTablePrefix}\` WHERE timestamp >= TIMESTAMP('${startTimeStr}')
                              UNION ALL
                              SELECT timestamp FROM \`${activityTablePrefix}\` WHERE timestamp >= TIMESTAMP('${startTimeStr}')
                            )
                            GROUP BY event_time
                            ORDER BY event_time
                        `;
                    } else if (timeRange === 7) {
                        volumeQuery = `
                            SELECT 
                                FORMAT_TIMESTAMP('%m-%d %H:00', TIMESTAMP_TRUNC(timestamp, HOUR)) as event_time, 
                                COUNT(*) as requests
                            FROM (
                              SELECT timestamp FROM \`${messageTablePrefix}\` WHERE timestamp >= TIMESTAMP('${startTimeStr}')
                              UNION ALL
                              SELECT timestamp FROM \`${activityTablePrefix}\` WHERE timestamp >= TIMESTAMP('${startTimeStr}')
                            )
                            GROUP BY event_time
                            ORDER BY event_time
                        `;
                    } else { // 1 day
                        volumeQuery = `
                            SELECT 
                                FORMAT_TIMESTAMP('%H:%M', TIMESTAMP_SECONDS(DIV(UNIX_SECONDS(timestamp), 900) * 900)) as event_time, 
                                COUNT(*) as requests
                            FROM (
                              SELECT timestamp FROM \`${messageTablePrefix}\` WHERE timestamp >= TIMESTAMP('${startTimeStr}')
                              UNION ALL
                              SELECT timestamp FROM \`${activityTablePrefix}\` WHERE timestamp >= TIMESTAMP('${startTimeStr}')
                            )
                            GROUP BY event_time
                            ORDER BY event_time
                        `;
                    }
                    
                    // Query 3: Combined Agent Breakdown
                    const agentQuery = `
                        WITH all_agents AS (
                          SELECT 
                            resource.labels.agent_id as agent_id,
                            resource.labels.agent_id as agent_name
                          FROM \`${messageTablePrefix}\`
                          WHERE resource.labels.agent_id IS NOT NULL AND timestamp >= TIMESTAMP('${startTimeStr}')
                          UNION ALL
                          SELECT 
                            COALESCE(REGEXP_EXTRACT(jsonPayload.request.agent.name, r'agents/([^/]+)'), jsonPayload.request.agent.name) as agent_id,
                            COALESCE(
                              jsonPayload.request.agent.displayname,
                              jsonPayload.request.agent.displayName,
                              jsonPayload.response.displayname,
                              jsonPayload.response.displayName,
                              REGEXP_EXTRACT(jsonPayload.request.agent.name, r'agents/([^/]+)'),
                              jsonPayload.request.agent.name
                            ) as agent_name
                          FROM \`${activityTablePrefix}\`
                          WHERE (jsonPayload.request.agent.name IS NOT NULL OR jsonPayload.request.agent.displayname IS NOT NULL) AND timestamp >= TIMESTAMP('${startTimeStr}')
                        ),
                        agent_real_names AS (
                          SELECT agent_id, MAX(agent_name) as real_name
                          FROM all_agents
                          WHERE agent_name != agent_id
                          GROUP BY agent_id
                        )
                        SELECT 
                          COALESCE(n.real_name, a.agent_name) as agent_name, 
                          a.agent_id, 
                          COUNT(*) as count
                        FROM all_agents a
                        LEFT JOIN agent_real_names n ON a.agent_id = n.agent_id
                        WHERE a.agent_name IS NOT NULL
                        GROUP BY agent_name, a.agent_id
                        ORDER BY count DESC
                    `;

                    // Query 4: Summary Metrics
                    const summaryQuery = `
                        WITH all_activity AS (
                          SELECT trace AS session_id, insertId AS request_id
                          FROM \`${messageTablePrefix}\`
                          WHERE timestamp >= TIMESTAMP('${startTimeStr}')
                          UNION ALL
                          SELECT COALESCE(jsonPayload.request.userevent.userpseudoid, trace) AS session_id, insertId AS request_id
                          FROM \`${activityTablePrefix}\`
                          WHERE timestamp >= TIMESTAMP('${startTimeStr}')
                        )
                        SELECT
                          COUNT(request_id) AS total_requests
                        FROM all_activity
                    `;

                    // Query 5: True Unique Users
                    const userCountQuery = `
                        SELECT COUNT(DISTINCT jsonPayload.useriamprincipal) as unique_users
                        FROM \`${activityTablePrefix}\`
                        WHERE jsonPayload.useriamprincipal IS NOT NULL AND timestamp >= TIMESTAMP('${startTimeStr}')
                    `;

                    const [roleResult, volumeResult, agentResult, summaryResult, userCountResult] = await Promise.all([
                        runBigQueryQuery(projectId, roleQuery),
                        runBigQueryQuery(projectId, volumeQuery),
                        runBigQueryQuery(projectId, agentQuery),
                        runBigQueryQuery(projectId, summaryQuery),
                        runBigQueryQuery(projectId, userCountQuery)
                    ]);

                    const newData: any = {};

                    if (roleResult && roleResult.rows) {
                        newData.roleData = roleResult.rows.map((row: any) => ({
                            name: row.f[0].v,
                            value: parseInt(row.f[1].v, 10)
                        }));
                    }

                    if (volumeResult && volumeResult.rows) {
                        newData.volumeData = volumeResult.rows.map((row: any) => ({
                            time: row.f[0].v,
                            requests: parseInt(row.f[1].v, 10),
                            errors: 0
                        }));
                    }

                    if (agentResult && agentResult.rows) {
                        newData.agentData = agentResult.rows.map((row: any) => {
                            const name = row.f[0].v;
                            const id = row.f[1].v;
                            const truncatedName = name.length > 20 ? name.substring(0, 20) + '...' : name;
                            return {
                                name: `${truncatedName}|${id}`,
                                count: parseInt(row.f[2].v, 10)
                            };
                        });
                    }

                    if (summaryResult && summaryResult.rows && summaryResult.rows[0]) {
                        newData.totalRequests = parseInt(summaryResult.rows[0].f[0].v, 10);
                    }

                    if (userCountResult && userCountResult.rows && userCountResult.rows[0]) {
                        newData.uniqueUsers = parseInt(userCountResult.rows[0].f[0].v, 10);
                    }

                    newData.queries = { roleQuery, volumeQuery, agentQuery, summaryQuery, userCountQuery };
                    setDashboardData(newData);
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
    
    const userLogFilter = `logName="projects/${projectId}/logs/discoveryengine.googleapis.com%2Fgemini_enterprise_user_activity" OR logName=~"projects/${projectId}/logs/discoveryengine.googleapis.com%2Fgen_ai.*"`;
    const userLogSink = sinks.find((sink: any) => 
        sink.filter && sink.filter === userLogFilter
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
