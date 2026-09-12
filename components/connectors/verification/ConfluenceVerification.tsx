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
import { DataMode } from '../ConnectorVerificationTab';

interface ConfluenceVerificationProps {
    dataMode: DataMode;
}

const ConfluenceVerification: React.FC<ConfluenceVerificationProps> = ({ dataMode }) => {
    const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

    const toggleItem = (id: string) => {
        setCheckedItems(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const ChecklistItem = ({ id, label, subLabel, badge, copyValue }: { id: string, label: string, subLabel?: string, badge?: string, copyValue?: string }) => {
        const isChecked = checkedItems[id] || false;

        const handleCopy = (e: React.MouseEvent) => {
            e.stopPropagation();
            if (copyValue) {
                navigator.clipboard.writeText(copyValue);
            }
        };

        return (
            <div
                onClick={() => toggleItem(id)}
                className={`flex items-start text-xs p-2 rounded border cursor-pointer transition-colors select-none mb-2 group/item ${isChecked
                        ? 'bg-blue-900/40 border-blue-500/50 text-blue-100'
                        : 'bg-gray-900/50 text-gray-300 border-gray-700 hover:border-gray-600'
                    }`}
            >
                <div className={`mt-0.5 min-w-[1rem] w-4 h-4 rounded border flex items-center justify-center mr-2 transition-colors ${isChecked ? 'bg-blue-500 border-blue-500' : 'border-gray-500 bg-transparent'
                    }`}>
                    {isChecked && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                        <span className="font-mono">{label}</span>
                        <div className="flex items-center gap-2">
                            {copyValue && (
                                <button
                                    onClick={handleCopy}
                                    className="opacity-0 group-hover/item:opacity-100 transition-opacity h-7 w-7 flex items-center justify-center rounded hover:bg-white/10 text-gray-400 hover:text-white"
                                    title="Copy to clipboard"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                </button>
                            )}
                            {badge && (
                                <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] bg-gray-700 text-gray-300 border border-gray-600 whitespace-nowrap">
                                    {badge}
                                </span>
                            )}
                        </div>
                    </div>
                    {subLabel && <p className="text-gray-500 mt-0.5 leading-tight break-all">{subLabel}</p>}
                </div>
            </div>
        );
    };

    const baseScopes = [
        'read:attachment:confluence',
        'read:comment:confluence',
        'read:configuration:confluence',
        'read:content-details:confluence',
        'read:content.metadata:confluence',
        'read:group:confluence',
        'read:page:confluence',
        'read:space:confluence',
        'read:user:confluence',
        'read:whiteboard:confluence'
    ];

    const federatedScopes = [
        ...baseScopes,
        'search:confluence'
    ];

    return (
        <div className="space-y-6 animate-fadeIn">
            <div>
                <h3 className="text-sm font-bold text-gray-300 mb-4 uppercase tracking-wider">
                    {dataMode === 'INGESTION' ? 'Confluence Ingestion Setup' : 'Confluence Federated Setup'}
                </h3>

                {/* Step 1: OAuth App */}
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
                    <h4 className="text-lg font-semibold text-white mb-4 flex items-center">
                        <span className="bg-blue-600 rounded-full w-6 h-6 flex items-center justify-center text-xs mr-2">1</span>
                        OAuth 2.0 App Setup
                    </h4>
                    <p className="text-gray-400 text-xs mb-4">
                        Create an app in the <strong>Atlassian Developer Console</strong>.
                    </p>
                    <ChecklistItem
                        id="oauth_create"
                        label="Create OAuth 2.0 (3LO) App"
                        subLabel="Select 'OAuth 2.0 Integration' in Developer Console."
                    />
                    <ChecklistItem
                        id="oauth_callback"
                        label="Callback URL"
                        badge="Critical"
                        subLabel="https://vertexaisearch.cloud.google.com/console/oauth/confluence_oauth.html"
                        copyValue="https://vertexaisearch.cloud.google.com/console/oauth/confluence_oauth.html"
                    />
                    <ChecklistItem
                        id="oauth_distribution"
                        label="Distribution Settings"
                        subLabel="Set 'Sharing' to Enable. Vendor: Google. Privacy: https://policies.google.com."
                    />
                </div>

                {/* Step 2: Identity / Email Visibility */}
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
                    <h4 className="text-lg font-semibold text-white mb-4 flex items-center">
                        <span className="bg-blue-600 rounded-full w-6 h-6 flex items-center justify-center text-xs mr-2">2</span>
                        Identity & Email Visibility
                    </h4>
                    <p className="text-gray-400 text-xs mb-4">
                        Required to map users correctly. If emails are hidden, install the &quot;User Identity Accessor&quot; app.
                    </p>
                    <div className="border-l-2 border-yellow-600 pl-3 mb-4">
                        <p className="text-[10px] text-yellow-200">
                            If user emails are private/restricted, the connector cannot map ACLs.
                        </p>
                    </div>

                    <ChecklistItem
                        id="id_check_visibility"
                        label="Check Email Visibility"
                        subLabel="Verify if user emails are visible to 'Anyone' in Profile settings."
                    />
                    <ChecklistItem
                        id="id_install_app"
                        label="Install 'User Identity Accessor'"
                        subLabel="From Atlassian Marketplace (if visibility is restricted)."
                    />
                    <ChecklistItem
                        id="id_api_key"
                        label="Configure API Key"
                        subLabel="Generate a key in the app config. Save this for the connector 'Forge Client Secret'."
                    />
                    <ChecklistItem
                        id="id_webtrigger"
                        label="Get Webtrigger URL"
                        subLabel="Copy the Webtrigger URL for the connector configuration."
                    />
                </div>

                {/* Step 3: Scopes */}
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                    <h4 className="text-lg font-semibold text-white mb-4 flex items-center">
                        <span className="bg-blue-600 rounded-full w-6 h-6 flex items-center justify-center text-xs mr-2">3</span>
                        Required Scopes
                    </h4>

                    <div className="mb-4">
                        <h5 className="text-xs font-bold text-gray-300 mb-2 uppercase">Base Scopes ({dataMode})</h5>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {(dataMode === 'INGESTION' ? baseScopes : federatedScopes).map(scope => (
                                <ChecklistItem key={scope} id={`scope_${scope}`} label={scope} />
                            ))}
                        </div>
                    </div>

                    <div>
                        <h5 className="text-xs font-bold text-gray-400 mb-2 uppercase">Optional: Action Scopes</h5>
                        <p className="text-[10px] text-gray-500 mb-2">Enable these only if you want the agent to modify Confluence content.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {['write:page:confluence', 'write:attachment:confluence'].map(scope => (
                                <ChecklistItem key={scope} id={`scope_${scope}`} label={scope} badge="Action" />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConfluenceVerification;
