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
import { Modal } from '../common/Modal';

interface ClientSecretPromptProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (secret: string) => void;
  authId: string;
  customMessage?: string;
}

const ClientSecretPrompt: React.FC<ClientSecretPromptProps> = ({ isOpen, onClose, onSubmit, authId, customMessage }) => {
  const [secret, setSecret] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (secret.trim()) {
      onSubmit(secret);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Enter Client Secret"
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm">Skip</button>
          <button
            type="submit"
            form="client-secret-form"
            disabled={!secret.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-sm"
          >
            Submit Secret
          </button>
        </>
      }
    >
      <form id="client-secret-form" onSubmit={handleSubmit} className="space-y-4">
        {customMessage ? (
          <p className="text-sm text-yellow-300 bg-yellow-900/30 p-3 rounded-md border border-yellow-700">{customMessage}</p>
        ) : (
          <p className="text-sm text-gray-300">
            To restore Authorization <code className="bg-gray-700 text-sm p-1 rounded font-mono">{authId}</code>, please enter its OAuth Client Secret.
          </p>
        )}
        <p className="text-xs text-gray-400">
          This information is sensitive and is not stored in the backup file. It is required to re-create the resource.
        </p>
        <div>
          <label htmlFor="client-secret-input" className="block text-sm font-medium text-gray-300">Client Secret</label>
          <input
            id="client-secret-input"
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm text-white focus:ring-blue-500 focus:border-blue-500 px-3 py-2"
            autoFocus
          />
        </div>
      </form>
    </Modal>
  );
};

export default ClientSecretPrompt;