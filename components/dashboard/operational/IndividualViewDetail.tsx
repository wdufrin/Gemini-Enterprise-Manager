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
import { ViewControlHeader } from './ViewControlHeader';
import { DataTable } from './DataTable';
import { OPERATIONAL_VIEWS, ViewDefinition } from './analyticsData';
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
