/**
 * Copyright 2026 Google LLC
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

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Page } from '../types';
import { useModalA11y } from '../hooks/useModalA11y';
import { useGlobalDebug } from '../context/GlobalDebugContext';
import { useToast } from '../context/ToastContext';

export const GITHUB_ISSUES_NEW_URL =
  'https://github.com/wdufrin/Gemini-Enterprise-Manager/issues/new';

export const APP_VERSION = 'v0.1002.355';

export type FeedbackCategory = 'bug' | 'enhancement' | 'feedback';

interface CategoryMeta {
  id: FeedbackCategory;
  label: string;
  githubLabel: string;
  titlePrefix: string;
  placeholder: string;
}

const CATEGORIES: CategoryMeta[] = [
  {
    id: 'bug',
    label: 'Bug Report',
    githubLabel: 'bug',
    titlePrefix: '[Bug]',
    placeholder: 'Describe what happened, what you expected, and the steps to reproduce...',
  },
  {
    id: 'enhancement',
    label: 'Feature Request',
    githubLabel: 'enhancement',
    titlePrefix: '[Feature]',
    placeholder: 'Describe the capability or workflow improvement you would like to see...',
  },
  {
    id: 'feedback',
    label: 'UX / General Feedback',
    githubLabel: 'feedback',
    titlePrefix: '[Feedback]',
    placeholder: 'Share your thoughts on usability, layout, documentation, or workflow...',
  },
];

const escapeRegExp = (str: string): string =>
  str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Scrubs PII, credentials, OAuth tokens, emails, and GCP project identifiers
 * from free-form text or URLs using Regex Pattern Matching.
 *
 * Known limits: Matches standard email formats, Google OAuth/API tokens, JWTs,
 * PEM blocks, `projects/<id>` paths, and explicitly known session project IDs;
 * cannot semantically detect arbitrary personal names in free-form prose.
 */
export const sanitizeFeedbackText = (
  input: string,
  knownProjectIdentifiers: string[] = []
): { sanitized: string; redactionCount: number } => {
  if (!input) return { sanitized: '', redactionCount: 0 };

  let text = input;
  let redactionCount = 0;

  const replaceAndCount = (pattern: RegExp, replacement: string) => {
    text = text.replace(pattern, () => {
      redactionCount += 1;
      return replacement;
    });
  };

  // 1. PEM private key blocks
  replaceAndCount(
    /-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/g,
    '[REDACTED_PRIVATE_KEY]'
  );

  // 2. Google OAuth2 access tokens (ya29...)
  replaceAndCount(/\bya29\.[A-Za-z0-9._-]+/g, '[REDACTED_TOKEN]');

  // 3. Bearer tokens in headers or cURL snippets
  replaceAndCount(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED_TOKEN]');

  // 4. Google API keys (AIza...)
  replaceAndCount(/\bAIza[0-9A-Za-z_-]{35}\b/g, '[REDACTED_API_KEY]');

  // 5. JWT tokens
  replaceAndCount(
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g,
    '[REDACTED_JWT]'
  );

  // 6. Email addresses
  replaceAndCount(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    '[REDACTED_EMAIL]'
  );

  // 7. GCP resource paths: projects/<project-id-or-number>
  replaceAndCount(
    /\bprojects\/(?!\[REDACTED_PROJECT\])[A-Za-z0-9._:-]+/g,
    'projects/[REDACTED_PROJECT]'
  );

  // 8. Query parameters containing project IDs/numbers: ?project=... or &project=...
  text = text.replace(
    /([?&]project=)(?!\[REDACTED_PROJECT\])[A-Za-z0-9._:-]+/gi,
    (_match, prefix: string) => {
      redactionCount += 1;
      return `${prefix}[REDACTED_PROJECT]`;
    }
  );

  // 9. Explicitly known active session projectId / projectNumber
  for (const rawId of knownProjectIdentifiers) {
    const trimmed = rawId?.trim();
    if (trimmed && trimmed.length >= 3) {
      const pattern = new RegExp(`\\b${escapeRegExp(trimmed)}\\b`, 'gi');
      replaceAndCount(pattern, '[REDACTED_PROJECT]');
    }
  }

  return { sanitized: text, redactionCount };
};

export interface BuildIssuePayloadOptions {
  category: FeedbackCategory;
  title: string;
  description: string;
  stepsToReproduce?: string;
  includeContext: boolean;
  currentPage: Page;
  routeHash: string;
  recentEndpoints: { method: string; url: string }[];
  knownProjectIdentifiers: string[];
}

export const buildSanitizedIssuePayload = (options: BuildIssuePayloadOptions) => {
  const categoryMeta =
    CATEGORIES.find((c) => c.id === options.category) || CATEGORIES[0];

  const cleanTitle = sanitizeFeedbackText(
    options.title.trim(),
    options.knownProjectIdentifiers
  );
  const cleanDescription = sanitizeFeedbackText(
    options.description.trim(),
    options.knownProjectIdentifiers
  );
  const cleanSteps = sanitizeFeedbackText(
    (options.stepsToReproduce || '').trim(),
    options.knownProjectIdentifiers
  );

  const formattedTitle = cleanTitle.sanitized
    ? `${categoryMeta.titlePrefix} ${cleanTitle.sanitized}`
    : `${categoryMeta.titlePrefix} Issue in ${options.currentPage}`;

  const sections: string[] = [
    `### Summary`,
    cleanDescription.sanitized || '_No description provided._',
  ];

  if (cleanSteps.sanitized) {
    sections.push('', `### Steps to Reproduce / Expected Behavior`, cleanSteps.sanitized);
  }

  let endpointRedactions = 0;
  if (options.includeContext) {
    const cleanRoute = sanitizeFeedbackText(
      options.routeHash || '#/',
      options.knownProjectIdentifiers
    );
    endpointRedactions += cleanRoute.redactionCount;

    const contextLines = [
      '',
      '### Sanitized Environment Context',
      `- **App Version:** \`${APP_VERSION}\``,
      `- **Active Module:** \`${options.currentPage}\``,
      `- **Route:** \`${cleanRoute.sanitized}\``,
    ];

    if (options.recentEndpoints.length > 0) {
      const sanitizedEndpoints = options.recentEndpoints.slice(0, 5).map((item) => {
        const res = sanitizeFeedbackText(item.url, options.knownProjectIdentifiers);
        endpointRedactions += res.redactionCount;
        return `  - \`${item.method} ${res.sanitized}\``;
      });
      contextLines.push(`- **Recent API Endpoints (Sanitized):**`, ...sanitizedEndpoints);
    }

    sections.push(...contextLines);
  }

  const body = sections.join('\n');
  const totalRedactions =
    cleanTitle.redactionCount +
    cleanDescription.redactionCount +
    cleanSteps.redactionCount +
    endpointRedactions;

  const params = new URLSearchParams({
    title: formattedTitle,
    body,
    labels: categoryMeta.githubLabel,
  });

  return {
    title: formattedTitle,
    body,
    label: categoryMeta.githubLabel,
    totalRedactions,
    githubUrl: `${GITHUB_ISSUES_NEW_URL}?${params.toString()}`,
  };
};

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPage: Page;
  projectId?: string;
  projectNumber?: string;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isOpen,
  onClose,
  currentPage,
  projectId = '',
  projectNumber = '',
}) => {
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stepsToReproduce, setStepsToReproduce] = useState('');
  const [includeContext, setIncludeContext] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [copied, setCopied] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const { apiHistory } = useGlobalDebug();
  const { toast } = useToast();

  useModalA11y({
    isOpen,
    onClose,
    containerRef: modalRef,
    initialFocusRef: titleInputRef,
  });

  useEffect(() => {
    if (isOpen) {
      setCopied(false);
    }
  }, [isOpen]);

  const knownProjectIdentifiers = useMemo(
    () => [projectId, projectNumber].filter(Boolean),
    [projectId, projectNumber]
  );

  const recentEndpoints = useMemo(
    () => apiHistory.slice(0, 5).map((h) => ({ method: h.method, url: h.url })),
    [apiHistory]
  );

  const payload = useMemo(
    () =>
      buildSanitizedIssuePayload({
        category,
        title,
        description,
        stepsToReproduce,
        includeContext,
        currentPage,
        routeHash: typeof window !== 'undefined' ? window.location.hash || '#/' : '#/',
        recentEndpoints,
        knownProjectIdentifiers,
      }),
    [
      category,
      title,
      description,
      stepsToReproduce,
      includeContext,
      currentPage,
      recentEndpoints,
      knownProjectIdentifiers,
    ]
  );

  if (!isOpen) return null;

  const activeCategoryMeta =
    CATEGORIES.find((c) => c.id === category) || CATEGORIES[0];
  const isValid = title.trim().length > 0 && description.trim().length > 0;

  const handleCopyMarkdown = async () => {
    const fullMarkdown = `# ${payload.title}\n\n${payload.body}`;
    try {
      await navigator.clipboard.writeText(fullMarkdown);
      setCopied(true);
      toast.success('Copied sanitized report to clipboard.');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Unable to access clipboard. Please copy from the preview box below.');
      setShowPreview(true);
    }
  };

  const handleOpenGitHubIssue = () => {
    if (!isValid) return;
    window.open(payload.githubUrl, '_blank', 'noopener,noreferrer');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-900/40 border border-blue-700/50 text-blue-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                />
              </svg>
            </div>
            <div>
              <h2 id="feedback-modal-title" className="text-lg font-bold text-gray-100">
                Report Issue or Feedback
              </h2>
              <p className="text-xs text-gray-400">
                Submit a sanitized GitHub issue or copy a redacted report—no email or PII exposed.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Feedback Modal"
            className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4 custom-scrollbar">
          {/* Privacy Guard Banner */}
          <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-800/60 flex items-start gap-2.5">
            <svg
              className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10c0-1.718-.433-3.333-1.2-4.782"
              />
            </svg>
            <div className="text-xs text-emerald-200/90 leading-relaxed flex-1">
              <span className="font-semibold text-emerald-300">Automatic PII & Secret Scrubbing:</span>{' '}
              Emails, OAuth tokens, API keys, and GCP Project IDs/numbers are automatically redacted
              before generating the issue.
              {payload.totalRedactions > 0 && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded bg-amber-900/60 text-amber-200 border border-amber-700/60 text-[11px] font-mono">
                  {payload.totalRedactions} sensitive value{payload.totalRedactions === 1 ? '' : 's'} redacted
                </span>
              )}
            </div>
          </div>

          {/* Category Selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
              Category
            </label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((item) => {
                const selected = category === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCategory(item.id)}
                    aria-pressed={selected}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                      selected
                        ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                        : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-750 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Summary / Title */}
          <div>
            <label
              htmlFor="feedback-title-input"
              className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5"
            >
              Summary <span className="text-red-400">*</span>
            </label>
            <input
              ref={titleInputRef}
              id="feedback-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short summary of the issue or suggestion..."
              className="w-full px-3.5 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="feedback-description-input"
              className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5"
            >
              Description <span className="text-red-400">*</span>
            </label>
            <textarea
              id="feedback-description-input"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={activeCategoryMeta.placeholder}
              className="w-full px-3.5 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 custom-scrollbar"
            />
          </div>

          {/* Optional Steps to Reproduce (shown for Bug Reports) */}
          {category === 'bug' && (
            <div>
              <label
                htmlFor="feedback-steps-input"
                className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5"
              >
                Steps to Reproduce / Expected Behavior <span className="text-gray-500 font-normal">(Optional)</span>
              </label>
              <textarea
                id="feedback-steps-input"
                rows={2}
                value={stepsToReproduce}
                onChange={(e) => setStepsToReproduce(e.target.value)}
                placeholder="1. Navigate to... 2. Click... Expected: ..."
                className="w-full px-3.5 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 custom-scrollbar"
              />
            </div>
          )}

          {/* Sanitized Context Toggle + Preview Toggle */}
          <div className="pt-2 border-t border-gray-800 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeContext}
                onChange={(e) => setIncludeContext(e.target.checked)}
                className="rounded bg-gray-800 border-gray-600 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-300">
                Include sanitized environment context (app version, active module:{' '}
                <code className="text-blue-400 font-mono">{currentPage}</code>)
              </span>
            </label>

            <button
              type="button"
              onClick={() => setShowPreview((prev) => !prev)}
              className="text-xs text-blue-400 hover:text-blue-300 font-medium underline underline-offset-2"
            >
              {showPreview ? 'Hide Sanitized Preview' : 'Preview Sanitized Markdown'}
            </button>
          </div>

          {/* Live Sanitized Preview */}
          {showPreview && (
            <div className="bg-gray-950 border border-gray-800 rounded-lg p-3 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-gray-400 font-mono">
                <span>Title: {payload.title}</span>
                <span>Label: {payload.label}</span>
              </div>
              <pre
                data-testid="sanitized-markdown-preview"
                className="text-xs text-gray-300 font-mono whitespace-pre-wrap break-words max-h-40 overflow-y-auto custom-scrollbar pt-1 border-t border-gray-800"
              >
                {payload.body}
              </pre>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-gray-800 border-t border-gray-700 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleCopyMarkdown}
            disabled={!isValid}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-gray-900 hover:bg-gray-700 text-gray-200 border border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            <span>{copied ? 'Copied!' : 'Copy Sanitized Markdown'}</span>
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg text-xs font-medium text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleOpenGitHubIssue}
              disabled={!isValid}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span>Open Pre-filled GitHub Issue</span>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeedbackModal;
