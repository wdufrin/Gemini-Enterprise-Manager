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

import React, { useState, useRef } from 'react';
import { Config, RegistrySkill, SkillScanningPolicy } from '../../types';
import * as api from '../../services/apiService';
import { useToast } from '../../context/ToastContext';
import { useModalA11y } from '../../hooks/useModalA11y';
import JSZip from 'jszip';

interface PublishSkillModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: Config;
  onSkillPublished: () => void;
}

const MAX_SINGLE_FILE_SCAN_BYTES = 1024 * 1024; // 1 MB per-file scan limit

const TEMPLATES: Record<string, { name: string; description: string; instruction: string }> = {
  brandVoice: {
    name: 'corporate-brand-voice',
    description: 'Enforce company brand voice, tone, and formatting rules across communications, decks, and documents. Use when drafting external communications, marketing materials, or blog posts.',
    instruction: `---
name: corporate-brand-voice
description: Enforce company brand voice, tone, and formatting rules across communications, decks, and documents. Use when drafting external communications, marketing materials, or blog posts.
---

# Corporate Brand Voice & Guardian

You are the Company Brand Guardian. Ensure all generated content adheres strictly to official voice, tone, and style standards.

## Brand Principles
1. **Clarity over Cleverness**: Keep sentences concise and actionable.
2. **Empathetic & Confident**: Helpful, authoritative, and direct without aggressive sales jargon.
3. **Inclusive & Accessible**: Plain English, avoiding obscure acronyms without prior definition.

## Medium Standards
- **Emails**: 1-2 paragraph maximum, clear bolded call-to-action (CTA).
- **Proposals**: Highlight quantified ROI and client impact first.
- **Decks**: Max 3-4 bullet points per slide with high visual focus.`,
  },
  salesProposal: {
    name: 'enterprise-sales-proposal',
    description: 'Generate structured enterprise sales proposals with executive summaries, customer pain points, solution mapping, and ROI projections. Use when drafting B2B client proposals or pitch follow-ups.',
    instruction: `---
name: enterprise-sales-proposal
description: Generate structured enterprise sales proposals with executive summaries, customer pain points, solution mapping, and ROI projections. Use when drafting B2B client proposals or pitch follow-ups.
---

# Enterprise Sales Proposal Generator

You are our Enterprise B2B Sales Proposal Specialist. Draft comprehensive, value-driven client proposals.

## Structure
1. **Executive Summary**: 2-3 sentences outlining the customer's goal and our solution.
2. **Problem Statement & Business Impact**: Articulate current pain points and cost of inaction.
3. **Proposed Solution Architecture**: Detail recommended product modules and implementation timeline.
4. **ROI & Expected Outcomes**: Quantifiable metrics (e.g. time saved, revenue increased).
5. **Next Steps**: Concrete action items and sign-off pathway.`,
  },
  incidentReport: {
    name: 'it-incident-postmortem',
    description: 'Draft blameless IT incident postmortems, root cause analyses (RCA), and timeline summaries. Use when documenting production outages, service disruptions, or engineering retrospectives.',
    instruction: `---
name: it-incident-postmortem
description: Draft blameless IT incident postmortems, root cause analyses (RCA), and timeline summaries. Use when documenting production outages, service disruptions, or engineering retrospectives.
---

# Blameless Incident Postmortem Generator

You are the Engineering Site Reliability Engineer (SRE). Follow blameless postmortem best practices to analyze incidents.

## Sections
- **Incident Summary**: Date, severity, duration, customer impact.
- **Timeline**: Exact chronological event sequence with UTC timestamps.
- **Root Cause Analysis (5 Whys)**: Technical breakdown of failure trigger.
- **Preventative Action Items**: JIRA ticket items with owners and target resolution dates.`,
  },
};

const PublishSkillModal: React.FC<PublishSkillModalProps> = ({
  isOpen,
  onClose,
  config,
  onSkillPublished,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [skillId, setSkillId] = useState('company-brand-voice');
  const [displayName, setDisplayName] = useState('Company Brand Voice');
  const [description, setDescription] = useState(TEMPLATES.brandVoice.description);
  const [sourceMode, setSourceMode] = useState<'INLINE_MARKDOWN' | 'GCS_URI'>('INLINE_MARKDOWN');
  const [instruction, setInstruction] = useState(TEMPLATES.brandVoice.instruction);
  const [gcsUri, setGcsUri] = useState('');
  const [scanningPolicy, setScanningPolicy] = useState<SkillScanningPolicy>('ENABLED_BLOCKING');
  const [targetState, setTargetState] = useState<'TARGET_STATE_ACTIVE' | 'TARGET_STATE_DRAFT'>('TARGET_STATE_ACTIVE');
  const [selectedTemplate, setSelectedTemplate] = useState('brandVoice');
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useModalA11y({
    isOpen,
    onClose,
    containerRef,
    preventClose: isPublishing,
  });

  if (!isOpen) return null;

  const sanitizedPreviewId =
    skillId
      .trim()
      .toLowerCase()
      .replace(/^private-/, '')
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '') || 'skill-id';

  const handleTemplateChange = (templateKey: string) => {
    setSelectedTemplate(templateKey);
    setSourceMode('INLINE_MARKDOWN');
    const tmpl = TEMPLATES[templateKey];
    if (tmpl) {
      setSkillId(tmpl.name);
      setDisplayName(tmpl.name.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()));
      setDescription(tmpl.description);
      setInstruction(tmpl.instruction);
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skillId.trim()) {
      setError('Skill ID is required (e.g. sales-pipeline-advisor).');
      return;
    }
    if (!displayName.trim()) {
      setError('Display Name is required.');
      return;
    }

    const sanitizedId = skillId
      .trim()
      .toLowerCase()
      .replace(/^private-/, '')
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!sanitizedId) {
      setError('Skill ID must contain at least one lowercase letter or digit.');
      return;
    }

    let initialRevision: RegistrySkill['initialRevision'];
    if (sourceMode === 'GCS_URI') {
      const trimmedUri = gcsUri.trim();
      if (!trimmedUri.startsWith('gs://') || !trimmedUri.toLowerCase().endsWith('.zip')) {
        setError('Cloud Storage Archive URI must start with gs:// and point to a .zip bundle (e.g. gs://my-bucket/skills/brand-voice.zip).');
        return;
      }
      initialRevision = {
        gcsSource: {
          uri: trimmedUri,
        },
      };
    } else {
      const skillMd =
        instruction.trim() ||
        `---\nname: ${sanitizedId}\ndescription: ${description.trim()}\n---\n\n# ${displayName.trim()}\n\n${description.trim()}`;

      if (scanningPolicy !== 'DISABLED') {
        const mdBytes = new TextEncoder().encode(skillMd).length;
        if (mdBytes > MAX_SINGLE_FILE_SCAN_BYTES) {
          setError(
            `SKILL.md size (${mdBytes} bytes) exceeds the 1 MB (${MAX_SINGLE_FILE_SCAN_BYTES} bytes) single-file scanning limit enforced by Cloud Agent Registry.`
          );
          return;
        }
      }

      const zip = new JSZip();
      zip.file('SKILL.md', skillMd);
      const b64Zip = await zip.generateAsync({ type: 'base64' });
      initialRevision = {
        archiveUploadSource: {
          archiveContent: b64Zip,
        },
      };
    }

    setIsPublishing(true);
    setError(null);

    try {
      const payload: Partial<RegistrySkill> = {
        displayName: displayName.trim(),
        description: description.trim() || undefined,
        type: 'SIMPLE',
        targetState,
        scanningConfig: {
          policy: scanningPolicy,
        },
        initialRevision,
      };

      const createdSkill = await api.createRegistrySkill(payload, config, sanitizedId);
      const skillResourceName =
        createdSkill?.name && createdSkill.name.includes('/skills/')
          ? createdSkill.name
          : `projects/${config.projectId}/locations/${config.appLocation || 'global'}/skills/private-${sanitizedId}`;

      // In Agent Registry v1 GA:
      // - If targetState is TARGET_STATE_ACTIVE and scanningConfig.policy is ENABLED_BLOCKING,
      //   Agent Registry places the skill in STATE_DRAFT during the LLM security scan and
      //   automatically transitions it to STATE_ACTIVE once the scan succeeds with 0 findings.
      // - Perform a brief check on the initial revision scanResult if listRegistrySkillRevisions is available.
      if (
        targetState === 'TARGET_STATE_ACTIVE' &&
        scanningPolicy === 'ENABLED_BLOCKING' &&
        typeof api.listRegistrySkillRevisions === 'function'
      ) {
        const revs = await api.listRegistrySkillRevisions(skillResourceName, config);
        const latestRev = revs?.[0];
        const scanState = latestRev?.scanResult?.scanState;
        const findingCount = latestRev?.scanResult?.findings?.length || 0;

        if (findingCount > 0) {
          onSkillPublished();
          setError(
            `Skill "${displayName.trim()}" was created in Draft state, but activation was blocked by Agent Registry Security Scanning (${findingCount} security finding${findingCount === 1 ? '' : 's'} detected). Open the skill's Security Findings tab to inspect and remediate.`
          );
          return;
        }
        if (scanState === 'FAILED' || scanState === 'UNSUPPORTED_FORMAT') {
          onSkillPublished();
          setError(
            `Skill "${displayName.trim()}" was created in Draft state, but security scanning ended in ${scanState}${latestRev?.scanResult?.errorMessage ? `: ${latestRev.scanResult.errorMessage}` : ''}.`
          );
          return;
        }
        if (createdSkill?.state === 'STATE_DRAFT' || scanState === 'RUNNING') {
          toast.info(
            `Published "${displayName.trim()}". Agent Registry is running the blocking security scan and will automatically transition the skill to Active once 0 findings are confirmed.`
          );
        } else {
          toast.success(`Published "${displayName.trim()}" to Google Cloud Agent Registry.`);
        }
      } else {
        toast.success(`Published "${displayName.trim()}" to Google Cloud Agent Registry.`);
      }

      onSkillPublished();
      onClose();
    } catch (err: unknown) {
      console.error('Failed to publish central skill:', err);
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to publish skill to Google Cloud Agent Registry.';
      setError(message);
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/70 flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="publish-skill-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPublishing) onClose();
      }}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="bg-gray-850 rounded-xl max-w-3xl w-full border border-gray-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-gray-900 border-b border-gray-700 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-900/40 text-blue-400 border border-blue-700/50 rounded-lg">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <h3 id="publish-skill-title" className="text-base font-bold text-gray-100 flex items-center gap-2">
                Publish Enterprise Skill to Central Registry
                <span className="px-2 py-0.5 text-[11px] font-semibold bg-purple-900/60 text-purple-300 rounded border border-purple-700 font-mono">
                  Agent Registry v1 GA
                </span>
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Publishes a standalone organization skill to Google Cloud Agent Registry ({config.projectId}).
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close modal" className="text-gray-400 hover:text-gray-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handlePublish} className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div
              role="alert"
              data-testid="publish-skill-error-banner"
              className="p-3.5 bg-red-900/40 border border-red-700 text-red-200 text-xs rounded-lg space-y-2"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 shrink-0 mt-0.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <div className="font-bold text-red-100">Skill Publication Notice</div>
                    <div className="mt-0.5 leading-relaxed">{error}</div>
                  </div>
                </div>
                {error.toLowerCase().includes('already exists') && (
                  <button
                    type="button"
                    onClick={() => {
                      const nextId = `${skillId.replace(/-v\d+$/, '')}-v${Math.floor(Math.random() * 90 + 10)}`;
                      setSkillId(nextId);
                      setError(null);
                    }}
                    className="px-2.5 py-1 bg-red-800 hover:bg-red-700 text-white rounded text-[11px] font-semibold transition-colors shrink-0 self-start sm:self-auto"
                  >
                    Use New ID ({skillId}-v2)
                  </button>
                )}
              </div>
              <div className="text-[11px] text-red-300/90 border-t border-red-800/60 pt-1.5">
                Remediation: Verify that <code className="font-mono">agentregistry.googleapis.com</code> is enabled, your account holds <code className="font-mono">roles/agentregistry.admin</code>, and any Org Policy constraint (<code className="font-mono">custom.skillsScanningEnforcement</code>) permits the selected scanning policy.
              </div>
            </div>
          )}

          {/* Quick Template Selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-2">
              Predefined Enterprise Templates
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { id: 'brandVoice', label: '🛡️ Brand Voice', desc: 'Tone, style & guidelines' },
                { id: 'salesProposal', label: '💼 Sales Proposals', desc: 'B2B pitch & ROI decks' },
                { id: 'incidentReport', label: '🚨 IT Incident SRE', desc: 'Blameless postmortems' },
              ].map((tmpl) => (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => handleTemplateChange(tmpl.id)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    selectedTemplate === tmpl.id
                      ? 'bg-blue-900/30 border-blue-500 text-white shadow-sm'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                  }`}
                >
                  <div className="text-xs font-bold">{tmpl.label}</div>
                  <div className="text-[11px] text-gray-400 mt-1">{tmpl.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Display Name */}
            <div>
              <label htmlFor="publish-skill-display-name" className="block text-xs font-semibold text-gray-300 mb-1">
                Display Name <span className="text-red-400">*</span>
              </label>
              <input
                id="publish-skill-display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Acme Brand Guardian"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-xs text-gray-200 focus:outline-none focus:border-blue-500"
                required
              />
            </div>

            {/* Skill ID */}
            <div>
              <label htmlFor="publish-skill-id" className="block text-xs font-semibold text-gray-300 mb-1">
                Skill ID / Slash Command <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500 text-xs font-mono">/</span>
                <input
                  id="publish-skill-id"
                  type="text"
                  value={skillId}
                  onChange={(e) => setSkillId(e.target.value)}
                  placeholder="acme-brand-voice"
                  className="w-full pl-6 pr-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-xs text-gray-200 font-mono focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
              <div className="text-[10px] text-gray-400 font-mono mt-1 truncate" title={`projects/${config.projectId}/locations/${config.appLocation || 'global'}/skills/private-${sanitizedPreviewId}`}>
                GA Resource ID: <span className="text-purple-300">private-{sanitizedPreviewId}</span>
              </div>
            </div>
          </div>

          {/* Description / Semantic Trigger */}
          <div>
            <label htmlFor="publish-skill-description" className="block text-xs font-semibold text-gray-300 mb-1">
              Semantic Activation Trigger &amp; Description <span className="text-red-400">*</span>
            </label>
            <textarea
              id="publish-skill-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Describe what this skill does and the exact scenarios when Gemini Enterprise or ADK agents should trigger it..."
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-xs text-gray-200 focus:outline-none focus:border-blue-500"
              required
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Used by Gemini Enterprise and Vertex AI Agent Platform planners for progressive disclosure routing.
            </p>
          </div>

          {/* Package Source Selector (Inline SKILL.md vs GCS Archive) */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-gray-300">Skill Revision Bundle Source</span>
              <div className="inline-flex bg-gray-900 p-1 rounded-lg border border-gray-700">
                <button
                  type="button"
                  onClick={() => setSourceMode('INLINE_MARKDOWN')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                    sourceMode === 'INLINE_MARKDOWN'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  📝 Inline SKILL.md
                </button>
                <button
                  type="button"
                  onClick={() => setSourceMode('GCS_URI')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                    sourceMode === 'GCS_URI'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  ☁️ Cloud Storage ZIP (gs://)
                </button>
              </div>
            </div>

            {sourceMode === 'INLINE_MARKDOWN' ? (
              <div>
                <label htmlFor="publish-skill-markdown" className="block text-xs font-semibold text-gray-300 mb-1">
                  Skill Execution Guidelines (<span className="font-mono text-blue-400">SKILL.md</span>)
                </label>
                <textarea
                  id="publish-skill-markdown"
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  rows={9}
                  placeholder="Markdown instructions, domain rules, and structured response criteria..."
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-xs font-mono text-gray-200 focus:outline-none focus:border-blue-500 leading-relaxed"
                  required
                />
              </div>
            ) : (
              <div>
                <label htmlFor="publish-skill-gcs-uri" className="block text-xs font-semibold text-gray-300 mb-1">
                  Cloud Storage ZIP Archive URI (<span className="font-mono text-blue-400">initialRevision.gcsSource.uri</span>)
                </label>
                <input
                  id="publish-skill-gcs-uri"
                  type="text"
                  value={gcsUri}
                  onChange={(e) => setGcsUri(e.target.value)}
                  placeholder="gs://my-enterprise-skills/brand-voice-v1.zip"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-xs font-mono text-gray-200 focus:outline-none focus:border-blue-500"
                  required
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Archive must contain a root <code className="font-mono text-gray-300">SKILL.md</code> and optional <code className="font-mono text-gray-300">scripts/</code> or <code className="font-mono text-gray-300">assets/</code> directories (max 10 MB uncompressed when auto-scanning is enabled).
                </p>
              </div>
            )}
          </div>

          {/* Security Auto-Scanning Policy */}
          <div className="p-3.5 bg-gray-900/70 rounded-lg border border-emerald-700/40 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label htmlFor="publish-skill-scan-policy" className="text-xs font-semibold text-gray-100 flex items-center gap-1.5">
                  <span>🛡️ Automated Security Scanning Policy</span>
                  <span className="px-1.5 py-0.5 text-[10px] font-mono bg-emerald-900/50 text-emerald-300 rounded border border-emerald-700/60">
                    scanningConfig.policy
                  </span>
                </label>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  Scans <code className="font-mono">SKILL.md</code>, <code className="font-mono">scripts/</code>, and <code className="font-mono">assets/</code> via LLM for prompt injection, data exfiltration, and hardcoded secrets.
                </div>
              </div>
              <select
                id="publish-skill-scan-policy"
                data-testid="publish-skill-scan-policy-select"
                value={scanningPolicy}
                onChange={(e) => setScanningPolicy(e.target.value as SkillScanningPolicy)}
                className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-200 font-semibold focus:outline-none focus:border-blue-500 shrink-0"
              >
                <option value="ENABLED_BLOCKING">🛡️ Blocking (Recommended Default)</option>
                <option value="ENABLED_NONBLOCKING">👁️ Non-Blocking (Audit Findings Only)</option>
                <option value="DISABLED">⚪ Disabled (No Auto-Scan)</option>
              </select>
            </div>
            {scanningPolicy === 'ENABLED_BLOCKING' && (
              <div className="text-[11px] text-emerald-300/90 bg-emerald-950/30 border border-emerald-800/50 rounded px-2.5 py-1.5">
                Revisions with critical/high/low vulnerabilities or secrets are automatically blocked from download and cannot be promoted as <code className="font-mono">defaultRevision</code>.
              </div>
            )}
            {scanningPolicy === 'DISABLED' && (
              <div className="text-[11px] text-amber-300/90 bg-amber-950/30 border border-amber-800/50 rounded px-2.5 py-1.5">
                Warning: Disabling auto-scanning bypasses vulnerability and secret checks and will be rejected if your organization enforces <code className="font-mono">custom.skillsScanningEnforcement</code>.
              </div>
            )}
          </div>

          {/* Target State */}
          <div className="p-3.5 bg-gray-900/60 rounded-lg border border-gray-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <label htmlFor="publish-skill-target-state" className="text-xs font-semibold text-gray-200 block">
                Catalog Availability Status
              </label>
              <div className="text-[11px] text-gray-400 mt-0.5">
                Active skills appear in the Gemini Enterprise <strong>Browse skills</strong> gallery where employees click <strong>+ Install</strong> to add them to their workspace.
              </div>
            </div>
            <select
              id="publish-skill-target-state"
              value={targetState}
              onChange={(e) => setTargetState(e.target.value as 'TARGET_STATE_ACTIVE' | 'TARGET_STATE_DRAFT')}
              className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-200 font-semibold focus:outline-none focus:border-blue-500 shrink-0"
            >
              <option value="TARGET_STATE_ACTIVE">🟢 Active (Live in Gallery)</option>
              <option value="TARGET_STATE_DRAFT">🟡 Draft (Staging Only)</option>
            </select>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-900 border-t border-gray-700 flex justify-end gap-3 items-center">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePublish}
            disabled={isPublishing}
            className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-md transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {isPublishing ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Publishing to Agent Registry...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Publish Enterprise Skill
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PublishSkillModal;
