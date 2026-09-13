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

import React, { useState, useEffect, useCallback } from 'react';
import { Config } from '../../../types';
import * as api from '../../../services/apiService';
import { extractTextFromResponse } from './chatAnswerUtils';

export interface FetcherProps {
  resourceName: string;
  config: Config;
  onLoad?: (text: string) => void;
  autoLoad?: boolean;
  onViewRaw?: (data: any) => void;
}

export const FetchAnswerButton: React.FC<FetcherProps> = ({
  resourceName,
  config,
  onLoad,
  autoLoad = true,
}) => {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getDiscoveryAnswer(resourceName, config);
      let text = extractTextFromResponse(result);

      if (!text) {
        text = '[Complex Data]';
      }

      setContent(text);
      if (onLoad) onLoad(text);
    } catch (err: any) {
      console.error('Fetch error:', err);
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

  if (loading) {
    return (
      <span className="inline-flex items-center gap-2 text-xs text-blue-400 animate-pulse">
        <svg
          className="animate-spin h-3 w-3 text-blue-500"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        Loading content...
      </span>
    );
  }

  if (error) {
    return (
      <span className="text-xs text-red-500 flex items-center gap-1">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-3 w-3"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
        Failed
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleFetch();
          }}
          className="ml-1 underline hover:text-red-400"
        >
          Retry
        </button>
      </span>
    );
  }

  if (content) {
    return (
      <div className="mt-1">
        <div
          className={`whitespace-pre-wrap ${
            content === '[Complex Data]' ? 'text-yellow-500 font-mono text-xs italic' : ''
          }`}
        >
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 mt-1">
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleFetch();
        }}
        className="text-xs bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 border border-blue-800/50 px-2 py-1 rounded flex items-center gap-1 transition-colors"
        title="Load Content"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-3 w-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        Load Content
      </button>
    </div>
  );
};

export const DetailedJsonFetcher: React.FC<{ resourceName: string; config: Config }> = ({
  resourceName,
  config,
}) => {
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
