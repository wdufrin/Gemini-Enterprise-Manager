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

import React, { useState, useRef, useEffect } from 'react';
import { Agent, Config } from '../../types';
import * as api from '../../services/apiService';
import { useToast } from '../../context/ToastContext';
import { toErrorMessage } from '../../utils/errors';
import { useModalA11y } from '../../hooks/useModalA11y';
import {
  MAX_SKILL_DESCRIPTION_LENGTH,
  buildSkillMarkdownDocument,
  classifySkillAgent,
  normalizeAppSkillForExport,
  parseSkillMarkdown,
  sanitizeSkillDescription,
  sanitizeSkillDisplayName,
  validateSkillDisplayName,
} from '../../utils/skillExportUtils';
import ExportSkillsModal from './ExportSkillsModal';

interface SkillDetailModalProps {
  skill: Agent | null;
  isOpen: boolean;
  onClose: () => void;
  config: Config;
  onSkillUpdated: () => void;
  initialEditMode?: boolean;
}

export const SkillDetailModal: React.FC<SkillDetailModalProps> = ({
  skill,
  isOpen,
  onClose,
  config,
  onSkillUpdated,
  initialEditMode = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mdFileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'instructions' | 'config' | 'raw'>('instructions');
  const [copied, setCopied] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);

  // SKILL.md Editing State
  const [isEditingInstructions, setIsEditingInstructions] = useState(Boolean(initialEditMode));
  const [editorMode, setEditorMode] = useState<'markdown' | 'full_skill_md'>('markdown');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editInstruction, setEditInstruction] = useState('');
  const [fullSkillMdText, setFullSkillMdText] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && skill) {
      const skillId = skill.name.split('/').pop() || 'skill';
      const rawInst = skill.skillAgentDefinition?.instruction || '';
      let parsedBody = rawInst;
      let parsedDesc = skill.description || '';
      try {
        const parsed = parseSkillMarkdown(rawInst);
        if (parsed.hasFrontmatter) {
          parsedBody = parsed.body;
          if (!parsedDesc && parsed.description) {
            parsedDesc = parsed.description;
          }
        }
      } catch {
        // Keep raw instruction if frontmatter is incomplete in existing skill
        parsedBody = rawInst;
      }

      setEditDisplayName(skill.displayName || skillId);
      setEditDescription(parsedDesc);
      setEditInstruction(parsedBody);
      try {
        setFullSkillMdText(
          buildSkillMarkdownDocument({
            name: skillId,
            description: parsedDesc,
            body: parsedBody,
          })
        );
      } catch {
        setFullSkillMdText(rawInst);
      }
      setEditError(null);
      setIsEditingInstructions(Boolean(initialEditMode));
      if (initialEditMode) {
        setActiveTab('instructions');
      }
    }
  }, [isOpen, skill, initialEditMode]);

  useModalA11y({
    isOpen,
    onClose,
    containerRef,
    preventClose: isUpdating || isExportOpen,
  });

  if (!isOpen || !skill) return null;

  const skillId = skill.name.split('/').pop() || 'skill';
  const skillDef = skill.skillAgentDefinition || {};
  const classification = classifySkillAgent(skill);
  const isOrgWide = classification.sharingScope === 'ORG_WIDE';
  const owner = classification.ownerPrincipal || 'System / Default';
  const normalizedState = (skill.state || 'PRIVATE').toUpperCase();
  const canEditSkillMd =
    classification.origin !== 'GOOGLE_1P' && !classification.isInstructionRedactedForAdmin;

  const handleSwitchEditorMode = (nextMode: 'markdown' | 'full_skill_md') => {
    setEditError(null);
    if (nextMode === 'full_skill_md' && editorMode === 'markdown') {
      try {
        const doc = buildSkillMarkdownDocument({
          name: skillId,
          description: editDescription,
          body: editInstruction,
        });
        setFullSkillMdText(doc);
      } catch (err) {
        setEditError(toErrorMessage(err));
        return;
      }
    } else if (nextMode === 'markdown' && editorMode === 'full_skill_md') {
      try {
        const parsed = parseSkillMarkdown(fullSkillMdText);
        if (parsed.description !== undefined) {
          setEditDescription(sanitizeSkillDescription(parsed.description));
        }
        if (parsed.displayName) {
          setEditDisplayName(parsed.displayName);
        }
        setEditInstruction(parsed.body);
      } catch (err) {
        setEditError(toErrorMessage(err));
        return;
      }
    }
    setEditorMode(nextMode);
  };

  const handleImportMarkdownFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditError(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = String(ev.target?.result || '');
      try {
        const parsed = parseSkillMarkdown(content);
        const nextDesc = sanitizeSkillDescription(
          parsed.description !== undefined ? parsed.description : editDescription
        );
        const nextBody = parsed.hasFrontmatter ? parsed.body : content;
        if (parsed.displayName) {
          setEditDisplayName(sanitizeSkillDisplayName(parsed.displayName));
        }
        setEditDescription(nextDesc);
        setEditInstruction(nextBody);
        setFullSkillMdText(
          buildSkillMarkdownDocument({
            name: parsed.name || skillId,
            description: nextDesc,
            body: nextBody,
          })
        );
        toast.success(`Imported ${file.name} into SKILL.md editor.`);
      } catch (err) {
        setEditError(toErrorMessage(err));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleInsertMarkdownSnippet = (snippet: string) => {
    if (editorMode === 'full_skill_md') {
      setFullSkillMdText((prev) => `${prev.trimEnd()}\n\n${snippet}\n`);
    } else {
      setEditInstruction((prev) => `${prev.trimEnd()}\n\n${snippet}\n`);
    }
  };

  const handleSaveSkillMarkdown = async () => {
    setEditError(null);
    let finalDescription = editDescription.trim();
    let finalInstruction = editInstruction;
    let candidateDisplayName = editDisplayName.trim() || skill.displayName || skillId;

    if (editorMode === 'full_skill_md') {
      try {
        const parsed = parseSkillMarkdown(fullSkillMdText);
        if (parsed.description !== undefined) {
          finalDescription = parsed.description.trim();
        }
        if (parsed.displayName) {
          candidateDisplayName = parsed.displayName.trim();
        }
        finalInstruction = parsed.body;
      } catch (err) {
        setEditError(toErrorMessage(err));
        return;
      }
    } else if (finalInstruction.trim().startsWith('---')) {
      try {
        const parsed = parseSkillMarkdown(finalInstruction);
        if (parsed.hasFrontmatter) {
          if (parsed.description && !finalDescription) {
            finalDescription = parsed.description.trim();
          }
          finalInstruction = parsed.body;
        }
      } catch (err) {
        setEditError(toErrorMessage(err));
        return;
      }
    }

    if (
      Array.from(finalDescription).length > MAX_SKILL_DESCRIPTION_LENGTH &&
      !finalInstruction.includes(finalDescription.slice(0, 120))
    ) {
      finalInstruction = `${finalInstruction.trim()}\n\n## Extended Trigger & Scope Details\n${finalDescription}`;
    }
    finalDescription = sanitizeSkillDescription(finalDescription);

    const safeDisplayName = sanitizeSkillDisplayName(candidateDisplayName);
    const nameErr = validateSkillDisplayName(safeDisplayName);
    if (nameErr) {
      setEditError(nameErr);
      return;
    }

    if (!finalInstruction.trim()) {
      setEditError('Skill Markdown instructions (SKILL.md) cannot be empty.');
      return;
    }

    setIsUpdating(true);
    try {
      await api.updateAgent(
        skill,
        {
          displayName: safeDisplayName,
          description: finalDescription,
          skillAgentDefinition: {
            ...skillDef,
            instruction: finalInstruction,
          },
        },
        config
      );
      setEditDisplayName(safeDisplayName);
      setEditDescription(finalDescription);
      setEditInstruction(finalInstruction);
      setIsEditingInstructions(false);
      toast.success(`Updated SKILL.md instructions for "${safeDisplayName}".`);
      onSkillUpdated();
    } catch (err) {
      console.error('Failed to update skill instructions:', err);
      const msg = toErrorMessage(err);
      setEditError(msg);
      toast.error('Failed to update SKILL.md instructions: ' + msg);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(skill, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleScope = async () => {
    setIsUpdating(true);
    try {
      if (isOrgWide) {
        await api.demoteSkillToPersonal(skill, config);
      } else {
        await api.promoteSkillToOrg(skill, config);
      }
      onSkillUpdated();
    } catch (err) {
      console.error('Failed to toggle skill scope:', err);
      toast.error('Failed to update skill scope: ' + toErrorMessage(err));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleToggleActiveState = async () => {
    setIsUpdating(true);
    try {
      const isInactive = normalizedState === 'DISABLED' || normalizedState === 'SUSPENDED';
      if (isInactive) {
        if (typeof api.enableAgent === 'function') {
          await api.enableAgent(skill.name, config);
        } else {
          await api.updateAgent(skill, { state: 'ENABLED' }, config);
        }
      } else {
        if (typeof api.disableAgent === 'function') {
          await api.disableAgent(skill.name, config);
        } else {
          await api.updateAgent(skill, { state: 'DISABLED' }, config);
        }
      }
      onSkillUpdated();
    } catch (err) {
      console.error('Failed to toggle active state:', err);
      toast.error('Failed to update skill state: ' + toErrorMessage(err));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSuspendSkill = async () => {
    setIsUpdating(true);
    try {
      if (typeof api.suspendAgent === 'function') {
        await api.suspendAgent(skill.name, config, 'Suspended by Administrator');
      } else {
        await api.updateAgent(skill, { state: 'SUSPENDED' }, config);
      }
      onSkillUpdated();
    } catch (err) {
      console.error('Failed to suspend skill:', err);
      toast.error('Failed to suspend skill: ' + toErrorMessage(err));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRejectToPrivate = async () => {
    setIsUpdating(true);
    try {
      if (typeof api.rejectAgent === 'function') {
        await api.rejectAgent(skill.name, config, 'Returned to private by Administrator');
      } else if (typeof api.withdrawAgent === 'function') {
        await api.withdrawAgent(skill.name, config);
      }
      onSkillUpdated();
    } catch (err) {
      console.error('Failed to reject skill to private:', err);
      toast.error('Failed to return skill to private: ' + toErrorMessage(err));
    } finally {
      setIsUpdating(false);
    }
  };

  const getStateBadgeClass = (stateStr: string): string => {
    switch (stateStr) {
      case 'ENABLED':
        return 'bg-green-900/60 text-green-300 border-green-700';
      case 'DISABLED':
        return 'bg-red-900/60 text-red-300 border-red-700';
      case 'SUSPENDED':
        return 'bg-amber-900/60 text-amber-300 border-amber-700';
      case 'PRIVATE':
      default:
        return 'bg-purple-900/50 text-purple-300 border-purple-700/80';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/75 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="skill-detail-title"
      onClick={() => {
        if (!isUpdating && !isExportOpen) onClose();
      }}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col animate-fade-in-up"
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-gray-700 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="p-2.5 bg-blue-900/40 text-blue-400 border border-blue-700/50 rounded-lg shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 id="skill-detail-title" className="text-lg font-bold text-gray-100 break-words">{skill.displayName}</h2>
                <span
                  className={`px-2 py-0.5 text-xs font-semibold rounded border flex items-center gap-1 ${
                    classification.origin === 'GOOGLE_1P'
                      ? 'bg-emerald-900/60 text-emerald-300 border-emerald-700'
                      : classification.origin === 'USER_CREATED'
                      ? 'bg-purple-900/60 text-purple-300 border-purple-700'
                      : 'bg-blue-900/60 text-blue-300 border-blue-700'
                  }`}
                >
                  {classification.originLabel}
                </span>
                {normalizedState !== 'PRIVATE' && (
                  <span className="px-2 py-0.5 text-[11px] font-medium bg-gray-900/80 text-gray-300 rounded border border-gray-700">
                    {classification.sharingLabel}
                  </span>
                )}
                <span className={`px-2 py-0.5 text-xs font-semibold rounded border ${getStateBadgeClass(normalizedState)}`}>
                  {normalizedState}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1 font-mono break-all">{skill.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canEditSkillMd && (
              <button
                type="button"
                data-testid="toggle-edit-skill-md-btn"
                onClick={() => {
                  setActiveTab('instructions');
                  setIsEditingInstructions((prev) => !prev);
                  setEditError(null);
                }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 border whitespace-nowrap ${
                  isEditingInstructions
                    ? 'bg-blue-600 text-white border-blue-500'
                    : 'bg-blue-950/60 hover:bg-blue-900/70 text-blue-200 border-blue-700/70'
                }`}
                title="Edit SKILL.md Markdown instructions and trigger description"
              >
                <span>✏️ {isEditingInstructions ? 'Editing SKILL.md' : 'Edit SKILL.md'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsExportOpen(true)}
              className="px-2.5 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 border border-gray-600 whitespace-nowrap"
              title="Export this skill to SKILL.md, JSON, or CSV"
            >
              <svg className="w-3.5 h-3.5 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Skill Execution Guidelines &amp; Markdown (`SKILL.md`)
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-500 font-mono">
                    {isEditingInstructions
                      ? `${
                          editorMode === 'full_skill_md'
                            ? fullSkillMdText.length
                            : editInstruction.length
                        } characters`
                      : skillDef.instruction
                      ? `${skillDef.instruction.length} characters`
                      : 'No inline prompt'}
                  </span>
                  {canEditSkillMd && !isEditingInstructions && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingInstructions(true);
                        setEditError(null);
                      }}
                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold transition-colors"
                    >
                      ✏️ Edit SKILL.md
                    </button>
                  )}
                </div>
              </div>

              {classification.isInstructionRedactedForAdmin ? (
                <div
                  data-testid="private-skill-redacted-notice"
                  className="p-4 bg-purple-950/30 border border-purple-700/70 rounded-lg text-xs text-purple-200 space-y-1.5"
                >
                  <div className="font-bold flex items-center gap-1.5">
                    <span>🔒 Private User Skill — Instructions Not Shared</span>
                  </div>
                  <p className="text-purple-200/90 leading-relaxed">
                    This skill is currently in the <strong>PRIVATE</strong> state (owned by{' '}
                    <code className="font-mono text-purple-100">{owner}</code>). In Gemini Enterprise, private
                    user-created skill instructions (<code className="font-mono">SKILL.md</code>) are only exposed to
                    administrators after the owner shares the skill with the organization or submits it for review.
                  </p>
                </div>
              ) : isEditingInstructions ? (
                <div
                  data-testid="skill-md-editor-panel"
                  className="p-4 bg-gray-900/90 border border-blue-700/70 rounded-xl space-y-3"
                >
                  {/* Editor Mode Switcher & .md File Upload */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-gray-800">
                    <div className="flex items-center gap-1 bg-gray-950 p-1 rounded-lg border border-gray-700">
                      <button
                        type="button"
                        onClick={() => handleSwitchEditorMode('markdown')}
                        className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                          editorMode === 'markdown'
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-400 hover:text-gray-200'
                        }`}
                      >
                        Markdown Instructions + Metadata
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSwitchEditorMode('full_skill_md')}
                        className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                          editorMode === 'full_skill_md'
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-400 hover:text-gray-200'
                        }`}
                      >
                        Full `SKILL.md` (with YAML Frontmatter)
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        ref={mdFileInputRef}
                        type="file"
                        accept=".md,.markdown,.txt"
                        onChange={handleImportMarkdownFile}
                        className="hidden"
                        data-testid="skill-md-file-input"
                      />
                      <button
                        type="button"
                        onClick={() => mdFileInputRef.current?.click()}
                        className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-xs font-semibold border border-gray-600 transition-colors"
                        title="Upload a local SKILL.md or .md file to populate instructions"
                      >
                        📂 Import `.md` File
                      </button>
                    </div>
                  </div>

                  {editorMode === 'markdown' ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label
                            htmlFor="edit-skill-display-name"
                            className="block text-xs font-semibold text-gray-300 mb-1"
                          >
                            Skill Display Name
                          </label>
                          <input
                            id="edit-skill-display-name"
                            type="text"
                            maxLength={64}
                            value={editDisplayName}
                            onChange={(e) => setEditDisplayName(e.target.value)}
                            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="edit-skill-description"
                            className="block text-xs font-semibold text-gray-300 mb-1"
                          >
                            Semantic Trigger Description (Planner Routing)
                          </label>
                          <input
                            id="edit-skill-description"
                            type="text"
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            placeholder="When should the Assistant invoke this skill?"
                            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                          <label
                            htmlFor="edit-skill-markdown-body"
                            className="text-xs font-semibold text-gray-300"
                          >
                            Markdown Instructions (`SKILL.md` Body)
                          </label>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleInsertMarkdownSnippet('## Section Heading')}
                              className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-[11px] font-mono border border-gray-700"
                            >
                              ## H2
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleInsertMarkdownSnippet(
                                  '- **Rule 1**: Execute a single targeted query.\n- **Rule 2**: Summarize findings with citations.'
                                )
                              }
                              className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-[11px] font-mono border border-gray-700"
                            >
                              + Bullet Rules
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleInsertMarkdownSnippet('```json\n{\n  "filter": "status = \'ACTIVE\'"\n}\n```')
                              }
                              className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-[11px] font-mono border border-gray-700"
                            >
                              + Code Block
                            </button>
                          </div>
                        </div>
                        <textarea
                          id="edit-skill-markdown-body"
                          data-testid="edit-skill-markdown-textarea"
                          rows={12}
                          value={editInstruction}
                          onChange={(e) => setEditInstruction(e.target.value)}
                          placeholder="# Role & Capabilities&#10;Write Markdown instructions for this global skill..."
                          className="w-full bg-gray-950 border border-gray-700 rounded-lg p-3 text-xs font-mono text-gray-100 leading-relaxed focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label
                          htmlFor="edit-full-skill-md"
                          className="text-xs font-semibold text-gray-300"
                        >
                          Full `SKILL.md` Document (YAML Frontmatter + Markdown Body)
                        </label>
                        <span className="text-[11px] text-gray-400">
                          Editing <code className="font-mono text-blue-300">description:</code> in frontmatter automatically updates the Skill trigger description
                        </span>
                      </div>
                      <textarea
                        id="edit-full-skill-md"
                        data-testid="edit-full-skill-md-textarea"
                        rows={15}
                        value={fullSkillMdText}
                        onChange={(e) => setFullSkillMdText(e.target.value)}
                        className="w-full bg-gray-950 border border-gray-700 rounded-lg p-3 text-xs font-mono text-gray-100 leading-relaxed focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  )}

                  {editError && (
                    <div
                      role="alert"
                      className="p-2.5 bg-red-950/60 border border-red-700 rounded-lg text-xs text-red-200"
                    >
                      {editError}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-800">
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => {
                        setIsEditingInstructions(false);
                        setEditError(null);
                      }}
                      className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-semibold transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      data-testid="save-skill-md-btn"
                      disabled={isUpdating}
                      onClick={() => void handleSaveSkillMarkdown()}
                      className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white rounded-lg text-xs font-bold shadow transition-colors"
                    >
                      {isUpdating ? 'Saving SKILL.md...' : '💾 Save SKILL.md Instructions'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-gray-900 border border-gray-700 rounded-lg text-xs font-mono text-gray-200 whitespace-pre-wrap leading-relaxed max-h-[350px] overflow-y-auto">
                  {skillDef.instruction || (
                    <span className="text-gray-500 italic">
                      This skill utilizes an external registry package, Cloud Storage files, or first-party connector binaries.
                    </span>
                  )}
                </div>
              )}
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
                  <span className="text-gray-500 font-semibold block">Current State & Sharing Scope</span>
                  <span className="text-gray-200 font-semibold">
                    {normalizedState} ({classification.sharingLabel})
                  </span>
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
        <div className="p-4 border-t border-gray-700 bg-gray-900/50 flex items-center justify-between gap-3 flex-wrap rounded-b-xl">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleToggleScope}
              disabled={isUpdating}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 ${
                isOrgWide
                  ? 'bg-purple-900/40 text-purple-300 border-purple-700 hover:bg-purple-900/60'
                  : 'bg-blue-900/40 text-blue-300 border-blue-700 hover:bg-blue-900/60'
              }`}
            >
              {isOrgWide ? '🔄 Restrict to Personal Scope' : '🚀 Promote to Organization-wide'}
            </button>
            {normalizedState !== 'PRIVATE' && (
              <button
                onClick={handleToggleActiveState}
                disabled={isUpdating}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  normalizedState === 'DISABLED' || normalizedState === 'SUSPENDED'
                    ? 'bg-green-900/40 text-green-300 border-green-700 hover:bg-green-900/60'
                    : 'bg-yellow-900/40 text-yellow-300 border-yellow-700 hover:bg-yellow-900/60'
                }`}
              >
                {normalizedState === 'DISABLED' || normalizedState === 'SUSPENDED' ? 'Enable Skill' : 'Disable Skill'}
              </button>
            )}
            {normalizedState === 'ENABLED' && (
              <button
                onClick={handleSuspendSkill}
                disabled={isUpdating}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border bg-amber-900/40 text-amber-300 border-amber-700 hover:bg-amber-900/60 transition-colors"
                title="Temporarily suspend this shared skill (:suspendAgent)"
              >
                ⏸️ Suspend Skill
              </button>
            )}
            {(normalizedState === 'DISABLED' || normalizedState === 'SUSPENDED') && (
              <button
                onClick={handleRejectToPrivate}
                disabled={isUpdating}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border bg-red-900/40 text-red-300 border-red-700 hover:bg-red-900/60 transition-colors"
                title="Reject shared skill and return it to PRIVATE state (:rejectAgent)"
              >
                ↩️ Reject to Private
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      <ExportSkillsModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        records={[normalizeAppSkillForExport(skill)]}
        title={`Export Skill: ${skill.displayName}`}
        filenamePrefix={skill.name.split('/').pop() || 'skill'}
      />
    </div>
  );
};

export default SkillDetailModal;
