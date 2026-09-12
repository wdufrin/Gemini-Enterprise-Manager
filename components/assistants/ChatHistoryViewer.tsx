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

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Config, DiscoverySession } from '../../types';
import * as api from '../../services/apiService';
import Spinner from '../Spinner';
import { useToast } from '../../context/ToastContext';
import { toErrorMessage } from '../../utils/errors';

interface ChatHistoryViewerProps {
    config: Config;
}

// ----------------------------------------------------------------------------
// Helper: Answer Fetcher (Copied from ChatHistoryArchiveViewer)
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

const ChatHistoryViewer: React.FC<ChatHistoryViewerProps> = ({ config }) => {
    const { toast } = useToast();
    // List State
    const [sessions, setSessions] = useState<DiscoverySession[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [userFilter, setUserFilter] = useState<string>('');
    const [isJsonModalOpen, setIsJsonModalOpen] = useState(false);
    const [rawContent, setRawContent] = useState<any | null>(null);
    const [rawContentTab, setRawContentTab] = useState<'json' | 'preview' | 'input'>('preview');
    const [sessionInspectorTab, setSessionInspectorTab] = useState<'full' | 'inputs' | 'responses'>('full');

    // Detail View State
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
    const [selectedSessionDetails, setSelectedSessionDetails] = useState<DiscoverySession | null>(null);
    const [isDetailLoading, setIsDetailLoading] = useState(false);

    // Batch Auto-Load State
    const [autoLoadSession, setAutoLoadSession] = useState<Set<string>>(new Set());

    // ------------------------------------------------------------------------
    // Fetching Logic
    // ------------------------------------------------------------------------

    const fetchSessions = useCallback(async (pageToken?: string) => {
        setIsLoading(true);
        setError(null);
        if (!pageToken) {
            setSessions([]);
            setSelectedSessionId(null);
            setSelectedSessionDetails(null);
        }

        try {
            const response = await api.listDiscoverySessions(config, pageToken);
            const newSessions = response.sessions || [];

            setSessions(prev => {
                const combined = pageToken ? [...prev, ...newSessions] : newSessions;
                // Sort by startTime descending if available
                return combined.sort((a, b) => {
                    const dateA = a.startTime ? new Date(a.startTime).getTime() : 0;
                    const dateB = b.startTime ? new Date(b.startTime).getTime() : 0;
                    return dateB - dateA;
                });
            });
            setNextPageToken(response.nextPageToken);

        } catch (err: any) {
            console.error("Failed to fetch sessions", err);
            setError(err.message || "Failed to fetch sessions.");
        } finally {
            setIsLoading(false);
        }
    }, [config]);

    // Auto-fetch on mount
    useEffect(() => {
        if (config.appId) {
            fetchSessions();
        }
    }, [config.appId, config.appLocation, fetchSessions]);

    const handleSessionClick = async (session: DiscoverySession) => {
        // Always clear modal when clicking a session item, even if it's the same one (to be safe/consistent)
        setRawContent(null);
        setIsJsonModalOpen(false);

        if (selectedSessionId === session.name) {
            // Toggle off if already selected? 
            // Actually, usually improved UX is to keep it selected or just refresh. 
            // But let's keep toggle behavior if desired, OR just return.
            // Let's keep toggle for now to match previous logic, but ensure modals closed.
            setSelectedSessionId(null);
            setSelectedSessionDetails(null);
            return;
        }

        setSelectedSessionId(session.name);
        setIsDetailLoading(true);
        try {
            const details = await api.getDiscoverySession(session.name, config);
            setSelectedSessionDetails(details);
        } catch (err: any) {
            console.error("Failed to fetch session details", err);
            // Optionally show error toast
        } finally {
            setIsDetailLoading(false);
        }
    };

    const enableAutoLoad = () => {
        if (selectedSessionId) {
            setAutoLoadSession(prev => new Set(prev).add(selectedSessionId));
        }
    };

    const handleCloneSession = async () => {
        if (!selectedSessionDetails) return;

        // Prompt for Target User ID
        const targetUser = prompt('Enter Target User ID for the new session (e.g. email):', selectedSessionDetails.userPseudoId || '');
        if (targetUser === null) return; // Cancelled

        setIsDetailLoading(true);
        try {
            // Prepare payload: copy turns and userPseudoId
            const clonePayload: DiscoverySession = {
                name: '', // Let server generate
                userPseudoId: targetUser || 'cloned-user',
                turns: selectedSessionDetails.turns
            };

            const newSessionRaw = await api.createDiscoverySession(clonePayload, config);

            // The API returns the new session object (or at least name)
            // Refresh list
            await fetchSessions();

            // Try to select the new session if we can parse the name
            if (newSessionRaw && newSessionRaw.name) {
                // We might need to select it. 
                // Since fetchSessions updates state, we might need to wait or just accept it's in the list.
                // Let's rely on the user finding it at the top (since we sort by time).
                handleSessionClick(newSessionRaw);
            }
            toast.success('Session cloned successfully!');

        } catch (err: any) {
            console.error("Failed to clone session", err);
            toast.error(`Failed to clone session: ${toErrorMessage(err)}`);
        } finally {
            setIsDetailLoading(false);
        }
    };

    const handleShareSession = async () => {
        if (!selectedSessionDetails) return;

        // Prompt for Target User ID
        const targetUser = prompt('Enter the User ID (e.g. email) you want to share this session with:', '');
        if (!targetUser) return; // Cancelled

        setIsDetailLoading(true);
        try {
            // Prepare payload: copy turns and userPseudoId
            const clonePayload: DiscoverySession = {
                name: '', // Let server generate
                userPseudoId: targetUser,
                turns: selectedSessionDetails.turns
            };

            await api.createDiscoverySession(clonePayload, config);

            // Refresh list
            await fetchSessions();

            toast.success(`Session successfully shared with ${targetUser}!`);

        } catch (err: any) {
            console.error("Failed to share session", err);
            toast.error(`Failed to share session: ${toErrorMessage(err)}`);
        } finally {
            setIsDetailLoading(false);
        }
    };

    const handleCopyLink = () => {
        if (!selectedSessionDetails) return;

        // CID Logic: user says standard collectionId might be wrong.
        // It seems the Console uses a specific UUID for the 'cid' parameter.
        // We will try to load it from localStorage or prompt the user.
        let cid = localStorage.getItem('agentspace_console_cid');

        if (!cid) {
            // Default to collectionId but allow override
            const defaultCid = config.collectionId || 'default_collection';
            const userCid = prompt('Enter the "Console CID" for the link (usually a UUID like "c90049eb...").\n\nIf unknown, check the URL when you are in the Agent Builder console.', defaultCid);
            if (!userCid) return; // Cancelled
            cid = userCid;
            localStorage.setItem('agentspace_console_cid', cid);
        }

        const sessionId = selectedSessionDetails.name.split('/').pop();

        const url = `https://vertexaisearch.cloud.google.com/u/0/home/cid/${cid}/r/session/${sessionId}`;

        navigator.clipboard.writeText(url).then(() => {
            toast.success('Link copied to clipboard!');
        }, (err) => {
            console.error('Could not copy text: ', err);
            toast.error('Failed to copy link.');
        });
    };

    // ------------------------------------------------------------------------
    // Filter Logic
    // ------------------------------------------------------------------------

    const filteredSessions = sessions.filter(s =>
        (s.userPseudoId && s.userPseudoId.includes(searchQuery)) ||
        (s.name.includes(searchQuery))
    ).filter(s => {
        if (!userFilter) return true;
        return s.userPseudoId === userFilter;
    });

    const uniqueUsers = Array.from(new Set(sessions.map(s => s.userPseudoId).filter(Boolean))) as string[];

    // ------------------------------------------------------------------------
    // Rendering Helpers (Copied from ChatHistoryArchiveViewer)
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
    // UI Render
    // ------------------------------------------------------------------------

    return (
        <div className="bg-gray-800 rounded-lg shadow-xl border border-gray-700 h-[650px] flex overflow-hidden relative">

            {/* Left Sidebar: Session List & Filters */}
            <div className="w-80 flex flex-col border-r border-gray-700 bg-gray-900/40 flex-shrink-0">
                <div className="p-4 border-b border-gray-700 bg-gray-900/50 space-y-3">
                    <div className="flex justify-between items-center">
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Sessions</h3>
                        <button
                            onClick={() => fetchSessions()}
                            disabled={isLoading}
                            className="text-gray-400 hover:text-white transition-colors"
                            title="Refresh List"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                    </div>

                    <input
                        type="text"
                        placeholder="Search ID..."
                        className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-xs text-white focus:border-blue-500 outline-none placeholder-gray-500"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />

                    <select
                        className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-xs text-white outline-none"
                        value={userFilter}
                        onChange={(e) => setUserFilter(e.target.value)}
                    >
                        <option value="">All Users</option>
                        {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {isLoading && sessions.length === 0 ? (
                        <div className="flex justify-center p-8"><Spinner /></div>
                    ) : filteredSessions.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 text-xs">No sessions found</div>
                    ) : (
                        <div className="divide-y divide-gray-700/50">
                            {filteredSessions.map(session => (
                                <div
                                    key={session.name}
                                    onClick={() => handleSessionClick(session)}
                                    className={`p-3 cursor-pointer transition-colors hover:bg-gray-800/60 ${selectedSessionId === session.name ? 'bg-blue-900/20 border-l-2 border-blue-500' : 'border-l-2 border-transparent'}`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="text-xs font-bold text-blue-300 truncate w-2/3" title={session.userPseudoId || 'Anonymous'}>
                                            {session.userPseudoId || 'Anonymous User'}
                                        </span>
                                        <span className="text-[10px] text-gray-500">
                                            {session.startTime ? new Date(session.startTime).toLocaleDateString() : 'N/A'}
                                        </span>
                                    </div>
                                    <div className="text-[9px] text-gray-500 font-mono truncate mb-1" title={session.name}>
                                        {session.name.split('/').pop()}
                                    </div>
                                    <div className="flex justify-between items-end">
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider font-bold ${session.state === 'IN_PROGRESS' ? 'bg-yellow-900/20 text-yellow-500' : 'bg-green-900/20 text-green-500'}`}>
                                            {session.state || 'UNKNOWN'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                            {nextPageToken && !isLoading && !error && (
                                <div className="p-3 text-center border-t border-gray-700/50">
                                    <button
                                        onClick={() => fetchSessions(nextPageToken)}
                                        className="text-xs text-blue-400 hover:text-blue-300 font-medium"
                                    >
                                        Load More...
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <div className="p-2 border-t border-gray-700 text-[10px] text-gray-600 text-center bg-gray-900/30">
                    {filteredSessions.length} sessions loaded
                </div>
            </div>

            {/* Right Main: Transcript */}
            <div className="flex-1 flex flex-col bg-gray-900 relative">
                {selectedSessionId ? (
                    <>
                        {/* Session Header */}
                        <div className="h-14 px-4 border-b border-gray-700 flex justify-between items-center bg-gray-800/40 shrink-0">
                            <div>
                                <div className="text-sm font-bold text-white flex items-center gap-2">
                                    {selectedSessionDetails?.userPseudoId || 'Loading...'}
                                    <span className="text-gray-500 font-normal">in</span>
                                    <span className="text-blue-300">{config.appId}</span>
                                </div>
                                <div className="text-[10px] text-gray-500 font-mono">{selectedSessionId}</div>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={enableAutoLoad}
                                    disabled={autoLoadSession.has(selectedSessionId)}
                                    className="text-xs text-blue-400 font-medium hover:text-blue-300 transition-colors disabled:opacity-50"
                                >
                                    {autoLoadSession.has(selectedSessionId) ? 'Auto-Loading' : 'Load All Content'}
                                </button>
                                <button
                                    onClick={handleCloneSession}
                                    disabled={isDetailLoading}
                                    className="text-xs text-green-400 font-medium hover:text-green-300 transition-colors disabled:opacity-50 flex items-center gap-1"
                                    title="Clone this session to a new one"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                                    </svg>
                                    Clone Session
                                </button>

                                <button
                                    onClick={handleShareSession}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                    disabled={!selectedSessionDetails || isDetailLoading}
                                    title="Share this session with another user (Clones it to their ID)"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 105.367-2.684 3 3 00-5.367 2.684zm0 9.316a3 3 105.368 2.684 3 3 00-5.368-2.684z" />
                                    </svg>
                                    Share Session
                                    Share Session
                                </button>

                                <button
                                    onClick={handleCopyLink}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white text-xs rounded transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                    disabled={!selectedSessionDetails}
                                    title="Copy link to this session"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                    </svg>
                                    Copy Link
                                </button>

                                <button
                                    onClick={() => setIsJsonModalOpen(true)}
                                    className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-700 transition-colors"
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
                            {isDetailLoading && !selectedSessionDetails ? (
                                <div className="flex justify-center items-center h-full"><Spinner /></div>
                            ) : (!selectedSessionDetails?.turns || selectedSessionDetails.turns.length === 0) ? (
                                <div className="text-center text-gray-500 mt-20">
                                    <p>No conversation history found for this session.</p>
                                    <p className="text-xs mt-2">This session might be empty or the turns were not captured.</p>
                                </div>
                            ) : (
                                <div className="max-w-4xl mx-auto space-y-6">
                                    {selectedSessionDetails.turns.map((turn, idx) => {
                                        const answerData = getAnswerContent(turn);
                                        const isAutoLoad = selectedSessionId && autoLoadSession.has(selectedSessionId);

                                        return (
                                            <div key={idx} className="flex flex-col gap-3 animate-fadeIn group">
                                                {/* User */}
                                                {(turn.query?.text || (turn as any).input?.text) && (
                                                    <div className="flex justify-end">
                                                        <div className="bg-blue-600 text-white px-4 py-3 rounded-2xl rounded-tr-sm max-w-[85%] shadow-md">
                                                            <div className="text-sm whitespace-pre-wrap">{turn.query?.text || (turn as any).input?.text}</div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Agent */}
                                                <div className="flex justify-start">
                                                    <div
                                                        onClick={() => setRawContent(turn)}
                                                        className="bg-gray-800 border border-gray-700 text-gray-200 px-4 py-3 rounded-2xl rounded-tl-sm max-w-[85%] shadow-md relative group/agent cursor-pointer hover:bg-gray-750 hover:border-gray-600 transition-all select-text"
                                                        title="Click to view Raw JSON"
                                                    >
                                                        {/* Answer Content */}
                                                        <div className="text-sm leading-relaxed pointer-events-none">
                                                            <div className="pointer-events-auto">
                                                                {answerData.type === 'text' && <div className="whitespace-pre-wrap">{answerData.content}</div>}

                                                                {answerData.type === 'reference' && (
                                                                    <div className="w-full" onClick={(e) => e.stopPropagation()}>
                                                                        <div className="text-[10px] text-gray-500 font-mono mb-1 uppercase tracking-wider">Reference Answer</div>
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
                                                                    <div className="text-xs text-gray-500 italic">No output content</div>
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
                                    })}
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-600 p-8 bg-gray-900/20">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                        <p className="text-lg font-medium text-gray-500">Select a Session</p>
                        <p className="text-sm mt-2 max-w-xs text-center text-gray-600">Choose a chat session from the sidebar to view the transcript and details.</p>
                    </div>
                )}
            </div>

            {/* JSON Modal */}
            {isJsonModalOpen && selectedSessionDetails && (
                <div
                    className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex justify-center items-center p-8 animate-fadeIn"
                    onClick={() => setIsJsonModalOpen(false)}
                >
                    <div
                        className="bg-gray-900 w-full max-w-4xl h-[80vh] rounded-lg shadow-2xl flex flex-col border border-gray-700"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-gray-800">
                            <h3 className="text-white font-mono text-sm">JSON Inspector: {selectedSessionId}</h3>
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
                                <pre className="text-xs font-mono p-4 text-green-400 leading-relaxed whitespace-pre-wrap break-all">{JSON.stringify(selectedSessionDetails, null, 2)}</pre>
                            ) : sessionInspectorTab === 'inputs' ? (
                                <pre className="text-xs font-mono p-4 text-purple-400 leading-relaxed whitespace-pre-wrap break-all">
                                    {JSON.stringify(selectedSessionDetails.turns?.map((t: any) => t.query || t.input) || [], null, 2)}
                                </pre>
                            ) : (
                                <pre className="text-xs font-mono p-4 text-yellow-400 leading-relaxed whitespace-pre-wrap break-all">
                                    {JSON.stringify(selectedSessionDetails.turns?.map((t: any) => t.assistAnswer || t.reply) || [], null, 2)}
                                </pre>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Raw Content Modal (for individual turns/answers) */}
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
                                        // Reuse FetchAnswerButton but we need JSON.
                                        // Since FetchAnswerButton only renders text, we need a special mode or component.
                                        // For now, let's use a simple inline fetcher or just show the turn + reference + "Use Preview to see content".
                                        // Actually, the user WANTS the JSON.
                                        // Let's create a temporary fetcher here.
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
    );
};

export default ChatHistoryViewer;
