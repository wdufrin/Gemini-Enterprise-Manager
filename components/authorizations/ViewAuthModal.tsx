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
import { Authorization } from '../../types';
import { generateToolOAuthSnippet } from '../../services/adkTemplates';

interface ViewAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  authorization: Authorization | null;
  initialTab?: 'config' | 'adk';
}

const ViewAuthModal: React.FC<ViewAuthModalProps> = ({
  isOpen,
  onClose,
  authorization,
  initialTab = 'config',
}) => {
  const [activeTab, setActiveTab] = useState<'config' | 'adk'>(initialTab);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, isOpen]);

  if (!isOpen || !authorization) return null;

  const authId = authorization.name.split('/').pop() || '';
  const { serverSideOauth2 } = authorization;

  // Attempt to extract Tenant ID if it's an Azure/Entra ID URI
  // Pattern: https://login.microsoftonline.com/{tenant_id}/...
  let tenantId: string | null = null;
  if (serverSideOauth2?.authorizationUri && serverSideOauth2.authorizationUri.includes('login.microsoftonline.com')) {
    const match = serverSideOauth2.authorizationUri.match(new RegExp('login\\.microsoftonline\\.com/([^/]+)/'));
    if (match && match[1]) {
      tenantId = match[1];
    }
  }

  const snippet = generateToolOAuthSnippet(authId);

  const handleCopy = () => {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">

        {/* Background overlay */}
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={onClose}></div>

        {/* Modal panel */}
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        <div className="inline-block align-bottom bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl w-full border border-gray-700">

          <div className="bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                <div className="flex items-center justify-between border-b border-gray-700 pb-3">
                  <div>
                    <h3 className="text-lg leading-6 font-medium text-white" id="modal-title">
                      Authorization: <span className="font-mono text-blue-400">{authId}</span>
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">OAuth 2.0 Client & ADK Agent Integration Blueprint</p>
                  </div>
                  <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-900/60 text-blue-300 border border-blue-700">
                    {serverSideOauth2 ? 'OAuth 2.0' : 'Custom'}
                  </span>
                </div>

                {/* Tab Navigation */}
                <div className="flex border-b border-gray-700 mt-4 mb-4">
                  <button
                    type="button"
                    onClick={() => setActiveTab('config')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                      activeTab === 'config'
                        ? 'border-blue-500 text-blue-400 font-semibold'
                        : 'border-transparent text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Configuration Details
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('adk')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                      activeTab === 'adk'
                        ? 'border-blue-500 text-blue-400 font-semibold'
                        : 'border-transparent text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                    ADK Python Blueprint
                  </button>
                </div>

                {/* Tab 1: Configuration */}
                {activeTab === 'config' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider">Name (ID)</label>
                      <div className="mt-1 flex rounded-md shadow-sm">
                        <input
                          type="text"
                          readOnly
                          value={authId}
                          className="flex-1 block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 font-mono"
                        />
                      </div>
                    </div>

                    {serverSideOauth2 && (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider">Client ID</label>
                          <div className="mt-1">
                            <input
                              type="text"
                              readOnly
                              value={serverSideOauth2.clientId}
                              className="block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 font-mono"
                            />
                          </div>
                        </div>

                        {tenantId && (
                          <div className="bg-blue-900/20 border border-blue-800/50 rounded-md p-3">
                            <label className="block text-xs font-bold text-blue-300 uppercase tracking-wider">Tenant ID (Entra ID)</label>
                            <div className="mt-1 flex items-center">
                              <input
                                type="text"
                                readOnly
                                value={tenantId}
                                className="block w-full px-3 py-2 bg-gray-800 border border-blue-700 rounded-md text-sm text-blue-200 focus:ring-blue-500 focus:border-blue-500 font-mono"
                              />
                            </div>
                          </div>
                        )}

                        <div>
                          <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider">Authorization URI</label>
                          <div className="mt-1">
                            <input
                              type="text"
                              readOnly
                              value={serverSideOauth2.authorizationUri}
                              className="block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 font-mono"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider">Token URI</label>
                          <div className="mt-1">
                            <input
                              type="text"
                              readOnly
                              value={serverSideOauth2.tokenUri}
                              className="block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500 font-mono"
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {!serverSideOauth2 && (
                      <div className="p-4 bg-yellow-900/30 text-yellow-200 rounded-md text-sm border border-yellow-700/50">
                        No OAuth2 configuration found for this authorization.
                      </div>
                    )}

                    <div className="pt-2 border-t border-gray-700">
                      <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Full Resource Name</label>
                      <code className="block w-full text-left px-3 py-2 bg-gray-900 rounded-md text-xs text-gray-400 font-mono break-all leading-relaxed">
                        {authorization.name}
                      </code>
                    </div>
                  </div>
                )}

                {/* Tab 2: ADK Python Blueprint */}
                {activeTab === 'adk' && (
                  <div className="space-y-4">
                    <div className="bg-teal-900/20 border border-teal-700/40 rounded-lg p-3 text-xs text-teal-200 leading-relaxed">
                      <p className="font-semibold text-teal-300 mb-1">End-User OAuth Delegation Blueprint</p>
                      In Gemini Enterprise, user OAuth tokens are automatically injected into the agent's{' '}
                      <code className="text-teal-100 font-mono bg-teal-950/60 px-1 py-0.5 rounded">ToolContext</code> state.
                      Use this Python function in your ADK tools to extract the delegated token and call downstream APIs on behalf of the user.
                    </div>

                    <div className="relative rounded-lg overflow-hidden border border-gray-700 bg-gray-900">
                      <div className="flex items-center justify-between px-4 py-2 bg-gray-800/80 border-b border-gray-700">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span>
                          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block"></span>
                          <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block"></span>
                          <span className="text-xs font-mono text-gray-300 ml-2">tool_oauth_delegation.py</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleCopy}
                          className="px-3 py-1 text-xs font-medium rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors flex items-center gap-1.5 shadow-sm"
                        >
                          {copied ? (
                            <>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              <span>Copy Snippet</span>
                            </>
                          )}
                        </button>
                      </div>
                      <pre className="p-4 text-xs font-mono text-gray-200 overflow-x-auto max-h-[380px] leading-relaxed bg-gray-950">
                        {snippet}
                      </pre>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>

          <div className="bg-gray-700/50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse border-t border-gray-700 gap-2">
            <button
              type="button"
              className="w-full inline-flex justify-center rounded-md border border-gray-600 shadow-sm px-4 py-2 bg-gray-800 text-base font-medium text-gray-300 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:w-auto sm:text-sm"
              onClick={onClose}
            >
              Close
            </button>
            {activeTab === 'adk' && (
              <button
                type="button"
                onClick={handleCopy}
                className="w-full inline-flex justify-center rounded-md border border-blue-600 shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-500 focus:outline-none sm:w-auto sm:text-sm gap-1.5 items-center"
              >
                {copied ? 'Copied to Clipboard!' : 'Copy Python Snippet'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ViewAuthModal;
