import { AdkAgentConfig } from "./types";

export * from "./cicdTemplates";
export * from "./adkDeployScriptTemplate";

export const generateDesignSpec = (config: AdkAgentConfig): string => {
  return `# DESIGN_SPEC.md

## Overview
${config.description}

## Example Use Cases
1. **User**: "Hello"
   **Agent**: "Hello! How can I help you today?"

## Tools Required
${config.tools.map((t) => `- ${t.variableName} (${t.type})`).join("\n")}

## Constraints & Safety Rules
- The agent must strictly follow the system instructions.
- Do not hallucinate capabilities not provided by tools.
`;
};

export const generateLaunchScript = (_config?: AdkAgentConfig): string => {
  return `#!/bin/bash

# Ensure we are in the script's directory or project root
cd "$(dirname "$0")/.."

# Check if adk is in the path
if ! command -v adk &> /dev/null; then
    # Try to find it in the common venv locations
    if [ -f "../../.venv/bin/adk" ]; then
        export PATH="../../.venv/bin:$PATH"
    elif [ -f ".venv/bin/adk" ]; then
        export PATH=".venv/bin:$PATH"
    else
        echo "WARNING: 'adk' command not found in PATH or standard venv locations."
        echo "Please ensure you have activated your virtual environment."
    fi
fi

# Get the access token from gcloud
echo "Fetching GCP access token..."
TOKEN=$(gcloud auth print-access-token)

if [ -z "$TOKEN" ]; then
    echo "Error: Failed to get access token. Please run 'gcloud auth login' first."
    exit 1
fi

# Load AUTH_ID from .env or app/.env if present
ENV_FILE=""
if [ -f .env ]; then
    ENV_FILE=".env"
elif [ -f app/.env ]; then
    ENV_FILE="app/.env"
fi

if [ -n "$ENV_FILE" ]; then
    # Grep AUTH_ID, remove quotes if any
    ENV_AUTH_ID=$(grep -E '^[[:space:]]*AUTH_ID[[:space:]]*=' "$ENV_FILE" | sed -E 's/^[[:space:]]*AUTH_ID[[:space:]]*=[[:space:]]*//' | sed -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
else
    echo "No .env file found in root or app directory."
fi

if [ -z "$ENV_AUTH_ID" ]; then
    echo "No AUTH_ID found in .env, defaulting to GCP_ACCESS_TOKEN"
    export AUTH_ID="GCP_ACCESS_TOKEN"
    export GCP_ACCESS_TOKEN="$TOKEN"
else
    echo "Exporting token to environment variable: $ENV_AUTH_ID"
    export "$ENV_AUTH_ID"="$TOKEN"
fi

echo "Launching ADK Web from the agent root directory..."
adk web
`;
};

export const generateAdkEnvFile = (
  config: AdkAgentConfig,
  projectNumber: string,
  location: string,
  stagingBucket: string,
): string => {
  const isGlobalModel =
    config.model?.startsWith("gemini-3") ||
    config.model?.includes("3.5") ||
    config.model?.includes("latest");
  const modelLocation = isGlobalModel ? "global" : location;
  const deploymentLocation =
    !location || location === "global" ? "us-central1" : location;
  let env = `GOOGLE_CLOUD_PROJECT="${projectNumber}"
GOOGLE_CLOUD_LOCATION="${modelLocation}"
DEPLOYMENT_LOCATION="${deploymentLocation}"
STAGING_BUCKET="${stagingBucket}"
GOOGLE_GENAI_USE_VERTEXAI="true"
ENABLE_A2A="true"`;

  if (config.model) {
    env += `\nMODEL="${config.model}"`;
  }

  if (config.enableThinking) {
    const isGemini3 =
      config.model?.startsWith("gemini-3") ||
      config.model?.includes("3.5") ||
      config.model?.includes("3.8") ||
      config.model?.includes("3.1");
    if (isGemini3) {
      env += `\nTHINKING_LEVEL="${config.thinkingLevel || "HIGH"}"`;
    } else {
      env += `\nTHINKING_BUDGET="${config.thinkingBudget || 1024}"`;
    }
  }

  if (config.modelArmorTemplate) {
    env += `\nMODEL_ARMOR_TEMPLATE="${config.modelArmorTemplate}"`;
  }

  if (config.enableOAuth && config.authId) {
    env += `\nAUTH_ID="${config.authId}"`;
  }

  if (config.enableTelemetry) {
    env += `\nGOOGLE_CLOUD_AGENT_ENGINE_ENABLE_TELEMETRY="true"`;
  }

  // Always disable JSON schema serialization for function declarations to keep prompt token size minimal and prevent API crashes.
  env += `\nADK_DISABLE_JSON_SCHEMA_FOR_FUNC_DECL="1"`;

  if (config.enableMessageLogging) {
    env += `\nOTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT="true"`;
  }

  if (config.enableDiscoveryApi || (config.discoveryConfig && config.discoveryConfig.engineId)) {
    env += `\n
# Discovery Engine
DISCOVERY_ENGINE_PROJECT_ID="${config.discoveryConfig.projectId || projectNumber}"
DISCOVERY_ENGINE_LOCATION="${config.discoveryConfig.location || "global"}"
DISCOVERY_ENGINE_COLLECTION="${config.discoveryConfig.collection || "default_collection"}"
DISCOVERY_ENGINE_ENGINE_ID="${config.discoveryConfig.engineId || ""}"
DISCOVERY_ENGINE_DATA_STORE_IDS="${config.discoveryConfig.dataStoreIds || ""}"`;
  }

  if (config.enableBigQueryMcp) {
    env += `\n
# BigQuery
BQ_USER_PROJECT="${projectNumber}"`;
  }

  if (config.customMcpEndpoints && config.customMcpEndpoints.length > 0) {
    env += `\n\n# Custom MCP Endpoints`;
    config.customMcpEndpoints.forEach((ep) => {
      if (ep.name && ep.url) {
        const envKey = `MCP_SERVER_${ep.name.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}_URL`;
        env += `\n${envKey}="${ep.url}"`;
      }
    });
  }

  return env;
};

export const generateAdkRequirementsFile = (config: AdkAgentConfig): string => {
  const isV2 = config.adkVersion === "2.2";
  const defaultDeps = isV2
    ? [
      "google-antigravity==0.1.3",
      "pydantic>=2.0.0",
      "python-dotenv",
      "nest_asyncio",
      "requests",
      "httpx",
    ]
    : [
      "google-adk[eval]>=2.3.0,<3.0.0",
      "google-cloud-aiplatform[adk,agent_engines]>=1.75.0",
      "python-dotenv",
      "nest_asyncio",
      "google-auth",
      "requests",
      "google-genai",
      "cloudpickle",
      "mcp>=1.24.0,<2.0.0",
      "httpx",
    ];

  if (config.deploymentTarget === "cloud_run") {
    defaultDeps.push("uvicorn", "fastapi");
  }

  if (config.enableOAuth) {
    defaultDeps.push("google-auth-oauthlib>=1.2.2", "google-api-python-client");
  }

  if (config.enableGraphvizRendering) {
    defaultDeps.push("google-cloud-storage");
  }

  if (config.enableBigQueryMcp) {
    defaultDeps.push("google-cloud-bigquery");
  }

  if (config.enableBqAnalytics) {
    if (!defaultDeps.includes("google-cloud-bigquery")) {
      defaultDeps.push("google-cloud-bigquery");
    }
    defaultDeps.push("google-cloud-bigquery-storage");
  }

  if (config.enableSecurityCommandCenterApi) {
    defaultDeps.push("google-cloud-securitycenter");
  }

  if (config.enableRecommenderApi) {
    defaultDeps.push("google-cloud-recommender", "google-cloud-run");
  }

  if (config.enableServiceHealthApi) {
    defaultDeps.push("google-cloud-servicehealth");
  }

  if (config.enableNetworkManagementApi) {
    defaultDeps.push("google-cloud-network-management");
  }

  if (config.enableEmailTool) {
    defaultDeps.push("markdown");
  }

  if (config.enableCloudLoggingApi) {
    defaultDeps.push("google-cloud-logging");
  }

  if (config.enableCloudMonitoringApi) {
    defaultDeps.push("google-cloud-monitoring");
  }

  if (config.enableCloudRunApi) {
    defaultDeps.push("google-cloud-run");
  }

  if (config.enableResourceManagerApi) {
    defaultDeps.push("google-cloud-resource-manager");
  }

  if (config.enableAdminActivityApi) {
    defaultDeps.push("google-cloud-logging");
  }

  if (config.enableDatabaseFleetApi) {
    // Uses google-api-python-client, already handled in enableOAuth, but ensuring it's there
    if (!defaultDeps.includes("google-api-python-client")) {
      defaultDeps.push("google-api-python-client");
    }
  }

  if (config.enableCodeExecution) {
    defaultDeps.push("networkx", "matplotlib", "pandas", "seaborn");
  }

  if (config.enableGraphvizRendering) {
    defaultDeps.push("graphviz");
  }

  // A2A clients usually need requests or aiohttp, already got requests.

  return defaultDeps.join("\n");
};

export const generateAdkReadmeFile = (config: AdkAgentConfig): string => {
  return `# ${config.name || "Custom Agent"}

## Setup
    1. Create a virtual environment: \`python3 -m venv venv && source venv/bin/activate\`
2. Install dependencies: \`pip install -r requirements.txt\`
3. Set environment variables in \`.env\`.

## Files
- \`app.py\`: The asynchronous sync wrapper and deployment entrypoint.
- \`agent.py\`: Defines the agent instruction, model, and tool bindings.
- \`.env\`: Local environment variables.
- \`requirements.txt\`: Python dependencies.
- \`auth.py\`: Common authentication utilities (if needed).
- \`tools.py\`: Tool definitions.
- \`__init__.py\`: Empty init file.

## Deployment
Run the deployment script to deploy the agent to Vertex AI Agent Engine:
\`\`\`bash
python deploy_re.py
\`\`\`

## Local Testing
To test your agent locally and interact with it in your browser, launch it using the generated wrapper script. This script automatically provisions your gcloud user credentials for local environment variables:
\`\`\`bash
chmod +x scripts/launch_local.sh
./scripts/launch_local.sh
\`\`\`

## CI/CD Pipeline Configuration
${config.enableCiCd ? (config.ciCdRunner === 'github_actions' ? `
This agent is configured with GitHub Actions.
1. Create a Workload Identity Pool and Provider in Google Cloud.
2. Grant the service account the required roles (e.g., roles/aiplatform.user, roles/run.developer, roles/iam.workloadIdentityUser).
3. The generated \`.github/workflows/deploy.yaml\` is pre-configured with your WIF Provider and Service Account.
4. Push to the \`main\` branch to trigger the pipeline automatically.` : config.ciCdRunner === 'google_cloud_build' ? `
This agent is configured with Google Cloud Build.
1. In the Google Cloud Console, navigate to Cloud Build > Triggers.
2. Create a new trigger targeting your repository's \`main\` branch.
3. Ensure the default Cloud Build Service Account has required permissions to deploy.
4. Push to the \`main\` branch to trigger the pipeline automatically.` : 'No CI/CD pipeline enabled.') : 'No CI/CD pipeline enabled.'}

## Google Cloud Managed MCP Tool IAM Requirements
If this agent invokes Google Cloud remote MCP servers (such as BigQuery at \`https://bigquery.googleapis.com/mcp\` or Cloud Logging at \`https://logging.googleapis.com/mcp\`):
- The calling identity (**end-user** under OAuth delegation, or the **runtime service account** under ADC) must have the **\`roles/mcp.toolUser\`** role (\`mcp.tools.call\`).
- In addition, the principal must possess standard service-level data permissions (e.g., \`roles/bigquery.dataViewer\` and \`roles/bigquery.jobUser\`).

\`\`\`bash
# Grant MCP Tool User role:
gcloud projects add-iam-policy-binding PROJECT_ID \\
  --member="user:USER_EMAIL" \\
  --role="roles/mcp.toolUser"
\`\`\`
`;
};
