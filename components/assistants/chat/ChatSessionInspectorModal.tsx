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

import React, { useState, useRef } from 'react';
import { DiscoverySession } from '../../../types';
import { useModalA11y } from '../../../hooks/useModalA11y';

export interface ChatSessionInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string | null;
  sessionDetails: DiscoverySession | null;
}

export const ChatSessionInspectorModal: React.FC<ChatSessionInspectorModalProps> = ({
  isOpen,
  onClose,
  sessionId,
  sessionDetails,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sessionInspectorTab, setSessionInspectorTab] = useState<'full' | 'inputs' | 'responses'>('full');

  useModalA11y({
    isOpen: isOpen && !!sessionDetails,
    onClose,
    containerRef,
  });

  if (!isOpen || !sessionDetails) return null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex justify-center items-center p-8 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-inspector-title"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="bg-gray-900 w-full max-w-4xl h-[80vh] rounded-lg shadow-2xl flex flex-col border border-gray-700 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-gray-800">
          <h3 id="session-inspector-title" className="text-white font-mono text-sm">JSON Inspector: {sessionId}</h3>
          <button onClick={onClose} aria-label="Close dialog" className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-700">
            Close
          </button>
        </div>
        <div className="flex bg-gray-900 border-l border-r border-gray-700 mx-4 mt-2 rounded-t-lg overflow-hidden">
          <button
            onClick={() => setSessionInspectorTab('full')}
            className={`px-4 py-2 text-xs font-bold transition-colors ${
              sessionInspectorTab === 'full'
                ? 'bg-[#0d1117] text-white border-t-2 border-white'
                : 'bg-gray-800 text-gray-500 hover:text-gray-300 hover:bg-gray-700'
            }`}
          >
            Full Session
          </button>
          <button
            onClick={() => setSessionInspectorTab('inputs')}
            className={`px-4 py-2 text-xs font-bold transition-colors ${
              sessionInspectorTab === 'inputs'
                ? 'bg-[#0d1117] text-purple-400 border-t-2 border-purple-400'
                : 'bg-gray-800 text-gray-500 hover:text-gray-300 hover:bg-gray-700'
            }`}
          >
            User Inputs
          </button>
          <button
            onClick={() => setSessionInspectorTab('responses')}
            className={`px-4 py-2 text-xs font-bold transition-colors ${
              sessionInspectorTab === 'responses'
                ? 'bg-[#0d1117] text-yellow-400 border-t-2 border-yellow-400'
                : 'bg-gray-800 text-gray-500 hover:text-gray-300 hover:bg-gray-700'
            }`}
          >
            Responses
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-[#0d1117] mx-0 border-t border-gray-700">
          {sessionInspectorTab === 'full' ? (
            <pre className="text-xs font-mono p-4 text-green-400 leading-relaxed whitespace-pre-wrap break-all">
              {JSON.stringify(sessionDetails, null, 2)}
            </pre>
          ) : sessionInspectorTab === 'inputs' ? (
            <pre className="text-xs font-mono p-4 text-purple-400 leading-relaxed whitespace-pre-wrap break-all">
              {JSON.stringify(
                sessionDetails.turns?.map((t: any) => t.query || t.input) || [],
                null,
                2,
              )}
            </pre>
          ) : (
            <pre className="text-xs font-mono p-4 text-yellow-400 leading-relaxed whitespace-pre-wrap break-all">
              {JSON.stringify(
                sessionDetails.turns?.map((t: any) => t.assistAnswer || t.reply) || [],
                null,
                2,
              )}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};
