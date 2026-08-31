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

import React, { useState, useMemo } from 'react';
import { Agent, Config, UserProfile, SkillScope } from '../../types';
import * as api from '../../services/apiService';
import AddSkillModal from './AddSkillModal';
import SkillDetailModal from './SkillDetailModal';
import ConfirmationModal from '../ConfirmationModal';

interface SkillsViewerProps {
  agents: Agent[];
  config: Config;
  userProfile?: UserProfile | null;
  onRefreshSkills: () => void;
}

export const SkillsViewer: React.FC<SkillsViewerProps> = ({
  agents,
  config,
  userProfile,
  onRefreshSkills,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'ALL' | 'ORGANIZATIONAL' | 'USER_CREATED'>('ALL');
  const [selectedSkill, setSelectedSkill] = useState<Agent | null>(null);
  const [skillToDelete, setSkillToDelete] = useState<Agent | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Classify skills vs standard agents (or treat all skills + subagents cleanly)
  const skillsList = useMemo(() => {
    return agents.filter((agent) => {
      // An agent is a skill if it has skillAgentDefinition OR agentType === 'SKILL' OR starts with skill-
      return (
        agent.skillAgentDefinition !== undefined ||
        agent.agentType === 'SKILL' ||
        agent.name.includes('/skills/') ||
        agent.displayName.toLowerCase().includes('skill')
      );
    });
  }, [agents]);

  // Statistics
  const totalCount = skillsList.length;
  const orgCount = skillsList.filter((s) => s.state === 'ENABLED' || !s.skillAgentDefinition?.owner).length;
  const userCount = totalCount - orgCount;

  // Filtered skills based on scope and search
  const filteredSkills = useMemo(() => {
    return skillsList.filter((skill) => {
      const isOrg = skill.state === 'ENABLED' || !skill.skillAgentDefinition?.owner;
      if (scopeFilter === 'ORGANIZATIONAL' && !isOrg) return false;
      if (scopeFilter === 'USER_CREATED' && isOrg) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const name = (skill.displayName || '').toLowerCase();
      const desc = (skill.description || '').toLowerCase();
      const id = (skill.name || '').toLowerCase();
      const inst = (skill.skillAgentDefinition?.instruction || '').toLowerCase();
      return name.includes(q) || desc.includes(q) || id.includes(q) || inst.includes(q);
    });
  }, [skillsList, scopeFilter, searchQuery]);

  const handleDeleteConfirm = async () => {
    if (!skillToDelete) return;
    setIsDeleting(true);
    try {
      await api.deleteSkillAgent(skillToDelete.name, config);
      setSkillToDelete(null);
      onRefreshSkills();
    } catch (err) {
      console.error('Failed to delete skill:', err);
      alert('Failed to delete skill. Please verify permissions.');
    } finally {
      setIsDeleting(false);
    }
  };

  const getSourceBadge = (skill: Agent) => {
    const def = skill.skillAgentDefinition;
    if (def?.agentRegistrySkill) {
      return (
        <span className="px-2 py-0.5 text-[11px] font-semibold bg-blue-900/40 text-blue-300 rounded border border-blue-700 font-mono">
          Agent Registry
        </span>
      );
    }
    if (def?.gcsUri || def?.importUri) {
      return (
        <span className="px-2 py-0.5 text-[11px] font-semibold bg-indigo-900/40 text-indigo-300 rounded border border-indigo-700 font-mono">
          Cloud Storage
        </span>
      );
    }
    if (def?.geminiEnterpriseSkillConfig?.dataConnectorSkillConfig) {
      return (
        <span className="px-2 py-0.5 text-[11px] font-semibold bg-purple-900/40 text-purple-300 rounded border border-purple-700 font-mono">
          1P Connector
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 text-[11px] font-semibold bg-gray-800 text-gray-300 rounded border border-gray-700">
        Custom Prompt
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Overview & Information Card */}
      <div className="bg-gray-800 rounded-lg p-5 border border-gray-700 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-blue-900/40 text-blue-400 border border-blue-700/50 rounded-lg shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-100 flex items-center gap-2">
                Gemini Enterprise Skills
                <span className="px-2 py-0.5 text-xs font-semibold bg-blue-900/60 text-blue-300 rounded border border-blue-700">
                  AgentService
                </span>
              </h3>
              <p className="text-sm text-gray-400 mt-1">
                Manage organization-wide capabilities and private user-created skills attached to this Gemini Enterprise assistant.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end md:self-center">
            <button
              onClick={onRefreshSkills}
              className="p-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
              title="Refresh Skills"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Add / Import Skill</span>
            </button>
          </div>
        </div>

        {/* Metric Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5 pt-4 border-t border-gray-700/60">
          <div className="p-3 bg-gray-900/60 rounded-lg border border-gray-700/50 flex items-center justify-between">
            <span className="text-xs text-gray-400 font-medium">Total Registered Skills</span>
            <span className="text-base font-bold text-white">{totalCount}</span>
          </div>
          <div className="p-3 bg-gray-900/60 rounded-lg border border-gray-700/50 flex items-center justify-between">
            <span className="text-xs text-blue-400 font-medium flex items-center gap-1.5">
              🏢 Organization-wide
            </span>
            <span className="text-base font-bold text-blue-300">{orgCount}</span>
          </div>
          <div className="p-3 bg-gray-900/60 rounded-lg border border-gray-700/50 flex items-center justify-between">
            <span className="text-xs text-purple-400 font-medium flex items-center gap-1.5">
              👤 User-Created (Personal)
            </span>
            <span className="text-base font-bold text-purple-300">{userCount}</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-gray-800 rounded-lg p-3.5 border border-gray-700 flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Scope Tabs */}
        <div className="flex items-center bg-gray-900/80 p-1 rounded-lg border border-gray-700/60 w-full md:w-auto">
          <button
            onClick={() => setScopeFilter('ALL')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              scopeFilter === 'ALL'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            All ({totalCount})
          </button>
          <button
            onClick={() => setScopeFilter('ORGANIZATIONAL')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 ${
              scopeFilter === 'ORGANIZATIONAL'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <span>🏢 Org-wide ({orgCount})</span>
          </button>
          <button
            onClick={() => setScopeFilter('USER_CREATED')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 ${
              scopeFilter === 'USER_CREATED'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <span>👤 User-Created ({userCount})</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-72">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search skills by name, description..."
            className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 absolute left-3 top-2 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Skills Table */}
      {filteredSkills.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-10 border border-gray-700 text-center space-y-3">
          <div className="inline-flex p-3 bg-gray-900 text-gray-500 rounded-full border border-gray-700">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h4 className="text-sm font-bold text-gray-200">No Skills Found</h4>
          <p className="text-xs text-gray-400 max-w-md mx-auto leading-relaxed">
            {searchQuery
              ? 'No skills matched your search query. Try clearing filters.'
              : 'Enhance this assistant by adding custom execution prompts, connecting centralized Agent Registry skills, or importing Cloud Storage skill packages.'}
          </p>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors shadow"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Your First Skill
          </button>
        </div>
      ) : (
        <div className="bg-gray-800 shadow-xl rounded-lg overflow-hidden border border-gray-700">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-700 text-left">
              <thead className="bg-gray-900/60 text-gray-400 text-[11px] uppercase tracking-wider font-semibold">
                <tr>
                  <th scope="col" className="px-6 py-3.5">Skill Name & ID</th>
                  <th scope="col" className="px-6 py-3.5">Scope</th>
                  <th scope="col" className="px-6 py-3.5">Status</th>
                  <th scope="col" className="px-6 py-3.5">Source Type</th>
                  <th scope="col" className="px-6 py-3.5">Description</th>
                  <th scope="col" className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/60 bg-gray-800 text-xs">
                {filteredSkills.map((skill) => {
                  const skillId = skill.name.split('/').pop() || '';
                  const isOrg = skill.state === 'ENABLED' || !skill.skillAgentDefinition?.owner;
                  const ownerEmail = skill.skillAgentDefinition?.owner
                    ? skill.skillAgentDefinition.owner.replace('principal://iam.googleapis.com/users/', '')
                    : null;

                  return (
                    <tr key={skill.name} className="hover:bg-gray-750/50 transition-colors">
                      {/* Name & ID */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-semibold text-gray-100">{skill.displayName}</div>
                        <div className="text-[11px] text-gray-500 font-mono mt-0.5">{skillId}</div>
                      </td>

                      {/* Scope Badge */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isOrg ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-900/40 text-blue-300 border border-blue-700/60">
                            <span>🏢 Organization</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-purple-900/40 text-purple-300 border border-purple-700/60" title={ownerEmail || undefined}>
                            <span>👤 User-Created</span>
                          </div>
                        )}
                        {ownerEmail && !isOrg && (
                          <div className="text-[10px] text-gray-400 mt-1 truncate max-w-[150px]" title={ownerEmail}>
                            {ownerEmail}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border ${
                            skill.state === 'ENABLED'
                              ? 'bg-green-900/40 text-green-300 border-green-700'
                              : skill.state === 'DISABLED'
                              ? 'bg-red-900/40 text-red-300 border-red-700'
                              : 'bg-yellow-900/40 text-yellow-300 border-yellow-700'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              skill.state === 'ENABLED'
                                ? 'bg-green-400'
                                : skill.state === 'DISABLED'
                                ? 'bg-red-400'
                                : 'bg-yellow-400'
                            }`}
                          />
                          {skill.state || 'Private'}
                        </span>
                      </td>

                      {/* Source Type */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getSourceBadge(skill)}
                      </td>

                      {/* Description */}
                      <td className="px-6 py-4 text-gray-300 max-w-xs truncate">
                        {skill.description || (
                          <span className="text-gray-500 italic">No description provided</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 whitespace-nowrap text-right font-medium">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setSelectedSkill(skill)}
                            className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 rounded transition-colors"
                            title="Inspect Skill & Instructions"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setSkillToDelete(skill)}
                            className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors"
                            title="Delete Skill"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Import Skill Modal */}
      {isAddModalOpen && (
        <AddSkillModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          config={config}
          userProfile={userProfile}
          onSkillCreated={onRefreshSkills}
        />
      )}

      {/* Skill Detail Modal */}
      {selectedSkill && (
        <SkillDetailModal
          skill={selectedSkill}
          isOpen={!!selectedSkill}
          onClose={() => setSelectedSkill(null)}
          config={config}
          onSkillUpdated={onRefreshSkills}
        />
      )}

      {/* Confirmation Modal for Deletion */}
      <ConfirmationModal
        isOpen={!!skillToDelete}
        onClose={() => setSkillToDelete(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Skill"
        confirmText="Delete Skill"
        isConfirming={isDeleting}
      >
        {skillToDelete && (
          <div className="space-y-2 text-sm text-gray-300">
            <p>
              Are you sure you want to delete the skill <strong className="text-white">{skillToDelete.displayName}</strong>?
            </p>
            <p className="text-xs text-gray-400">
              This will remove the skill agent definition and its capabilities from this assistant.
            </p>
          </div>
        )}
      </ConfirmationModal>
    </div>
  );
};

export default SkillsViewer;
