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


import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChatMessage, Config, DataStore, UserProfile } from '../../types';
import * as api from '../../services/apiService';
import ResponseDetailsModal from './ResponseDetailsModal';
import ChatCurlModal from './ChatCurlModal';

interface ChatWindowProps {
    targetDisplayName: string;
    config: Config;
    accessToken: string;
    onClose: () => void;
    userProfile: UserProfile | null;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ targetDisplayName, config, accessToken, onClose, userProfile }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [detailsToShow, setDetailsToShow] = useState<ChatMessage['answerDetails'] | null>(null);
    const [thinkingProcess, setThinkingProcess] = useState<string | null>(null);
    const [isCurlModalOpen, setIsCurlModalOpen] = useState(false);
    
    // Data Store Filtering State
    const [linkedDataStores, setLinkedDataStores] = useState<DataStore[]>([]);
    const [selectedDsNames, setSelectedDsNames] = useState<Set<string>>(new Set());
    const [isFetchingTools, setIsFetchingTools] = useState(false);
    const [showFilters, setShowFilters] = useState(false);

    // WIF Auth State
    const [authMode, setAuthMode] = useState<'default' | 'wif'>('default');
    const [showWifConfig, setShowWifConfig] = useState(false);
    const [wifPoolId, setWifPoolId] = useState('');
    const [wifProviderId, setWifProviderId] = useState('');
    const [isExchangingToken, setIsExchangingToken] = useState(false);
    const [wifTokenError, setWifTokenError] = useState<string | null>(null);
    const [availablePools, setAvailablePools] = useState<any[]>([]);
    const [availableProviders, setAvailableProviders] = useState<any[]>([]);
    const [isLoadingPools, setIsLoadingPools] = useState(false);
    const [isLoadingProviders, setIsLoadingProviders] = useState(false);
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [wifSubjectToken, setWifSubjectToken] = useState('');
    const [wifSubjectTokenType, setWifSubjectTokenType] = useState('urn:ietf:params:oauth:token-type:id_token');
    const [wifSignedInEmail, setWifSignedInEmail] = useState<string | null>(null);
    const [wifProviderDisplayName, setWifProviderDisplayName] = useState<string | null>(null);
    const [wifAccessToken, setWifAccessToken] = useState<string | null>(null);
    const [showManualToken, setShowManualToken] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const filterRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages, thinkingProcess]);

    // Handle clicking outside filter menu to close it
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
                setShowFilters(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Fetch all linked data stores and their display names
    const fetchLinkedTools = useCallback(async () => {
        if (!config.appId) return;
        
        setIsFetchingTools(true);
        try {
            // 1. Get engine to find linked data store IDs
            const fullEngine = await api.getEngine(`projects/${config.projectId}/locations/${config.appLocation}/collections/${config.collectionId}/engines/${config.appId}`, config);
            const dsIds = fullEngine.dataStoreIds || [];
            
            if (dsIds.length === 0) {
                setLinkedDataStores([]);
                setSelectedDsNames(new Set());
                return;
            }

            // 2. Fetch all data stores in the collection to get friendly names
            const dsResponse = await api.listResources('dataStores', config);
            const allDataStores: DataStore[] = dsResponse.dataStores || [];
            
            // 3. Match and store
            const matched = allDataStores.filter(ds => {
                const id = ds.name.split('/').pop();
                return dsIds.includes(id || '');
            });

            setLinkedDataStores(matched);
            // Default to ALL selected
            setSelectedDsNames(new Set(matched.map(m => m.name)));
        } catch (e) {
            console.warn("Failed to auto-fetch tools for engine", e);
        } finally {
            setIsFetchingTools(false);
        }
    }, [config]);

    useEffect(() => {
        setMessages([]);
        setSessionId(null);
        setError(null);
        setInput('');
        setThinkingProcess(null);
        fetchLinkedTools();
    }, [targetDisplayName, fetchLinkedTools]);

    useEffect(() => {
        const discoverPool = async () => {
            if (authMode === 'wif' && showWifConfig && config.projectId && config.appLocation) {
                try {
                    const acl = await api.getAclConfig(config);
                    const poolName = acl.idpConfig?.externalIdpConfig?.workforcePoolName;
                    if (poolName) {
                        const poolId = poolName.split('/').pop();
                        if (poolId && !wifPoolId) {
                            setWifPoolId(poolId);
                        }
                    }
                } catch (e) {
                    console.error("Failed to fetch aclConfig for pool discovery", e);
                }
            }
        };
        discoverPool();
    }, [authMode, showWifConfig, config]);

    useEffect(() => {
        const fetchPools = async () => {
            if (authMode === 'wif' && showWifConfig && config.projectId) {
                setIsLoadingPools(true);
                try {
                    const pools = await api.listWorkloadIdentityPools(config.projectId);
                    setAvailablePools(pools);
                } catch (e) {
                    console.error("Failed to fetch workforce pools", e);
                } finally {
                    setIsLoadingPools(false);
                }
            }
        };
        fetchPools();
    }, [authMode, showWifConfig, config.projectId]);

    useEffect(() => {
        const fetchProviders = async () => {
            if (authMode === 'wif' && wifPoolId && config.projectId) {
                setIsLoadingProviders(true);
                try {
                    const providerData = await api.listWorkloadIdentityProviders(`locations/global/workforcePools/${wifPoolId}`, config.projectId);
                    setAvailableProviders(providerData);
                } catch (e) {
                    console.error("Failed to fetch workforce pool providers", e);
                } finally {
                    setIsLoadingProviders(false);
                }
            } else {
                setAvailableProviders([]);
            }
        };
        fetchProviders();
    }, [authMode, wifPoolId, config.projectId]);

    const handleSignIn = async () => {
        if (!wifPoolId.trim() || !wifProviderId.trim()) return;

        setIsSigningIn(true);
        setWifTokenError(null);
        setWifSubjectToken('');
        setWifSignedInEmail(null);
        setWifAccessToken(null);

        try {
            const providerConfig = await api.fetchWorkforceProviderConfig(
                wifPoolId.trim(),
                wifProviderId.trim(),
            );

            if (!providerConfig.oidc) {
                throw new Error('This provider is not configured for OIDC. Only OIDC providers support automatic sign-in.');
            }

            setWifProviderDisplayName(providerConfig.displayName || null);
            const { issuerUri, clientId } = providerConfig.oidc;

            const discovery = await api.fetchOidcDiscovery(issuerUri);

            const redirectUri = window.location.origin + window.location.pathname;
            const result = await api.signInWithOidcPopup(
                discovery.authorization_endpoint,
                clientId,
                redirectUri,
            );

            setWifSubjectToken(result.idToken);
            setWifSubjectTokenType('urn:ietf:params:oauth:token-type:id_token');
            setWifSignedInEmail(result.email || null);
        } catch (err: any) {
            setWifTokenError(err.message || 'Sign-in failed.');
        } finally {
            setIsSigningIn(false);
        }
    };

    const handleSend = async () => {

        if (!input.trim()) return;

        const userMessage: ChatMessage = { role: 'user', content: input };
        const currentQuery = input;
        
        const assistantMessageIndex = messages.length + 1;
        setMessages(prev => [...prev, userMessage, { role: 'assistant', content: '' }]);
        setInput('');
        setIsLoading(true);
        setError(null);
        setThinkingProcess(null);

        let wasMessageReceived = false;
        let skipReason: string | null = null;
        let finalDiagnostics: any = null;
        let allCitations: any[] = [];
        let currentSessionId = sessionId;

        // Build toolsSpec based on CURRENT filter selection
        const toolsSpec: any = selectedDsNames.size > 0 ? {
            vertexAiSearchSpec: {
                dataStoreSpecs: Array.from(selectedDsNames).map(ds => ({ dataStore: ds }))
            }
        } : undefined;

        try {
            let chatAccessToken = accessToken;

            if (authMode === 'wif') {
                setIsExchangingToken(true);
                setWifTokenError(null);
                try {
                    const stsResult = await api.exchangeStsToken({
                        userProject: config.projectId,
                        poolId: wifPoolId.trim(),
                        providerId: wifProviderId.trim(),
                        subjectToken: wifSubjectToken.trim(),
                        subjectTokenType: wifSubjectTokenType,
                    });
                    chatAccessToken = stsResult.access_token;
                    setWifAccessToken(chatAccessToken);
                } catch (stsErr: any) {
                    setWifTokenError(stsErr.message || 'Token exchange failed.');
                    throw stsErr;
                } finally {
                    setIsExchangingToken(false);
                }
            }

            // 1. Create Session if needed (to attach User ID), using correct token context
            const sessionUserEmail = authMode === 'wif' ? (wifSignedInEmail || userProfile?.email) : userProfile?.email;
            if (!currentSessionId && sessionUserEmail) {
                try {
                    const sessionPayload = {
                        name: '', // Server generated
                        userPseudoId: sessionUserEmail
                    };
                    const newSession = await api.createDiscoverySession(sessionPayload, config, chatAccessToken);
                    if (newSession.name) {
                        currentSessionId = newSession.name;
                        setSessionId(newSession.name);
                    }
                } catch (sessionErr) {
                    console.warn("Failed to create user-attributed session, falling back to anonymous auto-creation.", sessionErr);
                }
            } // Close if (!currentSessionId && sessionUserEmail)

            await api.streamChat(
                null, 
                currentQuery,
                currentSessionId,
                config,
                chatAccessToken,
                (parsedChunk) => {

                    const newSessionId = parsedChunk.sessionInfo?.session;
                    // Only update if we didn't already have one
                    if (newSessionId && !currentSessionId) {
                        currentSessionId = newSessionId;
                        setSessionId(newSessionId);
                    }
                    
                    if (parsedChunk.answer?.diagnosticInfo && parsedChunk.answer?.state === 'SUCCEEDED') {
                        finalDiagnostics = parsedChunk.answer.diagnosticInfo;
                    }

                    const skippedReasons = parsedChunk.answer?.assistSkippedReasons;
                    if (Array.isArray(skippedReasons) && skippedReasons.includes('NON_ASSIST_SEEKING_QUERY_IGNORED')) {
                        skipReason = 'NON_ASSIST_SEEKING_QUERY_IGNORED';
                    }
                    
                    if (parsedChunk.answer?.replies) {
                        for (const reply of parsedChunk.answer.replies) {
                            const references = reply.groundedContent?.textGroundingMetadata?.references;
                            if (references) {
                                allCitations.push(...references);
                            }
                        }
                    }

                    const replyContent = parsedChunk.answer?.replies?.[0]?.groundedContent?.content;
                    
                    if (replyContent) {
                        if (replyContent.thought && replyContent.text) {
                            setThinkingProcess(prev => (prev ? prev + replyContent.text : replyContent.text));
                        }
                        else if (replyContent.text) {
                            wasMessageReceived = true;
                            const chunkText = replyContent.text;
                            setMessages(prev => {
                                const newMessages = [...prev];
                                const lastMessage = newMessages[newMessages.length - 1];
                                if (lastMessage && lastMessage.role === 'assistant') {
                                    const updatedLastMessage = { ...lastMessage, content: lastMessage.content + chunkText };
                                    newMessages[newMessages.length - 1] = updatedLastMessage;
                                    return newMessages;
                                }
                                return prev;
                            });
                        }
                    }
                },
                toolsSpec
            );
        } catch (err: any) {
            console.error("Chat Error Details:", err);
            const errorMessage = `Error: ${err.message || "Failed to get response from agent."}`;
            setError(errorMessage);
            setMessages(prev => {
                const newMessages = [...prev];
                const messageToUpdate = newMessages[assistantMessageIndex];
                if (messageToUpdate?.role === 'assistant' && messageToUpdate.content === '') {
                    newMessages[assistantMessageIndex] = { ...messageToUpdate, content: errorMessage };
                    return newMessages;
                }
                return [...prev, {role: 'assistant', content: errorMessage}];
            });
        } finally {
            setIsLoading(false);
            setThinkingProcess(null);
            setMessages(prev => {
                const newMessages = [...prev];
                const messageToUpdate = newMessages[assistantMessageIndex];

                if (messageToUpdate && messageToUpdate.role === 'assistant') {
                    const answerDetails = (finalDiagnostics || allCitations.length > 0)
                        ? { diagnostics: finalDiagnostics, citations: allCitations }
                        : undefined;
                    
                    let finalContent = messageToUpdate.content;
                    if (!wasMessageReceived && finalContent === '') {
                         if (skipReason === 'NON_ASSIST_SEEKING_QUERY_IGNORED') {
                            finalContent = "[The agent ignored the greeting as it was not a direct question. Please ask a specific question to get a response.]";
                        } else {
                            finalContent = "[The agent processed your request but did not provide a response. Please try rephrasing or ask something else.]";
                        }
                    }

                    const updatedMessage = { 
                        ...messageToUpdate, 
                        content: finalContent, 
                        answerDetails 
                    };
                    
                    newMessages[assistantMessageIndex] = updatedMessage;
                    return newMessages;
                }
                return prev;
            });
        }
    };

    const toggleDs = (name: string) => {
        setSelectedDsNames(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    return (
        <div className="flex flex-col h-full bg-gray-800 shadow-xl rounded-lg border border-gray-700 relative">
            <ResponseDetailsModal isOpen={!!detailsToShow} onClose={() => setDetailsToShow(null)} details={detailsToShow} />
            <ChatCurlModal 
                isOpen={isCurlModalOpen} 
                onClose={() => setIsCurlModalOpen(false)} 
                config={config} 
                sessionId={sessionId} 
                messages={messages} 
                selectedDataStores={Array.from(selectedDsNames)}
                authMode={authMode}
                wifPoolId={wifPoolId}
                wifProviderId={wifProviderId}
                wifSubjectTokenType={wifSubjectTokenType}
            />


            <div className="p-4 flex justify-between items-center border-b border-gray-700 bg-gray-900/20">
                <div className="flex items-center overflow-hidden gap-3">
                    <h2 className="text-lg font-bold text-white truncate" title={`Test Agent: ${targetDisplayName}`}>{targetDisplayName}</h2>
                    {isFetchingTools && <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-blue-400"></div>}
                </div>
                <div className="flex items-center gap-2">
                    {/* Auth Toggle */}
                    <div className="flex rounded-md overflow-hidden border border-gray-600 h-8">
                        <button
                            onClick={() => { setAuthMode('default'); setShowWifConfig(false); }}
                            className={`px-3 py-1 text-xs font-medium transition-colors ${authMode === 'default' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                        >
                            Default
                        </button>
                        <button
                            onClick={() => { setAuthMode('wif'); setShowWifConfig(true); }}
                            className={`px-3 py-1 text-xs font-medium transition-colors ${authMode === 'wif' ? 'bg-amber-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                        >
                            WIF
                        </button>
                    </div>

                    {/* Filters Toggle */}

                    <div className="relative" ref={filterRef}>
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`p-1.5 rounded-md transition-colors flex items-center gap-1.5 text-xs font-semibold ${selectedDsNames.size !== linkedDataStores.length ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white'}`}
                            title="Filter Data Stores"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
                            </svg>
                            Filters {linkedDataStores.length > 0 && `(${selectedDsNames.size})`}
                        </button>
                        
                        {showFilters && (
                            <div className="absolute right-0 mt-2 w-64 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-[70] p-3 animate-fade-in-up">
                                <h4 className="text-[10px] uppercase font-bold text-gray-500 mb-3 tracking-widest">Active Data Stores</h4>
                                {linkedDataStores.length === 0 ? (
                                    <p className="text-xs text-gray-600 italic py-2">No linked data stores found.</p>
                                ) : (
                                    <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                                        {linkedDataStores.map(ds => (
                                            <label key={ds.name} className="flex items-center gap-2 p-2 hover:bg-gray-800 rounded cursor-pointer transition-colors group">
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedDsNames.has(ds.name)}
                                                    onChange={() => toggleDs(ds.name)}
                                                    className="h-3.5 w-3.5 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600"
                                                />
                                                <div className="min-w-0">
                                                    <p className="text-xs font-medium text-gray-300 truncate group-hover:text-white">{ds.displayName}</p>
                                                    <p className="text-[9px] text-gray-500 truncate font-mono">{ds.name.split('/').pop()}</p>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                )}


                                <div className="mt-3 pt-3 border-t border-gray-800 flex justify-between">
                                    <button 
                                        onClick={() => setSelectedDsNames(new Set(linkedDataStores.map(d => d.name)))}
                                        className="text-[10px] text-blue-400 hover:text-blue-300 font-bold"
                                    >
                                        Select All
                                    </button>
                                    <button 
                                        onClick={() => setSelectedDsNames(new Set())}
                                        className="text-[10px] text-red-400 hover:text-red-300 font-bold"
                                    >
                                        Clear All
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={() => setIsCurlModalOpen(true)}
                        className="p-1.5 text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
                        title="Show Assistant API commands (streamAssist)"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                    </button>
                    <button onClick={onClose} className="px-2 py-1.5 text-xs bg-gray-600 text-white font-semibold rounded-md hover:bg-gray-700">
                        &times;
                    </button>
                </div>
            </div>
            
            {/* WIF Configuration Panel Overlay */}
            {authMode === 'wif' && showWifConfig && (
                <div className="absolute top-[64px] left-0 right-0 bottom-0 bg-gray-800 z-50 p-4 flex flex-col space-y-4 animate-fade-in-up border-b border-gray-700">
                    <div className="flex items-center justify-between">
                        <h3 className="text-md font-bold text-amber-400 flex items-center gap-2">
                             Workforce Identity Federation (WIF)
                        </h3>
                        <button onClick={() => setShowWifConfig(false)} className="text-gray-400 hover:text-white">&times;</button>
                    </div>

                    <div className="space-y-3 flex-1 overflow-y-auto pr-2">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-medium text-gray-400 block mb-1">Workforce Pool ID *</label>
                                {isLoadingPools ? (
                                    <div className="text-gray-500 text-xs">Loading pools...</div>
                                ) : (
                                    <select
                                        value={availablePools.some(p => p.name.split('/').pop() === wifPoolId) ? wifPoolId : 'CUSTOM'}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === 'CUSTOM') {
                                                setWifPoolId('');
                                            } else {
                                                setWifPoolId(val);
                                            }
                                        }}
                                        className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1.5 text-sm text-gray-200 focus:ring-amber-500 focus:border-amber-500"
                                    >
                                        <option value="">-- Select a Pool --</option>
                                        {availablePools.map(pool => {
                                            const poolId = pool.name.split('/').pop();
                                            return (
                                                <option key={pool.name} value={poolId}>
                                                    {pool.displayName || poolId}
                                                </option>
                                            );
                                        })}
                                        <option value="CUSTOM">Custom / Not Listed</option>
                                    </select>
                                )}
                                {(isLoadingPools || (!availablePools.some(p => p.name.split('/').pop() === wifPoolId) && wifPoolId !== '') || wifPoolId === '') && (
                                    <input
                                        type="text"
                                        value={wifPoolId}
                                        onChange={(e) => setWifPoolId(e.target.value)}
                                        placeholder="Enter custom pool ID"
                                        className="mt-1 w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:ring-amber-500 focus:border-amber-500"
                                    />
                                )}
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-400 block mb-1">Provider ID *</label>
                                {isLoadingProviders ? (
                                    <div className="text-gray-500 text-xs">Loading providers...</div>
                                ) : (
                                    <select
                                        value={wifProviderId}
                                        onChange={(e) => setWifProviderId(e.target.value)}
                                        className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1.5 text-sm text-gray-200 focus:ring-amber-500 focus:border-amber-500"
                                        disabled={!wifPoolId}
                                    >
                                        <option value="">-- Select a Provider --</option>
                                        {availableProviders.map(provider => {
                                            const providerId = provider.name.split('/').pop();
                                            return (
                                                <option key={provider.name} value={providerId}>
                                                    {provider.displayName || providerId}
                                                </option>
                                            );
                                        })}
                                    </select>
                                )}
                                {!availableProviders.length && !isLoadingProviders && wifPoolId && (
                                    <input
                                        type="text"
                                        value={wifProviderId}
                                        onChange={(e) => setWifProviderId(e.target.value)}
                                        placeholder="Enter provider ID"
                                        className="mt-1 w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:ring-amber-500 focus:border-amber-500"
                                    />
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap pt-2">
                            <button
                                onClick={handleSignIn}
                                disabled={!wifPoolId.trim() || !wifProviderId.trim() || isSigningIn}
                                className="px-4 py-2 bg-amber-600 text-white text-xs font-semibold rounded-md hover:bg-amber-700 disabled:bg-gray-600 flex items-center gap-1.5"
                            >
                                {isSigningIn ? 'Signing in...' : wifSignedInEmail ? 'Re-authenticate' : 'Sign In with Identity Provider'}
                            </button>
                            {wifSignedInEmail && (
                                <span className="text-xs text-green-400 font-mono truncate max-w-[200px]" title={wifSignedInEmail}>
                                    {wifSignedInEmail}
                                </span>
                            )}
                        </div>

                        {/* Manual token fallback */}
                        <details className="text-xs mt-2" open={showManualToken} onToggle={(e) => setShowManualToken((e.target as HTMLDetailsElement).open)}>
                            <summary className="text-gray-500 cursor-pointer hover:text-gray-400 select-none">
                                Advanced: paste token manually
                            </summary>
                            <div className="mt-2 space-y-2 p-2 bg-gray-900/50 rounded-md border border-gray-700">
                                <label className="text-[10px] text-gray-400 block">External Token (OIDC ID Token, etc.)</label>
                                <textarea
                                    value={wifSubjectToken}
                                    onChange={(e) => setWifSubjectToken(e.target.value)}
                                    placeholder="eyJhbGci..."
                                    rows={4}
                                    className="w-full bg-gray-800 border-gray-700 rounded-md text-xs font-mono text-gray-300 p-1.5"
                                />
                            </div>
                        </details>

                        {wifTokenError && (
                            <p className="text-xs text-red-400 bg-red-900/20 p-2 rounded border border-red-700/50">{wifTokenError}</p>
                        )}
                    </div>

                    <div className="pt-2 border-t border-gray-700 flex justify-end">
                        <button onClick={() => setShowWifConfig(false)} className="px-3 py-1.5 bg-gray-600 text-white text-xs font-semibold rounded-md hover:bg-gray-700">
                            Apply & Close
                        </button>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-4">

                {messages.map((msg, index) => (
                    <div key={index} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.role === 'assistant' && msg.content && (
                            <div className="max-w-[85%] px-4 py-2 rounded-lg bg-gray-700 text-gray-200 shadow-sm border border-gray-600/50">
                                <p style={{whiteSpace: 'pre-wrap'}}>{msg.content}</p>
                            </div>
                        )}
                        {msg.role === 'user' && (
                            <div className="max-w-[85%] px-4 py-2 rounded-lg bg-blue-600 text-white shadow-md">
                                <p style={{whiteSpace: 'pre-wrap'}}>{msg.content}</p>
                            </div>
                        )}
                        {msg.role === 'assistant' && msg.answerDetails && (
                            <button
                                onClick={() => setDetailsToShow(msg.answerDetails!)}
                                className="p-1.5 text-gray-400 hover:text-white bg-gray-700 hover:bg-blue-600 rounded-md transition-colors self-end shrink-0"
                                title="Show response details"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                </svg>
                            </button>
                        )}
                    </div>
                ))}
                
                {thinkingProcess && (
                     <div className="flex justify-start animate-pulse">
                       <div className="max-w-[85%] px-4 py-2 rounded-lg bg-gray-800 border border-gray-600 text-gray-400 text-xs italic shadow-inner">
                           <p className="font-bold mb-1 uppercase tracking-widest text-[9px] text-gray-500">LLM Reasoning</p>
                           <p style={{whiteSpace: 'pre-wrap'}}>{thinkingProcess}</p>
                       </div>
                    </div>
                )}

                {isLoading && !thinkingProcess && messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.content === '' && (
                    <div className="flex justify-start">
                       <div className="max-w-xl px-4 py-2 rounded-lg bg-gray-700 text-gray-200">
                           <div className="flex items-center space-x-2">
                               <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                               <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                               <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                           </div>
                       </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {error && !messages.some(m => m.content.includes(error)) && <p className="text-red-400 px-4 pb-2 text-xs">{error}</p>}

            <div className="p-4 border-t border-gray-700 bg-gray-900/10">
                <div className="flex items-center space-x-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && !isLoading && handleSend()}
                        placeholder="Type your message..."
                        className="flex-1 bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500"
                        disabled={isLoading}
                    />
                    <button
                        onClick={handleSend}
                        disabled={isLoading}
                        className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:bg-blue-800 transition-colors shadow-lg"
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChatWindow;
