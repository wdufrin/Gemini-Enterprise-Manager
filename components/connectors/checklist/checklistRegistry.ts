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

import { ConnectorChecklistDefinition } from './types';

export const CHECKLIST_REGISTRY: Record<string, ConnectorChecklistDefinition> = {
  GCP_PEOPLE: {
    vendorId: 'GCP_PEOPLE',
    vendorDisplayName: 'Google Cloud / Workspace People & Directory',
    category: 'Google First-Party & MCP',
    detectionPatterns: {
      dataSources: ['gcp_people', 'google_people', 'people', 'workspace_directory'],
      nameSubstrings: ['gcp-people', 'gcp_people', 'people', 'directory', 'google-workspace'],
    },
    supportsDataModeToggle: true,
    documentationUrl: 'https://cloud.google.com/generative-ai-app-builder/docs/connectors',
    sections: [
      {
        id: 'auth_access',
        title: 'Authentication & Service Account Configuration',
        stepNumber: 1,
        description: 'Ensure the Discovery Engine service agent has Domain-Wide Delegation and required cloud roles.',
        items: [
          {
            id: 'people_dwd',
            label: 'Domain-Wide Delegation (DWD) Provisioned',
            subLabel: 'Service Account is authorized in Google Workspace Admin Console with API scopes.',
            badge: 'Required',
            documentationUrl: 'https://admin.google.com/ac/owl/domainwidedelegation',
          },
          {
            id: 'people_iam_service_agent',
            label: 'Discovery Engine Service Agent Role',
            subLabel: 'Service Agent has roles/discoveryengine.serviceAgent on the host GCP project.',
            badge: 'Automated',
            automatedProbe: {
              type: 'IAM_PERMISSION_CHECK',
              requiredPermissions: ['discoveryengine.dataStores.get', 'discoveryengine.collections.get'],
              description: 'Checks Discovery Engine service agent role bindings on project.',
            },
          },
          {
            id: 'people_connector_health',
            label: 'Connector State Health',
            subLabel: 'Connector status in Discovery Engine is ACTIVE with no failing sync runs.',
            badge: 'Automated',
            automatedProbe: {
              type: 'CONNECTOR_STATUS',
              description: 'Validates connector state and latest sync operation error logs.',
            },
          },
        ],
      },
      {
        id: 'scopes_permissions',
        title: 'Google Workspace API Scopes',
        stepNumber: 2,
        description: 'Verify OAuth scopes granted to the Domain-Wide Delegation service account.',
        items: [
          {
            id: 'scope_admin_directory_user_readonly',
            label: 'User Directory Read Scope',
            subLabel: 'Enables syncing employee profiles, job titles, departments, and reporting structures.',
            codeSnippet: 'https://www.googleapis.com/auth/admin.directory.user.readonly',
            badge: 'Required',
          },
          {
            id: 'scope_admin_directory_group_readonly',
            label: 'Group Directory Read Scope',
            subLabel: 'Enables syncing group memberships for Access Control List (ACL) security trimming.',
            codeSnippet: 'https://www.googleapis.com/auth/admin.directory.group.readonly',
            badge: 'Required',
          },
          {
            id: 'scope_cloud_identity_groups_readonly',
            label: 'Cloud Identity Groups Read Scope',
            subLabel: 'Required for advanced federated identity search and security groups.',
            codeSnippet: 'https://www.googleapis.com/auth/cloud-identity.groups.readonly',
            badge: 'Optional',
            appliesToMode: 'FEDERATED',
          },
        ],
      },
    ],
  },

  GCP_DRIVE: {
    vendorId: 'GCP_DRIVE',
    vendorDisplayName: 'Google Drive & Docs',
    category: 'Google First-Party & MCP',
    detectionPatterns: {
      dataSources: ['drive', 'gdrive', 'google_drive'],
      nameSubstrings: ['drive', 'gdrive', 'google-drive'],
    },
    supportsDataModeToggle: true,
    supportsActions: true,
    documentationUrl: 'https://docs.cloud.google.com/gemini/enterprise/docs/connectors/google-drive',
    sections: [
      {
        id: 'auth_access',
        title: 'Authentication & Service Account',
        stepNumber: 1,
        description: 'Service account authorization for Google Drive API ingestion.',
        items: [
          {
            id: 'drive_dwd',
            label: 'Domain-Wide Delegation for Drive',
            subLabel: 'Workspace Admin delegated Drive API scopes to Discovery Engine service account.',
            badge: 'Required',
          },
          {
            id: 'drive_connector_health',
            label: 'Connector Sync Health',
            subLabel: 'Connector state is active with no sync operation errors.',
            badge: 'Automated',
            automatedProbe: {
              type: 'CONNECTOR_STATUS',
              description: 'Validates connector state.',
            },
          },
        ],
      },
      {
        id: 'scopes',
        title: 'Drive API Scopes (Read)',
        stepNumber: 2,
        description: 'Ensure Drive read-only scopes are configured.',
        items: [
          {
            id: 'scope_drive_readonly',
            label: 'Drive Readonly Scope',
            subLabel: 'Allows indexing files and documents across user MyDrive and Shared Drives.',
            codeSnippet: 'https://www.googleapis.com/auth/drive.readonly',
            badge: 'Required',
          },
          {
            id: 'scope_drive_metadata_readonly',
            label: 'Drive Metadata Readonly',
            subLabel: 'Enables reading document metadata, permissions, and folder hierarchies.',
            codeSnippet: 'https://www.googleapis.com/auth/drive.metadata.readonly',
            badge: 'Required',
          },
        ],
      },
      {
        id: 'drive_actions_section',
        title: 'Assistant Actions & Write Scopes',
        stepNumber: 3,
        description: 'Google Workspace API scopes allowing Gemini Assistant to create docs, draft emails, and schedule calendar meetings.',
        items: [
          {
            id: 'drive_scope_file',
            label: 'Drive File Creation Scope',
            subLabel: 'Allows the assistant to create, edit, and organize Google Docs, Sheets, and Slides.',
            codeSnippet: 'https://www.googleapis.com/auth/drive.file',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'gmail_scope_send',
            label: 'Gmail Send Scope',
            subLabel: 'Allows the assistant to compose and send emails on user behalf.',
            codeSnippet: 'https://www.googleapis.com/auth/gmail.send',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'calendar_scope_events',
            label: 'Calendar Events Scope',
            subLabel: 'Allows the assistant to create, reschedule, and delete calendar meetings.',
            codeSnippet: 'https://www.googleapis.com/auth/calendar.events',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
        ],
      },
    ],
  },
  BYO_MCP: {
    vendorId: 'BYO_MCP',
    vendorDisplayName: 'Model Context Protocol (BYOMCP)',
    category: 'Google First-Party & MCP',
    detectionPatterns: {
      dataSources: ['custom_mcp'],
      nameSubstrings: ['mcp', 'byomcp', 'custom_mcp', 'onemcp'],
    },
    supportsDataModeToggle: false,
    documentationUrl: 'https://modelcontextprotocol.io/',
    sections: [
      {
        id: 'mcp_endpoint',
        title: 'MCP Server Endpoint Reachability',
        stepNumber: 1,
        description: 'Ensure the MCP server instance URI is reachable and tools are dynamically discoverable.',
        items: [
          {
            id: 'mcp_instance_uri',
            label: 'Valid MCP Instance URI',
            subLabel: 'HTTPS endpoint configured in connector params (e.g. Cloud Run service).',
            badge: 'Required',
          },
          {
            id: 'mcp_probe_connectivity',
            label: 'Live MCP Tool Discovery & Ping',
            subLabel: 'Pings the MCP instance URI and verifies JSON-RPC tools/list response.',
            badge: 'Automated',
            automatedProbe: {
              type: 'MCP_CONNECTIVITY',
              description: 'Connects to MCP endpoint and queries tools/list via JSON-RPC.',
            },
          },
          {
            id: 'mcp_oauth_config',
            label: 'OAuth / Bearer Credentials (If Applicable)',
            subLabel: 'Authorization parameters and client secrets are valid if auth_type !== NONE.',
            badge: 'Recommended',
            automatedProbe: {
              type: 'OAUTH_CONFIG_VALIDITY',
              description: 'Validates authType, authUri, tokenUri, and scopes syntax.',
            },
          },
        ],
      },
      {
        id: 'mcp_instructions',
        title: 'Agent Guidelines & Instructions',
        stepNumber: 2,
        description: 'Verify system prompts and formatting instructions for Gemini agents.',
        items: [
          {
            id: 'mcp_agent_instructions',
            label: 'Agent Instructions Provided',
            subLabel: 'System instructions guiding Gemini on how and when to invoke MCP server tools.',
            badge: 'Recommended',
          },
          {
            id: 'mcp_server_description',
            label: 'Server Description Defined',
            subLabel: 'Clear summary of server domain and capabilities for reasoning engines.',
            badge: 'Recommended',
          },
        ],
      },
    ],
  },

  JIRA: {
    vendorId: 'JIRA',
    vendorDisplayName: 'Atlassian Jira Cloud',
    category: 'Enterprise Platforms',
    detectionPatterns: {
      dataSources: ['jira'],
      nameSubstrings: ['jira'],
    },
    supportsDataModeToggle: true,
    supportsActions: true,
    documentationUrl: 'https://docs.cloud.google.com/gemini/enterprise/docs/connectors/jira-cloud/third-party-config',
    sections: [
      {
        id: 'auth',
        title: 'Authentication & Permissions',
        stepNumber: 1,
        description: 'Verify Atlassian Cloud OAuth 2.0 app credentials and user access.',
        items: [
          {
            id: 'jira_creds',
            label: 'OAuth 2.0 (3LO) App Provisioned',
            subLabel: 'Client ID and Client Secret configured in Atlassian Developer Console.',
            badge: 'Required',
          },
          {
            id: 'jira_offline_access',
            label: 'offline_access Scope Granted',
            subLabel: 'Allows Gemini Enterprise to refresh authorization tokens in the background.',
            codeSnippet: 'offline_access',
            badge: 'Required',
          },
          {
            id: 'jira_connector_status',
            label: 'Connector Health Status',
            subLabel: 'Connector is active in Discovery Engine with no auth sync failures.',
            badge: 'Automated',
            automatedProbe: {
              type: 'CONNECTOR_STATUS',
              description: 'Validates connector state.',
            },
          },
        ],
      },
      {
        id: 'scopes',
        title: 'Search & Ingestion Scopes',
        stepNumber: 2,
        description: 'Configure read scopes depending on ingestion or federated mode.',
        items: [
          {
            id: 'jira_read_work',
            label: 'read:jira-work',
            subLabel: 'Grants access to read Jira issues, sprints, boards, and work items.',
            codeSnippet: 'read:jira-work',
            badge: 'Required',
          },
          {
            id: 'jira_read_user',
            label: 'read:jira-user',
            subLabel: 'Enables user identity mapping for ACL permission trimming.',
            codeSnippet: 'read:jira-user',
            badge: 'Required',
            appliesToMode: 'FEDERATED',
          },
        ],
      },
      {
        id: 'jira_actions_section',
        title: 'Assistant Actions & Write Permissions',
        stepNumber: 3,
        description: 'Mandatory write permissions and redirect URIs to allow Gemini Assistant to create, update, and manage Jira issues.',
        items: [
          {
            id: 'jira_action_redirect_uri',
            label: 'Actions Redirect URI Allowlisted',
            subLabel: 'Actions always use https://vertexaisearch.cloud.google.com/oauth-redirect. Required in Atlassian Developer Console.',
            codeSnippet: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'jira_scope_write_work',
            label: 'write:jira-work (Classic Scope)',
            subLabel: 'Allows the assistant to modify work items (update fields, manage comments, and upload attachments).',
            codeSnippet: 'write:jira-work',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'jira_scope_manage_project',
            label: 'manage:jira-project (Classic Scope)',
            subLabel: 'Allows assistant to manage Jira project settings and create versions/components. Required for project actions.',
            codeSnippet: 'manage:jira-project',
            badge: 'Recommended',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'jira_scope_write_issue',
            label: 'write:issue:jira (Granular Scope)',
            subLabel: 'Allows the assistant to create, edit, and transition Jira issues on user behalf.',
            codeSnippet: 'write:issue:jira',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'jira_scope_write_comment',
            label: 'write:comment:jira (Granular Scope)',
            subLabel: 'Allows the assistant to add comments to Jira issues.',
            codeSnippet: 'write:comment:jira',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'jira_scope_write_attachment',
            label: 'write:attachment:jira (Granular Scope)',
            subLabel: 'Allows the assistant to attach files and documents to Jira issues.',
            codeSnippet: 'write:attachment:jira',
            badge: 'Optional',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'jira_scope_write_project',
            label: 'write:project:jira (Granular Scope)',
            subLabel: 'Allows the assistant to manage project settings.',
            codeSnippet: 'write:project:jira',
            badge: 'Optional',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'jira_scope_write_worklog',
            label: 'write:issue-worklog:jira (Granular Scope)',
            subLabel: 'Allows the assistant to log work hours and timesheets on Jira issues.',
            codeSnippet: 'write:issue-worklog:jira',
            badge: 'Optional',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'jira_scope_write_link',
            label: 'write:issue-link:jira (Granular Scope)',
            subLabel: 'Allows the assistant to link Jira issues together and manage dependencies.',
            codeSnippet: 'write:issue-link:jira',
            badge: 'Optional',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'jira_action_user_roles',
            label: 'User Project Level Permissions',
            subLabel: 'Authenticating user must have Create Issues, Edit Issues, Add Comments, and Link Issues permissions in target Jira projects.',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
        ],
      },
    ],
  },

  JIRA_DC: {
    vendorId: 'JIRA_DC',
    vendorDisplayName: 'Atlassian Jira Data Center',
    category: 'Enterprise Platforms',
    detectionPatterns: {
      dataSources: ['jira_dc', 'jira-dc'],
      nameSubstrings: ['jira_dc', 'jira-dc', 'jiradc'],
    },
    supportsDataModeToggle: true,
    documentationUrl: 'https://cloud.google.com/generative-ai-app-builder/docs/connectors/jira-dc',
    sections: [
      {
        id: 'network',
        title: 'Network & Connectivity',
        stepNumber: 1,
        description: 'Verify connectivity from Google Cloud to on-prem / self-hosted Jira Data Center.',
        items: [
          {
            id: 'jiradc_network',
            label: 'Network Reachability / Cloud NAT',
            subLabel: 'Firewall allows inbound HTTPS traffic from Google Cloud Discovery Engine IPs.',
            badge: 'Required',
          },
          {
            id: 'jiradc_ssl',
            label: 'Valid Public SSL Certificate',
            subLabel: 'Jira DC endpoint uses a trusted CA certificate (no self-signed certs).',
            badge: 'Required',
          },
        ],
      },
      {
        id: 'auth',
        title: 'Authentication & Personal Access Token',
        stepNumber: 2,
        description: 'Verify Personal Access Token (PAT) or Service Account credentials.',
        items: [
          {
            id: 'jiradc_pat',
            label: 'Personal Access Token (PAT) Active',
            subLabel: 'Unexpired PAT provisioned for service user with Browse Projects permissions.',
            badge: 'Required',
          },
        ],
      },
    ],
  },

  CONFLUENCE: {
    vendorId: 'CONFLUENCE',
    vendorDisplayName: 'Atlassian Confluence Cloud',
    category: 'Enterprise Platforms',
    detectionPatterns: {
      dataSources: ['confluence'],
      nameSubstrings: ['confluence'],
    },
    supportsDataModeToggle: true,
    supportsActions: true,
    documentationUrl: 'https://docs.cloud.google.com/gemini/enterprise/docs/connectors/confluence-cloud/third-party-config',
    sections: [
      {
        id: 'auth',
        title: 'Authentication & App Credentials',
        stepNumber: 1,
        description: 'OAuth 2.0 app settings in Atlassian Developer Console.',
        items: [
          {
            id: 'conf_creds',
            label: 'Atlassian OAuth 2.0 App Provisioned',
            subLabel: 'App configured with offline_access and Confluence API scopes.',
            badge: 'Required',
          },
          {
            id: 'conf_connector_status',
            label: 'Connector Health Status',
            subLabel: 'Connector state is active with no authorization errors.',
            badge: 'Automated',
            automatedProbe: {
              type: 'CONNECTOR_STATUS',
              description: 'Validates connector health.',
            },
          },
        ],
      },
      {
        id: 'scopes',
        title: 'Confluence Cloud Read Scopes',
        stepNumber: 2,
        description: 'Required permissions to crawl Confluence spaces, pages, and attachments.',
        items: [
          {
            id: 'conf_read_confluence_content',
            label: 'read:confluence-content.summary & read:confluence-space.summary',
            subLabel: 'Grants access to list spaces and search page contents.',
            codeSnippet: 'read:confluence-content.summary read:confluence-space.summary',
            badge: 'Required',
          },
          {
            id: 'conf_read_confluence_user',
            label: 'read:confluence-user',
            subLabel: 'Resolves page authors and permissions for ACL trimming.',
            codeSnippet: 'read:confluence-user',
            badge: 'Required',
            appliesToMode: 'FEDERATED',
          },
        ],
      },
      {
        id: 'conf_actions_section',
        title: 'Assistant Actions & Write Permissions',
        stepNumber: 3,
        description: 'Permissions and redirect URIs allowing Gemini Assistant to create, edit, and publish Confluence pages and spaces.',
        items: [
          {
            id: 'conf_action_redirect_uri',
            label: 'Actions Redirect URI Allowlisted',
            subLabel: 'Actions always use https://vertexaisearch.cloud.google.com/oauth-redirect. Required in Atlassian Developer Console.',
            codeSnippet: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'conf_scope_write_content',
            label: 'write:confluence-content Scope',
            subLabel: 'Allows the assistant to create, update, and publish Confluence pages and blog posts.',
            codeSnippet: 'write:confluence-content',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'conf_scope_write_space',
            label: 'write:confluence-space Scope',
            subLabel: 'Allows the assistant to create and manage Confluence spaces.',
            codeSnippet: 'write:confluence-space',
            badge: 'Recommended',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'conf_scope_write_props',
            label: 'write:confluence-props Scope',
            subLabel: 'Allows the assistant to edit page properties, labels, and metadata.',
            codeSnippet: 'write:confluence-props',
            badge: 'Optional',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'conf_scope_write_comment',
            label: 'write:comment:confluence Scope',
            subLabel: 'Allows the assistant to post comments on Confluence pages.',
            codeSnippet: 'write:comment:confluence',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'conf_action_space_perms',
            label: 'User Space Write Permissions',
            subLabel: 'Authenticating user must have Add Page, Edit Page, and Add Comment permissions in target Confluence spaces.',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
        ],
      },
    ],
  },

  CONFLUENCE_DC: {
    vendorId: 'CONFLUENCE_DC',
    vendorDisplayName: 'Atlassian Confluence Data Center',
    category: 'Enterprise Platforms',
    detectionPatterns: {
      dataSources: ['confluence_dc', 'confluence-dc'],
      nameSubstrings: ['confluence_dc', 'confluence-dc', 'confluencedc'],
    },
    supportsDataModeToggle: true,
    documentationUrl: 'https://cloud.google.com/generative-ai-app-builder/docs/connectors/confluence-dc',
    sections: [
      {
        id: 'network',
        title: 'Network & SSL',
        stepNumber: 1,
        description: 'Verify network path from Google Cloud to Confluence Data Center.',
        items: [
          {
            id: 'confdc_network',
            label: 'Inbound Firewall Allowlist',
            subLabel: 'Confluence DC instance reachable from Google Cloud static IPs.',
            badge: 'Required',
          },
          {
            id: 'confdc_pat',
            label: 'Personal Access Token (PAT)',
            subLabel: 'Service account PAT with read access to target spaces.',
            badge: 'Required',
          },
        ],
      },
    ],
  },

  SALESFORCE: {
    vendorId: 'SALESFORCE',
    vendorDisplayName: 'Salesforce CRM',
    category: 'Enterprise Platforms',
    detectionPatterns: {
      dataSources: ['salesforce'],
      nameSubstrings: ['salesforce', 'sfdc'],
    },
    supportsDataModeToggle: true,
    supportsActions: true,
    documentationUrl: 'https://docs.cloud.google.com/gemini/enterprise/docs/connectors/salesforce/salesforce-configuration',
    sections: [
      {
        id: 'connected_app',
        title: 'Connected App & OAuth',
        stepNumber: 1,
        description: 'Salesforce Connected App configuration for REST API access.',
        items: [
          {
            id: 'sf_app',
            label: 'Connected App Provisioned',
            subLabel: 'Connected App created in Salesforce Setup with OAuth settings enabled.',
            badge: 'Required',
          },
          {
            id: 'sf_refresh_token',
            label: 'refresh_token Scope Configured',
            subLabel: 'Perform requests on your behalf at any time (refresh_token, offline_access).',
            codeSnippet: 'api refresh_token offline_access',
            badge: 'Required',
          },
        ],
      },
      {
        id: 'api_permissions',
        title: 'Object & Field Level Security (Read)',
        stepNumber: 2,
        description: 'Ensure integration user has read permissions on standard & custom objects.',
        items: [
          {
            id: 'sf_api_enabled',
            label: '"API Enabled" Profile Permission',
            subLabel: 'Integration user profile or permission set has API Enabled flag checked.',
            badge: 'Required',
          },
          {
            id: 'sf_read_objects',
            label: 'Read Access to Target Objects (Account, Lead, Case, Contact)',
            subLabel: 'Field-level security permits reading indexed fields.',
            badge: 'Required',
          },
        ],
      },
      {
        id: 'sf_actions_section',
        title: 'Assistant Actions & Write Permissions',
        stepNumber: 3,
        description: 'Permissions allowing Gemini Assistant to create leads, update contacts, and log tasks in Salesforce.',
        items: [
          {
            id: 'sf_action_redirect_uri',
            label: 'Actions Redirect URI Allowlisted',
            subLabel: 'Actions always use https://vertexaisearch.cloud.google.com/oauth-redirect. Add to Connected App Callback URLs.',
            codeSnippet: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'sf_action_object_perms',
            label: 'Standard Object Create/Edit Permissions',
            subLabel: 'User profile or permission set must grant "Create" and "Edit" permissions on Lead, Contact, Opportunity, and Task.',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'sf_action_fls',
            label: 'Field-Level Security (FLS) Write Access',
            subLabel: 'Ensure write access is permitted for essential fields (e.g., Lead Status, Account Name, Stage, Description).',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'sf_action_ip_relaxation',
            label: 'Connected App IP Relaxation Policy',
            subLabel: 'Set "IP Relaxation" to "Relax IP restrictions" or allowlist Google Cloud Static Egress IPs in Network Access.',
            badge: 'Recommended',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
        ],
      },
    ],
  },

  SERVICENOW: {
    vendorId: 'SERVICENOW',
    vendorDisplayName: 'ServiceNow',
    category: 'Enterprise Platforms',
    detectionPatterns: {
      dataSources: ['servicenow'],
      nameSubstrings: ['servicenow', 'snow'],
    },
    supportsDataModeToggle: true,
    supportsActions: true,
    documentationUrl: 'https://docs.cloud.google.com/gemini/enterprise/docs/connectors/servicenow/third-party-config',
    sections: [
      {
        id: 'endpoint_auth',
        title: 'Instance Endpoint & OAuth',
        stepNumber: 1,
        description: 'Verify ServiceNow instance URL and OAuth client credentials.',
        items: [
          {
            id: 'snow_oauth',
            label: 'OAuth Client Application Created',
            subLabel: 'Created in ServiceNow Application Registry (OAuth API endpoint for external clients).',
            badge: 'Required',
          },
          {
            id: 'snow_user_role',
            label: 'Integration User Roles (itil / snc_internal)',
            subLabel: 'Service account has required roles to read knowledge base, incidents, and catalog items.',
            badge: 'Required',
          },
        ],
      },
      {
        id: 'snow_actions_section',
        title: 'Assistant Actions & Write Permissions',
        stepNumber: 2,
        description: 'Permissions and roles allowing Gemini Assistant to create, update, and resolve ServiceNow incidents and requests.',
        items: [
          {
            id: 'snow_action_redirect_uri',
            label: 'Actions Redirect URI Allowlisted',
            subLabel: 'Actions always use https://vertexaisearch.cloud.google.com/oauth-redirect. Required in Application Registry.',
            codeSnippet: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'snow_action_itil_role',
            label: 'ITIL Role Assignment (itil / itil_admin)',
            subLabel: 'Service account or authenticating user must possess itil role to create and update incidents and change requests.',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'snow_action_table_acls',
            label: 'Table Write ACLs Granted (incident & sys_journal_field)',
            subLabel: 'Write Access Control Lists (ACLs) granted on incident table and sys_journal_field (for comments and work notes).',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'snow_action_rest_api',
            label: 'REST API Table API Write Access',
            subLabel: 'Verify ACL allows POST and PATCH operations on /api/now/table/incident.',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
        ],
      },
    ],
  },

  SHAREPOINT: {
    vendorId: 'SHAREPOINT',
    vendorDisplayName: 'Microsoft SharePoint Online',
    category: 'Enterprise Platforms',
    detectionPatterns: {
      dataSources: ['sharepoint'],
      nameSubstrings: ['sharepoint'],
    },
    supportsDataModeToggle: true,
    supportsActions: true,
    documentationUrl: 'https://docs.cloud.google.com/gemini/enterprise/docs/connectors/ms-sharepoint/third-party-config',
    sections: [
      {
        id: 'azure_app',
        title: 'Microsoft Entra ID (Azure AD) App Registration',
        stepNumber: 1,
        description: 'App registration in Microsoft Azure portal with Microsoft Graph API permissions.',
        items: [
          {
            id: 'sp_azure_app',
            label: 'Azure App Registration Created',
            subLabel: 'App registered with Multi-tenant or Single-tenant account support and client secret.',
            badge: 'Required',
          },
          {
            id: 'sp_admin_consent',
            label: 'Admin Consent Granted',
            subLabel: 'Azure Global Administrator granted tenant-wide admin consent for requested permissions.',
            badge: 'Required',
          },
        ],
      },
      {
        id: 'graph_permissions',
        title: 'Microsoft Graph API Read Permissions',
        stepNumber: 2,
        description: 'Verify Application permissions granted to the Azure App for search.',
        items: [
          {
            id: 'sp_sites_read_all',
            label: 'Sites.Read.All (Application)',
            subLabel: 'Allows reading all site collections, document libraries, and lists.',
            codeSnippet: 'Sites.Read.All',
            badge: 'Required',
          },
          {
            id: 'sp_user_read_all',
            label: 'User.Read.All (Application)',
            subLabel: 'Required for identity mapping and ACL permission trimming.',
            codeSnippet: 'User.Read.All',
            badge: 'Required',
          },
        ],
      },
      {
        id: 'sp_actions_section',
        title: 'Assistant Actions & Write Permissions',
        stepNumber: 3,
        description: 'Microsoft Graph permissions allowing Gemini Assistant to upload files, modify lists, and edit documents.',
        items: [
          {
            id: 'sp_action_redirect_uri',
            label: 'Actions Redirect URI Allowlisted',
            subLabel: 'Actions always use https://vertexaisearch.cloud.google.com/oauth-redirect.',
            codeSnippet: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'sp_scope_files_readwrite',
            label: 'Files.ReadWrite.All (Application)',
            subLabel: 'Allows the assistant to upload files, modify documents, and create folders in SharePoint.',
            codeSnippet: 'Files.ReadWrite.All',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'sp_scope_sites_readwrite',
            label: 'Sites.ReadWrite.All (Application)',
            subLabel: 'Allows the assistant to update lists, edit items, and manage documents across SharePoint site collections.',
            codeSnippet: 'Sites.ReadWrite.All',
            badge: 'Recommended',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'sp_action_admin_consent',
            label: 'Admin Consent for Write Permissions',
            subLabel: 'Global Admin must grant consent for Files.ReadWrite.All and Sites.ReadWrite.All.',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
        ],
      },
    ],
  },
  OUTLOOK: {
    vendorId: 'OUTLOOK',
    vendorDisplayName: 'Microsoft Outlook & Exchange',
    category: 'Enterprise Platforms',
    detectionPatterns: {
      dataSources: ['outlook', 'ms_outlook'],
      nameSubstrings: ['outlook', 'ms-outlook'],
    },
    supportsDataModeToggle: true,
    supportsActions: true,
    documentationUrl: 'https://docs.cloud.google.com/gemini/enterprise/docs/connectors/ms-outlook/third-party-config',
    sections: [
      {
        id: 'azure_app',
        title: 'Azure AD App Registration & Read Scopes',
        stepNumber: 1,
        description: 'Microsoft Graph Mail and Calendar permissions for indexing and search.',
        items: [
          {
            id: 'outlook_mail_read',
            label: 'Mail.Read (or Mail.ReadBasic.All)',
            subLabel: 'Allows reading emails and message bodies.',
            codeSnippet: 'Mail.Read',
            badge: 'Required',
          },
          {
            id: 'outlook_calendars_read',
            label: 'Calendars.Read',
            subLabel: 'Allows reading calendar events and meetings.',
            codeSnippet: 'Calendars.Read',
            badge: 'Optional',
          },
        ],
      },
      {
        id: 'outlook_actions_section',
        title: 'Assistant Actions & Write Permissions',
        stepNumber: 2,
        description: 'Microsoft Graph write permissions allowing Gemini Assistant to compose emails, send messages, and schedule meetings.',
        items: [
          {
            id: 'outlook_action_redirect_uri',
            label: 'Actions Redirect URI Allowlisted',
            subLabel: 'Actions always use https://vertexaisearch.cloud.google.com/oauth-redirect.',
            codeSnippet: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'outlook_scope_mail_send',
            label: 'Mail.Send Permission',
            subLabel: 'Allows the assistant to compose and send email messages on behalf of the signed-in user.',
            codeSnippet: 'Mail.Send',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'outlook_scope_calendars_write',
            label: 'Calendars.ReadWrite Permission',
            subLabel: 'Allows the assistant to create, update, and reschedule calendar meetings and events.',
            codeSnippet: 'Calendars.ReadWrite',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'outlook_scope_mail_write',
            label: 'Mail.ReadWrite Permission',
            subLabel: 'Allows the assistant to create drafts, move emails between folders, and mark messages as read.',
            codeSnippet: 'Mail.ReadWrite',
            badge: 'Optional',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'outlook_action_admin_consent',
            label: 'Tenant Admin Consent for Write Permissions',
            subLabel: 'Microsoft Entra Global Admin must click "Grant admin consent" for Mail.Send and Calendars.ReadWrite.',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
        ],
      },
    ],
  },

  TEAMS: {
    vendorId: 'TEAMS',
    vendorDisplayName: 'Microsoft Teams',
    category: 'Enterprise Platforms',
    detectionPatterns: {
      dataSources: ['teams', 'ms_teams'],
      nameSubstrings: ['teams', 'ms-teams'],
    },
    supportsDataModeToggle: true,
    supportsActions: true,
    documentationUrl: 'https://docs.cloud.google.com/gemini/enterprise/docs/connectors/ms-teams/ms-teams-config',
    sections: [
      {
        id: 'azure_app',
        title: 'Microsoft Teams Read Permissions',
        stepNumber: 1,
        description: 'Microsoft Graph Chat and Channel permissions for indexing and search.',
        items: [
          {
            id: 'teams_channel_read',
            label: 'ChannelMessage.Read.All',
            subLabel: 'Allows reading messages across standard and private channels.',
            codeSnippet: 'ChannelMessage.Read.All',
            badge: 'Required',
          },
          {
            id: 'teams_team_read',
            label: 'Team.ReadBasic.All',
            subLabel: 'Allows reading team rosters and channel hierarchies.',
            codeSnippet: 'Team.ReadBasic.All',
            badge: 'Required',
          },
        ],
      },
      {
        id: 'teams_actions_section',
        title: 'Assistant Actions & Write Permissions',
        stepNumber: 2,
        description: 'Microsoft Graph permissions allowing Gemini Assistant to post channel messages, send chats, and schedule Teams calls.',
        items: [
          {
            id: 'teams_action_redirect_uri',
            label: 'Actions Redirect URI Allowlisted',
            subLabel: 'Actions always use https://vertexaisearch.cloud.google.com/oauth-redirect.',
            codeSnippet: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'teams_scope_channel_send',
            label: 'ChannelMessage.Send Permission',
            subLabel: 'Allows the assistant to post messages and announcements into Microsoft Teams channels.',
            codeSnippet: 'ChannelMessage.Send',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'teams_scope_chat_send',
            label: 'ChatMessage.Send Permission',
            subLabel: 'Allows the assistant to send direct messages and group chats in Microsoft Teams.',
            codeSnippet: 'ChatMessage.Send',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'teams_scope_meetings_write',
            label: 'OnlineMeetings.ReadWrite Permission',
            subLabel: 'Allows the assistant to schedule Teams video meetings and invite attendees.',
            codeSnippet: 'OnlineMeetings.ReadWrite',
            badge: 'Optional',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'teams_admin_consent',
            label: 'Tenant Admin Consent Granted',
            subLabel: 'Microsoft Entra Global Admin has consented to Teams write permissions.',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
        ],
      },
    ],
  },

  ONEDRIVE: {
    vendorId: 'ONEDRIVE',
    vendorDisplayName: 'Microsoft OneDrive for Business',
    category: 'Enterprise Platforms',
    detectionPatterns: {
      dataSources: ['onedrive'],
      nameSubstrings: ['onedrive'],
    },
    supportsDataModeToggle: true,
    supportsActions: true,
    documentationUrl: 'https://docs.cloud.google.com/gemini/enterprise/docs/connectors/ms-onedrive/third-party-config',
    sections: [
      {
        id: 'azure_app',
        title: 'Microsoft Entra ID App Registration',
        stepNumber: 1,
        description: 'Azure App registration for OneDrive file search.',
        items: [
          {
            id: 'on_files_read_all',
            label: 'Files.Read.All (Application)',
            subLabel: 'Allows indexing files across all user OneDrive for Business accounts.',
            codeSnippet: 'Files.Read.All',
            badge: 'Required',
          },
          {
            id: 'on_admin_consent',
            label: 'Admin Consent Granted',
            subLabel: 'Global Administrator granted consent.',
            badge: 'Required',
          },
        ],
      },
      {
        id: 'on_actions_section',
        title: 'Assistant Actions & Write Permissions',
        stepNumber: 2,
        description: 'Microsoft Graph permissions allowing Gemini Assistant to upload files and organize folders in OneDrive.',
        items: [
          {
            id: 'on_action_redirect_uri',
            label: 'Actions Redirect URI Allowlisted',
            subLabel: 'Actions always use https://vertexaisearch.cloud.google.com/oauth-redirect.',
            codeSnippet: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'on_scope_files_readwrite',
            label: 'Files.ReadWrite.All (Application)',
            subLabel: 'Allows the assistant to upload files and organize documents in user OneDrive drives.',
            codeSnippet: 'Files.ReadWrite.All',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
        ],
      },
    ],
  },
  ENTRA_ID: {
    vendorId: 'ENTRA_ID',
    vendorDisplayName: 'Microsoft Entra ID (Azure AD Directory)',
    category: 'Enterprise Platforms',
    detectionPatterns: {
      dataSources: ['entra_id', 'entra', 'azure_active_directory'],
      nameSubstrings: ['entra', 'azure-ad'],
    },
    supportsDataModeToggle: true,
    documentationUrl: 'https://cloud.google.com/generative-ai-app-builder/docs/connectors/entraid',
    sections: [
      {
        id: 'directory_read',
        title: 'Directory & Group Membership Permissions',
        stepNumber: 1,
        description: 'Verify Microsoft Graph Directory permissions.',
        items: [
          {
            id: 'entra_directory_read_all',
            label: 'Directory.Read.All',
            subLabel: 'Allows reading directory data, users, groups, and administrative units.',
            codeSnippet: 'Directory.Read.All',
            badge: 'Required',
          },
        ],
      },
    ],
  },

  SLACK: {
    vendorId: 'SLACK',
    vendorDisplayName: 'Slack',
    category: 'Enterprise Platforms',
    detectionPatterns: {
      dataSources: ['slack'],
      nameSubstrings: ['slack'],
    },
    supportsDataModeToggle: true,
    supportsActions: true,
    documentationUrl: 'https://docs.cloud.google.com/gemini/enterprise/docs/connectors/slack/set-up-data-store',
    sections: [
      {
        id: 'slack_app',
        title: 'Slack App & Read Scopes',
        stepNumber: 1,
        description: 'Verify Slack App permissions in Slack API Dashboard for search.',
        items: [
          {
            id: 'slack_channels_read',
            label: 'channels:read & channels:history',
            subLabel: 'Grants access to index public channels and message threads.',
            codeSnippet: 'channels:read channels:history',
            badge: 'Required',
          },
          {
            id: 'slack_users_read',
            label: 'users:read & users:read.email',
            subLabel: 'Maps Slack usernames to email addresses for security trimming.',
            codeSnippet: 'users:read users:read.email',
            badge: 'Required',
          },
        ],
      },
      {
        id: 'slack_actions_section',
        title: 'Assistant Actions & Write Permissions',
        stepNumber: 2,
        description: 'Slack OAuth scopes allowing Gemini Assistant to post messages, create channels, and upload files.',
        items: [
          {
            id: 'slack_action_redirect_uri',
            label: 'Actions Redirect URI Allowlisted',
            subLabel: 'Actions always use https://vertexaisearch.cloud.google.com/oauth-redirect.',
            codeSnippet: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'slack_scope_chat_write',
            label: 'chat:write Scope',
            subLabel: 'Allows the assistant to post messages and task updates in Slack channels.',
            codeSnippet: 'chat:write',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'slack_scope_channels_manage',
            label: 'channels:manage Scope',
            subLabel: 'Allows the assistant to create, archive, and manage public discussion channels.',
            codeSnippet: 'channels:manage',
            badge: 'Optional',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'slack_scope_files_write',
            label: 'files:write Scope',
            subLabel: 'Allows the assistant to upload code snippets, documents, and attachments into Slack conversations.',
            codeSnippet: 'files:write',
            badge: 'Optional',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
        ],
      },
    ],
  },
  DROPBOX: {
    vendorId: 'DROPBOX',
    vendorDisplayName: 'Dropbox Business',
    category: 'Productivity & Tasks',
    detectionPatterns: {
      dataSources: ['dropbox'],
      nameSubstrings: ['dropbox'],
    },
    supportsDataModeToggle: false,
    documentationUrl: 'https://cloud.google.com/generative-ai-app-builder/docs/connectors/dropbox',
    sections: [
      {
        id: 'dropbox_auth',
        title: 'Dropbox App & Permissions',
        stepNumber: 1,
        description: 'Dropbox App Console permissions.',
        items: [
          {
            id: 'dropbox_files_content_read',
            label: 'files.content.read',
            subLabel: 'Allows indexing files and contents.',
            codeSnippet: 'files.content.read',
            badge: 'Required',
          },
          {
            id: 'dropbox_team_members_read',
            label: 'members.read',
            subLabel: 'Enables identity resolution for team members.',
            codeSnippet: 'members.read',
            badge: 'Required',
          },
        ],
      },
    ],
  },

  NOTION: {
    vendorId: 'NOTION',
    vendorDisplayName: 'Notion',
    category: 'Productivity & Tasks',
    detectionPatterns: {
      dataSources: ['notion'],
      nameSubstrings: ['notion'],
    },
    supportsDataModeToggle: false,
    documentationUrl: 'https://cloud.google.com/generative-ai-app-builder/docs/connectors/notion',
    sections: [
      {
        id: 'notion_auth',
        title: 'Notion Integration & Page Access',
        stepNumber: 1,
        description: 'Verify Notion internal integration token and shared pages.',
        items: [
          {
            id: 'notion_token',
            label: 'Internal Integration Secret',
            subLabel: 'Unexpired token generated in Notion Developer Portal.',
            badge: 'Required',
          },
          {
            id: 'notion_page_access',
            label: 'Integration Invited to Target Pages',
            subLabel: 'Integration bot explicitly added via "Connect to" menu on workspace pages.',
            badge: 'Required',
          },
        ],
      },
    ],
  },

  ZENDESK: {
    vendorId: 'ZENDESK',
    vendorDisplayName: 'Zendesk Support',
    category: 'Customer Support & CRM',
    detectionPatterns: {
      dataSources: ['zendesk'],
      nameSubstrings: ['zendesk'],
    },
    supportsDataModeToggle: false,
    supportsActions: true,
    documentationUrl: 'https://docs.cloud.google.com/gemini/enterprise/docs/connectors/zendesk/zendesk-config',
    sections: [
      {
        id: 'zendesk_auth',
        title: 'Zendesk API & Admin Access',
        stepNumber: 1,
        description: 'Verify Zendesk API token or OAuth credentials for search.',
        items: [
          {
            id: 'zendesk_token',
            label: 'API Token / OAuth Client',
            subLabel: 'Generated in Zendesk Admin Center > Apps and Integrations > APIs.',
            badge: 'Required',
          },
          {
            id: 'zendesk_tickets_read',
            label: 'Tickets & Help Center Read Access',
            subLabel: 'Service agent role permits viewing all required ticket brands and guide articles.',
            badge: 'Required',
          },
        ],
      },
      {
        id: 'zendesk_actions_section',
        title: 'Assistant Actions & Write Permissions',
        stepNumber: 2,
        description: 'Zendesk scopes allowing Gemini Assistant to create tickets, update status, and add internal notes.',
        items: [
          {
            id: 'zendesk_action_redirect_uri',
            label: 'Actions Redirect URI Allowlisted',
            subLabel: 'Actions always use https://vertexaisearch.cloud.google.com/oauth-redirect.',
            codeSnippet: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'zendesk_scope_tickets_write',
            label: 'tickets:write Scope',
            subLabel: 'Allows the assistant to create, update, and resolve support tickets.',
            codeSnippet: 'tickets:write',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'zendesk_action_agent_role',
            label: 'Agent Role Assignment',
            subLabel: 'Authenticating user or service account must possess an Agent seat with ticket creation and internal note privileges.',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
        ],
      },
    ],
  },
  BOX: {
    vendorId: 'BOX',
    vendorDisplayName: 'Box',
    category: 'Enterprise Platforms',
    detectionPatterns: {
      dataSources: ['box'],
      nameSubstrings: ['box'],
    },
    supportsDataModeToggle: true,
    documentationUrl: 'https://cloud.google.com/generative-ai-app-builder/docs/connectors/box',
    sections: [
      {
        id: 'box_app',
        title: 'Box Custom App & JWT / OAuth',
        stepNumber: 1,
        description: 'Box Developer Console app settings.',
        items: [
          {
            id: 'box_custom_app',
            label: 'Custom App Authorized in Box Admin Console',
            subLabel: 'App authorization submitted and approved by Box enterprise administrator.',
            badge: 'Required',
          },
          {
            id: 'box_read_files',
            label: 'Read All Files and Folders Stored in Box',
            subLabel: 'Application scope granted in Developer Console.',
            badge: 'Required',
          },
        ],
      },
    ],
  },

  GITHUB: {
    vendorId: 'GITHUB',
    vendorDisplayName: 'GitHub',
    category: 'Enterprise Platforms',
    detectionPatterns: {
      dataSources: ['github'],
      nameSubstrings: ['github'],
    },
    supportsDataModeToggle: false,
    supportsActions: true,
    documentationUrl: 'https://docs.cloud.google.com/gemini/enterprise/docs/connectors/github/github-configuration',
    sections: [
      {
        id: 'github_app',
        title: 'GitHub App / Personal Access Token',
        stepNumber: 1,
        description: 'Verify GitHub repository read permissions for indexing and search.',
        items: [
          {
            id: 'github_repo_scope',
            label: 'repo / Contents: Read',
            subLabel: 'Grants access to code, pull requests, issues, and wiki documentation.',
            codeSnippet: 'repo read:org',
            badge: 'Required',
          },
        ],
      },
      {
        id: 'github_actions_section',
        title: 'Assistant Actions & Write Permissions',
        stepNumber: 2,
        description: 'Permissions allowing Gemini Assistant to create issues, open pull requests, and manage repository assets.',
        items: [
          {
            id: 'github_action_redirect_uri',
            label: 'Actions Redirect URI Allowlisted',
            subLabel: 'Actions always use https://vertexaisearch.cloud.google.com/oauth-redirect.',
            codeSnippet: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'github_scope_issues_write',
            label: 'issues:write Scope',
            subLabel: 'Allows the assistant to create, comment on, and assign GitHub issues.',
            codeSnippet: 'issues:write',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'github_scope_pr_write',
            label: 'pull_requests:write Scope',
            subLabel: 'Allows the assistant to open and update pull requests.',
            codeSnippet: 'pull_requests:write',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'github_scope_repo',
            label: 'repo Scope (Private Repositories)',
            subLabel: 'Grants full control of private repositories, branch creation, and commit authoring.',
            codeSnippet: 'repo',
            badge: 'Recommended',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
        ],
      },
    ],
  },
  HUBSPOT: {
    vendorId: 'HUBSPOT',
    vendorDisplayName: 'HubSpot',
    category: 'Customer Support & CRM',
    detectionPatterns: {
      dataSources: ['hubspot'],
      nameSubstrings: ['hubspot'],
    },
    supportsDataModeToggle: false,
    documentationUrl: 'https://cloud.google.com/generative-ai-app-builder/docs/connectors/hubspot',
    sections: [
      {
        id: 'hubspot_auth',
        title: 'HubSpot Private App & Scopes',
        stepNumber: 1,
        description: 'CRM object read permissions.',
        items: [
          {
            id: 'hubspot_crm_objects',
            label: 'crm.objects.contacts.read & crm.objects.companies.read',
            subLabel: 'Allows indexing contact, company, deal, and ticket records.',
            codeSnippet: 'crm.objects.contacts.read crm.objects.companies.read',
            badge: 'Required',
          },
        ],
      },
    ],
  },

  LINEAR: {
    vendorId: 'LINEAR',
    vendorDisplayName: 'Linear',
    category: 'Productivity & Tasks',
    detectionPatterns: {
      dataSources: ['linear'],
      nameSubstrings: ['linear'],
    },
    supportsDataModeToggle: false,
    documentationUrl: 'https://cloud.google.com/generative-ai-app-builder/docs/connectors/linear',
    sections: [
      {
        id: 'linear_auth',
        title: 'Linear API Key & Scopes',
        stepNumber: 1,
        description: 'Read scopes for issues, projects, and comments.',
        items: [
          {
            id: 'linear_read',
            label: 'read scope',
            subLabel: 'Grants access to read issues, cycles, documents, and comments.',
            codeSnippet: 'read',
            badge: 'Required',
          },
        ],
      },
    ],
  },

  MONDAY: {
    vendorId: 'MONDAY',
    vendorDisplayName: 'Monday.com',
    category: 'Productivity & Tasks',
    detectionPatterns: {
      dataSources: ['monday'],
      nameSubstrings: ['monday'],
    },
    supportsDataModeToggle: false,
    documentationUrl: 'https://cloud.google.com/generative-ai-app-builder/docs/connectors/monday',
    sections: [
      {
        id: 'monday_auth',
        title: 'Monday.com API Token',
        stepNumber: 1,
        description: 'Boards and workspace read permissions.',
        items: [
          {
            id: 'monday_boards_read',
            label: 'boards:read',
            subLabel: 'Allows reading boards, groups, items, and column values.',
            codeSnippet: 'boards:read',
            badge: 'Required',
          },
        ],
      },
    ],
  },

  SHOPIFY: {
    vendorId: 'SHOPIFY',
    vendorDisplayName: 'Shopify',
    category: 'Customer Support & CRM',
    detectionPatterns: {
      dataSources: ['shopify'],
      nameSubstrings: ['shopify'],
    },
    supportsDataModeToggle: false,
    documentationUrl: 'https://cloud.google.com/generative-ai-app-builder/docs/connectors/shopify',
    sections: [
      {
        id: 'shopify_auth',
        title: 'Shopify Custom App API Access',
        stepNumber: 1,
        description: 'Admin API scopes for products and orders.',
        items: [
          {
            id: 'shopify_read_products',
            label: 'read_products & read_orders',
            subLabel: 'Allows indexing product catalogs, collections, and order records.',
            codeSnippet: 'read_products read_orders',
            badge: 'Required',
          },
        ],
      },
    ],
  },

  GITLAB: {
    vendorId: 'GITLAB',
    vendorDisplayName: 'GitLab',
    category: 'Enterprise Platforms',
    detectionPatterns: {
      dataSources: ['gitlab', 'gitlab_cloud', 'gitlab_self_managed'],
      nameSubstrings: ['gitlab'],
    },
    supportsDataModeToggle: false,
    supportsActions: true,
    documentationUrl: 'https://docs.cloud.google.com/gemini/enterprise/docs/connectors/gitlab/gitlab-configuration',
    sections: [
      {
        id: 'gitlab_auth',
        title: 'GitLab Access Token & Scopes',
        stepNumber: 1,
        description: 'Verify Personal Access Token (PAT) or Project Token with repository read scopes.',
        items: [
          {
            id: 'gitlab_token',
            label: 'Personal / Project Access Token',
            subLabel: 'Token generated with read permissions for target groups or projects.',
            badge: 'Required',
          },
          {
            id: 'gitlab_scopes_read',
            label: 'read_api & read_repository Scopes',
            subLabel: 'Grants read access to code repositories, commit logs, merge requests, and issue discussions.',
            codeSnippet: 'read_api read_repository read_user',
            badge: 'Required',
          },
          {
            id: 'gitlab_service_agent_probe',
            label: 'Discovery Engine Service Agent Role',
            subLabel: 'GCP Service Agent must be granted Discovery Engine Service Agent role.',
            badge: 'Automated',
            automatedProbe: {
              type: 'IAM_PERMISSION_CHECK',
              requiredPermissions: ['discoveryengine.dataStores.get'],
              description: 'Checks Discovery Engine Service Agent role.',
            },
          },
        ],
      },
      {
        id: 'gitlab_actions_section',
        title: 'Assistant Actions & Write Permissions',
        stepNumber: 2,
        description: 'Permissions allowing Gemini Assistant to create issues, comment on merge requests, and manage repository assets.',
        items: [
          {
            id: 'gitlab_action_redirect_uri',
            label: 'Actions Redirect URI Allowlisted',
            subLabel: 'Actions always use https://vertexaisearch.cloud.google.com/oauth-redirect.',
            codeSnippet: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'gitlab_scope_api_write',
            label: 'api Scope (Write Access)',
            subLabel: 'Allows the assistant to create issues, submit merge request notes, and update project status.',
            codeSnippet: 'api write_repository',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
        ],
      },
    ],
  },

  ASANA: {
    vendorId: 'ASANA',
    vendorDisplayName: 'Asana',
    category: 'Productivity & Tasks',
    detectionPatterns: {
      dataSources: ['asana'],
      nameSubstrings: ['asana'],
    },
    supportsDataModeToggle: false,
    supportsActions: true,
    documentationUrl: 'https://docs.cloud.google.com/gemini/enterprise/docs/connectors/asana/asana-configuration',
    sections: [
      {
        id: 'asana_auth',
        title: 'Asana Service Account & Permissions',
        stepNumber: 1,
        description: 'Verify workspace token and read access to tasks and projects.',
        items: [
          {
            id: 'asana_token',
            label: 'Service Account Token / PAT Provisioned',
            subLabel: 'Generated in Asana Developer Console with full workspace read permissions.',
            badge: 'Required',
          },
          {
            id: 'asana_workspace_access',
            label: 'Workspace & Organization Membership',
            subLabel: 'Service account added as member to all workspaces and portfolios intended for search.',
            badge: 'Required',
          },
          {
            id: 'asana_service_agent_probe',
            label: 'Discovery Engine Service Agent Role',
            subLabel: 'Verifies GCP service agent has proper Discovery Engine permissions.',
            badge: 'Automated',
            automatedProbe: {
              type: 'IAM_PERMISSION_CHECK',
              requiredPermissions: ['discoveryengine.dataStores.get'],
              description: 'Checks Discovery Engine Service Agent role.',
            },
          },
        ],
      },
      {
        id: 'asana_actions_section',
        title: 'Assistant Actions & Write Permissions',
        stepNumber: 2,
        description: 'Permissions allowing Gemini Assistant to create and assign tasks in Asana projects.',
        items: [
          {
            id: 'asana_action_redirect_uri',
            label: 'Actions Redirect URI Allowlisted',
            subLabel: 'Actions always use https://vertexaisearch.cloud.google.com/oauth-redirect.',
            codeSnippet: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'asana_scope_default_write',
            label: 'default (Read/Write) Scope',
            subLabel: 'Allows Gemini to create tasks, assign assignees, and set due dates in Asana.',
            codeSnippet: 'default',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
        ],
      },
    ],
  },

AIRTABLE: {
    vendorId: 'AIRTABLE',
    vendorDisplayName: 'Airtable',
    category: 'Productivity & Tasks',
    detectionPatterns: {
      dataSources: ['airtable', 'air_table'],
      nameSubstrings: ['airtable', 'air-table', 'air_table'],
    },
    supportsDataModeToggle: false,
    supportsActions: true,
    documentationUrl: 'https://cloud.google.com/generative-ai-app-builder/docs/connectors/airtable',
    sections: [
      {
        id: 'auth_access',
        title: 'Airtable Authentication & Base Configuration',
        stepNumber: 1,
        description: 'Configure Personal Access Token (PAT) or OAuth credentials and designate target Airtable bases.',
        items: [
          {
            id: 'airtable_pat',
            label: 'Personal Access Token (PAT) or OAuth App',
            subLabel: 'Token generated in Airtable Developer Hub with required scopes for designated workspace.',
            badge: 'Required',
            documentationUrl: 'https://airtable.com/create/tokens',
          },
          {
            id: 'airtable_base_scope',
            label: 'Base ID & Table Scopes',
            subLabel: 'Target Base ID (starts with app...) and table names configured for indexing.',
            badge: 'Required',
          },
          {
            id: 'airtable_iam_service_agent',
            label: 'Discovery Engine Service Agent Role',
            subLabel: 'Service Agent has roles/discoveryengine.serviceAgent on the host GCP project.',
            badge: 'Automated',
            automatedProbe: {
              type: 'IAM_PERMISSION_CHECK',
              requiredPermissions: ['discoveryengine.dataStores.get', 'discoveryengine.collections.get'],
              description: 'Checks Discovery Engine service agent role bindings.',
            },
          },
          {
            id: 'airtable_connector_health',
            label: 'Connector State Health',
            subLabel: 'Connector status is ACTIVE with successful base metadata sync.',
            badge: 'Automated',
            automatedProbe: {
              type: 'CONNECTOR_STATUS',
              description: 'Validates connector status and latest sync operation error logs.',
            },
          },
        ],
      },
      {
        id: 'scopes_permissions',
        title: 'Airtable API Read Scopes',
        stepNumber: 2,
        description: 'Verify OAuth or Personal Access Token read permissions.',
        items: [
          {
            id: 'scope_airtable_records_read',
            label: 'data.records:read',
            subLabel: 'Grants read access to table records, fields, and cell values.',
            codeSnippet: 'data.records:read',
            badge: 'Required',
          },
          {
            id: 'scope_airtable_schema_read',
            label: 'schema.bases:read',
            subLabel: 'Allows inspecting table schema, column definitions, and view filters.',
            codeSnippet: 'schema.bases:read',
            badge: 'Required',
          },
          {
            id: 'scope_airtable_user_read',
            label: 'user.email:read',
            subLabel: 'Read collaborator emails for Access Control List (ACL) security trimming.',
            codeSnippet: 'user.email:read',
            badge: 'Optional',
          },
        ],
      },
      {
        id: 'action_capabilities',
        title: 'Airtable Action Capabilities & Write Scopes',
        stepNumber: 3,
        description: 'Configure write permissions for Gemini Enterprise agent actions.',
        items: [
          {
            id: 'airtable_action_write',
            label: 'data.records:write Scope',
            subLabel: 'Allows Gemini Enterprise to create and update records in Airtable bases.',
            codeSnippet: 'data.records:write',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'airtable_action_schema_write',
            label: 'schema.bases:write Scope',
            subLabel: 'Enables programmatic table schema or field adjustments.',
            codeSnippet: 'schema.bases:write',
            badge: 'Optional',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
        ],
      },
    ],
  },

  STRIPE: {
    vendorId: 'STRIPE',
    vendorDisplayName: 'Stripe',
    category: 'Customer Support & CRM',
    detectionPatterns: {
      dataSources: ['stripe'],
      nameSubstrings: ['stripe'],
    },
    supportsDataModeToggle: false,
    supportsActions: true,
    documentationUrl: 'https://cloud.google.com/generative-ai-app-builder/docs/connectors/stripe',
    sections: [
      {
        id: 'auth_access',
        title: 'Stripe API Authentication & Keys',
        stepNumber: 1,
        description: 'Provision a Restricted API Key and webhook signing secret for Stripe integration.',
        items: [
          {
            id: 'stripe_restricted_key',
            label: 'Restricted API Key (rk_live_...) Provisioned',
            subLabel: 'Create a restricted key with read access limited to indexing requirements.',
            badge: 'Required',
            documentationUrl: 'https://dashboard.stripe.com/apikeys',
          },
          {
            id: 'stripe_webhook_secret',
            label: 'Webhook Signing Secret (whsec_...)',
            subLabel: 'Configure webhook endpoints for real-time transaction and customer updates.',
            badge: 'Recommended',
          },
          {
            id: 'stripe_iam_service_agent',
            label: 'Discovery Engine Service Agent Role',
            subLabel: 'Service Agent has roles/discoveryengine.serviceAgent on the host GCP project.',
            badge: 'Automated',
            automatedProbe: {
              type: 'IAM_PERMISSION_CHECK',
              requiredPermissions: ['discoveryengine.dataStores.get', 'discoveryengine.collections.get'],
              description: 'Checks Discovery Engine service agent role bindings.',
            },
          },
          {
            id: 'stripe_connector_health',
            label: 'Connector State Health',
            subLabel: 'Connector status is ACTIVE with successful Stripe sync.',
            badge: 'Automated',
            automatedProbe: {
              type: 'CONNECTOR_STATUS',
              description: 'Validates connector status and latest sync logs.',
            },
          },
        ],
      },
      {
        id: 'scopes_permissions',
        title: 'Stripe Resource Read Permissions',
        stepNumber: 2,
        description: 'Verify restricted key read access for customers, invoices, and charges.',
        items: [
          {
            id: 'scope_stripe_customers_read',
            label: 'Customers Read Access',
            subLabel: 'Access customer profiles, billing addresses, and contact info.',
            codeSnippet: 'rak_customers_read',
            badge: 'Required',
          },
          {
            id: 'scope_stripe_invoices_read',
            label: 'Invoices Read Access',
            subLabel: 'Access invoice PDFs, line items, payment status, and due dates.',
            codeSnippet: 'rak_invoices_read',
            badge: 'Required',
          },
          {
            id: 'scope_stripe_charges_read',
            label: 'Charges & Transactions Read Access',
            subLabel: 'Access card and payout transactions for reconciliation search.',
            codeSnippet: 'rak_charges_read',
            badge: 'Required',
          },
          {
            id: 'scope_stripe_subscriptions_read',
            label: 'Subscriptions & Plans Read Access',
            subLabel: 'Access active subscription tiers, seats, and billing cycles.',
            codeSnippet: 'rak_subscriptions_read',
            badge: 'Optional',
          },
        ],
      },
      {
        id: 'action_capabilities',
        title: 'Stripe Action Capabilities & Write Scopes',
        stepNumber: 3,
        description: 'Configure write permissions for Gemini Enterprise agent actions.',
        items: [
          {
            id: 'stripe_action_invoices_write',
            label: 'Invoices Write Access',
            subLabel: 'Enables creating draft invoices or issuing payment links through Gemini.',
            codeSnippet: 'rak_invoices_write',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'stripe_action_customers_write',
            label: 'Customers Write Access',
            subLabel: 'Enables updating customer billing metadata or creating new customer accounts.',
            codeSnippet: 'rak_customers_write',
            badge: 'Optional',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
        ],
      },
    ],
  },

  INTERCOM: {
    vendorId: 'INTERCOM',
    vendorDisplayName: 'Intercom',
    category: 'Customer Support & CRM',
    detectionPatterns: {
      dataSources: ['intercom'],
      nameSubstrings: ['intercom'],
    },
    supportsDataModeToggle: false,
    supportsActions: true,
    documentationUrl: 'https://cloud.google.com/generative-ai-app-builder/docs/connectors/intercom',
    sections: [
      {
        id: 'auth_access',
        title: 'Intercom Workspace Authentication',
        stepNumber: 1,
        description: 'Configure Intercom Workspace OAuth access token and service agent roles.',
        items: [
          {
            id: 'intercom_access_token',
            label: 'Intercom Workspace Access Token',
            subLabel: 'Extended OAuth access token generated via Intercom Developer Hub.',
            badge: 'Required',
            documentationUrl: 'https://developers.intercom.com/',
          },
          {
            id: 'intercom_workspace_id',
            label: 'Workspace / App ID Configured',
            subLabel: 'Verified Intercom workspace identifier.',
            badge: 'Required',
          },
          {
            id: 'intercom_iam_service_agent',
            label: 'Discovery Engine Service Agent Role',
            subLabel: 'Service Agent has roles/discoveryengine.serviceAgent on the host GCP project.',
            badge: 'Automated',
            automatedProbe: {
              type: 'IAM_PERMISSION_CHECK',
              requiredPermissions: ['discoveryengine.dataStores.get', 'discoveryengine.collections.get'],
              description: 'Checks Discovery Engine service agent role bindings.',
            },
          },
          {
            id: 'intercom_connector_health',
            label: 'Connector State Health',
            subLabel: 'Connector status is ACTIVE with successful conversations sync.',
            badge: 'Automated',
            automatedProbe: {
              type: 'CONNECTOR_STATUS',
              description: 'Validates connector status and latest sync operation error logs.',
            },
          },
        ],
      },
      {
        id: 'scopes_permissions',
        title: 'Intercom API Scopes',
        stepNumber: 2,
        description: 'Verify OAuth scopes for conversations, articles, and contacts.',
        items: [
          {
            id: 'scope_intercom_conversations_read',
            label: 'Read Conversations',
            subLabel: 'Allows indexing support inbox tickets, customer chats, and replies.',
            codeSnippet: 'conversations:read',
            badge: 'Required',
          },
          {
            id: 'scope_intercom_articles_read',
            label: 'Read Articles & Help Center',
            subLabel: 'Indexes published and internal knowledge base articles.',
            codeSnippet: 'articles:read',
            badge: 'Required',
          },
          {
            id: 'scope_intercom_contacts_read',
            label: 'Read Contacts & Companies',
            subLabel: 'Indexes customer attributes, tags, and account records.',
            codeSnippet: 'contacts:read',
            badge: 'Optional',
          },
        ],
      },
      {
        id: 'action_capabilities',
        title: 'Intercom Action Capabilities & Write Scopes',
        stepNumber: 3,
        description: 'Configure write permissions for agent interactions.',
        items: [
          {
            id: 'intercom_action_reply',
            label: 'Write Conversations & Notes',
            subLabel: 'Allows agent to reply to customer conversations or add internal teammate notes.',
            codeSnippet: 'conversations:write',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
        ],
      },
    ],
  },

  FRESHSERVICE: {
    vendorId: 'FRESHSERVICE',
    vendorDisplayName: 'Freshservice',
    category: 'Customer Support & CRM',
    detectionPatterns: {
      dataSources: ['freshservice', 'fresh_service'],
      nameSubstrings: ['freshservice', 'fresh-service', 'fresh_service'],
    },
    supportsDataModeToggle: false,
    supportsActions: true,
    documentationUrl: 'https://cloud.google.com/generative-ai-app-builder/docs/connectors/freshservice',
    sections: [
      {
        id: 'auth_access',
        title: 'Freshservice API & Domain Configuration',
        stepNumber: 1,
        description: 'Configure custom domain, administrator API key, and service agent IAM.',
        items: [
          {
            id: 'freshservice_domain',
            label: 'Custom Domain Configured',
            subLabel: 'Company helpdesk domain (e.g. https://company.freshservice.com).',
            badge: 'Required',
          },
          {
            id: 'freshservice_api_key',
            label: 'Administrator Agent API Key',
            subLabel: 'API key belonging to an agent with admin or supervisor permissions.',
            badge: 'Required',
            documentationUrl: 'https://support.freshservice.com/',
          },
          {
            id: 'freshservice_iam_service_agent',
            label: 'Discovery Engine Service Agent Role',
            subLabel: 'Service Agent has roles/discoveryengine.serviceAgent on the host GCP project.',
            badge: 'Automated',
            automatedProbe: {
              type: 'IAM_PERMISSION_CHECK',
              requiredPermissions: ['discoveryengine.dataStores.get', 'discoveryengine.collections.get'],
              description: 'Checks Discovery Engine service agent role bindings.',
            },
          },
          {
            id: 'freshservice_connector_health',
            label: 'Connector State Health',
            subLabel: 'Connector status is ACTIVE with successful ticket and article sync.',
            badge: 'Automated',
            automatedProbe: {
              type: 'CONNECTOR_STATUS',
              description: 'Validates connector status and latest sync logs.',
            },
          },
        ],
      },
      {
        id: 'scopes_permissions',
        title: 'Freshservice ITSM Data Modules',
        stepNumber: 2,
        description: 'Verify indexing permissions for tickets, solutions, assets, and changes.',
        items: [
          {
            id: 'freshservice_tickets_read',
            label: 'Tickets & Service Requests',
            subLabel: 'Indexes incident reports, requester info, status, and resolution details.',
            badge: 'Required',
          },
          {
            id: 'freshservice_solutions_read',
            label: 'Solution Articles (Knowledge Base)',
            subLabel: 'Indexes published FAQ, SOPs, and internal support manuals.',
            badge: 'Required',
          },
          {
            id: 'freshservice_assets_read',
            label: 'CMDB & Hardware/Software Assets',
            subLabel: 'Indexes configuration items, asset owners, and CI dependencies.',
            badge: 'Optional',
          },
          {
            id: 'freshservice_changes_read',
            label: 'Change & Release Management',
            subLabel: 'Indexes CAB change requests, impact assessments, and rollout plans.',
            badge: 'Optional',
          },
        ],
      },
      {
        id: 'action_capabilities',
        title: 'Freshservice Action Capabilities & Write Scopes',
        stepNumber: 3,
        description: 'Configure write permissions for agent actions.',
        items: [
          {
            id: 'freshservice_action_ticket_create',
            label: 'Create Tickets & Tasks',
            subLabel: 'Enables Gemini to log incident tickets or initiate service requests.',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
        ],
      },
    ],
  },

  MIRO: {
    vendorId: 'MIRO',
    vendorDisplayName: 'Miro',
    category: 'Productivity & Tasks',
    detectionPatterns: {
      dataSources: ['miro'],
      nameSubstrings: ['miro'],
    },
    supportsDataModeToggle: false,
    supportsActions: false,
    documentationUrl: 'https://cloud.google.com/generative-ai-app-builder/docs/connectors/miro',
    sections: [
      {
        id: 'auth_access',
        title: 'Miro OAuth 2.0 App Setup',
        stepNumber: 1,
        description: 'Register OAuth application in Miro Developer Portal with authorized redirect URI.',
        items: [
          {
            id: 'miro_client_credentials',
            label: 'Miro App Client ID & Secret',
            subLabel: 'OAuth application registered in Miro Developer Portal.',
            badge: 'Required',
            documentationUrl: 'https://miro.com/app/settings/developer-teams/',
          },
          {
            id: 'miro_redirect_uri',
            label: 'Authorized Redirect URI Configured',
            subLabel: 'Must match Google Vertex AI Search OAuth callback endpoint.',
            codeSnippet: 'https://vertexaisearch.cloud.google.com/oauth-callback',
            badge: 'Required',
          },
          {
            id: 'miro_iam_service_agent',
            label: 'Discovery Engine Service Agent Role',
            subLabel: 'Service Agent has roles/discoveryengine.serviceAgent on the host GCP project.',
            badge: 'Automated',
            automatedProbe: {
              type: 'IAM_PERMISSION_CHECK',
              requiredPermissions: ['discoveryengine.dataStores.get', 'discoveryengine.collections.get'],
              description: 'Checks Discovery Engine service agent role bindings.',
            },
          },
          {
            id: 'miro_connector_health',
            label: 'Connector State Health',
            subLabel: 'Connector status is ACTIVE with successful boards crawl.',
            badge: 'Automated',
            automatedProbe: {
              type: 'CONNECTOR_STATUS',
              description: 'Validates connector status and sync logs.',
            },
          },
        ],
      },
      {
        id: 'scopes_permissions',
        title: 'Miro OAuth Scopes',
        stepNumber: 2,
        description: 'Verify OAuth scopes granted to the Miro application.',
        items: [
          {
            id: 'scope_miro_boards_read',
            label: 'boards:read',
            subLabel: 'Grants access to read board items, text, sticky notes, and cards.',
            codeSnippet: 'boards:read',
            badge: 'Required',
          },
          {
            id: 'scope_miro_team_read',
            label: 'team:read',
            subLabel: 'Grants access to team memberships for Access Control List (ACL) filtering.',
            codeSnippet: 'team:read',
            badge: 'Required',
          },
          {
            id: 'scope_miro_org_read',
            label: 'organizations:read',
            subLabel: 'Enables enterprise-wide workspace and project discovery.',
            codeSnippet: 'organizations:read',
            badge: 'Optional',
          },
        ],
      },
    ],
  },

  SMARTSHEET: {
    vendorId: 'SMARTSHEET',
    vendorDisplayName: 'Smartsheet',
    category: 'Productivity & Tasks',
    detectionPatterns: {
      dataSources: ['smartsheet', 'smart_sheet'],
      nameSubstrings: ['smartsheet', 'smart-sheet', 'smart_sheet'],
    },
    supportsDataModeToggle: false,
    supportsActions: true,
    documentationUrl: 'https://cloud.google.com/generative-ai-app-builder/docs/connectors/smartsheet',
    sections: [
      {
        id: 'auth_access',
        title: 'Smartsheet API Access & Authentication',
        stepNumber: 1,
        description: 'Generate API Access Token and designate target sheets or workspaces.',
        items: [
          {
            id: 'smartsheet_token',
            label: 'Smartsheet API Access Token',
            subLabel: 'Generated account access token or enterprise OAuth application.',
            badge: 'Required',
            documentationUrl: 'https://app.smartsheet.com/b/home',
          },
          {
            id: 'smartsheet_workspace_selection',
            label: 'Designated Workspaces / Sheets',
            subLabel: 'Configured specific sheet or workspace IDs to index.',
            badge: 'Required',
          },
          {
            id: 'smartsheet_iam_service_agent',
            label: 'Discovery Engine Service Agent Role',
            subLabel: 'Service Agent has roles/discoveryengine.serviceAgent on the host GCP project.',
            badge: 'Automated',
            automatedProbe: {
              type: 'IAM_PERMISSION_CHECK',
              requiredPermissions: ['discoveryengine.dataStores.get', 'discoveryengine.collections.get'],
              description: 'Checks Discovery Engine service agent role bindings.',
            },
          },
          {
            id: 'smartsheet_connector_health',
            label: 'Connector State Health',
            subLabel: 'Connector status is ACTIVE with successful sheet sync.',
            badge: 'Automated',
            automatedProbe: {
              type: 'CONNECTOR_STATUS',
              description: 'Validates connector status and latest sync logs.',
            },
          },
        ],
      },
      {
        id: 'scopes_permissions',
        title: 'Smartsheet Permission Scopes',
        stepNumber: 2,
        description: 'Verify OAuth or Token scopes for sheets, sights, and workspaces.',
        items: [
          {
            id: 'scope_smartsheet_read_sheets',
            label: 'READ_SHEETS',
            subLabel: 'Access sheets, columns, rows, cell values, and attachments.',
            codeSnippet: 'READ_SHEETS',
            badge: 'Required',
          },
          {
            id: 'scope_smartsheet_read_sights',
            label: 'READ_SIGHTS',
            subLabel: 'Access Smartsheet dashboards, metric widgets, and charts.',
            codeSnippet: 'READ_SIGHTS',
            badge: 'Optional',
          },
          {
            id: 'scope_smartsheet_read_workspaces',
            label: 'READ_WORKSPACES',
            subLabel: 'Access workspace structures, folders, and shared user ACLs.',
            codeSnippet: 'READ_WORKSPACES',
            badge: 'Required',
          },
          {
            id: 'scope_smartsheet_admin_webhooks',
            label: 'ADMIN_WEBHOOKS',
            subLabel: 'Register webhook subscriptions for real-time sheet update synchronization.',
            codeSnippet: 'ADMIN_WEBHOOKS',
            badge: 'Recommended',
          },
        ],
      },
      {
        id: 'action_capabilities',
        title: 'Smartsheet Action Capabilities & Write Scopes',
        stepNumber: 3,
        description: 'Configure write permissions for agent actions.',
        items: [
          {
            id: 'smartsheet_action_write',
            label: 'WRITE_SHEETS Scope',
            subLabel: 'Allows Gemini to insert new rows, update status columns, and add comments.',
            codeSnippet: 'WRITE_SHEETS',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
        ],
      },
    ],
  },

  BIGQUERY: {
    vendorId: 'BIGQUERY',
    vendorDisplayName: 'Google BigQuery',
    category: 'Google First-Party & MCP',
    detectionPatterns: {
      dataSources: ['bigquery', 'big_query', 'bq'],
      nameSubstrings: ['bigquery', 'big-query', 'big_query', 'bq-'],
    },
    supportsDataModeToggle: true,
    supportsActions: true,
    documentationUrl: 'https://cloud.google.com/generative-ai-app-builder/docs/connectors/connect-bigquery',
    sections: [
      {
        id: 'auth_access',
        title: 'GCP IAM & Service Agent Roles',
        stepNumber: 1,
        description: 'Ensure the Discovery Engine service agent has required dataset and job permissions.',
        items: [
          {
            id: 'bq_service_agent_viewer',
            label: 'BigQuery Data Viewer Role',
            subLabel: 'Discovery Engine Service Agent must have roles/bigquery.dataViewer on the dataset.',
            badge: 'Required',
            codeSnippet: 'roles/bigquery.dataViewer',
            documentationUrl: 'https://cloud.google.com/bigquery/docs/access-control',
          },
          {
            id: 'bq_service_agent_user',
            label: 'BigQuery Job User Role',
            subLabel: 'Discovery Engine Service Agent must have roles/bigquery.jobUser on the host GCP project.',
            badge: 'Required',
            codeSnippet: 'roles/bigquery.jobUser',
          },
          {
            id: 'bq_region_alignment',
            label: 'Regional Location Match',
            subLabel: 'BigQuery dataset location must match Discovery Engine data store location (e.g. US or EU).',
            badge: 'Required',
          },
          {
            id: 'bq_iam_service_agent',
            label: 'Discovery Engine Service Agent Role',
            subLabel: 'Service Agent has roles/discoveryengine.serviceAgent on the host GCP project.',
            badge: 'Automated',
            automatedProbe: {
              type: 'IAM_PERMISSION_CHECK',
              requiredPermissions: ['discoveryengine.dataStores.get', 'discoveryengine.collections.get'],
              description: 'Checks Discovery Engine service agent role bindings.',
            },
          },
          {
            id: 'bq_connector_health',
            label: 'Connector State Health',
            subLabel: 'Connector status is ACTIVE with successful table crawl.',
            badge: 'Automated',
            automatedProbe: {
              type: 'CONNECTOR_STATUS',
              description: 'Validates connector status and latest sync operation error logs.',
            },
          },
        ],
      },
      {
        id: 'scopes_permissions',
        title: 'Table Schema & Indexing Configuration',
        stepNumber: 2,
        description: 'Verify table schema mapping and partitioning configurations.',
        items: [
          {
            id: 'bq_text_column',
            label: 'Text or URI Column Defined',
            subLabel: 'Target table or view has designated content columns or Cloud Storage URI references.',
            badge: 'Required',
          },
          {
            id: 'bq_incremental_field',
            label: 'Partitioning or Timestamp Column',
            subLabel: 'Updated timestamp column (e.g. update_time) configured for incremental sync runs.',
            badge: 'Recommended',
          },
          {
            id: 'bq_acl_column',
            label: 'Access Control / User Column',
            subLabel: 'Authorized user or group column mapped for document-level ACL trimming.',
            badge: 'Optional',
          },
        ],
      },
      {
        id: 'action_capabilities',
        title: 'BigQuery Action Capabilities & Write Permissions',
        stepNumber: 3,
        description: 'Configure write permissions for agent SQL execution and table mutations.',
        items: [
          {
            id: 'bq_action_editor',
            label: 'BigQuery Data Editor Role',
            subLabel: 'Discovery Engine Service Agent granted roles/bigquery.dataEditor to write or update records via actions.',
            codeSnippet: 'roles/bigquery.dataEditor',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
        ],
      },
    ],
  },

  GCS: {
    vendorId: 'GCS',
    vendorDisplayName: 'Google Cloud Storage',
    category: 'Google First-Party & MCP',
    detectionPatterns: {
      dataSources: ['gcs', 'cloud_storage', 'google_cloud_storage', 'storage'],
      nameSubstrings: ['gcs', 'cloud-storage', 'cloud_storage'],
    },
    supportsDataModeToggle: false,
    supportsActions: true,
    documentationUrl: 'https://cloud.google.com/generative-ai-app-builder/docs/connectors/connect-cloud-storage',
    sections: [
      {
        id: 'auth_access',
        title: 'Storage IAM & Bucket Configuration',
        stepNumber: 1,
        description: 'Verify GCS bucket permissions, region alignment, and service agent roles.',
        items: [
          {
            id: 'gcs_service_agent_viewer',
            label: 'Storage Object Viewer Role',
            subLabel: 'Discovery Engine Service Agent must have roles/storage.objectViewer on the target GCS bucket.',
            badge: 'Required',
            codeSnippet: 'roles/storage.objectViewer',
            documentationUrl: 'https://cloud.google.com/storage/docs/access-control/iam-roles',
          },
          {
            id: 'gcs_bucket_location',
            label: 'Bucket Region Alignment',
            subLabel: 'Bucket region matches Discovery Engine data store location.',
            badge: 'Required',
          },
          {
            id: 'gcs_uniform_access',
            label: 'Uniform Bucket-Level Access',
            subLabel: 'Bucket has uniform bucket-level access enabled for consistent IAM governance.',
            badge: 'Recommended',
          },
          {
            id: 'gcs_iam_service_agent',
            label: 'Discovery Engine Service Agent Role',
            subLabel: 'Service Agent has roles/discoveryengine.serviceAgent on the host GCP project.',
            badge: 'Automated',
            automatedProbe: {
              type: 'IAM_PERMISSION_CHECK',
              requiredPermissions: ['discoveryengine.dataStores.get', 'discoveryengine.collections.get'],
              description: 'Checks Discovery Engine service agent role bindings.',
            },
          },
          {
            id: 'gcs_connector_health',
            label: 'Connector State Health',
            subLabel: 'Connector status is ACTIVE with successful object crawl.',
            badge: 'Automated',
            automatedProbe: {
              type: 'CONNECTOR_STATUS',
              description: 'Validates connector status and latest sync logs.',
            },
          },
        ],
      },
      {
        id: 'scopes_permissions',
        title: 'Document Ingestion & File Formats',
        stepNumber: 2,
        description: 'Verify supported file formats and incremental ingestion triggers.',
        items: [
          {
            id: 'gcs_supported_formats',
            label: 'Supported Document MIME Types',
            subLabel: 'Bucket contains valid PDF, HTML, TXT, DOCX, PPTX, XLSX, or JSONL files.',
            badge: 'Required',
          },
          {
            id: 'gcs_metadata_schema',
            label: 'Structured Metadata File (metadata.jsonl)',
            subLabel: 'Optional metadata.jsonl with ACLs, custom properties, and categories.',
            badge: 'Optional',
          },
          {
            id: 'gcs_pubsub_notifications',
            label: 'Pub/Sub Object Change Notifications',
            subLabel: 'Enables instant incremental indexing upon object creation or modification.',
            badge: 'Recommended',
          },
        ],
      },
      {
        id: 'action_capabilities',
        title: 'Cloud Storage Action Capabilities & Write Roles',
        stepNumber: 3,
        description: 'Configure upload permissions for Gemini Enterprise agent actions.',
        items: [
          {
            id: 'gcs_action_creator',
            label: 'Storage Object Creator Role',
            subLabel: 'Allows Gemini to upload generated artifacts or report exports directly to GCS.',
            codeSnippet: 'roles/storage.objectCreator',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
        ],
      },
    ],
  },

  GCAL: {
    vendorId: 'GCAL',
    vendorDisplayName: 'Google Calendar',
    category: 'Google First-Party & MCP',
    detectionPatterns: {
      dataSources: ['gcal', 'google_calendar', 'calendar'],
      nameSubstrings: ['gcal', 'google-calendar', 'google_calendar'],
    },
    supportsDataModeToggle: true,
    supportsActions: true,
    documentationUrl: 'https://cloud.google.com/generative-ai-app-builder/docs/connectors/gcal',
    sections: [
      {
        id: 'auth_access',
        title: 'Authentication & Domain-Wide Delegation',
        stepNumber: 1,
        description: 'Authorize service account with Domain-Wide Delegation in Google Workspace Admin Console.',
        items: [
          {
            id: 'gcal_dwd',
            label: 'Domain-Wide Delegation Configured',
            subLabel: 'Service account client ID registered in Google Workspace Admin Console.',
            badge: 'Required',
            documentationUrl: 'https://admin.google.com/ac/owl/domainwidedelegation',
          },
          {
            id: 'gcal_service_agent',
            label: 'Discovery Engine Service Agent Role',
            subLabel: 'Service Agent has roles/discoveryengine.serviceAgent on the host GCP project.',
            badge: 'Automated',
            automatedProbe: {
              type: 'IAM_PERMISSION_CHECK',
              requiredPermissions: ['discoveryengine.dataStores.get', 'discoveryengine.collections.get'],
              description: 'Checks Discovery Engine service agent role bindings.',
            },
          },
          {
            id: 'gcal_connector_health',
            label: 'Connector State Health',
            subLabel: 'Connector status is ACTIVE with successful calendar sync.',
            badge: 'Automated',
            automatedProbe: {
              type: 'CONNECTOR_STATUS',
              description: 'Validates connector status and latest sync logs.',
            },
          },
        ],
      },
      {
        id: 'scopes_permissions',
        title: 'Google Calendar API Scopes',
        stepNumber: 2,
        description: 'Verify OAuth scopes for calendar events and metadata.',
        items: [
          {
            id: 'scope_gcal_readonly',
            label: 'Calendar Readonly Scope',
            subLabel: 'Grants read access to user calendar entries and event details.',
            codeSnippet: 'https://www.googleapis.com/auth/calendar.readonly',
            badge: 'Required',
          },
          {
            id: 'scope_gcal_events_readonly',
            label: 'Calendar Events Readonly Scope',
            subLabel: 'Grants read access to event attendee statuses and invitations.',
            codeSnippet: 'https://www.googleapis.com/auth/calendar.events.readonly',
            badge: 'Required',
          },
        ],
      },
      {
        id: 'action_capabilities',
        title: 'Google Calendar Action Capabilities',
        stepNumber: 3,
        description: 'Configure event scheduling and modification scopes.',
        items: [
          {
            id: 'gcal_action_events',
            label: 'Calendar Events Management',
            subLabel: 'Allows Gemini to schedule meetings or reschedule appointments.',
            codeSnippet: 'https://www.googleapis.com/auth/calendar.events',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
        ],
      },
    ],
  },

  GCHAT: {
    vendorId: 'GCHAT',
    vendorDisplayName: 'Google Chat',
    category: 'Google First-Party & MCP',
    detectionPatterns: {
      dataSources: ['gchat', 'google_chat', 'chat'],
      nameSubstrings: ['gchat', 'google-chat', 'google_chat'],
    },
    supportsDataModeToggle: false,
    supportsActions: true,
    documentationUrl: 'https://cloud.google.com/generative-ai-app-builder/docs/connectors/gchat',
    sections: [
      {
        id: 'auth_access',
        title: 'Google Chat App & Service Agent',
        stepNumber: 1,
        description: 'Configure Chat app status in Google Workspace Marketplace SDK and service agent roles.',
        items: [
          {
            id: 'gchat_app_status',
            label: 'Google Chat App Active',
            subLabel: 'Chat App configured in Google Cloud Console & Workspace Marketplace SDK.',
            badge: 'Required',
            documentationUrl: 'https://console.cloud.google.com/apis/api/chat.googleapis.com',
          },
          {
            id: 'gchat_service_agent',
            label: 'Discovery Engine Service Agent Role',
            subLabel: 'Service Agent has roles/discoveryengine.serviceAgent on the host GCP project.',
            badge: 'Automated',
            automatedProbe: {
              type: 'IAM_PERMISSION_CHECK',
              requiredPermissions: ['discoveryengine.dataStores.get', 'discoveryengine.collections.get'],
              description: 'Checks Discovery Engine service agent role bindings.',
            },
          },
          {
            id: 'gchat_connector_health',
            label: 'Connector State Health',
            subLabel: 'Connector status is ACTIVE with successful chat spaces crawl.',
            badge: 'Automated',
            automatedProbe: {
              type: 'CONNECTOR_STATUS',
              description: 'Validates connector status and latest sync logs.',
            },
          },
        ],
      },
      {
        id: 'scopes_permissions',
        title: 'Google Chat API Scopes',
        stepNumber: 2,
        description: 'Verify OAuth scopes for chat spaces, messages, and memberships.',
        items: [
          {
            id: 'scope_gchat_spaces_readonly',
            label: 'Chat Spaces Readonly Scope',
            subLabel: 'Indexes accessible chat spaces and space membership metadata.',
            codeSnippet: 'https://www.googleapis.com/auth/chat.spaces.readonly',
            badge: 'Required',
          },
          {
            id: 'scope_gchat_messages_readonly',
            label: 'Chat Messages Readonly Scope',
            subLabel: 'Indexes chat messages, threads, and attachments.',
            codeSnippet: 'https://www.googleapis.com/auth/chat.messages.readonly',
            badge: 'Required',
          },
          {
            id: 'scope_gchat_memberships_readonly',
            label: 'Chat Memberships Readonly Scope',
            subLabel: 'Indexes user permissions for message security trimming.',
            codeSnippet: 'https://www.googleapis.com/auth/chat.memberships.readonly',
            badge: 'Required',
          },
        ],
      },
      {
        id: 'action_capabilities',
        title: 'Google Chat Action Capabilities',
        stepNumber: 3,
        description: 'Configure message posting scopes for agent notifications.',
        items: [
          {
            id: 'gchat_action_messages_create',
            label: 'Post Messages Scope',
            subLabel: 'Allows Gemini to send messages or alerts to a Google Chat space.',
            codeSnippet: 'https://www.googleapis.com/auth/chat.messages.create',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
        ],
      },
    ],
  },

  GENERIC: {
    vendorId: 'GENERIC',
    vendorDisplayName: 'Generic 3rd-Party Verification',
    category: 'Universal Fallback',
    detectionPatterns: {
      dataSources: [],
      nameSubstrings: [],
    },
    supportsDataModeToggle: true,
    supportsActions: true,
    documentationUrl: 'https://docs.cloud.google.com/gemini/enterprise/docs/connectors/manage-actions',
    sections: [
      {
        id: 'auth_access',
        title: 'Authentication & Access',
        stepNumber: 1,
        description: 'Ensure the connector has minimal necessary credentials and network paths to access the source system.',
        items: [
          {
            id: 'gen_creds',
            label: 'Valid Credentials Provisioned',
            subLabel: 'Service account, OAuth App, or API token is actively provisioned and unexpired.',
            badge: 'Required',
          },
          {
            id: 'gen_network',
            label: 'Network Reachability / Firewalls',
            subLabel: 'Source system firewall or IP allowlist permits inbound connections from Google Cloud.',
            badge: 'Required',
          },
          {
            id: 'gen_connector_status',
            label: 'Discovery Engine Connector Status',
            subLabel: 'Connector status is active with no failing sync operations.',
            badge: 'Automated',
            automatedProbe: {
              type: 'CONNECTOR_STATUS',
              description: 'Validates connector health.',
            },
          },
        ],
      },
      {
        id: 'permissions_scopes',
        title: 'Permissions & Data Scopes',
        stepNumber: 2,
        description: 'Ensure credentials have appropriate READ access to the desired objects.',
        items: [
          {
            id: 'gen_read_all',
            label: 'Read Data Access',
            subLabel: 'Credentials can read required objects, tickets, sites, or channels.',
            badge: 'Required',
          },
          {
            id: 'gen_identity',
            label: 'Identity Mapping',
            subLabel: 'Source system exposes user emails to allow ACL security trimming to function.',
            badge: 'Required',
          },
          {
            id: 'gen_audit',
            label: 'Audit / Incremental Access',
            subLabel: 'Credentials can read audit logs or webhooks for incremental syncs.',
            badge: 'Optional',
            appliesToMode: 'INGESTION',
          },
        ],
      },
      {
        id: 'generic_actions_section',
        title: 'Assistant Actions & Write Permissions',
        stepNumber: 3,
        description: 'Write permissions and callback settings required when enabling Gemini Assistant actions on this data source.',
        items: [
          {
            id: 'generic_action_redirect_uri',
            label: 'Actions Redirect URI Allowlisted',
            subLabel: 'Actions always use https://vertexaisearch.cloud.google.com/oauth-redirect.',
            codeSnippet: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'generic_action_write_scopes',
            label: 'Target Platform Write Scopes',
            subLabel: 'Configure required create and edit write scopes in the third-party developer console.',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
          {
            id: 'generic_action_user_role',
            label: 'Non-Restricted User Role',
            subLabel: 'Ensure authenticating user or service account has write permissions in the source system.',
            badge: 'Required',
            appliesToMode: 'ACTIONS',
            isActionRequirement: true,
          },
        ],
      },
    ],
  },
};

function matchesWordToken(source: string, target: string): boolean {
  if (!source || !target) return false;
  const s = source.toLowerCase();
  const t = target.toLowerCase();
  if (s === t) return true;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
  return regex.test(s);
}

/**
 * Intelligent connector vendor detection function.
 * Evaluates formal GCP Discovery Engine dataConnector fields (dataSource, connectorType),
 * followed by collection / connector name patterns and configuration parameters.
 */
export function detectConnectorVendor(connector: any): string {
  if (!connector) return 'GENERIC';

  const connectorState = connector.connectorState || connector;
  const dataSource = (connectorState.dataSource || '').toLowerCase();
  const connectorType = (connectorState.connectorType || '').toLowerCase();
  const nameString = (connector.name || connectorState.name || '').toLowerCase();
  const stateString = JSON.stringify(connectorState).toLowerCase();

  // 1. First-Party Google & BYOMCP detection
  if (dataSource === 'custom_mcp' || stateString.includes('custom_mcp') || nameString.includes('mcp')) {
    return 'BYO_MCP';
  }

  if (
    dataSource === 'gcp_people' ||
    dataSource === 'google_people' ||
    nameString.includes('gcp-people') ||
    nameString.includes('gcp_people') ||
    nameString.includes('people') ||
    nameString.includes('directory')
  ) {
    return 'GCP_PEOPLE';
  }

  if (
    dataSource === 'drive' ||
    dataSource === 'gdrive' ||
    nameString.includes('gdrive') ||
    nameString.includes('drive')
  ) {
    return 'GCP_DRIVE';
  }

  // 2. Data Center specialized checks (must precede cloud substrings)
  if (
    dataSource.includes('jira_dc') ||
    dataSource.includes('jira-dc') ||
    nameString.includes('jira_dc') ||
    nameString.includes('jira-dc') ||
    stateString.includes('jira_dc') ||
    stateString.includes('jira-dc')
  ) {
    return 'JIRA_DC';
  }

  if (
    dataSource.includes('confluence_dc') ||
    dataSource.includes('confluence-dc') ||
    nameString.includes('confluence_dc') ||
    nameString.includes('confluence-dc') ||
    stateString.includes('confluence_dc') ||
    stateString.includes('confluence-dc')
  ) {
    return 'CONFLUENCE_DC';
  }

  // 3. Exact match on known registry keys
  for (const [vendorId, def] of Object.entries(CHECKLIST_REGISTRY)) {
    if (vendorId === 'GENERIC' || vendorId === 'GCP_PEOPLE' || vendorId === 'GCP_DRIVE' || vendorId === 'BYO_MCP' || vendorId === 'JIRA_DC' || vendorId === 'CONFLUENCE_DC') {
      continue;
    }

    if (def.detectionPatterns.dataSources?.some((ds) => matchesWordToken(dataSource, ds))) {
      return vendorId;
    }

    if (def.detectionPatterns.nameSubstrings?.some((substr) => matchesWordToken(nameString, substr))) {
      return vendorId;
    }
  }

  // 4. Fallback to deep state string inspection
  for (const [vendorId, def] of Object.entries(CHECKLIST_REGISTRY)) {
    if (vendorId === 'GENERIC') continue;
    if (def.detectionPatterns.nameSubstrings?.some((substr) => matchesWordToken(stateString, substr))) {
      return vendorId;
    }
  }

  return 'GENERIC';
}

/**
 * Returns checklist definition for a vendor, falling back to GENERIC if not found.
 */
export function getChecklistDefinition(vendorId: string): ConnectorChecklistDefinition {
  return CHECKLIST_REGISTRY[vendorId] || CHECKLIST_REGISTRY.GENERIC;
}

/**
 * Returns sorted list of all available vendors for dropdown selection.
 */
export interface VendorOption {
  id: string;
  name: string;
  category?: string;
}

export function getAllVendors(): VendorOption[] {
  return Object.values(CHECKLIST_REGISTRY).map((def) => ({
    id: def.vendorId,
    name: def.vendorDisplayName,
    category: def.category || 'Universal Fallback',
  }));
}
