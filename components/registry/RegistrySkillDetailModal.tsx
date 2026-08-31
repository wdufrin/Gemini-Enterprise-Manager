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

import React, { useState, useEffect } from 'react';
import { Config, RegistrySkill, RegistrySkillRevision } from '../../types';
import * as api from '../../services/apiService';
import { createZipBase64 } from '../../utils/zipUtils';

interface RegistrySkillDetailModalProps {
  skill: RegistrySkill | null;
  isOpen: boolean;
  onClose: () => void;
  config: Config;
  onSkillUpdated: () => void;
}

const RegistrySkillDetailModal: React.FC<RegistrySkillDetailModalProps> = ({
  skill,
  isOpen,
  onClose,
  config,
  onSkillUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'revisions' | 'json'>('overview');
  const [revisions, setRevisions] = useState<RegistrySkillRevision[]>([]);
  const [isLoadingRevisions, setIsLoadingRevisions] = useState(false);
  const [availableEngines, setAvailableEngines] = useState<any[]>([]);
  const [selectedEngineId, setSelectedEngineId] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [deploySuccess, setDeploySuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && skill) {
      setIsLoadingRevisions(true);
      api.listRegistrySkillRevisions(skill.name, config)
        .then((revs) => setRevisions(revs))
        .catch((err) => console.warn('Could not load revisions for skill:', err))
        .finally(() => setIsLoadingRevisions(false));

      api.listResources('engines', config)
        .then((res: any) => {
          const list = res.engines || res.resources || [];
          setAvailableEngines(list);
          if (list.length > 0) {
            const pref = list.find((e: any) => e.solutionType === 'SOLUTION_TYPE_CHAT' || e.name?.includes('cosmere')) || list[0];
            const id = pref.name ? pref.name.split('/').pop() : pref.id;
            setSelectedEngineId(id);
          }
        })
        .catch((err) => console.warn('Could not fetch engines for skill deploy:', err));
    }
  }, [isOpen, skill, config]);

  if (!isOpen || !skill) return null;

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(skill, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeployToGeEngine = async () => {
    setIsUpdating(true);
    setDeploySuccess(false);
    try {
      const rawId = skill.name.split('/').pop() || 'skill';
      const cleanId = rawId.replace(/^private-/, '');
      // Discovery Engine requires agentId to match ^[a-z0-9][a-z0-9-_]*$ (no dots or special characters)
      const sanitizedAgentId = cleanId
        .replace(/^(discoveryengine\.googleapis\.com|cloud\.google\.com)-?/, '')
        .replace(/[^a-z0-9-_]/gi, '-')
        .toLowerCase()
        .replace(/^-+|-+$/g, '') || 'skill';

      const payload: any = {
        displayName: skill.displayName || sanitizedAgentId,
        description: skill.description || skill.displayName,
        state: 'ENABLED',
        sharingConfig: {
          scope: 'ALL_USERS',
        },
        skillAgentDefinition: {
          instruction: skill.description || skill.displayName,
        },
      };

      let targetConfig = { ...config };
      if (selectedEngineId) {
        targetConfig.appId = selectedEngineId;
      } else if (!targetConfig.appId || targetConfig.appId === 'default_engine') {
        const enginesRes = await api.listResources('engines', config);
        const engines = (enginesRes as any)?.engines || (enginesRes as any)?.resources || [];
        if (engines.length === 0) {
          throw new Error(`No engines found in project ${config.projectId} (${config.appLocation}). Please ensure an engine exists in this region.`);
        }
        const targetEngine = engines.find((e: any) => e.solutionType === 'SOLUTION_TYPE_CHAT' || e.name?.includes('cosmere')) || engines[0];
        const engineId = targetEngine.name ? targetEngine.name.split('/').pop() : targetEngine.id;
        targetConfig.appId = engineId;
      }

      try {
        await api.createAgent(payload, targetConfig, sanitizedAgentId, true);
      } catch (createErr: any) {
        if (createErr.message?.includes('already exists') || createErr.status === 409) {
          const agentResourceName = `projects/${targetConfig.projectId}/locations/${targetConfig.appLocation}/collections/${targetConfig.collectionId || 'default_collection'}/engines/${targetConfig.appId}/assistants/${targetConfig.assistantId || 'default_assistant'}/agents/${sanitizedAgentId}`;
          await api.updateAgent({ name: agentResourceName, id: sanitizedAgentId } as any, payload, targetConfig);
        } else {
          throw createErr;
        }
      }

      setDeploySuccess(true);
      setTimeout(() => setDeploySuccess(false), 3500);
      onSkillUpdated();
    } catch (err: any) {
      console.error('Failed to deploy skill to GE engine assistant:', err);
      alert(`Failed to deploy skill: ${err.message || 'Unknown error'}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateTargetState = async (newState: string) => {
    setIsUpdating(true);
    try {
      let defaultRev = skill.defaultRevision;

      if (newState === 'TARGET_STATE_ACTIVE') {
        let revs = revisions.length > 0 ? revisions : await api.listRegistrySkillRevisions(skill.name, config);
        
        // If the skill has no revisions at all, create an initial revision from its metadata
        if (!revs || revs.length === 0) {
          const rawId = skill.name.split('/').pop() || 'skill';
          const cleanId = rawId.replace(/^private-/, '');
          const b64Zip = createZipBase64({
            'SKILL.md': `---
name: ${cleanId}
description: ${skill.description || skill.displayName}
---

# ${skill.displayName}

${skill.description || 'Enterprise Skill for Gemini Enterprise.'}`,
          });

          await api.createRegistrySkillRevision(
            skill.name,
            {
              archiveUploadSource: {
                archiveContent: b64Zip,
              },
            },
            config
          );
        }

        // Poll until skill is ready and revision is ACTIVE
        for (let i = 0; i < 10; i++) {
          await new Promise((r) => setTimeout(r, 2500));
          try {
            const currentSkill = await api.getRegistrySkill(skill.name, config);
            revs = await api.listRegistrySkillRevisions(skill.name, config);
            const isReady = currentSkill.state !== 'STATE_CREATING';
            const activeRev = revs.find((r) => r.state === 'ACTIVE') || revs[0];

            if (isReady && activeRev) {
              defaultRev = activeRev.name;
              break;
            }
          } catch (pollErr) {
            console.warn('Waiting for skill revision compilation...', pollErr);
          }
        }

        if (revs && revs.length > 0 && !defaultRev) {
          defaultRev = revs[0].name;
        }
      }

      const payload: Partial<RegistrySkill> = { targetState: newState };
      const updateMask = ['target_state'];

      if (defaultRev && newState === 'TARGET_STATE_ACTIVE') {
        payload.defaultRevision = defaultRev;
        updateMask.push('default_revision');
      }

      await api.updateRegistrySkill(
        skill.name,
        payload,
        updateMask,
        config
      );
      onSkillUpdated();
    } catch (err: any) {
      console.error('Failed to update skill state:', err);
      alert(`Failed to update state: ${err.message || 'Unknown error'}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteSkill = async () => {
    if (!window.confirm(`Are you sure you want to delete "${skill.displayName}" from Google Cloud Agent Registry? This will remove it from the organization catalog.`)) {
      return;
    }
    setIsUpdating(true);
    try {
      await api.deleteRegistrySkill(skill.name, config);
      onSkillUpdated();
      onClose();
    } catch (err: any) {
      console.error('Failed to delete skill:', err);
      alert(`Failed to delete skill: ${err.message || 'Unknown error'}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const skillId = skill.name.split('/').pop() || '';
  const publisher = skill.publisher ? skill.publisher.split('/').pop() : 'Default';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 flex items-center justify-center p-4">
      <div className="bg-gray-850 rounded-xl max-w-3xl w-full border border-gray-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gray-900 border-b border-gray-700 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-900/40 text-purple-400 border border-purple-700/50 rounded-lg">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-gray-100">{skill.displayName}</h3>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${
                  skill.state === 'STATE_ACTIVE'
                    ? 'bg-green-900/40 text-green-300 border-green-700'
                    : skill.state === 'STATE_DRAFT'
                    ? 'bg-yellow-900/40 text-yellow-300 border-yellow-700'
                    : 'bg-gray-800 text-gray-400 border-gray-700'
                }`}>
                  {skill.state || 'STATE_ACTIVE'}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 font-mono mt-0.5">{skill.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-700 bg-gray-900/40 px-6">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            Overview & Specification
          </button>
          <button
            onClick={() => setActiveTab('revisions')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'revisions'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            Revisions ({revisions.length})
          </button>
          <button
            onClick={() => setActiveTab('json')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'json'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            Raw JSON Spec
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Metadata Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 bg-gray-900/60 rounded-lg border border-gray-700/60">
                  <div className="text-[11px] text-gray-400 font-medium">Logical Skill URN</div>
                  <div className="text-xs text-blue-300 font-mono font-semibold mt-0.5 break-all">
                    {skill.skillId || `urn:skill:${publisher}:${skillId}`}
                  </div>
                </div>
                <div className="p-3 bg-gray-900/60 rounded-lg border border-gray-700/60">
                  <div className="text-[11px] text-gray-400 font-medium">Publisher / Domain</div>
                  <div className="text-xs text-purple-300 font-semibold mt-0.5">
                    {publisher}
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Semantic Activation Trigger & Description
                </label>
                <div className="p-3 bg-gray-900 rounded-lg border border-gray-700 text-xs text-gray-200 leading-relaxed">
                  {skill.description || 'No description provided.'}
                </div>
              </div>

              {/* Default Revision Info */}
              {skill.defaultRevision && (
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Serving Default Revision
                  </label>
                  <div className="p-3 bg-gray-900 rounded-lg border border-gray-700 font-mono text-[11px] text-gray-300 break-all">
                    {skill.defaultRevision}
                  </div>
                </div>
              )}

              {/* Frontmatter if available */}
              {skill.frontmatter && (
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Extracted Frontmatter
                  </label>
                  <pre className="p-3 bg-gray-900 rounded-lg border border-gray-700 font-mono text-[11px] text-gray-300 overflow-x-auto">
                    {JSON.stringify(skill.frontmatter, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {activeTab === 'revisions' && (
            <div className="space-y-3">
              {isLoadingRevisions ? (
                <div className="text-center py-8 text-xs text-gray-400">Loading revisions...</div>
              ) : revisions.length === 0 ? (
                <div className="text-center py-8 text-xs text-gray-400">No revisions recorded for this skill.</div>
              ) : (
                revisions.map((rev) => (
                  <div key={rev.name} className="p-3.5 bg-gray-900 rounded-lg border border-gray-700/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-100 font-mono">
                        {rev.name.split('/').pop()}
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-semibold bg-blue-900/40 text-blue-300 rounded border border-blue-700">
                        {rev.state || 'ACTIVE'}
                      </span>
                    </div>
                    {rev.sha256Hash && (
                      <div className="text-[10px] text-gray-500 font-mono truncate">
                        SHA256: {rev.sha256Hash}
                      </div>
                    )}
                    {rev.createTime && (
                      <div className="text-[10px] text-gray-400">
                        Created: {new Date(rev.createTime).toLocaleString()}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'json' && (
            <div className="relative">
              <button
                onClick={handleCopyJson}
                className="absolute top-2 right-2 px-2.5 py-1 bg-gray-750 hover:bg-gray-700 text-gray-300 hover:text-white rounded text-xs font-semibold transition-colors border border-gray-600"
              >
                {copied ? '✓ Copied' : 'Copy JSON'}
              </button>
              <pre className="p-4 bg-gray-900 rounded-lg border border-gray-700 font-mono text-[11px] text-gray-300 overflow-x-auto max-h-96">
                {JSON.stringify(skill, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-gray-900 border-t border-gray-700 flex justify-between items-center">
          <button
            onClick={handleDeleteSkill}
            disabled={isUpdating}
            className="px-3.5 py-2 text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete Skill
          </button>

          <div className="flex items-center gap-2">
            {availableEngines.length > 0 && (
              <div className="flex items-center bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 max-w-[210px]" title="Target Gemini Enterprise App">
                <span className="text-[11px] text-gray-400 font-semibold mr-1.5 shrink-0">App:</span>
                <select
                  value={selectedEngineId}
                  onChange={(e) => setSelectedEngineId(e.target.value)}
                  className="bg-transparent text-xs text-blue-300 font-bold focus:outline-none cursor-pointer truncate max-w-[150px]"
                >
                  {availableEngines.map((eng: any) => {
                    const id = eng.name ? eng.name.split('/').pop() : eng.id;
                    const label = eng.displayName || id;
                    return (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            <button
              onClick={handleDeployToGeEngine}
              disabled={isUpdating}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors shadow flex items-center gap-1.5 shrink-0"
              title="Deploys this skill into the selected Gemini Enterprise App so it appears for all company users"
            >
              <span>{deploySuccess ? '✓ Deployed to GE App!' : '🚀 Deploy to GE App'}</span>
            </button>

            {skill.state !== 'STATE_ACTIVE' ? (
              <button
                onClick={() => handleUpdateTargetState('TARGET_STATE_ACTIVE')}
                disabled={isUpdating}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-lg transition-colors shadow flex items-center gap-1.5"
              >
                <span>🟢 Activate in Company Catalog</span>
              </button>
            ) : (
              <button
                onClick={() => handleUpdateTargetState('TARGET_STATE_DISABLED')}
                disabled={isUpdating}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white text-xs font-bold rounded-lg transition-colors shadow flex items-center gap-1.5"
              >
                <span>🟡 Disable in Company Catalog</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegistrySkillDetailModal;
