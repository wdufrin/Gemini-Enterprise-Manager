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

export interface BackupLogConsoleProps {
  isLoading: boolean;
  loadingSection: string | null;
  error: string | null;
  logs: string[];
}

export const BackupLogConsole: React.FC<BackupLogConsoleProps> = ({
  isLoading,
  loadingSection,
  error,
  logs,
}) => {
  if (!isLoading && logs.length === 0) return null;

  return (
    <div className="bg-gray-800 p-4 rounded-lg shadow-md mt-6">
      <h2 className="text-lg font-semibold text-white mb-3 flex items-center">
        {isLoading && (
          <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-400 mr-3"></div>
        )}
        {isLoading ? `Running: ${loadingSection?.replace(/[A-Z]/g, ' $&').trim()}` : 'Logs'}
      </h2>
      {error && (
        <div className="text-sm text-red-400 p-2 mb-2 bg-red-900/20 rounded-md">{error}</div>
      )}
      <pre className="bg-gray-900 text-xs text-gray-300 p-3 rounded-md h-64 overflow-y-auto font-mono">
        {logs.join('\n')}
      </pre>
    </div>
  );
};

export default BackupLogConsole;
