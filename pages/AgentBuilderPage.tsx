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

import React, { useMemo } from 'react';
import CloudConsoleButton from '../components/CloudConsoleButton';
import ProjectInput from '../components/ProjectInput';
import AgentDeploymentModal from '../components/agent-catalog/AgentDeploymentModal';
import A2aDeployModal from '../components/a2a/A2aDeployModal';
import GitHubDeployModal from '../components/agent-builder/GitHubDeployModal';
import AgentRegisterModal from '../components/agent-builder/AgentRegisterModal';
import PartialResultsBanner from '../components/common/PartialResultsBanner';
import { useToast } from '../context/ToastContext';
import { toErrorMessage } from '../utils/errors';

// Modular child components
import CodePreviewPane from '../components/agent-builder/CodePreviewPane';
import A2aConfigForm from '../components/agent-builder/A2aConfigForm';
import AdkBasicSettings from '../components/agent-builder/AdkBasicSettings';
import AdkToolsConfig from '../components/agent-builder/AdkToolsConfig';
import AdkDeploymentConfig from '../components/agent-builder/AdkDeploymentConfig';

// State hook & Zip utility
import { useAgentBuilderState, DEFAULT_ADK_CONFIG } from '../hooks/useAgentBuilderState';
import {
  downloadA2aZip,
  downloadAdkZip,
  GENERATED_GITIGNORE,
  GENERATED_GCLOUDIGNORE,
} from '../utils/agentZipGenerator';

// Template generators and exports
import {
  generateMainPy,
  generateA2aEnvYaml,
  generateDockerfile,
  generateRequirementsTxt,
  generateGcloudCommand,
  generateAuthPy,
  generateToolsPy,
  hasAnyTools,
  generateMakefile,
  generateCloudBuildYaml,
  generateGithubWorkflow,
  generateCallerGithubWorkflow,
  generateTestConfig,
  generateEvalSet,
  generateAdkPythonCode,
  generateAppPy,
  generateInitPy,
  generateAdkDeployScript,
  generateAdkEnvFile,
  generateAdkRequirementsFile,
  generateAdkReadmeFile,
} from '../services/adkTemplates';
import { isValidAdkAgentName } from '../services/adkTemplates/agentName';

// Re-export all ADK & A2A types and generators for backward compatibility
export * from '../services/adkTemplates';
export { useAgentBuilderState, DEFAULT_ADK_CONFIG };

export interface AgentBuilderPageProps {
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
  const { toast } = useToast();
  const b = useAgentBuilderState({
    projectNumber,
    setProjectNumber,
    context,
    onBuildTriggered,
  });

  // A2A Code Generation (memoized to eliminate double renders on keystroke)
  const a2aGeneratedCode = useMemo(
    () => ({
      main: generateMainPy(b.a2aConfig),
      dockerfile: generateDockerfile(b.adkConfig),
      requirements: generateRequirementsTxt(),
      gcloud: generateGcloudCommand(b.a2aConfig, b.deployProjectId),
      yaml: generateA2aEnvYaml(b.a2aConfig, b.deployProjectId),
    }),
    [b.a2aConfig, b.deployProjectId, b.adkConfig]
  );

  // ADK Code Generation (memoized to eliminate ~13 regenerations per keystroke)
  const adkGeneratedCode = useMemo(() => {
    if (!isValidAdkAgentName(b.adkConfig.name)) {
      return {
        agent:
          '# Please enter a valid Agent Name (letters, numbers, underscores) to generate code.',
        env: '',
        requirements: '',
        readme: '',
        deploy_re: '',
        auth: '',
        tools: '',
        init: '',
        app: '',
      };
    }

    const agentCode = generateAdkPythonCode(b.adkConfig, true);
    const envCode = generateAdkEnvFile(
      b.adkConfig,
      b.deployProjectId || projectNumber,
      b.vertexLocation,
      b.stagingBucket
    );
    const reqsCode = generateAdkRequirementsFile(b.adkConfig);
    const readmeCode = generateAdkReadmeFile(b.adkConfig);
    const deployCode = generateAdkDeployScript(b.adkConfig);
    const authCode = generateAuthPy(b.adkConfig, b.adkConfig.allowAdcFallback);
    const toolsCode = generateToolsPy(b.adkConfig, true);
    const initCode = generateInitPy();
    return {
      app: generateAppPy(true),
      agent: agentCode,
      env: envCode,
      requirements: reqsCode,
      readme: readmeCode,
      deploy_re: deployCode,
      auth: authCode,
      tools: toolsCode,
      init: initCode,
    };
  }, [b.adkConfig, projectNumber, b.deployProjectId, b.vertexLocation, b.stagingBucket]);

  const safeGenerate = (label: string, generate: () => string): string => {
    try {
      return generate();
    } catch (err: unknown) {
      const message = toErrorMessage(err);
      return [
        `# ${label} cannot be generated with the current settings.`,
        `#`,
        `# ${message}`,
        `#`,
        `# Correct the highlighted field above and this preview will update.`,
      ].join('\n');
    }
  };

  const adkCodeDisplay = {
    app: adkGeneratedCode.app,
    agent: adkGeneratedCode.agent,
    deploy_re: adkGeneratedCode.deploy_re,
    env: adkGeneratedCode.env,
    requirements: adkGeneratedCode.requirements,
    readme: adkGeneratedCode.readme,
    auth: adkGeneratedCode.auth,
    tools: adkGeneratedCode.tools,
    init: adkGeneratedCode.init,
    makefile: safeGenerate('Makefile', () => generateMakefile(b.adkConfig)),
    dockerfile: safeGenerate('Dockerfile', () => generateDockerfile(b.adkConfig)),
    cloudbuild: safeGenerate('cloudbuild.yaml', () =>
      generateCloudBuildYaml(b.adkConfig, b.deployProjectId || 'YOUR_PROJECT_ID')
    ),
    github_deploy: safeGenerate('GitHub workflow', () => generateGithubWorkflow(b.adkConfig)),
  }[b.adkActiveTab];

  const a2aCodeDisplay = {
    main: a2aGeneratedCode.main,
    dockerfile: a2aGeneratedCode.dockerfile,
    requirements: a2aGeneratedCode.requirements,
    env: a2aGeneratedCode.yaml,
  }[b.a2aActiveTab];

  const handleDownloadA2a = async () => {
    try {
      await downloadA2aZip(b.a2aConfig, a2aGeneratedCode);
    } catch (err: unknown) {
      toast.error(`Download failed: ${toErrorMessage(err)}`);
    }
  };

  const handleDownloadAdkZip = async () => {
    try {
      await downloadAdkZip(b.adkConfig, adkGeneratedCode, b.deployProjectId || projectNumber);
    } catch (err: unknown) {
      toast.error(`Download failed: ${toErrorMessage(err)}`);
    }
  };

  const adkFilesForBuild = [
    { name: 'app.py', content: adkGeneratedCode.app },
    { name: 'agent.py', content: adkGeneratedCode.agent },
    { name: '.env', content: adkGeneratedCode.env },
    { name: 'requirements.txt', content: adkGeneratedCode.requirements },
    ...(b.adkConfig.enableOAuth ? [{ name: 'auth.py', content: adkGeneratedCode.auth }] : []),
    ...(hasAnyTools(b.adkConfig) ? [{ name: 'tools.py', content: adkGeneratedCode.tools }] : []),
    { name: 'deploy_re.py', content: adkGeneratedCode.deploy_re },
    ...(b.adkConfig.deploymentTarget === 'cloud_run'
      ? [{ name: 'Dockerfile', content: generateDockerfile(b.adkConfig) }]
      : []),
    ...(b.adkConfig.enableGraphvizRendering
      ? [
          {
            name: 'installation_scripts/install_graphviz.sh',
            content: '#!/bin/bash\napt-get update && apt-get install -y graphviz\n',
          },
        ]
      : []),
    { name: '.gitignore', content: GENERATED_GITIGNORE },
    { name: '.gcloudignore', content: GENERATED_GCLOUDIGNORE },
    { name: '.ignore', content: GENERATED_GITIGNORE },
  ];

  const a2aFilesForBuild = [
    { name: 'main.py', content: a2aGeneratedCode.main },
    { name: 'Dockerfile', content: a2aGeneratedCode.dockerfile },
    { name: 'requirements.txt', content: a2aGeneratedCode.requirements },
    { name: 'deploy.sh', content: a2aGeneratedCode.gcloud },
    { name: 'env.yaml', content: a2aGeneratedCode.yaml },
  ];

  const githubDeploymentFiles = [
    { path: 'app/app.py', content: adkGeneratedCode.app },
    { path: 'app/agent.py', content: adkGeneratedCode.agent },
    { path: 'app/.env', content: adkGeneratedCode.env },
    { path: 'app/requirements.txt', content: adkGeneratedCode.requirements },
    { path: 'app/__init__.py', content: adkGeneratedCode.init },
    { path: 'app/deploy_re.py', content: adkGeneratedCode.deploy_re },
    {
      path: 'Makefile',
      content: safeGenerate('Makefile', () => generateMakefile(b.adkConfig)),
    },
    { path: 'README.md', content: adkGeneratedCode.readme },
    { path: 'tests/eval/test_config.json', content: generateTestConfig() },
    {
      path: 'tests/eval/evalsets/basic.evalset.json',
      content: generateEvalSet(),
    },
    ...(b.adkConfig.enableGraphvizRendering
      ? [
          {
            path: 'installation_scripts/install_graphviz.sh',
            content: '#!/bin/bash\napt-get update && apt-get install -y graphviz\n',
          },
        ]
      : []),
    ...(b.adkConfig.enableOAuth
      ? [{ path: 'app/auth.py', content: adkGeneratedCode.auth }]
      : []),
    ...(hasAnyTools(b.adkConfig)
      ? [{ path: 'app/tools.py', content: adkGeneratedCode.tools }]
      : []),
    ...(b.adkConfig.deploymentTarget === 'cloud_run'
      ? [{ path: 'Dockerfile', content: generateDockerfile(b.adkConfig) }]
      : []),
    ...(b.adkConfig.enableCiCd && b.adkConfig.ciCdRunner === 'github_actions'
      ? [
          {
            path: '.github/workflows/deploy.yaml',
            content: generateGithubWorkflow(b.adkConfig),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6 flex flex-col lg:h-full">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white">ADK Prototyper & Code Studio</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Interactive ADK agent code generation, tool composition, and enterprise OAuth delegation
            blueprints.
          </p>
        </div>
        <div className="bg-gray-800 p-1 rounded-lg border border-gray-700">
          <button
            onClick={() => b.setBuilderTab('adk')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${b.builderTab === 'adk' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            ADK Agent (Engine)
          </button>
          <button
            onClick={() => b.setBuilderTab('a2a')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${b.builderTab === 'a2a' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            A2A Function (Cloud Run)
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={b.handleClearDraft}
            className="px-3 py-1 bg-red-900/30 hover:bg-red-900/50 text-xs text-red-300 rounded border border-red-700/60 transition-colors"
            title="Reset form to default state"
          >
            Clear Draft
          </button>
          <button
            onClick={b.handleCheckBuildStatus}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-xs text-gray-300 rounded border border-gray-600 transition-colors"
            title="Check for active builds if status window is missing"
          >
            Check Build Status
          </button>
        </div>
      </div>

      {b.builderPartialFailures.length > 0 && (
        <PartialResultsBanner
          partialFailures={b.builderPartialFailures}
          onRetry={b.fetchData}
        />
      )}

      {/* Deploy Modals */}
      <AgentDeploymentModal
        isOpen={b.isAdkDeployModalOpen}
        onClose={() => b.setIsAdkDeployModalOpen(false)}
        agentName={b.adkConfig.name}
        files={adkFilesForBuild}
        projectNumber={projectNumber}
        onBuildTriggered={b.handleBuildTriggered}
        initialBucket={b.stagingBucket ? b.stagingBucket.replace('gs://', '') : undefined}
      />
      <A2aDeployModal
        isOpen={b.isA2aDeployModalOpen}
        onClose={() => b.setIsA2aDeployModalOpen(false)}
        projectNumber={projectNumber}
        serviceName={b.a2aConfig.serviceName}
        region={b.a2aConfig.region}
        files={a2aFilesForBuild}
        onBuildTriggered={b.handleBuildTriggered}
      />

      <GitHubDeployModal
        isOpen={b.isGithubModalOpen}
        onClose={() => b.setIsGithubModalOpen(false)}
        projectId={b.deployProjectId}
        agentName={b.adkConfig.name}
        files={githubDeploymentFiles}
        adkConfig={b.adkConfig}
        setAdkConfig={b.setAdkConfig}
        generateCallerGithubWorkflow={generateCallerGithubWorkflow}
      />

      <AgentRegisterModal
        isOpen={b.isRegisterModalOpen}
        onClose={() => b.setIsRegisterModalOpen(false)}
        projectId={b.deployProjectId}
        projectNumber={projectNumber}
        builderTab={b.builderTab}
        agentName={b.builderTab === 'adk' ? b.adkConfig.name : b.a2aConfig.serviceName}
        agentDescription={b.builderTab === 'adk' ? b.adkConfig.description : b.a2aConfig.instruction}
        onSuccess={(msg) => {
          b.setRegistrationNotice(msg);
        }}
      />

      {b.isFixMode && b.builderTab === 'a2a' && (
        <div className="bg-yellow-900/30 border border-yellow-700 p-4 rounded-lg shrink-0">
          <h3 className="text-yellow-400 font-bold mb-1">
            Fixing Service: {b.a2aConfig.serviceName}
          </h3>
          <p className="text-sm text-gray-300">Configuration pre-filled from deployed service.</p>
        </div>
      )}

      {/* Layout Container */}
      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
        {/* Left Column: Configuration (Box 1) */}
        <div className="bg-gray-800 p-4 rounded-lg shadow-md lg:w-2/5 flex flex-col overflow-y-auto border border-gray-700">
          <div className="flex justify-between items-center mb-3 shrink-0">
            <h2 className="text-lg font-semibold text-white">1. Configure Agent</h2>
            <CloudConsoleButton
              url={`https://console.cloud.google.com/vertex-ai/agents/agent-engines?project=${projectNumber}`}
            />
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Project Number</label>
              <ProjectInput value={projectNumber} onChange={setProjectNumber} />
            </div>

            {b.builderTab === 'adk' ? (
              <>
                <AdkBasicSettings
                  adkConfig={b.adkConfig}
                  setAdkConfig={b.setAdkConfig}
                  handleAdkConfigChange={b.handleAdkConfigChange}
                  vertexLocation={b.vertexLocation}
                  setVertexLocation={b.setVertexLocation}
                  stagingBucket={b.stagingBucket}
                  setStagingBucket={b.setStagingBucket}
                  buckets={b.buckets}
                  setBuckets={b.setBuckets}
                  isLoadingBuckets={b.isLoadingBuckets}
                  setIsLoadingBuckets={b.setIsLoadingBuckets}
                  projectNumber={projectNumber}
                  handleRewrite={b.handleRewrite}
                  rewritingField={b.rewritingField}
                />
                <AdkToolsConfig
                  adkConfig={b.adkConfig}
                  setAdkConfig={b.setAdkConfig}
                  handleAdkConfigChange={b.handleAdkConfigChange}
                  deployProjectId={b.deployProjectId}
                  handleAddCustomMcp={b.handleAddCustomMcp}
                  handleUpdateCustomMcp={b.handleUpdateCustomMcp}
                  handleRemoveCustomMcp={b.handleRemoveCustomMcp}
                  handleVerifyCustomMcp={b.handleVerifyCustomMcp}
                  customMcpStatus={b.customMcpStatus}
                  authInputMode={b.authInputMode}
                  setAuthInputMode={b.setAuthInputMode}
                  authorizations={b.authorizations}
                />
                <AdkDeploymentConfig
                  adkConfig={b.adkConfig}
                  setAdkConfig={b.setAdkConfig}
                  handleAdkConfigChange={b.handleAdkConfigChange}
                  wifProviders={b.wifProviders}
                  serviceAccounts={b.serviceAccounts}
                  validationStatus={b.validationStatus}
                  validationMessage={b.validationMessage}
                  showWifInstructions={b.showWifInstructions}
                  setShowWifInstructions={b.setShowWifInstructions}
                  setIsGithubModalOpen={b.setIsGithubModalOpen}
                />
              </>
            ) : (
              <A2aConfigForm
                a2aConfig={b.a2aConfig}
                setA2aConfig={b.setA2aConfig}
                handleA2aConfigChange={b.handleA2aConfigChange}
                deployProjectId={b.deployProjectId}
                setDeployProjectId={b.setDeployProjectId}
                fetchProjectId={b.fetchProjectId}
                isResolvingId={b.isResolvingId}
                handleRewrite={b.handleRewrite}
                rewritingField={b.rewritingField}
                dataStoreSearchTerm={b.dataStoreSearchTerm}
                setDataStoreSearchTerm={b.setDataStoreSearchTerm}
                toolBuilderConfig={b.toolBuilderConfig}
                setToolBuilderConfig={b.setToolBuilderConfig}
                isLoadingDataStores={b.isLoadingDataStores}
                dataStores={b.dataStores}
                a2aSearchTerm={b.a2aSearchTerm}
                setA2aSearchTerm={b.setA2aSearchTerm}
                selectedA2aService={b.selectedA2aService}
                setSelectedA2aService={b.setSelectedA2aService}
                isLoadingServices={b.isLoadingServices}
                cloudRunServices={b.cloudRunServices}
                handleAddTool={b.handleAddTool}
                handleRemoveTool={b.handleRemoveTool}
              />
            )}
          </div>
        </div>

        {/* Right Column: Component & Code Explorer (Box 2) */}
        <CodePreviewPane
          builderTab={b.builderTab}
          adkCodeDisplay={adkCodeDisplay}
          a2aCodeDisplay={a2aCodeDisplay}
          adkConfig={b.adkConfig}
          adkActiveTab={b.adkActiveTab}
          setAdkActiveTab={b.setAdkActiveTab}
          a2aActiveTab={b.a2aActiveTab}
          setA2aActiveTab={b.setA2aActiveTab}
          adkCopySuccess={b.adkCopySuccess}
          a2aCopySuccess={b.a2aCopySuccess}
          setAdkCopySuccess={b.setAdkCopySuccess}
          setA2aCopySuccess={b.setA2aCopySuccess}
          handleCopy={b.handleCopy}
          handleDownloadAdkZip={handleDownloadAdkZip}
          handleDownloadA2a={handleDownloadA2a}
          setIsAdkDeployModalOpen={b.setIsAdkDeployModalOpen}
          setIsA2aDeployModalOpen={b.setIsA2aDeployModalOpen}
          setIsRegisterModalOpen={b.setIsRegisterModalOpen}
          registrationNotice={b.registrationNotice}
          setRegistrationNotice={b.setRegistrationNotice}
        />
      </div>
    </div>
  );
};

export default AgentBuilderPage;
