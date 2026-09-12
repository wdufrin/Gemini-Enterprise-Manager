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

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { DiscoverySession, Config } from '../../types';
import * as api from '../../services/apiService';
import { createDiscoverySession } from '../../services/apiService';

interface ChatHistoryArchiveViewerProps {
    sessions: DiscoverySession[];
    onClose: () => void;
    fileName: string;
    config: Config;
}

// ----------------------------------------------------------------------------
// Helper: Answer Fetcher
// ----------------------------------------------------------------------------

interface FetcherProps {
    resourceName: string;
    config: Config;
    onLoad?: (text: string) => void;
    autoLoad?: boolean;
    onViewRaw?: (data: any) => void;
}

const extractTextFromResponse = (result: any): string => {
    let text = '';

    // 1. Check for "replies" array (Agent Engine / Vertex Search standard)
    if (result.replies && Array.isArray(result.replies)) {
        for (const reply of result.replies) {
            const content = reply.groundedContent?.content;
            // Look for content WITHOUT "thought": true
            if (content && !content.thought && content.text) {
                text = content.text;
                break;
            }
        }
    }

    if (!text) {
        if (typeof result === 'string') {
            text = result;
        } else if (result.answerText) {
            text = result.answerText;
        } else if (result.answer_text) {
            text = result.answer_text;
        } else if (result.steps) {
            text = result.steps.map((s: any) => s.description || s.thought || '').join('\n\n');
        } else {
            // Try to find ANY string field
            const possibleKeys = ['text', 'content', 'message', 'reply'];
            for (const k of possibleKeys) {
                if (result[k] && typeof result[k] === 'string') {
                    text = result[k];
                    break;
                }
            }

            // Deep nested check for replyText
            if (!text && result.reply?.replyText) text = result.reply.replyText;
            if (!text && result.reply?.replytext) text = result.reply.replytext; // case
        }
    }

    return text;
};

const FetchAnswerButton: React.FC<FetcherProps> = ({ resourceName, config, onLoad, autoLoad = true }) => {
    const [content, setContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFetch = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await api.getDiscoveryAnswer(resourceName, config);

            // Robust content extraction
            let text = extractTextFromResponse(result);
            let isStructured = !text;

            if (!text) {
                // Fallback for purely structured/unknown data
                text = '[Complex Data]';
                isStructured = true;
            }

            setContent(text);
            if (onLoad) onLoad(text);
        } catch (err: any) {
            console.error("Fetch error:", err);
            setError(err.message || 'Failed to load');
        } finally {
            setLoading(false);
        }
    }, [resourceName, config, onLoad]);

    useEffect(() => {
        if (autoLoad) {
            handleFetch();
        } else {
            // Reset if not auto-loading and resource changed?
            // Actually if autoLoad is false, we probably want to reset content to null 
            // if resourceName changes, so we don't show old content.
            setContent(null);
            setError(null);
        }
    }, [autoLoad, handleFetch]);

    if (loading) return (
        <span className="inline-flex items-center gap-2 text-xs text-blue-400 animate-pulse">
            <svg className="animate-spin h-3 w-3 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Loading content...
        </span>
    );

    if (error) return (
        <span className="text-xs text-red-500 flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Failed
            <button onClick={(e) => { e.stopPropagation(); handleFetch(); }} className="ml-1 underline hover:text-red-400">Retry</button>
        </span>
    );

    if (content) {
        return (
            <div className="mt-1">
                <div className={`whitespace-pre-wrap ${content === '[Complex Data]' ? 'text-yellow-500 font-mono text-xs italic' : ''}`}>
                    {content}
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2 mt-1">
            <button
                onClick={(e) => { e.stopPropagation(); handleFetch(); }}
                className="text-xs bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 border border-blue-800/50 px-2 py-1 rounded flex items-center gap-1 transition-colors"
                title="Load Content"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Load Content
            </button>
        </div>
    );
};


const DetailedJsonFetcher: React.FC<{ resourceName: string, config: Config }> = ({ resourceName, config }) => {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetch = async () => {
            setLoading(true);
            try {
                const res = await api.getDiscoveryAnswer(resourceName, config);
                setData(res);
            } catch (e: any) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, [resourceName, config]);

    if (loading) return <div className="p-4 text-xs text-blue-400">Loading full JSON...</div>;
    if (error) return <div className="p-4 text-xs text-red-400">Error: {error}</div>;
    if (!data) return null;

    return (
        <pre className="text-xs font-mono p-4 text-green-400 leading-relaxed whitespace-pre-wrap break-all">
            {JSON.stringify(data, null, 2)}
        </pre>
    );
};

// ----------------------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------------------

interface RestoreStatus {
    total: number;
    processed: number;
    success: number;
    failed: number;
    currentSession?: string;
    logs: string[];
    isRestoring: boolean;
    isOpen: boolean;
    isMinimized: boolean;
}

const ChatHistoryArchiveViewer: React.FC<ChatHistoryArchiveViewerProps> = ({ sessions, onClose, fileName, config }) => {
    // State
    const [searchQuery, setSearchQuery] = useState('');
    const [userFilter, setUserFilter] = useState<string>('');
    const [selectedApp, setSelectedApp] = useState<string>('');
    const [fromDate, setFromDate] = useState<string>('');
    const [toDate, setToDate] = useState<string>('');
    const [targetUserId, setTargetUserId] = useState<string>('');

    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
    const [isJsonModalOpen, setIsJsonModalOpen] = useState(false);
    const [rawContent, setRawContent] = useState<any | null>(null);
    const [rawContentTab, setRawContentTab] = useState<'json' | 'preview' | 'input'>('preview');
    const [sessionInspectorTab, setSessionInspectorTab] = useState<'full' | 'inputs' | 'responses'>('full');

    // Batch Auto-Load State
    const [autoLoadSession, setAutoLoadSession] = useState<Set<string>>(new Set());

    // Restore Status State
    const [restoreStatus, setRestoreStatus] = useState<RestoreStatus>({
        total: 0, processed: 0, success: 0, failed: 0, logs: [],
        isRestoring: false, isOpen: false, isMinimized: false
    });

    // ------------------------------------------------------------------------
    // Memos & Derived State
    // ------------------------------------------------------------------------

    const getAppId = (sessionName: string) => {
        const parts = sessionName.split('/');
        const engineIndex = parts.indexOf('engines');
        if (engineIndex !== -1 && parts.length > engineIndex + 1) return parts[engineIndex + 1];
        const agentIndex = parts.indexOf('agents');
        if (agentIndex !== -1 && parts.length > agentIndex + 1) return parts[agentIndex + 1];
        const reIndex = parts.indexOf('reasoningEngines');
        if (reIndex !== -1 && parts.length > reIndex + 1) return parts[reIndex + 1];
        return 'Unknown App';
    };

    const filteredSessions = useMemo(() => {
        return sessions.filter(s => {
            if (searchQuery && !s.name.includes(searchQuery) && !(s.userPseudoId?.includes(searchQuery))) return false;
            if (userFilter && s.userPseudoId !== userFilter) return false;
            if (selectedApp && getAppId(s.name) !== selectedApp) return false;

            if (fromDate || toDate) {
                const sessionDate = s.startTime ? new Date(s.startTime) : null;
                if (!sessionDate) return false;
                if (fromDate && sessionDate < new Date(fromDate)) return false;
                if (toDate) {
                    const toNextDay = new Date(toDate);
                    toNextDay.setDate(toNextDay.getDate() + 1);
                    if (sessionDate >= toNextDay) return false;
                }
            }
            return true;
        });
    }, [sessions, searchQuery, userFilter, selectedApp, fromDate, toDate]);

    const uniqueApps = useMemo(() => Array.from(new Set(sessions.map(s => getAppId(s.name)))).sort(), [sessions]);
    const uniqueUsers = useMemo(() => Array.from(new Set(sessions.map(s => s.userPseudoId).filter(Boolean))) as string[], [sessions]);

    const selectedSession = useMemo(() => sessions.find(s => s.name === selectedSessionId) || null, [sessions, selectedSessionId]);

    // ------------------------------------------------------------------------
    // Actions
    // ------------------------------------------------------------------------

    const handleRestoreFiltered = async () => {
        if (filteredSessions.length === 0) return;

        setRestoreStatus({
            total: filteredSessions.length,
            processed: 0,
            success: 0,
            failed: 0,
            logs: [],
            isRestoring: true,
            isOpen: true,
            isMinimized: false
        });

        const log = (msg: string) => {
            setRestoreStatus(prev => ({
                ...prev,
                logs: [...prev.logs, `[${new Date().toLocaleTimeString()}] ${msg}`]
            }));
        };

        if (config.reasoningEngineId && !config.appId) {
            log("Error: Restoring Chat History to an Agent Engine is currently unsupported by the API.");
            setRestoreStatus(prev => ({ ...prev, isRestoring: false, failed: filteredSessions.length, processed: filteredSessions.length }));
            return;
        }

        log(`Starting deep restore of ${filteredSessions.length} sessions...`);

        // Process sequentially to avoid rate limits
        for (const session of filteredSessions) {
            setRestoreStatus(prev => ({ ...prev, currentSession: session.name }));
            try {
                // DEEP HYDRATION:
                // Fetch content for "Reference" answers to bake them into the new session.
                const hydratedSession: any = { ...session };

                // Gemini Enterprise UI visibility hacks
                hydratedSession.state = 'IN_PROGRESS';
                if (!hydratedSession.startTime) {
                    hydratedSession.startTime = new Date().toISOString();
                }

                if (hydratedSession.turns && hydratedSession.turns.length > 0) {
                    const hydratedTurns = await Promise.all(hydratedSession.turns.map(async (turn: any) => {
                        let answerRef = '';
                        let assistantKeyToRemove = '';
                        if (typeof turn.answer === 'string' && turn.answer.startsWith('projects/')) {
                            answerRef = turn.answer;
                        }
                        else if (turn.assistAnswer && typeof turn.assistAnswer === 'string' && turn.assistAnswer.startsWith('projects/')) {
                            answerRef = turn.assistAnswer;
                            assistantKeyToRemove = 'assistAnswer';
                        }
                        else {
                            const assistantKey = Object.keys(turn).find(k => k.startsWith('assist'));
                            if (assistantKey && typeof turn[assistantKey] === 'string' && turn[assistantKey].startsWith('projects/')) {
                                answerRef = turn[assistantKey];
                                assistantKeyToRemove = assistantKey;
                            }
                        }

                        const newTurn = { ...turn };

                        if (answerRef) {
                            try {
                                const result = await api.getDiscoveryAnswer(answerRef, config);
                                let text = '';
                                if (typeof result === 'string') text = result;
                                else if (result.answerText) text = result.answerText;
                                else if (result.answer_text) text = result.answer_text;
                                else if (result.steps) text = result.steps.map((s: any) => s.description || s.thought || '').join('\n');
                                else if (result.reply?.replyText) text = result.reply.replyText;

                                if (text) {
                                    newTurn.answer = text;
                                } else {
                                    newTurn.answer = "[Archived Answer: Content unavailable. The original engine was likely deleted before the backup could fully hydrate the text.]";
                                }
                            } catch (e) {
                                console.warn("Failed to hydrate answer", answerRef, e);
                                newTurn.answer = "[Archived Answer: Content unavailable. The original engine was likely deleted before the backup could fully hydrate the text.]";
                            }
                        } else if (!newTurn.answer) {
                            // No answer ref and no existing answer
                            newTurn.answer = "[No Answer Recorded]";
                        }

                        // Aggressively strip old identifiers that prevent UI display or cause backend silently dropping turns
                        delete newTurn.name;
                        delete newTurn.queryConfig;
                        delete newTurn.turnId;
                        delete newTurn.createdAt;
                        delete newTurn.assistToken;
                        delete newTurn.assistAnswer; // Even if it was the key, just delete it directly since we know the name

                        // Also proactively delete other variations just in case
                        if (assistantKeyToRemove) delete newTurn[assistantKeyToRemove];

                        // Clean up the query object as well
                        if (newTurn.query) {
                            delete newTurn.query.queryId;
                        }

                        return newTurn;
                    }));
                    hydratedSession.turns = hydratedTurns;
                }

                // Apply Target User ID if provided
                if (targetUserId) {
                    hydratedSession.userPseudoId = targetUserId;
                }

                await api.createDiscoverySession(hydratedSession, config);

                log(`Success: ${session.name.split('/').pop()}`);
                setRestoreStatus(prev => ({ ...prev, success: prev.success + 1 }));
            } catch (err: any) {
                const msg = err.message || 'Unknown error';
                log(`Failed: ${session.name.split('/').pop()} - ${msg}`);
                setRestoreStatus(prev => ({ ...prev, failed: prev.failed + 1 }));
            } finally {
                setRestoreStatus(prev => ({ ...prev, processed: prev.processed + 1 }));
                // Small delay
                await new Promise(r => setTimeout(r, 200));
            }
        }

        log('Restore process completed. Note: Gemini Enterprise natively drops Agent Responses during manual session creation.');
        setRestoreStatus(prev => ({ ...prev, isRestoring: false, currentSession: undefined }));
    };

    const enableAutoLoad = () => {
        if (selectedSessionId) {
            setAutoLoadSession(prev => new Set(prev).add(selectedSessionId));
        }
    };

    // ------------------------------------------------------------------------
    // Rendering Helpers
    // ------------------------------------------------------------------------

    const getAnswerContent = (turn: any) => {
        // 1. Check direct answer field (standard structure)
        const ans = turn.answer as any;
        if (ans) {
            if (typeof ans === 'string') return { type: 'text', content: ans };
            // Objects
            const text = ans.reply?.replyText || ans.reply?.replytext || ans.text || ans.content || ans.message || ans.agentAnswer;
            if (text) return { type: 'text', content: text };
            // Citations but no text?
            if (ans.citations) return { type: 'json', content: ans }; // Render partially?
            return { type: 'json', content: ans };
        }

        // 2. Check for assistant key in the Turn itself
        const turnObj = turn as any;
        const assistantKey = Object.keys(turnObj).find(k => k.startsWith('assist'));
        if (assistantKey && turnObj[assistantKey]) {
            const val = turnObj[assistantKey];
            if (typeof val === 'string') {
                if (val.startsWith('projects/')) {
                    // Reference!
                    return { type: 'reference', content: val };
                }
                return { type: 'text', content: val };
            }
            // Object in assistant key
            const text = val.reply?.replyText || val.reply?.replytext || val.text || val.content || val.message;
            if (text) return { type: 'text', content: text };
            return { type: 'json', content: val };
        }

        return { type: 'none' };
    };


    // ------------------------------------------------------------------------
    // UI Layout
    // ------------------------------------------------------------------------

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-6">
            <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col border border-gray-700 overflow-hidden">

                {/* Global Header */}
                <div className="flex justify-between items-center px-6 py-4 bg-gray-800 border-b border-gray-700 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="bg-blue-900/50 p-2 rounded-lg">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">Chat History Archive</h2>
                            <p className="text-xs text-gray-400 font-mono flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                {fileName}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded-full text-gray-400 hover:text-white transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Body: Split Pane */}
                <div className="flex-1 flex overflow-hidden">

                    {/* Left Sidebar: Session List & Filters */}
                    <div className="w-80 flex flex-col border-r border-gray-700 bg-gray-800/30 flex-shrink-0">
                        {/* Filters */}
                        <div className="p-4 space-y-3 border-b border-gray-700 bg-gray-800/50">
                            <input
                                type="text"
                                placeholder="Search..."
                                className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:border-blue-500 outline-none text-white"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />

                            <div className="pt-2 border-t border-gray-700/50">
                                <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1 block">Target App / Engine</label>
                                <div className="text-xs text-white bg-gray-900 border border-gray-600 rounded px-3 py-2 flex items-center gap-2">
                                    <span className="truncate flex-1">
                                        {config.appId || config.reasoningEngineId || <span className="text-red-400 italic">None Selected</span>}
                                    </span>
                                    {(!config.appId && !config.reasoningEngineId) && (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                        </svg>
                                    )}
                                </div>
                                {(!config.appId && !config.reasoningEngineId) ? (
                                    <p className="text-[9px] text-red-400 mt-1">Please select an App or Engine in the main Backup tab.</p>
                                ) : config.appId ? (
                                    <div className="mt-2 p-2 bg-red-900/30 border border-red-800/50 rounded flex gap-2 items-start shrink-0">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        <p className="text-[9px] text-red-300 leading-relaxed">
                                            <strong>API Limitation:</strong> Restoring Chat History to Gemini Enterprise Apps is technically <strong>unsupported</strong>. The Discovery Engine API natively drops Agent Responses from imported sessions. Use this Offline Viewer to read histories instead.
                                        </p>
                                    </div>
                                ) : (
                                    <p className="text-[9px] text-gray-500 mt-1">Sessions will be restored into this App.</p>
                                )}
                            </div>

                            <div className="pt-2 border-t border-gray-700/50">
                                <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1 block">Restore As User (Optional)</label>
                                <input
                                    type="text"
                                    placeholder="e.g. user@example.com"
                                    className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-xs text-white focus:border-blue-500 outline-none placeholder-gray-500"
                                    value={targetUserId}
                                    onChange={(e) => setTargetUserId(e.target.value)}
                                />
                                <p className="text-[9px] text-gray-500 mt-1">Leave empty to keep original IDs.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <select
                                    className="bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-xs text-white outline-none"
                                    value={userFilter} onChange={e => setUserFilter(e.target.value)}
                                >
                                    <option value="">All Users</option>
                                    {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                                <select
                                    className="bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-xs text-white outline-none"
                                    value={selectedApp} onChange={e => setSelectedApp(e.target.value)}
                                >
                                    <option value="">All Apps</option>
                                    {uniqueApps.map(a => <option key={a} value={a}>{a}</option>)}
                                </select>
                            </div>

                            {/* Restore Action */}
                            <button
                                onClick={handleRestoreFiltered}
                                disabled={filteredSessions.length === 0 || restoreStatus.isRestoring || (!config.appId && !config.reasoningEngineId) || (!!config.appId)}
                                className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-xs font-bold text-gray-200 rounded border border-gray-600 flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Restore Filtered List
                            </button>
                        </div>

                        {/* List */}
                        <div className="flex-1 overflow-y-auto">
                            {filteredSessions.length === 0 ? (
                                <div className="p-8 text-center text-gray-500 text-sm">No sessions found</div>
                            ) : (
                                filteredSessions.map(session => (
                                    <div
                                        key={session.name}
                                        onClick={() => {
                                            setSelectedSessionId(session.name);
                                            setRawContent(null); // Ensure modal is closed
                                        }}
                                        className={`p-4 border-b border-gray-700/50 cursor-pointer transition-colors hover:bg-gray-700/30 ${selectedSessionId === session.name ? 'bg-blue-900/20 border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent'}`}
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="text-xs font-bold text-blue-300 truncate w-2/3" title={session.userPseudoId || 'Anonymous'}>
                                                {session.userPseudoId || 'Anonymous User'}
                                            </span>
                                            <span className="text-[10px] text-gray-500">
                                                {session.startTime ? new Date(session.startTime).toLocaleDateString() : 'N/A'}
                                            </span>
                                        </div>
                                        <div className="text-[10px] text-gray-400 font-mono truncate mb-2" title={session.name}>
                                            {session.name.split('/').pop()}
                                        </div>
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider font-bold ${session.state === 'IN_PROGRESS' ? 'bg-yellow-900/30 text-yellow-500' : 'bg-green-900/30 text-green-500'}`}>
                                            {session.state || 'UNKNOWN'}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Restore Status Panel (Bottom of Sidebar) */}
                        {restoreStatus.isOpen && (
                            <div className={`border-t border-gray-700 bg-gray-900 flex flex-col transition-all duration-300 ${restoreStatus.isMinimized ? 'h-10' : 'h-48'}`}>
                                <div
                                    className="flex justify-between items-center p-2 bg-gray-800 cursor-pointer hover:bg-gray-700"
                                    onClick={() => setRestoreStatus(prev => ({ ...prev, isMinimized: !prev.isMinimized }))}
                                >
                                    <div className="flex items-center gap-2 text-xs font-bold text-white">
                                        {restoreStatus.isRestoring && <span className="animate-spin h-3 w-3 border-2 border-green-500 border-t-transparent rounded-full"></span>}
                                        Restore Status
                                    </div>
                                    <div className="flex gap-2">
                                        <span className="text-[10px] text-gray-400">{restoreStatus.processed}/{restoreStatus.total}</span>
                                    </div>
                                </div>
                                {!restoreStatus.isMinimized && (
                                    <div className="flex-1 p-2 overflow-auto bg-black font-mono text-[9px]">
                                        {restoreStatus.logs.map((L, i) => (
                                            <div key={i} className={L.includes('Failed') ? 'text-red-400' : 'text-green-400'}>{L}</div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Right Main: Transcript */}
                    <div className="flex-1 flex flex-col bg-gray-900 relative">
                        {selectedSession ? (
                            <>
                                {/* Session Header */}
                                <div className="h-16 px-6 border-b border-gray-700 flex justify-between items-center bg-gray-800/30">
                                    <div>
                                        <div className="text-sm font-bold text-white flex items-center gap-2">
                                            {selectedSession.userPseudoId || 'Anonymous User'}
                                            <span className="text-gray-500 font-normal">in</span>
                                            <span className="text-blue-300">{getAppId(selectedSession.name)}</span>
                                        </div>
                                        <div className="text-xs text-gray-500 font-mono mt-0.5">{selectedSession.name}</div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={enableAutoLoad}
                                            disabled={autoLoadSession.has(selectedSession.name)}
                                            className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-medium rounded shadow-sm transition-colors"
                                        >
                                            {autoLoadSession.has(selectedSession.name) ? 'Auto-Loading enabled' : 'Load All Content'}
                                        </button>
                                        <button
                                            onClick={() => setIsJsonModalOpen(true)}
                                            className="text-gray-400 hover:text-white"
                                            title="View Raw JSON"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>

                                {/* Transcript Scroll Area */}
                                <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
                                    <div className="max-w-4xl mx-auto space-y-8">
                                        {(!selectedSession.turns || selectedSession.turns.length === 0) ? (
                                            <div className="text-center text-gray-500 mt-20">
                                                <p>No conversation history found for this session.</p>
                                                <p className="text-xs mt-2">This session might be empty or the turns were not captured.</p>
                                            </div>
                                        ) : (
                                            selectedSession.turns.map((turn, idx) => {
                                                const answerData = getAnswerContent(turn);

                                                return (
                                                    <div key={idx} className="flex flex-col gap-3 animate-fadeIn group">
                                                        {/* User */}
                                                        {(turn.query?.text || (turn as any).input?.text) && (
                                                            <div className="flex justify-end">
                                                                <div className="bg-blue-600 text-white px-4 py-3 rounded-2xl rounded-tr-sm max-w-[80%] shadow-md">
                                                                    <div className="text-sm whitespace-pre-wrap">{turn.query?.text || (turn as any).input?.text}</div>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Agent */}
                                                        <div className="flex justify-start">
                                                            <div
                                                                onClick={() => setRawContent(turn)}
                                                                className="bg-gray-800 border border-gray-700 text-gray-200 px-4 py-3 rounded-2xl rounded-tl-sm max-w-[80%] shadow-md relative cursor-pointer hover:bg-gray-750 hover:border-gray-600 transition-all select-text"
                                                                title="Click to view Raw JSON"
                                                            >
                                                                {/* Answer Content */}
                                                                <div className="text-sm leading-relaxed pointer-events-none">
                                                                    <div className="pointer-events-auto">
                                                                        {answerData.type === 'text' && <div className="whitespace-pre-wrap">{answerData.content}</div>}

                                                                        {answerData.type === 'reference' && (
                                                                            <div onClick={(e) => e.stopPropagation()}>
                                                                                <div className="text-[10px] text-gray-500 font-mono mb-1">REFERENCE ID</div>
                                                                                <FetchAnswerButton
                                                                                    resourceName={answerData.content}
                                                                                    config={config}
                                                                                    autoLoad={true}
                                                                                    onViewRaw={(data) => setRawContent({ ...turn, answer: data })}
                                                                                />
                                                                            </div>
                                                                        )}

                                                                        {answerData.type === 'json' && (
                                                                            <div className="font-mono text-xs text-yellow-500 whitespace-pre overflow-x-auto p-2 bg-black/30 rounded border border-yellow-900/30">
                                                                                {JSON.stringify(answerData.content, null, 2)}
                                                                            </div>
                                                                        )}

                                                                        {answerData.type === 'none' && (
                                                                            <div className="text-xs text-gray-500 italic">[No content]</div>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* Citations */}
                                                                {(turn.answer as any)?.citations?.length > 0 && (
                                                                    <div className="mt-3 pt-2 border-t border-gray-700/50" onClick={(e) => e.stopPropagation()}>
                                                                        <div className="text-[10px] uppercase text-gray-500 font-bold mb-1">Sources</div>
                                                                        <div className="flex flex-wrap gap-2">
                                                                            {(turn.answer as any).citations.map((c: any, i: number) => (
                                                                                <a key={i} href={c.uri} target="_blank" rel="noreferrer" className="flex items-center gap-1 bg-gray-900/50 hover:bg-gray-700 px-2 py-1 rounded text-[10px] text-blue-300 transition-colors border border-gray-700/50">
                                                                                    {c.title || 'Source'}
                                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                                                                </a>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-gray-600 p-8">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                </svg>
                                <p className="text-lg font-medium">Select a Session</p>
                                <p className="text-sm mt-2 max-w-xs text-center">Choose a chat session from the sidebar to view the transcript and details.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* JSON Modal */}
                {isJsonModalOpen && selectedSession && (
                    <div className="absolute inset-0 z-[60] bg-black/50 backdrop-blur-sm flex justify-center items-center p-8">
                        <div className="bg-gray-900 w-full max-w-4xl h-[80vh] rounded-lg shadow-2xl flex flex-col border border-gray-700">
                            <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-gray-800">
                                <h3 className="text-white font-mono text-sm">JSON Inspector</h3>
                                <button onClick={() => setIsJsonModalOpen(false)} className="text-gray-400 hover:text-white">Close</button>
                            </div>
                            <div className="flex bg-gray-900 border-l border-r border-gray-700 mx-4 mt-2 rounded-t-lg overflow-hidden">
                                <button
                                    onClick={() => setSessionInspectorTab('full')}
                                    className={`px-4 py-2 text-xs font-bold transition-colors ${sessionInspectorTab === 'full' ? 'bg-[#0d1117] text-white border-t-2 border-white' : 'bg-gray-800 text-gray-500 hover:text-gray-300 hover:bg-gray-700'}`}
                                >
                                    Full Session
                                </button>
                                <button
                                    onClick={() => setSessionInspectorTab('inputs')}
                                    className={`px-4 py-2 text-xs font-bold transition-colors ${sessionInspectorTab === 'inputs' ? 'bg-[#0d1117] text-purple-400 border-t-2 border-purple-400' : 'bg-gray-800 text-gray-500 hover:text-gray-300 hover:bg-gray-700'}`}
                                >
                                    User Inputs
                                </button>
                                <button
                                    onClick={() => setSessionInspectorTab('responses')}
                                    className={`px-4 py-2 text-xs font-bold transition-colors ${sessionInspectorTab === 'responses' ? 'bg-[#0d1117] text-yellow-400 border-t-2 border-yellow-400' : 'bg-gray-800 text-gray-500 hover:text-gray-300 hover:bg-gray-700'}`}
                                >
                                    Responses
                                </button>
                            </div>
                            <div className="flex-1 overflow-auto bg-[#0d1117] mx-0 border-t border-gray-700">
                                {sessionInspectorTab === 'full' ? (
                                    <pre className="text-xs font-mono p-4 text-green-400 leading-relaxed whitespace-pre-wrap break-all">{JSON.stringify(selectedSession, null, 2)}</pre>
                                ) : sessionInspectorTab === 'inputs' ? (
                                    <pre className="text-xs font-mono p-4 text-purple-400 leading-relaxed whitespace-pre-wrap break-all">
                                        {JSON.stringify(selectedSession.turns?.map((t: any) => t.query || t.input) || [], null, 2)}
                                    </pre>
                                ) : (
                                    <pre className="text-xs font-mono p-4 text-yellow-400 leading-relaxed whitespace-pre-wrap break-all">
                                        {JSON.stringify(selectedSession.turns?.map((t: any) => t.assistAnswer || t.reply) || [], null, 2)}
                                    </pre>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                {/* Raw Content Modal */}
                {rawContent && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
                        <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col border border-gray-700 overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center bg-gray-800">
                                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                    <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                                    Raw Content Inspector
                                </h3>
                                <button
                                    onClick={() => setRawContent(null)}
                                    className="p-1 hover:bg-gray-700 rounded-full transition-colors text-gray-400 hover:text-white"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            <div className="flex bg-gray-900 border-l border-r border-gray-700 mx-4 mt-2 rounded-t-lg overflow-hidden">
                                <button
                                    onClick={() => setRawContentTab('preview')}
                                    className={`px-4 py-2 text-xs font-bold transition-colors ${rawContentTab === 'preview' ? 'bg-[#0d1117] text-blue-400 border-t-2 border-blue-400' : 'bg-gray-800 text-gray-500 hover:text-gray-300 hover:bg-gray-700'}`}
                                >
                                    Preview (Text)
                                </button>
                                <button
                                    onClick={() => setRawContentTab('input')}
                                    className={`px-4 py-2 text-xs font-bold transition-colors ${rawContentTab === 'input' ? 'bg-[#0d1117] text-purple-400 border-t-2 border-purple-400' : 'bg-gray-800 text-gray-500 hover:text-gray-300 hover:bg-gray-700'}`}
                                >
                                    User Input
                                </button>
                                <button
                                    onClick={() => setRawContentTab('json')}
                                    className={`px-4 py-2 text-xs font-bold transition-colors ${rawContentTab === 'json' ? 'bg-[#0d1117] text-green-400 border-t-2 border-green-400' : 'bg-gray-800 text-gray-500 hover:text-gray-300 hover:bg-gray-700'}`}
                                >
                                    Response JSON
                                </button>
                            </div>
                            <div className="flex-1 overflow-auto bg-[#0d1117] mx-0 border-t border-gray-700">
                                {rawContentTab === 'preview' ? (
                                    <div className="p-6 text-sm text-gray-300 leading-relaxed whitespace-pre-wrap font-sans">
                                        {/* If we have a direct answer string/object, use extraction. If it's a turn with reference, we need to fetch. */}
                                        {rawContent.assistAnswer || rawContent.answer || rawContent.reply ? (
                                            // It's likely a turn or answer object.
                                            // Check if it has a reference string
                                            (typeof (rawContent.assistAnswer || rawContent.answer) === 'string' && (rawContent.assistAnswer || rawContent.answer).startsWith('projects/')) ? (
                                                <FetchAnswerButton
                                                    resourceName={rawContent.assistAnswer || rawContent.answer}
                                                    config={config}
                                                    autoLoad={true}
                                                />
                                            ) : (
                                                extractTextFromResponse(rawContent.answer || rawContent) || <span className="text-gray-500 italic">No extractable text content found.</span>
                                            )
                                        ) : (
                                            <span className="text-gray-500 italic">No content to preview.</span>
                                        )}
                                    </div>
                                ) : rawContentTab === 'input' ? (
                                    <div className="p-6">
                                        <div className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">User Query Object</div>
                                        <pre className="text-xs font-mono text-purple-400 leading-relaxed whitespace-pre-wrap break-all bg-gray-900/50 p-4 rounded border border-gray-800">
                                            {JSON.stringify(rawContent.query || rawContent.input || {}, null, 2)}
                                        </pre>
                                        {rawContent.query?.text && (
                                            <>
                                                <div className="text-xs font-bold text-gray-500 mt-6 mb-2 uppercase tracking-wider">Extracted Text</div>
                                                <div className="text-sm text-white bg-gray-800 p-3 rounded">
                                                    {rawContent.query.text}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex-1 overflow-auto">
                                        {(typeof (rawContent.assistAnswer || rawContent.answer) === 'string' && (rawContent.assistAnswer || rawContent.answer).startsWith('projects/')) ? (
                                            <DetailedJsonFetcher resourceName={rawContent.assistAnswer || rawContent.answer} config={config} />
                                        ) : (
                                            <pre className="text-xs font-mono p-4 text-green-400 leading-relaxed whitespace-pre-wrap break-all">
                                                {JSON.stringify(rawContent.answer || rawContent, null, 2)}
                                            </pre>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="bg-gray-800 px-4 py-2 text-[10px] text-gray-400 border-t border-gray-700 flex justify-between">
                                <span>JSON Structure</span>
                                <button
                                    onClick={() => navigator.clipboard.writeText(JSON.stringify(rawContent, null, 2))}
                                    className="hover:text-white flex items-center gap-1"
                                >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                    Copy JSON
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ChatHistoryArchiveViewer;
