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
import { Page } from '../types';

interface OnboardingBannerProps {
  projectId: string;
  projectNumber: string;
  accessToken: string;
  onNavigate: (page: Page) => void;
  onOpenPreflight?: () => void;
}

const STORAGE_KEY = 'gem_onboarding_dismissed_v1';

export const OnboardingBanner: React.FC<OnboardingBannerProps> = ({
  projectId,
  projectNumber,
  accessToken,
  onNavigate,
  onOpenPreflight,
}) => {
  const [isDismissed, setIsDismissed] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (!dismissed) {
      setIsDismissed(false);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setIsDismissed(true);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(text);
    setTimeout(() => setCopiedCmd(null), 2500);
  };

  if (isDismissed) {
    return null;
  }

  const isAuthReady = Boolean(accessToken);
  const isProjectReady = Boolean(projectId || projectNumber);

  return (
    <section
      role="region"
      aria-label="First-run guided onboarding"
      className="mb-6 rounded-xl border border-blue-500/30 bg-gradient-to-r from-blue-950/40 via-gray-900 to-indigo-950/40 p-5 shadow-xl relative overflow-hidden transition-all duration-300"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Welcome to Gemini Enterprise Manager
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-medium">
                Quick Start Guide
              </span>
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Follow these setup steps to connect your Google Cloud environment and explore all enterprise agent features.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-md transition-colors text-xs flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label={isExpanded ? 'Collapse onboarding checklist' : 'Expand onboarding checklist'}
          >
            <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-4 w-4 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Dismiss onboarding guide"
            title="Dismiss guide"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-gray-800/80 space-y-4">
          {/* Step Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Step 1: Authentication */}
            <div className={`p-3.5 rounded-lg border text-xs transition-colors ${
              isAuthReady
                ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300'
                : 'bg-gray-800/60 border-gray-700 text-gray-300'
            }`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold flex items-center gap-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/20 text-[11px] font-bold text-blue-300">
                    1
                  </span>
                  Authenticate
                </span>
                {isAuthReady ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/50 text-emerald-300 border border-emerald-700/50 font-medium">
                    ✓ Connected
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300 border border-amber-700/40 font-medium">
                    Pending
                  </span>
                )}
              </div>
              <p className="text-gray-400 text-[11px] mb-2 leading-relaxed">
                Provide an OAuth access token with Discovery Engine &amp; Cloud Run scopes.
              </p>
              <button
                type="button"
                onClick={() => handleCopy('gcloud auth print-access-token')}
                className="w-full flex items-center justify-between px-2 py-1 rounded bg-gray-900 border border-gray-700 font-mono text-[10px] text-gray-300 hover:border-blue-500 transition-colors group"
                aria-label="Copy gcloud auth command"
              >
                <span className="truncate">gcloud auth print-access-token</span>
                <span className="text-blue-400 text-[10px] group-hover:underline shrink-0 ml-1">
                  {copiedCmd === 'gcloud auth print-access-token' ? 'Copied!' : 'Copy'}
                </span>
              </button>
            </div>

            {/* Step 2: Project ID */}
            <div className={`p-3.5 rounded-lg border text-xs transition-colors ${
              isProjectReady
                ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300'
                : 'bg-gray-800/60 border-gray-700 text-gray-300'
            }`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold flex items-center gap-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/20 text-[11px] font-bold text-blue-300">
                    2
                  </span>
                  Set GCP Project
                </span>
                {isProjectReady ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/50 text-emerald-300 border border-emerald-700/50 font-medium truncate max-w-[120px]">
                    ✓ {projectId || projectNumber}
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300 border border-amber-700/40 font-medium">
                    Not Set
                  </span>
                )}
              </div>
              <p className="text-gray-400 text-[11px] mb-2 leading-relaxed">
                Target Google Cloud project hosting your Gemini engines and storage.
              </p>
              <button
                type="button"
                onClick={() => handleCopy('gcloud config get-value project')}
                className="w-full flex items-center justify-between px-2 py-1 rounded bg-gray-900 border border-gray-700 font-mono text-[10px] text-gray-300 hover:border-blue-500 transition-colors group"
                aria-label="Copy gcloud project command"
              >
                <span className="truncate">gcloud config get-value project</span>
                <span className="text-blue-400 text-[10px] group-hover:underline shrink-0 ml-1">
                  {copiedCmd === 'gcloud config get-value project' ? 'Copied!' : 'Copy'}
                </span>
              </button>
            </div>

            {/* Step 3: API Preflight */}
            <div className="p-3.5 rounded-lg border border-gray-700 bg-gray-800/60 text-xs text-gray-300">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold flex items-center gap-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/20 text-[11px] font-bold text-blue-300">
                    3
                  </span>
                  Preflight Checks
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300 border border-blue-700/40 font-medium">
                  Health Check
                </span>
              </div>
              <p className="text-gray-400 text-[11px] mb-2 leading-relaxed">
                Verify that required Google Cloud APIs and Service Agents are enabled.
              </p>
              {onOpenPreflight ? (
                <button
                  type="button"
                  onClick={onOpenPreflight}
                  className="w-full py-1 px-2 text-center rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium transition-colors"
                >
                  Run Preflight Diagnostics
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onNavigate(Page.ASSISTANT)}
                  className="w-full py-1 px-2 text-center rounded bg-gray-700 hover:bg-gray-600 text-gray-200 text-[11px] font-medium transition-colors"
                >
                  Open Engines &amp; Assistants
                </button>
              )}
            </div>
          </div>

          {/* Quick Launchpad */}
          <div className="pt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-400 font-medium mr-1">Quick Launch:</span>
            <button
              type="button"
              onClick={() => onNavigate(Page.ASSISTANT)}
              className="px-2.5 py-1 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs border border-gray-700 transition-colors flex items-center gap-1.5"
            >
              <span>🤖</span> Engines &amp; Assistants
            </button>
            <button
              type="button"
              onClick={() => onNavigate(Page.AGENT_BUILDER)}
              className="px-2.5 py-1 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs border border-gray-700 transition-colors flex items-center gap-1.5"
            >
              <span>🛠️</span> Agent Builder (ADK)
            </button>
            <button
              type="button"
              onClick={() => onNavigate(Page.AGENT_ENGINES)}
              className="px-2.5 py-1 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs border border-gray-700 transition-colors flex items-center gap-1.5"
            >
              <span>🚀</span> Agent Runtimes
            </button>
            <button
              type="button"
              onClick={() => onNavigate(Page.GE_QUOTA_USAGE)}
              className="px-2.5 py-1 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs border border-gray-700 transition-colors flex items-center gap-1.5"
            >
              <span>📊</span> Quota &amp; Cost Estimator
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="ml-auto text-xs text-gray-500 hover:text-gray-300 underline"
            >
              Don&apos;t show again
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
