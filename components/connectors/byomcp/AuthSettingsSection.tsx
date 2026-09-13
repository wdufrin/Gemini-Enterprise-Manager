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

interface AuthSettingsSectionProps {
  showAdvancedAuth: boolean;
  setShowAdvancedAuth: (val: boolean) => void;
  authType: string;
  setAuthType: (val: string) => void;
  scopes: string;
  setScopes: (val: string) => void;
  authUri: string;
  setAuthUri: (val: string) => void;
  tokenUri: string;
  setTokenUri: (val: string) => void;
  authUriParams: string;
  setAuthUriParams: (val: string) => void;
  clientId: string;
  setClientId: (val: string) => void;
  clientSecret: string;
  setClientSecret: (val: string) => void;
  showClientSecret: boolean;
  setShowClientSecret: (val: boolean) => void;
}

export const AuthSettingsSection: React.FC<AuthSettingsSectionProps> = ({
  showAdvancedAuth,
  setShowAdvancedAuth,
  authType,
  setAuthType,
  scopes,
  setScopes,
  authUri,
  setAuthUri,
  tokenUri,
  setTokenUri,
  authUriParams,
  setAuthUriParams,
  clientId,
  setClientId,
  clientSecret,
  setClientSecret,
  showClientSecret,
  setShowClientSecret,
}) => {
  return (
    <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-800 space-y-4">
      <div
        className="flex justify-between items-center cursor-pointer select-none"
        onClick={() => setShowAdvancedAuth(!showAdvancedAuth)}
      >
        <div>
          <h4 className="text-sm font-bold text-gray-200 uppercase tracking-wider flex items-center gap-2">
            Authentication & OAuth Settings
            <span className="text-[11px] font-normal lowercase text-gray-500 font-mono">
              ({authType})
            </span>
          </h4>
          <p className="text-xs text-gray-400">
            OAuth endpoints, scopes, authorization parameters, and credentials.
          </p>
        </div>
        <button className="text-gray-400 hover:text-white p-1" type="button">
          <svg
            className={`w-5 h-5 transform transition-transform ${showAdvancedAuth ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {showAdvancedAuth && (
        <div className="space-y-4 pt-2 border-t border-gray-800 animate-fadeIn">
          <div className="bg-blue-950/30 border border-blue-800/50 p-2.5 rounded text-xs text-blue-300 flex items-start gap-2">
            <svg className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              <strong>OAuth Credentials:</strong> Google Cloud redacts existing Client ID and Secret when inspecting connectors. When updating general settings (instructions, server description, or dynamic tools), your existing OAuth credentials remain intact and active. Providing a Client ID is only required if you are actively modifying OAuth endpoints or rotating credentials.
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Auth Type */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Auth Type <span className="text-purple-400 font-mono text-[10px]">(auth_type)</span>
              </label>
              <select
                value={authType}
                onChange={(e) => setAuthType(e.target.value)}
                className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="OAUTH">OAUTH</option>
                <option value="NONE">NONE</option>
                <option value="API_KEY">API_KEY</option>
                <option value="BEARER_TOKEN">BEARER_TOKEN</option>
                <option value="CUSTOM">CUSTOM</option>
              </select>
            </div>

            {/* Scopes */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                OAuth Scopes <span className="text-purple-400 font-mono text-[10px]">(scopes)</span>
              </label>
              <input
                type="text"
                value={scopes}
                onChange={(e) => setScopes(e.target.value)}
                placeholder="openid email https://www.googleapis.com/auth/cloud-platform"
                className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-xs text-white font-mono placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Auth URI */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                OAuth Authorization URI <span className="text-purple-400 font-mono text-[10px]">(auth_uri)</span>
              </label>
              <input
                type="text"
                value={authUri}
                onChange={(e) => setAuthUri(e.target.value)}
                placeholder="https://accounts.google.com/o/oauth2/v2/auth"
                className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-xs text-white font-mono placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Token URI */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                OAuth Token URI <span className="text-purple-400 font-mono text-[10px]">(token_uri)</span>
              </label>
              <input
                type="text"
                value={tokenUri}
                onChange={(e) => setTokenUri(e.target.value)}
                placeholder="https://oauth2.googleapis.com/token"
                className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-xs text-white font-mono placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Auth URI Extra Params */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Auth URI Extra Query Params <span className="text-purple-400 font-mono text-[10px]">(auth_uri_params)</span>
              </label>
              <input
                type="text"
                value={authUriParams}
                onChange={(e) => setAuthUriParams(e.target.value)}
                placeholder="&access_type=offline&prompt=consent"
                className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-xs text-white font-mono placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Client ID */}
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                Client ID (Optional Update)
              </label>
              <input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="Leave blank to preserve existing credentials"
                className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-xs text-white font-mono placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Client Secret */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-semibold text-gray-300">
                  Client Secret (Optional Update)
                </label>
                <button
                  type="button"
                  onClick={() => setShowClientSecret(!showClientSecret)}
                  className="text-[10px] text-gray-400 hover:text-white"
                >
                  {showClientSecret ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                type={showClientSecret ? 'text' : 'password'}
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="Leave blank to preserve existing credentials"
                className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-xs text-white font-mono placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
