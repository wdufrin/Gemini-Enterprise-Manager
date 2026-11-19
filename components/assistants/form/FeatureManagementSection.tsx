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
import { useProjectEnrollment } from '../../../context/ProjectEnrollmentContext';

export interface FeatureManagementSectionProps {
  enableEndUserAgentCreation: boolean;
  disableLocationContext: boolean;
  defaultWebGroundingToggleOff: boolean;
  webGroundingType?: string;
  knowledgeCatalogEnabled?: boolean;
  mapsGroundingType?: string;
  defaultMapsGroundingToggleOff?: boolean;
  isTrustedTesterOverride?: boolean;
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
  webGroundingType,
  knowledgeCatalogEnabled = true,
  mapsGroundingType = 'MAPS_GROUNDING_TYPE_DISABLED',
  defaultMapsGroundingToggleOff = false,
  isTrustedTesterOverride,
  vertexAiSearchToolConfig,
  handleChange,
}) => {
  const { isTrustedTester: ctxTrustedTester } = useProjectEnrollment();
  const isTrustedTester = Boolean(isTrustedTesterOverride ?? ctxTrustedTester);
  const isWebGroundingDisabled = !webGroundingType || webGroundingType === 'WEB_GROUNDING_TYPE_DISABLED';
  const isMapsGroundingDisabled = !mapsGroundingType || mapsGroundingType === 'MAPS_GROUNDING_TYPE_DISABLED';

  return (
    <>
      <CollapsibleSection title="Feature Management">
        <div className="space-y-3 p-4 bg-gray-900/30 rounded-md">
          <label className="flex items-center space-x-3 cursor-pointer">
            <div className="flex items-center flex-wrap gap-1.5">
              <input
                type="checkbox"
                name="knowledgeCatalogEnabled"
                checked={Boolean(knowledgeCatalogEnabled)}
                onChange={handleChange}
                className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-300 ml-2">
                Dataplex Knowledge Catalog Integration — Preview
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-950/60 text-blue-300 border border-blue-800/60">
                Public Preview
              </span>
              <InfoTooltip text="Enables Dataplex Knowledge Catalog metadata grounding on this assistant (Assistant.knowledgeCatalogEnabled, defaults to true when unset)." />
            </div>
          </label>
          <label className="flex items-center space-x-3 cursor-pointer">
            <div className="flex items-center flex-wrap gap-1.5">
              <input
                type="checkbox"
                name="enableEndUserAgentCreation"
                checked={Boolean(enableEndUserAgentCreation)}
                onChange={handleChange}
                className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-300 ml-2">Enable End-User Agent Creation</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-800 text-gray-400 border border-gray-700">
                v1alpha Legacy
              </span>
              <InfoTooltip text="Legacy v1alpha Assistant field. In modern Gemini Enterprise web apps, end-user Agent Builder access is governed by Engine-level 'no-code-agent-builder' and 'agent-gallery' features." />
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
              <InfoTooltip text="Prevents the user's geographic location context (IP/device location) from being used in search and grounding." />
            </div>
          </label>
          <label className="flex items-center space-x-3 cursor-pointer">
            <div className="flex items-center flex-wrap gap-1.5">
              <input
                type="checkbox"
                name="defaultWebGroundingToggleOff"
                checked={Boolean(defaultWebGroundingToggleOff)}
                onChange={handleChange}
                className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-300 ml-2">Default Web Grounding to Off</span>
              {isWebGroundingDisabled && (
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-900/40 text-amber-300 border border-amber-700/60"
                  title="Web Grounding Type is currently Disabled. Enable Google Search or Enterprise Web Search above for this default toggle setting to take effect."
                >
                  Requires Web Grounding Enabled
                </span>
              )}
              <InfoTooltip text="When Web Grounding (Google Search or Enterprise Web Search) is enabled on this assistant, sets the user-facing Web Grounding toggle in the chat UI to 'Off' by default so users must opt in per query." />
            </div>
          </label>
        </div>
      </CollapsibleSection>

      {isTrustedTester && (
        <CollapsibleSection title="Advanced Configuration (Trusted Tester)">
          <div className="space-y-4 p-4 bg-gray-900/30 rounded-md">
            <div>
              <label htmlFor="mapsGroundingType" className="flex items-center text-sm font-medium text-gray-300 mb-1">
                Maps Grounding Type
                <InfoTooltip text="Enables Google Maps grounding for geospatial queries (restricted to TRUSTED_TESTER projects)." />
              </label>
              <select
                id="mapsGroundingType"
                name="mapsGroundingType"
                value={mapsGroundingType}
                onChange={handleChange}
                className="block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm text-white px-3 py-2"
              >
                <option value="MAPS_GROUNDING_TYPE_DISABLED">Disabled</option>
                <option value="MAPS_GROUNDING_TYPE_GOOGLE_MAPS">Google Maps</option>
              </select>
            </div>

            <label className="flex items-center space-x-3 cursor-pointer">
              <div className="flex items-center flex-wrap gap-1.5">
                <input
                  type="checkbox"
                  name="defaultMapsGroundingToggleOff"
                  checked={Boolean(defaultMapsGroundingToggleOff)}
                  onChange={handleChange}
                  className="h-4 w-4 bg-gray-700 border-gray-600 rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-300 ml-2">Default Maps Grounding to Off</span>
                {isMapsGroundingDisabled && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-900/40 text-amber-300 border border-amber-700/60">
                    Requires Maps Grounding Enabled
                  </span>
                )}
                <InfoTooltip text="When Google Maps grounding is enabled, sets the user-facing Maps Grounding toggle in chat UI to 'Off' by default." />
              </div>
            </label>

            <div>
              <label htmlFor="vertexAiSearchToolConfig" className="flex items-center text-sm font-medium text-gray-300 mb-1">
                Vertex AI Search Tool Config (JSON)
                <InfoTooltip text="Raw JSON configuration for the Vertex AI Search Tool (restricted to TRUSTED_TESTER / GOOGLE_INTERNAL projects). Caution: Invalid JSON here can break the search functionality." />
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
      )}
    </>
  );
};
