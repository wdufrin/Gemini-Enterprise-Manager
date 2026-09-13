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

import { shellSingleQuote } from '../../services/shellSafety';
import {
  CloudRunAccessMode,
  cloudRunAccessCommentBlock,
  cloudRunAccessFlags,
  cloudRunAccessLabel,
} from '../../services/adkTemplates/types';
import { EnvVar } from './types';

export function getCloudRunDeployScript(
  region: string,
  projectId: string,
  agentName: string,
  envVars: EnvVar[],
  selectedBucket: string,
  accessMode: CloudRunAccessMode
): string {
  const imageName = `${region}-docker.pkg.dev/${projectId}/cloud-run-source-deploy/${agentName.toLowerCase()}`;
  const serviceName = agentName.toLowerCase();
  const envStrings = envVars.map(
    (e) => `${e.key}=${shellSingleQuote(e.value)}`
  );
  envStrings.push(
    `STAGING_BUCKET=${shellSingleQuote(`gs://${selectedBucket || '[STAGING_BUCKET]'}`)}`
  );

  const accessFlags = cloudRunAccessFlags(accessMode);
  const accessNotes = cloudRunAccessCommentBlock(accessMode, {
    serviceName,
    region,
  });

  const iapReminder =
    accessMode === 'iap'
      ? `
echo ""
echo "IAP is enabled, but the service is not reachable yet:"
echo " - grant roles/run.invoker to service-PROJECT_NUMBER@gcp-sa-iap.iam.gserviceaccount.com"
echo " - create the OAuth client in the Cloud Console if this is the first"
echo "   IAP resource in a project without an organization"
echo " - grant your users roles/iap.httpsResourceAccessor"`
      : '';

  return `#!/bin/bash
set -e
# Access control: ${cloudRunAccessLabel(accessMode)}
${accessNotes}
echo "Deploying Cloud Run service '${serviceName}' (${cloudRunAccessLabel(accessMode)})..."
gcloud run deploy ${serviceName} --image ${imageName} --region ${region} ${accessFlags} --set-env-vars ${envStrings.join(',')}

echo "Fetching Service URL..."
SERVICE_URL=$(gcloud run services describe ${serviceName} --region ${region} --format='value(status.url)')

if [ -z "$SERVICE_URL" ]; then
    echo "Error: Could not retrieve service URL."
    exit 1
fi

echo "Detected Service URL: $SERVICE_URL"
echo "Updating service with AGENT_URL for self-discovery..."
gcloud run services update ${serviceName} --region ${region} --update-env-vars=AGENT_URL=$SERVICE_URL

echo "Deployment Complete."${iapReminder}`;
}

export function getMainPyWrapperScript(
  entryModulePath: string,
  entryPoint: string
): string {
  return `
import os
import importlib
import uvicorn
import logging
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
import traceback

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Try to import to_a2a.
try:
    from google.adk.a2a.utils.agent_to_a2a import to_a2a
    logger.info("Successfully imported to_a2a.")
except ImportError as e:
    logger.error(f"Failed to import to_a2a: {e}")
    logger.error("Please ensure 'google-cloud-aiplatform[adk,agent_engines]>=1.75.0' is in requirements.txt")
    # Don't raise, just log. We'll fallback later.
    to_a2a = None

# Dynamic import of agent
# Entry point variables determined during build
MODULE_NAME = "${entryModulePath}"
VARIABLE_NAME = "${entryPoint}"

agent_obj = None
try:
    logger.info(f"Importing {VARIABLE_NAME} from {MODULE_NAME}...")
    module = importlib.import_module(MODULE_NAME)
    agent_obj = getattr(module, VARIABLE_NAME)
    logger.info("Agent object loaded successfully.")
except Exception as e:
    logger.error(f"Failed to load agent object: {e}")
    traceback.print_exc()
    # Don't raise, fallback.

# Wrap agent in A2A app if it isn't already one.
init_error = None
try:
    if agent_obj and (hasattr(agent_obj, 'router') or hasattr(agent_obj, 'openapi_schema') or type(agent_obj).__name__ == 'FastAPI'):
        logger.info("Agent object appears to be a FastAPI app. Using directly.")
        app = agent_obj
    elif agent_obj and to_a2a:
        logger.info("Wrapping agent object with to_a2a...")
        # Configure CORS via SDK to correctly handle preflight OPTIONS requests
        app = to_a2a(agent_obj, cors_origins=["*"])
        logger.info("Agent wrapped successfully.")
    else:
        raise Exception("Agent object missing or to_a2a unavailable.")

except Exception as e:
    init_error = e
    logger.error(f"Failed to initialize agent app: {e}")
    # Fallback to dummy app to keep container running for debugging
    app = FastAPI()
    @app.api_route("/{path_name:path}", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH"])
    async def catch_all(path_name: str):
        return Response(content=f"Agent Initialization Failed. Check logs.\\nError: {init_error}", status_code=500, media_type="text/plain")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    logger.info(f"Starting uvicorn on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
`;
}

export function getReasoningEngineDeployScript(
  entryModulePath: string,
  entryPoint: string,
  agentName: string
): string {
  return `
import os
import sys
import logging
import vertexai

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
# OVERRIDE: Vertex AI Agent Engine (Reasoning Engine) resources MUST be provisioned
# in a regional location (e.g. 'us-central1'). They CANNOT be deployed to 'locations/global'.
# However, model calls inside the runtime container can use 'global' (via GOOGLE_CLOUD_LOCATION).
deployment_location = os.getenv("DEPLOYMENT_LOCATION") or os.getenv("REGION")
if not deployment_location or deployment_location == "global":
    deployment_location = "us-central1"

location = deployment_location
staging_bucket = os.getenv("STAGING_BUCKET")

logger.info(f"Initializing Vertex AI: project={project_id}, location={location}, staging_bucket={staging_bucket}")
original_os_location = os.environ.get("GOOGLE_CLOUD_LOCATION")
os.environ["GOOGLE_CLOUD_LOCATION"] = location
vertexai.init(project=project_id, location=location, staging_bucket=staging_bucket)
if original_os_location is not None:
    os.environ["GOOGLE_CLOUD_LOCATION"] = original_os_location
elif "GOOGLE_CLOUD_LOCATION" in os.environ:
    del os.environ["GOOGLE_CLOUD_LOCATION"]

sys.path.append(os.getcwd())
target_module = ${JSON.stringify(entryModulePath)}
target_object = ${JSON.stringify(entryPoint)}

logger.info(f"Importing agent '{target_object}' from '{target_module}'...")
try:
    module = __import__(target_module, fromlist=[target_object])
    # Determine what was imported (Agent or App)
    if hasattr(module, 'app'):
        app_obj = module.app
        logger.info("Found 'app' object in module.")
    elif hasattr(module, target_object):
        app_obj = getattr(module, target_object)
        logger.info(f"Found '{target_object}' object in module.")
    else:
        raise ImportError(f"Could not find '{target_object}' or 'app' in {target_module}")

except Exception as e:
    logger.error(f"Failed to import agent: {e}")
    raise

reqs = ["google-cloud-aiplatform[adk,agent_engines]>=1.75.0", "python-dotenv"]
if os.path.exists("requirements.txt"):
    with open("requirements.txt", "r") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#"):
                if line == "mcp":
                    line = "mcp>=1.24.0,<2.0.0"
                reqs.append(line)
reqs = list(set(reqs))
logger.info(f"Using requirements: {reqs}")

# Parse .env for deploymentSpec
env_vars = []
if os.path.exists(".env"):
    try:
        with open(".env", "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    key = key.strip()
                    value = value.strip()
                    if not key:
                        continue

                    # Handle quotes if present
                    if value.startswith('"') and value.endswith('"'):
                        value = value[1:-1]
                    elif value.startswith("'") and value.endswith("'"):
                        value = value[1:-1]
                    
                    # Update os.environ so the SDK can pick it up locally
                    os.environ[key] = value
                    
                    # Append strictly non-reserved keys to env_vars list for deployment
                    # We explicitly allow GOOGLE_CLOUD_LOCATION to pass into the container
                    # to specify the model endpoint location (e.g. 'global' for Gemini 3).
                    if (value and key not in ["GOOGLE_CLOUD_PROJECT", "STAGING_BUCKET", "PROJECT_ID", "DEPLOYMENT_LOCATION"]
                        and not key.startswith("OTEL_")
                        and not key.startswith("GOOGLE_CLOUD_AGENT_ENGINE_")):
                        env_vars.append(key)
        
        # Deduplicate env_vars to prevent "EnvVar names must be unique" error
        env_vars = list(set(env_vars))
        logger.info(f"Final deployment env_vars: {env_vars}")
        logger.info(f"Parsed {len(env_vars)} environment variables for deploymentSpec.")
    except Exception as e:
        logger.warning(f"Failed to parse .env file: {e}")

try:
    from vertexai import agent_engines
    
    # Check if app_obj is already an AdkApp-compatible object or needs wrapping
    # CRITICAL FIX: Robust detection to avoid double-wrapping AdkApp
    is_already_adk_app = (
        hasattr(app_obj, 'agent') or 
        hasattr(app_obj, '_agent') or 
        app_obj.__class__.__name__ in ('AdkApp', 'StudioAdkApp', 'SyncAgentWrapper') or
        (hasattr(agent_engines, 'AdkApp') and isinstance(app_obj, agent_engines.AdkApp))
    )
    
    if is_already_adk_app:
         app_to_deploy = app_obj
         logger.info(f"App is already an AdkApp instance ({type(app_obj).__name__}). Proceeding to deploy...")
    else:
         # Wrap it. app_obj can be Agent or App.
         # This is the ONLY place where enable_tracing should be set
         app_to_deploy = agent_engines.AdkApp(agent=app_obj, enable_tracing=False)
         logger.info("Wrapping agent in AdkApp for deployment...")

    logger.info("Creating Agent Engine...")
    
    # Detect extra packages (like auth_utils.py)
    extra_packages = []
    for f in os.listdir("."):
        if f in ["deploy_re.py", ".env", "requirements.txt", ".git", ".adk", "venv", ".venv", "__pycache__", "node_modules"]:
            continue
        
        if os.path.isfile(f) and f.endswith(".py"):
             extra_packages.append(f)
        elif os.path.isdir(f) and not f.startswith("."):
             extra_packages.append(f)
    
    logger.info(f"Extra packages detected: {extra_packages}")

    remote_app = agent_engines.create(
        agent_engine=app_to_deploy,
        requirements=reqs,
        env_vars=env_vars,
        extra_packages=extra_packages,
        display_name=${JSON.stringify(agentName)}
    )

except ImportError:
    logger.warning("Fallback to preview namespace.")
    from vertexai.preview import reasoning_engines
    
    if hasattr(app_obj, 'agent'):
         app_to_deploy = app_obj
    else:
         app_to_deploy = reasoning_engines.AdkApp(agent=app_obj)

    remote_app = reasoning_engines.ReasoningEngine.create(
        app_to_deploy,
        requirements=reqs,
        env_vars=env_vars,
        extra_packages=extra_packages,
        display_name=${JSON.stringify(agentName)},
    )

print(f"Deployment finished!")
print(f"Resource Name: {remote_app.resource_name}")
`;
}

export function getPreviewBuildConfig(
  selectedBucket: string,
  agentName: string,
  region: string,
  projectId: string,
  envVars: EnvVar[],
  target: 'cloud_run' | 'reasoning_engine'
) {
  const bucket = selectedBucket || '[STAGING_BUCKET]';
  const objectName = `source/${agentName}-TIMESTAMP.zip`;
  const imageName = `${region}-docker.pkg.dev/${projectId}/cloud-run-source-deploy/${agentName.toLowerCase()}`;

  const envStrings = envVars.map((e) => `${e.key}=${e.value}`);
  envStrings.push(`STAGING_BUCKET=gs://${bucket}`);

  const buildSteps: Array<{ name: string; entrypoint?: string; args: string[]; env?: string[] }> = [];

  if (target === 'cloud_run') {
    buildSteps.push({
      name: 'gcr.io/cloud-builders/docker',
      args: ['build', '-t', imageName, '.'],
    });
    buildSteps.push({
      name: 'gcr.io/cloud-builders/docker',
      args: ['push', imageName],
    });

    buildSteps.push({
      name: 'gcr.io/google.com/cloudsdktool/cloud-sdk',
      entrypoint: 'bash',
      args: ['-c', '[SEE DEPLOY SCRIPT BELOW]'],
    });
  } else {
    buildSteps.push({
      name: 'python:3.11',
      entrypoint: 'bash',
      args: [
        '-c',
        'pip install --upgrade pip && pip install -r requirements.txt && pip install "google-cloud-aiplatform[adk,agent_engines]>=1.75.0" && python deploy_re.py',
      ],
      env: envStrings,
    });
  }

  return {
    source: {
      storageSource: {
        bucket: bucket,
        object: objectName,
      },
    },
    steps: buildSteps,
    timeout: '600s',
  };
}
