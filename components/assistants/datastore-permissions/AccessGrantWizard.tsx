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
import { ConnectorResource, LegacyDataStoreResource } from './types';

interface AccessGrantWizardProps {
  isWizardOpen: boolean;
  onToggleOpen: () => void;
  targetMembersInput: string;
  onChangeTargetMembers: (val: string) => void;
  onReloadCurrentConfig: () => void;
  wizardCheckCustomRole: boolean;
  onChangeCheckCustomRole: (val: boolean) => void;
  wizardGrantProjectRole: boolean;
  onChangeGrantProjectRole: (val: boolean) => void;
  wizardGrantEngineRole: boolean;
  onChangeGrantEngineRole: (val: boolean) => void;
  selectedResourcesForGrant: Record<string, boolean>;
  onChangeSelectedResources: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  connectors: ConnectorResource[];
  legacyDataStores: LegacyDataStoreResource[];
  isDryRun: boolean;
  onChangeDryRun: (val: boolean) => void;
  isExecutingWizard: boolean;
  onSubmit: (e: React.FormEvent) => void;
  executionLogs: string[];
  onClearLogs: () => void;
  appId: string;
}

export const AccessGrantWizard: React.FC<AccessGrantWizardProps> = ({
  isWizardOpen,
  onToggleOpen,
  targetMembersInput,
  onChangeTargetMembers,
  onReloadCurrentConfig,
  wizardCheckCustomRole,
  onChangeCheckCustomRole,
  wizardGrantProjectRole,
  onChangeGrantProjectRole,
  wizardGrantEngineRole,
  onChangeGrantEngineRole,
  selectedResourcesForGrant,
  onChangeSelectedResources,
  connectors,
  legacyDataStores,
  isDryRun,
  onChangeDryRun,
  isExecutingWizard,
  onSubmit,
  executionLogs,
  onClearLogs,
  appId,
}) => {
  return (
    <div id="wizard-section" className="bg-gray-800 rounded-xl border border-gray-700 shadow-md overflow-hidden">
      <div
        onClick={onToggleOpen}
        className="p-4 bg-gray-750 border-b border-gray-700 flex justify-between items-center cursor-pointer hover:bg-gray-700/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-600/30 text-blue-400 flex items-center justify-center font-bold text-xs">
            ⚡
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Interactive End-User Permission Provisioner</h3>
            <p className="text-xs text-gray-400">Automates Steps A1 - A4 in 1-Click with live post-audit verification</p>
          </div>
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-5 w-5 text-gray-400 transition-transform ${isWizardOpen ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </div>

      {isWizardOpen && (
        <form onSubmit={onSubmit} className="p-6 space-y-6">
          {/* Input Principals */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-semibold text-gray-200">
                Target User / Group Email(s)
              </label>
              {targetMembersInput.trim() && (
                <button
                  type="button"
                  onClick={onReloadCurrentConfig}
                  className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
                >
                  <span>🔄 Reload Current Config</span>
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400 mb-2">
              Enter single email or comma-separated list. Accepts standard emails (e.g. <code>userA@example.com</code>) or workforce pool identifiers (e.g. <code>principal://...</code>).
            </p>
            <input
              type="text"
              value={targetMembersInput}
              onChange={(e) => onChangeTargetMembers(e.target.value)}
              placeholder="e.g., userA@example.com, principal://iam.googleapis.com/.../subject/user@domain.com"
              className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <div className="mt-2 text-[11px] text-blue-300 bg-blue-950/40 p-2.5 rounded-lg border border-blue-800/50 flex items-center gap-1.5">
              <span>⚡</span>
              <span>
                <strong>Two-Way Synchronization Active:</strong> Checkboxes automatically load the principal&apos;s current permissions. Checking an item will <strong>grant</strong> access; unchecking an item will <strong>revoke</strong> access on save.
              </span>
            </div>
          </div>

          {/* Workflow Step Options */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Step 1 Checkbox */}
            <div className="bg-gray-900/60 p-3.5 rounded-lg border border-gray-700/80">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={wizardCheckCustomRole}
                  onChange={(e) => onChangeCheckCustomRole(e.target.checked)}
                  className="mt-1 rounded bg-gray-800 border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-xs font-bold text-white block">Appendix A: Check Custom Role</span>
                  <span className="text-[11px] text-gray-400 block mt-0.5">
                    Verify or create <code>customRestrictedEndUser</code> role.
                  </span>
                </div>
              </label>
            </div>

            {/* Step 2 Checkbox */}
            <div className="bg-gray-900/60 p-3.5 rounded-lg border border-gray-700/80">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={wizardGrantProjectRole}
                  onChange={(e) => onChangeGrantProjectRole(e.target.checked)}
                  className="mt-1 rounded bg-gray-800 border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-xs font-bold text-white block">Step A1: Grant Project Custom Role</span>
                  <span className="text-[11px] text-gray-400 block mt-0.5">
                    {wizardGrantProjectRole ? 'Grant' : 'Revoke'} <code>customRestrictedEndUser</code> at project level.
                  </span>
                </div>
              </label>
            </div>

            {/* Step 3 Checkbox */}
            <div className="bg-gray-900/60 p-3.5 rounded-lg border border-gray-700/80">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={wizardGrantEngineRole}
                  onChange={(e) => onChangeGrantEngineRole(e.target.checked)}
                  className="mt-1 rounded bg-gray-800 border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-xs font-bold text-white block">Step A2: Grant on App Engine</span>
                  <span className="text-[11px] text-gray-400 block mt-0.5">
                    {wizardGrantEngineRole ? 'Grant' : 'Revoke'} <code>roles/discoveryengine.agentspaceUser</code> on {appId}.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Step A3 & A4: Target DataStores Selection */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-semibold text-gray-200">
                Steps A3 & A4: Select Connected DataStores & Connectors to Grant Access
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const allSelected: Record<string, boolean> = {};
                    connectors.forEach(c => {
                      allSelected[`connector:${c.id}`] = true;
                      c.entities.forEach(e => {
                        allSelected[`entity:${e.id}`] = true;
                      });
                    });
                    legacyDataStores.forEach(ds => {
                      allSelected[`datastore:${ds.id}`] = true;
                    });
                    onChangeSelectedResources(allSelected);
                  }}
                  className="text-xs text-blue-400 hover:text-blue-300 font-medium"
                >
                  Select All
                </button>
                <span className="text-gray-600">|</span>
                <button
                  type="button"
                  onClick={() => onChangeSelectedResources({})}
                  className="text-xs text-gray-400 hover:text-gray-300 font-medium"
                >
                  Deselect All
                </button>
              </div>
            </div>

            <div className="space-y-3 bg-gray-900/50 p-4 rounded-xl border border-gray-700 max-h-64 overflow-y-auto">
              {connectors.length === 0 && legacyDataStores.length === 0 && (
                <p className="text-xs text-gray-500 italic py-2">No DataStores or Connectors found in this location.</p>
              )}

              {/* Connectors */}
              {connectors.map(conn => (
                <div key={conn.id} className="bg-gray-800/80 p-3 rounded-lg border border-gray-700/80">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!selectedResourcesForGrant[`connector:${conn.id}`]}
                      onChange={(e) => {
                        const val = e.target.checked;
                        onChangeSelectedResources(prev => {
                          const updated = { ...prev, [`connector:${conn.id}`]: val };
                          conn.entities.forEach(ent => {
                            updated[`entity:${ent.id}`] = val;
                          });
                          return updated;
                        });
                      }}
                      className="rounded bg-gray-700 border-gray-600 text-purple-600 focus:ring-purple-500"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-purple-300 font-mono">{conn.id}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-950 text-purple-300 border border-purple-800">
                        DataConnector
                      </span>
                      {conn.isAttached && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-950 text-green-300 border border-green-800">
                          Attached to App
                        </span>
                      )}
                    </div>
                  </label>

                  {/* Connector Entities */}
                  {conn.entities.length > 0 && (
                    <div className="mt-2 pl-6 space-y-1.5 border-l-2 border-purple-900/50 ml-2">
                      {conn.entities.map(ent => (
                        <label key={ent.id} className="flex items-center gap-2 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={!!selectedResourcesForGrant[`entity:${ent.id}`]}
                            onChange={(e) =>
                              onChangeSelectedResources(prev => ({
                                ...prev,
                                [`entity:${ent.id}`]: e.target.checked,
                              }))
                            }
                            className="rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-gray-300 font-mono text-[11px]">{ent.id}</span>
                          <span className="text-[10px] text-gray-500">(Entity DataStore)</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* Legacy DataStores */}
              {legacyDataStores.map(ds => (
                <div key={ds.id} className="bg-gray-800/80 p-3 rounded-lg border border-gray-700/80">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!selectedResourcesForGrant[`datastore:${ds.id}`]}
                      onChange={(e) =>
                        onChangeSelectedResources(prev => ({
                          ...prev,
                          [`datastore:${ds.id}`]: e.target.checked,
                        }))
                      }
                      className="rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-200 font-mono">{ds.id}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-950 text-blue-300 border border-blue-800">
                        Legacy DataStore
                      </span>
                      {ds.isAttached && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-950 text-green-300 border border-green-800">
                          Attached to App
                        </span>
                      )}
                    </div>
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Execution Controls */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-4 border-t border-gray-700">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isDryRun}
                onChange={(e) => onChangeDryRun(e.target.checked)}
                className="rounded bg-gray-800 border-gray-600 text-yellow-500 focus:ring-yellow-400"
              />
              <span className="text-xs font-semibold text-gray-300">
                Dry-Run Preview Mode <span className="text-gray-500 font-normal">(simulate and verify without writing to live policies)</span>
              </span>
            </label>

            <button
              type="submit"
              disabled={isExecutingWizard || !targetMembersInput.trim()}
              className={`px-6 py-2.5 rounded-lg text-sm font-bold text-white shadow-lg transition-all flex items-center gap-2 ${
                isDryRun
                  ? 'bg-yellow-600 hover:bg-yellow-500'
                  : 'bg-blue-600 hover:bg-blue-500'
              } disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed`}
            >
              {isExecutingWizard ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Syncing Permissions...
                </>
              ) : isDryRun ? (
                'Preview Synchronization (Dry Run)'
              ) : (
                'Apply & Sync Permissions'
              )}
            </button>
          </div>

          {/* Execution Console Output */}
          {executionLogs.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-700">
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">Live Execution Activity Log</h4>
                <button
                  type="button"
                  onClick={onClearLogs}
                  className="text-[11px] text-gray-500 hover:text-gray-400"
                >
                  Clear Log
                </button>
              </div>
              <div className="p-3.5 bg-gray-950 rounded-lg border border-gray-800 font-mono text-xs text-gray-200 max-h-56 overflow-y-auto space-y-1 select-all">
                {executionLogs.map((log, i) => (
                  <div
                    key={i}
                    className={
                      log.includes('[VERIFIED ✓]')
                        ? 'text-green-400 font-semibold'
                        : log.includes('[ACTION]')
                        ? 'text-blue-400'
                        : log.includes('[SKIP]')
                        ? 'text-yellow-400'
                        : log.includes('[ERROR')
                        ? 'text-red-400 font-bold'
                        : 'text-gray-300'
                    }
                  >
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>
      )}
    </div>
  );
};
