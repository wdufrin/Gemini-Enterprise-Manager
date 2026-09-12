import React, { useState, useEffect } from 'react';
import { createGithubRepo, pushToGithub, searchReusableWorkflows, getUserRepositories } from '../../services/githubApiCache';
import * as api from '../../services/apiService';

interface GitHubDeployModalProps {
    isOpen: boolean;
    onClose: () => void;
    projectId: string;
    agentName: string;
    files: { path: string; content: string; encoding?: string }[];
    adkConfig: any; // Need access to the ADK config to build the caller workflow
    setAdkConfig?: React.Dispatch<React.SetStateAction<any>>; // Trigger real-time code regeneration 
    generateCallerGithubWorkflow: (config: any, templatePath: string, geminiAppId?: string) => string;
}

const GitHubDeployModal: React.FC<GitHubDeployModalProps> = ({ isOpen, onClose, projectId, agentName, files, adkConfig, setAdkConfig, generateCallerGithubWorkflow }) => {
    const [step, setStep] = useState<1 | 1.5 | 2 | 3>(1);
    const [token, setToken] = useState('');
    const [repoName, setRepoName] = useState(agentName || 'my-agent-repo');
    const [owner, setOwner] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reusable workflow state
    const [reusableTemplates, setReusableTemplates] = useState<any[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<string>('create_new');
    const [templateRepoName, setTemplateRepoName] = useState('actions-templates');
    const [geminiAppId, setGeminiAppId] = useState('');
    const [userRepositories, setUserRepositories] = useState<any[]>([]);

    const [engines, setEngines] = useState<any[]>([]);
    const [isLoadingEngines, setIsLoadingEngines] = useState(false);
    const [agents, setAgents] = useState<any[]>([]);
    const [isLoadingAgents, setIsLoadingAgents] = useState(false);

    useEffect(() => {
        if (!isOpen || !projectId) return;

        const fetchEngines = async () => {
            setIsLoadingEngines(true);
            try {
                const config = { projectId, appLocation: 'global', collectionId: 'default_collection' } as any;
                const res = await api.listResources('engines', config).catch(() => ({}));
                if (res.engines) {
                    setEngines(res.engines);
                }
            } catch (err) {
                console.error("Failed to fetch engines", err);
            } finally {
                setIsLoadingEngines(false);
            }
        };

        fetchEngines();
    }, [isOpen, projectId]);

    useEffect(() => {
        if (!geminiAppId || !projectId) {
            setAgents([]);
            return;
        }

        const fetchAgents = async () => {
            setIsLoadingAgents(true);
            try {
                const config = { projectId, appLocation: 'global', collectionId: 'default_collection', appId: geminiAppId } as any;
                const asstRes = await api.listResources('assistants', config).catch(() => ({}));
                let allAgents: any[] = [];
                if (asstRes.assistants) {
                    for (const assistant of asstRes.assistants) {
                        const assistantId = assistant.name.split('/').pop();
                        const agentRes = await api.listResources('agents', { ...config, assistantId }).catch(() => ({}));
                        if (agentRes.agents) {
                            allAgents = [...allAgents, ...agentRes.agents];
                        }
                    }
                }
                setAgents(allAgents);
            } catch (err) {
                console.error("Failed to fetch agents", err);
            } finally {
                setIsLoadingAgents(false);
            }
        };

        fetchAgents();
    }, [geminiAppId, projectId]);

    if (!isOpen) return null;

    const handleFetchTemplates = async () => {
        setIsProcessing(true);
        setError(null);
        try {
            const results = await searchReusableWorkflows(token, owner);
            if (results && results.items) {
                setReusableTemplates(results.items);
                if (results.items.length > 0) {
                    setSelectedTemplate(results.items[0].html_url);
                }
            }
            
            try {
                const repoResults = await getUserRepositories(token, owner);
                if (repoResults && repoResults.items) {
                    setUserRepositories(repoResults.items);
                }
            } catch (err) {
                console.warn('Failed to load user repositories', err);
            }

            // Move to template selection step
            setStep(1.5);
        } catch (e: any) {
            setError(e.message || 'Failed to fetch existing templates. Please check your token and username.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCreatePush = async () => {
        setIsProcessing(true);
        setError(null);
        try {
            let filesToPush = [...files];

            if (selectedTemplate === 'create_new') {
                // 1. Create the template repo as PUBLIC so it can be reused across repositories
                await createGithubRepo(token, templateRepoName, 'Shared GitHub Actions Templates', false);
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                // Find the deploy.yaml in files and push it to the template repo
                const deployYamlFile = files.find(f => f.path === '.github/workflows/deploy.yaml');
                if (!deployYamlFile) throw new Error("Could not find deploy.yaml to push to template repo.");

                await pushToGithub(token, owner, templateRepoName, [deployYamlFile], 'Initial template commit');

                // 2. Modify filesToPush: replace deploy.yaml with the caller workflow
                const templatePath = `${owner}/${templateRepoName}/.github/workflows/deploy.yaml@main`;
                const callerWorkflowContent = generateCallerGithubWorkflow(adkConfig, templatePath, geminiAppId);
                
                filesToPush = filesToPush.map(f => {
                    if (f.path === '.github/workflows/deploy.yaml') {
                        return { ...f, content: callerWorkflowContent };
                    }
                    if (f.path === '.env' || f.path === 'app/.env') {
                        return { ...f, content: f.content + `\nAGENT_DISPLAY_NAME="${repoName}"` };
                    }
                    return f;
                });
            } else {
                // Using an existing template
                const templateItem = reusableTemplates.find((t: any) => t.html_url === selectedTemplate);
                // Extract repository and path. The Search API item has `repository.full_name` and `path`
                const branch = templateItem?.default_branch || 'main';
                const templatePath = templateItem ? `${templateItem.repository.full_name}/${templateItem.path}@${branch}` : '';
                const callerWorkflowContent = generateCallerGithubWorkflow(adkConfig, templatePath, geminiAppId);
                
                filesToPush = filesToPush.map(f => {
                    if (f.path === '.github/workflows/deploy.yaml') {
                        return { ...f, content: callerWorkflowContent };
                    }
                    if (f.path === '.env' || f.path === 'app/.env') {
                        return { ...f, content: f.content + `\nAGENT_DISPLAY_NAME="${repoName}"` };
                    }
                    return f;
                });
            }

            // Create Agent Repo and push agent files (including the caller workflow)
            await createGithubRepo(token, repoName, `Automated Agent Deployment for ${agentName}`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            await pushToGithub(token, owner, repoName, filesToPush, 'Initial commit: Agent Starter templates');
            
            setStep(3);
        } catch (e: any) {
            setError(e.message || 'An error occurred during GitHub deployment.');
        } finally {
            setIsProcessing(false);
        }
    };

    const wifScript = `
# 1. Login to Google Cloud
gcloud auth login

# 2. Set your Project ID
export PROJECT_ID="${projectId}"
gcloud config set project $PROJECT_ID

# 3. Create the Workload Identity Pool
export POOL_ID="github-actions-pool-1" # Can be anything unique
gcloud iam workload-identity-pools create $POOL_ID \\
  --project="${projectId}" \\
  --location="global" \\
  --display-name="GitHub Actions Pool"

export WORKLOAD_IDENTITY_POOL_ID=$(gcloud iam workload-identity-pools describe $POOL_ID \\
  --project="${projectId}" \\
  --location="global" \\
  --format="value(name)")

# 4. Create the OIDC Provider for GitHub in that Pool
export PROVIDER_ID="github-provider"
export OWNER="${owner}" # Your GitHub Organization or username

gcloud iam workload-identity-pools providers create-oidc $PROVIDER_ID \\
  --project="${projectId}" \\
  --location="global" \\
  --workload-identity-pool=$POOL_ID \\
  --display-name="GitHub Provider" \\
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository_owner=assertion.repository_owner" \\
  --issuer-uri="https://token.actions.githubusercontent.com" \\
  --attribute-condition="assertion.repository_owner == '$OWNER'"

export WORKLOAD_IDENTITY_PROVIDER=$(gcloud iam workload-identity-pools providers describe $PROVIDER_ID \\
  --project="${projectId}" \\
  --location="global" \\
  --workload-identity-pool=$POOL_ID \\
  --format="value(name)")

# 5. Connect the Provider to a Service Account
export SERVICE_ACCOUNT="agent-deployer@${projectId}.iam.gserviceaccount.com"

# Create it if it doesn't exist
gcloud iam service-accounts create agent-deployer --display-name="Agent Deployment SA" || true

# Grant Roles (Customize this list as needed for your specific Agent tools)
gcloud projects add-iam-policy-binding "${projectId}" \\
  --member="serviceAccount:$SERVICE_ACCOUNT" \\
  --role="roles/aiplatform.user"

gcloud projects add-iam-policy-binding "${projectId}" \\
  --member="serviceAccount:$SERVICE_ACCOUNT" \\
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding "${projectId}" \\
  --member="serviceAccount:$SERVICE_ACCOUNT" \\
  --role="roles/storage.admin"

gcloud projects add-iam-policy-binding "${projectId}" \\
  --member="serviceAccount:$SERVICE_ACCOUNT" \\
  --role="roles/storage.objectViewer"

gcloud projects add-iam-policy-binding "${projectId}" \\
  --member="serviceAccount:$SERVICE_ACCOUNT" \\
  --role="roles/discoveryengine.editor"
  
gcloud iam service-accounts add-iam-policy-binding $SERVICE_ACCOUNT \\
  --project="${projectId}" \\
  --role="roles/iam.workloadIdentityUser" \\
  --member="principalSet://iam.googleapis.com/$WORKLOAD_IDENTITY_POOL_ID/attribute.repository_owner/$OWNER"

# Optional: Grant Roles to Cloud Build Service Account (If using Cloud Build)
export PROJECT_NUMBER=$(gcloud projects describe "${projectId}" --format="value(projectNumber)")
export CLOUD_BUILD_SA="$PROJECT_NUMBER@cloudbuild.gserviceaccount.com"

gcloud projects add-iam-policy-binding "${projectId}" \\
  --member="serviceAccount:$CLOUD_BUILD_SA" \\
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding "${projectId}" \\
  --member="serviceAccount:$CLOUD_BUILD_SA" \\
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding "${projectId}" \\
  --member="serviceAccount:$CLOUD_BUILD_SA" \\
  --role="roles/artifactregistry.admin"

# 6. Set the newly created Provider and Service Account locally in your App Settings 
echo "WIF Provider: $WORKLOAD_IDENTITY_PROVIDER"
echo "Service Account: $SERVICE_ACCOUNT"
`;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                <header className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 rounded-t-lg">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <svg viewBox="0 0 16 16" className="w-5 h-5 fill-current"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path></svg>
                        Automated CI/CD Workflow Setup
                    </h2>
                    <button onClick={onClose} disabled={isProcessing} className="text-gray-400 hover:text-white disabled:opacity-50 text-2xl leading-none">&times;</button>
                </header>

                <main className="p-6 overflow-y-auto flex-1">
                     {error && (
                        <div className="mb-4 bg-red-900/50 border border-red-500 text-red-200 p-3 rounded-md text-sm">
                            {error}
                        </div>
                    )}

                    {step === 1 && (
                        <div className="space-y-6">
                            <p className="text-gray-300">This wizard will automatically create a new repository in GitHub, push your agent&apos;s boilerplate code (including the deployment workflow), and generate the exact Workload Identity Federation (WIF) setup script for your Google Cloud Project.</p>
                            
                            <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600">
                                <label className="block text-sm font-medium text-gray-300 mb-2">GitHub Personal Access Token (PAT)</label>
                                <input 
                                    type="password" 
                                    value={token} 
                                    onChange={(e) => setToken(e.target.value)}
                                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx..." 
                                    className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                                />
                                <p className="text-xs text-gray-400 mt-2">Requires the <code className="bg-gray-800 px-1 rounded">repo</code> scope. This token is only used locally in your browser and is not stored on our servers.</p>
                            </div>

                            <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600">
                                <label className="block text-sm font-medium text-gray-300 mb-2">Repository Owner (Username/Org)</label>
                                <input 
                                    type="text" 
                                    value={owner} 
                                    onChange={(e) => setOwner(e.target.value)}
                                    placeholder="e.g. google" 
                                    className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                                />
                            </div>
                        </div>
                    )}

                    {step === 1.5 && (
                        <div className="space-y-6">
                            <p className="text-gray-300">Configure your Reusable Workflow Template and Agent Repository. By using a shared template, all your agents can deploy using the same centralized workflow file.</p>
                            
                            <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600">
                                <label className="block text-sm font-medium text-gray-300 mb-2">Workflow Template Selection</label>
                                <select 
                                    value={selectedTemplate} 
                                    onChange={(e) => setSelectedTemplate(e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                                >
                                    <option value="create_new">✨ Create New Shared Template Repository</option>
                                    {reusableTemplates && reusableTemplates.length > 0 && (
                                        <optgroup label="Existing Reusable Templates">
                                            {reusableTemplates.map((t: any) => (
                                                <option key={t.html_url} value={t.html_url}>
                                                    {t.repository.full_name}/{t.path}
                                                </option>
                                            ))}
                                        </optgroup>
                                    )}
                                </select>
                            </div>

                            {selectedTemplate === 'create_new' && (
                                <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600 border-l-4 border-l-blue-500">
                                    <label className="block text-sm font-medium text-gray-300 mb-2">New Template Repository Name</label>
                                    <input 
                                        type="text" 
                                        value={templateRepoName} 
                                        onChange={(e) => setTemplateRepoName(e.target.value)}
                                        placeholder="actions-templates" 
                                        className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                                    />
                                    <p className="text-xs text-gray-400 mt-2">We will create <code className="bg-gray-800 px-1 rounded">{owner}/{templateRepoName}</code> and push the reusable deployment workflow there.</p>
                                </div>
                            )}

                            <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600">
                                <label className="block text-sm font-medium text-gray-300 mb-2">Gemini Enterprise App ID (Optional)</label>
                                <select
                                    value={geminiAppId}
                                    onChange={(e) => {
                                        const newId = e.target.value;
                                        setGeminiAppId(newId);
                                        if (setAdkConfig) {
                                            if (newId) {
                                                setAdkConfig((prev: any) => ({
                                                    ...prev,
                                                    enableDiscoveryApi: true,
                                                    discoveryConfig: {
                                                        ...prev.discoveryConfig,
                                                        engineId: newId
                                                    }
                                                }));
                                            } else {
                                                setAdkConfig((prev: any) => ({
                                                    ...prev,
                                                    enableDiscoveryApi: false
                                                }));
                                            }
                                        }
                                    }}
                                    className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500 mb-2"
                                >
                                    <option value="">-- No Automated Publishing --</option>
                                    {isLoadingEngines ? (
                                        <option value="" disabled>Loading...</option>
                                    ) : (
                                        engines.map(e => {
                                            const id = e.name.split('/').pop();
                                            return <option key={id} value={id}>{e.displayName} ({id})</option>;
                                        })
                                    )}
                                </select>
                                <p className="text-xs text-gray-400 mt-1 mb-3">If selected, the pipeline will automatically publish the deployed agent to this Gemini Enterprise Application.</p>
                                
                                <label className="block text-sm font-medium text-gray-300 mb-2">Agent Name & Repository Destination</label>
                                <div className="flex flex-col gap-3 mb-2">
                                    <div className="flex gap-2 items-center">
                                        <div className="text-gray-400 py-1 text-xs w-24">Link Agent</div>
                                        <select
                                            value={agents.find(a => a.displayName.toLowerCase().replace(/[^a-z0-9-]/g, '-') === repoName) ? repoName : ''}
                                            onChange={(e) => {
                                                if (e.target.value) {
                                                    setRepoName(e.target.value);
                                                }
                                            }}
                                            className="flex-1 bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                                            disabled={!geminiAppId || isLoadingAgents}
                                        >
                                            <option value="">{geminiAppId ? (isLoadingAgents ? 'Loading Agents...' : '-- Select Existing App Agent --') : '-- Select an App First --'}</option>
                                            {agents.map(a => {
                                                const id = a.name.split('/').pop();
                                                const normalizedName = a.displayName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
                                                return <option key={id} value={normalizedName}>{a.displayName}</option>;
                                            })}
                                        </select>
                                    </div>
                                    <div className="flex gap-2 items-center">
                                        <div className="text-gray-400 flex-none w-24 text-xs">Target Repo</div>
                                        <select
                                            value={userRepositories.some(r => r.name === repoName) ? repoName : ''}
                                            onChange={(e) => {
                                                if (e.target.value) setRepoName(e.target.value);
                                            }}
                                            className="flex-1 bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                                            disabled={isProcessing}
                                        >
                                            <option value="">-- Select Existing GitHub Repo --</option>
                                            {userRepositories.map((r: any) => (
                                                <option key={r.id} value={r.name}>{r.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex gap-2 items-center">
                                        <div className="text-gray-400 py-1 text-xs w-24">Custom Name</div>
                                        <input 
                                            type="text" 
                                            value={repoName} 
                                            onChange={(e) => setRepoName(e.target.value)}
                                            placeholder="Type new agent repo name" 
                                            className="flex-1 bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                </div>
                                <p className="text-xs text-gray-400 mt-2">We will link the code to <code className="bg-gray-800 px-1 rounded">{owner || 'org'}/{repoName || 'repo'}</code>.</p>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                         <div className="space-y-6 flex flex-col items-center justify-center min-h-[300px]">
                            <svg className="animate-spin h-10 w-10 text-blue-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <h3 className="text-xl font-semibold text-white">Configuring GitHub...</h3>
                            <p className="text-gray-400 text-center max-w-md">Creating <span className="font-mono text-blue-300">{owner}/{repoName}</span> and pushing initial code payload.</p>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-6">
                            <div className="bg-green-900/30 border border-green-500 p-4 rounded-lg flex items-start gap-3">
                                <span className="text-green-400 text-xl">✓</span>
                                <div>
                                    <h3 className="text-green-300 font-bold mb-1">Repository Created Successfully!</h3>
                                    <p className="text-green-200/70 text-sm">Your code and GitHub Actions workflow have been pushed to <a href={`https://github.com/${owner}/${repoName}`} target="_blank" rel="noreferrer" className="underline hover:text-white">{owner}/{repoName}</a>.</p>
                                </div>
                            </div>
                            
                            <div>
                                {adkConfig?.githubWifProvider && adkConfig?.githubServiceAccount ? (
                                    <div className="bg-green-900/30 border border-green-800 p-4 rounded-lg mt-4">
                                        <h3 className="text-lg font-bold text-green-400 mb-2 flex items-center gap-2">
                                            <span>✓</span> WIF Configuration Complete
                                        </h3>
                                        <p className="text-green-300/80 text-sm">
                                            You selected <strong>{adkConfig.githubWifProvider.split('/').pop()}</strong> and <strong>{adkConfig.githubServiceAccount.split('@')[0]}</strong>. The deployment pipeline will use these credentials automatically.
                                        </p>
                                    </div>
                                ) : (
                                    <>
                                        <h3 className="text-lg font-bold text-white mb-2">Final Step: Configure GCP IAM (WIF)</h3>
                                        <p className="text-gray-400 text-sm mb-4">To allow GitHub Actions to securely deploy to Google Cloud without storing long-lived JSON keys, you must set up Workload Identity Federation. Run this script in your Cloud Shell or local terminal to provision it automatically.</p>
                                        
                                        <div className="relative">
                                            <pre className="bg-gray-900 p-4 rounded-lg overflow-x-auto text-xs text-gray-300 font-mono border border-gray-700">
                                                {wifScript.trim()}
                                            </pre>
                                            <button 
                                                onClick={() => navigator.clipboard.writeText(wifScript.trim())}
                                                className="absolute top-2 right-2 bg-gray-700 hover:bg-gray-600 text-white p-2 rounded text-xs px-3 font-semibold transition-colors"
                                            >
                                                Copy Script
                                            </button>
                                        </div>
                                        
                                        <p className="text-yellow-400/80 text-xs mt-4 italic">
                                            <span className="font-bold mr-1">Note:</span> 
                                            After running this script, it will output the <code>WIF Provider</code> and <code>Service Account</code> values. Copy those values back into the &quot;Lifecycle Management&quot; settings in the Agent Designer!
                                        </p>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                </main>

                <footer className="p-4 border-t border-gray-700 flex justify-end space-x-3 bg-gray-900 rounded-b-lg">
                    {step === 1 && (
                        <>
                            <button onClick={onClose} className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors">Cancel</button>
                            <button 
                                onClick={handleFetchTemplates} 
                                disabled={!token || !owner} 
                                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed font-semibold transition-colors flex items-center gap-2"
                            >
                                Next &rarr;
                            </button>
                        </>
                    )}
                    {step === 1.5 && (
                        <>
                            <button onClick={() => setStep(1)} className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors">Back</button>
                            <button 
                                onClick={() => { setStep(2); handleCreatePush(); }} 
                                disabled={!repoName || (selectedTemplate === 'create_new' && !templateRepoName)} 
                                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed font-semibold transition-colors flex items-center gap-2"
                            >
                                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path></svg>
                                Create & Push
                            </button>
                        </>
                    )}
                    {step === 3 && (
                        <button onClick={onClose} className="px-6 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors font-semibold">Done</button>
                    )}
                </footer>
            </div>
        </div>
    );
};

export default GitHubDeployModal;
