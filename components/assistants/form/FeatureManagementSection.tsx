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

export interface FeatureManagementSectionProps {
  enableEndUserAgentCreation: boolean;
  disableLocationContext: boolean;
  defaultWebGroundingToggleOff: boolean;
  vertexAiSearchToolConfig: string;
  handleChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
}

export const CollapsibleSection: React.FC<React.PropsWithChildren<{ title: string }>> = ({ title, children }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border-t border-gray-700 pt-4">
      <button type="button" onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center text-left">
        <h3 className="text-md font-semibold text-white">{title}</h3>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-5 w-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
      {isOpen && <div className="mt-2">{children}</div>}
    </div>
  );
};

export const FeatureManagementSection: React.FC<FeatureManagementSectionProps> = ({
  enableEndUserAgentCreation,
  disableLocationContext,
  defaultWebGroundingToggleOff,
  vertexAiSearchToolConfig,
  handleChange,
}) => {
  return (
    <>
      <CollapsibleSection title="Feature Management">
        <div className="space-y-3 p-4 bg-gray-900/30 rounded-md">
          <label className="flex items-center space-x-3 cursor-pointer">
            <div className="flex items-center">
              <input
                type="checkbox"
                name="enableEndUserAgentCreation"
                checked={Boolean(enableEndUserAgentCreation)}
                onChange={handleChange}
                className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-300 ml-3">Enable End-User Agent Creation</span>
              <InfoTooltip text="Allows end-users to create their own custom agents within the chat interface." />
            </div>
          </label>
          <label className="flex items-center space-x-3 cursor-pointer">
            <div className="flex items-center">
              <input
                type="checkbox"
                name="disableLocationContext"
                checked={Boolean(disableLocationContext)}
                onChange={handleChange}
                className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-300 ml-3">Disable Location Context</span>
              <InfoTooltip text="Prevents the location context from being sent to the agent. useful for privacy or testing." />
            </div>
          </label>
          <label className="flex items-center space-x-3 cursor-pointer">
            <div className="flex items-center">
              <input
                type="checkbox"
                name="defaultWebGroundingToggleOff"
                checked={Boolean(defaultWebGroundingToggleOff)}
                onChange={handleChange}
                className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-300 ml-3">Default Web Grounding to Off</span>
              <InfoTooltip text="Sets the default state of the Web Grounding toggle in the chat UI to 'Off'." />
            </div>
          </label>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Advanced Configuration">
        <div className="space-y-3 p-4 bg-gray-900/30 rounded-md">
          <div>
            <label htmlFor="vertexAiSearchToolConfig" className="flex items-center text-sm font-medium text-gray-300 mb-1">
              Vertex AI Search Tool Config (JSON)
              <InfoTooltip text="Raw JSON configuration for the Vertex AI Search Tool. Caution: Invalid JSON here can break the search functionality." />
            </label>
            <textarea
              id="vertexAiSearchToolConfig"
              name="vertexAiSearchToolConfig"
              value={vertexAiSearchToolConfig}
              onChange={handleChange}
              rows={5}
              className="block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm font-mono text-xs text-white px-3 py-2"
            />
          </div>
        </div>
      </CollapsibleSection>
    </>
  );
};
