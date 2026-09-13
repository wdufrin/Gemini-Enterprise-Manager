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
import { ReasoningEngine, UserProfile } from '../../types';
import CloudBuildProgress from '../agent-builder/CloudBuildProgress';
import CurlInfoModal from '../CurlInfoModal';
import DirectQueryChatWindow from '../agent-engines/DirectQueryChatWindow';

interface AppModalsProps {
  activeBuilds: { id: string; projectId: string }[];
  onRemoveBuild: (id: string) => void;
  infoModalKey: string | null;
  onCloseInfoModal: () => void;
  directQueryEngine: ReasoningEngine | null;
  onCloseDirectQuery: () => void;
  projectNumber: string;
  accessToken: string;
  userProfile: UserProfile | null;
  showReauthModal: boolean;
  onCloseReauthModal: () => void;
  hasTokenClient: boolean;
  onGoogleSignIn: () => void;
  onSetAccessToken: (token: string) => void;
}

export const AppModals: React.FC<AppModalsProps> = ({
  activeBuilds,
  onRemoveBuild,
  infoModalKey,
  onCloseInfoModal,
  directQueryEngine,
  onCloseDirectQuery,
  projectNumber,
  accessToken,
  userProfile,
  showReauthModal,
  onCloseReauthModal,
  hasTokenClient,
  onGoogleSignIn,
  onSetAccessToken,
}) => {
  const [reauthTokenInput, setReauthTokenInput] = useState('');

  return (
    <>
      {/* Global Build Progress Indicators */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end">
        {activeBuilds.map((build) => (
          <CloudBuildProgress
            key={build.id}
            projectId={build.projectId}
            buildId={build.id}
            onClose={() => onRemoveBuild(build.id)}
          />
        ))}
      </div>

      {infoModalKey && (
        <CurlInfoModal infoKey={infoModalKey} onClose={onCloseInfoModal} />
      )}

      {directQueryEngine && (
        <DirectQueryChatWindow
          engine={directQueryEngine}
          userProfile={userProfile}
          config={{
            projectId: projectNumber,
            reasoningEngineLocation: directQueryEngine.name.split('/')[3],
            appLocation: 'global',
            collectionId: '',
            appId: '',
            assistantId: '',
          }}
          accessToken={accessToken}
          onClose={onCloseDirectQuery}
        />
      )}

      {showReauthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-gray-800 border border-amber-500/40 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Session Expired
                </h3>
                <p className="text-xs text-gray-400">
                  Re-authenticate to continue without losing your current work
                  or page state.
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              {hasTokenClient && (
                <button
                  type="button"
                  onClick={() => {
                    onGoogleSignIn();
                    onCloseReauthModal();
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  Re-authenticate with Google
                </button>
              )}

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-gray-700"></div>
                <span className="flex-shrink mx-3 text-gray-500 text-xs uppercase">
                  Or paste access token
                </span>
                <div className="flex-grow border-t border-gray-700"></div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!reauthTokenInput.trim()) return;
                  onSetAccessToken(reauthTokenInput.trim());
                  setReauthTokenInput('');
                  onCloseReauthModal();
                }}
                className="space-y-2"
              >
                {/* Hidden username field to satisfy accessibility and browser password manager heuristics */}
                <input
                  type="text"
                  name="username"
                  autoComplete="username"
                  className="hidden"
                  style={{ display: 'none' }}
                  tabIndex={-1}
                  aria-hidden="true"
                />
                <input
                  type="password"
                  name="gcpAccessToken"
                  autoComplete="current-password"
                  placeholder="Paste GCP Bearer token (gcloud auth print-access-token)"
                  value={reauthTokenInput}
                  onChange={(e) => setReauthTokenInput(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={!reauthTokenInput.trim()}
                  className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-colors"
                >
                  Update Token &amp; Continue
                </button>
              </form>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={onCloseReauthModal}
                className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
              >
                Dismiss (keep editing)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
