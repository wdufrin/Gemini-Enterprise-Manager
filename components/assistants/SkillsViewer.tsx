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
import { Agent, AppEngine, Config, UserProfile } from '../../types';
import * as api from '../../services/apiService';
import AddSkillModal from './AddSkillModal';
import SkillDetailModal from './SkillDetailModal';
import ExportSkillsModal from './ExportSkillsModal';
import ConfirmationModal from '../ConfirmationModal';
import { useToast } from '../../context/ToastContext';
import { toErrorMessage } from '../../utils/errors';
import {
  classifySkillAgent,
  isSkillAgentResource,
  normalizeAppSkillForExport,
} from '../../utils/skillExportUtils';

const getSourceBadge = (skill: Agent) => {
  const def = skill.skillAgentDefinition;
  const rec = skill as unknown as Record<string, unknown>;
  if (rec.geminiEnterpriseSkillConfig) {
    return (
      <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-900/40 text-emerald-300 rounded border border-emerald-700 font-mono">
        Google (1P)
      </span>
    );
  }
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

interface SkillTableRowProps {
  skill: Agent;
  isSelected: boolean;
  onToggleSelect: (skillName: string) => void;
  onInspect: (skill: Agent) => void;
  onEdit: (skill: Agent) => void;
  onDelete: (skill: Agent) => void;
}

const SkillTableRow = React.memo<SkillTableRowProps>(
  ({ skill, isSelected, onToggleSelect, onInspect, onEdit, onDelete }) => {
    const skillId = skill.name.split('/').pop() || '';
    const classification = classifySkillAgent(skill);
    const ownerEmail = classification.ownerPrincipal;
    const normalizedState = (skill.state || 'PRIVATE').toUpperCase();
    const canEditMd =
      classification.origin !== 'GOOGLE_1P' && !classification.isInstructionRedactedForAdmin;

    const statusBadgeStyle =
      normalizedState === 'ENABLED'
        ? 'bg-green-900/40 text-green-300 border-green-700'
        : normalizedState === 'DISABLED'
        ? 'bg-red-900/40 text-red-300 border-red-700'
        : normalizedState === 'SUSPENDED'
        ? 'bg-amber-900/40 text-amber-300 border-amber-700'
        : 'bg-yellow-900/40 text-yellow-300 border-yellow-700';

    const statusDotStyle =
      normalizedState === 'ENABLED'
        ? 'bg-green-400'
        : normalizedState === 'DISABLED'
        ? 'bg-red-400'
        : normalizedState === 'SUSPENDED'
        ? 'bg-amber-400'
        : 'bg-yellow-400';

    return (
      <tr
        className={`hover:bg-gray-750/50 transition-colors ${
          isSelected ? 'bg-blue-950/25' : ''
        }`}
      >
        {/* Bulk Select Checkbox */}
        <td className="pl-5 pr-2 py-4 whitespace-nowrap w-10">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(skill.name)}
            aria-label={`Select ${skill.displayName || skillId}`}
            className="w-4 h-4 rounded border-gray-600 text-blue-600 focus:ring-blue-500 bg-gray-900 cursor-pointer"
          />
        </td>

        {/* Name & ID */}
        <td className="px-4 py-4 whitespace-nowrap">
          <div className="font-semibold text-gray-100">{skill.displayName}</div>
          <div className="text-[11px] text-gray-500 font-mono mt-0.5">{skillId}</div>
        </td>

        {/* Origin & Scope Badge */}
        <td className="px-6 py-4 whitespace-nowrap">
          <div className="flex flex-col items-start gap-1">
            {classification.origin === 'GOOGLE_1P' ? (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-900/40 text-emerald-300 border border-emerald-700/60">
                <span>{classification.originLabel}</span>
              </div>
            ) : classification.origin === 'USER_CREATED' ? (
              <div
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-purple-900/40 text-purple-300 border border-purple-700/60"
                title={ownerEmail || undefined}
              >
                <span>{classification.originLabel}</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-900/40 text-blue-300 border border-blue-700/60">
                <span>{classification.originLabel}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
              <span className="px-1.5 py-0.5 rounded bg-gray-900/70 border border-gray-700 text-gray-300 font-medium">
                {classification.sharingLabel}
              </span>
              {ownerEmail && (
                <span className="truncate max-w-[150px] font-mono text-gray-300" title={ownerEmail}>
                  {ownerEmail}
                </span>
              )}
            </div>
          </div>
        </td>

        {/* Status */}
        <td className="px-6 py-4 whitespace-nowrap">
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border ${statusBadgeStyle}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${statusDotStyle}`} />
            {skill.state || 'Private'}
          </span>
        </td>

        {/* Source Type */}
        <td className="px-6 py-4 whitespace-nowrap">{getSourceBadge(skill)}</td>

        {/* Description */}
        <td className="px-6 py-4 text-gray-300 max-w-xs truncate">
          {skill.description || (
            <span className="text-gray-500 italic">No description provided</span>
          )}
        </td>

        {/* Actions */}
        <td className="px-6 py-4 whitespace-nowrap text-right font-medium">
          <div className="flex items-center justify-end gap-2">
            {canEditMd && (
              <button
                onClick={() => onEdit(skill)}
                className="p-1.5 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-900/20 rounded transition-colors"
                title="Edit SKILL.md Markdown Instructions"
                aria-label={`Edit SKILL.md for ${skill.displayName || skillId}`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </button>
            )}
            <button
              onClick={() => onInspect(skill)}
              className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 rounded transition-colors"
              title="Inspect Skill & Instructions"
              aria-label={`Inspect ${skill.displayName || skillId}`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
            </button>
            <button
              onClick={() => onDelete(skill)}
              className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors"
              title="Delete Skill"
              aria-label={`Delete ${skill.displayName || skillId}`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        </td>
      </tr>
    );
  }
);

SkillTableRow.displayName = 'SkillTableRow';

interface SkillsViewerProps {
  agents: Agent[];
  config: Config;
  engine?: AppEngine | null;
  userProfile?: UserProfile | null;
  onRefreshSkills: () => void;
}

export const SkillsViewer: React.FC<SkillsViewerProps> = ({
  agents,
  config,
  engine,
  userProfile,
  onRefreshSkills,
}) => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'ALL' | 'ORGANIZATIONAL' | 'USER_CREATED'>('ALL');
  const [selectedSkill, setSelectedSkill] = useState<Agent | null>(null);
  const [openInEditMode, setOpenInEditMode] = useState(false);
  const [skillToDelete, setSkillToDelete] = useState<Agent | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedSkillNames, setSelectedSkillNames] = useState<Set<string>>(new Set());
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isEnablingEngineFeatures, setIsEnablingEngineFeatures] = useState(false);
  const [engineFeaturesEnabledOverride, setEngineFeaturesEnabledOverride] = useState(false);

  // Filter strictly for skill resources (no false positives from displayName containing 'skill')
  const skillsList = useMemo(() => {
    return agents.filter((agent) => isSkillAgentResource(agent) || agent.name.includes('/skills/'));
  }, [agents]);

  // Statistics
  const totalCount = skillsList.length;
  const orgWideCount = useMemo(
    () => skillsList.filter((s) => classifySkillAgent(s).sharingScope === 'ORG_WIDE').length,
    [skillsList]
  );
  const userCreatedCount = useMemo(
    () => skillsList.filter((s) => classifySkillAgent(s).origin === 'USER_CREATED').length,
    [skillsList]
  );

  // Filtered skills based on scope/origin tab and search query
  const filteredSkills = useMemo(() => {
    return skillsList.filter((skill) => {
      const classification = classifySkillAgent(skill);
      if (scopeFilter === 'ORGANIZATIONAL' && classification.sharingScope !== 'ORG_WIDE') {
        return false;
      }
      if (scopeFilter === 'USER_CREATED' && classification.origin !== 'USER_CREATED') {
        return false;
      }

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const name = (skill.displayName || '').toLowerCase();
      const desc = (skill.description || '').toLowerCase();
      const id = (skill.name || '').toLowerCase();
      const inst = (skill.skillAgentDefinition?.instruction || '').toLowerCase();
      const owner = (classification.ownerPrincipal || '').toLowerCase();
      return (
        name.includes(q) ||
        desc.includes(q) ||
        id.includes(q) ||
        inst.includes(q) ||
        owner.includes(q)
      );
    });
  }, [skillsList, scopeFilter, searchQuery]);

  // Keep only selected skills that still exist in skillsList
  const activeSelectedSkills = useMemo(
    () => skillsList.filter((s) => selectedSkillNames.has(s.name)),
    [skillsList, selectedSkillNames]
  );

  const allFilteredSelected = useMemo(
    () =>
      filteredSkills.length > 0 &&
      filteredSkills.every((s) => selectedSkillNames.has(s.name)),
    [filteredSkills, selectedSkillNames]
  );

  const handleToggleSelectSkill = useCallback((skillName: string) => {
    setSelectedSkillNames((prev) => {
      const next = new Set(prev);
      if (next.has(skillName)) {
        next.delete(skillName);
      } else {
        next.add(skillName);
      }
      return next;
    });
  }, []);

  const handleToggleSelectAllFiltered = useCallback(() => {
    setSelectedSkillNames((prev) => {
      const next = new Set(prev);
      const everySelected =
        filteredSkills.length > 0 && filteredSkills.every((s) => next.has(s.name));
      if (everySelected) {
        filteredSkills.forEach((s) => next.delete(s.name));
      } else {
        filteredSkills.forEach((s) => next.add(s.name));
      }
      return next;
    });
  }, [filteredSkills]);

  const exportRecords = useMemo(
    () => filteredSkills.map((s) => normalizeAppSkillForExport(s)),
    [filteredSkills]
  );

  const [adminApprovalEnforcedOverride, setAdminApprovalEnforcedOverride] = useState(false);
  const [isEnforcingAdminApproval, setIsEnforcingAdminApproval] = useState(false);

  const missingEngineFeatures = useMemo(() => {
    if (!engine?.features || engineFeaturesEnabledOverride) return [];
    const missing: string[] = [];
    if (engine.features['skills'] === 'FEATURE_STATE_OFF') {
      missing.push('skills');
    }
    if (engine.features['skill-sharing'] === 'FEATURE_STATE_OFF') {
      missing.push('skill-sharing');
    }
    return missing;
  }, [engine, engineFeaturesEnabledOverride]);

  const unreviewedSharingEnabled = useMemo(() => {
    if (!engine?.features || adminApprovalEnforcedOverride) return false;
    return engine.features['skill-sharing-without-admin-approval'] === 'FEATURE_STATE_ON';
  }, [engine, adminApprovalEnforcedOverride]);

  const handleEnableEngineSkillFeatures = async () => {
    setIsEnablingEngineFeatures(true);
    try {
      await api.ensureSkillSharingOnEngine(config);
      setEngineFeaturesEnabledOverride(true);
      toast.success('Enabled skills and skill-sharing features on the Gemini Enterprise engine (with admin approval preserved).');
      onRefreshSkills();
    } catch (err) {
      toast.error('Failed to enable engine skill features: ' + toErrorMessage(err));
    } finally {
      setIsEnablingEngineFeatures(false);
    }
  };

  const handleRequireAdminApproval = async () => {
    if (!engine) return;
    setIsEnforcingAdminApproval(true);
    try {
      const engineName =
        engine.name ||
        `projects/${config.projectId}/locations/${config.appLocation}/collections/${config.collectionId || 'default_collection'}/engines/${config.appId}`;
      const updatedFeatures = {
        ...(engine.features || {}),
        'skill-sharing-without-admin-approval': 'FEATURE_STATE_OFF',
      };
      await api.updateEngine(engineName, { features: updatedFeatures }, ['features'], config);
      setAdminApprovalEnforcedOverride(true);
      toast.success(
        'Enforced administrator approval for shared skills (skill-sharing-without-admin-approval set to OFF).'
      );
      onRefreshSkills();
    } catch (err) {
      toast.error('Failed to enforce admin approval: ' + toErrorMessage(err));
    } finally {
      setIsEnforcingAdminApproval(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!skillToDelete) return;
    setIsDeleting(true);
    try {
      await api.deleteSkillAgent(skillToDelete.name, config);
      setSelectedSkillNames((prev) => {
        const next = new Set(prev);
        next.delete(skillToDelete.name);
        return next;
      });
      setSkillToDelete(null);
      onRefreshSkills();
    } catch (err) {
      console.error('Failed to delete skill:', err);
      toast.error('Failed to delete skill: ' + toErrorMessage(err));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkDeleteConfirm = async () => {
    if (activeSelectedSkills.length === 0) return;
    setIsBulkDeleting(true);
    let deletedCount = 0;
    const failedMessages: string[] = [];
    const deletedNames = new Set<string>();

    for (const skill of activeSelectedSkills) {
      try {
        await api.deleteSkillAgent(skill.name, config);
        deletedCount += 1;
        deletedNames.add(skill.name);
      } catch (err) {
        const label = skill.displayName || skill.name.split('/').pop() || skill.name;
        failedMessages.push(`${label}: ${toErrorMessage(err)}`);
      }
    }

    setSelectedSkillNames((prev) => {
      const next = new Set(prev);
      deletedNames.forEach((n) => next.delete(n));
      return next;
    });
    setIsBulkDeleting(false);
    setIsBulkDeleteModalOpen(false);

    if (deletedCount > 0) {
      onRefreshSkills();
    }
    if (failedMessages.length === 0) {
      toast.success(
        `Deleted ${deletedCount} selected skill${deletedCount === 1 ? '' : 's'}.`
      );
    } else {
      toast.error(
        `Deleted ${deletedCount}/${activeSelectedSkills.length} skill(s). Errors: ${failedMessages.join('; ')}`
      );
    }
  };

  const handleInspect = useCallback((skill: Agent) => {
    setOpenInEditMode(false);
    setSelectedSkill(skill);
  }, []);

  const handleEdit = useCallback((skill: Agent) => {
    setOpenInEditMode(true);
    setSelectedSkill(skill);
  }, []);

  const handleDelete = useCallback((skill: Agent) => {
    setSkillToDelete(skill);
  }, []);

  const activeModalSkill = useMemo(() => {
    if (!selectedSkill) return null;
    return skillsList.find((s) => s.name === selectedSkill.name) || selectedSkill;
  }, [selectedSkill, skillsList]);

  return (
    <div className="space-y-6 animate-fade-in">
      {missingEngineFeatures.length > 0 && (
        <div
          role="alert"
          data-testid="skills-engine-feature-warning"
          className="p-4 bg-amber-950/40 border border-amber-700/80 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="text-xs text-amber-200 space-y-1">
            <div className="font-bold text-amber-100">
              ⚠️ Engine Skill Features Disabled ({missingEngineFeatures.join(', ')})
            </div>
            <p className="text-amber-200/90">
              This Gemini Enterprise app currently has{' '}
              <code className="font-mono text-amber-100">{missingEngineFeatures.join(' & ')}</code>{' '}
              turned off. Users will not be able to invoke or share skills until these engine features are enabled.
            </p>
          </div>
          <button
            type="button"
            onClick={handleEnableEngineSkillFeatures}
            disabled={isEnablingEngineFeatures}
            className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg shrink-0 transition-colors shadow"
          >
            {isEnablingEngineFeatures ? 'Enabling...' : 'Enable Skill Features'}
          </button>
        </div>
      )}

      {unreviewedSharingEnabled && (
        <div
          role="alert"
          data-testid="skills-unreviewed-sharing-warning"
          className="p-4 bg-blue-950/40 border border-blue-700/70 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="text-xs text-blue-200 space-y-1">
            <div className="font-bold text-blue-100">
              🛡️ Governance Notice: Unreviewed Skill Sharing Enabled (`skill-sharing-without-admin-approval`)
            </div>
            <p className="text-blue-200/90">
              Employees can currently share web app skills organization-wide without administrator review or Agent Registry security scanning. Require admin approval so shared skills can be audited via <strong>Scan via Registry</strong> before promotion.
            </p>
          </div>
          <button
            type="button"
            data-testid="require-skill-admin-approval-btn"
            onClick={handleRequireAdminApproval}
            disabled={isEnforcingAdminApproval}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg shrink-0 transition-colors shadow"
          >
            {isEnforcingAdminApproval ? 'Updating...' : 'Require Admin Approval'}
          </button>
        </div>
      )}

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
              type="button"
              onClick={() => setIsExportModalOpen(true)}
              disabled={filteredSkills.length === 0}
              className="px-3.5 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-100 text-xs font-semibold rounded-lg flex items-center gap-1.5 border border-gray-600 transition-colors"
              title="Export filtered skills to CSV, JSON, JSONL, or SKILL.md"
            >
              <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Export Skills</span>
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
            <span className="text-base font-bold text-blue-300">{orgWideCount}</span>
          </div>
          <div className="p-3 bg-gray-900/60 rounded-lg border border-gray-700/50 flex items-center justify-between">
            <span className="text-xs text-purple-400 font-medium flex items-center gap-1.5">
              👤 User-Created (Employee)
            </span>
            <span className="text-base font-bold text-purple-300">{userCreatedCount}</span>
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
            <span>🏢 Org-wide ({orgWideCount})</span>
          </button>
          <button
            onClick={() => setScopeFilter('USER_CREATED')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 ${
              scopeFilter === 'USER_CREATED'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <span>👤 User-Created ({userCreatedCount})</span>
          </button>
        </div>

        {/* Search Input & Bulk Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end">
          {activeSelectedSkills.length > 0 && (
            <div
              data-testid="skills-bulk-action-bar"
              className="flex items-center gap-2 px-3 py-1.5 bg-red-950/40 border border-red-700/70 rounded-lg text-xs"
            >
              <span className="text-red-200 font-semibold">
                {activeSelectedSkills.length} selected
              </span>
              <button
                type="button"
                onClick={() => setSelectedSkillNames(new Set())}
                className="text-gray-300 hover:text-white underline text-[11px]"
              >
                Clear
              </button>
              <button
                type="button"
                data-testid="bulk-delete-skills-button"
                onClick={() => setIsBulkDeleteModalOpen(true)}
                className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded transition-colors flex items-center gap-1 shadow-sm"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                <span>Delete Selected ({activeSelectedSkills.length})</span>
              </button>
            </div>
          )}

          <div className="relative w-full md:w-72">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search skills by name, owner, description..."
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
                  <th scope="col" className="pl-5 pr-2 py-3.5 w-10">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={handleToggleSelectAllFiltered}
                      aria-label="Select all visible skills"
                      className="w-4 h-4 rounded border-gray-600 text-blue-600 focus:ring-blue-500 bg-gray-900 cursor-pointer"
                    />
                  </th>
                  <th scope="col" className="px-4 py-3.5">Skill Name & ID</th>
                  <th scope="col" className="px-6 py-3.5">Origin & Scope</th>
                  <th scope="col" className="px-6 py-3.5">Status</th>
                  <th scope="col" className="px-6 py-3.5">Source Type</th>
                  <th scope="col" className="px-6 py-3.5">Description</th>
                  <th scope="col" className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/60 bg-gray-800 text-xs">
                {filteredSkills.map((skill) => (
                  <SkillTableRow
                    key={skill.name}
                    skill={skill}
                    isSelected={selectedSkillNames.has(skill.name)}
                    onToggleSelect={handleToggleSelectSkill}
                    onInspect={handleInspect}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))}
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

      {/* Export Skills Modal */}
      <ExportSkillsModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        records={exportRecords}
        title="Export Assistant Skills"
        filenamePrefix={`ge-assistant-skills-${config.appId || 'app'}`}
      />

      {/* Skill Detail Modal */}
      {activeModalSkill && (
        <SkillDetailModal
          skill={activeModalSkill}
          isOpen={!!activeModalSkill}
          onClose={() => {
            setSelectedSkill(null);
            setOpenInEditMode(false);
          }}
          config={config}
          onSkillUpdated={onRefreshSkills}
          initialEditMode={openInEditMode}
        />
      )}

      {/* Confirmation Modal for Single Skill Deletion */}
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

      {/* Confirmation Modal for Bulk Skill Deletion */}
      <ConfirmationModal
        isOpen={isBulkDeleteModalOpen}
        onClose={() => setIsBulkDeleteModalOpen(false)}
        onConfirm={handleBulkDeleteConfirm}
        title={`Delete ${activeSelectedSkills.length} Selected Skill${activeSelectedSkills.length === 1 ? '' : 's'}`}
        confirmText={`Delete ${activeSelectedSkills.length} Skill${activeSelectedSkills.length === 1 ? '' : 's'}`}
        isConfirming={isBulkDeleting}
      >
        <div className="space-y-3 text-sm text-gray-300">
          <p>
            Are you sure you want to permanently delete the following{' '}
            <strong className="text-white">{activeSelectedSkills.length}</strong> skill
            {activeSelectedSkills.length === 1 ? '' : 's'} from this assistant?
          </p>
          <ul className="max-h-40 overflow-y-auto bg-gray-900/80 border border-gray-700 rounded-lg p-2.5 space-y-1 text-xs font-mono text-gray-200">
            {activeSelectedSkills.map((sk) => (
              <li key={sk.name} className="truncate">
                • {sk.displayName} <span className="text-gray-500">({sk.name.split('/').pop()})</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-400">
            This action cannot be undone and will remove these skill definitions from the assistant.
          </p>
        </div>
      </ConfirmationModal>
    </div>
  );
};

export default SkillsViewer;
