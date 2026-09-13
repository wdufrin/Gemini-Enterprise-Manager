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

import React, { useState, useMemo, useCallback } from 'react';
import * as api from '../../services/apiService';
import { toErrorMessage } from '../../utils/errors';
import { EngineArmorState, DEFAULT_FAILURE_MODE, readArmorConfig } from './types';

const CopyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
    <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
    <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
  </svg>
);

export interface PolicyGeneratorProps {
  projectId: string;
  engines: EngineArmorState[];
  /** Re-runs the live scan so the user can see the result of an attach. */
  onRefresh: () => void;
}

export const PolicyGenerator: React.FC<PolicyGeneratorProps> = ({ projectId, engines, onRefresh }) => {
  const [policyName, setPolicyName] = useState('my-safety-policy-input');
  const [config, setConfig] = useState({
    pii: true,
    hateSpeech: 'HIGH',
    harassment: 'HIGH',
    sexuallyExplicit: 'HIGH',
    dangerousContent: 'HIGH',
    jailbreak: true,
    maliciousUris: false,
  });
  const [selectedEngineIndex, setSelectedEngineIndex] = useState(-1);
  const [policyType, setPolicyType] = useState<'input' | 'output' | 'both'>('input');
  const [failureMode, setFailureMode] = useState(DEFAULT_FAILURE_MODE);
  const [copySuccess, setCopySuccess] = useState('');
  const [copyAttachSuccess, setCopyAttachSuccess] = useState('');

  // Real-action state. `*Result` is only ever set from an API response.
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createResult, setCreateResult] = useState<string | null>(null);
  const [isAttaching, setIsAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [attachResult, setAttachResult] = useState<string | null>(null);

  const toggle = (key: 'pii' | 'jailbreak' | 'maliciousUris') =>
    setConfig((prev) => ({ ...prev, [key]: !prev[key] }));

  const toggleRai = (key: 'hateSpeech' | 'harassment' | 'sexuallyExplicit' | 'dangerousContent') => {
    setConfig((prev) => ({
      ...prev,
      [key]: prev[key] === 'OFF' ? 'HIGH' : 'OFF',
    }));
  };

  const changeRaiLevel = (
    key: 'hateSpeech' | 'harassment' | 'sexuallyExplicit' | 'dangerousContent',
    val: string
  ) => {
    setConfig((prev) => ({
      ...prev,
      [key]: val,
    }));
  };

  const applyPreset = (preset: 'bp_input' | 'bp_output' | 'strict') => {
    if (preset === 'bp_input') {
      setConfig({
        pii: true,
        hateSpeech: 'HIGH',
        harassment: 'HIGH',
        sexuallyExplicit: 'HIGH',
        dangerousContent: 'HIGH',
        jailbreak: true,
        maliciousUris: false,
      });
      setPolicyName('my-safety-policy-input');
      setPolicyType('input');
    } else if (preset === 'bp_output') {
      setConfig({
        pii: true,
        hateSpeech: 'HIGH',
        harassment: 'HIGH',
        sexuallyExplicit: 'HIGH',
        dangerousContent: 'HIGH',
        jailbreak: false,
        maliciousUris: true,
      });
      setPolicyName('my-safety-policy-output');
      setPolicyType('output');
    } else if (preset === 'strict') {
      setConfig({
        pii: true,
        hateSpeech: 'LOW_AND_ABOVE',
        harassment: 'LOW_AND_ABOVE',
        sexuallyExplicit: 'LOW_AND_ABOVE',
        dangerousContent: 'LOW_AND_ABOVE',
        jailbreak: true,
        maliciousUris: true,
      });
      setPolicyName('my-safety-policy-strict');
      setPolicyType('both');
    }
  };

  const generatedJson = useMemo(() => {
    const filters: Array<Record<string, unknown>> = [];

    if (config.pii) {
      filters.push({
        infoType: 'PHONE_NUMBER',
        filterConfig: { replaceWithInfoTypeConfig: {} },
      });
      filters.push({
        infoType: 'EMAIL_ADDRESS',
        filterConfig: { replaceWithInfoTypeConfig: {} },
      });
    }

    const raiFilters: Array<Record<string, string>> = [];
    if (config.hateSpeech !== 'OFF')
      raiFilters.push({ filterType: 'HATE_SPEECH', confidenceLevel: config.hateSpeech });
    if (config.harassment !== 'OFF')
      raiFilters.push({ filterType: 'HARASSMENT', confidenceLevel: config.harassment });
    if (config.sexuallyExplicit !== 'OFF')
      raiFilters.push({ filterType: 'SEXUALLY_EXPLICIT', confidenceLevel: config.sexuallyExplicit });
    if (config.dangerousContent !== 'OFF')
      raiFilters.push({ filterType: 'DANGEROUS_CONTENT', confidenceLevel: config.dangerousContent });

    return {
      filterConfig: {
        raiSettings: {
          raiFilters,
        },
        sdpSettings: {
          sdpFilters: filters,
        },
        piAndJailbreakFilterSettings: {
          filterEnforcement: config.jailbreak ? 'ENABLED' : 'DISABLED',
          confidenceLevel: 'MEDIUM_AND_ABOVE',
        },
        maliciousUriFilterSettings: {
          filterEnforcement: config.maliciousUris ? 'ENABLED' : 'DISABLED',
        },
      },
      templateMetadata: {
        ignorePartialInvocationFailures: false,
        enforcementType: 'INSPECT_AND_BLOCK',
      },
    };
  }, [config]);

  const templateResourceName = `projects/${projectId}/locations/global/templates/${policyName}`;

  const selectedEngine = selectedEngineIndex >= 0 ? engines[selectedEngineIndex] ?? null : null;

  const targetAssistant = useMemo(() => {
    if (!selectedEngine || selectedEngine.status !== 'ok') return null;
    return (
      selectedEngine.assistants.find((a) => a.assistantId === 'default_assistant') ??
      selectedEngine.assistants[0] ??
      null
    );
  }, [selectedEngine]);

  const buildModelArmorConfig = useCallback(
    (existing: Record<string, unknown>): Record<string, unknown> => {
      const next: Record<string, unknown> = { ...existing };
      if (policyType === 'input' || policyType === 'both') {
        next.userPromptTemplate = templateResourceName;
      }
      if (policyType === 'output' || policyType === 'both') {
        next.responseTemplate = templateResourceName;
      }
      next.failureMode = failureMode;
      return next;
    },
    [policyType, templateResourceName, failureMode]
  );

  const generatedCommand = `curl -X POST \\
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(generatedJson)}' \\
  "https://modelarmor.googleapis.com/v1/projects/${projectId}/locations/global/templates?templateId=${policyName}"`;

  const attachCommand = useMemo(() => {
    if (!selectedEngine) return '';
    const assistantName = targetAssistant
      ? targetAssistant.name
      : `projects/${projectId}/locations/${selectedEngine.location}/collections/default_collection/engines/${selectedEngine.engineId}/assistants/default_assistant`;

    const payload = {
      customerPolicy: {
        modelArmorConfig: buildModelArmorConfig(
          targetAssistant ? ((targetAssistant.customerPolicy.modelArmorConfig as Record<string, unknown>) ?? {}) : {}
        ),
      },
    };

    const host =
      selectedEngine.location === 'global'
        ? 'discoveryengine.googleapis.com'
        : `${selectedEngine.location}-discoveryengine.googleapis.com`;

    return `curl -X PATCH \\
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payload)}' \\
  "https://${host}/v1alpha/${assistantName}?updateMask=customerPolicy"`;
  }, [selectedEngine, targetAssistant, projectId, buildModelArmorConfig]);

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedCommand);
    setCopySuccess('Copied!');
    setTimeout(() => setCopySuccess(''), 2000);
  };

  const handleCopyAttach = () => {
    navigator.clipboard.writeText(attachCommand);
    setCopyAttachSuccess('Copied!');
    setTimeout(() => setCopyAttachSuccess(''), 2000);
  };

  const handleCreateTemplate = async () => {
    setCreateError(null);
    setCreateResult(null);
    if (!projectId || projectId.startsWith('[')) {
      setCreateError('Set a Project ID before creating a template.');
      return;
    }
    if (!policyName.trim()) {
      setCreateError('Template ID is required.');
      return;
    }
    setIsCreating(true);
    try {
      const created = await api.createModelArmorTemplate(projectId, 'global', policyName.trim(), generatedJson);
      const createdName = (created as { name?: string } | null)?.name;
      setCreateResult(
        createdName
          ? `Created ${createdName}.`
          : 'The API accepted the request but returned no template name. Use "Refresh List" above to confirm it exists.'
      );
      onRefresh();
    } catch (err) {
      setCreateError(toErrorMessage(err, 'Failed to create the Model Armor template.'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleAttach = async () => {
    setAttachError(null);
    setAttachResult(null);
    if (!selectedEngine) {
      setAttachError('Select a target app first.');
      return;
    }
    if (!targetAssistant) {
      setAttachError(
        selectedEngine.status === 'unknown'
          ? `Cannot attach: this app's assistant configuration could not be read${
              selectedEngine.error ? ` (${selectedEngine.error})` : ''
            }. Use the command below instead.`
          : 'Cannot attach: this app reports no assistants, so there is nothing to attach the template to. Use the command below instead.'
      );
      return;
    }
    setIsAttaching(true);
    try {
      const nextPolicy: Record<string, unknown> = { ...targetAssistant.customerPolicy };
      nextPolicy.modelArmorConfig = buildModelArmorConfig(
        (targetAssistant.customerPolicy.modelArmorConfig as Record<string, unknown>) ?? {}
      );

      const updated = await api.updateAssistant(
        targetAssistant.name,
        { customerPolicy: nextPolicy },
        ['customerPolicy'],
        {
          projectId,
          appLocation: selectedEngine.location,
          collectionId: 'default_collection',
          appId: selectedEngine.engineId,
          assistantId: targetAssistant.assistantId,
        }
      );

      const armor = readArmorConfig(updated);
      const wantsInput = policyType === 'input' || policyType === 'both';
      const wantsOutput = policyType === 'output' || policyType === 'both';
      const inputOk = !wantsInput || armor.userPromptTemplate === templateResourceName;
      const outputOk = !wantsOutput || armor.responseTemplate === templateResourceName;

      if (inputOk && outputOk) {
        setAttachResult(
          `Verified from the API response: ${targetAssistant.assistantId} on ${selectedEngine.displayName} now reports this template (failure mode: ${
            armor.failureMode || DEFAULT_FAILURE_MODE
          }).`
        );
      } else {
        setAttachError(
          'The API accepted the update but its response does not show this template attached. Treat this app as unprotected and re-check with "Refresh List".'
        );
      }
      onRefresh();
    } catch (err) {
      setAttachError(toErrorMessage(err, 'Failed to attach the template to this app.'));
    } finally {
      setIsAttaching(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-md overflow-hidden">
      <div className="p-6 border-b border-gray-700 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h3 className="text-lg font-bold text-white">Policy Template Generator</h3>
          <p className="text-sm text-gray-400 mt-1">
            Design a Model Armor template to filter harmful content and redact sensitive data.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider mr-2">Presets:</span>
          <button
            onClick={() => applyPreset('bp_input')}
            className="px-2.5 py-1 bg-gray-700 hover:bg-gray-650 text-xs font-semibold rounded text-gray-200 border border-gray-650"
            title="Decoupled input template: Jailbreak protection and PII redaction"
          >
            Best Practice: Input Filter
          </button>
          <button
            onClick={() => applyPreset('bp_output')}
            className="px-2.5 py-1 bg-gray-700 hover:bg-gray-650 text-xs font-semibold rounded text-gray-200 border border-gray-650"
            title="Decoupled output template: Malicious URI and PII redaction"
          >
            Best Practice: Output Filter
          </button>
          <button
            onClick={() => applyPreset('strict')}
            className="px-2.5 py-1 bg-indigo-900/60 hover:bg-indigo-850/60 text-xs font-semibold rounded text-indigo-200 border border-indigo-800"
            title="Strict Hardened: Low threshold safety filters"
          >
            Strict Compliance
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2">
        {/* Left: Configuration Form */}
        <div className="p-6 space-y-6 bg-gray-800">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="ma-template-id" className="block text-sm font-medium text-gray-300 mb-2">Template ID</label>
              <input
                id="ma-template-id"
                aria-label="Template ID"
                type="text"
                value={policyName}
                onChange={(e) => setPolicyName(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white text-sm focus:ring-blue-500"
              />
            </div>

            {engines.length > 0 && (
              <div>
                <label htmlFor="ma-target-app" className="block text-sm font-medium text-gray-300 mb-2">
                  Target App to Attach To
                </label>
                <select
                  id="ma-target-app"
                  aria-label="Target App to Attach To"
                  value={selectedEngineIndex}
                  onChange={(e) => setSelectedEngineIndex(Number(e.target.value))}
                  className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white text-sm focus:ring-blue-500"
                >
                  <option value={-1}>-- Create template only, do not attach --</option>
                  {engines.map((eng, idx) => (
                    <option key={eng.name} value={idx}>
                      {eng.displayName || eng.name.split('/').pop()} ({eng.location})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedEngineIndex >= 0 && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-2">Bind Template As</label>
                <div className="flex gap-6 items-center bg-gray-900/40 p-3 rounded-lg border border-gray-700/60 w-fit">
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-gray-300 hover:text-white select-none">
                    <input
                      type="radio"
                      name="policyType"
                      checked={policyType === 'input'}
                      onChange={() => setPolicyType('input')}
                      className="bg-gray-800 border-gray-600 text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    Input Filter (User Prompt)
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-gray-300 hover:text-white select-none">
                    <input
                      type="radio"
                      name="policyType"
                      checked={policyType === 'output'}
                      onChange={() => setPolicyType('output')}
                      className="bg-gray-800 border-gray-600 text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    Output Filter (Model Response)
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-gray-300 hover:text-white select-none">
                    <input
                      type="radio"
                      name="policyType"
                      checked={policyType === 'both'}
                      onChange={() => setPolicyType('both')}
                      className="bg-gray-800 border-gray-600 text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    Both (Prompt &amp; Response)
                  </label>
                </div>

                <div className="mt-4">
                  <label htmlFor="ma-failure-mode" className="block text-sm font-medium text-gray-300 mb-2">
                    If Model Armor cannot evaluate a request
                  </label>
                  <select
                    id="ma-failure-mode"
                    aria-label="If Model Armor cannot evaluate a request"
                    value={failureMode}
                    onChange={(e) => setFailureMode(e.target.value)}
                    className="w-full md:w-auto bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white text-sm focus:ring-blue-500"
                  >
                    <option value="FAIL_CLOSED">Fail Closed &ndash; reject the request (recommended)</option>
                    <option value="FAIL_OPEN">Fail Open &ndash; let it through unfiltered</option>
                  </select>
                  {failureMode === 'FAIL_CLOSED' ? (
                    <p className="text-xs text-gray-400 mt-2 max-w-prose">
                      During a Model Armor outage this app will reject chat requests and users will see an error instead
                      of an answer. That is the intended tradeoff for a safety filter, and it matches Google&apos;s own
                      default for an unset <code className="text-gray-300">failureMode</code>.
                    </p>
                  ) : (
                    <p className="text-xs text-red-300 mt-2 max-w-prose">
                      <strong>Warning:</strong> during a Model Armor outage this app will pass prompts and responses
                      through with no filtering at all. Chat stays up, your protection does not.
                    </p>
                  )}
                </div>

                {selectedEngine && (
                  <div className="mt-4 text-xs bg-gray-900/40 border border-gray-700/60 rounded-lg p-3 space-y-1">
                    {selectedEngine.status === 'unknown' ? (
                      <p className="text-amber-300">
                        Current protection: <strong>Unknown</strong> &ndash; this app&apos;s assistant configuration
                        could not be read
                        {selectedEngine.error ? ` (${selectedEngine.error})` : ''}.
                      </p>
                    ) : targetAssistant ? (
                      <>
                        <p className="text-gray-400">
                          Will patch assistant{' '}
                          <span className="font-mono text-gray-300">{targetAssistant.assistantId}</span>
                        </p>
                        <p className="text-gray-400">
                          Currently attached &ndash; input:{' '}
                          <span className="font-mono text-gray-300">
                            {targetAssistant.userPromptTemplate.split('/').pop() || 'none'}
                          </span>
                          {', '}output:{' '}
                          <span className="font-mono text-gray-300">
                            {targetAssistant.responseTemplate.split('/').pop() || 'none'}
                          </span>
                          {', '}failure mode:{' '}
                          <span className="font-mono text-gray-300">
                            {targetAssistant.failureMode || `${DEFAULT_FAILURE_MODE} (unset)`}
                          </span>
                        </p>
                      </>
                    ) : (
                      <p className="text-amber-300">
                        This app reports no assistants, so there is nothing here to attach a template to.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Responsible AI Filters</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {['hateSpeech', 'harassment', 'sexuallyExplicit', 'dangerousContent'].map((key) => {
                const filterKey = key as 'hateSpeech' | 'harassment' | 'sexuallyExplicit' | 'dangerousContent';
                const isEnabled = config[filterKey] !== 'OFF';
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between p-3 bg-gray-700/20 rounded-lg border border-gray-700 hover:bg-gray-700/30 transition-colors"
                  >
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={() => toggleRai(filterKey)}
                        className="w-4 h-4 rounded bg-gray-800 border-gray-500 text-blue-500 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-300 capitalize">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                    </label>

                    {isEnabled && (
                      <select
                        aria-label={`${key} Confidence Level`}
                        value={config[filterKey]}
                        onChange={(e) => changeRaiLevel(filterKey, e.target.value)}
                        className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:ring-blue-500"
                      >
                        <option value="LOW_AND_ABOVE">Low & above</option>
                        <option value="MEDIUM_AND_ABOVE">Medium & above</option>
                        <option value="HIGH">High only</option>
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-gray-700">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Data Protection & Security</h4>
            <div className="space-y-3">
              <label className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg border border-gray-700 cursor-pointer hover:bg-gray-700/50">
                <div>
                  <span className="block text-sm font-medium text-white">Sensitive Data Protection (PII)</span>
                  <span className="text-xs text-gray-400">Redact Email & Phone numbers</span>
                </div>
                <input
                  type="checkbox"
                  checked={config.pii}
                  onChange={() => toggle('pii')}
                  className="w-5 h-5 rounded bg-gray-800 border-gray-500 text-blue-500 focus:ring-blue-500"
                />
              </label>
              <label className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg border border-gray-700 cursor-pointer hover:bg-gray-700/50">
                <div>
                  <span className="block text-sm font-medium text-white">Prompt Injection Defense</span>
                  <span className="text-xs text-gray-400">Block jailbreak attempts and system prompt overrides</span>
                </div>
                <input
                  type="checkbox"
                  checked={config.jailbreak}
                  onChange={() => toggle('jailbreak')}
                  className="w-5 h-5 rounded bg-gray-800 border-gray-500 text-blue-500 focus:ring-blue-500"
                />
              </label>
              <label className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg border border-gray-700 cursor-pointer hover:bg-gray-700/50">
                <div>
                  <span className="block text-sm font-medium text-white">Malicious URI Filter</span>
                  <span className="text-xs text-gray-400">Block known malicious URLs</span>
                </div>
                <input
                  type="checkbox"
                  checked={config.maliciousUris}
                  onChange={() => toggle('maliciousUris')}
                  className="w-5 h-5 rounded bg-gray-800 border-gray-500 text-blue-500 focus:ring-blue-500"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Right: Actions + Command Preview Panel */}
        <div className="bg-black p-6 border-l border-gray-700 flex flex-col justify-between overflow-y-auto max-h-[600px] custom-scrollbar">
          <div className="space-y-6">
            <div>
              <div className="flex justify-between items-center mb-3 gap-2">
                <h4 className="text-sm font-semibold text-gray-300">1. Create Safety Template</h4>
                <button
                  type="button"
                  onClick={handleCreateTemplate}
                  disabled={isCreating}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-md transition-colors"
                >
                  {isCreating && (
                    <div className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                  )}
                  {isCreating ? 'Creating…' : 'Create Template'}
                </button>
              </div>

              {createError && (
                <div className="mb-3 p-3 rounded-md bg-red-950/30 border border-red-900/60 text-xs text-red-300">
                  {createError}
                </div>
              )}
              {createResult && (
                <div className="mb-3 p-3 rounded-md bg-green-950/30 border border-green-900/60 text-xs text-green-300">
                  {createResult}
                </div>
              )}

              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-gray-500">Or run it yourself:</span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold rounded border border-gray-700 transition-colors"
                >
                  <CopyIcon />
                  {copySuccess || 'Copy Command'}
                </button>
              </div>
              <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-800 font-mono text-xs text-green-400 leading-relaxed whitespace-pre-wrap break-all">
                {generatedCommand}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Copying this command does not create anything. Paste it into a terminal and run it, or use the Create
                Template button above.
              </p>
            </div>

            {selectedEngine && (
              <div className="pt-6 border-t border-gray-800">
                <div className="flex justify-between items-center mb-3 gap-2">
                  <h4 className="text-sm font-semibold text-gray-300">2. Attach Template to Selected App</h4>
                  <button
                    type="button"
                    onClick={handleAttach}
                    disabled={isAttaching || !targetAssistant}
                    title={
                      targetAssistant
                        ? undefined
                        : 'The target assistant could not be read, so this app cannot be patched from here.'
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-md transition-colors"
                  >
                    {isAttaching && (
                      <div className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                    )}
                    {isAttaching ? 'Attaching…' : 'Attach Now'}
                  </button>
                </div>

                {attachError && (
                  <div className="mb-3 p-3 rounded-md bg-red-950/30 border border-red-900/60 text-xs text-red-300">
                    {attachError}
                  </div>
                )}
                {attachResult && (
                  <div className="mb-3 p-3 rounded-md bg-green-950/30 border border-green-900/60 text-xs text-green-300">
                    {attachResult}
                  </div>
                )}

                <p className="text-xs text-gray-500 mb-3">
                  Attach Now patches <code className="text-gray-400">customerPolicy</code> on the target assistant and
                  then re-reads the response to confirm. It does not create the template &ndash; do step 1 first, or the
                  app will point at a template that does not exist.
                </p>

                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-gray-500">Or run it yourself:</span>
                  <button
                    type="button"
                    onClick={handleCopyAttach}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold rounded border border-gray-700 transition-colors"
                  >
                    <CopyIcon />
                    {copyAttachSuccess || 'Copy Attach Command'}
                  </button>
                </div>
                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-800 font-mono text-xs text-green-400 leading-relaxed whitespace-pre-wrap break-all">
                  {attachCommand}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Copying this command does not attach anything. Paste it into a terminal and run it.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
