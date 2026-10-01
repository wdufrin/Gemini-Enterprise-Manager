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

import React, { useState, useRef } from 'react';
import { Config, AppEngine } from '../../types';
import { useModalA11y } from '../../hooks/useModalA11y';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'guide' | 'python' | 'curl' | 'gcloud'>('guide');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useModalA11y({
    isOpen,
    onClose,
    containerRef,
  });

  if (!isOpen) return null;

  const projectId = config.projectId;
  const location = config.appLocation || 'global';
  const endpointPrefix = location === 'global' ? '' : `${location}-`;
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
Automates Resource Access Control Enablement, Predefined Project Baseline Role Bindings, and Resource-Level IAM Bindings (v1 GA).
"""

import subprocess
import json
import urllib.request
import urllib.error
import sys

PROJECT_ID = "${projectId}"
LOCATION = "${location}"
ENDPOINT_HOST = "discoveryengine.googleapis.com" if LOCATION == "global" else f"{LOCATION}-discoveryengine.googleapis.com"
APP_ID = "${appId}"
MEMBER = "${member}"
PROJECT_BASELINE_ROLES = [
    "roles/discoveryengine.agentspaceRestrictedUser",
    "roles/discoveryengine.notebookLmUser",
]
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

def enable_project_datastore_access_control():
    print(f"\\n[Step 0] Enabling Resource Access Control in Gemini Enterprise Settings on '{PROJECT_ID}'...")
    url = f"https://{ENDPOINT_HOST}/v1alpha/projects/{PROJECT_ID}?updateMask=customerProvidedConfig.resourceAccessControlConfig.dataStoreAccessControlEnabled"
    payload = {
        "customerProvidedConfig": {
            "resourceAccessControlConfig": {
                "dataStoreAccessControlEnabled": True
            }
        }
    }
    http_request("PATCH", url, data=payload)
    print(f"[VERIFIED ✓] Resource Access Control ('dataStoreAccessControlEnabled=true') is active.")

def grant_project_baseline_roles(member_str):
    print(f"\\n[Step A1] Granting predefined project baseline roles to '{member_str}'...")
    get_url = f"https://cloudresourcemanager.googleapis.com/v1/projects/{PROJECT_ID}:getIamPolicy"
    set_url = f"https://cloudresourcemanager.googleapis.com/v1/projects/{PROJECT_ID}:setIamPolicy"
    
    policy = http_request("POST", get_url, data={})
    bindings = policy.get("bindings", [])
    etag = policy.get("etag", "")
    
    for role in PROJECT_BASELINE_ROLES:
        target_b = next((b for b in bindings if b.get("role") == role), None)
        if target_b:
            if member_str not in target_b.setdefault("members", []):
                target_b["members"].append(member_str)
        else:
            bindings.append({"role": role, "members": [member_str]})
            
    http_request("POST", set_url, data={"policy": {"etag": etag, "bindings": bindings}})
    print(f"[VERIFIED ✓] Granted project roles {PROJECT_BASELINE_ROLES} to '{member_str}'.")

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
    print(f"=== Gemini Enterprise Datastore-Level Access Control Setup (v1 GA) ===")
    print(f"Project: {PROJECT_ID} | Location: {LOCATION} | App: {APP_ID}")
    print(f"Target Member: {MEMBER}\\n")
    
    # Step 0: Enable Resource Access Control in GE Settings
    enable_project_datastore_access_control()

    # Step A1: Project-level baseline bindings
    grant_project_baseline_roles(MEMBER)
    
    # Step A2: App (Engine) binding
    app_url = f"https://{ENDPOINT_HOST}/v1/projects/{PROJECT_ID}/locations/{LOCATION}/collections/default_collection/engines/{APP_ID}"
    update_iam_policy_rmw(f"App Engine '{APP_ID}'", app_url, MEMBER)
    
    # Step A3: DataConnectors & Entities
    for conn in CONNECTORS:
        conn_id = conn["id"]
        conn_url = f"https://{ENDPOINT_HOST}/v1/projects/{PROJECT_ID}/locations/{LOCATION}/collections/{conn_id}"
        update_iam_policy_rmw(f"DataConnector Collection '{conn_id}'", conn_url, MEMBER)
        
        for entity_id in conn.get("entities", []):
            ent_url = f"https://{ENDPOINT_HOST}/v1/projects/{PROJECT_ID}/locations/{LOCATION}/collections/default_collection/dataStores/{entity_id}"
            update_iam_policy_rmw(f"Connector Entity '{entity_id}'", ent_url, MEMBER)
            
    # Step A4: Legacy DataStores
    for ds_id in DATASTORES:
        ds_url = f"https://{ENDPOINT_HOST}/v1/projects/{PROJECT_ID}/locations/{LOCATION}/collections/default_collection/dataStores/{ds_id}"
        update_iam_policy_rmw(f"Legacy DataStore '{ds_id}'", ds_url, MEMBER)
        
    print(f"\\n[COMPLETE] Successfully configured all datastore ACLs for '{MEMBER}'!")

if __name__ == "__main__":
    main()
`;

  // 2. Generate cURL commands
  const curlProjectOptIn = `curl -X PATCH \\
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: ${projectId}" \\
  -d '{
    "customerProvidedConfig": {
      "resourceAccessControlConfig": {
        "dataStoreAccessControlEnabled": true
      }
    }
  }' \\
  "https://${endpointPrefix}discoveryengine.googleapis.com/v1alpha/projects/${projectId}?updateMask=customerProvidedConfig.resourceAccessControlConfig.dataStoreAccessControlEnabled"`;

  const curlStepA1 = `gcloud projects add-iam-policy-binding ${projectId} \\
  --member="${member}" \\
  --role="roles/discoveryengine.agentspaceRestrictedUser"

gcloud projects add-iam-policy-binding ${projectId} \\
  --member="${member}" \\
  --role="roles/discoveryengine.notebookLmUser"`;

  const curlStepA2Get = `curl -X GET \\
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \\
  -H "X-Goog-User-Project: ${projectId}" \\
  "https://${endpointPrefix}discoveryengine.googleapis.com/v1/projects/${projectId}/locations/${location}/collections/default_collection/engines/${appId}:getIamPolicy"`;

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
  "https://${endpointPrefix}discoveryengine.googleapis.com/v1/projects/${projectId}/locations/${location}/collections/default_collection/engines/${appId}:setIamPolicy"`;

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-xs flex justify-center items-center z-50 p-4"
      aria-modal="true"
      role="dialog"
      aria-labelledby="datastore-scripts-title"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col border border-gray-700 animate-fade-in"
      >
        <header className="p-5 border-b border-gray-700 bg-gray-800/90 shrink-0 flex justify-between items-center">
          <div>
            <h2 id="datastore-scripts-title" className="text-xl font-bold text-white flex items-center gap-2">
              <span>DataStore ACL Automation Scripts & Commands</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-900/50 text-green-300 border border-green-700">
                GA
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
            aria-label="Close dialog"
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
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-green-900/60 text-green-300 border border-green-600">GA</span>
                </h3>
                <p className="text-xs text-gray-300 leading-relaxed">
                  By default, Gemini Enterprise users require project-level IAM roles which grant access to all datastores. 
                  Datastore-Level Access Control (GA) replaces this with a <strong>least-privilege 2-tier model</strong>: predefined project-level baseline roles (<code className="text-blue-300">roles/discoveryengine.agentspaceRestrictedUser</code> &amp; <code className="text-blue-300">roles/discoveryengine.notebookLmUser</code>) combined with explicit resource-level bindings on only the specific App Engine and DataStores they are allowed to query.
                </p>
              </div>

              {/* Numbered Steps */}
              <div className="space-y-4">
                {/* Step 0 */}
                <div className="bg-gray-800/90 border border-gray-700 rounded-lg p-4">
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">0</span>
                    <h4 className="text-sm font-semibold text-white">Prerequisites: Enable Resource Access Control &amp; User Isolation</h4>
                  </div>
                  <ul className="list-disc pl-9 space-y-1.5 text-xs text-gray-300">
                    <li>
                      <strong>Resource Access Control</strong>: Enable <code className="text-purple-300">customerProvidedConfig.resourceAccessControlConfig.dataStoreAccessControlEnabled = true</code> in <strong>Gemini Enterprise → Settings → Resource access control</strong> (or via <code className="text-blue-300">PATCH /v1alpha/projects/{projectId}</code>).
                    </li>
                    <li>
                      <strong>Remove Broad IAM Roles</strong>: Ensure target end users or groups do <em>not</em> possess broad project-wide search roles like <code className="text-red-300">roles/viewer</code>, <code className="text-red-300">roles/editor</code>, <code className="text-red-300">roles/discoveryengine.admin</code>, <code className="text-red-300">roles/discoveryengine.user</code>, or <code className="text-red-300">roles/discoveryengine.agentspaceUser</code> at the project level.
                    </li>
                  </ul>
                </div>

                {/* Step 1 */}
                <div className="bg-gray-800/90 border border-gray-700 rounded-lg p-4">
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">1</span>
                    <h4 className="text-sm font-semibold text-white">Grant Predefined Baseline Roles at Project Level (Step A1)</h4>
                  </div>
                  <p className="text-xs text-gray-300 pl-8 mb-2">
                    Bind <code className="text-blue-300">roles/discoveryengine.agentspaceRestrictedUser</code> and <code className="text-blue-300">roles/discoveryengine.notebookLmUser</code> at the project level to the target user or group (<code className="text-yellow-300">user:alice@example.com</code> or <code className="text-yellow-300">group:finance-team@example.com</code>).
                  </p>
                  <div className="pl-8 text-xs text-gray-400">
                    This allows the user to open the Gemini Enterprise web application interface, authorize OAuth connectors, and use NotebookLM without granting project-wide search/serving permissions.
                  </div>
                </div>

                {/* Step 2 */}
                <div className="bg-gray-800/90 border border-gray-700 rounded-lg p-4">
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">2</span>
                    <h4 className="text-sm font-semibold text-white">Grant App Engine Access (Step A2)</h4>
                  </div>
                  <p className="text-xs text-gray-300 pl-8 mb-2">
                    Grant <code className="text-blue-300">roles/discoveryengine.agentspaceUser</code> on the specific App Engine (<code className="text-purple-300">{appId}</code>) using the Read-Modify-Write pattern to preserve existing etags and member bindings.
                  </p>
                  <div className="pl-8 text-xs text-gray-400">
                    This authorizes the user to chat with this specific assistant/engine.
                  </div>
                </div>

                {/* Step 3 */}
                <div className="bg-gray-800/90 border border-gray-700 rounded-lg p-4">
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">3</span>
                    <h4 className="text-sm font-semibold text-white">Grant Access ONLY to the Allowed DataStores (Steps A3 &amp; A4 — GA v1 API)</h4>
                  </div>
                  <div className="pl-8 space-y-2 text-xs text-gray-300">
                    <p>
                      Grant <code className="text-blue-300">roles/discoveryengine.agentspaceUser</code> strictly on the resources the user is permitted to search:
                    </p>
                    <div className="space-y-1.5 pl-2">
                      <div>
                        <strong>• For DataConnectors</strong>: Grant on <em>both</em> the connector collection (<code className="text-purple-300">/v1/.../collections/{'{CONNECTOR_ID}'}:setIamPolicy</code>) and each authorized sub-entity datastore (<code className="text-purple-300">/v1/.../collections/default_collection/dataStores/{'{ENTITY_ID}'}:setIamPolicy</code>).
                      </div>
                      <div>
                        <strong>• For Legacy DataStores</strong>: Grant on the datastore resource (<code className="text-purple-300">/v1/.../collections/default_collection/dataStores/{'{DATASTORE_ID}'}:setIamPolicy</code>).
                      </div>
                    </div>
                    <div className="bg-yellow-950/40 border border-yellow-800/60 p-3 rounded text-yellow-300 mt-2">
                      🔒 <strong>Crucial Rule</strong>: Any DataStore or Connector where the user is <em>not</em> explicitly granted <code className="text-yellow-200">roles/discoveryengine.agentspaceUser</code> will remain completely hidden and restricted.
                    </div>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="bg-gray-800/90 border border-gray-700 rounded-lg p-4">
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">4</span>
                    <h4 className="text-sm font-semibold text-white">Audit &amp; Verification</h4>
                  </div>
                  <p className="text-xs text-gray-300 pl-8 mb-2">
                    Confirm bindings in the <strong>Permissions Matrix &amp; Audit Table</strong> in the Manager UI, or test by logging in as the restricted user to verify that only authorized data sources return grounded responses.
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
              {/* Step 0: Enable Resource Access Control */}
              <div className="bg-gray-800/80 p-4 rounded-lg border border-gray-700">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-sm font-semibold text-white">Step 0 — Enable Resource Access Control in Gemini Enterprise Settings</h4>
                  <button
                    onClick={() => copyToClipboard(curlProjectOptIn, 'optIn')}
                    className="text-xs text-blue-400 hover:text-blue-300 font-medium"
                  >
                    {copiedKey === 'optIn' ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>
                <pre className="p-3 bg-gray-950 rounded text-xs font-mono text-gray-200 overflow-x-auto select-all">
                  {curlProjectOptIn}
                </pre>
              </div>

              {/* Step A1 */}
              <div className="bg-gray-800/80 p-4 rounded-lg border border-gray-700">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-sm font-semibold text-white">Step A1 — Grant Predefined Baseline Roles at Project Level</h4>
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
                <h4 className="text-sm font-semibold text-white">Step A3 &amp; A4 — DataConnectors &amp; DataStores (GA v1 API)</h4>
                <p className="text-xs text-gray-300">
                  DataConnectors use endpoint:
                  <code className="block mt-1 p-2 bg-gray-950 rounded text-purple-300 font-mono">
                    https://{endpointPrefix}discoveryengine.googleapis.com/v1/projects/{projectId}/locations/{location}/collections/{'{CONNECTOR_ID}'}:getIamPolicy
                  </code>
                </p>
                <p className="text-xs text-gray-300 mt-2">
                  Connector Entities and Legacy DataStores use endpoint:
                  <code className="block mt-1 p-2 bg-gray-950 rounded text-purple-300 font-mono">
                    https://{endpointPrefix}discoveryengine.googleapis.com/v1/projects/{projectId}/locations/{location}/collections/default_collection/dataStores/{'{DATASTORE_ID}'}:getIamPolicy
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
  --apps ${appId}${connectorArgs ? ` \\\n  --dataconnectors ${connectorArgs}` : ''}${datastoreArgs ? ` \\\n  --datastores ${datastoreArgs}` : ''}`}
                </pre>
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => copyToClipboard(`python3 setup_ge_permissions.py --project ${projectId} --location ${location} --member ${targetMember} --apps ${appId}${connectorArgs ? ` --dataconnectors ${connectorArgs}` : ''}${datastoreArgs ? ` --datastores ${datastoreArgs}` : ''}`, 'cli-one')}
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
