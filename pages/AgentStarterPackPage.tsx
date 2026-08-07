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
import * as api from '../services/apiService';
import { Config } from '../types';
import ProjectInput from '../components/ProjectInput';
import WizardStepper from '../components/agent-starter-pack/WizardStepper';
import StepTemplate from '../components/agent-starter-pack/StepTemplate';
import StepConfig from '../components/agent-starter-pack/StepConfig';
import StepAdvanced from '../components/agent-starter-pack/StepAdvanced';
import StepDeploy from '../components/agent-starter-pack/StepDeploy';
import StepCustomize from '../components/agent-starter-pack/StepCustomize';

import { SampleService, SampleAgent, SampleFile } from '../services/sampleService';

export interface Template {
    id: string;
    name: string;
    description: string;
    icon: React.ReactNode;
    commandTemplate: string;
    resources: string[]; // List of GCP resources this template provisions
}

export const TEMPLATES: Template[] = [
    {
        id: 'adk',
        name: 'Standard ADK Agent',
        description: 'A production-ready agent using the Agent Development Kit (ADK). Best for general purpose agents.',
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
        ),
        commandTemplate: 'uvx --from agent-starter-pack agent-starter-pack create {agentName} --template adk_agent --model {model} --project {project}',
        resources: ['Vertex AI Agent Engine', 'Cloud Storage (Artifacts)', 'Service Account (Agent Identity)', 'Cloud Logging']
    },
    {
        id: 'a2a',
        name: 'Agent-to-Agent (A2A)',
        description: 'An agent designed to call other agents or be called by them. Uses the A2A protocol.',
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
        ),
        commandTemplate: 'uvx --from agent-starter-pack agent-starter-pack create {agentName} --template adk_a2a --model {model} --project {project}',
        resources: ['Cloud Run Service', 'Vertex AI Agent Engine (Optional)', 'Service Account (Agent Identity)', 'Cloud Pub/Sub (Async)']
    },
    {
        id: 'rag',
        name: 'Agentic RAG',
        description: 'An agent optimized for Retrieval Augmented Generation (RAG) with grounded answers.',
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
        ),
        commandTemplate: 'uvx --from agent-starter-pack agent-starter-pack create {agentName} --template agentic_rag --model {model} --project {project}',
        resources: ['Vertex AI Agent Engine', 'Vertex AI Search (Discovery Engine)', 'Cloud Storage (Data Source)', 'Service Account']
    },
    {
        id: 'langgraph',
        name: 'LangGraph Agent',
        description: 'A complex agent using LangGraph for stateful multi-actor orchestration.',
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
        ),
        commandTemplate: 'uvx --from agent-starter-pack agent-starter-pack create {agentName} --template langgraph --model {model} --project {project}',
        resources: ['Vertex AI Agent Engine', 'LangGraph Runtime', 'Cloud Firestore (Checkpoints)', 'Service Account']
    },
    {
        id: 'multimodal_live',
        name: 'Multimodal Live Agent',
        description: 'Real-time audio/video agent using Gemini Multimodal Live API via WebSockets.',
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
        ),
        commandTemplate: 'uvx --from agent-starter-pack agent-starter-pack create {agentName} --template adk_live --model {model} --project {project}',
        resources: ['Vertex AI Live API', 'Cloud Run (WebSocket Server)', 'Cloud Redis (Session Store)', 'Load Balancer (Optional)']
    }
];

const MODEL_OPTIONS = ['Gemini 2.5 Flash', 'Gemini 2.5 Pro'];

interface AgentStarterPackPageProps {
    projectNumber: string;
    accessToken: string;
    onBuildTriggered: (buildId: string, projectId?: string) => void;
}

const AgentStarterPackPage: React.FC<AgentStarterPackPageProps> = ({ projectNumber, accessToken, onBuildTriggered }) => {
    // --- State ---
    const [currentStep, setCurrentStep] = useState(1);
    // const [activeBuildId, setActiveBuildId] = useState<string | null>(null); // REMOVED

    // Step 1: Template / Sample
    const [sourceType, setSourceType] = useState<'template' | 'sample'>('template');
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
    const [samples, setSamples] = useState<SampleAgent[]>([]);
    const [selectedSample, setSelectedSample] = useState<SampleAgent | null>(null);
    const [isLoadingSamples, setIsLoadingSamples] = useState(false);

    // Step 2: Config
    const [agentName, setAgentName] = useState('my-agent');
    const [projectId, setProjectId] = useState(projectNumber); // Default to passed project number
    const [location, setLocation] = useState('us-central1');
    const [model, setModel] = useState('Gemini 2.5 Flash');

    // Step 3: Customize (New)
    // Files are stored in generatedFiles

    // Step 4: Advanced Options
    const [includeFrontend, setIncludeFrontend] = useState(false);
    const [enableAnalytics, setEnableAnalytics] = useState(false);
    const [enableRedis, setEnableRedis] = useState(false);
    const [gcsBucket, setGcsBucket] = useState('');
    const [dataStoreId, setDataStoreId] = useState('');

    // Step 5: Deploy
    const [command, setCommand] = useState('');
    const [isDeploying, setIsDeploying] = useState(false);
    const [generatedFiles, setGeneratedFiles] = useState<{ path: string, content: string, encoding?: 'utf-8' | 'base64' }[]>([]);

    // --- Effects ---
    // Update projectId if projectNumber prop changes
    useEffect(() => {
        if (projectNumber) setProjectId(projectNumber);
    }, [projectNumber]);

    // Fetch Samples on load
    useEffect(() => {
        const fetchSamples = async () => {
            setIsLoadingSamples(true);
            try {
                const service = new SampleService(accessToken);
                const data = await service.getSamples();
                setSamples(data);
            } catch (e) {
                console.error('Failed to fetch samples', e);
            } finally {
                setIsLoadingSamples(false);
            }
        };
        fetchSamples();
    }, [accessToken]);

    // Update CLI Command
    useEffect(() => {
        let cmd = '';
        if (sourceType === 'template') {
            const template = TEMPLATES.find(t => t.id === selectedTemplateId);
            if (template) {
                cmd = template.commandTemplate
                    .replace('{agentName}', agentName)
                    .replace('{project}', projectId)
                    .replace('{model}', model.toLowerCase().replace(/ /g, '-').replace('.', '-')); // basic sanitization

                // Append Advanced Options flags
                if (includeFrontend) cmd += ' --include-frontend';
                if (enableAnalytics) cmd += ' --enable-analytics';
                if (enableRedis) cmd += ' --enable-redis';

                // Prepend Env Vars for Data Sources if set
                let prefix = '';
                if (gcsBucket) prefix += `export GCS_BUCKET="${gcsBucket}" && `;
                if (dataStoreId) prefix += `export DATA_STORE_ID="${dataStoreId}" && `;
                cmd = prefix + cmd;
            }
        } else if (sourceType === 'sample' && selectedSample) {
            // For samples, users clone and run deploy
            cmd = `# Clone the sample\ngit clone https://github.com/google/adk-samples.git\ncd adk-samples/python/agents/${selectedSample.name}\n\n# Install Dependencies\npip install .\n\n# Deploy\npython deployment/deploy.py --create --project_id=${projectId} --location=${location} --bucket=${gcsBucket || 'YOUR_STAGING_BUCKET'}`;
        }
        setCommand(cmd);
    }, [sourceType, selectedTemplateId, selectedSample, agentName, projectId, model, includeFrontend, enableAnalytics, enableRedis, gcsBucket, dataStoreId, location]);

    // To simulate "File Generation" for GitHub push, we'll create a basic structure in memory
    // In a real app, we would fetch these from a backend or generate them properly
    // File Generation / Fetching
    useEffect(() => {
        if (sourceType === 'template') {
            const timestamp = new Date().toISOString();
            const safeModel = model.toLowerCase().replace(/ /g, '-');

            const files = [
                {
                    path: 'README.md',
                    content: `# ${agentName}\n\nGenerated by Agent Starter Pack on ${timestamp}.\n\n## Template: ${selectedTemplateId}\n## Model: ${model}\n\n## CI/CD Setup\nThis repository includes a GitHub Actions workflow to deploy your agent to Google Cloud Run.\n\n### Prerequisites\n1.  **Create a Service Account** in GCP with permissions to deploy to Cloud Run and pull from Artifact Registry.\n2.  **Download the JSON Key** for this Service Account.\n3.  **Add GitHub Secret**:\n    - Go to **Settings > Secrets and variables > Actions** in this repository.\n    - Click **New repository secret**.\n    - Name: \`GCP_SA_KEY\`\n    - Value: Paste the content of your JSON key file.\n`
                },
                {
                    path: 'requirements.txt',
                    content: `google-cloud-aiplatform>=1.38.0\ngoogle-generativeai\npython-dotenv\n`
                },
                {
                    path: '.env.example',
                    content: `GOOGLE_CLOUD_PROJECT=${projectId}\nGOOGLE_CLOUD_LOCATION=${location}\nMODEL=${safeModel}\n${gcsBucket ? `GCS_BUCKET=${gcsBucket}\n` : ''}${dataStoreId ? `DATA_STORE_ID=${dataStoreId}\n` : ''}`
                },
                {
                    path: 'agent.py',
                    content: `import os\nfrom vertexai.preview import reasoning_engines\n\nmodel = "${safeModel}"\n\ndef agent(input: str):\n    """A simple agent."""\n    return f"Processing: {input}"\n`
                },
                {
                    path: 'app.py',
                    content: `from agent import agent\nimport uvicorn\nfrom fastapi import FastAPI\n\napp = FastAPI()\n\n@app.get("/")\ndef root():\n    return {"status": "ok"}\n\nif __name__ == "__main__":\n    uvicorn.run(app, host="0.0.0.0", port=8080)\n`
                },
                {
                    path: '.github/workflows/deploy.yml',
                    content: `name: Deploy to Cloud Run

on:
  push:
    branches:
      - main
  workflow_dispatch:

env:
  PROJECT_ID: ${projectId}
  REGION: ${location}
  SERVICE_NAME: ${agentName}

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: 'read'
      id-token: 'write'

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      # Setup gcloud CLI
      # Alternative: Use Workload Identity Federation (WIF) - Recommended for production
      # For now, we use a Service Account Key stored in secrets
      # ACTION REQUIRED: You must set the 'GCP_SA_KEY' secret in your GitHub Repository settings!
      - id: 'auth'
        uses: 'google-github-actions/auth@v2'
        with:
          credentials_json: '\${{ secrets.GCP_SA_KEY }}'

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      - name: Deploy to Cloud Run
        run: |
          gcloud run deploy \${{ env.SERVICE_NAME }} \\
            --source . \\
            --region \${{ env.REGION }} \\
            --allow-unauthenticated \\
            --project \${{ env.PROJECT_ID }}
`
                }
            ];

            if (includeFrontend) {
                files.push({
                    path: 'frontend/App.js',
                    content: `// Sample Frontend`
                });
                files.push({
                    path: 'frontend/package.json',
                    content: `{\n  "name": "${agentName}-frontend",\n  "version": "0.1.0"\n}`
                });
            }
            setGeneratedFiles(files);
        } else if (sourceType === 'sample' && selectedSample) {
            // Fetch Sample Files
            const fetchFiles = async () => {
                try {
                    const service = new SampleService(accessToken);
                    const files = await service.getSampleFiles(selectedSample.name);

                    // Inject Cloud Build config if missing? 
                    // For now, we trust the sample content + manual cloudbuild injection during deploy if needed.
                    // Actually, let's inject a standard cloudbuild.yaml for samples to support "Deploy" button.
                    const cloudbuildYaml = `
steps:
- name: 'python:3.11'
  entrypoint: 'bash'
  args:
    - '-c'
    - |
      pip install uv
      uv sync --frozen || pip install .
      python deployment/deploy.py --create --project_id=$PROJECT_ID --location=$LOCATION --bucket=$_STAGING_BUCKET
  env:
    - 'PROJECT_ID=$PROJECT_ID'
    - 'LOCATION=$LOCATION'
    - '_STAGING_BUCKET=\${_STAGING_BUCKET}'
`;
                    files.push({ path: 'cloudbuild.yaml', content: cloudbuildYaml, encoding: 'utf-8' });

                    const deployYml = `name: Deploy Sample Agent

on:
  push:
    branches:
      - main
  workflow_dispatch:

env:
  PROJECT_ID: ${projectId}
  LOCATION: ${location}
  STAGING_BUCKET: ${gcsBucket || 'YOUR_STAGING_BUCKET'}

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: 'read'
      id-token: 'write'

    steps:
      - uses: actions/checkout@v4

      # Setup gcloud CLI
      # ACTION REQUIRED: You must set the 'GCP_SA_KEY' secret in your GitHub Repository settings!
      - id: 'auth'
        uses: 'google-github-actions/auth@v2'
        with:
          credentials_json: '\${{ secrets.GCP_SA_KEY }}'

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install Dependencies
        run: |
          pip install uv
          uv sync --frozen || pip install .

      - name: Run Deploy Script
        run: |
          python deployment/deploy.py --create --project_id=\${{ env.PROJECT_ID }} --location=\${{ env.LOCATION }} --bucket=\${{ env.STAGING_BUCKET }}
`;
                    files.push({ path: '.github/workflows/deploy.yml', content: deployYml, encoding: 'utf-8' });

                    setGeneratedFiles(files);
                } catch (e) {
                    console.error('Failed to fetch sample files', e);
                }
            };
            fetchFiles();
        }

    }, [sourceType, selectedSample, agentName, projectId, model, location, selectedTemplateId, includeFrontend, gcsBucket, dataStoreId, accessToken]);


    // --- Handlers ---
    const handleNext = () => {
        if (currentStep < 5) setCurrentStep(prev => prev + 1);
    };

    const handleBack = () => {
        if (currentStep > 1) setCurrentStep(prev => prev - 1);
    };

    const canProceed = () => {
        if (currentStep === 1) {
            return sourceType === 'template' ? !!selectedTemplateId : !!selectedSample;
        }
        if (currentStep === 2) return !!agentName && !!projectId;
        // Step 3 (Customize) and 4 (Advanced) are usually valid defaults
        return true;
    };

    const handleDeploy = async () => {
        setIsDeploying(true);
        try {
            // Construct Cloud Build Config
            const buildConfig: any = {
                steps: [
                    {
                        name: 'python:3.11',
                        entrypoint: 'bash',
                        args: ['-c', 'pip install uv && ' + command] // Run the CLI command
                    }
                ],
                timeout: "600s"
            };

            const buildOp = await api.createCloudBuild(projectId, buildConfig);
            const buildId = buildOp.metadata?.build?.id;

            if (buildId) {
                // setActiveBuildId(buildId); // REMOVED
                onBuildTriggered(buildId, projectId);
            } else {
                alert('Build triggered but ID missing.');
            }

        } catch (e: any) {
            alert(`Deployment failed: ${e.message}`);
        } finally {
            setIsDeploying(false);
        }
    };

    // --- Render Helpers ---
    const renderStepContent = () => {
        switch (currentStep) {
            case 1:
                return (
                    <div className="space-y-6">
                        <div className="flex space-x-4 mb-6">
                            <button
                                onClick={() => setSourceType('template')}
                                className={`px-4 py-2 rounded-lg font-medium transition-colors ${sourceType === 'template' ? 'bg-teal-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                            >
                                Standard Templates
                            </button>
                            <button
                                onClick={() => setSourceType('sample')}
                                className={`px-4 py-2 rounded-lg font-medium transition-colors ${sourceType === 'sample' ? 'bg-teal-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                            >
                                ADK Samples
                            </button>
                        </div>

                        {sourceType === 'template' ? (
                            <StepTemplate
                                templates={TEMPLATES}
                                selectedTemplateId={selectedTemplateId}
                                onSelect={setSelectedTemplateId}
                            />
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {isLoadingSamples ? (
                                    <div className="text-gray-400 col-span-3 text-center py-10">Loading samples from GitHub...</div>
                                ) : (
                                    samples.map(sample => (
                                        <div
                                            key={sample.name}
                                            onClick={() => setSelectedSample(sample)}
                                            className={`cursor-pointer p-4 rounded-xl border transition-all ${selectedSample?.name === sample.name ? 'bg-teal-900/40 border-teal-500 shadow-teal-900/20 shadow-lg' : 'bg-gray-800 border-gray-700 hover:border-gray-600 hover:bg-gray-750'}`}
                                        >
                                            <h3 className="text-lg font-semibold text-white mb-2">{sample.name}</h3>
                                            <p className="text-gray-400 text-sm">ADK Sample Agent</p>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                );
            case 2:
                return (
                    <StepConfig
                        agentName={agentName}
                        setAgentName={setAgentName}
                        projectId={projectId}
                        setProjectId={setProjectId}
                        location={location}
                        setLocation={setLocation}
                        model={model}
                        setModel={setModel}
                        modelOptions={MODEL_OPTIONS}
                        // Disable model selection for samples for now, as it's hardcoded in agent.py
                        disableModel={sourceType === 'sample'}
                    />
                );
            case 3:
                return (
                    <StepCustomize
                        config={{ projectId, appLocation: location } as unknown as Config} // Minimal config for API
                        files={generatedFiles}
                        setFiles={setGeneratedFiles}
                        onNext={handleNext}
                        onBack={handleBack}
                    />
                );
            case 4:
                return (
                    <StepAdvanced
                        includeFrontend={includeFrontend}
                        setIncludeFrontend={setIncludeFrontend}
                        enableAnalytics={enableAnalytics}
                        setEnableAnalytics={setEnableAnalytics}
                        enableRedis={enableRedis}
                        setEnableRedis={setEnableRedis}
                        gcsBucket={gcsBucket}
                        setGcsBucket={setGcsBucket}
                        dataStoreId={dataStoreId}
                        setDataStoreId={setDataStoreId}
                    />
                );
            case 5:
                const selectedTemplate = TEMPLATES.find(t => t.id === selectedTemplateId) || { name: selectedSample?.name || 'Sample', resources: [] } as any;
                return (
                    <StepDeploy
                        template={selectedTemplate}
                        agentName={agentName}
                        projectId={projectId}
                        model={model}
                        advancedOptions={{ includeFrontend, enableAnalytics, enableRedis, gcsBucket, dataStoreId }}
                        cliCommand={command}
                        onCopyCommand={() => navigator.clipboard.writeText(command)}
                        onDeploy={handleDeploy}
                        isDeploying={isDeploying}
                        files={generatedFiles}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <div className="h-full flex flex-col p-6 max-w-7xl mx-auto w-full relative">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">Agent Starter Pack</h1>
                <p className="text-gray-400 text-lg">
                    Build production-ready agents in minutes.
                </p>
            </div>

            {/* Stepper */}
            <WizardStepper
                currentStep={currentStep}
                steps={['Select Source', 'Configuration', 'Customize', 'Capabilities', 'Deploy']}
                onStepClick={(step) => {
                    // Only allow clicking previous steps or current step
                    if (step < currentStep) setCurrentStep(step);
                }}
            />

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto min-h-0 bg-gray-900/50 rounded-xl p-6 border border-gray-800">
                {renderStepContent()}
            </div>

            {/* Footer Actions */}
            <div className="mt-6 flex justify-between pt-6 border-t border-gray-800">
                <button
                    onClick={handleBack}
                    disabled={currentStep === 1}
                    className="px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-0 text-gray-400 hover:text-white hover:bg-gray-800"
                >
                    &larr; Back
                </button>

                {currentStep < 5 && (
                    <button
                        onClick={handleNext}
                        disabled={!canProceed()}
                        className="px-8 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-semibold shadow-lg shadow-teal-900/30 transition-all flex items-center gap-2"
                    >
                        Next &rarr;
                    </button>
                )}
            </div>
        </div>
    );
};

export default AgentStarterPackPage;
