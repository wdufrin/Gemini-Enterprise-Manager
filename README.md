# Gemini Enterprise Manager

A comprehensive, production-grade web console to inspect, configure, test, and govern Google Cloud Gemini Enterprise resources. This application provides a unified operational dashboard for Discovery Engine, Vertex AI Reasoning Engines, Agent Registry (Skills), Data Stores, Cloud Run runtimes, Model Armor safety, Observability, and Enterprise Access Governance.

Built with **React 18**, **TypeScript**, **Vite**, and **Tailwind CSS**, communicating directly with Google Cloud APIs using the **Google API JavaScript Client (`gapi`)** and OAuth 2.0.

---

## Complete Feature Matrix (15 Active Sidebar Modules Across 5 Groups + Deep-Link Views)

The left sidebar organizes the console into **15 active modules across 5 operational groups**, backed by **20 `Page` routes** (`types.ts` and `utils/routeUtils.ts`), a global **`Jump to... ⌘K` Command Palette**, and an interactive 5-chapter **In-App User Guide (`Docs`)** modal (`UserGuideModal.tsx`).

### 🤖 Group 1: Agent Management
1. **GE Agent Manager (`/agents`)**: Unified **`View / Edit`** console for Discovery Engine agents (`ADK`, `A2A`, `LOW_CODE`, and `WORKFLOW`):
   - **Inline No-Code Editing & Auto-Repair**: Edit Display Name, Description, Icon, Starter Prompts, Gemini Model, System Instructions, and bound Data Connectors / Data Stores directly in the Agent Details view, with draft validation warnings and automatic `lowCodeAgentDefinition` normalization.
   - **Embedded ADK & A2A Configuration**: Update Reasoning Engine or Cloud Run A2A backend settings, starter prompts, and `authorizationConfig.toolAuthorizations` with live `PATCH` cURL previews.
   - **Decoupled Publish, Share & Unshare**: Publish No-Code drafts out of `Draft` state while keeping them `Private (Unshared)` (`:deployLowCode`), share with the organization (`:shareAgent`), unshare in-place (`:withdrawAgent`), transfer ownership (`:transferAgentOwner`), and one-click migrate legacy `agent.authorizations` to `authorization_config`.
2. **Skills Registry (`/skills`)**: Centralized enterprise skills governance powered by Google Cloud Agent Registry (`agentregistry.googleapis.com`) and assistant-level `workflowAgentDefinition` skills:
   - **Display Name Normalization & Validation**: Enforces maximum **64 characters**, letters/numbers/spaces/hyphens only (`^[A-Za-z0-9][A-Za-z0-9 -]*$`), and automatic `&` → `and` sanitization (`sanitizeSkillDisplayName`, `validateSkillDisplayName`).
   - **Organizational vs. Private Visibility**: Distinguish and promote skills between **Organizational (`ENABLED` + `ALL_USERS`)** (visible under *"From my organization"*) and **Private (`PRIVATE` / `DISABLED`)**.
   - **Multi-Format Export & `SKILL.md` ZIP Import/Export**: Export skills as `.csv`, `.md`, standards-compliant `SKILL.md` `.zip` archives (`<skill-slug>/SKILL.md`), or lossless `.json` backups (`gemini-enterprise-skills-v1`), and single/batch import `.md`, `.zip`, or `.json` bundles (`ExportSkillsModal.tsx`, `PublishSkillModal.tsx`).
3. **ADK Studio (`/builder`)**: Interactive Python ADK 2.x / Cloud Run A2A project generator, curated open-source **Agent Catalog** sample browser (`google/adk-samples`), and 1-click Cloud Build deployment:
   - **Progressive Disclosure Interface**: Organized into collapsible categories (Core Capabilities, Managed MCPs, Enterprise GCP APIs, Custom Endpoints, OAuth, and Observability).
   - **Reasoning Depth & Thinking Budget**: Configure thinking levels (`HIGH`, `MEDIUM`, `LOW`, `MINIMAL`) and token budgets.
   - **Code Execution & Graphviz**: Sandboxed Python execution and client-side architecture diagram rendering.
4. **Agent Runtimes (`/runtimes`)**: Unified runtime management with 3 sub-tabs (plus direct deep-link routes `/cloud-run`, `/dialogflow`, and `/a2a-tester`):
   - **Vertex AI Agent Engines**: View sessions, execute streaming queries, inspect traces, and delete reasoning engines.
   - **Cloud Run Services**: Monitor health, inspect environment variables, and launch the embedded **A2A Protocol Tester** (`/.well-known/agent.json` handshake & JSON-RPC `message/send`).
   - **Dialogflow CX Agents**: Inspect connected Conversational Agents across regions.

### 📚 Group 2: Knowledge & Resources
5. **Connectors & Data Stores (`/datastores`)**: Unified dual-tab workspace for **Search Data Stores** and **Enterprise Data Connectors**:
   - **Search Data Stores**: Create, edit, and query unstructured search stores with Digital, Layout, and OCR parsing, GCS (`gs://`) batch import, browser file upload, and live WIF-aware search testing.
   - **156-Connector Validation Catalog**: Interactive **Validation Checklist** tab powered by **156 connector profiles**, **1,324 validation items**, and **424 automated diagnostic probes** across 5 catalog modules (verified via `node scripts/syncChecklists.mjs --check-only`).
   - **BYO-MCP Configuration & RFC 6901 Citation Mappings (`BYOMCPConfigTab.tsx`)**: Dynamic JSON-RPC 2.0 `tools/list` discovery, **Smart Routing & Evaluation Advisor** across 6 domain archetypes with credential-safe metadata-only `PATCH` (`params.custom_mcp_Metadata`), visual **Override Schema** builder (`mcp_tools_schema`), and **RFC 6901 JSON Pointer** citation key mappings (`mcp_tools_citation_keys`: `tool_names`, `title_key`, `url_key`, `url_Match_pattern`).
6. **Quota & Cost Estimator (`/quota`)**: Model pooled daily Gemini Enterprise quota allowances across **Standard** and **Plus** editions (auto-filled from Project-Local License Configs or Cloud Billing) alongside live 24-hour usage from Cloud Monitoring.

### 🧪 Group 3: Testing & Analysis
7. **Engines & Assistants (`/assistant`)**: Configure Discovery Engine apps and default assistants across 8 detail sub-tabs (`Overview`, `Agents`, `Skills`, `User Memories`, `Connected DataStores`, `Notebooks`, `History`, `Customize`), plus the streaming chat **Playground**:
   - **Assistant Configuration & Best-Practices Evaluator (`AssistantEvaluationModal.tsx`)**: Live 6-endpoint diagnostic audit scoring each engine (`0–100`, Grade `A–F`) across **5 weighted pillars** (**Retrieval & Fan-Out** 25, **Skills & Query Routing** 20, **Engine & Assistant Config** 20/25, **Security & Guardrails** 20/15, **BYOMCP Readiness** 15). Surfaces actionable-only findings (`CRITICAL`, `WARNING`, `INFO`), a **BYOMCP Descriptions & Instructions Advisor** with 1-click credential-safe `PATCH`, and **1-Click Recommended Query-Routing Skills** (`Enterprise DataStore Query Router and Optimizer` + per-BYOMCP companion skills created as organizational `ALL_USERS` skills).
   - **Deploy Redirect & Private Routing URL (`Customize` tab)**: Provision Public Global External Application Load Balancers (HTTP 301 redirect + managed SSL) or Private Internal Application Load Balancers + Private Cloud DNS + VPC-SC / PSC bundles via Cloud Build. Features **Cloud Build service account IAM pre-flight** (`roles/compute.loadBalancerAdmin`, `roles/compute.networkAdmin`, `roles/dns.admin`) with 1-click **Grant Cloud Build IAM Roles**, **Target Portal CID** auto-discovery & **Auto-Initialize Web App**, optional cross-project **Cloud DNS Host Project ID (`dnsProjectId`)**, and idempotent provisioning/teardown (`vanityBuildScript.ts`).
   - **Agent Telemetry & Observability Enforcement (`Agents` tab)**: Real-time coverage pill (`Telemetry: X / Y Monitored`), App Engine vs. Agent telemetry guardrails, and 1-click `Enforce Telemetry Policy`.
8. **Architecture (`/architecture`)**: Interactive React Flow topology graph mapping Project → Engines → Assistants → Agents → Data Stores → Cloud Run → Authorizations, with a full **WCAG 2.1.1 Keyboard-Accessible Matrix View** and `.drawio` / `.png` / `.json` export.

### 🛡️ Group 4: Security & Access
9. **Authorizations (`/authorizations`)**: Manage OAuth 2.0 configurations, client credentials, and token endpoints for agent tools, with live usage cross-referencing across `global`, `us`, and `eu`.
10. **Agent Permissions (`/permissions`)**: Global IAM scanner sweeping every engine, assistant, and agent across `global`, `us`, and `eu`, folding in inherited project-level roles with CSV and standalone Python script export.
11. **Model Armor (`/model-armor`)**: LLM content safety, **Exclusion Rules (`Preview`)**, and real-time streaming sanitization:
    - **Exclusion Rules (`Preview`) & Streaming Compatibility**: Configure `DICTIONARY` (`wordList` up to 100 words × 200 chars) and `REGEX` (up to 1,000 chars) exclusion rules for `PROMPT_INJECTION_AND_JAILBREAK` and `RESPONSIBLE_AI`, with **+ DevOps False-Positive Preset**, real-time streaming compatibility checks (`MATCHING_SCOPE_PARTIAL_MATCH` vs. `MATCHING_SCOPE_FULL_MATCH`), 0.5 MB (~130,000 tokens) payload limit indicators, and `templateMetadata.logSanitizeOperations`.
    - **Activity Logs & Evaluate for Exclusion Drawer**: Filter violation logs by **Blocked Only** or **Exclusion Overrides**, inspect `Streaming Chunk`, `Exclusion Override`, and `Exclusion Skipped (>0.5MB)` badges, and click **Evaluate for Exclusion** (`ExclusionRuleEvaluatorModal.tsx`) for automated 4-verdict classification (`LIKELY_FALSE_POSITIVE`, `REVIEW_REQUIRED`, `HIGH_RISK_TRUE_POSITIVE`, `UNSUPPORTED_FILTER`) and 1-click **Apply Exclusion to Policy** (`PATCH ?updateMask=filterConfig,templateMetadata`).
12. **Observability (`/observability`)**: Live operational analytics powered by Cloud Logging and BigQuery (11 deployed SQL analytics views, explicit `LIVE BIGQUERY TELEMETRY` vs. `SIMULATED DEMO DATA` banner, and the **Agent Observability Policy & Telemetry Coverage Hub**).

### ⚙️ Group 5: System
13. **Backup & Recovery (`/backup`)**: Granular GCS (`gs://`) JSON snapshot and restore across 8 resource cards (`DiscoveryResources`, `Collections`, `Engine`, `DataStore`, `Assistant`, `Agents`, `ReasoningEngine`, `Authorization`) plus disaster recovery runbook.
14. **App Config Audit (`/config-audit`)**: Read-only 5-pillar parity comparison (**Engines & Assistants**, **Agents**, **Enterprise Skills**, **Data Stores & Connectors**, **Authorizations & Seat Allocations**) between a Source and Target project/app.
15. **Licenses (`/licenses`)**: Manage Discovery Engine user seat assignments and billing account license allocations, backed by an IndexedDB cache, CSV import/export, AD Group License Sync, and the serverless **Auto-Pruner** deployment wizard.

---

## Least-Privilege IAM Roles Reference

To enforce Google Cloud security best practices, grant users and service accounts only the roles necessary for their intended workflows:

| Feature / Module | Minimum Required IAM Roles | Purpose |
| :--- | :--- | :--- |
| **Discovery Engine / Agents / Assistants** | `roles/discoveryengine.editor` (or `roles/discoveryengine.admin`) | Manage search engines, assistants, datastores, skills, and agents |
| **Vertex AI Reasoning Engines** | `roles/aiplatform.user` | Query and inspect Vertex AI Reasoning Engines |
| **Skills Registry** | `roles/agentregistry.editor` | Upload, version, activate, and delete central Agent Registry skills |
| **Cloud Run Agent Deployments** | `roles/run.developer` + `roles/iam.serviceAccountUser` | Deploy and query containerized agents on Cloud Run |
| **Cloud Build (ADK & Redirect Deployments)** | `roles/cloudbuild.builds.editor` | Trigger automated container builds and redirect infrastructure jobs |
| **Redirect & Private Routing URL (Cloud Build SAs)** | `roles/compute.loadBalancerAdmin` + `roles/compute.networkAdmin` + `roles/dns.admin` | Granted to `{projectNumber}-compute@developer.gserviceaccount.com` and `{projectNumber}@cloudbuild.gserviceaccount.com` (and on `dnsProjectId` for cross-project DNS zones) |
| **Cloud Storage (Backups & Datastores)** | `roles/storage.objectAdmin` | Read/write snapshots, import documents, and stage build sources |
| **Observability & Analytics** | `roles/bigquery.user` + `roles/bigquery.dataViewer` | Query audit log datasets and deploy BigQuery analytics views |
| **Model Armor & Error Logs** | `roles/modelarmor.admin` + `roles/logging.viewer` | Create/`PATCH` safety templates, Exclusion Rules, and read sanitization logs |
| **Quota & Cost Estimator** | `roles/monitoring.viewer` | Query metric time-series via Cloud Monitoring API |
| **API Preflight Health Check** | `roles/serviceusage.serviceUsageConsumer` | Verify enabled APIs on project startup |
| **Comprehensive Admin (Full Access)** | `roles/discoveryengine.admin` + `roles/aiplatform.admin` + `roles/run.admin` | Full administrative control across all 15 sidebar modules |

---

## Quick Start & Local Development

### 1. Prerequisites
- **Node.js** 18+ and **npm** 9+.
- A **Google Cloud Project** with billing enabled.
- The Google Cloud SDK (`gcloud`) installed and authenticated.

### 2. Configure OAuth 2.0 Credentials
1. Navigate to **APIs & Services > Credentials** in the Google Cloud Console.
2. Click **Create Credentials > OAuth client ID**.
3. Select **Web application**.
4. Under **Authorized JavaScript origins**, add:
   - `http://localhost:5173` (Vite dev server)
   - `http://localhost:3000` (production preview)
5. Copy the generated **Client ID**.

### 3. Environment Setup
Copy `.env.example` to `.env.local` and set your Client ID:
```bash
cp .env.example .env.local
```
Or paste your Client ID in `public/config.json`:
```json
{
  "GOOGLE_CLIENT_ID": "your-client-id.apps.googleusercontent.com"
}
```

### 4. Install & Launch
```bash
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

### 5. Authentication & Preflight
Upon initial launch, you can authenticate using either:
- **Sign in with Google**: One-click OAuth login via Google Identity Services.
- **Manual Access Token**: Useful for sandboxed environments or automated testing:
  ```bash
  gcloud auth print-access-token
  ```
The initial screen executes an automated **13-API preflight health check** verifying enabled Google Cloud APIs, Discovery Engine Service Agent bindings, and 11 IAM permissions.

---

## Production Deployment to Cloud Run

### Option A: Using Google Cloud Buildpacks (Fastest)
```bash
gcloud run deploy gemini-enterprise-manager \
  --source . \
  --project [YOUR_PROJECT_ID] \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_CLIENT_ID="[YOUR_CLIENT_ID].apps.googleusercontent.com"
```

### Option B: Docker Container
```bash
# Build container image
docker build -t gcr.io/[YOUR_PROJECT_ID]/gemini-enterprise-manager:latest .

# Push to Container Registry / Artifact Registry
docker push gcr.io/[YOUR_PROJECT_ID]/gemini-enterprise-manager:latest

# Deploy to Cloud Run
gcloud run deploy gemini-enterprise-manager \
  --image gcr.io/[YOUR_PROJECT_ID]/gemini-enterprise-manager:latest \
  --project [YOUR_PROJECT_ID] \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_CLIENT_ID="[YOUR_CLIENT_ID].apps.googleusercontent.com"
```

---

## Accessibility & Standards (WCAG 2.1 Compliance)

Gemini Enterprise Manager adheres to WCAG 2.1 accessibility standards:
- **Universal Focus Trapping & Modal Navigation**: Every modal, drawer, and flyout incorporates focus trapping, `<Escape>` key dismissal, `role="dialog"`, `aria-modal="true"`, and automatic focus restoration upon closing.
- **Accessible Table Sorting**: All tabular data structures utilize semantic `<button>` triggers within `<th>` elements featuring `aria-sort="ascending" | "descending" | "none"` and descriptive `aria-label` announcements.
- **Icon Controls**: 100% of icon-only buttons include descriptive `aria-label` attributes for screen readers.
- **Motion Sensitivity**: Honors `@media (prefers-reduced-motion: reduce)` by suppressing non-essential animations, transitions, and spinners.
- **Architecture Matrix Fallback (WCAG 2.1.1)**: Full keyboard-navigable tabular matrix view serving as a complete functional alternative to the interactive SVG topology graph.

---

## Verification & Testing

The codebase includes a comprehensive unit, documentation integrity, and catalog synchronization test suite:
```bash
# Type check without emitting
npx tsc --noEmit

# Verify 156-connector checklist catalog synchronization
node scripts/syncChecklists.mjs --check-only

# Run Vitest test suite (including User Guide & Sidebar integrity tests)
npx vitest run

# Production bundle build
npm run build
```

---

## License

Copyright 2024 Google LLC. Licensed under the Apache License, Version 2.0.
