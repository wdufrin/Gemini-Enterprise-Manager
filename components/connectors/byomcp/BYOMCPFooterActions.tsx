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

interface BYOMCPFooterActionsProps {
  copiedCurl: boolean;
  onCopyCurl: () => void;
  copiedJson: boolean;
  onCopyJson: () => void;
  computedUpdateMask: string[];
  isSaving: boolean;
  disableSave: boolean;
  onSave: () => void;
}

export const BYOMCPFooterActions: React.FC<BYOMCPFooterActionsProps> = ({
  copiedCurl,
  onCopyCurl,
  copiedJson,
  onCopyJson,
  computedUpdateMask,
  isSaving,
  disableSave,
  onSave,
}) => {
  return (
    <div className="bg-gray-900/80 p-4 rounded-lg border border-gray-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onCopyCurl}
          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold rounded border border-gray-700 transition-colors flex items-center gap-1.5 shadow-sm"
        >
          {copiedCurl ? (
            <>
              <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              <span className="text-green-300 font-bold">cURL Copied!</span>
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-2M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m-6 9h6m-6 4h6" /></svg>
              Copy cURL (PATCH)
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onCopyJson}
          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold rounded border border-gray-700 transition-colors flex items-center gap-1.5 shadow-sm"
        >
          {copiedJson ? (
            <>
              <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              <span className="text-green-300 font-bold">JSON Copied!</span>
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5 text-gray-400 font-mono" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
              Copy JSON
            </>
          )}
        </button>
      </div>

      {/* Save Button */}
      <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
        <span className="text-[11px] text-gray-400 font-mono hidden sm:inline-block">
          Mask: <span className="text-purple-300">{computedUpdateMask.join(', ')}</span>
        </span>
        <button
          type="button"
          onClick={onSave}
          disabled={disableSave}
          className="w-full md:w-auto px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-bold rounded-md shadow-md transition-all flex items-center justify-center gap-2"
        >
          {isSaving ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              Saving BYOMCP Settings...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              Save Settings to Connector
            </>
          )}
        </button>
      </div>
    </div>
  );
};
