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

  return (
    <div className="flex items-center justify-center h-screen bg-gray-900 text-gray-100 font-sans p-4 overflow-y-auto">
      <div className="w-full max-w-3xl p-8 space-y-6 bg-gray-800 rounded-xl shadow-2xl border border-gray-700 my-8">
        <div className="text-center">
          <div className="flex justify-center mb-4 text-blue-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-12 w-12"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white">
            Welcome to Gemini Enterprise Manager
          </h1>
        </div>

        {!isGapiReady ? (
          <div className="space-y-4">
            <p className="text-center text-gray-400">
              Please authenticate to access and manage your Google Cloud Gemini
              Enterprise resources.
            </p>

            <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700 space-y-3">
              <h3 className="text-sm font-semibold text-white">
                Sign In with Google
              </h3>
              <p className="text-xs text-gray-400">
                Sign in using your Google account to automatically grant access
                to Discovery Engine and related APIs.
              </p>
              <button
                onClick={onGoogleSignIn}
                disabled={isGapiLoading || isTokenValidating}
                className="w-full py-2.5 px-4 bg-white hover:bg-gray-100 text-gray-900 font-medium text-sm rounded-md shadow flex items-center justify-center gap-3 transition-colors disabled:bg-gray-600 disabled:text-gray-400"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
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

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-gray-700"></div>
              <span className="flex-shrink mx-4 text-xs text-gray-500 uppercase">
                Or use Access Token
              </span>
              <div className="flex-grow border-t border-gray-700"></div>
            </div>

            <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700 space-y-3">
              <h3 className="text-sm font-semibold text-white">
                Manual Access Token
              </h3>
              <p className="text-xs text-gray-400">
                If you cannot use Google Sign-In, paste an access token obtained
                via the Google Cloud SDK:
              </p>
              <div className="flex items-center justify-between bg-gray-950 px-2.5 py-1.5 rounded border border-gray-700">
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
                  className="text-[11px] text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 border border-gray-600 transition-colors"
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
                  onClick={() => setShowOAuthSettings(!showOAuthSettings)}
                  className="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1 focus:outline-none"
                >
                  <span>{showOAuthSettings ? '▲' : '▼'}</span>
                  <span>Advanced: Configure OAuth Client ID</span>
                </button>

                <div
                  className={`mt-2 space-y-2 overflow-hidden transition-all duration-200 ${showOAuthSettings ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}
                >
                  <p className="text-[11px] text-gray-500">
                    If you are hosting this on a custom domain, provide your
                    custom OAuth Client ID authorized for that origin.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
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
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-blue-500 flex-1 font-mono"
                    />
                    {googleClientId !== DEFAULT_GOOGLE_CLIENT_ID && (
                      <button
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
                        className="text-[10px] bg-red-900/30 text-red-300 hover:bg-red-900/50 px-2 py-1 rounded border border-red-800"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {isGapiLoading && (
              <div className="flex items-center justify-center p-4 text-sm text-blue-300">
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-400 mr-3"></div>
                Initializing Google API Client... Please wait.
              </div>
            )}
            {isTokenValidating && (
              <div className="flex items-center justify-center p-4 text-sm text-blue-300">
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-400 mr-3"></div>
                Validating access token permissions...
              </div>
            )}
            {gapiError && (
              <div className="p-4 text-sm text-center text-red-300 bg-red-900/30 rounded-lg border border-red-800">
                {gapiError}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="p-4 text-center text-green-300 bg-green-900/30 rounded-lg border border-green-700">
              API Client Initialized &amp; Token Validated Successfully!
            </div>
            <p className="text-center text-gray-400 text-xs">
              Step 2: Set your Project and validate required APIs, service
              agents, and caller permissions.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Project ID / Number
              </label>
              <ProjectInput
                value={projectNumber}
                onChange={onSetProjectNumber}
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={onValidateApis}
                disabled={
                  !projectNumber ||
                  isApiValidationLoading ||
                  isApiEnablingLoading
                }
                className="w-full px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-md hover:bg-indigo-700 disabled:bg-gray-600 flex items-center justify-center"
              >
                {isApiValidationLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                    Validating Diagnostics...
                  </>
                ) : (
                  'Validate APIs & Permissions'
                )}
              </button>
              <button
                onClick={onEnterApp}
                disabled={!projectNumber || isApiEnablingLoading}
                className="w-full px-4 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700 disabled:bg-gray-600"
              >
                Enter Application
              </button>
            </div>
            {gapiError && (
              <div className="p-4 text-sm text-center text-red-300 bg-red-900/30 rounded-lg">
                {gapiError}
              </div>
            )}
            <ApiValidationPanel
              projectNumber={projectNumber}
              apiValidationResult={apiValidationResult}
              serviceAgentValidation={serviceAgentValidation}
              userPermissionsValidation={userPermissionsValidation}
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
              <div className="mt-4">
                <h4 className="text-sm font-semibold text-gray-300 mb-2">
                  API Enablement Log
                </h4>
                <pre className="bg-gray-900 text-xs text-gray-300 p-3 rounded-md h-32 overflow-y-auto font-mono">
                  {apiEnablementLogs.join('\n')}
                </pre>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
