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

import React, { useState } from 'react';
import { ALL_INFO } from './curl/curlCommands';
import Modal from './common/Modal';

export { ALL_INFO };

export interface CurlInfoModalProps {
  infoKey: string;
  onClose: () => void;
}

const CodeBlock: React.FC<{ title: string; command: string }> = ({ title, command }) => {
  const [copyText, setCopyText] = useState('Copy');
  const handleCopy = () => {
    navigator.clipboard.writeText(command);
    setCopyText('Copied!');
    setTimeout(() => setCopyText('Copy'), 2000);
  };

  return (
    <div className="bg-gray-900 rounded-lg overflow-hidden border border-gray-700/60">
      <div className="flex justify-between items-center px-3 py-2 bg-gray-900/80 border-b border-gray-800">
        <span className="text-xs font-semibold text-gray-300">{title}</span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={`Copy ${title} curl command`}
          className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs font-semibold rounded transition-colors"
        >
          {copyText}
        </button>
      </div>
      <pre className="p-4 text-xs text-gray-300 whitespace-pre-wrap overflow-x-auto font-mono">
        <code>{command}</code>
      </pre>
    </div>
  );
};

const CurlInfoModal: React.FC<CurlInfoModalProps> = ({ infoKey, onClose }) => {
  // Use exact info entry - do NOT fall back to Page.AGENTS when key is unmapped (Task 8.4)
  const info = ALL_INFO[infoKey] || null;

  const titleText = infoKey.startsWith('Backup:') || infoKey.startsWith('Restore:')
    ? infoKey.replace(':', ' - ')
    : infoKey === 'ArchitectureScan' ? 'Architecture Scan'
    : infoKey;

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={`API Commands for ${titleText}`}
      size="4xl"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-xs font-semibold rounded-md transition-colors"
        >
          Close
        </button>
      }
    >
      <div className="space-y-4">
        {info ? (
          <>
            <p className="text-sm text-gray-300 leading-relaxed">{info.description}</p>
            {info.commands.length > 0 && (
              <p className="text-xs text-gray-400 bg-gray-900/60 p-2.5 rounded-lg border border-gray-700/60">
                <strong className="text-gray-300">Note:</strong> Replace placeholders like{' '}
                <code className="text-blue-400 font-mono">[YOUR_PROJECT_ID]</code> and{' '}
                <code className="text-blue-400 font-mono">[YOUR_ACCESS_TOKEN]</code> with your actual values.
              </p>
            )}
            <div className="space-y-3 pt-1">
              {info.commands.map(cmd => (
                <CodeBlock key={cmd.title} title={cmd.title} command={cmd.command} />
              ))}
            </div>
          </>
        ) : (
          <div className="py-8 text-center text-gray-400 space-y-2">
            <p className="text-sm">No specific API command examples are available for &quot;{titleText}&quot;.</p>
            <p className="text-xs text-gray-500">Check the official Google Cloud documentation for underlying REST endpoints.</p>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default CurlInfoModal;

