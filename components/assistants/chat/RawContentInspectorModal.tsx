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
import { Config } from '../../../types';
import { FetchAnswerButton, DetailedJsonFetcher } from './FetchAnswerButton';
import { extractTextFromResponse } from './chatAnswerUtils';
import { useModalA11y } from '../../../hooks/useModalA11y';

export interface RawContentInspectorModalProps {
  rawContent: any | null;
  onClose: () => void;
  config: Config;
}

export const RawContentInspectorModal: React.FC<RawContentInspectorModalProps> = ({
  rawContent,
  onClose,
  config,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rawContentTab, setRawContentTab] = useState<'json' | 'preview' | 'input'>('preview');

  useModalA11y({
    isOpen: !!rawContent,
    onClose,
    containerRef,
  });

  if (!rawContent) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="raw-content-title"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col border border-gray-700 overflow-hidden outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center bg-gray-800">
          <h3 id="raw-content-title" className="text-sm font-bold text-white flex items-center gap-2">
            <svg
              className="w-4 h-4 text-blue-400"
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
            Raw Content Inspector
          </h3>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 hover:bg-gray-750 rounded-full transition-colors text-gray-400 hover:text-white"
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
        <div className="flex bg-gray-900 border-l border-r border-gray-700 mx-4 mt-2 rounded-t-lg overflow-hidden">
          <button
            onClick={() => setRawContentTab('preview')}
            className={`px-4 py-2 text-xs font-bold transition-colors ${
              rawContentTab === 'preview'
                ? 'bg-[#0d1117] text-blue-400 border-t-2 border-blue-400'
                : 'bg-gray-800 text-gray-500 hover:text-gray-300 hover:bg-gray-700'
            }`}
          >
            Preview (Text)
          </button>
          <button
            onClick={() => setRawContentTab('input')}
            className={`px-4 py-2 text-xs font-bold transition-colors ${
              rawContentTab === 'input'
                ? 'bg-[#0d1117] text-purple-400 border-t-2 border-purple-400'
                : 'bg-gray-800 text-gray-500 hover:text-gray-300 hover:bg-gray-700'
            }`}
          >
            User Input
          </button>
          <button
            onClick={() => setRawContentTab('json')}
            className={`px-4 py-2 text-xs font-bold transition-colors ${
              rawContentTab === 'json'
                ? 'bg-[#0d1117] text-green-400 border-t-2 border-green-400'
                : 'bg-gray-800 text-gray-500 hover:text-gray-300 hover:bg-gray-700'
            }`}
          >
            Response JSON
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-[#0d1117] mx-0 border-t border-gray-700">
          {rawContentTab === 'preview' ? (
            <div className="p-6 text-sm text-gray-300 leading-relaxed whitespace-pre-wrap font-sans">
              {rawContent.assistAnswer || rawContent.answer || rawContent.reply ? (
                typeof (rawContent.assistAnswer || rawContent.answer) === 'string' &&
                (rawContent.assistAnswer || rawContent.answer).startsWith('projects/') ? (
                  <FetchAnswerButton
                    resourceName={rawContent.assistAnswer || rawContent.answer}
                    config={config}
                    autoLoad={true}
                  />
                ) : (
                  extractTextFromResponse(rawContent.answer || rawContent) || (
                    <span className="text-gray-500 italic">
                      No extractable text content found.
                    </span>
                  )
                )
              ) : (
                <span className="text-gray-500 italic">No content to preview.</span>
              )}
            </div>
          ) : rawContentTab === 'input' ? (
            <div className="p-6">
              <div className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">
                User Query Object
              </div>
              <pre className="text-xs font-mono text-purple-400 leading-relaxed whitespace-pre-wrap break-all bg-gray-900/50 p-4 rounded border border-gray-800">
                {JSON.stringify(rawContent.query || rawContent.input || {}, null, 2)}
              </pre>
              {rawContent.query?.text && (
                <>
                  <div className="text-xs font-bold text-gray-500 mt-6 mb-2 uppercase tracking-wider">
                    Extracted Text
                  </div>
                  <div className="text-sm text-white bg-gray-800 p-3 rounded">
                    {rawContent.query.text}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              {typeof (rawContent.assistAnswer || rawContent.answer) === 'string' &&
              (rawContent.assistAnswer || rawContent.answer).startsWith('projects/') ? (
                <DetailedJsonFetcher
                  resourceName={rawContent.assistAnswer || rawContent.answer}
                  config={config}
                />
              ) : (
                <pre className="text-xs font-mono p-4 text-green-400 leading-relaxed whitespace-pre-wrap break-all">
                  {JSON.stringify(rawContent.answer || rawContent, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
        <div className="bg-gray-800 px-4 py-2 text-[10px] text-gray-400 border-t border-gray-700 flex justify-between">
          <span>JSON Structure</span>
          <button
            onClick={() =>
              navigator.clipboard.writeText(JSON.stringify(rawContent, null, 2))
            }
            className="hover:text-white flex items-center gap-1"
          >
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
              />
            </svg>
            Copy JSON
          </button>
        </div>
      </div>
    </div>
  );
};
