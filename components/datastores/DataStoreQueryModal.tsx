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

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Config, DataStore, Document } from '../../types';
import * as api from '../../services/apiService';
import Spinner from '../Spinner';

interface DataStoreQueryModalProps {
    isOpen: boolean;
    onClose: () => void;
    dataStore: DataStore;
    config: Config;
}

interface SearchResultItem {
    id: string;
    document: Document;
}

interface QueryHistoryEntry {
    query: string;
    results: SearchResultItem[];
    totalSize?: number;
    error?: string;
    timestamp: Date;
    authMode: 'default' | 'wif';
}

type CodeLanguage = 'python' | 'curl' | 'nodejs' | 'rest';
type AuthMode = 'default' | 'wif';

const TOKEN_TYPE_OPTIONS = [
    { value: 'urn:ietf:params:oauth:token-type:jwt', label: 'JWT (OIDC)' },
    { value: 'urn:ietf:params:oauth:token-type:id_token', label: 'ID Token' },
    { value: 'urn:ietf:params:oauth:token-type:saml2', label: 'SAML 2.0' },
    { value: 'urn:ietf:params:oauth:token-type:access_token', label: 'Access Token' },
];

const CodeBlock: React.FC<{ content: string; language?: string }> = ({ content, language }) => {
    const [copyText, setCopyText] = useState('Copy');

    const handleCopy = () => {
        navigator.clipboard.writeText(content).then(() => {
            setCopyText('Copied!');
            setTimeout(() => setCopyText('Copy'), 2000);
        });
    };

    return (
        <div className="bg-gray-950 rounded-lg overflow-hidden relative group border border-gray-700">
            <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900 border-b border-gray-700">
                {language && <span className="text-xs text-gray-500 font-mono">{language}</span>}
                <button
                    onClick={handleCopy}
                    className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs font-semibold rounded hover:bg-gray-600 hover:text-white transition-colors ml-auto"
                >
                    {copyText}
                </button>
            </div>
            <pre className="p-4 text-xs text-gray-300 whitespace-pre-wrap overflow-x-auto max-h-[50vh]">
                <code>{content}</code>
            </pre>
        </div>
    );
};

const DataStoreQueryModal: React.FC<DataStoreQueryModalProps> = ({ isOpen, onClose, dataStore, config }) => {
    const [query, setQuery] = useState('');
    const [pageSize, setPageSize] = useState(10);
    const [isSearching, setIsSearching] = useState(false);
    const [history, setHistory] = useState<QueryHistoryEntry[]>([]);
    const [expandedResult, setExpandedResult] = useState<string | null>(null);
    const [showCodePanel, setShowCodePanel] = useState(false);
    const [codeLanguage, setCodeLanguage] = useState<CodeLanguage>('python');
    const resultsEndRef = useRef<HTMLDivElement>(null);

    // Auth mode state
    const [authMode, setAuthMode] = useState<AuthMode>('default');
    const [showWifConfig, setShowWifConfig] = useState(false);
    const [wifPoolId, setWifPoolId] = useState('');
    const [wifProviderId, setWifProviderId] = useState('');
    const [isExchangingToken, setIsExchangingToken] = useState(false);
    const [wifAccessToken, setWifAccessToken] = useState<string | null>(null);
    const [wifTokenError, setWifTokenError] = useState<string | null>(null);
    const [availablePools, setAvailablePools] = useState<any[]>([]);
    const [availableProviders, setAvailableProviders] = useState<any[]>([]);
    const [isLoadingPools, setIsLoadingPools] = useState(false);
    const [isLoadingProviders, setIsLoadingProviders] = useState(false);

    // IdP sign-in state
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [wifSubjectToken, setWifSubjectToken] = useState('');
    const [wifSubjectTokenType, setWifSubjectTokenType] = useState('urn:ietf:params:oauth:token-type:id_token');
    const [wifSignedInEmail, setWifSignedInEmail] = useState<string | null>(null);
    const [wifProviderDisplayName, setWifProviderDisplayName] = useState<string | null>(null);
    const [showManualToken, setShowManualToken] = useState(false);

    const dataStoreId = dataStore.name.split('/').pop() || '';
    const projectId = config.projectId;
    const location = config.appLocation || 'global';

    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setHistory([]);
            setExpandedResult(null);
            setWifAccessToken(null);
            setWifTokenError(null);
            setWifSignedInEmail(null);
            setWifSubjectToken('');
            setWifProviderDisplayName(null);
        }
    }, [isOpen]);

    useEffect(() => {
        resultsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [history]);

    // Reset WIF token when config changes
    useEffect(() => {
        setWifAccessToken(null);
        setWifTokenError(null);
        setWifSignedInEmail(null);
        setWifSubjectToken('');
        setWifProviderDisplayName(null);
    }, [wifPoolId, wifProviderId]);

    useEffect(() => {
        const discoverPool = async () => {
            if (authMode === 'wif' && showWifConfig && projectId && location) {
                try {
                    const acl = await api.getAclConfig({ projectId, appLocation: location } as any);
                    const poolName = acl.idpConfig?.externalIdpConfig?.workforcePoolName;
                    if (poolName) {
                        const poolId = poolName.split('/').pop();
                        if (poolId && !wifPoolId) {
                            setWifPoolId(poolId);
                        }
                    }
                } catch (e) {
                    console.error("Failed to fetch aclConfig for pool discovery", e);
                }
            }
        };
        discoverPool();
    }, [authMode, showWifConfig, projectId, location]);

    useEffect(() => {
        const fetchPools = async () => {
            if (authMode === 'wif' && showWifConfig && projectId) {
                setIsLoadingPools(true);
                try {
                    const pools = await api.listWorkloadIdentityPools(projectId);
                    setAvailablePools(pools);
                } catch (e) {
                    console.error("Failed to fetch workforce pools", e);
                } finally {
                    setIsLoadingPools(false);
                }
            }
        };
        fetchPools();
    }, [authMode, showWifConfig, projectId]);

    useEffect(() => {
        const fetchProviders = async () => {
            if (authMode === 'wif' && wifPoolId && projectId) {
                setIsLoadingProviders(true);
                try {
                    const providerData = await api.listWorkloadIdentityProviders(`locations/global/workforcePools/${wifPoolId}`, projectId);
                    setAvailableProviders(providerData);
                } catch (e) {
                    console.error("Failed to fetch workforce pool providers", e);
                } finally {
                    setIsLoadingProviders(false);
                }
            } else {
                setAvailableProviders([]);
            }
        };
        fetchProviders();
    }, [authMode, wifPoolId, projectId]);

    const codeQuery = query.trim() || (history.length > 0 ? history[history.length - 1].query : 'your search query');

    const isWifSignedIn = authMode === 'wif' && !!wifSubjectToken;
    const isWifConfigValid = authMode === 'wif' && wifPoolId.trim() && wifProviderId.trim() && wifSubjectToken;

    /**
     * Full sign-in flow:
     * 1. Fetch workforce pool provider config from GCP IAM
     * 2. Discover OIDC authorization endpoint
     * 3. Open sign-in popup to IdP (e.g. Microsoft Entra)
     * 4. Capture ID token from redirect
     */
    const handleSignIn = async () => {
        if (!wifPoolId.trim() || !wifProviderId.trim()) return;

        setIsSigningIn(true);
        setWifTokenError(null);
        setWifSubjectToken('');
        setWifSignedInEmail(null);
        setWifAccessToken(null);

        try {
            // Step 1: Fetch the provider config from GCP IAM
            const providerConfig = await api.fetchWorkforceProviderConfig(
                wifPoolId.trim(),
                wifProviderId.trim(),
            );

            if (!providerConfig.oidc) {
                throw new Error('This provider is not configured for OIDC. Only OIDC providers support automatic sign-in.');
            }

            setWifProviderDisplayName(providerConfig.displayName || null);
            const { issuerUri, clientId } = providerConfig.oidc;

            // Step 2: Discover the OIDC endpoints
            const discovery = await api.fetchOidcDiscovery(issuerUri);

            // Step 3: Open popup for user sign-in
            const redirectUri = window.location.origin + window.location.pathname;
            const result = await api.signInWithOidcPopup(
                discovery.authorization_endpoint,
                clientId,
                redirectUri,
            );

            // Step 4: Store the ID token
            setWifSubjectToken(result.idToken);
            setWifSubjectTokenType('urn:ietf:params:oauth:token-type:id_token');
            setWifSignedInEmail(result.email || null);
        } catch (err: any) {
            setWifTokenError(err.message || 'Sign-in failed.');
        } finally {
            setIsSigningIn(false);
        }
    };

    const generatedCode = useMemo(() => {
        const servingConfig = `projects/${projectId}/locations/${location}/collections/default_collection/dataStores/${dataStoreId}/servingConfigs/default_serving_config`;
        const baseUrl = location === 'global'
            ? 'https://discoveryengine.googleapis.com'
            : `https://${location}-discoveryengine.googleapis.com`;
        const apiUrl = `${baseUrl}/v1beta/${dataStore.name}/servingConfigs/default_serving_config:search`;

        // --- Default Auth Code ---
        const pythonDefault = `from google.cloud import discoveryengine_v1beta

# Initialize the Search Service client
client = discoveryengine_v1beta.SearchServiceClient()

# Configuration
project = "${projectId}"
location = "${location}"
data_store = "${dataStoreId}"

serving_config = (
    f"projects/{project}/locations/{location}/collections/default_collection"
    f"/dataStores/{data_store}/servingConfigs/default_serving_config"
)

# Build the search request
search_request = discoveryengine_v1beta.SearchRequest(
    serving_config=serving_config,
    query="${codeQuery.replace(/"/g, '\\"')}",
    page_size=${pageSize},
)

# Perform the query
response = client.search(request=search_request)

# Process results
for page in response.pages:
    for result in page.results:
        print(f"Document ID: {result.document.id}")
        print(f"  Name: {result.document.name}")
        if result.document.derived_struct_data:
            print(f"  Data: {dict(result.document.derived_struct_data)}")
        print()`;

        // --- WIF Auth Code (Workforce) ---
        const pythonWif = `import json
import requests
from google.cloud import discoveryengine_v1beta
from google.auth import credentials as ga_credentials

# ============================================
# Step 1: Exchange external IdP token via STS
# (Workforce Identity Federation)
# ============================================
USER_PROJECT = "${projectId}"
POOL_ID = "${wifPoolId || '<your-workforce-pool-id>'}"
PROVIDER_ID = "${wifProviderId || '<your-provider-id>'}"
SUBJECT_TOKEN = "<your-external-idp-token>"
SUBJECT_TOKEN_TYPE = "${wifSubjectTokenType}"

audience = (
    f"//iam.googleapis.com/locations/global"
    f"/workforcePools/{POOL_ID}/providers/{PROVIDER_ID}"
)

sts_response = requests.post(
    "https://sts.googleapis.com/v1/token",
    data={
        "grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
        "audience": audience,
        "scope": "https://www.googleapis.com/auth/cloud-platform",
        "requested_token_type": "urn:ietf:params:oauth:token-type:access_token",
        "subject_token_type": SUBJECT_TOKEN_TYPE,
        "subject_token": SUBJECT_TOKEN,
        "options": json.dumps({"userProject": USER_PROJECT}),
    },
    headers={"Content-Type": "application/x-www-form-urlencoded"},
)
sts_response.raise_for_status()
access_token = sts_response.json()["access_token"]
print(f"STS token exchange successful.")

# ============================================
# Step 2: Query the Data Store using the WIF token
# ============================================

class WifCredentials(ga_credentials.Credentials):
    """Custom credentials class that uses our Workforce Identity Federation token."""
    def __init__(self, token):
        super().__init__()
        self.token = token
    
    def refresh(self, request):
        pass  # Token is already exchanged

    @property
    def valid(self):
        return True

creds = WifCredentials(access_token)
client = discoveryengine_v1beta.SearchServiceClient(credentials=creds)

project = "${projectId}"
location = "${location}"
data_store = "${dataStoreId}"

serving_config = (
    f"projects/{project}/locations/{location}/collections/default_collection"
    f"/dataStores/{data_store}/servingConfigs/default_serving_config"
)

search_request = discoveryengine_v1beta.SearchRequest(
    serving_config=serving_config,
    query="${codeQuery.replace(/"/g, '\\"')}",
    page_size=${pageSize},
)

response = client.search(request=search_request)

for page in response.pages:
    for result in page.results:
        print(f"Document ID: {result.document.id}")
        print(f"  Name: {result.document.name}")
        if result.document.derived_struct_data:
            print(f"  Data: {dict(result.document.derived_struct_data)}")
        print()`;

        const curlDefault = `curl -X POST \\
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: ${projectId}" \\
  -d '{
    "query": "${codeQuery.replace(/'/g, "\\'")}",
    "pageSize": ${pageSize}
  }' \\
  "${apiUrl}"`;

        const curlWif = `# Step 1: Exchange external IdP token via STS (Workforce Identity Federation)
STS_RESPONSE=$(curl -s -X POST \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \\
  -d "audience=//iam.googleapis.com/locations/global/workforcePools/${wifPoolId || '<pool-id>'}/providers/${wifProviderId || '<provider-id>'}" \\
  -d "scope=https://www.googleapis.com/auth/cloud-platform" \\
  -d "requested_token_type=urn:ietf:params:oauth:token-type:access_token" \\
  -d "subject_token_type=${wifSubjectTokenType}" \\
  -d "subject_token=<YOUR_EXTERNAL_IDP_TOKEN>" \\
  --data-urlencode "options={"userProject":"${projectId}"}" \\
  "https://sts.googleapis.com/v1/token")

ACCESS_TOKEN=$(echo "$STS_RESPONSE" | jq -r '.access_token')
echo "STS exchange successful."

# Step 2: Query the Data Store
curl -X POST \\
  -H "Authorization: Bearer $ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: ${projectId}" \\
  -d '{
    "query": "${codeQuery.replace(/'/g, "\\'")}",
    "pageSize": ${pageSize}
  }' \\
  "${apiUrl}"`;

        const nodejsDefault = `const { SearchServiceClient } = require("@google-cloud/discoveryengine").v1beta;

// Initialize the client
const client = new SearchServiceClient();

async function searchDataStore() {
  const project = "${projectId}";
  const location = "${location}";
  const dataStore = "${dataStoreId}";

  const servingConfig = \`projects/\${project}/locations/\${location}/collections/default_collection/dataStores/\${dataStore}/servingConfigs/default_serving_config\`;

  const request = {
    servingConfig,
    query: "${codeQuery.replace(/"/g, '\\"')}",
    pageSize: ${pageSize},
  };

  // Perform the search
  const [response] = await client.search(request);

  for (const result of response) {
    console.log("Document ID:", result.document.id);
    console.log("  Name:", result.document.name);
    if (result.document.structData) {
      console.log("  Data:", JSON.stringify(result.document.structData, null, 2));
    }
    console.log();
  }
}

searchDataStore().catch(console.error);`;

        const nodejsWif = `const { SearchServiceClient } = require("@google-cloud/discoveryengine").v1beta;

// ============================================
// Step 1: Exchange external IdP token via STS
// (Workforce Identity Federation)
// ============================================
async function searchWithWif() {
  const USER_PROJECT = "${projectId}";
  const POOL_ID = "${wifPoolId || '<your-workforce-pool-id>'}";
  const PROVIDER_ID = "${wifProviderId || '<your-provider-id>'}";
  const SUBJECT_TOKEN = "<your-external-idp-token>";
  const SUBJECT_TOKEN_TYPE = "${wifSubjectTokenType}";

  const audience = \`//iam.googleapis.com/locations/global/workforcePools/\${POOL_ID}/providers/\${PROVIDER_ID}\`;

  const stsResponse = await fetch("https://sts.googleapis.com/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      audience,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
      subject_token_type: SUBJECT_TOKEN_TYPE,
      subject_token: SUBJECT_TOKEN,
      options: JSON.stringify({ userProject: USER_PROJECT }),
    }).toString(),
  });

  if (!stsResponse.ok) throw new Error(\`STS failed: \${await stsResponse.text()}\`);
  let { access_token } = await stsResponse.json();
  console.log("STS token exchange successful.");

  // Step 2: Query the Data Store
  const project = "${projectId}";
  const location = "${location}";
  const dataStore = "${dataStoreId}";
  const baseUrl = location === "global"
    ? "https://discoveryengine.googleapis.com"
    : \`https://\${location}-discoveryengine.googleapis.com\`;

  const searchUrl = \`\${baseUrl}/v1beta/projects/\${project}/locations/\${location}/collections/default_collection/dataStores/\${dataStore}/servingConfigs/default_serving_config:search\`;

  const searchResponse = await fetch(searchUrl, {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${access_token}\`,
      "Content-Type": "application/json",
      "X-Goog-User-Project": project,
    },
    body: JSON.stringify({
      query: "${codeQuery.replace(/"/g, '\\"')}",
      pageSize: ${pageSize},
    }),
  });

  if (!searchResponse.ok) throw new Error(\`Search failed: \${await searchResponse.text()}\`);
  const data = await searchResponse.json();

  for (const result of data.results || []) {
    console.log("Document ID:", result.document?.id);
    console.log("  Name:", result.document?.name);
    if (result.document?.structData) {
      console.log("  Data:", JSON.stringify(result.document.structData, null, 2));
    }
    console.log();
  }
}

searchWithWif().catch(console.error);`;

        const restDefault = `# REST API Details
# -----------------

# Endpoint (POST):
${apiUrl}

# Headers:
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json
X-Goog-User-Project: ${projectId}

# Request Body:
${JSON.stringify({ query: codeQuery, pageSize }, null, 2)}

# Serving Config Resource Name:
${servingConfig}

# Data Store Resource Name:
${dataStore.name}`;

        const restWif = `# Workforce Identity Federation (WIF) Authentication Flow
# ======================================================

# Step 1: Exchange external IdP token via Google STS
# --------------------------------------------------
# POST https://sts.googleapis.com/v1/token
# Content-Type: application/x-www-form-urlencoded
#
# grant_type=urn:ietf:params:oauth:grant-type:token-exchange
# audience=//iam.googleapis.com/locations/global/workforcePools/${wifPoolId || '<pool-id>'}/providers/${wifProviderId || '<provider-id>'}
# scope=https://www.googleapis.com/auth/cloud-platform
# requested_token_type=urn:ietf:params:oauth:token-type:access_token
# subject_token_type=${wifSubjectTokenType}
# subject_token=<YOUR_EXTERNAL_IDP_TOKEN>
# options={"userProject":"${projectId}"}
#
# Response: { "access_token": "ya29...", "token_type": "Bearer", "expires_in": 3600 }

# Step 2: Query the Data Store
# --------------------------------------------------
# Endpoint (POST):
${apiUrl}

# Headers:
Authorization: Bearer <WIF_ACCESS_TOKEN>
Content-Type: application/json
X-Goog-User-Project: ${projectId}

# Request Body:
${JSON.stringify({ query: codeQuery, pageSize }, null, 2)}

# Serving Config Resource Name:
${servingConfig}

# Data Store Resource Name:
${dataStore.name}`;

        if (authMode === 'wif') {
            return { python: pythonWif, curl: curlWif, nodejs: nodejsWif, rest: restWif };
        }
        return { python: pythonDefault, curl: curlDefault, nodejs: nodejsDefault, rest: restDefault };
    }, [projectId, location, dataStoreId, dataStore.name, codeQuery, pageSize, authMode, wifPoolId, wifProviderId, wifSubjectTokenType]);

    if (!isOpen) return null;

    const handleSearch = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!query.trim()) return;

        const currentQuery = query;
        setIsSearching(true);

        try {
            let response: any;

            if (authMode === 'wif') {
                // WIF auth flow: exchange token via STS, then query with that token
                setIsExchangingToken(true);
                setWifTokenError(null);

                let accessToken: string;
                try {
                    const stsResult = await api.exchangeStsToken({
                        userProject: projectId,
                        poolId: wifPoolId.trim(),
                        providerId: wifProviderId.trim(),
                        subjectToken: wifSubjectToken.trim(),
                        subjectTokenType: wifSubjectTokenType,
                    });
                    accessToken = stsResult.access_token;
                    setWifAccessToken(accessToken);
                } catch (stsErr: any) {
                    setWifTokenError(stsErr.message || 'Token exchange failed.');
                    throw stsErr;
                } finally {
                    setIsExchangingToken(false);
                }

                response = await api.queryDataStoreWithToken(
                    dataStore.name,
                    location,
                    projectId,
                    accessToken!,
                    currentQuery,
                    pageSize,
                );
            } else {
                // Default auth: use gapiRequest
                response = await api.queryDataStore(
                    dataStore.name,
                    config,
                    currentQuery,
                    pageSize,
                );
            }

            setHistory(prev => [...prev, {
                query: currentQuery,
                results: response.results || [],
                totalSize: response.totalSize,
                timestamp: new Date(),
                authMode,
            }]);
        } catch (err: any) {
            setHistory(prev => [...prev, {
                query: currentQuery,
                results: [],
                error: err.message || 'Search failed.',
                timestamp: new Date(),
                authMode,
            }]);
        } finally {
            setIsSearching(false);
            setQuery('');
        }
    };

    const toggleExpandResult = (resultId: string) => {
        setExpandedResult(prev => prev === resultId ? null : resultId);
    };

    const getDocumentPreview = (doc: Document): string => {
        if (doc.structData) {
            return JSON.stringify(doc.structData, null, 2);
        }
        if (doc.jsonData) {
            try {
                return JSON.stringify(JSON.parse(doc.jsonData), null, 2);
            } catch {
                return doc.jsonData;
            }
        }
        if (doc.content?.uri) {
            return `Source: ${doc.content.uri}`;
        }
        return 'No preview available.';
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl h-[85vh] flex flex-col">
                {/* Header */}
                <header className="p-4 border-b border-gray-700 flex justify-between items-center shrink-0">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            Query Data Store
                        </h2>
                        <p className="text-sm text-gray-400 mt-1 font-mono">{dataStoreId}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setShowCodePanel(prev => !prev)}
                            className={`px-3 py-1.5 text-sm font-semibold rounded-md flex items-center gap-1.5 transition-colors ${showCodePanel ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'}`}
                            title="View exportable code snippets"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                            </svg>
                            {showCodePanel ? 'Hide Code' : 'View Code'}
                        </button>
                        <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                    </div>
                </header>

                {/* Settings Bar */}
                <div className="px-4 py-2 border-b border-gray-700 bg-gray-900/50 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <label htmlFor="pageSize" className="text-sm text-gray-400">Results per query:</label>
                            <select
                                id="pageSize"
                                value={pageSize}
                                onChange={(e) => setPageSize(Number(e.target.value))}
                                className="bg-gray-700 border-gray-600 rounded-md text-sm text-gray-200 h-8 px-2"
                            >
                                <option value={5}>5</option>
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                                <option value={50}>50</option>
                            </select>
                        </div>

                        {/* Auth Mode Toggle */}
                        <div className="flex items-center gap-2 ml-4">
                            <label className="text-sm text-gray-400">Auth:</label>
                            <div className="flex rounded-md overflow-hidden border border-gray-600">
                                <button
                                    onClick={() => { setAuthMode('default'); setShowWifConfig(false); }}
                                    className={`px-3 py-1 text-xs font-medium transition-colors ${authMode === 'default' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                                >
                                    Default
                                </button>
                                <button
                                    onClick={() => { setAuthMode('wif'); setShowWifConfig(true); }}
                                    className={`px-3 py-1 text-xs font-medium transition-colors ${authMode === 'wif' ? 'bg-amber-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                                >
                                    WIF
                                </button>
                            </div>
                        </div>

                        <div className="text-xs text-gray-500 ml-auto">
                            Serving Config: <span className="font-mono text-gray-400">default_serving_config</span>
                        </div>
                    </div>

                    {/* WIF Configuration Panel */}
                    {showWifConfig && authMode === 'wif' && (
                        <div className="mt-3 p-3 bg-gray-800 border border-amber-700/50 rounded-lg space-y-3">
                            <div className="flex items-center justify-between">
                                <h4 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                    </svg>
                                    Workforce Identity Federation
                                </h4>
                                <button
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

                            {/* Manual token fallback — collapsible */}
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
                    )}

                    {/* Collapsed WIF bar */}
                    {authMode === 'wif' && !showWifConfig && (
                        <button
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
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
                    )}
                </div>

                {/* Main Content Area — splits between results and code panel */}
                <div className={`flex-1 overflow-hidden flex ${showCodePanel ? 'divide-x divide-gray-700' : ''}`}>
                    {/* Results Area */}
                    <main className={`overflow-y-auto p-4 space-y-6 ${showCodePanel ? 'w-1/2' : 'w-full'}`}>
                    {history.length === 0 && !isSearching && (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-3">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <p className="text-lg">Enter a query to search this data store</p>
                            <p className="text-sm">Results from the Discovery Engine Search API will appear here.</p>
                        </div>
                    )}

                    {history.map((entry, historyIdx) => (
                        <div key={historyIdx} className="space-y-3">
                            {/* User Query Bubble */}
                            <div className="flex justify-end">
                                <div className="bg-blue-600 text-white px-4 py-2 rounded-lg max-w-lg">
                                    <p className="text-sm whitespace-pre-wrap">{entry.query}</p>
                                    <div className="flex items-center gap-2 mt-1 justify-end">
                                        {entry.authMode === 'wif' && (
                                            <span className="text-[10px] bg-amber-700 text-amber-100 px-1.5 py-0.5 rounded font-medium">WIF</span>
                                        )}
                                        <p className="text-xs text-blue-200">{entry.timestamp.toLocaleTimeString()}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Results */}
                            <div className="flex justify-start">
                                <div className="bg-gray-700 rounded-lg max-w-3xl w-full">
                                    {entry.error ? (
                                        <div className="p-4 text-red-400 text-sm">
                                            <p className="font-semibold">Search Error</p>
                                            <p className="mt-1">{entry.error}</p>
                                        </div>
                                    ) : entry.results.length === 0 ? (
                                        <div className="p-4 text-gray-400 text-sm text-center">
                                            No results found for this query.
                                        </div>
                                    ) : (
                                        <div>
                                            <div className="px-4 py-2 border-b border-gray-600 flex justify-between items-center">
                                                <span className="text-sm text-gray-300 font-semibold">
                                                    {entry.results.length} result{entry.results.length !== 1 ? 's' : ''}
                                                    {entry.totalSize != null ? ` (of ${entry.totalSize} total)` : ''}
                                                </span>
                                            </div>
                                            <div className="divide-y divide-gray-600">
                                                {entry.results.map((result, resultIdx) => {
                                                    const docId = result.document?.id || result.id || `${historyIdx}-${resultIdx}`;
                                                    const uniqueKey = `${historyIdx}-${docId}`;
                                                    const isExpanded = expandedResult === uniqueKey;

                                                    return (
                                                        <div key={uniqueKey} className="px-4 py-3">
                                                            <button
                                                                onClick={() => toggleExpandResult(uniqueKey)}
                                                                className="w-full text-left flex items-start justify-between gap-2 group"
                                                            >
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-xs bg-gray-600 text-gray-300 px-1.5 py-0.5 rounded font-mono shrink-0">
                                                                            #{resultIdx + 1}
                                                                        </span>
                                                                        <p className="text-sm text-white font-medium truncate">
                                                                            {result.document?.displayName || result.document?.id || docId}
                                                                        </p>
                                                                    </div>
                                                                    {result.document?.content?.uri && (
                                                                        <p className="text-xs text-gray-400 mt-1 truncate font-mono">
                                                                            {result.document.content.uri}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                                <svg
                                                                    xmlns="http://www.w3.org/2000/svg"
                                                                    className={`h-5 w-5 text-gray-400 group-hover:text-white transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                                                                    viewBox="0 0 20 20"
                                                                    fill="currentColor"
                                                                >
                                                                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                                                </svg>
                                                            </button>

                                                            {isExpanded && (
                                                                <div className="mt-3 bg-gray-800 rounded-md p-3 border border-gray-600">
                                                                    <div className="space-y-2">
                                                                        <div>
                                                                            <span className="text-xs font-medium text-gray-400">Document Name:</span>
                                                                            <p className="text-xs text-gray-300 font-mono break-all">{result.document?.name || 'N/A'}</p>
                                                                        </div>
                                                                        <div>
                                                                            <span className="text-xs font-medium text-gray-400">Content:</span>
                                                                            <pre className="text-xs text-gray-300 mt-1 bg-gray-900 p-2 rounded overflow-auto max-h-60 whitespace-pre-wrap">
                                                                                {getDocumentPreview(result.document)}
                                                                            </pre>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}

                    {isSearching && (
                        <div className="flex justify-start">
                            <div className="bg-gray-700 rounded-lg px-6 py-4">
                                <div className="flex items-center space-x-3">
                                    <Spinner />
                                    <span className="text-sm text-gray-300">Searching...</span>
                                </div>
                            </div>
                        </div>
                    )}

                    <div ref={resultsEndRef} />
                </main>

                    {/* Code Panel */}
                    {showCodePanel && (
                        <div className="w-1/2 overflow-y-auto p-4 bg-gray-900/30">
                            <div className="space-y-4">
                                <div>
                                    <h3 className="text-lg font-semibold text-white mb-1">Export Code</h3>
                                    <p className="text-xs text-gray-400">
                                        Copy these code snippets to query this data store from your own application.
                                        The code updates live as you change the query and settings.
                                    </p>
                                    {authMode === 'wif' && (
                                        <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                            </svg>
                                            Showing Workforce Identity Federation flow (STS token exchange)
                                        </p>
                                    )}
                                </div>

                                {/* Language Tabs */}
                                <div className="flex border-b border-gray-600">
                                    {([
                                        { key: 'python' as CodeLanguage, label: 'Python' },
                                        { key: 'curl' as CodeLanguage, label: 'cURL' },
                                        { key: 'nodejs' as CodeLanguage, label: 'Node.js' },
                                        { key: 'rest' as CodeLanguage, label: 'REST' },
                                    ]).map(tab => (
                                        <button
                                            key={tab.key}
                                            onClick={() => setCodeLanguage(tab.key)}
                                            className={`px-4 py-2 text-sm font-medium transition-colors ${codeLanguage === tab.key
                                                ? 'border-b-2 border-blue-500 text-white'
                                                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
                                            }`}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Setup Instructions */}
                                {codeLanguage === 'python' && (
                                    <div className="bg-gray-800 border border-gray-700 rounded-md p-3 space-y-1">
                                        <p className="text-xs font-semibold text-gray-300">Prerequisites:</p>
                                        <CodeBlock 
                                            content={authMode === 'wif'
                                                ? "pip install google-cloud-discoveryengine requests"
                                                : "pip install google-cloud-discoveryengine"
                                            }
                                            language="bash" 
                                        />
                                        <p className="text-xs text-gray-400 mt-2">
                                            {authMode === 'wif'
                                                ? <>Uses STS token exchange (Workforce Identity Federation) to authenticate with an external IdP token. Replace the subject token with your IdP&apos;s JWT/OIDC/SAML token.</>
                                                : <>Ensure you&apos;re authenticated via <span className="font-mono text-gray-300">gcloud auth application-default login</span> or 
                                                have <span className="font-mono text-gray-300">GOOGLE_APPLICATION_CREDENTIALS</span> set.</>
                                            }
                                        </p>
                                    </div>
                                )}
                                {codeLanguage === 'nodejs' && (
                                    <div className="bg-gray-800 border border-gray-700 rounded-md p-3 space-y-1">
                                        <p className="text-xs font-semibold text-gray-300">Prerequisites:</p>
                                        <CodeBlock 
                                            content="npm install @google-cloud/discoveryengine" 
                                            language="bash" 
                                        />
                                        {authMode === 'wif' && (
                                            <p className="text-xs text-gray-400 mt-2">
                                                Uses direct <span className="font-mono text-gray-300">fetch()</span> calls for STS token exchange and search API. No additional auth libraries needed.
                                            </p>
                                        )}
                                    </div>
                                )}
                                {codeLanguage === 'curl' && (
                                    <div className="bg-gray-800 border border-gray-700 rounded-md p-3">
                                        <p className="text-xs text-gray-400">
                                            {authMode === 'wif'
                                                ? <>Requires <span className="font-mono text-gray-300">curl</span> and <span className="font-mono text-gray-300">jq</span>. Replace the subject token with your external IdP token.</>
                                                : <>Requires <span className="font-mono text-gray-300">gcloud</span> CLI installed and authenticated.</>
                                            }
                                        </p>
                                    </div>
                                )}

                                {/* The Code */}
                                <CodeBlock
                                    content={generatedCode[codeLanguage]}
                                    language={
                                        codeLanguage === 'python' ? 'python'
                                        : codeLanguage === 'curl' ? 'bash'
                                        : codeLanguage === 'nodejs' ? 'javascript'
                                        : 'text'
                                    }
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Input */}
                <footer className="p-4 border-t border-gray-700 shrink-0">
                    <form onSubmit={handleSearch} className="flex items-center gap-2">
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={authMode === 'wif' ? (isWifSignedIn ? 'Enter query (authenticated via WIF)...' : 'Sign in above first, then enter your query...') : 'Enter your search query...'}
                            className="flex-1 bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:ring-blue-500 focus:border-blue-500"
                            disabled={isSearching}
                            autoFocus
                        />
                        <button
                            type="submit"
                            disabled={isSearching || !query.trim() || (authMode === 'wif' && !isWifConfigValid)}
                            className={`px-5 py-2 font-semibold rounded-md flex items-center gap-2 disabled:bg-gray-600 disabled:cursor-not-allowed ${
                                authMode === 'wif'
                                    ? 'bg-amber-600 text-white hover:bg-amber-700'
                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                            }`}
                            title={authMode === 'wif' && !isWifConfigValid ? 'Sign in with your identity provider first' : undefined}
                        >
                            {isExchangingToken ? (
                                <>
                                    <Spinner />
                                    Exchanging Token...
                                </>
                            ) : (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                    {authMode === 'wif' ? 'Search (WIF)' : 'Search'}
                                </>
                            )}
                        </button>
                    </form>
                    {authMode === 'wif' && !isWifSignedIn && (
                        <p className="text-xs text-amber-400 mt-1.5 ml-1">
                            Enter your Pool ID and Provider ID above, then click &quot;Sign In with Identity Provider&quot; to authenticate.
                        </p>
                    )}
                </footer>
            </div>
        </div>
    );
};

export default DataStoreQueryModal;
