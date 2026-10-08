# Gemini Enterprise Connector Validation & Diagnostics Forensic Review

> **Audit Scope**: All **57 Connector Checklists**, **740 Validation Items**, **159 Automated Probes**, and the **Unified Connector Diagnostics Pipeline** (`connectorDiagnostics.ts`, `probeRunner.ts`, `services/api/iam.ts`, `DynamicConnectorVerification.tsx`, `ConnectorDetailsModal.tsx`).

---

## 1. Executive Summary

This document presents a customer-centric forensic review of the Gemini Enterprise Manager connector validation and diagnostics system. When enterprise administrators configure Google Cloud Discovery Engine data connectors across first-party Google Cloud/Workspace sources and third-party SaaS platforms (Microsoft 365, Atlassian, ServiceNow, Salesforce, Slack, etc.), they face two distinct failure domains:

1. **Google Cloud Control & Data Plane Issues (Automatable via GCP APIs)**:
   - Discovery Engine `DataConnector` state (`ACTIVE`, `FAILED`, `INACTIVE`), `blockingReasons`, `errorConfig`, and `latestRun` status.
   - Asynchronous Long-Running Operations (`projects.locations.collections.operations.list`) and Cloud Logging error entries (`entries:list`).
   - Project IAM role bindings (`roles/discoveryengine.serviceAgent` and data-source-specific reader roles) for the Google-managed Discovery Engine Service Agent (`service-{PROJECT_NUMBER}@gcp-sa-discoveryengine.iam.gserviceaccount.com`).
   - Live JSON-RPC 2.0 `tools/list` handshakes for Custom Model Context Protocol (`BYO_MCP`) endpoints.
2. **External 3rd-Party Vendor Portal Configurations & Write-Only Secrets (Manual Attestation Required)**:
   - External SaaS admin settings (e.g., Microsoft Entra ID Tenant Admin Consent, ServiceNow Table Read ACLs across 24 tables, Salesforce Connected App IP Relaxation, Atlassian 3LO Granular Scopes) live inside third-party identity providers and cannot be introspected directly by browser-side Google Cloud APIs.
   - Sensitive credential fields (`client_id`, `client_secret`, `refresh_token`, `access_token`, `api_key`, `private_key`, `password`, `secret`) are treated as **write-only** by Google Cloud Discovery Engine and are stripped or masked (`"***"`, `"REDACTED"`) on `dataConnector.get` responses.

---

## 2. Key Forensic Findings & Remediations Applied

| ID | Severity | Component | Forensic Finding | Customer Impact | Resolution Applied |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **F-01** | **CRITICAL** | `services/api/iam.ts` | `ROLE_PERMISSION_PREFIX_MAP` only mapped `roles/discoveryengine.*` and `roles/bigquery.*`. Roles for `GCS` (`roles/storage.*`), `ALLOYDB` (`roles/alloydb.*`), `CLOUD_SQL` (`roles/cloudsql.*`), `SPANNER` (`roles/spanner.*`), `BIGTABLE` (`roles/bigtable.*`), and `FIRESTORE` (`roles/datastore.*`) were missing. In addition, when evaluating raw permissions for the Discovery Engine Service Agent, `roles/discoveryengine.serviceAgent` was not synthesized unless a literal role name was returned by `testIamPermissions`. | Customers configuring GCS, AlloyDB, Cloud SQL, Spanner, Bigtable, or Firestore connectors saw false-negative `IAM_PERMISSION_CHECK` probe failures even when their service agent held the exact required IAM roles. | Expanded `ROLE_PERMISSION_PREFIX_MAP` in `services/api/iam.ts` to cover all 6 GCP database/storage role families and synthesized `roles/discoveryengine.serviceAgent` when the Discovery Engine service agent (`@gcp-sa-discoveryengine.iam.gserviceaccount.com`) has verified project bindings. |
| **F-02** | **HIGH** | `probeRunner.ts`, `DynamicConnectorVerification.tsx`, `useChecklistState.ts`, `useConnectorsPage.ts` | **Split-Brain Diagnostics vs. Checklist Probes**: The `Diagnostics` tab (`runConnectorDiagnostics`) inspected LRO `operations` and Cloud Logging `entries`, whereas `Validation Checklist` probes (`runAutomatedProbe`) only checked `connectorState` and required the user to manually click `"Run Automated Probes"`. Furthermore, a failed probe did not uncheck a previously checked item, and an initial-mount `useEffect` in `useChecklistState.ts` could clobber probe results recorded on mount. | Customers could see a red failed LRO sync operation or `401 invalid_grant` Cloud Logging entry in the Diagnostics tab while the Validation Checklist tab showed `CONNECTOR_STATUS` and `OAUTH_CONFIG_VALIDITY` as passing or unexecuted. | Unified `probeRunner.ts` (`extractDiagnosticSignals`) to evaluate `rawOperations` (`hardOpFailures`, `partialOpWarnings`) and `recentLogs` (`unresolvedLogs`, `authLogErrors`), auto-executed/hydrated automated probes on checklist load, prevented manual checking of failing automated probes, and triggered `runConnectorDiagnostics` when opening Connector Details. |
| **F-03** | **HIGH** | `atlassian-devtools.json`, `crm-itsm-erp.json` | **6 Enterprise Connectors Missing `OAUTH_CONFIG_VALIDITY` Probes**: `SOURCEGRAPH`, `GRAFANA`, `FRESHSERVICE`, `INTERCOM`, `SHOPIFY`, and `STRIPE` only defined `IAM_PERMISSION_CHECK` and `CONNECTOR_STATUS` probes (2 probes instead of 3). | OAuth/API token misconfigurations and `blockingReasons` on these 6 connectors were not automatically probed in the Authentication step of their checklists. | Added deterministic `OAUTH_CONFIG_VALIDITY` probes to all 6 connectors, bringing total automated probes across the 57-connector catalog from **153 to 159**. |
| **F-04** | **MEDIUM** | `collaboration-productivity.json` | **Miro Actions Redirect URI Mismatch**: `MIRO` (`miro_redirect_uri`) listed `https://vertexaisearch.cloud.google.com/oauth-callback` instead of the canonical Gemini Enterprise Assistant Actions callback `https://vertexaisearch.cloud.google.com/oauth-redirect`. | Customers copying the Miro snippet into the Miro Developer Portal encountered `redirect_uri_mismatch` during 3LO user OAuth handshakes. | Updated `miro_redirect_uri` `codeSnippet` in `collaboration-productivity.json` to `https://vertexaisearch.cloud.google.com/oauth-redirect`. |
| **F-05** | **MEDIUM** | `crm-itsm-erp.json` | **Legacy Documentation URLs**: `WORKDAY`, `FRESHSERVICE`, `HUBSPOT`, `INTERCOM`, and `STRIPE` referenced legacy `https://cloud.google.com/generative-ai-app-builder/docs/...` URLs instead of canonical `/gemini/enterprise/docs/connectors/...` URLs. | Inconsistent documentation routing when administrators clicked external help links. | Updated all 5 connector documentation URLs in `crm-itsm-erp.json` to `https://cloud.google.com/gemini/enterprise/docs/connectors/...`. |
| **F-06** | **LOW** | `google-cloud-workspace.json` | **`BYO_MCP` Badge Inconsistency**: `mcp_oauth_config` included an `OAUTH_CONFIG_VALIDITY` `automatedProbe` but carried `"badge": "Recommended"` instead of `"Automated"`. | `mcp_oauth_config` was excluded from the `Automated` readiness badge filter. | Updated `mcp_oauth_config` badge to `"Automated"` in `google-cloud-workspace.json`. |

---

## 3. Write-Only & Redacted Credential Handling (`dataConnector.get`)

When Google Cloud Discovery Engine returns a `DataConnector` resource via `projects.locations.collections.dataConnector.get`, it intentionally omits or masks sensitive credential fields inside `params` and `actionConfig.actionParams`:

- `client_id`
- `client_secret`
- `refresh_token`
- `access_token`
- `api_key`
- `private_key`
- `password`
- `secret`
- `oauth_secret`

### Probe Verification Contract
1. **Never Fail or Warn on Redacted Credentials**: `OAUTH_CONFIG_VALIDITY` explicitly tracks redacted write-only fields via `isRedactedOrWriteOnlyValue()` and never flags missing or masked `client_id` / `client_secret` / `refresh_token` values as errors or warnings.
2. **Verify Non-Redacted Parameters + Live Backend Signals**:
   - Inspects non-redacted structural fields (`tenant_id`, `instance_id`, `instance_uri`, `domain`, `auth_type`, `auth_uri`, `token_uri`, `entities`, `actionConfig.isActionConfigured`).
   - Cross-checks live backend signals (`connectorState.blockingReasons`, `latestRun.error`, `errorConfig.error`, `actionState`, LRO `rawOperations`, and Cloud Logging `recentLogs`) for any `401`, `403`, `invalid_client`, `invalid_grant`, `AADSTS*`, or `redirect_uri_mismatch` errors.
3. **Dual-Track UX Separation**:
   - **Automated Google Cloud API Probes** (`data-testid="automated-probes-summary"`): Displays pass/fail counts for checks verified via live GCP APIs and diagnostic logs.
   - **Manual 3rd-Party Vendor Attestations** (`data-testid="manual-attestation-summary"`): Clearly labels external vendor portal requirements and write-only credentials that require administrator sign-off.

---

## 4. Complete 57-Connector Forensic Audit Matrix

All 57 connectors across the 5 catalog files (`components/connectors/checklist/catalog/*.json`) were audited against official Google Cloud Gemini Enterprise documentation:

### 4.1 Google First-Party & MCP (`google-cloud-workspace.json` — 14 Connectors)

| Vendor ID | Display Name | Modes | Items | Automated Probes | Key IAM / Auth Requirements Verified | Audit Status |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| `GCP_PEOPLE` | Google Cloud / Workspace People & Directory | Ingestion, Federated | 6 | 2 (`IAM`, `STATUS`) | Workspace DWD, Admin SDK Directory API, `roles/discoveryengine.serviceAgent` | Verified |
| `GCP_DRIVE` | Google Drive & Docs | Ingestion, Federated, Actions | 8 | 2 (`IAM`, `STATUS`) | Workspace Drive DWD, `drive.readonly` / `drive.file` (Actions) | Verified |
| `GMAIL` | Gmail / Google Mail | Ingestion, Federated, Actions | 7 | 2 (`IAM`, `STATUS`) | Workspace Gmail DWD, `gmail.readonly` / `gmail.modify` (Actions) | Verified |
| `GCAL` | Google Calendar | Ingestion, Federated, Actions | 6 | 2 (`IAM`, `STATUS`) | Workspace Calendar DWD, `calendar.readonly` / `calendar.events` (Actions) | Verified |
| `GCHAT` | Google Chat | Ingestion, Actions | 7 | 2 (`IAM`, `STATUS`) | Workspace Chat DWD, Vault/Chat export, `chat.messages.create` (Actions) | Verified |
| `GSITES` | Google Sites | Ingestion, Federated | 6 | 2 (`IAM`, `STATUS`) | Workspace Drive/Sites DWD, `drive.readonly` | Verified |
| `BIGQUERY` | Google BigQuery | Ingestion, Federated, Actions | 9 | 2 (`IAM`, `STATUS`) | `bigquery.datasets.get`, `bigquery.tables.getData`, `bigquery.jobs.create` | Verified |
| `GCS` | Google Cloud Storage | Ingestion, Actions | 9 | 2 (`IAM`, `STATUS`) | `storage.buckets.get`, `storage.objects.list`, `storage.objects.get` | Fixed IAM Map (`F-01`) |
| `ALLOYDB` | Google Cloud AlloyDB | Ingestion, Federated, Actions | 8 | 2 (`IAM`, `STATUS`) | `alloydb.clusters.get`, `alloydb.instances.get`, `alloydb.instances.connect` | Fixed IAM Map (`F-01`) |
| `CLOUD_SQL` | Google Cloud SQL | Ingestion, Federated, Actions | 9 | 2 (`IAM`, `STATUS`) | `cloudsql.instances.get`, `cloudsql.instances.connect` | Fixed IAM Map (`F-01`) |
| `SPANNER` | Google Cloud Spanner | Ingestion, Federated, Actions | 7 | 2 (`IAM`, `STATUS`) | `spanner.instances.get`, `spanner.databases.get`, `spanner.databases.read` | Fixed IAM Map (`F-01`) |
| `BIGTABLE` | Google Cloud Bigtable | Ingestion | 6 | 2 (`IAM`, `STATUS`) | `bigtable.instances.get`, `bigtable.tables.get`, `bigtable.tables.readRows` | Fixed IAM Map (`F-01`) |
| `FIRESTORE` | Google Cloud Firestore | Ingestion | 5 | 2 (`IAM`, `STATUS`) | `datastore.databases.get`, `datastore.entities.list`, `datastore.entities.get` | Fixed IAM Map (`F-01`) |
| `BYO_MCP` | Model Context Protocol (BYOMCP) | Ingestion, Actions | 7 | 4 (`MCP`, `OAUTH`, `IAM`, `STATUS`) | JSON-RPC 2.0 `tools/list`, Cloud Run `roles/run.invoker`, OAuth `auth_uri`/`token_uri` | Fixed Badge (`F-06`) |

### 4.2 Microsoft 365 & Identity (`microsoft-enterprise.json` — 6 Connectors)

| Vendor ID | Display Name | Modes | Items | Automated Probes | Key Microsoft Graph & Entra ID Requirements Verified | Audit Status |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| `SHAREPOINT` | Microsoft SharePoint Online | Ingestion, Federated, Actions | 27 | 3 (`OAUTH`, `IAM`, `STATUS`) | Entra App Reg, Secret Value (not ID), Graph `Sites.Read.All`, `Files.ReadWrite.All` (Actions) | Verified |
| `ONEDRIVE` | Microsoft OneDrive for Business | Ingestion, Federated, Actions | 22 | 3 (`OAUTH`, `IAM`, `STATUS`) | Entra App Reg, Graph `Files.Read.All`, `Sites.Read.All`, Admin Consent | Verified |
| `OUTLOOK` | Microsoft Outlook & Exchange | Ingestion, Federated, Actions | 28 | 3 (`OAUTH`, `IAM`, `STATUS`) | Entra App Reg, Graph `Mail.Read`, `Mail.Send` (Actions), `Calendars.ReadWrite` | Verified |
| `TEAMS` | Microsoft Teams | Ingestion, Federated, Actions | 24 | 3 (`OAUTH`, `IAM`, `STATUS`) | Entra App Reg, Graph `ChannelMessage.Read.All`, `Chat.Read.All`, `ChannelMessage.Send` | Verified |
| `ENTRA_ID` | Microsoft Entra ID (Azure AD) | Ingestion, Actions | 20 | 3 (`OAUTH`, `IAM`, `STATUS`) | Graph `User.Read.All`, `Group.Read.All`, `Directory.Read.All`, Admin Consent | Verified |
| `DYNAMICS365` | Microsoft Dynamics 365 | Ingestion, Federated, Actions | 15 | 3 (`OAUTH`, `IAM`, `STATUS`) | Dataverse `user_impersonation`, Entra App Reg, Application User security role | Verified |

### 4.3 Atlassian & DevTools (`atlassian-devtools.json` — 10 Connectors)

| Vendor ID | Display Name | Modes | Items | Automated Probes | Key Vendor Portal & OAuth Requirements Verified | Audit Status |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| `JIRA` | Atlassian Jira Cloud | Ingestion, Federated, Actions | 42 | 3 (`OAUTH`, `IAM`, `STATUS`) | OAuth 2.0 (3LO) Classic & Granular scopes (`read:jira-work`, `write:jira-work`), Rotating Refresh Tokens | Verified |
| `JIRA_DC` | Atlassian Jira Data Center | Ingestion, Federated, Actions | 11 | 3 (`OAUTH`, `IAM`, `STATUS`) | Application Links OAuth / PAT, Project Browse ACLs, network reachability | Verified |
| `CONFLUENCE` | Atlassian Confluence Cloud | Ingestion, Federated, Actions | 31 | 3 (`OAUTH`, `IAM`, `STATUS`) | OAuth 2.0 (3LO) Granular scopes (`read:confluence-content.all`, `write:page:confluence`) | Verified |
| `CONFLUENCE_DC` | Atlassian Confluence Data Center | Ingestion, Federated, Actions | 11 | 3 (`OAUTH`, `IAM`, `STATUS`) | Application Links / PAT, Space View permissions | Verified |
| `GITHUB` | GitHub | Ingestion, Actions | 15 | 3 (`OAUTH`, `IAM`, `STATUS`) | GitHub App / OAuth App, `repo`, `read:org`, `issues:write` (Actions), SSO authorization | Verified |
| `GITLAB` | GitLab | Ingestion, Actions | 11 | 3 (`OAUTH`, `IAM`, `STATUS`) | OAuth 2.0 `read_api`, `read_repository`, `api` (Actions), Redirect URI | Verified |
| `LINEAR` | Linear | Ingestion, Actions | 9 | 3 (`OAUTH`, `IAM`, `STATUS`) | OAuth 2.0 `read`, `write` / `issues:create` (Actions), Redirect URI | Verified |
| `PAGERDUTY` | PagerDuty | Ingestion, Actions | 11 | 3 (`OAUTH`, `IAM`, `STATUS`) | OAuth 2.0 / REST API Key, `incidents.read`, `incidents.write` (Actions) | Verified |
| `SOURCEGRAPH` | Sourcegraph | Ingestion, Actions | 9 | 3 (`OAUTH`, `IAM`, `STATUS`) | Access token / OAuth client, repository ACL sync | Added OAuth Probe (`F-03`) |
| `GRAFANA` | Grafana | Ingestion, Actions | 7 | 3 (`OAUTH`, `IAM`, `STATUS`) | Service Account Token (`Viewer`/`Editor`), Grafana instance URL | Added OAuth Probe (`F-03`) |

### 4.4 Enterprise CRM, ITSM & ERP (`crm-itsm-erp.json` — 11 Connectors)

| Vendor ID | Display Name | Modes | Items | Automated Probes | Key Vendor Portal & Table ACL Requirements Verified | Audit Status |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| `SERVICENOW` | ServiceNow | Ingestion, Federated, Actions | 40 | 3 (`OAUTH`, `IAM`, `STATUS`) | OAuth Endpoint, `snc_read_only`/`itil`/`knowledge_admin`, 24 Table Read ACLs (`kb_knowledge`, `sc_cat_item`, `user_criteria`, `incident`, etc.) | Verified |
| `SALESFORCE` | Salesforce CRM | Ingestion, Federated, Actions | 27 | 3 (`OAUTH`, `IAM`, `STATUS`) | Connected App OAuth (`api`, `refresh_token`, `offline_access`), IP Relaxation, FLS | Verified |
| `ZENDESK` | Zendesk Support | Ingestion, Federated, Actions | 17 | 3 (`OAUTH`, `IAM`, `STATUS`) | OAuth Client (`read`, `tickets:write`), Guide Knowledge Base permissions | Verified |
| `WORKDAY` | Workday | Ingestion, Federated, Actions | 12 | 3 (`OAUTH`, `IAM`, `STATUS`) | ISU + ISSG domain permissions (`Worker Data`, `Person Data`), OAuth 2.0 API Client | Fixed Docs URL (`F-05`) |
| `FRESHSERVICE` | Freshservice | Ingestion, Actions | 13 | 3 (`OAUTH`, `IAM`, `STATUS`) | Admin/Agent API Key or OAuth, Ticket & Solution KB permissions | Added OAuth Probe (`F-03`) & URL (`F-05`) |
| `HUBSPOT` | HubSpot | Ingestion, Federated, Actions | 15 | 3 (`OAUTH`, `IAM`, `STATUS`) | Private App / OAuth (`crm.objects.contacts.read`, `tickets`, `content`) | Fixed Docs URL (`F-05`) |
| `INTERCOM` | Intercom | Ingestion, Actions | 12 | 3 (`OAUTH`, `IAM`, `STATUS`) | Developer Hub OAuth (`Read and list users/conversations`, `Write conversations`) | Added OAuth Probe (`F-03`) & URL (`F-05`) |
| `SHOPIFY` | Shopify | Ingestion, Federated, Actions | 15 | 3 (`OAUTH`, `IAM`, `STATUS`) | Custom App Admin API (`read_products`, `read_orders`, `write_orders`) | Added OAuth Probe (`F-03`) |
| `STRIPE` | Stripe | Ingestion, Actions | 13 | 3 (`OAUTH`, `IAM`, `STATUS`) | Restricted API Key / OAuth (`rak_`, Customers/Invoices/Subscriptions Read) | Added OAuth Probe (`F-03`) & URL (`F-05`) |
| `ORACLE_NETSUITE` | Oracle NetSuite | Ingestion, Federated, Actions | 11 | 3 (`OAUTH`, `IAM`, `STATUS`) | SuiteTalk REST Web Services, OAuth 2.0 TBA, Role permissions | Verified |
| `ZOHO_CRM` | Zoho CRM & Desk | Ingestion, Federated, Actions | 11 | 3 (`OAUTH`, `IAM`, `STATUS`) | Zoho API Console Self/Server Client (`ZohoCRM.modules.ALL`, `ZohoCRM.users.READ`) | Verified |

### 4.5 Collaboration, Storage & Productivity (`collaboration-productivity.json` — 16 Connectors)

| Vendor ID | Display Name | Modes | Items | Automated Probes | Key Vendor Portal & OAuth Requirements Verified | Audit Status |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| `SLACK` | Slack | Ingestion, Federated, Actions | 18 | 3 (`OAUTH`, `IAM`, `STATUS`) | Slack App OAuth (`channels:history`, `channels:read`, `users:read`, `chat:write`) | Verified |
| `BOX` | Box | Ingestion, Federated, Actions | 13 | 3 (`OAUTH`, `IAM`, `STATUS`) | Box Custom App OAuth 2.0, Enterprise Admin Auth, Manage Users/Groups | Verified |
| `DROPBOX` | Dropbox Business | Ingestion, Actions | 15 | 3 (`OAUTH`, `IAM`, `STATUS`) | Team-scoped App (`files.content.read`, `team_data.member`, `members.read`) | Verified |
| `NOTION` | Notion | Ingestion, Actions | 12 | 3 (`OAUTH`, `IAM`, `STATUS`) | Public/Internal Integration (`Read content`, `Read user info`, `Insert content`) | Verified |
| `ASANA` | Asana | Ingestion, Actions | 7 | 3 (`OAUTH`, `IAM`, `STATUS`) | Asana Developer OAuth Client, Service Account (Enterprise) or PAT, `default` scope | Verified |
| `MONDAY` | Monday.com | Ingestion, Actions | 14 | 3 (`OAUTH`, `IAM`, `STATUS`) | OAuth scopes (`boards:read`, `workspaces:read`, `users:read`, `boards:write`) | Verified |
| `AIRTABLE` | Airtable | Ingestion, Actions | 10 | 3 (`OAUTH`, `IAM`, `STATUS`) | OAuth / PAT (`data.records:read`, `schema.bases:read`, `data.records:write`) | Verified |
| `SMARTSHEET` | Smartsheet | Ingestion, Actions | 10 | 3 (`OAUTH`, `IAM`, `STATUS`) | OAuth (`READ_SHEETS`, `READ_USERS`, `WRITE_SHEETS`), SysAdmin token | Verified |
| `MIRO` | Miro | Ingestion, Actions | 9 | 3 (`OAUTH`, `IAM`, `STATUS`) | OAuth (`boards:read`, `boards:write`), Redirect URI (`oauth-redirect`) | Fixed Redirect URI (`F-04`) |
| `TRELLO` | Trello | Ingestion, Actions | 6 | 3 (`OAUTH`, `IAM`, `STATUS`) | Power-Up API Key & Token (`read`, `account`, `write` for Actions) | Verified |
| `ADOBE_WORKFRONT` | Adobe Workfront | Ingestion, Actions | 8 | 3 (`OAUTH`, `IAM`, `STATUS`) | Adobe Developer Console OAuth 2.0 Server-to-Server / 3LO, System Admin profile | Verified |
| `DOCUSIGN` | DocuSign | Ingestion, Actions | 7 | 3 (`OAUTH`, `IAM`, `STATUS`) | Integration Key (Client ID), `signature` + `impersonation` scopes | Verified |
| `IMANAGE` | iManage | Ingestion, Actions | 7 | 3 (`OAUTH`, `IAM`, `STATUS`) | iManage Control Center Application Registration, OAuth 2.0 Refresh Token | Verified |
| `LUMAPPS` | LumApps | Ingestion, Actions | 8 | 3 (`OAUTH`, `IAM`, `STATUS`) | LumApps OAuth 2.0 Client Credentials, Global Admin role | Verified |
| `WRIKE` | Wrike | Ingestion, Actions | 6 | 3 (`OAUTH`, `IAM`, `STATUS`) | Wrike API App Registration, Permanent Token or OAuth 2.0 | Verified |
| `GENERIC` | Generic 3rd-Party Verification | Ingestion, Federated, Actions | 11 | 3 (`OAUTH`, `IAM`, `STATUS`) | Universal fallback checklist for newly released or custom connectors | Verified |

---

## 5. Error-to-Remediation Playbook (`deriveConnectorRemediation`)

The unified diagnostic engine maps live error signatures from `connectorState`, LRO `rawOperations`, and Cloud Logging `recentLogs` into structured, portal-specific remediation instructions:

| Error Signature / Pattern | Target Portal | Surface Identified | Automated Remediation Guidance |
| :--- | :---: | :--- | :--- |
| `AADSTS700016` / `was not found in the directory` | `BOTH` | Microsoft Entra Admin Center & Discovery Engine OAuth Config | Verify Application (client) ID and Directory (tenant) ID match between Entra ID App Registrations and the GCP connector. |
| `AADSTS65001` / `user or administrator has not consented` | `VENDOR` | Microsoft Entra ID > App Registrations > API Permissions | Click `"Grant admin consent for [Tenant]"` as a Global Administrator for all Microsoft Graph scopes. |
| `AADSTS7000215` / `Invalid client secret` | `BOTH` | Vendor Developer Portal & GCP Connector Credentials | Generate a new Client Secret and copy the **Secret Value** (not the Secret ID UUID). |
| `invalid_grant` / `token has been expired or revoked` | `BOTH` | 3rd-Party OAuth Consent & GCP Connector Authorization | Verify the integration user is active, check vendor Refresh Token expiration policies, and re-authorize the OAuth handshake in GCP. |
| `redirect_uri_mismatch` | `VENDOR` | 3rd-Party OAuth App Registration Redirect URIs | Allowlist `https://vertexaisearch.cloud.google.com/console/oauth/default_oauth.html` (sync) and `https://vertexaisearch.cloud.google.com/oauth-redirect` (Actions). |
| `snc_read_only` / `sys_db_object` / ServiceNow `403` | `VENDOR` | ServiceNow System Security > Access Control (ACL) | Grant `snc_read_only`, `itil`, and `knowledge_admin` roles and verify Read ACLs on `sys_db_object`, `kb_knowledge`, `sc_cat_item`, and `user_criteria`. |
| `API_DISABLED_FOR_ORG` / `ip restricted` / Salesforce `403` | `VENDOR` | Salesforce Setup > App Manager & Profiles | Set IP Relaxation to `"Relax IP restrictions"`, enable `api` + `refresh_token` scopes, and verify `"API Enabled"` on the user Profile. |
| Jira / Confluence `401` / `403` / `browse_projects` | `VENDOR` | Atlassian Developer Console > OAuth 2.0 (3LO) Scopes | Enable granular 3LO scopes (`read:jira-work`, `read:confluence-content.all`), enable Rotating Refresh Tokens, and verify project/space permissions. |
| `IAM_PERMISSION_DENIED` / `storage.objects` / `bigquery.` | `GCP` | Google Cloud Console > IAM & Admin > IAM | Check `"Include Google-provided role grants"` and grant `roles/discoveryengine.serviceAgent` + data-source reader roles to `service-{PROJECT_NUMBER}@gcp-sa-discoveryengine.iam.gserviceaccount.com`. |
| `No tools returned by MCP server` / `MCP Connectivity Failed` | `GCP` | Cloud Run Service & MCP Endpoint Configuration | Verify `instance_uri` responds to JSON-RPC 2.0 `tools/list` POST requests and grant `roles/run.invoker` to the Discovery Engine Service Agent. |
