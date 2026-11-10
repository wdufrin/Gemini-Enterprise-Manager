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

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Config,
  RegistrySkill,
  RegistrySkillRevision,
  RegistrySkillFinding,
  SkillScanningPolicy,
  AppEngine,
  Agent,
} from '../../types';
import * as api from '../../services/apiService';
import JSZip from 'jszip';
import DestructiveConfirmModal from '../DestructiveConfirmModal';
import ExportSkillsModal from '../assistants/ExportSkillsModal';
import { useToast } from '../../context/ToastContext';
import { toErrorMessage } from '../../utils/errors';
import { useModalA11y } from '../../hooks/useModalA11y';
import {
  buildSkillMarkdownDocument,
  normalizeRegistrySkillForExport,
  parseSkillMarkdown,
} from '../../utils/skillExportUtils';

interface RegistrySkillDetailModalProps {
  skill: RegistrySkill | null;
  isOpen: boolean;
  onClose: () => void;
  config: Config;
  onSkillUpdated: () => void;
}

const resolveEffectivePolicy = (
  skill: RegistrySkill | null,
): SkillScanningPolicy | 'GOOGLE_VERIFIED' => {
  if (!skill) return 'ENABLED_BLOCKING';
  const explicit = skill.scanningConfig?.policy;
  if (
    explicit === 'ENABLED_BLOCKING' ||
    explicit === 'ENABLED_NONBLOCKING' ||
    explicit === 'DISABLED'
  ) {
    return explicit;
  }
  const pub = (skill.publisher || '').toLowerCase();
  if (pub.includes('cloud.google.com') || pub.includes('discoveryengine.googleapis.com')) {
    return 'GOOGLE_VERIFIED';
  }
  return 'ENABLED_BLOCKING';
};

const getSeverityBadgeStyle = (severity?: string): string => {
  switch (severity) {
    case 'SEVERITY_CRITICAL':
      return 'bg-red-950/80 text-red-200 border-red-600';
    case 'SEVERITY_HIGH':
      return 'bg-orange-950/80 text-orange-200 border-orange-600';
    case 'SEVERITY_MEDIUM':
      return 'bg-amber-950/80 text-amber-200 border-amber-600';
    case 'SEVERITY_LOW':
      return 'bg-blue-950/80 text-blue-200 border-blue-600';
    default:
      return 'bg-gray-800 text-gray-300 border-gray-600';
  }
};

const RegistrySkillDetailModal: React.FC<RegistrySkillDetailModalProps> = ({
  skill,
  isOpen,
  onClose,
  config,
  onSkillUpdated,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mdFileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'overview' | 'revisions' | 'findings' | 'json'>('overview');
  const [revisions, setRevisions] = useState<RegistrySkillRevision[]>([]);
  const [isLoadingRevisions, setIsLoadingRevisions] = useState(false);
  const [findings, setFindings] = useState<RegistrySkillFinding[]>([]);
  const [isLoadingFindings, setIsLoadingFindings] = useState(false);
  const [findingsError, setFindingsError] = useState<string | null>(null);

  const [availableEngines, setAvailableEngines] = useState<AppEngine[]>([]);
  const [selectedEngineId, setSelectedEngineId] = useState<string>('');
  const [deployMode, setDeployMode] = useState<'LINKED_REGISTRY' | 'INLINE_COPY'>('LINKED_REGISTRY');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isUpdatingScanPolicy, setIsUpdatingScanPolicy] = useState(false);
  const [selectedScanPolicy, setSelectedScanPolicy] = useState<SkillScanningPolicy>('ENABLED_BLOCKING');
  const [deploySuccess, setDeploySuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);

  // SKILL.md Editing State for Central Registry
  const [isEditingSkillMd, setIsEditingSkillMd] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [skillMdContent, setSkillMdContent] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  const [backgroundWarnings, setBackgroundWarnings] = useState<string[]>([]);
  const [revisionsError, setRevisionsError] = useState<string | null>(null);

  useModalA11y({
    isOpen: isOpen && !!skill,
    onClose,
    containerRef,
    preventClose: isUpdating || isUpdatingScanPolicy || isDeleteConfirmOpen || isExportOpen,
  });

  const loadSkillFindings = useCallback(
    async (skillName: string, loadedRevisions: RegistrySkillRevision[]) => {
      if (typeof api.listRegistryFindings !== 'function') {
        setFindings([]);
        return;
      }
      setIsLoadingFindings(true);
      setFindingsError(null);
      try {
        const revsWithFindings = loadedRevisions.filter(
          (r) => Array.isArray(r.scanResult?.findings) && r.scanResult!.findings!.length > 0,
        );
        if (revsWithFindings.length > 0) {
          const perRevLists = await Promise.all(
            revsWithFindings.map((r) =>
              api.listRegistryFindings(config, `resource="${r.name}"`),
            ),
          );
          const deduped = new Map<string, RegistrySkillFinding>();
          perRevLists.flat().forEach((f) => {
            if (f?.name) deduped.set(f.name, f);
          });
          setFindings(Array.from(deduped.values()));
        } else {
          const allLocationFindings = await api.listRegistryFindings(config);
          const prefix = `${skillName}/revisions/`;
          setFindings(
            allLocationFindings.filter(
              (f) => typeof f.resource === 'string' && f.resource.startsWith(prefix),
            ),
          );
        }
      } catch (err: unknown) {
        setFindingsError(toErrorMessage(err));
      } finally {
        setIsLoadingFindings(false);
      }
    },
    [config],
  );

  useEffect(() => {
    if (isOpen && skill) {
      const effectivePolicy = resolveEffectivePolicy(skill);
      setSelectedScanPolicy(
        effectivePolicy === 'GOOGLE_VERIFIED' ? 'ENABLED_BLOCKING' : effectivePolicy,
      );

      const rawId = skill.name.split('/').pop() || 'skill';
      const cleanId = rawId.replace(/^private-(?:admin-mcp-|byomcp-)?/, '');
      const fallbackMd = buildSkillMarkdownDocument({
        name: cleanId,
        description: skill.description || skill.displayName,
        body:
          (typeof skill.frontmatter?.instruction === 'string' && skill.frontmatter.instruction) ||
          `# ${skill.displayName}\n\n${skill.description || 'Enterprise Skill for Gemini Enterprise.'}`,
      });
      setEditDisplayName(skill.displayName || cleanId);
      setEditDescription(skill.description || '');
      setSkillMdContent(fallbackMd);
      setIsEditingSkillMd(false);
      setEditError(null);
      setFindings([]);
      setFindingsError(null);

      setBackgroundWarnings([]);
      setRevisionsError(null);
      setIsLoadingRevisions(true);
      api
        .listRegistrySkillRevisions(skill.name, config)
        .then(async (revs) => {
          setRevisions(revs);
          const hasAnyReportedFindings = revs.some(
            (r) => Array.isArray(r.scanResult?.findings) && r.scanResult!.findings!.length > 0,
          );
          if (hasAnyReportedFindings) {
            void loadSkillFindings(skill.name, revs);
          }

          const activeRev =
            revs.find(
              (r: RegistrySkillRevision) => r.name === skill.defaultRevision || r.state === 'ACTIVE',
            ) || revs[0];
          const archiveContent =
            activeRev?.archiveUploadSource?.archiveContent ||
            skill.initialRevision?.archiveUploadSource?.archiveContent;
          if (archiveContent) {
            try {
              const zip = await JSZip.loadAsync(archiveContent, { base64: true });
              const skillMdFile = zip.file('SKILL.md') || zip.file(/SKILL\.md$/i)[0];
              if (skillMdFile) {
                const extractedText = await skillMdFile.async('text');
                if (extractedText.trim()) {
                  setSkillMdContent(extractedText);
                }
              }
            } catch (zipErr: unknown) {
              console.warn('Could not extract SKILL.md from revision archive on open:', zipErr);
            }
          }
        })
        .catch((err: unknown) => {
          console.warn('Could not load revisions for skill:', err);
          const msg = toErrorMessage(err);
          setRevisionsError(msg);
          setBackgroundWarnings((prev) => [...prev, `Could not load skill revisions: ${msg}`]);
        })
        .finally(() => setIsLoadingRevisions(false));

      if (typeof api.listResources === 'function') {
        api
          .listResources<AppEngine>('engines', config)
          .then((res) => {
            const list = res.engines || res.resources || [];
            setAvailableEngines(list);
            if (list.length > 0) {
              const pref =
                list.find(
                  (e: AppEngine) =>
                    e.solutionType === 'SOLUTION_TYPE_CHAT' || e.name?.includes('cosmere'),
                ) || list[0];
              const id = pref.name ? pref.name.split('/').pop() : (pref.id as string | undefined);
              setSelectedEngineId(id || '');
            }
          })
          .catch((err: unknown) => {
            console.warn('Could not fetch engines for skill deploy:', err);
            setBackgroundWarnings((prev) => [
              ...prev,
              `Could not list target Gemini Enterprise Apps (${toErrorMessage(err)}). Deployment will attempt default engine discovery.`,
            ]);
          });
      }
    }
  }, [isOpen, skill, config, loadSkillFindings]);

  if (!isOpen || !skill) return null;

  const effectivePolicy = resolveEffectivePolicy(skill);
  const isFirstPartySkill = effectivePolicy === 'GOOGLE_VERIFIED';

  const totalRevisionFindingRefs = revisions.reduce(
    (sum, r) => sum + (r.scanResult?.findings?.length || 0),
    0,
  );
  const findingsCountBadge = Math.max(findings.length, totalRevisionFindingRefs);

  const handleOpenFindingsTab = () => {
    setActiveTab('findings');
    if (findings.length === 0 && !isLoadingFindings) {
      void loadSkillFindings(skill.name, revisions);
    }
  };

  const handleUpdateScanPolicy = async () => {
    setIsUpdatingScanPolicy(true);
    try {
      if (typeof api.updateRegistrySkillScanningPolicy === 'function') {
        await api.updateRegistrySkillScanningPolicy(skill.name, selectedScanPolicy, config);
      } else {
        await api.updateRegistrySkill(
          skill.name,
          { scanningConfig: { policy: selectedScanPolicy } },
          ['scanningConfig'],
          config,
        );
      }
      toast.success(
        `Updated security auto-scanning policy to ${selectedScanPolicy}. Applies to newly uploaded revisions.`,
      );
      onSkillUpdated();
    } catch (err: unknown) {
      const msg = toErrorMessage(err);
      toast.error(`Failed to update scanning policy: ${msg}`);
    } finally {
      setIsUpdatingScanPolicy(false);
    }
  };

  const handleImportRegistryMdFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result || '');
      try {
        const parsed = parseSkillMarkdown(text);
        if (parsed.description) {
          setEditDescription(parsed.description);
        }
        if (parsed.displayName) {
          setEditDisplayName(parsed.displayName);
        }
        setSkillMdContent(text);
        toast.success(`Imported ${file.name} into SKILL.md editor.`);
      } catch (err) {
        setEditError(toErrorMessage(err));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSaveRegistrySkillMd = async () => {
    setEditError(null);
    const rawId = skill.name.split('/').pop() || 'skill';
    const cleanId = rawId.replace(/^private-(?:admin-mcp-|byomcp-)?/, '');

    if (!skillMdContent.trim()) {
      setEditError('SKILL.md Markdown instructions cannot be empty.');
      return;
    }

    let finalDoc = skillMdContent.trim();
    let finalDesc = editDescription.trim();
    try {
      const parsed = parseSkillMarkdown(finalDoc);
      if (parsed.hasFrontmatter) {
        if (parsed.description && !finalDesc) {
          finalDesc = parsed.description.trim();
        }
        finalDoc = buildSkillMarkdownDocument({
          name: parsed.name || cleanId,
          description: finalDesc || parsed.description || editDisplayName,
          body: parsed.body,
        });
      } else {
        finalDoc = buildSkillMarkdownDocument({
          name: cleanId,
          description: finalDesc || editDisplayName,
          body: finalDoc,
        });
      }
    } catch (err) {
      setEditError(toErrorMessage(err));
      return;
    }

    setIsUpdating(true);
    try {
      const zip = new JSZip();
      zip.file('SKILL.md', finalDoc);
      const b64Zip = await zip.generateAsync({ type: 'base64' });

      const newRev = await api.createRegistrySkillRevision(
        skill.name,
        {
          archiveUploadSource: {
            archiveContent: b64Zip,
          },
        },
        config,
      );

      const revScanState = newRev?.scanResult?.scanState;
      const revFindingsCount = newRev?.scanResult?.findings?.length || 0;
      const isBlockedOrScanning =
        effectivePolicy === 'ENABLED_BLOCKING' &&
        (revScanState === 'RUNNING' || revFindingsCount > 0);

      const updatePayload: Partial<RegistrySkill> = {
        displayName: editDisplayName.trim() || skill.displayName,
        description: finalDesc || skill.description,
      };
      const updateMask = ['display_name', 'description'];
      if (newRev?.name && !isBlockedOrScanning) {
        updatePayload.defaultRevision = newRev.name;
        updateMask.push('default_revision');
      }

      await api.updateRegistrySkill(skill.name, updatePayload, updateMask, config);
      setSkillMdContent(finalDoc);
      setIsEditingSkillMd(false);

      if (revFindingsCount > 0) {
        toast.error(
          `Revision uploaded, but blocked from defaultRevision promotion (${revFindingsCount} security findings detected).`,
        );
      } else if (isBlockedOrScanning) {
        toast.info(
          `Uploaded new revision ${newRev.name.split('/').pop()}. Agent Registry is running the blocking security scan before defaultRevision promotion.`,
        );
      } else {
        toast.success(`Published new SKILL.md revision for "${updatePayload.displayName}".`);
      }
      onSkillUpdated();
    } catch (err: unknown) {
      console.error('Failed to publish updated SKILL.md revision:', err);
      const msg = toErrorMessage(err);
      setEditError(msg);
      toast.error(`Failed to update SKILL.md: ${msg}`);
    } finally {
      setIsUpdating(false);
    }
  };

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
      const cleanId = rawId.replace(/^private-(?:admin-mcp-|byomcp-)?/, '');
      const sanitizedAgentId =
        cleanId
          .replace(/^(discoveryengine\.googleapis\.com|cloud\.google\.com)-?/, '')
          .replace(/[^a-z0-9-_]/gi, '-')
          .toLowerCase()
          .replace(/^-+|-+$/g, '') || 'skill';

      let promptInstruction = skill.description || skill.displayName;
      if (deployMode === 'INLINE_COPY') {
        try {
          const activeRev =
            revisions.find(
              (r: RegistrySkillRevision) => r.name === skill.defaultRevision || r.state === 'ACTIVE',
            ) || revisions[0];
          const archiveContent =
            activeRev?.archiveUploadSource?.archiveContent ||
            skill.initialRevision?.archiveUploadSource?.archiveContent;
          if (archiveContent) {
            const zip = await JSZip.loadAsync(archiveContent, { base64: true });
            const skillMd = zip.file('SKILL.md') || zip.file(/SKILL\.md$/i)[0];
            if (skillMd) {
              promptInstruction = await skillMd.async('text');
            }
          } else if (skillMdContent.trim()) {
            promptInstruction = skillMdContent.trim();
          }
        } catch (zipErr: unknown) {
          console.warn(
            'Could not extract SKILL.md from revision archive, falling back to description:',
            zipErr,
          );
          setBackgroundWarnings((prev) => [
            ...prev,
            `Could not extract SKILL.md from revision archive (fell back to skill description): ${toErrorMessage(zipErr)}`,
          ]);
        }
      }

      const safeSkillDisplayName =
        String(skill.displayName || sanitizedAgentId)
          .replace(/&/g, ' and ')
          .replace(/[/_.:+]+/g, ' ')
          .replace(/[^a-zA-Z0-9\s-]/g, ' ')
          .replace(/\s+/g, ' ')
          .replace(/-+/g, '-')
          .replace(/^[\s-]+|[\s-]+$/g, '')
          .slice(0, 64)
          .replace(/^[\s-]+|[\s-]+$/g, '') || sanitizedAgentId;

      const payload: Partial<Agent> = {
        displayName: safeSkillDisplayName,
        description: skill.description || skill.displayName,
        state: 'ENABLED',
        sharingConfig: {
          scope: 'ALL_USERS',
        },
        skillAgentDefinition:
          deployMode === 'LINKED_REGISTRY'
            ? {
                agentRegistrySkill: skill.name,
              }
            : {
                instruction: promptInstruction,
              },
      };

      const targetConfig = { ...config };
      if (selectedEngineId) {
        targetConfig.appId = selectedEngineId;
      } else if (!targetConfig.appId || targetConfig.appId === 'default_engine') {
        const enginesRes = await api.listResources<AppEngine>('engines', config);
        const engines = enginesRes.engines || enginesRes.resources || [];
        if (engines.length === 0) {
          throw new Error(
            `No engines found in project ${config.projectId} (${config.appLocation}). Please ensure an engine exists in this region.`,
          );
        }
        const targetEngine =
          engines.find(
            (e: AppEngine) => e.solutionType === 'SOLUTION_TYPE_CHAT' || e.name?.includes('cosmere'),
          ) || engines[0];
        const engineId = targetEngine.name
          ? targetEngine.name.split('/').pop()
          : (targetEngine.id as string | undefined);
        targetConfig.appId = engineId || '';
      }

      const agentResourceName = `projects/${targetConfig.projectId}/locations/${targetConfig.appLocation}/collections/${targetConfig.collectionId || 'default_collection'}/engines/${targetConfig.appId}/assistants/${targetConfig.assistantId || 'default_assistant'}/agents/${sanitizedAgentId}`;
      let deployedAgent: Agent;
      try {
        deployedAgent = await api.createAgent(payload, targetConfig, sanitizedAgentId, true);
      } catch (createErr: unknown) {
        const errMsg = toErrorMessage(createErr);
        const isConflict =
          errMsg.includes('already exists') ||
          (typeof createErr === 'object' &&
            createErr !== null &&
            'status' in createErr &&
            (createErr as { status: unknown }).status === 409);
        if (isConflict) {
          deployedAgent = await api.updateAgent(
            {
              name: agentResourceName,
              id: sanitizedAgentId,
              displayName: skill.displayName || skill.name,
            },
            payload,
            targetConfig,
          );
        } else {
          throw createErr;
        }
      }

      if (typeof api.promoteSkillToOrg === 'function') {
        await api.promoteSkillToOrg(
          deployedAgent?.name
            ? deployedAgent
            : { name: agentResourceName, displayName: skill.displayName || sanitizedAgentId },
          targetConfig,
        );
      }

      setDeploySuccess(true);
      toast.success(
        `Published "${safeSkillDisplayName}" to Gemini Enterprise Browse skills gallery (${deployMode === 'LINKED_REGISTRY' ? 'Linked Registry Skill' : 'Inline SKILL.md Copy'}). Employees can click "+ Install" in the web app.`,
      );
      setTimeout(() => setDeploySuccess(false), 3500);
      onSkillUpdated();
    } catch (err: unknown) {
      console.error('Failed to deploy skill to GE engine assistant:', err);
      toast.error(`Failed to deploy skill: ${toErrorMessage(err)}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateTargetState = async (newState: string) => {
    setIsUpdating(true);
    try {
      let defaultRev = skill.defaultRevision;

      if (newState === 'TARGET_STATE_ACTIVE') {
        let revs =
          revisions.length > 0 ? revisions : await api.listRegistrySkillRevisions(skill.name, config);

        if (!revs || revs.length === 0) {
          const rawId = skill.name.split('/').pop() || 'skill';
          const cleanId = rawId.replace(/^private-(?:admin-mcp-|byomcp-)?/, '');
          const zip = new JSZip();
          zip.file(
            'SKILL.md',
            `---\nname: ${cleanId}\ndescription: ${skill.description || skill.displayName}\n---\n\n# ${skill.displayName}\n\n${skill.description || 'Enterprise Skill for Gemini Enterprise.'}`,
          );
          const b64Zip = await zip.generateAsync({ type: 'base64' });

          await api.createRegistrySkillRevision(
            skill.name,
            {
              archiveUploadSource: {
                archiveContent: b64Zip,
              },
            },
            config,
          );
          revs = await api.listRegistrySkillRevisions(skill.name, config);
        }

        const candidateRev = revs.find((r) => r.state === 'ACTIVE') || revs[0];
        if (
          effectivePolicy === 'ENABLED_BLOCKING' &&
          candidateRev?.scanResult?.findings &&
          candidateRev.scanResult.findings.length > 0
        ) {
          throw new Error(
            `Cannot activate skill: revision ${candidateRev.name.split('/').pop()} has ${candidateRev.scanResult.findings.length} blocking security finding(s). Inspect the Security Findings tab to remediate.`,
          );
        }
        if (candidateRev && !defaultRev) {
          defaultRev = candidateRev.name;
        }
      }

      const payload: Partial<RegistrySkill> = { targetState: newState };
      const updateMask = ['target_state'];

      if (defaultRev && newState === 'TARGET_STATE_ACTIVE') {
        payload.defaultRevision = defaultRev;
        updateMask.push('default_revision');
      }

      await api.updateRegistrySkill(skill.name, payload, updateMask, config);
      onSkillUpdated();
    } catch (err: unknown) {
      console.error('Failed to update skill state:', err);
      toast.error(`Failed to update state: ${toErrorMessage(err)}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const confirmDeleteSkill = async () => {
    setIsUpdating(true);
    try {
      await api.deleteRegistrySkill(skill.name, config);
      setIsDeleteConfirmOpen(false);
      onSkillUpdated();
      onClose();
    } catch (err: unknown) {
      console.error('Failed to delete skill:', err);
      toast.error(`Failed to delete skill: ${toErrorMessage(err)}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePromoteRevision = async (rev: RegistrySkillRevision) => {
    setIsUpdating(true);
    try {
      await api.updateRegistrySkill(
        skill.name,
        { defaultRevision: rev.name },
        ['default_revision'],
        config,
      );
      toast.success(`Promoted revision ${rev.name.split('/').pop()} as default serving revision.`);
      onSkillUpdated();
    } catch (err: unknown) {
      toast.error(`Failed to promote revision: ${toErrorMessage(err)}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const skillId = skill.name.split('/').pop() || '';
  const publisher = skill.publisher ? skill.publisher.split('/').pop() : 'Default (Organization)';

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/70 flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="registry-skill-detail-title"
      onClick={(e) => {
        if (
          e.target === e.currentTarget &&
          !isUpdating &&
          !isUpdatingScanPolicy &&
          !isDeleteConfirmOpen
        ) {
          onClose();
        }
      }}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="bg-gray-850 rounded-xl max-w-4xl w-full border border-gray-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-gray-900 border-b border-gray-700 flex justify-between items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-purple-900/40 text-purple-400 border border-purple-700/50 rounded-lg shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 id="registry-skill-detail-title" className="text-base font-bold text-gray-100">
                  {skill.displayName}
                </h3>
                <span
                  className={`px-2 py-0.5 text-[10px] font-bold rounded border ${
                    skill.state === 'STATE_ACTIVE'
                      ? 'bg-green-900/40 text-green-300 border-green-700'
                      : skill.state === 'STATE_DRAFT'
                      ? 'bg-yellow-900/40 text-yellow-300 border-yellow-700'
                      : 'bg-gray-800 text-gray-400 border-gray-700'
                  }`}
                >
                  {skill.state || 'STATE_ACTIVE'}
                </span>
                <span
                  className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${
                    effectivePolicy === 'ENABLED_BLOCKING'
                      ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700'
                      : effectivePolicy === 'ENABLED_NONBLOCKING'
                      ? 'bg-cyan-900/40 text-cyan-300 border-cyan-700'
                      : effectivePolicy === 'GOOGLE_VERIFIED'
                      ? 'bg-blue-900/40 text-blue-300 border-blue-700'
                      : 'bg-gray-800 text-gray-400 border-gray-600'
                  }`}
                >
                  {effectivePolicy === 'ENABLED_BLOCKING'
                    ? '🛡️ Blocking Scan'
                    : effectivePolicy === 'ENABLED_NONBLOCKING'
                    ? '👁️ Non-Blocking Audit'
                    : effectivePolicy === 'GOOGLE_VERIFIED'
                    ? '✨ Google 1P Verified'
                    : '⚪ Auto-Scan Off'}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 font-mono mt-0.5 break-all">{skill.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsExportOpen(true)}
              className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 border border-gray-600"
              title="Export this Registry Skill to SKILL.md, JSON, or CSV"
            >
              <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="text-gray-400 hover:text-gray-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div
          role="tablist"
          aria-label="Skill inspector tabs"
          className="flex flex-wrap border-b border-gray-700 bg-gray-900/40 px-6"
        >
          <button
            type="button"
            role="tab"
            id="reg-tab-overview"
            aria-selected={activeTab === 'overview'}
            onClick={() => setActiveTab('overview')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            Overview &amp; Specification
          </button>
          <button
            type="button"
            role="tab"
            id="reg-tab-revisions"
            aria-selected={activeTab === 'revisions'}
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
            type="button"
            role="tab"
            id="reg-tab-findings"
            data-testid="registry-skill-findings-tab"
            aria-selected={activeTab === 'findings'}
            onClick={handleOpenFindingsTab}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'findings'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            <span>🛡️ Security Findings</span>
            {findingsCountBadge > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-red-900/70 text-red-200 border border-red-700">
                {findingsCountBadge}
              </span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            id="reg-tab-json"
            aria-selected={activeTab === 'json'}
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
          {backgroundWarnings.length > 0 && (
            <div
              role="alert"
              data-testid="registry-skill-warnings-banner"
              className="p-3 bg-amber-950/40 border border-amber-700/80 rounded-lg text-xs text-amber-200 space-y-1"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold">⚠️ Skill Inspection Warning</span>
                <button
                  type="button"
                  onClick={() => setBackgroundWarnings([])}
                  className="text-[11px] underline text-amber-300 hover:text-white"
                >
                  Dismiss
                </button>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                {backgroundWarnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {activeTab === 'overview' && (
            <div role="tabpanel" aria-labelledby="reg-tab-overview" className="space-y-4">
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
                  <div className="text-xs text-purple-300 font-semibold mt-0.5">{publisher}</div>
                </div>
              </div>

              {/* Per-Skill Security Auto-Scanning Policy Card */}
              <div
                data-testid="registry-skill-scanning-policy-card"
                className="p-3.5 bg-gray-900/70 rounded-lg border border-emerald-700/40 space-y-2"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-gray-100 flex items-center gap-1.5">
                      <span>🛡️ Automated Security Scanning Policy</span>
                      <code className="text-[10px] font-mono text-emerald-300 bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-800">
                        scanningConfig.policy
                      </code>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {isFirstPartySkill
                        ? 'Google 1st-party published skills are verified upstream by Google Cloud.'
                        : 'Controls LLM vulnerability and secret scanning for newly uploaded revisions of this skill (non-retroactive).'}
                    </p>
                  </div>
                  {!isFirstPartySkill && (
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        aria-label="Skill security scanning policy"
                        data-testid="registry-skill-scan-policy-select"
                        value={selectedScanPolicy}
                        onChange={(e) => setSelectedScanPolicy(e.target.value as SkillScanningPolicy)}
                        disabled={isUpdatingScanPolicy}
                        className="px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-200 font-semibold focus:outline-none focus:border-blue-500"
                      >
                        <option value="ENABLED_BLOCKING">🛡️ Blocking (Default)</option>
                        <option value="ENABLED_NONBLOCKING">👁️ Non-Blocking (Audit)</option>
                        <option value="DISABLED">⚪ Disabled</option>
                      </select>
                      <button
                        type="button"
                        data-testid="save-registry-scan-policy-btn"
                        disabled={isUpdatingScanPolicy || selectedScanPolicy === effectivePolicy}
                        onClick={() => void handleUpdateScanPolicy()}
                        className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition-colors"
                      >
                        {isUpdatingScanPolicy ? 'Saving...' : 'Apply Policy'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Semantic Activation Trigger &amp; Description
                </label>
                <div className="p-3 bg-gray-900 rounded-lg border border-gray-700 text-xs text-gray-200 leading-relaxed">
                  {skill.description || 'No description provided.'}
                </div>
              </div>

              {/* SKILL.md Markdown Instructions Viewer & Editor */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-xs font-semibold text-gray-300">
                    Global Skill Instructions (<code className="font-mono text-purple-300">SKILL.md</code>)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      ref={mdFileInputRef}
                      type="file"
                      accept=".md,.markdown,.txt"
                      onChange={handleImportRegistryMdFile}
                      className="hidden"
                      data-testid="registry-skill-md-file-input"
                    />
                    {isEditingSkillMd && (
                      <button
                        type="button"
                        onClick={() => mdFileInputRef.current?.click()}
                        className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded text-xs font-semibold border border-gray-600 transition-colors"
                      >
                        📂 Import `.md` File
                      </button>
                    )}
                    {!isFirstPartySkill && (
                      <button
                        type="button"
                        data-testid="toggle-edit-registry-skill-md-btn"
                        onClick={() => {
                          setIsEditingSkillMd((prev) => !prev);
                          setEditError(null);
                        }}
                        className={`px-2.5 py-1 rounded text-xs font-semibold border transition-colors ${
                          isEditingSkillMd
                            ? 'bg-purple-600 text-white border-purple-500'
                            : 'bg-purple-950/60 hover:bg-purple-900/70 text-purple-200 border-purple-700/70'
                        }`}
                      >
                        ✏️ {isEditingSkillMd ? 'Editing SKILL.md' : 'Edit SKILL.md'}
                      </button>
                    )}
                  </div>
                </div>

                {isEditingSkillMd ? (
                  <div
                    data-testid="registry-skill-md-editor"
                    className="p-4 bg-gray-900/90 border border-purple-700/70 rounded-xl space-y-3"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="registry-edit-display-name"
                          className="block text-xs font-semibold text-gray-300 mb-1"
                        >
                          Display Name
                        </label>
                        <input
                          id="registry-edit-display-name"
                          type="text"
                          value={editDisplayName}
                          onChange={(e) => setEditDisplayName(e.target.value)}
                          className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:border-purple-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="registry-edit-description"
                          className="block text-xs font-semibold text-gray-300 mb-1"
                        >
                          Trigger Description
                        </label>
                        <input
                          id="registry-edit-description"
                          type="text"
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:border-purple-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="registry-edit-skill-md-textarea"
                        className="block text-xs font-semibold text-gray-300 mb-1"
                      >
                        `SKILL.md` Markdown Content (YAML Frontmatter + Instructions)
                      </label>
                      <textarea
                        id="registry-edit-skill-md-textarea"
                        data-testid="registry-edit-skill-md-textarea"
                        rows={12}
                        value={skillMdContent}
                        onChange={(e) => setSkillMdContent(e.target.value)}
                        className="w-full bg-gray-950 border border-gray-700 rounded-lg p-3 text-xs font-mono text-gray-100 leading-relaxed focus:border-purple-500 focus:outline-none"
                      />
                    </div>

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
                          setIsEditingSkillMd(false);
                          setEditError(null);
                        }}
                        className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-semibold transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        data-testid="save-registry-skill-md-btn"
                        disabled={isUpdating}
                        onClick={() => void handleSaveRegistrySkillMd()}
                        className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 text-white rounded-lg text-xs font-bold shadow transition-colors"
                      >
                        {isUpdating
                          ? 'Publishing Revision...'
                          : '💾 Save & Publish New SKILL.md Revision'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <pre className="p-3.5 bg-gray-900 rounded-lg border border-gray-700 font-mono text-xs text-gray-200 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                    {skillMdContent}
                  </pre>
                )}
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
            <div role="tabpanel" aria-labelledby="reg-tab-revisions" className="space-y-3">
              {isLoadingRevisions ? (
                <div className="text-center py-8 text-xs text-gray-400">Loading revisions...</div>
              ) : revisionsError ? (
                <div className="p-4 bg-red-900/30 border border-red-700/80 rounded-lg text-xs text-red-200">
                  Failed to load skill revisions from Cloud Agent Registry: {revisionsError}
                </div>
              ) : revisions.length === 0 ? (
                <div className="text-center py-8 text-xs text-gray-400">
                  No revisions recorded for this skill.
                </div>
              ) : (
                revisions.map((rev) => {
                  const scanState = rev.scanResult?.scanState;
                  const revFindingCount = rev.scanResult?.findings?.length || 0;
                  const isDefault = skill.defaultRevision === rev.name;

                  return (
                    <div
                      key={rev.name}
                      className="p-3.5 bg-gray-900 rounded-lg border border-gray-700/80 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-100 font-mono">
                            {rev.name.split('/').pop()}
                          </span>
                          {isDefault && (
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-purple-900/50 text-purple-200 rounded border border-purple-700">
                              DEFAULT SERVING
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {scanState && (
                            <span
                              className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${
                                scanState === 'SUCCEEDED' && revFindingCount === 0
                                  ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700'
                                  : revFindingCount > 0
                                  ? 'bg-red-900/50 text-red-200 border-red-700'
                                  : scanState === 'RUNNING'
                                  ? 'bg-amber-900/40 text-amber-300 border-amber-700'
                                  : scanState === 'DISABLED'
                                  ? 'bg-gray-800 text-gray-400 border-gray-600'
                                  : 'bg-orange-900/50 text-orange-200 border-orange-700'
                              }`}
                            >
                              {scanState === 'SUCCEEDED' && revFindingCount === 0
                                ? '🛡️ Scan Clean'
                                : revFindingCount > 0
                                ? `🚨 ${revFindingCount} Finding${revFindingCount === 1 ? '' : 's'}`
                                : scanState === 'RUNNING'
                                ? '⏳ Scanning...'
                                : `Scan: ${scanState}`}
                            </span>
                          )}
                          <span className="px-2 py-0.5 text-[10px] font-semibold bg-blue-900/40 text-blue-300 rounded border border-blue-700">
                            {rev.state || 'ACTIVE'}
                          </span>
                        </div>
                      </div>

                      {rev.scanResult?.errorMessage && (
                        <div className="text-[11px] text-orange-300 bg-orange-950/30 border border-orange-800/60 rounded px-2.5 py-1.5">
                          Scanner Error: {rev.scanResult.errorMessage}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-gray-400">
                        <div className="space-x-3">
                          {rev.sha256Hash && (
                            <span className="font-mono">SHA256: {rev.sha256Hash.slice(0, 20)}...</span>
                          )}
                          {rev.createTime && (
                            <span>Created: {new Date(rev.createTime).toLocaleString()}</span>
                          )}
                          {rev.scanResult?.scanTime && (
                            <span>Scanned: {new Date(rev.scanResult.scanTime).toLocaleString()}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {revFindingCount > 0 && (
                            <button
                              type="button"
                              onClick={handleOpenFindingsTab}
                              className="px-2 py-0.5 bg-red-900/40 hover:bg-red-900/70 text-red-200 border border-red-700 rounded text-[10px] font-semibold transition-colors"
                            >
                              View Findings →
                            </button>
                          )}
                          {!isDefault &&
                            !isFirstPartySkill &&
                            !(effectivePolicy === 'ENABLED_BLOCKING' && revFindingCount > 0) &&
                            scanState !== 'RUNNING' && (
                              <button
                                type="button"
                                disabled={isUpdating}
                                onClick={() => void handlePromoteRevision(rev)}
                                className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 text-blue-300 border border-gray-600 rounded text-[10px] font-semibold transition-colors"
                              >
                                Set as Default
                              </button>
                            )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'findings' && (
            <div role="tabpanel" aria-labelledby="reg-tab-findings" className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-gray-200">
                    Agent Registry LLM Security Scan Findings
                  </h4>
                  <p className="text-[11px] text-gray-400">
                    Detects prompt injection, data exfiltration vectors, unsafe scripts, and hardcoded credentials across <code className="font-mono">SKILL.md</code>, <code className="font-mono">scripts/</code>, and <code className="font-mono">assets/</code>.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isLoadingFindings}
                  onClick={() => void loadSkillFindings(skill.name, revisions)}
                  className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded text-xs font-semibold border border-gray-600 transition-colors shrink-0"
                >
                  {isLoadingFindings ? 'Refreshing...' : '↻ Refresh Findings'}
                </button>
              </div>

              {isLoadingFindings ? (
                <div className="text-center py-8 text-xs text-gray-400">
                  Querying security findings from Cloud Agent Registry...
                </div>
              ) : findingsError ? (
                <div
                  role="alert"
                  className="p-4 bg-amber-950/40 border border-amber-700/80 rounded-lg text-xs text-amber-200 space-y-1.5"
                >
                  <div className="font-bold">Could Not Retrieve Detailed Security Findings</div>
                  <div className="font-mono text-[11px] break-all">{findingsError}</div>
                  <p className="text-amber-200/80 text-[11px]">
                    Viewing detailed <code className="font-mono">Finding</code> resources in Agent Registry requires <code className="font-mono">roles/agentregistry.admin</code> on project <code className="font-mono">{config.projectId}</code>.
                  </p>
                </div>
              ) : findings.length === 0 ? (
                <div className="p-6 bg-emerald-950/20 border border-emerald-800/50 rounded-lg text-center space-y-1">
                  <div className="text-sm font-bold text-emerald-300">
                    🛡️ No Security Findings Detected
                  </div>
                  <p className="text-xs text-gray-400">
                    No vulnerabilities or secrets were reported across the scanned revisions of this skill.
                  </p>
                </div>
              ) : (
                <div className="space-y-3" data-testid="registry-skill-findings-list">
                  {findings.map((finding) => {
                    const revShort = finding.resource?.split('/').pop() || 'revision';
                    return (
                      <div
                        key={finding.name}
                        className="p-4 bg-gray-900 border border-red-800/60 rounded-lg space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`px-2 py-0.5 text-[10px] font-bold rounded border ${getSeverityBadgeStyle(finding.severity)}`}
                            >
                              {(finding.severity || 'SEVERITY_UNSPECIFIED').replace('SEVERITY_', '')}
                            </span>
                            {finding.findingClass && (
                              <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-purple-950/60 text-purple-200 rounded border border-purple-700">
                                {finding.findingClass}
                              </span>
                            )}
                            <span className="text-[11px] font-mono text-gray-400">
                              Revision: <strong className="text-gray-200">{revShort}</strong>
                            </span>
                          </div>
                          {finding.createTime && (
                            <span className="text-[10px] text-gray-500">
                              {new Date(finding.createTime).toLocaleString()}
                            </span>
                          )}
                        </div>

                        {finding.detail && (
                          <p className="text-xs text-gray-200 leading-relaxed">{finding.detail}</p>
                        )}

                        {finding.files && finding.files.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            <span className="text-[10px] text-gray-400 font-semibold">
                              Affected Files:
                            </span>
                            {finding.files.map((f, idx) => (
                              <code
                                key={`${f.path}-${idx}`}
                                className="px-2 py-0.5 bg-gray-950 border border-gray-700 rounded text-[11px] font-mono text-amber-300"
                              >
                                {f.path}
                                {f.lineNumber !== undefined ? `:${f.lineNumber}` : ''}
                              </code>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'json' && (
            <div role="tabpanel" aria-labelledby="reg-tab-json" className="space-y-4">
              <div className="relative">
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="absolute top-2 right-2 px-2.5 py-1 bg-gray-750 hover:bg-gray-700 text-gray-300 hover:text-white rounded text-xs font-semibold transition-colors border border-gray-600"
                >
                  {copied ? '✓ Copied' : 'Copy JSON'}
                </button>
                <pre className="p-4 bg-gray-900 rounded-lg border border-gray-700 font-mono text-[11px] text-gray-300 overflow-x-auto max-h-96">
                  {JSON.stringify(skill, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-gray-900 border-t border-gray-700 flex flex-wrap justify-between items-center gap-3">
          <button
            type="button"
            onClick={() => setIsDeleteConfirmOpen(true)}
            disabled={isUpdating || isFirstPartySkill}
            className="px-3.5 py-2 text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-900/20 disabled:opacity-40 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete Skill
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {availableEngines.length > 0 && (
              <div
                className="flex items-center bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 max-w-[200px]"
                title="Target Gemini Enterprise App"
              >
                <span className="text-[11px] text-gray-400 font-semibold mr-1.5 shrink-0">App:</span>
                <select
                  aria-label="Target Gemini Enterprise App"
                  value={selectedEngineId}
                  onChange={(e) => setSelectedEngineId(e.target.value)}
                  className="bg-transparent text-xs text-blue-300 font-bold focus:outline-none cursor-pointer truncate max-w-[140px]"
                >
                  {availableEngines.map((eng: AppEngine) => {
                    const id = eng.name ? eng.name.split('/').pop() : (eng.id as string | undefined);
                    const label = eng.displayName || id || '';
                    return (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            <select
              aria-label="Gemini Enterprise deployment mode"
              data-testid="ge-deploy-mode-select"
              value={deployMode}
              onChange={(e) => setDeployMode(e.target.value as 'LINKED_REGISTRY' | 'INLINE_COPY')}
              className="px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-200 font-semibold focus:outline-none focus:border-blue-500"
              title="Choose whether to link directly to this Agent Registry resource or copy inline SKILL.md instructions"
            >
              <option value="LINKED_REGISTRY">🔗 Link Registry Skill</option>
              <option value="INLINE_COPY">📄 Copy Inline SKILL.md</option>
            </select>

            <button
              type="button"
              onClick={handleDeployToGeEngine}
              disabled={isUpdating}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors shadow flex items-center gap-1.5 shrink-0"
              title="Publishes this skill into the selected Gemini Enterprise App's Browse skills gallery (+ Install)"
            >
              <span>{deploySuccess ? '✓ Published to Gallery!' : '🚀 Publish to GE Gallery'}</span>
            </button>

            {!isFirstPartySkill &&
              (skill.state !== 'STATE_ACTIVE' ? (
                <button
                  type="button"
                  onClick={() => handleUpdateTargetState('TARGET_STATE_ACTIVE')}
                  disabled={isUpdating}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-lg transition-colors shadow flex items-center gap-1.5"
                >
                  <span>🟢 Activate in Company Catalog</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleUpdateTargetState('TARGET_STATE_DISABLED')}
                  disabled={isUpdating}
                  className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white text-xs font-bold rounded-lg transition-colors shadow flex items-center gap-1.5"
                >
                  <span>🟡 Disable in Company Catalog</span>
                </button>
              ))}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      <DestructiveConfirmModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={confirmDeleteSkill}
        title="Delete Skill from Registry"
        resourceType="Skill"
        resources={[{ name: skill.displayName, details: skill.name }]}
        confirmKeyword={skill.displayName || 'DELETE'}
        confirmButtonText="Delete Skill"
        description={`You are about to delete "${skill.displayName}" from Google Cloud Agent Registry.`}
        consequences={[
          'This skill will be permanently removed from the Google Cloud Agent Registry.',
          'The skill will no longer appear in the organization catalog or be discoverable by agents.',
          'Existing agent workflows referencing this specific skill revision may encounter errors.',
        ]}
        isLoading={isUpdating}
      />

      <ExportSkillsModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        records={[normalizeRegistrySkillForExport(skill)]}
        title={`Export Registry Skill: ${skill.displayName}`}
        filenamePrefix={skillId || 'registry-skill'}
      />
    </div>
  );
};

export default RegistrySkillDetailModal;
