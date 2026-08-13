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
import { Config, AppEngine } from '../../types';

interface DataStorePermissionsScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  engine: AppEngine;
  config: Config;
  connectedConnectors: { id: string; entities: string[] }[];
  connectedLegacyDataStores: string[];
  targetMember?: string;
}

const DataStorePermissionsScriptModal: React.FC<DataStorePermissionsScriptModalProps> = ({
  isOpen,
  onClose,
  engine,
  config,
  connectedConnectors,
  connectedLegacyDataStores,
  targetMember = 'userA@example.com',
}) => {
  const [activeTab, setActiveTab] = useState<'guide' | 'python' | 'curl' | 'gcloud'>('guide');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const projectId = config.projectId;
  const location = config.appLocation || 'global';
  const appId = engine.name.split('/').pop() || 'App1';
  const member = targetMember.includes(':') ? targetMember : `user:${targetMember}`;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // 1. Generate Python Script (mirroring setup_ge_permissions.py)
  const connectorArgs = connectedConnectors
    .map(c => (c.entities.length > 0 ? `${c.id}:${c.entities.join(',')}` : c.id))
    .join(' ');
  const datastoreArgs = connectedLegacyDataStores.join(' ');

  const pythonScript = `#!/usr/bin/env python3
"""
Gemini Enterprise (GE) End-User DataStore/DataConnector Permission Control Setup Script
Automates Step A1 - A4 and Appendix A custom role creation for Gemini Enterprise.
"""

import subprocess
import json
import urllib.request
import urllib.error
import sys

PROJECT_ID = "${projectId}"
LOCATION = "${location}"
APP_ID = "${appId}"
MEMBER = "${member}"
CUSTOM_ROLE_ID = "customRestrictedEndUser"
ROLE_RESOURCE = "roles/discoveryengine.agentspaceUser"

# Connected Resources
CONNECTORS = ${JSON.stringify(connectedConnectors, null, 2)}
DATASTORES = ${JSON.stringify(connectedLegacyDataStores, null, 2)}

def get_access_token():
    res = subprocess.run(["gcloud", "auth", "print-access-token"], capture_output=True, text=True, check=True)
    return res.stdout.strip()

def http_request(method, url, data=None):
    token = get_access_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "X-Goog-User-Project": PROJECT_ID
    }
    body_bytes = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body_bytes, headers=headers, method=method)
    with urllib.request.urlopen(req) as resp:
        res_text = resp.read().decode("utf-8")
        return json.loads(res_text) if res_text else {}

def check_or_create_custom_role():
    print(f"\\n[Appendix A] Checking custom role 'projects/{PROJECT_ID}/roles/{CUSTOM_ROLE_ID}'...")
    check_cmd = ["gcloud", "iam", "roles", "describe", CUSTOM_ROLE_ID, f"--project={PROJECT_ID}", "--format=json"]
    res = subprocess.run(check_cmd, capture_output=True, text=True)
    if res.returncode == 0:
        print(f"[VERIFIED ✓] Custom role '{CUSTOM_ROLE_ID}' already exists.")
        return
    print(f"[ACTION] Creating custom role '{CUSTOM_ROLE_ID}'...")
    create_cmd = [
        "gcloud", "iam", "roles", "create", CUSTOM_ROLE_ID,
        f"--project={PROJECT_ID}",
        "--title=Custom Gemini Enterprise Restricted End User",
        "--description=Base project-level permissions to view Gemini Enterprise config page.",
        "--stage=GA",
        "--permissions=discoveryengine.locations.buildAuthorizationUrl"
    ]
    subprocess.run(create_cmd, check=True)
    print(f"[VERIFIED ✓] Custom role '{CUSTOM_ROLE_ID}' created successfully.")

def grant_project_custom_role(member_str):
    print(f"\\n[Step A1] Granting project custom role to '{member_str}'...")
    full_role = f"projects/{PROJECT_ID}/roles/{CUSTOM_ROLE_ID}"
    get_url = f"https://cloudresourcemanager.googleapis.com/v1/projects/{PROJECT_ID}:getIamPolicy"
    set_url = f"https://cloudresourcemanager.googleapis.com/v1/projects/{PROJECT_ID}:setIamPolicy"
    
    policy = http_request("POST", get_url, data={})
    bindings = policy.get("bindings", [])
    etag = policy.get("etag", "")
    
    target_b = next((b for b in bindings if b.get("role") == full_role), None)
    if target_b:
        if member_str not in target_b.setdefault("members", []):
            target_b["members"].append(member_str)
    else:
        bindings.append({"role": full_role, "members": [member_str]})
        
    http_request("POST", set_url, data={"policy": {"etag": etag, "bindings": bindings}})
    print(f"[VERIFIED ✓] Granted project role '{full_role}' to '{member_str}'.")

def update_iam_policy_rmw(resource_name, base_url, member_str, role=ROLE_RESOURCE):
    print(f"[RMW] Updating policy for {resource_name}...")
    get_url = f"{base_url}:getIamPolicy"
    set_url = f"{base_url}:setIamPolicy"
    
    policy = http_request("GET", get_url)
    etag = policy.get("etag", "")
    bindings = policy.get("bindings", [])
    
    target_b = next((b for b in bindings if b.get("role") == role), None)
    if target_b:
        if member_str in target_b.setdefault("members", []):
            print(f"[SKIP] '{member_str}' already has '{role}' on {resource_name}.")
            return
        target_b["members"].append(member_str)
    else:
        bindings.append({"role": role, "members": [member_str]})
        
    http_request("POST", set_url, data={"policy": {"etag": etag, "bindings": bindings}})
    print(f"[VERIFIED ✓] Granted '{role}' on {resource_name}.")

def main():
    print(f"=== Gemini Enterprise Datastore-Level Access Control Setup ===")
    print(f"Project: {PROJECT_ID} | Location: {LOCATION} | App: {APP_ID}")
    print(f"Target Member: {MEMBER}\\n")
    
    # Appendix A: Custom Role
    check_or_create_custom_role()
    
    # Step A1: Project-level binding
    grant_project_custom_role(MEMBER)
    
    # Step A2: App (Engine) binding
    app_url = f"https://discoveryengine.googleapis.com/v1/projects/{PROJECT_ID}/locations/{LOCATION}/collections/default_collection/engines/{APP_ID}"
    update_iam_policy_rmw(f"App Engine '{APP_ID}'", app_url, MEMBER)
    
    # Step A3: DataConnectors & Entities
    for conn in CONNECTORS:
        conn_id = conn["id"]
        conn_url = f"https://discoveryengine.googleapis.com/v1alpha/projects/{PROJECT_ID}/locations/{LOCATION}/collections/{conn_id}"
        update_iam_policy_rmw(f"DataConnector Collection '{conn_id}'", conn_url, MEMBER)
        
        for entity_id in conn.get("entities", []):
            ent_url = f"https://discoveryengine.googleapis.com/v1alpha/projects/{PROJECT_ID}/locations/{LOCATION}/collections/default_collection/dataStores/{entity_id}"
            update_iam_policy_rmw(f"Connector Entity '{entity_id}'", ent_url, MEMBER)
            
    # Step A4: Legacy DataStores
    for ds_id in DATASTORES:
        ds_url = f"https://discoveryengine.googleapis.com/v1alpha/projects/{PROJECT_ID}/locations/{LOCATION}/collections/default_collection/dataStores/{ds_id}"
        update_iam_policy_rmw(f"Legacy DataStore '{ds_id}'", ds_url, MEMBER)
        
    print(f"\\n[COMPLETE] Successfully configured all datastore ACLs for '{MEMBER}'!")

if __name__ == "__main__":
    main()
`;

  // 2. Generate cURL commands
  const curlAppendixA = `gcloud iam roles create customRestrictedEndUser \\
  --project=${projectId} \\
  --title="Custom Gemini Enterprise Restricted End User" \\
  --description="Base project-level permissions to view Gemini Enterprise config page." \\
  --stage=GA \\
  --permissions=discoveryengine.locations.buildAuthorizationUrl`;

  const curlStepA1 = `gcloud projects add-iam-policy-binding ${projectId} \\
  --member="${member}" \\
  --role="projects/${projectId}/roles/customRestrictedEndUser"`;

  const curlStepA2Get = `curl -X GET \\
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \\
  -H "X-Goog-User-Project: ${projectId}" \\
  "https://discoveryengine.googleapis.com/v1/projects/${projectId}/locations/${location}/collections/default_collection/engines/${appId}:getIamPolicy"`;

  const curlStepA2Set = `curl -X POST \\
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: ${projectId}" \\
  -d '{
    "policy": {
      "etag": "YOUR_ETAG_FROM_GET",
      "bindings": [
        {
          "role": "roles/discoveryengine.agentspaceUser",
          "members": ["${member}"]
        }
      ]
    }
  }' \\
  "https://discoveryengine.googleapis.com/v1/projects/${projectId}/locations/${location}/collections/default_collection/engines/${appId}:setIamPolicy"`;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex justify-center items-center z-50 p-4" aria-modal="true" role="dialog">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col border border-gray-700 animate-fade-in">
        <header className="p-5 border-b border-gray-700 bg-gray-800/90 shrink-0 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span>DataStore ACL Automation Scripts & Commands</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-900/50 text-blue-300 border border-blue-700">
                Beta
              </span>
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              App: <span className="text-white font-mono">{appId}</span> | Project:{' '}
              <span className="text-white font-mono">{projectId}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="border-b border-gray-700 bg-gray-900/60 px-5 flex space-x-6">
          <button
            onClick={() => setActiveTab('guide')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'guide'
                ? 'border-blue-500 text-blue-400 font-semibold'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <span>📘 Step-by-Step Guide</span>
          </button>
          <button
            onClick={() => setActiveTab('python')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'python'
                ? 'border-blue-500 text-blue-400 font-semibold'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            Python Automation Script
          </button>
          <button
            onClick={() => setActiveTab('curl')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'curl'
                ? 'border-blue-500 text-blue-400 font-semibold'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            REST / cURL Steps
          </button>
          <button
            onClick={() => setActiveTab('gcloud')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'gcloud'
                ? 'border-blue-500 text-blue-400 font-semibold'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            CLI Reference
          </button>
        </div>

        <main className="p-6 space-y-6 overflow-y-auto flex-1 min-h-0 bg-gray-900/40">
          {activeTab === 'guide' && (
            <div className="space-y-6 text-sm text-gray-300">
              <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 border border-blue-700/50 rounded-xl p-5 shadow-inner">
                <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                  <span>How Datastore Restriction Works in Gemini Enterprise</span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-900/60 text-purple-300 border border-purple-600">Beta</span>
                </h3>
                <p className="text-xs text-gray-300 leading-relaxed">
                  By default, Gemini Enterprise users require project-level IAM roles which grant access to all datastores. 
                  Datastore-Level Access Control (Beta) replaces this with a <strong>least-privilege 2-tier model</strong>: a minimal project-level authentication role combined with explicit resource-level bindings on only the specific App Engine and DataStores they are allowed to query.
                </p>
              </div>

              {/* Numbered Steps */}
              <div className="space-y-4">
                {/* Step 0 */}
                <div className="bg-gray-800/90 border border-gray-700 rounded-lg p-4">
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">0</span>
                    <h4 className="text-sm font-semibold text-white">Prerequisites: Allowlisting & User Isolation</h4>
                  </div>
                  <ul className="list-disc pl-9 space-y-1.5 text-xs text-gray-300">
                    <li>
                      <strong>Mendel Allowlist</strong>: Your project must be allowlisted under the Mendel feature flag (<code className="text-purple-300">bogao@</code>).
                    </li>
                    <li>
                      <strong>Remove Broad IAM Roles</strong>: Ensure target end users or groups do <em>not</em> possess broad project-wide roles like <code className="text-red-300">roles/viewer</code>, <code className="text-red-300">roles/editor</code>, or <code className="text-red-300">roles/discoveryengine.admin</code>, as project-wide roles bypass datastore restrictions.
                    </li>
                  </ul>
                </div>

                {/* Step 1 */}
                <div className="bg-gray-800/90 border border-gray-700 rounded-lg p-4">
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">1</span>
                    <h4 className="text-sm font-semibold text-white">Create Project Custom Role (<code className="text-blue-300">customRestrictedEndUser</code>)</h4>
                  </div>
                  <p className="text-xs text-gray-300 pl-8 mb-2">
                    Create a custom IAM role at the project level containing only the minimal authentication permission:
                  </p>
                  <div className="pl-8">
                    <div className="p-2.5 bg-gray-950 rounded text-xs font-mono text-green-400 border border-gray-800">
                      Permission: discoveryengine.locations.buildAuthorizationUrl
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1.5">
                      💡 <em>You can create this in 1 click using the "+ Create Custom Role in Project" button at the top of the Connected DataStores tab.</em>
                    </p>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="bg-gray-800/90 border border-gray-700 rounded-lg p-4">
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">2</span>
                    <h4 className="text-sm font-semibold text-white">Grant Custom Role at Project Level (Step A1)</h4>
                  </div>
                  <p className="text-xs text-gray-300 pl-8 mb-2">
                    Bind <code className="text-blue-300">projects/{projectId}/roles/customRestrictedEndUser</code> to the target user or group (<code className="text-yellow-300">user:alice@example.com</code> or <code className="text-yellow-300">group:finance-team@example.com</code>).
                  </p>
                  <div className="pl-8 text-xs text-gray-400">
                    This allows the user to open the Gemini Enterprise web application interface without seeing any underlying data.
                  </div>
                </div>

                {/* Step 3 */}
                <div className="bg-gray-800/90 border border-gray-700 rounded-lg p-4">
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">3</span>
                    <h4 className="text-sm font-semibold text-white">Grant App Engine Access (Step A2)</h4>
                  </div>
                  <p className="text-xs text-gray-300 pl-8 mb-2">
                    Grant <code className="text-blue-300">roles/discoveryengine.agentspaceUser</code> on the specific App Engine (<code className="text-purple-300">{appId}</code>) using the Read-Modify-Write pattern to preserve existing etags and member bindings.
                  </p>
                  <div className="pl-8 text-xs text-gray-400">
                    This authorizes the user to chat with this specific assistant/engine.
                  </div>
                </div>

                {/* Step 4 */}
                <div className="bg-gray-800/90 border border-gray-700 rounded-lg p-4">
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">4</span>
                    <h4 className="text-sm font-semibold text-white">Grant Access ONLY to the Allowed DataStores (Steps A3 & A4)</h4>
                  </div>
                  <div className="pl-8 space-y-2 text-xs text-gray-300">
                    <p>
                      Grant <code className="text-blue-300">roles/discoveryengine.agentspaceUser</code> strictly on the resources the user is permitted to search:
                    </p>
                    <div className="space-y-1.5 pl-2">
                      <div>
                        <strong>• For DataConnectors</strong>: Grant on <em>both</em> the connector collection (<code className="text-purple-300">collections/{'{CONNECTOR_ID}'}</code>) and each authorized sub-entity datastore (<code className="text-purple-300">collections/default_collection/dataStores/{'{ENTITY_ID}'}</code>).
                      </div>
                      <div>
                        <strong>• For Legacy DataStores</strong>: Grant on the datastore resource (<code className="text-purple-300">collections/default_collection/dataStores/{'{DATASTORE_ID}'}</code>).
                      </div>
                    </div>
                    <div className="bg-yellow-950/40 border border-yellow-800/60 p-3 rounded text-yellow-300 mt-2">
                      🔒 <strong>Crucial Rule</strong>: Any DataStore or Connector where the user is <em>not</em> explicitly granted <code className="text-yellow-200">roles/discoveryengine.agentspaceUser</code> will remain completely hidden and restricted.
                    </div>
                  </div>
                </div>

                {/* Step 5 */}
                <div className="bg-gray-800/90 border border-gray-700 rounded-lg p-4">
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">5</span>
                    <h4 className="text-sm font-semibold text-white">Audit & Verification</h4>
                  </div>
                  <p className="text-xs text-gray-300 pl-8 mb-2">
                    Confirm bindings in the <strong>Permissions Matrix & Audit Table</strong> in the Manager UI, or test by logging in as the restricted user to verify that only authorized data sources return grounded responses.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'python' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <p className="text-xs text-gray-400">
                  Pre-configured Python script containing your app ID, connected DataConnectors, and Legacy DataStores:
                </p>
                <button
                  onClick={() => copyToClipboard(pythonScript, 'python-all')}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  {copiedKey === 'python-all' ? (
                    <>
                      <svg className="w-4 h-4 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy Python Script
                    </>
                  )}
                </button>
              </div>
              <pre className="p-4 bg-gray-950 border border-gray-800 rounded-lg text-xs font-mono text-blue-200 overflow-x-auto select-all leading-relaxed max-h-[420px]">
                {pythonScript}
              </pre>
            </div>
          )}

          {activeTab === 'curl' && (
            <div className="space-y-6">
              {/* Appendix A */}
              <div className="bg-gray-800/80 p-4 rounded-lg border border-gray-700">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-sm font-semibold text-white">Appendix A — Create Project Custom Role</h4>
                  <button
                    onClick={() => copyToClipboard(curlAppendixA, 'appA')}
                    className="text-xs text-blue-400 hover:text-blue-300 font-medium"
                  >
                    {copiedKey === 'appA' ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>
                <pre className="p-3 bg-gray-950 rounded text-xs font-mono text-gray-200 overflow-x-auto select-all">
                  {curlAppendixA}
                </pre>
              </div>

              {/* Step A1 */}
              <div className="bg-gray-800/80 p-4 rounded-lg border border-gray-700">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-sm font-semibold text-white">Step A1 — Grant Custom Role at Project Level</h4>
                  <button
                    onClick={() => copyToClipboard(curlStepA1, 'stepA1')}
                    className="text-xs text-blue-400 hover:text-blue-300 font-medium"
                  >
                    {copiedKey === 'stepA1' ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>
                <pre className="p-3 bg-gray-950 rounded text-xs font-mono text-gray-200 overflow-x-auto select-all">
                  {curlStepA1}
                </pre>
              </div>

              {/* Step A2 */}
              <div className="bg-gray-800/80 p-4 rounded-lg border border-gray-700 space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-semibold text-white">Step A2 — Grant agentspaceUser on App Engine (RMW)</h4>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>A2.1 — GET current policy:</span>
                    <button onClick={() => copyToClipboard(curlStepA2Get, 'a21')} className="text-blue-400 hover:text-blue-300">
                      {copiedKey === 'a21' ? 'Copied ✓' : 'Copy'}
                    </button>
                  </div>
                  <pre className="p-3 bg-gray-950 rounded text-xs font-mono text-gray-200 overflow-x-auto select-all">
                    {curlStepA2Get}
                  </pre>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>A2.2 — POST updated policy with ETag:</span>
                    <button onClick={() => copyToClipboard(curlStepA2Set, 'a22')} className="text-blue-400 hover:text-blue-300">
                      {copiedKey === 'a22' ? 'Copied ✓' : 'Copy'}
                    </button>
                  </div>
                  <pre className="p-3 bg-gray-950 rounded text-xs font-mono text-gray-200 overflow-x-auto select-all">
                    {curlStepA2Set}
                  </pre>
                </div>
              </div>

              {/* Step A3 & A4 Info */}
              <div className="bg-gray-800/80 p-4 rounded-lg border border-gray-700 space-y-2">
                <h4 className="text-sm font-semibold text-white">Step A3 & A4 — DataConnectors & DataStores</h4>
                <p className="text-xs text-gray-300">
                  DataConnectors use endpoint:
                  <code className="block mt-1 p-2 bg-gray-950 rounded text-purple-300 font-mono">
                    https://discoveryengine.googleapis.com/v1alpha/projects/{projectId}/locations/{location}/collections/{'{CONNECTOR_ID}'}:getIamPolicy
                  </code>
                </p>
                <p className="text-xs text-gray-300 mt-2">
                  Connector Entities and Legacy DataStores use endpoint:
                  <code className="block mt-1 p-2 bg-gray-950 rounded text-purple-300 font-mono">
                    https://discoveryengine.googleapis.com/v1alpha/projects/{projectId}/locations/{location}/collections/default_collection/dataStores/{'{DATASTORE_ID}'}:getIamPolicy
                  </code>
                </p>
              </div>
            </div>
          )}

          {activeTab === 'gcloud' && (
            <div className="space-y-4">
              <div className="bg-gray-800/80 p-4 rounded-lg border border-gray-700">
                <h4 className="text-sm font-semibold text-white mb-2">CLI Automated Setup Command</h4>
                <p className="text-xs text-gray-400 mb-3">
                  You can also run the CLI script directly with arguments:
                </p>
                <pre className="p-3 bg-gray-950 rounded text-xs font-mono text-green-300 overflow-x-auto select-all leading-relaxed">
{`python3 setup_ge_permissions.py \\
  --project ${projectId} \\
  --location ${location} \\
  --member ${targetMember} \\
  --create-custom-role \\
  --apps ${appId}${connectorArgs ? ` \\\n  --dataconnectors ${connectorArgs}` : ''}${datastoreArgs ? ` \\\n  --datastores ${datastoreArgs}` : ''}`}
                </pre>
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => copyToClipboard(`python3 setup_ge_permissions.py --project ${projectId} --location ${location} --member ${targetMember} --create-custom-role --apps ${appId}${connectorArgs ? ` --dataconnectors ${connectorArgs}` : ''}${datastoreArgs ? ` --datastores ${datastoreArgs}` : ''}`, 'cli-one')}
                    className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-xs text-gray-200 rounded border border-gray-600 transition-colors"
                  >
                    {copiedKey === 'cli-one' ? 'Copied ✓' : 'Copy CLI Command'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>

        <footer className="p-4 bg-gray-900/80 border-t border-gray-700 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
};

export default DataStorePermissionsScriptModal;
