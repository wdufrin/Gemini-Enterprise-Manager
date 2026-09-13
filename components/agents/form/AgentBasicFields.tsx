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
import { Authorization } from '../../../types';
import { AgentFormData } from './types';

export interface AgentBasicFieldsProps {
  formData: AgentFormData;
  handleChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  agentToEdit: boolean;
  isEditingDisabled: boolean;
  iconPreviewError: boolean;
  setIconPreviewError: (val: boolean) => void;
  rewritingField: string | null;
  handleRewrite: (field: 'description') => Promise<void>;
  handleStarterPromptChange: (index: number, value: string) => void;
  addStarterPrompt: () => void;
  removeStarterPrompt: (index: number) => void;
  authIds: string[];
  handleAuthIdChange: (index: number, value: string) => void;
  addAuthId: () => void;
  removeAuthId: (index: number) => void;
  authInputMode: 'manual' | 'select';
  setAuthInputMode: (mode: 'manual' | 'select') => void;
  authorizations: Authorization[];
  isLoadingAuths: boolean;
  authLoadError: string | null;
  handleLoadAuthorizations: () => Promise<void>;
}

export const AgentBasicFields: React.FC<AgentBasicFieldsProps> = ({
  formData,
  handleChange,
  agentToEdit,
  isEditingDisabled,
  iconPreviewError,
  setIconPreviewError,
  rewritingField,
  handleRewrite,
  handleStarterPromptChange,
  addStarterPrompt,
  removeStarterPrompt,
  authIds,
  handleAuthIdChange,
  addAuthId,
  removeAuthId,
  authInputMode,
  setAuthInputMode,
  authorizations,
  isLoadingAuths,
  authLoadError,
  handleLoadAuthorizations,
}) => {
  return (
    <>
      {/* Display Name */}
      <div>
        <label htmlFor="displayName" className="block text-sm font-medium text-gray-300">
          Display Name
        </label>
        <input
          type="text"
          id="displayName"
          name="displayName"
          value={formData.displayName}
          onChange={handleChange}
          className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm disabled:bg-gray-700/50 disabled:cursor-not-allowed text-white px-3 py-2"
          required
        />
      </div>

      {/* Description */}
      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="description" className="block text-sm font-medium text-gray-300">
            Description
          </label>
          <button
            type="button"
            onClick={() => handleRewrite('description')}
            disabled={rewritingField === 'description' || isEditingDisabled}
            className="p-1.5 text-gray-400 bg-gray-700 hover:bg-indigo-600 hover:text-white rounded-md transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
            title="Rewrite description with AI"
          >
            {rewritingField === 'description' ? (
              <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                <path d="M12.736 3.97a6 6 0 014.243 4.243l2.022-2.022a1 1 0 10-1.414-1.414L15.56 6.8A6.002 6.002 0 0112.736 3.97zM3.97 12.736a6 6 0 01-1.243-5.222L4.75 9.536a1 1 0 001.414-1.414L4.142 6.1A6.002 6.002 0 013.97 12.736z" />
              </svg>
            )}
          </button>
        </div>
        <textarea
          id="description"
          name="description"
          value={formData.description}
          onChange={handleChange}
          rows={3}
          className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm disabled:bg-gray-700/50 disabled:cursor-not-allowed text-white px-3 py-2"
          required
        />
      </div>

      {/* Agent ID (Create only) */}
      {!agentToEdit && (
        <div>
          <label htmlFor="agentId" className="block text-sm font-medium text-gray-300">
            Agent ID (Optional)
          </label>
          <input
            type="text"
            id="agentId"
            name="agentId"
            value={formData.agentId}
            onChange={handleChange}
            className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-white px-3 py-2"
            pattern="[a-z0-9-]{1,63}"
            title="Must be lowercase letters, numbers, and hyphens, up to 63 characters."
          />
          <p className="mt-1 text-xs text-gray-400">If left blank, a unique ID will be generated. Must be lowercase, numbers, and hyphens.</p>
        </div>
      )}

      {/* Icon URI */}
      <div>
        <label htmlFor="iconUri" className="block text-sm font-medium text-gray-300">
          Icon URI
        </label>
        <input
          type="text"
          id="iconUri"
          name="iconUri"
          value={formData.iconUri}
          onChange={handleChange}
          className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm disabled:bg-gray-700/50 disabled:cursor-not-allowed text-white px-3 py-2"
        />
        {formData.iconUri && !iconPreviewError && (
          <img
            src={formData.iconUri}
            alt="Icon Preview"
            className="mt-2 h-16 w-16 rounded-md object-cover bg-gray-600"
            onError={() => setIconPreviewError(true)}
          />
        )}
      </div>

      {/* Starter Prompts */}
      <div className="border-t border-gray-700 pt-4">
        <label className="block text-sm font-medium text-gray-300">Starter Prompts</label>
        <p className="mt-1 text-xs text-gray-400">Suggestions to show the user on the agent&apos;s landing page.</p>
        <div className="mt-2 space-y-2">
          {formData.starterPrompts.map((prompt, index) => (
            <div key={index} className="flex items-center space-x-2">
              <input
                type="text"
                value={prompt}
                onChange={(e) => handleStarterPromptChange(index, e.target.value)}
                placeholder={`Prompt #${index + 1}`}
                className="block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm disabled:bg-gray-700/50 disabled:cursor-not-allowed text-white px-3 py-1.5"
              />
              <button
                type="button"
                onClick={() => removeStarterPrompt(index)}
                className="p-2 text-gray-400 hover:text-white bg-gray-600 hover:bg-red-500 rounded-md disabled:bg-gray-600 disabled:cursor-not-allowed"
                aria-label="Remove prompt"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addStarterPrompt}
          className="mt-2 text-sm font-semibold text-blue-400 hover:text-blue-300 disabled:text-gray-500 disabled:cursor-not-allowed"
        >
          + Add Prompt
        </button>
      </div>

      {/* Authorization IDs */}
      <div>
        <label className="block text-sm font-medium text-gray-300">
          Authorization IDs {agentToEdit ? '(Immutable)' : '(Optional)'}
        </label>
        {agentToEdit ? (
          <>
            <div className="space-y-2 mt-1">
              {authIds.map((authId, index) => (
                <input
                  key={index}
                  type="text"
                  value={authId}
                  className="block w-full bg-gray-800 border-gray-600 rounded-md shadow-sm text-gray-400 disabled:opacity-75 px-3 py-1.5"
                  disabled
                />
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-400">Authorization cannot be changed after an agent is created.</p>
          </>
        ) : (
          <>
            <div className="space-y-2 mt-1">
              {authIds.map((authId, index) => (
                <div key={index} className="flex items-center space-x-2">
                  {authInputMode === 'select' && authorizations.length > 0 ? (
                    <select
                      value={authId}
                      onChange={(e) => handleAuthIdChange(index, e.target.value)}
                      className="block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm text-white px-3 py-1.5"
                    >
                      <option value="">-- Select an Authorization --</option>
                      {authorizations.map(auth => {
                        const aId = auth.name.split('/').pop() || '';
                        return <option key={auth.name} value={aId}>{auth.displayName || aId}</option>;
                      })}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={authId}
                      onChange={(e) => handleAuthIdChange(index, e.target.value)}
                      className="block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm text-white px-3 py-1.5"
                      placeholder="Type an ID"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => removeAuthId(index)}
                    className="p-2 text-gray-400 hover:text-white bg-gray-600 hover:bg-red-500 rounded-md transition-colors"
                    title="Remove Authorization"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center mt-2">
              <button
                type="button"
                onClick={addAuthId}
                className="text-sm font-semibold text-blue-400 hover:text-blue-300 disabled:text-gray-500 disabled:cursor-not-allowed"
              >
                + Add Authorization
              </button>

              <div className="flex gap-2">
                {authInputMode === 'select' && (
                  <button type="button" onClick={() => setAuthInputMode('manual')} className="text-sm text-blue-400 hover:text-blue-300">
                    Switch to Manual
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleLoadAuthorizations}
                  disabled={isLoadingAuths}
                  className="px-3 py-1 bg-indigo-600 text-white text-xs font-semibold rounded-md hover:bg-indigo-700 disabled:bg-gray-500"
                  title="Load available authorizations"
                >
                  {isLoadingAuths ? '...' : 'Load'}
                </button>
              </div>
            </div>

            {authLoadError && <p className="mt-1 text-sm text-red-400">{authLoadError}</p>}
          </>
        )}
      </div>
    </>
  );
};
