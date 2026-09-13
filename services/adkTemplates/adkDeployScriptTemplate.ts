import { AdkAgentConfig } from "./types";
import { assertValidGcpResourceName } from "../shellSafety";

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
env_vars = {}
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
                    # Append strictly non-reserved keys to env_vars dict for deployment
                    # We pass env_vars as a dict {key: value} rather than a list [key, ...].
                    # In google-cloud-aiplatform, if env_vars is passed as a list, the SDK
                    # unconditionally appends GOOGLE_CLOUD_AGENT_ENGINE_ENABLE_TELEMETRY without
                    # checking if it is already present, which causes a duplicate EnvVar and triggers:
                    # '400 List of found errors: 1.Field: reasoning_engine.spec.deployment_spec.env; Message: EnvVar names must be unique.'
                    # Passing env_vars as a dict ensures keys are deduplicated and handled idempotently by the SDK.
                    # WARNING: Vertex AI will reject payloads holding empty string values, so we filter out those cases here.
                    if value and (key not in ["GOOGLE_CLOUD_PROJECT", "STAGING_BUCKET", "PROJECT_ID", "DEPLOYMENT_LOCATION"]):
                        env_vars[key] = value

        logger.info(f"Final deployment env_vars: {list(env_vars.keys())}")
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

    # Auto-register Agent to Gemini Enterprise (Discovery Engine) if engine ID is configured
    disc_engine = os.getenv("DISCOVERY_ENGINE_ENGINE_ID")
    if disc_engine:
        logger.info(f"Auto-registering Agent to Gemini Enterprise (Discovery Engine: {disc_engine})...")
        import requests
        import google.auth
        from google.auth.transport.requests import Request
        
        disc_project = os.getenv("DISCOVERY_ENGINE_PROJECT_ID", project_id)
        disc_location = os.getenv("DISCOVERY_ENGINE_LOCATION", "global")
        disc_collection = os.getenv("DISCOVERY_ENGINE_COLLECTION", "default_collection")
        disc_host = f"{disc_location}-discoveryengine.googleapis.com" if disc_location and disc_location != "global" else "discoveryengine.googleapis.com"
        
        credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        credentials.refresh(Request())
        
        api_url = f"https://{disc_host}/v1alpha/projects/{disc_project}/locations/{disc_location}/collections/{disc_collection}/engines/{disc_engine}/assistants/default_assistant/agents"
        
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
                patch_url = f"https://{disc_host}/v1alpha/{disc_agent['name']}?updateMask=description,adkAgentDefinition,authorizationConfig"
                patch_res = requests.patch(patch_url, headers=headers, json=payload)
                if patch_res.status_code in (200, 201):
                    logger.info("Successfully updated agent in Gemini Enterprise!")
                else:
                    raise RuntimeError(f"Gemini Enterprise agent update failed ({patch_res.status_code}): {patch_res.text}")
            else:
                logger.info("Agent not found in Gemini Enterprise. Creating...")
                post_res = requests.post(api_url, headers=headers, json=payload)
                if post_res.status_code in (200, 201):
                    logger.info("Successfully registered in Gemini Enterprise!")
                else:
                    raise RuntimeError(f"Gemini Enterprise agent registration failed ({post_res.status_code}): {post_res.text}")
        elif list_res.status_code == 404:
            logger.info("Assistant or collection not found yet. Attempting direct agent creation...")
            post_res = requests.post(api_url, headers=headers, json=payload)
            if post_res.status_code in (200, 201):
                logger.info("Successfully registered in Gemini Enterprise!")
            else:
                raise RuntimeError(f"Gemini Enterprise agent registration failed ({post_res.status_code}): {post_res.text}")
        else:
            raise RuntimeError(f"Failed to query existing agents in Discovery Engine ({list_res.status_code}): {list_res.text}")
except Exception as e:
    logger.error(f"Deployment/Update Failed: {e}")
    raise
`.trim();
};

