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

import React, { useState } from 'react';
import { Agent, Config, SkillScope } from '../../types';
import * as api from '../../services/apiService';

interface SkillDetailModalProps {
  skill: Agent | null;
  isOpen: boolean;
  onClose: () => void;
  config: Config;
  onSkillUpdated: () => void;
}

export const SkillDetailModal: React.FC<SkillDetailModalProps> = ({
  skill,
  isOpen,
  onClose,
  config,
  onSkillUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'instructions' | 'config' | 'raw'>('instructions');
  const [copied, setCopied] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  if (!isOpen || !skill) return null;

  const skillDef = skill.skillAgentDefinition || {};
  const isOrg = skill.state === 'ENABLED';
  const owner = skillDef.owner || 'System / Default';

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(skill, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleScope = async () => {
    setIsUpdating(true);
    try {
      if (skill.state === 'ENABLED' && (skill.sharingConfig?.scope === 'ALL_USERS' || !skill.sharingConfig)) {
        await api.demoteSkillToPersonal(skill, config);
      } else {
        await api.promoteSkillToOrg(skill, config);
      }
      onSkillUpdated();
    } catch (err) {
      console.error('Failed to toggle skill scope:', err);
      alert('Failed to update skill scope.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleToggleActiveState = async () => {
    setIsUpdating(true);
    try {
      const newState = skill.state === 'DISABLED' ? 'ENABLED' : 'DISABLED';
      await api.updateAgent(skill, { state: newState }, config);
      onSkillUpdated();
    } catch (err) {
      console.error('Failed to toggle active state:', err);
      alert('Failed to update skill state.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 flex items-center justify-center p-4">
      <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col animate-fade-in-up">
        {/* Modal Header */}
        <div className="p-5 border-b border-gray-700 flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-blue-900/40 text-blue-400 border border-blue-700/50 rounded-lg shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-gray-100">{skill.displayName}</h2>
                {isOrg ? (
                  <span className="px-2 py-0.5 text-xs font-semibold bg-blue-900/60 text-blue-300 rounded border border-blue-700 flex items-center gap-1">
                    🏢 Organization-wide
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-xs font-semibold bg-purple-900/60 text-purple-300 rounded border border-purple-700 flex items-center gap-1">
                    👤 User-Created (Personal)
                  </span>
                )}
                <span
                  className={`px-2 py-0.5 text-xs font-semibold rounded border ${
                    skill.state === 'ENABLED'
                      ? 'bg-green-900/60 text-green-300 border-green-700'
                      : skill.state === 'DISABLED'
                      ? 'bg-red-900/60 text-red-300 border-red-700'
                      : 'bg-yellow-900/60 text-yellow-300 border-yellow-700'
                  }`}
                >
                  {skill.state || 'Private'}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1 font-mono">{skill.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-gray-700 bg-gray-900/40 px-5 pt-3 gap-3">
          <button
            onClick={() => setActiveTab('instructions')}
            className={`pb-2.5 px-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'instructions'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            Instructions (`SKILL.md`)
          </button>
          <button
            onClick={() => setActiveTab('config')}
            className={`pb-2.5 px-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'config'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            Metadata & Tools
          </button>
          <button
            onClick={() => setActiveTab('raw')}
            className={`pb-2.5 px-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'raw'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            Raw JSON Spec
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {activeTab === 'instructions' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Skill Execution Guidelines & Prompt
                </span>
                <span className="text-[11px] text-gray-500 font-mono">
                  {skillDef.instruction ? `${skillDef.instruction.length} characters` : 'No inline prompt'}
                </span>
              </div>
              <div className="p-4 bg-gray-900 border border-gray-700 rounded-lg text-xs font-mono text-gray-200 whitespace-pre-wrap leading-relaxed max-h-[350px] overflow-y-auto">
                {skillDef.instruction || (
                  <span className="text-gray-500 italic">
                    This skill utilizes an external registry package, Cloud Storage files, or first-party connector binaries.
                  </span>
                )}
              </div>
            </div>
          )}

          {activeTab === 'config' && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3.5 bg-gray-900/60 border border-gray-700 rounded-lg space-y-1.5">
                  <span className="text-gray-500 font-semibold block">Owner / Principal</span>
                  <span className="text-gray-200 font-mono break-all">{owner}</span>
                </div>
                <div className="p-3.5 bg-gray-900/60 border border-gray-700 rounded-lg space-y-1.5">
                  <span className="text-gray-500 font-semibold block">Current State</span>
                  <span className="text-gray-200 font-semibold">{skill.state || 'PRIVATE'}</span>
                </div>
              </div>

              {skillDef.agentRegistrySkill && (
                <div className="p-3.5 bg-gray-900/60 border border-gray-700 rounded-lg space-y-1.5">
                  <span className="text-blue-400 font-semibold block">Agent Registry Source</span>
                  <span className="text-gray-200 font-mono break-all">{skillDef.agentRegistrySkill}</span>
                </div>
              )}

              {skillDef.gcsUri && (
                <div className="p-3.5 bg-gray-900/60 border border-gray-700 rounded-lg space-y-1.5">
                  <span className="text-blue-400 font-semibold block">Cloud Storage Package URI</span>
                  <span className="text-gray-200 font-mono break-all">{skillDef.gcsUri}</span>
                </div>
              )}

              {skillDef.geminiEnterpriseSkillConfig?.dataConnectorSkillConfig && (
                <div className="p-3.5 bg-gray-900/60 border border-gray-700 rounded-lg space-y-2">
                  <span className="text-purple-400 font-semibold block">1P Data Connector Config</span>
                  <div className="text-gray-300">
                    <span className="text-gray-500">Skill Key: </span>
                    <span className="font-mono">{skillDef.geminiEnterpriseSkillConfig.dataConnectorSkillConfig.skillKey || 'N/A'}</span>
                  </div>
                  {skillDef.geminiEnterpriseSkillConfig.dataConnectorSkillConfig.dependentDataConnectorSourceOptions && (
                    <div>
                      <span className="text-gray-500 block mb-1">Dependent Connectors:</span>
                      <div className="flex flex-wrap gap-1">
                        {skillDef.geminiEnterpriseSkillConfig.dataConnectorSkillConfig.dependentDataConnectorSourceOptions.map((opt) => (
                          <span key={opt} className="px-2 py-0.5 bg-purple-900/40 text-purple-300 rounded border border-purple-700 font-mono text-[10px]">
                            {opt}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {skill.description && (
                <div className="p-3.5 bg-gray-900/60 border border-gray-700 rounded-lg space-y-1.5">
                  <span className="text-gray-500 font-semibold block">Description</span>
                  <p className="text-gray-200">{skill.description}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'raw' && (
            <div className="space-y-2">
              <div className="flex justify-end">
                <button
                  onClick={handleCopyJson}
                  className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-medium rounded flex items-center gap-1.5 transition-colors"
                >
                  {copied ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span>Copy JSON</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-4 bg-gray-900 border border-gray-700 rounded-lg text-xs font-mono text-gray-200 overflow-x-auto max-h-[350px]">
                {JSON.stringify(skill, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Modal Footer with Actions */}
        <div className="p-4 border-t border-gray-700 bg-gray-900/50 flex items-center justify-between gap-3 rounded-b-xl">
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleScope}
              disabled={isUpdating}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 ${
                isOrg
                  ? 'bg-purple-900/40 text-purple-300 border-purple-700 hover:bg-purple-900/60'
                  : 'bg-blue-900/40 text-blue-300 border-blue-700 hover:bg-blue-900/60'
              }`}
            >
              {isOrg ? '🔄 Convert to User-Created (Private)' : '🚀 Promote to Organization-wide'}
            </button>
            <button
              onClick={handleToggleActiveState}
              disabled={isUpdating}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                skill.state === 'DISABLED'
                  ? 'bg-green-900/40 text-green-300 border-green-700 hover:bg-green-900/60'
                  : 'bg-yellow-900/40 text-yellow-300 border-yellow-700 hover:bg-yellow-900/60'
              }`}
            >
              {skill.state === 'DISABLED' ? 'Enable Skill' : 'Disable Skill'}
            </button>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default SkillDetailModal;
