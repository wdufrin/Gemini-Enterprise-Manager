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

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
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
    clearHistory: () => void;
}

const GlobalDebugContext = createContext<GlobalDebugContextType | undefined>(undefined);

const createHistoryId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `api-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

export const GlobalDebugProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // Default to false for sidebar visibility; ring buffer always captures last 50 API calls for R2 inspection.
    const [showCurlPreview, setShowCurlPreview] = useState(false);
    const [apiHistory, setApiHistory] = useState<ApiHistoryItem[]>([]);

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

            setApiHistory((prev) => [newItem, ...prev].slice(0, 50));
        });

        return () => {
            api.setDebugLogger(null);
        };
    }, []);

    const clearHistory = () => setApiHistory([]);

    return (
        <GlobalDebugContext.Provider value={{ showCurlPreview, setShowCurlPreview, apiHistory, clearHistory }}>
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
