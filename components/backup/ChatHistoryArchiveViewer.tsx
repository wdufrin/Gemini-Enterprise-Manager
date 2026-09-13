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

import React, { useState, useMemo, useRef } from 'react';
import { DiscoverySession, Config } from '../../types';
import { RestoreStatusBar } from './RestoreStatusBar';
import { useChatArchiveRestore } from '../../hooks/useChatArchiveRestore';
import { useModalA11y } from '../../hooks/useModalA11y';
import { ChatSessionInspectorModal } from '../assistants/chat/ChatSessionInspectorModal';
import { RawContentInspectorModal } from '../assistants/chat/RawContentInspectorModal';
import { ChatTurnRenderer } from '../assistants/chat/ChatTurnRenderer';

export { extractTextFromResponse, getAnswerContent } from '../assistants/chat/chatAnswerUtils';
export { FetchAnswerButton, DetailedJsonFetcher } from '../assistants/chat/FetchAnswerButton';

export interface ChatHistoryArchiveViewerProps {
  sessions: DiscoverySession[];
  onClose: () => void;
  fileName: string;
  config: Config;
}

export const ChatHistoryArchiveViewer: React.FC<ChatHistoryArchiveViewerProps> = ({
  sessions,
  onClose,
  fileName,
  config,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [userFilter, setUserFilter] = useState<string>('');
  const [selectedApp, setSelectedApp] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [targetUserId, setTargetUserId] = useState<string>('');

  // Selected Session & Inspector State
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [isJsonModalOpen, setIsJsonModalOpen] = useState(false);
  const [rawContent, setRawContent] = useState<any | null>(null);

  // Restore Hook
  const { restoreStatus, setRestoreStatus, handleRestore } = useChatArchiveRestore(config);

  useModalA11y({
    isOpen: true,
    onClose,
    containerRef,
    preventClose: restoreStatus.isRestoring,
  });

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
    return sessions.filter((s) => {
      if (
        searchQuery &&
        !s.name.includes(searchQuery) &&
        !s.userPseudoId?.includes(searchQuery)
      ) {
        return false;
      }
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

  const uniqueApps = useMemo(
    () => Array.from(new Set(sessions.map((s) => getAppId(s.name)))).sort(),
    [sessions],
  );
  const uniqueUsers = useMemo(
    () =>
      Array.from(new Set(sessions.map((s) => s.userPseudoId).filter(Boolean))) as string[],
    [sessions],
  );

  const selectedSession = useMemo(
    () => sessions.find((s) => s.name === selectedSessionId) || null,
    [sessions, selectedSessionId],
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-center items-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-archive-title"
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="bg-gray-900 border border-gray-700 w-full max-w-7xl h-[90vh] rounded-xl flex flex-col shadow-2xl overflow-hidden outline-none"
      >
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-gray-700 bg-gray-800/80 flex justify-between items-center shrink-0">
          <div>
            <div className="flex items-center gap-3">
              <span className="p-2 bg-blue-900/40 text-blue-400 rounded-lg border border-blue-800/50">
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
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                  />
                </svg>
              </span>
              <div>
                <h2 id="chat-archive-title" className="text-lg font-bold text-white leading-tight">
                  Chat History Archive Viewer
                </h2>
                <span className="text-xs text-gray-400 font-mono">{fileName}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs px-2.5 py-1 bg-gray-800 border border-gray-700 rounded-full text-gray-300">
              {filteredSessions.length} / {sessions.length} sessions
            </span>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-800 transition-colors"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content Body */}
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
                onChange={(e) => setSearchQuery(e.target.value)}
              />

              <div className="pt-2 border-t border-gray-700/50">
                <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1 block">
                  Target App / Engine
                </label>
                <div className="text-xs text-white bg-gray-900 border border-gray-600 rounded px-3 py-2 flex items-center gap-2">
                  <span className="truncate flex-1">
                    {config.appId || config.reasoningEngineId || (
                      <span className="text-red-400 italic">None Selected</span>
                    )}
                  </span>
                  {!config.appId && !config.reasoningEngineId && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 text-red-500 shrink-0"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>
                {!config.appId && !config.reasoningEngineId ? (
                  <p className="text-[9px] text-red-400 mt-1">
                    Please select an App or Engine in the main Backup tab.
                  </p>
                ) : config.appId ? (
                  <div className="mt-2 p-2 bg-red-900/30 border border-red-800/50 rounded flex gap-2 items-start shrink-0">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 text-red-400 shrink-0 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                    <p className="text-[9px] text-red-300 leading-relaxed">
                      <strong>API Limitation:</strong> Restoring Chat History to Gemini
                      Enterprise Apps is technically <strong>unsupported</strong>. The
                      Discovery Engine API natively drops Agent Responses from imported sessions.
                      Use this Offline Viewer to read histories instead.
                    </p>
                  </div>
                ) : (
                  <p className="text-[9px] text-gray-500 mt-1">
                    Sessions will be restored into this App.
                  </p>
                )}
              </div>

              <div className="pt-2 border-t border-gray-700/50">
                <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1 block">
                  Restore As User (Optional)
                </label>
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
                <select
                  className="bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-xs text-white outline-none"
                  value={selectedApp}
                  onChange={(e) => setSelectedApp(e.target.value)}
                >
                  <option value="">All Apps</option>
                  {uniqueApps.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>

              {/* Restore Action */}
              <button
                onClick={() => handleRestore(filteredSessions, targetUserId)}
                disabled={
                  filteredSessions.length === 0 ||
                  restoreStatus.isRestoring ||
                  (!config.appId && !config.reasoningEngineId) ||
                  !!config.appId
                }
                className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-xs font-bold text-gray-200 rounded border border-gray-600 flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Restore Filtered List
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {filteredSessions.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">No sessions found</div>
              ) : (
                filteredSessions.map((session) => (
                  <div
                    key={session.name}
                    onClick={() => {
                      setSelectedSessionId(session.name);
                      setRawContent(null);
                    }}
                    className={`p-4 border-b border-gray-700/50 cursor-pointer transition-colors hover:bg-gray-700/30 ${
                      selectedSessionId === session.name
                        ? 'bg-blue-900/20 border-l-4 border-l-blue-500'
                        : 'border-l-4 border-l-transparent'
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
                      className="text-[9px] text-gray-400 font-mono truncate mb-1"
                      title={session.name}
                    >
                      {session.name.split('/').pop()}
                    </div>
                    <div className="flex justify-between items-end">
                      <span className="text-[9px] text-gray-500">{getAppId(session.name)}</span>
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
                ))
              )}
            </div>

            {/* Restore Progress Bar */}
            <RestoreStatusBar status={restoreStatus} setStatus={setRestoreStatus} />
          </div>

          {/* Right Main: Transcript */}
          <div className="flex-1 flex flex-col bg-gray-900 relative">
            {selectedSession ? (
              <>
                {/* Session Header */}
                <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-800/40 shrink-0">
                  <div>
                    <div className="text-sm font-bold text-white flex items-center gap-2">
                      {selectedSession.userPseudoId || 'Anonymous User'}
                      <span className="text-gray-500 font-normal">in</span>
                      <span className="text-blue-300">{getAppId(selectedSession.name)}</span>
                    </div>
                    <div className="text-[10px] text-gray-500 font-mono">{selectedSession.name}</div>
                  </div>
                  <div className="flex items-center gap-2">
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
                  {!selectedSession.turns || selectedSession.turns.length === 0 ? (
                    <div className="text-center text-gray-500 mt-20">
                      <p>No conversation history found for this session.</p>
                      <p className="text-xs mt-2">
                        This session might be empty or the turns were not captured in the archive.
                      </p>
                    </div>
                  ) : (
                    <div className="max-w-4xl mx-auto space-y-6">
                      {selectedSession.turns.map((turn, idx) => (
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
              <div className="flex-1 flex flex-col items-center justify-center text-gray-600 p-8">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-16 w-16 mb-4 opacity-50"
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
                <p className="text-lg font-medium">Select a Session</p>
                <p className="text-sm mt-2 max-w-xs text-center">
                  Choose a chat session from the sidebar to view the transcript and details.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* JSON Modal */}
        <ChatSessionInspectorModal
          isOpen={isJsonModalOpen}
          onClose={() => setIsJsonModalOpen(false)}
          sessionId={selectedSessionId}
          sessionDetails={selectedSession}
        />

        {/* Raw Content Modal */}
        <RawContentInspectorModal
          rawContent={rawContent}
          onClose={() => setRawContent(null)}
          config={config}
        />
      </div>
    </div>
  );
};

export default ChatHistoryArchiveViewer;
