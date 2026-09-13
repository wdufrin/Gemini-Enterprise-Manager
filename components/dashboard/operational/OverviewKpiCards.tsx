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

interface OverviewKpiCardsProps {
    isUserActivityLive: boolean;
    totalInteractions: number;
    isGenAiTelemetryLive: boolean;
    totalTelemetry: number;
    tokensTrackedStr: string;
    isConnectorUsageLive: boolean;
    activeConnectorsCount: number;
}

export const OverviewKpiCards: React.FC<OverviewKpiCardsProps> = ({
    isUserActivityLive,
    totalInteractions,
    isGenAiTelemetryLive,
    totalTelemetry,
    tokensTrackedStr,
    isConnectorUsageLive,
    activeConnectorsCount
}) => {
    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-400 uppercase tracking-wide">Total Interactions</span>
                    {isUserActivityLive ? (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            LIVE
                        </span>
                    ) : (
                        <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/40"
                            title="View not installed in dataset. Showing simulated mock data."
                        >
                            MOCK
                        </span>
                    )}
                </div>
                <div className="text-2xl lg:text-3xl font-light text-white">
                    {totalInteractions.toLocaleString()}
                </div>
                <div className={`text-[11px] mt-1 ${isUserActivityLive ? 'text-emerald-400' : 'text-amber-400/80'}`}>
                    {isUserActivityLive ? '100% Agent Attributed' : 'Simulated Agent Attributed'}
                </div>
            </div>

            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-400 uppercase tracking-wide">Telemetry Events</span>
                    {isGenAiTelemetryLive ? (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            LIVE
                        </span>
                    ) : (
                        <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/40"
                            title="View not installed in dataset. Showing simulated mock data."
                        >
                            MOCK
                        </span>
                    )}
                </div>
                <div className="text-2xl lg:text-3xl font-light text-white">
                    {totalTelemetry.toLocaleString()}
                </div>
                <div className={`text-[11px] mt-1 ${isGenAiTelemetryLive ? 'text-blue-400' : 'text-amber-400/80'}`}>
                    {isGenAiTelemetryLive ? 'Model Inferences & Tools' : 'Simulated Inferences'}
                </div>
            </div>

            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-400 uppercase tracking-wide">Tokens Tracked</span>
                    {isGenAiTelemetryLive ? (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            LIVE
                        </span>
                    ) : (
                        <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/40"
                            title="View not installed in dataset. Showing simulated mock data."
                        >
                            MOCK
                        </span>
                    )}
                </div>
                <div className="text-2xl lg:text-3xl font-light text-white">{tokensTrackedStr}</div>
                <div className={`text-[11px] mt-1 ${isGenAiTelemetryLive ? 'text-emerald-400' : 'text-amber-400/80'}`}>
                    {isGenAiTelemetryLive ? 'Input & Output Tokens' : 'Simulated Token Usage'}
                </div>
            </div>

            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-400 uppercase tracking-wide">Active Connectors</span>
                    {isConnectorUsageLive ? (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            LIVE
                        </span>
                    ) : (
                        <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/40"
                            title="View not installed in dataset. Showing simulated mock data."
                        >
                            MOCK
                        </span>
                    )}
                </div>
                <div className="text-2xl lg:text-3xl font-light text-white">
                    {activeConnectorsCount}
                </div>
                <div className={`text-[11px] mt-1 ${isConnectorUsageLive ? 'text-emerald-400' : 'text-amber-400/80'}`}>
                    {isConnectorUsageLive ? 'Active in Selected Dataset' : 'Simulated 30-Day Window'}
                </div>
            </div>
        </div>
    );
};

export default OverviewKpiCards;
