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
import { Page } from '../types';

interface CurlInfoModalProps {
  infoKey: string;
  onClose: () => void;
}

const ALL_INFO: { [key: string]: { description: string; commands: { title: string; command: string }[] } } = {
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
    [Page.ASSISTANT]: {
        description: "These are the underlying REST API calls for managing the default assistant associated with a Gemini Enterprise Engine.",
        commands: [
            {
                title: 'Get Assistant Details',
                command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/default_collection/engines/[ENGINE_ID]/assistants/default_assistant"`
            },
            {
                title: 'Update Assistant',
                command: `curl -X PATCH \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  -d '{
        "displayName": "New Assistant Name",
        "generationConfig": {
            "systemInstruction": {
                "additionalSystemInstruction": "You are a helpful and funny assistant."
            }
        }
      }' \\
  "https://[LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/default_collection/engines/[ENGINE_ID]/assistants/default_assistant?updateMask=display_name,generation_config.system_instruction.additional_system_instruction"`
            },
            {
                title: 'Test Assistant (Streaming)',
                command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  -d '{
        "query": { "text": "Hello, what can you do?" }
      }' \\
  "https://[LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]/assistants/default_assistant:streamAssist"`
          },
          {
            title: 'List Engines (Configuration)',
            command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/default_collection/engines"`
          },
          {
            title: 'List Agents (Assistant Tab)',
            command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/default_collection/engines/[ENGINE_ID]/assistants/default_assistant/agents"`
          },
          {
            title: 'List Chat Sessions (History Tab)',
            command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]/sessions"`
          },
          {
            title: 'Get Turn Answer Details (History Tab)',
            command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]/sessions/[SESSION_ID]/answers/[ANSWER_ID]"`
          },
          {
            title: 'List BigQuery Datasets (Analytics Tab)',
            command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://bigquery.googleapis.com/bigquery/v2/projects/[YOUR_PROJECT_ID]/datasets"`
          },
          {
            title: 'List BigQuery Tables',
            command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://bigquery.googleapis.com/bigquery/v2/projects/[YOUR_PROJECT_ID]/datasets/[DATASET_ID]/tables"`
          },
          {
            title: 'Run Query (Analytics)',
            command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  -d '{ "query": "SELECT * FROM \`[YOUR_PROJECT_ID].[DATASET_ID].[TABLE_ID]\` LIMIT 50", "useLegacySql": false }' \\
  "https://bigquery.googleapis.com/bigquery/v2/projects/[YOUR_PROJECT_ID]/queries"`
          },
          {
            title: 'Update Engine Configuration',
            command: `curl -X PATCH \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  -d '{
        "displayName": "Updated Engine Name",
        "features": {
            "model-selector": "FEATURE_STATE_ON",
            "people-search": "FEATURE_STATE_OFF"
        },
        "modelConfigs": {
            "gemini-2.5-pro": "MODEL_ENABLED"
        }
      }' \\
  "https://[LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/default_collection/engines/[ENGINE_ID]?updateMask=display_name,features,model_configs"`
            }
        ]
    },
    [Page.AUTHORIZATIONS]: {
        description: "These are the underlying REST API calls for managing OAuth authorizations.",
        commands: [
            {
                title: 'List Authorizations',
                command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/authorizations"`
            },
            {
                title: 'Create an Authorization',
                command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  -d '{
        "serverSideOauth2": {
          "clientId": "[YOUR_OAUTH_CLIENT_ID]",
          "clientSecret": "[YOUR_OAUTH_CLIENT_SECRET]",
          "authorizationUri": "https://accounts.google.com/o/oauth2/auth?...",
          "tokenUri": "https://oauth2.googleapis.com/token"
        }
      }' \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/authorizations?authorizationId=[NEW_AUTH_ID]"`
          },
          {
            title: 'Get Authorization Details',
            command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/authorizations/[AUTHORIZATION_ID]"`
          },
          {
            title: 'Update Authorization',
            command: `curl -X PATCH \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  -d '{
        "serverSideOauth2": {
          "clientId": "[UPDATED_CLIENT_ID]"
        }
      }' \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/authorizations/[AUTHORIZATION_ID]?updateMask=server_side_oauth2.client_id"`
          },
          {
            title: 'Delete Authorization',
            command: `curl -X DELETE \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/authorizations/[AUTHORIZATION_ID]"`
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
    [Page.DATA_STORES]: {
        description: "These are the underlying REST API calls for exploring Vertex AI Search data stores.",
        commands: [
            {
                title: 'List Data Stores',
                command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://discoveryengine.googleapis.com/v1beta/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/dataStores"`
            },
          {
            title: 'Create Data Store',
            command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  -d '{
        "displayName": "My Data Store",
        "industryVertical": "GENERIC",
        "solutionTypes": ["SOLUTION_TYPE_SEARCH"],
        "contentConfig": "NO_CONTENT"
      }' \\
  "https://discoveryengine.googleapis.com/v1beta/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/dataStores?dataStoreId=[DATA_STORE_ID]"`
          },
          {
            title: 'Update Data Store',
            command: `curl -X PATCH \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  -d '{
        "displayName": "Updated Data Store Name"
      }' \\
  "https://discoveryengine.googleapis.com/v1beta/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/dataStores/[DATA_STORE_ID]?updateMask=displayName"`
          },
          {
            title: 'Delete Data Store',
            command: `curl -X DELETE \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://discoveryengine.googleapis.com/v1beta/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/dataStores/[DATA_STORE_ID]"`
          },
          {
            title: 'Get Long-Running Operation (LRO)',
            command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://discoveryengine.googleapis.com/v1beta/[OPERATION_NAME]"`
          }
    ]
  },
  [Page.CONNECTORS]: {
    description: "These are the underlying REST API calls for managing Discovery Engine Connectors (Data Connectors). A Data Connector is a singleton resource within a Collection that manages extracting data from a third-party source.",
    commands: [
      {
        title: 'List Collections',
        command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections"`
      },
      {
        title: 'Get Data Connector',
        command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/dataConnector"`
      },
      {
        title: 'List Connector Operations',
        command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/operations"`
      },
      {
        title: 'Fetch Connector Logs',
        command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -d '{
        "resourceNames": ["projects/[YOUR_PROJECT_ID]"],
        "filter": "(resource.type=\\"vertex_ai_search_connector\\" AND resource.labels.connector_id=\\"[CONNECTOR_ID]\\") OR (jsonPayload.connectorRunPayload.dataConnector=\\"projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/dataConnector\\") AND severity>=ERROR",
        "orderBy": "timestamp desc",
        "pageSize": 50
      }' \\
  "https://logging.googleapis.com/v2/entries:list"`
      }
    ]
  },
  [Page.VANITY_URLS]: {
    description: "These are the underlying REST API calls for managing Redirect URLs (Global Forwarding Rules and Managed SSL Certificates).",
    commands: [
      {
        title: 'List Global Forwarding Rules',
        command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://compute.googleapis.com/compute/v1/projects/[YOUR_PROJECT_ID]/global/forwardingRules"`
      },
      {
        title: 'List Managed SSL Certificates',
        command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://compute.googleapis.com/compute/v1/projects/[YOUR_PROJECT_ID]/global/sslCertificates"`
      },
      {
        title: 'Dismantle Redirect URL Infrastructure (Cloud Build)',
        command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  -d '{
        "steps": [
          {
            "name": "gcr.io/google.com/cloudsdktool/cloud-sdk",
            "entrypoint": "bash",
            "args": [
              "-c",
              "echo Dismantling... && gcloud compute forwarding-rules delete [SERVICE_NAME]-fwd-rule --global --quiet"
            ]
          }
        ]
      }' \\
  "https://cloudbuild.googleapis.com/v1/projects/[YOUR_PROJECT_ID]/builds"`
      }
    ]
  },
  [Page.GE_QUOTA_USAGE]: {
    description: "These are the underlying REST API calls for fetching Gemini Enterprise pooled quota configurations, localized project licenses, and live usage metrics via Google Cloud Monitoring.",
    commands: [
      {
        title: 'List Billing Accounts',
        command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  "https://cloudbilling.googleapis.com/v1/billingAccounts"`
      },
      {
        title: 'List Billing Account Subscription Profiles',
        command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  "https://discoveryengine.googleapis.com/v1alpha/billingAccounts/[BILLING_ACCOUNT_ID]/billingAccountLicenseConfigs"`
      },
      {
        title: 'List Project Local License Usage Stats',
        command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/licenseConfigUsageStats"`
      },
      {
        title: 'Get Local License Configuration Details',
        command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/global/licenseConfigs/[LICENSE_CONFIG_ID]"`
      },
      {
        title: 'Fetch Live Usage Metrics (Cloud Monitoring)',
        command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  "https://monitoring.googleapis.com/v3/projects/[YOUR_PROJECT_ID]/timeSeries?filter=metric.type%3D%22discoveryengine.googleapis.com%2Fquota%2F[METRIC_SUFFIX]%2Fusage%22%20AND%20resource.type%3D%22discoveryengine.googleapis.com%2FLocation%22&interval.startTime=[START_TIME]&interval.endTime=[END_TIME]"`
      }
    ]
  },

    [Page.CHAT]: {
      description: "This encompasses the REST API calls for interacting with a Gemini Enterprise assistant, including managing sessions and streaming responses.",
        commands: [
            {
            title: 'Create Session',
            command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  -d '{
        "userPseudoId": "user@example.com"
      }' \\
  "https://[LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]/sessions"`
          },
          {
                title: 'Test Assistant (Streaming)',
                command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  -d '{
        "query": { "text": "Hello, what can you do?" },
        "session": "projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]/sessions/[SESSION_ID]"
      }' \\
  "https://[LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]/assistants/[ASSISTANT_ID]:streamAssist"`
            },
          {
            title: 'Get Engine (Check Linked Data Stores)',
            command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]"`
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
    [Page.AGENT_CATALOG]: {
      description: "The Agent Catalog allows browsing project agents and deploying samples from GitHub using Cloud Build. It fetches samples from GitHub, lists available Google Cloud Storage buckets, and triggers Cloud Build deployments.",
        commands: [
            {
            title: 'Fetch GitHub Repo Contents',
            command: `curl -X GET \\
  "https://api.github.com/repos/google/adk-samples/contents/python/agents?ref=main"`
          },
          {
            title: 'List Storage Buckets',
            command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://storage.googleapis.com/storage/v1/b?project=[YOUR_PROJECT_ID]"`
          },
          {
                title: 'Trigger Cloud Build (Deploy Sample)',
                command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  -d '{
        "source": { "storageSource": { "bucket": "[STAGING_BUCKET]", "object": "source/sample_agent.zip" } },
        "steps": [ ... ]
      }' \\
  "https://cloudbuild.googleapis.com/v1/projects/[YOUR_PROJECT_ID]/builds"`
          }
        ]
  },
  [Page.AGENT_STARTER_PACK]: {
    description: "The Agent Starter Pack generates scaffolding for robust agents and triggers deployment via Cloud Build using GitHub repos and Storage buckets.",
    commands: [
            {
        title: 'Fetch GitHub Repo Contents',
                command: `curl -X GET \\
  "https://api.github.com/repos/google/adk-samples/contents/python/agents?ref=main"`
      },
      {
        title: 'Trigger Cloud Build (Deploy Agent)',
        command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  -d '{
        "steps": [ ... ]
      }' \\
  "https://cloudbuild.googleapis.com/v1/projects/[YOUR_PROJECT_ID]/builds"`
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
    [Page.MODEL_ARMOR]: {
        description: "Model Armor logs are stored in Cloud Logging. You can query them using the \`entries:list\` endpoint with a specific resource type filter.",
        commands: [
            {
                title: 'Fetch Violation Logs',
                command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -d '{
        "resourceNames": ["projects/[YOUR_PROJECT_ID]"],
        "filter": "resource.type=\\"modelarmor.googleapis.com/SanitizeOperation\\"",
        "orderBy": "timestamp desc",
        "pageSize": 50
      }' \\
  "https://logging.googleapis.com/v2/entries:list"`
      },
      {
        title: 'Create Policy Template',
        command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -d '{
        "template": {
          "filterConfig": {
            "raiSettings": {
              "raiFilters": [{"type": "HATE_SPEECH", "confidence": "MEDIUM_AND_ABOVE"}]
            }
          }
        }
      }' \\
  "https://modelarmor.googleapis.com/v1/projects/[YOUR_PROJECT_ID]/locations/global/templates?templateId=[TEMPLATE_ID]"`
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
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
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
    'Backup:DiscoveryResources': {
        description: "A full discovery resource backup involves recursively listing all collections, engines, assistants, and agents. The primary starting point is listing collections.",
        commands: [{ title: 'List Collections (Primary Step)', command: `curl -X GET -H "Authorization: Bearer [TOKEN]" "https://[LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[PROJECT_ID]/locations/[LOCATION]/collections"` }]
    },
    'Restore:DiscoveryResources': {
        description: "Restoring discovery resources involves a series of \`create\` operations. The first step is to create the collection.",
        commands: [{ title: 'Create Collection (First Step)', command: `curl -X POST -H "Authorization: Bearer [TOKEN]" -H "Content-Type: application/json" -d '{"displayName": "[COLLECTION_DISPLAY_NAME]"}' "https://[LOCATION]-discoveryengine.googleapis.com/v1beta/projects/[PROJECT_ID]/locations/[LOCATION]/collections?collectionId=[COLLECTION_ID]"` }]
    },
    'Backup:AppEngine': {
        description: "Backing up a single App/Engine involves getting its details and then listing its assistants and agents recursively.",
        commands: [{ title: 'Get Engine Details', command: `curl -X GET -H "Authorization: Bearer [TOKEN]" "https://[LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]"` }]
    },
    'Restore:AppEngine': {
        description: "Restoring an App/Engine requires creating a data store for it first, then creating the engine itself.",
        commands: [{ title: 'Create Engine', command: `curl -X POST -H "Authorization: Bearer [TOKEN]" -H "Content-Type: application/json" -d '{"displayName": "[ENGINE_DISPLAY_NAME]", "solutionType": "SOLUTION_TYPE_SEARCH", "dataStoreIds": ["[NEW_DATA_STORE_ID]"]}' "https://[LOCATION]-discoveryengine.googleapis.com/v1beta/projects/[PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines?engineId=[ENGINE_ID]"` }]
    },
    'Backup:Assistant': {
        description: "Backing up a single Assistant involves getting its details and then listing its agents.",
        commands: [{ title: 'Get Assistant Details', command: `curl -X GET -H "Authorization: Bearer [TOKEN]" "https://[LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]/assistants/[ASSISTANT_ID]"` }]
    },
    'Restore:Assistant': {
        description: "Restoring an Assistant involves creating it within a target App/Engine.",
        commands: [{ title: 'Create Assistant', command: `curl -X POST -H "Authorization: Bearer [TOKEN]" -H "Content-Type: application/json" -d '{"displayName": "[ASSISTANT_DISPLAY_NAME]"}' "https://[LOCATION]-discoveryengine.googleapis.com/v1beta/projects/[PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]/assistants?assistantId=[ASSISTANT_ID]"` }]
    },
    'Backup:Agents': {
        description: "Backing up agents involves listing all agents within a specific assistant.",
        commands: [{ title: 'List Agents', command: `curl -X GET -H "Authorization: Bearer [TOKEN]" "https://[LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]/assistants/[ASSISTANT_ID]/agents"` }]
    },
    'Restore:Agents': {
        description: "Restoring agents involves creating them within a target assistant. The \`createAgent\` call from the main Agents page is used.",
        commands: [{ title: 'Create Agent', command: `curl -X POST -H "Authorization: Bearer [TOKEN]" -H "Content-Type: application/json" -d '{...}' "https://[LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]/assistants/[ASSISTANT_ID]/agents"` }]
    },
    'Backup:DataStores': {
        description: "Backing up data stores involves listing all data stores within a specific collection.",
        commands: [{ title: 'List Data Stores', command: `curl -X GET -H "Authorization: Bearer [TOKEN]" "https://[LOCATION]-discoveryengine.googleapis.com/v1beta/projects/[PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/dataStores"` }]
    },
    'Restore:DataStores': {
        description: "Restoring a data store involves creating it within a target collection.",
        commands: [{ title: 'Create Data Store', command: `curl -X POST -H "Authorization: Bearer [TOKEN]" -H "Content-Type: application/json" -d '{"displayName": "[DS_DISPLAY_NAME]", "industryVertical": "GENERIC", "solutionTypes": ["SOLUTION_TYPE_SEARCH"], "contentConfig": "NO_CONTENT"}' "https://[LOCATION]-discoveryengine.googleapis.com/v1beta/projects/[PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/dataStores?dataStoreId=[DATA_STORE_ID]"` }]
    },
    'Backup:Authorizations': {
        description: "Backing up authorizations involves listing all authorizations in the project.",
        commands: [{ title: 'List Authorizations', command: `curl -X GET -H "Authorization: Bearer [TOKEN]" "https://discoveryengine.googleapis.com/v1alpha/projects/[PROJECT_ID]/locations/global/authorizations"` }]
    },
    'Restore:Authorizations': {
        description: "Restoring an authorization involves creating it. The \`createAuthorization\` call from the Authorizations page is used. Note that you must provide the client secret, which is not included in the backup file.",
        commands: [{ title: 'Create Authorization', command: `curl -X POST -H "Authorization: Bearer [TOKEN]" -H "Content-Type: application/json" -d '{ "serverSideOauth2": { ... } }' "https://discoveryengine.googleapis.com/v1alpha/projects/[PROJECT_ID]/locations/global/authorizations?authorizationId=[AUTH_ID]"` }]
    },
  'Backup:NotebookLM': {
    description: "Backing up NotebookLM involves fetching the recently viewed notebooks and then iterating to fetch the full details and sources for each.",
    commands: [
      { title: 'List Notebooks', command: `curl -X GET -H "Authorization: Bearer [TOKEN]" "https://[LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[PROJECT_ID]/locations/[LOCATION]/notebooks:listRecentlyViewed"` },
      { title: 'Get Notebook Details', command: `curl -X GET -H "Authorization: Bearer [TOKEN]" "https://[LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[PROJECT_ID]/locations/[LOCATION]/notebooks/[NOTEBOOK_ID]"` },
      { title: 'Get Source Details', command: `curl -X GET -H "Authorization: Bearer [TOKEN]" "https://[LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[PROJECT_ID]/locations/[LOCATION]/notebooks/[NOTEBOOK_ID]/sources/[SOURCE_ID]"` }
    ]
  },
  'Restore:NotebookLM': {
    description: "Restoring NotebookLM involves creating a new notebook and then performing a batch create operation to restore all of its sources.",
    commands: [
      { title: 'Create Notebook', command: `curl -X POST -H "Authorization: Bearer [TOKEN]" -H "Content-Type: application/json" -d '{"title": "[NOTEBOOK_TITLE]"}' "https://[LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[PROJECT_ID]/locations/[LOCATION]/notebooks"` },
      { title: 'Batch Create Sources', command: `curl -X POST -H "Authorization: Bearer [TOKEN]" -H "Content-Type: application/json" -d '{"userContents": [{...}]}' "https://[LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[PROJECT_ID]/locations/[LOCATION]/notebooks/[NEW_NOTEBOOK_ID]/sources:batchCreate"` }
    ]
  },
    'ArchitectureScan': {
      description: "The architecture scan performs a series of 'list' operations across multiple regions and resource types to discover all connected components. It starts by listing global resources like Authorizations, then scans all regions for Agent Engines, and finally explores Discovery Engine locations to find Engines, Assistants, and Agents recursively.",
        commands: [
            {
                title: 'List Authorizations (Global)',
                command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/global/authorizations"`
            },
            {
              title: 'List Agent Engines (Per-Region)',
                command: `# The scan iterates over locations like us-central1, europe-west1, etc.
curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[LOCATION]-aiplatform.googleapis.com/v1beta1/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/reasoningEngines"`
            },
            {
                title: 'List Cloud Run Services (Per-Region)',
                command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[LOCATION]-run.googleapis.com/v2/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/services"`
            },
            {
                title: 'List Discovery Engines (Per-Location)',
                command: `# The scan iterates over discovery locations like global, us, eu.
curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[DISCOVERY_LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[DISCOVERY_LOCATION]/collections/default_collection/engines"`
            },
            {
                title: 'List Data Stores (Per-Collection)',
                command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[DISCOVERY_LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[DISCOVERY_LOCATION]/collections/default_collection/dataStores"`
            },
            {
                title: 'List Assistants (Per-Engine)',
                command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[DISCOVERY_LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[DISCOVERY_LOCATION]/collections/default_collection/engines/[ENGINE_ID]/assistants"`
            },
            {
                title: 'List Agents (Per-Assistant)',
                command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[DISCOVERY_LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[DISCOVERY_LOCATION]/collections/default_collection/engines/[ENGINE_ID]/assistants/[ASSISTANT_ID]/agents"`
            },
            {
                title: 'Get Agent View (For Dependencies)',
                command: `# After finding an agent, its 'view' is fetched to find linked Data Stores.
curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[DISCOVERY_LOCATION]-discoveryengine.googleapis.com/v1alpha/[FULL_AGENT_RESOURCE_NAME]:getAgentView"`
            },
        ]
    },
    [Page.ARCHITECTURE]: {
      description: "The architecture scan performs a series of 'list' operations across multiple regions and resource types to discover all connected components. It starts by listing global resources like Authorizations, then scans all regions for Agent Engines, and finally explores Discovery Engine locations to find Engines, Assistants, and Agents recursively.",
        commands: [
            {
                title: 'List Authorizations (Global)',
                command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/global/authorizations"`
            },
            {
              title: 'List Agent Engines (Per-Region)',
                command: `# The scan iterates over locations like us-central1, europe-west1, etc.
curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[LOCATION]-aiplatform.googleapis.com/v1beta1/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/reasoningEngines"`
            },
            {
                title: 'List Cloud Run Services (Per-Region)',
                command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[LOCATION]-run.googleapis.com/v2/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/services"`
            },
            {
                title: 'List Discovery Engines (Per-Location)',
                command: `# The scan iterates over discovery locations like global, us, eu.
curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[DISCOVERY_LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[DISCOVERY_LOCATION]/collections/default_collection/engines"`
            },
            {
                title: 'List Data Stores (Per-Collection)',
                command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[DISCOVERY_LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[DISCOVERY_LOCATION]/collections/default_collection/dataStores"`
            },
            {
                title: 'List Assistants (Per-Engine)',
                command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[DISCOVERY_LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[DISCOVERY_LOCATION]/collections/default_collection/engines/[ENGINE_ID]/assistants"`
            },
            {
                title: 'List Agents (Per-Assistant)',
                command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[DISCOVERY_LOCATION]-discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[DISCOVERY_LOCATION]/collections/default_collection/engines/[ENGINE_ID]/assistants/[ASSISTANT_ID]/agents"`
            },
            {
                title: 'Get Agent View (For Dependencies)',
                command: `# After finding an agent, its 'view' is fetched to find linked Data Stores.
curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://[DISCOVERY_LOCATION]-discoveryengine.googleapis.com/v1alpha/[FULL_AGENT_RESOURCE_NAME]:getAgentView"`
            },
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
          },
        ]
    },
    [Page.LICENSE]: {
      description: "License management APIs allow tracking user assignments, analyzing project allocation usage, and managing the distribution of seats from a Billing Account to a specific project. Note that Discovery Engine endpoints related to billing accounts and user stores are used.",
      commands: [
        {
          title: 'List User Licenses (Assignments)',
          command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://discoveryengine.googleapis.com/v1/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/userStores/default_user_store/userLicenses?pageSize=50"`
        },
        {
          title: 'Revoke User Licenses (Batch Update)',
          command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  -d '{
        "inlineSource": {
            "userLicenses": [
                { "userPrincipal": "user1@example.com" },
                { "userPrincipal": "user2@example.com" }
            ],
            "updateMask": { "paths": ["userPrincipal", "licenseConfig"] }
        },
        "deleteUnassignedUserLicenses": true
      }' \\
  "https://discoveryengine.googleapis.com/v1/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/userStores/default_user_store:batchUpdateUserLicenses"`
        },
        {
          title: 'List Billing Accounts',
          command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://cloudbilling.googleapis.com/v1/billingAccounts"`
        },
        {
          title: 'List Billing Account License Configs',
          command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://discoveryengine.googleapis.com/v1alpha/billingAccounts/[BILLING_ACCOUNT_ID]/billingAccountLicenseConfigs"`
        },
        {
          title: 'List Project Usage Stats',
          command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/userStores/default_user_store/licenseConfigsUsageStats"`
        },
        {
          title: 'Distribute License Config (Allocate to Project)',
          command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  -d '{
        "projectNumber": "[YOUR_PROJECT_NUMBER]",
        "location": "[LOCATION]",
        "licenseCount": 100
      }' \\
  "https://discoveryengine.googleapis.com/v1alpha/billingAccounts/[BILLING_ACCOUNT_ID]/billingAccountLicenseConfigs/[LICENSE_CONFIG_ID]:distributeLicenseConfig"`
        },
        {
          title: 'Retract License Config (Remove from Project)',
          command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  -d '{
        "licenseConfig": "projects/[YOUR_PROJECT_NUMBER]/locations/[LOCATION]/licenseConfigs/[PROJECT_LICENSE_CONFIG_ID]",
        "licenseCount": 10
      }' \\
  "https://discoveryengine.googleapis.com/v1alpha/billingAccounts/[BILLING_ACCOUNT_ID]/billingAccountLicenseConfigs/[LICENSE_CONFIG_ID]:retractLicenseConfig"`
        }
      ]
    },
  'Backup:ChatHistory': {
    description: "Backing up Chat History involves listing all sessions for the target App/Engine. Note that the API requires iterating over pages if there are many sessions.",
    commands: [
      {
        title: 'List Sessions',
        command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]/sessions"`
      },
      {
        title: 'Get Session Details',
        command: `curl -X GET \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]/sessions/[SESSION_ID]"`
      }
    ]
  },
  'Restore:ChatHistory': {
    description: "Restoring Chat History involves creating sessions. Since the API does not support client-assigned session IDs in v1alpha, new IDs will be generated. The 'turns' array from the backup should be included in the body to restore conversation history.",
    commands: [
      {
        title: 'Create Session (Restore)',
        command: `curl -X POST \\
  -H "Authorization: Bearer [YOUR_ACCESS_TOKEN]" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-User-Project: [YOUR_PROJECT_ID]" \\
  -d '{
        "userPseudoId": "restored-user-id",
        "turns": [
            { "query": { "text": "Hello" }, "answer": "Hi there!" }
        ]
      }' \\
  "https://discoveryengine.googleapis.com/v1alpha/projects/[YOUR_PROJECT_ID]/locations/[LOCATION]/collections/[COLLECTION_ID]/engines/[ENGINE_ID]/sessions"`
      }
    ]
  },
};

const CodeBlock: React.FC<{ title: string, command: string }> = ({ title, command }) => {
  const [copyText, setCopyText] = useState('Copy');
  const handleCopy = () => {
    navigator.clipboard.writeText(command);
    setCopyText('Copied!');
    setTimeout(() => setCopyText('Copy'), 2000);
  };

  return (
    <div className="bg-gray-900 rounded-lg overflow-hidden">
      <div className="flex justify-between items-center p-2 bg-gray-900/50">
        <span className="text-sm font-semibold text-gray-300">{title}</span>
        <button onClick={handleCopy} className="px-3 py-1 bg-gray-600 text-white text-xs font-semibold rounded-md hover:bg-gray-500">{copyText}</button>
      </div>
      <pre className="p-4 text-xs text-gray-300 whitespace-pre-wrap overflow-x-auto">
        <code>{command}</code>
      </pre>
    </div>
  );
};

const CurlInfoModal: React.FC<CurlInfoModalProps> = ({ infoKey, onClose }) => {
  // Fallback for pages that share the same key logic or missing keys
  const info = ALL_INFO[infoKey] || ALL_INFO[Page.AGENTS]; // Default to Agents if key not found (safe fallback)
  
  const titleText = infoKey.startsWith('Backup:') || infoKey.startsWith('Restore:') 
    ? infoKey.replace(':', ' - ')
    : infoKey === 'ArchitectureScan' ? 'Architecture Scan'
    : infoKey;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4" aria-modal="true" role="dialog">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <header className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">API Commands for {titleText}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
        </header>
        <main className="p-6 overflow-y-auto space-y-4">
          {info ? (
            <>
              <p className="text-sm text-gray-400">{info.description}</p>
              {info.commands.length > 0 && <p className="text-xs text-gray-500">Note: Replace placeholders like <code>[YOUR_PROJECT_ID]</code> and <code>[YOUR_ACCESS_TOKEN]</code> with your actual values.</p>}
              {info.commands.map(cmd => (
                <CodeBlock key={cmd.title} title={cmd.title} command={cmd.command} />
              ))}
            </>
          ) : (
            <p className="text-gray-400">No specific API command examples are available for this page.</p>
          )}
        </main>
        <footer className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700">Close</button>
        </footer>
      </div>
    </div>
  );
};

export default CurlInfoModal;
