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
                <div className="absolute bottom-full right-0 mb-2 w-96 p-3 bg-gray-900 text-white text-xs rounded shadow-lg border border-gray-700 z-50">
                    <div className="flex justify-between items-center mb-1">
                        <p className="font-semibold text-blue-400">BigQuery Query</p>
                        <button 
                            onClick={handleCopy}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600 transition-colors"
                        >
                            {copied ? 'Copied!' : 'Copy'}
                        </button>
                    </div>
                    <pre className="bg-gray-800 p-2 rounded mt-1 overflow-x-auto font-mono text-[10px] whitespace-pre-wrap">
                        {query}
                    </pre>
                    <div className="absolute top-full right-2 transform w-2 h-2 bg-gray-900 border-r border-b border-gray-700 rotate-45 -mt-1"></div>
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

    const volumeData = customData?.volumeData || defaultVolumeData;
    const isVolumeLive = !!customData?.volumeData;

    // Mock data for Latency by Agent (fallback)
    const defaultLatencyData = useMemo(() => [
        { name: 'core_assistant', p50: 850, p95: 2450 },
        { name: 'support_agent', p50: 620, p95: 1800 },
        { name: 'search_agent', p50: 1200, p95: 3500 },
        { name: 'routing_agent', p50: 320, p95: 900 },
    ], []);

    // Real data for Role Breakdown
    const roleData = customData?.roleData;
    const isRoleLive = !!roleData;

    // Real data for Agent Breakdown
    const agentData = customData?.agentData;
    const isAgentLive = !!agentData;

    // Summary metrics from view or derived
    const totalRequests = customData?.totalRequests !== undefined
        ? customData.totalRequests
        : (roleData 
            ? roleData.reduce((acc, curr) => acc + curr.value, 0)
            : volumeData.reduce((acc, curr) => acc + curr.requests, 0));

    const usedAgentsCount = customData?.uniqueAgents !== undefined
        ? customData.uniqueAgents
        : (agentData ? agentData.length : defaultLatencyData.length);
    
    // Real data for Unique Users
    const uniqueUsers = customData?.uniqueUsers;
    const isUsersLive = uniqueUsers !== undefined;

    const queries = customData?.queries;

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
                <div className={`bg-gray-900 border rounded-lg p-4 relative ${customData?.totalRequests !== undefined ? 'border-gray-700' : 'border-yellow-700/50'}`}>
                    {customData?.totalRequests === undefined && (
                        <span className="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-900 text-yellow-200">Fallback</span>
                    )}
                    <div className="flex justify-between items-center">
                        <div className="text-xs text-gray-400 mb-1 uppercase tracking-wide">Total Requests</div>
                        {queries?.summaryQuery && <QueryTooltip query={queries.summaryQuery} />}
                    </div>
                    <div className="text-3xl font-light text-white">
                        {totalRequests.toLocaleString()}
                    </div>
                </div>
                <div className={`bg-gray-900 border rounded-lg p-4 relative ${isUsersLive ? 'border-gray-700' : 'border-yellow-700/50'}`}>
                    {!isUsersLive && (
                        <span className="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-900 text-yellow-200">Fallback</span>
                    )}
                    <div className="flex justify-between items-center">
                        <div className="text-xs text-gray-400 mb-1 uppercase tracking-wide">Unique Users</div>
                        {queries?.userCountQuery && <QueryTooltip query={queries.userCountQuery} />}
                    </div>
                    <div className={`text-3xl font-light ${isUsersLive ? 'text-green-400' : 'text-white'}`}>
                        {isUsersLive ? uniqueUsers : 2}
                    </div>
                </div>
                <div className={`bg-gray-900 border rounded-lg p-4 relative ${isUsersLive && customData?.totalRequests !== undefined ? 'border-gray-700' : 'border-yellow-700/50'}`}>
                    {(!isUsersLive || customData?.totalRequests === undefined) && (
                        <span className="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-900 text-yellow-200">Fallback</span>
                    )}
                    <div className="flex justify-between items-center">
                        <div className="text-xs text-gray-400 mb-1 uppercase tracking-wide">Avg Messages / Session</div>
                        {queries?.summaryQuery && queries?.userCountQuery && (
                            <QueryTooltip query={`Derived Metric: Total Requests / Unique Users\n\n-- Total Requests Query:\n${queries.summaryQuery}\n\n-- Unique Users Query:\n${queries.userCountQuery}`} />
                        )}
                    </div>
                    <div className="text-3xl font-light text-white">
                        {isUsersLive && customData?.totalRequests !== undefined && uniqueUsers > 0
                            ? (totalRequests / uniqueUsers).toFixed(1)
                            : '5.2'}
                    </div>
                </div>
                <div className={`bg-gray-900 border rounded-lg p-4 relative ${customData?.uniqueAgents !== undefined || isAgentLive ? 'border-gray-700' : 'border-yellow-700/50'}`}>
                    {customData?.uniqueAgents === undefined && !isAgentLive && (
                        <span className="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-900 text-yellow-200">Fallback</span>
                    )}
                    <div className="flex justify-between items-center">
                        <div className="text-xs text-gray-400 mb-1 uppercase tracking-wide">Used Agents</div>
                        {queries?.agentQuery && <QueryTooltip query={queries.agentQuery} />}
                    </div>
                    <div className={`text-3xl font-light ${customData?.uniqueAgents !== undefined || isAgentLive ? 'text-green-400' : 'text-white'}`}>
                        {usedAgentsCount}
                    </div>
                </div>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Request Volume Chart */}
                <div className={`bg-gray-900 border rounded-lg p-4 relative ${isVolumeLive ? 'border-gray-700' : 'border-yellow-700/50'}`}>
                    <div className="absolute top-2 right-2 flex items-center gap-2">
                        {!isVolumeLive && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-900 text-yellow-200">Fallback</span>
                        )}
                        {queries?.volumeQuery && <QueryTooltip query={queries.volumeQuery} />}
                    </div>
                    <h4 className="text-sm font-medium text-gray-300 mb-4 px-2">Request Volume</h4>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
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
                    </div>
                </div>

                {/* Role Breakdown Chart */}
                <div className={`bg-gray-900 border rounded-lg p-4 relative ${isRoleLive ? 'border-gray-700' : 'border-yellow-700/50'}`}>
                    <div className="absolute top-2 right-2 flex items-center gap-2">
                        {!isRoleLive && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-900 text-yellow-200">Fallback</span>
                        )}
                        {queries?.roleQuery && <QueryTooltip query={queries.roleQuery} />}
                    </div>
                    <h4 className="text-sm font-medium text-gray-300 mb-4 px-2">Messages by Role</h4>
                    <div className="h-64 w-full flex justify-center items-center">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                            <PieChart>
                                <Pie
                                    data={roleData || [{ name: 'model', value: 7 }, { name: 'user', value: 5 }]}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="value"
                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                >
                                    {(roleData || [{ name: 'model', value: 7 }, { name: 'user', value: 5 }]).map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip 
                                    contentStyle={{ backgroundColor: '#1F2937', borderColor: '#4B5563', borderRadius: '0.375rem', color: '#F3F4F6' }}
                                />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Agent Breakdown Chart */}
                <div className={`bg-gray-900 border rounded-lg p-4 lg:col-span-2 relative ${isAgentLive ? 'border-gray-700' : 'border-yellow-700/50'}`}>
                    <div className="absolute top-2 right-2 flex items-center gap-2">
                        {!isAgentLive && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-900 text-yellow-200">Fallback</span>
                        )}
                        {queries?.agentQuery && <QueryTooltip query={queries.agentQuery} />}
                    </div>
                    <h4 className="text-sm font-medium text-gray-300 mb-4 px-2">Messages by Agent</h4>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                            {agentData ? (
                                <BarChart data={agentData} margin={{ top: 5, right: 30, left: 20, bottom: 40 }}>
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
                    </div>
                </div>

            </div>
        </div>
    );
};

export default ObservabilityDashboard;
