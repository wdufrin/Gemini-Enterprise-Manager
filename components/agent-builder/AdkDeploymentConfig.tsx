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

import React from 'react';
import { AdkAgentConfig } from '../../services/adkTemplates';
import { isValidAdkAgentName } from '../../services/adkTemplates/agentName';
import CloudRunAccessSelector from './CloudRunAccessSelector';

export interface AdkDeploymentConfigProps {
  adkConfig: AdkAgentConfig;
  setAdkConfig: React.Dispatch<React.SetStateAction<AdkAgentConfig>>;
  handleAdkConfigChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => void;
  wifProviders: any[];
  serviceAccounts: any[];
  validationStatus: 'unchecked' | 'testing' | 'valid' | 'invalid';
  validationMessage: string;
  showWifInstructions: boolean;
  setShowWifInstructions: React.Dispatch<React.SetStateAction<boolean>>;
  setIsGithubModalOpen: (open: boolean) => void;
}

export const AdkDeploymentConfig: React.FC<AdkDeploymentConfigProps> = ({
  adkConfig,
  setAdkConfig,
  handleAdkConfigChange,
  wifProviders,
  serviceAccounts,
  validationStatus,
  validationMessage,
  showWifInstructions,
  setShowWifInstructions,
  setIsGithubModalOpen,
}) => {
  const isSpecValid =
    isValidAdkAgentName(adkConfig.name) && Boolean(adkConfig.instruction?.trim());

  return (
    <>
      <div className="pt-2 border-t border-gray-600 mt-2 space-y-2">
        <h4 className="text-xs font-semibold text-gray-400">Cloud Run Access</h4>
        <p className="text-xs text-gray-500">
          Controls the <code className="font-mono">gcloud run deploy</code> flags in the
          generated Makefile (<code className="font-mono">make deploy-cloud-run</code>),
          used by both CI/CD runners.
        </p>
        <CloudRunAccessSelector
          groupName="adk"
          value={adkConfig.cloudRunAccess ?? 'authenticated'}
          onChange={(mode) =>
            setAdkConfig((prev) => ({ ...prev, cloudRunAccess: mode }))
          }
        />
      </div>

      <div className="pt-2 border-t border-gray-600 mt-2 space-y-2">
        <h4 className="text-xs font-semibold text-gray-400">Lifecycle Management (WIP)</h4>
        <label className="flex items-center space-x-3 cursor-pointer">
          <input
            type="checkbox"
            name="enableEvaluation"
            checked={adkConfig.enableEvaluation}
            onChange={handleAdkConfigChange}
            className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
          />
          <span className="text-sm text-gray-300">Enable Evaluation Configs</span>
        </label>

        <label className="flex items-center space-x-3 cursor-pointer">
          <input
            type="checkbox"
            name="enableCiCd"
            checked={adkConfig.enableCiCd}
            onChange={handleAdkConfigChange}
            className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
          />
          <span className="text-sm text-gray-300">Enable CI/CD Scaffolding</span>
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
                <option value="google_cloud_build">Google Cloud Build</option>
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
            {adkConfig.ciCdRunner === 'github_actions' && (
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
                      {showWifInstructions ? 'Hide setup instructions' : 'How to set up WIF'}
                    </button>
                  </div>
                  {wifProviders.length > 0 ? (
                    <select
                      name="githubWifProvider"
                      value={adkConfig.githubWifProvider || ''}
                      onChange={handleAdkConfigChange}
                      className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-xs text-gray-200 w-full"
                    >
                      <option value="">Select a WIF Provider...</option>
                      {wifProviders.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.displayName || p.name.split('/').pop()}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      name="githubWifProvider"
                      value={adkConfig.githubWifProvider || ''}
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
                      value={adkConfig.githubServiceAccount || ''}
                      onChange={handleAdkConfigChange}
                      className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-xs text-gray-200 w-full"
                    >
                      <option value="">Select a Service Account...</option>
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
                      value={adkConfig.githubServiceAccount || ''}
                      onChange={handleAdkConfigChange}
                      placeholder="sa@my-project.iam.gserviceaccount.com"
                      className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-xs text-gray-200 w-full"
                    />
                  )}
                </div>
                {validationStatus !== 'unchecked' && (
                  <div
                    className={`text-xs mt-1 ${
                      validationStatus === 'valid'
                        ? 'text-green-400'
                        : validationStatus === 'testing'
                        ? 'text-yellow-400'
                        : 'text-red-400'
                    }`}
                  >
                    {validationStatus === 'testing'
                      ? 'Validating connection...'
                      : validationMessage}
                  </div>
                )}

                {showWifInstructions && (
                  <div className="p-3 bg-gray-800 rounded border border-gray-600 mt-2 text-xs text-gray-300 font-mono overflow-x-auto whitespace-pre">
                    <div># 1. Create a Workload Identity Pool</div>
                    <div className="text-gray-400">
                      gcloud iam workload-identity-pools create &quot;github-actions&quot; \<br />{' '}
                      --project=&quot;YOUR_PROJECT_ID&quot; \<br /> --location=&quot;global&quot;{' '}
                      \<br /> --display-name=&quot;GitHub Actions Pool&quot;
                    </div>
                    <br />
                    <div># 2. Create a WIF Provider in that pool</div>
                    <div className="text-gray-400">
                      gcloud iam workload-identity-pools providers create-oidc
                      &quot;my-repo&quot; \<br /> --project=&quot;YOUR_PROJECT_ID&quot; \<br />{' '}
                      --location=&quot;global&quot; \<br />{' '}
                      --workload-identity-pool=&quot;github-actions&quot; \<br />{' '}
                      --display-name=&quot;My GitHub repo Provider&quot; \<br />{' '}
                      --attribute-mapping=&quot;google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository_owner=assertion.repository_owner&quot;{' '}
                      \<br /> --attribute-condition=&quot;attribute.repository_owner ==
                      &apos;YOUR_ORG&apos;&quot; \<br />{' '}
                      --issuer-uri=&quot;https://token.actions.githubusercontent.com&quot;
                    </div>
                    <br />
                    <div># 3. Create a Service Account</div>
                    <div className="text-gray-400">
                      gcloud iam service-accounts create &quot;github-actions-sa&quot; \<br />{' '}
                      --project=&quot;YOUR_PROJECT_ID&quot; \<br />{' '}
                      --display-name=&quot;GitHub Actions Service Account&quot;
                    </div>
                    <br />
                    <div># 4. Bind the Service Account to the WIF Provider</div>
                    <div className="text-gray-400">
                      gcloud iam service-accounts add-iam-policy-binding
                      &quot;github-actions-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com&quot; \<br />
                      --project=&quot;YOUR_PROJECT_ID&quot; \<br />
                      --role=&quot;roles/iam.workloadIdentityUser&quot; \<br />
                      --member=&quot;principalSet://iam.googleapis.com/projects/YOUR_PROJECT_NUMBER/locations/global/workloadIdentityPools/github-actions/attribute.repository_owner/YOUR_ORG&quot;
                    </div>
                  </div>
                )}

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => setIsGithubModalOpen(true)}
                    disabled={!isValidAdkAgentName(adkConfig.name)}
                    title={
                      !isValidAdkAgentName(adkConfig.name)
                        ? 'Enter a valid agent name before setting up CI/CD.'
                        : undefined
                    }
                    className="text-xs bg-gray-600 hover:bg-gray-500 text-white py-1.5 px-3 rounded flex items-center gap-1 transition-colors border border-gray-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-600"
                  >
                    <svg viewBox="0 0 16 16" className="w-3 h-3 fill-current">
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
            <span className={isSpecValid ? 'text-green-400' : 'text-gray-600'}>
              {isSpecValid ? '✓' : '○'}
            </span>
            <span className={`text-xs ${isSpecValid ? 'text-gray-300' : 'text-gray-500'}`}>
              Standard Folder Structure (app/, tests/)
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <span className={adkConfig.enableEvaluation ? 'text-green-400' : 'text-gray-600'}>
              {adkConfig.enableEvaluation ? '✓' : '○'}
            </span>
            <span
              className={`text-xs ${
                adkConfig.enableEvaluation ? 'text-gray-300' : 'text-gray-500'
              }`}
            >
              Evaluation Configured
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <span className={adkConfig.enableCiCd ? 'text-green-400' : 'text-gray-600'}>
              {adkConfig.enableCiCd ? '✓' : '○'}
            </span>
            <span
              className={`text-xs ${adkConfig.enableCiCd ? 'text-gray-300' : 'text-gray-500'}`}
            >
              CI/CD Pipeline Configured
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <span className={isSpecValid ? 'text-green-400' : 'text-gray-600'}>
              {isSpecValid ? '✓' : '○'}
            </span>
            <span className={`text-xs ${isSpecValid ? 'text-gray-300' : 'text-gray-500'}`}>
              Design Spec Generated
            </span>
          </div>
        </div>
      </div>
    </>
  );
};

export default AdkDeploymentConfig;
