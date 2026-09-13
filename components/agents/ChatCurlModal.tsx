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

interface ChatCurlModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: Config;
  sessionId: string | null;
  messages: ChatMessage[];
  selectedDataStores: string[];
  authMode?: 'default' | 'wif';
  wifPoolId?: string;
  wifProviderId?: string;
  wifSubjectTokenType?: string;
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
      <pre className="p-4 text-xs text-gray-300 whitespace-pre-wrap overflow-x-auto font-mono">
        <code>{content}</code>
      </pre>
    </div>
  );
};

const ChatCurlModal: React.FC<ChatCurlModalProps> = ({ isOpen, onClose, config, sessionId, messages, selectedDataStores, authMode = 'default', wifPoolId, wifProviderId, wifSubjectTokenType }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useModalA11y({
    isOpen,
    onClose,
    containerRef,
  });

  if (!isOpen) return null;

  const { projectId, appLocation, collectionId, appId, assistantId } = config;
  const baseUrl = appLocation === 'global' 
    ? 'https://discoveryengine.googleapis.com' 
    : `https://${appLocation}-discoveryengine.googleapis.com`;
    
  const endpoint = `${baseUrl}/v1alpha/projects/${projectId}/locations/${appLocation}/collections/${collectionId}/engines/${appId}/assistants/${assistantId}:streamAssist`;

  const userMessages = messages.filter(m => m.role === 'user');

  const generateCommand = (prompt: string): string => {
    const payload: any = {
      query: { text: prompt }
    };
    
    if (sessionId) {
      payload.session = sessionId;
    }
    
    if (selectedDataStores.length > 0) {
      payload.toolsSpec = {
        vertexAiSearchSpec: {
          dataStoreSpecs: selectedDataStores.map(ds => ({ dataStore: ds }))
        }
      };
    }

    if (authMode === 'wif') {
      return `# Step 1: Exchange external IdP token via Google STS (Workforce Identity Federation)\nSTS_RESPONSE=$(curl -s -X POST \\\n  -H "Content-Type: application/x-www-form-urlencoded" \\\n  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \\\n  -d "audience=//iam.googleapis.com/locations/global/workforcePools/${wifPoolId || '<pool-id>'}/providers/${wifProviderId || '<provider-id>'}" \\\n  -d "scope=https://www.googleapis.com/auth/cloud-platform" \\\n  -d "requested_token_type=urn:ietf:params:oauth:token-type:access_token" \\\n  -d "subject_token_type=${wifSubjectTokenType || 'urn:ietf:params:oauth:token-type:id_token'}" \\\n  -d "subject_token=<YOUR_EXTERNAL_IDP_TOKEN>" \\\n  --data-urlencode "options={\\"userProject\\":\\"${projectId}\\"}" \\\n  "https://sts.googleapis.com/v1/token")\n\nACCESS_TOKEN=$(echo "$STS_RESPONSE" | jq -r '.access_token')\necho "STS exchange successful."\n\n# Step 2: Query the Assistant\ncurl -X POST \\\n  -H "Authorization: Bearer $ACCESS_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -H "X-Goog-User-Project: ${projectId}" \\\n  -d '${JSON.stringify(payload, null, 2).replace(/'/g, "'\\''")}' \\\n  "${endpoint}"`;
    }

    return `curl -X POST \\\n  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\\n  -H "Content-Type: application/json" \\\n  -H "X-Goog-User-Project: ${projectId}" \\\n  -d '${JSON.stringify(payload, null, 2).replace(/'/g, "'\\''")}' \\\n  "${endpoint}"`;
  };


  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-[60] p-4"
      aria-modal="true"
      role="dialog"
      aria-labelledby="assistant-curl-modal-title"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-gray-700"
      >
        <header className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h2 id="assistant-curl-modal-title" className="text-xl font-bold text-white">Assistant cURL Commands</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="text-gray-400 hover:text-white text-2xl"
          >
            &times;
          </button>
        </header>

        <main className="p-6 overflow-y-auto space-y-6">
          <p className="text-sm text-gray-400">
            Below are the cURL commands for the messages sent in this session. Note that the <code>toolsSpec</code> includes all linked data stores automatically.
          </p>
          
          {userMessages.length === 0 ? (
            <div>
              <h3 className="text-md font-semibold text-gray-200 mb-2">Request Template:</h3>
              <CodeBlock content={generateCommand("Hello, what can you do?")} />
            </div>
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

export default ChatCurlModal;
