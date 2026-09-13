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

interface DuplicateStepIdentifierProps {
  targetCollectionId: string;
  setTargetCollectionId: (val: string) => void;
  targetCollectionDisplayName: string;
  setTargetCollectionDisplayName: (val: string) => void;
}

export const DuplicateStepIdentifier: React.FC<DuplicateStepIdentifierProps> = ({
  targetCollectionId,
  setTargetCollectionId,
  targetCollectionDisplayName,
  setTargetCollectionDisplayName,
}) => {
  return (
    <div className="space-y-4 animate-fadeIn">
      <h3 className="text-md font-semibold text-white">
        Step 2: Connector Identification
      </h3>
      <p className="text-xs text-gray-400">
        Provide a new Collection ID and Display Name for the duplicated connector.
      </p>

      <div className="space-y-4 pt-2">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Collection ID
          </label>
          <input
            type="text"
            value={targetCollectionId}
            onChange={(e) => setTargetCollectionId(e.target.value)}
            placeholder="e.g. jira-connector-prod"
            className="bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 w-full focus:ring-blue-500"
            pattern="[a-z0-9-_]{1,63}"
          />
          <p className="text-[10px] text-gray-500 mt-1">
            Only lowercase letters, numbers, hyphens, and underscores, up to 63 chars.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Display Name
          </label>
          <input
            type="text"
            value={targetCollectionDisplayName}
            onChange={(e) => setTargetCollectionDisplayName(e.target.value)}
            placeholder="e.g. Jira Production Connector"
            className="bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 w-full focus:ring-blue-500"
          />
        </div>
      </div>
    </div>
  );
};
