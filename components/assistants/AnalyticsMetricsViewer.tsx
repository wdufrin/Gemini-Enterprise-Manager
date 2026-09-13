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


import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Config } from '../../types';
import * as api from '../../services/apiService';
import { toErrorMessage } from '../../utils/errors';
import Spinner from '../Spinner';

interface AnalyticsMetricsViewerProps {
    config: Config;
}

interface LeaderboardItem {
    agentId: string;
    users: number;
    sessions: number;
}

const AnalyticsMetricsViewer: React.FC<AnalyticsMetricsViewerProps> = ({ config }) => {
    const [datasets, setDatasets] = useState<api.BigQueryDataset[]>([]);
    const [tables, setTables] = useState<api.BigQueryTable[]>([]);
    const [selectedDataset, setSelectedDataset] = useState('');
    const [selectedTable, setSelectedTable] = useState('');
    
    const [queryResults, setQueryResults] = useState<api.BigQueryQueryResponse | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch Datasets on Mount
    useEffect(() => {
        const fetchDatasets = async () => {
            if (!config.projectId) return;
            try {
                const res = await api.listBigQueryDatasets(config.projectId);
                setDatasets(res.datasets || []);
            } catch (e) {
                console.error("Failed to load datasets", e);
            }
        };
        fetchDatasets();
    }, [config.projectId]);

    // Fetch Tables when Dataset changes
    useEffect(() => {
        const fetchTables = async () => {
            if (!selectedDataset || !config.projectId) {
                setTables([]);
                return;
            }
            try {
                const res = await api.listBigQueryTables(config.projectId, selectedDataset);
                setTables(res.tables || []);
            } catch (e) {
                console.error("Failed to load tables", e);
                setTables([]);
            }
        };
        fetchTables();
    }, [selectedDataset, config.projectId]);

    const handleRunQuery = useCallback(async () => {
        if (!selectedDataset || !selectedTable) return;
        
        setIsLoading(true);
        setError(null);
        setQueryResults(null);

        const query = `SELECT * FROM \`${config.projectId}.${selectedDataset}.${selectedTable}\` LIMIT 50`;

        try {
            const result = await api.runBigQueryQuery(config.projectId, query);
            setQueryResults(result);
        } catch (err: unknown) {
            setError(toErrorMessage(err) || "Failed to run query.");
        } finally {
            setIsLoading(false);
        }
    }, [config.projectId, selectedDataset, selectedTable]);

    // Parse metrics for the Agent Dashboard
    const parsedMetrics = useMemo(() => {
        if (!queryResults || !queryResults.rows || queryResults.rows.length === 0) return null;

        const fields = queryResults.schema?.fields?.map((f: { name: string }) => f.name.toLowerCase()) || [];
        
        // Try to identify specific columns for the Leaderboard
        let agentIdIdx = fields.findIndex((f: string) => f.includes('agent') || f.includes('name') || f.includes('id'));
        let mauIdx = fields.findIndex((f: string) => f.includes('mau') || f.includes('user') || f.includes('active'));
        let sessionsIdx = fields.findIndex((f: string) => f.includes('session') || f.includes('quer') || f.includes('count') || f.includes('total'));

        // Fallbacks based on data types if names don't match
        if (agentIdIdx === -1) {
            agentIdIdx = queryResults.schema?.fields?.findIndex((f: { type: string }) => f.type === 'STRING') ?? -1;
        }
        if (agentIdIdx === -1) agentIdIdx = 0; // Ultimate fallback to first column
        
        const numericIndices = (queryResults.schema?.fields || [])
            .map((f: { type: string }, idx: number) => ({ type: f.type, idx }))
            .filter((f: { type: string }) => f.type === 'INTEGER' || f.type === 'FLOAT' || f.type === 'NUMERIC')
            .map((f: { idx: number }) => f.idx);

        if (sessionsIdx === -1 && numericIndices.length > 0) {
            sessionsIdx = numericIndices[0];
        }
        if (mauIdx === -1 && numericIndices.length > 1) {
            mauIdx = numericIndices[1];
        } else if (mauIdx === -1 && numericIndices.length > 0) {
            mauIdx = numericIndices[0]; 
        }

        const uniqueAgents = new Set<string>();
        let totalSessions = 0;
        
        const leaderboardData: LeaderboardItem[] = queryResults.rows.map((row: { f: Array<{ v: unknown }> }) => {
            const getVal = (idx: number) => idx >= 0 && row.f[idx] ? row.f[idx].v : null;
            
            const agentId = (getVal(agentIdIdx) as string) || 'Unknown Agent';
            const users = getVal(mauIdx) ? parseInt(String(getVal(mauIdx)), 10) : 0;
            const sessions = getVal(sessionsIdx) ? parseInt(String(getVal(sessionsIdx)), 10) : 1; // Default to 1 if just counting rows

            uniqueAgents.add(String(agentId));
            totalSessions += sessions;

            return { agentId: String(agentId), users, sessions };
        });

        // Group by agentId to aggregate if there are multiple rows per agent
        const aggregatedMap = new Map<string, { agentId: string, users: number, sessions: number }>();
        for (const row of leaderboardData) {
            const key = String(row.agentId);
            if (aggregatedMap.has(key)) {
                const existing = aggregatedMap.get(key)!;
                aggregatedMap.set(key, { ...existing, users: existing.users + row.users, sessions: existing.sessions + row.sessions });
            } else {
                aggregatedMap.set(key, row);
            }
        }

        const aggregatedLeaderboard = Array.from(aggregatedMap.values());

        // Sort leaderboard by sessions descending
        aggregatedLeaderboard.sort((a: LeaderboardItem, b: LeaderboardItem) => b.sessions - a.sessions);

        return {
            leaderboard: aggregatedLeaderboard.slice(0, 10), // Top 10
            totalAgents: uniqueAgents.size,
            totalSessions
        };

    }, [queryResults]);

    return (
        <div className="bg-gray-800 shadow-xl rounded-lg p-6 flex flex-col h-full border border-gray-700 mt-6">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-white">Analytics Metrics (BigQuery)</h2>
            </div>

            <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Dataset</label>
                        <select 
                            value={selectedDataset} 
                            onChange={(e) => { setSelectedDataset(e.target.value); setSelectedTable(''); }}
                            className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white"
                        >
                            <option value="">-- Select Dataset --</option>
                            {datasets.map(d => (
                                <option key={d.datasetReference.datasetId} value={d.datasetReference.datasetId}>
                                    {d.datasetReference.datasetId}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Table</label>
                        <select 
                            value={selectedTable} 
                            onChange={(e) => setSelectedTable(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white"
                            disabled={!selectedDataset}
                        >
                            <option value="">-- Select Table --</option>
                            {tables.map(t => (
                                <option key={t.tableReference.tableId} value={t.tableReference.tableId}>
                                    {t.tableReference.tableId}
                                </option>
                            ))}
                        </select>
                    </div>
                    <button 
                        onClick={handleRunQuery} 
                        disabled={isLoading || !selectedTable}
                        className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed h-[40px]"
                    >
                        {isLoading ? 'Running...' : 'View Metrics'}
                    </button>
                </div>
            </div>

            {error && <div className="p-4 bg-red-900/20 text-red-300 rounded-lg border border-red-800 mb-4">{error}</div>}

            {isLoading && <div className="p-8"><Spinner /></div>}

            {queryResults && parsedMetrics && (
                <div className="space-y-6">
                    {/* --- Agent Dashboard --- */}
                    <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 shadow-md">
                        <div className="mb-6">
                             <h3 className="text-xl font-medium text-white mb-2">Agent Dashboard</h3>
                             <p className="text-sm text-gray-400">This dashboard contains metrics related to individual agents. Note that the Month Filter only supports monthly date ranges. Any other date range will cause the metric values to be incorrect.</p>
                             <div className="mt-3 flex items-center gap-2 text-xs text-red-400 bg-red-900/10 p-2 rounded border border-red-900/30 w-fit">
                                 <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                 The &quot;Month Filter&quot; only supports monthly date ranges.
                             </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                             {/* Leaderboard */}
                             <div className="lg:col-span-2 border border-gray-700 rounded-lg overflow-hidden flex flex-col">
                                 <div className="bg-gray-800 text-center py-2 text-sm font-semibold text-gray-300 border-b border-gray-700">
                                     Leaderboard
                                 </div>
                                 <div className="overflow-x-auto flex-1 bg-gray-900">
                                     <table className="min-w-full text-xs text-left">
                                         <thead className="text-gray-400 bg-gray-800/50">
                                             <tr>
                                                 <th className="px-4 py-2 w-12 text-center">#</th>
                                                 <th className="px-4 py-2 font-mono">Agent ID</th>
                                                 <th className="px-4 py-2 text-right">Monthly Active Users</th>
                                                 <th className="px-4 py-2 text-right">Monthly Chat Sessions</th>
                                             </tr>
                                         </thead>
                                         <tbody className="divide-y divide-gray-800 text-gray-300">
                                             {parsedMetrics.leaderboard.map((row: LeaderboardItem, i: number) => (
                                                 <tr key={i} className="hover:bg-gray-800/50">
                                                     <td className="px-4 py-2 text-center text-gray-500">{i + 1}</td>
                                                     <td className="px-4 py-2 font-mono truncate max-w-[200px]" title={row.agentId}>{row.agentId}</td>
                                                     <td className="px-4 py-2 text-right">{row.users.toLocaleString()}</td>
                                                     <td className="px-4 py-2 text-right">{row.sessions.toLocaleString()}</td>
                                                 </tr>
                                             ))}
                                         </tbody>
                                     </table>
                                 </div>
                             </div>

                             {/* Monthly Overview */}
                             <div className="border border-gray-700 rounded-lg overflow-hidden flex flex-col bg-gray-900">
                                 <div className="bg-gray-800 text-center py-2 text-sm font-semibold text-gray-300 border-b border-gray-700">
                                     Monthly Overview
                                 </div>
                                 <div className="flex-1 flex flex-col items-center justify-center p-6 gap-8 text-center text-gray-300">
                                     <div>
                                         <div className="text-4xl font-light text-gray-100 mb-1">{parsedMetrics.totalAgents.toLocaleString()}</div>
                                         <div className="text-xs uppercase tracking-wide text-gray-500">Agents Used</div>
                                     </div>
                                     <div>
                                         <div className="text-4xl font-light text-gray-100 mb-1">{parsedMetrics.totalSessions.toLocaleString()}</div>
                                         <div className="text-xs uppercase tracking-wide text-gray-500">Total Chat Sessions</div>
                                     </div>
                                 </div>
                             </div>
                        </div>
                    </div>

                    {/* --- Raw Data Output --- */}
                    <details className="mt-6 border border-gray-700 bg-gray-800 rounded-lg group">
                        <summary className="p-4 cursor-pointer font-medium text-white select-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg">
                            Detailed Metrics Output
                        </summary>
                        <div className="p-4 border-t border-gray-700">
                            <div className="overflow-auto border border-gray-700 rounded-lg bg-gray-900 max-h-[400px]">
                                <table className="min-w-full divide-y divide-gray-700 text-sm text-left">
                        <thead className="bg-gray-800 text-gray-300 sticky top-0">
                            <tr>
                                {queryResults.schema?.fields?.map((field: { name: string }, i: number) => (
                                    <th key={i} className="px-4 py-3 font-medium whitespace-nowrap">{field.name}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800 text-gray-200">
                            {queryResults.rows?.map((row: { f: Array<{ v: unknown }> }, rIndex: number) => (
                                <tr key={rIndex} className="hover:bg-gray-800/50">
                                    {row.f.map((cell: { v: unknown }, cIndex: number) => (
                                        <td key={cIndex} className="px-4 py-2 whitespace-nowrap max-w-xs truncate" title={String(cell.v)}>
                                            {String(cell.v)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </details>
    </div>
    )}
</div>
);
};

export default AnalyticsMetricsViewer;
