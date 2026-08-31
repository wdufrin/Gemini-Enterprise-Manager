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

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Config, Page, RegistrySkill, UserProfile } from '../types';
import * as api from '../services/apiService';
import PublishSkillModal from '../components/registry/PublishSkillModal';
import RegistrySkillDetailModal from '../components/registry/RegistrySkillDetailModal';
import CurlInfoModal from '../components/CurlInfoModal';

interface SkillsRegistryPageProps {
  projectNumber: string;
  projectId?: string;
  setProjectNumber: (projectNumber: string) => void;
  accessToken: string;
  userProfile: UserProfile | null;
}

const SkillsRegistryPage: React.FC<SkillsRegistryPageProps> = ({
  projectId = '',
  accessToken,
  userProfile,
}) => {
  const [selectedLocation, setSelectedLocation] = useState<string>('global');
  const [skills, setSkills] = useState<RegistrySkill[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isCurlModalOpen, setIsCurlModalOpen] = useState<boolean>(false);
  const [selectedPublisher, setSelectedPublisher] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  
  const [isPublishModalOpen, setIsPublishModalOpen] = useState<boolean>(false);
  const [inspectingSkill, setInspectingSkill] = useState<RegistrySkill | null>(null);

  const currentConfig: Config = useMemo(() => ({
    projectId: projectId || 'ancient-sandbox-322523',
    appLocation: selectedLocation,
    collectionId: 'default_collection',
    appId: 'default_engine',
    assistantId: 'default_assistant',
  }), [projectId, selectedLocation]);

  const fetchSkills = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.listRegistrySkills(currentConfig);
      setSkills(result);
    } catch (err: any) {
      console.error('Failed to list Agent Registry skills:', err);
      setError(err.message || 'Failed to fetch enterprise skills from Google Cloud Agent Registry.');
    } finally {
      setIsLoading(false);
    }
  }, [currentConfig]);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  // Extract unique publishers
  const publishers = useMemo(() => {
    const pubSet = new Set<string>();
    skills.forEach((s) => {
      if (s.publisher) {
        pubSet.add(s.publisher.split('/').pop() || s.publisher);
      }
    });
    return Array.from(pubSet);
  }, [skills]);

  // Statistics
  const totalCount = skills.length;
  const activeCount = skills.filter((s) => s.state === 'STATE_ACTIVE').length;
  const draftCount = totalCount - activeCount;
  const publisherCount = publishers.length;

  // Filtered skills
  const filteredSkills = useMemo(() => {
    return skills.filter((skill) => {
      // Publisher filter
      if (selectedPublisher !== 'ALL') {
        const pub = skill.publisher ? skill.publisher.split('/').pop() : '';
        if (pub !== selectedPublisher) return false;
      }

      // Status filter
      if (selectedStatus === 'ACTIVE' && skill.state !== 'STATE_ACTIVE') return false;
      if (selectedStatus === 'DRAFT' && skill.state === 'STATE_ACTIVE') return false;

      // Search query
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const name = (skill.displayName || '').toLowerCase();
      const id = (skill.name || '').toLowerCase();
      const urn = (skill.skillId || '').toLowerCase();
      const desc = (skill.description || '').toLowerCase();
      return name.includes(q) || id.includes(q) || urn.includes(q) || desc.includes(q);
    });
  }, [skills, selectedPublisher, selectedStatus, searchQuery]);

  return (
    <div className="space-y-6 animate-fade-in p-6">
      {/* Header Banner */}
      <div className="bg-gray-800 rounded-lg p-5 border border-gray-700 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-3 bg-purple-900/40 text-purple-400 border border-purple-700/50 rounded-xl shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-gray-100">Enterprise Skills Registry</h2>
                <span className="px-2 py-0.5 text-xs font-semibold bg-purple-900/60 text-purple-300 rounded border border-purple-700 font-mono">
                  agentregistry.googleapis.com
                </span>
              </div>
              <p className="text-sm text-gray-400 mt-1 max-w-3xl leading-relaxed">
                Central organization-wide catalog for 1st-class company skills. Skills published here automatically populate the Gemini Enterprise <strong>Skills Gallery</strong> for all employees under your company namespace.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end md:self-center">
            {/* Region Selector */}
            <div className="flex items-center bg-gray-900 border border-gray-700 rounded-lg px-2 py-1">
              <span className="text-[11px] text-gray-400 font-semibold mr-1.5">Region:</span>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="bg-transparent text-xs text-blue-300 font-bold focus:outline-none cursor-pointer"
              >
                <option value="global">🌍 Global</option>
                <option value="eu">🇪🇺 EU (Europe)</option>
                <option value="us">🇺🇸 US (United States)</option>
              </select>
            </div>

            <button
              onClick={fetchSkills}
              disabled={isLoading}
              className="p-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
              title="Refresh Registry"
            >
              <svg className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={() => setIsCurlModalOpen(true)}
              className="p-2 bg-gray-700 hover:bg-gray-600 text-purple-300 hover:text-purple-200 rounded-lg transition-colors border border-purple-500/30"
              title="View REST API (cURL) Reference for agentregistry.googleapis.com"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </button>
            <button
              onClick={() => setIsPublishModalOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>+ Publish Enterprise Skill</span>
            </button>
          </div>
        </div>

        {/* Stats Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-gray-700/60">
          <div className="p-3 bg-gray-900/60 rounded-lg border border-gray-700/50 flex items-center justify-between">
            <span className="text-xs text-gray-400 font-medium">Total Central Skills</span>
            <span className="text-base font-bold text-white">{totalCount}</span>
          </div>
          <div className="p-3 bg-gray-900/60 rounded-lg border border-gray-700/50 flex items-center justify-between">
            <span className="text-xs text-green-400 font-medium flex items-center gap-1.5">
              🟢 Active in Catalog
            </span>
            <span className="text-base font-bold text-green-300">{activeCount}</span>
          </div>
          <div className="p-3 bg-gray-900/60 rounded-lg border border-gray-700/50 flex items-center justify-between">
            <span className="text-xs text-yellow-400 font-medium flex items-center gap-1.5">
              🟡 Draft / Staging
            </span>
            <span className="text-base font-bold text-yellow-300">{draftCount}</span>
          </div>
          <div className="p-3 bg-gray-900/60 rounded-lg border border-gray-700/50 flex items-center justify-between">
            <span className="text-xs text-purple-400 font-medium flex items-center gap-1.5">
              🏷️ Publishers
            </span>
            <span className="text-base font-bold text-purple-300">{publisherCount}</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-gray-800 rounded-lg p-3.5 border border-gray-700 flex flex-col md:flex-row items-center justify-between gap-3 shadow-sm">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search skills by name, URN, description..."
            className="w-full pl-9 pr-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <svg className="h-4 w-4 absolute left-3 top-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Filter Dropdowns */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <select
            value={selectedPublisher}
            onChange={(e) => setSelectedPublisher(e.target.value)}
            className="px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-xs text-gray-300 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">All Publishers</option>
            {publishers.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-xs text-gray-300 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">🟢 Active</option>
            <option value="DRAFT">🟡 Draft / Disabled</option>
          </select>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-900/40 border border-red-700 text-red-300 text-xs rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button onClick={fetchSkills} className="underline hover:text-white font-semibold">
            Retry
          </button>
        </div>
      )}

      {/* Skills Table */}
      {isLoading ? (
        <div className="bg-gray-800 rounded-lg p-12 border border-gray-700 text-center text-gray-400 text-sm">
          <svg className="animate-spin h-6 w-6 mx-auto mb-2 text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Loading enterprise skills from Google Cloud Agent Registry...
        </div>
      ) : filteredSkills.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-10 border border-gray-700 text-center space-y-3">
          <div className="inline-flex p-3 bg-gray-900 text-gray-500 rounded-full border border-gray-700">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h4 className="text-sm font-bold text-gray-200">No Enterprise Skills Found</h4>
          <p className="text-xs text-gray-400 max-w-md mx-auto leading-relaxed">
            {searchQuery
              ? 'No skills matched your search filter. Try clearing filters.'
              : 'Publish your first company-wide skill to Google Cloud Agent Registry to make it discoverable in Gemini Enterprise.'}
          </p>
          <button
            onClick={() => setIsPublishModalOpen(true)}
            className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors shadow"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Publish First Skill
          </button>
        </div>
      ) : (
        <div className="bg-gray-800 shadow-xl rounded-lg overflow-hidden border border-gray-700">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-700 text-left">
              <thead className="bg-gray-900/60 text-gray-400 text-[11px] uppercase tracking-wider font-semibold">
                <tr>
                  <th scope="col" className="px-6 py-3.5">Skill Name & URN</th>
                  <th scope="col" className="px-6 py-3.5">Publisher</th>
                  <th scope="col" className="px-6 py-3.5">Status</th>
                  <th scope="col" className="px-6 py-3.5">Semantic Trigger & Description</th>
                  <th scope="col" className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/60 bg-gray-800 text-xs">
                {filteredSkills.map((skill) => {
                  const skillId = skill.name.split('/').pop() || '';
                  const publisher = skill.publisher ? skill.publisher.split('/').pop() : 'Default';
                  const isGoogle = publisher?.includes('google');

                  return (
                    <tr key={skill.name} className="hover:bg-gray-750/50 transition-colors">
                      {/* Name & URN */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-semibold text-gray-100 flex items-center gap-2">
                          <span>{skill.displayName}</span>
                        </div>
                        <div className="text-[11px] text-blue-400 font-mono mt-0.5">
                          {skill.skillId || `/${skillId}`}
                        </div>
                      </td>

                      {/* Publisher */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 text-[11px] font-semibold rounded border ${
                          isGoogle
                            ? 'bg-blue-900/40 text-blue-300 border-blue-700'
                            : 'bg-purple-900/40 text-purple-300 border-purple-700'
                        }`}>
                          {publisher}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border ${
                          skill.state === 'STATE_ACTIVE'
                            ? 'bg-green-900/40 text-green-300 border-green-700'
                            : skill.state === 'STATE_DRAFT'
                            ? 'bg-yellow-900/40 text-yellow-300 border-yellow-700'
                            : 'bg-gray-700 text-gray-300 border-gray-600'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${
                            skill.state === 'STATE_ACTIVE' ? 'bg-green-400' : 'bg-yellow-400'
                          }`} />
                          {skill.state === 'STATE_ACTIVE' ? 'ACTIVE' : 'DRAFT'}
                        </span>
                      </td>

                      {/* Description */}
                      <td className="px-6 py-4 text-gray-300 max-w-md truncate">
                        {skill.description || 'No description provided.'}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 whitespace-nowrap text-right font-medium">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setInspectingSkill(skill)}
                            className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 rounded transition-colors"
                            title="Inspect Skill & Revisions"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
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

      {/* Publish Modal */}
      <PublishSkillModal
        isOpen={isPublishModalOpen}
        onClose={() => setIsPublishModalOpen(false)}
        config={currentConfig}
        onSkillPublished={fetchSkills}
      />

      {/* Detail Inspector Modal */}
      <RegistrySkillDetailModal
        skill={inspectingSkill}
        isOpen={!!inspectingSkill}
        onClose={() => setInspectingSkill(null)}
        config={currentConfig}
        onSkillUpdated={fetchSkills}
      />

      {/* cURL API Reference Modal */}
      {isCurlModalOpen && (
        <CurlInfoModal
          infoKey={Page.SKILLS_REGISTRY}
          onClose={() => setIsCurlModalOpen(false)}
        />
      )}
    </div>
  );
};

export default SkillsRegistryPage;
