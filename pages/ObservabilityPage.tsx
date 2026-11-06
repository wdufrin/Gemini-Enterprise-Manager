import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import CloudConsoleButton from '../components/CloudConsoleButton';
import { listLoggingSinks, listBigQueryTables, runBigQueryQuery, gapiRequest, LoggingSink, BigQueryTable, BigQueryQueryResponse } from '../services/apiService';
import ObservabilityDashboard from '../components/dashboard/ObservabilityDashboard';
import { OperationalAnalyticsDashboard } from '../components/dashboard/operational/OperationalAnalyticsDashboard';
import { ObservabilityDataDictionaryModal } from '../components/dashboard/operational/ObservabilityDataDictionaryModal';
import { AgentObservabilityPolicyModal } from '../components/dashboard/operational/AgentObservabilityPolicyModal';
import { useToast } from '../context/ToastContext';
import { toErrorMessage } from '../utils/errors';
import { Config } from '../types';
import {
    ACCELERATION_TABLE_ID,
    ACTIVITY_PROJECTION_SQL,
    buildAcceleratedActivitySelect,
    buildRawActivitySelect,
    disableAcceleration,
    enableAcceleration,
    getAccelerationWatermark,
    refreshAcceleration,
    selectActivityTablesSince,
} from '../services/observabilityAcceleration';
import { ObservabilityAccelerationPanel, AccelerationBusyState } from '../components/dashboard/ObservabilityAccelerationPanel';

function useSafeToast() {
    try {
        return useToast();
    } catch (err) {
        return {
            toast: {
                success: (_msg: string) => void err,
                error: (_msg: string) => void err,
                warning: (_msg: string) => void err,
                info: (_msg: string) => void err,
            },
            addToast: () => undefined,
            removeToast: () => undefined,
        };
    }
}

interface Props {
    projectNumber?: string;
    projectId?: string;
    config?: Config;
}

interface ObservabilityDashboardMetrics {
    volumeData: { time: string; requests: number; errors: number }[];
    latencyData?: { date: string; rawDate?: string; p50: number | null; p95: number | null; count?: number }[];
    agentData: { name: string; id?: string; count: number; avgLatency?: number; p50?: number; p95?: number }[];
    totalRequests: number;
    totalSessions: number;
    uniqueUsers: number;
    uniqueAgents?: number;
    p50LatencyMs?: number;
    p95LatencyMs?: number;
    queries: Record<string, string>;
}

const ObservabilityPage: React.FC<Props> = ({ projectNumber: propProjectNumber, projectId: propProjectId, config }) => {
    const projectNumber = propProjectNumber || config?.projectId || '';
    const projectId = propProjectId || config?.projectId || projectNumber;
    const { toast } = useSafeToast();
    const [sinks, setSinks] = useState<LoggingSink[]>([]);
    const [tables, setTables] = useState<BigQueryTable[]>([]);
    const [dashboardData, setDashboardData] = useState<ObservabilityDashboardMetrics | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [timeRange, setTimeRange] = useState(1);
    const [activeDashboardTab, setActiveDashboardTab] = useState<'live' | 'operational' | 'policy'>(() => {
        if (typeof window !== 'undefined' && (window.location.hash.includes('view=') || window.location.search.includes('view='))) {
            return 'operational';
        }
        return 'live';
    });
    const [selectedSinkName, setSelectedSinkName] = useState<string | null>(null);
    const [sinksLoading, setSinksLoading] = useState(false);
    const [queryLoading, setQueryLoading] = useState(false);
    const [showDataDictionary, setShowDataDictionary] = useState(false);
    const [showPolicyModal, setShowPolicyModal] = useState(false);
    const [isTablesExpanded, setIsTablesExpanded] = useState(false);
    const [isSinksExpanded, setIsSinksExpanded] = useState(true);

    const queryCache = useRef<Map<string, ObservabilityDashboardMetrics>>(new Map());

    // High-scale acceleration (opt-in, manual refresh only)
    const [accelerationWatermark, setAccelerationWatermark] = useState<Date | null>(null);
    const [accelerationBusy, setAccelerationBusy] = useState<AccelerationBusyState>(null);
    const accelerationBusyRef = useRef(false);
    const [accelerationError, setAccelerationError] = useState<string | null>(null);
    const [accelerationLastInserted, setAccelerationLastInserted] = useState<number | null>(null);
    const [accelerationVersion, setAccelerationVersion] = useState(0);
    const [accelerationWindowStart, setAccelerationWindowStart] = useState<Date | null>(null);

    // 1. Fetch Log Router Sinks (only on mount / projectNumber change)
    useEffect(() => {
        if (!projectNumber) {
            setSinks([]);
            setSelectedSinkName(null);
            return;
        }
        setSinks([]);
        setSelectedSinkName(null);
        let isCurrent = true;
        const fetchSinks = async () => {
            setSinksLoading(true);
            setError(null);
            try {
                const sinksResponse = await listLoggingSinks(projectNumber);
                if (isCurrent) setSinks(sinksResponse.sinks || []);
            } catch (err: unknown) {
                if (isCurrent) setError(toErrorMessage(err));
            } finally {
                if (isCurrent) setSinksLoading(false);
            }
        };
        fetchSinks();
        return () => { isCurrent = false; };
    }, [projectNumber]);

    const bqSinks = useMemo(() => {
        return sinks.filter(sink => sink.destination && sink.destination.startsWith('bigquery.googleapis.com/'));
    }, [sinks]);
    
    const preferredSink = useMemo(() => {
        if (!bqSinks.length) return undefined;

        // 1. Highest Priority: Sink whose filter captures all 4 core tables (gen_ai.* AND user_activity)
        const core4Sink = bqSinks.find((sink: LoggingSink) => {
            const f = sink.filter || '';
            const hasGenAi = f.includes('gen_ai');
            const hasUserActivity = f.includes('gemini_enterprise_user_activity') || f.includes('user_activity');
            return hasGenAi && hasUserActivity;
        });
        if (core4Sink) return core4Sink;

        // 2. Priority: Sink with user_activity that is not solely restricted to Search
        const nonSearchActivitySink = bqSinks.find((sink: LoggingSink) => {
            const f = sink.filter || '';
            const hasUserActivity = f.includes('gemini_enterprise_user_activity') || f.includes('user_activity');
            const isSolelySearch = /methodName\s*=\s*"Search"/i.test(f) && !/\b(NOT|OR)\b/i.test(f) && !f.includes('!=');
            return hasUserActivity && !isSolelySearch;
        });
        if (nonSearchActivitySink) return nonSearchActivitySink;

        // 3. Catch-all sink (empty filter exports all project logs including all 4 core tables)
        const catchAllSink = bqSinks.find((sink: LoggingSink) => !(sink.filter || '').trim());
        if (catchAllSink) return catchAllSink;

        // 4. Any sink matching user activity
        const anyActivitySink = bqSinks.find((sink: LoggingSink) => {
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
            } catch (err: unknown) {
                if (isCurrent) {
                    console.error('Failed to fetch tables:', err);
                    setError(`Failed to fetch BigQuery tables: ${toErrorMessage(err)}`);
                }
            }
        };
        fetchTables();
        return () => {
            isCurrent = false;
        };
    }, [projectNumber, projectId, datasetId]);

    const effectiveProjectId = projectId || projectNumber;

    // 3. Query Dashboard Metrics (optimized query with subquery JSON serialization & in-memory caching)
    useEffect(() => {
        if (!effectiveProjectId || !datasetId || tables.length === 0) {
            setDashboardData(null);
            return;
        }

        const accelerationEnabled = tables.some((t: BigQueryTable) => t.tableReference?.tableId === ACCELERATION_TABLE_ID);
        const cacheKey = `${effectiveProjectId}:${datasetId}:${timeRange}:accel=${accelerationEnabled ? accelerationVersion : 'off'}`;
        if (queryCache.current.has(cacheKey)) {
            setDashboardData(queryCache.current.get(cacheKey)!);
            return;
        }
        
        setDashboardData(null);

        const abortController = new AbortController();

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

                // Accelerated read (when enabled and non-empty): activity comes ONLY from the small
                // pre-extracted table, so charts include events up to the last manual Refresh.
                // A combined accelerated + raw read was measured at 26-44s purely in BigQuery query
                // preparation (80k-user benchmark), vs 3-9s accelerated-only, so it is not used.
                let watermark: Date | null = null;
                if (accelerationEnabled) {
                    try {
                        watermark = await getAccelerationWatermark(effectiveProjectId, datasetId);
                        setAccelerationError(null);
                    } catch (accelErr: unknown) {
                        // Not silent: the panel shows this, and the dashboard reads raw logs instead.
                        setAccelerationError(`${toErrorMessage(accelErr)} — showing data from raw logs instead.`);
                        watermark = null;
                    }
                    if (abortController.signal.aborted) return;
                }
                setAccelerationWatermark(watermark);
                setAccelerationWindowStart(startTime);
                const useAccelerated = watermark !== null;
                const watermarkIso = watermark ? watermark.toISOString() : null;

                const matchingActivityTables = useAccelerated
                    ? []
                    : selectActivityTablesSince(
                          tables.map((t: BigQueryTable) => t.tableReference?.tableId || ''),
                          startTime
                      );

                const matchingGenAiTraceTables = tables
                    .map((t: BigQueryTable) => t.tableReference?.tableId || '')
                    .filter((id: string) => {
                        if (id.startsWith('v_')) return false;
                        const tracePrefixes = [
                            'discoveryengine_googleapis_com_gen_ai_user_message',
                            'discoveryengine_googleapis_com_gen_ai_choice',
                            'discoveryengine_googleapis_com_gen_ai_client_inference_operation_details'
                        ];
                        for (const prefix of tracePrefixes) {
                            if (id === prefix) return true;
                            if (id.startsWith(`${prefix}_`)) {
                                const datePart = id.split('_').pop()!;
                                return /^\d{8}$/.test(datePart) ? datePart >= suffixStart : false;
                            }
                        }
                        return false;
                    });

                const dashboardData: ObservabilityDashboardMetrics = {
                    volumeData: [],
                    latencyData: [],
                    agentData: [],
                    totalRequests: 0,
                    totalSessions: 0,
                    uniqueUsers: 0,
                    queries: {}
                };

                if (matchingActivityTables.length > 0 || useAccelerated) {
                    const timeFormat = timeRange === 30 ? '%Y-%m-%d' : (timeRange === 7 ? '%Y-%m-%d %H:00' : '%Y-%m-%d %H:%M');
                    const truncUnit = timeRange === 30 ? 'DAY' : 'HOUR';
                    
                    let volumeTimeSelect = '';
                    if (timeRange === 1) {
                        volumeTimeSelect = `FORMAT_TIMESTAMP('%Y-%m-%d %H:%M', TIMESTAMP_SECONDS(DIV(UNIX_SECONDS(event_time), 900) * 900))`;
                    } else {
                        volumeTimeSelect = `FORMAT_TIMESTAMP('${timeFormat}', TIMESTAMP_TRUNC(event_time, ${truncUnit}))`;
                    }

                    // Raw table union with early column filtering. jsonPayload is serialized once per
                    // row in the inner SELECT; the method filter reuses `jp`.
                    const tableSelects = matchingActivityTables.map((t: string) =>
                        buildRawActivitySelect(effectiveProjectId, datasetId, t, startTimeStr)
                    );
                    const baseActivityParts: string[] = [];
                    if (useAccelerated) {
                        baseActivityParts.push(buildAcceleratedActivitySelect(effectiveProjectId, datasetId, startTimeStr));
                    } else if (tableSelects.length > 0) {
                        baseActivityParts.push(`SELECT ${ACTIVITY_PROJECTION_SQL}\n                        FROM raw_activity`);
                    }

                    const extraTraceSelects = matchingGenAiTraceTables.map((t: string) => `
                      SELECT
                        trace,
                        timestamp as event_time,
                        TRUE AS is_end_span
                      FROM \`${effectiveProjectId}.${datasetId}.${t}\`
                      WHERE timestamp >= TIMESTAMP('${startTimeStr}')${
                          // Keep latency spans aligned with the accelerated activity cutoff so traces
                          // newer than the last Refresh don't appear in latency without their queries.
                          watermarkIso ? `\n                        AND timestamp <= TIMESTAMP('${watermarkIso}')` : ''
                      }
                        AND trace IS NOT NULL AND trace != ''
                    `);

                    const traceSpansUnion = [
                        `SELECT trace, event_time, (method_name IN ('StreamAssist', 'Assist', 'Search')) AS is_end_span FROM base_activity WHERE trace IS NOT NULL AND trace != ''`,
                        ...extraTraceSelects
                    ].join('\nUNION ALL\n');

                    const baseActivityCTE = `
                      ${tableSelects.length > 0 ? `raw_activity AS (
                        ${tableSelects.join('\nUNION ALL\n')}
                      ),` : ''}
                      base_activity AS (
                        ${baseActivityParts.join('\nUNION ALL\n')}
                      ),
                      trace_spans AS (
                        ${traceSpansUnion}
                      ),
                      trace_latencies AS (
                        SELECT
                          trace,
                          MIN(event_time) as trace_time,
                          TIMESTAMP_DIFF(
                            MAX(IF(is_end_span, event_time, NULL)),
                            MIN(event_time),
                            MILLISECOND
                          ) as latency_ms
                        FROM trace_spans
                        GROUP BY trace
                        HAVING latency_ms > 0 AND latency_ms < 600000
                      )
                    `;

                    const agentAttributionAndMetricsCTE = `
                      combined AS (
                        SELECT 
                          user_email,
                          event_time,
                          agent_name,
                          agent_id,
                          CAST(NULL AS STRING) as session_id,
                          trace,
                          method_name
                        FROM base_activity
                        WHERE method_name = 'WriteUserEvent' AND (agent_name IS NOT NULL OR agent_id IS NOT NULL) AND trace IS NOT NULL AND trace != ''

                        UNION ALL

                        SELECT 
                          user_email,
                          event_time,
                          agent_name,
                          agent_id,
                          session_id,
                          trace,
                          method_name
                        FROM base_activity
                        WHERE method_name IN ('StreamAssist', 'Assist', 'Search') AND session_id IS NOT NULL
                      ),
                      filled AS (
                        SELECT 
                          session_id,
                          trace,
                          method_name,
                          IF(
                            method_name = 'Search',
                            agent_name,
                            COALESCE(
                              agent_name,
                              IF(
                                trace IS NOT NULL AND trace != '',
                                COALESCE(
                                  LAST_VALUE(IF(method_name != 'Search', agent_name, NULL) IGNORE NULLS) OVER (
                                    PARTITION BY trace
                                    ORDER BY event_time
                                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                                  ),
                                  LAST_VALUE(IF(method_name != 'Search', agent_name, NULL) IGNORE NULLS) OVER (
                                    PARTITION BY trace
                                    ORDER BY event_time
                                    ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
                                  )
                                ),
                                NULL
                              )
                            )
                          ) as resolved_agent_name,
                          IF(
                            method_name = 'Search',
                            agent_id,
                            COALESCE(
                              agent_id,
                              IF(
                                trace IS NOT NULL AND trace != '',
                                COALESCE(
                                  LAST_VALUE(IF(method_name != 'Search', agent_id, NULL) IGNORE NULLS) OVER (
                                    PARTITION BY trace
                                    ORDER BY event_time
                                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                                  ),
                                  LAST_VALUE(IF(method_name != 'Search', agent_id, NULL) IGNORE NULLS) OVER (
                                    PARTITION BY trace
                                    ORDER BY event_time
                                    ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
                                  )
                                ),
                                NULL
                              )
                            )
                          ) as resolved_agent_id
                        FROM combined
                      ),
                      mapped_agents AS (
                        SELECT 
                          COALESCE(resolved_agent_name, 'Global Assistant / Default') as agent_name,
                          COALESCE(resolved_agent_id, 'default') as agent_id,
                          trace
                        FROM filled
                        WHERE session_id IS NOT NULL
                      ),
                      distinct_agent_traces AS (
                        SELECT DISTINCT
                          m.agent_name,
                          m.agent_id,
                          m.trace,
                          tl.latency_ms
                        FROM mapped_agents m
                        INNER JOIN trace_latencies tl ON m.trace = tl.trace
                      ),
                      agent_trace_stats AS (
                        SELECT
                          agent_name,
                          agent_id,
                          CAST(ROUND(AVG(latency_ms)) AS INT64) as avg_latency_ms,
                          CAST(ROUND(APPROX_QUANTILES(latency_ms, 100)[OFFSET(50)]) AS INT64) as p50_latency_ms,
                          CAST(ROUND(APPROX_QUANTILES(latency_ms, 100)[OFFSET(95)]) AS INT64) as p95_latency_ms
                        FROM distinct_agent_traces
                        GROUP BY agent_name, agent_id
                      ),
                      agent_metrics AS (
                        SELECT 
                          m.agent_name,
                          m.agent_id,
                          COUNT(*) as count,
                          ats.avg_latency_ms,
                          ats.p50_latency_ms,
                          ats.p95_latency_ms
                        FROM mapped_agents m
                        LEFT JOIN agent_trace_stats ats
                          ON m.agent_name = ats.agent_name AND m.agent_id = ats.agent_id
                        GROUP BY m.agent_name, m.agent_id, ats.avg_latency_ms, ats.p50_latency_ms, ats.p95_latency_ms
                        ORDER BY count DESC
                      )
                    `;

                    const consolidatedQuery = `
                      WITH ${baseActivityCTE},
                      summary_metrics AS (
                        SELECT 
                          COUNTIF(method_name IN ('StreamAssist', 'Assist', 'Search')) as total_queries,
                          COUNT(DISTINCT IF(method_name IN ('StreamAssist', 'Assist', 'Search'), session_id, NULL)) as total_sessions,
                          COUNT(DISTINCT IF(method_name IN ('StreamAssist', 'Assist', 'Search') AND user_email IS NOT NULL, user_email, NULL)) as unique_users,
                          (SELECT CAST(ROUND(APPROX_QUANTILES(latency_ms, 100)[OFFSET(50)]) AS INT64) FROM trace_latencies) as p50_latency_ms,
                          (SELECT CAST(ROUND(APPROX_QUANTILES(latency_ms, 100)[OFFSET(95)]) AS INT64) FROM trace_latencies) as p95_latency_ms
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
                      latency_timeseries AS (
                        SELECT
                          FORMAT_TIMESTAMP('%Y-%m-%d', TIMESTAMP_TRUNC(trace_time, DAY)) as event_day,
                          CAST(ROUND(APPROX_QUANTILES(latency_ms, 100)[OFFSET(50)]) AS INT64) as p50_latency_ms,
                          CAST(ROUND(APPROX_QUANTILES(latency_ms, 100)[OFFSET(95)]) AS INT64) as p95_latency_ms,
                          COUNT(*) as trace_count
                        FROM trace_latencies
                        GROUP BY event_day
                      ),
                      ${agentAttributionAndMetricsCTE}
                      SELECT 'summary' as metric_type, CAST(total_queries AS STRING) as label, CAST(total_sessions AS STRING) as val1, CAST(unique_users AS STRING) as val2, CAST(p50_latency_ms AS STRING) as val3, CAST(p95_latency_ms AS STRING) as val4, CAST(NULL AS STRING) as val5 FROM summary_metrics
                      UNION ALL
                      SELECT 'volume' as metric_type, event_time as label, CAST(requests AS STRING) as val1, NULL as val2, CAST(NULL AS STRING) as val3, CAST(NULL AS STRING) as val4, CAST(NULL AS STRING) as val5 FROM volume_metrics
                      UNION ALL
                      SELECT 'latency_daily' as metric_type, event_day as label, CAST(p50_latency_ms AS STRING) as val1, CAST(p95_latency_ms AS STRING) as val2, CAST(trace_count AS STRING) as val3, CAST(NULL AS STRING) as val4, CAST(NULL AS STRING) as val5 FROM latency_timeseries
                      UNION ALL
                      SELECT 'agent' as metric_type, agent_name as label, CAST(count AS STRING) as val1, agent_id as val2, CAST(avg_latency_ms AS STRING) as val3, CAST(p50_latency_ms AS STRING) as val4, CAST(p95_latency_ms AS STRING) as val5 FROM agent_metrics
                    `;

                    dashboardData.queries.summaryQuery = `
                        WITH ${baseActivityCTE}
                        SELECT
                          COUNTIF(method_name IN ('StreamAssist', 'Assist', 'Search')) as total_queries,
                          COUNT(DISTINCT IF(method_name IN ('StreamAssist', 'Assist', 'Search'), session_id, NULL)) as total_sessions,
                          COUNT(DISTINCT IF(method_name IN ('StreamAssist', 'Assist', 'Search') AND user_email IS NOT NULL, user_email, NULL)) as unique_users,
                          (SELECT CAST(ROUND(APPROX_QUANTILES(latency_ms, 100)[OFFSET(50)]) AS INT64) FROM trace_latencies) as p50_latency_ms,
                          (SELECT CAST(ROUND(APPROX_QUANTILES(latency_ms, 100)[OFFSET(95)]) AS INT64) FROM trace_latencies) as p95_latency_ms
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

                    dashboardData.queries.latencyQuery = `
                        WITH ${baseActivityCTE}
                        SELECT
                          FORMAT_TIMESTAMP('%Y-%m-%d', TIMESTAMP_TRUNC(trace_time, DAY)) as event_day,
                          CAST(ROUND(APPROX_QUANTILES(latency_ms, 100)[OFFSET(50)]) AS INT64) as p50_latency_ms,
                          CAST(ROUND(APPROX_QUANTILES(latency_ms, 100)[OFFSET(95)]) AS INT64) as p95_latency_ms,
                          COUNT(*) as trace_count
                        FROM trace_latencies
                        GROUP BY event_day
                        ORDER BY event_day
                    `;

                    dashboardData.queries.agentQuery = `
                        WITH ${baseActivityCTE},
                        ${agentAttributionAndMetricsCTE}
                        SELECT * FROM agent_metrics
                    `;

                    dashboardData.queries.userCountQuery = `
                        WITH ${baseActivityCTE}
                        SELECT COUNT(DISTINCT IF(method_name IN ('StreamAssist', 'Assist', 'Search') AND user_email IS NOT NULL, user_email, NULL)) as unique_users
                        FROM base_activity
                    `;

                    let result = await runBigQueryQuery(effectiveProjectId, consolidatedQuery, true);

                    if (result.error || (result.errors && result.errors.length > 0)) {
                        throw new Error(result.error?.message || result.errors?.[0]?.message || 'BigQuery query failed');
                    }

                    let attempt = 0;
                    while (result.jobComplete === false && attempt < 30) {
                        if (abortController.signal.aborted) return;
                        
                        await new Promise(r => setTimeout(r, 1500));
                        if (abortController.signal.aborted) return;
                        
                        const { jobId, location } = result.jobReference ?? {};
                        if (!jobId) {
                            // Without a job reference there is nothing to poll.
                            // Say so rather than falling through and rendering zeros.
                            throw new Error(
                                'BigQuery reported the query as incomplete but returned no job reference to poll.'
                            );
                        }
                        const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${effectiveProjectId}/queries/${jobId}${location ? `?location=${encodeURIComponent(location)}` : ''}`;
                        result = await gapiRequest<BigQueryQueryResponse>(url, 'GET', effectiveProjectId, undefined, undefined, undefined, true);
                        
                        if (result.error || (result.errors && result.errors.length > 0)) {
                            throw new Error(result.error?.message || result.errors?.[0]?.message || 'BigQuery polling failed');
                        }
                        
                        attempt++;
                    }

                    if (result.jobComplete === false) {
                        throw new Error("BigQuery query timed out after multiple polling attempts.");
                    }

                    const rows = result?.rows || [];
                    const latencyByDay = new Map<string, { p50: number | null; p95: number | null; count: number }>();
                    const rawVolumePoints: Array<{ sortKey: string; time: string; requests: number; errors: number }> = [];

                    rows.forEach((row) => {
                        const type = String(row.f?.[0]?.v ?? '');
                        const label = String(row.f?.[1]?.v ?? '');
                        const val1 = String(row.f?.[2]?.v ?? '');
                        const val2 = String(row.f?.[3]?.v ?? '');
                        const val3 = row.f?.[4]?.v;
                        const val4 = row.f?.[5]?.v;
                        const val5 = row.f?.[6]?.v;

                        if (type === 'summary') {
                            dashboardData.totalRequests = parseInt(label, 10);
                            dashboardData.totalSessions = parseInt(val1, 10);
                            dashboardData.uniqueUsers = parseInt(val2, 10);
                            if (val3 != null && val3 !== '' && !Number.isNaN(Number(val3))) {
                                dashboardData.p50LatencyMs = parseInt(String(val3), 10);
                            }
                            if (val4 != null && val4 !== '' && !Number.isNaN(Number(val4))) {
                                dashboardData.p95LatencyMs = parseInt(String(val4), 10);
                            }
                        } else if (type === 'volume') {
                            let displayTime = label;
                            if (timeRange === 1 && /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(label)) {
                                displayTime = label.slice(-5);
                            } else if (timeRange === 7 && /^\d{4}-\d{2}-\d{2}\s+/.test(label)) {
                                displayTime = label.slice(5);
                            }
                            rawVolumePoints.push({
                                sortKey: label,
                                time: displayTime,
                                requests: parseInt(val1, 10),
                                errors: 0
                            });
                        } else if (type === 'latency_daily') {
                            if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
                                const parsedP50 = val1 !== '' && !Number.isNaN(Number(val1)) ? parseInt(val1, 10) : null;
                                const parsedP95 = val2 !== '' && !Number.isNaN(Number(val2)) ? parseInt(val2, 10) : null;
                                const parsedCount = val3 != null && val3 !== '' && !Number.isNaN(Number(val3)) ? parseInt(String(val3), 10) : 0;
                                if (parsedP50 !== null || parsedP95 !== null) {
                                    latencyByDay.set(label, {
                                        p50: parsedP50,
                                        p95: parsedP95,
                                        count: parsedCount
                                    });
                                }
                            }
                        } else if (type === 'agent') {
                            const avgLat = val3 != null && val3 !== '' && !Number.isNaN(Number(val3)) ? parseInt(String(val3), 10) : undefined;
                            const p50Lat = val4 != null && val4 !== '' && !Number.isNaN(Number(val4)) ? parseInt(String(val4), 10) : undefined;
                            const p95Lat = val5 != null && val5 !== '' && !Number.isNaN(Number(val5)) ? parseInt(String(val5), 10) : undefined;
                            dashboardData.agentData.push({
                                name: label,
                                id: val2,
                                count: parseInt(val1, 10),
                                ...(avgLat !== undefined ? { avgLatency: avgLat } : {}),
                                ...(p50Lat !== undefined ? { p50: p50Lat } : {}),
                                ...(p95Lat !== undefined ? { p95: p95Lat } : {})
                            });
                        }
                    });

                    // Ensure volumeData is chronologically ordered by full timestamp key
                    rawVolumePoints.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
                    const timeCounts = new Map<string, number>();
                    for (const pt of rawVolumePoints) {
                        timeCounts.set(pt.time, (timeCounts.get(pt.time) || 0) + 1);
                    }
                    const seenDuplicateTimes = new Set<string>();
                    dashboardData.volumeData = rawVolumePoints.map(({ sortKey, time, requests, errors }) => {
                        let resolvedTime = time;
                        if ((timeCounts.get(time) || 0) > 1 && !seenDuplicateTimes.has(time) && /^\d{4}-\d{2}-\d{2}\s+/.test(sortKey)) {
                            seenDuplicateTimes.add(time);
                            resolvedTime = sortKey.slice(5);
                        }
                        return {
                            time: resolvedTime,
                            requests,
                            errors
                        };
                    });

                    // Build daily spine spanning the selected timeRange duration without fabricating points or coercing missing days to 0
                    if (latencyByDay.size > 0) {
                        const spineDates = new Set<string>();
                        const anchorNow = new Date();
                        for (let i = Math.max(1, timeRange) - 1; i >= 0; i--) {
                            const d = new Date(anchorNow);
                            d.setUTCDate(d.getUTCDate() - i);
                            spineDates.add(d.toISOString().slice(0, 10));
                        }
                        for (const dayKey of latencyByDay.keys()) {
                            spineDates.add(dayKey);
                        }
                        const orderedDays = Array.from(spineDates)
                            .sort((a, b) => a.localeCompare(b))
                            .slice(-Math.max(1, timeRange));
                        dashboardData.latencyData = orderedDays.map((isoDay) => {
                            const match = latencyByDay.get(isoDay);
                            return {
                                date: isoDay.slice(5),
                                rawDate: isoDay,
                                p50: match?.p50 ?? null,
                                p95: match?.p95 ?? null,
                                count: match?.count ?? 0
                            };
                        });
                    }

                    dashboardData.uniqueAgents = dashboardData.agentData.length;
                }

                if (abortController.signal.aborted) return;
                queryCache.current.set(cacheKey, dashboardData);
                setDashboardData(dashboardData);
            } catch (err: unknown) {
                if (abortController.signal.aborted) return;
                setError(toErrorMessage(err));
            } finally {
                if (!abortController.signal.aborted) setQueryLoading(false);
            }
        };

        runQuery();
        return () => abortController.abort();
    }, [effectiveProjectId, datasetId, timeRange, tables, accelerationVersion]);

    const refreshTables = useCallback(async () => {
        if ((!projectId && !projectNumber) || !datasetId) return;
        try {
            queryCache.current.clear();
            const tablesResponse = await listBigQueryTables(projectId || projectNumber, datasetId);
            setTables(tablesResponse.tables || []);
            toast.success('BigQuery tables refreshed successfully.');
        } catch (e) {
            console.error('Failed to refresh tables:', e);
            toast.error(`Failed to refresh BigQuery tables: ${toErrorMessage(e)}`);
        }
    }, [projectId, projectNumber, datasetId, toast]);

    const isAccelerationEnabled = useMemo(
        () => tables.some((t: BigQueryTable) => t.tableReference?.tableId === ACCELERATION_TABLE_ID),
        [tables]
    );

    // All acceleration actions are user-initiated. The ref blocks a second click (or a second
    // action) before React re-renders the disabled button.
    const runAccelerationAction = useCallback(
        async (kind: Exclude<AccelerationBusyState, null>) => {
            if (accelerationBusyRef.current || !datasetId || !effectiveProjectId) return;
            accelerationBusyRef.current = true;
            setAccelerationBusy(kind);
            setAccelerationError(null);
            try {
                const tableIds = tables.map((t: BigQueryTable) => t.tableReference?.tableId || '');
                if (kind === 'disabling') {
                    await disableAcceleration(effectiveProjectId, datasetId);
                    setAccelerationLastInserted(null);
                    setAccelerationWatermark(null);
                } else {
                    const result =
                        kind === 'enabling'
                            ? await enableAcceleration(effectiveProjectId, datasetId, tableIds)
                            : await refreshAcceleration(effectiveProjectId, datasetId, tableIds);
                    setAccelerationLastInserted(result.insertedRows);
                    setAccelerationWatermark(result.watermark);
                }
                queryCache.current.clear();
                if (kind !== 'refreshing') {
                    // Table created or dropped: reload the table list so reads switch mode.
                    const tablesResponse = await listBigQueryTables(effectiveProjectId, datasetId);
                    setTables(tablesResponse.tables || []);
                }
                setAccelerationVersion((v) => v + 1);
            } catch (err: unknown) {
                setAccelerationError(toErrorMessage(err));
            } finally {
                accelerationBusyRef.current = false;
                setAccelerationBusy(null);
            }
        },
        [datasetId, effectiveProjectId, tables]
    );

    const datasetObjects = useMemo(() => {
        const map = new Map<string, 'View' | 'Partitioned'>();
        tables.forEach((table) => {
            const rawId = table.tableReference?.tableId || '';
            if (!rawId) return;
            const baseId = rawId.replace(/_\d{8}$/, '');
            const isView = table.type === 'VIEW' || baseId.startsWith('v_');
            map.set(baseId, isView ? 'View' : 'Partitioned');
        });
        return Array.from(map.entries()).map(([id, kind]) => ({ id, kind }));
    }, [tables]);

    const viewObjectCount = useMemo(
        () => datasetObjects.filter((o) => o.kind === 'View').length,
        [datasetObjects]
    );
    const tableObjectCount = datasetObjects.length - viewObjectCount;

    return (
        <div className="flex-1 overflow-auto bg-gray-900 border-l border-gray-800 custom-scrollbar">
            <div className="p-8 max-w-7xl mx-auto">
                <div className="mb-8 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-white tracking-tight">Observability</h1>
                        <p className="mt-2 text-sm text-gray-400">
                            Monitor and analyze your agent activities and performance.
                        </p>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <button
                            type="button"
                            onClick={() => setShowPolicyModal(true)}
                            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-gray-800 hover:bg-gray-700 text-purple-400 hover:text-purple-300 border border-gray-700 hover:border-gray-600 transition-all shadow-sm"
                            title="Open Agent Observability Policy & Telemetry Coverage Hub"
                        >
                            <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10c0-1.718-.433-3.333-1.2-4.782" />
                            </svg>
                            <span>Agent Telemetry Policy & Coverage</span>
                            <span className="text-[10px] bg-purple-900/80 text-purple-200 px-1.5 py-0.2 rounded border border-purple-700/60 font-bold">
                                Policy Hub
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowDataDictionary(true)}
                            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-gray-800 hover:bg-gray-700 text-blue-400 hover:text-blue-300 border border-gray-700 hover:border-gray-600 transition-all shadow-sm"
                            title="Open Observability Data Dictionary & Tables Reference"
                        >
                            <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                            <span>Data Dictionary & Tables Reference</span>
                        </button>
                        <CloudConsoleButton url={`https://console.cloud.google.com/logs/query?project=${projectNumber}`} />
                    </div>
                </div>
                
                <div className="mt-6 bg-gray-800 p-5 rounded-lg border border-gray-700">
                    <div className="flex flex-wrap justify-between items-center gap-3">
                        <div>
                            <div className="flex items-center gap-2.5">
                                <h2 className="text-lg font-semibold text-white">Log Router Sinks & Tables</h2>
                                <span className="text-xs text-gray-400 bg-gray-900 border border-gray-700 px-2 py-0.5 rounded font-mono">
                                    {bqSinks.length} sink{bqSinks.length !== 1 ? 's' : ''}
                                </span>
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">
                                {isSinksExpanded
                                    ? 'Click any BigQuery sink below to switch the active dataset.'
                                    : `Selected sink: ${activeSink?.name || 'None'}`}
                            </p>
                        </div>
                        <div className="flex items-center gap-2.5">
                            {activeSink && (
                                <span className="text-xs text-gray-400 bg-gray-900 border border-gray-700 px-2.5 py-1 rounded">
                                    Active Dataset: <code className="text-green-400 font-mono font-semibold">{datasetId}</code>
                                </span>
                            )}
                            <button
                                type="button"
                                onClick={() => setIsSinksExpanded(prev => !prev)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-gray-900 hover:bg-gray-750 text-gray-300 hover:text-white border border-gray-700 transition-colors"
                            >
                                <span>{isSinksExpanded ? 'Hide Sinks' : 'Switch Sink'}</span>
                                <svg
                                    className={`w-3.5 h-3.5 transition-transform ${isSinksExpanded ? 'rotate-180' : ''}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>
                        </div>
                    </div>
                    
                    {sinksLoading && (
                        <div className="flex items-center justify-center p-4 text-sm text-blue-300 mt-3">
                            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-400 mr-3"></div>
                            Discovering log sinks...
                        </div>
                    )}
                    
                    {error && (
                        <div className="mt-4 p-3.5 text-xs text-red-300 bg-red-900/30 rounded-lg border border-red-800 flex items-start justify-between gap-3">
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
                        <div className="mt-4 space-y-4">
                            {isSinksExpanded && (
                                <div>
                                    {bqSinks.length === 0 ? (
                                        <p className="text-gray-400 text-sm">No BigQuery log sinks found.</p>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
                                                    /methodName\s*=\s*"Search"/i.test(sink.filter) &&
                                                    !/\b(NOT|OR)\b/i.test(sink.filter) &&
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
                                                        onClick={() => {
                                                            setSelectedSinkName(sink.name);
                                                            setIsTablesExpanded(false);
                                                        }}
                                                        className={`p-3 rounded-lg border transition-all cursor-pointer select-none ${
                                                            isActive
                                                                ? 'border-blue-500 bg-blue-950/30 ring-1 ring-blue-500/80 shadow-md shadow-blue-950/40'
                                                                : 'border-gray-700 bg-gray-900/70 hover:border-gray-500 hover:bg-gray-800/60'
                                                        }`}
                                                    >
                                                        <div className="flex justify-between items-start gap-2">
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                                                    <span className="text-xs font-semibold text-white truncate" title={sink.name}>
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
                                                                    {isActive ? '● Selected' : 'Select'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {datasetId && (
                                <div className="pt-3 border-t border-gray-700/80">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="text-sm font-medium text-gray-200">
                                                Tables in <code className="text-green-400 font-mono">{datasetId}</code>
                                            </h3>
                                            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-gray-900 text-gray-300 border border-gray-700">
                                                {datasetObjects.length} total ({tableObjectCount} {tableObjectCount === 1 ? 'table' : 'tables'}, {viewObjectCount} {viewObjectCount === 1 ? 'view' : 'views'})
                                            </span>
                                        </div>
                                        {datasetObjects.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setIsTablesExpanded(prev => !prev)}
                                                aria-expanded={isTablesExpanded}
                                                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md bg-gray-900 hover:bg-gray-750 text-blue-400 hover:text-blue-300 border border-gray-700 transition-colors"
                                            >
                                                <span>
                                                    {isTablesExpanded
                                                        ? `Hide Tables & Views`
                                                        : `Show ${datasetObjects.length} Tables & Views`}
                                                </span>
                                                <svg
                                                    className={`w-3.5 h-3.5 transition-transform ${isTablesExpanded ? 'rotate-180' : ''}`}
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                >
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>

                                    {tables.length === 0 ? (
                                        <p className="text-gray-400 text-xs mt-2">No tables found or unable to list.</p>
                                    ) : (
                                        isTablesExpanded && (
                                            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                                                {datasetObjects.map(({ id: baseTableId, kind }) => (
                                                    <div
                                                        key={baseTableId}
                                                        className="px-2.5 py-1.5 bg-gray-900 rounded-md border border-gray-700 text-xs text-gray-300 font-mono flex justify-between items-center min-w-0"
                                                        title={baseTableId}
                                                    >
                                                        <span className="truncate mr-2">{baseTableId}</span>
                                                        <span
                                                            className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                                                                kind === 'View'
                                                                    ? 'bg-blue-950/70 text-blue-300 border border-blue-800/60'
                                                                    : 'bg-gray-800 text-gray-400'
                                                            }`}
                                                        >
                                                            {kind}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Telemetry Coverage Insight Card */}
                <div className="mt-4 p-4 rounded-xl border border-purple-800/50 bg-purple-950/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <span className="p-2 bg-purple-900/60 rounded-lg border border-purple-700/50 text-purple-300 mt-0.5 shrink-0">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </span>
                        <div className="text-xs">
                            <div className="text-white font-semibold flex items-center gap-2 flex-wrap">
                                <span>Agent Telemetry Coverage Notice:</span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-900/80 text-purple-200 border border-purple-700/60 font-bold">
                                    App Level (~65%) vs Agent Level (~35%)
                                </span>
                            </div>
                            <p className="text-gray-300 mt-1 leading-relaxed">
                                BigQuery sinks record user sessions and assistant queries, but internal agent reasoning, tool payloads, and prompt traces require per-agent OpenTelemetry. Newly created no-code agents in Google Cloud Console start with telemetry disabled by default.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowPolicyModal(true)}
                        className="text-xs text-white font-semibold px-3.5 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 transition-colors whitespace-nowrap shadow-sm shrink-0 flex items-center gap-1.5"
                    >
                        <span>Manage Policy & Auto-Enabler</span>
                        <span>→</span>
                    </button>
                </div>

                <div className="mt-8">
                    {/* Dashboard Mode Tabs */}
                    <div className="flex flex-wrap border-b border-gray-700 mb-6" role="tablist" aria-label="Observability dashboard views">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={activeDashboardTab === 'live'}
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
                            role="tab"
                            aria-selected={activeDashboardTab === 'operational'}
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
                        <button
                            type="button"
                            role="tab"
                            aria-selected={activeDashboardTab === 'policy'}
                            onClick={() => setActiveDashboardTab('policy')}
                            className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                                activeDashboardTab === 'policy'
                                    ? 'border-purple-500 text-purple-400 font-semibold'
                                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600'
                            }`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                            Policy &amp; Telemetry Governance
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
                            {datasetId && tables.length > 0 && (
                                <ObservabilityAccelerationPanel
                                    enabled={isAccelerationEnabled}
                                    watermark={accelerationWatermark}
                                    windowStart={accelerationWindowStart}
                                    busy={accelerationBusy}
                                    error={accelerationError}
                                    lastInsertedRows={accelerationLastInserted}
                                    onEnable={() => runAccelerationAction('enabling')}
                                    onRefresh={() => runAccelerationAction('refreshing')}
                                    onDisable={() => runAccelerationAction('disabling')}
                                />
                            )}
                            <ObservabilityDashboard
                                datasetId={datasetId}
                                customData={dashboardData}
                                timeRange={timeRange}
                                setTimeRange={setTimeRange}
                                isLoading={queryLoading || sinksLoading}
                            />
                        </div>
                    ) : activeDashboardTab === 'operational' ? (
                        <OperationalAnalyticsDashboard
                            projectId={projectId}
                            projectNumber={projectNumber}
                            datasetId={datasetId}
                            tables={tables}
                            onRefreshTables={refreshTables}
                        />
                    ) : (
                        <AgentObservabilityPolicyModal
                            isOpen={true}
                            inline={true}
                            onClose={() => setActiveDashboardTab('live')}
                            projectId={projectId}
                            projectNumber={projectNumber}
                            activeDatasetId={datasetId}
                        />
                    )}
                </div>
            </div>

            <ObservabilityDataDictionaryModal
                isOpen={showDataDictionary}
                onClose={() => setShowDataDictionary(false)}
                activeDatasetId={datasetId}
            />

            <AgentObservabilityPolicyModal
                isOpen={showPolicyModal}
                onClose={() => setShowPolicyModal(false)}
                projectId={projectId}
                projectNumber={projectNumber}
                activeDatasetId={datasetId}
            />
        </div>
    );
};

export default ObservabilityPage;
