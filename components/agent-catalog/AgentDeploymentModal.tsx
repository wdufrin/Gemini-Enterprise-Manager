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

// ... existing imports
import React, { useState, useEffect, useMemo } from "react";
import * as api from "../../services/apiService";
import { GcsBucket } from "../../types";

declare var JSZip: any;

interface AgentDeploymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentName: string;
  files: { name: string; content: string }[];
  projectNumber: string;
  onBuildTriggered?: (buildId: string) => void;
  initialBucket?: string;
}

interface EnvVar {
  key: string;
  value: string;
  source: "code" | ".env.example" | ".env";
  description?: string;
  placeholder?: string;
}

const NodeIcon: React.FC<{ type: string }> = ({ type }) => {
  switch (type) {
    case "agent":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6 text-pink-400"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
        </svg>
      );
    case "tool":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5 text-teal-400"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.532 1.532 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.532 1.532 0 01-.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
            clipRule="evenodd"
          />
        </svg>
      );
    default:
      return <div className="h-4 w-4 bg-gray-500 rounded-full"></div>;
  }
};

const AgentDeploymentModal: React.FC<AgentDeploymentModalProps> = ({
  isOpen,
  onClose,
  agentName,
  files,
  projectNumber,
  onBuildTriggered,
  initialBucket,
}) => {
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [target, setTarget] = useState<"cloud_run" | "reasoning_engine">(
    "reasoning_engine",
  );
  const [region, setRegion] = useState("us-central1");
  const [tools, setTools] = useState<string[]>([]);
  const [readmeContent, setReadmeContent] = useState<string>("");
  const [leftTab, setLeftTab] = useState<
    "architecture" | "docs" | "cloud_build"
  >("architecture");
  const [isPermissionsExpanded, setIsPermissionsExpanded] = useState(false);
  const [isRePermissionsExpanded, setIsRePermissionsExpanded] = useState(false);

  // Resolved Project ID
  const [projectId, setProjectId] = useState(projectNumber);
  const [isResolvingId, setIsResolvingId] = useState(false);

  // Bucket State
  const [buckets, setBuckets] = useState<GcsBucket[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<string>("");
  const [isLoadingBuckets, setIsLoadingBuckets] = useState(false);

  // Detected agent entrypoint (variable name in python) and file
  const [entryPoint, setEntryPoint] = useState("app");
  const [entryModulePath, setEntryModulePath] = useState("agent"); // full dotted path, e.g. "academic_research.agent"

  // Deployment state
  const [isDeploying, setIsDeploying] = useState(false);
  const [buildId, setBuildId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [validationStatus, setValidationStatus] = useState<
    "idle" | "validating" | "success" | "error"
  >("idle");
  const [missingCloudBuildRoles, setMissingCloudBuildRoles] = useState<
    string[]
  >([]);
  const [missingComputeRoles, setMissingComputeRoles] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    // Reset state
    setEnvVars([]);
    setTools([]);
    setBuildId(null);
    setError(null);
    setLogs([]);
    setIsDeploying(false);
    setProjectId(projectNumber); // Default to number
    setReadmeContent("");
    setLeftTab("architecture");
    setIsPermissionsExpanded(false);
    setIsRePermissionsExpanded(false);
    setBuckets([]);
    setSelectedBucket("");

    // 1. Resolve Project ID
    const resolveProject = async () => {
      setIsResolvingId(true);
      try {
        const p = await api.getProject(projectNumber);
        if (p.projectId) setProjectId(p.projectId);
      } catch (e) {
        console.warn("Could not resolve Project ID string");
      } finally {
        setIsResolvingId(false);
      }
    };
    resolveProject();

    // 2. Parse Files
    const readme =
      files.find(
        (f) =>
          f.name.toLowerCase() === "readme.md" ||
          f.name.toLowerCase().endsWith("/readme.md"),
      )?.content || "";
    const envExample =
      files.find(
        (f) => f.name === ".env.example" || f.name.endsWith("/.env.example"),
      )?.content || "";
    const envFile =
      files.find((f) => f.name === ".env" || f.name.endsWith("/.env"))
        ?.content || "";
    const hasDockerfile = files.some((f) => f.name === "Dockerfile");
    const isA2a = files.some((f) => f.content.includes("to_a2a("));

    // Set Readme
    setReadmeContent(readme);
    if (readme) setLeftTab("docs");

    // Determine Default Target
    if (hasDockerfile || isA2a) {
      setTarget("cloud_run");
    } else {
      setTarget("reasoning_engine");
    }

    // Detect Main File and Entry Point (Recursive Search)
    let mainFileContent = "";

    // Priority 1: app.py (Standard ADK Entry Point)
    let detectedFile = files.find(
      (f) => f.name === "app.py" || f.name.endsWith("/app.py"),
    );

    // Priority 2: agent.py
    if (!detectedFile) {
      detectedFile = files.find(
        (f) => f.name === "agent.py" || f.name.endsWith("/agent.py"),
      );
    }

    // Priority 3: main.py
    if (!detectedFile) {
      detectedFile = files.find(
        (f) => f.name === "main.py" || f.name.endsWith("/main.py"),
      );
    }

    // Priority 4: Search content
    if (!detectedFile) {
      detectedFile = files.find(
        (f) =>
          f.name.endsWith(".py") &&
          (f.content.includes("AdkApp(") ||
            f.content.includes("ReasoningEngine.create(") ||
            f.content.includes("Agent(") ||
            f.content.includes("to_a2a(")),
      );
    }

    if (detectedFile) {
      mainFileContent = detectedFile.content;

      // Construct module path (e.g. academic_research/agent.py -> academic_research.agent)
      const filePath = detectedFile.name;
      const pathParts = filePath.split("/");
      const fileName = pathParts.pop(); // agent.py
      const moduleName = fileName?.replace(".py", "") || "agent";

      if (pathParts.length > 0) {
        // It's in a subdirectory
        setEntryModulePath(`${pathParts.join(".")}.${moduleName}`);
      } else {
        setEntryModulePath(moduleName);
      }

      // Detect Entry Point Variable
      if (mainFileContent.includes("root_agent =")) {
        setEntryPoint("root_agent");
      } else {
        const appMatch = mainFileContent.match(
          /^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([a-zA-Z0-9_.]*Agent|[a-zA-Z0-9_.]*AdkApp|[a-zA-Z0-9_.]*ReasoningEngine|to_a2a)\(/m,
        );
        if (appMatch && appMatch[1]) {
          setEntryPoint(appMatch[1]);
        } else if (mainFileContent.includes("agent =")) {
          setEntryPoint("agent");
        } else if (mainFileContent.includes("app =")) {
          setEntryPoint("app");
        } else {
          setEntryPoint("app"); // Default convention
        }
      }
    } else {
      // Fallback
      setEntryModulePath("agent");
      setEntryPoint("app");
    }

    // Extract Tools (Naive Regex from python content)
    const detectedTools = new Set<string>();
    if (mainFileContent.includes("GoogleSearch"))
      detectedTools.add("Google Search");
    if (mainFileContent.includes("VertexAiSearchTool"))
      detectedTools.add("Vertex AI Search");
    if (mainFileContent.includes("LangchainTool"))
      detectedTools.add("Langchain Tool");

    const toolsMatch = mainFileContent.match(/tools\s*=\s*\[(.*?)\]/s);
    if (toolsMatch && toolsMatch[1]) {
      const rawTools = toolsMatch[1]
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      rawTools.forEach((t) => {
        const cleanName = t.replace(/_tool$/, "").replace(/_/g, " ");
        if (
          !detectedTools.has("Google Search") &&
          !detectedTools.has("Vertex AI Search")
        ) {
          if (cleanName)
            detectedTools.add(
              cleanName.charAt(0).toUpperCase() + cleanName.slice(1),
            );
        }
      });
    }
    setTools(Array.from(detectedTools));

    // Extract Env Vars
    const varsMap = new Map<string, EnvVar>();

    // Helper to parse env file content
    const parseEnvContent = (
      content: string,
      source: ".env.example" | ".env",
    ) => {
      const lines = content.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        // Supports KEY=value or KEY="value"
        const parts = trimmed.split("=");
        const key = parts[0].trim();
        const val =
          parts.length > 1
            ? parts.slice(1).join("=").trim().replace(/^"|"$/g, "")
            : "";

        if (varsMap.has(key)) {
          // Update existing key if we have a better value (e.g. from .env overriding .env.example)
          const existing = varsMap.get(key)!;
          if (source === ".env" && val) {
            varsMap.set(key, { ...existing, value: val, source: ".env" });
          }
        } else {
          varsMap.set(key, {
            key,
            value: val,
            source: source,
            placeholder: val,
          });
        }
      }
    };

    if (envExample) parseEnvContent(envExample, ".env.example");
    if (envFile) parseEnvContent(envFile, ".env");

    // Extract Env Vars from code (fallback/addition)
    const regex = /os\.getenv\s*\(\s*["']([^"']+)["']/g;
    let match;
    while ((match = regex.exec(mainFileContent)) !== null) {
      const key = match[1];
      if (!varsMap.has(key)) {
        varsMap.set(key, {
          key,
          value: "",
          source: "code",
        });
      }
    }

    // Ensure standard vars are present
    const standardVars = [
      "GOOGLE_CLOUD_PROJECT",
      "GOOGLE_CLOUD_LOCATION",
      "MODEL",
      "GOOGLE_GENAI_USE_VERTEXAI",
      "GOOGLE_CLOUD_STORAGE_BUCKET",
    ];
    standardVars.forEach((key) => {
      if (!varsMap.has(key)) {
        let defaultValue = "";
        if (key === "GOOGLE_GENAI_USE_VERTEXAI") defaultValue = "TRUE";
        varsMap.set(key, {
          key,
          value: defaultValue,
          source: "code",
          description: "Standard GCP Env Var",
        });
      }
    });

    setEnvVars(Array.from(varsMap.values()));
  }, [isOpen, files, projectNumber]);

  // Fetch Buckets
  useEffect(() => {
    if (!isOpen || !projectId) return;

    const fetchBuckets = async () => {
      setIsLoadingBuckets(true);
      try {
        const res = await api.listBuckets(projectId);
        const items = res.items || [];
        setBuckets(items);
        if (items.length > 0) {
          // Use initialBucket if it exists and matches one of the buckets, otherwise default to first
          setSelectedBucket((prev) => {
            if (prev) return prev; // Already selected
            if (initialBucket && items.some((b) => b.name === initialBucket))
              return initialBucket;
            return items[0].name;
          });
        }
      } catch (e) {
        console.error("Failed to fetch buckets", e);
      } finally {
        setIsLoadingBuckets(false);
      }
    };
    fetchBuckets();
  }, [isOpen, projectId]);

  const handleRefreshBuckets = async () => {
    if (!projectId) return;
    setIsLoadingBuckets(true);
    try {
      const res = await api.listBuckets(projectId);
      const items = res.items || [];
      setBuckets(items);
      if (items.length > 0 && !items.some((b) => b.name === selectedBucket)) {
        setSelectedBucket(items[0].name);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingBuckets(false);
    }
  };

  // Update Env Vars when projectId, region, or selectedBucket changes
  // IMPORTANT: Only overwrite if value is empty/default, do not overwrite user custom values from .env
  useEffect(() => {
    setEnvVars((prev) =>
      prev.map((v) => {
        if (v.key === "GOOGLE_CLOUD_PROJECT") return { ...v, value: projectId };
        if (v.key === "GOOGLE_CLOUD_LOCATION") return { ...v, value: region };
        if (v.key === "MODEL")
          return { ...v, value: v.value || "gemini-2.5-flash" };
        if (v.key === "GOOGLE_GENAI_USE_VERTEXAI")
          return { ...v, value: v.value || "TRUE" };
        if (v.key === "GOOGLE_CLOUD_STORAGE_BUCKET")
          return { ...v, value: selectedBucket };
        return v;
      }),
    );
  }, [projectId, region, selectedBucket]);

  const handleVarChange = (index: number, value: string) => {
    const newVars = [...envVars];
    newVars[index].value = value;
    setEnvVars(newVars);
  };

  const addLog = (msg: string) =>
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const getPreviewBuildConfig = () => {
    const bucket = selectedBucket || "[STAGING_BUCKET]";
    const objectName = `source/${agentName}-TIMESTAMP.zip`;
    const imageName = `gcr.io/${projectId}/${agentName.toLowerCase()}`;

    const envStrings = envVars.map((e) => `${e.key}=${e.value}`);
    envStrings.push(`STAGING_BUCKET=gs://${bucket}`);

    const buildSteps = [];

    if (target === "cloud_run") {
      buildSteps.push({
        name: "gcr.io/cloud-builders/docker",
        args: ["build", "-t", imageName, "."],
      });
      buildSteps.push({
        name: "gcr.io/cloud-builders/docker",
        args: ["push", imageName],
      });

      buildSteps.push({
        name: "gcr.io/google.com/cloudsdktool/cloud-sdk",
        entrypoint: "bash",
        args: ["-c", "[SEE DEPLOY SCRIPT BELOW]"],
      });
    } else {
      buildSteps.push({
        name: "python:3.10",
        entrypoint: "bash",
        args: [
          "-c",
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
      timeout: "600s",
    };
  };

  const getCloudRunDeployScript = () => {
    const imageName = `gcr.io/${projectId}/${agentName.toLowerCase()}`;
    const serviceName = agentName.toLowerCase();
    const envStrings = envVars.map((e) => `${e.key}=${e.value}`);
    envStrings.push(
      `STAGING_BUCKET=gs://${selectedBucket || "[STAGING_BUCKET]"}`,
    );

    return `#!/bin/bash
set -e
echo "Deploying Cloud Run service '${serviceName}'..."
gcloud run deploy ${serviceName} --image ${imageName} --region ${region} --allow-unauthenticated --set-env-vars "${envStrings.join(",")}"

echo "Fetching Service URL..."
SERVICE_URL=$(gcloud run services describe ${serviceName} --region ${region} --format='value(status.url)')

if [ -z "$SERVICE_URL" ]; then
    echo "Error: Could not retrieve service URL."
    exit 1
fi

echo "Detected Service URL: $SERVICE_URL"
echo "Updating service with AGENT_URL for self-discovery..."
gcloud run services update ${serviceName} --region ${region} --update-env-vars=AGENT_URL=$SERVICE_URL

echo "Deployment Complete."`;
  };

  const handleDeploy = async () => {
    setIsDeploying(true);
    setError(null);
    addLog(`Starting deployment for ${agentName}...`);

    // Use a working copy of files so we can inject code without mutating the prop
    const filesToZip = files.map((f) => ({ ...f }));

    // Note: entryModulePath is like "subfolder.agent"
    // We convert dots back to slashes to check file existence "subfolder/agent.py"
    const expectedFilename = `${entryModulePath.replace(/\./g, "/")}.py`;
    const entryFileExists = filesToZip.some((f) => f.name === expectedFilename);

    if (!entryFileExists) {
      const msg = `FATAL: The detected entry file '${expectedFilename}' (derived from '${entryModulePath}') was not found in the loaded files. Deployment cannot proceed.`;
      addLog(msg);
      setError(msg);
      setIsDeploying(false);
      return;
    }

    addLog(`Detected Entry Point: '${entryModulePath}.${entryPoint}'`);

    // --- Dependency Checks ---
    const reqsFileIndex = filesToZip.findIndex(
      (f) => f.name === "requirements.txt",
    );
    let reqsContent =
      reqsFileIndex >= 0 ? filesToZip[reqsFileIndex].content : "";
    let reqsUpdated = false;

    // Ensure google-adk is present with updated version
    if (!reqsContent.includes("google-cloud-aiplatform")) {
      reqsContent += "\ngoogle-cloud-aiplatform[adk,agent_engines]>=1.75.0";
      reqsUpdated = true;
    }
    if (!reqsContent.includes("google-adk")) {
      reqsContent += "\ngoogle-adk[eval]>=0.1.0";
      reqsUpdated = true;
    }

    // If targeting Cloud Run, we use A2A which requires uvicorn/fastapi
    if (target === "cloud_run") {
      if (!reqsContent.includes("uvicorn")) {
        reqsContent += "\nuvicorn";
        reqsUpdated = true;
      }
      if (!reqsContent.includes("fastapi")) {
        reqsContent += "\nfastapi";
        reqsUpdated = true;
      }
      if (!reqsContent.includes("a2a-sdk")) {
        reqsContent += "\na2a-sdk>=0.0.19";
        reqsUpdated = true;
      }
    }

    if (reqsFileIndex >= 0) {
      filesToZip[reqsFileIndex].content = reqsContent;
    } else {
      filesToZip.push({ name: "requirements.txt", content: reqsContent });
    }
    if (reqsUpdated)
      addLog("Updated requirements.txt with necessary dependencies.");

    try {
      // 2. Create Zip
      const zip = new JSZip();
      addLog("Files to be zipped:");
      filesToZip.forEach((f) => {
        zip.file(f.name, f.content);
        addLog(` - ${f.name} (${f.content.length} chars)`);
      });

      // Generate content based on target
      if (target === "cloud_run") {
        // Cloud Run: Generate a main.py wrapper using to_a2a
        if (!filesToZip.some((f) => f.name === "main.py")) {
          const mainPyContent = `
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
          zip.file("main.py", mainPyContent);
          addLog(
            "Generated main.py using to_a2a with CORS support for Cloud Run.",
          );
        }

        // Check/Add Dockerfile
        if (!filesToZip.some((f) => f.name === "Dockerfile")) {
          // Use uvicorn directly if main.py is set up, or just python main.py
          zip.file(
            "Dockerfile",
            `
FROM python:3.10-slim
WORKDIR /app
# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends build-essential cmake && rm -rf /var/lib/apt/lists/*
COPY . .
RUN pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt
# Ensure uvicorn is installed
RUN pip install uvicorn
CMD ["python", "main.py"]
`,
          );
          addLog("Generated Dockerfile for Cloud Run (python main.py).");
        }
      } else {
        // Reasoning Engine Target (unchanged logic but updated dependency version)
        const deployScript = `
import os
import sys
import logging
import vertexai

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
location = os.getenv("GOOGLE_CLOUD_LOCATION")
staging_bucket = os.getenv("STAGING_BUCKET")

logger.info(f"Initializing Vertex AI: project={project_id}, location={location}, staging_bucket={staging_bucket}")
vertexai.init(project=project_id, location=location, staging_bucket=staging_bucket)

sys.path.append(os.getcwd())
target_module = "${entryModulePath}"
target_object = "${entryPoint}"

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
                    # GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION are reserved by Vertex AI
                    if (key not in ["GOOGLE_CLOUD_PROJECT", "GOOGLE_CLOUD_LOCATION", "PROJECT_ID"]
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
        app_obj.__class__.__name__ == 'AdkApp' or
        app_obj.__class__.__name__ == 'SyncAgentWrapper'
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
        display_name="${agentName}"
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
        display_name="${agentName}",
    )

print(f"Deployment finished!")
print(f"Resource Name: {remote_app.resource_name}")
`;
        zip.file("deploy_re.py", deployScript);
        addLog("Generated deploy_re.py for Agent Engine deployment.");
      }

      // Generate .env file from envVars state to ensure UI values are used
      let envContent = envVars.map((e) => `${e.key}=${e.value}`).join("\n");
      if (selectedBucket) {
        envContent += `\\nSTAGING_BUCKET=gs://${selectedBucket}`;
      }
      zip.file(".env", envContent);
      addLog("Generated .env file from metadata.");

      const blob = await zip.generateAsync({ type: "blob" });

      // 3. Upload Source to GCS
      const bucket = selectedBucket;
      if (!bucket)
        throw new Error(
          "No GCS bucket selected. Please select a bucket for staging.",
        );

      const sourceObjectName = `source/${agentName}-${Date.now()}.zip`;
      addLog(`Uploading source to gs://${bucket}/${sourceObjectName}...`);
      addLog(`File size: ${(blob.size / 1024).toFixed(2)} KB`);

      const file = new File([blob], "source.zip", { type: "application/zip" });
      await api.uploadFileToGcs(bucket, sourceObjectName, file, projectId);

      // 4. Construct Cloud Build Config
      const buildConfig: any = {
        source: {
          storageSource: {
            bucket: bucket,
            object: sourceObjectName,
          },
        },
        steps: [],
        timeout: "600s",
      };

      const envStrings = envVars.map((e) => `${e.key}=${e.value}`);
      envStrings.push(`STAGING_BUCKET=gs://${bucket}`);

      if (target === "cloud_run") {
        const imageName = `gcr.io/${projectId}/${agentName.toLowerCase()}`;
        addLog(`Target Image: ${imageName}`);

        // Build Image using Docker
        buildConfig.steps.push({
          name: "gcr.io/cloud-builders/docker",
          args: ["build", "-t", imageName, "."],
        });

        // Push Image
        buildConfig.steps.push({
          name: "gcr.io/cloud-builders/docker",
          args: ["push", imageName],
        });

        // Deploy Image
        const deployScript = getCloudRunDeployScript();
        buildConfig.steps.push({
          name: "gcr.io/google.com/cloudsdktool/cloud-sdk",
          entrypoint: "bash",
          args: ["-c", deployScript],
        });
      } else {
        // Agent Engine (Reasoning Engine API)
        buildConfig.steps.push({
          name: "python:3.10",
          entrypoint: "bash",
          args: [
            "-c",
            'pip install --upgrade pip && pip install --root-user-action=ignore -r requirements.txt && pip install --root-user-action=ignore "google-cloud-aiplatform[adk,agent_engines]>=1.75.0" && python deploy_re.py',
          ],
          env: envStrings,
        });
      }

      // 5. Trigger Build
      addLog("Triggering Cloud Build...");
      const buildOp = await api.createCloudBuild(projectId, buildConfig);
      const triggeredBuildId = buildOp.metadata?.build?.id || "unknown";
      setBuildId(triggeredBuildId);

      if (onBuildTriggered && triggeredBuildId !== "unknown") {
        onBuildTriggered(triggeredBuildId);
      }

      addLog(`Build triggered! ID: ${triggeredBuildId}`);
      addLog(`Check Cloud Build console for detailed logs.`);
    } catch (err: any) {
      setError(err.message || "Deployment failed");
      addLog(`Error: ${err.message}`);
    } finally {
      setIsDeploying(false);
    }
  };

  const validatePermissions = async () => {
    setValidationStatus("validating");
    setMissingCloudBuildRoles([]);
    setMissingComputeRoles([]);
    try {
      const policy = await api.getProjectIamPolicy(projectId);
      const bindings = policy.bindings || [];

      const cloudBuildSa = `${projectNumber}@cloudbuild.gserviceaccount.com`;
      const computeSa = `${projectNumber}-compute@developer.gserviceaccount.com`;

      const requiredRoles =
        target === "cloud_run"
          ? [
              "roles/run.admin",
              "roles/iam.serviceAccountUser",
              "roles/storage.objectViewer",
            ]
          : ["roles/aiplatform.user", "roles/storage.objectViewer"];

      const missingCB: string[] = [];
      const missingComp: string[] = [];

      requiredRoles.forEach((role) => {
        const binding = bindings.find((b: any) => b.role === role);
        const members = binding ? binding.members || [] : [];

        const hasCloudBuild = members.includes(
          `serviceAccount:${cloudBuildSa}`,
        );
        const hasCompute = members.includes(`serviceAccount:${computeSa}`);

        if (!hasCloudBuild) missingCB.push(role);
        if (!hasCompute) missingComp.push(role);
      });

      setMissingCloudBuildRoles(missingCB);
      setMissingComputeRoles(missingComp);

      if (missingCB.length === 0 && missingComp.length === 0) {
        setValidationStatus("success");
      } else {
        setValidationStatus("error");
      }
    } catch (err: any) {
      console.error("Failed to validate permissions", err);
      setValidationStatus("error");
      setError(`Validation failed: ${err.message}`);
    }
  };

  const cloudBuildSa = `${projectNumber}@cloudbuild.gserviceaccount.com`;
  const computeSa = `${projectNumber}-compute@developer.gserviceaccount.com`;

  const grantPermissionsCommand = `gcloud projects add-iam-policy-binding ${projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding ${projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding ${projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/storage.objectViewer"

# If your project uses Compute SA for Cloud Build:
gcloud projects add-iam-policy-binding ${projectId} \\
  --member="serviceAccount:${computeSa}" \\
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding ${projectId} \\
  --member="serviceAccount:${computeSa}" \\
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding ${projectId} \\
  --member="serviceAccount:${computeSa}" \\
  --role="roles/storage.objectViewer"`;

  const grantRePermissionsCommand = `gcloud projects add-iam-policy-binding ${projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/aiplatform.user"

gcloud projects add-iam-policy-binding ${projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/storage.objectViewer"

# If your project uses Compute SA for Cloud Build:
gcloud projects add-iam-policy-binding ${projectId} \\
  --member="serviceAccount:${computeSa}" \\
  --role="roles/aiplatform.user"

gcloud projects add-iam-policy-binding ${projectId} \\
  --member="serviceAccount:${computeSa}" \\
  --role="roles/storage.objectViewer"`;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex justify-center items-center p-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col border border-gray-700">
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 rounded-t-xl">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="text-teal-400">Deploy Agent:</span> {agentName}
          </h2>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded-full">
              {files.length} Files Loaded
            </span>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white"
            >
              &times;
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left Pane: Tabs & Content */}
          <div className="w-1/3 bg-gray-800/50 flex flex-col border-r border-gray-700">
            <div className="flex border-b border-gray-700">
              <button
                onClick={() => setLeftTab("docs")}
                className={`flex-1 py-3 text-sm font-medium ${leftTab === "docs" ? "text-white border-b-2 border-blue-500 bg-gray-700/50" : "text-gray-400 hover:text-white"}`}
              >
                Documentation
              </button>
              <button
                onClick={() => setLeftTab("architecture")}
                className={`flex-1 py-3 text-sm font-medium ${leftTab === "architecture" ? "text-white border-b-2 border-blue-500 bg-gray-700/50" : "text-gray-400 hover:text-white"}`}
              >
                Architecture
              </button>
              <button
                onClick={() => setLeftTab("cloud_build")}
                className={`flex-1 py-3 text-sm font-medium ${leftTab === "cloud_build" ? "text-white border-b-2 border-blue-500 bg-gray-700/50" : "text-gray-400 hover:text-white"}`}
              >
                Cloud Build
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {leftTab === "docs" ? (
                readmeContent ? (
                  <div className="prose prose-invert prose-sm max-w-none">
                    <pre className="whitespace-pre-wrap font-sans text-sm text-gray-300">
                      {readmeContent}
                    </pre>
                  </div>
                ) : (
                  <div className="text-center text-gray-500 mt-10">
                    <p>No README.md found in this agent package.</p>
                  </div>
                )
              ) : leftTab === "architecture" ? (
                <div className="flex flex-col items-center space-y-6">
                  {/* Agent Node */}
                  <div className="flex flex-col items-center">
                    <div className="w-20 h-20 bg-pink-900/50 border-2 border-pink-500 rounded-full flex items-center justify-center shadow-lg shadow-pink-900/20">
                      <NodeIcon type="agent" />
                    </div>
                    <span className="mt-2 text-white font-medium text-sm">
                      Agent
                    </span>
                    <span className="text-xs text-gray-500 font-mono mt-1">
                      entry: {entryModulePath}.{entryPoint}
                    </span>
                  </div>

                  {/* Connector */}
                  {tools.length > 0 && (
                    <div className="h-8 w-0.5 bg-gray-600"></div>
                  )}

                  {/* Tools Grid */}
                  {tools.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3 w-full">
                      {tools.map((tool, i) => (
                        <div
                          key={i}
                          className="flex items-center p-3 bg-gray-700/30 border border-teal-500/30 rounded-lg"
                        >
                          <NodeIcon type="tool" />
                          <span className="ml-3 text-gray-300 text-xs font-medium">
                            {tool}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 italic mt-4">
                      No external tools detected via static analysis.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-gray-400">
                    This is the configuration payload that will be sent to the
                    Cloud Build API based on your current settings.
                  </p>
                  <div className="bg-black p-3 rounded-md overflow-x-auto border border-gray-700">
                    <pre className="text-xs text-green-300 font-mono whitespace-pre-wrap">
                      {JSON.stringify(getPreviewBuildConfig(), null, 2)}
                    </pre>
                  </div>
                  {target === "cloud_run" && (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-400 font-bold">
                        Cloud Run Deploy Script (Bash)
                      </p>
                      <div className="bg-black p-3 rounded-md overflow-x-auto border border-gray-700">
                        <pre className="text-xs text-blue-300 font-mono whitespace-pre-wrap">
                          {getCloudRunDeployScript()}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Pane: Configuration Form */}
          <div className="flex-1 p-6 overflow-y-auto bg-gray-800">
            <div className="space-y-6 max-w-2xl mx-auto">
              {/* Project Info */}
              <div className="bg-blue-900/20 border border-blue-800 p-3 rounded-md flex justify-between items-center">
                <div>
                  <p className="text-xs text-blue-300 uppercase font-semibold">
                    Target Project ID
                  </p>
                  <p className="text-sm text-white font-mono">{projectId}</p>
                </div>
                {isResolvingId && (
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-400"></div>
                )}
              </div>

              {/* Deployment Target */}
              <div>
                <h3 className="text-lg font-medium text-white mb-3">
                  1. Deployment Target
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <label
                    className={`cursor-pointer p-4 rounded-lg border-2 transition-all ${target === "cloud_run" ? "border-blue-500 bg-blue-900/20" : "border-gray-600 bg-gray-700/30 hover:border-gray-500"}`}
                  >
                    <input
                      type="radio"
                      name="target"
                      value="cloud_run"
                      checked={target === "cloud_run"}
                      onChange={() => setTarget("cloud_run")}
                      className="hidden"
                    />
                    <div className="font-bold text-white mb-1">Cloud Run</div>
                    <div className="text-xs text-gray-400">
                      Deploy as a scalable HTTP service with native A2A protocol
                      support.
                    </div>
                  </label>
                  <label
                    className={`cursor-pointer p-4 rounded-lg border-2 transition-all ${target === "reasoning_engine" ? "border-red-500 bg-red-900/20" : "border-gray-600 bg-gray-700/30 hover:border-gray-500"}`}
                  >
                    <input
                      type="radio"
                      name="target"
                      value="reasoning_engine"
                      checked={target === "reasoning_engine"}
                      onChange={() => setTarget("reasoning_engine")}
                      className="hidden"
                    />
                    <div className="font-bold text-white mb-1">
                      Agent Engine
                    </div>
                    <div className="text-xs text-gray-400">
                      Deploy to Vertex AI runtime.
                    </div>
                  </label>
                </div>
              </div>

              {/* Location */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Region
                </label>
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="w-full bg-gray-700 border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-blue-500"
                >
                  <option value="us-central1">us-central1</option>
                  <option value="europe-west1">europe-west1</option>
                  <option value="asia-east1">asia-east1</option>
                </select>
              </div>

              {/* Staging Bucket */}
              {target === "reasoning_engine" && (
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Agent Engine Staging Bucket
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={selectedBucket}
                        onChange={(e) => setSelectedBucket(e.target.value)}
                        className="w-full bg-gray-700 border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-blue-500"
                        disabled={isLoadingBuckets || isDeploying}
                      >
                        {buckets.length === 0 && (
                          <option value="">
                            {isLoadingBuckets
                              ? "Loading..."
                              : "No buckets found"}
                          </option>
                        )}
                        {buckets.map((b) => (
                          <option key={b.id} value={b.name}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={handleRefreshBuckets}
                        disabled={isLoadingBuckets || isDeploying}
                        className="px-3 bg-gray-700 hover:bg-gray-600 rounded text-white text-xs border border-gray-600"
                        title="Refresh Buckets"
                      >
                        ↻
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      GCS bucket to store the agent source code for Cloud Build.
                    </p>
                  </div>
                </div>
              )}

              {/* Env Variables */}
              <div>
                <h3 className="text-lg font-medium text-white mb-3 flex items-center">
                  2. Configuration Variables
                  <span className="ml-2 text-xs font-normal text-gray-400 bg-gray-700 px-2 py-0.5 rounded-full">
                    Parsed from .env & .env.example & {entryModulePath}.py
                  </span>
                </h3>
                <div className="space-y-3">
                  {envVars.map((v, i) => (
                    <div key={i}>
                      <label className="block text-xs font-medium text-gray-400 mb-1 flex justify-between">
                        <span>{v.key}</span>
                        <span className="flex items-center gap-2">
                          {v.source === ".env" && (
                            <span className="text-[10px] bg-green-900 text-green-200 px-1.5 rounded">
                              .env
                            </span>
                          )}
                          {v.source === ".env.example" && (
                            <span className="text-[10px] bg-yellow-900 text-yellow-200 px-1.5 rounded">
                              example
                            </span>
                          )}
                          {v.source === "code" && (
                            <span className="text-[10px] bg-gray-700 text-gray-300 px-1.5 rounded">
                              code
                            </span>
                          )}
                        </span>
                      </label>
                      <input
                        type="text"
                        value={v.value}
                        onChange={(e) => handleVarChange(i, e.target.value)}
                        className="w-full bg-gray-700 border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-teal-500 font-mono placeholder-gray-500"
                        placeholder={v.placeholder || v.description}
                      />
                    </div>
                  ))}
                  {envVars.length === 0 && (
                    <p className="text-sm text-gray-500 italic">
                      No environment variables detected in code.
                    </p>
                  )}
                </div>
              </div>

              {/* Entry Point Config */}
              <div className="bg-gray-700/30 p-3 rounded-md border border-gray-600">
                <h3 className="text-lg font-medium text-white mb-3">
                  3. Entry Point Configuration
                </h3>
                <p className="text-xs text-gray-400 mb-3">
                  Modify these values if the auto-detection failed or if you are
                  getting "ImportError" during deployment.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1">
                      Entry Module Path
                    </label>
                    <input
                      type="text"
                      value={entryModulePath}
                      onChange={(e) => setEntryModulePath(e.target.value)}
                      className="w-full bg-gray-700 border-gray-500 rounded-md px-2 py-1.5 text-xs text-white font-mono"
                      placeholder="e.g. academic_research.agent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1">
                      Entry Object Name
                    </label>
                    <input
                      type="text"
                      value={entryPoint}
                      onChange={(e) => setEntryPoint(e.target.value)}
                      className="w-full bg-gray-700 border-gray-500 rounded-md px-2 py-1.5 text-xs text-white font-mono"
                      placeholder="e.g. agent"
                    />
                  </div>
                </div>
              </div>

              {/* Logs & Errors */}
              {(logs.length > 0 || error) && (
                <div className="bg-black rounded-lg p-3 border border-gray-700 font-mono text-xs max-h-40 overflow-y-auto">
                  {error && (
                    <div className="text-red-400 mb-1">Error: {error}</div>
                  )}
                  {logs.map((log, i) => (
                    <div key={i} className="text-gray-300">
                      {log}
                    </div>
                  ))}
                  {buildId && (
                    <div className="text-green-400 mt-2">
                      Build ID: {buildId}
                    </div>
                  )}
                </div>
              )}

              {/* Cloud Build Permissions Warning (Cloud Run) */}
              {target === "cloud_run" && (
                <div className="bg-yellow-900/20 border border-yellow-700/50 p-3 rounded-md mb-4">
                  <button
                    onClick={() =>
                      setIsPermissionsExpanded(!isPermissionsExpanded)
                    }
                    className="flex items-center justify-between w-full text-left"
                  >
                    <span className="text-sm font-semibold text-yellow-200 flex items-center gap-2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Cloud Build Permissions Required
                    </span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 text-yellow-200 transition-transform ${isPermissionsExpanded ? "rotate-180" : ""}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                  {isPermissionsExpanded && (
                    <div className="mt-3">
                      <p className="text-xs text-yellow-100 mb-2">
                        Cloud Build needs <strong>Cloud Run Admin</strong>,{" "}
                        <strong>Service Account User</strong>, and{" "}
                        <strong>Storage Object Viewer</strong> roles to deploy
                        this service. Run this once in your terminal:
                      </p>
                      <div className="bg-black/50 p-2 rounded border border-yellow-900/50 relative group">
                        <pre className="text-[10px] text-yellow-50 whitespace-pre-wrap font-mono">
                          {grantPermissionsCommand}
                        </pre>
                        <button
                          onClick={() =>
                            navigator.clipboard.writeText(
                              grantPermissionsCommand,
                            )
                          }
                          className="absolute top-2 right-2 px-2 py-1 bg-yellow-900/80 hover:bg-yellow-800 text-yellow-200 text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Copy
                        </button>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <button
                          onClick={validatePermissions}
                          disabled={validationStatus === "validating"}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md transition-colors disabled:bg-gray-600"
                        >
                          {validationStatus === "validating"
                            ? "Validating..."
                            : "Validate Permissions"}
                        </button>
                        {validationStatus === "success" && (
                          <span className="text-xs text-green-400 flex items-center gap-1">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                clipRule="evenodd"
                              />
                            </svg>
                            All permissions granted!
                          </span>
                        )}
                        {validationStatus === "error" &&
                          (missingCloudBuildRoles.length > 0 ||
                            missingComputeRoles.length > 0) && (
                            <span className="text-xs text-red-400 flex flex-col items-end">
                              {missingCloudBuildRoles.length > 0 && (
                                <>
                                  <span>Missing on Cloud Build SA:</span>
                                  {missingCloudBuildRoles.map((r) => (
                                    <span key={r}>{r}</span>
                                  ))}
                                </>
                              )}
                              {missingComputeRoles.length > 0 && (
                                <>
                                  <span className="mt-1">
                                    Missing on Compute SA:
                                  </span>
                                  {missingComputeRoles.map((r) => (
                                    <span key={r}>{r}</span>
                                  ))}
                                </>
                              )}
                            </span>
                          )}
                        {validationStatus === "error" &&
                          missingCloudBuildRoles.length === 0 &&
                          missingComputeRoles.length === 0 && (
                            <span className="text-xs text-red-400">
                              Validation failed. Check console.
                            </span>
                          )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Cloud Build Permissions Warning (Reasoning Engine) */}
              {target === "reasoning_engine" && (
                <div className="bg-yellow-900/20 border border-yellow-700/50 p-3 rounded-md mb-4">
                  <button
                    onClick={() =>
                      setIsRePermissionsExpanded(!isRePermissionsExpanded)
                    }
                    className="flex items-center justify-between w-full text-left"
                  >
                    <span className="text-sm font-semibold text-yellow-200 flex items-center gap-2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Permissions Required
                    </span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 text-yellow-200 transition-transform ${isRePermissionsExpanded ? "rotate-180" : ""}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                  {isRePermissionsExpanded && (
                    <div className="mt-3">
                      <p className="text-xs text-yellow-100 mb-2">
                        Cloud Build needs <strong>Vertex AI User</strong> and{" "}
                        <strong>Storage Object Viewer</strong> roles to create
                        Agent Engines. Run this once:
                      </p>
                      <div className="bg-black/50 p-2 rounded border border-yellow-900/50 relative group">
                        <pre className="text-[10px] text-yellow-50 whitespace-pre-wrap font-mono">
                          {grantRePermissionsCommand}
                        </pre>
                        <button
                          onClick={() =>
                            navigator.clipboard.writeText(
                              grantRePermissionsCommand,
                            )
                          }
                          className="absolute top-2 right-2 px-2 py-1 bg-yellow-900/80 hover:bg-yellow-800 text-yellow-200 text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Copy
                        </button>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <button
                          onClick={validatePermissions}
                          disabled={validationStatus === "validating"}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md transition-colors disabled:bg-gray-600"
                        >
                          {validationStatus === "validating"
                            ? "Validating..."
                            : "Validate Permissions"}
                        </button>
                        {validationStatus === "success" && (
                          <span className="text-xs text-green-400 flex items-center gap-1">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                clipRule="evenodd"
                              />
                            </svg>
                            All permissions granted!
                          </span>
                        )}
                        {validationStatus === "error" &&
                          (missingCloudBuildRoles.length > 0 ||
                            missingComputeRoles.length > 0) && (
                            <span className="text-xs text-red-400 flex flex-col items-end">
                              {missingCloudBuildRoles.length > 0 && (
                                <>
                                  <span>Missing on Cloud Build SA:</span>
                                  {missingCloudBuildRoles.map((r) => (
                                    <span key={r}>{r}</span>
                                  ))}
                                </>
                              )}
                              {missingComputeRoles.length > 0 && (
                                <>
                                  <span className="mt-1">
                                    Missing on Compute SA:
                                  </span>
                                  {missingComputeRoles.map((r) => (
                                    <span key={r}>{r}</span>
                                  ))}
                                </>
                              )}
                            </span>
                          )}
                        {validationStatus === "error" &&
                          missingCloudBuildRoles.length === 0 &&
                          missingComputeRoles.length === 0 && (
                            <span className="text-xs text-red-400">
                              Validation failed. Check console.
                            </span>
                          )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Action Button */}
              <div className="pt-4">
                <button
                  onClick={handleDeploy}
                  disabled={isDeploying}
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-500 hover:to-teal-400 text-white font-bold rounded-lg shadow-lg transform transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                >
                  {isDeploying ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                      Deploying via Cloud Build...
                    </>
                  ) : (
                    <>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Launch Build & Deploy
                    </>
                  )}
                </button>
                <p className="text-center text-xs text-gray-500 mt-2">
                  Triggers a Google Cloud Build job in your project to package
                  and deploy this agent.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentDeploymentModal;
