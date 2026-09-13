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

import React from 'react';
import Spinner from '../../Spinner';
import { AuthMode, TOKEN_TYPE_OPTIONS } from './types';

export interface WifAuthPanelProps {
  authMode: AuthMode;
  showWifConfig: boolean;
  setShowWifConfig: (show: boolean) => void;
  wifPoolId: string;
  setWifPoolId: (id: string) => void;
  wifProviderId: string;
  setWifProviderId: (id: string) => void;
  availablePools: any[];
  availableProviders: any[];
  isLoadingPools: boolean;
  isLoadingProviders: boolean;
  handleSignIn: () => Promise<void>;
  isSigningIn: boolean;
  wifSignedInEmail: string | null;
  wifProviderDisplayName: string | null;
  wifSubjectToken: string;
  setWifSubjectToken: (tok: string) => void;
  wifSubjectTokenType: string;
  setWifSubjectTokenType: (type: string) => void;
  setWifSignedInEmail: (email: string | null) => void;
  wifTokenError: string | null;
  wifAccessToken: string | null;
  showManualToken: boolean;
  setShowManualToken: (show: boolean) => void;
}

export const WifAuthPanel: React.FC<WifAuthPanelProps> = ({
  authMode,
  showWifConfig,
  setShowWifConfig,
  wifPoolId,
  setWifPoolId,
  wifProviderId,
  setWifProviderId,
  availablePools,
  availableProviders,
  isLoadingPools,
  isLoadingProviders,
  handleSignIn,
  isSigningIn,
  wifSignedInEmail,
  wifProviderDisplayName,
  wifSubjectToken,
  setWifSubjectToken,
  wifSubjectTokenType,
  setWifSubjectTokenType,
  setWifSignedInEmail,
  wifTokenError,
  wifAccessToken,
  showManualToken,
  setShowManualToken,
}) => {
  if (authMode !== 'wif') return null;

  if (!showWifConfig) {
    return (
      <button
        type="button"
        onClick={() => setShowWifConfig(true)}
        className="mt-2 w-full flex items-center justify-between px-3 py-2 bg-gray-800 border border-amber-700/40 rounded-lg text-xs hover:bg-gray-750 hover:border-amber-600/60 transition-colors"
      >
        <span className="flex items-center gap-2 text-amber-400">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          <span className="font-medium">WIF</span>
          {wifPoolId && <span className="text-gray-500">|</span>}
          {wifPoolId && <span className="text-gray-400 font-mono">{wifPoolId}/{wifProviderId || '...'}</span>}
        </span>
        <span className="flex items-center gap-2">
          {wifSignedInEmail && (
            <span className="text-green-400 flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {wifSignedInEmail}
            </span>
          )}
          {wifAccessToken && !wifSignedInEmail && (
            <span className="text-green-400">Token ready</span>
          )}
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>
    );
  }

  return (
    <div className="mt-3 p-3 bg-gray-800 border border-amber-700/50 rounded-lg space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          Workforce Identity Federation
        </h4>
        <button
          type="button"
          onClick={() => setShowWifConfig(false)}
          className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-700 transition-colors"
          title="Minimize"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>
      </div>

      {/* Pool & Provider */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-400 block mb-1">Workforce Pool ID *</label>
          {isLoadingPools ? (
            <div className="text-gray-500 text-xs">Loading pools...</div>
          ) : (
            <select
              value={availablePools.some(p => p.name.split('/').pop() === wifPoolId) ? wifPoolId : 'CUSTOM'}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'CUSTOM') {
                  setWifPoolId('');
                } else {
                  setWifPoolId(val);
                }
              }}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1.5 text-sm text-gray-200 focus:ring-amber-500 focus:border-amber-500"
            >
              <option value="">-- Select a Pool --</option>
              {availablePools.map(pool => {
                const poolId = pool.name.split('/').pop();
                return (
                  <option key={pool.name} value={poolId}>
                    {pool.displayName || poolId}
                  </option>
                );
              })}
              <option value="CUSTOM">Custom / Not Listed</option>
            </select>
          )}
          {(isLoadingPools || (!availablePools.some(p => p.name.split('/').pop() === wifPoolId) && wifPoolId !== '') || wifPoolId === '') && (
            <input
              type="text"
              value={wifPoolId}
              onChange={(e) => setWifPoolId(e.target.value)}
              placeholder="Enter custom pool ID"
              className="mt-1 w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:ring-amber-500 focus:border-amber-500"
            />
          )}
        </div>
        <div>
          <label className="text-xs font-medium text-gray-400 block mb-1">Provider ID *</label>
          {isLoadingProviders ? (
            <div className="text-gray-500 text-xs">Loading providers...</div>
          ) : (
            <select
              value={wifProviderId}
              onChange={(e) => setWifProviderId(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1.5 text-sm text-gray-200 focus:ring-amber-500 focus:border-amber-500"
              disabled={!wifPoolId}
            >
              <option value="">-- Select a Provider --</option>
              {availableProviders.map(provider => {
                const providerId = provider.name.split('/').pop();
                return (
                  <option key={provider.name} value={providerId}>
                    {provider.displayName || providerId}
                  </option>
                );
              })}
            </select>
          )}
          {!availableProviders.length && !isLoadingProviders && wifPoolId && (
            <input
              type="text"
              value={wifProviderId}
              onChange={(e) => setWifProviderId(e.target.value)}
              placeholder="Enter provider ID"
              className="mt-1 w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:ring-amber-500 focus:border-amber-500"
            />
          )}
        </div>
      </div>

      {/* Sign In Button & Status */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleSignIn}
          disabled={!wifPoolId.trim() || !wifProviderId.trim() || isSigningIn}
          className="px-4 py-2 bg-amber-600 text-white text-sm font-semibold rounded-md hover:bg-amber-700 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isSigningIn ? (
            <>
              <Spinner />
              Signing in...
            </>
          ) : wifSignedInEmail ? (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Re-authenticate
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              Sign In with Identity Provider
            </>
          )}
        </button>

        {wifSignedInEmail && (
          <span className="text-xs text-green-400 flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Signed in as <span className="font-mono font-medium text-green-300">{wifSignedInEmail}</span>
            {wifProviderDisplayName && <span className="text-gray-500 ml-1">({wifProviderDisplayName})</span>}
          </span>
        )}
        {!wifSignedInEmail && wifSubjectToken && !isSigningIn && (
          <span className="text-xs text-green-400 flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Token acquired (manual)
          </span>
        )}
      </div>

      {wifTokenError && (
        <div className="flex items-start gap-2 text-sm text-red-400 bg-red-900/20 border border-red-700/50 rounded-md px-3 py-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="font-medium">Authentication Error</p>
            <p className="text-xs mt-0.5">{wifTokenError}</p>
            {wifTokenError.includes('Popup was blocked') && (
              <p className="text-xs text-gray-400 mt-1">Allow popups for this site in your browser settings, then try again.</p>
            )}
          </div>
        </div>
      )}

      {/* Manual token fallback */}
      <details className="text-xs" open={showManualToken} onToggle={(e) => setShowManualToken((e.target as HTMLDetailsElement).open)}>
        <summary className="text-gray-500 cursor-pointer hover:text-gray-400 select-none">
          Advanced: paste token manually
        </summary>
        <div className="mt-2 space-y-2">
          <div>
            <label className="text-xs font-medium text-gray-400 block mb-1">Subject Token Type</label>
            <select
              value={wifSubjectTokenType}
              onChange={(e) => setWifSubjectTokenType(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1.5 text-sm text-gray-200 focus:ring-amber-500 focus:border-amber-500"
            >
              {TOKEN_TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-400 block mb-1">Subject Token</label>
            <textarea
              value={wifSubjectToken}
              onChange={(e) => { setWifSubjectToken(e.target.value); setWifSignedInEmail(null); }}
              placeholder="eyJhbGciOiJSUzI1NiIs..."
              rows={3}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1.5 text-sm text-gray-200 font-mono placeholder-gray-500 focus:ring-amber-500 focus:border-amber-500 resize-none"
            />
          </div>
        </div>
      </details>

      {/* STS exchange status */}
      {wifAccessToken && (
        <div className="flex items-center gap-1.5 text-xs text-green-400">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          STS token exchange successful — ready to query
        </div>
      )}
    </div>
  );
};
