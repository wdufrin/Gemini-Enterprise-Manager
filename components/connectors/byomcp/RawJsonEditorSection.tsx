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

interface RawJsonEditorSectionProps {
  rawJsonText: string;
  setRawJsonText: (val: string) => void;
  rawJsonError: string | null;
  setRawJsonError: (val: string | null) => void;
  useAutoUpdateMask: boolean;
  setUseAutoUpdateMask: (val: boolean) => void;
  computedUpdateMask: string[];
  customUpdateMask: string;
  setCustomUpdateMask: (val: string) => void;
  targetedPayload: any;
  onBeautifyJson: () => void;
}

export const RawJsonEditorSection: React.FC<RawJsonEditorSectionProps> = ({
  rawJsonText,
  setRawJsonText,
  rawJsonError,
  setRawJsonError,
  useAutoUpdateMask,
  setUseAutoUpdateMask,
  computedUpdateMask,
  customUpdateMask,
  setCustomUpdateMask,
  targetedPayload,
  onBeautifyJson,
}) => {
  return (
    <div className="space-y-4">
      <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-800 space-y-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h4 className="text-sm font-bold text-gray-200 uppercase tracking-wider font-mono">
              Live JSON Configuration Editor
            </h4>
            <p className="text-xs text-gray-400">
              Directly edit the JSON payload. All fields will be parsed and validated before submitting.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onBeautifyJson}
              className="px-2.5 py-1 text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded border border-gray-700 transition-colors flex items-center gap-1"
            >
              Format JSON
            </button>
            <button
              onClick={() => {
                setRawJsonText(JSON.stringify(targetedPayload, null, 2));
                setRawJsonError(null);
              }}
              className="px-2.5 py-1 text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded border border-gray-700 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Update Mask configuration */}
        <div className="p-3 bg-gray-950 rounded border border-gray-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
              Update Mask <span className="text-purple-400 font-mono text-[10px]">(updateMask parameter)</span>
            </span>
            <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={useAutoUpdateMask}
                onChange={(e) => setUseAutoUpdateMask(e.target.checked)}
                className="rounded bg-gray-900 border-gray-700 text-blue-600 focus:ring-0"
              />
              Auto-detect from edited fields
            </label>
          </div>

          <input
            type="text"
            disabled={useAutoUpdateMask}
            value={useAutoUpdateMask ? computedUpdateMask.join(',') : customUpdateMask}
            onChange={(e) => setCustomUpdateMask(e.target.value)}
            placeholder="action_config.action_params,dynamic_tools,bap_config"
            className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-xs font-mono text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-60"
          />
          <p className="text-[10px] text-gray-500">
            Comma-separated paths specifying which fields to update (e.g.{' '}
            <code className="text-purple-300">action_config.action_params</code>,{' '}
            <code className="text-purple-300">dynamic_tools</code>,{' '}
            <code className="text-purple-300">bap_config</code>).
          </p>
        </div>

        {/* JSON Textarea */}
        <div>
          <textarea
            value={rawJsonText}
            onChange={(e) => {
              setRawJsonText(e.target.value);
              try {
                JSON.parse(e.target.value);
                setRawJsonError(null);
              } catch (err: any) {
                setRawJsonError(`Syntax Error: ${err.message}`);
              }
            }}
            rows={16}
            className={`w-full bg-gray-950 p-3 rounded font-mono text-xs leading-relaxed focus:outline-none custom-scrollbar ${
              rawJsonError
                ? 'border-2 border-red-500 text-red-200'
                : 'border border-gray-700 text-gray-200 focus:border-blue-500'
            }`}
          />
          {rawJsonError && (
            <div className="mt-1 text-xs text-red-400 font-mono flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {rawJsonError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
