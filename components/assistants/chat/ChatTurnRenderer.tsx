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
import { Config } from '../../../types';
import { getAnswerContent } from './chatAnswerUtils';
import { FetchAnswerButton } from './FetchAnswerButton';

export interface ChatTurnRendererProps {
  turn: any;
  idx: number;
  config: Config;
  onViewRaw: (turn: any) => void;
}

export const ChatTurnRenderer: React.FC<ChatTurnRendererProps> = ({
  turn,
  idx,
  config,
  onViewRaw,
}) => {
  const answerData = getAnswerContent(turn);

  return (
    <div key={idx} className="flex flex-col gap-3 animate-fadeIn group">
      {/* User */}
      {(turn.query?.text || (turn as any).input?.text) && (
        <div className="flex justify-end">
          <div className="bg-blue-600 text-white px-4 py-3 rounded-2xl rounded-tr-sm max-w-[85%] shadow-md">
            <div className="text-sm whitespace-pre-wrap">
              {turn.query?.text || (turn as any).input?.text}
            </div>
          </div>
        </div>
      )}

      {/* Agent */}
      <div className="flex justify-start">
        <div
          onClick={() => onViewRaw(turn)}
          className="bg-gray-800 border border-gray-700 text-gray-200 px-4 py-3 rounded-2xl rounded-tl-sm max-w-[85%] shadow-md relative group/agent cursor-pointer hover:bg-gray-750 hover:border-gray-600 transition-all select-text"
          title="Click to view Raw JSON"
        >
          {/* Answer Content */}
          <div className="text-sm leading-relaxed pointer-events-none">
            <div className="pointer-events-auto">
              {answerData.type === 'text' && (
                <div className="whitespace-pre-wrap">{answerData.content}</div>
              )}

              {answerData.type === 'reference' && (
                <div className="w-full" onClick={(e) => e.stopPropagation()}>
                  <div className="text-[10px] text-gray-500 font-mono mb-1 uppercase tracking-wider">
                    Reference Answer
                  </div>
                  <FetchAnswerButton
                    resourceName={answerData.content}
                    config={config}
                    autoLoad={true}
                    onViewRaw={(data) => onViewRaw({ ...turn, answer: data })}
                  />
                </div>
              )}

              {answerData.type === 'json' && (
                <div className="font-mono text-xs text-yellow-500 whitespace-pre overflow-x-auto p-2 bg-black/30 rounded border border-yellow-900/30">
                  {JSON.stringify(answerData.content, null, 2)}
                </div>
              )}

              {answerData.type === 'none' && (
                <div className="text-xs text-gray-500 italic">No output content</div>
              )}
            </div>
          </div>

          {/* Citations */}
          {(turn.answer as any)?.citations?.length > 0 && (
            <div
              className="mt-3 pt-2 border-t border-gray-700/50"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-[10px] uppercase text-gray-500 font-bold mb-1">Sources</div>
              <div className="flex flex-wrap gap-2">
                {(turn.answer as any).citations.map((c: any, i: number) => (
                  <a
                    key={i}
                    href={c.uri}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 bg-gray-900/50 hover:bg-gray-700 px-2 py-1 rounded text-[10px] text-blue-300 transition-colors border border-gray-700/50"
                  >
                    {c.title || 'Source'}
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
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
