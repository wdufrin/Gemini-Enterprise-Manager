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
import { Config, UserProfile, SkillScope } from '../../types';
import * as api from '../../services/apiService';

interface AddSkillModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: Config;
  userProfile?: UserProfile | null;
  onSkillCreated: () => void;
}

type ImportTab = 'custom' | 'registry' | 'gcs' | 'upload';

export const AddSkillModal: React.FC<AddSkillModalProps> = ({
  isOpen,
  onClose,
  config,
  userProfile,
  onSkillCreated,
}) => {
  const [activeTab, setActiveTab] = useState<ImportTab>('custom');
  const [displayName, setDisplayName] = useState('');
  const [skillId, setSkillId] = useState('');
  const [description, setDescription] = useState('');
  const [instruction, setInstruction] = useState(
    '# Role & Capabilities\nYou are a specialized skill agent. Follow these guidelines:\n\n1. Analyze the user request carefully.\n2. Execute necessary domain operations with precision.\n3. Return formatted results clearly.'
  );
  const [scope, setScope] = useState<SkillScope>('ORGANIZATIONAL');
  const [agentRegistrySkill, setAgentRegistrySkill] = useState('');
  const [gcsUri, setGcsUri] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [uploadedFileContent, setUploadedFileContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDisplayNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDisplayName(val);
    if (!skillId || skillId === displayName.toLowerCase().replace(/[^a-z0-9-_]/g, '-')) {
      setSkillId(val.toLowerCase().replace(/[^a-z0-9-_]/g, '-'));
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setUploadedFileContent(text);
      if (!displayName) {
        const baseName = file.name.replace(/\.[^/.]+$/, '');
        setDisplayName(baseName.charAt(0).toUpperCase() + baseName.slice(1).replace(/[-_]/g, ' '));
        setSkillId(baseName.toLowerCase().replace(/[^a-z0-9-_]/g, '-'));
      }
      if (file.name.endsWith('.md') && !instruction) {
        setInstruction(text);
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!displayName.trim()) {
      setError('Display Name is required.');
      return;
    }

    setIsSubmitting(true);

    try {
      const state = scope === 'ORGANIZATIONAL' ? 'ENABLED' : 'PRIVATE';
      const ownerPrincipal = userProfile?.email
        ? `principal://iam.googleapis.com/users/${userProfile.email}`
        : undefined;

      const skillAgentDefinition: any = {
        owner: ownerPrincipal,
      };

      if (activeTab === 'custom') {
        skillAgentDefinition.instruction = instruction;
      } else if (activeTab === 'registry') {
        if (!agentRegistrySkill.trim()) {
          throw new Error('Agent Registry Skill resource name or URN is required.');
        }
        skillAgentDefinition.agentRegistrySkill = agentRegistrySkill.trim();
      } else if (activeTab === 'gcs') {
        if (!gcsUri.trim()) {
          throw new Error('GCS URI is required (e.g. gs://bucket/skills/skill-name/).');
        }
        skillAgentDefinition.gcsUri = gcsUri.trim();
      } else if (activeTab === 'upload') {
        skillAgentDefinition.instruction = uploadedFileContent || instruction;
        if (uploadedFileName) {
          skillAgentDefinition.subfiles = [
            {
              fileName: uploadedFileName,
              mimeType: uploadedFileName.endsWith('.md') ? 'text/markdown' : 'text/plain',
            },
          ];
        }
      }

      const payload = {
        displayName: displayName.trim(),
        description: description.trim() || undefined,
        state,
        skillAgentDefinition,
      };

      const finalSkillId = skillId.trim() || `skill-${Date.now()}`;
      await api.createSkillAgent(payload, config, finalSkillId, scope === 'ORGANIZATIONAL');

      onSkillCreated();
      onClose();
    } catch (err: any) {
      console.error('Failed to create skill agent:', err);
      setError(err?.message || 'Failed to create skill agent. Please verify permissions and parameters.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 flex items-center justify-center p-4">
      <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-fade-in-up">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-900/50 text-blue-400 border border-blue-700/50 rounded-lg">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-100">Add Skill to Assistant</h2>
              <p className="text-xs text-gray-400">Configure an organizational or user-created capability for this engine</p>
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

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-700 bg-gray-900/50 px-5 pt-3 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'custom'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <span>✏️ Custom Skill</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('registry')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'registry'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <span>🏛️ Agent Registry</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('gcs')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'gcs'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <span>☁️ Cloud Storage (GCS)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'upload'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <span>📦 Upload Package</span>
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-red-900/40 border border-red-700 text-red-300 rounded-lg text-xs flex items-start gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Scope Selector: Org vs User */}
          <div className="bg-gray-900/60 p-3.5 rounded-lg border border-gray-700 space-y-2">
            <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block">
              Skill Scope & Governance
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  scope === 'ORGANIZATIONAL'
                    ? 'bg-blue-900/30 border-blue-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750'
                }`}
              >
                <input
                  type="radio"
                  name="scope"
                  value="ORGANIZATIONAL"
                  checked={scope === 'ORGANIZATIONAL'}
                  onChange={() => setScope('ORGANIZATIONAL')}
                  className="mt-1 text-blue-500 focus:ring-blue-500"
                />
                <div>
                  <div className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                    🏢 Organization-wide
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">
                    Active for all authorized users of this assistant engine (`state: ENABLED`).
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  scope === 'USER_CREATED'
                    ? 'bg-purple-900/30 border-purple-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750'
                }`}
              >
                <input
                  type="radio"
                  name="scope"
                  value="USER_CREATED"
                  checked={scope === 'USER_CREATED'}
                  onChange={() => setScope('USER_CREATED')}
                  className="mt-1 text-purple-500 focus:ring-purple-500"
                />
                <div>
                  <div className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                    👤 User-Created / Personal
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">
                    Private capability accessible only to your account (`state: PRIVATE`).
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Basic Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Display Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={displayName}
                onChange={handleDisplayNameChange}
                placeholder="e.g. Sales Pipeline Analyst"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Skill ID
              </label>
              <input
                type="text"
                value={skillId}
                onChange={(e) => setSkillId(e.target.value)}
                placeholder="e.g. sales-pipeline-analyst"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what this skill enables the assistant to do"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Tab Specific Content */}
          {activeTab === 'custom' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-gray-300">
                  System Instructions (`SKILL.md`)
                </label>
                <span className="text-[11px] text-gray-400">Markdown format supported</span>
              </div>
              <textarea
                rows={6}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="Enter prompt instructions for the skill execution engine..."
                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          )}

          {activeTab === 'registry' && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-300">
                Agent Registry Resource Name or URN <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={agentRegistrySkill}
                onChange={(e) => setAgentRegistrySkill(e.target.value)}
                placeholder="projects/PROJECT/locations/LOCATION/skills/SKILL_ID or urn:skill:..."
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono"
              />
              <p className="text-[11px] text-gray-400">
                References a centrally published skill registered in Google Cloud Agent Registry (`agentregistry.googleapis.com`).
              </p>
            </div>
          )}

          {activeTab === 'gcs' && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-300">
                Cloud Storage (GCS) URI <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={gcsUri}
                onChange={(e) => setGcsUri(e.target.value)}
                placeholder="gs://my-bucket/skills/skill-package-dir/ or gs://my-bucket/skills/skill.zip"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono"
              />
              <p className="text-[11px] text-gray-400">
                Folder or archive in Cloud Storage containing the `SKILL.md` file and execution scripts.
              </p>
            </div>
          )}

          {activeTab === 'upload' && (
            <div className="space-y-3">
              <label className="block text-xs font-medium text-gray-300">
                Skill Package File (`SKILL.md` or `.zip`)
              </label>
              <div className="border-2 border-dashed border-gray-700 hover:border-gray-600 rounded-lg p-4 text-center bg-gray-900/40 cursor-pointer">
                <input
                  type="file"
                  accept=".md,.zip,.json,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="skill-file-upload"
                />
                <label htmlFor="skill-file-upload" className="cursor-pointer block space-y-1">
                  <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <div className="text-xs font-medium text-blue-400">
                    {uploadedFileName ? `Selected: ${uploadedFileName}` : 'Click to select or drop SKILL.md / .zip file'}
                  </div>
                  <div className="text-[10px] text-gray-500">Supports .md markdown instructions or .zip package</div>
                </label>
              </div>

              {uploadedFileContent && (
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">
                    Preview Extracted Instructions
                  </label>
                  <textarea
                    rows={4}
                    value={uploadedFileContent}
                    onChange={(e) => setUploadedFileContent(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-xs text-white font-mono"
                  />
                </div>
              )}
            </div>
          )}
        </form>

        {/* Modal Footer */}
        <div className="p-4 border-t border-gray-700 bg-gray-900/50 flex justify-end gap-3 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 bg-gray-700 text-gray-300 text-xs font-medium rounded-lg hover:bg-gray-600 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !displayName.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-500 disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Adding Skill...</span>
              </>
            ) : (
              <span>Add Skill</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddSkillModal;
