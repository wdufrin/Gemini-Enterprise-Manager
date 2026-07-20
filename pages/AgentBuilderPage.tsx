import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Config, DataStore, CloudRunService, GcsBucket } from "../types";
import * as api from "../services/apiService";
import AgentDeploymentModal from "../components/agent-catalog/AgentDeploymentModal";
import A2aDeployModal from "../components/a2a/A2aDeployModal";
import InfoTooltip from "../components/InfoTooltip";
import CloudBuildProgress from "../components/agent-builder/CloudBuildProgress";
import GitHubDeployModal from "../components/agent-builder/GitHubDeployModal";
import ProjectInput from "../components/ProjectInput";
import { McpServiceCheck } from "../components/McpServiceCheck";
import CloudConsoleButton from "../components/CloudConsoleButton";

declare var JSZip: any;

// Define types for agent config and tools
export interface AgentTool {
  type: "VertexAiSearchTool" | "A2AClientTool";
  dataStoreId?: string;
  url?: string;
  variableName: string;
  displayName?: string;
}

export interface A2aConfig {
  serviceName: string;
  displayName: string;
  providerOrganization: string;
  model: string;
  region: string;
  memory: string;
  instruction: string;
  allowUnauthenticated: boolean;
  enableCors: boolean;
  useGoogleSearch: boolean;
  tools: AgentTool[];
}

// Separate interface for ADK Agent
export interface AdkAgentConfig {
  adkVersion?: "1.35.1" | "2.2";
  name: string;
  description: string;
  model: string;
  instruction: string;
  tools: AgentTool[];
  useGoogleSearch: boolean;
  enableOAuth: boolean;
  authId: string;
  allowAdcFallback: boolean;
  enableDiscoveryApi: boolean;
  discoveryConfig: DiscoveryConfig;
  enableBqAnalytics: boolean;
  bqDatasetId: string;
  bqTableId: string;
  enableThinking: boolean;
  thinkingBudget: number;
  thinkingLevel: string;
  enableStreaming: boolean;
  enableBigQueryMcp: boolean;
  enableCodeExecution: boolean;
  enableGraphvizRendering: boolean;
  enableEmailTool: boolean;
  enableSecurityCommandCenterApi: boolean;
  enableRecommenderApi: boolean;
  enableServiceHealthApi: boolean;
  enableNetworkManagementApi: boolean;
  enableCloudAssistApi: boolean;
  enableCloudLoggingApi: boolean;
  enableCloudMonitoringApi: boolean;
  enableCloudRunApi: boolean;
  enableResourceManagerApi: boolean;
  enableAdminActivityApi: boolean;
  enableDatabaseFleetApi: boolean;
  enableCloudLoggingMcp: boolean;
  enableBigtableAdminMcp: boolean;
  enableCloudSqlMcp: boolean;
  enableCloudMonitoringMcp: boolean;
  enableComputeEngineMcp: boolean;
  enableFirestoreMcp: boolean;
  enableGkeMcp: boolean;
  enableResourceManagerMcp: boolean;
  enableSpannerMcp: boolean;
  enableDeveloperKnowledgeMcp: boolean;
  enableMapsGroundingMcp: boolean;
  enableTelemetry: boolean;
  enableMessageLogging: boolean;
  enableEvaluation: boolean;
  enableCiCd: boolean;
  ciCdRunner: "github_actions" | "google_cloud_build" | "none";
  deploymentTarget: "agent_engine" | "cloud_run";
  githubWifProvider?: string;
  githubServiceAccount?: string;
  customMcpEndpoints: { name: string; url: string }[];
}

interface DiscoveryConfig {
  projectId: string;
  location: string;
  collection: string;
  engineId: string;
  dataStoreIds: string;
}

// --- Tab Definitions ---
const ADK_TABS = [
  { id: "agent", label: "agent.py" },
  { id: "deploy_re", label: "deploy_re.py" },
  { id: "env", label: ".env" },
  { id: "requirements", label: "requirements.txt" },
  { id: "readme", label: "README.md" },
  { id: "auth", label: "auth.py" },
  { id: "tools", label: "tools.py" },
] as const;

const A2A_TABS = [
  { id: "main", label: "main.py" },
  { id: "dockerfile", label: "Dockerfile" },
  { id: "requirements", label: "requirements.txt" },
  { id: "env", label: "env.yaml" },
] as const;

// --- A2A Generators ---
const generateMainPy = (config: A2aConfig): string => {
  const { instruction, enableCors, useGoogleSearch, tools } = config;

  const hasTools = useGoogleSearch || tools.length > 0;

  let toolImports = "";
  if (hasTools) {
    toolImports = `
# Safe import for tools to prevent crash on older SDKs
try:
    from vertexai.generative_models import Tool, grounding, GoogleSearchRetrieval
except ImportError:
    try:
        from vertexai.generative_models import Tool, grounding
    except ImportError:
        Tool = None
        grounding = None
    GoogleSearchRetrieval = None
`;
  }

  // Generate CORS block
  const corsBlock = enableCors
    ? `
# --- CORS Configuration ---
# This allows web-based clients (like the A2A Tester) to query this function.
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    return response`
    : "";

  // Generate Tools Initialization Code
  let toolsInit = "tools = []";
  if (hasTools) {
    let toolCode: string[] = [];
    toolCode.push("if Tool:"); // Only proceed if Tool class exists

    if (useGoogleSearch) {
      toolCode.push("    try:");
      toolCode.push("        if GoogleSearchRetrieval:");
      toolCode.push(
        "            tools.append(Tool.from_google_search_retrieval(GoogleSearchRetrieval()))",
      );
      toolCode.push('            print("Google Search tool enabled.")');
      toolCode.push("        else:");
      toolCode.push(
        '            print("Warning: GoogleSearchRetrieval class missing in installed SDK. Google Search tool disabled.")',
      );
      toolCode.push("    except Exception as e:");
      toolCode.push(
        '        print(f"Warning: Failed to enable Google Search: {e}")',
      );
    }

    tools.forEach((tool) => {
      if (tool.type === "VertexAiSearchTool" && tool.dataStoreId) {
        toolCode.push("    try:");
        toolCode.push("        tools.append(Tool.from_retrieval(");
        toolCode.push("            grounding.Retrieval(");
        toolCode.push(
          `                grounding.VertexAISearch(datastore="${tool.dataStoreId}")`,
        );
        toolCode.push("            )");
        toolCode.push("        ))");
        toolCode.push(
          `        print("Data Store tool enabled: ${tool.dataStoreId}")`,
        );
        toolCode.push("    except Exception as e:");
        toolCode.push(
          `        print(f"Warning: Failed to enable Data Store ${tool.dataStoreId}: {e}")`,
        );
      }
    });

    if (toolCode.length > 1) {
      // Check if we added more than just the guard check
      toolsInit = `tools = []\n${toolCode.join("\n")}`;
    }
  }

  return `
import os
from flask import Flask, request, jsonify
import vertexai
from vertexai.generative_models import GenerativeModel, GenerationConfig
${toolImports}
import json

# Initialization
app = Flask(__name__)
${corsBlock}

# Load configuration from environment variables
MODEL_NAME = os.getenv("MODEL", "gemini-2.5-flash")
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT")
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION")

# Agent card details from environment
AGENT_URL = os.getenv("AGENT_URL", "URL_NOT_SET")
AGENT_DISPLAY_NAME = os.getenv("AGENT_DISPLAY_NAME", "A2A Function")
AGENT_DESCRIPTION = os.getenv("AGENT_DESCRIPTION", "An agent-to-agent function.")
PROVIDER_ORGANIZATION = os.getenv("PROVIDER_ORGANIZATION", "Unknown")

# This is the DEFAULT instruction if none is provided in the request
DEFAULT_SYSTEM_INSTRUCTION = """
${instruction}
"""

# Initialize Vertex AI SDK
try:
    if PROJECT_ID and LOCATION:
        vertexai.init(project=PROJECT_ID, location=LOCATION)
except Exception as e:
    print(f"Warning: Could not initialize Vertex AI SDK: {e}")

# Initialize Tools
${toolsInit}

# Initialize the Vertex AI Gemini model
try:
    model = GenerativeModel(MODEL_NAME)
    print(f"GenerativeModel '{MODEL_NAME}' initialized.")
except Exception as e:
    print(f"FATAL: Could not initialize GenerativeModel. Error: {e}")
    model = None


@app.route("/", methods=["GET", "OPTIONS"])
def health_check():
    """Health check endpoint."""
    if request.method == "OPTIONS":
        return "", 204
    return jsonify({"status": "ok"}), 200

@app.route("/.well-known/agent.json", methods=["GET", "OPTIONS"])
def get_agent_card():
    """Serves the agent's discovery card (agent.json)."""
    # Explicitly handle CORS preflight requests
    if request.method == "OPTIONS":
        return "", 204

    card = {
        "name": AGENT_DISPLAY_NAME,
        "description": AGENT_DESCRIPTION,
        "url": f"{AGENT_URL.rstrip('/')}/invoke",
        "capabilities": {
            "streaming": False
        },
        "defaultInputModes": ["text/plain"],
        "defaultOutputModes": ["text/plain"],
        "preferredTransport": "JSONRPC",
        "protocolVersion": "0.3.0",
        "skills": [{
            "description": "Chat with the agent.",
            "examples": ["Hello, world!"],"id": "chat",
            "name": "Chat Skill",
            "tags": ["chat"]
        }],
        "version": "1.0.0"
    }
    return jsonify(card)


@app.route("/invoke", methods=["POST", "OPTIONS"])
def invoke():
    """
    Main endpoint to invoke the agent-to-agent function.
    Expects a JSON-RPC 2.0 payload with standard A2A message structure.
    """
    # Explicitly handle CORS preflight requests
    if request.method == "OPTIONS":
        return "", 204

    if not model:
        return jsonify({"error": "Model not initialized"}), 500
        
    if "Authorization" not in request.headers:
        print("Warning: Missing Authorization header")

    data = request.get_json()
    if not data:
        return jsonify({"error": "Missing JSON request body"}), 400

    request_id = data.get("id")

    # Validate JSON-RPC structure
    if not isinstance(data, dict) or data.get("jsonrpc") != "2.0":
        return jsonify({
            "jsonrpc": "2.0",
            "error": {"code": -32600, "message": "Invalid Request: Not a valid JSON-RPC 2.0 request"},
            "id": request_id
        }), 400

    params = data.get("params")
    if not isinstance(params, dict):
        return jsonify({
            "jsonrpc": "2.0",
            "error": {"code": -32602, "message": "Invalid params: 'params' must be an object"},
            "id": request_id
        }), 400

    message = params.get("message")
    if not isinstance(message, dict):
        return jsonify({
            "jsonrpc": "2.0",
            "error": {"code": -32602, "message": "Invalid params: Missing 'message' object in params"},
            "id": request_id
        }), 400

    parts = message.get("parts")
    if not isinstance(parts, list) or not parts:
        return jsonify({
            "jsonrpc": "2.0",
            "error": {"code": -32602, "message": "Invalid params: Missing 'parts' array in message"},
            "id": request_id
        }), 400

    user_prompt = None
    for part in parts:
        if isinstance(part, dict) and "text" in part:
            user_prompt = part["text"]
            break

    if user_prompt is None:
        return jsonify({
            "jsonrpc": "2.0",
            "error": {"code": -32602, "message": "Invalid params: No text part found in message.parts"},
            "id": request_id
        }), 400

    request_system_instruction = params.get("system_instruction")

    try:
        # Base generation config
        generation_config = GenerationConfig(
            max_output_tokens=8192,
            temperature=0.7,
            top_p=1.0,
        )

        # Apply system instruction
        if request_system_instruction:
            generation_config.system_instruction = request_system_instruction
        else:
            generation_config.system_instruction = DEFAULT_SYSTEM_INSTRUCTION

        # Call the Gemini API with tools
        response = model.generate_content(
            [user_prompt],
            generation_config=generation_config,
            tools=tools
        )

        result_text = response.text

        # Return response in A2A JSON-RPC format
        return jsonify({
            "jsonrpc": "2.0",
            "result": {
                "kind": "conversationMessage",
                "message": {
                    "role": "model",
                    "parts": [
                        {
                            "text": result_text
                        }
                    ]
                }
            },
            "id": request_id
        }), 200

    except Exception as e:
        print(f"Error calling Gemini API: {e}")
        return jsonify({
            "jsonrpc": "2.0",
            "error": {"code": -32000, "message": "Server error", "data": str(e)},
            "id": request_id
        }), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
`;
};

export const generateA2aEnvYaml = (config: A2aConfig, projectId: string): string => {
  // If using Gemini 3 models, the model endpoint location must be "global".
  // The Cloud Run deployment location itself remains the specified \`region\`.
  const isGemini3 = config.model?.startsWith("gemini-3");
  const modelLocation = isGemini3 ? "global" : config.region;

  return `GOOGLE_CLOUD_PROJECT: "${projectId}"
GOOGLE_CLOUD_LOCATION: "${modelLocation}"
DEPLOYMENT_LOCATION: "${config.region}"
GOOGLE_GENAI_USE_VERTEXAI: "TRUE"
MODEL: "${config.model}"
AGENT_DISPLAY_NAME: "${config.displayName}"
PROVIDER_ORGANIZATION: "${config.providerOrganization}"
AGENT_DESCRIPTION: |
${config.instruction
      .split("\n")
      .map((line) => "  " + line)
      .join("\n")}
`.trim();
};

const generateDockerfile = (config: AdkAgentConfig): string => `
# Use an official lightweight Python image.
FROM python:3.10-slim

# Prevent Python from buffering stdout and stderr.
ENV PYTHONUNBUFFERED True

# Set the working directory in the container.
WORKDIR /app

# Copy the requirements file and install dependencies.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application's code.
COPY . .

# Expose the port the app runs on.
EXPOSE 8080

# Run the application with Gunicorn.
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "1", "--threads", "8", "--timeout", "0", "main:app"]
`;

const generateRequirementsTxt = (): string => `
Flask==3.0.0
gunicorn==22.0.0
google-cloud-aiplatform>=1.75.0
`;

const generateGcloudCommand = (
  config: A2aConfig,
  projectId: string,
): string => {
  const authFlag = config.allowUnauthenticated
    ? "--allow-unauthenticated"
    : "--no-allow-unauthenticated";

  return `
#!/bin/bash
# This script deploys the Cloud Run service and then updates it
# with its own public URL, enabling self-discovery for the agent.json endpoint.

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Configuration (from UI) ---
PROJECT_ID="${projectId}"
SERVICE_NAME="${config.serviceName}"
REGION="${config.region}"
MEMORY="${config.memory}"

# --- Pre-flight Check ---
if [[ "$PROJECT_ID" =~ ^[0-9]+$ ]]; then
  echo "⚠️  WARNING: PROJECT_ID '$PROJECT_ID' appears to be a Project Number."
  echo "   'gcloud run deploy' requires the Project ID string (e.g., 'my-project-id')."
  echo "   The script will proceed, but it may fail. Please check your configuration if it does."
  echo ""
fi

# --- Deployment ---

echo "Starting deployment of service '$SERVICE_NAME' to project '$PROJECT_ID'..."

gcloud run deploy "$SERVICE_NAME" \\
  --source . \\
  --project "$PROJECT_ID" \\
  --region "$REGION" \\
  --memory "$MEMORY" \\
  --clear-base-image \\
  ${authFlag} \\
  --env-vars-file=env.yaml

echo "Initial deployment complete. Fetching service URL..."

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --project="$PROJECT_ID" --region="$REGION" --format='value(status.url)')

if [ -z "$SERVICE_URL" ]; then
    echo "Error: Could not retrieve the service URL. Please check the deployment status in the Google Cloud Console."
    exit 1
fi

echo "Service URL found: $SERVICE_URL"
echo "Updating service with own URL..."

gcloud run services update "$SERVICE_NAME" \\
  --project="$PROJECT_ID" \\
  --region="$REGION" \\
  --update-env-vars="AGENT_URL=$SERVICE_URL"

echo "Deployment and configuration complete."
echo "Your A2A function is now available at: $SERVICE_URL"
`;
};

// --- ADK Generators ---

const generateAuthPy = (
  config: AdkAgentConfig,
  allowAdcFallback: boolean = true,
): string => {
  const isV2 = config.adkVersion === "2.2";
  const toolContextImport = isV2
    ? "from google.antigravity import ToolContext"
    : "from google.adk.tools import ToolContext";

  return `import os
import logging
from typing import Optional
from google.oauth2.credentials import Credentials
${toolContextImport}


logger = logging.getLogger(__name__)

def get_user_credentials(tool_context: ToolContext) -> Optional[Credentials]:
    """
    Extracts user OAuth2 credentials from the ToolContext state using the configured AUTH_ID,
    with robust support for all platform-injected key schemas.
    Falls back to environment variables or Application Default Credentials (ADC).
    """
    # 1. Check direct user_token attribute if available (newer ADK versions)
    if hasattr(tool_context, "user_token") and tool_context.user_token:
        logger.info("Successfully retrieved access token from user_token attribute")
        return Credentials(token=tool_context.user_token)

    auth_id = os.getenv("AUTH_ID")
    access_token = None

    if tool_context.state:
        # 2. Check for agent_association (current robust platform pattern)
        agent_association = tool_context.state.get("agent_association")
        if agent_association and isinstance(agent_association, dict):
            access_token = agent_association.get("access_token") or agent_association.get("token")
            if access_token:
                logger.info("Successfully retrieved access token from agent_association")

        # 3. Check multiple possible keys for robustness (Gemini Enterprise platform variations)
        if not access_token and auth_id:
            possible_keys = [f"temp:{auth_id}", f"token_{auth_id}", auth_id]
            for key in possible_keys:
                token = tool_context.state.get(key)
                if token:
                    logger.info(f"Successfully retrieved access token using key: '{key}'")
                    access_token = token
                    break

    if access_token:
        return Credentials(token=access_token)

    # 4. Check general fallback environment variables (local testing)
    env_token = os.getenv("GCP_ACCESS_TOKEN") or os.getenv("USER_ACCESS_TOKEN")
    if env_token:
        logger.info("Successfully retrieved access token from standard environment fallback")
        return Credentials(token=env_token)
        
    # 5. Check environment variable matching AUTH_ID
    if auth_id:
        env_token_specific = os.getenv(auth_id)
        if env_token_specific:
            logger.info(f"Successfully retrieved access token from environment variable matching AUTH_ID: {auth_id}")
            return Credentials(token=env_token_specific)
        
${allowAdcFallback
      ? `    # 4. Fallback to Application Default Credentials (ADC)
    try:
        import google.auth
        from google.auth.transport.requests import Request
        creds, project = google.auth.default()
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
        elif not creds.token:
            creds.refresh(Request())
        logger.info("Using Application Default Credentials (ADC) as fallback")
        return creds
    except Exception as e:
        logger.warning(f"Failed to get ADC fallback: {e}")
        return None`
      : `    # 4. Fallback to Application Default Credentials (ADC) is disabled
    logger.warning("User OAuth token not found, and Service Account fallback is disabled.")
    raise PermissionError("Access Denied: Valid end-user OAuth token not found, and ADC Service Account fallback is disabled.")`
    }
`;
};

const generateToolsPy = (
  config: AdkAgentConfig,
  useRelativeImports: boolean = false,
): string => {
  const isV2 = config.adkVersion === "2.2";
  const toolContextImport = isV2
    ? "from google.antigravity import ToolContext"
    : "from google.adk.tools import ToolContext";

  let code = `import os
import logging
import json
import requests
import google.auth
import google.auth.transport.requests
import google.oauth2.id_token
from typing import Optional, Dict, Any, List
from google.genai import types
${toolContextImport}
${isV2 ? "" : "from google.adk.tools.mcp_tool import McpToolset, StreamableHTTPConnectionParams"}

try:
    ${isV2 ? "from google.antigravity.types import FileChange as Artifact # Dummy mapping" : "from google.adk.tools import Artifact"}
except ImportError:
    from pydantic import BaseModel, Field
    class Artifact(BaseModel):
        uri: str
        mime_type: str = "image/png"
        description: str = ""

try:
    from .auth import get_user_credentials
except ImportError:
    try:
        from auth import get_user_credentials
    except ImportError:
        # Handle case where auth.py might not be generated or needed
        def get_user_credentials(context): return None

logger = logging.getLogger(__name__)
`;

  if (!isV2) {
    code += `
def get_logging_mcp_toolset() -> McpToolset:
    """
    Creates and returns the Cloud Logging MCP toolset.
    """

    def auth_header_provider(context: Any) -> Dict[str, str]:
        """Provider for dynamic auth headers based on context."""
        creds = get_user_credentials(context)
        headers = {}
        if creds and creds.token:
             headers["Authorization"] = f"Bearer {creds.token}"

        # Add x-goog-user-project for quota attribution (critical for some APIs)
        project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
        if project_id:
            headers["x-goog-user-project"] = project_id

        return headers

    return McpToolset(
        connection_params=StreamableHTTPConnectionParams(
            url="https://logging.googleapis.com/mcp",
            timeout=120.0, # Increased timeout for cold starts
        ),
        tool_name_prefix="logging_",
        header_provider=auth_header_provider
    )
`;
  }

  code += `
def get_current_time() -> str:
    """
    Gets the current UTC time formatted as an ISO 8601 string.
    Use this to retrieve the current time to construct timestamp filters (like past 24 hours).
    """
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat(timespec='seconds')
`;

  if (config.enableDiscoveryApi) {
    code += `
def query_gemini_enterprise(tool_context: ToolContext, query_text: str) -> str:
    """
    Queries the Gemini Enterprise (Discovery Engine) API with the given query text.
    
    Args:
        tool_context: The context provided by the ADK runtime.
        query_text: The question to ask the specialized agent.
        
    Returns:
        The text response from the agent.
    """
    project_id = os.getenv("DISCOVERY_ENGINE_PROJECT_ID")
    location = os.getenv("DISCOVERY_ENGINE_LOCATION", "global")
    collection = os.getenv("DISCOVERY_ENGINE_COLLECTION", "default_collection")
    engine_id = os.getenv("DISCOVERY_ENGINE_ENGINE_ID")
    
    if not all([project_id, engine_id]):
        return "Error: DISCOVERY_ENGINE_PROJECT_ID and DISCOVERY_ENGINE_ENGINE_ID must be set."
    
    url = f"https://discoveryengine.googleapis.com/v1alpha/projects/{project_id}/locations/{location}/collections/{collection}/engines/{engine_id}/assistants/default_assistant:streamAssist"
    
    # Try Service Account / ADC
    scopes = ["https://www.googleapis.com/auth/cloud-platform"]
    creds, _ = google.auth.default(scopes=scopes)

    # For now, just use the token property.
    token = getattr(creds, 'token', None)
    # If creds came from google.auth.default(), we definitely need to ensure it's refreshed.
    if not token:
        # Force refresh for ADC
         auth_req = google.auth.transport.requests.Request()
         creds.refresh(auth_req)
         token = getattr(creds, 'token', None)
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "X-Goog-User-Project": project_id
    }
    
    # Construct the payload
    # Note: The dataStoreSpecs are dynamic based on .env
    data_store_ids = os.getenv("DISCOVERY_ENGINE_DATA_STORE_IDS", "").split(",")
    data_store_specs = [
        {"dataStore": f"projects/{project_id}/locations/{location}/collections/{collection}/dataStores/{ds_id.strip()}"}
        for ds_id in data_store_ids if ds_id.strip()
    ]
    
    payload = {
        "query": {
            "text": query_text
        },
        "toolsSpec": {
            "vertexAiSearchSpec": {
                "dataStoreSpecs": data_store_specs
            }
        }
    }
    
    try:
        logger.info(f"Querying Gemini Enterprise: {query_text}")
        response = requests.post(url, headers=headers, json=payload, stream=True)
        response.raise_for_status()
        
        # Process the response
        try:
            # The API seems to return a pretty-printed JSON array [ ... ]
            # so we can parse the entire response as JSON.
            data = response.json()
            
            # If data is a list, iterate through items
            # If dict, wrap in list
            if isinstance(data, dict):
                 items = [data]
            else:
                 items = data

            full_response_text = ""
            unique_sources = {} # Map URI to Title to avoid duplicates

            for item in items:
                 # Check for errors
                 if "error" in item:
                      error_msg = item["error"].get("message", str(item["error"]))
                      logger.warning(f"Received error in response item: {error_msg}")
                      full_response_text += f"\\n[Error from upstream: {error_msg}]\\n"
                      continue

                 # 1. Extract Reply / Text
                 # Candidates: item['reply'], item['answer']
                 candidates = []
                 if "reply" in item: candidates.append(item["reply"])
                 if "answer" in item: candidates.append(item["answer"])
                 
                 for container in candidates:
                      if not isinstance(container, dict):
                           continue

                      # Case A: 'parts' directly in container (Standard Gemini)
                      if "parts" in container:
                           for part in container["parts"]:
                                if "text" in part:
                                     full_response_text += part["text"]
                      
                      # Case B: 'planStep' (Agent Engine)
                      if "planStep" in container and "parts" in container["planStep"]:
                           for part in container["planStep"]["parts"]:
                                if "text" in part:
                                     full_response_text += part["text"]

                      # Case C: 'replies' list (Discovery Engine Answer API)
                      if "replies" in container:
                           for reply_item in container["replies"]:
                                # reply_item['groundedContent']['content']['text']
                                content = reply_item.get("groundedContent", {}).get("content", {})
                                if "text" in content:
                                     full_response_text += content["text"]

                                # Check for citations in reply item
                                if "citations" in reply_item:
                                     for citation in reply_item["citations"]:
                                          for source in citation.get("sources", []):
                                               uri = source.get("uri")
                                               title = source.get("title")
                                               if uri:
                                                    unique_sources[uri] = title or uri

                 # Check for citations at root level
                 if "citations" in item:
                     for citation in item["citations"]:
                         for source in citation.get("sources", []):
                             uri = source.get("uri")
                             title = source.get("title")
                             if uri:
                                 unique_sources[uri] = title or uri

            # Format the final output with sources
            final_output = full_response_text.strip()

            if unique_sources:
                 final_output += "\\n\\n**Available Sources:**\\n"
                 for uri, title in unique_sources.items():
                      final_output += f"- [{title}]({uri})\\n"

            return final_output

        except json.JSONDecodeError:
             # Fallback to raw text if JSON fails (e.g. maybe it was truly streaming text?)
             logger.warning("Failed to parse response as JSON. Returning raw text.")
             return f"Raw response:\\n{response.text}"

    except Exception as e:
        logger.error(f"Error querying Gemini Enterprise: {e}")
        return f"Error: {str(e)}"
`;
  }

  if (config.tools.some((t) => t.type === "A2AClientTool")) {
    code += `
def create_a2a_tool(url: str, tool_name: str):
    """Creates a callable function tool to interact with an A2A agent."""
    
    def a2a_interaction(message: str) -> str:
        """Sends a message to the specific agent and returns the response."""
        invoke_url = url.rstrip('/') + "/invoke"
        payload = {
            "jsonrpc": "2.0",
            "method": "chat",
            "params": {
                "message": {
                    "role": "user",
                    "parts": [{"text": message}]
                }
            },
            "id": "1"
        }
        
        headers = {"Content-Type": "application/json"}
        
        try:
            auth_req = google.auth.transport.requests.Request()
            target_audience = url.replace("/invoke", "").rstrip('/')
            id_token = google.oauth2.id_token.fetch_id_token(auth_req, target_audience)
            headers["Authorization"] = f"Bearer {id_token}"
        except Exception as e:
            print(f"Warning: Auth token fetch failed for A2A: {e}")

        try:
            response = requests.post(invoke_url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            if "error" in data:
                return f"Error from agent: {data['error']}"
            return data.get("result", {}).get("message", {}).get("parts", [{}])[0].get("text", str(data))
        except Exception as e:
            return f"Communication failed: {e}"

    a2a_interaction.__name__ = tool_name
    return a2a_interaction
`;
  }

  if (!isV2 && config.enableBigQueryMcp) {
    code += `
def get_bq_mcp_toolset() -> McpToolset:
    """
    Returns the BigQuery MCP Toolset configured to use the Google Cloud OneMCP API via SSE.
    Provides functions: list_dataset_ids, list_table_ids, get_dataset_info, get_table_info, execute_sql.
    """

    def auth_header_provider(context: Any) -> Dict[str, str]:
        """Provider for dynamic auth headers based on context."""
        creds = get_user_credentials(context)
        if creds and creds.token:
             return {"Authorization": f"Bearer {creds.token}"}
        return {}

    return McpToolset(
        connection_params=StreamableHTTPConnectionParams(
            url="https://bigquery.googleapis.com/mcp",
        ),
        tool_name_prefix="bq_",
        header_provider=auth_header_provider
    )
`;
  }

  const mcpServices = [
    {
      key: "enableBigtableAdminMcp",
      name: "bigtable",
      url: "https://bigtableadmin.googleapis.com/mcp",
    },
    {
      key: "enableCloudSqlMcp",
      name: "sqladmin",
      url: "https://sqladmin.googleapis.com/mcp",
    },
    {
      key: "enableCloudMonitoringMcp",
      name: "monitoring",
      url: "https://monitoring.googleapis.com/mcp",
    },
    {
      key: "enableComputeEngineMcp",
      name: "compute",
      url: "https://compute.googleapis.com/mcp",
    },
    {
      key: "enableFirestoreMcp",
      name: "firestore",
      url: "https://firestore.googleapis.com/mcp",
    },
    {
      key: "enableGkeMcp",
      name: "gke",
      url: "https://container.googleapis.com/mcp",
    },
    {
      key: "enableResourceManagerMcp",
      name: "resourcemanager",
      url: "https://cloudresourcemanager.googleapis.com/mcp",
    },
    {
      key: "enableSpannerMcp",
      name: "spanner",
      url: "https://spanner.googleapis.com/mcp",
    },
    {
      key: "enableDeveloperKnowledgeMcp",
      name: "developerknowledge",
      url: "https://developerknowledge.googleapis.com/mcp",
    },
    {
      key: "enableMapsGroundingMcp",
      name: "mapstools",
      url: "https://mapstools.googleapis.com/mcp",
    },
  ];

  if (!isV2) {
    mcpServices.forEach(({ key, name, url }) => {
      if ((config as any)[key]) {
        code += `
def get_${name}_mcp_toolset() -> McpToolset:
    """
    Returns the ${name} MCP Toolset.
    """

    def auth_header_provider(context: Any) -> Dict[str, str]:
        creds = get_user_credentials(context)
        headers = {}
        if creds and creds.token:
             headers["Authorization"] = f"Bearer {creds.token}"

        project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
        if project_id:
            headers["x-goog-user-project"] = project_id

        return headers

    return McpToolset(
        connection_params=StreamableHTTPConnectionParams(
            url="${url}",
            timeout=120.0,
        ),
        tool_name_prefix="${name}_",
        header_provider=auth_header_provider
    )
`;
      }
    });
  }

  if (config.enableEmailTool) {
    code += `
import base64
from email.message import EmailMessage
import markdown
import traceback
from googleapiclient.discovery import build
import sys

def send_email(tool_context: ToolContext, to: str, subject: str, body: str) -> str:
    """
    Sends a rich HTML email using the user's Gmail account.
    """
    try:
        credentials = get_user_credentials(tool_context)
        if not credentials:
            return "Error: Authentication required."

        message = EmailMessage()
        message['To'] = to
        message['Subject'] = subject
        message.set_content("This email contains HTML content. Please view it in a compatible client.\\n\\n" + body)

        html_body = markdown.markdown(body, extensions=['extra'])
        html_template = f"""
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background-color: #f9f9f9; padding: 20px;">
            <div style="max-width: 800px; margin: 0 auto; background: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <style>
                    table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
                    th, td {{ padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }}
                    th {{ background-color: #f8f9fa; font-weight: 600; color: #444; }}
                    tr:hover {{ background-color: #f5f5f5; }}
                    code {{ background-color: #f1f1f1; padding: 2px 5px; border-radius: 3px; font-family: 'Consolas', monospace; }}
                </style>
                {html_body}
                <div style="margin-top: 30px; font-size: 12px; color: #888; text-align: center; border-top: 1px solid #eee; padding-top: 10px;">
                    Sent by GCP Health Agent
                </div>
            </div>
        </div>
        """
        message.add_alternative(html_template, subtype='html')

        encoded_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
        service = build('gmail', 'v1', credentials=credentials)
        res = service.users().messages().send(userId="me", body={'raw': encoded_message}).execute()
        return f"Email sent successfully. Message Id: {res['id']}"

    except Exception as e:
        print(f"DEBUG_EMAIL_ERROR: {str(e)}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return f"Error sending email: {type(e).__name__}: {str(e)}"
`;
  }

  if (config.enableSecurityCommandCenterApi) {
    code += `
import google.cloud.securitycenter as securitycenter

def list_active_findings(tool_context: ToolContext, category: str = None, project_id: str = None) -> str:
    """Lists active, unmuted security findings for the project."""
    try:
        project_id = project_id or os.getenv("GOOGLE_CLOUD_PROJECT")
        credential = get_user_credentials(tool_context)
        if not credential: return "Error: Authentication required."
        client = securitycenter.SecurityCenterClient(credentials=credential)
        source_name = f"projects/{project_id}/sources/-"
        filter_str = 'state="ACTIVE" AND mute="UNMUTED"'
        if category: filter_str += f' AND category="{category}"'
        req = securitycenter.ListFindingsRequest(parent=source_name, filter=filter_str, page_size=100)
        findings_by_category = {}
        count = 0
        for result in client.list_findings(request=req):
            finding = result.finding
            cat = finding.category
            resource = finding.resource_name
            severity = finding.severity.name if hasattr(finding.severity, 'name') else str(finding.severity)
            if cat not in findings_by_category: findings_by_category[cat] = []
            findings_by_category[cat].append(f"[{severity}] {resource}")
            count += 1
            if count >= 20: break
        if count == 0: return f"No active, unmuted security findings found for project {project_id}."
        output_lines = [f"Active Security Findings for {project_id}:"]
        for cat, items in findings_by_category.items():
            output_lines.append(f"\\nCategory: {cat}")
            for item in items: output_lines.append(f"  - {item}")
        if count >= 20: output_lines.append("\\n(Output truncated)")
        return "\\n".join(output_lines)
    except Exception as e:
        if "PermissionDenied" in str(e) or "disabled" in str(e).lower():
            return f"Unable to list findings. Security Command Center might not be active or you lack permissions for project {project_id}."
        return f"Error fetching security findings: {str(e)}"
`;
  }

  if (config.enableRecommenderApi) {
    code += `
import google.cloud.recommender_v1 as recommender_v1
import google.cloud.run_v2 as run_v2

def list_recommendations(tool_context: ToolContext, project_id: str = None) -> str:
    """List active recommendations for Cloud Run services, focusing on security and identity."""
    try:
        project_id = project_id or os.getenv("GOOGLE_CLOUD_PROJECT")
        credential = get_user_credentials(tool_context)
        if not credential: return "Error: Authentication required."
        regions = set()
        try:
            run_client = run_v2.ServicesClient(credentials=credential)
            page_result = run_client.list_services(request=run_v2.ListServicesRequest(parent=f"projects/{project_id}/locations/-"))
            for service in page_result:
                parts = service.name.split("/")
                if len(parts) > 3: regions.add(parts[3])
        except Exception: pass
        if not regions: regions.add(os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1"))
        recommender_client = recommender_v1.RecommenderClient(credentials=credential)
        recommenders = ["google.run.service.IdentityRecommender", "google.run.service.SecurityRecommender"]
        results = []
        for location in regions:
            for r_id in recommenders:
                try:
                    request = recommender_v1.ListRecommendationsRequest(parent=f"projects/{project_id}/locations/{location}/recommenders/{r_id}")
                    for rec in recommender_client.list_recommendations(request=request):
                        target_resource = "Unknown Resource"
                        if rec.content and rec.content.overview:
                            target_resource = rec.content.overview.get("serviceName") or rec.content.overview.get("service") or rec.content.overview.get("resourceName") or "Unknown Resource"
                        if "/" in target_resource: target_resource = target_resource.split("/")[-1]
                        results.append(f"- [{location}] {target_resource}: {rec.description} (Priority: {rec.priority.name})")
                except Exception: pass
        return "Active Cloud Run Recommendations:\\n" + "\\n".join(results) if results else "No active security or identity recommendations found for Cloud Run."
    except Exception as e:
        return f"Error listing recommendations: {str(e)}"

def list_cost_recommendations(tool_context: ToolContext, project_id: str = None) -> str:
    """List active cost recommendations for the project."""
    try:
        project_id = project_id or os.getenv("GOOGLE_CLOUD_PROJECT")
        location = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
        zones = [f"{location}-{suffix}" for suffix in ["a", "b", "c", "f"]]
        credential = get_user_credentials(tool_context)
        if not credential: return "Error: Authentication required."
        recommender_client = recommender_v1.RecommenderClient(credentials=credential)
        recommenders = [
            "google.compute.instance.IdleResourceRecommender",
            "google.compute.instance.MachineTypeRecommender",
            "google.compute.address.IdleResourceRecommender",
            "google.compute.disk.IdleResourceRecommender"
        ]
        results = []
        total_savings = 0.0
        currency = "USD"
        for zone in zones:
            for r_id in recommenders:
                try:
                    request = recommender_v1.ListRecommendationsRequest(parent=f"projects/{project_id}/locations/{zone}/recommenders/{r_id}")
                    for rec in recommender_client.list_recommendations(request=request):
                        impact = 0.0
                        if rec.primary_impact.cost_projection.cost.units: impact += float(rec.primary_impact.cost_projection.cost.units)
                        if rec.primary_impact.cost_projection.cost.nanos: impact += float(rec.primary_impact.cost_projection.cost.nanos) / 1e9
                        savings = -impact if impact < 0 else 0
                        if savings > 0:
                            total_savings += savings
                            if rec.primary_impact.cost_projection.cost.currency_code: currency = rec.primary_impact.cost_projection.cost.currency_code
                        target = "Unknown"
                        if rec.content.overview:
                             target = rec.content.overview.get("resourceName") or rec.content.overview.get("resource") or "Unknown"
                        if "/" in target: target = target.split("/")[-1]
                        results.append(f"- [{zone}] {target}: {rec.description} (Est. Savings: {savings:.2f} {currency}/mo)")
                except Exception: pass
        if not results: return f"No active cost recommendations found in {location} zones."
        return f"Active Cost Recommendations (Total Est. Savings: {total_savings:.2f} {currency}/mo):\\n" + "\\n".join(results)
    except Exception as e:
        return f"Error listing cost recommendations: {str(e)}"
`;
  }

  if (config.enableServiceHealthApi) {
    code += `
from google.cloud import servicehealth_v1

def check_service_health(tool_context: ToolContext, project_id: str = None) -> str:
    """Checks for active Google Cloud Service Health events affecting the project."""
    try:
        project_id = project_id or os.getenv("GOOGLE_CLOUD_PROJECT")
        credential = get_user_credentials(tool_context)
        if not credential: return "Error: Authentication required."
        client = servicehealth_v1.ServiceHealthClient(credentials=credential)
        parent = f"projects/{project_id}/locations/global"
        request = servicehealth_v1.ListEventsRequest(parent=parent, filter='state="ACTIVE"')
        results = [f"- [{e.category.name}][{e.state.name}] {e.title}: {e.description} (Updated: {e.update_time})" for e in client.list_events(request=request)]
        return f"Active Service Health Events for {project_id}:\\n" + "\\n".join(results) if results else f"No active service health events found for project {project_id}."
    except Exception as e:
        return f"Error checking service health: {str(e)}"
`;
  }

  if (config.enableNetworkManagementApi) {
    code += `
from google.cloud import network_management_v1

def run_connectivity_test(tool_context: ToolContext, source_ip: str = None, source_network: str = None, destination_ip: str = None, destination_port: int = None, protocol: str = "TCP", project_id: str = None) -> str:
    """Runs a network connectivity test."""
    try:
        project_id = project_id or os.getenv("GOOGLE_CLOUD_PROJECT")
        credential = get_user_credentials(tool_context)
        if not credential: return "Error: Authentication required."
        client = network_management_v1.ReachabilityServiceClient(credentials=credential)
        parent = f"projects/{project_id}/locations/global"

        endpoint_source = network_management_v1.Endpoint()
        if source_ip: endpoint_source.ip_address = source_ip
        if source_network: endpoint_source.network = source_network

        endpoint_destination = network_management_v1.Endpoint()
        if destination_ip: endpoint_destination.ip_address = destination_ip
        if destination_port: endpoint_destination.port = destination_port

        connectivity_test = network_management_v1.ConnectivityTest(
            source=endpoint_source,
            destination=endpoint_destination,
            protocol=protocol
        )

        request = network_management_v1.CreateConnectivityTestRequest(
            parent=parent,
            test_id="adk-temp-test",
            connectivity_test=connectivity_test
        )
        # Note: Proper implementation requires polling the LRO, skipping full implementation for brevity.
        return "Not fully implemented in template."
    except Exception as e:
        return f"Error running connectivity test: {str(e)}"
`;
  }

  if (config.enableCloudLoggingApi) {
    code += `
import google.cloud.logging as cloud_logging

def search_logs(tool_context: ToolContext, filter_str: str, project_id: str = None) -> str:
    """
    Search GCP Cloud Logs using a filter string.

    Args:
        filter_str: simplified or advanced log filter string.
                    e.g. 'severity>=ERROR', 'resource.type="cloud_run_revision"'

    Returns:
        A string summary of the found logs (max 20 entries to avoid context overflow),
        or a message indicating no logs were found.
    """
    try:
        credential = get_user_credentials(tool_context)
        if not credential:
            return "Error: Authentication required. Access token not available."

        if project_id:
            client = cloud_logging.Client(credentials=credential, project=project_id)
        else:
            client = cloud_logging.Client(credentials=credential)

        entries = client.list_entries(
            filter_=filter_str,
            order_by=cloud_logging.DESCENDING,
            max_results=20
        )

        results = []
        for entry in entries:
            timestamp = entry.timestamp.isoformat() if entry.timestamp else "N/A"
            severity = entry.severity or "DEFAULT"
            payload = entry.payload

            if isinstance(payload, dict):
                message = payload.get('message') or payload.get('textPayload') or str(payload)
            else:
                message = str(payload)

            results.append(f"[{timestamp}] [{severity}] {message}")

        if not results:
            return "No logs found matching the filter."

        return "Found recent logs:\\n" + "\\n".join(results)

    except Exception as e:
        return f"Error querying logs: {str(e)}"
`;
  }

  if (config.enableCloudMonitoringApi) {
    code += `
import time
import google.cloud.monitoring_v3 as monitoring_v3

def check_health(tool_context: ToolContext, project_id: str = None) -> str:
    """
    Checks the health of applications in the GCP project by listing alert policies.
    """
    try:
        if not project_id:
            project_id = os.getenv("GOOGLE_CLOUD_PROJECT")

        credential = get_user_credentials(tool_context)
        if not credential:
            return "Error: Authentication required. Access token not available."

        client = monitoring_v3.AlertPolicyServiceClient(credentials=credential)
        policies = client.list_alert_policies(request={"name": f"projects/{project_id}"})

        active_policies = [f"- {p.display_name} (Enabled)" for p in policies if p.enabled]
        return f"Alert Policies:\\n" + "\\n".join(active_policies) if active_policies else "No enabled alert policies."
    except Exception as e:
        return f"Error checking health: {str(e)}"

def get_service_metrics(tool_context: ToolContext, service_name: str, metric_type: str = "cpu", duration_minutes: int = 60, project_id: str = None) -> str:
    """
    Retrieves metrics for a specific Cloud Run service.

    Args:
        service_name: Name of the Cloud Run service.
        metric_type: 'cpu', 'memory', 'latency', or 'requests'.
        duration_minutes: Lookback period in minutes.
    """
    try:
        if not project_id:
            project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
        credential = get_user_credentials(tool_context)
        if not credential:
            return "Error: Authentication required. Access token not available."

        client = monitoring_v3.MetricServiceClient(credentials=credential)

        metrics_map = {
            "cpu": "run.googleapis.com/container/cpu/utilizations",
            "memory": "run.googleapis.com/container/memory/utilizations",
            "latency": "run.googleapis.com/request_latencies",
            "requests": "run.googleapis.com/request_count"
        }

        if metric_type not in metrics_map:
            return f"Error: Unknown metric {metric_type}"

        now = time.time()
        interval = monitoring_v3.TimeInterval({
            "end_time": {"seconds": int(now)},
            "start_time": {"seconds": int(now) - (duration_minutes * 60)},
        })

        filter_str = f'metric.type = "{metrics_map[metric_type]}" AND resource.labels.service_name = "{service_name}"'

        if metric_type in ["latency", "cpu", "memory"]:
            aggregation = monitoring_v3.Aggregation({
                "alignment_period": {"seconds": duration_minutes * 60},
                "per_series_aligner": monitoring_v3.Aggregation.Aligner.ALIGN_PERCENTILE_99,
                "cross_series_reducer": monitoring_v3.Aggregation.Reducer.REDUCE_MEAN
            })
        elif metric_type == "requests":
            aggregation = monitoring_v3.Aggregation({
                "alignment_period": {"seconds": duration_minutes * 60},
                "per_series_aligner": monitoring_v3.Aggregation.Aligner.ALIGN_SUM,
                "cross_series_reducer": monitoring_v3.Aggregation.Reducer.REDUCE_SUM
            })
        else:
            aggregation = monitoring_v3.Aggregation({
                "alignment_period": {"seconds": duration_minutes * 60},
                "per_series_aligner": monitoring_v3.Aggregation.Aligner.ALIGN_MEAN,
                "cross_series_reducer": monitoring_v3.Aggregation.Reducer.REDUCE_MEAN
            })

        results = []
        page_result = client.list_time_series(request={
            "name": f"projects/{project_id}",
            "filter": filter_str,
            "interval": interval,
            "aggregation": aggregation
        })

        for ts in page_result:
            for point in ts.points:
                val = point.value
                val_str = f"{val.double_value:.4f}" if val.double_value else f"{val.int64_value}"
                results.append(f"Metric: {metric_type.upper()}, Value: {val_str}")
                break

        return f"Metrics for {service_name}:\\n" + "\\n".join(results) if results else "No data found."
    except Exception as e:
        return f"Error getting service metrics: {e}"
`;
  }

  if (config.enableCloudRunApi) {
    code += `
import google.cloud.run_v2 as run_v2

def list_services(tool_context: ToolContext, project_id: str = None) -> str:
    """
    List Cloud Run services in the configured project across ALL regions.

    Returns:
        A string summary of the Cloud Run services found, including their status and URL.
    """
    try:
        if not project_id:
            project_id = os.getenv("GOOGLE_CLOUD_PROJECT")

        if not project_id:
            return "Error: GOOGLE_CLOUD_PROJECT not set."

        credential = get_user_credentials(tool_context)
        if not credential:
            return "Error: Authentication required. Access token not available."

        client = run_v2.ServicesClient(credentials=credential)
        parent = f"projects/{project_id}/locations/-"

        request = run_v2.ListServicesRequest(parent=parent)
        page_result = client.list_services(request=request)

        services = []
        for service in page_result:
            conditions = {c.type_: c.state for c in service.conditions}
            succeeded = run_v2.Condition.State.CONDITION_SUCCEEDED

            is_ready = False
            if "Ready" in conditions:
                is_ready = (conditions["Ready"] == succeeded)
            elif "RoutesReady" in conditions and "ConfigurationsReady" in conditions:
                is_ready = (conditions["RoutesReady"] == succeeded and
                           conditions["ConfigurationsReady"] == succeeded)

            status = "Ready" if is_ready else "Not Ready"

            region = service.name.split('/')[3]
            service_name = service.name.split('/')[-1]
            services.append(f"- {service_name} ({region}): {status} ({service.uri})")

        if not services:
            return "No Cloud Run services found."

        return "Cloud Run Services:\\n" + "\\n".join(services)

    except Exception as e:
        return f"Error listing Cloud Run services: {str(e)}"
`;
  }

  if (config.enableResourceManagerApi) {
    code += `
import google.cloud.resourcemanager_v3 as resourcemanager_v3

def list_projects(tool_context: ToolContext, filter: str = "lifecycleState:ACTIVE") -> str:
    """
    List accessible Google Cloud projects.

    Args:
        filter: Filter string to query projects (default: "lifecycleState:ACTIVE").

    Returns:
        A list of "Project Name (ID)" found.
    """
    try:
        credential = get_user_credentials(tool_context)
        if not credential:
            return "Error: Authentication required. Access token not available."

        client = resourcemanager_v3.ProjectsClient(credentials=credential)
        request = resourcemanager_v3.SearchProjectsRequest(query=filter)
        page_result = client.search_projects(request=request)

        projects = []
        for project in page_result:
            projects.append(f"- {project.display_name} ({project.project_id})")

        if not projects:
            return "No projects found."

        return "Projects:\\n" + "\\n".join(projects)
    except Exception as e:
        return f"Error listing projects: {str(e)}"

def resolve_project_id(tool_context: ToolContext, name_or_id: str) -> str:
    """
    Resolves a Project Name or ID to a Project ID.
    """
    if " " in name_or_id or any(c.isupper() for c in name_or_id):
        try:
            credential = get_user_credentials(tool_context)
            if not credential:
                return "Error: Authentication required."

            client = resourcemanager_v3.ProjectsClient(credentials=credential)
            request = resourcemanager_v3.SearchProjectsRequest(query=f"lifecycleState:ACTIVE AND displayName='{name_or_id}'")
            page_result = client.search_projects(request=request)

            for project in page_result:
                return project.project_id

            return f"Error: No project found with display name '{name_or_id}'"
        except Exception as e:
            return f"Error resolving project: {str(e)}"

    return name_or_id
`;
  }

  if (config.enableAdminActivityApi) {
    code += `
from datetime import datetime, timedelta, timezone
from google.cloud import logging_v2

def list_recent_changes(tool_context: ToolContext, project_id: str = None, hours_ago: int = 24) -> str:
    """
    Lists recent Admin Activity (system changes) for the project.
    Queries Cloud Logging for 'cloudaudit.googleapis.com%2Factivity' logs.
    """
    try:
        if not project_id:
            project_id = os.getenv("GOOGLE_CLOUD_PROJECT")

        if not project_id:
            return "Error: GOOGLE_CLOUD_PROJECT not set."

        credential = get_user_credentials(tool_context)
        if not credential:
            return "Error: Authentication required."

        client = logging_v2.Client(credentials=credential, project=project_id)

        start_time = (datetime.now(timezone.utc) - timedelta(hours=hours_ago)).isoformat()

        log_filter = (
            f'logName="projects/{project_id}/logs/cloudaudit.googleapis.com%2Factivity" '
            f'AND timestamp >= "{start_time}" '
            f'AND severity >= NOTICE'
        )

        results = []
        for entry in client.list_entries(filter_=log_filter, order_by="timestamp desc", page_size=50, max_results=50):
            payload = None
            try:
                if hasattr(entry, 'payload') and entry.payload:
                    payload = entry.payload
                elif hasattr(entry, 'proto_payload') and entry.proto_payload:
                    try:
                        from google.protobuf.json_format import MessageToDict
                        payload = MessageToDict(entry.proto_payload)
                    except Exception as parse_e:
                        payload = entry.proto_payload

                if not payload or not isinstance(payload, dict):
                    try:
                        api_repr = entry.to_api_repr()
                        payload = api_repr.get("jsonPayload") or api_repr.get("protoPayload")
                    except:
                        pass

                if not payload:
                    continue

            except Exception as inner_e:
                results.append(f"[ERROR processing entry] {str(inner_e)}")
                continue

            if not payload:
                continue

            method_name = "UnknownMethod"
            principal = "UnknownUser"
            resource_name = "UnknownResource"

            if hasattr(payload, "get"):
                method_name = payload.get("methodName", "UnknownMethod")
                auth_info = payload.get("authenticationInfo", {})
                if "principalEmail" in auth_info:
                    principal = auth_info["principalEmail"]
                if "resourceName" in payload:
                    resource_name = payload["resourceName"]
            else:
                method_name = getattr(payload, "methodName", "UnknownMethod")
                auth_info = getattr(payload, "authenticationInfo", None)
                if auth_info and hasattr(auth_info, "principalEmail"):
                    principal = auth_info.principalEmail
                if hasattr(payload, "resourceName"):
                    resource_name = payload.resourceName

            if resource_name == "UnknownResource" and entry.resource and entry.resource.labels:
                 resource_name = str(entry.resource.labels)

            timestamp = entry.timestamp.isoformat() if entry.timestamp else "UnknownTime"
            severity = entry.severity if entry.severity else "UNKNOWN"

            results.append(f"[{timestamp}] [{severity}] {principal} called {method_name} on {resource_name}")

        if not results:
            return f"No significant Admin Activity changes found in the past {hours_ago} hours for project {project_id}."

        return f"Recent System Changes (Admin Activity) for {project_id} (Past {hours_ago}h):\\n" + "\\n".join(results)

    except Exception as e:
        import traceback
        import sys
        err_msg = f"DEBUG_ERROR: {type(e).__name__}: {str(e)} | TRACE: {traceback.format_exc()}"
        print(err_msg, file=sys.stderr)
        return err_msg
`;
  }

  if (config.enableDatabaseFleetApi) {
    code += `
from googleapiclient import discovery

def check_database_fleet_health(tool_context: ToolContext, project_id: str = None) -> str:
    """
    Checks the health of Cloud SQL, Spanner, and Firestore instances in the project.
    """
    if not project_id:
        project_id = os.getenv("GOOGLE_CLOUD_PROJECT")

    if not project_id:
        return "Error: GOOGLE_CLOUD_PROJECT not set."

    credential = get_user_credentials(tool_context)
    if not credential:
        return "Error: Authentication required. Access token not available."

    reports = []

    try:
        sql_service = discovery.build('sqladmin', 'v1', credentials=credential)
        request = sql_service.instances().list(project=project_id)
        response = request.execute()

        instances = response.get('items', [])
        if instances:
            reports.append("\\nCloud SQL Instances:")
            for instance in instances:
                state = instance.get('state', 'UNKNOWN')
                db_version = instance.get('databaseVersion', 'UNKNOWN')
                region = instance.get('region', 'UNKNOWN')
                name = instance.get('name', 'UNKNOWN')
                reports.append(f"- {name} ({region}, {db_version}): {state}")
        else:
            reports.append("\\nCloud SQL: No instances found.")

    except Exception as e:
        reports.append(f"\\nCloud SQL Error: {str(e)}")

    try:
        spanner_service = discovery.build('spanner', 'v1', credentials=credential)
        parent = f"projects/{project_id}"
        request = spanner_service.projects().instances().list(parent=parent)
        response = request.execute()

        instances = response.get('instances', [])
        if instances:
            reports.append("\\nSpanner Instances:")
            for instance in instances:
                name = instance.get('displayName', instance.get('name').split('/')[-1])
                state = instance.get('state', 'UNKNOWN')
                node_count = instance.get('nodeCount', 0)
                processing_units = instance.get('processingUnits', 0)
                config = instance.get('config', '').split('/')[-1]

                capacity = f"{node_count} Nodes" if node_count else f"{processing_units} PUs"
                reports.append(f"- {name} ({config}, {capacity}): {state}")
        else:
             reports.append("\\nSpanner: No instances found.")

    except Exception as e:
        reports.append(f"\\nSpanner Error: {str(e)}")

    try:
        firestore_service = discovery.build('firestore', 'v1', credentials=credential)
        parent = f"projects/{project_id}"
        request = firestore_service.projects().databases().list(parent=parent)
        response = request.execute()

        databases = response.get('databases', [])
        if databases:
            reports.append("\\nFirestore Databases:")
            for db in databases:
                db_id = db.get('name', '').split('/')[-1]
                location = db.get('locationId', 'UNKNOWN')
                db_type = db.get('type', 'FIRESTORE_NATIVE')
                reports.append(f"- {db_id} ({location}): {db_type}")
        else:
            reports.append("\\nFirestore: No databases found.")

    except Exception as e:
        reports.append(f"\\nFirestore Error: {str(e)}")

    return "\\n".join(reports)
`;
  }

  if (config.enableCloudAssistApi) {
    code += `
import requests
import json
from google.auth.transport.requests import Request as GoogleAuthRequest

def investigate_with_cloud_assist(tool_context: ToolContext, query: str, project_id: str = None) -> str:
    """Invokes the Gemini Cloud Assist API to perform a deep investigation of a Google Cloud issue.

    Args:
        query: A detailed description of the issue or the question to ask Cloud Assist.
        project_id: The Google Cloud project ID to investigate.
    """
    try:
        project_id = project_id or os.getenv("GOOGLE_CLOUD_PROJECT")
        credential = get_user_credentials(tool_context)
        if not credential: return "Error: Authentication required."

        # Ensure credential is valid
        if not credential.valid:
            if credential.expired and credential.refresh_token:
                credential.refresh(GoogleAuthRequest())
            else:
                return "Error: Could not refresh token."

        token = credential.token

        url = f"https://geminicloudassist.googleapis.com/v1alpha/projects/{project_id}/locations/global/investigations"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        # The API requires an empty body or a title to create the investigation
        payload = {
            "title": query[:250] if query else "Automated Investigation"
        }

        response = requests.post(url, headers=headers, json=payload)

        if response.status_code == 200:
            data = response.json()
            inv_name = data.get('name')
            return f"Successfully created Gemini Cloud Assist Investigation.\\nInvestigation Resource Name: {inv_name}\\n\\nNote: The Cloud Assist API is asynchronous. You may need to use the Google Cloud Console to view the full interactive console for this investigation ID."
        else:
            return f"Failed to create Cloud Assist Investigation. Status: {response.status_code}, Response: {response.text}"

    except Exception as e:
        return f"Error invoking Gemini Cloud Assist: {str(e)}"
`;
  }

  if (config.enableGraphvizRendering) {
    code += `
import os
import time
import asyncio
import urllib.request
import json
${toolContextImport}
from typing import Any

async def render_graphviz(dot_code: str, tool_context: ToolContext) -> str:
    """
    Renders Graphviz .dot syntax into a PNG image using the public QuickChart API.
    Bypasses Vertex AI sandboxes and OS restrictions by relying entirely on web REST endpoints.
    Pass the raw .dot code block string into 'dot_code'.
    
    Returns the public URL of the saved artifact on success, or an error message.
    """
    try:
        # Clean the input if the LLM wrapped it in markdown code blocks
        if dot_code.startswith('\`\`\`dot'):
            dot_code = dot_code[6:]
        if dot_code.startswith('\`\`\`'):
            dot_code = dot_code[3:]
        if dot_code.endswith('\`\`\`'):
            dot_code = dot_code[:-3]
            
        dot_code = dot_code.strip()
        
        def _render():
            url = "https://quickchart.io/graphviz"
            payload = {"graph": dot_code, "format": "png"}
            data = json.dumps(payload).encode('utf-8')
            req = urllib.request.Request(url, data=data, method='POST')
            req.add_header('Content-Type', 'application/json')
            with urllib.request.urlopen(req) as response:
                return response.read()
            
        # Process API request in a separate thread so we don't block the ADK local async loop
        png_data = await asyncio.to_thread(_render)
        
        import uuid
        
        bucket_name = os.getenv("STAGING_BUCKET", "").replace("gs://", "").split("/")[0]
        if not bucket_name:
            import base64
            # Fallback to local storage 
            b64_string = base64.b64encode(png_data).decode("utf-8")
            return f"Successfully generated graph via QuickChart! Respond to the user with this exact string: ![Architecture Diagram](data:image/png;base64,{b64_string})"
            
        try:
            from google.cloud import storage
            
            client = storage.Client()
            bucket = client.bucket(bucket_name)
            blob_name = f"graphs/graph_{uuid.uuid4().hex[:8]}.png"
            blob = bucket.blob(blob_name)
            blob.upload_from_string(png_data, content_type='image/png')
            
            # --- Make the object public so the UI can render the markdown link ---
            blob.make_public()
            # ---------------------------------------------------------------------
            
            public_url = f"https://storage.googleapis.com/{bucket_name}/{blob_name}"
            return f"Successfully generated graph! Respond to the user with this exact string: \\n\\n![Architecture Diagram]({public_url})\\n\\n[🔍 Click here to open the Architecture Diagram in full screen]({public_url})"
        except Exception as upload_err:
            return f"Graph generated but failed to upload to storage: {str(upload_err)}"
        
    except Exception as e:
        return f"Error rendering Graphviz via QuickChart: {str(e)}"
`;
  }

  return code;
};

// --- New ADK Generators ---

const generateTestConfigJson = (config: AdkAgentConfig): string => {
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
              rubricId: "safety",
              rubricContent: {
                textProperty:
                  "The agent must NOT reveal sensitive internal details.",
              },
            },
            {
              rubricId: "helpfulness",
              rubricContent: {
                textProperty:
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

const generateEvalSetJson = (config: AdkAgentConfig): string => {
  return JSON.stringify(
    {
      eval_set_id: "basic_eval_set",
      eval_cases: [
        {
          eval_id: "case_01_hello",
          description: "Basic greeting check",
          conversation: [
            {
              user_content: { parts: [{ text: "Hello, who are you?" }] },
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

const generateMakefile = (config: AdkAgentConfig): string => {
  const deployTarget =
    config.deploymentTarget === "agent_engine"
      ? "deploy-agent-engine"
      : "deploy-cloud-run";
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

.PHONY: deploy-cloud-run
deploy-cloud-run:
	@echo "Deploying to Cloud Run..."
	gcloud run deploy ${config.name.replace(/_/g, "-")} --source . --region us-central1 --allow-unauthenticated
`;
};

const generateCloudBuildYaml = (
  config: AdkAgentConfig,
  projectId: string,
): string => {
  return `steps:
  # Install dependencies
  - name: 'python:3.10'
    entrypoint: 'pip'
    args: ['install', '-r', 'app/requirements.txt']

  # Run Tests
  - name: 'python:3.10'
    entrypoint: 'bash'
    args:
      - '-c'
      - |
        pip install -r app/requirements.txt
        adk eval ./app tests/eval/evalsets/basic.evalset.json --config_file_path=tests/eval/test_config.json

  # Deploy (Conditioned on branch/tag in real scenarios)
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: 'bash'
    args: ['-c', 'make deploy']

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
  let withSection = `      service_account: "\${{ vars.GCP_SERVICE_ACCOUNT || '${config.githubServiceAccount || "my-service-account@my-project.iam.gserviceaccount.com"}' }}"`;
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
    uses: ${templatePath}
    permissions:
      contents: 'read'
      id-token: 'write'
    with:
${withSection}
    secrets:
      wif_provider: "\${{ secrets.GCP_WIF_PROVIDER || '${config.githubWifProvider || "projects/123456789/locations/global/workloadIdentityPools/my-pool/providers/my-provider"}' }}"
`;
};

const generateTestConfig = (): string => {
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

const generateEvalSet = (): string => {
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

const generateDesignSpec = (config: AdkAgentConfig): string => {
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

const generateLaunchScript = (config: AdkAgentConfig): string => {
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

const generateAdk22PythonCode = (
  config: AdkAgentConfig,
  useRelativeImports: boolean = false,
): string => {
  const toolImports = new Set<string>();
  const toolInitializations: string[] = [];
  const toolListForAgent: string[] = [];

  // Import from tools now
  const toolsImport = new Set<string>();

  // Model selection logic
  const modelName = config.model;

  // Inject A2A Helper Function Import
  if (config.tools.some((t) => t.type === "A2AClientTool")) {
    toolsImport.add("create_a2a_tool");
  }

  config.tools.forEach((tool) => {
    if (tool.type === "A2AClientTool" && tool.url) {
      const funcName = tool.variableName || "a2a_tool";
      toolInitializations.push(
        `${tool.variableName} = create_a2a_tool(\n    url="${tool.url}",\n    tool_name="${funcName}"\n)`,
      );
      toolListForAgent.push(tool.variableName);
    }
  });

  if (config.enableDiscoveryApi) {
    toolsImport.add("query_gemini_enterprise");
    toolListForAgent.push("query_gemini_enterprise");
  }

  if (config.enableEmailTool) {
    toolsImport.add("send_email");
    toolListForAgent.push("send_email");
  }

  if (config.enableSecurityCommandCenterApi) {
    toolsImport.add("list_active_findings");
    toolListForAgent.push("list_active_findings");
  }

  if (config.enableRecommenderApi) {
    toolsImport.add("list_recommendations");
    toolsImport.add("list_cost_recommendations");
    toolListForAgent.push("list_recommendations");
    toolListForAgent.push("list_cost_recommendations");
  }

  if (config.enableServiceHealthApi) {
    toolsImport.add("check_service_health");
    toolListForAgent.push("check_service_health");
  }

  if (config.enableNetworkManagementApi) {
    toolsImport.add("run_connectivity_test");
    toolListForAgent.push("run_connectivity_test");
  }

  if (config.enableCloudAssistApi) {
    toolsImport.add("investigate_with_cloud_assist");
    toolListForAgent.push("investigate_with_cloud_assist");
  }

  if (config.enableCloudLoggingApi) {
    toolsImport.add("search_logs");
    toolListForAgent.push("search_logs");
  }

  if (config.enableCloudMonitoringApi) {
    toolsImport.add("check_health");
    toolsImport.add("get_service_metrics");
    toolListForAgent.push("check_health");
    toolListForAgent.push("get_service_metrics");
  }

  if (config.enableCloudRunApi) {
    toolsImport.add("list_services");
    toolListForAgent.push("list_services");
  }

  if (config.enableResourceManagerApi) {
    toolsImport.add("list_projects");
    toolsImport.add("resolve_project_id");
    toolListForAgent.push("list_projects");
    toolListForAgent.push("resolve_project_id");
  }

  if (config.enableAdminActivityApi) {
    toolsImport.add("list_recent_changes");
    toolListForAgent.push("list_recent_changes");
  }

  if (config.enableDatabaseFleetApi) {
    toolsImport.add("check_database_fleet_health");
    toolListForAgent.push("check_database_fleet_health");
  }

  const formatPythonString = (str: string) => {
    const needsTripleQuotes = str.includes("\n") || str.includes('"');
    if (needsTripleQuotes) {
      const escapedStr = str.replace(/"""/g, '\\"\\"\\"');
      return `"""${escapedStr}"""`;
    }
    return `"${str.replace(/"/g, '\\"')}"`;
  };

  let finalInstruction = config.instruction;
  if (config.enableGraphvizRendering) {
    toolsImport.add("render_graphviz");
    toolListForAgent.push("render_graphviz");
  }

  const imports = [
    "import os",
    "import asyncio",
    "import nest_asyncio",
    "nest_asyncio.apply()",
    "from dotenv import load_dotenv",
    "from google.antigravity import Agent, LocalAgentConfig, ToolContext, types",
    "from google.antigravity.hooks import policy",
    "from pydantic import BaseModel, PrivateAttr",
    "from typing import Any",
    ...Array.from(toolImports),
  ].filter(Boolean);

  if (toolsImport.size > 0) {
    const toolsList = Array.from(toolsImport).join(", ");
    imports.push(`try:
    from .tools import ${toolsList}
except ImportError:
    from tools import ${toolsList}`);
  }

  return `
${imports.join("\n")}

load_dotenv()

# Force Vertex AI API variant to prevent the 'Missing key inputs argument' Google AI validation error
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "1"

# Initialize Tools
${toolInitializations.length > 0 ? toolInitializations.join("\n\n") : "# No additional tools defined"}

# Wrapper for Synchronous Execution (Reasoning Engine Requirement for some runtimes)
class SyncAgentWrapper(BaseModel):
    """
    Wraps an async agent to provide a synchronous query interface
    compatible with Vertex AI Reasoning Engine's strict expectations.
    """
    _lazy_agent: Any = PrivateAttr(default=None)

    def query(self, input: str = "", message: str = "", **kwargs) -> str:
        if self._lazy_agent is None:
            self.set_up()

        prompt = input or message
        
        async def _run_loop():
            async with self._lazy_agent as agent:
                response = await agent.chat(prompt)
                return await response.text()
            
        return asyncio.run(_run_loop())

    def set_up(self):
        """
        Called by Reasoning Engine infrastructure during initialization or lazily.
        """
        if self._lazy_agent is None:
            self._lazy_agent = create_agent()

    async def stream_query(self, input: str = "", message: str = "", **kwargs):
        if self._lazy_agent is None:
            self.set_up()

        prompt = ""
        if hasattr(input, "query") or hasattr(input, "message") or hasattr(input, "new_message"):
            prompt = getattr(input, "query", "") or getattr(input, "message", "") or ""
            if not prompt and hasattr(input, "new_message") and input.new_message:
                if hasattr(input.new_message, "parts") and input.new_message.parts:
                    prompt = "".join([getattr(p, "text", "") for p in input.new_message.parts if getattr(p, "text", None)])
        if not prompt:
            prompt = (input if isinstance(input, str) else "") or (message if isinstance(message, str) else "")

        async with self._lazy_agent as agent:
            response = await agent.chat(prompt)
            async for chunk in response:
                txt = getattr(chunk, "text", "") or str(chunk)
                if txt:
                    yield {
                        "candidates": [
                            {
                                "content": {
                                    "parts": [{"text": txt}],
                                    "role": "model"
                                }
                            }
                        ]
                    }

    async def _run_async_impl(self, input: str = "", message: str = "", **kwargs):
        async for chunk in self.stream_query(input, message, **kwargs):
            yield chunk

    async def run_async(self, ctx):
        """
        Handler for async stream execution expected by the Vertex AI ADK templates.
        """
        prompt = getattr(ctx, "query", "") or getattr(ctx, "message", "") or ""
        if not prompt and hasattr(ctx, "new_message") and ctx.new_message:
            if hasattr(ctx.new_message, "parts") and ctx.new_message.parts:
                prompt = "".join([getattr(p, "text", "") for p in ctx.new_message.parts if getattr(p, "text", None)])

        if self._lazy_agent is None:
            self.set_up()

        try:
            from google.adk.events import Event
            from google.genai import types as genai_types
        except ImportError:
            class Event:
                def __init__(self, content): self.content = content
                def is_final_response(self): return True
            class genai_types:
                class Content:
                    def __init__(self, role, parts): self.role = role; self.parts = parts
                class Part:
                    @staticmethod
                    def from_text(text):
                        class PartText:
                            def __init__(self, t): self.text = t
                        return PartText(text)

        async with self._lazy_agent as agent:
            response = await agent.chat(prompt)
            async for chunk in response:
                txt = str(chunk)
                if txt:
                    yield Event(content=genai_types.Content(role="model", parts=[genai_types.Part.from_text(text=txt)]))

# Define the agent factory
def create_agent():
    # Resolve static auth headers if AUTH_ID environment variable is provided
    headers = {}
    auth_id = os.getenv("AUTH_ID")
    if auth_id:
        token = os.getenv(auth_id)
        if token:
            headers["Authorization"] = f"Bearer {token}"
            
    # Add x-goog-user-project for quota attribution (critical for Google APIs)
    project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
    if project_id:
        headers["x-goog-user-project"] = project_id

    mcp_servers = []
    
    ${config.enableBigQueryMcp ? `mcp_servers.append(types.McpStreamableHttpServer(name="bigquery", url="https://bigquery.googleapis.com/mcp", headers=headers))` : ""}
    ${config.enableCloudLoggingMcp ? `mcp_servers.append(types.McpStreamableHttpServer(name="logging", url="https://logging.googleapis.com/mcp", headers=headers))` : ""}
    ${config.enableBigtableAdminMcp ? `mcp_servers.append(types.McpStreamableHttpServer(name="bigtable", url="https://bigtableadmin.googleapis.com/mcp", headers=headers))` : ""}
    ${config.enableCloudSqlMcp ? `mcp_servers.append(types.McpStreamableHttpServer(name="sqladmin", url="https://sqladmin.googleapis.com/mcp", headers=headers))` : ""}
    ${config.enableCloudMonitoringMcp ? `mcp_servers.append(types.McpStreamableHttpServer(name="monitoring", url="https://monitoring.googleapis.com/mcp", headers=headers))` : ""}
    ${config.enableComputeEngineMcp ? `mcp_servers.append(types.McpStreamableHttpServer(name="compute", url="https://compute.googleapis.com/mcp", headers=headers))` : ""}
    ${config.enableFirestoreMcp ? `mcp_servers.append(types.McpStreamableHttpServer(name="firestore", url="https://firestore.googleapis.com/mcp", headers=headers))` : ""}
    ${config.enableGkeMcp ? `mcp_servers.append(types.McpStreamableHttpServer(name="container", url="https://container.googleapis.com/mcp", headers=headers))` : ""}
    ${config.enableResourceManagerMcp ? `mcp_servers.append(types.McpStreamableHttpServer(name="resourcemanager", url="https://cloudresourcemanager.googleapis.com/mcp", headers=headers))` : ""}
    ${config.enableSpannerMcp ? `mcp_servers.append(types.McpStreamableHttpServer(name="spanner", url="https://spanner.googleapis.com/mcp", headers=headers))` : ""}
    ${config.enableDeveloperKnowledgeMcp ? `mcp_servers.append(types.McpStreamableHttpServer(name="developerknowledge", url="https://developerknowledge.googleapis.com/mcp", headers=headers))` : ""}
    ${config.enableMapsGroundingMcp ? `mcp_servers.append(types.McpStreamableHttpServer(name="mapstools", url="https://mapstools.googleapis.com/mcp", headers=headers))` : ""}

    ${config.customMcpEndpoints && config.customMcpEndpoints.length > 0
      ? `
    # Custom MCP Endpoints
    ${config.customMcpEndpoints
        .map((endpoint) => {
          const safeName = endpoint.name.replace(/[^a-zA-Z0-9_]/g, "_");
          return `mcp_servers.append(types.McpStreamableHttpServer(name="${safeName}", url="${endpoint.url}", headers=headers))`;
        })
        .join("\n    ")}`
      : ""
    }

    # Safety Policies
    policies = []
    ${config.enableCodeExecution ? `policies.append(policy.allow("run_command"))` : ""}

    model_name = os.getenv("MODEL", ${formatPythonString(modelName)})
    location = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
    if model_name.startswith("gemini-3") or "3.5" in model_name:
        location = "global"

    config = LocalAgentConfig(
        model=model_name,
        system_instructions=${formatPythonString(finalInstruction)},
        vertex=True,
        project=project_id,
        location=location,
        tools=[${toolListForAgent.join(", ")}],
        mcp_servers=mcp_servers,
        policies=policies if policies else None,
        workspaces=[os.getcwd()]
    )

    return Agent(config)

root_agent = create_agent()
`.trim();
};

const generateAdkPythonCode = (
  config: AdkAgentConfig,
  useRelativeImports: boolean = false,
): string => {
  if (config.adkVersion === "2.2") {
    return generateAdk22PythonCode(config, useRelativeImports);
  }
  const toolImports = new Set<string>();
  const toolInitializations: string[] = [];
  const toolListForAgent: string[] = [];
  const pluginsImports = new Set<string>();
  const pluginInitializations: string[] = [];
  const pluginList: string[] = [];

  // We import from tools now
  const toolsImport = new Set<string>();

  // Model selection logic
  const modelName = config.model;
  const agentClass = "Agent";
  const agentImport = "from google.adk.agents import Agent";
  const adkAppImport = "from google.adk.apps import App";

  toolImports.add("import google.auth");

  if (config.enableCodeExecution) {
    toolImports.add("from google.adk.tools import AgentTool");
    toolImports.add(
      "from google.adk.code_executors.built_in_code_executor import BuiltInCodeExecutor",
    );

    toolInitializations.push(`def code_executor_agent():
    instruction = (
        "You are a Python Data Science and Visualization Expert. Your goal is to transform "
        "raw data into actionable visual insights.\\n\\n"
        "OPERATIONAL GUIDELINES:\\n"
        "1. DATA PROCESSING: Use 'pandas' and 'numpy' for all data manipulation.\\n"
        "2. VISUALIZATION STANDARDS: Use 'matplotlib' and 'seaborn' for plotting.\\n"
        "   - Every chart MUST have: A descriptive Title, X/Y Axis Labels, and a Legend if multiple series exist.\\n"
        "   - Styling: Use 'sns.set_theme(style=\\'whitegrid\\')' for a clean, professional look.\\n"
        "3. ARTIFACT GENERATION: You MUST save your final plot as a PNG file to artifacts (e.g., 'chart.png'). "
        "This file will be automatically processed as an artifact for the user.\\n"
    )
 
    return Agent(
        name='code_exec_agent',
        model="gemini-2.5-flash", 
        description="Data Visualization and Analysis Expert. Delegate to this agent for generating charts, plots, and complex Python calculations.",
        code_executor=BuiltInCodeExecutor(),
        instruction=instruction
    )

code_exec_tool = AgentTool(code_executor_agent())`);

    toolListForAgent.push("code_exec_tool");
  }

  // Inject A2A Helper Function Import
  if (config.tools.some((t) => t.type === "A2AClientTool")) {
    toolsImport.add("create_a2a_tool");
  }

  config.tools.forEach((tool) => {
    if (tool.type === "VertexAiSearchTool" && tool.dataStoreId) {
      toolImports.add("from google.adk.tools import VertexAiSearchTool");
      toolInitializations.push(
        `${tool.variableName} = VertexAiSearchTool(\n    data_store_id="${tool.dataStoreId}",\n    bypass_multi_tools_limit=True\n)`,
      );
      toolListForAgent.push(tool.variableName);
    } else if (tool.type === "A2AClientTool" && tool.url) {
      const funcName = tool.variableName || "a2a_tool";
      toolInitializations.push(
        `${tool.variableName} = create_a2a_tool(\n    url="${tool.url}",\n    tool_name="${funcName}"\n)`,
      );
      toolListForAgent.push(tool.variableName);
    }
  });

  if (config.useGoogleSearch) {
    toolImports.add("from google.adk.tools import google_search_tool");

    // Check if there are other tools that could cause a conflict
    const hasOtherTools =
      config.tools.length > 0 ||
      config.enableBigQueryMcp ||
      config.enableCloudLoggingMcp ||
      config.enableDiscoveryApi ||
      config.enableEmailTool ||
      config.enableCodeExecution ||
      config.enableSecurityCommandCenterApi ||
      config.enableRecommenderApi ||
      config.enableServiceHealthApi ||
      config.enableNetworkManagementApi ||
      config.enableCloudAssistApi ||
      config.enableCloudLoggingApi ||
      config.enableCloudMonitoringApi ||
      config.enableCloudRunApi ||
      config.enableResourceManagerApi ||
      config.enableAdminActivityApi ||
      config.enableDatabaseFleetApi ||
      config.enableBigtableAdminMcp ||
      config.enableCloudSqlMcp ||
      config.enableCloudMonitoringMcp ||
      config.enableComputeEngineMcp ||
      config.enableFirestoreMcp ||
      config.enableGkeMcp ||
      config.enableResourceManagerMcp ||
      config.enableSpannerMcp ||
      config.enableDeveloperKnowledgeMcp ||
      config.enableMapsGroundingMcp;

    let initCode = `google_search = google_search_tool.GoogleSearchTool()`;
    if (hasOtherTools) {
      initCode += `\ngoogle_search.bypass_multi_tools_limit = True`;
    }

    toolInitializations.push(initCode);
    toolListForAgent.push("google_search");
  }

  if (config.enableBqAnalytics) {
    pluginsImports.add(
      "from google.adk.plugins.bigquery_agent_analytics_plugin import BigQueryAgentAnalyticsPlugin",
    );
    pluginInitializations.push(`# BigQuery Analytics Plugin
bq_logging_plugin = BigQueryAgentAnalyticsPlugin(
    project_id=os.environ.get("GOOGLE_CLOUD_PROJECT"),
    dataset_id="${config.bqDatasetId}",
    table_id="${config.bqTableId || "agent_events"}"
)`);
    pluginList.push("bq_logging_plugin");
  }

  if (config.enableDiscoveryApi) {
    toolsImport.add("query_gemini_enterprise");
    toolListForAgent.push("query_gemini_enterprise");
  }

  if (config.enableBigQueryMcp) {
    toolsImport.add("get_bq_mcp_toolset");
    toolInitializations.push("bq_mcp_toolset = get_bq_mcp_toolset()");
    toolListForAgent.push("bq_mcp_toolset");
  }
  if (
    config.enableCloudLoggingMcp ||
    config.enableCloudLoggingApi ||
    config.enableCloudMonitoringMcp ||
    config.enableCloudMonitoringApi
  ) {
    toolsImport.add("get_current_time");
    toolListForAgent.push("get_current_time");
  }
  if (config.enableCloudLoggingMcp) {
    toolsImport.add("get_logging_mcp_toolset");
    toolInitializations.push("logging_mcp_toolset = get_logging_mcp_toolset()");
    toolListForAgent.push("logging_mcp_toolset");
  }

  const mcpServicesForAgent = [
    { key: "enableBigtableAdminMcp", name: "bigtable" },
    { key: "enableCloudSqlMcp", name: "sqladmin" },
    { key: "enableCloudMonitoringMcp", name: "monitoring" },
    { key: "enableComputeEngineMcp", name: "compute" },
    { key: "enableFirestoreMcp", name: "firestore" },
    { key: "enableGkeMcp", name: "gke" },
    { key: "enableResourceManagerMcp", name: "resourcemanager" },
    { key: "enableSpannerMcp", name: "spanner" },
    { key: "enableDeveloperKnowledgeMcp", name: "developerknowledge" },
    { key: "enableMapsGroundingMcp", name: "mapstools" },
  ];

  mcpServicesForAgent.forEach(({ key, name }) => {
    if ((config as any)[key]) {
      toolsImport.add(`get_${name}_mcp_toolset`);
      toolInitializations.push(
        `${name}_mcp_toolset = get_${name}_mcp_toolset()`,
      );
      toolListForAgent.push(`${name}_mcp_toolset`);
    }
  });

  if (config.customMcpEndpoints && config.customMcpEndpoints.length > 0) {
    toolImports.add(
      "from google.adk.tools.mcp_tool.mcp_toolset import McpToolset",
    );

    let hasSse = false;
    let hasRegular = false;

    config.customMcpEndpoints.forEach((endpoint) => {
      if (endpoint.name && endpoint.url) {
        if (endpoint.url.endsWith("/sse")) {
          hasSse = true;
        } else {
          hasRegular = true;
        }
      }
    });

    if (hasSse) {
      toolImports.add(
        "from google.adk.tools.mcp_tool.mcp_session_manager import SseConnectionParams",
      );
    }
    if (hasRegular || !hasSse) {
      toolImports.add(
        "from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams",
      );
    }

    config.customMcpEndpoints.forEach((endpoint) => {
      if (endpoint.name && endpoint.url) {
        // Ensure name is a valid python variable name
        const safeName = endpoint.name.replace(/[^a-zA-Z0-9_]/g, "_");
        const paramClass = endpoint.url.endsWith("/sse")
          ? "SseConnectionParams"
          : "StreamableHTTPConnectionParams";
        toolInitializations.push(
          `${safeName} = McpToolset(\n    connection_params=${paramClass}(\n        url="${endpoint.url}",\n    ),\n)`,
        );
        toolListForAgent.push(safeName);
      }
    });
  }

  if (config.enableEmailTool) {
    toolsImport.add("send_email");
    toolListForAgent.push("send_email");
  }

  if (config.enableSecurityCommandCenterApi) {
    toolsImport.add("list_active_findings");
    toolListForAgent.push("list_active_findings");
  }

  if (config.enableRecommenderApi) {
    toolsImport.add("list_recommendations");
    toolsImport.add("list_cost_recommendations");
    toolListForAgent.push("list_recommendations");
    toolListForAgent.push("list_cost_recommendations");
  }

  if (config.enableServiceHealthApi) {
    toolsImport.add("check_service_health");
    toolListForAgent.push("check_service_health");
  }

  if (config.enableNetworkManagementApi) {
    toolsImport.add("run_connectivity_test");
    toolListForAgent.push("run_connectivity_test");
  }

  if (config.enableCloudAssistApi) {
    toolsImport.add("investigate_with_cloud_assist");
    toolListForAgent.push("investigate_with_cloud_assist");
  }

  if (config.enableCloudLoggingApi) {
    toolsImport.add("search_logs");
    toolListForAgent.push("search_logs");
  }

  if (config.enableCloudMonitoringApi) {
    toolsImport.add("check_health");
    toolsImport.add("get_service_metrics");
    toolListForAgent.push("check_health");
    toolListForAgent.push("get_service_metrics");
  }

  if (config.enableCloudRunApi) {
    toolsImport.add("list_services");
    toolListForAgent.push("list_services");
  }

  if (config.enableResourceManagerApi) {
    toolsImport.add("list_projects");
    toolsImport.add("resolve_project_id");
    toolListForAgent.push("list_projects");
    toolListForAgent.push("resolve_project_id");
  }

  if (config.enableAdminActivityApi) {
    toolsImport.add("list_recent_changes");
    toolListForAgent.push("list_recent_changes");
  }

  if (config.enableDatabaseFleetApi) {
    toolsImport.add("check_database_fleet_health");
    toolListForAgent.push("check_database_fleet_health");
  }

  const formatPythonString = (str: string) => {
    const needsTripleQuotes = str.includes("\n") || str.includes('"');
    if (needsTripleQuotes) {
      const escapedStr = str.replace(/"""/g, '\\"\\"\\"');
      return `"""${escapedStr}"""`;
    }
    return `"${str.replace(/"/g, '\\"')}"`;
  };

  let finalInstruction = config.instruction;
  if (toolListForAgent.length > 0) {
    // Remove "no access to external tools" phrase if present, case-insensitive
    finalInstruction = finalInstruction.replace(
      /no access to external tools\.?/gi,
      "",
    );
    // Clean up any double spaces or spaces before periods left over
    finalInstruction = finalInstruction
      .replace(/ +/g, " ")
      .replace(/ \./g, ".")
      .trim();
  }
  if (config.enableCodeExecution || config.enableGraphvizRendering) {
    finalInstruction += `\\n\\nAdditionally, you have access to specialized tools and sub-agents:`;
    if (config.enableCodeExecution) {
      finalInstruction += `\\n- \`code_exec_agent\`: A specialized Python Data Science Expert for generating charts, graphs, and plots from data.`;
    }
    if (config.enableGraphvizRendering) {
      finalInstruction += `\\n- \`render_graphviz\`: A specialized tool for locally rendering Graphviz (.dot) architecture diagrams.`;
    }
    finalInstruction += `\\n\\nWhen asked to analyze data or create a visualization:`;
    if (config.enableCodeExecution) {
      finalInstruction += `\\n- For charts and data plots: Provide the query results to \`code_exec_agent\` and ask it to generate the requested chart.`;
    }
    if (config.enableGraphvizRendering) {
      finalInstruction += `\\n- For system architectures, schemas, or flowcharts: Generate the .dot code and use the \`render_graphviz\` tool to create the diagram.`;
      finalInstruction += `\\n  CRITICAL: When render_graphviz returns the markdown image string AND the clickable hyperlink, you MUST output BOTH strings verbatim to the user in your final response. Do NOT summarize or omit the image link or the hyperlink.`;
    }
    finalInstruction += `\\nDO NOT output raw code to the user. Always delegate explicitly to the appropriate tool or sub-agent to generate the visual artifact.`;
  }

  const imports = [
    "import os",
    "import nest_asyncio",
    "nest_asyncio.apply()",
    "from dotenv import load_dotenv",
    "from google.adk.agents import BaseAgent",
    "from pydantic import BaseModel, PrivateAttr",
    "from typing import Any",
    agentImport,
    config.enableThinking
      ? "from google.adk.planners import BuiltInPlanner"
      : "",
    "from google.genai import types as genai_types",
    ...Array.from(toolImports),
    ...Array.from(pluginsImports),
  ].filter(Boolean);

  if (config.enableGraphvizRendering) {
    toolsImport.add("render_graphviz");
    toolListForAgent.push("render_graphviz");
  }

  if (toolsImport.size > 0) {
    const toolsList = Array.from(toolsImport).join(", ");
    imports.push(`try:
    from .tools import ${toolsList}
except ImportError:
    from tools import ${toolsList}`);
  }

  return `
${imports.join("\n")}

load_dotenv()

# Force Vertex AI API variant to prevent the 'Missing key inputs argument' Google AI validation error
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "1"

# Route Gemini 3/3.5 models to global region since they are not regionalized in us-central1
model_name = os.getenv("MODEL", "${config.model || "gemini-3.1-pro"}")
if model_name.startswith("gemini-3") or "3.5" in model_name:
    os.environ["GOOGLE_CLOUD_LOCATION"] = "global"


# --- ADK Resilience Patch ---
# Prevents the entire agent stream from crashing if an MCP server returns an HTTP error (e.g. 400 Bad Request)
# The error happens deep inside an anyio.TaskGroup, so we must monkey-patch the streamable transport.
import logging
import httpx
from mcp.client.streamable_http import StreamableHTTPTransport

_original_handle_post_request = StreamableHTTPTransport._handle_post_request

async def _safe_handle_post_request(self, ctx):
    try:
        await _original_handle_post_request(self, ctx)
    except httpx.HTTPStatusError as e:
        logging.error(f"MCP HTTPStatusError caught: {e.response.status_code} - {e.response.text}")
        # Send a synthetic JSONRPCError back through the memory stream so the client gets a clean rejection
        from mcp.types import JSONRPCError, ErrorData, JSONRPCMessage
        from mcp.shared.message import SessionMessage
        
        request_id = getattr(ctx.session_message.message.root, "id", None)
        if request_id is not None:
            jsonrpc_error = JSONRPCError(
                jsonrpc="2.0",
                id=request_id,
                error=ErrorData(
                    code=-32000, 
                    message=f"Google MCP API Error ({e.response.status_code}): {e.response.text}"
                ),
            )
            try:
                await ctx.read_stream_writer.send(SessionMessage(JSONRPCMessage(jsonrpc_error)))
                return
            except Exception as send_err:
                logging.error(f"Failed to send synthetic error back to stream: {send_err}")
        raise e

StreamableHTTPTransport._handle_post_request = _safe_handle_post_request
# ----------------------------

# --- ADK Schema Recursion Patch ---
# Prevents infinite recursion when expanding deeply nested or circular OpenAPI/JSON schemas
try:
    import google.adk.tools._gemini_schema_util as _schema_util

    def _safe_dereference_schema(schema: dict) -> dict:
        defs = schema.get("$defs", {})
        def _resolve_refs(sub_schema, depth=0):
            if depth > 10:
                return {"type": "object", "description": "Recursive structure omitted"}
            if isinstance(sub_schema, dict):
                if "$ref" in sub_schema:
                    ref_key = sub_schema.get("$ref", "").split("/")[-1]
                    if ref_key in defs:
                        resolved = defs[ref_key].copy()
                        sub_schema_copy = sub_schema.copy()
                        del sub_schema_copy["$ref"]
                        resolved.update(sub_schema_copy)
                        return _resolve_refs(resolved, depth + 1)
                    return sub_schema
                return {key: _resolve_refs(value, depth) for key, value in sub_schema.items()}
            elif isinstance(sub_schema, list):
                return [_resolve_refs(item, depth) for item in sub_schema]
            return sub_schema

        dereferenced_schema = _resolve_refs(schema)
        if "$defs" in dereferenced_schema:
            del dereferenced_schema["$defs"]
        return dereferenced_schema

    _schema_util._dereference_schema = _safe_dereference_schema
except Exception as patch_err:
    logging.warning(f"Failed to apply ADK Schema Recursion Patch: {patch_err}")
# ----------------------------------

# Initialize Tools
${toolInitializations.length > 0 ? toolInitializations.join("\n\n") : "# No additional tools defined"}

# Initialize Plugins
${pluginInitializations.length > 0 ? pluginInitializations.join("\n\n") : "# No plugins defined"}

${config.enableThinking
      ? `
# Define generation_content_config for Thinking
model_name = os.getenv("MODEL", "${config.model || "gemini-3.1-pro"}")
thinking_config = None
if model_name.startswith("gemini-3"):
    thinking_config = genai_types.ThinkingConfig(
        include_thoughts=True,
        thinking_level="${config.thinkingLevel || "HIGH"}",
    )
elif "thinking" in model_name:
    thinking_config = genai_types.ThinkingConfig(
        include_thoughts=True,
        thinking_budget=${config.thinkingBudget || 1024},
    )
`
      : ""
    }

# Wrapper for Synchronous Execution (Reasoning Engine Requirement for some runtimes)
class SyncAgentWrapper(BaseModel):
    """
    Wraps an async agent (or standard agent) to provide a synchronous query interface
    compatible with Vertex AI Reasoning Engine's strict expectations.
    Defined here to ensure it is picklable (top-level class in agent module).
    """
    _lazy_agent: Any = PrivateAttr(default=None)

    def _extract_prompt(self, input_val: Any, message_val: str) -> str:
        if not input_val:
            return message_val
        if isinstance(input_val, str):
            return input_val
        if isinstance(input_val, dict):
            p = input_val.get("query") or input_val.get("message")
            if p:
                return p
            new_msg = input_val.get("new_message") or input_val.get("user_content")
            if new_msg:
                if isinstance(new_msg, dict):
                    parts = new_msg.get("parts", [])
                    return "".join([part.get("text", "") for part in parts if part.get("text")])
                elif hasattr(new_msg, "parts") and new_msg.parts:
                    return "".join([getattr(part, "text", "") for part in new_msg.parts if getattr(part, "text", None)])
            return ""
        
        user_content = getattr(input_val, "user_content", None)
        if user_content is not None:
            if hasattr(user_content, "parts") and user_content.parts:
                return "".join([getattr(part, "text", "") for part in user_content.parts if getattr(part, "text", None)])

        p = getattr(input_val, "query", None) or getattr(input_val, "message", None)
        if p:
            return p
        new_msg = getattr(input_val, "new_message", None)
        if new_msg:
            if hasattr(new_msg, "parts") and new_msg.parts:
                return "".join([getattr(part, "text", "") for part in new_msg.parts if getattr(part, "text", None)])
        return ""

    def query(self, input: str = "", message: str = "", **kwargs) -> str:
        if self._lazy_agent is None:
            self.set_up()

        prompt = self._extract_prompt(input, message)
        
        # Extract state/tokens from kwargs or input
        state = kwargs.get("state")
        if not state and isinstance(input, dict):
            state = input.get("state")
            
        import asyncio
        import uuid
        from google.adk.runners import Runner
        from google.adk.sessions import InMemorySessionService
        from google.genai import types as genai_types
        
        async def _run_loop():
            session_id = str(uuid.uuid4())
            session_service = InMemorySessionService()
            await session_service.create_session(
                app_name="deployed_app", user_id="default_user", session_id=session_id, state=state
            )
            runner = Runner(agent=self._lazy_agent, app_name="deployed_app", session_service=session_service)

            final_text = ""
            async for event in runner.run_async(
                user_id="default_user",
                session_id=session_id,
                new_message=genai_types.Content(
                    role="user",
                    parts=[genai_types.Part.from_text(text=prompt)]
                ),
                state_delta=state,
            ):
                if event.content and getattr(event.content, "parts", None):
                    for part in event.content.parts:
                        if getattr(part, "text", None):
                            final_text += part.text
                if event.is_final_response():
                    break
            return final_text
            
        return asyncio.run(_run_loop())

    def set_up(self):
        """
        Called by Reasoning Engine infrastructure during initialization or lazily.
        """
        if self._lazy_agent is None:
            self._lazy_agent = create_agent()

    async def stream_query(self, input: str = "", message: str = "", **kwargs):
        if self._lazy_agent is None:
            self.set_up()

        prompt = self._extract_prompt(input, message)
        
        # Extract state/tokens from kwargs or input
        state = kwargs.get("state")
        if not state and isinstance(input, dict):
            state = input.get("state")
            
        import asyncio
        import uuid
        from google.adk.runners import Runner
        from google.adk.sessions import InMemorySessionService
        from google.genai import types as genai_types
        
        session_id = str(uuid.uuid4())
        session_service = InMemorySessionService()
        await session_service.create_session(
            app_name="deployed_app", user_id="default_user", session_id=session_id, state=state
        )
        runner = Runner(agent=self._lazy_agent, app_name="deployed_app", session_service=session_service)

        async for event in runner.run_async(
            user_id="default_user",
            session_id=session_id,
            new_message=genai_types.Content(
                role="user",
                parts=[genai_types.Part.from_text(text=prompt)]
            ),
            state_delta=state,
        ):
            if event.content and getattr(event.content, "parts", None):
                text = "".join([part.text for part in event.content.parts if getattr(part, "text", None)])
                if text:
                    yield {
                        "candidates": [
                            {
                                "content": {
                                    "parts": [{"text": text}],
                                    "role": "model"
                                }
                            }
                        ]
                    }

    async def _run_async_impl(self, input: str = "", message: str = "", **kwargs):
        async for chunk in self.stream_query(input, message, **kwargs):
            yield chunk

    async def streaming_agent_run_with_events(self, request_json: str):
        """Streams responses asynchronously from the ADK application (AgentSpace/A2A entrypoint)."""
        if self._lazy_agent is None:
            self.set_up()

        import json
        from google.genai import types as genai_types
        
        req = json.loads(request_json)
        msg_dict = req.get("message")
        prompt = ""
        if msg_dict:
            parts = msg_dict.get("parts", [])
            prompt = "".join([part.get("text", "") for part in parts if part.get("text")])

        # Extract authorizations to build state
        state = {}
        authorizations = req.get("authorizations")
        if authorizations:
            for auth_id, auth_data in authorizations.items():
                access_token = auth_data.get("access_token") or auth_data.get("token")
                if access_token:
                    state[auth_id] = access_token
                    
        # Fallback extraction
        if not state:
            state = req.get("state") or {}

        user_id = req.get("user_id") or req.get("userId") or "default_user"
        session_id = req.get("session_id") or req.get("sessionId") or str(uuid.uuid4())

        import asyncio
        import uuid
        from google.adk.runners import Runner
        from google.adk.sessions import InMemorySessionService
        
        session_service = InMemorySessionService()
        await session_service.create_session(
            app_name="deployed_app", user_id=user_id, session_id=session_id, state=state
        )
        runner = Runner(agent=self._lazy_agent, app_name="deployed_app", session_service=session_service)

        async for event in runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=genai_types.Content(
                role="user",
                parts=[genai_types.Part.from_text(text=prompt)]
            ),
            state_delta=state,
        ):
            event_dict = json.loads(event.model_dump_json(exclude_none=True))
            yield {
                "events": [event_dict],
                "artifacts": [],
                "session_id": session_id
            }

    def get_a2a_discovery_card(self) -> str:
        """
        Exposes the A2A discovery card for Reasoning Engine discovery.
        """
        if self._lazy_agent is None:
            self.set_up()
        import json
        card = {
            "name": self._lazy_agent.name,
            "description": self._lazy_agent.description,
            "url": f"agent-engine://{os.environ.get('GOOGLE_CLOUD_PROJECT')}/{self._lazy_agent.name}",
            "capabilities": { "streaming": True },
            "version": "1.0.0"
        }
        return json.dumps(card)

    def register_operations(self) -> dict[str, list[str]]:
        return {
            "": ["query", "get_a2a_discovery_card"],
            "stream": ["stream_query", "streaming_agent_run_with_events"]
        }

# Define the agent factory
def create_agent():
    return ${agentClass}(
        name=${formatPythonString(config.name)},
        description=${formatPythonString(config.description)},
        model=os.getenv("MODEL", ${formatPythonString(modelName)}),
        instruction=${formatPythonString(finalInstruction)},
        generate_content_config=genai_types.GenerateContentConfig(
            http_options=genai_types.HttpOptions(
                retry_options=genai_types.HttpRetryOptions(initial_delay=1, attempts=2)
            ),${config.enableThinking
      ? `
            **({"thinking_config": thinking_config} if thinking_config else {}),`
      : ""
    }
        ),
        tools=[${toolListForAgent.join(", ")}],
        # planner=BuiltInPlanner() # Default planner
    )

root_agent = create_agent()
`.trim();
};

const generateAppPy = (useRelativeImports: boolean = false): string => {
  return `
import asyncio
import logging
import os

try:
    import nest_asyncio
    nest_asyncio.apply()
except ImportError:
    pass

try:
    from .agent import SyncAgentWrapper
except ImportError:
    from agent import SyncAgentWrapper

logger = logging.getLogger(__name__)

# Wrap for deployment (lazy)
app = SyncAgentWrapper(name="deployed_agent")
`.trim();
};

const generateInitPy = (): string => {
  return `from . import agent
from . import app
`;
};

const generateAdkDeployScript = (config: AdkAgentConfig): string => {
  return `
import os
import logging
import vertexai
from vertexai import agent_engines

try:
    from vertexai.preview import reasoning_engines
except ImportError:
    pass

from app.app import app as app_to_deploy

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Parse .env if it exists
env_vars = []
reqs = []
try:
    req_path = "requirements.txt" if os.path.exists("requirements.txt") else "app/requirements.txt"
    if os.path.exists(req_path):
        with open(req_path, "r") as f:
            reqs = [line.strip() for line in f if line.strip() and not line.startswith("#")]

    env_path = ".env" if os.path.exists(".env") else "app/.env"
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    key = line.split("=")[0].strip()
                    value = line.split("=", 1)[1].strip().strip("\\\"'") if "=" in line else ""
                    os.environ[key] = value
                    # Append strictly non-reserved keys to env_vars list for deployment
                    # We explicitly allow GOOGLE_CLOUD_LOCATION to pass into the container
                    # to specify the model endpoint location (e.g. 'global' for Gemini 3).
                    # WARNING: Vertex AI will reject payloads holding empty string values, so we filter out those cases here.
                    if value and (key not in ["GOOGLE_CLOUD_PROJECT", "STAGING_BUCKET", "PROJECT_ID", "DEPLOYMENT_LOCATION"]
                        and not key.startswith("OTEL_")
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
# where the Agent Engine itself will live (e.g. us-central1). However, we passed 'global'
# into GOOGLE_CLOUD_LOCATION via the .env file so the model uses the global endpoint.
# We MUST use DEPLOYMENT_LOCATION for the SDK init, or fall back to GOOGLE_CLOUD_LOCATION.
location = os.getenv("DEPLOYMENT_LOCATION") or os.getenv("GOOGLE_CLOUD_LOCATION")
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
  const isV2 = config.adkVersion === "2.2";
  const isGemini3 = config.model?.startsWith("gemini-3");
  const modelLocation = isGemini3 ? "global" : location;
  let env = `GOOGLE_CLOUD_PROJECT="${projectNumber}"
GOOGLE_CLOUD_LOCATION="${modelLocation}"
DEPLOYMENT_LOCATION="${location}"
STAGING_BUCKET="${stagingBucket}"
GOOGLE_GENAI_USE_VERTEXAI="true"
ENABLE_A2A="true"`;

  if (config.model) {
    env += `\nMODEL="${config.model}"`;
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

  return env;
};

const generateAdkRequirementsFile = (config: AdkAgentConfig): string => {
  const isV2 = config.adkVersion === "2.2";
  const defaultDeps = isV2
    ? [
      "google-antigravity>=0.1.3",
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
      "mcp",
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

const generateAdkReadmeFile = (config: AdkAgentConfig): string => {
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
\${config.enableCiCd ? (config.ciCdRunner === 'github_actions' ? \`
This agent is configured with GitHub Actions.
1. Create a Workload Identity Pool and Provider in Google Cloud.
2. Grant the service account the required roles (e.g., roles/aiplatform.user, roles/run.developer, roles/iam.workloadIdentityUser).
3. The generated \\\`.github/workflows/deploy.yaml\\\` is pre-configured with your WIF Provider and Service Account.
4. Push to the \\\`main\\\` branch to trigger the pipeline automatically.\` : config.ciCdRunner === 'google_cloud_build' ? \`
This agent is configured with Google Cloud Build.
1. In the Google Cloud Console, navigate to Cloud Build > Triggers.
2. Create a new trigger targeting your repository's \\\`main\\\` branch.
3. Ensure the default Cloud Build Service Account has required permissions to deploy.
4. Push to the \\\`main\\\` branch to trigger the pipeline automatically.\` : 'No CI/CD pipeline enabled.') : 'No CI/CD pipeline enabled.'}
`;
};

interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  config: Partial<AdkAgentConfig>;
}

const GCP_LOGS_READER_TEMPLATE: AgentTemplate = {
  id: "gcp_logs_reader",
  name: "GCP Logs Reader",
  description:
    "An agent that can search Google Cloud Logs, with OAuth and Telemetry enabled.",
  config: {
    name: "GCP_Logs_Reader",
    description: "An expert agent for analyzing Google Cloud Logs.",
    model: "gemini-2.5-flash",
    instruction: `You are a Google Cloud Logging expert. Your goal is to help users find and analyze logs from their GCP projects.

You have access to the "logging_list_log_entries" tool (via Cloud Logging MCP). Use it to query logs.

IMPORTANT:
- The tool name is exactly "logging_list_log_entries".
- ALWAYS specify a "resource_names" argument (e.g., ["projects/YOUR_PROJECT_ID"]).
- Use the "filter" argument to narrow down logs (e.g., severity>=WARNING, resource.type="cloud_run_revision").
- DO NOT write raw Python code (e.g., default_api.logging__list_log_entries) to call this tool. You must invoke the tool via standard JSON function calling. 
- The tool returns raw JSON. Summarize the interesting parts for the user.
- Always verify the project ID before querying.`,
    useGoogleSearch: true,
    enableCloudLoggingMcp: true,
    enableCodeExecution: false,
    enableGraphvizRendering: false,
    enableOAuth: true,
    tools: [],
    customMcpEndpoints: [],
  },
};

const GCP_HEALTH_MONITORING_AGENT_TEMPLATE: AgentTemplate = {
  id: "gcp_health_monitoring_agent",
  name: "GCP Health Monitoring Agent",
  description:
    "An agent that monitors GCP health, identifies issues, and generates reports.",
  config: {
    name: "GCP_Health_Monitor",
    description:
      "An expert agent for diagnosing performance, health, and security issues across Google Cloud capabilities.",
    model: "gemini-2.5-flash",
    instruction: `You are an expert Google Cloud Site Reliability Engineer and Cloud Architect.
Your role is to diagnose performance, health, and security issues across Google Cloud.

Whenever you are asked to check the health or status of an environment or specific service, perform the following general workflow:
1. Verify the Project ID using resourcemanager__search_projects. If a name was provided, ensure it resolves. If no project is provided, ask the user or default to the environment's project if safe.
2. Check Service Health using check_service_health to see if there are any ongoing broader GCP outages affecting the project.
3. List active resources using list_services or resourcemanager__search_projects to understand what is running. Be sure to check list_recent_changes for recent system configurations.
4. Check health signals/alerts using monitoring__list_alerts to see if any configured alert policies are currently firing.
5. Search recent logs using logging__list_log_entries to proactively look for errors.
6. Check for databases using check_database_fleet_health to ensure stateful services are healthy.
7. If a specific service is mentioned, retrieve its recent metrics using monitoring__list_timeseries (CPU, memory, latency, requests) to look for anomalies.
8. Check for active security findings using list_active_findings, as active findings can impact health or compliance.
9. Check for recommendations using list_recommendations and list_cost_recommendations to suggest optimizations.
10. If investigating networking issues, implicitly use run_connectivity_test to diagnose reachability.
11. If you find anomalies or need a deeper GCP-specific architectural investigation, explicitly invoke the investigate_with_cloud_assist tool.

CRITICAL INSTRUCTIONS FOR TOOL EXECUTION:
- You must ALWAYS execute tools using standard, discrete JSON function calling.
- NEVER write script-like or raw Python code (e.g., \`print(default_api.check_service_health())\` or \`print(default_api.....)\`) to execute tools. This is a malformed function call and will crash the agent.
- NEVER try to invoke multiple tools simultaneously in a single raw string block.
- For MCP tools like \`logging__list_log_entries\` and \`resourcemanager__search_projects\`, pass the exact expected arguments (e.g., 'resource_names' as a list).
- DO NOT use Python built-ins like \`datetime\` to format timestamps before calling tools; use literal string formats (e.g., "2024-01-01T00:00:00Z") or explicitly invoke a time-retrieval tool first if one is available.

Report formatting guidelines:
* Format your answers cleanly using Markdown.
* For lists of findings or resources, use bullet points.
* Always cite the exact project ID and environment details where you found the information.`,
    useGoogleSearch: true,
    enableBigQueryMcp: false,
    enableSecurityCommandCenterApi: true,
    enableRecommenderApi: true,
    enableServiceHealthApi: true,
    enableNetworkManagementApi: true,
    enableCloudAssistApi: true,
    enableCloudLoggingMcp: true,
    enableCloudMonitoringMcp: true,
    enableResourceManagerMcp: true,
    enableCloudLoggingApi: false, // Defaulting to MCP for the primary template
    enableCloudMonitoringApi: false,
    enableCloudRunApi: true,
    enableResourceManagerApi: false,
    enableAdminActivityApi: true,
    enableDatabaseFleetApi: true,
    enableOAuth: true,
    enableEmailTool: true,
    enableCodeExecution: true,
    enableGraphvizRendering: false,
    tools: [],
    customMcpEndpoints: [],
  },
};

const GCP_HEALTH_MONITORING_API_TEMPLATE: AgentTemplate = {
  id: "gcp_health_monitoring_agent_api",
  name: "GCP Health Monitoring Agent (API Version)",
  description:
    "An agent that monitors GCP health using stable Python APIs instead of Managed MCP servers.",
  config: {
    name: "GCP_Health_Monitor_API",
    description:
      "An expert agent for diagnosing performance, health, and security issues across Google Cloud capabilities usings stable APIs.",
    model: "gemini-2.5-flash",
    instruction: `You are an expert Google Cloud Site Reliability Engineer and Cloud Architect.
Your role is to diagnose performance, health, and security issues across Google Cloud.

Whenever you are asked to check the health or status of an environment or specific service, perform the following general workflow:
1. Verify the Project ID using resolve_project_id. If a name was provided, ensure it resolves. If no project is provided, ask the user or default to the environment's project if safe.
2. Check Service Health using check_service_health to see if there are any ongoing broader GCP outages affecting the project.
3. List active resources using list_projects or list_services to understand what is running. Be sure to check list_recent_changes for recent system configurations.
4. Check health signals/alerts using check_health to see if any configured alert policies are currently firing.
5. Search recent logs using search_logs to proactively look for errors.
6. Check for databases using check_database_fleet_health to ensure stateful services are healthy.
7. If a specific Cloud Run service is mentioned, retrieve its recent metrics using get_service_metrics (CPU, memory, latency, requests) to look for anomalies.
8. Check for active security findings using list_active_findings, as active findings can impact health or compliance.
9. Check for recommendations using list_recommendations and list_cost_recommendations to suggest optimizations.
10. If investigating networking issues, implicitly use run_connectivity_test to diagnose reachability.
11. If you find anomalies or need a deeper GCP-specific architectural investigation, explicitly invoke the investigate_with_cloud_assist tool.

CRITICAL INSTRUCTIONS FOR TOOL EXECUTION:
- You must ALWAYS execute tools using standard, discrete JSON function calling.
- NEVER write script-like or raw Python code (e.g., \`print(default_api.check_service_health())\` or \`print(default_api.....)\`) to execute tools. This is a malformed function call and will crash the agent.
- NEVER try to invoke multiple tools simultaneously in a single raw string block.
- DO NOT attempt to use Python built-ins like \`datetime\` to calculate variables before calling tools. You must use literal string formats.

Report formatting guidelines:
* Format your answers cleanly using Markdown.
* For lists of findings or resources, use bullet points.
* Always cite the exact project ID and environment details where you found the information.`,
    useGoogleSearch: true,
    enableBigQueryMcp: false,
    enableSecurityCommandCenterApi: true,
    enableRecommenderApi: true,
    enableServiceHealthApi: true,
    enableNetworkManagementApi: true,
    enableCloudAssistApi: true,
    enableCloudLoggingMcp: false, // Disabling MCPs in favor of APIs
    enableCloudMonitoringMcp: false,
    enableResourceManagerMcp: false,
    enableCloudLoggingApi: true,
    enableCloudMonitoringApi: true,
    enableCloudRunApi: true,
    enableResourceManagerApi: true,
    enableAdminActivityApi: true,
    enableDatabaseFleetApi: true,
    enableOAuth: true,
    enableEmailTool: true,
    enableCodeExecution: true,
    enableGraphvizRendering: false,
    tools: [],
    customMcpEndpoints: [],
  },
};

const GCP_BIGQUERY_AGENT_TEMPLATE: AgentTemplate = {
  id: "gcp_bigquery_agent",
  name: "GCP BigQuery Expert Agent",
  description:
    "An agent that leverages BigQuery OneMCP to analyze data, write queries, and explore datasets.",
  config: {
    name: "GCP_BigQuery_Orchestrator",
    description:
      "An orchestrator agent that writes Python to analyze data and create visualizations.",
    model: "gemini-2.5-flash",
    instruction: `You are an expert Google Cloud Data Architect and BigQuery Analyst.
You have access to a BigQuery toolset to interact with datasets and a Google Search tool for external information.
Additionally, you have access to two specialized Python code execution sub-agents:
- \`code_exec_agent\`: A specialized Python Data Science Expert for generating charts, graphs, and plots from data.
- \`architecture_diagram_agent\`: A specialized expert for generating system architectures, flowcharts, and structural diagrams.

When asked to analyze data or create a visualization:
1.  **Explore**: Use the BigQuery tool to list datasets and table schemas if needed.
2.  **Query**: Use the BigQuery tool to execute an optimized Standard SQL query and get the results.
3.  **Choose the Right Tool**:
    - For charts and data plots (bar charts, line graphs, scatter plots): Provide the query results to \`code_exec_agent\` and ask it to generate the requested chart.
4.  **Explain**: Present the insights and explain the visualization to the user.`,
    useGoogleSearch: true,
    enableBigQueryMcp: true,
    enableOAuth: true,
    enableCodeExecution: true,
    enableGraphvizRendering: false,
    tools: [],
    customMcpEndpoints: [],
  },
};
const ARCHITECTURE_AGENT_TEMPLATE: AgentTemplate = {
  id: "architecture_diagram_agent",
  name: "GCP Architecture Diagram Agent",
  description:
    "An expert that designs cloud infrastructure and renders architecture diagrams as code.",
  config: {
    name: "GCP_Architecture_Designer",
    description: "An expert agent for designing cloud architecture diagrams.",
    model: "gemini-2.5-flash",
    instruction: `You are an expert Google Cloud Solutions Architect. You design, critique, and document cloud applications.

Your core capability is designing cloud architecture and visualizing it via Graphviz.

When asked to design or visualize architecture:
1. Reason about the optimal GCP components and their relationships.
2. Outline the structure and data flow clearly.
3. Write a complete Graphviz .dot code block representing the architecture. Keep the formatting clean.
4. IMPORTANT: You MUST pass your generated .dot code directly to the \`render_graphviz\` tool. Do not try to output the raw .dot code block or mermaid code blocks to the user yourself.
5. The tool will return a final message (either a public Markdown image string or a localized text notification). You must include that exact message verbatim in your final response to the user. Do not invent your own image URLs.

When analyzing existing designs: Provide constructive feedback on reliability, scalability, security, and cost.`,
    useGoogleSearch: true,
    enableCodeExecution: false,
    enableGraphvizRendering: true,
    enableThinking: true,
    thinkingBudget: 1024,
    thinkingLevel: "HIGH",
    enableNetworkManagementApi: true,
    enableComputeEngineMcp: true,
    enableResourceManagerMcp: true,
    enableCloudRunApi: true,
    enableGkeMcp: true,
    enableCloudSqlMcp: true,
    enableEmailTool: true,
    enableOAuth: true,
    tools: [],
    customMcpEndpoints: [],
  },
};

const TEMPLATES: AgentTemplate[] = [
  GCP_LOGS_READER_TEMPLATE,
  GCP_HEALTH_MONITORING_AGENT_TEMPLATE,
  GCP_HEALTH_MONITORING_API_TEMPLATE,
  GCP_BIGQUERY_AGENT_TEMPLATE,
  ARCHITECTURE_AGENT_TEMPLATE,
];

interface AgentBuilderPageProps {
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
  context?: any;
  onBuildTriggered?: (buildId: string, projectId?: string) => void;
}

const AgentBuilderPage: React.FC<AgentBuilderPageProps> = ({
  projectNumber,
  setProjectNumber,
  context,
  onBuildTriggered,
}) => {
  const [builderTab, setBuilderTab] = useState<"a2a" | "adk">("adk");

  // --- A2A State ---
  const [a2aConfig, setA2aConfig] = useState<A2aConfig>({
    serviceName: "my-a2a-function",
    displayName: "My A2A Function",
    providerOrganization: "My Company",
    model: "gemini-2.5-flash",
    region: "us-central1",
    memory: "1Gi",
    instruction:
      "You are a helpful assistant that responds to user queries directly and concisely.",
    allowUnauthenticated: true,
    enableCors: true,
    useGoogleSearch: false,
    tools: [],
  });

  const [deployProjectId, setDeployProjectId] = useState(projectNumber);
  const [isResolvingId, setIsResolvingId] = useState(false);

  const [a2aGeneratedCode, setA2aGeneratedCode] = useState({
    main: "",
    dockerfile: "",
    requirements: "",
    gcloud: "",
    yaml: "",
  });

  const [a2aActiveTab, setA2aActiveTab] = useState<
    "main" | "dockerfile" | "requirements" | "env"
  >("main");
  const [a2aCopySuccess, setA2aCopySuccess] = useState("");
  const [isFixMode, setIsFixMode] = useState(false);
  const [isA2aDeployModalOpen, setIsA2aDeployModalOpen] = useState(false);
  const [isGithubModalOpen, setIsGithubModalOpen] = useState(false);
  const [showWifInstructions, setShowWifInstructions] = useState(false);

  // --- ADK State ---
  const [adkConfig, setAdkConfig] = useState<AdkAgentConfig>({
    adkVersion: "1.35.1",
    name: "",
    description: "An agent that can do awesome things.",
    model: "gemini-2.5-flash",
    instruction: "You are an awesome and helpful agent.",
    tools: [],
    useGoogleSearch: false,
    enableOAuth: false,
    authId: "temp_oauth",
    allowAdcFallback: true,
    enableDiscoveryApi: false,
    discoveryConfig: {
      projectId: "",
      location: "global",
      collection: "default_collection",
      engineId: "",
      dataStoreIds: "",
    },
    enableBqAnalytics: false,
    bqDatasetId: "",
    bqTableId: "",
    enableThinking: false,
    thinkingBudget: 1024,
    thinkingLevel: "HIGH",
    enableStreaming: false,
    enableBigQueryMcp: false,
    enableCodeExecution: false,
    enableGraphvizRendering: false,
    enableEmailTool: false,
    enableSecurityCommandCenterApi: false,
    enableRecommenderApi: false,
    enableServiceHealthApi: false,
    enableNetworkManagementApi: false,
    enableCloudAssistApi: false,
    enableTelemetry: true,
    enableMessageLogging: false,
    enableCloudLoggingApi: false,
    enableCloudMonitoringApi: false,
    enableCloudRunApi: false,
    enableResourceManagerApi: false,
    enableAdminActivityApi: false,
    enableDatabaseFleetApi: false,
    enableCloudLoggingMcp: false,
    enableBigtableAdminMcp: false,
    enableCloudSqlMcp: false,
    enableCloudMonitoringMcp: false,
    enableComputeEngineMcp: false,
    enableFirestoreMcp: false,
    enableGkeMcp: false,
    enableResourceManagerMcp: false,
    enableSpannerMcp: false,
    enableDeveloperKnowledgeMcp: false,
    enableMapsGroundingMcp: false,
    enableEvaluation: false,
    enableCiCd: false,
    ciCdRunner: "none",
    deploymentTarget: "agent_engine",
    githubWifProvider: "",
    githubServiceAccount: "",
    customMcpEndpoints: [],
  });

  // IAM & WIF State
  const [serviceAccounts, setServiceAccounts] = useState<any[]>([]);
  const [wifProviders, setWifProviders] = useState<any[]>([]);
  const [validationStatus, setValidationStatus] = useState<
    "unchecked" | "testing" | "valid" | "invalid"
  >("unchecked");
  const [validationMessage, setValidationMessage] = useState("");

  const [vertexLocation, setVertexLocation] = useState("us-central1");
  const [adkGeneratedCode, setAdkGeneratedCode] = useState({
    app: "",
    agent: "",
    env: "",
    requirements: "",
    readme: "",
    deploy_re: "",
    auth: "",
    tools: "",
    init: "",
  });
  const [adkActiveTab, setAdkActiveTab] = useState<
    | "app"
    | "agent"
    | "env"
    | "requirements"
    | "readme"
    | "deploy_re"
    | "auth"
    | "tools"
    | "init"
  >("app");
  const [adkCopySuccess, setAdkCopySuccess] = useState("");

  // Discovery Engine State
  const [collections, setCollections] = useState<any[]>([]);
  const [engines, setEngines] = useState<any[]>([]);
  const [isDiscoveryLoading, setIsDiscoveryLoading] = useState(false);

  // Authorizations State for Dropdown Select
  const [authorizations, setAuthorizations] = useState<any[]>([]);
  const [isLoadingAuths, setIsLoadingAuths] = useState(false);
  const [authInputMode, setAuthInputMode] = useState<"manual" | "select">(
    "manual",
  );

  // Fetch Collections when project/location changes
  useEffect(() => {
    if (
      !adkConfig.enableDiscoveryApi ||
      (!adkConfig.discoveryConfig.projectId && !projectNumber)
    )
      return;
    if (!adkConfig.discoveryConfig.location) return;

    const fetchCollections = async () => {
      setIsDiscoveryLoading(true);
      try {
        const targetProject =
          adkConfig.discoveryConfig.projectId || projectNumber;
        const tempConfig: any = {
          projectId: targetProject,
          appLocation: adkConfig.discoveryConfig.location,
        };

        const res = await api.listResources("collections", tempConfig);
        setCollections(res.collections || []);
      } catch (e) {
        console.error("Failed to fetch collections", e);
      } finally {
        setIsDiscoveryLoading(false);
      }
    };
    fetchCollections();
  }, [
    adkConfig.enableDiscoveryApi,
    adkConfig.discoveryConfig.projectId,
    adkConfig.discoveryConfig.location,
    projectNumber,
  ]);

  // Fetch Engines when Collection changes
  useEffect(() => {
    if (!adkConfig.enableDiscoveryApi || !adkConfig.discoveryConfig.collection)
      return;

    const fetchEngines = async () => {
      setIsDiscoveryLoading(true);
      try {
        const targetProject =
          adkConfig.discoveryConfig.projectId || projectNumber;
        const tempConfig: any = {
          projectId: targetProject,
          appLocation: adkConfig.discoveryConfig.location,
          collectionId: adkConfig.discoveryConfig.collection,
        };
        const res = await api.listResources("engines", tempConfig);
        setEngines(res.engines || []);
      } catch (e) {
        console.error("Failed to fetch engines", e);
      } finally {
        setIsDiscoveryLoading(false);
      }
    };
    fetchEngines();
  }, [
    adkConfig.enableDiscoveryApi,
    adkConfig.discoveryConfig.collection,
    adkConfig.discoveryConfig.projectId,
    adkConfig.discoveryConfig.location,
    projectNumber,
  ]);

  // Data Store Tool State
  const [toolBuilderConfig, setToolBuilderConfig] = useState({
    dataStoreId: "",
  });
  const [dataStores, setDataStores] = useState<
    (DataStore & { location: string })[]
  >([]);
  const [isLoadingDataStores, setIsLoadingDataStores] = useState(false);
  const [dataStoreSearchTerm, setDataStoreSearchTerm] = useState("");

  // Staging Bucket State
  const [stagingBucket, setStagingBucket] = useState("");
  const [buckets, setBuckets] = useState<GcsBucket[]>([]);
  const [isLoadingBuckets, setIsLoadingBuckets] = useState(false);

  // A2A Tool State
  const [cloudRunServices, setCloudRunServices] = useState<CloudRunService[]>(
    [],
  );
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [selectedA2aService, setSelectedA2aService] = useState("");
  const [a2aSearchTerm, setA2aSearchTerm] = useState("");

  const [isAdkDeployModalOpen, setIsAdkDeployModalOpen] = useState(false);
  const [rewritingField, setRewritingField] = useState<string | null>(null);

  // Deployment Progress State
  const [buildId, setBuildId] = useState<string | null>(null);
  const [isBuildVisible, setIsBuildVisible] = useState(false);
  const [customMcpStatus, setCustomMcpStatus] = useState<{
    [key: number]: { loading: boolean; tools?: any[]; error?: string };
  }>({});

  // CI/CD IAM Data
  useEffect(() => {
    const fetchIamData = async () => {
      if (!projectNumber || !adkConfig.enableCiCd) return;
      try {
        const accounts = await api.listServiceAccounts(projectNumber);
        setServiceAccounts(accounts);

        const pools = await api.listWorkloadIdentityPools(projectNumber);
        let allProviders: any[] = [];
        for (const pool of pools) {
          const providers = await api.listWorkloadIdentityProviders(
            pool.name,
            projectNumber,
          );
          allProviders = allProviders.concat(providers);
        }
        setWifProviders(allProviders);
      } catch (e) {
        console.error("Failed to fetch IAM data:", e);
      }
    };
    fetchIamData();
  }, [projectNumber, adkConfig.enableCiCd]);

  useEffect(() => {
    const validateWif = async () => {
      if (
        !adkConfig.githubServiceAccount ||
        !adkConfig.githubWifProvider ||
        !projectNumber
      ) {
        setValidationStatus("unchecked");
        return;
      }
      setValidationStatus("testing");
      try {
        const policy = await api.getServiceAccountIamPolicy(
          adkConfig.githubServiceAccount,
          projectNumber,
        );
        const bindings = policy.bindings || [];
        let hasBinding = false;
        for (const binding of bindings) {
          if (binding.role === "roles/iam.workloadIdentityUser") {
            const poolName =
              adkConfig.githubWifProvider.split("/providers/")[0];
            if (
              binding.members &&
              binding.members.some((m: string) => m.includes(poolName))
            ) {
              hasBinding = true;
              break;
            }
          }
        }
        if (hasBinding) {
          setValidationStatus("valid");
          setValidationMessage(
            "Service Account is correctly bound to the related WIF Pool.",
          );
        } else {
          setValidationStatus("invalid");
          setValidationMessage(
            "Service Account is missing roles/iam.workloadIdentityUser binding for this WIF Provider / Pool.",
          );
        }
      } catch (e: any) {
        setValidationStatus("invalid");
        if (e.message && e.message.includes("permission")) {
          setValidationMessage(
            "Permission denied to read Service Account IAM policy.",
          );
        } else {
          setValidationMessage("Failed to validate IAM policy.");
        }
      }
    };
    const timeoutId = setTimeout(validateWif, 300);
    return () => clearTimeout(timeoutId);
  }, [
    adkConfig.githubServiceAccount,
    adkConfig.githubWifProvider,
    projectNumber,
  ]);

  // --- Common Logic ---
  const fetchProjectId = async () => {
    if (!projectNumber) return;
    setIsResolvingId(true);
    try {
      const project = await api.getProject(projectNumber);
      if (project.projectId) {
        setDeployProjectId(project.projectId);
      }
    } catch (e) {
      console.warn("Could not auto-resolve Project ID from Number:", e);
    } finally {
      setIsResolvingId(false);
    }
  };

  useEffect(() => {
    setDeployProjectId(projectNumber);
    fetchProjectId();
  }, [projectNumber]);

  // Handle Fix Mode context
  useEffect(() => {
    if (context && context.serviceToEdit) {
      setBuilderTab("a2a");
      setIsFixMode(true);
      const service: CloudRunService = context.serviceToEdit;
      const container = service.template?.containers?.[0];
      const envVars = container?.env || [];
      const getEnv = (key: string) =>
        envVars.find((e) => e.name === key)?.value || "";

      setA2aConfig((prev) => ({
        ...prev,
        serviceName: service.name.split("/").pop() || prev.serviceName,
        region: service.location || prev.region,
        displayName: getEnv("AGENT_DISPLAY_NAME") || prev.displayName,
        providerOrganization:
          getEnv("PROVIDER_ORGANIZATION") || prev.providerOrganization,
        model: getEnv("MODEL") || prev.model,
        instruction: getEnv("AGENT_DESCRIPTION") || prev.instruction,
      }));
    }
  }, [context]);

  // A2A Code Generation
  useEffect(() => {
    setA2aGeneratedCode({
      main: generateMainPy(a2aConfig),
      dockerfile: generateDockerfile(adkConfig),
      requirements: generateRequirementsTxt(),
      gcloud: generateGcloudCommand(a2aConfig, deployProjectId),
      yaml: generateA2aEnvYaml(a2aConfig, deployProjectId),
    });
  }, [a2aConfig, deployProjectId]);

  // ADK Code Generation
  useEffect(() => {
    const agentCode = generateAdkPythonCode(adkConfig, true);
    const envCode = generateAdkEnvFile(
      adkConfig,
      projectNumber,
      vertexLocation,
      stagingBucket,
    );
    const reqsCode = generateAdkRequirementsFile(adkConfig);
    const readmeCode = generateAdkReadmeFile(adkConfig);
    const deployCode = generateAdkDeployScript(adkConfig);
    const authCode = generateAuthPy(adkConfig, adkConfig.allowAdcFallback);
    const toolsCode = generateToolsPy(adkConfig, true);
    const initCode = generateInitPy();
    setAdkGeneratedCode({
      app: generateAppPy(true),
      agent: agentCode,
      env: envCode,
      requirements: reqsCode,
      readme: readmeCode,
      deploy_re: deployCode,
      auth: authCode,
      tools: toolsCode,
      init: initCode,
    });
  }, [adkConfig, projectNumber, vertexLocation, stagingBucket]);

  // ADK Data Store & Buckets Fetching
  const apiConfig = useMemo(
    () => ({
      projectId: projectNumber,
      appLocation: "global",
      collectionId: "",
      appId: "",
      assistantId: "",
    }),
    [projectNumber],
  );

  useEffect(() => {
    if (!projectNumber) return;

    const fetchData = async () => {
      setIsLoadingDataStores(true);
      setDataStores([]);

      const locations = ["global", "us", "eu"];
      const dsResults: (DataStore & { location: string })[] = [];

      await Promise.all(
        locations.map(async (loc) => {
          const dsConfig = {
            projectId: projectNumber,
            appLocation: loc,
            collectionId: "default_collection",
            appId: "",
            assistantId: "",
          };
          try {
            const res = await api.listResources("dataStores", dsConfig);
            if (res.dataStores) {
              res.dataStores.forEach((ds: any) =>
                dsResults.push({ ...ds, location: loc }),
              );
            }
          } catch (e) { }
        }),
      );

      setDataStores(dsResults);
      if (dsResults.length === 1 && !toolBuilderConfig.dataStoreId) {
        setToolBuilderConfig((prev) => ({
          ...prev,
          dataStoreId: dsResults[0].name,
        }));
      }
      setIsLoadingDataStores(false);

      setIsLoadingServices(true);
      setCloudRunServices([]);
      const regions = ["us-central1", "us-east1", "europe-west1", "asia-east1"];
      const services: CloudRunService[] = [];

      await Promise.all(
        regions.map(async (region) => {
          try {
            const res = await api.listCloudRunServices(
              { projectId: projectNumber } as any,
              region,
            );
            if (res.services) services.push(...res.services);
          } catch (e) { }
        }),
      );

      const a2a = services.filter((s) => {
        const envVars = s.template?.containers?.[0]?.env || [];
        const getEnv = (name: string) =>
          envVars.find((e) => e.name === name)?.value;
        return !!(
          getEnv("AGENT_URL") ||
          getEnv("PROVIDER_ORGANIZATION") ||
          s.name.toLowerCase().includes("a2a")
        );
      });

      setCloudRunServices(a2a);
      setIsLoadingServices(false);

      // Fetch Buckets
      setIsLoadingBuckets(true);
      try {
        // We need to resolve the project string first if currently a number,
        // but here we just try api.listBuckets which likely expects an ID string or number.
        // Best effort:
        const b = await api.listBuckets(projectNumber);
        const items = b.items || [];
        setBuckets(items);
        if (items.length > 0 && !stagingBucket) {
          setStagingBucket(`gs://${items[0].name}`);
        }
      } catch (e) {
        console.error("Failed to fetch buckets", e);
      } finally {
        setIsLoadingBuckets(false);
      }

      // Fetch Authorizations for Dropdown Select
      setIsLoadingAuths(true);
      setAuthorizations([]);
      try {
        const response = await api.listAuthorizations(apiConfig);
        const auths = response.authorizations || [];
        setAuthorizations(auths);
        if (auths.length > 0) {
          setAuthInputMode("select");
        } else {
          setAuthInputMode("manual");
        }
      } catch (e) {
        console.warn("Failed to fetch authorizations", e);
        setAuthInputMode("manual");
      } finally {
        setIsLoadingAuths(false);
      }
    };

    fetchData();
  }, [projectNumber, apiConfig]);

  // --- Handlers ---
  const handleA2aConfigChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      setA2aConfig((prev) => ({
        ...prev,
        [name]: (e.target as HTMLInputElement).checked,
      }));
    } else if (name === "serviceName") {
      const sanitizedValue = value
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .substring(0, 63);
      setA2aConfig((prev) => ({ ...prev, [name]: sanitizedValue }));
    } else {
      setA2aConfig((prev) => ({ ...prev, [name]: value as any }));
    }
  };

  const handleAdkConfigChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value, type } = e.target;
    if (name.startsWith("discovery.")) {
      const field = name.split(".")[1];
      setAdkConfig((prev) => ({
        ...prev,
        discoveryConfig: {
          ...prev.discoveryConfig,
          [field]: value,
        },
      }));
    } else if (type === "checkbox") {
      const isChecked = (e.target as HTMLInputElement).checked;

      setAdkConfig((prev) => {
        const updates: any = { [name]: isChecked };

        // Link MCPs, APIs, and Plugins to OAuth
        if (
          (name.endsWith("Mcp") ||
            name.endsWith("Api") ||
            name === "enableEmailTool" ||
            name === "enableBqAnalytics") &&
          isChecked
        ) {
          updates.enableOAuth = true;
        }

        // Enforce mutual exclusivity between API and MCP counterparts
        if (isChecked) {
          if (name.endsWith("Mcp")) {
            const apiCounterpart = name.replace("Mcp", "Api");
            if (apiCounterpart in prev) {
              updates[apiCounterpart] = false;
            }
          } else if (name.endsWith("Api")) {
            const mcpCounterpart = name.replace("Api", "Mcp");
            if (mcpCounterpart in prev) {
              updates[mcpCounterpart] = false;
            }
          }
        }

        return { ...prev, ...updates };
      });
    } else if (name === "name") {
      const sanitizedValue = value
        .replace(/\s+/g, "_")
        .replace(/[^a-zA-Z0-9_-]/g, "");
      setAdkConfig((prev) => ({ ...prev, [name]: sanitizedValue }));
    } else {
      setAdkConfig((prev) => ({ ...prev, [name]: value as any }));
    }
  };

  const handleAddTool = (tool: AgentTool) => {
    if (builderTab === "a2a") {
      setA2aConfig((prev) => ({ ...prev, tools: [...prev.tools, tool] }));
    } else {
      setAdkConfig((prev) => ({
        ...prev,
        tools: [...prev.tools, tool],
        enableOAuth: true,
      }));
    }
  };

  const handleRemoveTool = (index: number) => {
    if (builderTab === "a2a") {
      setA2aConfig((prev) => ({
        ...prev,
        tools: prev.tools.filter((_, i) => i !== index),
      }));
    } else {
      setAdkConfig((prev) => ({
        ...prev,
        tools: prev.tools.filter((_, i) => i !== index),
      }));
    }
  };

  const handleAddCustomMcp = () => {
    setAdkConfig((prev) => ({
      ...prev,
      customMcpEndpoints: [...prev.customMcpEndpoints, { name: "", url: "" }],
    }));
  };

  const handleUpdateCustomMcp = (
    index: number,
    field: "name" | "url",
    value: string,
  ) => {
    setAdkConfig((prev) => {
      const newEndpoints = [...prev.customMcpEndpoints];
      newEndpoints[index] = { ...newEndpoints[index], [field]: value };
      return { ...prev, customMcpEndpoints: newEndpoints };
    });
  };

  const handleRemoveCustomMcp = (index: number) => {
    setAdkConfig((prev) => ({
      ...prev,
      customMcpEndpoints: prev.customMcpEndpoints.filter((_, i) => i !== index),
    }));
  };

  const handleVerifyCustomMcp = async (index: number, url: string) => {
    if (!url) return;
    setCustomMcpStatus((prev) => ({ ...prev, [index]: { loading: true } }));
    try {
      const tools = await api.listMcpTools(deployProjectId || "", url);
      setCustomMcpStatus((prev) => ({
        ...prev,
        [index]: { loading: false, tools },
      }));
    } catch (e: any) {
      console.error("Failed to verify custom MCP:", e);
      setCustomMcpStatus((prev) => ({
        ...prev,
        [index]: { loading: false, error: e.message || String(e) },
      }));
    }
  };

  const handleRewrite = async (field: "instruction") => {
    setRewritingField(field);

    const currentInstruction =
      builderTab === "a2a" ? a2aConfig.instruction : adkConfig.instruction;

    let toolNames = "";
    if (builderTab === "a2a") {
      toolNames =
        a2aConfig.tools
          .map((t) => t.displayName || t.variableName)
          .join(", ") || "None";
    } else {
      const adkTools = [
        ...adkConfig.tools.map((t) => t.displayName || t.variableName),
      ];
      if (adkConfig.useGoogleSearch) adkTools.push("Google Search");
      if (adkConfig.enableCodeExecution)
        adkTools.push("Code Execution Sub-Agent");
      if (adkConfig.enableGraphvizRendering) adkTools.push("Graphviz Renderer");
      if (adkConfig.enableBigQueryMcp) adkTools.push("BigQuery MCP");
      if (adkConfig.enableCloudLoggingMcp) adkTools.push("Cloud Logging MCP");
      if (adkConfig.enableCloudSqlMcp) adkTools.push("Cloud SQL MCP");
      if (adkConfig.customMcpEndpoints.length > 0)
        adkTools.push(...adkConfig.customMcpEndpoints.map((e) => e.name));
      toolNames = adkTools.join(", ") || "None";
    }

    const prompt = `You are an expert prompt engineer. Your task is to rewrite the following system instruction to be highly effective for a Large Language Model (LLM).
        Structure the rewritten prompt clearly.
        Add necessary context and details to make the agent robust while preserving the user's original intent.
        The agent has access to the following tools: [${toolNames}]. Ensure the instructions explicitly guide the agent on when and how to use these tools effectively.
        Output ONLY the rewritten system instruction.
        
        Original Instruction: "${currentInstruction}"`;

    try {
      const text = await api.generateVertexContent(
        apiConfig,
        prompt,
        "gemini-2.5-flash",
        8192,
      );
      const rewrittenText = text
        .trim()
        .replace(/^["']|["']$/g, "")
        .replace(/^```\w*\n?|\n?```$/g, "")
        .trim();
      if (builderTab === "a2a") {
        setA2aConfig((prev) => ({ ...prev, instruction: rewrittenText }));
      } else {
        setAdkConfig((prev) => ({ ...prev, instruction: rewrittenText }));
      }
    } catch (err: any) {
      alert(`AI rewrite failed: ${err.message}`);
    } finally {
      setRewritingField(null);
    }
  };

  const handleCopy = (
    content: string,
    setSuccess: React.Dispatch<React.SetStateAction<string>>,
  ) => {
    navigator.clipboard.writeText(content).then(() => {
      setSuccess("Copied!");
      setTimeout(() => setSuccess(""), 2000);
    });
  };

  const handleDownloadA2a = async () => {
    const zip = new JSZip();
    zip.file("main.py", a2aGeneratedCode.main);
    zip.file("Dockerfile", a2aGeneratedCode.dockerfile);
    zip.file("requirements.txt", a2aGeneratedCode.requirements);
    zip.file("deploy.sh", a2aGeneratedCode.gcloud);
    zip.file("env.yaml", a2aGeneratedCode.yaml);
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${a2aConfig.serviceName}-source.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadAdkZip = () => {
    const zip = new JSZip();

    // App Directory
    const appFolder = zip.folder("app");
    appFolder.file("app.py", generateAppPy(true));
    appFolder.file("agent.py", generateAdkPythonCode(adkConfig, true));
    appFolder.file("requirements.txt", adkGeneratedCode.requirements);
    appFolder.file("auth.py", adkGeneratedCode.auth);
    appFolder.file("tools.py", generateToolsPy(adkConfig, true));
    appFolder.file("__init__.py", adkGeneratedCode.init);
    appFolder.file("deploy_re.py", generateAdkDeployScript(adkConfig)); // Keep deploy_re in app for now as per some patterns, or move to deployment

    // Root Files
    zip.file(
      "agent.py",
      "import os, sys\nsys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))\nfrom app.agent import root_agent\n",
    );
    zip.file(".env", adkGeneratedCode.env);
    zip.file("README.md", generateAdkReadmeFile(adkConfig));
    zip.file("DESIGN_SPEC.md", generateDesignSpec(adkConfig));
    zip.file("Makefile", generateMakefile(adkConfig));

    // Tests Directory
    const testsFolder = zip.folder("tests");
    const evalFolder = testsFolder.folder("eval");
    evalFolder.file("test_config.json", generateTestConfigJson(adkConfig));
    const evalsetsFolder = evalFolder.folder("evalsets");
    evalsetsFolder.file("basic.evalset.json", generateEvalSetJson(adkConfig));

    // Deployment Directory
    const deployFolder = zip.folder("deployment");
    deployFolder.file("terraform/main.tf", "# Terraform config placeholder");

    // Scripts Directory
    const scriptsFolder = zip.folder("scripts");
    scriptsFolder.file("launch_local.sh", generateLaunchScript(adkConfig));

    if (adkConfig.ciCdRunner === "google_cloud_build") {
      zip.file(
        "cloudbuild.yaml",
        generateCloudBuildYaml(adkConfig, deployProjectId || "YOUR_PROJECT_ID"),
      );
    } else if (adkConfig.ciCdRunner === "github_actions") {
      const githubFolder = zip.folder(".github");
      const workflowsFolder = githubFolder.folder("workflows");
      workflowsFolder.file("deploy.yaml", generateGithubWorkflow(adkConfig));
    }

    zip.generateAsync({ type: "blob" }).then(function (content) {
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${adkConfig.name || "adk_agent"}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  };

  const adkCodeDisplay = {
    app: adkGeneratedCode.app,
    agent: adkGeneratedCode.agent,
    env: adkGeneratedCode.env,
    requirements: adkGeneratedCode.requirements,
    auth: adkGeneratedCode.auth,
    tools: adkGeneratedCode.tools,
    init: adkGeneratedCode.init,
    makefile: generateMakefile(adkConfig),
    cloudbuild: generateCloudBuildYaml(
      adkConfig,
      deployProjectId || "YOUR_PROJECT_ID",
    ),
    github_deploy: generateGithubWorkflow(adkConfig),
  }[adkActiveTab];

  const a2aCodeDisplay = {
    main: a2aGeneratedCode.main,
    dockerfile: a2aGeneratedCode.dockerfile,
    requirements: a2aGeneratedCode.requirements,
    env: a2aGeneratedCode.yaml,
  }[a2aActiveTab];

  const adkFilesForBuild = [
    { name: "app.py", content: adkGeneratedCode.app },
    { name: "agent.py", content: adkGeneratedCode.agent },
    { name: ".env", content: adkGeneratedCode.env },
    { name: "requirements.txt", content: adkGeneratedCode.requirements },
    { name: "auth.py", content: adkGeneratedCode.auth },
    { name: "tools.py", content: adkGeneratedCode.tools },
  ];

  const a2aFilesForBuild = [
    { name: "main.py", content: a2aGeneratedCode.main },
    { name: "Dockerfile", content: a2aGeneratedCode.dockerfile },
    { name: "requirements.txt", content: a2aGeneratedCode.requirements },
    { name: "deploy.sh", content: a2aGeneratedCode.gcloud },
    { name: "env.yaml", content: a2aGeneratedCode.yaml },
  ];

  const handleBuildTriggered = (id: string) => {
    // Use Global Handler
    const pid = deployProjectId || projectNumber;
    if (onBuildTriggered) onBuildTriggered(id, pid);

    setIsA2aDeployModalOpen(false);
    setIsAdkDeployModalOpen(false);
  };

  const handleCheckBuildStatus = async () => {
    if (!deployProjectId && !projectNumber) {
      alert("Project ID not set.");
      return;
    }
    const pid = deployProjectId || projectNumber;
    let foundAny = false;

    try {
      // Check for running builds first
      const running = await api.listCloudBuilds(pid, 'status="WORKING"');
      if (running.builds && running.builds.length > 0) {
        console.log(
          `handleCheckBuildStatus: FOUND ${running.builds.length} WORKING builds`,
        );
        running.builds.forEach((b: any) => {
          if (onBuildTriggered) onBuildTriggered(b.id, pid);
        });
        foundAny = true;
      }

      // Check for queued builds
      const queued = await api.listCloudBuilds(pid, 'status="QUEUED"');
      if (queued.builds && queued.builds.length > 0) {
        console.log(
          `handleCheckBuildStatus: FOUND ${queued.builds.length} QUEUED builds`,
        );
        queued.builds.forEach((b: any) => {
          if (onBuildTriggered) onBuildTriggered(b.id, pid);
        });
        foundAny = true;
      }

      // Fallback: Fetch latest if nothing active found yet
      if (!foundAny) {
        console.log(
          "No active (WORKING/QUEUED) builds. Fetching recent history...",
        );
        const recent = await api.listCloudBuilds(pid);
        const build = recent.builds?.[0];

        if (build) {
          console.log(
            "handleCheckBuildStatus: FOUND recent build:",
            build.id,
            build.status,
          );
          if (onBuildTriggered) onBuildTriggered(build.id, pid);
          foundAny = true;
        }
      }

      if (!foundAny) {
        alert("No active or queued builds found.");
      }
    } catch (e: any) {
      alert(`Failed to check builds: ${e.message}`);
    }
  };

  const ADK_TABS = [
    { id: "app", label: "app.py" },
    { id: "agent", label: "agent.py" },
    { id: "env", label: ".env" },
    { id: "requirements", label: "requirements.txt" },
    { id: "auth", label: "auth.py" },
    { id: "tools", label: "tools.py" },
    { id: "init", label: "__init__.py" },
    { id: "makefile", label: "Makefile" },
    ...(adkConfig.enableCiCd && adkConfig.ciCdRunner === "google_cloud_build"
      ? [{ id: "cloudbuild", label: "cloudbuild.yaml" }]
      : []),
    ...(adkConfig.enableCiCd && adkConfig.ciCdRunner === "github_actions"
      ? [{ id: "github_deploy", label: "deploy.yaml" }]
      : []),
  ];

  const A2A_TABS = [
    { id: "main", label: "main.py" },
    { id: "dockerfile", label: "Dockerfile" },
    { id: "requirements", label: "requirements.txt" },
    { id: "env", label: "env.yaml" },
  ];

  // Map generated ADK code into the format expected by the GitHub API
  const githubDeploymentFiles = [
    { path: "app/app.py", content: adkGeneratedCode.app },
    { path: "app/agent.py", content: adkGeneratedCode.agent },
    { path: "app/.env", content: adkGeneratedCode.env },
    { path: "app/requirements.txt", content: adkGeneratedCode.requirements },
    { path: "app/__init__.py", content: adkGeneratedCode.init },
    { path: "app/deploy_re.py", content: adkGeneratedCode.deploy_re },
    { path: "Makefile", content: generateMakefile(adkConfig) },
    { path: "README.md", content: adkGeneratedCode.readme },
    { path: "tests/eval/test_config.json", content: generateTestConfig() },
    {
      path: "tests/eval/evalsets/basic.evalset.json",
      content: generateEvalSet(),
    },
  ];

  if (adkConfig.enableOAuth) {
    githubDeploymentFiles.push({
      path: "app/auth.py",
      content: adkGeneratedCode.auth,
    });
  }

  if (
    adkConfig.tools.length > 0 ||
    adkConfig.useGoogleSearch ||
    adkConfig.enableEmailTool ||
    adkConfig.enableSecurityCommandCenterApi ||
    adkConfig.enableRecommenderApi ||
    adkConfig.enableServiceHealthApi ||
    adkConfig.enableNetworkManagementApi ||
    adkConfig.enableCloudLoggingApi ||
    adkConfig.enableCloudMonitoringApi ||
    adkConfig.enableCloudRunApi ||
    adkConfig.enableResourceManagerApi ||
    adkConfig.enableAdminActivityApi ||
    adkConfig.enableDatabaseFleetApi ||
    adkConfig.enableCloudAssistApi
  ) {
    githubDeploymentFiles.push({
      path: "app/tools.py",
      content: adkGeneratedCode.tools,
    });
  }

  // Always push the GitHub actions deploy config if they enabled GitHub CI/CD here!
  if (adkConfig.enableCiCd && adkConfig.ciCdRunner === "github_actions") {
    githubDeploymentFiles.push({
      path: ".github/workflows/deploy.yaml",
      content: generateGithubWorkflow(adkConfig),
    });
  }

  return (
    <div className="space-y-6 flex flex-col lg:h-full">
      <div className="flex justify-between items-center shrink-0">
        <h1 className="text-2xl font-bold text-white">Agent Builder</h1>
        <div className="bg-gray-800 p-1 rounded-lg border border-gray-700">
          <button
            onClick={() => setBuilderTab("adk")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${builderTab === "adk" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
          >
            ADK Agent (Engine)
          </button>
          <button
            onClick={() => setBuilderTab("a2a")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${builderTab === "a2a" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
          >
            A2A Function (Cloud Run)
          </button>
        </div>

        <button
          onClick={handleCheckBuildStatus}
          className="ml-4 px-3 py-1 bg-gray-700 hover:bg-gray-600 text-xs text-gray-300 rounded border border-gray-600"
          title="Check for active builds if status window is missing"
        >
          Check Build Status
        </button>
      </div>

      {/* Deploy Modals */}
      <AgentDeploymentModal
        isOpen={isAdkDeployModalOpen}
        onClose={() => setIsAdkDeployModalOpen(false)}
        agentName={adkConfig.name || "my-agent"}
        files={adkFilesForBuild}
        projectNumber={projectNumber}
        onBuildTriggered={handleBuildTriggered}
        initialBucket={
          stagingBucket ? stagingBucket.replace("gs://", "") : undefined
        }
      />
      <A2aDeployModal
        isOpen={isA2aDeployModalOpen}
        onClose={() => setIsA2aDeployModalOpen(false)}
        projectNumber={projectNumber}
        serviceName={a2aConfig.serviceName}
        region={a2aConfig.region}
        files={a2aFilesForBuild}
        onBuildTriggered={handleBuildTriggered}
      />

      <GitHubDeployModal
        isOpen={isGithubModalOpen}
        onClose={() => setIsGithubModalOpen(false)}
        projectId={deployProjectId}
        agentName={adkConfig.name}
        files={githubDeploymentFiles}
        adkConfig={adkConfig}
        setAdkConfig={setAdkConfig}
        generateCallerGithubWorkflow={generateCallerGithubWorkflow}
      />

      {isFixMode && builderTab === "a2a" && (
        <div className="bg-yellow-900/30 border border-yellow-700 p-4 rounded-lg shrink-0">
          <h3 className="text-yellow-400 font-bold mb-1">
            Fixing Service: {a2aConfig.serviceName}
          </h3>
          <p className="text-sm text-gray-300">
            Configuration pre-filled from deployed service.
          </p>
        </div>
      )}

      {/* Layout Container */}
      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
        {/* Left Column: Configuration (Box 1) */}
        <div className="bg-gray-800 p-4 rounded-lg shadow-md lg:w-1/3 flex flex-col overflow-y-auto border border-gray-700">
          <div className="flex justify-between items-center mb-3 shrink-0">
            <h2 className="text-lg font-semibold text-white">
              1. Configure Agent
            </h2>
            <CloudConsoleButton
              url={`https://console.cloud.google.com/vertex-ai/agents/agent-engines?project=${projectNumber}`}
            />
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Project Number
              </label>
              <ProjectInput value={projectNumber} onChange={setProjectNumber} />
            </div>

            {builderTab === "adk" ? (
              <>
                {/* Templates Selection */}
                <div className="mb-4 p-3 bg-gray-750 rounded-lg border border-gray-600">
                  <label className="block text-sm font-medium text-blue-400 mb-2">
                    🚀 Quick Start Templates
                  </label>
                  <select
                    onChange={(e) => {
                      const template = TEMPLATES.find(
                        (t) => t.id === e.target.value,
                      );
                      if (template) {
                        setAdkConfig((prev) => {
                          const cleanConfig: AdkAgentConfig = {
                            name: "",
                            description: "An agent that can do awesome things.",
                            model: "gemini-2.5-flash",
                            instruction:
                              "You are an awesome and helpful agent.",
                            tools: [],
                            useGoogleSearch: false,
                            enableOAuth: false,
                            authId: "temp_oauth",
                            allowAdcFallback: true,
                            enableDiscoveryApi: false,
                            discoveryConfig: {
                              projectId: "",
                              location: "global",
                              collection: "default_collection",
                              engineId: "",
                              dataStoreIds: "",
                            },
                            enableBqAnalytics: false,
                            bqDatasetId: "",
                            bqTableId: "",
                            enableThinking: false,
                            thinkingBudget: 1024,
                            thinkingLevel: "HIGH",
                            enableStreaming: false,
                            enableBigQueryMcp: false,
                            enableCodeExecution: false,
                            enableGraphvizRendering: false,
                            enableEmailTool: false,
                            enableSecurityCommandCenterApi: false,
                            enableRecommenderApi: false,
                            enableServiceHealthApi: false,
                            enableNetworkManagementApi: false,
                            enableCloudAssistApi: false,
                            enableTelemetry: true,
                            enableMessageLogging: false,
                            enableCloudLoggingApi: false,
                            enableCloudMonitoringApi: false,
                            enableCloudRunApi: false,
                            enableResourceManagerApi: false,
                            enableAdminActivityApi: false,
                            enableDatabaseFleetApi: false,
                            enableCloudLoggingMcp: false,
                            enableBigtableAdminMcp: false,
                            enableCloudSqlMcp: false,
                            enableCloudMonitoringMcp: false,
                            enableComputeEngineMcp: false,
                            enableFirestoreMcp: false,
                            enableGkeMcp: false,
                            enableResourceManagerMcp: false,
                            enableSpannerMcp: false,
                            enableDeveloperKnowledgeMcp: false,
                            enableMapsGroundingMcp: false,
                            enableEvaluation: false,
                            enableCiCd: false,
                            ciCdRunner: "none",
                            deploymentTarget: "agent_engine",
                            githubWifProvider: "",
                            githubServiceAccount: "",
                            customMcpEndpoints: [],
                          };

                          return {
                            ...cleanConfig,
                            ...template.config,
                            discoveryConfig: {
                              ...cleanConfig.discoveryConfig,
                              ...(template.config.discoveryConfig || {}),
                            },
                          };
                        });
                      }
                    }}
                    className="bg-gray-800 border border-gray-500 rounded-md px-3 py-2 text-sm text-white w-full hover:border-blue-500 focus:border-blue-500 transition-colors"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Select a template to auto-fill...
                    </option>
                    {TEMPLATES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} - {t.description}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Agent Name
                  </label>
                  <input
                    name="name"
                    type="text"
                    value={adkConfig.name}
                    onChange={handleAdkConfigChange}
                    className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Description
                  </label>
                  <input
                    name="description"
                    type="text"
                    value={adkConfig.description}
                    onChange={handleAdkConfigChange}
                    className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Agent Location
                  </label>
                  <select
                    value={vertexLocation}
                    onChange={(e) => setVertexLocation(e.target.value)}
                    className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]"
                  >
                    <option value="us-central1">us-central1</option>
                    <option value="europe-west1">europe-west1</option>
                    <option value="asia-east1">asia-east1</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    ADK Version
                  </label>
                  <select
                    name="adkVersion"
                    value={adkConfig.adkVersion || "1.35.1"}
                    onChange={handleAdkConfigChange}
                    className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]"
                  >
                    <option value="1.35.1">ADK 1.35.1 (Legacy)</option>
                    <option value="2.2">ADK 2.2 (Antigravity SDK)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Model
                  </label>
                  <select
                    name="model"
                    value={adkConfig.model}
                    onChange={handleAdkConfigChange}
                    className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]"
                  >
                    <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                    <option value="gemini-3.1-pro-preview">
                      Gemini 3.1 Pro
                    </option>
                    <option value="gemini-3-flash-preview">
                      Gemini 3.0 Flash
                    </option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                  </select>
                </div>

                {/* Staging Bucket - Moved here for ADK */}
                <div className="mt-2">
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Staging Bucket
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={stagingBucket}
                      onChange={(e) => setStagingBucket(e.target.value)}
                      className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full focus:ring-teal-500 focus:border-teal-500"
                    >
                      <option value="">-- Select Bucket --</option>
                      {buckets.map((b) => (
                        <option key={b.name} value={`gs://${b.name}`}>
                          gs://{b.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        setIsLoadingBuckets(true);
                        api.listBuckets(projectNumber).then((res) => {
                          setBuckets(res.items || []);
                          setIsLoadingBuckets(false);
                        });
                      }}
                      disabled={isLoadingBuckets}
                      className="px-3 py-2 bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600 disabled:opacity-50"
                      title="Refresh Buckets"
                    >
                      &#x21bb;
                    </button>
                  </div>
                  {!stagingBucket && (
                    <p className="text-xs text-yellow-500 mt-1">
                      Required for deployment.
                    </p>
                  )}
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium text-gray-400">
                      Instruction
                    </label>
                    <button
                      onClick={() => handleRewrite("instruction")}
                      disabled={rewritingField === "instruction"}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      {rewritingField === "instruction" ? "..." : "AI Rewrite"}
                    </button>
                  </div>

                  <textarea
                    name="instruction"
                    value={adkConfig.instruction}
                    onChange={handleAdkConfigChange}
                    rows={4}
                    className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full mt-2"
                  />
                </div>
                <div className="space-y-2 pt-2 border-t border-gray-600">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      name="useGoogleSearch"
                      checked={adkConfig.useGoogleSearch}
                      onChange={handleAdkConfigChange}
                      className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                    />
                    <span className="text-sm text-gray-300">
                      Enable Google Search Tool
                    </span>
                  </label>

                  <div className="pt-2 border-t border-gray-600 mt-2 space-y-2">
                    <h4 className="text-xs font-semibold text-gray-400">
                      Agent Capabilities
                    </h4>
                    <div className="flex items-center space-x-2">
                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="checkbox"
                          name="enableThinking"
                          checked={adkConfig.enableThinking}
                          onChange={handleAdkConfigChange}
                          className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                        />
                        <span className="text-sm text-gray-300">
                          Enable Thinking Details
                        </span>
                      </label>
                      {adkConfig.enableThinking && (
                        <div className="flex flex-col">
                          {adkConfig.model &&
                            adkConfig.model.startsWith("gemini-3") ? (
                            <select
                              name="thinkingLevel"
                              value={adkConfig.thinkingLevel}
                              onChange={handleAdkConfigChange}
                              title="Thinking depth for Gemini 3 models"
                              className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-xs text-gray-200 w-32"
                            >
                              <option value="MINIMAL">Minimal</option>
                              <option value="LOW">Low</option>
                              <option value="MEDIUM">Medium</option>
                              <option value="HIGH">High</option>
                            </select>
                          ) : (
                            <input
                              type="number"
                              name="thinkingBudget"
                              value={adkConfig.thinkingBudget}
                              onChange={handleAdkConfigChange}
                              placeholder="Limit (-1)"
                              title="Token limit for thinking process (-1 for unlimited)"
                              className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-xs text-gray-200 w-24"
                            />
                          )}
                        </div>
                      )}
                    </div>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="enableStreaming"
                        checked={adkConfig.enableStreaming}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Enable Streaming Responses
                      </span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="enableCodeExecution"
                        checked={adkConfig.enableCodeExecution}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Enable Code Execution Sub-Agent
                      </span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="enableGraphvizRendering"
                        checked={adkConfig.enableGraphvizRendering}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Enable Graphviz Local Renderer
                      </span>
                    </label>
                  </div>

                  <div className="pt-2 border-t border-gray-600 mt-2 space-y-2">
                    <h4 className="text-xs font-semibold text-gray-400">
                      Integrations (Tools)
                    </h4>
                    <McpServiceCheck
                      projectId={deployProjectId || ""}
                      serviceName="bigquery.googleapis.com"
                      mcpEndpoint="https://bigquery.googleapis.com/mcp"
                      label="BigQuery Managed MCP"
                      checked={adkConfig.enableBigQueryMcp}
                      onChange={(checked) =>
                        handleAdkConfigChange({
                          target: {
                            name: "enableBigQueryMcp",
                            type: "checkbox",
                            checked,
                          },
                        } as any)
                      }
                    />
                    <McpServiceCheck
                      projectId={deployProjectId || ""}
                      serviceName="logging.googleapis.com"
                      mcpEndpoint="https://logging.googleapis.com/mcp"
                      label="Cloud Logging Managed MCP"
                      checked={adkConfig.enableCloudLoggingMcp}
                      onChange={(checked) =>
                        handleAdkConfigChange({
                          target: {
                            name: "enableCloudLoggingMcp",
                            type: "checkbox",
                            checked,
                          },
                        } as any)
                      }
                    />
                    <McpServiceCheck
                      projectId={deployProjectId || ""}
                      serviceName="bigtableadmin.googleapis.com"
                      mcpEndpoint="https://bigtableadmin.googleapis.com/mcp"
                      label="Bigtable Admin MCP"
                      checked={adkConfig.enableBigtableAdminMcp}
                      onChange={(checked) =>
                        handleAdkConfigChange({
                          target: {
                            name: "enableBigtableAdminMcp",
                            type: "checkbox",
                            checked,
                          },
                        } as any)
                      }
                    />
                    <McpServiceCheck
                      projectId={deployProjectId || ""}
                      serviceName="sqladmin.googleapis.com"
                      mcpEndpoint="https://sqladmin.googleapis.com/mcp"
                      label="Cloud SQL Admin MCP"
                      checked={adkConfig.enableCloudSqlMcp}
                      onChange={(checked) =>
                        handleAdkConfigChange({
                          target: {
                            name: "enableCloudSqlMcp",
                            type: "checkbox",
                            checked,
                          },
                        } as any)
                      }
                    />
                    <McpServiceCheck
                      projectId={deployProjectId || ""}
                      serviceName="monitoring.googleapis.com"
                      mcpEndpoint="https://monitoring.googleapis.com/mcp"
                      label="Cloud Monitoring MCP"
                      checked={adkConfig.enableCloudMonitoringMcp}
                      onChange={(checked) =>
                        handleAdkConfigChange({
                          target: {
                            name: "enableCloudMonitoringMcp",
                            type: "checkbox",
                            checked,
                          },
                        } as any)
                      }
                    />
                    <McpServiceCheck
                      projectId={deployProjectId || ""}
                      serviceName="compute.googleapis.com"
                      mcpEndpoint="https://compute.googleapis.com/mcp"
                      label="Compute Engine MCP"
                      checked={adkConfig.enableComputeEngineMcp}
                      onChange={(checked) =>
                        handleAdkConfigChange({
                          target: {
                            name: "enableComputeEngineMcp",
                            type: "checkbox",
                            checked,
                          },
                        } as any)
                      }
                    />
                    <McpServiceCheck
                      projectId={deployProjectId || ""}
                      serviceName="firestore.googleapis.com"
                      mcpEndpoint="https://firestore.googleapis.com/mcp"
                      label="Firestore MCP"
                      checked={adkConfig.enableFirestoreMcp}
                      onChange={(checked) =>
                        handleAdkConfigChange({
                          target: {
                            name: "enableFirestoreMcp",
                            type: "checkbox",
                            checked,
                          },
                        } as any)
                      }
                    />
                    <McpServiceCheck
                      projectId={deployProjectId || ""}
                      serviceName="container.googleapis.com"
                      mcpEndpoint="https://container.googleapis.com/mcp"
                      label="GKE MCP"
                      checked={adkConfig.enableGkeMcp}
                      onChange={(checked) =>
                        handleAdkConfigChange({
                          target: {
                            name: "enableGkeMcp",
                            type: "checkbox",
                            checked,
                          },
                        } as any)
                      }
                    />
                    <McpServiceCheck
                      projectId={deployProjectId || ""}
                      serviceName="cloudresourcemanager.googleapis.com"
                      mcpEndpoint="https://cloudresourcemanager.googleapis.com/mcp"
                      label="Resource Manager MCP"
                      checked={adkConfig.enableResourceManagerMcp}
                      onChange={(checked) =>
                        handleAdkConfigChange({
                          target: {
                            name: "enableResourceManagerMcp",
                            type: "checkbox",
                            checked,
                          },
                        } as any)
                      }
                    />
                    <McpServiceCheck
                      projectId={deployProjectId || ""}
                      serviceName="spanner.googleapis.com"
                      mcpEndpoint="https://spanner.googleapis.com/mcp"
                      label="Spanner MCP"
                      checked={adkConfig.enableSpannerMcp}
                      onChange={(checked) =>
                        handleAdkConfigChange({
                          target: {
                            name: "enableSpannerMcp",
                            type: "checkbox",
                            checked,
                          },
                        } as any)
                      }
                    />
                    <h4 className="text-xs font-semibold text-gray-400 mt-2">
                      Google MCPs
                    </h4>
                    <McpServiceCheck
                      projectId={deployProjectId || ""}
                      serviceName="developerknowledge.googleapis.com"
                      mcpEndpoint="https://developerknowledge.googleapis.com/mcp"
                      label="Developer Knowledge MCP"
                      checked={adkConfig.enableDeveloperKnowledgeMcp}
                      onChange={(checked) =>
                        handleAdkConfigChange({
                          target: {
                            name: "enableDeveloperKnowledgeMcp",
                            type: "checkbox",
                            checked,
                          },
                        } as any)
                      }
                    />
                    <McpServiceCheck
                      projectId={deployProjectId || ""}
                      serviceName="mapstools.googleapis.com"
                      mcpEndpoint="https://mapstools.googleapis.com/mcp"
                      label="Maps Grounding Lite MCP"
                      checked={adkConfig.enableMapsGroundingMcp}
                      onChange={(checked) =>
                        handleAdkConfigChange({
                          target: {
                            name: "enableMapsGroundingMcp",
                            type: "checkbox",
                            checked,
                          },
                        } as any)
                      }
                    />

                    <div className="mt-4 pt-4 border-t border-gray-600">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="text-xs font-semibold text-gray-400">
                          Custom MCP Endpoints
                        </h4>
                        <button
                          onClick={handleAddCustomMcp}
                          className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs transition-colors"
                        >
                          + Add Endpoint
                        </button>
                      </div>
                      <div className="space-y-3">
                        {adkConfig.customMcpEndpoints.map((endpoint, index) => (
                          <div
                            key={index}
                            className="flex space-x-2 items-start border border-gray-700 bg-gray-800 p-3 rounded-lg relative group"
                          >
                            <div className="flex-1 space-y-2">
                              <div className="flex flex-col">
                                <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                                  Variable Name
                                </label>
                                <input
                                  type="text"
                                  placeholder="e.g., custom_zendesk_mcp"
                                  value={endpoint.name}
                                  onChange={(e) =>
                                    handleUpdateCustomMcp(
                                      index,
                                      "name",
                                      e.target.value.replace(/\s+/g, "_"),
                                    )
                                  }
                                  className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs"
                                />
                              </div>
                              <div className="flex flex-col">
                                <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                                  Endpoint URL
                                </label>
                                <input
                                  type="text"
                                  placeholder="e.g., https://your-mcp-server.internal"
                                  value={endpoint.url}
                                  onChange={(e) =>
                                    handleUpdateCustomMcp(
                                      index,
                                      "url",
                                      e.target.value,
                                    )
                                  }
                                  className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xs font-mono"
                                />
                              </div>
                              <div className="flex items-center justify-between mt-1">
                                <button
                                  onClick={() =>
                                    handleVerifyCustomMcp(index, endpoint.url)
                                  }
                                  className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-xs transition-colors"
                                >
                                  Verify
                                </button>
                                {customMcpStatus[index] && (
                                  <span
                                    className={`text-xs ${customMcpStatus[index].error ? "text-red-400" : "text-green-400"}`}
                                  >
                                    {customMcpStatus[index].loading
                                      ? "Loading..."
                                      : customMcpStatus[index].error
                                        ? `Error: ${customMcpStatus[index].error}`
                                        : `Ready (${customMcpStatus[index].tools?.length || 0} tools)`}
                                  </span>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemoveCustomMcp(index)}
                              className="text-gray-500 hover:text-red-400 p-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity absolute right-2 top-2"
                              title="Remove Endpoint"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        {adkConfig.customMcpEndpoints.length === 0 && (
                          <p className="text-xs text-gray-500 italic pb-2">
                            No custom endpoints defined.
                          </p>
                        )}
                      </div>
                    </div>

                    <h4 className="text-xs font-semibold text-gray-400 mt-4 border-t border-gray-600 pt-4">
                      Custom APIs
                    </h4>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="enableSecurityCommandCenterApi"
                        checked={adkConfig.enableSecurityCommandCenterApi}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Enable Security Command Center Tool
                      </span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="enableRecommenderApi"
                        checked={adkConfig.enableRecommenderApi}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Enable Recommender Tool
                      </span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="enableServiceHealthApi"
                        checked={adkConfig.enableServiceHealthApi}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Enable Service Health Tool
                      </span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="enableNetworkManagementApi"
                        checked={adkConfig.enableNetworkManagementApi}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Enable Network Management Tool
                      </span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="enableCloudLoggingApi"
                        checked={adkConfig.enableCloudLoggingApi}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Enable Cloud Logging (API)
                      </span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="enableCloudMonitoringApi"
                        checked={adkConfig.enableCloudMonitoringApi}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Enable Cloud Monitoring (API)
                      </span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="enableCloudRunApi"
                        checked={adkConfig.enableCloudRunApi}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Enable Cloud Run Discovery (API)
                      </span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="enableResourceManagerApi"
                        checked={adkConfig.enableResourceManagerApi}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Enable Resource Manager (API)
                      </span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="enableAdminActivityApi"
                        checked={adkConfig.enableAdminActivityApi}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Enable Admin Activity / Changes (API)
                      </span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="enableDatabaseFleetApi"
                        checked={adkConfig.enableDatabaseFleetApi}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Enable Database Fleet Health (API)
                      </span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="enableCloudAssistApi"
                        checked={adkConfig.enableCloudAssistApi}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Enable Gemini Cloud Assist
                      </span>
                    </label>

                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="enableEmailTool"
                        checked={adkConfig.enableEmailTool}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Enable Email Sending Tool
                      </span>
                    </label>

                    <div className="flex flex-col gap-2 mt-2">
                      <div className="flex items-center space-x-3">
                        <label className="flex items-center space-x-3 cursor-pointer">
                          <input
                            type="checkbox"
                            name="enableOAuth"
                            checked={adkConfig.enableOAuth}
                            onChange={handleAdkConfigChange}
                            className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                          />
                          <span className="text-sm text-gray-300">
                            Enable OAuth Flow
                          </span>
                        </label>
                        {adkConfig.enableOAuth && (
                          <div className="flex items-center space-x-2">
                            {authInputMode === "select" &&
                              authorizations.length > 0 ? (
                              <select
                                name="authId"
                                value={adkConfig.authId}
                                onChange={handleAdkConfigChange}
                                className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-xs text-gray-200 w-44 h-[26px]"
                              >
                                <option value="">-- Select Auth ID --</option>
                                {authorizations.map((auth) => {
                                  const aId = auth.name.split("/").pop() || "";
                                  return (
                                    <option key={auth.name} value={aId}>
                                      {auth.displayName || aId}
                                    </option>
                                  );
                                })}
                              </select>
                            ) : (
                              <input
                                type="text"
                                name="authId"
                                value={adkConfig.authId}
                                onChange={handleAdkConfigChange}
                                placeholder="Auth ID (e.g. bqtest)"
                                className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-xs text-gray-200 w-32"
                              />
                            )}
                            {authorizations.length > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setAuthInputMode((prev) =>
                                    prev === "select" ? "manual" : "select",
                                  )
                                }
                                className="text-xs text-blue-400 hover:text-blue-300 underline font-semibold shrink-0"
                              >
                                {authInputMode === "select"
                                  ? "Manual Input"
                                  : "Select Existing"}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      {adkConfig.enableOAuth && (
                        <label
                          className="flex items-center space-x-3 pl-6 cursor-pointer"
                          title="If disabled, tools will fail with an error if no user token is present, instead of defaulting to the service account."
                        >
                          <input
                            type="checkbox"
                            name="allowAdcFallback"
                            checked={adkConfig.allowAdcFallback}
                            onChange={handleAdkConfigChange}
                            className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                          />
                          <span className="text-xs text-gray-400">
                            Allow fallback to Service Account (ADC)
                          </span>
                        </label>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-gray-600 mt-2 space-y-2">
                    <h4 className="text-xs font-semibold text-gray-400">
                      Observability
                    </h4>
                    <label
                      className="flex items-center space-x-3 cursor-pointer"
                      title="Populates the agent observability dashboard and traces pages."
                    >
                      <input
                        type="checkbox"
                        name="enableTelemetry"
                        checked={adkConfig.enableTelemetry}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Enable OpenTelemetry Traces & Logs
                      </span>
                    </label>
                    <label
                      className="flex items-center space-x-3 cursor-pointer"
                      title="Enabling this will collect and store the full content of user prompts and responses. Ensure you have necessary user consents."
                    >
                      <input
                        type="checkbox"
                        name="enableMessageLogging"
                        checked={adkConfig.enableMessageLogging}
                        onChange={handleAdkConfigChange}
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                      />
                      <span className="text-sm text-gray-300">
                        Log Prompts & Responses (Sensitive)
                      </span>
                    </label>
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-600 mt-2 space-y-2">
                  <h4 className="text-xs font-semibold text-gray-400">
                    Lifecycle Management (WIP)
                  </h4>
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      name="enableEvaluation"
                      checked={adkConfig.enableEvaluation}
                      onChange={handleAdkConfigChange}
                      className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                    />
                    <span className="text-sm text-gray-300">
                      Enable Evaluation Configs
                    </span>
                  </label>

                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      name="enableCiCd"
                      checked={adkConfig.enableCiCd}
                      onChange={handleAdkConfigChange}
                      className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                    />
                    <span className="text-sm text-gray-300">
                      Enable CI/CD Scaffolding
                    </span>
                  </label>

                  {adkConfig.enableCiCd && (
                    <div className="pl-6 space-y-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">
                          CI/CD Runner
                        </label>
                        <select
                          name="ciCdRunner"
                          value={adkConfig.ciCdRunner}
                          onChange={handleAdkConfigChange}
                          className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-xs text-gray-200 w-full"
                        >
                          <option value="none">None</option>
                          <option value="github_actions">GitHub Actions</option>
                          <option value="google_cloud_build">
                            Google Cloud Build
                          </option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">
                          Deployment Target
                        </label>
                        <select
                          name="deploymentTarget"
                          value={adkConfig.deploymentTarget}
                          onChange={handleAdkConfigChange}
                          className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-xs text-gray-200 w-full"
                        >
                          <option value="agent_engine">Agent Engine</option>
                          <option value="cloud_run">Cloud Run</option>
                        </select>
                      </div>
                      {adkConfig.ciCdRunner === "github_actions" && (
                        <div className="pt-2 space-y-2 border-t border-gray-600 mt-2">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-xs font-medium text-gray-400">
                                WIF Provider
                              </label>
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  setShowWifInstructions(!showWifInstructions);
                                }}
                                className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
                              >
                                {showWifInstructions
                                  ? "Hide setup instructions"
                                  : "How to set up WIF"}
                              </button>
                            </div>
                            {wifProviders.length > 0 ? (
                              <select
                                name="githubWifProvider"
                                value={adkConfig.githubWifProvider || ""}
                                onChange={handleAdkConfigChange}
                                className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-xs text-gray-200 w-full"
                              >
                                <option value="">
                                  Select a WIF Provider...
                                </option>
                                {wifProviders.map((p) => (
                                  <option key={p.name} value={p.name}>
                                    {p.displayName || p.name.split("/").pop()}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                name="githubWifProvider"
                                value={adkConfig.githubWifProvider || ""}
                                onChange={handleAdkConfigChange}
                                placeholder="projects/123.../providers/my-provider"
                                className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-xs text-gray-200 w-full"
                              />
                            )}
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">
                              Service Account Email
                            </label>
                            {serviceAccounts.length > 0 ? (
                              <select
                                name="githubServiceAccount"
                                value={adkConfig.githubServiceAccount || ""}
                                onChange={handleAdkConfigChange}
                                className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-xs text-gray-200 w-full"
                              >
                                <option value="">
                                  Select a Service Account...
                                </option>
                                {serviceAccounts.map((sa) => (
                                  <option key={sa.email} value={sa.email}>
                                    {sa.email}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="email"
                                name="githubServiceAccount"
                                value={adkConfig.githubServiceAccount || ""}
                                onChange={handleAdkConfigChange}
                                placeholder="sa@my-project.iam.gserviceaccount.com"
                                className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-xs text-gray-200 w-full"
                              />
                            )}
                          </div>
                          {validationStatus !== "unchecked" && (
                            <div
                              className={`text-xs mt-1 ${validationStatus === "valid" ? "text-green-400" : validationStatus === "testing" ? "text-yellow-400" : "text-red-400"}`}
                            >
                              {validationStatus === "testing"
                                ? "Validating connection..."
                                : validationMessage}
                            </div>
                          )}

                          {showWifInstructions && (
                            <div className="p-3 bg-gray-800 rounded border border-gray-600 mt-2 text-xs text-gray-300 font-mono overflow-x-auto whitespace-pre">
                              <div># 1. Create a Workload Identity Pool</div>
                              <div className="text-gray-400">
                                gcloud iam workload-identity-pools create
                                "github-actions" \<br />{" "}
                                --project="YOUR_PROJECT_ID" \<br />{" "}
                                --location="global" \<br />{" "}
                                --display-name="GitHub Actions Pool"
                              </div>
                              <br />
                              <div># 2. Create a WIF Provider in that pool</div>
                              <div className="text-gray-400">
                                gcloud iam workload-identity-pools providers
                                create-oidc "my-repo" \<br />{" "}
                                --project="YOUR_PROJECT_ID" \<br />{" "}
                                --location="global" \<br />{" "}
                                --workload-identity-pool="github-actions" \
                                <br /> --display-name="My GitHub repo Provider"
                                \<br />{" "}
                                --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository_owner=assertion.repository_owner"
                                \<br />{" "}
                                --attribute-condition="attribute.repository_owner
                                == 'YOUR_ORG'" \<br />{" "}
                                --issuer-uri="https://token.actions.githubusercontent.com"
                              </div>
                              <br />
                              <div># 3. Create a Service Account</div>
                              <div className="text-gray-400">
                                gcloud iam service-accounts create
                                "github-actions-sa" \<br />{" "}
                                --project="YOUR_PROJECT_ID" \<br />{" "}
                                --display-name="GitHub Actions Service Account"
                              </div>
                              <br />
                              <div>
                                # 4. Bind the Service Account to the WIF
                                Provider
                              </div>
                              <div className="text-gray-400">
                                gcloud iam service-accounts
                                add-iam-policy-binding
                                "github-actions-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com"
                                \<br />
                                --project="YOUR_PROJECT_ID" \<br />
                                --role="roles/iam.workloadIdentityUser" \<br />
                                --member="principalSet://iam.googleapis.com/projects/YOUR_PROJECT_NUMBER/locations/global/workloadIdentityPools/github-actions/attribute.repository_owner/YOUR_ORG"
                              </div>
                            </div>
                          )}

                          <div className="pt-2 flex justify-end">
                            <button
                              onClick={() => setIsGithubModalOpen(true)}
                              className="text-xs bg-gray-600 hover:bg-gray-500 text-white py-1.5 px-3 rounded flex items-center gap-1 transition-colors border border-gray-500"
                            >
                              <svg
                                viewBox="0 0 16 16"
                                className="w-3 h-3 fill-current"
                              >
                                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
                              </svg>
                              Automated CI/CD Workflow Setup
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Validation Panel */}
                <div className="mt-4 p-3 bg-gray-900 rounded-lg border border-gray-700">
                  <h4 className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
                    ADK Standards Validation
                  </h4>
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-green-400">✓</span>
                      <span className="text-xs text-gray-300">
                        Standard Folder Structure (app/, tests/)
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span
                        className={
                          adkConfig.enableEvaluation
                            ? "text-green-400"
                            : "text-gray-600"
                        }
                      >
                        {adkConfig.enableEvaluation ? "✓" : "○"}
                      </span>
                      <span
                        className={`text-xs ${adkConfig.enableEvaluation ? "text-gray-300" : "text-gray-500"}`}
                      >
                        Evaluation Configured
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span
                        className={
                          adkConfig.enableCiCd
                            ? "text-green-400"
                            : "text-gray-600"
                        }
                      >
                        {adkConfig.enableCiCd ? "✓" : "○"}
                      </span>
                      <span
                        className={`text-xs ${adkConfig.enableCiCd ? "text-gray-300" : "text-gray-500"}`}
                      >
                        CI/CD Pipeline Configured
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-green-400">✓</span>
                      <span className="text-xs text-gray-300">
                        Design Spec Generated
                      </span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Project ID
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={deployProjectId}
                      onChange={(e) => setDeployProjectId(e.target.value)}
                      className={`bg-gray-700 border rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px] ${/^\d+$/.test(deployProjectId) ? "border-yellow-500" : "border-gray-600"}`}
                      placeholder="e.g. my-project-id"
                    />
                    <button
                      onClick={fetchProjectId}
                      disabled={isResolvingId}
                      className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-md text-white disabled:opacity-50"
                    >
                      {isResolvingId ? "..." : "↻"}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Service Name
                  </label>
                  <input
                    name="serviceName"
                    type="text"
                    value={a2aConfig.serviceName}
                    onChange={handleA2aConfigChange}
                    className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Display Name
                  </label>
                  <input
                    name="displayName"
                    type="text"
                    value={a2aConfig.displayName}
                    onChange={handleA2aConfigChange}
                    className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Provider Organization
                  </label>
                  <input
                    name="providerOrganization"
                    type="text"
                    value={a2aConfig.providerOrganization}
                    onChange={handleA2aConfigChange}
                    className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Model
                  </label>
                  <select
                    name="model"
                    value={a2aConfig.model}
                    onChange={handleA2aConfigChange}
                    className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]"
                  >
                    <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                    <option value="gemini-3.1-pro-preview">
                      Gemini 3.1 Pro
                    </option>
                    <option value="gemini-3-flash-preview">
                      Gemini 3.0 Flash
                    </option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Region
                  </label>
                  <select
                    name="region"
                    value={a2aConfig.region}
                    onChange={handleA2aConfigChange}
                    className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]"
                  >
                    <option value="us-central1">us-central1</option>
                    <option value="europe-west1">europe-west1</option>
                    <option value="asia-east1">asia-east1</option>
                  </select>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium text-gray-400">
                      System Instruction
                    </label>
                    <button
                      onClick={() => handleRewrite("instruction")}
                      disabled={rewritingField === "instruction"}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      {rewritingField === "instruction" ? "..." : "AI Rewrite"}
                    </button>
                  </div>
                  <textarea
                    name="instruction"
                    value={a2aConfig.instruction}
                    onChange={handleA2aConfigChange}
                    rows={4}
                    className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full"
                  />
                </div>
                <div className="space-y-2 pt-2 border-t border-gray-600">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      name="useGoogleSearch"
                      checked={a2aConfig.useGoogleSearch}
                      onChange={handleA2aConfigChange}
                      className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                    />
                    <span className="text-sm text-gray-300">
                      Enable Google Search Tool
                    </span>
                  </label>
                </div>
              </>
            )}

            <div className="pt-4 border-t border-gray-700">
              <h3 className="text-sm font-medium text-gray-300 mb-2">
                Add Tools
              </h3>
              <div className="bg-gray-700/50 p-3 rounded-md space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    Vertex AI Search Data Store
                  </label>
                  <div className="flex flex-col gap-2">
                    <input
                      type="text"
                      placeholder="Search data stores..."
                      value={dataStoreSearchTerm}
                      onChange={(e) => setDataStoreSearchTerm(e.target.value)}
                      className="bg-gray-600 border border-gray-500 rounded-md px-2 py-1 text-xs text-white w-full placeholder-gray-400 focus:outline-none focus:border-blue-500"
                    />
                    <div className="flex gap-2">
                      <select
                        value={toolBuilderConfig.dataStoreId}
                        onChange={(e) =>
                          setToolBuilderConfig({
                            ...toolBuilderConfig,
                            dataStoreId: e.target.value,
                          })
                        }
                        className="bg-gray-600 border border-gray-500 rounded-md px-2 py-1 text-xs text-white w-full"
                        disabled={isLoadingDataStores}
                      >
                        <option value="">-- Select Data Store --</option>
                        {dataStores
                          .filter(
                            (ds) =>
                              !dataStoreSearchTerm ||
                              ds.displayName
                                .toLowerCase()
                                .includes(dataStoreSearchTerm.toLowerCase()) ||
                              ds.name.includes(dataStoreSearchTerm),
                          )
                          .map((ds) => {
                            const dsId = ds.name.split("/").pop();
                            return (
                              <option key={ds.name} value={ds.name}>
                                {ds.displayName} ({dsId}) - {ds.location}
                              </option>
                            );
                          })}
                      </select>
                      <button
                        onClick={() =>
                          handleAddTool({
                            type: "VertexAiSearchTool",
                            dataStoreId: toolBuilderConfig.dataStoreId,
                            variableName: `search_tool_${(builderTab === "a2a" ? a2aConfig.tools : adkConfig.tools).length + 1}`,
                          })
                        }
                        disabled={!toolBuilderConfig.dataStoreId}
                        className="px-2 py-1 bg-teal-600 text-white text-xs rounded hover:bg-teal-700 disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    Call Other Agent (A2A)
                  </label>
                  <div className="flex flex-col gap-2">
                    <input
                      type="text"
                      placeholder="Search A2A services..."
                      value={a2aSearchTerm}
                      onChange={(e) => setA2aSearchTerm(e.target.value)}
                      className="bg-gray-600 border border-gray-500 rounded-md px-2 py-1 text-xs text-white w-full placeholder-gray-400 focus:outline-none focus:border-blue-500"
                    />
                    <div className="flex gap-2">
                      <select
                        value={selectedA2aService}
                        onChange={(e) => setSelectedA2aService(e.target.value)}
                        className="bg-gray-600 border border-gray-500 rounded-md px-2 py-1 text-xs text-white w-full"
                        disabled={isLoadingServices}
                      >
                        <option value="">-- Select A2A Service --</option>
                        {cloudRunServices
                          .filter(
                            (s) =>
                              !a2aSearchTerm ||
                              s.name
                                .toLowerCase()
                                .includes(a2aSearchTerm.toLowerCase()),
                          )
                          .map((s) => (
                            <option key={s.name} value={s.uri}>
                              {s.name.split("/").pop()}
                            </option>
                          ))}
                      </select>
                      <button
                        onClick={() =>
                          handleAddTool({
                            type: "A2AClientTool",
                            url: selectedA2aService,
                            variableName: `a2a_agent_${(builderTab === "a2a" ? a2aConfig.tools : adkConfig.tools).length + 1}`,
                          })
                        }
                        disabled={!selectedA2aService}
                        className="px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {(builderTab === "a2a" ? a2aConfig.tools : adkConfig.tools).map(
                  (tool, i) => (
                    <div
                      key={i}
                      className="flex justify-between items-center bg-gray-900 px-3 py-2 rounded border border-gray-700"
                    >
                      <div className="text-xs text-gray-300">
                        <span className="font-bold text-teal-400">
                          {tool.type === "VertexAiSearchTool"
                            ? "Search"
                            : "A2A"}
                        </span>
                        : {tool.variableName}
                      </div>
                      <button
                        onClick={() => handleRemoveTool(i)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    </div>
                  ),
                )}
              </div>
            </div>

            {builderTab === "a2a" && (
              <div className="pt-4 border-t border-gray-700">
                <h3 className="text-sm font-medium text-gray-300 mb-2">
                  Testing Options
                </h3>
                <div className="space-y-2">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      name="allowUnauthenticated"
                      checked={a2aConfig.allowUnauthenticated}
                      onChange={handleA2aConfigChange}
                      className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                    />
                    <span className="text-sm text-gray-300">
                      Allow unauthenticated invocations
                    </span>
                  </label>
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      name="enableCors"
                      checked={a2aConfig.enableCors}
                      onChange={handleA2aConfigChange}
                      className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
                    />
                    <span className="text-sm text-gray-300">Enable CORS</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Code & Deploy (Box 2 & 3) */}
        <div className="flex flex-col gap-6 flex-1 min-h-0">
          <div className="bg-gray-800 p-4 rounded-lg shadow-md flex flex-col flex-1 min-h-0 border border-gray-700">
            <h2 className="text-lg font-semibold text-white mb-3 shrink-0">
              2. Generated Source Code
            </h2>
            <div className="flex justify-between items-center mb-2 shrink-0">
              <div className="flex border-b border-gray-700">
                {(builderTab === "adk"
                  ? ADK_TABS.filter(
                    (t) => t.id !== "auth" || adkConfig.enableOAuth,
                  )
                  : A2A_TABS
                ).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() =>
                      builderTab === "adk"
                        ? setAdkActiveTab(tab.id as any)
                        : setA2aActiveTab(tab.id as any)
                    }
                    className={`px-3 py-2 text-xs font-medium transition-colors ${(builderTab === "adk" ? adkActiveTab : a2aActiveTab) ===
                        tab.id
                        ? "border-b-2 border-blue-500 text-white"
                        : "text-gray-400 hover:text-white"
                      }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Location */}
              <button
                onClick={() =>
                  handleCopy(
                    builderTab === "adk" ? adkCodeDisplay : a2aCodeDisplay,
                    builderTab === "adk"
                      ? setAdkCopySuccess
                      : setA2aCopySuccess,
                  )
                }
                className="px-3 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-500"
              >
                {(builderTab === "adk" ? adkCopySuccess : a2aCopySuccess) ||
                  "Copy"}
              </button>
            </div>
            <div className="bg-gray-900 rounded-b-md flex-1 overflow-auto border border-gray-700">
              <pre className="p-4 text-xs text-gray-300 whitespace-pre-wrap">
                <code>
                  {builderTab === "adk" ? adkCodeDisplay : a2aCodeDisplay}
                </code>
              </pre>
            </div>
          </div>

          <div className="bg-gray-800 p-4 rounded-lg shadow-md flex flex-col flex-1 min-h-0 border border-gray-700">
            <h2 className="text-lg font-semibold text-white mb-3 shrink-0">
              3. Deployment Options
            </h2>
            <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto">
              <div className="bg-blue-900/20 p-4 rounded-md border border-blue-800 shrink-0">
                <h3 className="text-sm font-bold text-blue-300 mb-1">
                  Option A: Cloud Build (Automated)
                </h3>
                <button
                  onClick={() =>
                    builderTab === "adk"
                      ? setIsAdkDeployModalOpen(true)
                      : setIsA2aDeployModalOpen(true)
                  }
                  className="w-full mt-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-teal-500 text-white font-bold rounded-md shadow-lg flex items-center justify-center gap-2"
                >
                  Deploy with Cloud Build
                </button>
              </div>
              <div className="bg-gray-900/50 p-4 rounded-md border border-gray-700 flex-1 flex flex-col min-h-[150px]">
                <div className="flex justify-between items-center mb-2 shrink-0">
                  <h3 className="text-sm font-bold text-gray-200">
                    {builderTab === "adk"
                      ? "Option B: Manual Deployment (README)"
                      : "Option B: Manual Deployment (CLI Script)"}
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={
                        builderTab === "adk"
                          ? handleDownloadAdkZip
                          : handleDownloadA2a
                      }
                      className="px-3 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-500"
                    >
                      Download .zip
                    </button>
                    <button
                      onClick={() =>
                        handleCopy(
                          builderTab === "adk"
                            ? adkGeneratedCode.readme
                            : a2aGeneratedCode.gcloud,
                          builderTab === "adk"
                            ? setAdkCopySuccess
                            : setA2aCopySuccess,
                        )
                      }
                      className="px-3 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-500"
                    >
                      {(builderTab === "adk"
                        ? adkCopySuccess
                        : a2aCopySuccess) ||
                        (builderTab === "adk" ? "Copy README" : "Copy Script")}
                    </button>
                  </div>
                </div>
                <div className="bg-black rounded-md flex-1 min-h-0 border border-gray-800 flex items-center justify-center p-4">
                  <p className="text-sm text-gray-400 text-center">
                    Export as .zip for manual inspection or deployment.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentBuilderPage;
