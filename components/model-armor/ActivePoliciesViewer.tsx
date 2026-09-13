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
import Spinner from '../Spinner';
import { getTemplateFilters, formatConfidenceLevel } from './types';

export interface ActivePoliciesViewerProps {
  templates: any[];
  associations: Record<string, string[]>;
  /** False when at least one app lookup failed, so "no association" is unproven. */
  associationsComplete: boolean;
  scanWarnings: string[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onClone: (template: any) => void;
}

export const ActivePoliciesViewer: React.FC<ActivePoliciesViewerProps> = ({
  templates,
  associations,
  associationsComplete,
  scanWarnings,
  isLoading,
  error,
  onRefresh,
  onClone,
}) => {
  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-md p-6 space-y-4">
      <div className="flex justify-between items-center border-b border-gray-700 pb-3">
        <div>
          <h3 className="text-lg font-bold text-white">Active Protection Policies</h3>
          <p className="text-sm text-gray-400 mt-0.5">Existing Model Armor templates registered in the project.</p>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="px-3.5 py-1.5 bg-gray-700 hover:bg-gray-650 text-gray-200 text-xs font-semibold rounded border border-gray-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {isLoading && <div className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />}
          Refresh List
        </button>
      </div>

      {error && <div className="text-sm text-red-400 p-3 bg-red-950/20 rounded border border-red-900/50">{error}</div>}

      {!isLoading && scanWarnings.length > 0 && (
        <div className="text-xs text-amber-200 p-3 bg-amber-950/20 rounded border border-amber-900/50 space-y-1">
          <p className="font-semibold">
            Some apps could not be read, so &quot;Associated Apps&quot; below is incomplete. Anything shown as
            Unknown may or may not be protected.
          </p>
          <ul className="list-disc list-inside text-amber-300/90">
            {scanWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {isLoading && templates.length === 0 ? (
        <div className="flex items-center justify-center p-12">
          <Spinner />
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center p-8 text-gray-500 bg-gray-900/30 rounded border border-gray-800">
          No active Model Armor templates found in this project.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-800 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                <th className="pb-3 pl-3">Template ID</th>
                <th className="pb-3">Security Features</th>
                <th className="pb-3">RAI Filters</th>
                <th className="pb-3">Associated Apps</th>
                <th className="pb-3 pr-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 text-sm text-gray-300">
              {templates.map((temp) => {
                const templateId = temp.name.split('/').pop();
                const location = temp.name.split('/')[3];
                const filters = getTemplateFilters(temp);
                const apps = associations[temp.name] || [];

                return (
                  <tr key={temp.name} className="hover:bg-gray-800/20 transition-colors">
                    <td className="py-4 pl-3 max-w-[200px] truncate">
                      <div className="font-mono font-semibold text-white truncate" title={templateId}>
                        {templateId}
                      </div>
                      <div className="text-xs text-gray-500 font-mono mt-0.5">{location}</div>
                    </td>
                    <td className="py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {filters.jailbreak && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-900/60 text-blue-200 border border-blue-800/60">
                            Jailbreak Defense
                          </span>
                        )}
                        {filters.maliciousUris && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-900/60 text-purple-200 border border-purple-800/60">
                            Malicious URI
                          </span>
                        )}
                        {filters.sdp && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-900/60 text-teal-200 border border-teal-800/60">
                            PII Redaction
                          </span>
                        )}
                        {!filters.jailbreak && !filters.maliciousUris && !filters.sdp && (
                          <span className="text-xs text-gray-500 italic">None</span>
                        )}
                      </div>
                    </td>
                    <td className="py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {filters.rai.length > 0 ? (
                          filters.rai.map((r: { type: string; level: string }) => (
                            <span
                              key={r.type}
                              className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-900/60 text-green-200 border border-green-800/60 flex items-center gap-1.5"
                            >
                              <span className="capitalize">{r.type.toLowerCase().replace('_', ' ')}</span>
                              <span className="text-green-300 font-mono text-[9px] bg-black/40 px-1 rounded border border-green-800/40">
                                {formatConfidenceLevel(r.level)}
                              </span>
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-gray-500 italic">None</span>
                        )}
                      </div>
                    </td>
                    <td className="py-4">
                      {apps.length > 0 ? (
                        <div className="space-y-1">
                          {apps.map((app: string) => (
                            <span
                              key={app}
                              className="block text-xs bg-gray-900/60 px-2 py-1 rounded text-gray-300 border border-gray-800"
                            >
                              {app}
                            </span>
                          ))}
                        </div>
                      ) : associationsComplete ? (
                        <span
                          className="px-2.5 py-0.5 rounded text-[10px] font-semibold bg-gray-700/60 text-gray-400 border border-gray-650"
                          title="No assistant in this project references this template."
                        >
                          Not attached
                        </span>
                      ) : (
                        <span
                          className="px-2.5 py-0.5 rounded text-[10px] font-semibold bg-amber-900/50 text-amber-200 border border-amber-800"
                          title="At least one app could not be read, so we cannot say whether this template is attached."
                        >
                          Unknown
                        </span>
                      )}
                    </td>
                    <td className="py-4 pr-3 text-right">
                      <button
                        onClick={() => onClone(temp)}
                        className="px-2.5 py-1 bg-gray-700 hover:bg-gray-650 text-xs font-semibold rounded text-white border border-gray-650 flex items-center justify-center gap-1 ml-auto transition-colors"
                        title="Clone this template to another location or project"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"
                          />
                        </svg>
                        Clone
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
