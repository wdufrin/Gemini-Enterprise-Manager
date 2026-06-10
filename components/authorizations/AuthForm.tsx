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

import React, { useState, useEffect, useCallback } from 'react';
import * as api from '../../services/apiService';
import { Authorization, Config } from '../../types';

interface AuthFormProps {
  config: Config;
  onSuccess: () => void;
  onCancel: () => void;
  authToEdit?: Authorization | null;
}

const initialFormData = {
    authId: 'your-auth-id',
    authProvider: 'google', // 'google' | 'microsoft'
    tenantId: '', // For Microsoft
    oauthClientId: 'your-oauth-client-id',
    oauthClientSecret: '', // Start empty
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
    oauthTokenUri: 'https://oauth2.googleapis.com/token',
    redirectUri: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
    authorizationUri: '', // Will be populated by effect
};

const FormField: React.FC<{ name: keyof typeof initialFormData; label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; required?: boolean; type?: string; helpText?: string; disabled?: boolean; }> = 
({ name, label, value, onChange, required = false, type = 'text', helpText, disabled = false }) => (
    <div>
        <label htmlFor={name} className="block text-sm font-medium text-gray-300">{label}</label>
        <input type={type} name={name} id={name} value={value} onChange={onChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm text-white disabled:bg-gray-800 disabled:text-gray-400 disabled:cursor-not-allowed" required={required} disabled={disabled} />
        {helpText && <p className="mt-1 text-xs text-gray-400">{helpText}</p>}
    </div>
);

const AuthForm: React.FC<AuthFormProps> = ({ config, onSuccess, onCancel, authToEdit }) => {
  const [formData, setFormData] = useState(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showScopesTooltip, setShowScopesTooltip] = useState(false);
  const [autoGenerateUri, setAutoGenerateUri] = useState(true);

  // State for cURL command preview
  const [curlCommand, setCurlCommand] = useState('');
  const [copySuccessCurl, setCopySuccessCurl] = useState(false);


    const constructAuthUri = useCallback((provider: string, clientId: string, redirectUri: string, scopes: string, tenantId?: string) => {
      const encodedScopes = encodeURIComponent(scopes.split(',').join(' '));
        if (provider === 'microsoft' && tenantId) {
            return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodedScopes}&response_mode=query&prompt=consent`;
        }
        // Default to Google
      return `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${encodedScopes}&response_type=code&access_type=offline&prompt=consent`;
  }, []);

  useEffect(() => {
    if (authToEdit) {
        const authUri = authToEdit.serverSideOauth2.authorizationUri;
        let scopes = '';
        let redirectUri = '';
        try {
            const url = new URL(authUri);
            scopes = url.searchParams.get('scope')?.split(' ').join(',') || '';
            redirectUri = url.searchParams.get('redirect_uri') || '';
        } catch(e) {
            console.error("Could not parse authorization URI", authUri);
        }

        const clientId = authToEdit.serverSideOauth2.clientId;
        const tokenUri = authToEdit.serverSideOauth2.tokenUri;
        


        // Detect provider and tenant ID
        let detectedProvider = 'google';
        let detectedTenantId = '';

        if (authUri.includes('microsoftonline.com') || tokenUri.includes('microsoftonline.com')) {
            detectedProvider = 'microsoft';
            // Try to extract tenant ID from Auth URI first, then Token URI
            const tenantMatch = authUri.match(/microsoftonline\.com\/([^\/]+)\//) ||
                tokenUri.match(/microsoftonline\.com\/([^\/]+)\//);
            if (tenantMatch) {
                detectedTenantId = tenantMatch[1];
            }
        }

        // Check if the existing URI matches the standard pattern for the detected provider
        const generated = constructAuthUri(detectedProvider, clientId, redirectUri, scopes, detectedTenantId);
        const isStandard = authUri === generated;

        setFormData({
            authId: authToEdit.name,
            authProvider: detectedProvider,
            tenantId: detectedTenantId,
            oauthClientId: clientId,
            oauthClientSecret: '', // Don't show the secret
            scopes: scopes,
            oauthTokenUri: authToEdit.serverSideOauth2.tokenUri || '',
            redirectUri: redirectUri,
            authorizationUri: authUri, // Keep original URI initially
        });

        // Smart Auto-Generate: User requested to always have this enabled by default.
        // This ensures the URI is regenerated based on the loaded fields.
        setAutoGenerateUri(true); 
    } else {
        setFormData({
            ...initialFormData,
            authorizationUri: constructAuthUri('google', initialFormData.oauthClientId, initialFormData.redirectUri, initialFormData.scopes)
        });
        setAutoGenerateUri(true);
    }
  }, [authToEdit, constructAuthUri]);
  
  // Effect to auto-update Authorization URI when dependencies change
  useEffect(() => {
      if (autoGenerateUri) {
          const newUri = constructAuthUri(formData.authProvider, formData.oauthClientId, formData.redirectUri, formData.scopes, formData.tenantId);
          setFormData(prev => ({ ...prev, authorizationUri: newUri }));
      }
  }, [autoGenerateUri, formData.authProvider, formData.oauthClientId, formData.redirectUri, formData.scopes, formData.tenantId, constructAuthUri]);


    // Helper to handle provider change
    const handleProviderChange = (newProvider: string) => {
        const defaults = newProvider === 'microsoft' ? {
            scopes: 'https://graph.microsoft.com/Mail.Read,https://graph.microsoft.com/Calendars.Read,offline_access',
            oauthTokenUri: formData.tenantId ? `https://login.microsoftonline.com/${formData.tenantId}/oauth2/v2.0/token` : 'https://login.microsoftonline.com/YOUR_TENANT_ID/oauth2/v2.0/token'
        } : {
            scopes: 'https://www.googleapis.com/auth/cloud-platform',
            oauthTokenUri: 'https://oauth2.googleapis.com/token'
        };

        setFormData(prev => ({
            ...prev,
            authProvider: newProvider,
            ...defaults
        }));
    };

    // Update token URI when Tenant ID changes for Microsoft
    useEffect(() => {
        if (formData.authProvider === 'microsoft' && formData.tenantId) {
            setFormData(prev => ({
                ...prev,
                oauthTokenUri: `https://login.microsoftonline.com/${prev.tenantId}/oauth2/v2.0/token`
            }));
        }
    }, [formData.tenantId, formData.authProvider]);

  // Effect to generate the cURL command preview for both create and update
  useEffect(() => {
    const { projectId } = config;
    if (!projectId) {
        setCurlCommand('Project ID must be set.');
        return;
    }

    if (authToEdit) {
        // --- UPDATE (PATCH) LOGIC ---
        const updateMask: string[] = [];
        const payload: any = {
            serverSideOauth2: {}
        };

        if (formData.oauthClientId !== authToEdit.serverSideOauth2.clientId) {
            updateMask.push('serverSideOauth2.clientId');
            payload.serverSideOauth2.clientId = formData.oauthClientId;
        }
        if (formData.authorizationUri !== authToEdit.serverSideOauth2.authorizationUri) {
            updateMask.push('serverSideOauth2.authorizationUri');
            payload.serverSideOauth2.authorizationUri = formData.authorizationUri;
        }
        if (formData.oauthTokenUri !== authToEdit.serverSideOauth2.tokenUri) {
            updateMask.push('serverSideOauth2.tokenUri');
            payload.serverSideOauth2.tokenUri = formData.oauthTokenUri;
        }
        if (formData.oauthClientSecret) {
            updateMask.push('serverSideOauth2.clientSecret');
            payload.serverSideOauth2.clientSecret = formData.oauthClientSecret;
        }

        if (updateMask.length === 0) {
            setCurlCommand('# No changes detected. Modify the form to see the update command.');
            return;
        }

        if (Object.keys(payload.serverSideOauth2).length === 0) {
            delete payload.serverSideOauth2;
        }

        const previewPayload = JSON.parse(JSON.stringify(payload));
        if (previewPayload.serverSideOauth2 && previewPayload.serverSideOauth2.clientSecret) {
            previewPayload.serverSideOauth2.clientSecret = '[YOUR_CLIENT_SECRET]';
        }

        const payloadString = JSON.stringify(previewPayload, null, 2);
        const location = config.appLocation || 'global';
        const domain = location === 'global' ? 'discoveryengine.googleapis.com' : `${location}-discoveryengine.googleapis.com`;

        // Use full name from authToEdit if available, otherwise construct it
        // Ensure we don't duplicate the project/location part if authToEdit.name is already full
        let name = authToEdit.name;
        if (!name.startsWith('projects/')) {
            name = `projects/${projectId}/locations/${location}/authorizations/${name}`;
        }

        const url = `https://${domain}/v1alpha/${name}?updateMask=${updateMask.join(',')}`;

        const command = `curl -X PATCH \\
     -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
     -H "Content-Type: application/json" \\
     -H "X-Goog-User-Project: ${projectId}" \\
     -d '${payloadString}' \\
     "${url}"`;
        setCurlCommand(command);

    } else {
        // --- CREATE (POST) LOGIC ---
        const finalAuthId = formData.authId.split('/').pop()?.trim() || '';
        if (!finalAuthId) {
            setCurlCommand('Authorization ID is required.');
            return;
        }
        
        const createPayload: any = {
            serverSideOauth2: {
                clientId: formData.oauthClientId,
                clientSecret: formData.oauthClientSecret,
                authorizationUri: formData.authorizationUri,
                tokenUri: formData.oauthTokenUri,
            },
        };

        const previewPayload = JSON.parse(JSON.stringify(createPayload));
        if (previewPayload.serverSideOauth2 && previewPayload.serverSideOauth2.clientSecret) {
            previewPayload.serverSideOauth2.clientSecret = '[YOUR_CLIENT_SECRET]';
        }

        const payloadString = JSON.stringify(previewPayload, null, 2);
        const location = config.appLocation || 'global';
        const domain = location === 'global' ? 'discoveryengine.googleapis.com' : `${location}-discoveryengine.googleapis.com`;
        const url = `https://${domain}/v1alpha/projects/${projectId}/locations/${location}/authorizations?authorizationId=${finalAuthId}`;

        const command = `curl -X POST \\
     -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
     -H "Content-Type: application/json" \\
     -H "X-Goog-User-Project: ${projectId}" \\
     -d '${payloadString}' \\
     "${url}"`;
        setCurlCommand(command);
    }
  }, [formData, authToEdit, config]);


  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    
    const payload = {
      serverSideOauth2: {
        clientId: formData.oauthClientId,
        clientSecret: formData.oauthClientSecret,
        authorizationUri: formData.authorizationUri,
        tokenUri: formData.oauthTokenUri,
      },
    };

    // Only include clientSecret if user provided a new one
    if (!formData.oauthClientSecret) {
        delete payload.serverSideOauth2.clientSecret;
    }

    try {
      if (authToEdit) {
        // Build update mask dynamically for PATCH using correct camelCase paths
        const updateMask: string[] = [];
        if (formData.oauthClientId !== authToEdit.serverSideOauth2.clientId) updateMask.push('serverSideOauth2.clientId');
        if (formData.authorizationUri !== authToEdit.serverSideOauth2.authorizationUri) updateMask.push('serverSideOauth2.authorizationUri');
        if (formData.oauthTokenUri !== authToEdit.serverSideOauth2.tokenUri) updateMask.push('serverSideOauth2.tokenUri');
        if (formData.oauthClientSecret) updateMask.push('serverSideOauth2.clientSecret');
        
        if (updateMask.length > 0) {
            await api.updateAuthorization(authToEdit.name, payload, updateMask, config);
        }
      } else {
        // Sanitize the authId to prevent sending a full resource path
        const finalAuthId = formData.authId.split('/').pop() || '';
        if (!finalAuthId) {
            throw new Error("Authorization ID cannot be empty.");
        }
        await api.createAuthorization(finalAuthId, payload, config);
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to save authorization.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyCurlCommand = () => {
    navigator.clipboard.writeText(curlCommand).then(() => {
        setCopySuccessCurl(true);
        setTimeout(() => setCopySuccessCurl(false), 2000);
    });
  };
  
  return (
    <div className="bg-gray-800 shadow-xl rounded-lg p-6 max-w-7xl mx-auto">
        <div className="flex justify-between items-start mb-6">
            <h2 className="text-2xl font-bold text-white">{authToEdit ? 'Update Authorization' : 'Create New Authorization'}</h2>
            <button type="button" onClick={onCancel} className="text-gray-400 hover:text-white">&larr; Back to list</button>
        </div>
      
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Column 1: The Form */}
            <form id="auth-form" onSubmit={handleSubmit} className="space-y-4">
                  <FormField name="authId" label="Authorization ID" value={formData.authId} onChange={handleChange} required disabled={!!authToEdit} helpText={!authToEdit ? 'Enter a unique ID or paste the full resource name.' : 'The full resource name of the authorization.'} />


                  {authToEdit && (
                      <div>
                          <label className="block text-sm font-medium text-gray-300">Region</label>
                          <input
                              type="text"
                              value={authToEdit.name.match(/locations\/([a-zA-Z0-9-]+)\//)?.[1] || 'unknown'}
                              disabled
                              className="mt-1 block w-full bg-gray-800 border-gray-700 rounded-md shadow-sm text-sm text-gray-400 cursor-not-allowed"
                          />
                      </div>
                  )}

                  {!authToEdit && (
                      <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">Provider</label>
                          <div className="flex items-center space-x-4">
                              <label className="flex items-center cursor-pointer">
                                  <input
                                      type="radio"
                                      name="authProvider"
                                      value="google"
                                      checked={formData.authProvider === 'google'}
                                      onChange={(e) => handleProviderChange(e.target.value)}
                                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                                  />
                                  <span className="ml-2 text-white">Google</span>
                              </label>
                              <label className="flex items-center cursor-pointer">
                                  <input
                                      type="radio"
                                      name="authProvider"
                                      value="microsoft"
                                      checked={formData.authProvider === 'microsoft'}
                                      onChange={(e) => handleProviderChange(e.target.value)}
                                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                                  />
                                  <span className="ml-2 text-white">Microsoft Entra ID</span>
                              </label>
                          </div>
                      </div>
                  )}

                  {formData.authProvider === 'microsoft' && (
                      <FormField name="tenantId" label="Tenant ID" value={formData.tenantId} onChange={handleChange} required={formData.authProvider === 'microsoft'} helpText="Your Microsoft Entra ID Directory (tenant) ID." />
                  )}

                <FormField name="oauthClientId" label="OAuth 2.0 Client ID" value={formData.oauthClientId} onChange={handleChange} required />
                <FormField name="oauthClientSecret" label="OAuth 2.0 Client Secret" value={formData.oauthClientSecret} onChange={handleChange} required={!authToEdit} type="password" helpText={authToEdit ? 'Leave blank to keep existing secret. Enter a new value to update.' : ''} />
                
                <div>
                    <div className="flex items-center space-x-2">
                        <label htmlFor="scopes" className="block text-sm font-medium text-gray-300">OAuth 2.0 Scopes</label>
                        <div 
                            className="relative"
                            onMouseEnter={() => setShowScopesTooltip(true)}
                            onMouseLeave={() => setShowScopesTooltip(false)}
                        >
                            <button
                                type="button"
                                className="text-gray-400 hover:text-white"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                </svg>
                            </button>
                            {showScopesTooltip && (
                                <div className="absolute z-10 w-80 p-3 mt-2 text-sm text-white transform -translate-x-1/2 left-1/2 bg-gray-700 rounded-lg shadow-lg bottom-full mb-2">
                                    <p className="font-semibold">Common OAuth Scopes:</p>
                                    <ul className="list-disc list-inside mt-2 space-y-1 text-xs">
                                        <li><code>https://www.googleapis.com/auth/cloud-platform</code> (Broad access)</li>
                                        <li><code>https://www.googleapis.com/auth/drive.readonly</code></li>
                                        <li><code>https://www.googleapis.com/auth/calendar.events</code></li>
                                    </ul>
                                    <p className="mt-3">For a full list, visit:</p>
                                    <a href="https://developers.google.com/identity/protocols/oauth2/scopes" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline text-xs break-all">
                                        developers.google.com/identity/protocols/oauth2/scopes
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>
                    <input
                        type="text"
                        name="scopes"
                        id="scopes"
                        value={formData.scopes}
                        onChange={handleChange}
                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm text-white"
                        required
                    />
                    <p className="mt-1 text-xs text-gray-400">Comma-separated list of scopes.</p>
                </div>

                <FormField name="redirectUri" label="OAuth Redirect URI" value={formData.redirectUri} onChange={handleChange} />
                
                <div className="p-3 bg-gray-900/50 rounded-md border border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                        <label htmlFor="authorizationUri" className="block text-sm font-medium text-gray-300">Authorization URI</label>
                        <label className="flex items-center cursor-pointer text-xs text-blue-300 hover:text-blue-200">
                            <input 
                                type="checkbox" 
                                checked={autoGenerateUri} 
                                onChange={(e) => setAutoGenerateUri(e.target.checked)} 
                                className="mr-2 h-3.5 w-3.5 rounded bg-gray-700 border-gray-500 text-blue-500 focus:ring-blue-600"
                            />
                              Auto-generate Auth URI
                        </label>
                    </div>
                    <input
                        type="text"
                        name="authorizationUri"
                        id="authorizationUri"
                        value={formData.authorizationUri}
                        onChange={handleChange}
                        className="block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm text-sm text-white disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed"
                        disabled={autoGenerateUri}
                        required
                    />
                    <p className="mt-1 text-xs text-gray-400">The URL users are redirected to for authentication.</p>
                </div>

                <FormField name="oauthTokenUri" label="OAuth Token URI" value={formData.oauthTokenUri} onChange={handleChange} />
            </form>

            {/* Column 2: The Preview */}
            <div>
                <h3 className="text-xl font-semibold text-white">cURL Command Preview</h3>
                <p className="text-sm text-gray-400 mt-1 mb-2">
                    {authToEdit
                        ? "This command reflects changes made in the form for updating the authorization."
                        : "This command reflects the current form settings for creating a new authorization."}
                </p>
                <div className="bg-gray-900 rounded-lg p-4 relative" style={{ maxHeight: 'calc(100vh - 25rem)', overflowY: 'auto' }}>
                    <button
                        onClick={handleCopyCurlCommand}
                        className="absolute top-3 right-3 px-3 py-1 bg-gray-600 text-white text-xs font-semibold rounded-md hover:bg-gray-500 z-10"
                    >
                        {copySuccessCurl ? 'Copied!' : 'Copy'}
                    </button>
                    <pre className="text-xs text-gray-300 whitespace-pre-wrap">
                        <code>
                            {curlCommand}
                        </code>
                    </pre>
                </div>
            </div>
        </div>

        {/* Buttons and Error outside the grid, at the bottom of the component */}
        <div className="mt-6">
            {error && <p className="text-red-400 mb-4 text-center">{error}</p>}
            <div className="flex justify-end space-x-3 border-t border-gray-700 pt-4">
                <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700">Cancel</button>
                <button type="submit" form="auth-form" disabled={isSubmitting} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-800">
                    {isSubmitting ? 'Saving...' : authToEdit ? 'Update' : 'Create'}
                </button>
            </div>
        </div>
    </div>
  );
};

export default AuthForm;