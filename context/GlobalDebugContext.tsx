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

import React, {
    createContext,
    useContext,
    useState,
    ReactNode,
    useEffect,
    useRef,
    useCallback,
    useMemo,
} from 'react';
import * as api from '../services/apiService';

export interface ApiHistoryItem {
    id: string;
    timestamp: Date;
    method: string;
    url: string;
    curlCommand: string;
    requestBody?: unknown;
    status?: number;
    durationMs?: number;
    responseBody?: unknown;
    errorMessage?: string;
}

interface GlobalDebugContextType {
    showCurlPreview: boolean;
    setShowCurlPreview: (show: boolean) => void;
    apiHistory: ApiHistoryItem[];
    getApiHistory: () => ApiHistoryItem[];
    clearHistory: () => void;
}

const GlobalDebugContext = createContext<GlobalDebugContextType | undefined>(undefined);

const MAX_HISTORY_ITEMS = 50;
const BURST_COALESCE_MS = 120;

const createHistoryId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `api-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

export const GlobalDebugProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // Default to false for sidebar visibility; ring buffer always captures last 50 API calls
    // while coalescing rapid bursts (e.g. 50 parallel RPCs -> 1 trailing React render instead of 50).
    const [showCurlPreview, setShowCurlPreviewState] = useState(false);
    const [apiHistory, setApiHistory] = useState<ApiHistoryItem[]>([]);
    const historyBufferRef = useRef<ApiHistoryItem[]>([]);
    const lastFlushAtRef = useRef(0);
    const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const setShowCurlPreview = useCallback((show: boolean) => {
        setShowCurlPreviewState(show);
        if (show) {
            lastFlushAtRef.current = 0;
            setApiHistory([...historyBufferRef.current]);
        }
    }, []);

    const getApiHistory = useCallback(() => historyBufferRef.current, []);

    useEffect(() => {
        api.setDebugLogger((log) => {
            const newItem: ApiHistoryItem = {
                id: createHistoryId(),
                timestamp: new Date(),
                method: log.method,
                url: log.url,
                curlCommand: log.curlCommand,
                requestBody: log.body,
                status: log.status,
                durationMs: log.durationMs,
                responseBody: log.responseBody,
                errorMessage: log.errorMessage,
            };

            const nextBuffer = [newItem, ...historyBufferRef.current].slice(0, MAX_HISTORY_ITEMS);
            historyBufferRef.current = nextBuffer;

            const now = Date.now();
            if (now - lastFlushAtRef.current >= BURST_COALESCE_MS && !flushTimerRef.current) {
                lastFlushAtRef.current = now;
                setApiHistory(nextBuffer);
                return;
            }

            if (!flushTimerRef.current) {
                flushTimerRef.current = setTimeout(() => {
                    flushTimerRef.current = null;
                    lastFlushAtRef.current = Date.now();
                    setApiHistory([...historyBufferRef.current]);
                }, BURST_COALESCE_MS);
            }
        });

        return () => {
            if (flushTimerRef.current) {
                clearTimeout(flushTimerRef.current);
                flushTimerRef.current = null;
            }
            api.setDebugLogger(null);
        };
    }, []);

    const clearHistory = useCallback(() => {
        if (flushTimerRef.current) {
            clearTimeout(flushTimerRef.current);
            flushTimerRef.current = null;
        }
        historyBufferRef.current = [];
        setApiHistory([]);
    }, []);

    const contextValue = useMemo(
        () => ({
            showCurlPreview,
            setShowCurlPreview,
            apiHistory,
            getApiHistory,
            clearHistory,
        }),
        [showCurlPreview, setShowCurlPreview, apiHistory, getApiHistory, clearHistory],
    );

    return (
        <GlobalDebugContext.Provider value={contextValue}>
            {children}
        </GlobalDebugContext.Provider>
    );
};

export const useOptionalGlobalDebug = (): GlobalDebugContextType | undefined => {
    return useContext(GlobalDebugContext);
};

export const useGlobalDebug = () => {
    const context = useContext(GlobalDebugContext);
    if (context === undefined) {
        throw new Error('useGlobalDebug must be used within a GlobalDebugProvider');
    }
    return context;
};
