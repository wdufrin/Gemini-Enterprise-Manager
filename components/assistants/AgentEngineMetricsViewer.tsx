import React, { useState, useEffect, useMemo } from 'react';
import { Config } from '../../types';
import * as api from '../../services/apiService';
import Spinner from '../Spinner';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';

interface AgentEngineMetricsViewerProps {
    config: Config;
    engineId: string;
    filterBy?: 'engine_id' | 'tool_id';
}

export interface CloudMonitoringDistribution {
    count?: string | number;
    mean?: number;
    sumOfSquaredDeviation?: number;
    bucketOptions?: {
        exponentialBuckets?: {
            numFiniteBuckets?: number;
            growthFactor?: number;
            scale?: number;
        };
        linearBuckets?: {
            numFiniteBuckets?: number;
            width?: number;
            offset?: number;
        };
        explicitBuckets?: {
            bounds?: number[];
        };
    };
    bucketCounts?: Array<string | number>;
}

interface DistributionPoint {
    value?: {
        distributionValue?: CloudMonitoringDistribution;
    };
}

interface TimeSeriesItem {
    resource?: { labels?: Record<string, string> };
    metric?: { labels?: Record<string, string> };
    points?: DistributionPoint[];
}

/**
 * Estimates a quantile (e.g. 0.5 for P50, 0.95 for P95) from a Cloud Monitoring Distribution value.
 * Uses histogram bucket interpolation when bucketOptions + bucketCounts are present,
 * or falls back to normal approximation / mean when buckets are omitted.
 */
export function estimateDistributionPercentile(
    dist: CloudMonitoringDistribution | undefined,
    quantile: number
): number | null {
    if (!dist) return null;
    const clampedQ = Math.min(1, Math.max(0, quantile));

    const rawCounts = dist.bucketCounts;
    const opts = dist.bucketOptions;
    if (Array.isArray(rawCounts) && rawCounts.length > 0 && opts) {
        const counts = rawCounts.map((c) => Math.max(0, Number(c) || 0));
        const totalFromBuckets = counts.reduce((acc, c) => acc + c, 0);
        if (totalFromBuckets > 0) {
            let bounds: number[] = [];
            if (opts.explicitBuckets?.bounds && opts.explicitBuckets.bounds.length > 0) {
                bounds = opts.explicitBuckets.bounds.map(Number);
            } else if (opts.linearBuckets) {
                const n = Math.max(0, Number(opts.linearBuckets.numFiniteBuckets) || 0);
                const width = Number(opts.linearBuckets.width) || 1;
                const offset = Number(opts.linearBuckets.offset) || 0;
                for (let k = 0; k <= n; k++) {
                    bounds.push(offset + k * width);
                }
            } else if (opts.exponentialBuckets) {
                const n = Math.max(0, Number(opts.exponentialBuckets.numFiniteBuckets) || 0);
                const growth = Number(opts.exponentialBuckets.growthFactor) || 2;
                const scale = Number(opts.exponentialBuckets.scale) || 1;
                for (let k = 0; k <= n; k++) {
                    bounds.push(scale * Math.pow(growth, k));
                }
            }

            if (bounds.length > 0) {
                const target = clampedQ * totalFromBuckets;
                let cumulative = 0;
                for (let i = 0; i < counts.length; i++) {
                    const bucketCount = counts[i];
                    if (bucketCount <= 0) continue;
                    const nextCumulative = cumulative + bucketCount;
                    if (target <= nextCumulative || i === counts.length - 1) {
                        const fraction = Math.min(1, Math.max(0, (target - cumulative) / bucketCount));
                        const lower = i === 0 ? 0 : (bounds[Math.min(i - 1, bounds.length - 1)] ?? 0);
                        const upper =
                            i < bounds.length
                                ? bounds[i]
                                : lower * 1.5 || (dist.mean ? dist.mean * 1.5 : lower);
                        return Math.max(0, lower + fraction * Math.max(0, upper - lower));
                    }
                    cumulative = nextCumulative;
                }
            }
        }
    }

    if (typeof dist.mean === 'number' && Number.isFinite(dist.mean) && dist.mean > 0) {
        const count = Number(dist.count) || 1;
        if (
            count > 1 &&
            typeof dist.sumOfSquaredDeviation === 'number' &&
            dist.sumOfSquaredDeviation > 0
        ) {
            const stdDev = Math.sqrt(dist.sumOfSquaredDeviation / count);
            // Z-score approximation for common percentiles (P50 = 0, P95 ≈ 1.645)
            const z = clampedQ >= 0.95 ? 1.645 : clampedQ <= 0.5 ? 0 : (clampedQ - 0.5) * 3.29;
            return Math.max(0, dist.mean + z * stdDev);
        }
        return dist.mean;
    }

    return null;
}

const AgentEngineMetricsViewer: React.FC<AgentEngineMetricsViewerProps> = ({ config, engineId, filterBy = 'engine_id' }) => {
    const [timeSeries, setTimeSeries] = useState<TimeSeriesItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Date range for metrics: Last 7 days by default
    const [daysAgoToFetch, setDaysAgoToFetch] = useState(7);

    useEffect(() => {
        const fetchMetrics = async () => {
            if (!config.projectId || !engineId) return;
            setIsLoading(true);
            setError(null);
            
            try {
                const endTime = new Date();
                const startTime = new Date();
                startTime.setDate(endTime.getDate() - daysAgoToFetch);

                const response = await api.getAgentEngineToolLatencies(
                    config, 
                    engineId, 
                    startTime.toISOString(), 
                    endTime.toISOString(),
                    filterBy
                );
                
                setTimeSeries((response.timeSeries as TimeSeriesItem[]) || []);
            } catch (err: unknown) {
                console.error("Failed to load tool latencies", err);
                const errMsg = err instanceof Error ? err.message : String(err);
                if (errMsg.includes('403')) {
                    setError("You don't have permission to view Cloud Monitoring metrics for this project.");
                } else {
                    setError(errMsg || "Failed to load tool metrics.");
                }
            } finally {
                setIsLoading(false);
            }
        };

        fetchMetrics();
    }, [config, engineId, daysAgoToFetch, filterBy]);

    // Parse the TimeSeries data into the chart forms
    const parsedData = useMemo(() => {
        if (!timeSeries || timeSeries.length === 0) return null;

        let totalToolCalls = 0;
        let totalErrors = 0;
        const toolStats = new Map<string, { calls: number; errors: number; means: number[]; p50s: number[]; p95s: number[] }>();

        // Each timeSeries represents a unique combination of labels (e.g., tool_id + status)
        timeSeries.forEach(series => {
            const toolId = series.resource?.labels?.tool_id || 'Unknown';
            const status = series.metric?.labels?.status || 'UNKNOWN';
            
            if (!toolStats.has(toolId)) {
                toolStats.set(toolId, { calls: 0, errors: 0, means: [], p50s: [], p95s: [] });
            }
            const stats = toolStats.get(toolId)!;

            series.points?.forEach((point: DistributionPoint) => {
                const dist = point.value?.distributionValue;
                if (!dist) return;

                const count = parseInt(String(dist.count || '0'), 10);
                totalToolCalls += count;
                stats.calls += count;

                if (status !== 'OK') {
                    totalErrors += count;
                    stats.errors += count;
                }

                if (dist.mean) {
                    stats.means.push(dist.mean);
                }

                const p50 = estimateDistributionPercentile(dist, 0.5);
                if (p50 !== null && p50 > 0) {
                    stats.p50s.push(p50);
                }
                const p95 = estimateDistributionPercentile(dist, 0.95);
                if (p95 !== null && p95 > 0) {
                    stats.p95s.push(p95);
                }
            });
        });

        // Format for Recharts
        const chartData = Array.from(toolStats.entries()).map(([toolId, stats]) => {
            const avgMean = stats.means.length > 0 ? stats.means.reduce((a, b) => a + b, 0) / stats.means.length : 0;
            const sortedMeans = [...stats.means].sort((a, b) => a - b);
            const fallbackP50 = sortedMeans.length > 0 ? sortedMeans[Math.floor(sortedMeans.length * 0.5)] : avgMean;
            const fallbackP95 = sortedMeans.length > 0 ? sortedMeans[Math.min(sortedMeans.length - 1, Math.floor(sortedMeans.length * 0.95))] : avgMean;

            const p50Latency = stats.p50s.length > 0
                ? stats.p50s.reduce((a, b) => a + b, 0) / stats.p50s.length
                : fallbackP50;
            const p95Latency = stats.p95s.length > 0
                ? Math.max(...stats.p95s)
                : fallbackP95;

            return {
                toolId: toolId.length > 20 ? toolId.substring(0, 20) + '...' : toolId, // Truncate long names
                fullToolId: toolId,
                calls: stats.calls,
                errorRate: stats.calls > 0 ? (stats.errors / stats.calls) * 100 : 0,
                avgLatency: Math.round(avgMean),
                p50Latency: Math.round(p50Latency),
                p95Latency: Math.round(p95Latency)
            };
        });

        // Sort by calls descending
        chartData.sort((a, b) => b.calls - a.calls);

        const overallMeanLatency = chartData.length > 0
            ? Math.round(chartData.reduce((acc, d) => acc + d.avgLatency, 0) / chartData.length)
            : 0;
        const overallP95Latency = chartData.length > 0
            ? Math.max(...chartData.map((d) => d.p95Latency))
            : 0;

        return {
            totalToolCalls,
            totalErrors,
            overallMeanLatency,
            overallP95Latency,
            chartData
        };

    }, [timeSeries]);

    return (
        <div className="bg-gray-800 shadow-xl rounded-lg border border-gray-700 mt-6 flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center bg-gray-900/50">
                <h3 className="text-lg font-semibold text-white">Agent Engine Tool Metrics</h3>
                <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-400">Date Range:</span>
                    <select 
                        value={daysAgoToFetch}
                        onChange={(e) => setDaysAgoToFetch(Number(e.target.value))}
                        className="bg-gray-700 border border-gray-600 rounded-md px-3 py-1.5 text-sm text-white"
                    >
                        <option value={1}>Last 24 Hours</option>
                        <option value={7}>Last 7 Days</option>
                        <option value={30}>Last 30 Days</option>
                    </select>
                </div>
            </div>

            <div className="p-6">
                {isLoading && (
                    <div className="flex flex-col items-center justify-center p-12 text-gray-400">
                        <Spinner />
                        <span className="mt-4 text-sm">Loading tool latencies from Cloud Monitoring...</span>
                    </div>
                )}

                {error && (
                    <div className="p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm">
                        {error}
                    </div>
                )}

                {!isLoading && !error && (!parsedData || parsedData.totalToolCalls === 0) && (
                    <div className="flex flex-col items-center justify-center p-12 text-gray-400">
                        <svg className="w-12 h-12 mb-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        <p>No tool metrics found for this Agent Engine in the selected timeframe.</p>
                        <p className="text-xs mt-2 text-gray-500">Ensure tools are assigned and being invoked during chat sessions.</p>
                    </div>
                )}

                {!isLoading && !error && parsedData && parsedData.totalToolCalls > 0 && (
                    <div className="space-y-8">
                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                                <div className="text-xs text-gray-400 mb-1 uppercase tracking-wide">Total Tool Calls</div>
                                <div className="text-3xl font-light text-white">{parsedData.totalToolCalls.toLocaleString()}</div>
                            </div>
                            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                                <div className="text-xs text-gray-400 mb-1 uppercase tracking-wide">Total Errors</div>
                                <div className="text-3xl font-light text-white">{parsedData.totalErrors.toLocaleString()}</div>
                            </div>
                            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                                <div className="text-xs text-gray-400 mb-1 uppercase tracking-wide">Unique Tools Used</div>
                                <div className="text-3xl font-light text-white">{parsedData.chartData.length}</div>
                            </div>
                            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                                <div className="text-xs text-gray-400 mb-1 uppercase tracking-wide">Avg Error Rate</div>
                                <div className="text-3xl font-light text-white">
                                    {((parsedData.totalErrors / parsedData.totalToolCalls) * 100).toFixed(1)}%
                                </div>
                            </div>
                            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                                <div className="text-xs text-gray-400 mb-1 uppercase tracking-wide">Latency (Mean / P95)</div>
                                <div className="text-2xl font-light text-amber-400">
                                    {parsedData.overallMeanLatency}ms / {parsedData.overallP95Latency}ms
                                </div>
                            </div>
                        </div>

                        {/* Charts Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            
                            {/* Count of calls by tool */}
                            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                                <h4 className="text-sm font-medium text-gray-300 mb-4 px-2">Count of calls by tool</h4>
                                <div className="h-64 w-full">
                                    <ResponsiveContainer width="100%" height={256} minWidth={0}>
                                        <BarChart data={parsedData.chartData} margin={{ top: 5, right: 30, left: 20, bottom: 25 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                            <XAxis 
                                                dataKey="toolId" 
                                                stroke="#9CA3AF" 
                                                fontSize={11} 
                                                angle={-25} 
                                                textAnchor="end"
                                                tick={{ fill: '#9ca3af' }}
                                                axisLine={{ stroke: '#4b5563' }}
                                                tickLine={false}
                                            />
                                            <YAxis 
                                                stroke="#9CA3AF" 
                                                fontSize={12}
                                                tick={{ fill: '#9ca3af' }}
                                                axisLine={{ stroke: '#4b5563' }}
                                                tickLine={false}
                                            />
                                            <Tooltip 
                                                cursor={{ fill: '#374151' }} 
                                                contentStyle={{ backgroundColor: '#1F2937', borderColor: '#4B5563', borderRadius: '0.375rem', color: '#F3F4F6', fontSize: '13px' }}
                                                labelStyle={{ fontWeight: 'bold', color: '#60A5FA', marginBottom: '4px' }}
                                            />
                                            <Bar dataKey="calls" name="Tool Calls" fill="#4ade80" radius={[4, 4, 0, 0]} maxBarSize={50} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Error rate by tool */}
                            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                                <h4 className="text-sm font-medium text-gray-300 mb-4 px-2">Error rate by tool (%)</h4>
                                <div className="h-64 w-full">
                                    <ResponsiveContainer width="100%" height={256} minWidth={0}>
                                        <BarChart data={parsedData.chartData} margin={{ top: 5, right: 30, left: 20, bottom: 25 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                            <XAxis 
                                                dataKey="toolId" 
                                                stroke="#9CA3AF" 
                                                fontSize={11} 
                                                angle={-25} 
                                                textAnchor="end"
                                                tick={{ fill: '#9ca3af' }}
                                                axisLine={{ stroke: '#4b5563' }}
                                                tickLine={false}
                                            />
                                            <YAxis 
                                                stroke="#9CA3AF" 
                                                fontSize={12}
                                                tick={{ fill: '#9ca3af' }}
                                                axisLine={{ stroke: '#4b5563' }}
                                                tickLine={false}
                                                domain={[0, 'auto']}
                                            />
                                            <Tooltip 
                                                cursor={{ fill: '#374151' }} 
                                                contentStyle={{ backgroundColor: '#1F2937', borderColor: '#4B5563', borderRadius: '0.375rem', color: '#F3F4F6', fontSize: '13px' }}
                                                formatter={(value: number) => [`${value.toFixed(1)}%`, 'Error Rate']}
                                            />
                                            <Bar dataKey="errorRate" name="Error Rate %" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={50} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Latency distribution by tool (Mean, P50, P95) */}
                            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 lg:col-span-2">
                                <h4 className="text-sm font-medium text-gray-300 mb-4 px-2">Latency Distribution (Mean / P50 / P95 ms) by tool</h4>
                                <div className="h-72 w-full">
                                    <ResponsiveContainer width="100%" height={288} minWidth={0}>
                                        <BarChart data={parsedData.chartData} margin={{ top: 5, right: 30, left: 20, bottom: 25 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                            <XAxis 
                                                dataKey="toolId" 
                                                stroke="#9CA3AF" 
                                                fontSize={11} 
                                                angle={-15} 
                                                textAnchor="end"
                                                tick={{ fill: '#9ca3af' }}
                                                axisLine={{ stroke: '#4b5563' }}
                                                tickLine={false}
                                            />
                                            <YAxis 
                                                stroke="#9CA3AF" 
                                                fontSize={12}
                                                tick={{ fill: '#9ca3af' }}
                                                axisLine={{ stroke: '#4b5563' }}
                                                tickLine={false}
                                            />
                                            <Tooltip 
                                                cursor={{ fill: '#374151' }}
                                                contentStyle={{ backgroundColor: '#1F2937', borderColor: '#4B5563', borderRadius: '0.375rem', color: '#F3F4F6', fontSize: '13px' }}
                                                formatter={(value: number, name: string) => [`${Number(value).toFixed(0)} ms`, name]}
                                            />
                                            <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                                            <Bar dataKey="p50Latency" name="Median (P50 ms)" fill="#06b6d4" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                            <Bar dataKey="avgLatency" name="Mean Duration (ms)" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                            <Bar dataKey="p95Latency" name="Tail (P95 ms)" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AgentEngineMetricsViewer;
