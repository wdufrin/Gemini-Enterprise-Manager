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
import { CustomParamItem } from './types';

interface AdvancedParamsSectionProps {
  refreshInterval: string;
  setRefreshInterval: (val: string) => void;
  staticIpEnabled: boolean;
  setStaticIpEnabled: (val: boolean) => void;
  customActionParams: CustomParamItem[];
  onAddCustomParam: () => void;
  onUpdateCustomParam: (index: number, field: 'key' | 'value', val: string) => void;
  onRemoveCustomParam: (index: number) => void;
}

export const AdvancedParamsSection: React.FC<AdvancedParamsSectionProps> = ({
  refreshInterval,
  setRefreshInterval,
  staticIpEnabled,
  setStaticIpEnabled,
  customActionParams,
  onAddCustomParam,
  onUpdateCustomParam,
  onRemoveCustomParam,
}) => {
  return (
    <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-800 space-y-4">
      <div className="border-b border-gray-800 pb-2">
        <h4 className="text-sm font-bold text-gray-200 uppercase tracking-wider">
          Schedule & Advanced Parameters
        </h4>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Refresh Interval */}
        <div>
          <label className="block text-xs font-semibold text-gray-300 mb-1">
            Sync / Refresh Interval <span className="text-purple-400 font-mono text-[10px]">(refreshInterval)</span>
          </label>
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(e.target.value)}
            className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-xs text-white focus:outline-none focus:border-blue-500"
          >
            <option value="86400s">Every 24 Hours (86400s - Default)</option>
            <option value="43200s">Every 12 Hours (43200s)</option>
            <option value="21600s">Every 6 Hours (21600s)</option>
            <option value="3600s">Every 1 Hour (3600s)</option>
          </select>
        </div>

        {/* Static IP Enabled */}
        <div className="flex items-center justify-between p-3 bg-gray-950 rounded border border-gray-800">
          <div>
            <div className="text-xs font-semibold text-gray-300">Static IP Routing</div>
            <div className="text-[11px] text-gray-500">Route connector traffic through GCP static IPs</div>
          </div>
          <button
            type="button"
            onClick={() => setStaticIpEnabled(!staticIpEnabled)}
            className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
              staticIpEnabled
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {staticIpEnabled ? 'Enabled' : 'Disabled'}
          </button>
        </div>
      </div>

      {/* Custom Action Parameters Table */}
      <div className="pt-2">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-semibold text-gray-300">
            Custom Action Parameters ({customActionParams.length})
          </span>
          <button
            onClick={onAddCustomParam}
            className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-blue-400 hover:text-blue-300 text-xs font-semibold rounded border border-gray-700 flex items-center gap-1 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Add Custom Param
          </button>
        </div>

        {customActionParams.length > 0 && (
          <div className="space-y-2">
            {customActionParams.map((item, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <input
                  type="text"
                  value={item.key}
                  onChange={(e) => onUpdateCustomParam(idx, 'key', e.target.value)}
                  placeholder="Parameter Name"
                  className="w-1/3 bg-gray-950 border border-gray-700 rounded p-2 text-xs text-white font-mono placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  value={item.value}
                  onChange={(e) => onUpdateCustomParam(idx, 'value', e.target.value)}
                  placeholder="Value (string, number, or JSON)"
                  className="flex-1 bg-gray-950 border border-gray-700 rounded p-2 text-xs text-white font-mono placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => onRemoveCustomParam(idx)}
                  className="p-2 text-gray-500 hover:text-red-400 rounded hover:bg-gray-800 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
