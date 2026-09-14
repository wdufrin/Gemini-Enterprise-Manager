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

import React, { useState } from 'react';
import { ViewControlHeader } from './ViewControlHeader';
import { DataTable } from './DataTable';
import { OPERATIONAL_VIEWS, ViewDefinition } from './analyticsData';
import { getViewMetadata } from './analyticsMetadata';
import { TelemetryAndConnectorPanels } from './view-panels/TelemetryAndConnectorPanels';
import { ActivityAndMessagePanels } from './view-panels/ActivityAndMessagePanels';
import { ChoicesAndFeedbackPanels } from './view-panels/ChoicesAndFeedbackPanels';

interface Props {
    viewId: string;
    data: any[];
    projectId: string;
    datasetId?: string;
    installedViews: Set<string>;
    installedViewsMap: Map<string, string>;
    operatingViewId: string | null;
    brokenViews: Map<string, string>;
    tableNames: Set<string>;
    onCreateView: (viewId: string) => Promise<void>;
    onDropView: (viewId: string) => Promise<void>;
    onBackToOverview: () => void;
    onRowClick: (row: any) => void;
    isLoading?: boolean;
    overviewLiveData?: any;
}

export const IndividualViewDetail: React.FC<Props> = ({
    viewId,
    data = [],
    projectId,
    datasetId,
    installedViews,
    installedViewsMap,
    operatingViewId,
    brokenViews,
    tableNames,
    onCreateView,
    onDropView,
    onBackToOverview,
    onRowClick,
    isLoading = false,
    overviewLiveData
}) => {
    const viewDef: ViewDefinition = OPERATIONAL_VIEWS[viewId];
    if (!viewDef) {
        return (
            <div className="p-8 text-center text-gray-500">
                <p>View &quot;{viewId}&quot; not found.</p>
                <button
                    onClick={onBackToOverview}
                    className="mt-3 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs"
                >
                    Back to Overview
                </button>
            </div>
        );
    }

    const isInstalled = installedViews.has(viewId);
    const actualViewName = installedViewsMap.get(viewId) || viewDef.viewName;
    const viewMeta = getViewMetadata(viewId);
    const [showMetricsGuide, setShowMetricsGuide] = useState(false);

    const renderAnalyticsContent = () => {
        switch (viewId) {
            case 'v_gemini_genai_telemetry':
            case 'v_user_connector_usage':
            case 'v_user_connector_usage_30d':
                return (
                    <TelemetryAndConnectorPanels
                        viewId={viewId}
                        data={data}
                        overviewLiveData={overviewLiveData}
                    />
                );

            case 'v_consolidated_user_activity':
            case 'v_consolidated_user_messages':
            case 'v_gemini_assist_activity':
            case 'v_gemini_search_activity':
                return (
                    <ActivityAndMessagePanels
                        viewId={viewId}
                        data={data}
                        overviewLiveData={overviewLiveData}
                    />
                );

            case 'v_consolidated_ai_choices':
            case 'v_admin_feedback_review':
            case 'v_agent_feedback':
            case 'v_agent_feedback_detailed':
                return (
                    <ChoicesAndFeedbackPanels
                        viewId={viewId}
                        data={data}
                        overviewLiveData={overviewLiveData}
                    />
                );

            default:
                return null;
        }
    };

    return (
        <div className="space-y-6">
            {/* Top Back Nav & Actions */}
            <div className="flex items-center justify-between">
                <button
                    type="button"
                    onClick={onBackToOverview}
                    className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    <span>Back to Global Overview</span>
                </button>

                <div className="text-xs text-gray-400">
                    Viewing:{' '}
                    <code className="text-blue-400 font-mono font-semibold">
                        {actualViewName}
                    </code>
                </div>
            </div>

            {/* View Control Header */}
            <div className="bg-gray-900 border border-gray-700/80 rounded-xl p-5 shadow-sm">
                <ViewControlHeader
                    title={viewDef.title}
                    subtitle={viewDef.description}
                    viewName={actualViewName}
                    datasetId={datasetId}
                    isInstalled={isInstalled}
                    isOperating={operatingViewId === viewId}
                    isBroken={brokenViews.has(viewId)}
                    errorMessage={brokenViews.get(viewId)}
                    onCreate={() => onCreateView(viewId)}
                    onDrop={() => onDropView(viewId)}
                    ddlQuery={viewDef.getDdl(projectId, datasetId || 'your_dataset', tableNames)}
                    selectQuery={viewDef.getQuery(projectId, datasetId || 'your_dataset')}
                />
            </div>

            {/* Underlying Tables & Key Metrics Reference Panel */}
            {viewMeta && (
                <div className="bg-gray-900 border border-gray-700/80 rounded-xl p-4 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start sm:items-center gap-3">
                            <div className="p-2 bg-blue-950/60 rounded-lg border border-blue-800/60 text-blue-400 shrink-0">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                                </svg>
                            </div>
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h4 className="text-xs font-semibold text-gray-200 uppercase tracking-wider">
                                        Underlying Tables & Key Metrics
                                    </h4>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 font-mono">
                                        {viewMeta.sourceTables.length} Source {viewMeta.sourceTables.length === 1 ? 'Table' : 'Tables'}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    {viewMeta.primarySourceDescription}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowMetricsGuide(!showMetricsGuide)}
                            className="text-xs font-medium text-blue-400 hover:text-blue-300 px-3 py-1.5 rounded-lg bg-gray-800/80 hover:bg-gray-800 border border-gray-700 transition-colors flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
                        >
                            <span>{showMetricsGuide ? 'Hide Metric Dictionary' : 'View Metric Dictionary'}</span>
                            <svg className={`w-3.5 h-3.5 transition-transform ${showMetricsGuide ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                    </div>

                    {/* Source Table Badges Strip */}
                    <div className="mt-3 pt-3 border-t border-gray-800/80 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap text-xs">
                            <span className="text-[11px] text-gray-400 font-medium">Raw BQ Sync Table(s):</span>
                            {viewMeta.rawSyncTables.map((tbl, i) => (
                                <span
                                    key={i}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-cyan-950/60 text-cyan-300 border border-cyan-800/70 shadow-sm"
                                    title="Underlying BigQuery table populated by Cloud Logging Log Router Sink"
                                >
                                    <svg className="w-3 h-3 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                                    </svg>
                                    {tbl}
                                </span>
                            ))}
                        </div>
                        {viewMeta.sourceTables.length > 0 && viewMeta.sourceTables[0] !== viewMeta.rawSyncTables[0] && (
                            <div className="flex items-center gap-2 flex-wrap text-xs">
                                <span className="text-[11px] text-gray-400 font-medium">Direct View Dependency:</span>
                                {viewMeta.sourceTables.map((tbl, i) => (
                                    <span
                                        key={i}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-gray-950 text-amber-300 border border-gray-800 shadow-sm"
                                    >
                                        {tbl}
                                    </span>
                                ))}
                            </div>
                        )}
                        {viewMeta.logFilters && viewMeta.logFilters.length > 0 && (
                            <div className="flex items-start gap-2 flex-wrap text-xs pt-1">
                                <span className="text-[11px] text-gray-400 font-medium shrink-0 mt-0.5">Log Router Sink Filters:</span>
                                <div className="flex flex-wrap gap-1.5">
                                    {viewMeta.logFilters.map((lf, i) => (
                                        <span
                                            key={i}
                                            className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono bg-gray-950 text-gray-300 border border-gray-800"
                                        >
                                            {lf}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Collapsible Key Metrics Table */}
                    {showMetricsGuide && (
                        <div className="mt-4 pt-4 border-t border-gray-800 space-y-3">
                            <div className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                                Key Metrics & Column Definitions in {actualViewName}
                            </div>
                            <div className="overflow-x-auto rounded-lg border border-gray-800">
                                <table className="min-w-full divide-y divide-gray-800 text-xs">
                                    <thead className="bg-gray-950/80">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-semibold text-gray-400 uppercase tracking-wider">Metric / Field</th>
                                            <th className="px-3 py-2 text-left font-semibold text-gray-400 uppercase tracking-wider">What it Means</th>
                                            <th className="px-3 py-2 text-left font-semibold text-gray-400 uppercase tracking-wider">SQL Expression / Logic</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-800/60 bg-gray-900/40">
                                        {viewMeta.keyMetrics.map((km, idx) => (
                                            <tr key={idx} className="hover:bg-gray-800/30 transition-colors">
                                                <td className="px-3 py-2 font-mono text-blue-300 font-semibold whitespace-nowrap">
                                                    {km.name}
                                                </td>
                                                <td className="px-3 py-2 text-gray-300">
                                                    {km.description}
                                                </td>
                                                <td className="px-3 py-2 font-mono text-gray-400 text-[11px] whitespace-pre-wrap break-all">
                                                    {km.formula || 'Direct field mapping'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* View Analytics Content */}
            {renderAnalyticsContent()}

            {/* Interactive DataTable */}
            <div className="bg-gray-900 border border-gray-700/80 rounded-xl p-5 shadow-sm space-y-3">
                <DataTable
                    title={`${viewDef.title} Records`}
                    subtitle="Click any row to inspect full JSON payloads, prompts, responses, and tool arguments."
                    columns={viewDef.columns}
                    data={data}
                    onRowClick={onRowClick}
                    isLoading={isLoading}
                />
            </div>
        </div>
    );
};

export default IndividualViewDetail;
