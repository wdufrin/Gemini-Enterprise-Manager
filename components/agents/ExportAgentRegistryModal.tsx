/**
 * Copyright 2026 Google LLC
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

import React, { useState, useRef, useMemo } from 'react';
import { Agent, Config } from '../../types';
import * as api from '../../services/apiService';
import { useModalA11y } from '../../hooks/useModalA11y';
import { useToast } from '../../context/ToastContext';

export interface ExportAgentRegistryModalProps {
  isOpen: boolean;
  onClose: () => void;
  agents: Agent[];
  config: Config;
}

export interface AgentRegistryExportRow {
  agent_id: string;
  display_name: string;
  state: string;
  sharing_scope: string;
  agent_owner: string;
  agent_type: string;
  agent_origin: string;
  observability_enabled: boolean;
  sensitive_logging_enabled: boolean;
  description: string;
  create_time: string;
  update_time: string;
  resource_name: string;
}

const getAgentSharingScope = (agent: Agent): 'ALL_USERS' | 'RESTRICTED' | 'PRIVATE' => {
  const isShared = agent.state === 'ENABLED' || agent.state === 'DISABLED';
  if (!isShared) return 'PRIVATE';
  return agent.sharingConfig?.scope === 'ALL_USERS' ? 'ALL_USERS' : 'RESTRICTED';
};

export const buildAgentRegistryExportRows = (agents: Agent[]): AgentRegistryExportRow[] =>
  agents.map((agent) => {
    const agentId = agent.name.split('/').pop() || agent.id || '';
    const sharingScope = getAgentSharingScope(agent);
    const ownerHint = api.extractAgentOwnerHint(agent) || '';
    return {
      agent_id: agentId,
      display_name: agent.displayName || '',
      state: agent.state || 'PRIVATE',
      sharing_scope: sharingScope,
      agent_owner: ownerHint,
      agent_type: agent.agentType || '',
      agent_origin: agent.agentOrigin || '',
      observability_enabled: Boolean(agent.observabilityConfig?.observabilityEnabled),
      sensitive_logging_enabled: Boolean(agent.observabilityConfig?.sensitiveLoggingEnabled),
      description: agent.description || '',
      create_time: agent.createTime || '',
      update_time: agent.updateTime || '',
      resource_name: agent.name || '',
    };
  });

const escapeCsvField = (val: unknown): string => {
  const str = val === null || val === undefined ? '' : String(val);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

export const serializeAgentRegistryCsv = (rows: AgentRegistryExportRow[]): string => {
  const headers: Array<keyof AgentRegistryExportRow> = [
    'agent_id',
    'display_name',
    'state',
    'sharing_scope',
    'agent_owner',
    'agent_type',
    'agent_origin',
    'observability_enabled',
    'sensitive_logging_enabled',
    'description',
    'create_time',
    'update_time',
    'resource_name',
  ];
  const headerLine = headers.join(',');
  const dataLines = rows.map((r) => headers.map((h) => escapeCsvField(r[h])).join(','));
  return [headerLine, ...dataLines].join('\n');
};

export const serializeAgentRegistryJsonl = (rows: AgentRegistryExportRow[]): string =>
  rows.map((r) => JSON.stringify(r)).join('\n');

const sanitizeIdentifier = (val: string, fallback: string): string => {
  const cleaned = (val || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
  return cleaned || fallback;
};

export const generatePythonLocalExportScript = (config: Config): string => {
  const projectId = sanitizeIdentifier(config.projectId, 'YOUR_PROJECT_ID');
  const location = sanitizeIdentifier(config.appLocation || 'global', 'global');
  const collectionId = sanitizeIdentifier(config.collectionId || 'default_collection', 'default_collection');
  const engineId = sanitizeIdentifier(config.appId, 'YOUR_ENGINE_ID');
  const assistantId = sanitizeIdentifier(config.assistantId || 'default_assistant', 'default_assistant');
  const endpointHost =
    location === 'global'
      ? 'https://discoveryengine.googleapis.com'
      : `https://${location}-discoveryengine.googleapis.com`;

  return `#!/usr/bin/env python3
"""
Export Gemini Enterprise Registered Agents (including Agent Owner & IAM bindings)
to local CSV and JSON files.

Prerequisites:
  pip install google-auth requests
  gcloud auth application-default login
"""

import csv
import json
from datetime import datetime, timezone
import google.auth
from google.auth.transport.requests import Request
import requests

PROJECT_ID = "${projectId}"
LOCATION = "${location}"
COLLECTION_ID = "${collectionId}"
ENGINE_ID = "${engineId}"
ASSISTANT_ID = "${assistantId}"
BASE_URL = "${endpointHost}/v1alpha"


def get_headers() -> dict:
    creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    creds.refresh(Request())
    return {
        "Authorization": f"Bearer {creds.token}",
        "X-Goog-User-Project": PROJECT_ID,
        "Content-Type": "application/json",
    }


def resolve_owner(agent: dict, headers: dict) -> str:
    # 1. Query per-agent IAM policy (:getIamPolicy) for roles/discoveryengine.owner
    agent_name = agent.get("name", "")
    if agent_name:
        iam_url = f"{BASE_URL}/{agent_name}:getIamPolicy"
        resp = requests.get(iam_url, headers=headers, timeout=15)
        if resp.ok:
            bindings = resp.json().get("bindings", [])
            for b in bindings:
                role = (b.get("role") or "").lower()
                if role in (
                    "roles/discoveryengine.owner",
                    "roles/discoveryengine.agentowner",
                    "roles/owner",
                ) or "owner" in role:
                    members = b.get("members", [])
                    if members:
                        return ", ".join(
                            m.removeprefix("user:").removeprefix("serviceAccount:")
                            for m in members
                        )

    # 2. Fall back to inline definition owner fields
    for def_key in (
        "lowCodeAgentDefinition",
        "workflowAgentDefinition",
        "agentDesignerAgentDefinition",
        "skillAgentDefinition",
        "noCodeAgentDefinition",
    ):
        defn = agent.get(def_key) or {}
        owner = defn.get("ownerName") or defn.get("owner")
        if owner:
            return str(owner).removeprefix("user:")

    if agent.get("managedAgentDefinition"):
        return "Google"
    return ""


def fetch_agents() -> list[dict]:
    headers = get_headers()
    parent = (
        f"projects/{PROJECT_ID}/locations/{LOCATION}/collections/{COLLECTION_ID}"
        f"/engines/{ENGINE_ID}/assistants/{ASSISTANT_ID}"
    )
    agents = []
    page_token = None
    while True:
        params = {"pageSize": 100}
        if page_token:
            params["pageToken"] = page_token
        resp = requests.get(f"{BASE_URL}/{parent}/agents", headers=headers, params=params, timeout=30)
        resp.raise_for_status()
        payload = resp.json()
        agents.extend(payload.get("agents", []))
        page_token = payload.get("nextPageToken")
        if not page_token:
            break

    exported_at = datetime.now(timezone.utc).isoformat()
    rows = []
    for a in agents:
        name = a.get("name", "")
        state = a.get("state", "PRIVATE")
        sharing_scope = (
            (a.get("sharingConfig") or {}).get("scope", "RESTRICTED")
            if state in ("ENABLED", "DISABLED")
            else "PRIVATE"
        )
        obs = a.get("observabilityConfig") or {}
        rows.append({
            "exported_at": exported_at,
            "project_id": PROJECT_ID,
            "location": LOCATION,
            "engine_id": ENGINE_ID,
            "agent_id": name.split("/")[-1] if name else "",
            "display_name": a.get("displayName", ""),
            "state": state,
            "sharing_scope": sharing_scope,
            "agent_owner": resolve_owner(a, headers),
            "agent_type": a.get("agentType", ""),
            "observability_enabled": bool(obs.get("observabilityEnabled")),
            "sensitive_logging_enabled": bool(obs.get("sensitiveLoggingEnabled")),
            "description": a.get("description", ""),
            "create_time": a.get("createTime", ""),
            "update_time": a.get("updateTime", ""),
            "resource_name": name,
        })
    return rows


if __name__ == "__main__":
    records = fetch_agents()
    with open("agent_registry_export.json", "w", encoding="utf-8") as jf:
        json.dump(records, jf, indent=2)
    if records:
        with open("agent_registry_export.csv", "w", newline="", encoding="utf-8") as cf:
            writer = csv.DictWriter(cf, fieldnames=list(records[0].keys()))
            writer.writeheader()
            writer.writerows(records)
    print(f"Exported {len(records)} agent(s) to agent_registry_export.csv and agent_registry_export.json")
`;
};

export const generateBigQueryExportScript = (
  config: Config,
  datasetId: string,
  tableId: string,
): string => {
  const projectId = sanitizeIdentifier(config.projectId, 'YOUR_PROJECT_ID');
  const location = sanitizeIdentifier(config.appLocation || 'global', 'global');
  const collectionId = sanitizeIdentifier(config.collectionId || 'default_collection', 'default_collection');
  const engineId = sanitizeIdentifier(config.appId, 'YOUR_ENGINE_ID');
  const assistantId = sanitizeIdentifier(config.assistantId || 'default_assistant', 'default_assistant');
  const cleanDataset = sanitizeIdentifier(datasetId, 'gemini_enterprise_inventory');
  const cleanTable = sanitizeIdentifier(tableId, 'registered_agents');
  const endpointHost =
    location === 'global'
      ? 'https://discoveryengine.googleapis.com'
      : `https://${location}-discoveryengine.googleapis.com`;

  return `#!/usr/bin/env python3
"""
Export Gemini Enterprise Registered Agents (with Agent Owner & Sharing metadata)
directly into a Google BigQuery table (${projectId}.${cleanDataset}.${cleanTable}).

Prerequisites:
  pip install google-auth requests google-cloud-bigquery
  gcloud auth application-default login
"""

from datetime import datetime, timezone
import google.auth
from google.auth.transport.requests import Request
from google.cloud import bigquery
import requests

PROJECT_ID = "${projectId}"
LOCATION = "${location}"
COLLECTION_ID = "${collectionId}"
ENGINE_ID = "${engineId}"
ASSISTANT_ID = "${assistantId}"
BQ_DATASET = "${cleanDataset}"
BQ_TABLE = "${cleanTable}"
BASE_URL = "${endpointHost}/v1alpha"

SCHEMA = [
    bigquery.SchemaField("exported_at", "TIMESTAMP", mode="REQUIRED"),
    bigquery.SchemaField("project_id", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("location", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("engine_id", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("agent_id", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("display_name", "STRING"),
    bigquery.SchemaField("state", "STRING"),
    bigquery.SchemaField("sharing_scope", "STRING"),
    bigquery.SchemaField("agent_owner", "STRING"),
    bigquery.SchemaField("agent_type", "STRING"),
    bigquery.SchemaField("observability_enabled", "BOOL"),
    bigquery.SchemaField("sensitive_logging_enabled", "BOOL"),
    bigquery.SchemaField("description", "STRING"),
    bigquery.SchemaField("create_time", "STRING"),
    bigquery.SchemaField("update_time", "STRING"),
    bigquery.SchemaField("resource_name", "STRING"),
]


def get_headers() -> dict:
    creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    creds.refresh(Request())
    return {
        "Authorization": f"Bearer {creds.token}",
        "X-Goog-User-Project": PROJECT_ID,
        "Content-Type": "application/json",
    }


def resolve_owner(agent: dict, headers: dict) -> str:
    agent_name = agent.get("name", "")
    if agent_name:
        iam_url = f"{BASE_URL}/{agent_name}:getIamPolicy"
        resp = requests.get(iam_url, headers=headers, timeout=15)
        if resp.ok:
            for b in resp.json().get("bindings", []):
                role = (b.get("role") or "").lower()
                if role in (
                    "roles/discoveryengine.owner",
                    "roles/discoveryengine.agentowner",
                    "roles/owner",
                ) or "owner" in role:
                    members = b.get("members", [])
                    if members:
                        return ", ".join(
                            m.removeprefix("user:").removeprefix("serviceAccount:")
                            for m in members
                        )

    for def_key in (
        "lowCodeAgentDefinition",
        "workflowAgentDefinition",
        "agentDesignerAgentDefinition",
        "skillAgentDefinition",
        "noCodeAgentDefinition",
    ):
        defn = agent.get(def_key) or {}
        owner = defn.get("ownerName") or defn.get("owner")
        if owner:
            return str(owner).removeprefix("user:")

    if agent.get("managedAgentDefinition"):
        return "Google"
    return ""


def export_to_bigquery():
    headers = get_headers()
    parent = (
        f"projects/{PROJECT_ID}/locations/{LOCATION}/collections/{COLLECTION_ID}"
        f"/engines/{ENGINE_ID}/assistants/{ASSISTANT_ID}"
    )
    resp = requests.get(f"{BASE_URL}/{parent}/agents?pageSize=100", headers=headers, timeout=30)
    resp.raise_for_status()
    agents = resp.json().get("agents", [])

    exported_at = datetime.now(timezone.utc).isoformat()
    rows = []
    for a in agents:
        name = a.get("name", "")
        state = a.get("state", "PRIVATE")
        sharing_scope = (
            (a.get("sharingConfig") or {}).get("scope", "RESTRICTED")
            if state in ("ENABLED", "DISABLED")
            else "PRIVATE"
        )
        obs = a.get("observabilityConfig") or {}
        rows.append({
            "exported_at": exported_at,
            "project_id": PROJECT_ID,
            "location": LOCATION,
            "engine_id": ENGINE_ID,
            "agent_id": name.split("/")[-1] if name else "",
            "display_name": a.get("displayName", ""),
            "state": state,
            "sharing_scope": sharing_scope,
            "agent_owner": resolve_owner(a, headers),
            "agent_type": a.get("agentType", ""),
            "observability_enabled": bool(obs.get("observabilityEnabled")),
            "sensitive_logging_enabled": bool(obs.get("sensitiveLoggingEnabled")),
            "description": a.get("description", ""),
            "create_time": a.get("createTime", ""),
            "update_time": a.get("updateTime", ""),
            "resource_name": name,
        })

    bq_client = bigquery.Client(project=PROJECT_ID)
    dataset_ref = bigquery.Dataset(f"{PROJECT_ID}.{BQ_DATASET}")
    bq_client.create_dataset(dataset_ref, exists_ok=True)

    table_id = f"{PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE}"
    table_ref = bigquery.Table(table_id, schema=SCHEMA)
    bq_client.create_table(table_ref, exists_ok=True)

    if rows:
        errors = bq_client.insert_rows_json(table_id, rows)
        if errors:
            raise RuntimeError(f"BigQuery streaming insert errors: {errors}")
    print(f"Loaded {len(rows)} agent(s) into BigQuery table {table_id}")


if __name__ == "__main__":
    export_to_bigquery()
`;
};

export const generateCurlAndBqCliScript = (
  config: Config,
  datasetId: string,
  tableId: string,
): string => {
  const projectId = sanitizeIdentifier(config.projectId, 'YOUR_PROJECT_ID');
  const location = sanitizeIdentifier(config.appLocation || 'global', 'global');
  const collectionId = sanitizeIdentifier(config.collectionId || 'default_collection', 'default_collection');
  const engineId = sanitizeIdentifier(config.appId, 'YOUR_ENGINE_ID');
  const assistantId = sanitizeIdentifier(config.assistantId || 'default_assistant', 'default_assistant');
  const cleanDataset = sanitizeIdentifier(datasetId, 'gemini_enterprise_inventory');
  const cleanTable = sanitizeIdentifier(tableId, 'registered_agents');
  const endpointHost =
    location === 'global'
      ? 'https://discoveryengine.googleapis.com'
      : `https://${location}-discoveryengine.googleapis.com`;

  return `#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${projectId}"
LOCATION="${location}"
ENGINE_ID="${engineId}"
BQ_DATASET="${cleanDataset}"
BQ_TABLE="${cleanTable}"
BASE_URL="${endpointHost}/v1alpha"

TOKEN="$(gcloud auth print-access-token)"
API_URL="\${BASE_URL}/projects/\${PROJECT_ID}/locations/\${LOCATION}/collections/${collectionId}/engines/\${ENGINE_ID}/assistants/${assistantId}/agents?pageSize=100"

echo "1. Fetching Registered Agents and per-agent :getIamPolicy (roles/discoveryengine.owner)..."
> agents_registry.jsonl

curl -sS -H "Authorization: Bearer \${TOKEN}" \\
  -H "X-Goog-User-Project: \${PROJECT_ID}" \\
  "\${API_URL}" | jq -c '.agents[]?' | while read -r agent_json; do
  AGENT_NAME="$(echo "\${agent_json}" | jq -r '.name')"
  IAM_OWNER="$(curl -sS -X GET \\
    -H "Authorization: Bearer \${TOKEN}" \\
    -H "X-Goog-User-Project: \${PROJECT_ID}" \\
    "\${BASE_URL}/\${AGENT_NAME}:getIamPolicy" | jq -r '
      [ .bindings[]?
        | select(
            .role == "roles/discoveryengine.owner" or
            .role == "roles/discoveryengine.agentOwner" or
            (.role | ascii_downcase | contains("owner"))
          )
        | .members[]?
        | sub("^(user:|serviceAccount:|group:|domain:)"; "")
      ] | unique | join(", ")
    ')"

  echo "\${agent_json}" | jq -c --arg iam_owner "\${IAM_OWNER}" '{
    agent_id: (.name | split("/") | last),
    display_name: (.displayName // ""),
    state: (.state // "PRIVATE"),
    sharing_scope: (if (.state == "ENABLED" or .state == "DISABLED") then (.sharingConfig.scope // "RESTRICTED") else "PRIVATE" end),
    agent_owner: (if ($iam_owner != "") then $iam_owner else (.lowCodeAgentDefinition.ownerName // .workflowAgentDefinition.ownerName // .lowCodeAgentDefinition.owner // "") end),
    agent_type: (.agentType // ""),
    observability_enabled: (.observabilityConfig.observabilityEnabled // false),
    sensitive_logging_enabled: (.observabilityConfig.sensitiveLoggingEnabled // false),
    description: (.description // ""),
    create_time: (.createTime // ""),
    update_time: (.updateTime // ""),
    resource_name: .name
  }' >> agents_registry.jsonl
done

echo "Saved $(wc -l < agents_registry.jsonl) agent record(s) to agents_registry.jsonl"

echo "2. Loading agents_registry.jsonl into BigQuery (\${PROJECT_ID}:\${BQ_DATASET}.\${BQ_TABLE})..."
bq --project_id="\${PROJECT_ID}" mk --dataset --if_not_exists "\${PROJECT_ID}:\${BQ_DATASET}"
bq --project_id="\${PROJECT_ID}" load \\
  --source_format=NEWLINE_DELIMITED_JSON \\
  --autodetect \\
  "\${PROJECT_ID}:\${BQ_DATASET}.\${BQ_TABLE}" \\
  agents_registry.jsonl
`;
};

const ExportAgentRegistryModal: React.FC<ExportAgentRegistryModalProps> = ({
  isOpen,
  onClose,
  agents,
  config,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'download' | 'python-local' | 'bigquery' | 'bash'>('download');
  const [bqDatasetId, setBqDatasetId] = useState('gemini_enterprise_inventory');
  const [bqTableId, setBqTableId] = useState('registered_agents');
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

  useModalA11y({
    isOpen,
    onClose,
    containerRef,
  });

  const exportRows = useMemo(() => buildAgentRegistryExportRows(agents), [agents]);

  const pythonLocalScript = useMemo(() => generatePythonLocalExportScript(config), [config]);
  const pythonBqScript = useMemo(
    () => generateBigQueryExportScript(config, bqDatasetId, bqTableId),
    [config, bqDatasetId, bqTableId],
  );
  const bashCliScript = useMemo(
    () => generateCurlAndBqCliScript(config, bqDatasetId, bqTableId),
    [config, bqDatasetId, bqTableId],
  );

  if (!isOpen) return null;

  const triggerFileDownload = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${filename}`);
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLabel(label);
    toast.success(`Copied ${label} to clipboard`);
    setTimeout(() => setCopiedLabel(null), 2000);
  };

  const enginePrefix = sanitizeIdentifier(config.appId || 'agents', 'agents');

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-agent-registry-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-gray-700 flex items-start justify-between gap-4">
          <div>
            <h3 id="export-agent-registry-title" className="text-lg font-bold text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Export Registered Agents &amp; Automation Scripts</span>
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              Download the current agent registry ({exportRows.length} agent{exportRows.length === 1 ? '' : 's'}) locally or generate a custom script to automate exporting to a local file or BigQuery.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close export modal"
            className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-700 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-5 pt-3 border-b border-gray-700 flex flex-wrap gap-2 bg-gray-900/40">
          {[
            { id: 'download', label: '1. Instant Local Download' },
            { id: 'python-local', label: '2. Python Script (Local CSV / JSON)' },
            { id: 'bigquery', label: '3. Python Script (BigQuery Export)' },
            { id: 'bash', label: '4. cURL + jq + bq CLI' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id as typeof activeTab)}
              className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === t.id
                  ? 'border-blue-500 text-blue-400 bg-gray-800/60 rounded-t-md'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'download' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-4 bg-gray-900/60 border border-gray-700 rounded-lg flex flex-col justify-between space-y-3">
                  <div>
                    <div className="text-sm font-bold text-white">CSV Spreadsheet (.csv)</div>
                    <p className="text-xs text-gray-400 mt-1">
                      Includes Agent ID, Display Name, Status, Sharing Scope, Agent Owner, Agent Type, Telemetry flags, and timestamps.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      triggerFileDownload(
                        serializeAgentRegistryCsv(exportRows),
                        `${enginePrefix}_registered_agents.csv`,
                        'text/csv;charset=utf-8;',
                      )
                    }
                    className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-md transition-colors"
                  >
                    Download CSV ({exportRows.length})
                  </button>
                </div>

                <div className="p-4 bg-gray-900/60 border border-gray-700 rounded-lg flex flex-col justify-between space-y-3">
                  <div>
                    <div className="text-sm font-bold text-white">BigQuery NDJSON (.jsonl)</div>
                    <p className="text-xs text-gray-400 mt-1">
                      Newline-delimited JSON ready for direct upload into BigQuery via <code className="text-blue-300">bq load --source_format=NEWLINE_DELIMITED_JSON</code>.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      triggerFileDownload(
                        serializeAgentRegistryJsonl(exportRows),
                        `${enginePrefix}_registered_agents.jsonl`,
                        'application/x-ndjson;charset=utf-8;',
                      )
                    }
                    className="w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-md transition-colors"
                  >
                    Download JSONL for BigQuery ({exportRows.length})
                  </button>
                </div>

                <div className="p-4 bg-gray-900/60 border border-gray-700 rounded-lg flex flex-col justify-between space-y-3">
                  <div>
                    <div className="text-sm font-bold text-white">Full JSON Array (.json)</div>
                    <p className="text-xs text-gray-400 mt-1">
                      Formatted JSON array of all normalized agent registry rows for local scripts or configuration audits.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      triggerFileDownload(
                        JSON.stringify(exportRows, null, 2),
                        `${enginePrefix}_registered_agents.json`,
                        'application/json;charset=utf-8;',
                      )
                    }
                    className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-md transition-colors"
                  >
                    Download JSON ({exportRows.length})
                  </button>
                </div>
              </div>

              {/* Preview Table */}
              <div className="border border-gray-700 rounded-lg overflow-hidden">
                <div className="px-3.5 py-2 bg-gray-900/80 border-b border-gray-700 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Export Payload Preview ({Math.min(exportRows.length, 5)} of {exportRows.length} rows)
                  </span>
                </div>
                <div className="overflow-x-auto max-h-56">
                  <table className="min-w-full divide-y divide-gray-700 text-xs">
                    <thead className="bg-gray-900/50 text-gray-400">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Display Name</th>
                        <th className="px-3 py-2 text-left font-medium">Agent Owner</th>
                        <th className="px-3 py-2 text-left font-medium">Status</th>
                        <th className="px-3 py-2 text-left font-medium">Sharing Scope</th>
                        <th className="px-3 py-2 text-left font-medium">Agent Type</th>
                        <th className="px-3 py-2 text-left font-medium">Agent ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700 bg-gray-800">
                      {exportRows.slice(0, 5).map((r) => (
                        <tr key={r.resource_name || r.agent_id}>
                          <td className="px-3 py-2 text-white font-medium">{r.display_name}</td>
                          <td className="px-3 py-2 text-cyan-300 font-mono">{r.agent_owner || '—'}</td>
                          <td className="px-3 py-2 text-gray-300">{r.state}</td>
                          <td className="px-3 py-2 text-gray-300">{r.sharing_scope}</td>
                          <td className="px-3 py-2 text-gray-400">{r.agent_type || 'N/A'}</td>
                          <td className="px-3 py-2 text-gray-400 font-mono">{r.agent_id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'python-local' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-gray-300">
                  Standalone Python script that queries the Discovery Engine API + <code className="text-blue-300">:getIamPolicy</code> to resolve <code className="text-amber-300">roles/discoveryengine.agentOwner</code> and writes <code className="text-gray-200">agent_registry_export.csv</code> and <code className="text-gray-200">.json</code>.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopy(pythonLocalScript, 'Python Local Script')}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-xs font-semibold text-white rounded-md"
                  >
                    {copiedLabel === 'Python Local Script' ? 'Copied!' : 'Copy Script'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      triggerFileDownload(
                        pythonLocalScript,
                        'export_agents_local.py',
                        'text/x-python;charset=utf-8;',
                      )
                    }
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white rounded-md"
                  >
                    Download .py
                  </button>
                </div>
              </div>
              <pre className="p-4 bg-gray-950 border border-gray-700 rounded-lg text-xs font-mono text-gray-200 overflow-x-auto max-h-96">
                <code>{pythonLocalScript}</code>
              </pre>
            </div>
          )}

          {activeTab === 'bigquery' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-900/50 p-3.5 rounded-lg border border-gray-700">
                <div>
                  <label htmlFor="bq-export-dataset" className="block text-xs font-medium text-gray-300 mb-1">
                    Target BigQuery Dataset ID
                  </label>
                  <input
                    id="bq-export-dataset"
                    type="text"
                    value={bqDatasetId}
                    onChange={(e) => setBqDatasetId(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-600 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="bq-export-table" className="block text-xs font-medium text-gray-300 mb-1">
                    Target BigQuery Table ID
                  </label>
                  <input
                    id="bq-export-table"
                    type="text"
                    value={bqTableId}
                    onChange={(e) => setBqTableId(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-600 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-gray-300">
                  Python script using <code className="text-blue-300">google-cloud-bigquery</code> to auto-create the dataset/table schema and stream all registered agents (with resolved <code className="text-cyan-300">agent_owner</code>) into BigQuery.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopy(pythonBqScript, 'BigQuery Python Script')}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-xs font-semibold text-white rounded-md"
                  >
                    {copiedLabel === 'BigQuery Python Script' ? 'Copied!' : 'Copy Script'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      triggerFileDownload(
                        pythonBqScript,
                        'export_agents_to_bigquery.py',
                        'text/x-python;charset=utf-8;',
                      )
                    }
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white rounded-md"
                  >
                    Download .py
                  </button>
                </div>
              </div>
              <pre className="p-4 bg-gray-950 border border-gray-700 rounded-lg text-xs font-mono text-gray-200 overflow-x-auto max-h-80">
                <code>{pythonBqScript}</code>
              </pre>
            </div>
          )}

          {activeTab === 'bash' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-gray-300">
                  Lightweight shell pipeline using <code className="text-blue-300">curl</code>, <code className="text-blue-300">jq</code>, and <code className="text-blue-300">bq load</code> to extract the agent registry to <code className="text-gray-200">agents_registry.jsonl</code> and load it into BigQuery.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopy(bashCliScript, 'Bash CLI Script')}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-xs font-semibold text-white rounded-md"
                  >
                    {copiedLabel === 'Bash CLI Script' ? 'Copied!' : 'Copy Commands'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      triggerFileDownload(
                        bashCliScript,
                        'export_agents_bq.sh',
                        'application/x-sh;charset=utf-8;',
                      )
                    }
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white rounded-md"
                  >
                    Download .sh
                  </button>
                </div>
              </div>
              <pre className="p-4 bg-gray-950 border border-gray-700 rounded-lg text-xs font-mono text-gray-200 overflow-x-auto max-h-96">
                <code>{bashCliScript}</code>
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 bg-gray-900/40 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs font-semibold rounded-md transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportAgentRegistryModal;
