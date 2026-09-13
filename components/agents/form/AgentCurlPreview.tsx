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

export interface AgentCurlPreviewProps {
  curlCommand: string;
  copySuccessCurl: boolean;
  handleCopyCurlCommand: () => void;
  agentToEdit: boolean;
}

export const AgentCurlPreview: React.FC<AgentCurlPreviewProps> = ({
  curlCommand,
  copySuccessCurl,
  handleCopyCurlCommand,
  agentToEdit,
}) => {
  return (
    <div>
      <h3 className="text-xl font-semibold text-white">cURL Command Preview</h3>
      <p className="text-sm text-gray-400 mt-1 mb-2">
        {agentToEdit
          ? 'This command reflects changes made in the form for updating the agent.'
          : 'This command reflects the current form settings for registering a new agent.'}
      </p>
      <div className="bg-gray-900 rounded-lg p-4 relative" style={{ maxHeight: 'calc(100vh - 25rem)', overflowY: 'auto' }}>
        <button
          type="button"
          onClick={handleCopyCurlCommand}
          className="absolute top-3 right-3 px-3 py-1 bg-gray-600 text-white text-xs font-semibold rounded-md hover:bg-gray-500 z-10"
        >
          {copySuccessCurl ? 'Copied!' : 'Copy'}
        </button>
        <pre className="text-xs text-gray-300 whitespace-pre-wrap">
          <code>{curlCommand}</code>
        </pre>
      </div>
    </div>
  );
};
