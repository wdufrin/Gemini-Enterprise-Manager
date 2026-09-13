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
import InfoTooltip from '../../InfoTooltip';

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
}) => {
  return (
    <div className="space-y-4 pt-2 border-t border-gray-700">
      <span className="flex items-center text-sm font-medium text-gray-300">
        Customer Policy &amp; Model Armor Settings
        <InfoTooltip text="Configure Model Armor protection templates or edit the raw policy JSON configuration directly." />
      </span>

      <div className="bg-gray-800/40 p-4 rounded-lg border border-gray-700/60 space-y-4">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Model Armor Configuration
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
