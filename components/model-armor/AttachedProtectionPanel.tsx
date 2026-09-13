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
import { EngineArmorState } from './types';

export const StatusPill: React.FC<{ tone: 'on' | 'off' | 'unknown'; children: React.ReactNode }> = ({
  tone,
  children,
}) => {
  const toneClass =
    tone === 'on'
      ? 'bg-green-900/60 text-green-200 border-green-800/60'
      : tone === 'off'
      ? 'bg-gray-700/60 text-gray-300 border-gray-650'
      : 'bg-amber-900/50 text-amber-200 border-amber-800';
  return <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${toneClass}`}>{children}</span>;
};

export interface AttachedProtectionPanelProps {
  engines: EngineArmorState[];
  isLoading: boolean;
}

/**
 * Per-app view of what Model Armor is actually doing right now. Everything here
 * comes from the assistant's live `customerPolicy`; nothing is inferred from
 * what the user just asked us to do.
 */
export const AttachedProtectionPanel: React.FC<AttachedProtectionPanelProps> = ({ engines, isLoading }) => {
  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-md p-6 space-y-4">
      <div className="border-b border-gray-700 pb-3">
        <h3 className="text-lg font-bold text-white">Protection Status by App</h3>
        <p className="text-sm text-gray-400 mt-0.5">
          Read live from each assistant&apos;s <code className="text-gray-300">customerPolicy</code>. An app is only
          protected if a template is listed here.
        </p>
      </div>

      {isLoading && engines.length === 0 ? (
        <div className="flex items-center justify-center p-12">
          <Spinner />
        </div>
      ) : engines.length === 0 ? (
        <div className="text-center p-8 text-gray-500 bg-gray-900/30 rounded border border-gray-800">
          No apps found in the global, us or eu locations for this project.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-800 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                <th className="pb-3 pl-3">App</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Input Template</th>
                <th className="pb-3">Output Template</th>
                <th className="pb-3 pr-3">On Model Armor Failure</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 text-sm text-gray-300">
              {engines.map((engine) => {
                if (engine.status === 'unknown') {
                  return (
                    <tr key={engine.name} className="hover:bg-gray-800/20 transition-colors">
                      <td className="py-4 pl-3">
                        <div className="font-semibold text-white truncate max-w-[220px]" title={engine.displayName}>
                          {engine.displayName}
                        </div>
                        <div className="text-xs text-gray-500 font-mono mt-0.5">{engine.location}</div>
                      </td>
                      <td className="py-4">
                        <StatusPill tone="unknown">Unknown</StatusPill>
                      </td>
                      <td className="py-4 text-xs text-amber-300" colSpan={3}>
                        Could not read this app&apos;s assistant configuration
                        {engine.error ? `: ${engine.error}` : '.'}
                      </td>
                    </tr>
                  );
                }

                if (engine.assistants.length === 0) {
                  return (
                    <tr key={engine.name} className="hover:bg-gray-800/20 transition-colors">
                      <td className="py-4 pl-3">
                        <div className="font-semibold text-white truncate max-w-[220px]" title={engine.displayName}>
                          {engine.displayName}
                        </div>
                        <div className="text-xs text-gray-500 font-mono mt-0.5">{engine.location}</div>
                      </td>
                      <td className="py-4">
                        <StatusPill tone="unknown">Unknown</StatusPill>
                      </td>
                      <td className="py-4 text-xs text-gray-500" colSpan={3}>
                        This app reports no assistants, so there is no policy to inspect.
                      </td>
                    </tr>
                  );
                }

                return engine.assistants.map((assistant) => {
                  const isProtected = Boolean(assistant.userPromptTemplate || assistant.responseTemplate);
                  return (
                    <tr key={assistant.name} className="hover:bg-gray-800/20 transition-colors">
                      <td className="py-4 pl-3">
                        <div className="font-semibold text-white truncate max-w-[220px]" title={engine.displayName}>
                          {engine.displayName}
                        </div>
                        <div className="text-xs text-gray-500 font-mono mt-0.5">
                          {engine.location} / {assistant.assistantId}
                        </div>
                      </td>
                      <td className="py-4">
                        <StatusPill tone={isProtected ? 'on' : 'off'}>
                          {isProtected ? 'Protected' : 'Not protected'}
                        </StatusPill>
                      </td>
                      <td className="py-4 text-xs font-mono">
                        {assistant.userPromptTemplate ? (
                          <span className="text-gray-200" title={assistant.userPromptTemplate}>
                            {assistant.userPromptTemplate.split('/').pop()}
                          </span>
                        ) : (
                          <span className="text-gray-600 italic">none</span>
                        )}
                      </td>
                      <td className="py-4 text-xs font-mono">
                        {assistant.responseTemplate ? (
                          <span className="text-gray-200" title={assistant.responseTemplate}>
                            {assistant.responseTemplate.split('/').pop()}
                          </span>
                        ) : (
                          <span className="text-gray-600 italic">none</span>
                        )}
                      </td>
                      <td className="py-4 pr-3 text-xs">
                        {!isProtected ? (
                          <span className="text-gray-600 italic">n/a</span>
                        ) : assistant.failureMode === 'FAIL_OPEN' ? (
                          <span
                            className="text-red-300"
                            title="Traffic is passed through unfiltered when Model Armor cannot evaluate it."
                          >
                            Fail open &ndash; traffic passes unfiltered
                          </span>
                        ) : (
                          <span className="text-gray-300">
                            Fail closed &ndash; request rejected
                            {assistant.failureMode ? '' : ' (unset, API default)'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
