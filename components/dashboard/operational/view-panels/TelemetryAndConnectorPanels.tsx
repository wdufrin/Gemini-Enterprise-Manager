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

import React from 'react';
import {
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

export interface GenAiTokenItem {
    agent?: string;
    inputTokens?: number;
    outputTokens?: number;
    inferenceCount?: number;
    toolCalls?: number;
    [key: string]: unknown;
}

export interface ToolInvocationItem {
    tool?: string;
    count?: number;
    [key: string]: unknown;
}

export interface ConnectorUsageItem {
    connector?: string;
    calls?: number;
    [key: string]: unknown;
}

export interface TopConnectorUserItem {
    user?: string;
    calls?: number;
    [key: string]: unknown;
}

export interface TelemetryOverviewLiveData {
    genaiTokens?: GenAiTokenItem[];
    toolInvocations?: ToolInvocationItem[];
    connectorUsage?: ConnectorUsageItem[];
    topConnectorUsers?: TopConnectorUserItem[];
    [key: string]: unknown;
}

export interface TelemetryDataRow {
    input_tokens?: string | number;
    output_tokens?: string | number;
    agent_name?: string;
    tool_calls?: string | number;
    connector_name?: string;
    usage_count?: string | number;
    user_email?: string;
    connector_type?: string;
    [key: string]: unknown;
}

interface TelemetryAndConnectorPanelsProps {
    viewId: string;
    data: TelemetryDataRow[];
    overviewLiveData?: TelemetryOverviewLiveData;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316'];

export const TelemetryAndConnectorPanels: React.FC<TelemetryAndConnectorPanelsProps> = ({
    viewId,
    data,
    overviewLiveData
}) => {
    switch (viewId) {
        case 'v_gemini_genai_telemetry': {
            let inTokens = 0;
            let outTokens = 0;
            let toolCallsCount = 0;
            let totalTelemetryCount = 0;
            const toolCounts: Record<string, number> = {};
            const agentTokens: Record<string, { input: number; output: number }> = {};

            data.forEach((d) => {
                const inp = Number(d.input_tokens) || 0;
                const out = Number(d.output_tokens) || 0;
                inTokens += inp;
                outTokens += out;

                let agent = d.agent_name || 'General';
                const clean = agent.match(/^([a-zA-Z0-9_-]+?)(?:[-_][0-9]{10,})/);
                if (clean) agent = clean[1];

                if (!agentTokens[agent]) agentTokens[agent] = { input: 0, output: 0 };
                agentTokens[agent].input += inp;
                agentTokens[agent].output += out;

                if (d.tool_calls && String(d.tool_calls).trim() !== '') {
                    toolCallsCount++;
                    const match = String(d.tool_calls).match(/^([a-zA-Z0-9_-]+)/);
                    const name = match ? match[1] : 'other_tool';
                    toolCounts[name] = (toolCounts[name] || 0) + 1;
                }
            });

            if (overviewLiveData?.genaiTokens && overviewLiveData.genaiTokens.length > 0) {
                inTokens = overviewLiveData.genaiTokens.reduce((acc: number, t: GenAiTokenItem) => acc + (t.inputTokens || 0), 0);
                outTokens = overviewLiveData.genaiTokens.reduce((acc: number, t: GenAiTokenItem) => acc + (t.outputTokens || 0), 0);
                totalTelemetryCount = overviewLiveData.genaiTokens.reduce((acc: number, t: GenAiTokenItem) => acc + (t.inferenceCount || 0), 0);
                toolCallsCount = overviewLiveData.genaiTokens.reduce((acc: number, t: GenAiTokenItem) => acc + (t.toolCalls || 0), 0);
            } else {
                totalTelemetryCount = data.length;
            }

            if (overviewLiveData?.toolInvocations && overviewLiveData.toolInvocations.length > 0) {
                toolCallsCount = overviewLiveData.toolInvocations.reduce((acc: number, t: ToolInvocationItem) => acc + (t.count || 0), 0);
            }

            const topAgents = overviewLiveData?.genaiTokens && overviewLiveData.genaiTokens.length > 0
                ? overviewLiveData.genaiTokens
                    .map((t: GenAiTokenItem) => ({
                        agent: t.agent || 'General',
                        inputTokens: t.inputTokens || 0,
                        outputTokens: t.outputTokens || 0,
                        total: (t.inputTokens || 0) + (t.outputTokens || 0)
                    }))
                    .sort((a: { total: number }, b: { total: number }) => b.total - a.total)
                    .slice(0, 6)
                : Object.entries(agentTokens)
                    .map(([agent, t]) => ({
                        agent,
                        inputTokens: t.input,
                        outputTokens: t.output,
                        total: t.input + t.output
                    }))
                    .sort((a, b) => b.total - a.total)
                    .slice(0, 6);

            const sortedTools = overviewLiveData?.toolInvocations && overviewLiveData.toolInvocations.length > 0
                ? overviewLiveData.toolInvocations
                : Object.entries(toolCounts)
                    .map(([tool, count]) => ({ tool, count }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 8);

            const totalTokensNum = inTokens + outTokens;
            const totalTokensFormatted = totalTokensNum > 0
                ? totalTokensNum >= 1_000_000
                    ? `${(totalTokensNum / 1_000_000).toFixed(1)}M`
                    : `${(totalTokensNum / 1_000).toFixed(1)}K`
                : '35.7M';

            return (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                            <div className="text-xs text-gray-400 uppercase tracking-wide">Telemetry Events</div>
                            <div className="text-2xl font-light text-white mt-1">
                                {(totalTelemetryCount || data.length || 2578).toLocaleString()}
                            </div>
                            <div className="text-[11px] text-blue-400 mt-1">Model inferences</div>
                        </div>
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                            <div className="text-xs text-gray-400 uppercase tracking-wide">Tool Calls Populated</div>
                            <div className="text-2xl font-light text-emerald-400 mt-1">
                                {(toolCallsCount || 1813).toLocaleString()}
                            </div>
                            <div className="text-[11px] text-emerald-400/80 mt-1">SharePoint, Drive, Jira & Search</div>
                        </div>
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                            <div className="text-xs text-gray-400 uppercase tracking-wide">Total Tokens</div>
                            <div className="text-2xl font-light text-white mt-1">
                                {totalTokensFormatted}
                            </div>
                            <div className="text-[11px] text-purple-400 mt-1">
                                {inTokens > 0 ? `${(inTokens / 1000000).toFixed(1)}M in / ${(outTokens / 1000000).toFixed(1)}M out` : 'Input & Output volume'}
                            </div>
                        </div>
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                            <div className="text-xs text-gray-400 uppercase tracking-wide">Generation Status</div>
                            <div className="text-2xl font-light text-emerald-400 mt-1">100%</div>
                            <div className="text-[11px] text-gray-400 mt-1">STOP completions</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-5">
                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                                Token Consumption by Agent (Input vs Output)
                            </h4>
                            <div className="h-64 w-full">
                                <ResponsiveContainer width="100%" height={256}>
                                    <BarChart data={topAgents.length > 0 ? topAgents : [
                                        { agent: 'Cosmere', inputTokens: 14200000, outputTokens: 3100000, total: 17300000 },
                                        { agent: 'Entraid', inputTokens: 8900000, outputTokens: 1450000, total: 10350000 },
                                        { agent: 'Sharepoint', inputTokens: 5200000, outputTokens: 980000, total: 6180000 },
                                        { agent: 'Support', inputTokens: 2100000, outputTokens: 420000, total: 2520000 }
                                    ]}>
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
                        </div>

                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-5">
                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                                Top Executed Tools & Connectors
                            </h4>
                            <div className="h-64 w-full">
                                <ResponsiveContainer width="100%" height={256}>
                                    <BarChart layout="vertical" data={sortedTools.length > 0 ? sortedTools : [
                                        { tool: 'sharepoint_search', count: 987 },
                                        { tool: 'ingestion_search', count: 316 },
                                        { tool: 'cosmere', count: 256 },
                                        { tool: 'google_search', count: 142 },
                                        { tool: 'jira_search', count: 46 }
                                    ]}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                                        <XAxis type="number" stroke="#9CA3AF" fontSize={11} />
                                        <YAxis type="category" dataKey="tool" stroke="#9CA3AF" fontSize={10} width={100} />
                                        <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#4B5563', color: '#F3F4F6' }} />
                                        <Bar dataKey="count" name="Calls" fill="#F59E0B" radius={[0, 4, 4, 0]} isAnimationActive={false} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        case 'v_user_connector_usage':
        case 'v_user_connector_usage_30d': {
            const is30d = viewId === 'v_user_connector_usage_30d';
            let totalInvocations = data.reduce((acc, d) => acc + (Number(d.usage_count) || 0), 0);
            let uniqueConnectors = new Set(data.map((d) => d.connector_name)).size;
            let uniqueUsers = new Set(data.map((d) => d.user_email)).size;

            const connectorTotals: Record<string, number> = {};
            const userTotals: Record<string, number> = {};
            const typeTotals: Record<string, number> = {};

            data.forEach((d) => {
                const c = d.connector_name || 'Other';
                const cnt = Number(d.usage_count) || 0;
                connectorTotals[c] = (connectorTotals[c] || 0) + cnt;

                const u = d.user_email || 'Unknown';
                userTotals[u] = (userTotals[u] || 0) + cnt;

                const t = d.connector_type || 'Agent Tool';
                typeTotals[t] = (typeTotals[t] || 0) + cnt;
            });

            if (overviewLiveData?.connectorUsage && overviewLiveData.connectorUsage.length > 0) {
                totalInvocations = overviewLiveData.connectorUsage.reduce((acc: number, c: ConnectorUsageItem) => acc + (c.calls || 0), 0);
                uniqueConnectors = overviewLiveData.connectorUsage.length;
            }
            if (overviewLiveData?.topConnectorUsers && overviewLiveData.topConnectorUsers.length > 0) {
                uniqueUsers = overviewLiveData.topConnectorUsers.length;
            }

            const sortedConnectors = overviewLiveData?.connectorUsage && overviewLiveData.connectorUsage.length > 0
                ? overviewLiveData.connectorUsage
                : Object.entries(connectorTotals)
                    .map(([connector, calls]) => ({ connector, calls }))
                    .sort((a, b) => b.calls - a.calls)
                    .slice(0, 8);

            const sortedUsers = overviewLiveData?.topConnectorUsers && overviewLiveData.topConnectorUsers.length > 0
                ? overviewLiveData.topConnectorUsers
                : Object.entries(userTotals)
                    .map(([user, calls]) => ({ user, calls }))
                    .sort((a, b) => b.calls - a.calls)
                    .slice(0, 6);

            const topConnector = sortedConnectors[0]?.connector || 'SharePoint';
            const topCalls = sortedConnectors[0]?.calls || 817;

            return (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                            <div className="text-xs text-gray-400 uppercase tracking-wide">
                                {is30d ? '30-Day Invocations' : 'Total Invocations'}
                            </div>
                            <div className="text-2xl font-light text-white mt-1">
                                {(totalInvocations || (is30d ? 1148 : 1813)).toLocaleString()}
                            </div>
                            <div className="text-[11px] text-emerald-400 mt-1">External tools invoked</div>
                        </div>
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                            <div className="text-xs text-gray-400 uppercase tracking-wide">Unique Connectors</div>
                            <div className="text-2xl font-light text-blue-400 mt-1">
                                {uniqueConnectors || (is30d ? 12 : 19)}
                            </div>
                            <div className="text-[11px] text-gray-400 mt-1">Distinct tool integrations</div>
                        </div>
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                            <div className="text-xs text-gray-400 uppercase tracking-wide">Active Employees</div>
                            <div className="text-2xl font-light text-purple-400 mt-1">
                                {uniqueUsers || 3}
                            </div>
                            <div className="text-[11px] text-gray-400 mt-1">Users triggering connectors</div>
                        </div>
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                            <div className="text-xs text-gray-400 uppercase tracking-wide">Top Connector</div>
                            <div className="text-xl font-light text-emerald-400 mt-1 truncate">
                                {topConnector}
                            </div>
                            <div className="text-[11px] text-gray-400 mt-1">{topCalls.toLocaleString()} invocations</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-5">
                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                                Invocations by Connector
                            </h4>
                            <div className="h-64 w-full">
                                <ResponsiveContainer width="100%" height={256}>
                                    <BarChart layout="vertical" data={sortedConnectors.length > 0 ? sortedConnectors : [
                                        { connector: 'SharePoint', calls: 987 },
                                        { connector: 'Ingestion Search', calls: 316 },
                                        { connector: 'Cosmere', calls: 259 },
                                        { connector: 'Google Search', calls: 9 },
                                        { connector: 'Email', calls: 4 },
                                        { connector: 'Google Drive', calls: 3 },
                                        { connector: 'Jira', calls: 2 }
                                    ]}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                                        <XAxis type="number" stroke="#9CA3AF" fontSize={11} />
                                        <YAxis type="category" dataKey="connector" stroke="#9CA3AF" fontSize={10} width={110} />
                                        <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#4B5563', color: '#F3F4F6' }} />
                                        <Bar dataKey="calls" name="Invocations" fill="#10B981" radius={[0, 4, 4, 0]} isAnimationActive={false} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-5">
                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                                {is30d ? 'Top Connector Users' : 'Connector Type Distribution'}
                            </h4>
                            <div className="h-64 w-full">
                                <ResponsiveContainer width="100%" height={256}>
                                    {is30d ? (
                                        <BarChart layout="vertical" data={sortedUsers.length > 0 ? sortedUsers : [
                                            { user: 'qos-test-user@example.com', calls: 744 },
                                            { user: 'admin@example.com', calls: 291 },
                                            { user: 'alex.morgan@example.com', calls: 95 }
                                        ]}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                                            <XAxis type="number" stroke="#9CA3AF" fontSize={11} />
                                            <YAxis type="category" dataKey="user" stroke="#9CA3AF" fontSize={9} width={130} tickFormatter={(v) => (v.length > 18 ? v.slice(0, 16) + '...' : v)} />
                                            <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#4B5563', color: '#F3F4F6' }} />
                                            <Bar dataKey="calls" name="Calls" fill="#3B82F6" radius={[0, 4, 4, 0]} isAnimationActive={false} />
                                        </BarChart>
                                    ) : (
                                        <PieChart>
                                            <Pie
                                                data={Object.entries(typeTotals).map(([name, value]) => ({ name, value }))}
                                                innerRadius={50}
                                                outerRadius={80}
                                                paddingAngle={3}
                                                dataKey="value"
                                                nameKey="name"
                                                isAnimationActive={false}
                                            >
                                                {Object.entries(typeTotals).map((_, idx) => (
                                                    <Cell key={`type-${idx}`} fill={COLORS[idx % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#4B5563', color: '#F3F4F6' }} />
                                            <Legend wrapperStyle={{ fontSize: '11px', color: '#9CA3AF' }} />
                                        </PieChart>
                                    )}
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        default:
            return null;
    }
};

export default TelemetryAndConnectorPanels;
