# Gemini Enterprise Manager

A comprehensive web interface to manage Google Cloud Gemini Enterprise resources. This application provides a unified console to manage Agents, Agent Engines, Data Stores, Authorizations, and more, effectively acting as a GUI for the Discovery Engine and Vertex AI APIs.

It is built with **React**, **Vite**, and **Tailwind CSS**, and communicates directly with Google Cloud APIs using the **Google API JavaScript Client (`gapi`)**.

## Features Overview

### 🤖 Agent Management
*   **GE Agent Manager**: List, create, update, and delete agents. Supports toggling agent status (Enable/Disable).
*   **⚡ Skills Registry**: Central enterprise skills management powered by Google Cloud Agent Platform (`agentregistry.googleapis.com`):
    *   **Package Authoring & Upload**: Create new skills or upload `.zip` packages containing `SKILL.md` instructions and subfiles.
    *   **Immutable Revision Control**: Inspect versioned revisions (`revisions/rev-1`), compilation logs, and raw JSON specs.
    *   **Catalog Activation**: Transition skills to `STATE_ACTIVE` with default revisions for company-wide distribution.
    *   **1-Click GE App Deployment**: Provision skills directly into Gemini Enterprise engine assistants with `scope: ALL_USERS`, displaying under **"From my organization"**.
    *   **Multi-Region Support**: Switch between `🌍 Global`, `🇪🇺 EU`, and `🇺🇸 US` locations.
*   **Chat Testing**: Built-in chat interface to test agents and assistants with streaming responses, tool visualization, and grounding metadata inspection.
*   **Project Context**: Smart header with Breadcrumbs and quick project switching (Project ID/Number).

### 📚 Documentation & Help
*   **User Manual**: Built-in help system with detailed feature guides and API info.
*   **API Reference**: Clear documentation of underlying API calls for each feature.

### 🏭 Agent Engines & Runtimes
*   **Available Agents**: Discover and manage backend runtimes:
    *   **Agent Engines (Vertex AI)**: View active sessions, terminate sessions, and perform direct queries.
    *   **Direct Query**: Test runtimes directly without going through the high-level Agent API.
    *   **Vanity (Redirect) URLs**: A dedicated page for listing, viewing status, and deleting global load balancer redirect URLs for your published Agent Engines.

### 🛠️ Builder & Catalog
*   **Agent Builder**: A low-code tool to generate and deploy agents.
    *   **Quick Start Templates**: Deploy pre-built templates like the `GCP Health Monitoring Agent` or `GCP Logs Reader`.
    *   **ADK Agents**: Generates Python code (`agent.py`, `requirements.txt`) for Vertex AI Agent Engines.
        *   Supports **Google Search**, **Data Store**, **OAuth**, and **BigQuery**.
        *   **GCP Integrations**: Built-in specialized tools for **Security Command Center**, **Recommender**, **Service Health**, and **Network Management**.
        *   **Capabilities**: Includes utilities like rich HTML **Email Sending** via the Gmail API.
        *   **MCP Support**: Native toggles for enabling Cloud Logging, Cloud Monitoring, and other Google-managed MCP servers.
    *   **Cloud Build Integration**: One-click deployment to Google Cloud.
*   **Agent Catalog**: Browse sample agents from GitHub repositories and deploy them directly to your project.

### 📚 Knowledge & Data
*   **Data Stores**: Manage Vertex AI Search data stores.
    *   Create and Edit data stores with advanced parsing configuration (Digital, OCR, Layout).
    *   **Document Management**: List documents and import new files directly from your computer or Google Cloud Storage (GCS).
*   **Assistant Configuration**: Manage the default assistant's system instructions, grounding settings (Google Search), and enabled tools/actions.

### 🛡️ Security & Governance
*   **Authorizations**: Manage OAuth2 configurations for agents.
*   **Model Armor**:
    *   **Log Viewer**: Inspect sanitization logs to see what content was blocked or modified.
    *   **Policy Generator**: Create Model Armor templates to filter Hate Speech, PII, and Prompt Injection.
*   **IAM Policies**: View and edit IAM policies for specific agents directly from the UI.

### 📊 Observability
*   **Live Dashboard**: Monitor request volume, messages by role, and messages by agent.
*   **BigQuery Integration**: Queries live audit logs stored in BigQuery.
*   **Custom X-Axis Labels**: Displays both agent name and ID, helping identify duplicate names.
*   **Name Recovery**: Automatically recovers agent names from other log entries if missing in some.
*   **Query Tooltips**: View and copy the exact BigQuery queries used for metrics.

### 🔧 Operations
*   **Discovery Engine & Conversation Management**:
    *   **Share Session**: Clone a session to another user's history by User ID (email or numeric).
    *   **Copy Link**: Generate a deep link to the session in the Vertex AI Search console (handles Console CID).
    *   **Raw Content Inspection**: View full JSON for User/Model turns, including system instructions and grounding metadata.
*   **Architecture Visualizer**: An interactive node-graph visualizing the relationships between your Project, Engines, Assistants, Agents, Data Stores, and Backends.
*   **Backup & Recovery**:
    *   Full backup of Discovery Engine resources (Collections, Engines, Agents) to GCS.
    *   **Granular Backup/Restore**:
        *   Backup specific Agents, Data Stores, or Agent Engines.
        *   **Restore as User**: Restore chat history to a specific Target User ID (useful for debugging or migration).
*   **Licenses**: Monitor user license assignments and prune inactive users.
    *   **Granular Filters**: Filter user licenses down by Principal, Status, Assigned Config, and Last Login Time.
    *   **Bulk Management**: Intuitive UI-selection for applying, reassigning, or revoking configuration licenses en masse.
    *   **Auto-Pruner**: Deploy a serverless job to automatically revoke licenses for users who haven't logged in for $N days.

## Setup & Configuration

### Prerequisites
*   A Google Cloud Project.
*   The following APIs enabled:
    *   `discoveryengine.googleapis.com` (Discovery Engine / Gemini Enterprise API)
    *   `agentregistry.googleapis.com` (Agent Registry / Skills Platform API)
    *   `aiplatform.googleapis.com` (Vertex AI API)
    *   `run.googleapis.com` (Cloud Run API)
    *   `cloudbuild.googleapis.com` (Cloud Build API)
    *   `storage.googleapis.com` (Cloud Storage API)
    *   `serviceusage.googleapis.com` (Service Usage API)

### 1. Configure OAuth Consent
To use "Sign in with Google", configure an OAuth Client ID:
1.  Go to **APIs & Services > Credentials** in the Google Cloud Console.
2.  Create an **OAuth client ID** (Web application).
3.  Add the URL where this app is running to **Authorized JavaScript origins** (e.g., `http://localhost:3000` or `https://your-app.run.app`).
4.  Copy the **Client ID** and configure it using one of the options below.

### Configuration Options
You can configure the application's Google Client ID in several ways:
*   **Docker Container Environment Variable (Recommended for Deployments):** Set the `GOOGLE_CLIENT_ID` environment variable in your container environment (e.g., on Cloud Run). The entrypoint script will write this value to `config.json` automatically on startup.
*   **Static Config File:** Update `"GOOGLE_CLIENT_ID"` inside `public/config.json`.
*   **Local Development Environment:** Copy `.env.example` to `.env` and set `VITE_GOOGLE_CLIENT_ID`.
*   **UI Settings (Local Override):** Click the settings input field under Google Sign-In on the Welcome screen to paste your client ID directly. It is saved in your browser's `localStorage`.

### 2. Run Locally
```sh
npm install
npm run dev
```

### 3. Deploy to Cloud Run
You can deploy this frontend as a static site container.

**Using Google Cloud Buildpacks (Simplest):**
```sh
gcloud run deploy gemini-manager \
  --source . \
  --project [YOUR_PROJECT_ID] \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_CLIENT_ID="your-client-id"
```

**Using Docker:**
1.  Build the image: `docker build -t gcr.io/[PROJECT_ID]/gemini-manager .`
2.  Push: `docker push gcr.io/[PROJECT_ID]/gemini-manager`
3.  Deploy:
    ```sh
    gcloud run deploy gemini-manager \
      --image gcr.io/[PROJECT_ID]/gemini-manager \
      --project [YOUR_PROJECT_ID] \
      --region us-central1 \
      --allow-unauthenticated \
      --set-env-vars GOOGLE_CLIENT_ID="your-client-id"
    ```

## Usage Tips

*   **API Validation**: On first load, the app checks if required APIs are enabled. Use the "Enable APIs" button to fix missing dependencies.
*   **Access Token**: If you cannot use Google Sign-In (e.g., due to third-party cookie restrictions), you can manually paste a token generated via `gcloud auth print-access-token`.
*   **Region Selection**: Ensure you select the correct location (Global, US, EU) in the configuration bar, as Discovery Engine resources are location-specific.

## Technical Details

*   **Framework**: React 18 + Vite
*   **Styling**: Tailwind CSS
*   **State Management**: React Hooks + Session Storage
*   **Visualization**: React Flow (Architecture Graph)
*   **API Client**: `window.gapi` (Google API Client Library for JavaScript)

## API Reference

The application communicates with several Google Cloud APIs. Below is a reference of the key resources and methods used:

### Discovery Engine API (`discoveryengine.googleapis.com`)
*   **Engines**: `GET /v1alpha/projects/{project}/locations/{location}/collections/{collection}/engines`
*   **Assistants**: `GET /v1alpha/projects/{project}/locations/{location}/collections/{collection}/engines/{engine}/assistants`
*   **Agents**: `GET /v1alpha/projects/{project}/locations/{location}/collections/{collection}/engines/{engine}/assistants/{assistant}/agents`
*   **Data Stores**: `GET /v1beta/projects/{project}/locations/{location}/collections/{collection}/dataStores`
*   **Conversations**: `POST /v1alpha/projects/{project}/locations/{location}/collections/{collection}/engines/{engine}/sessions`
*   **Connectors**: `GET /v1alpha/projects/{project}/locations/{location}/collections/{collection}/dataConnector`
*   **Authorizations**: `GET /v1alpha/projects/{project}/locations/{location}/authorizations`
*   **User Licenses**: `GET /v1/projects/{project}/locations/{location}/userStores/{userStore}/userLicenses`
*   **License Allocations**: `GET /v1alpha/billingAccounts/{billingAccount}/billingAccountLicenseConfigs`

### Agent Registry API (`agentregistry.googleapis.com`)
*   **List Skills**: `GET /v1alpha/projects/{project}/locations/{location}/skills`
*   **Publish Skill**: `POST /v1alpha/projects/{project}/locations/{location}/skills?skillId={skillId}`
*   **Get Skill**: `GET /v1alpha/projects/{project}/locations/{location}/skills/{skill}`
*   **List Skill Revisions**: `GET /v1alpha/projects/{project}/locations/{location}/skills/{skill}/revisions`
*   **Activate / Update Skill**: `PATCH /v1alpha/projects/{project}/locations/{location}/skills/{skill}?updateMask=default_revision,target_state`
*   **Delete Skill**: `DELETE /v1alpha/projects/{project}/locations/{location}/skills/{skill}`

### Vertex AI API (`aiplatform.googleapis.com`)
*   **Reasoning Engines**: `GET /v1beta1/projects/{project}/locations/{location}/reasoningEngines`
*   **Chat Completions**: `POST /v1beta1/projects/{project}/locations/{location}/publishers/google/models/{model}:streamGenerateContent` (for Gemini models)

### Cloud Run API (`run.googleapis.com`)
*   **Services**: `GET /v2/projects/{project}/locations/{location}/services`

### Cloud Build API (`cloudbuild.googleapis.com`)
*   **Builds**: `POST /v1/projects/{project}/builds` (Used to deploy Agent Starter Pack)

### Cloud Storage API (`storage.googleapis.com`)
*   **Buckets**: `GET /storage/v1/b?project={project}` (Used for backup/restore and deployments)
*   **Objects**: `GET /storage/v1/b/{bucket}/o` 

### Compute Engine API (\`compute.googleapis.com\`)
*   **Global Forwarding Rules**: \`GET /compute/v1/projects/{project}/global/forwardingRules\` (Redirect URLs)
*   **Global Managed SSL Certificates**: \`GET /compute/v1/projects/{project}/global/sslCertificates\` (Redirect URLs)

### Dialogflow API (\`dialogflow.googleapis.com\`)
*   **Agents**: `GET /v3/projects/{project}/locations/{location}/agents`

### BigQuery API (`bigquery.googleapis.com`)
*   **Datasets**: `GET /bigquery/v2/projects/{project}/datasets`
*   **Tables**: `GET /bigquery/v2/projects/{project}/datasets/{dataset}/tables`
*   **Queries**: `POST /bigquery/v2/projects/{project}/queries` (Used for Analytics Metrics)

### Cloud Billing API (`cloudbilling.googleapis.com`)
*   **Billing Accounts**: `GET /v1/billingAccounts` (Used for license allocation management)

### Service Usage API (`serviceusage.googleapis.com`)
*   **Services**: `GET /v1/projects/{project}/services` (Used to validate enabled APIs on startup)

### IAM API (`iam.googleapis.com`)
*   **Permissions**: \`POST /v1/projects/{project}:testIamPermissions\` (Used to check service account permissions)

### Cloud Monitoring API (\`monitoring.googleapis.com\`)
*   **Usage Metrics (TimeSeries)**: \`GET /v3/projects/{project}/timeSeries\` (Quota Usage)

### Cloud Logging API (\`logging.googleapis.com\`)
*   **Logs**: `POST /v2/entries:list` (Used to query Model Armor violations and Connector logs)

### Model Armor API (`modelarmor.googleapis.com`)
*   **Templates**: `POST /v1/projects/{project}/locations/global/templates` (Used to create Model Armor policies)

### GitHub API (`api.github.com`)
*   **Repository Contents**: `GET /repos/{owner}/{repo}/contents/{path}` (Used by Agent Catalog and Starter Pack)

