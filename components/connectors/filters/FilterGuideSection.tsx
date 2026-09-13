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
import { FilterKeyDefinition } from './filterDefinitions';

interface FilterGuideSectionProps {
  dataSourceName: string;
  activeDefinitions: FilterKeyDefinition[];
  onClose: () => void;
}

export const FilterGuideSection: React.FC<FilterGuideSectionProps> = ({
  dataSourceName,
  activeDefinitions,
  onClose,
}) => {
  return (
    <div className="bg-gray-950/90 border border-blue-900/60 p-4 rounded-lg space-y-3 animate-fadeIn text-xs shadow-lg">
      <div className="flex items-center justify-between border-b border-gray-800 pb-2">
        <h4 className="font-bold text-blue-300 flex items-center gap-1.5">
          <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          Supported Filter Keys for {dataSourceName || 'this Connector'}
        </h4>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-xs">
          Close &times;
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
        {activeDefinitions.map((def) => (
          <div key={def.key} className="bg-gray-900/80 p-2.5 rounded border border-gray-800 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-blue-400 text-[11px]">{def.key}</span>
              <span className="text-[10px] text-gray-400 font-semibold">{def.label}</span>
            </div>
            <p className="text-gray-300 text-[11px]">{def.description}</p>
            <div className="text-[10px] text-gray-500 font-mono">
              <span className="text-gray-400">Example:</span> {def.example}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-blue-950/30 p-2.5 rounded border border-blue-900/40 text-[11px] text-blue-300 space-y-1">
        <p>
          <strong>Tips & Wildcards:</strong> You can enter multiple values separated by commas or new lines. URL and path filters support trailing wildcards (e.g. <code className="bg-black/40 px-1 py-0.5 rounded text-blue-200">https://tenant.sharepoint.com/sites/Finance/*</code>).
        </p>
      </div>
    </div>
  );
};
