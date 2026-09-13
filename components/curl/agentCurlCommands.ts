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

import { Page } from '../../types';
import { CurlInfoMap } from './types';

export const AGENT_CURL_COMMANDS: CurlInfoMap = {
  [Page.SKILLS_REGISTRY]: {
    description: "These are the REST API calls for managing skills and revisions in the Google Cloud Agent Platform Skills Registry (agentregistry.googleapis.com), and deploying skills to Gemini Enterprise assistant engines.",
    commands: [
      {
        title: 'List Skills in Registry',
        command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://agentregistry.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/skills"`
      },
      {
        title: 'Publish / Create Skill with ZIP Bundle',
        command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  -d '{
        "displayName": "IT Incident Postmortem",
        "description": "Generates structured IT incident postmortem reports.",
        "source": {
          "inlineSource": {
            "archive": "[BASE64_ENCODED_ZIP_CONTAINING_SKILL_MD]"
          }
        }
      }' \\
  "https://agentregistry.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/skills?skillId=[SKILL_ID]"`
      },
      {
        title: 'List Skill Revisions',
        command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://agentregistry.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/skills/[SKILL_ID]/revisions"`
      },
      {
        title: 'Activate Skill in Company Catalog',
        command: `curl -X PATCH \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  -d '{
        "targetState": "TARGET_STATE_ACTIVE",
        "defaultRevision": "projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/skills/[SKILL_ID]/revisions/[REVISION_ID]"
      }' \\
  "https://agentregistry.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/skills/[SKILL_ID]?updateMask=default_revision,target_state"`
      },
      {
        title: 'Deploy Skill to Gemini Enterprise Engine Assistant',
        command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  -d '{
        "displayName": "IT Incident Postmortem",
        "description": "Generates structured IT incident postmortem reports.",
        "state": "ENABLED",
        "sharingConfig": { "scope": "ALL_USERS" },
        "skillAgentDefinition": {
          "instruction": "Generates structured IT incident postmortem reports."
        }
      }' \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/default_collection/engines/[ENGINE_ID]/assistants/default_assistant/agents?agentId=[SKILL_ID]"`
      },
      {
        title: 'Delete Skill from Registry',
        command: `curl -X DELETE \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://agentregistry.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/skills/[SKILL_ID]"`
      }
    ]
  },
  [Page.AGENTS]: {
    description: "These are the underlying REST API calls for managing agents and their security. They interact with the v1alpha Discovery Engine API.",
    commands: [
      {
        title: 'List Agents',
        command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]/assistants/[ASSISTANT_ID]/agents"`
      },
      {
        title: 'Create an ADK Agent',
        command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  -d '{
        "displayName": "My API Agent",
        "adkAgentDefinition": {
          "tool_settings": { "tool_description": "A tool that can call APIs." },
          "provisioned_reasoning_engine": {
            "reasoning_engine": "projects/[YOUR_PROJECT_ID]/locations/[RE_LOCATION]/reasoningEngines/[RE_ID]"
          }
        }
      }' \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]/assistants/[ASSISTANT_ID]/agents?agentId=[OPTIONAL_AGENT_ID]"`
      },
      {
        title: 'Get Agent View',
        command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]/assistants/[ASSISTANT_ID]/agents/[AGENT_ID]:getAgentView"`
      },
      {
        title: 'Get IAM Policy',
        command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]/assistants/[ASSISTANT_ID]/agents/[AGENT_ID]:getIamPolicy"`
      },
      {
        title: 'Set IAM Policy',
        command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  -d '{
        "policy": {
          "bindings": [
            {
              "role": "roles/discoveryengine.agentUser",
              "members": ["user:someone@example.com"]
            }
          ],
          "etag": "BwZ..."
        }
      }' \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]/assistants/[ASSISTANT_ID]/agents/[AGENT_ID]:setIamPolicy"`
      },
      {
        title: 'Enable Agent',
        command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]/assistants/[ASSISTANT_ID]/agents/[AGENT_ID]:enableAgent"`
      },
      {
        title: 'Disable Agent',
        command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]/assistants/[ASSISTANT_ID]/agents/[AGENT_ID]:disableAgent"`
      },
      {
        title: 'Delete Agent',
        command: `curl -X DELETE \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]/assistants/[ASSISTANT_ID]/agents/[AGENT_ID]"`
      }
    ]
  },
  [Page.AGENT_ENGINES]: {
    description: "These are the underlying REST API calls for discovering available agent backends (Agent Engines, Cloud Run Services, and Dialogflow Agents) and managing their lifecycles.",
    commands: [
      {
        title: 'List Agent Engines',
        command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[LOCATION]-aiplatform.googleapis.com/v1beta1/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/reasoningEngines"`
      },
      {
        title: 'List Cloud Run Services (A2A)',
        command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[LOCATION]-run.googleapis.com/v2/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/services"`
      },
      {
        title: 'List Dialogflow CX Agents',
        command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[LOCATION]-dialogflow.googleapis.com/v3/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/agents"`
      },
      {
        title: 'List Reasoning Engine Sessions',
        command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[LOCATION]-aiplatform.googleapis.com/v1beta1/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/reasoningEngines/[REASONING_ENGINE_ID]/sessions"`
      },
      {
        title: 'Delete Reasoning Engine Session',
        command: `curl -X DELETE \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[LOCATION]-aiplatform.googleapis.com/v1beta1/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/reasoningEngines/[REASONING_ENGINE_ID]/sessions/[SESSION_ID]"`
      },
      {
        title: 'Delete Agent Engine',
        command: `curl -X DELETE \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[LOCATION]-aiplatform.googleapis.com/v1beta1/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/reasoningEngines/[REASONING_ENGINE_ID]?force=true"`
      },
      {
        title: 'Delete Cloud Run Service',
        command: `curl -X DELETE \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[LOCATION]-run.googleapis.com/v2/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/services/[SERVICE_ID]"`
      }
    ]
  },
  [Page.AGENT_BUILDER]: {
    description: "The Agent Builder uses Cloud Build to package and deploy agents. It also lists Data Stores to help configure tools.",
    commands: [
      {
        title: 'Trigger Cloud Build (Deploy)',
        command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  -d '{
        "source": { "storageSource": { "bucket": "[STAGING_BUCKET]", "object": "source/agent.zip" } },
        "steps": [
          { "name": "python:3.10", "args": ["pip install ... && python deploy_re.py"] }
        ]
      }' \\
  "https://cloudbuild.googleapis.com/v1/projects/[YOUR_PROJECT_ID]/builds"`
      },
      {
        title: 'List Data Stores (for Tool Selection)',
        command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://discoveryengine.googleapis.com/v1beta/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/default_collection/dataStores"`
      },
      {
        title: 'List Storage Buckets',
        command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://storage.googleapis.com/storage/v1/b?project=[YOUR_PROJECT_ID]"`
      }
    ]
  },
  [Page.CLOUD_RUN_AGENTS]: {
    description: "This page lists and inspects Cloud Run services to identify potential agents using Gemini AI and labels. It uses the Cloud Run Admin API v2 and Vertex AI generating content endpoints.",
    commands: [
      {
        title: 'List Cloud Run Services',
        command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[LOCATION]-run.googleapis.com/v2/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/services"`
      },
      {
        title: 'Delete Cloud Run Service',
        command: `curl -X DELETE \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[LOCATION]-run.googleapis.com/v2/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/services/[SERVICE_NAME]"`
      },
      {
        title: 'Analyze Service (Gemini API)',
        command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -d '{
        "contents": [{
          "role": "user",
          "parts": [{"text": "You are an expert system analyzer. Analyze this Google Cloud Run service..."}]
        }]
      }' \\
  "https://[LOCATION]-aiplatform.googleapis.com/v1/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/publishers/google/models/gemini-2.5-flash:generateContent"`
      }
    ]
  },
  [Page.DIALOGFLOW_AGENTS]: {
    description: "This page lists, tests, and deletes Dialogflow CX agents using the Dialogflow API (v3).",
    commands: [
      {
        title: 'List Dialogflow Agents',
        command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[LOCATION]-dialogflow.googleapis.com/v3/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/agents"`
      },
      {
        title: 'Detect Intent (Test Agent)',
        command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -d '{
        "queryInput": {
          "text": {"text": "[YOUR_MESSAGE]"}
        }
      }' \\
  "https://[LOCATION]-dialogflow.googleapis.com/v3/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/agents/[AGENT_ID]/sessions/[SESSION_ID]:detectIntent"`
      },
      {
        title: 'Delete Agent',
        command: `curl -X DELETE \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[LOCATION]-dialogflow.googleapis.com/v3/[AGENT_NAME]"`
      }
    ]
  },
  [Page.MCP_SERVERS]: {
    description: "This page scans for Model Context Protocol (MCP) servers deployed on Cloud Run.",
    commands: [
      {
        title: 'List Cloud Run Services',
        command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[LOCATION]-run.googleapis.com/v2/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/services"`
      },
      {
        title: 'Get Service Details',
        command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[LOCATION]-run.googleapis.com/v2/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/services/[SERVICE_ID]"`
      }
    ]
  },
  [Page.A2A_TESTER]: {
    description: "The A2A Tester fetches the discovery card from a running Agent-to-Agent service and can directly invoke it using JSON-RPC 2.0.",
    commands: [
      {
        title: 'Test an A2A Agent (Discovery)',
        command: `# Generate the Access Token and make the request in one command.
curl -X GET \\
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \\
  "https://[YOUR_SERVICE_URL].run.app/.well-known/agent.json"`
      },
      {
        title: 'Invoke A2A Agent',
        command: `curl -X POST \\
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \\
  -H "Content-Type: application/json" \\
  -d '{
        "jsonrpc": "2.0",
        "method": "chat",
        "params": {
          "message": {
            "role": "user",
            "parts": [{"text": "Hello!"}]
          }
        },
        "id": "1"
      }' \\
  "https://[YOUR_SERVICE_URL].run.app/invoke"`
      }
    ]
  },
};
