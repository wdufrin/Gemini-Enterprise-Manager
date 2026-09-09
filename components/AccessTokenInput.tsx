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
      <div className="flex items-center gap-4 bg-gray-700/50 px-3 py-1.5 rounded-full border border-gray-600">
         <div className="flex items-center gap-3">
            {userProfile.picture ? (
                <img src={userProfile.picture} alt="Avatar" className="w-8 h-8 rounded-full border border-gray-500" />
            ) : (
                <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold">
                {(userProfile.name || userProfile.email || '?').charAt(0).toUpperCase()}
                </div>
            )}
            <div className="hidden md:block">
                <p className="text-xs font-semibold text-white">{userProfile.name}</p>
                <p className="text-[10px] text-gray-400">{userProfile.email}</p>
            </div>
         </div>
         <button 
            onClick={onSignOut}
            className="text-xs text-red-400 hover:text-red-300 hover:underline font-medium ml-2"
         >
            Sign Out
         </button>
      </div>
    );
  }

  if (accessToken) {
    return (
      <div className="flex items-center space-x-3 w-full md:w-auto">
        <span className="flex items-center text-sm text-green-400">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          Token Active
        </span>
        <button
          onClick={handleReset}
          className="px-4 py-1.5 bg-yellow-600 text-white text-sm font-semibold rounded-md hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-yellow-500"
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
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            className="text-gray-400 hover:text-white"
        >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
        </button>
        {showTooltip && (
            <div className="absolute z-10 w-64 p-2 mt-2 text-sm leading-tight text-white transform md:-translate-x-full bg-gray-700 rounded-lg shadow-lg top-full right-0 md:right-auto">
                <p>To use this application, you need a GCP access token.</p>
                <p className="mt-2">Run the following command in your terminal:</p>
                <code className="block p-2 mt-1 text-xs bg-gray-800 rounded">gcloud auth print-access-token</code>
                <p className="mt-1">Then, paste the output token here.</p>
            </div>
        )}
      </div>
      <input
        type="password"
        name="gcpAccessToken"
        autoComplete="new-password"
        value={tokenInput}
        onChange={(e) => setTokenInput(e.target.value)}
        placeholder="Paste GCP Access Token"
        className="flex-grow bg-gray-700 border border-gray-600 rounded-md px-3 py-1.5 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500"
      />
      <button
        type="submit"
        className="px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500"
      >
        Set Token
      </button>
    </form>
  );
};

export default AccessTokenInput;