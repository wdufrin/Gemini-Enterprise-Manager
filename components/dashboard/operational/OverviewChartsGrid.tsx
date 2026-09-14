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
import { OPERATIONAL_VIEWS } from './analyticsData';
import { CHARTS_METADATA } from './analyticsMetadata';
import { MetricInfoTooltip } from './MetricInfoTooltip';

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

interface OverviewChartsGridProps {
    showView: (id: string) => boolean;
    installedViews: Set<string>;
    installedViewsMap: Map<string, string>;
    operatingViewId: string | null;
    brokenViews: Map<string, string>;
    handleCreateView: (viewId: string) => void;
    handleDropView: (viewId: string) => void;
    handleViewChange: (viewId: string) => void;
    projectId: string;
    datasetId?: string;
    tableNames: Set<string>;
    dailyActivityData: any[];
    agentPopularityData: any[];
    genaiTokensData: any[];
    toolInvocationsData: any[];
    connectorUsageData: any[];
    topConnectorUsersData: any[];
    aiChoicesData: any[];
    agentFeedbackData: any[];
}

export const OverviewChartsGrid: React.FC<OverviewChartsGridProps> = ({
    showView,
    installedViews,
    installedViewsMap,
    operatingViewId,
    brokenViews,
    handleCreateView,
    handleDropView,
    handleViewChange,
    projectId,
    datasetId,
    tableNames,
    dailyActivityData,
    agentPopularityData,
    genaiTokensData,
    toolInvocationsData,
    connectorUsageData,
    topConnectorUsersData,
    aiChoicesData,
    agentFeedbackData,
}) => {
    return (
        <div className="space-y-6">
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
                                <div className="flex items-center gap-1.5">
                                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                        Daily Interaction Volume
                                    </h4>
                                    <MetricInfoTooltip
                                        title={CHARTS_METADATA.daily_interaction_volume.title}
                                        whatItShows={CHARTS_METADATA.daily_interaction_volume.whatItShows}
                                        meaning={CHARTS_METADATA.daily_interaction_volume.metricMeaning}
                                        sourceTables={CHARTS_METADATA.daily_interaction_volume.sourceTables}
                                        fieldsUsed={CHARTS_METADATA.daily_interaction_volume.fieldsUsed}
                                        align="left"
                                    />
                                </div>
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
                            <div className="flex items-center gap-1.5 mb-3">
                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                    Agent Popularity Share
                                </h4>
                                <MetricInfoTooltip
                                    title={CHARTS_METADATA.agent_popularity_share.title}
                                    whatItShows={CHARTS_METADATA.agent_popularity_share.whatItShows}
                                    meaning={CHARTS_METADATA.agent_popularity_share.metricMeaning}
                                    sourceTables={CHARTS_METADATA.agent_popularity_share.sourceTables}
                                    fieldsUsed={CHARTS_METADATA.agent_popularity_share.fieldsUsed}
                                    align="right"
                                />
                            </div>
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
                                <div className="flex items-center gap-1.5">
                                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                        Token Consumption by Agent
                                    </h4>
                                    <MetricInfoTooltip
                                        title={CHARTS_METADATA.genai_tokens_by_agent.title}
                                        whatItShows={CHARTS_METADATA.genai_tokens_by_agent.whatItShows}
                                        meaning={CHARTS_METADATA.genai_tokens_by_agent.metricMeaning}
                                        sourceTables={CHARTS_METADATA.genai_tokens_by_agent.sourceTables}
                                        fieldsUsed={CHARTS_METADATA.genai_tokens_by_agent.fieldsUsed}
                                        align="left"
                                    />
                                </div>
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
                            <div className="flex items-center gap-1.5 mb-3">
                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                    Tool Invocations by Tool Name
                                </h4>
                                <MetricInfoTooltip
                                    title={CHARTS_METADATA.tool_invocations_by_name.title}
                                    whatItShows={CHARTS_METADATA.tool_invocations_by_name.whatItShows}
                                    meaning={CHARTS_METADATA.tool_invocations_by_name.metricMeaning}
                                    sourceTables={CHARTS_METADATA.tool_invocations_by_name.sourceTables}
                                    fieldsUsed={CHARTS_METADATA.tool_invocations_by_name.fieldsUsed}
                                    align="right"
                                />
                            </div>
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
                                <div className="flex items-center gap-1.5">
                                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                        Invocations by Connector
                                    </h4>
                                    <MetricInfoTooltip
                                        title={CHARTS_METADATA.connector_invocations_30d.title}
                                        whatItShows={CHARTS_METADATA.connector_invocations_30d.whatItShows}
                                        meaning={CHARTS_METADATA.connector_invocations_30d.metricMeaning}
                                        sourceTables={CHARTS_METADATA.connector_invocations_30d.sourceTables}
                                        fieldsUsed={CHARTS_METADATA.connector_invocations_30d.fieldsUsed}
                                        align="left"
                                    />
                                </div>
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
                            <div className="flex items-center gap-1.5 mb-3">
                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                    Top Connector Users
                                </h4>
                                <MetricInfoTooltip
                                    title={CHARTS_METADATA.top_connector_users.title}
                                    whatItShows={CHARTS_METADATA.top_connector_users.whatItShows}
                                    meaning={CHARTS_METADATA.top_connector_users.metricMeaning}
                                    sourceTables={CHARTS_METADATA.top_connector_users.sourceTables}
                                    fieldsUsed={CHARTS_METADATA.top_connector_users.fieldsUsed}
                                    align="right"
                                />
                            </div>
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
                            <div className="flex items-center gap-1.5 mb-3">
                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                    Model Finish Reasons Breakdown
                                </h4>
                                <MetricInfoTooltip
                                    title={CHARTS_METADATA.ai_finish_reasons.title}
                                    whatItShows={CHARTS_METADATA.ai_finish_reasons.whatItShows}
                                    meaning={CHARTS_METADATA.ai_finish_reasons.metricMeaning}
                                    sourceTables={CHARTS_METADATA.ai_finish_reasons.sourceTables}
                                    fieldsUsed={CHARTS_METADATA.ai_finish_reasons.fieldsUsed}
                                    align="left"
                                />
                            </div>
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
                            <div className="flex items-center gap-1.5 mb-3">
                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                    Choice Frequency
                                </h4>
                                <MetricInfoTooltip
                                    title={CHARTS_METADATA.ai_choice_frequency.title}
                                    whatItShows={CHARTS_METADATA.ai_choice_frequency.whatItShows}
                                    meaning={CHARTS_METADATA.ai_choice_frequency.metricMeaning}
                                    sourceTables={CHARTS_METADATA.ai_choice_frequency.sourceTables}
                                    fieldsUsed={CHARTS_METADATA.ai_choice_frequency.fieldsUsed}
                                    align="right"
                                />
                            </div>
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
                            <div className="flex items-center gap-1.5 mb-3">
                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                    Feedback Ratings per Agent
                                </h4>
                                <MetricInfoTooltip
                                    title={CHARTS_METADATA.agent_feedback_ratings.title}
                                    whatItShows={CHARTS_METADATA.agent_feedback_ratings.whatItShows}
                                    meaning={CHARTS_METADATA.agent_feedback_ratings.metricMeaning}
                                    sourceTables={CHARTS_METADATA.agent_feedback_ratings.sourceTables}
                                    fieldsUsed={CHARTS_METADATA.agent_feedback_ratings.fieldsUsed}
                                    align="left"
                                />
                            </div>
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
                                <div className="flex items-center gap-1.5 mb-3">
                                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                        Quality & Satisfaction Summary
                                    </h4>
                                    <MetricInfoTooltip
                                        title={CHARTS_METADATA.quality_satisfaction_summary.title}
                                        whatItShows={CHARTS_METADATA.quality_satisfaction_summary.whatItShows}
                                        meaning={CHARTS_METADATA.quality_satisfaction_summary.metricMeaning}
                                        sourceTables={CHARTS_METADATA.quality_satisfaction_summary.sourceTables}
                                        fieldsUsed={CHARTS_METADATA.quality_satisfaction_summary.fieldsUsed}
                                        align="right"
                                    />
                                </div>
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
        </div>
    );
};

export default OverviewChartsGrid;
