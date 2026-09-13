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
import { Config } from '../../../types';
import * as api from '../../../services/apiService';
import CollapsibleSection from './CollapsibleSection';
import InfoTooltip from '../../InfoTooltip';

interface ScimTenant {
    name: string;
    displayName?: string;
    state?: string;
    serviceAgent?: string;
    baseUri?: string;
    claimMapping?: Record<string, string>;
}

export const ScimTenantsList: React.FC<{ providerName: string; config: Config }> = ({ providerName, config }) => {
    const [tenants, setTenants] = useState<ScimTenant[]>([]);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const toggleExpand = async () => {
        if (!expanded && tenants.length === 0) {
            setLoading(true);
            try {
                const res = await api.getWorkforcePoolProviderScimTenants(providerName, config);
                setTenants(res.workforcePoolProviderScimTenants || []);
            } catch (e) {
                console.error("Failed to fetch scim tenants", e);
            }
            setLoading(false);
        }
        setExpanded(!expanded);
    };

    return (
        <div className="mt-4 pt-3 border-t border-gray-700">
            <button type="button" onClick={toggleExpand} className="flex items-center text-sm font-semibold text-gray-300 hover:text-white group">
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 mr-1 text-gray-400 group-hover:text-blue-400 transition-transform ${expanded ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                SCIM Tenants
            </button>
            {expanded && (
                <div className="mt-2 bg-gray-900 rounded p-3 text-xs">
                    {loading ? (
                        <div className="text-gray-500">Loading SCIM tenants...</div>
                    ) : tenants.length === 0 ? (
                        <div className="text-gray-500 italic">No SCIM tenants found for this provider.</div>
                    ) : (
                        <ul className="space-y-3">
                            {tenants.map(t => (
                                <li key={t.name} className="border border-gray-700 rounded p-2 bg-gray-800">
                                    <div className="flex justify-between items-center mb-1">
                                        <strong className="text-blue-400 text-sm">{t.displayName || 'No Name'}</strong>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${t.state === 'ACTIVE' ? 'bg-green-900/50 text-green-400 border border-green-700' : 'bg-red-900/50 text-red-400 border border-red-700'}`}>{t.state}</span>
                                    </div>
                                    <div className="text-gray-400 mb-1"><strong className="text-gray-500">ID:</strong> <span className="text-gray-300 font-mono text-[10px]">{t.name.split('/').pop()}</span></div>
                                    <div className="text-gray-400 break-all mb-1"><strong className="text-gray-500">Service Agent:</strong> <br/><span className="text-gray-300 font-mono text-[10px]">{t.serviceAgent}</span></div>
                                    <div className="text-gray-400 break-all"><strong className="text-gray-500">Base URI:</strong> <br/><span className="text-gray-300 font-mono text-[10px]"><a href={t.baseUri} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">{t.baseUri}</a></span></div>
                                    
                                    {t.claimMapping && (
                                        <div className="mt-2">
                                            <strong className="text-gray-500 block mb-1">Claim Mappings:</strong>
                                            <ul className="pl-2 space-y-1 border-l-2 border-gray-700">
                                                {Object.entries(t.claimMapping).map(([key, val]) => (
                                                    <li key={key} className="flex justify-between text-[11px] font-mono"><span className="text-gray-300 truncate pr-2">{key}</span><span className="text-yellow-500 text-right truncate">{String(val)}</span></li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
};

interface IdpConfigurationSectionProps {
    config: Config;
    isLoadingIdp: boolean;
    idpData: { idpType: string; workforcePoolName: string };
    onIdpChange: (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => void;
    idpProviders: any[];
    widgetConfig: any;
    onSelectProvider: (providerName: string) => void;
}

export const IdpConfigurationSection: React.FC<IdpConfigurationSectionProps> = ({
    config,
    isLoadingIdp,
    idpData,
    onIdpChange,
    idpProviders,
    widgetConfig,
    onSelectProvider
}) => {
    return (
        <CollapsibleSection title="Identity Provider (IDP) Configuration (Applies to Location)">
            <div className="space-y-4 p-4 bg-gray-900/30 rounded-md">
                {isLoadingIdp ? (
                    <div className="text-gray-400 text-sm">Loading IDP Configuration...</div>
                ) : (
                    <>
                        <div className="bg-yellow-900/40 border border-yellow-700 p-3 rounded-md mb-4">
                            <p className="text-yellow-400 text-sm">
                                <strong>Warning:</strong> IDP Configuration is shared across all engines in the <code>{config.appLocation}</code> location. Changing this setting will affect access to all data sources in this region.
                            </p>
                        </div>
                        <div>
                            <label htmlFor="idpType" className="block text-sm font-medium text-gray-300 mb-1">
                                IDP Type <InfoTooltip text="Configure the Identity Provider used for data source access control." />
                            </label>
                            <select
                                name="idpType"
                                id="idpType"
                                value={idpData.idpType}
                                onChange={onIdpChange}
                                className="block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm text-gray-200 focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2 px-3 h-[42px]"
                            >
                                <option value="IDP_TYPE_UNSPECIFIED">None (Unspecified)</option>
                                <option value="GSUITE">Google Workspace / Cloud Identity (GSUITE)</option>
                                <option value="THIRD_PARTY">Third-Party IdP via Workforce Identity Federation</option>
                            </select>
                        </div>

                        {idpData.idpType === 'THIRD_PARTY' && (
                            <div className="animate-fade-in-up mt-4">
                                <label htmlFor="workforcePoolName" className="block text-sm font-medium text-gray-300">
                                    Workforce Identity Pool Name
                                </label>
                                <input
                                    type="text"
                                    name="workforcePoolName"
                                    id="workforcePoolName"
                                    value={idpData.workforcePoolName}
                                    onChange={onIdpChange}
                                    placeholder="locations/global/workforcePools/my-pool"
                                    className="mt-1 block w-full bg-gray-800 border-gray-600 rounded-md shadow-sm text-gray-200 sm:text-sm font-mono placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500 py-2 px-3"
                                    required={idpData.idpType === 'THIRD_PARTY'}
                                />
                            </div>
                        )}

                        {/* Render Identity Providers if we loaded any */}
                        {idpProviders.length > 0 && (
                            <div className="mt-6 space-y-4 border-t border-gray-700 pt-4">
                                <h4 className="text-md font-medium text-gray-200 mb-2">Attached Providers</h4>
                                <p className="text-sm text-gray-400 mb-4">Select the default provider that the Gemini Web App should use for authentication.</p>
                                
                                {idpProviders.map((provider: any, idx) => {
                                    const isSelected = widgetConfig?.accessSettings?.workforceIdentityPoolProvider === provider.name;
                                    return (
                                        <div key={idx} className={`border rounded-md p-4 text-sm transition-colors ${isSelected ? 'bg-blue-900/40 border-blue-500' : 'bg-gray-800 border-gray-600'}`}>
                                            <div className="flex justify-between items-center mb-3">
                                                <label className="flex items-center space-x-3 cursor-pointer group">
                                                    <input 
                                                        type="radio" 
                                                        name="activeProvider" 
                                                        checked={isSelected}
                                                        onChange={() => onSelectProvider(provider.name)}
                                                        className="h-4 w-4 bg-gray-700 border-gray-500 text-blue-500 focus:ring-blue-500 focus:ring-opacity-50"
                                                    />
                                                    <span className="font-semibold text-white group-hover:text-blue-300 transition-colors">{provider.displayName || provider.name.split('/').pop()}</span>
                                                    {isSelected && <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full ml-2">Active</span>}
                                                </label>
                                                <span className="bg-gray-900 text-gray-300 px-2 py-1 rounded text-xs font-mono border border-gray-700">{provider.name.split('/').pop()}</span>
                                            </div>
                                            
                                            {provider.saml && (
                                                <div className="space-y-2 text-gray-300">
                                                    <div><strong className="text-gray-400">Protocol:</strong> SAML</div>
                                                    <div>
                                                        <strong className="text-gray-400">SSO Redirect URL:</strong>
                                                        <span className="font-mono text-xs block text-blue-400 break-all bg-gray-900/50 p-1 rounded mt-1 select-all">
                                                            https://auth.cloud.google/signin-callback/{provider.name}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <strong className="text-gray-400">Entity ID:</strong>
                                                        <span className="font-mono text-xs block text-blue-400 break-all bg-gray-900/50 p-1 rounded mt-1 select-all">
                                                            https://iam.googleapis.com/{provider.name}
                                                        </span>
                                                    </div>
                                                    <div><strong className="text-gray-400">SAML Metadata:</strong> <span className="font-mono text-xs block truncate" title={provider.saml.idpMetadataXml ? 'Included in XML metadata' : 'Unknown'}>{provider.saml.idpMetadataXml ? '(See SAML Metadata XML)' : 'Not Set'}</span></div>
                                                </div>
                                            )}
                                            {provider.oidc && (
                                                <div className="space-y-2 text-gray-300">
                                                    <div><strong className="text-gray-400">Protocol:</strong> OIDC</div>
                                                    <div>
                                                        <strong className="text-gray-400">SSO Redirect URL:</strong>
                                                        <span className="font-mono text-xs block text-blue-400 break-all bg-gray-900/50 p-1 rounded mt-1 select-all">
                                                            https://auth.cloud.google/signin-callback/{provider.name}
                                                        </span>
                                                    </div>
                                                    <div><strong className="text-gray-400">Issuer URI:</strong> <a href={provider.oidc.issuerUri} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline break-all">{provider.oidc.issuerUri}</a></div>
                                                    <div><strong className="text-gray-400">Client ID:</strong> <span className="font-mono text-xs break-all">{provider.oidc.clientId}</span></div>
                                                </div>
                                            )}

                                            <div className="mt-4 pt-3 border-t border-gray-700">
                                                <strong className="text-gray-400 block mb-2">Attribute Mappings:</strong>
                                                <div className="bg-gray-900 rounded p-2">
                                                    {provider.attributeMapping ? (
                                                        <ul className="space-y-1 font-mono text-xs">
                                                            {Object.entries(provider.attributeMapping).map(([key, val]) => (
                                                                <li key={key} className="flex flex-col sm:flex-row sm:justify-between border-b border-gray-800 last:border-0 pb-1">
                                                                    <span className="text-green-400 truncate pr-2">{key}</span>
                                                                    <span className="text-yellow-400 truncate">{String(val)}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    ) : (
                                                        <span className="text-gray-500 italic">No attribute mappings configured</span>
                                                    )}
                                                </div>
                                            </div>

                                            {provider.attributeCondition && (
                                                <div className="mt-3">
                                                    <strong className="text-gray-400 block mb-1">Attribute Condition:</strong>
                                                    <div className="bg-gray-900 rounded p-2 text-xs font-mono text-purple-400 break-all">
                                                        {provider.attributeCondition}
                                                    </div>
                                                </div>
                                            )}

                                            <ScimTenantsList providerName={provider.name} config={config} />
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
            </div>
        </CollapsibleSection>
    );
};

export default IdpConfigurationSection;
