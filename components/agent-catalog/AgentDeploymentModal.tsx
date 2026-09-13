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
import JSZip from 'jszip';
import * as api from '../../services/apiService';
import {
  assertValidGcpResourceName,
  assertValidOpaqueId,
  assertValidProjectIdentifier,
  isValidHostname,
} from '../../services/shellSafety';
import { AgentDeploymentModalProps } from './types';
import {
  getCloudRunDeployScript,
  getMainPyWrapperScript,
  getPreviewBuildConfig,
  getReasoningEngineDeployScript,
} from './deploymentScripts';
import { DeploymentPreviewPane } from './DeploymentPreviewPane';
import { DeploymentPermissionsCard } from './DeploymentPermissionsCard';
import { DeploymentConfigForm } from './DeploymentConfigForm';
import { useAgentDeploymentPackage } from '../../hooks/useAgentDeploymentPackage';
import { useModalA11y } from '../../hooks/useModalA11y';

const AgentDeploymentModal: React.FC<AgentDeploymentModalProps> = ({
  isOpen,
  onClose,
  agentName,
  files,
  projectNumber,
  onBuildTriggered,
  initialBucket,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    envVars,
    handleVarChange,
    target,
    setTarget,
    region,
    setRegion,
    accessMode,
    setAccessMode,
    tools,
    readmeContent,
    projectId,
    isResolvingId,
    buckets,
    selectedBucket,
    setSelectedBucket,
    isLoadingBuckets,
    handleRefreshBuckets,
    entryPoint,
    setEntryPoint,
    entryModulePath,
    setEntryModulePath,
  } = useAgentDeploymentPackage({
    isOpen,
    files,
    projectNumber,
    initialBucket,
  });

  const [leftTab, setLeftTab] = useState<'architecture' | 'docs' | 'cloud_build'>(
    'architecture'
  );
  const [isPermissionsExpanded, setIsPermissionsExpanded] = useState(false);
  const [isRePermissionsExpanded, setIsRePermissionsExpanded] = useState(false);

  // Deployment state
  const [isDeploying, setIsDeploying] = useState(false);
  const [buildId, setBuildId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [validationStatus, setValidationStatus] = useState<
    'idle' | 'validating' | 'success' | 'error'
  >('idle');
  const [missingCloudBuildRoles, setMissingCloudBuildRoles] = useState<string[]>([]);
  const [missingComputeRoles, setMissingComputeRoles] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setBuildId(null);
    setError(null);
    setLogs([]);
    setIsDeploying(false);
    setLeftTab(readmeContent ? 'docs' : 'architecture');
    setIsPermissionsExpanded(false);
    setIsRePermissionsExpanded(false);
  }, [isOpen, readmeContent]);

  const addLog = (msg: string) =>
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const handleDeploy = async () => {
    setIsDeploying(true);
    setError(null);
    addLog(`Starting deployment for ${agentName}...`);

    const filesToZip = files.map((f) => ({ ...f }));
    const expectedFilename = `${entryModulePath.replace(/\./g, '/')}.py`;
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
    const reqsFileIndex = filesToZip.findIndex((f) => f.name === 'requirements.txt');
    let reqsContent = reqsFileIndex >= 0 ? filesToZip[reqsFileIndex].content : '';
    let reqsUpdated = false;

    if (!reqsContent.includes('google-cloud-aiplatform')) {
      reqsContent += '\ngoogle-cloud-aiplatform[adk,agent_engines]>=1.75.0';
      reqsUpdated = true;
    }
    if (!reqsContent.includes('google-adk')) {
      reqsContent += '\ngoogle-adk[eval]>=0.1.0';
      reqsUpdated = true;
    }
    if (/(^|\r?\n)\s*mcp\s*(\r?\n|$)/.test(reqsContent)) {
      reqsContent = reqsContent.replace(
        /(^|\r?\n)\s*mcp\s*(\r?\n|$)/g,
        '$1mcp>=1.24.0,<2.0.0$2'
      );
      reqsUpdated = true;
    }

    if (target === 'cloud_run') {
      if (!reqsContent.includes('uvicorn')) {
        reqsContent += '\nuvicorn';
        reqsUpdated = true;
      }
      if (!reqsContent.includes('fastapi')) {
        reqsContent += '\nfastapi';
        reqsUpdated = true;
      }
      if (!reqsContent.includes('a2a-sdk')) {
        reqsContent += '\na2a-sdk>=0.0.19';
        reqsUpdated = true;
      }
    }

    if (reqsFileIndex >= 0) {
      filesToZip[reqsFileIndex].content = reqsContent;
    } else {
      filesToZip.push({ name: 'requirements.txt', content: reqsContent });
    }
    if (reqsUpdated) {
      addLog('Updated requirements.txt with necessary dependencies.');
    }

    try {
      if (target === 'cloud_run') {
        assertValidGcpResourceName(agentName.toLowerCase(), 'Agent name');
        assertValidProjectIdentifier(projectId, 'Project ID');
        assertValidGcpResourceName(region, 'Region');
        envVars.forEach((v) =>
          assertValidOpaqueId(v.key, `Environment variable name "${v.key}"`)
        );
        if (selectedBucket && !isValidHostname(selectedBucket)) {
          assertValidOpaqueId(selectedBucket, 'Staging bucket');
        }
      }

      // 2. Create Zip
      const zip = new JSZip();
      addLog('Files to be zipped:');
      filesToZip.forEach((f) => {
        zip.file(f.name, f.content);
        addLog(` - ${f.name} (${f.content.length} chars)`);
      });

      if (target === 'cloud_run') {
        if (!filesToZip.some((f) => f.name === 'main.py')) {
          zip.file('main.py', getMainPyWrapperScript(entryModulePath, entryPoint));
          addLog('Generated main.py using to_a2a with CORS support for Cloud Run.');
        }

        if (!filesToZip.some((f) => f.name === 'Dockerfile')) {
          zip.file(
            'Dockerfile',
            `
FROM python:3.11-slim
WORKDIR /app
COPY . .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir uvicorn fastapi
CMD ["python", "main.py"]
`
          );
          addLog('Generated Dockerfile for Cloud Run (python main.py).');
        }
      } else {
        const existingDeployFile = filesToZip.find(
          (f) => f.name === 'deploy_re.py' || f.name.endsWith('/deploy_re.py')
        );
        if (existingDeployFile) {
          addLog('Using existing deploy_re.py from package.');
        } else {
          zip.file(
            'deploy_re.py',
            getReasoningEngineDeployScript(entryModulePath, entryPoint, agentName)
          );
          addLog('Generated deploy_re.py for Agent Engine deployment.');
        }
      }

      let envContent = envVars.map((e) => `${e.key}=${e.value}`).join('\n');
      if (selectedBucket) {
        envContent += (envContent ? '\n' : '') + `STAGING_BUCKET=gs://${selectedBucket}`;
      }
      zip.file('.env', envContent);
      addLog('Generated .env file from metadata.');

      const blob = await zip.generateAsync({ type: 'blob' });

      // 3. Upload Source to GCS
      const bucket = selectedBucket;
      if (!bucket) {
        throw new Error('No GCS bucket selected. Please select a bucket for staging.');
      }

      const sourceObjectName = `source/${agentName}-${Date.now()}.zip`;
      addLog(`Uploading source to gs://${bucket}/${sourceObjectName}...`);
      addLog(`File size: ${(blob.size / 1024).toFixed(2)} KB`);

      const file = new File([blob], 'source.zip', { type: 'application/zip' });
      await api.uploadFileToGcs(bucket, sourceObjectName, file, projectId);

      // 4. Construct Cloud Build Config
      const buildConfig: {
        source: {
          storageSource: {
            bucket: string;
            object: string;
          };
        };
        steps: {
          name: string;
          args: string[];
          entrypoint?: string;
          env?: string[];
        }[];
        timeout: string;
      } = {
        source: {
          storageSource: {
            bucket: bucket,
            object: sourceObjectName,
          },
        },
        steps: [],
        timeout: '1200s',
      };

      const envStrings = envVars.map((e) => `${e.key}=${e.value}`);
      envStrings.push(`STAGING_BUCKET=gs://${bucket}`);
      if (!envVars.some((e) => e.key === 'DEPLOYMENT_LOCATION' && e.value)) {
        envStrings.push('DEPLOYMENT_LOCATION=us-central1');
      }

      if (target === 'cloud_run') {
        const imageName = `${region}-docker.pkg.dev/${projectId}/cloud-run-source-deploy/${agentName.toLowerCase()}`;
        addLog(`Target Image: ${imageName}`);

        buildConfig.steps.push({
          name: 'gcr.io/cloud-builders/docker',
          args: ['build', '-t', imageName, '.'],
        });

        buildConfig.steps.push({
          name: 'gcr.io/cloud-builders/docker',
          args: ['push', imageName],
        });

        const deployScript = getCloudRunDeployScript(
          region,
          projectId,
          agentName,
          envVars,
          selectedBucket,
          accessMode
        );
        buildConfig.steps.push({
          name: 'gcr.io/google.com/cloudsdktool/cloud-sdk',
          entrypoint: 'bash',
          args: ['-c', deployScript],
        });
      } else {
        buildConfig.steps.push({
          name: 'python:3.11',
          entrypoint: 'bash',
          args: [
            '-c',
            'pip install --upgrade pip && pip install --root-user-action=ignore -r requirements.txt && pip install --root-user-action=ignore "google-cloud-aiplatform[adk,agent_engines]>=1.75.0" && python deploy_re.py',
          ],
          env: envStrings,
        });
      }

      // 5. Trigger Build
      addLog('Triggering Cloud Build...');
      const buildOp = await api.createCloudBuild(projectId, buildConfig);
      const triggeredBuildId = buildOp.metadata?.build?.id || 'unknown';
      setBuildId(triggeredBuildId);

      if (onBuildTriggered && triggeredBuildId !== 'unknown') {
        onBuildTriggered(triggeredBuildId);
      }

      addLog(`Build triggered! ID: ${triggeredBuildId}`);
      addLog(`Check Cloud Build console for detailed logs.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Deployment failed';
      setError(msg);
      addLog(`Error: ${msg}`);
    } finally {
      setIsDeploying(false);
    }
  };

  const validatePermissions = async () => {
    setValidationStatus('validating');
    setMissingCloudBuildRoles([]);
    setMissingComputeRoles([]);
    try {
      const policy = await api.getProjectIamPolicy(projectId);
      const bindings = policy.bindings || [];

      const cloudBuildSa = `${projectNumber}@cloudbuild.gserviceaccount.com`;
      const computeSa = `${projectNumber}-compute@developer.gserviceaccount.com`;

      const requiredRoles =
        target === 'cloud_run'
          ? [
              'roles/run.admin',
              'roles/iam.serviceAccountUser',
              'roles/storage.objectViewer',
            ]
          : ['roles/aiplatform.user', 'roles/storage.objectViewer'];

      const missingCB: string[] = [];
      const missingComp: string[] = [];

      requiredRoles.forEach((role) => {
        const binding = bindings.find((b) => b.role === role);
        const members = binding ? binding.members || [] : [];

        const hasCloudBuild = members.includes(`serviceAccount:${cloudBuildSa}`);
        const hasCompute = members.includes(`serviceAccount:${computeSa}`);

        if (!hasCloudBuild) missingCB.push(role);
        if (!hasCompute) missingComp.push(role);
      });

      setMissingCloudBuildRoles(missingCB);
      setMissingComputeRoles(missingComp);

      if (missingCB.length === 0 && missingComp.length === 0) {
        setValidationStatus('success');
      } else {
        setValidationStatus('error');
      }
    } catch (err: unknown) {
      console.error('Failed to validate permissions', err);
      setValidationStatus('error');
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Validation failed: ${msg}`);
    }
  };

  useModalA11y({
    isOpen,
    onClose,
    containerRef,
    preventClose: isDeploying,
  });

  if (!isOpen) return null;

  const previewConfig = getPreviewBuildConfig(
    selectedBucket,
    agentName,
    region,
    projectId,
    envVars,
    target
  );

  const cloudRunScript = getCloudRunDeployScript(
    region,
    projectId,
    agentName,
    envVars,
    selectedBucket,
    accessMode
  );

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-80 z-50 flex justify-center items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agent-deployment-modal-title"
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
          <h2 id="agent-deployment-modal-title" className="text-xl font-bold text-white flex items-center gap-2">
            <span className="text-teal-400">Deploy Agent:</span> {agentName}
          </h2>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded-full">
              {files.length} Files Loaded
            </span>
            <button
              type="button"
              onClick={onClose}
              disabled={isDeploying}
              aria-label="Close dialog"
              className="text-gray-400 hover:text-white"
            >
              &times;
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left Pane: Tabs & Content */}
          <DeploymentPreviewPane
            leftTab={leftTab}
            setLeftTab={setLeftTab}
            readmeContent={readmeContent}
            entryModulePath={entryModulePath}
            entryPoint={entryPoint}
            tools={tools}
            target={target}
            previewBuildConfig={previewConfig}
            cloudRunDeployScript={cloudRunScript}
          />

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

              {/* Deployment Configuration Form */}
              <DeploymentConfigForm
                target={target}
                setTarget={setTarget}
                accessMode={accessMode}
                setAccessMode={setAccessMode}
                region={region}
                setRegion={setRegion}
                selectedBucket={selectedBucket}
                setSelectedBucket={setSelectedBucket}
                buckets={buckets}
                isLoadingBuckets={isLoadingBuckets}
                isDeploying={isDeploying}
                onRefreshBuckets={handleRefreshBuckets}
                entryModulePath={entryModulePath}
                setEntryModulePath={setEntryModulePath}
                entryPoint={entryPoint}
                setEntryPoint={setEntryPoint}
                envVars={envVars}
                onVarChange={handleVarChange}
              />

              {/* Logs & Errors */}
              {(logs.length > 0 || error) && (
                <div className="bg-black rounded-lg p-3 border border-gray-700 font-mono text-xs max-h-40 overflow-y-auto">
                  {error && <div className="text-red-400 mb-1">Error: {error}</div>}
                  {logs.map((log, i) => (
                    <div key={i} className="text-gray-300">
                      {log}
                    </div>
                  ))}
                  {buildId && (
                    <div className="text-green-400 mt-2">Build ID: {buildId}</div>
                  )}
                </div>
              )}

              {/* Cloud Build Permissions Warnings & Validation */}
              <DeploymentPermissionsCard
                target={target}
                projectId={projectId}
                projectNumber={projectNumber}
                isPermissionsExpanded={isPermissionsExpanded}
                setIsPermissionsExpanded={setIsPermissionsExpanded}
                isRePermissionsExpanded={isRePermissionsExpanded}
                setIsRePermissionsExpanded={setIsRePermissionsExpanded}
                validationStatus={validationStatus}
                missingCloudBuildRoles={missingCloudBuildRoles}
                missingComputeRoles={missingComputeRoles}
                onValidatePermissions={validatePermissions}
              />

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
                  Triggers a Google Cloud Build job in your project to package and
                  deploy this agent.
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
