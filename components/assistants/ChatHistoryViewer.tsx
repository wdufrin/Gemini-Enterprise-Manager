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
import { Config } from '../../types';
import Spinner from '../Spinner';
import { useChatHistory } from '../../hooks/useChatHistory';
import { ChatSessionInspectorModal } from './chat/ChatSessionInspectorModal';
import { RawContentInspectorModal } from './chat/RawContentInspectorModal';
import { ChatTurnRenderer } from './chat/ChatTurnRenderer';

export { extractTextFromResponse, getAnswerContent } from './chat/chatAnswerUtils';
export { FetchAnswerButton, DetailedJsonFetcher } from './chat/FetchAnswerButton';

export interface ChatHistoryViewerProps {
  config: Config;
}

export const ChatHistoryViewer: React.FC<ChatHistoryViewerProps> = ({ config }) => {
  const {
    sessions,
    isLoading,
    nextPageToken,
    error,
    searchQuery,
    setSearchQuery,
    userFilter,
    setUserFilter,
    isJsonModalOpen,
    setIsJsonModalOpen,
    rawContent,
    setRawContent,
    selectedSessionId,
    selectedSessionDetails,
    isDetailLoading,
    autoLoadSession,
    fetchSessions,
    handleSessionClick,
    enableAutoLoad,
    handleCloneSession,
    handleShareSession,
    handleCopyLink,
    filteredSessions,
    uniqueUsers,
  } = useChatHistory(config);

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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
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
            {uniqueUsers.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && sessions.length === 0 ? (
            <div className="flex justify-center p-8">
              <Spinner />
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-xs">No sessions found</div>
          ) : (
            <div className="divide-y divide-gray-700/50">
              {filteredSessions.map((session) => (
                <div
                  key={session.name}
                  onClick={() => handleSessionClick(session)}
                  className={`p-3 cursor-pointer transition-colors hover:bg-gray-800/60 ${
                    selectedSessionId === session.name
                      ? 'bg-blue-900/20 border-l-2 border-blue-500'
                      : 'border-l-2 border-transparent'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span
                      className="text-xs font-bold text-blue-300 truncate w-2/3"
                      title={session.userPseudoId || 'Anonymous'}
                    >
                      {session.userPseudoId || 'Anonymous User'}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {session.startTime
                        ? new Date(session.startTime).toLocaleDateString()
                        : 'N/A'}
                    </span>
                  </div>
                  <div
                    className="text-[9px] text-gray-500 font-mono truncate mb-1"
                    title={session.name}
                  >
                    {session.name.split('/').pop()}
                  </div>
                  <div className="flex justify-between items-end">
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider font-bold ${
                        session.state === 'IN_PROGRESS'
                          ? 'bg-yellow-900/20 text-yellow-500'
                          : 'bg-green-900/20 text-green-500'
                      }`}
                    >
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
                      d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"
                    />
                  </svg>
                  Clone Session
                </button>

                <button
                  onClick={handleShareSession}
                  className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!selectedSessionDetails || isDetailLoading}
                  title="Share this session with another user (Clones it to their ID)"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 105.367-2.684 3 3 00-5.367 2.684zm0 9.316a3 3 105.368 2.684 3 3 00-5.368-2.684z"
                    />
                  </svg>
                  Share Session
                </button>

                <button
                  onClick={handleCopyLink}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white text-xs rounded transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!selectedSessionDetails}
                  title="Copy link to this session"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                    />
                  </svg>
                  Copy Link
                </button>

                <button
                  onClick={() => setIsJsonModalOpen(true)}
                  className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-700 transition-colors"
                  title="View Raw JSON"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* Transcript Scroll Area */}
            <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
              {isDetailLoading && !selectedSessionDetails ? (
                <div className="flex justify-center items-center h-full">
                  <Spinner />
                </div>
              ) : !selectedSessionDetails?.turns || selectedSessionDetails.turns.length === 0 ? (
                <div className="text-center text-gray-500 mt-20">
                  <p>No conversation history found for this session.</p>
                  <p className="text-xs mt-2">
                    This session might be empty or the turns were not captured.
                  </p>
                </div>
              ) : (
                <div className="max-w-4xl mx-auto space-y-6">
                  {selectedSessionDetails.turns.map((turn, idx) => (
                    <ChatTurnRenderer
                      key={idx}
                      turn={turn}
                      idx={idx}
                      config={config}
                      onViewRaw={(t) => setRawContent(t)}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-600 p-8 bg-gray-900/20">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-16 w-16 mb-4 opacity-30"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
            <p className="text-lg font-medium text-gray-500">Select a Session</p>
            <p className="text-sm mt-2 max-w-xs text-center text-gray-600">
              Choose a chat session from the sidebar to view the transcript and details.
            </p>
          </div>
        )}
      </div>

      {/* JSON Inspector Modal */}
      <ChatSessionInspectorModal
        isOpen={isJsonModalOpen}
        onClose={() => setIsJsonModalOpen(false)}
        sessionId={selectedSessionId}
        sessionDetails={selectedSessionDetails}
      />

      {/* Raw Content Modal */}
      <RawContentInspectorModal
        rawContent={rawContent}
        onClose={() => setRawContent(null)}
        config={config}
      />
    </div>
  );
};

export default ChatHistoryViewer;
