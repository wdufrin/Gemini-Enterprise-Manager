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
import { Config, RegistrySkill } from '../../types';
import * as api from '../../services/apiService';
import { createZipBase64 } from '../../utils/zipUtils';

interface PublishSkillModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: Config;
  onSkillPublished: () => void;
}

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
  const [skillId, setSkillId] = useState('company-brand-voice');
  const [displayName, setDisplayName] = useState('Company Brand Voice');
  const [publisherNamespace, setPublisherNamespace] = useState('default');
  const [description, setDescription] = useState(TEMPLATES.brandVoice.description);
  const [instruction, setInstruction] = useState(TEMPLATES.brandVoice.instruction);
  const [targetState, setTargetState] = useState<'TARGET_STATE_ACTIVE' | 'TARGET_STATE_DRAFT'>('TARGET_STATE_ACTIVE');
  const [selectedTemplate, setSelectedTemplate] = useState('brandVoice');
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleTemplateChange = (templateKey: string) => {
    setSelectedTemplate(templateKey);
    const tmpl = TEMPLATES[templateKey];
    if (tmpl) {
      setSkillId(tmpl.name);
      setDisplayName(tmpl.name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
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

    setIsPublishing(true);
    setError(null);

    try {
      const sanitizedId = skillId.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
      
      const skillMd = instruction.trim() || `---
name: ${sanitizedId}
description: ${description.trim()}
---

# ${displayName}

${description.trim()}`;

      const b64Zip = createZipBase64({
        'SKILL.md': skillMd,
      });

      const payload: Partial<RegistrySkill> = {
        displayName: displayName.trim(),
        description: description.trim() || undefined,
        type: 'SIMPLE',
        targetState: 'TARGET_STATE_DRAFT',
        initialRevision: {
          archiveUploadSource: {
            archiveContent: b64Zip,
          },
        } as any,
      };

      // Only set publisher if a verified publisher (e.g. discoveryengine.googleapis.com, cloud.google.com) is chosen
      if (publisherNamespace.trim() && publisherNamespace !== 'default' && publisherNamespace !== config.projectId) {
        payload.publisher = `projects/${config.projectId}/locations/${config.appLocation || 'global'}/publishers/${publisherNamespace.trim()}`;
      }

      await api.createRegistrySkill(payload, config, sanitizedId);

      // If user selected active, poll until skill is ready and revision is ACTIVE
      if (targetState === 'TARGET_STATE_ACTIVE') {
        const skillResourceName = payload.publisher
          ? `projects/${config.projectId}/locations/${config.appLocation || 'global'}/skills/${sanitizedId}`
          : `projects/${config.projectId}/locations/${config.appLocation || 'global'}/skills/private-${sanitizedId}`;

        for (let i = 0; i < 10; i++) {
          await new Promise((r) => setTimeout(r, 2500));
          try {
            const currentSkill = await api.getRegistrySkill(skillResourceName, config);
            const revs = await api.listRegistrySkillRevisions(skillResourceName, config);
            const isReady = currentSkill.state !== 'STATE_CREATING';
            const activeRev = revs.find((r) => r.state === 'ACTIVE') || revs[0];

            if (isReady && activeRev) {
              await api.updateRegistrySkill(
                skillResourceName,
                {
                  defaultRevision: activeRev.name,
                  targetState: 'TARGET_STATE_ACTIVE',
                },
                ['default_revision', 'target_state'],
                config
              );
              break;
            }
          } catch (pollErr) {
            console.warn('Waiting for initial revision ingestion...', pollErr);
          }
        }
      }

      onSkillPublished();
      onClose();
    } catch (err: any) {
      console.error('Failed to publish central skill:', err);
      setError(err.message || 'Failed to publish skill to Google Cloud Agent Registry.');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 flex items-center justify-center p-4">
      <div className="bg-gray-850 rounded-xl max-w-3xl w-full border border-gray-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gray-900 border-b border-gray-700 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-900/40 text-blue-400 border border-blue-700/50 rounded-lg">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-100 flex items-center gap-2">
                Publish Enterprise Skill to Central Registry
                <span className="px-2 py-0.5 text-[11px] font-semibold bg-purple-900/60 text-purple-300 rounded border border-purple-700">
                  Agent Registry
                </span>
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Publishes a 1st-class company skill to Google Cloud Agent Registry ({config.projectId}).
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handlePublish} className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-900/40 border border-red-700 text-red-300 text-xs rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Display Name */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Display Name <span className="text-red-400">*</span>
              </label>
              <input
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
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Skill ID / Slash Command <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500 text-xs font-mono">/</span>
                <input
                  type="text"
                  value={skillId}
                  onChange={(e) => setSkillId(e.target.value)}
                  placeholder="acme-brand-voice"
                  className="w-full pl-6 pr-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-xs text-gray-200 font-mono focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
            </div>

            {/* Publisher Namespace */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Publisher Namespace
              </label>
              <select
                value={publisherNamespace}
                onChange={(e) => setPublisherNamespace(e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-xs text-gray-200 focus:outline-none focus:border-blue-500"
              >
                <option value="default">🏢 Organization Internal (Default)</option>
                <option value="discoveryengine.googleapis.com">Gemini Enterprise (discoveryengine)</option>
                <option value="cloud.google.com">Google Cloud (cloud.google.com)</option>
              </select>
            </div>
          </div>

          {/* Description / Semantic Trigger */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">
              Semantic Activation Trigger & Description <span className="text-red-400">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Describe what this skill does and the exact scenarios when Gemini Enterprise should trigger it..."
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-xs text-gray-200 focus:outline-none focus:border-blue-500"
              required
            />
            <p className="text-[11px] text-gray-500 mt-1">
              This description instructs the model when to automatically activate this skill during conversations.
            </p>
          </div>

          {/* SKILL.md Markdown Content */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">
              Skill Execution Guidelines (<span className="font-mono text-blue-400">SKILL.md</span>)
            </label>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={10}
              placeholder="Markdown instructions, domain rules, and structured response criteria..."
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-xs font-mono text-gray-200 focus:outline-none focus:border-blue-500 leading-relaxed"
              required
            />
          </div>

          {/* Target State */}
          <div className="p-3 bg-gray-900/60 rounded-lg border border-gray-700/80 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-gray-200">Catalog Availability Status</div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                Active skills immediately appear in the Gemini Enterprise Skills Gallery with a + Install button.
              </div>
            </div>
            <select
              value={targetState}
              onChange={(e) => setTargetState(e.target.value as any)}
              className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-200 font-semibold focus:outline-none focus:border-blue-500"
            >
              <option value="TARGET_STATE_ACTIVE">🟢 Active (Live in Company)</option>
              <option value="TARGET_STATE_DRAFT">🟡 Draft (Staging)</option>
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
