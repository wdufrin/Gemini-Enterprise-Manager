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
import { ChatMessage, Config } from '../../types';
import { useModalA11y } from '../../hooks/useModalA11y';

interface CurlCommandsModalProps {
  isOpen: boolean;
  onClose: () => void;
  engineName: string;
  config: Config;
  sessionId: string;
  messages: ChatMessage[];
}

const CodeBlock: React.FC<{ content: string }> = ({ content }) => {
  const [copyText, setCopyText] = useState('Copy');
  
  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopyText('Copied!');
      setTimeout(() => setCopyText('Copy'), 2000);
    });
  };

  return (
    <div className="bg-gray-900 rounded-lg overflow-hidden relative">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 px-2 py-1 bg-gray-600 text-white text-xs font-semibold rounded-md hover:bg-gray-500"
      >
        {copyText}
      </button>
      <pre className="p-4 text-xs text-gray-300 whitespace-pre-wrap overflow-x-auto">
        <code>{content}</code>
      </pre>
    </div>
  );
};

const CurlCommandsModal: React.FC<CurlCommandsModalProps> = ({ isOpen, onClose, engineName, config, sessionId, messages }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useModalA11y({
    isOpen,
    onClose,
    containerRef,
  });

  if (!isOpen) return null;

  const { projectId, reasoningEngineLocation } = config;
  if (!reasoningEngineLocation) return null; // Should not happen

  const userMessages = messages.filter(m => m.role === 'user');
  const endpoint = `https://${reasoningEngineLocation}-aiplatform.googleapis.com/v1beta1/${engineName}:streamQuery`;

  const generateCommand = (prompt: string): string => {
    const payload = JSON.stringify({
      input: {
        message: prompt,
        user_id: sessionId,
      },
    }, null, 2);

    // Using a placeholder for the access token is safer than displaying the actual token.
    return `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: ${projectId}" \\
  -d '${payload}' \\
  "${endpoint}"`;
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4"
      aria-modal="true"
      role="dialog"
      aria-labelledby="session-curl-commands-title"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col"
      >
        <header className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h2 id="session-curl-commands-title" className="text-xl font-bold text-white">cURL Commands for this Session</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="text-gray-400 hover:text-white"
          >
            &times;
          </button>
        </header>

        <main className="p-6 overflow-y-auto space-y-6">
          {userMessages.length === 0 ? (
            <p className="text-gray-400 text-center">No requests have been sent in this session yet.</p>
          ) : (
            userMessages.map((msg, index) => (
              <div key={index}>
                <h3 className="text-md font-semibold text-gray-200 mb-2">Request #{index + 1}:</h3>
                <CodeBlock content={generateCommand(msg.content)} />
              </div>
            ))
          )}
        </main>
        
        <footer className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700">Close</button>
        </footer>
      </div>
    </div>
  );
};

export default CurlCommandsModal;