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
import {
  UserProfile,
  ServiceAgentValidation,
  UserPermissionsValidation,
  ProjectEnrollmentStatus,
} from '../../types';
import AccessTokenInput from '../AccessTokenInput';
import ProjectInput from '../ProjectInput';
import { ApiValidationPanel } from './ApiValidationPanel';

export const DEFAULT_GOOGLE_CLIENT_ID =
  '180054373655-2b600fnjissdmll4ipj2ndhr0i2h03fj.apps.googleusercontent.com';

interface AuthWelcomeScreenProps {
  isGapiReady: boolean;
  isGapiLoading: boolean;
  isTokenValidating: boolean;
  gapiError: string | null;
  accessToken: string;
  googleClientId: string;
  setGoogleClientId: (id: string) => void;
  userProfile: UserProfile | null;
  projectNumber: string;
  onGoogleSignIn: () => void;
  onSetAccessToken: (token: string) => void;
  onSignOut: () => void;
  onSetProjectNumber: (projectNumber: string) => void;
  onValidateApis: () => void;
  onEnterApp: () => void;
  isApiValidationLoading: boolean;
  apiValidationResult: { enabled: string[]; disabled: string[] } | null;
  serviceAgentValidation: ServiceAgentValidation | null;
  userPermissionsValidation: UserPermissionsValidation | null;
  projectEnrollment?: ProjectEnrollmentStatus | null;
  isGrantingServiceAgent: boolean;
  serviceAgentActionFeedback: { type: 'success' | 'error'; message: string } | null;
  onGrantServiceAgent: () => void;
  apisToEnable: Set<string>;
  onToggleApiToEnable: (apiName: string) => void;
  onToggleAllApisToEnable: () => void;
  isApiEnablingLoading: boolean;
  onEnableApis: () => void;
  apiEnablementLogs: string[];
}

export const AuthWelcomeScreen: React.FC<AuthWelcomeScreenProps> = ({
  isGapiReady,
  isGapiLoading,
  isTokenValidating,
  gapiError,
  accessToken,
  googleClientId,
  setGoogleClientId,
  userProfile,
  projectNumber,
  onGoogleSignIn,
  onSetAccessToken,
  onSignOut,
  onSetProjectNumber,
  onValidateApis,
  onEnterApp,
  isApiValidationLoading,
  apiValidationResult,
  serviceAgentValidation,
  userPermissionsValidation,
  projectEnrollment = null,
  isGrantingServiceAgent,
  serviceAgentActionFeedback,
  onGrantServiceAgent,
  apisToEnable,
  onToggleApiToEnable,
  onToggleAllApisToEnable,
  isApiEnablingLoading,
  onEnableApis,
  apiEnablementLogs,
}) => {
  const [showOAuthSettings, setShowOAuthSettings] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);

  const step1Done = isGapiReady;
  const step2Done = Boolean(projectNumber);
  const step3Validated = Boolean(apiValidationResult);

  return (
    <div className="min-h-screen bg-[#0b0f19] text-gray-100 font-sans flex flex-col overflow-y-auto">
      {/* Persistent Top Enterprise Chrome */}
      <header className="w-full border-b border-gray-800/90 bg-gray-950/80 px-4 sm:px-6 h-14 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6 text-blue-500 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
            />
          </svg>
          <span className="text-sm sm:text-base font-display font-bold text-white tracking-tight">
            Gemini Enterprise
          </span>
          <span className="hidden sm:inline-block text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-950/80 text-blue-300 border border-blue-800/60">
            Control Plane Readiness Gate
          </span>
        </div>

        {isGapiReady && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
              <span className="truncate max-w-[180px] sm:max-w-[260px] font-medium">
                {userProfile?.email || userProfile?.name || 'CLI Access Token Active'}
              </span>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="text-xs font-medium text-gray-300 hover:text-white px-2.5 py-1 rounded-lg bg-gray-800/90 hover:bg-gray-700 border border-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Switch Account / Sign Out
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 my-auto">
        <div className="text-center max-w-2xl mx-auto mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight">
            Welcome to Gemini Enterprise Manager
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-gray-400">
            Authenticate your cloud identity, bind a target GCP project, and verify Discovery Engine &amp; Vertex AI readiness before launching the control plane.
          </p>

          {/* 3-Step Horizontal Readiness Stepper */}
          <ol aria-label="Onboarding progress" className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-left">
            <li className={`p-3 rounded-xl border ${step1Done ? 'bg-emerald-950/20 border-emerald-800/60' : 'bg-blue-950/30 border-blue-700/70'}`}>
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Step 01 · {step1Done ? 'Complete' : 'Active'}
              </div>
              <div className="text-xs font-semibold text-white mt-0.5">Identity &amp; Credentials</div>
            </li>
            <li className={`p-3 rounded-xl border ${!step1Done ? 'bg-gray-900/50 border-gray-800' : step2Done ? 'bg-emerald-950/20 border-emerald-800/60' : 'bg-blue-950/30 border-blue-700/70'}`}>
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Step 02 · {!step1Done ? 'Pending' : step2Done ? 'Selected' : 'Active'}
              </div>
              <div className="text-xs font-semibold text-white mt-0.5 truncate">
                {projectNumber ? `Project: ${projectNumber}` : 'Target GCP Project'}
              </div>
            </li>
            <li className={`p-3 rounded-xl border ${step3Validated ? 'bg-emerald-950/20 border-emerald-800/60' : step2Done ? 'bg-blue-950/20 border-blue-800/50' : 'bg-gray-900/50 border-gray-800'}`}>
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Step 03 · {step3Validated ? 'Verified' : 'Optional Preflight'}
              </div>
              <div className="text-xs font-semibold text-white mt-0.5">API &amp; Service Readiness</div>
            </li>
          </ol>
        </div>

        {!isGapiReady ? (
          <div className="w-full max-w-2xl mx-auto p-6 sm:p-8 space-y-5 bg-gray-900/90 rounded-2xl shadow-2xl border border-gray-800">
            <div className="p-4 sm:p-5 bg-gray-850 rounded-xl border border-gray-700/80 space-y-3">
              <h2 className="text-sm font-semibold text-white">
                Sign In with Google
              </h2>
              <p className="text-xs text-gray-400">
                Sign in using your Google account to automatically grant access
                to Discovery Engine and related APIs.
              </p>
              <button
                type="button"
                onClick={onGoogleSignIn}
                disabled={isGapiLoading || isTokenValidating}
                className="w-full py-2.5 px-4 bg-white hover:bg-gray-100 text-gray-900 font-semibold text-sm rounded-lg shadow flex items-center justify-center gap-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:bg-gray-600 disabled:text-gray-300"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                Sign in with Google
              </button>
            </div>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-gray-800"></div>
              <span className="flex-shrink mx-4 text-xs text-gray-400 uppercase tracking-wider font-medium">
                Or use CLI Access Token
              </span>
              <div className="flex-grow border-t border-gray-800"></div>
            </div>

            <div className="p-4 sm:p-5 bg-gray-850 rounded-xl border border-gray-700/80 space-y-3">
              <h2 className="text-sm font-semibold text-white">
                Manual Access Token
              </h2>
              <p className="text-xs text-gray-400">
                Paste a short-lived bearer token generated via the Google Cloud SDK:
              </p>
              <div className="flex items-center justify-between bg-gray-950 px-3 py-2 rounded-lg border border-gray-800">
                <code className="text-xs text-blue-300 font-mono">
                  gcloud auth print-access-token
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText('gcloud auth print-access-token');
                    setTokenCopied(true);
                    setTimeout(() => setTokenCopied(false), 2000);
                  }}
                  className="text-[11px] font-medium text-blue-300 hover:text-white px-2.5 py-1 rounded bg-blue-950/60 hover:bg-blue-900/70 border border-blue-700/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  aria-label="Copy gcloud auth command"
                >
                  {tokenCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <AccessTokenInput
                accessToken={accessToken}
                setAccessToken={onSetAccessToken}
                userProfile={userProfile}
                onSignOut={onSignOut}
              />

              {/* Advanced OAuth Settings Toggle */}
              <div className="pt-2 border-t border-gray-800">
                <button
                  type="button"
                  aria-expanded={showOAuthSettings}
                  onClick={() => setShowOAuthSettings(!showOAuthSettings)}
                  className="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1.5 rounded px-1 py-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <svg
                    className={`w-3.5 h-3.5 transition-transform ${showOAuthSettings ? 'rotate-90' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span>Advanced: Configure OAuth Client ID</span>
                </button>

                {showOAuthSettings && (
                  <div className="mt-2.5 space-y-2 animate-fade-in">
                    <p className="text-[11px] text-gray-400">
                      If hosting on a custom domain, provide your custom OAuth Client ID authorized for that origin.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        aria-label="Custom OAuth Client ID"
                        placeholder={DEFAULT_GOOGLE_CLIENT_ID}
                        value={
                          googleClientId === DEFAULT_GOOGLE_CLIENT_ID
                            ? ''
                            : googleClientId
                        }
                        onChange={(e) => {
                          const val = e.target.value.trim();
                          if (val) {
                            localStorage.setItem('custom-google-client-id', val);
                            setGoogleClientId(val);
                          } else {
                            localStorage.removeItem('custom-google-client-id');
                            fetch('/config.json')
                              .then((res) => res.json())
                              .then((data) => {
                                setGoogleClientId(
                                  data?.GOOGLE_CLIENT_ID ||
                                    DEFAULT_GOOGLE_CLIENT_ID,
                                );
                              })
                              .catch(() =>
                                setGoogleClientId(DEFAULT_GOOGLE_CLIENT_ID),
                              );
                          }
                        }}
                        className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 flex-1 font-mono"
                      />
                      {googleClientId !== DEFAULT_GOOGLE_CLIENT_ID && (
                        <button
                          type="button"
                          onClick={() => {
                            localStorage.removeItem('custom-google-client-id');
                            fetch('/config.json')
                              .then((res) => res.json())
                              .then((data) => {
                                setGoogleClientId(
                                  data?.GOOGLE_CLIENT_ID ||
                                    DEFAULT_GOOGLE_CLIENT_ID,
                                );
                              })
                              .catch(() =>
                                setGoogleClientId(DEFAULT_GOOGLE_CLIENT_ID),
                              );
                          }}
                          className="text-xs bg-red-900/30 text-red-300 hover:bg-red-900/50 px-2.5 py-1 rounded-lg border border-red-800"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {isGapiLoading && (
              <div role="status" className="flex items-center justify-center p-3 text-sm text-blue-300">
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-400 mr-3"></div>
                Initializing Google API Client... Please wait.
              </div>
            )}
            {isTokenValidating && (
              <div role="status" className="flex items-center justify-center p-3 text-sm text-blue-300">
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-400 mr-3"></div>
                Validating access token permissions...
              </div>
            )}
            {gapiError && (
              <div role="alert" className="p-4 text-sm text-center text-red-300 bg-red-900/30 rounded-lg border border-red-800">
                {gapiError}
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column (Sticky): Project Context & Launch Gatekeeper */}
            <div className="lg:col-span-5 lg:sticky lg:top-6 space-y-4">
              <div className="p-5 sm:p-6 bg-gray-900/90 rounded-2xl border border-gray-800 shadow-xl space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-display font-bold text-white">
                    GCP Project Context
                  </h2>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                    Token Verified
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  Step 2: Set your Project and validate required APIs, service agents, and caller permissions.
                </p>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                    Project ID / Number
                  </label>
                  <ProjectInput
                    value={projectNumber}
                    onChange={onSetProjectNumber}
                  />
                </div>

                <div className="pt-2 border-t border-gray-800 space-y-2.5">
                  <button
                    type="button"
                    onClick={onEnterApp}
                    disabled={!projectNumber || isApiEnablingLoading}
                    className="w-full px-4 py-3 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-500 shadow-lg shadow-blue-950/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:bg-gray-700 disabled:text-gray-400 disabled:shadow-none transition-colors flex items-center justify-center gap-2"
                  >
                    <span>Enter Application</span>
                    <span aria-hidden="true">→</span>
                  </button>
                  <button
                    type="button"
                    onClick={onValidateApis}
                    disabled={
                      !projectNumber ||
                      isApiValidationLoading ||
                      isApiEnablingLoading
                    }
                    className="w-full px-4 py-2.5 bg-gray-800 text-gray-200 border border-gray-700 text-xs sm:text-sm font-semibold rounded-xl hover:bg-gray-750 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 flex items-center justify-center transition-colors"
                  >
                    {isApiValidationLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-400 mr-2"></div>
                        Validating Diagnostics...
                      </>
                    ) : (
                      'Validate APIs & Permissions'
                    )}
                  </button>
                </div>

                {gapiError && (
                  <div role="alert" className="p-3 text-xs text-red-300 bg-red-900/30 border border-red-800 rounded-lg">
                    {gapiError}
                  </div>
                )}
              </div>

              <div className="px-4 py-3 rounded-xl bg-gray-900/50 border border-gray-800/80 text-[11px] text-gray-400 flex items-center gap-2.5">
                <span className="text-blue-400 shrink-0" aria-hidden="true">🔒</span>
                <span>In-memory session handling — OAuth access tokens are never persisted to backend servers.</span>
              </div>
            </div>

            {/* Right Column: Live Preflight Validation Diagnostics */}
            <div className="lg:col-span-7 space-y-4">
              {!apiValidationResult && !isApiValidationLoading ? (
                <div className="p-6 sm:p-8 bg-gray-900/60 rounded-2xl border border-gray-800/90 text-center space-y-2">
                  <h2 className="text-sm font-semibold text-gray-200">
                    Preflight Readiness Diagnostics
                  </h2>
                  <p className="text-xs text-gray-400 max-w-md mx-auto leading-relaxed">
                    Click <strong className="text-gray-200">Validate APIs &amp; Permissions</strong> on the left to audit required GCP APIs, Discovery Engine service agent bindings, and caller IAM permissions—or click <strong className="text-gray-200">Enter Application</strong> to open the console directly.
                  </p>
                </div>
              ) : null}

              <ApiValidationPanel
                projectNumber={projectNumber}
                apiValidationResult={apiValidationResult}
                serviceAgentValidation={serviceAgentValidation}
                userPermissionsValidation={userPermissionsValidation}
                projectEnrollment={projectEnrollment}
                isGrantingServiceAgent={isGrantingServiceAgent}
                serviceAgentActionFeedback={serviceAgentActionFeedback}
                onGrantServiceAgent={onGrantServiceAgent}
                apisToEnable={apisToEnable}
                onToggleApiToEnable={onToggleApiToEnable}
                onToggleAllApisToEnable={onToggleAllApisToEnable}
                isApiEnablingLoading={isApiEnablingLoading}
                onEnableApis={onEnableApis}
              />
              {(isApiEnablingLoading || apiEnablementLogs.length > 0) && (
                <div className="p-4 bg-gray-900/90 rounded-xl border border-gray-800">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-300 mb-2">
                    API Enablement Log
                  </h3>
                  <pre className="bg-gray-950 text-xs text-gray-300 p-3 rounded-lg h-32 overflow-y-auto custom-scrollbar font-mono">
                    {apiEnablementLogs.join('\n')}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
