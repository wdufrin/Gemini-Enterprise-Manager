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

import React, { useState } from 'react';
import { Document } from '../../../types';
import Spinner from '../../Spinner';
import { QueryHistoryEntry } from './types';

export interface QueryHistoryListProps {
  history: QueryHistoryEntry[];
  isSearching: boolean;
  expandedResult: string | null;
  toggleExpandResult: (id: string) => void;
  resultsEndRef: React.RefObject<HTMLDivElement>;
  showCodePanel: boolean;
}

type DocumentWithDerived = Document & {
  derivedStructData?: Record<string, unknown>;
  displayName?: string;
};

export const getDocumentPreview = (doc: Document): string => {
  const docExt = doc as DocumentWithDerived;
  if (docExt.structData && Object.keys(docExt.structData).length > 0) {
    return JSON.stringify(docExt.structData, null, 2);
  }
  if (docExt.jsonData) {
    try {
      return JSON.stringify(JSON.parse(docExt.jsonData), null, 2);
    } catch {
      return docExt.jsonData;
    }
  }
  if (docExt.derivedStructData && Object.keys(docExt.derivedStructData).length > 0) {
    return JSON.stringify(docExt.derivedStructData, null, 2);
  }
  if (docExt.content?.uri) {
    return `Source: ${docExt.content.uri}`;
  }
  return 'No preview available.';
};

export const QueryHistoryList: React.FC<QueryHistoryListProps> = ({
  history,
  isSearching,
  expandedResult,
  toggleExpandResult,
  resultsEndRef,
  showCodePanel,
}) => {
  const [expandedRawEntryIdx, setExpandedRawEntryIdx] = useState<number | null>(null);

  return (
    <main className={`overflow-y-auto p-4 space-y-6 ${showCodePanel ? 'w-1/2' : 'w-full'}`}>
      {history.length === 0 && !isSearching && (
        <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-3">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p className="text-lg">Enter a query to search this data store</p>
          <p className="text-sm">Results from the Discovery Engine Search API will appear here.</p>
        </div>
      )}

      {history.map((entry, historyIdx) => (
        <div key={historyIdx} className="space-y-3">
          {/* User Query Bubble */}
          <div className="flex justify-end">
            <div className="bg-blue-600 text-white px-4 py-2 rounded-lg max-w-lg">
              <p className="text-sm whitespace-pre-wrap">{entry.query}</p>
              <div className="flex items-center gap-2 mt-1 justify-end">
                {entry.authMode === 'wif' && (
                  <span className="text-[10px] bg-amber-700 text-amber-100 px-1.5 py-0.5 rounded font-medium">WIF</span>
                )}
                <p className="text-xs text-blue-200">{entry.timestamp.toLocaleTimeString()}</p>
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="flex justify-start">
            <div className="bg-gray-700 rounded-lg max-w-3xl w-full">
              {entry.error ? (
                <div className="p-4 text-red-400 text-sm">
                  <p className="font-semibold">Search Error</p>
                  <p className="mt-1">{entry.error}</p>
                </div>
              ) : entry.results.length === 0 ? (
                <div className="p-4 text-gray-400 text-sm text-center">
                  No results found for this query.
                </div>
              ) : (
                <div>
                  <div className="px-4 py-2 border-b border-gray-600 flex justify-between items-center gap-2">
                    <span className="text-sm text-gray-300 font-semibold">
                      {entry.results.length} result{entry.results.length !== 1 ? 's' : ''}
                      {entry.totalSize != null ? ` (of ${entry.totalSize} total)` : ''}
                    </span>
                    <button
                      type="button"
                      data-testid={`toggle-raw-search-json-${historyIdx}`}
                      onClick={() =>
                        setExpandedRawEntryIdx(expandedRawEntryIdx === historyIdx ? null : historyIdx)
                      }
                      className="text-[11px] px-2 py-0.5 rounded bg-gray-800 border border-gray-600 text-blue-300 hover:bg-gray-700 hover:text-white transition-colors font-mono"
                    >
                      {expandedRawEntryIdx === historyIdx ? 'Hide Raw :search JSON' : 'Raw :search Result JSON'}
                    </button>
                  </div>
                  {expandedRawEntryIdx === historyIdx && (
                    <div className="p-3 bg-gray-950 border-b border-gray-700">
                      <div className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider mb-1">
                        Raw Discovery Engine :search Response Payload
                      </div>
                      <pre
                        data-testid={`raw-search-json-${historyIdx}`}
                        className="text-xs text-green-300 font-mono overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap bg-gray-900 p-2.5 rounded border border-gray-800"
                      >
                        {JSON.stringify(
                          entry.rawResponse ?? { results: entry.results, totalSize: entry.totalSize },
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  )}
                  <div className="divide-y divide-gray-600">
                    {entry.results.map((result, resultIdx) => {
                      const docExt = result.document as DocumentWithDerived | undefined;
                      const docId = docExt?.id || result.id || `${historyIdx}-${resultIdx}`;
                      const uniqueKey = `${historyIdx}-${docId}`;
                      const isExpanded = expandedResult === uniqueKey;
                      const derivedTitle = typeof docExt?.derivedStructData?.title === 'string'
                        ? docExt.derivedStructData.title
                        : undefined;
                      const derivedLink = typeof docExt?.derivedStructData?.link === 'string'
                        ? docExt.derivedStructData.link
                        : undefined;
                      const displayUri = docExt?.content?.uri || derivedLink;

                      return (
                        <div key={uniqueKey} className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => toggleExpandResult(uniqueKey)}
                            className="w-full text-left flex items-start justify-between gap-2 group"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs bg-gray-600 text-gray-300 px-1.5 py-0.5 rounded font-mono shrink-0">
                                  #{resultIdx + 1}
                                </span>
                                <p className="text-sm text-white font-medium truncate">
                                  {docExt?.displayName || derivedTitle || docExt?.id || docId}
                                </p>
                              </div>
                              {displayUri && (
                                <p className="text-xs text-gray-400 mt-1 truncate font-mono">
                                  {displayUri}
                                </p>
                              )}
                            </div>
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className={`h-5 w-5 text-gray-400 group-hover:text-white transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>

                          {isExpanded && (
                            <div className="mt-3 bg-gray-800 rounded-md p-3 border border-gray-600">
                              <div className="space-y-2">
                                <div>
                                  <span className="text-xs font-medium text-gray-400">Document Name:</span>
                                  <p className="text-xs text-gray-300 font-mono break-all">{result.document?.name || 'N/A'}</p>
                                </div>
                                <div>
                                  <span className="text-xs font-medium text-gray-400">Content:</span>
                                  <pre className="text-xs text-gray-300 mt-1 bg-gray-900 p-2 rounded overflow-auto max-h-60 whitespace-pre-wrap">
                                    {getDocumentPreview(result.document)}
                                  </pre>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      {isSearching && (
        <div className="flex justify-start">
          <div className="bg-gray-700 rounded-lg px-6 py-4">
            <div className="flex items-center space-x-3">
              <Spinner />
              <span className="text-sm text-gray-300">Searching...</span>
            </div>
          </div>
        </div>
      )}

      <div ref={resultsEndRef} />
    </main>
  );
};
