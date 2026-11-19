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
import InfoTooltip from '../../InfoTooltip';
import { BannedPhraseItem, BannedPhraseMatchType } from './types';

export interface ModelArmorSectionProps {
  customerPolicy: string;
  handleChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  templates: any[];
  selectedInputTemplate: string;
  selectedOutputTemplate: string;
  failureMode: string;
  armorEnabled: boolean;
  handleInputTemplateChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  handleOutputTemplateChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  handleFailureModeChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  bannedPhrases?: BannedPhraseItem[];
  onAddBannedPhrase?: (
    phrase: string,
    matchType: BannedPhraseMatchType,
    ignoreDiacritics: boolean,
  ) => boolean;
  onRemoveBannedPhrase?: (index: number) => void;
  sdpPolicy?: string;
  sdpPolicyError?: string | null;
  onSdpPolicyChange?: (val: string) => void;
  showAgentReasoningControl?: boolean;
  agentReasoningHidden?: boolean;
  onAgentReasoningHiddenChange?: (hidden: boolean) => void;
}

export const ModelArmorSection: React.FC<ModelArmorSectionProps> = ({
  customerPolicy,
  handleChange,
  templates,
  selectedInputTemplate,
  selectedOutputTemplate,
  failureMode,
  armorEnabled,
  handleInputTemplateChange,
  handleOutputTemplateChange,
  handleFailureModeChange,
  bannedPhrases = [],
  onAddBannedPhrase = () => false,
  onRemoveBannedPhrase = () => {},
  sdpPolicy = '',
  sdpPolicyError = null,
  onSdpPolicyChange = () => {},
  showAgentReasoningControl = false,
  agentReasoningHidden = false,
  onAgentReasoningHiddenChange,
}) => {
  const [newPhrase, setNewPhrase] = useState('');
  const [newMatchType, setNewMatchType] = useState<BannedPhraseMatchType>('SIMPLE_STRING_MATCH');
  const [newIgnoreDiacritics, setNewIgnoreDiacritics] = useState(false);
  const [bannedPhraseError, setBannedPhraseError] = useState<string | null>(null);

  const handleAddClick = () => {
    const added = onAddBannedPhrase(newPhrase, newMatchType, newIgnoreDiacritics);
    if (!added) {
      setBannedPhraseError('Banned phrase cannot be empty or whitespace only.');
      return;
    }
    setBannedPhraseError(null);
    setNewPhrase('');
  };

  return (
    <div className="space-y-4 pt-2 border-t border-gray-700">
      <span className="flex items-center text-sm font-medium text-gray-300">
        Customer Policy &amp; Model Armor Settings
        <InfoTooltip text="Configure Model Armor protection templates, banned phrases, Sensitive Data Protection policies, or edit the raw policy JSON configuration directly." />
      </span>

      <div className="bg-gray-800/40 p-4 rounded-lg border border-gray-700/60 space-y-4">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Model Armor Configuration
        </div>

        {/* Informational Coverage Scope Warning Banner */}
        <div className="bg-amber-950/30 border border-amber-800/60 rounded-md p-3 text-xs text-amber-200 flex gap-2.5">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <strong className="text-amber-300">Assistant Model Armor Screening Scope:</strong>{' '}
            Assistant Model Armor screens <strong>Core Assistant</strong>,{' '}
            <strong>Workflow Builder agents</strong>, <strong>Google-made agents</strong>,{' '}
            <strong>OOTB connectors</strong>, and <strong>file uploads</strong> — it does{' '}
            <strong>not</strong> screen custom <strong>ADK</strong>, <strong>A2A</strong>, or{' '}
            <strong>Dialogflow</strong> agents (configure Model Armor directly on those agent runtimes or Agent Gateway).
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="armorInputTemplate" className="block text-xs font-semibold text-gray-400 mb-1.5">
              Input Template (User Prompts)
            </label>
            <select
              id="armorInputTemplate"
              value={selectedInputTemplate}
              onChange={handleInputTemplateChange}
              className="w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-xs text-white py-2 focus:ring-blue-500 animate-fade-in"
            >
              <option value="">-- No prompt filtering --</option>
              {templates.map(t => {
                const tId = t.name.split('/').pop();
                const loc = t.name.split('/')[3];
                return (
                  <option key={t.name} value={t.name}>{tId} ({loc})</option>
                );
              })}
            </select>
          </div>

          <div>
            <label htmlFor="armorOutputTemplate" className="block text-xs font-semibold text-gray-400 mb-1.5">
              Output Template (Model Responses)
            </label>
            <select
              id="armorOutputTemplate"
              value={selectedOutputTemplate}
              onChange={handleOutputTemplateChange}
              className="w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-xs text-white py-2 focus:ring-blue-500 animate-fade-in"
            >
              <option value="">-- No response filtering --</option>
              {templates.map(t => {
                const tId = t.name.split('/').pop();
                const loc = t.name.split('/')[3];
                return (
                  <option key={t.name} value={t.name}>{tId} ({loc})</option>
                );
              })}
            </select>
          </div>

          <div>
            <label htmlFor="armorFailureMode" className="block text-xs font-semibold text-gray-400 mb-1.5">
              Failure Mode
            </label>
            <select
              id="armorFailureMode"
              value={failureMode}
              onChange={handleFailureModeChange}
              disabled={!selectedInputTemplate && !selectedOutputTemplate}
              className="w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-xs text-white py-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value="FAIL_CLOSED">Fail Closed &ndash; block the request (recommended)</option>
              <option value="FAIL_OPEN">Fail Open &ndash; let the request through unfiltered</option>
            </select>
          </div>
        </div>

        {armorEnabled && failureMode === 'FAIL_CLOSED' && (
          <div className="bg-gray-900/40 border border-gray-700 rounded-md p-3 text-xs text-gray-300 flex gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <strong className="text-gray-200">This can break chat during a Model Armor outage.</strong>{' '}
              If Model Armor cannot evaluate a prompt or a response, the request is rejected and the
              user gets an error instead of an answer. That is the intended tradeoff for a safety
              filter, and it is also Google&apos;s own default (an unset <code>failureMode</code> behaves
              as <code>FAIL_CLOSED</code>).
            </div>
          </div>
        )}

        {armorEnabled && failureMode === 'FAIL_OPEN' && (
          <div className="bg-red-900/30 border border-red-800 rounded-md p-3 text-xs text-red-200 flex gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <strong>Fail Open disables your protection whenever Model Armor is unavailable.</strong>{' '}
              Prompts and responses are passed through with no filtering at all, so unsafe content
              and prompt injections can reach the model and your users. Chat stays up; the filter
              does not. Choose this only if availability genuinely outranks safety for this app.
            </div>
          </div>
        )}

        {/* Structured Banned Phrases Editor (GA) */}
        <div className="pt-3 border-t border-gray-700/60 space-y-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-gray-300">Banned Phrases (GA)</span>
            <InfoTooltip text="Block user prompts or model responses matching configured phrases. Syncs bi-directionally with customerPolicy.bannedPhrases." />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
            <div className="md:col-span-5">
              <label htmlFor="newBannedPhrase" className="block text-[11px] font-medium text-gray-400 mb-1">
                Phrase to Block
              </label>
              <input
                type="text"
                id="newBannedPhrase"
                value={newPhrase}
                onChange={(e) => {
                  setNewPhrase(e.target.value);
                  if (bannedPhraseError) setBannedPhraseError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddClick();
                  }
                }}
                placeholder="Enter banned phrase..."
                className="w-full bg-gray-700 border border-gray-600 rounded-md text-xs text-white px-2.5 py-1.5"
              />
            </div>

            <div className="md:col-span-4">
              <label htmlFor="newBannedPhraseMatchType" className="block text-[11px] font-medium text-gray-400 mb-1">
                Match Type
              </label>
              <select
                id="newBannedPhraseMatchType"
                value={newMatchType}
                onChange={(e) => setNewMatchType(e.target.value as BannedPhraseMatchType)}
                className="w-full bg-gray-700 border border-gray-600 rounded-md text-xs text-white px-2 py-1.5"
              >
                <option value="SIMPLE_STRING_MATCH">Simple String Match</option>
                <option value="WORD_BOUNDARY_STRING_MATCH">Word Boundary Match</option>
              </select>
            </div>

            <div className="md:col-span-3 flex items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer py-1.5">
                <input
                  type="checkbox"
                  id="newBannedPhraseIgnoreDiacritics"
                  checked={newIgnoreDiacritics}
                  onChange={(e) => setNewIgnoreDiacritics(e.target.checked)}
                  className="h-3.5 w-3.5 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-[11px]">Ignore Diacritics</span>
              </label>
              <button
                type="button"
                onClick={handleAddClick}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-md transition-colors shrink-0"
              >
                Add Phrase
              </button>
            </div>
          </div>

          {bannedPhraseError && (
            <p role="alert" className="text-xs text-red-400">
              {bannedPhraseError}
            </p>
          )}

          {bannedPhrases.length > 0 && (
            <ul className="space-y-1.5">
              {bannedPhrases.map((bp, idx) => (
                <li
                  key={`${bp.phrase}-${idx}`}
                  className="flex items-center justify-between gap-2 bg-gray-900/60 border border-gray-700 rounded-md px-3 py-1.5 text-xs"
                >
                  <div className="flex items-center flex-wrap gap-2">
                    <span className="font-mono text-white">{bp.phrase}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-800 text-gray-300 border border-gray-700">
                      {bp.matchType || 'SIMPLE_STRING_MATCH'}
                    </span>
                    {bp.ignoreDiacritics && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-950/60 text-blue-300 border border-blue-800/60">
                        Ignore Diacritics
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveBannedPhrase(idx)}
                    aria-label={`Remove banned phrase ${bp.phrase}`}
                    className="text-red-400 hover:text-red-300 text-xs font-medium px-2 py-0.5 rounded hover:bg-red-950/40"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Sensitive Data Protection (SDP) Content Policy Picker (GA) */}
        <div className="pt-3 border-t border-gray-700/60 space-y-1.5">
          <label htmlFor="sdpContentPolicy" className="flex items-center text-xs font-semibold text-gray-300">
            Sensitive Data Protection (SDP) Content Policy (GA)
            <InfoTooltip text="Cloud DLP / Sensitive Data Protection content policy resource name (projects/{project}/locations/{location}/contentPolicies/{id}). Syncs with customerPolicy.dataProtectionPolicy." />
          </label>
          <input
            type="text"
            id="sdpContentPolicy"
            value={sdpPolicy}
            onChange={(e) => onSdpPolicyChange(e.target.value)}
            placeholder="projects/{project}/locations/{location}/contentPolicies/{id}"
            className="w-full bg-gray-700 border border-gray-600 rounded-md text-xs font-mono text-white px-3 py-2 placeholder-gray-500"
          />
          {sdpPolicyError && (
            <p role="alert" className="text-xs text-red-400">
              {sdpPolicyError}
            </p>
          )}
        </div>

        {/* GOOGLE_INTERNAL / TRUSTED_TESTER: Hide Agent Reasoning */}
        {showAgentReasoningControl && onAgentReasoningHiddenChange && (
          <div className="pt-3 border-t border-gray-700/60">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="agentReasoningHidden"
                checked={Boolean(agentReasoningHidden)}
                onChange={(e) => onAgentReasoningHiddenChange(e.target.checked)}
                className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs font-medium text-gray-200">
                Hide Agent Reasoning / AI Thinking Traces
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-950/60 text-purple-300 border border-purple-800/60">
                Internal / Trusted Tester
              </span>
              <InfoTooltip text="Hides intermediate agent reasoning / thinking traces from end users in chat responses (customerPolicy.agentReasoningHidden)." />
            </label>
          </div>
        )}
      </div>

      <div>
        <label htmlFor="customerPolicy" className="block text-xs font-semibold text-gray-400 mb-1.5">
          Customer Policy (JSON Editor)
        </label>
        <textarea
          id="customerPolicy"
          name="customerPolicy"
          value={customerPolicy}
          onChange={handleChange}
          rows={6}
          className="block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm font-mono text-xs p-3 text-white"
        />
      </div>
    </div>
  );
};
