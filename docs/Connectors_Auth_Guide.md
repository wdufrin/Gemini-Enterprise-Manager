# Connectors Authentication Guide

This guide explains how to obtain the necessary refresh tokens for setting up third-party data connectors in Discovery Engine using `curl`.

## Atlassian Connectors (Jira / Confluence)

To get a long-lived refresh token for non-interactive authentication:
1. Ensure your app in the [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/) has the **`offline_access`** scope enabled.
2. Visit the authorization URL in your browser to get a code (ensure you use a valid redirect URI configured in your app):
   ```text
   https://auth.atlassian.com/authorize?audience=api.atlassian.com&client_id=YOUR_CLIENT_ID&scope=read%3Ajira-work%20offline_access&redirect_uri=YOUR_REDIRECT_URI&state=random_string&response_type=code&prompt=consent
   ```
3. Exchange the code for tokens using a `curl` command:
   ```bash
   curl --request POST \
     --url 'https://auth.atlassian.com/oauth/token' \
     --header 'Content-Type: application/json' \
     --data '{
       "grant_type": "authorization_code",
       "client_id": "YOUR_CLIENT_ID",
       "client_secret": "YOUR_CLIENT_SECRET",
       "code": "THE_CODE",
       "redirect_uri": "YOUR_REDIRECT_URI"
     }'
   ```
4. The response will contain the `refresh_token`.

## Microsoft Connectors (SharePoint / Teams / Outlook)

To get a refresh token for Microsoft connectors:
1. **Ensure `offline_access` scope**: When registering the app or constructing the authorization URL, ensure the `offline_access` scope is included.
2. **Get Authorization Code**: Visit the following URL in your browser:
   ```text
   https://login.microsoftonline.com/{YOUR_TENANT_ID}/oauth2/v2.0/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=YOUR_REDIRECT_URI&response_mode=query&scope=offline_access%20https%3A%2F%2Fgraph.microsoft.com%2F.default&state=12345
   ```
   *Note: Replace `{YOUR_TENANT_ID}` in the path with your actual Tenant ID.*
3. **Exchange Code for Tokens**:
   ```bash
   curl -X POST https://login.microsoftonline.com/{YOUR_TENANT_ID}/oauth2/v2.0/token \
     -d "client_id=YOUR_CLIENT_ID" \
     -d "scope=offline_access https://graph.microsoft.com/.default" \
     -d "code=THE_CODE_FROM_STEP_2" \
     -d "redirect_uri=YOUR_REDIRECT_URI" \
     -d "grant_type=authorization_code" \
     -d "client_secret=YOUR_CLIENT_SECRET"
   ```
4. The response will contain the `refresh_token`.

## BYO-MCP (`custom_mcp`) Connectors & RFC 6901 Citation Mappings

For custom Model Context Protocol (`custom_mcp`) connectors managed in **Connectors & Data Stores → Connectors → Details → BYOMCP Settings & JSON** (`BYOMCPConfigTab.tsx`):

1. **Authentication & Cloud Run IAM**:
   - Configure OAuth 2.0 credentials (`client_id`, `client_secret`, `auth_uri`, `token_uri`) or service-to-service IAM (`roles/run.invoker` granted to `service-{PROJECT_NUMBER}@gcp-sa-discoveryengine.iam.gserviceaccount.com`).
   - Click **Refresh Tools** to invoke JSON-RPC 2.0 `tools/list` against your MCP endpoint and populate `dynamicTools` and `bapConfig.enabledActions`.
2. **Smart Routing & Evaluation Advisor (`params.custom_mcp_Metadata`)**:
   - Use the **Smart Routing & Evaluation Advisor** (`AgentGuidelinesSection.tsx`) or the **BYOMCP Descriptions & Instructions Advisor** in `AssistantEvaluationModal.tsx` to configure `mcp_server_description` and `mcp_agent_instructions` across 6 domain archetypes (`DATABASE_SQL`, `ISSUE_TRACKER_ITSM`, `CRM_ERP_FINANCE`, `DEVOPS_INFRA`, `KNOWLEDGE_SEARCH`, `GENERAL_MCP`).
   - Saving routing metadata executes a credential-safe metadata-only `PATCH` (`updateMask=params.custom_mcp_Metadata`) that strips `client_id` and `client_secret` from `params` so masked `"*****"` secrets are never overwritten.
3. **Discovered Tools Schema Overrides & RFC 6901 Citation Mappings**:
   - **Override Schema (`mcp_tools_schema`)**: Add or refine JSON-Schema tool input parameters in `DiscoveredToolsSection.tsx`.
   - **RFC 6901 JSON Pointer Citation Mappings (`mcp_tools_citation_keys`)**: Configure `tool_names`, `title_key` (RFC 6901 pointer starting with `/`, e.g., `/results/0/title`), `url_key` (e.g., `/results/0/url`), and optional `url_Match_pattern` in `CitationMappingsSection.tsx` so Gemini Enterprise renders grounded source links from MCP tool outputs.

## 156-Connector Validation & Readiness Checklist

For all **156 enterprise connector profiles** (`1,324` validation items and `424` automated diagnostic probes across Google Cloud & Workspace, Microsoft 365 & Entra ID, Atlassian, ServiceNow, Salesforce, Databases, Collaboration, Identity, and BYOMCP), open **Connectors & Data Stores (`/datastores`) → Connectors → Details → Validation Checklist**, or see [CONNECTOR_VALIDATION_REVIEW.md](./CONNECTOR_VALIDATION_REVIEW.md).

