# Gemini Enterprise Manager

A comprehensive, production-grade web console to inspect, configure, test, and govern Google Cloud Gemini Enterprise resources. This application provides a unified operational dashboard for Discovery Engine, Vertex AI Reasoning Engines, Agent Registry (Skills), Data Stores, Cloud Run runtimes, Model Armor safety, Observability, and Enterprise Access Governance.

Built with **React 18**, **TypeScript**, **Vite**, and **Tailwind CSS**, communicating directly with Google Cloud APIs using the **Google API JavaScript Client (`gapi`)** and OAuth 2.0.

---

## Complete Feature Matrix (18 Console Modules)

### 🤖 Agent Management & Studio
1. **Agent Manager**: Discover, inspect, and manage Discovery Engine agents across collections. Toggle states (`ENABLED` / `DISABLED`), inspect session history, and update display configurations.
2. **Skills Registry**: Centralized enterprise skills governance powered by Google Cloud Agent Platform (`agentregistry.googleapis.com`):
   - **Package Authoring & Upload**: Create new skills or upload `.zip` bundles containing `SKILL.md` instructions and tool definitions.
   - **Immutable Revision Control**: Inspect versioned revisions (`revisions/rev-1`), build logs, and raw JSON specifications.
   - **Catalog Activation**: Transition skills to `STATE_ACTIVE` with default revisions for company-wide distribution.
   - **1-Click GE Engine Deployment**: Provision skills directly into Gemini Enterprise engine assistants with `scope: ALL_USERS`, displaying under **"From my organization"**.
   - **Multi-Region Support**: Seamlessly switch between `Global`, `EU`, and `US` locations.
3. **Agent Builder (ADK Studio)**: Low-code generator and one-click deployment for Vertex AI Agent Engine applications:
   - **Progressive Disclosure Interface**: Organized into collapsible accordion categories (Core Capabilities, Managed MCPs, Enterprise GCP APIs, Custom Endpoints, OAuth, and Observability).
   - **Reasoning Depth & Thinking Budget**: Configure thinking levels (`HIGH`, `MEDIUM`, `LOW`, `MINIMAL`) and token budgets.
   - **Code Execution & Graphviz**: Sandboxed Python execution and client-side architecture diagram rendering.
   - **Cloud Build & Cloud Run**: Automated build and deployment to Google Cloud serverless infrastructure.
4. **Agent Catalog**: Browse curated open-source templates and deploy agents directly into your Google Cloud project.
5. **Agent Runtimes**: Discover and operate runtime engines:
   - **Vertex AI Reasoning Engines**: View sessions, execute queries, and inspect execution traces.
   - **Cloud Run Agent Services**: Monitor health, inspect revision tags, and test endpoints.
   - **Dialogflow CX Agents**: Inspect connected Conversational Agents.

### 📚 Knowledge & Engines
6. **Data Stores**: Vertex AI Search and Gemini Enterprise datastore management:
   - Create, edit, and configure datastores with advanced document parsing (Digital, OCR, Layout Parser).
   - Import documents directly from Google Cloud Storage (`gs://`) or local uploads.
   - Configure chunking strategies and indexing status.
7. **Engines & Assistants**: Configure Discovery Engine reasoning engines and default assistants:
   - Manage system instructions, search grounding parameters, and safety thresholds.
   - Link datastores and manage agent attachments.
   - **Agent Telemetry & Observability Enforcement**: Visual coverage breakdown (`X / Y Monitored`, `Full` vs `Partial`), App Engine vs Agent telemetry guardrails (`App Telemetry: OFF`), bulk policy synchronization with sensitive data logging alignment, per-agent configuration drawers, and Dialogflow legacy schema detection.
8. **Quota & Cost Estimator**: Inspect real-time API quota utilization via Cloud Monitoring API time-series and estimate monthly SKU costs across Discovery Engine, Gemini queries, and vector indexing.
9. **Playground (Assistant Testing)**: Interactive chat playground with streaming completions, tool call inspector, citation badges, grounding metadata viewer, and raw request/response JSON explorer.

### 🔌 Integrations & Infrastructure
10. **Connectors**: Inspect external enterprise data connectors (Jira, Salesforce, Confluence, SharePoint, BigQuery). Monitor synchronization health, connector run status, and error logs.
11. **Architecture Topology**: Dynamic node-link visualization mapping your Google Cloud project, Engines, Assistants, Agents, Data Stores, and Cloud Run backends:
    - Interactive graph view with upstream/downstream dependency traversal.
    - **WCAG 2.1.1 Keyboard Fallback**: Accessible tabular matrix view with inbound/outbound connection badges and deep inspection.
12. **Custom Domains & Load Balancers**: Inspect and manage Global External Application Load Balancers, forwarding rules, and Google-managed SSL certificates for custom domains.

### 🛡️ Security, Governance & Observability
13. **Authorizations**: Manage OAuth2 configurations, client credentials, and token endpoints for agentic tools.
14. **Agent Permissions**: Inspect and update IAM policies, roles, and user access bindings across agents and datastores.
15. **Model Armor**: Comprehensive LLM safety and sanitization:
    - **Policy Generator**: Design templates to block prompt injection, hate speech, harassment, and PII leakage.
    - **Sanitization Audit Log**: Inspect real-time Cloud Logging audit entries for triggered safety filters and blocked payloads.
16. **Observability**: Live operational analytics powered by Google Cloud Logging and BigQuery:
    - Request volume, latency percentiles, error rates, and message distributions.
    - Copyable SQL queries and direct links to Cloud Trace.
    - **Agent Observability Policy & Telemetry Coverage Hub**: Multi-engine telemetry audit and enforcement resolving the two-tier logging boundary (App Engine user queries vs individual agent reasoning traces), featuring automated event-driven sync (Cloud Functions/Eventarc) and one-click bulk sweep remediation.
17. **Backup & Recovery**: Granular snapshot and restoration for Collections, Engines, Agents, and User Sessions to Cloud Storage (`gs://`).
18. **Licenses**: Enterprise Gemini license allocation and active pruner:
    - Filter user assignments by principal, assignment state, license config, and last login.
    - Deploy an automated serverless pruner to reclaim unused licenses.

---

## Least-Privilege IAM Roles Reference

To enforce Google Cloud security best practices, grant users and service accounts only the roles necessary for their intended workflows:

| Feature / Module | Minimum Required IAM Roles | Purpose |
| :--- | :--- | :--- |
| **Discovery Engine / Agents / Assistants** | `roles/discoveryengine.editor` | Manage search engines, assistants, datastores, and agents |
| **Vertex AI Reasoning Engines** | `roles/aiplatform.user` | Query and inspect Vertex AI Reasoning Engines |
| **Skills Registry** | `roles/agentregistry.editor` | Upload, version, activate, and delete enterprise skills |
| **Cloud Run Agent Deployments** | `roles/run.developer` + `roles/iam.serviceAccountUser` | Deploy and query containerized agents on Cloud Run |
| **Cloud Build (ADK Deployments)** | `roles/cloudbuild.builds.editor` | Trigger automated container builds from ADK templates |
| **Cloud Storage (Backups & Datastores)** | `roles/storage.objectAdmin` | Read/write snapshots, import documents, and store templates |
| **Observability & Analytics** | `roles/bigquery.user` + `roles/bigquery.dataViewer` | Query audit log datasets and analytics views |
| **Model Armor & Error Logs** | `roles/logging.viewer` | Read sanitization audit events and execution logs |
| **Quota & Cost Estimator** | `roles/monitoring.viewer` | Query metric time-series via Cloud Monitoring API |
| **Custom Domains & Load Balancers** | `roles/compute.networkViewer` | Inspect global forwarding rules and SSL certificates |
| **API Preflight Health Check** | `roles/serviceusage.serviceUsageConsumer` | Verify enabled APIs on project startup |
| **Comprehensive Admin (Full Access)** | `roles/discoveryengine.admin` + `roles/aiplatform.admin` + `roles/run.admin` | Full administrative control across all 18 modules |

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
The initial screen executes an automated **13-point preflight health check** verifying enabled Google Cloud APIs and Service Agent permissions.

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

The codebase includes a comprehensive unit and integration test suite:
```bash
# Type check without emitting
npx tsc --noEmit

# Run Vitest test suite
npx vitest run

# Production bundle build
npm run build
```

---

## License

Copyright 2024 Google LLC. Licensed under the Apache License, Version 2.0.
