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

interface DuplicateStepDestinationProps {
  targetProjectId: string;
  setTargetProjectId: (val: string) => void;
  targetLocation: string;
  setTargetLocation: (val: string) => void;
  hasActionConfig: boolean;
  includeActions: boolean;
  setIncludeActions: (val: boolean) => void;
}

export const DuplicateStepDestination: React.FC<DuplicateStepDestinationProps> = ({
  targetProjectId,
  setTargetProjectId,
  targetLocation,
  setTargetLocation,
  hasActionConfig,
  includeActions,
  setIncludeActions,
}) => {
  return (
    <div className="space-y-4 animate-fadeIn">
      <h3 className="text-md font-semibold text-white">
        Step 1: Choose Target Project & Region
      </h3>
      <p className="text-xs text-gray-400">
        Select the Google Cloud Project and Vertex AI Search region
        where you want to recreate this connector.
      </p>

      <div className="space-y-4 pt-2">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Target Project ID / Number
          </label>
          <input
            type="text"
            value={targetProjectId}
            onChange={(e) => setTargetProjectId(e.target.value)}
            placeholder="e.g. my-target-gcp-project"
            className="bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 w-full focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Target Location / Region
          </label>
          <select
            value={targetLocation}
            onChange={(e) => setTargetLocation(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px] focus:ring-blue-500"
          >
            <option value="global">global</option>
            <option value="us">us</option>
            <option value="eu">eu</option>
          </select>
        </div>

        {hasActionConfig && (
          <div className="bg-gray-800/40 p-4 border border-gray-700/60 rounded-lg mt-4">
            <div className="flex items-start gap-2.5">
              <input
                type="checkbox"
                id="include-actions"
                checked={includeActions}
                onChange={(e) => setIncludeActions(e.target.checked)}
                className="mt-1 rounded bg-gray-900 border-gray-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <div className="text-xs">
                <label htmlFor="include-actions" className="font-semibold text-gray-200 block cursor-pointer">
                  Enable Client-Side Actions (BAP)
                </label>
                <span className="text-gray-400 mt-0.5 block">
                  Recreate client-side search/write actions (e.g., download document, send message). Deselect if actions are not supported or fail to deploy in the target region.
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
