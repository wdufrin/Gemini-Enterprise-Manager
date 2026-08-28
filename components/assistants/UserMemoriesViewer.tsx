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
import { Config, UserMemory, UserProfile } from '../../types';
import * as api from '../../services/apiService';
import Spinner from '../Spinner';
import ConfirmationModal from '../ConfirmationModal';

interface UserMemoriesViewerProps {
  config: Config;
  userProfile?: UserProfile | null;
  onRefreshParent?: () => void;
}

export const UserMemoriesViewer: React.FC<UserMemoriesViewerProps> = ({
  config,
  userProfile,
}) => {
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedRawMemory, setSelectedRawMemory] = useState<UserMemory | null>(null);

  // Pagination state
  const [pageToken, setPageToken] = useState<string | undefined>(undefined);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
  const [pageHistory, setPageHistory] = useState<string[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(1);
  const pageSize = 15;

  // Deletion state
  const [memoryToDelete, setMemoryToDelete] = useState<UserMemory | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchMemories = useCallback(async (token?: string) => {
    if (!config.projectId || !config.appId) return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await api.listUserMemories(config, pageSize, token);
      setMemories(response.memories || []);
      setNextPageToken(response.nextPageToken || undefined);
    } catch (e: any) {
      console.error('Failed to list user memories', e);
      setError(e.message || 'Failed to load user memories from Discovery Engine.');
      setMemories([]);
      setNextPageToken(undefined);
    } finally {
      setIsLoading(false);
    }
  }, [config]);

  useEffect(() => {
    // Reset pagination when engine/location changes
    setPageToken(undefined);
    setNextPageToken(undefined);
    setPageHistory([]);
    setCurrentPageIndex(1);
    fetchMemories();
  }, [config.projectId, config.appLocation, config.appId, fetchMemories]);

  const handleNextPage = () => {
    if (!nextPageToken) return;
    setPageHistory(prev => [...prev, pageToken || '']);
    setPageToken(nextPageToken);
    setCurrentPageIndex(prev => prev + 1);
    fetchMemories(nextPageToken);
  };

  const handlePrevPage = () => {
    if (pageHistory.length === 0) return;
    const prevTokens = [...pageHistory];
    const prevToken = prevTokens.pop();
    const tokenToFetch = prevToken === '' ? undefined : prevToken;
    setPageHistory(prevTokens);
    setPageToken(tokenToFetch);
    setCurrentPageIndex(prev => Math.max(1, prev - 1));
    fetchMemories(tokenToFetch);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeleteConfirm = async () => {
    if (!memoryToDelete) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteUserMemory(memoryToDelete.name, config);
      setMemoryToDelete(null);
      // Refresh current page
      await fetchMemories(pageToken);
    } catch (e: any) {
      console.error('Failed to delete memory', e);
      setDeleteError(e.message || 'Failed to delete memory.');
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'Unknown date';
    try {
      const d = new Date(isoString);
      return d.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return isoString;
    }
  };

  const filteredMemories = useMemo(() => {
    if (!searchQuery.trim()) return memories;
    const q = searchQuery.toLowerCase();
    return memories.filter(m => {
      const text = (m.fact || m.description || m.content || '').toLowerCase();
      const name = (m.name || '').toLowerCase();
      return text.includes(q) || name.includes(q);
    });
  }, [memories, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Information Header Card */}
      <div className="bg-gray-800 rounded-lg p-5 border border-gray-700 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-purple-900/40 text-purple-400 border border-purple-700/50 rounded-lg shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-100 flex items-center gap-2">
                User Personalization Memories
                <span className="px-2 py-0.5 text-xs font-semibold bg-purple-900/60 text-purple-300 rounded border border-purple-700">
                  KnowledgeGraph API
                </span>
              </h3>
              <p className="text-sm text-gray-400 mt-1">
                Lists all persistent preferences, facts, and context saved for the signed-in user under this Gemini Enterprise engine.
              </p>
              {userProfile?.email && (
                <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                  <span className="text-gray-500">Authenticated User:</span>
                  <span className="px-2 py-0.5 bg-gray-900 text-blue-300 font-mono rounded border border-gray-700">
                    {userProfile.email}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 self-end md:self-center">
            <button
              onClick={() => fetchMemories(pageToken)}
              disabled={isLoading}
              className="px-3.5 py-2 bg-gray-700 text-gray-200 text-sm font-medium rounded-md hover:bg-gray-600 disabled:opacity-50 transition-colors flex items-center gap-2"
              title="Refresh memories list"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Search and Stats Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="Search memories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg pl-9 pr-3 py-2 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-500"
          />
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500 absolute left-3 top-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-gray-500 hover:text-gray-300"
            >
              &times;
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-400 w-full sm:w-auto justify-between sm:justify-end">
          <span>Page {currentPageIndex}</span>
          <span>&bull;</span>
          <span>{filteredMemories.length} {filteredMemories.length === 1 ? 'memory' : 'memories'} displayed</span>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm space-y-2">
          <div className="flex items-center gap-2 font-semibold">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>Error Loading Memories</span>
          </div>
          <p className="text-xs text-red-300 font-mono bg-black/30 p-2 rounded overflow-x-auto">{error}</p>
          <div className="text-xs text-gray-400 mt-2">
            <p className="font-semibold text-gray-300 mb-1">Troubleshooting Tips:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Ensure your account has the <code className="text-purple-300">discoveryengine.memories.list</code> IAM permission.</li>
              <li>Verify that Personalization / Memory features are enabled for this Engine.</li>
              <li>Check that you are calling the correct GCP region where this assistant is deployed.</li>
            </ul>
          </div>
        </div>
      )}

      {/* Delete Error Alert */}
      {deleteError && (
        <div className="p-3 bg-red-900/40 border border-red-700 rounded-lg text-red-300 text-xs flex items-center justify-between">
          <span>{deleteError}</span>
          <button onClick={() => setDeleteError(null)} className="text-red-400 hover:text-red-200 font-bold ml-2">
            &times;
          </button>
        </div>
      )}

      {/* Content State */}
      {isLoading ? (
        <div className="p-12 flex flex-col items-center justify-center space-y-3">
          <Spinner />
          <p className="text-sm text-gray-400">Loading user personalization memories...</p>
        </div>
      ) : filteredMemories.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-10 text-center border border-gray-700 space-y-3">
          <div className="w-12 h-12 rounded-full bg-gray-700/50 text-gray-400 mx-auto flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <h4 className="text-base font-semibold text-gray-200">
            {searchQuery ? 'No matching memories found' : 'No saved memories yet'}
          </h4>
          <p className="text-sm text-gray-400 max-w-md mx-auto">
            {searchQuery
              ? `No memories matched your query "${searchQuery}". Try clearing the search filter.`
              : 'As you interact with this Gemini Enterprise Assistant, relevant facts, user preferences, and working context will be automatically learned and listed here.'}
          </p>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="mt-2 px-3 py-1.5 bg-gray-700 text-gray-300 text-xs rounded hover:bg-gray-600 transition-colors"
            >
              Clear Filter
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMemories.map((memory, index) => {
            const memoryId = memory.name ? memory.name.split('/').pop() : `mem-${index}`;
            return (
              <div
                key={memory.name || index}
                className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-all shadow-sm group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2 flex-grow">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 bg-gray-900 text-purple-300 text-xs font-mono rounded border border-gray-700">
                        {memoryId}
                      </span>
                      <button
                        onClick={() => handleCopy(memory.name, memoryId || '')}
                        className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
                        title="Copy Resource Name"
                      >
                        {copiedId === memoryId ? (
                          <span className="text-green-400">Copied!</span>
                        ) : (
                          <span>Copy URI</span>
                        )}
                      </button>
                    </div>

                    <p className="text-sm font-medium text-gray-100 leading-relaxed whitespace-pre-wrap">
                      {memory.fact || memory.description || memory.content || 'No memory text available'}
                    </p>

                    <div className="flex items-center gap-4 text-xs text-gray-500 pt-1">
                      {memory.createTime && (
                        <span>Created: <span className="text-gray-400">{formatDate(memory.createTime)}</span></span>
                      )}
                      {memory.updateTime && memory.updateTime !== memory.createTime && (
                        <span>Updated: <span className="text-gray-400">{formatDate(memory.updateTime)}</span></span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setSelectedRawMemory(memory)}
                      className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-gray-700/60 rounded transition-colors"
                      title="View Raw JSON"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setMemoryToDelete(memory)}
                      className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors"
                      title="Delete this memory"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {!isLoading && (pageHistory.length > 0 || nextPageToken) && (
        <div className="p-4 border-t border-gray-700 bg-gray-800 rounded-lg flex justify-between items-center">
          <div className="text-sm text-gray-400">
            Page <span className="font-semibold text-white">{currentPageIndex}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePrevPage}
              disabled={pageHistory.length === 0 || isLoading}
              className="px-3 py-1 bg-gray-700 text-gray-300 text-xs font-medium rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <button
              onClick={handleNextPage}
              disabled={!nextPageToken || isLoading}
              className="px-3 py-1 bg-gray-700 text-gray-300 text-xs font-medium rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Delete */}
      <ConfirmationModal
        isOpen={!!memoryToDelete}
        onClose={() => setMemoryToDelete(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete User Memory"
        confirmText="Delete Memory"
        isConfirming={isDeleting}
      >
        {memoryToDelete && (
          <div className="space-y-2 text-sm text-gray-300">
            <p>Are you sure you want to delete this memory? This action cannot be undone and this preference/fact will no longer be considered by the assistant.</p>
            <div className="p-3 bg-gray-900 rounded border border-gray-700 text-xs font-mono text-gray-200 whitespace-pre-wrap">
              {memoryToDelete.fact || memoryToDelete.description}
            </div>
          </div>
        )}
      </ConfirmationModal>

      {/* Raw Memory JSON Viewer Modal */}
      {selectedRawMemory && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-gray-850 border border-gray-700 rounded-xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-700">
              <h3 className="text-lg font-bold text-gray-100 flex items-center gap-2">
                <span className="text-blue-400 font-mono text-sm">&lt;/&gt;</span>
                Raw Memory Object
              </h3>
              <button
                onClick={() => setSelectedRawMemory(null)}
                className="text-gray-400 hover:text-gray-200 text-xl font-bold"
              >
                &times;
              </button>
            </div>
            <pre className="bg-gray-900 p-4 rounded-lg text-xs font-mono text-gray-200 overflow-x-auto max-h-96 border border-gray-800">
              {JSON.stringify(selectedRawMemory, null, 2)}
            </pre>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedRawMemory(null)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserMemoriesViewer;
