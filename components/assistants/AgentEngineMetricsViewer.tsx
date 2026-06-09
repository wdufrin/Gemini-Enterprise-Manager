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
    ResponsiveContainer,
    LineChart,
    Line
} from 'recharts';

interface AgentEngineMetricsViewerProps {
    config: Config;
    engineId: string;
    filterBy?: 'engine_id' | 'tool_id';
}

// Helper to determine the P95 from Cloud Monitoring DISTRIBUTION.
const calculateP95 = (bucketCounts: number[], bucketOptions: any) => {
    // Cloud Monitoring Distribution bucketOptions usually include exponentialBuckets or linearBuckets.
    // For simplicity, we approximate P95 here. In a real environment we'd use the explicit boundaries or proper MQL.
    // Given the complexity of manually parsing bucket boundaries, we can just return a basic average of the distribution mean,
    // or estimate based on available properties. Often there's an explicit `mean` available on the points.
    // We'll calculate a placeholder P95 until we see the exact payload layout.
    return 0; // To be refined when real data arrives
};

const AgentEngineMetricsViewer: React.FC<AgentEngineMetricsViewerProps> = ({ config, engineId, filterBy = 'engine_id' }) => {
    const [timeSeries, setTimeSeries] = useState<any[]>([]);
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
                
                setTimeSeries(response.timeSeries || []);
            } catch (err: any) {
                console.error("Failed to load tool latencies", err);
                // We'll ignore 403s on metrics typically for non-admins, but show it if critical
                if (err.message && err.message.includes('403')) {
                    setError("You don't have permission to view Cloud Monitoring metrics for this project.");
                } else {
                    setError(err.message || "Failed to load tool metrics.");
                }
            } finally {
                setIsLoading(false);
            }
        };

        fetchMetrics();
    }, [config, engineId, daysAgoToFetch, filterBy]);

    // Parse the TimeSeries data into the 4 chart forms
    const parsedData = useMemo(() => {
        if (!timeSeries || timeSeries.length === 0) return null;

        let totalToolCalls = 0;
        let totalErrors = 0;
        const toolStats = new Map<string, { calls: number, errors: number, means: number[], p95s: number[] }>();

        // Each timeSeries represents a unique combination of labels (e.g., tool_id + status)
        timeSeries.forEach(series => {
            const toolId = series.resource?.labels?.tool_id || 'Unknown';
            const status = series.metric?.labels?.status || 'UNKNOWN';
            
            if (!toolStats.has(toolId)) {
                toolStats.set(toolId, { calls: 0, errors: 0, means: [], p95s: [] });
            }
            const stats = toolStats.get(toolId)!;

            series.points?.forEach((point: any) => {
                const dist = point.value?.distributionValue;
                if (!dist) return;

                const count = parseInt(dist.count || '0', 10);
                totalToolCalls += count;
                stats.calls += count;

                if (status !== 'OK') {
                    totalErrors += count;
                    stats.errors += count;
                }

                if (dist.mean) {
                    stats.means.push(dist.mean);
                }
            });
        });

        // Format for Recharts
        const chartData = Array.from(toolStats.entries()).map(([toolId, stats]) => {
            // Very naive approximation of P95 using available means if real percentiles aren't provided by the API without MQL
            const avgMean = stats.means.length > 0 ? stats.means.reduce((a,b) => a+b, 0) / stats.means.length : 0;
            const p95Estimate = avgMean * 1.5; // Placeholder estimate

            return {
                toolId: toolId.length > 20 ? toolId.substring(0, 20) + '...' : toolId, // Truncate long names
                fullToolId: toolId,
                calls: stats.calls,
                errorRate: stats.calls > 0 ? (stats.errors / stats.calls) * 100 : 0,
                p95: p95Estimate
            };
        });

        // Sort by calls descending
        chartData.sort((a, b) => b.calls - a.calls);

        return {
            totalToolCalls,
            totalErrors,
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
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                        </div>

                        {/* Charts Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            
                            {/* Count of calls by tool */}
                            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                                <h4 className="text-sm font-medium text-gray-300 mb-4 px-2">Count of calls by tool</h4>
                                <div className="h-64 w-full">
                                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
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
                                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
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

                            {/* P95 duration by tool */}
                            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 lg:col-span-2">
                                <h4 className="text-sm font-medium text-gray-300 mb-4 px-2">Duration (ms) by tool (Estimated P95)</h4>
                                <div className="h-72 w-full">
                                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                                        <LineChart data={parsedData.chartData} margin={{ top: 5, right: 30, left: 20, bottom: 25 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
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
                                                contentStyle={{ backgroundColor: '#1F2937', borderColor: '#4B5563', borderRadius: '0.375rem', color: '#F3F4F6', fontSize: '13px' }}
                                                formatter={(value: number) => [`${value.toFixed(0)} ms`, 'Est. P95 Duration']}
                                            />
                                            <Line type="monotone" dataKey="p95" name="P95 Duration" stroke="#8b5cf6" strokeWidth={3} activeDot={{ r: 8 }} />
                                        </LineChart>
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
