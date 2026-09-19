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

import React, { useState, useEffect, useRef } from 'react';
import { useModalA11y } from '../../../hooks/useModalA11y';
import { Agent, AppEngine, Config } from '../../../types';
import * as api from '../../../services/apiService';
import { BulkObservabilityResult } from '../../../services/api/discovery/agents';
import { toErrorMessage } from '../../../utils/errors';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectNumber: string;
  activeDatasetId?: string;
}

type TabType = 'coverage' | 'option1_eventarc' | 'option2_bulk' | 'option3_gateway';

export const AgentObservabilityPolicyModal: React.FC<Props> = ({
  isOpen,
  onClose,
  projectId,
  projectNumber,
  activeDatasetId: _activeDatasetId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<TabType>('coverage');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Option 2 Sweep state
  const [engines, setEngines] = useState<AppEngine[]>([]);
  const [selectedEngineId, setSelectedEngineId] = useState<string>('');
  const [selectedLocation, setSelectedLocation] = useState<string>('global');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoadingEngines, setIsLoadingEngines] = useState(false);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const [isSweeping, setIsSweeping] = useState(false);
  const [sweepResult, setSweepResult] = useState<BulkObservabilityResult | null>(null);
  const [includeSensitive, setIncludeSensitive] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useModalA11y({
    isOpen,
    onClose,
    containerRef,
    preventClose: isSweeping,
  });

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Fetch engines when Option 2 is opened
  useEffect(() => {
    if (!isOpen || activeTab !== 'option2_bulk' || !projectId) return;

    let isMounted = true;
    const fetchEngines = async () => {
      setIsLoadingEngines(true);
      setErrorMessage(null);
      try {
        const config: Config = {
          projectId,
          appLocation: selectedLocation,
          collectionId: 'default_collection',
          appId: '',
          assistantId: 'default_assistant',
        };
        const res = await api.listResources('engines', config);
        if (isMounted) {
          const list = res.engines || [];
          setEngines(list);
          if (list.length > 0 && !selectedEngineId) {
            const firstId = list[0].name.split('/').pop() || '';
            setSelectedEngineId(firstId);
          }
        }
      } catch (err) {
        if (isMounted) {
          setErrorMessage(`Failed to load app engines: ${toErrorMessage(err)}`);
        }
      } finally {
        if (isMounted) setIsLoadingEngines(false);
      }
    };

    fetchEngines();
    return () => {
      isMounted = false;
    };
  }, [isOpen, activeTab, projectId, selectedLocation, selectedEngineId]);

  // Fetch agents when an engine is selected
  useEffect(() => {
    if (!isOpen || activeTab !== 'option2_bulk' || !projectId || !selectedEngineId) {
      setAgents([]);
      return;
    }

    let isMounted = true;
    const fetchAgents = async () => {
      setIsLoadingAgents(true);
      setErrorMessage(null);
      setSweepResult(null);
      try {
        const config: Config = {
          projectId,
          appLocation: selectedLocation,
          collectionId: 'default_collection',
          appId: selectedEngineId,
          assistantId: 'default_assistant',
        };
        const res = await api.listResources('agents', config);
        const baseAgents = res.agents || [];

        // Enrich with getAgent to ensure observabilityConfig is populated
        const enriched = await Promise.all(
          baseAgents.map(async (a) => {
            try {
              return await api.getAgent(a.name, config);
            } catch {
              return a;
            }
          }),
        );

        if (isMounted) {
          setAgents(enriched);
        }
      } catch (err) {
        if (isMounted) {
          setErrorMessage(`Failed to load agents for engine ${selectedEngineId}: ${toErrorMessage(err)}`);
        }
      } finally {
        if (isMounted) setIsLoadingAgents(false);
      }
    };

    fetchAgents();
    return () => {
      isMounted = false;
    };
  }, [isOpen, activeTab, projectId, selectedEngineId, selectedLocation]);

  const handleRunSweep = async () => {
    if (agents.length === 0) return;
    setIsSweeping(true);
    setErrorMessage(null);
    setSweepResult(null);

    const config: Config = {
      projectId,
      appLocation: selectedLocation,
      collectionId: 'default_collection',
      appId: selectedEngineId,
      assistantId: 'default_assistant',
    };

    try {
      const result = await api.bulkEnforceAgentsObservability(agents, config, {
        observabilityEnabled: true,
        sensitiveLoggingEnabled: includeSensitive,
      });
      setSweepResult(result);

      // Refresh agents to reflect changes
      const res = await api.listResources('agents', config);
      const baseAgents = res.agents || [];
      const enriched = await Promise.all(
        baseAgents.map(async (a) => {
          try {
            return await api.getAgent(a.name, config);
          } catch {
            return a;
          }
        }),
      );
      setAgents(enriched);
    } catch (err) {
      setErrorMessage(`Bulk enforcement failed: ${toErrorMessage(err)}`);
    } finally {
      setIsSweeping(false);
    }
  };

  const monitoredAgentsCount = agents.filter(
    (a) => a.observabilityConfig?.observabilityEnabled,
  ).length;

  // Terraform Snippet
  const terraformSnippet = `# ==============================================================================
# Gemini Enterprise: Automated Agent Observability Policy Enforcer
# Triggers on discoveryengine.googleapis.com/CreateAgent and enforces OpenTelemetry
# ==============================================================================

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.0.0"
    }
  }
}

variable "project_id" {
  type        = string
  description = "Google Cloud Project ID"
  default     = "${projectId || 'YOUR_PROJECT_ID'}"
}

variable "region" {
  type        = string
  description = "Region for Eventarc and Cloud Function"
  default     = "us-central1"
}

# 1. Service Account for Cloud Function
resource "google_service_account" "agent_observability_sa" {
  project      = var.project_id
  account_id   = "ge-agent-observability-enforcer"
  display_name = "Gemini Enterprise Agent Observability Auto-Enforcer"
}

# Grant Discovery Engine Admin to patch agent observabilityConfig
resource "google_project_iam_member" "discovery_admin" {
  project = var.project_id
  role    = "roles/discoveryengine.admin"
  member  = "serviceAccount:\${google_service_account.agent_observability_sa.email}"
}

# Grant Event Receiver role
resource "google_project_iam_member" "eventarc_receiver" {
  project = var.project_id
  role    = "roles/eventarc.eventReceiver"
  member  = "serviceAccount:\${google_service_account.agent_observability_sa.email}"
}

# 2. Storage Bucket for Function Source
resource "google_storage_bucket" "function_bucket" {
  project                     = var.project_id
  name                        = "\${var.project_id}-ge-telemetry-fn-source"
  location                    = var.region
  uniform_bucket_level_access = true
}

# 3. Cloud Function (Gen 2) Auto-Patcher
resource "google_cloudfunctions2_function" "auto_enabler" {
  project     = var.project_id
  name        = "ge-auto-enable-agent-observability"
  location    = var.region
  description = "Automatically enables OpenTelemetry & prompt logging on new no-code agents"

  build_config {
    runtime     = "python311"
    entry_point = "on_agent_created"
    source {
      storage_source {
        bucket = google_storage_bucket.function_bucket.name
        object = "source.zip"
      }
    }
  }

  service_config {
    max_instance_count    = 5
    available_memory      = "256M"
    timeout_seconds       = 60
    service_account_email = google_service_account.agent_observability_sa.email
  }

  event_trigger {
    trigger_region        = var.region
    event_type            = "google.cloud.audit.log.v1.written"
    service_account_email = google_service_account.agent_observability_sa.email
    retry_policy          = "RETRY_POLICY_RETRY"
    matching_criteria {
      attribute = "serviceName"
      value     = "discoveryengine.googleapis.com"
    }
    matching_criteria {
      attribute = "methodName"
      value     = "google.cloud.discoveryengine.v1alpha.AgentService.CreateAgent"
    }
  }
}
`;

  // Python Cloud Function Snippet
  const pythonSnippet = `"""
main.py - Cloud Function (Gen 2)
Listens for Eventarc Cloud Audit Log CreateAgent events and immediately PATCHes
the agent's observabilityConfig to enable OpenTelemetry and prompt logging.
"""
import functions_framework
import json
import logging
import urllib.request
import google.auth
import google.auth.transport.requests

logging.basicConfig(level=logging.INFO)

@functions_framework.cloud_event
def on_agent_created(cloud_event):
    data = cloud_event.data
    proto_payload = data.get("protoPayload", {})
    resource_name = proto_payload.get("resourceName", "")

    logging.info(f"Received CreateAgent event for resource: {resource_name}")
    if not resource_name or "/agents/" not in resource_name:
        logging.warning("Resource name does not appear to be an agent path; skipping.")
        return

    # Extract location for regional endpoints
    # Resource format: projects/{project}/locations/{location}/collections/{col}/engines/{engine}/assistants/{asst}/agents/{agent}
    parts = resource_name.split("/")
    location = "global"
    if "locations" in parts:
      idx = parts.index("locations")
      if idx + 1 < len(parts):
          location = parts[idx + 1]

    base_url = "https://discoveryengine.googleapis.com" if location == "global" else f"https://{location}-discoveryengine.googleapis.com"
    url = f"{base_url}/v1alpha/{resource_name}?updateMask=observabilityConfig"

    # Acquire GCP OAuth2 credentials
    credentials, project_id = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    auth_req = google.auth.transport.requests.Request()
    credentials.refresh(auth_req)
    token = credentials.token

    payload = {
        "observabilityConfig": {
            "observabilityEnabled": True,
            "sensitiveLoggingEnabled": True
        }
    }
    data_bytes = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=data_bytes,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        },
        method="PATCH"
    )

    try:
        with urllib.request.urlopen(req) as response:
            resp_body = response.read().decode("utf-8")
            logging.info(f"Successfully enabled observability on {resource_name}: {response.status}")
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        logging.error(f"Failed to patch observability on {resource_name}: {e.code} - {error_body}")
        raise
`;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agent-obs-policy-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSweeping) onClose();
      }}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-6 bg-gray-850 border-b border-gray-800 flex justify-between items-start gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-lg bg-blue-950/80 border border-blue-700/60 text-blue-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10c0-1.718-.433-3.333-1.2-4.782" />
                </svg>
              </span>
              <div>
                <h2 id="agent-obs-policy-title" className="text-xl font-bold text-white tracking-tight">
                  Agent Observability Policy & Telemetry Governance
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Understand log coverage boundaries (App vs Agent) and automate OpenTelemetry across all no-code agents.
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSweeping}
            className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 transition-colors"
            title="Close modal"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Tabs */}
        <div className="flex border-b border-gray-800 bg-gray-900/60 px-6 gap-2">
          {[
            { id: 'coverage', label: '1. Coverage Gap (App vs Agent)', badge: 'Critical' },
            { id: 'option1_eventarc', label: 'Option 1: Eventarc Auto-Enabler', badge: 'Best Practice' },
            { id: 'option2_bulk', label: 'Option 2: Bulk Sweep in Manager', badge: 'Interactive' },
            { id: 'option3_gateway', label: 'Option 3: Agent Gateway Governance', badge: 'Strategic' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`py-3.5 px-3.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400 bg-blue-950/20'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-700'
              }`}
            >
              <span>{tab.label}</span>
              {tab.badge && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                    tab.badge === 'Critical'
                      ? 'bg-amber-950/80 text-amber-300 border border-amber-700/60'
                      : tab.badge === 'Best Practice'
                      ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60'
                      : tab.badge === 'Interactive'
                      ? 'bg-blue-950/80 text-blue-300 border border-blue-700/60'
                      : 'bg-purple-950/80 text-purple-300 border border-purple-700/60'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm text-gray-300 custom-scrollbar">
          {/* TAB 1: COVERAGE GAP */}
          {activeTab === 'coverage' && (
            <div className="space-y-6">
              {/* Core Alert Banner */}
              <div className="p-4 bg-amber-950/40 border border-amber-800/80 rounded-xl space-y-3">
                <div className="flex items-center gap-2.5 text-amber-300 font-bold text-sm">
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>The Google Cloud Console Observability Default Reality</span>
                </div>
                <p className="text-xs leading-relaxed text-amber-200/90">
                  <strong>Out of the box in the Google Cloud Console today, there is no native checkbox or Org Policy</strong> that says <em>&quot;automatically enable OpenTelemetry on all newly created no-code agents in this app.&quot;</em>
                </p>
                <p className="text-xs leading-relaxed text-amber-200/90">
                  Because Google treats prompt logging and trace billing as distinct consent/cost boundaries, <strong>every newly created agent starts with its telemetry flags set to <code className="bg-black/50 px-1 py-0.5 rounded font-mono text-white">false</code></strong>.
                </p>
              </div>

              {/* 2-Tier Coverage Architecture Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Tier 1: App Level */}
                <div className="p-4 rounded-xl border border-blue-800/60 bg-blue-950/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">Tier 1: App / Engine Layer</span>
                    <span className="text-xs font-extrabold px-2 py-0.5 rounded bg-blue-900/80 text-blue-200 border border-blue-700/60">
                      ~65% of Total Logs
                    </span>
                  </div>
                  <h4 className="text-base font-semibold text-white">Assistant Front-Door Logging</h4>
                  <p className="text-xs text-gray-300 leading-relaxed">
                    Captured when <code className="text-blue-300 font-mono">observabilityConfig</code> is enabled on the <strong>App Engine</strong> itself.
                  </p>
                  <div className="space-y-1.5 pt-2 text-xs">
                    <div className="text-gray-400 font-medium">What is captured:</div>
                    <ul className="list-disc list-inside space-y-1 text-gray-300 pl-1">
                      <li>Top-level user chat prompts (<code className="font-mono text-green-300 text-[11px]">StreamAssist</code>, <code className="font-mono text-green-300 text-[11px]">Assist</code>)</li>
                      <li>Enterprise search queries & grounding filters (<code className="font-mono text-green-300 text-[11px]">Search</code>)</li>
                      <li>Session IDs, user emails, and interaction timestamps</li>
                      <li>Cloud Audit logs (<code className="font-mono text-green-300 text-[11px]">WriteUserEvent</code>)</li>
                    </ul>
                  </div>
                  <div className="text-[11px] text-gray-400 bg-gray-900/60 p-2.5 rounded border border-gray-800">
                    <strong>BigQuery Destination:</strong> <code className="text-green-400 font-mono">gemini_enterprise_user_activity</code>
                  </div>
                </div>

                {/* Tier 2: Agent Level */}
                <div className="p-4 rounded-xl border border-purple-800/60 bg-purple-950/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">Tier 2: Agent Layer</span>
                    <span className="text-xs font-extrabold px-2 py-0.5 rounded bg-purple-900/80 text-purple-200 border border-purple-700/60">
                      ~35% Missing Blindspot
                    </span>
                  </div>
                  <h4 className="text-base font-semibold text-white">Agent OpenTelemetry & Traces</h4>
                  <p className="text-xs text-gray-300 leading-relaxed">
                    <strong>SILENCED BY DEFAULT:</strong> Only captured when the individual <strong>Agent&apos;s</strong> <code className="text-purple-300 font-mono">observabilityConfig</code> is explicitly patched to true.
                  </p>
                  <div className="space-y-1.5 pt-2 text-xs">
                    <div className="text-gray-400 font-medium">What is missing without Agent Telemetry:</div>
                    <ul className="list-disc list-inside space-y-1 text-purple-200/80 pl-1">
                      <li>Sub-agent multi-turn reasoning steps & LLM calls</li>
                      <li>Tool calling execution, input parameters & returned outputs</li>
                      <li>Agent-to-agent delegation latency & trace spans</li>
                      <li>Model Armor evaluation results inside specific agents</li>
                    </ul>
                  </div>
                  <div className="text-[11px] text-gray-400 bg-gray-900/60 p-2.5 rounded border border-gray-800">
                    <strong>BigQuery Destination:</strong> <code className="text-green-400 font-mono">discoveryengine_googleapis_com_gen_ai_*</code>
                  </div>
                </div>
              </div>

              {/* Customer Blast Radius Box */}
              <div className="bg-gray-850 p-4 rounded-xl border border-gray-700 space-y-3">
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <span className="text-red-400">●</span>
                  Customer Blast Radius & Dashboard Impact
                </h4>
                <p className="text-xs text-gray-300 leading-relaxed">
                  If an enterprise enables App-Level observability but leaves Agent-Level observability disabled:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 bg-gray-900 rounded-lg border border-gray-800">
                    <strong className="text-white block mb-1">Missing GenAI Tables</strong>
                    <span className="text-gray-400">The 4 BigQuery core tables (<code className="font-mono text-green-300 text-[10px]">gen_ai.*</code>) will have zero rows or only top-level assistant fallback entries.</span>
                  </div>
                  <div className="p-3 bg-gray-900 rounded-lg border border-gray-800">
                    <strong className="text-white block mb-1">Zero Tool Execution Tracing</strong>
                    <span className="text-gray-400">Admins cannot inspect which database queries or APIs failed during autonomous sub-agent execution.</span>
                  </div>
                  <div className="p-3 bg-gray-900 rounded-lg border border-gray-800">
                    <strong className="text-white block mb-1">Invisible Prompt Leakage</strong>
                    <span className="text-gray-400">Prompt security evaluations and Model Armor triggers inside custom agents remain completely unlogged.</span>
                  </div>
                </div>
              </div>

              {/* Action buttons leading to the 3 options */}
              <div className="flex justify-between items-center p-4 bg-gray-900/80 rounded-xl border border-gray-800 flex-wrap gap-3">
                <span className="text-xs text-gray-400">
                  Ready to solve this? Choose how you want to enforce compliance:
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('option1_eventarc')}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
                  >
                    View Option 1 (Eventarc) →
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('option2_bulk')}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
                  >
                    Run Option 2 (Manager Sweep) →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: OPTION 1 - EVENTARC AUTO-ENABLER */}
          {activeTab === 'option1_eventarc' && (
            <div className="space-y-6">
              <div className="border border-emerald-800/60 bg-emerald-950/20 p-4 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-emerald-300 flex items-center gap-2">
                    <span>Option 1: The Eventarc Auto-Enabler</span>
                    <span className="text-[10px] bg-emerald-900/80 text-emerald-200 px-2 py-0.5 rounded border border-emerald-600">
                      Best Practice — 100% Automated
                    </span>
                  </h3>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  Whenever any user creates a new no-code agent in the Gemini Enterprise UI, Cloud Audit Logs emits an event. An Eventarc trigger intercepts that event and invokes a lightweight Cloud Function to instantly PATCH <code className="font-mono text-emerald-300">observabilityConfig</code> to ON.
                </p>
              </div>

              {/* Architecture Diagram */}
              <div className="bg-gray-950 p-4 rounded-xl border border-gray-800 space-y-2">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Event-Driven Policy Flow</div>
                <div className="p-3 bg-gray-900 rounded-lg font-mono text-xs text-blue-300 flex flex-col sm:flex-row items-center justify-between gap-2 text-center">
                  <div className="p-2 bg-gray-800 rounded border border-gray-700 w-full sm:w-auto">
                    User Creates Agent<br /><span className="text-[10px] text-gray-400">Gemini Enterprise UI</span>
                  </div>
                  <span className="text-gray-500">➔</span>
                  <div className="p-2 bg-gray-800 rounded border border-gray-700 w-full sm:w-auto">
                    Cloud Audit Log<br /><span className="text-[10px] text-yellow-400">CreateAgent</span>
                  </div>
                  <span className="text-gray-500">➔</span>
                  <div className="p-2 bg-gray-800 rounded border border-gray-700 w-full sm:w-auto">
                    Eventarc Trigger<br /><span className="text-[10px] text-emerald-400">discoveryengine</span>
                  </div>
                  <span className="text-gray-500">➔</span>
                  <div className="p-2 bg-gray-800 rounded border border-gray-700 w-full sm:w-auto">
                    Cloud Function<br /><span className="text-[10px] text-purple-400">PATCH agent API</span>
                  </div>
                  <span className="text-gray-500">➔</span>
                  <div className="p-2 bg-emerald-950/60 rounded border border-emerald-700 text-emerald-300 w-full sm:w-auto">
                    Agent Telemetry: ON<br /><span className="text-[10px] text-emerald-400">100% Monitored</span>
                  </div>
                </div>
              </div>

              {/* Copyable Terraform Code */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">1. Terraform Deployment Manifest</span>
                    <span className="text-[11px] text-gray-500 font-mono">eventarc_agent_observability.tf</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(terraformSnippet, 'terraform')}
                    className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-xs font-mono text-blue-400 hover:text-blue-300 rounded border border-gray-700 transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span>{copiedKey === 'terraform' ? 'Copied!' : 'Copy Terraform'}</span>
                  </button>
                </div>
                <pre className="bg-gray-950 p-3.5 rounded-lg border border-gray-800 text-xs text-gray-300 font-mono max-h-56 overflow-y-auto leading-relaxed">
                  {terraformSnippet}
                </pre>
              </div>

              {/* Copyable Python Function Code */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">2. Cloud Function Implementation</span>
                    <span className="text-[11px] text-gray-500 font-mono">main.py (Python 3.11)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(pythonSnippet, 'python')}
                    className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-xs font-mono text-blue-400 hover:text-blue-300 rounded border border-gray-700 transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span>{copiedKey === 'python' ? 'Copied!' : 'Copy Python'}</span>
                  </button>
                </div>
                <pre className="bg-gray-950 p-3.5 rounded-lg border border-gray-800 text-xs text-gray-300 font-mono max-h-56 overflow-y-auto leading-relaxed">
                  {pythonSnippet}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 3: OPTION 2 - BULK SWEEP IN GEM */}
          {activeTab === 'option2_bulk' && (
            <div className="space-y-6">
              <div className="border border-blue-800/60 bg-blue-950/20 p-4 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-blue-300 flex items-center gap-2">
                    <span>Option 2: Bulk Sweep & Policy Enforcement via Manager</span>
                    <span className="text-[10px] bg-blue-900/80 text-blue-200 px-2 py-0.5 rounded border border-blue-600">
                      Live Remediation
                    </span>
                  </h3>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  Perform an administrative sweep directly from this console. Select an App Engine below to inspect all child agents and batch-patch any non-compliant agents where <code className="font-mono text-blue-300">observabilityEnabled === false</code>.
                </p>
              </div>

              {/* Engine Selector & Controls */}
              <div className="p-4 bg-gray-850 rounded-xl border border-gray-700 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                      Target Location
                    </label>
                    <select
                      value={selectedLocation}
                      onChange={(e) => setSelectedLocation(e.target.value)}
                      disabled={isSweeping}
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="global">global</option>
                      <option value="us">us</option>
                      <option value="eu">eu</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                      Target App Engine
                    </label>
                    <select
                      value={selectedEngineId}
                      onChange={(e) => setSelectedEngineId(e.target.value)}
                      disabled={isSweeping || isLoadingEngines || engines.length === 0}
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    >
                      {isLoadingEngines ? (
                        <option>Loading engines...</option>
                      ) : engines.length === 0 ? (
                        <option>No engines found</option>
                      ) : (
                        engines.map((eng) => {
                          const id = eng.name.split('/').pop() || eng.name;
                          return (
                            <option key={eng.name} value={id}>
                              {eng.displayName || id} ({id})
                            </option>
                          );
                        })
                      )}
                    </select>
                  </div>
                </div>

                {/* Status Bar */}
                <div className="flex justify-between items-center pt-3 border-t border-gray-800 flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">Compliance Status:</span>
                    {isLoadingAgents ? (
                      <span className="text-xs text-blue-400 animate-pulse">Inspecting agents...</span>
                    ) : (
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                          agents.length > 0 && monitoredAgentsCount === agents.length
                            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
                            : 'bg-amber-950/80 text-amber-300 border-amber-700/60'
                        }`}
                      >
                        {monitoredAgentsCount} / {agents.length} Agents Telemetry Enabled
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeSensitive}
                        onChange={(e) => setIncludeSensitive(e.target.checked)}
                        disabled={isSweeping}
                        className="h-3.5 w-3.5 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                      />
                      <span>Include Sensitive Prompts</span>
                    </label>

                    <button
                      type="button"
                      onClick={handleRunSweep}
                      disabled={isSweeping || isLoadingAgents || agents.length === 0}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-all shadow-md flex items-center gap-2"
                    >
                      {isSweeping ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Patching Agents...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          <span>Enforce Telemetry on All Non-Compliant Agents</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Sweep Feedback Banner */}
                {sweepResult && (
                  <div
                    className={`p-4 rounded-xl border space-y-3 text-xs ${
                      sweepResult.failed === 0
                        ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
                        : sweepResult.updated > 0
                        ? 'bg-amber-950/40 border-amber-800/80 text-amber-200'
                        : 'bg-red-950/40 border-red-800/80 text-red-200'
                    }`}
                  >
                    <div className="font-bold flex items-center justify-between flex-wrap gap-2">
                      <span className="flex items-center gap-2 text-sm">
                        {sweepResult.failed === 0 ? (
                          <>
                            <span className="text-emerald-400 font-bold">✓</span>
                            <span>Enforcement Sweep Completed Successfully!</span>
                          </>
                        ) : (
                          <>
                            <span className="text-amber-400 font-bold">⚠️</span>
                            <span>
                              {sweepResult.updated > 0
                                ? 'Enforcement Sweep Completed with Warnings'
                                : 'Enforcement Sweep Failed'}
                            </span>
                          </>
                        )}
                      </span>
                      <span className="font-mono text-[11px] px-2.5 py-0.5 rounded bg-gray-900/80 border border-gray-700 text-gray-300">
                        {sweepResult.updated} Patched · {sweepResult.alreadyCompliant} Compliant · {sweepResult.failed} Failed
                      </span>
                    </div>

                    <div className="text-gray-300 leading-relaxed">
                      Patched <strong>{sweepResult.updated}</strong> agent(s) to enforce OpenTelemetry.
                      {' '}<strong>{sweepResult.alreadyCompliant}</strong> agent(s) were already compliant.
                    </div>

                    {sweepResult.failed > 0 && (
                      <div className="space-y-2 pt-2 border-t border-gray-800/60">
                        <div className="font-semibold text-red-300 flex items-center gap-1.5">
                          <span>Failed Updates ({sweepResult.failed}):</span>
                        </div>
                        <ul className="space-y-1.5 list-disc list-inside text-gray-300">
                          {sweepResult.errors.map((err, idx) => (
                            <li key={idx} className="font-mono text-[11px] bg-gray-950/70 p-2 rounded border border-gray-800/80 text-red-300 leading-relaxed">
                              {err}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Google Cloud API Legacy Schema Advisory */}
                    {Boolean(
                      sweepResult.legacyAuthCount ||
                      sweepResult.errors.some((e) => e.includes('Legacy Schema') || e.includes('authorizations'))
                    ) && (
                      <div className="p-3.5 bg-amber-950/70 border border-amber-600/80 rounded-lg text-amber-200 space-y-2">
                        <div className="flex items-center gap-2 font-bold text-amber-300 text-xs">
                          <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <span>Google Cloud Discovery Engine API Constraint: Legacy Agent Schema</span>
                        </div>
                        <p className="text-[11px] text-amber-100 leading-relaxed">
                          These agents were provisioned under a legacy schema using the deprecated <code className="font-mono bg-amber-900/60 px-1 py-0.5 rounded text-amber-200">agent.authorizations</code> protobuf field. The Google Cloud backend rejects in-place updates to these agents because <code className="font-mono bg-amber-900/60 px-1 py-0.5 rounded text-amber-200">authorizations</code> is immutable and must be replaced with <code className="font-mono bg-amber-900/60 px-1 py-0.5 rounded text-amber-200">authorizationConfig</code>.
                        </p>
                        <div className="text-[11px] font-semibold text-amber-300">Migration & Remediation Steps:</div>
                        <ol className="list-decimal list-inside space-y-1 text-[11px] text-amber-100/90 pl-1">
                          <li>Export the agent configuration as JSON using the Download button in the Assistant Agent list.</li>
                          <li>Create a new agent with the exported configuration (Gemini Enterprise Manager will automatically apply modern <code className="font-mono text-amber-300">authorizationConfig</code>).</li>
                          <li>Retire the legacy agent once traffic has transitioned to achieve 100% telemetry compliance.</li>
                        </ol>
                      </div>
                    )}
                  </div>
                )}

                {errorMessage && (
                  <div className="p-3 bg-red-950/40 border border-red-800/80 rounded-lg text-xs text-red-300">
                    {errorMessage}
                  </div>
                )}
              </div>

              {/* Agents Live List */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Discovered Agents ({agents.length})
                </div>
                {agents.length === 0 && !isLoadingAgents ? (
                  <p className="text-xs text-gray-500 italic p-4 bg-gray-850 rounded-lg border border-gray-800 text-center">
                    No agents registered under this engine.
                  </p>
                ) : (
                  <div className="overflow-x-auto border border-gray-800 rounded-lg">
                    <table className="min-w-full divide-y divide-gray-800 text-xs">
                      <thead className="bg-gray-800/70 text-gray-400">
                        <tr>
                          <th className="px-4 py-2.5 text-left font-semibold">Display Name</th>
                          <th className="px-4 py-2.5 text-left font-semibold">Agent ID</th>
                          <th className="px-4 py-2.5 text-left font-semibold">Telemetry Status</th>
                          <th className="px-4 py-2.5 text-left font-semibold">Sensitive Logs</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800 bg-gray-900/50">
                        {agents.map((agent) => {
                          const isObsEnabled = Boolean(agent.observabilityConfig?.observabilityEnabled);
                          const isSensEnabled = Boolean(agent.observabilityConfig?.sensitiveLoggingEnabled);
                          const hasLegacyAuth = Boolean(agent.authorizations && agent.authorizations.length > 0);
                          const id = agent.name.split('/').pop() || agent.name;
                          return (
                            <tr key={agent.name} className="hover:bg-gray-850 transition-colors">
                              <td className="px-4 py-2.5 text-white font-medium">
                                <div className="flex items-center gap-2">
                                  <span>{agent.displayName || id}</span>
                                  {hasLegacyAuth && (
                                    <span
                                      className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-950/90 text-amber-300 border border-amber-700/70"
                                      title="Uses legacy agent.authorizations schema. In-place updates rejected by Google Cloud Discovery Engine API."
                                    >
                                      Legacy Schema
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-2.5 font-mono text-gray-400">{id}</td>
                              <td className="px-4 py-2.5">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                    isObsEnabled
                                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                                      : hasLegacyAuth
                                      ? 'bg-amber-950 text-amber-300 border border-amber-700/60'
                                      : 'bg-red-950 text-red-300 border border-red-700/60'
                                  }`}
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      isObsEnabled
                                        ? 'bg-emerald-400'
                                        : hasLegacyAuth
                                        ? 'bg-amber-400'
                                        : 'bg-red-400'
                                    }`}
                                  ></span>
                                  {isObsEnabled ? 'ON' : hasLegacyAuth ? 'OFF (Legacy Blocked)' : 'OFF (Blindspot)'}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-gray-400 font-mono">
                                {isSensEnabled ? (
                                  <span className="text-emerald-400 font-semibold">Enabled</span>
                                ) : (
                                  <span className="text-gray-500">Disabled</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: OPTION 3 - AGENT GATEWAY GOVERNANCE */}
          {activeTab === 'option3_gateway' && (
            <div className="space-y-6">
              <div className="border border-purple-800/60 bg-purple-950/20 p-4 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-purple-300 flex items-center gap-2">
                    <span>Option 3: Agent Gateway Governance</span>
                    <span className="text-[10px] bg-purple-900/80 text-purple-200 px-2 py-0.5 rounded border border-purple-600">
                      Google&apos;s Strategic Path
                    </span>
                  </h3>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  Centralized policy enforcement via the <strong>Agent Registry & Agent Gateway</strong>.
                </p>
              </div>

              {/* Console Banner Quote */}
              <div className="p-4 bg-gray-950 rounded-xl border border-gray-800 space-y-2">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Console Banner Reference</div>
                <blockquote className="border-l-4 border-blue-500 pl-4 py-1 text-xs italic text-gray-300 leading-relaxed">
                  &quot;This agent is not integrated with Agent Registry and Gateway policies will not be applied. To apply Gateway policies, publish this agent to the Agent Registry and route traffic to the agent through Gateway.&quot;
                </blockquote>
              </div>

              {/* Architecture comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-gray-800 bg-gray-850 space-y-2.5">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Fragmented Per-Agent Telemetry</h4>
                  <p className="text-xs text-gray-300 leading-relaxed">
                    Admins must maintain telemetry toggles, rate limits, and safety filters individually on each of 50+ no-code agents.
                  </p>
                  <ul className="text-xs text-gray-400 list-disc list-inside space-y-1">
                    <li>Requires continuous reconciliation sweeps</li>
                    <li>Prone to developer oversight on new agent creation</li>
                    <li>Audit configurations live inside agent manifests</li>
                  </ul>
                </div>

                <div className="p-4 rounded-xl border border-purple-800/60 bg-purple-950/20 space-y-2.5">
                  <h4 className="text-xs font-bold text-purple-300 uppercase tracking-wider">Centralized Gateway Routing</h4>
                  <p className="text-xs text-gray-300 leading-relaxed">
                    Agents are published to the <strong>Agent Registry</strong>. Traffic routes through an <strong>Agent Gateway</strong> that enforces global observability policies.
                  </p>
                  <ul className="text-xs text-purple-200/80 list-disc list-inside space-y-1">
                    <li>Unified Cloud Trace spans across all agents globally</li>
                    <li>Model Armor and security rules applied at proxy layer</li>
                    <li>Creator telemetry settings completely abstracted away</li>
                  </ul>
                </div>
              </div>

              <div className="p-4 bg-gray-850 rounded-xl border border-gray-700 space-y-2 text-xs">
                <div className="font-semibold text-white">Summary Recommendation for Enterprise Architects:</div>
                <ol className="list-decimal list-inside space-y-1.5 text-gray-300 pl-1 leading-relaxed">
                  <li>
                    <strong>Immediate Protection (Today):</strong> Deploy the <strong>Eventarc Auto-Patcher (Option 1)</strong> to guarantee 100% compliance the moment any no-code agent is created.
                  </li>
                  <li>
                    <strong>On-Demand Audit:</strong> Use the <strong>GEM Sweep Tool (Option 2)</strong> periodically to verify legacy or pre-existing agents.
                  </li>
                  <li>
                    <strong>Strategic Governance:</strong> Migrate high-traffic production agents to the <strong>Agent Registry & Gateway (Option 3)</strong>.
                  </li>
                </ol>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-gray-850 border-t border-gray-800 flex justify-between items-center">
          <div className="text-[11px] text-gray-400">
            Target Project: <code className="text-white font-mono">{projectId || projectNumber}</code>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSweeping}
            className="px-4 py-2 bg-gray-750 hover:bg-gray-700 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            Close Hub
          </button>
        </div>
      </div>
    </div>
  );
};
