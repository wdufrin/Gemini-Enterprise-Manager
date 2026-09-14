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
import { IndividualViewDetail } from './IndividualViewDetail';
import { DetailDrawer } from './DetailDrawer';
import { OverviewKpiCards } from './OverviewKpiCards';
import { OverviewChartsGrid } from './OverviewChartsGrid';
import { VIEW_CATEGORIES, OPERATIONAL_VIEWS, FALLBACK_SNAPSHOT } from './analyticsData';
import { getViewSourceTables } from './analyticsMetadata';
import { useOperationalDashboardState } from '../../../hooks/useOperationalDashboardState';

interface Props {
    projectId: string;
    projectNumber: string;
    datasetId?: string;
    tables: any[];
    onRefreshTables?: () => Promise<void>;
}

export const OperationalAnalyticsDashboard: React.FC<Props> = ({
    projectId,
    projectNumber,
    datasetId,
    tables = [],
    onRefreshTables
}) => {
    const {
        activeViewId,
        selectedCategory,
        operatingViewId,
        actionMessage,
        selectedDrawerRow,
        viewRows,
        rowsLoading,
        liveData,
        brokenViews,
        installedViews,
        installedViewsMap,
        tableNames,
        isUserActivityLive,
        isGenAiTelemetryLive,
        isConnectorUsageLive,
        dailyActivityData,
        agentPopularityData,
        genaiTokensData,
        toolInvocationsData,
        connectorUsageData,
        topConnectorUsersData,
        aiChoicesData,
        agentFeedbackData,
        totalInteractions,
        totalTelemetry,
        tokensTrackedStr,
        activeConnectorsCount,
        handleViewChange,
        handleCreateView,
        handleDropView,
        handleRepairAllBrokenViews,
        setSelectedCategory,
        setSelectedDrawerRow,
        setActionMessage
    } = useOperationalDashboardState({
        projectId,
        projectNumber,
        datasetId,
        tables,
        onRefreshTables
    });

    const categories = [
        { id: 'all', label: 'All Analytics Views' },
        { id: 'user_activity', label: 'User Activity', viewId: 'v_consolidated_user_activity' },
        { id: 'telemetry', label: 'GenAI Telemetry & Tokens', viewId: 'v_gemini_genai_telemetry' },
        { id: 'connectors', label: 'Connector Usage', viewId: 'v_user_connector_usage_30d' },
        { id: 'choices', label: 'AI Model Choices', viewId: 'v_consolidated_ai_choices' },
        { id: 'feedback', label: 'Agent Feedback', viewId: 'v_agent_feedback' }
    ];

    const showView = (id: string) => selectedCategory === 'all' || selectedCategory === id;

    return (
        <div className="space-y-6">
            {/* Header Banner & Status */}
            <div className="bg-gray-800 p-5 rounded-xl border border-gray-700 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <h2 className="text-xl font-bold text-white tracking-tight">
                                Extended Operational Analytics
                            </h2>
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-900/50 text-blue-300 border border-blue-700">
                                Recharts Native
                            </span>
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 font-mono">
                                11 Dedicated Views
                            </span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1.5 flex items-center flex-wrap gap-x-2 gap-y-1">
                            {datasetId ? (
                                <>
                                    <span>
                                        Target BigQuery Dataset:{' '}
                                        <code className="text-green-400 font-mono font-semibold">{datasetId}</code> (
                                        <strong className={installedViews.size > 0 ? 'text-emerald-400' : 'text-amber-400'}>
                                            {installedViews.size} of 11 Views deployed
                                        </strong>
                                        )
                                    </span>
                                    {installedViews.size < 11 && (
                                        <span className="text-amber-300/90 flex items-center gap-1 font-medium">
                                            <span>•</span>
                                            <span>
                                                Views labeled <strong className="text-amber-300">MOCK</strong> display simulated data until created in this dataset.
                                            </span>
                                        </span>
                                    )}
                                </>
                            ) : (
                                'No BigQuery dataset identified from log sinks. Showing offline mock analytics.'
                            )}
                        </div>
                    </div>

                    {/* View Switcher Controls */}
                    <div className="flex items-center gap-2.5 flex-wrap self-start md:self-center">
                        {/* Global Overview Tab */}
                        <button
                            type="button"
                            onClick={() => handleViewChange('overview')}
                            className={`px-3.5 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 transition-all ${
                                activeViewId === 'overview'
                                    ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-400/50'
                                    : 'bg-gray-900 text-gray-300 hover:bg-gray-750 hover:text-white border border-gray-700'
                            }`}
                        >
                            <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                            </svg>
                            <span>Global Overview</span>
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                        </button>

                        {/* Detailed Views Dropdown Selector */}
                        <div className="relative">
                            <select
                                aria-label="Select Operational View"
                                value={activeViewId === 'overview' ? '' : activeViewId}
                                onChange={(e) => {
                                    if (e.target.value) handleViewChange(e.target.value);
                                }}
                                className={`bg-gray-900 border text-xs rounded-lg pl-3 pr-8 py-2 font-medium cursor-pointer transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none appearance-none ${
                                    activeViewId !== 'overview'
                                        ? 'border-blue-500 text-white bg-blue-950/40 ring-1 ring-blue-500/50 font-semibold'
                                        : 'border-gray-700 text-gray-300 hover:border-gray-600 hover:text-white'
                                }`}
                            >
                                <option value="" disabled>
                                    📊 Jump to Detailed View (11 Views)...
                                </option>
                                {VIEW_CATEGORIES.filter(cat => cat.title !== 'Dashboard').map((category) => (
                                    <optgroup key={category.title} label={`── ${category.title} ──`} className="bg-gray-800 text-gray-400 font-semibold">
                                        {category.items.map((item) => {
                                            const isInstalled = installedViews.has(item.id);
                                            return (
                                                <option
                                                    key={item.id}
                                                    value={item.id}
                                                    className="bg-gray-900 text-gray-100 py-1"
                                                >
                                                    {isInstalled ? '🟢 ' : '🟡 '}{item.title} [{isInstalled ? 'Live' : 'Mock'}]
                                                </option>
                                            );
                                        })}
                                    </optgroup>
                                ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-gray-400">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>

                        {activeViewId !== 'overview' && (
                            <button
                                type="button"
                                onClick={() => handleViewChange('overview')}
                                className="px-3 py-2 bg-gray-700 hover:bg-gray-650 text-gray-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
                                title="Return to Global Overview"
                            >
                                <span>← Overview</span>
                            </button>
                        )}
                    </div>
                </div>

                {activeViewId === 'overview' && (
                    <div className="mt-4 pt-3.5 border-t border-gray-700/60 flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mr-1.5 flex items-center gap-1">
                                <svg className="w-3.5 h-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                                </svg>
                                Filter Charts:
                            </span>
                            {categories.map((cat) => (
                                <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => setSelectedCategory(cat.id)}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                                        selectedCategory === cat.id
                                            ? 'bg-blue-600 text-white shadow-sm font-semibold'
                                            : 'bg-gray-900 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-700'
                                    }`}
                                >
                                    {cat.label}
                                </button>
                            ))}
                        </div>

                        <div className="text-[11px] text-gray-400 font-mono hidden sm:flex items-center gap-3">
                            <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                                Live View
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>
                                Mock Fallback
                            </span>
                        </div>
                    </div>
                )}

                {actionMessage && (
                    <div
                        className={`mt-4 p-3 rounded-lg text-xs flex items-center justify-between ${
                            actionMessage.type === 'success'
                                ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300'
                                : 'bg-rose-950/80 border border-rose-800 text-rose-300'
                        }`}
                    >
                        <span>{actionMessage.text}</span>
                        <button
                            type="button"
                            onClick={() => setActionMessage(null)}
                            className="text-gray-400 hover:text-white font-bold ml-3"
                        >
                            ×
                        </button>
                    </div>
                )}

                {brokenViews.size > 0 && (
                    <div className="mt-4 p-3.5 bg-amber-950/40 border border-amber-800/80 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-200">
                        <div className="flex items-center gap-3">
                            <svg className="w-5 h-5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <div>
                                <p className="text-xs font-semibold text-white">
                                    {brokenViews.size} BigQuery view{brokenViews.size > 1 ? 's have' : ' has'} schema errors in BigQuery
                                </p>
                                <p className="text-[11px] text-amber-300/80 mt-0.5">
                                    Click repair to deploy updated view definitions with tool call argument extraction.
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            disabled={operatingViewId !== null}
                            onClick={handleRepairAllBrokenViews}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded shadow transition-colors shrink-0 disabled:opacity-50"
                        >
                            {operatingViewId === 'all' ? 'Repairing Views...' : 'Repair All Views'}
                        </button>
                    </div>
                )}
            </div>

            {/* Main Content Area */}
            <div className="w-full">
                {activeViewId === 'overview' ? (
                    <div className="space-y-6">
                        <OverviewKpiCards
                            isUserActivityLive={isUserActivityLive}
                            totalInteractions={totalInteractions}
                            isGenAiTelemetryLive={isGenAiTelemetryLive}
                            totalTelemetry={totalTelemetry}
                            tokensTrackedStr={tokensTrackedStr}
                            isConnectorUsageLive={isConnectorUsageLive}
                            activeConnectorsCount={activeConnectorsCount}
                        />

                        <OverviewChartsGrid
                            showView={showView}
                            installedViews={installedViews}
                            installedViewsMap={installedViewsMap}
                            operatingViewId={operatingViewId}
                            brokenViews={brokenViews}
                            handleCreateView={handleCreateView}
                            handleDropView={handleDropView}
                            handleViewChange={handleViewChange}
                            projectId={projectId}
                            datasetId={datasetId}
                            tableNames={tableNames}
                            dailyActivityData={dailyActivityData}
                            agentPopularityData={agentPopularityData}
                            genaiTokensData={genaiTokensData}
                            toolInvocationsData={toolInvocationsData}
                            connectorUsageData={connectorUsageData}
                            topConnectorUsersData={topConnectorUsersData}
                            aiChoicesData={aiChoicesData}
                            agentFeedbackData={agentFeedbackData}
                        />

                        {/* Explore All 11 Views Directory */}
                        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 shadow-sm space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-base font-bold text-white tracking-tight">
                                        Operational Views Directory
                                    </h3>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        Click any card to launch the interactive DataTable and deep-dive drawer
                                    </p>
                                </div>
                                <span className="text-xs font-mono px-2 py-1 rounded bg-gray-800 text-gray-300 border border-gray-700">
                                    11 Views Available
                                </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                                {Object.values(OPERATIONAL_VIEWS).map((vDef) => {
                                    const isDepl = installedViews.has(vDef.id);
                                    const sourceTables = getViewSourceTables(vDef.id);
                                    return (
                                        <div
                                            key={vDef.id}
                                            onClick={() => handleViewChange(vDef.id)}
                                            className="p-3.5 bg-gray-950/70 border border-gray-800 hover:border-blue-600/70 hover:bg-gray-900/90 rounded-lg cursor-pointer transition-all group flex flex-col justify-between"
                                        >
                                            <div>
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <span className="text-[10px] uppercase font-semibold text-blue-400 font-mono tracking-wider">
                                                        {vDef.category}
                                                    </span>
                                                    {isDepl ? (
                                                        <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 uppercase">
                                                            LIVE
                                                        </span>
                                                    ) : (
                                                        <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-amber-500/15 text-amber-400 border border-amber-500/40 uppercase">
                                                            MOCK
                                                        </span>
                                                    )}
                                                </div>
                                                <h4 className="text-sm font-semibold text-white group-hover:text-blue-400 transition-colors">
                                                    {vDef.title}
                                                </h4>
                                                <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                                                    {vDef.description}
                                                </p>

                                                {/* Underlying Tables */}
                                                <div className="mt-2.5 pt-2 border-t border-gray-900">
                                                    <span className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                                                        Source Tables:
                                                    </span>
                                                    <div className="flex flex-wrap gap-1">
                                                        {sourceTables.slice(0, 2).map((t) => (
                                                            <code
                                                                key={t}
                                                                className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-gray-900 border border-gray-800 text-amber-300 truncate max-w-[200px]"
                                                                title={t}
                                                            >
                                                                {t}
                                                            </code>
                                                        ))}
                                                        {sourceTables.length > 2 && (
                                                            <span className="text-[9px] text-gray-500 font-mono self-center">
                                                                +{sourceTables.length - 2} more
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="mt-3 pt-2.5 border-t border-gray-800/80 flex items-center justify-between text-[11px] text-gray-500 group-hover:text-blue-400 transition-colors">
                                                <span className="font-mono">{vDef.columns.length} columns</span>
                                                <span className="font-medium flex items-center gap-1">
                                                    Inspect Table →
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                ) : (
                    <IndividualViewDetail
                        viewId={activeViewId}
                        data={viewRows[activeViewId] || (installedViews.has(activeViewId) ? [] : (FALLBACK_SNAPSHOT.rows[activeViewId] || []))}
                        projectId={projectId}
                        datasetId={datasetId}
                        installedViews={installedViews}
                        installedViewsMap={installedViewsMap}
                        operatingViewId={operatingViewId}
                        brokenViews={brokenViews}
                        tableNames={tableNames}
                        onCreateView={handleCreateView}
                        onDropView={handleDropView}
                        onBackToOverview={() => handleViewChange('overview')}
                        onRowClick={(row) => setSelectedDrawerRow(row)}
                        isLoading={rowsLoading[activeViewId]}
                        overviewLiveData={liveData}
                    />
                )}
            </div>

            {/* Slide-over Detail Drawer */}
            <DetailDrawer
                isOpen={!!selectedDrawerRow}
                onClose={() => setSelectedDrawerRow(null)}
                data={selectedDrawerRow}
                title={
                    activeViewId !== 'overview' && OPERATIONAL_VIEWS[activeViewId]
                        ? `${OPERATIONAL_VIEWS[activeViewId].title} Details`
                        : 'Log Record Details'
                }
            />
        </div>
    );
};

export default OperationalAnalyticsDashboard;
