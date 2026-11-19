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
import { UserProfile } from '../types';

interface AccessTokenInputProps {
  accessToken: string;
  setAccessToken: (token: string) => void;
  userProfile?: UserProfile | null;
  onSignOut?: () => void;
}

const AccessTokenInput: React.FC<AccessTokenInputProps> = ({ accessToken, setAccessToken, userProfile, onSignOut }) => {
  const [tokenInput, setTokenInput] = useState(accessToken);
  const [showTooltip, setShowTooltip] = useState(false);

  const handleSave = () => {
    setAccessToken(tokenInput.trim());
  };

  const handleReset = () => {
    setTokenInput('');
    setAccessToken('');
  };

  if (userProfile && onSignOut) {
    return (
      <div className="flex items-center gap-2.5 xl:gap-3 bg-gray-700/50 px-3 py-1 rounded-full border border-gray-600 shrink-0">
         <div className="flex items-center gap-2.5 min-w-0">
            {userProfile.picture ? (
                <img src={userProfile.picture} alt="Avatar" className="w-7 h-7 rounded-full border border-gray-500 shrink-0" />
            ) : (
                <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                {(userProfile.name || userProfile.email || '?').charAt(0).toUpperCase()}
                </div>
            )}
            <div className="hidden md:block min-w-0 max-w-[140px] xl:max-w-[180px]">
                <p className="text-xs font-semibold text-white truncate">{userProfile.name}</p>
                <p className="text-[10px] text-gray-400 truncate">{userProfile.email}</p>
            </div>
         </div>
         <button 
            onClick={onSignOut}
            className="text-xs text-red-400 hover:text-red-300 hover:underline font-medium ml-1 whitespace-nowrap shrink-0"
         >
            Sign Out
         </button>
      </div>
    );
  }

  if (accessToken) {
    return (
      <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-xs font-medium text-emerald-300 whitespace-nowrap shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
          <span className="hidden sm:inline">Token Active</span>
          <span className="sm:hidden">Active</span>
        </span>
        <button
          type="button"
          onClick={handleReset}
          className="px-2.5 py-1 bg-gray-800/90 hover:bg-gray-700 text-gray-300 hover:text-amber-300 border border-gray-700 hover:border-amber-500/40 text-xs font-medium rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 whitespace-nowrap shrink-0 transition-colors"
        >
          Reset Token
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
      className="flex items-center space-x-2 w-full md:w-auto"
    >
      <div className="relative">
         <button
            type="button"
            aria-label="How to obtain a GCP access token"
            aria-expanded={showTooltip}
            onClick={() => setShowTooltip((prev) => !prev)}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            onFocus={() => setShowTooltip(true)}
            onBlur={() => setShowTooltip(false)}
            className="p-1 text-gray-400 hover:text-white rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
        </button>
        {showTooltip && (
            <div role="tooltip" className="absolute z-20 w-64 p-2.5 mt-2 text-xs leading-relaxed text-gray-100 transform md:-translate-x-full bg-gray-900 border border-gray-700 rounded-lg shadow-xl top-full right-0 md:right-auto">
                <p>To use this application, you need a GCP access token.</p>
                <p className="mt-1.5 text-gray-400">Run in your terminal:</p>
                <code className="block p-2 mt-1 text-xs font-mono text-blue-300 bg-gray-950 border border-gray-800 rounded">gcloud auth print-access-token</code>
                <p className="mt-1.5 text-gray-400">Then paste the output token here.</p>
            </div>
        )}
      </div>
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
        aria-label="GCP Access Token"
        autoComplete="new-password"
        value={tokenInput}
        onChange={(e) => setTokenInput(e.target.value)}
        placeholder="Paste GCP Access Token"
        className="flex-grow min-w-0 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
      />
      <button
        type="submit"
        className="px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 focus-visible:ring-blue-500 shrink-0 transition-colors"
      >
        Set Token
      </button>
    </form>
  );
};

export default AccessTokenInput;