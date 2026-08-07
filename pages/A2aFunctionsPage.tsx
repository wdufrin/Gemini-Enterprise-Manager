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


import React, { useState, useEffect } from 'react';
import { CloudRunService } from '../types';
import * as api from '../services/apiService';
import A2aDeployModal from '../components/a2a/A2aDeployModal';
import ProjectInput from '../components/ProjectInput';

declare var JSZip: any;

interface A2aConfig {
    serviceName: string;
    displayName: string;
    providerOrganization: string;
    model: 'gemini-2.5-flash' | 'gemini-2.5-pro';
    region: string;
    memory: string;
    instruction: string;
    allowUnauthenticated: boolean;
}

// --- A2A Generators ---
const generateA2aEnvYaml = (config: A2aConfig, projectId: string): string => {
    // Generate valid YAML with block scalar for the multiline description
    return `GOOGLE_CLOUD_PROJECT: "${projectId}"
GOOGLE_CLOUD_LOCATION: "${config.region}"
GOOGLE_GENAI_USE_VERTEXAI: "TRUE"
MODEL: "${config.model}"
AGENT_DISPLAY_NAME: "${config.displayName}"
PROVIDER_ORGANIZATION: "${config.providerOrganization}"
AGENT_DESCRIPTION: |
${config.instruction.split('\n').map(line => '  ' + line).join('\n')}
`.trim();
};

const generateMainPy = (instruction: string): string => `
import os
from flask import Flask, request, jsonify
import vertexai
from vertexai.generative_models import GenerativeModel, GenerationConfig
import json

# Initialization
app = Flask(__name__)

# --- CORS Configuration ---
# This allows the web-based A2A Tester to query this function.
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    return response

# Load configuration from environment variables
MODEL_NAME = os.getenv("MODEL", "gemini-2.5-flash")
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT")
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION")

# Agent card details from environment
AGENT_URL = os.getenv("AGENT_URL", "URL_NOT_SET")
AGENT_DISPLAY_NAME = os.getenv("AGENT_DISPLAY_NAME", "A2A Function")
# Use environment variable for description if available, else fallback
AGENT_DESCRIPTION = os.getenv("AGENT_DESCRIPTION", "An agent-to-agent function.")
PROVIDER_ORGANIZATION = os.getenv("PROVIDER_ORGANIZATION", "Unknown")

# This is the DEFAULT instruction if none is provided in the request
# We prefer the one from env var (which supports updates without code changes), 
# but fallback to the hardcoded string if needed.
DEFAULT_SYSTEM_INSTRUCTION = os.getenv("AGENT_DESCRIPTION", """
${instruction}
""")

# Initialize Vertex AI SDK
try:
    if PROJECT_ID and LOCATION:
        vertexai.init(project=PROJECT_ID, location=LOCATION)
except Exception as e:
    print(f"Warning: Could not initialize Vertex AI SDK: {e}")

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
        # IMPORTANT: The URL must point to the endpoint that handles POST requests.
        # We append /invoke to the base URL to match the route defined below.
        "url": f"{AGENT_URL.rstrip('/')}/invoke",
        "capabilities": {
            # The invoke endpoint is not streaming, so set to false.
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
        
    # Cloud Run's IAM integration handles the actual token validation.
    if "Authorization" not in request.headers:
        # We log a warning but don't block, in case auth is handled at the infrastructure layer
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

    # Parse A2A Message Structure: params -> message -> parts -> [ { text: "..." } ]
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

        # Call the Gemini API
        response = model.generate_content(
            [user_prompt],
            generation_config=generation_config,
        )

        result_text = response.text

        # Return response in A2A JSON-RPC format
        return jsonify({
            "jsonrpc": "2.0",
            "result": {
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

const generateDockerfile = (): string => `
# Use an official lightweight Python image.
FROM python:3.11-slim

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
google-cloud-aiplatform>=1.55.0
`;

const generateGcloudCommand = (config: A2aConfig, projectId: string): string => {
    const authFlag = config.allowUnauthenticated ? '--allow-unauthenticated' : '--no-allow-unauthenticated';
    
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
# Check if PROJECT_ID looks like a number (which causes gcloud deploy to fail)
if [[ "$PROJECT_ID" =~ ^[0-9]+$ ]]; then
  echo "⚠️  WARNING: PROJECT_ID '$PROJECT_ID' appears to be a Project Number."
  echo "   'gcloud run deploy' requires the Project ID string (e.g., 'my-project-id')."
  echo "   The script will proceed, but it may fail. Please check your configuration if it does."
  echo ""
fi

# --- Deployment ---

echo "Starting deployment of service '$SERVICE_NAME' to project '$PROJECT_ID'..."

# Step 1: Deploy the service from source code.
# Environment variables are loaded from env.yaml to handle multiline strings cleanly.
gcloud run deploy "$SERVICE_NAME" \\
  --source . \\
  --project "$PROJECT_ID" \\
  --region "$REGION" \\
  --memory "$MEMORY" \\
  --clear-base-image \\
  ${authFlag} \\
  --env-vars-file=env.yaml

echo "Initial deployment complete. Fetching service URL..."

# Step 2: Get the public URL of the newly deployed service.
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --project="$PROJECT_ID" --region="$REGION" --format='value(status.url)')

if [ -z "$SERVICE_URL" ]; then
    echo "Error: Could not retrieve the service URL. Please check the deployment status in the Google Cloud Console."
    exit 1
fi

echo "Service URL found: $SERVICE_URL"
echo "Updating service to inject its own URL..."

# Step 3: Update the service to set the AGENT_URL environment variable.
# This makes the service self-aware of its public endpoint.
gcloud run services update "$SERVICE_NAME" \\
  --project="$PROJECT_ID" \\
  --region="$REGION" \\
  --update-env-vars="AGENT_URL=$SERVICE_URL"

echo "Deployment and configuration complete."
echo "Your A2A function is now available at: $SERVICE_URL"
`;
};

interface A2aFunctionsPageProps {
  projectNumber: string;
  setProjectNumber: (projectNumber: string) => void;
  context?: any;
  onBuildTriggered?: (buildId: string) => void;
}

const A2aFunctionsPage: React.FC<A2aFunctionsPageProps> = ({ projectNumber, setProjectNumber, context, onBuildTriggered }) => {
    // --- A2A State ---
    const [a2aConfig, setA2aConfig] = useState<A2aConfig>({
        serviceName: 'my-a2a-function',
        displayName: 'My A2A Function',
        providerOrganization: 'My Company',
        model: 'gemini-2.5-flash',
        region: 'us-central1',
        memory: '1Gi',
        instruction: 'You are a helpful assistant that responds to user queries directly and concisely.',
        allowUnauthenticated: true,
    });
    
    const [deployProjectId, setDeployProjectId] = useState(projectNumber);
    const [isResolvingId, setIsResolvingId] = useState(false);
    
    const [a2aGeneratedCode, setA2aGeneratedCode] = useState({
        main: '',
        dockerfile: '',
        requirements: '',
        gcloud: '',
        yaml: '',
    });
    
    const [a2aActiveTab, setA2aActiveTab] = useState<'main' | 'dockerfile' | 'requirements' | 'env'>('main');
    const [a2aCopySuccess, setA2aCopySuccess] = useState('');
    const [isFixMode, setIsFixMode] = useState(false);
    const [isA2aDeployModalOpen, setIsA2aDeployModalOpen] = useState(false);

    
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
            setIsFixMode(true);
            const service: CloudRunService = context.serviceToEdit;
            const container = service.template?.containers?.[0];
            const envVars = container?.env || [];
            const getEnv = (key: string) => envVars.find(e => e.name === key)?.value || '';

            setA2aConfig(prev => ({
                ...prev,
                serviceName: service.name.split('/').pop() || prev.serviceName,
                region: service.location || prev.region,
                displayName: getEnv('AGENT_DISPLAY_NAME') || prev.displayName,
                providerOrganization: getEnv('PROVIDER_ORGANIZATION') || prev.providerOrganization,
                model: (getEnv('MODEL') as any) || prev.model,
                instruction: getEnv('AGENT_DESCRIPTION') || prev.instruction,
            }));
        }
    }, [context]);

    // A2A Code Generation
    useEffect(() => {
        setA2aGeneratedCode({
            main: generateMainPy(a2aConfig.instruction),
            dockerfile: generateDockerfile(),
            requirements: generateRequirementsTxt(),
            gcloud: generateGcloudCommand(a2aConfig, deployProjectId),
            yaml: generateA2aEnvYaml(a2aConfig, deployProjectId),
        });
    }, [a2aConfig, deployProjectId]);

    // --- Handlers ---
    const handleA2aConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        if (type === 'checkbox') {
             setA2aConfig(prev => ({...prev, [name]: (e.target as HTMLInputElement).checked }));
        } else if (name === 'serviceName') {
            const sanitizedValue = value.toLowerCase().replace(/[^a-z0-9-]/g, '').substring(0, 63);
            setA2aConfig(prev => ({...prev, [name]: sanitizedValue }));
        } else {
            setA2aConfig(prev => ({...prev, [name]: value as any }));
        }
    };

    const handleCopy = (content: string, setSuccess: React.Dispatch<React.SetStateAction<string>>) => {
        navigator.clipboard.writeText(content).then(() => {
            setSuccess('Copied!');
            setTimeout(() => setSuccess(''), 2000);
        });
    };

    const handleDownloadA2a = async () => {
        const zip = new JSZip();
        zip.file('main.py', a2aGeneratedCode.main);
        zip.file('Dockerfile', a2aGeneratedCode.dockerfile);
        zip.file('requirements.txt', a2aGeneratedCode.requirements);
        zip.file('deploy.sh', a2aGeneratedCode.gcloud);
        zip.file('env.yaml', a2aGeneratedCode.yaml);
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${a2aConfig.serviceName}-source.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const a2aCodeDisplay = { 
        main: a2aGeneratedCode.main, 
        dockerfile: a2aGeneratedCode.dockerfile, 
        requirements: a2aGeneratedCode.requirements,
        env: a2aGeneratedCode.yaml
    }[a2aActiveTab];

    const a2aFilesForBuild = [
        { name: 'main.py', content: a2aGeneratedCode.main },
        { name: 'Dockerfile', content: a2aGeneratedCode.dockerfile },
        { name: 'requirements.txt', content: a2aGeneratedCode.requirements },
        { name: 'deploy.sh', content: a2aGeneratedCode.gcloud },
        { name: 'env.yaml', content: a2aGeneratedCode.yaml }
    ];

    const handleBuildTriggered = (id: string) => {
        if (onBuildTriggered) onBuildTriggered(id);
        setIsA2aDeployModalOpen(false);
    };

    return (
        <div className="space-y-6 flex flex-col lg:h-full">
            <div className="flex justify-between items-center shrink-0">
                <h1 className="text-2xl font-bold text-white">A2A Function Builder</h1>
            </div>
            
            <A2aDeployModal isOpen={isA2aDeployModalOpen} onClose={() => setIsA2aDeployModalOpen(false)} projectNumber={projectNumber} serviceName={a2aConfig.serviceName} region={a2aConfig.region} files={a2aFilesForBuild} onBuildTriggered={handleBuildTriggered} />
            
            {isFixMode && (
                <div className="bg-yellow-900/30 border border-yellow-700 p-4 rounded-lg shrink-0">
                    <h3 className="text-yellow-400 font-bold mb-1">Fixing Service: {a2aConfig.serviceName}</h3>
                    <p className="text-sm text-gray-300">Configuration pre-filled from deployed service.</p>
                </div>
            )}

            {/* Layout Container */}
            <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
                
                {/* Left Column: Configuration (Box 1) */}
                <div className="bg-gray-800 p-4 rounded-lg shadow-md lg:w-1/3 flex flex-col overflow-y-auto border border-gray-700">
                    <h2 className="text-lg font-semibold text-white mb-3 shrink-0">1. Configure Function</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Project Number</label>
                            <ProjectInput value={projectNumber} onChange={setProjectNumber} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Project ID</label>
                            <div className="flex gap-2">
                                <input type="text" value={deployProjectId} onChange={(e) => setDeployProjectId(e.target.value)} className={`bg-gray-700 border rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px] ${/^\d+$/.test(deployProjectId) ? 'border-yellow-500' : 'border-gray-600'}`} placeholder="e.g. my-project-id" />
                                <button onClick={fetchProjectId} disabled={isResolvingId} className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-md text-white disabled:opacity-50">{isResolvingId ? '...' : '↻'}</button>
                            </div>
                        </div>
                        <div><label className="block text-sm font-medium text-gray-400 mb-1">Service Name</label><input name="serviceName" type="text" value={a2aConfig.serviceName} onChange={handleA2aConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]" /></div>
                        <div><label className="block text-sm font-medium text-gray-400 mb-1">Display Name</label><input name="displayName" type="text" value={a2aConfig.displayName} onChange={handleA2aConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]" /></div>
                        <div><label className="block text-sm font-medium text-gray-400 mb-1">Provider Organization</label><input name="providerOrganization" type="text" value={a2aConfig.providerOrganization} onChange={handleA2aConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]" /></div>
                        <div><label className="block text-sm font-medium text-gray-400 mb-1">Region</label><select name="region" value={a2aConfig.region} onChange={handleA2aConfigChange} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px]"><option value="us-central1">us-central1</option><option value="europe-west1">europe-west1</option><option value="asia-east1">asia-east1</option></select></div>
                        <div><label className="block text-sm font-medium text-gray-400 mb-1">System Instruction</label><textarea name="instruction" value={a2aConfig.instruction} onChange={handleA2aConfigChange} rows={4} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full" /></div>
                        <div className="bg-gray-900/50 p-2 rounded-md border border-gray-700"><label className="flex items-center space-x-3 cursor-pointer"><input type="checkbox" name="allowUnauthenticated" checked={a2aConfig.allowUnauthenticated} onChange={handleA2aConfigChange} className="h-4 w-4 bg-gray-700 border-gray-600 rounded" /><span className="text-sm text-gray-300">Allow unauthenticated invocations</span></label></div>
                    </div>
                </div>

                {/* Right Column: Code & Deploy (Box 2 & 3) */}
                <div className="flex flex-col gap-6 flex-1 min-h-0">
                    {/* Box 2: Generated Source Code */}
                    <div className="bg-gray-800 p-4 rounded-lg shadow-md flex flex-col flex-1 min-h-0 border border-gray-700">
                        <h2 className="text-lg font-semibold text-white mb-3 shrink-0">2. Generated Source Code</h2>
                        <div className="flex justify-between items-center mb-2 shrink-0">
                            <div className="flex border-b border-gray-700">
                                {['main', 'dockerfile', 'requirements', 'env'].map(tab => (
                                    <button key={tab} onClick={() => setA2aActiveTab(tab as any)} className={`px-3 py-2 text-xs font-medium transition-colors ${a2aActiveTab === tab ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400'}`}>
                                        {tab === 'main' ? 'main.py' : tab === 'dockerfile' ? 'Dockerfile' : tab === 'requirements' ? 'requirements.txt' : 'env.yaml'}
                                    </button>
                                ))}
                            </div>
                            <button onClick={() => handleCopy(a2aCodeDisplay, setA2aCopySuccess)} className="px-3 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-500">{a2aCopySuccess || 'Copy'}</button>
                        </div>
                        <div className="bg-gray-900 rounded-b-md flex-1 overflow-auto border border-gray-700">
                            <pre className="p-4 text-xs text-gray-300 whitespace-pre-wrap"><code>{a2aCodeDisplay}</code></pre>
                        </div>
                    </div>

                    {/* Box 3: Deployment Options */}
                    <div className="bg-gray-800 p-4 rounded-lg shadow-md flex flex-col flex-1 min-h-0 border border-gray-700">
                        <h2 className="text-lg font-semibold text-white mb-3 shrink-0">3. Deployment Options</h2>
                        <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto">
                            <div className="bg-blue-900/20 p-4 rounded-md border border-blue-800 shrink-0">
                                <h3 className="text-sm font-bold text-blue-300 mb-1">Option A: Cloud Build (Automated)</h3>
                                <button onClick={() => setIsA2aDeployModalOpen(true)} className="w-full mt-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-teal-500 text-white font-bold rounded-md shadow-lg flex items-center justify-center gap-2">Deploy with Cloud Build</button>
                            </div>
                            <div className="bg-gray-900/50 p-4 rounded-md border border-gray-700 flex-1 flex flex-col min-h-[150px]">
                                <div className="flex justify-between items-center mb-2 shrink-0">
                                    <h3 className="text-sm font-bold text-gray-200">Option B: Manual Deployment (CLI)</h3>
                                    <div className="flex gap-2">
                                        <button onClick={handleDownloadA2a} className="px-3 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-500">Download Source (.zip)</button>
                                        <button onClick={() => handleCopy(a2aGeneratedCode.gcloud, setA2aCopySuccess)} className="px-3 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-500">{a2aCopySuccess || 'Copy Script'}</button>
                                    </div>
                                </div>
                                <div className="bg-black rounded-md overflow-y-auto flex-1 min-h-0 border border-gray-800">
                                    <pre className="p-3 text-xs text-gray-300 whitespace-pre-wrap font-mono"><code>{a2aGeneratedCode.gcloud}</code></pre>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default A2aFunctionsPage;
