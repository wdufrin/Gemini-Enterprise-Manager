import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    AreaChart,
    Area,
    PieChart,
    Pie,
    Cell
} from 'recharts';

interface Props {
    datasetId?: string;
    customData?: {
        volumeData?: { time: string, requests: number, errors: number }[];
        roleData?: { name: string, value: number }[];
        agentData?: { name: string, count: number }[];
        uniqueUsers?: number;
        uniqueAgents?: number;
        totalRequests?: number;
        totalSessions?: number;
        errorRate?: number;
        queries?: {
            volumeQuery?: string;
            roleQuery?: string;
            agentQuery?: string;
            summaryQuery?: string;
            userCountQuery?: string;
        };
    };
    timeRange: number;
    setTimeRange: (range: number) => void;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444'];

const QueryTooltip: React.FC<{ query: string }> = ({ query }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [copied, setCopied] = useState(false);
    const tooltipRef = useRef<HTMLDivElement>(null);

    const handleCopy = () => {
        navigator.clipboard.writeText(query);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
                setIsVisible(false);
            }
        };

        if (isVisible) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isVisible]);

    return (
        <div className="relative inline-block" ref={tooltipRef}>
            <button 
                className="cursor-help text-gray-500 hover:text-blue-400 transition-colors focus:outline-none"
                onClick={() => setIsVisible(!isVisible)}
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </button>
            {isVisible && (
                <div className="absolute top-full right-0 mt-2 w-96 md:w-[480px] p-3 bg-gray-900 text-white text-xs rounded shadow-lg border border-gray-700 z-50">
                    <div className="flex justify-between items-center mb-1">
                        <p className="font-semibold text-blue-400">BigQuery Query</p>
                        <button 
                            onClick={handleCopy}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600 transition-colors"
                        >
                            {copied ? 'Copied!' : 'Copy'}
                        </button>
                    </div>
                    <div className="max-h-60 overflow-y-auto mt-2 bg-gray-800 p-2 rounded">
                        <pre className="font-mono text-[10px] whitespace-pre-wrap break-all">
                            {query}
                        </pre>
                    </div>
                    <div className="absolute bottom-full right-2 transform w-2 h-2 bg-gray-900 border-l border-t border-gray-700 rotate-45 -mb-1"></div>
                </div>
            )}
        </div>
    );
};

const CustomXAxisTick = (props: any) => {
    const { x, y, payload } = props;
    if (x === null || y === null || isNaN(x) || isNaN(y) || !payload) return null;
    const parts = (payload.value || '').split('|');
    return (
        <g transform={`translate(${x},${y})`}>
            <text x={0} y={0} dy={16} textAnchor="middle" fill="#9CA3AF" fontSize={11}>
                {parts[0] || ''}
            </text>
            {parts[1] && (
                <text x={0} y={0} dy={30} textAnchor="middle" fill="#6B7280" fontSize={9}>
                    {parts[1]}
                </text>
            )}
        </g>
    );
};

const ObservabilityDashboard: React.FC<Props> = ({ datasetId, customData, timeRange, setTimeRange }) => {
    // Mock data for Request Volume over time (fallback)
    const defaultVolumeData = useMemo(() => [
        { time: '00:00', requests: 2 },
        { time: '04:00', requests: 1 },
        { time: '08:00', requests: 5 },
        { time: '12:00', requests: 8 },
        { time: '16:00', requests: 4 },
        { time: '18:00', requests: 12 },
        { time: '20:00', requests: 3 },
        { time: '24:00', requests: 1 },
    ], []);

    const volumeData = customData?.volumeData || (datasetId ? [] : defaultVolumeData);
    const isVolumeLive = !!customData?.volumeData || !!datasetId;

    // Mock data for Latency by Agent (fallback)
    const defaultLatencyData = useMemo(() => [
        { name: 'core_assistant', p50: 850, p95: 2450 },
        { name: 'support_agent', p50: 620, p95: 1800 },
        { name: 'search_agent', p50: 1200, p95: 3500 },
        { name: 'routing_agent', p50: 320, p95: 900 },
    ], []);

    // Real data for Role Breakdown
    const roleData = customData?.roleData || (datasetId ? [] : null);
    const isRoleLive = !!customData?.roleData || !!datasetId;

    // Real data for Agent Breakdown
    const agentData = customData?.agentData || (datasetId ? [] : null);
    const isAgentLive = !!customData?.agentData || !!datasetId;

    // Summary metrics from view or derived
    const totalRequests = customData?.totalRequests !== undefined
        ? customData.totalRequests
        : (roleData && roleData.length > 0
            ? roleData.reduce((acc, curr) => acc + curr.value, 0)
            : (volumeData.length > 0 ? volumeData.reduce((acc, curr) => acc + curr.requests, 0) : 0));

    const usedAgentsCount = customData?.uniqueAgents !== undefined
        ? customData.uniqueAgents
        : (agentData ? agentData.length : (datasetId ? 0 : defaultLatencyData.length));
    
    // Real data for Unique Users & Sessions
    const uniqueUsers = customData?.uniqueUsers !== undefined ? customData.uniqueUsers : (datasetId ? 0 : undefined);
    const isUsersLive = uniqueUsers !== undefined || !!datasetId;
    const totalSessions = customData?.totalSessions !== undefined ? customData.totalSessions : (datasetId ? 0 : undefined);
    const isSessionsLive = totalSessions !== undefined || !!datasetId;

    const queries = customData?.queries;

    // Top 10 agents for the bar chart visualization
    const topAgentChartData = useMemo(() => {
        if (!agentData) return null;
        return agentData.slice(0, 10).map((a: any) => {
            const truncatedName = a.name.length > 20 ? a.name.substring(0, 20) + '...' : a.name;
            return {
                name: `${truncatedName}|${a.id}`,
                count: a.count
            };
        });
    }, [agentData]);

    return (
        <div className="space-y-6">
            {/* Header with Time Range Dropdown */}
            <div className="flex justify-between items-center mb-4 bg-gray-800 p-4 rounded-lg border border-gray-700">
                <div>
                    {datasetId ? (
                        <p className="text-sm text-gray-300">
                            Dataset: <code className="text-green-400">{datasetId}</code>
                            {roleData || agentData || customData?.volumeData || isUsersLive ? ' (Using live data)' : ' (Using example data)'}
                        </p>
                    ) : (
                        <p className="text-sm text-gray-400">No specific dataset identified. Showing example data.</p>
                    )}
                </div>

            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className={`bg-gray-900 border rounded-lg p-4 relative ${customData?.totalRequests !== undefined || datasetId ? 'border-gray-700' : 'border-yellow-700/50'}`}>
                    {customData?.totalRequests === undefined && !datasetId && (
                        <span className="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-900 text-yellow-200">Fallback</span>
                    )}
                    <div className="flex justify-between items-center">
                        <div className="text-xs text-gray-400 mb-1 uppercase tracking-wide">Total Queries</div>
                        {queries?.summaryQuery && <QueryTooltip query={queries.summaryQuery} />}
                    </div>
                    <div className="text-3xl font-light text-white">
                        {totalRequests.toLocaleString()}
                    </div>
                </div>
                <div className={`bg-gray-900 border rounded-lg p-4 relative ${isUsersLive || datasetId ? 'border-gray-700' : 'border-yellow-700/50'}`}>
                    {!isUsersLive && !datasetId && (
                        <span className="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-900 text-yellow-200">Fallback</span>
                    )}
                    <div className="flex justify-between items-center">
                        <div className="text-xs text-gray-400 mb-1 uppercase tracking-wide">Unique Users</div>
                        {queries?.userCountQuery && <QueryTooltip query={queries.userCountQuery} />}
                    </div>
                    <div className={`text-3xl font-light ${isUsersLive || datasetId ? 'text-green-400' : 'text-white'}`}>
                        {isUsersLive || datasetId ? uniqueUsers : 2}
                    </div>
                </div>
                <div className={`bg-gray-900 border rounded-lg p-4 relative ${(isSessionsLive && customData?.totalRequests !== undefined) || datasetId ? 'border-gray-700' : 'border-yellow-700/50'}`}>
                    {(!isSessionsLive || customData?.totalRequests === undefined) && !datasetId && (
                        <span className="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-900 text-yellow-200">Fallback</span>
                    )}
                    <div className="flex justify-between items-center">
                        <div className="text-xs text-gray-400 mb-1 uppercase tracking-wide">Avg Messages / Session</div>
                        {queries?.summaryQuery && (
                            <QueryTooltip query={`Derived Metric: Total Queries / Total Distinct Sessions\n\n-- Summary metrics query:\n${queries.summaryQuery}`} />
                        )}
                    </div>
                    <div className="text-3xl font-light text-white">
                        {isSessionsLive && customData?.totalRequests !== undefined && totalSessions > 0
                            ? (totalRequests / totalSessions).toFixed(1)
                            : (datasetId ? '0.0' : '5.2')}
                    </div>
                </div>
                <div className={`bg-gray-900 border rounded-lg p-4 relative ${customData?.uniqueAgents !== undefined || isAgentLive || datasetId ? 'border-gray-700' : 'border-yellow-700/50'}`}>
                    {customData?.uniqueAgents === undefined && !isAgentLive && !datasetId && (
                        <span className="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-900 text-yellow-200">Fallback</span>
                    )}
                    <div className="flex justify-between items-center">
                        <div className="text-xs text-gray-400 mb-1 uppercase tracking-wide">Used Agents</div>
                        {queries?.agentQuery && <QueryTooltip query={queries.agentQuery} />}
                    </div>
                    <div className={`text-3xl font-light ${customData?.uniqueAgents !== undefined || isAgentLive || datasetId ? 'text-green-400' : 'text-white'}`}>
                        {usedAgentsCount}
                    </div>
                </div>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Request Volume Chart */}
                {/* Request Volume Chart */}
                <div className={`bg-gray-900 border rounded-lg p-4 relative ${isVolumeLive || datasetId ? 'border-gray-700' : 'border-yellow-700/50'}`}>
                    <div className="absolute top-2 right-2 flex items-center gap-2">
                        {!isVolumeLive && !datasetId && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-900 text-yellow-200">Fallback</span>
                        )}
                        {queries?.volumeQuery && <QueryTooltip query={queries.volumeQuery} />}
                    </div>
                    <h4 className="text-sm font-medium text-gray-300 mb-4 px-2">Request Volume</h4>
                    <div className="h-64 w-full flex justify-center items-center">
                        {isVolumeLive && volumeData.length === 0 ? (
                            <span className="text-sm text-gray-500">No request logs in this time range.</span>
                        ) : (
                            <ResponsiveContainer width="100%" height={256} minWidth={0}>
                                <AreaChart data={volumeData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                    <XAxis dataKey="time" stroke="#9CA3AF" fontSize={12} />
                                    <YAxis stroke="#9CA3AF" fontSize={12} />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: '#1F2937', borderColor: '#4B5563', borderRadius: '0.375rem', color: '#F3F4F6' }}
                                    />
                                    <Area type="monotone" dataKey="requests" name="Requests" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.3} />
                                    <Legend />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* Agent Activity Table */}
                <div className={`bg-gray-900 border rounded-lg p-4 relative ${isAgentLive || datasetId ? 'border-gray-700' : 'border-yellow-700/50'}`}>
                    <div className="absolute top-2 right-2 flex items-center gap-2">
                        {!isAgentLive && !datasetId && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-900 text-yellow-200">Fallback</span>
                        )}
                        {queries?.agentQuery && <QueryTooltip query={queries.agentQuery} />}
                    </div>
                    <h4 className="text-sm font-medium text-gray-300 mb-4 px-2">Agent Activity Breakdown</h4>
                    <div className="h-64 w-full overflow-y-auto custom-scrollbar pr-2">
                        {isAgentLive && agentData && agentData.length === 0 ? (
                            <div className="h-full flex justify-center items-center">
                                <span className="text-sm text-gray-500">No agent logs in this time range.</span>
                            </div>
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-gray-800 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                                        <th className="pb-2 pl-2">Agent Name / ID</th>
                                        <th className="pb-2 text-right pr-2">Queries</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800 text-sm text-gray-300">
                                    {(agentData || [
                                        { name: 'core_assistant', id: 'core_assistant', count: 351 },
                                        { name: 'support_agent', id: 'support_agent', count: 124 },
                                        { name: 'search_agent', id: 'search_agent', count: 85 },
                                        { name: 'routing_agent', id: 'routing_agent', count: 42 }
                                    ]).map((agent: any, idx: number) => (
                                        <tr key={idx} className="hover:bg-gray-800/40 transition-colors">
                                            <td className="py-2.5 pl-2 max-w-[240px] truncate" title={`${agent.name} (${agent.id})`}>
                                                <div className="font-medium text-white truncate">{agent.name}</div>
                                                <div className="text-xs text-gray-500 truncate font-mono mt-0.5">{agent.id}</div>
                                            </td>
                                            <td className="py-2.5 text-right pr-2 font-mono text-green-400 font-semibold">
                                                {agent.count.toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* Agent Breakdown Chart */}
                <div className={`bg-gray-900 border rounded-lg p-4 lg:col-span-2 relative ${isAgentLive || datasetId ? 'border-gray-700' : 'border-yellow-700/50'}`}>
                    <div className="absolute top-2 right-2 flex items-center gap-2">
                        {!isAgentLive && !datasetId && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-900 text-yellow-200">Fallback</span>
                        )}
                        {queries?.agentQuery && <QueryTooltip query={queries.agentQuery} />}
                    </div>
                    <h4 className="text-sm font-medium text-gray-300 mb-4 px-2">Top Agents (Visualized)</h4>
                    <div className="h-64 w-full flex justify-center items-center">
                        {isAgentLive && agentData && agentData.length === 0 ? (
                            <span className="text-sm text-gray-500">No agent logs in this time range.</span>
                        ) : (
                            <ResponsiveContainer width="100%" height={256} minWidth={0}>
                                {topAgentChartData ? (
                                    <BarChart data={topAgentChartData} margin={{ top: 5, right: 30, left: 20, bottom: 40 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                        <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} tick={<CustomXAxisTick />} interval={0} height={60} />
                                        <YAxis stroke="#9CA3AF" fontSize={12} />
                                        <Tooltip 
                                            contentStyle={{ backgroundColor: '#1F2937', borderColor: '#4B5563', borderRadius: '0.375rem', color: '#F3F4F6' }}
                                        />
                                        <Legend />
                                        <Bar dataKey="count" name="Messages" fill="#10B981" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                ) : (
                                    <BarChart data={defaultLatencyData} margin={{ top: 5, right: 30, left: 20, bottom: 40 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                        <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} tick={<CustomXAxisTick />} interval={0} height={60} />
                                        <YAxis stroke="#9CA3AF" fontSize={12} />
                                        <Tooltip 
                                            contentStyle={{ backgroundColor: '#1F2937', borderColor: '#4B5563', borderRadius: '0.375rem', color: '#F3F4F6' }}
                                        />
                                        <Legend />
                                        <Bar dataKey="p50" name="Median Latency (P50)" fill="#10B981" radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="p95" name="Tail Latency (P95)" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                )}
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default ObservabilityDashboard;
