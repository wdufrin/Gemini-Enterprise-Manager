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

export interface RestoreStatus {
  total: number;
  processed: number;
  success: number;
  failed: number;
  currentSession?: string;
  logs: string[];
  isRestoring: boolean;
  isOpen: boolean;
  isMinimized: boolean;
}

export interface RestoreStatusBarProps {
  status: RestoreStatus;
  setStatus: React.Dispatch<React.SetStateAction<RestoreStatus>>;
}

export const RestoreStatusBar: React.FC<RestoreStatusBarProps> = ({ status, setStatus }) => {
  if (!status.isOpen) return null;

  return (
    <div
      className={`border-t border-gray-700 bg-gray-900 flex flex-col transition-all duration-300 ${
        status.isMinimized ? 'h-10' : 'h-48'
      }`}
    >
      <div className="flex justify-between items-center px-4 py-2 bg-gray-800 border-b border-gray-700 cursor-pointer select-none">
        <div className="flex items-center gap-2">
          {status.isRestoring && (
            <span className="animate-spin h-3 w-3 border-2 border-green-500 border-t-transparent rounded-full"></span>
          )}
          <span className="text-xs font-bold text-white">Restore Progress</span>
          <span className="text-[10px] text-gray-400">
            {status.processed}/{status.total}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStatus((prev) => ({ ...prev, isMinimized: !prev.isMinimized }))}
            className="text-gray-400 hover:text-white text-xs"
          >
            {status.isMinimized ? 'Expand' : 'Minimize'}
          </button>
          {!status.isRestoring && (
            <button
              onClick={() => setStatus((prev) => ({ ...prev, isOpen: false }))}
              className="text-gray-400 hover:text-white text-xs ml-2"
            >
              Close
            </button>
          )}
        </div>
      </div>
      {!status.isMinimized && (
        <div className="flex-1 p-2 overflow-y-auto font-mono text-[10px] space-y-1 bg-black/40">
          {status.logs.map((L, i) => (
            <div
              key={i}
              className={
                L.includes('Success')
                  ? 'text-green-400'
                  : L.includes('Failed')
                  ? 'text-red-400'
                  : 'text-gray-300'
              }
            >
              {L}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
