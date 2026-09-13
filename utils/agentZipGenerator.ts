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

import JSZip from 'jszip';
import {
  AdkAgentConfig,
  A2aConfig,
  generateAppPy,
  generateAdkPythonCode,
  generateAdkDeployScript,
  generateAdkReadmeFile,
  generateDesignSpec,
  generateMakefile,
  generateDockerfile,
  generateTestConfigJson,
  generateEvalSetJson,
  generateLaunchScript,
  generateAdkDeployBashWrapper,
  generateCloudBuildYaml,
  generateGithubWorkflow,
  generateToolsPy,
  hasAnyTools,
} from '../services/adkTemplates';

export const GENERATED_GITIGNORE = `# Python
.venv/
venv/
__pycache__/
*.pyc
*.pkl

# Node
node_modules/
`;

export const GENERATED_GCLOUDIGNORE = `# gcloud ignore
.git/
.gitignore
__pycache__/
*.pyc
.venv/
venv/
node_modules/
`;

export interface A2aGeneratedFiles {
  main: string;
  dockerfile: string;
  requirements: string;
  gcloud: string;
  yaml: string;
}

export interface AdkGeneratedFiles {
  app: string;
  agent: string;
  env: string;
  requirements: string;
  readme: string;
  deploy_re: string;
  auth: string;
  tools: string;
  init: string;
}

export async function downloadA2aZip(
  a2aConfig: A2aConfig,
  a2aGeneratedCode: A2aGeneratedFiles
): Promise<void> {
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
}

export async function downloadAdkZip(
  adkConfig: AdkAgentConfig,
  adkGeneratedCode: AdkGeneratedFiles,
  deployProjectId: string
): Promise<void> {
  const zip = new JSZip();

  // App Directory
  const appFolder = zip.folder('app');
  if (appFolder) {
    appFolder.file('app.py', generateAppPy(true));
    appFolder.file('agent.py', generateAdkPythonCode(adkConfig, true));
    appFolder.file('requirements.txt', adkGeneratedCode.requirements);
    if (adkConfig.enableOAuth) {
      appFolder.file('auth.py', adkGeneratedCode.auth);
    }
    if (hasAnyTools(adkConfig)) {
      appFolder.file('tools.py', generateToolsPy(adkConfig, true));
    }
    appFolder.file('__init__.py', adkGeneratedCode.init);
    appFolder.file('deploy_re.py', generateAdkDeployScript(adkConfig));
  }

  // Root Files
  zip.file(
    'agent.py',
    'import os, sys\nsys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))\nfrom app.agent import root_agent\n'
  );
  zip.file('.env', adkGeneratedCode.env);
  zip.file('.gitignore', GENERATED_GITIGNORE);
  zip.file('.gcloudignore', GENERATED_GCLOUDIGNORE);
  zip.file('README.md', generateAdkReadmeFile(adkConfig));
  zip.file('DESIGN_SPEC.md', generateDesignSpec(adkConfig));
  zip.file('Makefile', generateMakefile(adkConfig));

  if (adkConfig.deploymentTarget === 'cloud_run') {
    zip.file('Dockerfile', generateDockerfile(adkConfig));
  }

  // Tests Directory
  const testsFolder = zip.folder('tests');
  if (testsFolder) {
    const evalFolder = testsFolder.folder('eval');
    if (evalFolder) {
      evalFolder.file('test_config.json', generateTestConfigJson(adkConfig));
      const evalsetsFolder = evalFolder.folder('evalsets');
      if (evalsetsFolder) {
        evalsetsFolder.file('basic.evalset.json', generateEvalSetJson(adkConfig));
      }
    }
  }

  // Deployment Directory
  const deployFolder = zip.folder('deployment');
  if (deployFolder) {
    deployFolder.file('terraform/main.tf', '# Terraform config placeholder');
  }

  // Scripts Directory
  const scriptsFolder = zip.folder('scripts');
  if (scriptsFolder) {
    scriptsFolder.file('launch_local.sh', generateLaunchScript(adkConfig));
    scriptsFolder.file('deploy.sh', generateAdkDeployBashWrapper());
  }

  if (adkConfig.enableGraphvizRendering) {
    const installScriptsFolder = zip.folder('installation_scripts');
    if (installScriptsFolder) {
      installScriptsFolder.file(
        'install_graphviz.sh',
        '#!/bin/bash\napt-get update && apt-get install -y graphviz\n'
      );
    }
  }

  if (adkConfig.ciCdRunner === 'google_cloud_build') {
    zip.file(
      'cloudbuild.yaml',
      generateCloudBuildYaml(adkConfig, deployProjectId || 'YOUR_PROJECT_ID')
    );
  } else if (adkConfig.ciCdRunner === 'github_actions') {
    const githubFolder = zip.folder('.github');
    if (githubFolder) {
      const workflowsFolder = githubFolder.folder('workflows');
      if (workflowsFolder) {
        workflowsFolder.file('deploy.yaml', generateGithubWorkflow(adkConfig));
      }
    }
  }

  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${adkConfig.name || 'adk_agent'}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
