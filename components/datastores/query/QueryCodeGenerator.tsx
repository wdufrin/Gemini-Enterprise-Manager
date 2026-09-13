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

export type CodeLanguage = 'python' | 'curl' | 'nodejs' | 'rest';

export const CodeBlock: React.FC<{ content: string; language?: string }> = ({ content, language }) => {
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
          type="button"
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

export interface GenerateCodeSnippetsArgs {
  projectId: string;
  location: string;
  dataStoreId: string;
  dataStoreName: string;
  codeQuery: string;
  pageSize: number;
  authMode: 'default' | 'wif';
  wifPoolId: string;
  wifProviderId: string;
  wifSubjectTokenType: string;
}

export function generateCodeSnippets({
  projectId,
  location,
  dataStoreId,
  dataStoreName,
  codeQuery,
  pageSize,
  authMode,
  wifPoolId,
  wifProviderId,
  wifSubjectTokenType,
}: GenerateCodeSnippetsArgs): Record<CodeLanguage, string> {
  const servingConfig = `projects/${projectId}/locations/${location}/collections/default_collection/dataStores/${dataStoreId}/servingConfigs/default_serving_config`;
  const baseUrl = location === 'global'
    ? 'https://discoveryengine.googleapis.com'
    : `https://${location}-discoveryengine.googleapis.com`;
  const apiUrl = `${baseUrl}/v1beta/${dataStoreName}/servingConfigs/default_serving_config:search`;

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
${dataStoreName}`;

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
${dataStoreName}`;

  if (authMode === 'wif') {
    return { python: pythonWif, curl: curlWif, nodejs: nodejsWif, rest: restWif };
  }
  return { python: pythonDefault, curl: curlDefault, nodejs: nodejsDefault, rest: restDefault };
}

interface QueryCodePanelProps {
  codeLanguage: CodeLanguage;
  setCodeLanguage: (lang: CodeLanguage) => void;
  generatedCode: Record<CodeLanguage, string>;
  authMode: 'default' | 'wif';
}

export const QueryCodePanel: React.FC<QueryCodePanelProps> = ({
  codeLanguage,
  setCodeLanguage,
  generatedCode,
  authMode,
}) => {
  return (
    <aside className="w-1/2 overflow-y-auto p-4 bg-gray-900 flex flex-col space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
          Export Code Snippets
          {authMode === 'wif' && (
            <span className="text-xs bg-amber-900/60 text-amber-300 border border-amber-700/50 px-2 py-0.5 rounded font-mono font-normal">
              WIF
            </span>
          )}
        </h3>
        <div className="flex rounded-md overflow-hidden border border-gray-700">
          {(['python', 'curl', 'nodejs', 'rest'] as CodeLanguage[]).map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => setCodeLanguage(lang)}
              className={`px-2.5 py-1 text-xs font-semibold capitalize transition-colors ${
                codeLanguage === lang
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700'
              }`}
            >
              {lang === 'nodejs' ? 'Node.js' : lang.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-gray-400">
        Ready-to-use code for querying this data store from your external application or scripts.
      </p>
      <div className="flex-1">
        <CodeBlock content={generatedCode[codeLanguage]} language={codeLanguage} />
      </div>
    </aside>
  );
};
