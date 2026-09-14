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

import React, { useState, useMemo } from 'react';
import {
    OPERATIONAL_VIEWS_METADATA,
    KPI_METRICS_INFO,
    CHARTS_METADATA,
    ViewMetadata,
    MetricDefinition,
    ChartMetadata
} from './analyticsMetadata';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    activeDatasetId?: string;
}

export const ObservabilityDataDictionaryModal: React.FC<Props> = ({
    isOpen,
    onClose,
    activeDatasetId
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'views' | 'metrics' | 'tables'>('views');
    const [selectedViewId, setSelectedViewId] = useState<string>('v_consolidated_user_activity');
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    const handleCopy = (text: string, key: string) => {
        navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 1800);
    };

    const viewsList = useMemo(() => Object.values(OPERATIONAL_VIEWS_METADATA), []);
    const metricsList = useMemo(() => Object.values(KPI_METRICS_INFO), []);
    const chartsList = useMemo(() => Object.values(CHARTS_METADATA), []);

    // Filtered lists based on search query
    const filteredViews = useMemo(() => {
        if (!searchQuery) return viewsList;
        const q = searchQuery.toLowerCase();
        return viewsList.filter(
            (v) =>
                v.title.toLowerCase().includes(q) ||
                v.viewName.toLowerCase().includes(q) ||
                v.description.toLowerCase().includes(q) ||
                v.sourceTables.some((t) => t.toLowerCase().includes(q)) ||
                v.keyMetrics.some(
                    (m) => m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)
                )
        );
    }, [viewsList, searchQuery]);

    const filteredMetrics = useMemo(() => {
        if (!searchQuery) return metricsList;
        const q = searchQuery.toLowerCase();
        return metricsList.filter(
            (m) =>
                m.label.toLowerCase().includes(q) ||
                m.whatItShows.toLowerCase().includes(q) ||
                m.meaning.toLowerCase().includes(q) ||
                (m.formula && m.formula.toLowerCase().includes(q)) ||
                m.sourceTables.some((t) => t.toLowerCase().includes(q))
        );
    }, [metricsList, searchQuery]);

    // Table matrix: map each source table to views that use it
    const tableMatrix = useMemo(() => {
        const map = new Map<string, { views: string[]; charts: string[]; description: string; tableType: string }>();

        // Register default known tables
        map.set('discoveryengine_googleapis_com_gemini_enterprise_user_activity_*', {
            views: ['Live Activity Dashboard', 'v_consolidated_user_activity'],
            charts: ['Request Volume', 'Agent Activity Breakdown', 'Top Agents Visualized', 'Daily Interaction Volume', 'Agent Popularity Share'],
            description: 'Core partitioned log sink table recording all user interactions, StreamAssist queries, and Search calls.',
            tableType: 'Raw BQ Sync Table (Log Router Sink)'
        });
        map.set('_AllLogs', {
            views: ['v_gemini_assist_activity', 'v_gemini_search_activity', 'v_gemini_genai_telemetry', 'v_user_connector_usage', 'v_agent_feedback', 'v_admin_feedback_review', 'v_agent_feedback_detailed'],
            charts: ['Token Consumption by Agent', 'Tool Invocations by Tool Name', 'Invocations by Connector', 'Top Connector Users', 'Feedback Ratings per Agent', 'Quality & Satisfaction Summary'],
            description: 'Standard linked log analytics dataset containing Google Cloud Logging entries for GenAI model inferences and user activity.',
            tableType: 'Raw BQ Sync Table (Log Analytics / Linked Dataset)'
        });
        map.set('discoveryengine_googleapis_com_gen_ai_user_message_*', {
            views: ['v_consolidated_user_messages'],
            charts: ['Message Turn Distribution'],
            description: 'Turn histories containing message parts, roles, and timestamp partitions.',
            tableType: 'Raw BQ Sync Table (Log Router Sink)'
        });
        map.set('discoveryengine_googleapis_com_gen_ai_choice_*', {
            views: ['v_consolidated_ai_choices'],
            charts: ['Model Finish Reasons Breakdown', 'Choice Frequency'],
            description: 'Candidate generation outputs and termination flags (STOP, MAX_TOKENS, SAFETY).',
            tableType: 'Raw BQ Sync Table (Log Router Sink)'
        });
        map.set('v_user_connector_usage', {
            views: ['v_user_connector_usage_30d'],
            charts: ['Invocations by Connector', 'Top Connector Users'],
            description: 'Consolidated view grouping tool calls and search sources into normalized connector identities. Backed upstream by _AllLogs.',
            tableType: 'Derived Operational View (Backed by _AllLogs)'
        });
        map.set('gemini_assist_activity', {
            views: ['v_consolidated_user_activity (optional)', 'v_gemini_assist_activity (optional)'],
            charts: ['Daily Interaction Volume', 'Agent Popularity Share'],
            description: 'Specialized pre-aggregated table for Gemini Enterprise assist calls.',
            tableType: 'Optional Pre-aggregated Table'
        });
        map.set('gemini_genai_telemetry', {
            views: ['v_gemini_genai_telemetry (optional)', 'v_consolidated_ai_choices (optional)'],
            charts: ['Token Consumption by Agent', 'Finish Reasons'],
            description: 'Pre-joined inference telemetry table with model tokens and finish reasons.',
            tableType: 'Optional Pre-aggregated Table'
        });

        return Array.from(map.entries()).map(([tableName, info]) => ({
            tableName,
            ...info
        }));
    }, []);

    const filteredTables = useMemo(() => {
        if (!searchQuery) return tableMatrix;
        const q = searchQuery.toLowerCase();
        return tableMatrix.filter(
            (t) =>
                t.tableName.toLowerCase().includes(q) ||
                t.description.toLowerCase().includes(q) ||
                t.views.some((v) => v.toLowerCase().includes(q))
        );
    }, [tableMatrix, searchQuery]);

    const activeView = useMemo(() => {
        return OPERATIONAL_VIEWS_METADATA[selectedViewId] || viewsList[0];
    }, [selectedViewId, viewsList]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-hidden animate-in fade-in duration-200">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
                {/* Modal Header */}
                <div className="p-5 border-b border-gray-800 flex items-center justify-between bg-gray-950/60">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                                Observability Data Dictionary &amp; Tables Reference
                            </h3>
                            <p className="text-xs text-gray-400">
                                Detailed definitions of what each metric means, what each chart displays, and which BigQuery tables back each view.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {activeDatasetId && (
                            <span className="text-xs bg-gray-800 border border-gray-700 px-2.5 py-1 rounded text-gray-300 font-mono hidden sm:inline-block">
                                Dataset: <strong className="text-green-400">{activeDatasetId}</strong>
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Subheader Toolbar with Search & Tabs */}
                <div className="px-5 py-3 border-b border-gray-800 bg-gray-900 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5 bg-gray-950 p-1 rounded-lg border border-gray-800">
                        <button
                            type="button"
                            onClick={() => setActiveTab('views')}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                                activeTab === 'views'
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'text-gray-400 hover:text-white'
                            }`}
                        >
                            Views &amp; Tables ({viewsList.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('metrics')}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                                activeTab === 'metrics'
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'text-gray-400 hover:text-white'
                            }`}
                        >
                            KPIs &amp; Charts ({metricsList.length + chartsList.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('tables')}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                                activeTab === 'tables'
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'text-gray-400 hover:text-white'
                            }`}
                        >
                            Source Tables Matrix ({tableMatrix.length})
                        </button>
                    </div>

                    <div className="relative flex-1 max-w-sm">
                        <input
                            type="text"
                            placeholder="Search metrics, tables, formulas, or views..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-gray-950 border border-gray-700 text-xs text-white rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-blue-500"
                        />
                        <svg className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-1.5 text-gray-400 hover:text-white text-xs"
                            >
                                ×
                            </button>
                        )}
                    </div>
                </div>

                {/* Main Content Body */}
                <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                    {activeTab === 'views' && (
                        <>
                            {/* Left View Selector */}
                            <div className="w-full md:w-72 border-r border-gray-800 bg-gray-950/40 overflow-y-auto p-3 space-y-1 custom-scrollbar">
                                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-2 py-1">
                                    Operational Views ({filteredViews.length})
                                </div>
                                {filteredViews.map((v) => {
                                    const isSelected = v.id === selectedViewId;
                                    return (
                                        <button
                                            key={v.id}
                                            type="button"
                                            onClick={() => setSelectedViewId(v.id)}
                                            className={`w-full text-left p-2.5 rounded-lg text-xs transition-all flex flex-col gap-1 ${
                                                isSelected
                                                    ? 'bg-blue-600/20 border border-blue-500/80 text-white font-semibold'
                                                    : 'hover:bg-gray-800/60 text-gray-300 border border-transparent'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="truncate">{v.title}</span>
                                                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-gray-800 text-gray-400 shrink-0">
                                                    {v.category}
                                                </span>
                                            </div>
                                            <code className="text-[10px] font-mono text-blue-400 truncate">
                                                {v.viewName}
                                            </code>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Right View Inspector */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                                <div>
                                    <div className="flex items-center justify-between flex-wrap gap-2 mb-1.5">
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-xl font-bold text-white tracking-tight">
                                                {activeView.title}
                                            </h4>
                                            <span className="text-xs px-2 py-0.5 rounded bg-blue-900/40 text-blue-300 border border-blue-700/50">
                                                {activeView.category}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleCopy(activeView.viewName, 'view-name')}
                                            className="text-xs font-mono px-2.5 py-1 rounded bg-gray-800 text-gray-300 hover:text-white border border-gray-700 transition-colors flex items-center gap-1.5"
                                        >
                                            <span>{copiedKey === 'view-name' ? 'Copied!' : activeView.viewName}</span>
                                            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                            </svg>
                                        </button>
                                    </div>
                                    <p className="text-sm text-gray-300 leading-relaxed">
                                        {activeView.description}
                                    </p>
                                </div>

                                {/* Source Tables Section */}
                                <div className="p-4 bg-gray-950 rounded-xl border border-gray-800 space-y-3">
                                    <div>
                                        <div className="flex items-center gap-2 text-xs font-semibold text-cyan-400 uppercase tracking-wider mb-2">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2 1.5 3 3.5 3h9c2 0 3.5-1 3.5-3V7c0-2-1.5-3-3.5-3h-9C5.5 4 4 5 4 7zM4 7c0 2 1.5 3 3.5 3h9c2 0 3.5-1 3.5-3M4 12c0 2 1.5 3 3.5 3h9c2 0 3.5-1 3.5-3" />
                                            </svg>
                                            <span>Raw BQ Sync Table(s) from Cloud Logging:</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {(activeView.rawSyncTables || activeView.sourceTables).map((tbl) => (
                                                <div
                                                    key={tbl}
                                                    className="flex items-center gap-1.5 bg-cyan-950/40 px-2.5 py-1 rounded border border-cyan-800/60 text-xs font-mono text-cyan-300"
                                                >
                                                    <span>{tbl}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCopy(tbl, `tbl-${tbl}`)}
                                                        className="text-gray-400 hover:text-white"
                                                        title="Copy table name"
                                                    >
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {activeView.sourceTables.length > 0 && activeView.sourceTables[0] !== (activeView.rawSyncTables && activeView.rawSyncTables[0]) && (
                                        <div>
                                            <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider block mb-1.5">
                                                Direct View Dependency:
                                            </span>
                                            <div className="flex flex-wrap gap-1.5">
                                                {activeView.sourceTables.map((tbl) => (
                                                    <div
                                                        key={tbl}
                                                        className="flex items-center gap-1.5 bg-gray-900 px-2 py-0.5 rounded border border-gray-700 text-xs font-mono text-amber-300"
                                                    >
                                                        <span>{tbl}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {activeView.logFilters && activeView.logFilters.length > 0 && (
                                        <div>
                                            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
                                                Log Router Sink Filters Applied:
                                            </span>
                                            <div className="flex flex-wrap gap-1.5">
                                                {activeView.logFilters.map((lf, i) => (
                                                    <span
                                                        key={i}
                                                        className="px-2 py-0.5 rounded text-[11px] font-mono bg-gray-900 text-gray-300 border border-gray-800"
                                                    >
                                                        {lf}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <p className="text-xs text-gray-400 pt-1 border-t border-gray-800/80">
                                        {activeView.primarySourceDescription}
                                    </p>
                                </div>

                                {/* Key Metrics & Columns Section */}
                                <div>
                                    <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                                        Metrics &amp; Column Dictionary
                                    </h5>
                                    <div className="grid grid-cols-1 gap-2.5">
                                        {activeView.keyMetrics.map((km) => (
                                            <div
                                                key={km.name}
                                                className="p-3 bg-gray-950/70 border border-gray-800 rounded-lg text-xs space-y-1"
                                            >
                                                <div className="flex items-center justify-between flex-wrap gap-1">
                                                    <code className="font-mono text-blue-400 font-bold">
                                                        {km.name}
                                                    </code>
                                                    {km.formula && (
                                                        <code className="text-[10px] font-mono text-purple-300 bg-purple-950/40 px-2 py-0.5 rounded border border-purple-800/50">
                                                            {km.formula}
                                                        </code>
                                                    )}
                                                </div>
                                                <p className="text-gray-300 text-[11px] leading-relaxed">
                                                    {km.description}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {activeTab === 'metrics' && (
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                            <div>
                                <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
                                    Summary KPI Boxes ({filteredMetrics.length})
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                    {filteredMetrics.map((m) => (
                                        <div
                                            key={m.id}
                                            className="p-4 bg-gray-950 rounded-xl border border-gray-800 space-y-2 text-xs"
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="font-bold text-white text-sm">
                                                    {m.label}
                                                </span>
                                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                                                    KPI Box
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider block">
                                                    What it shows:
                                                </span>
                                                <p className="text-gray-300 text-[11px] mt-0.5">
                                                    {m.whatItShows}
                                                </p>
                                            </div>
                                            <div>
                                                <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider block">
                                                    Metric Meaning:
                                                </span>
                                                <p className="text-gray-300 text-[11px] mt-0.5">
                                                    {m.meaning}
                                                </p>
                                            </div>
                                            {m.formula && (
                                                <div>
                                                    <span className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider block">
                                                        Formula:
                                                    </span>
                                                    <code className="block bg-gray-900 px-2 py-1 rounded font-mono text-[10px] text-purple-300 mt-0.5 break-all border border-gray-800">
                                                        {m.formula}
                                                    </code>
                                                </div>
                                            )}
                                            <div>
                                                <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider block">
                                                    Tables Used:
                                                </span>
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {m.sourceTables.map((t) => (
                                                        <code
                                                            key={t}
                                                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-900 text-amber-300 border border-gray-800"
                                                        >
                                                            {t}
                                                        </code>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
                                    Observability Charts ({chartsList.length})
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                    {chartsList.map((c) => (
                                        <div
                                            key={c.id}
                                            className="p-4 bg-gray-950 rounded-xl border border-gray-800 space-y-2 text-xs"
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="font-bold text-white text-sm">
                                                    {c.title}
                                                </span>
                                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-800 text-blue-300">
                                                    {c.category}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider block">
                                                    What it shows:
                                                </span>
                                                <p className="text-gray-300 text-[11px] mt-0.5">
                                                    {c.whatItShows}
                                                </p>
                                            </div>
                                            <div>
                                                <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider block">
                                                    Metric Meaning:
                                                </span>
                                                <p className="text-gray-300 text-[11px] mt-0.5">
                                                    {c.metricMeaning}
                                                </p>
                                            </div>
                                            <div>
                                                <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider block">
                                                    Underlying Tables:
                                                </span>
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {c.sourceTables.map((t) => (
                                                        <code
                                                            key={t}
                                                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-900 text-amber-300 border border-gray-800"
                                                        >
                                                            {t}
                                                        </code>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'tables' && (
                        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                            <div className="mb-2">
                                <h4 className="text-base font-bold text-white tracking-tight">
                                    Source Tables Dependency Matrix
                                </h4>
                                <p className="text-xs text-gray-400">
                                    Complete mapping of Google Cloud Logging and BigQuery sink tables to the Observability views and charts that rely on them.
                                </p>
                            </div>

                            <div className="space-y-3">
                                {filteredTables.map((tbl) => (
                                    <div
                                        key={tbl.tableName}
                                        className="p-4 bg-gray-950 rounded-xl border border-gray-800 space-y-2 text-xs"
                                    >
                                        <div className="flex items-center justify-between flex-wrap gap-2">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <code className="font-mono text-amber-400 font-bold text-sm bg-amber-950/30 px-2 py-0.5 rounded border border-amber-800/40">
                                                    {tbl.tableName}
                                                </code>
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 font-mono">
                                                    {tbl.tableType}
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleCopy(tbl.tableName, `tab-${tbl.tableName}`)}
                                                className="text-[11px] font-mono px-2 py-0.5 rounded bg-gray-800 text-gray-300 hover:text-white border border-gray-700"
                                            >
                                                {copiedKey === `tab-${tbl.tableName}` ? 'Copied!' : 'Copy Table Name'}
                                            </button>
                                        </div>
                                        <p className="text-gray-300 text-[11px] leading-relaxed">
                                            {tbl.description}
                                        </p>
                                        <div className="pt-2 border-t border-gray-900 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                                            <div>
                                                <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider block mb-1">
                                                    Views Powered:
                                                </span>
                                                <ul className="list-disc list-inside text-gray-300 space-y-0.5">
                                                    {tbl.views.map((v) => (
                                                        <li key={v}>{v}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                            <div>
                                                <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider block mb-1">
                                                    Charts / Visualizations:
                                                </span>
                                                <ul className="list-disc list-inside text-gray-300 space-y-0.5">
                                                    {tbl.charts.map((c) => (
                                                        <li key={c}>{c}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-800 bg-gray-950/60 flex items-center justify-between text-xs text-gray-400">
                    <div>
                        Tip: You can deploy any view directly into your BigQuery dataset using the <strong>Add View to BigQuery</strong> button on each section.
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xs font-semibold transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
