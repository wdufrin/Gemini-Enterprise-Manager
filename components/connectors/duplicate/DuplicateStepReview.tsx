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

interface DuplicateStepReviewProps {
  targetProjectId: string;
  targetLocation: string;
  targetCollectionId: string;
  targetCollectionDisplayName: string;
  finalPayload: any;
}

export const DuplicateStepReview: React.FC<DuplicateStepReviewProps> = ({
  targetProjectId,
  targetLocation,
  targetCollectionId,
  targetCollectionDisplayName,
  finalPayload,
}) => {
  return (
    <div className="space-y-4 animate-fadeIn flex flex-col h-full">
      <h3 className="text-md font-semibold text-white">
        Step 4: Review and Provision Connector
      </h3>
      <p className="text-xs text-gray-400">
        Review the destination and credentials payload. Clicking
        &quot;Provision&quot; will invoke the `setUpDataConnector` API in the target
        project/location.
      </p>

      <div className="grid grid-cols-2 gap-4 bg-gray-900/60 p-3 rounded border border-gray-800 text-xs">
        <div>
          <span className="text-gray-400 block">Target Project</span>
          <span className="font-semibold text-white">
            {targetProjectId}
          </span>
        </div>
        <div>
          <span className="text-gray-400 block">Target Location</span>
          <span className="font-semibold text-white">
            {targetLocation}
          </span>
        </div>
        <div>
          <span className="text-gray-400 block">Collection ID</span>
          <span className="font-semibold text-white font-mono">
            {targetCollectionId}
          </span>
        </div>
        <div>
          <span className="text-gray-400 block">Display Name</span>
          <span className="font-semibold text-white">
            {targetCollectionDisplayName}
          </span>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <span className="text-xs font-bold text-gray-400 mb-1">
          API Request Body:
        </span>
        <pre className="text-[11px] bg-gray-950 p-4 rounded overflow-auto border border-gray-800 text-gray-300 font-mono max-h-[220px] custom-scrollbar flex-1 select-all">
          {JSON.stringify(finalPayload, null, 2)}
        </pre>
      </div>
    </div>
  );
};
