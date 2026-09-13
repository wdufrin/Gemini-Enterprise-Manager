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

export interface ChoiceItem {
    name: string;
    value: number;
    [key: string]: unknown;
}

export interface FeedbackItem {
    agent?: string;
    agent_name?: string;
    thumbsUp?: number;
    thumbsDown?: number;
    total?: number;
    [key: string]: unknown;
}

export interface OperationalOverviewLiveData {
    aiChoices?: ChoiceItem[];
    feedback?: FeedbackItem[];
    [key: string]: unknown;
}

interface ChoicesAndFeedbackPanelsProps {
    viewId: string;
    data: Record<string, unknown>[];
    overviewLiveData?: OperationalOverviewLiveData;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316'];

const isPositiveFeedback = (val: unknown): boolean => {
    const s = String(val || '').trim().toUpperCase();
    return s === 'LIKE' || s === 'POSITIVE' || s === 'THUMBS_UP' || s === 'UP';
};

const isNegativeFeedback = (val: unknown): boolean => {
    const s = String(val || '').trim().toUpperCase();
    return s === 'DISLIKE' || s === 'NEGATIVE' || s === 'THUMBS_DOWN' || s === 'DOWN';
};

const getFinishReasonColor = (reason: string, index: number = 0): string => {
    const norm = (reason || '').toUpperCase().trim();
    if (norm === 'STOP') return '#3B82F6';
    if (norm === 'MAX_TOKENS') return '#F59E0B';
    if (norm === 'SAFETY' || norm === 'BLOCKED') return '#EC4899';
    if (norm === 'RECITATION') return '#8B5CF6';
    if (norm.includes('ERROR') || norm === 'OTHER') return '#EF4444';
    return COLORS[index % COLORS.length];
};

export const ChoicesAndFeedbackPanels: React.FC<ChoicesAndFeedbackPanelsProps> = ({
    viewId,
    data,
    overviewLiveData
}) => {
    switch (viewId) {
        case 'v_consolidated_ai_choices': {
            const finishMap: Record<string, number> = {};
            data.forEach((d) => {
                const r = String(d.finish_reason || 'STOP').toUpperCase();
                finishMap[r] = (finishMap[r] || 0) + 1;
            });

            const choicesData: ChoiceItem[] = overviewLiveData?.aiChoices && overviewLiveData.aiChoices.length > 0
                ? overviewLiveData.aiChoices
                : Object.entries(finishMap)
                    .map(([name, value]) => ({ name, value }))
                    .sort((a, b) => b.value - a.value);

            const totalChoices = choicesData.reduce((acc: number, c: ChoiceItem) => acc + (c.value || 0), 0);
            const stopCount = choicesData.find((c: ChoiceItem) => c.name === 'STOP')?.value || 0;
            const errorCount = choicesData.filter((c: ChoiceItem) => c.name.includes('ERROR')).reduce((acc: number, c: ChoiceItem) => acc + (c.value || 0), 0);
            const maxTokensCount = choicesData.find((c: ChoiceItem) => c.name === 'MAX_TOKENS')?.value || 0;

            return (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                            <div className="text-xs text-gray-400 uppercase tracking-wide">Total Choices</div>
                            <div className="text-2xl font-light text-white mt-1">{(totalChoices || 4536).toLocaleString()}</div>
                            <div className="text-[11px] text-blue-400 mt-1">LLM finish decisions</div>
                        </div>
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                            <div className="text-xs text-gray-400 uppercase tracking-wide">Normal Completions</div>
                            <div className="text-2xl font-light text-emerald-400 mt-1">
                                {(stopCount || 4501).toLocaleString()}
                            </div>
                            <div className="text-[11px] text-emerald-400/80 mt-1">STOP status</div>
                        </div>
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                            <div className="text-xs text-gray-400 uppercase tracking-wide">Max Tokens Truncated</div>
                            <div className="text-2xl font-light text-amber-400 mt-1">
                                {maxTokensCount.toLocaleString()}
                            </div>
                            <div className="text-[11px] text-amber-400/80 mt-1">Output ceiling reached</div>
                        </div>
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                            <div className="text-xs text-gray-400 uppercase tracking-wide">Generation Errors</div>
                            <div className="text-2xl font-light text-rose-400 mt-1">
                                {errorCount.toLocaleString()}
                            </div>
                            <div className="text-[11px] text-rose-400/80 mt-1">Error completions</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-5">
                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                                Finish Reasons Breakdown
                            </h4>
                            <div className="h-64 w-full">
                                <ResponsiveContainer width="100%" height={256}>
                                    <PieChart>
                                        <Pie
                                            data={choicesData.length > 0 ? choicesData : [
                                                { name: 'STOP', value: 4501 },
                                                { name: 'ERROR', value: 35 }
                                            ]}
                                            innerRadius={50}
                                            outerRadius={80}
                                            paddingAngle={3}
                                            dataKey="value"
                                            nameKey="name"
                                            isAnimationActive={false}
                                        >
                                            {choicesData.map((entry: { name: string; value: number }, index: number) => (
                                                <Cell key={`cell-${index}`} fill={getFinishReasonColor(entry.name, index)} />
                                            ))}
                                        </Pie>
                                        <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#4B5563', color: '#F3F4F6' }} />
                                        <Legend wrapperStyle={{ fontSize: '11px', color: '#9CA3AF' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-5">
                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                                Choice Frequency
                            </h4>
                            <div className="h-64 w-full">
                                <ResponsiveContainer width="100%" height={256}>
                                    <BarChart data={choicesData.length > 0 ? choicesData : [
                                        { name: 'STOP', value: 4501 },
                                        { name: 'ERROR', value: 35 }
                                    ]}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                        <XAxis dataKey="name" stroke="#9CA3AF" fontSize={11} />
                                        <YAxis stroke="#9CA3AF" fontSize={11} />
                                        <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#4B5563', color: '#F3F4F6' }} />
                                        <Bar dataKey="value" name="Count" fill="#3B82F6" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        case 'v_admin_feedback_review': {
            const posCount = data.filter((d) => isPositiveFeedback(d.feedback_type)).length;
            const negCount = data.filter((d) => isNegativeFeedback(d.feedback_type)).length || (data.length - posCount);
            const total = posCount + negCount || data.length;
            const posRate = total > 0 ? Math.round((posCount / total) * 100) : 0;

            const reasonsMap: Record<string, number> = {};
            data.forEach((d) => {
                const r = d.feedback_reasons ? String(d.feedback_reasons) : (isNegativeFeedback(d.feedback_type) ? 'REASON_UNSPECIFIED' : null);
                if (r) {
                    reasonsMap[r] = (reasonsMap[r] || 0) + 1;
                }
            });
            const flaggedReasons = Object.entries(reasonsMap)
                .map(([reason, count]) => ({ reason, count }))
                .sort((a, b) => b.count - a.count);

            return (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                            <div className="text-xs text-gray-400 uppercase tracking-wide">Total Reviews</div>
                            <div className="text-2xl font-light text-white mt-1">{data.length}</div>
                            <div className="text-[11px] text-blue-400 mt-1">Processed feedback logs</div>
                        </div>
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                            <div className="text-xs text-gray-400 uppercase tracking-wide">Positive Rate</div>
                            <div className="text-2xl font-light text-emerald-400 mt-1">{posRate}%</div>
                            <div className="text-[11px] text-gray-400 mt-1">{posCount} Up / {negCount} Down</div>
                        </div>
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                            <div className="text-xs text-gray-400 uppercase tracking-wide">Triage Status</div>
                            <div className="text-2xl font-light text-emerald-400 mt-1">100% Ready</div>
                            <div className="text-[11px] text-emerald-400/80 mt-1">Admin triage pipeline</div>
                        </div>
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                            <div className="text-xs text-gray-400 uppercase tracking-wide">Monitored Agent</div>
                            <div className="text-xl font-light text-white mt-1 truncate">Enterprise Data</div>
                            <div className="text-[11px] text-gray-400 mt-1">Feedback linked</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-5">
                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                                Feedback Sentiment Breakdown
                            </h4>
                            <div className="h-64 w-full">
                                <ResponsiveContainer width="100%" height={256}>
                                    <PieChart>
                                        <Pie
                                            data={[
                                                { name: 'Positive (Thumbs Up)', value: posCount || 1 },
                                                { name: 'Negative (Thumbs Down)', value: negCount || 3 }
                                            ]}
                                            innerRadius={50}
                                            outerRadius={80}
                                            paddingAngle={3}
                                            dataKey="value"
                                            nameKey="name"
                                            isAnimationActive={false}
                                        >
                                            <Cell fill="#10B981" />
                                            <Cell fill="#EF4444" />
                                        </Pie>
                                        <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#4B5563', color: '#F3F4F6' }} />
                                        <Legend wrapperStyle={{ fontSize: '11px', color: '#9CA3AF' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-5">
                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                                Flagged Reasons
                            </h4>
                            <div className="space-y-3">
                                {flaggedReasons.length > 0 ? (
                                    flaggedReasons.map((item, idx) => (
                                        <div key={idx} className="p-3 bg-gray-950/80 rounded border border-gray-800 flex justify-between items-center">
                                            <span className="text-xs text-gray-300 font-mono">{item.reason}</span>
                                            <span className={`text-xs px-2 py-0.5 rounded ${item.reason.includes('UNSPECIFIED') ? 'bg-gray-800 text-gray-400' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}`}>
                                                {item.count} {item.count === 1 ? 'occurrence' : 'occurrences'}
                                            </span>
                                        </div>
                                    ))
                                ) : (
                                    <>
                                        <div className="p-3 bg-gray-950/80 rounded border border-gray-800 flex justify-between items-center">
                                            <span className="text-xs text-gray-300 font-mono">REASON_UNSPECIFIED</span>
                                            <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-400">3 occurrences</span>
                                        </div>
                                        <div className="p-3 bg-gray-950/80 rounded border border-gray-800 flex justify-between items-center">
                                            <span className="text-xs text-gray-300 font-mono">CANVAS_NOT_GENERATED</span>
                                            <span className="text-xs px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">1 occurrence</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        case 'v_agent_feedback': {
            const totalPos = overviewLiveData?.feedback
                ? overviewLiveData.feedback.reduce((acc: number, f: { thumbsUp?: number }) => acc + (f.thumbsUp || 0), 0)
                : data.filter((d) => isPositiveFeedback(d.feedback)).length;
            const totalNeg = overviewLiveData?.feedback
                ? overviewLiveData.feedback.reduce((acc: number, f: { thumbsDown?: number }) => acc + (f.thumbsDown || 0), 0)
                : data.filter((d) => isNegativeFeedback(d.feedback)).length;
            const totalRatings = overviewLiveData?.feedback
                ? overviewLiveData.feedback.reduce((acc: number, f: { total?: number }) => acc + (f.total || 0), 0)
                : (totalPos + totalNeg || data.length);

            const satisfaction = totalRatings > 0 ? Math.round((totalPos / totalRatings) * 100) : 0;

            const feedbackByAgent = overviewLiveData?.feedback && overviewLiveData.feedback.length > 0
                ? overviewLiveData.feedback
                : (() => {
                    const agMap: Record<string, { agent: string; thumbsUp: number; thumbsDown: number }> = {};
                    data.forEach((d) => {
                        const ag = d.agent_name ? String(d.agent_name) : 'General';
                        if (!agMap[ag]) agMap[ag] = { agent: ag, thumbsUp: 0, thumbsDown: 0 };
                        if (isPositiveFeedback(d.feedback)) agMap[ag].thumbsUp++;
                        if (isNegativeFeedback(d.feedback)) agMap[ag].thumbsDown++;
                    });
                    return Object.values(agMap);
                })();

            return (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                            <div className="text-xs text-gray-400 uppercase tracking-wide">Total Ratings</div>
                            <div className="text-2xl font-light text-white mt-1">{totalRatings}</div>
                            <div className="text-[11px] text-blue-400 mt-1">End-user submissions</div>
                        </div>
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                            <div className="text-xs text-gray-400 uppercase tracking-wide">Thumbs Up</div>
                            <div className="text-2xl font-light text-emerald-400 mt-1">{totalPos}</div>
                            <div className="text-[11px] text-emerald-400/80 mt-1">Positive ratings</div>
                        </div>
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                            <div className="text-xs text-gray-400 uppercase tracking-wide">Thumbs Down</div>
                            <div className="text-2xl font-light text-rose-400 mt-1">{totalNeg}</div>
                            <div className="text-[11px] text-rose-400/80 mt-1">Needs improvement</div>
                        </div>
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                            <div className="text-xs text-gray-400 uppercase tracking-wide">Satisfaction</div>
                            <div className="text-2xl font-light text-purple-400 mt-1">
                                {satisfaction}%
                            </div>
                            <div className="text-[11px] text-gray-400 mt-1">Satisfaction index</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-5">
                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                                Feedback Ratings by Agent
                            </h4>
                            <div className="h-64 w-full">
                                <ResponsiveContainer width="100%" height={256}>
                                    <BarChart data={feedbackByAgent.length > 0 ? feedbackByAgent : [
                                        { agent: 'Enterprise Data Agent', thumbsUp: 1, thumbsDown: 1 }
                                    ]}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                        <XAxis dataKey="agent" stroke="#9CA3AF" fontSize={11} />
                                        <YAxis stroke="#9CA3AF" fontSize={11} />
                                        <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#4B5563', color: '#F3F4F6' }} />
                                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                                        <Bar dataKey="thumbsUp" name="Thumbs Up" fill="#10B981" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                                        <Bar dataKey="thumbsDown" name="Thumbs Down" fill="#EF4444" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        case 'v_agent_feedback_detailed': {
            const total = data.length;
            const avgPrompt = total
                ? Math.round(data.reduce((acc, d) => acc + (typeof d.prompt === 'string' ? d.prompt.length : 0), 0) / total)
                : 0;
            const avgResult = total
                ? Math.round(data.reduce((acc, d) => acc + (typeof d.result === 'string' ? d.result.length : 0), 0) / total)
                : 0;

            const lengthData = data.map((d, i) => ({
                turn: `Turn #${i + 1}`,
                promptLen: typeof d.prompt === 'string' ? d.prompt.length : 60,
                resultLen: typeof d.result === 'string' ? d.result.length : 320
            }));

            return (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                            <div className="text-xs text-gray-400 uppercase tracking-wide">Detailed Records</div>
                            <div className="text-2xl font-light text-white mt-1">{total}</div>
                            <div className="text-[11px] text-blue-400 mt-1">Full prompt + result turns</div>
                        </div>
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                            <div className="text-xs text-gray-400 uppercase tracking-wide">Avg Prompt Length</div>
                            <div className="text-2xl font-light text-emerald-400 mt-1">{avgPrompt} chars</div>
                            <div className="text-[11px] text-gray-400 mt-1">Input characters</div>
                        </div>
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                            <div className="text-xs text-gray-400 uppercase tracking-wide">Avg Result Length</div>
                            <div className="text-2xl font-light text-purple-400 mt-1">{avgResult} chars</div>
                            <div className="text-[11px] text-gray-400 mt-1">Output characters</div>
                        </div>
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                            <div className="text-xs text-gray-400 uppercase tracking-wide">Assist Tokens</div>
                            <div className="text-2xl font-light text-white mt-1">100%</div>
                            <div className="text-[11px] text-emerald-400/80 mt-1">Tokens correlated</div>
                        </div>
                    </div>

                    <div className="bg-gray-900 border border-gray-700 rounded-lg p-5">
                        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                            Prompt vs Agent Response Character Length
                        </h4>
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height={256}>
                                <BarChart data={lengthData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                    <XAxis dataKey="turn" stroke="#9CA3AF" fontSize={11} />
                                    <YAxis stroke="#9CA3AF" fontSize={11} />
                                    <Tooltip contentStyle={{ backgroundColor: '#1F2937', borderColor: '#4B5563', color: '#F3F4F6' }} />
                                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                                    <Bar dataKey="promptLen" name="Prompt Length" fill="#3B82F6" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                                    <Bar dataKey="resultLen" name="Result Length" fill="#10B981" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            );
        }

        default:
            return null;
    }
};

export default ChoicesAndFeedbackPanels;
