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
import { AppEngine, Config } from '../../types';
import InfoTooltip from '../InfoTooltip';
import { useVanityUrlDeployment } from '../../hooks/useVanityUrlDeployment';
import { PublicRoutingConfig } from './vanity/PublicRoutingConfig';
import { PrivateRoutingConfig } from './vanity/PrivateRoutingConfig';

export interface VanityUrlDeploymentFormProps {
  engine: AppEngine;
  config: Config;
  projectNumber: string;
  onBuildTriggered?: (buildId: string, projectId?: string) => void;
}

export const VanityUrlDeploymentForm: React.FC<VanityUrlDeploymentFormProps> = ({
  engine,
  config,
  projectNumber,
  onBuildTriggered,
}) => {
  const {
    isDeploying,
    logs,
    buildId,
    error,
    projectId,
    numericProjectNumber,
    serviceName,
    setServiceName,
    portalCid,
    setPortalCid,
    isResolvingCid,
    isInitializingWebApp,
    webAppEnabled,
    handleInitializeWebApp,
    enablingApis,
    handleEnableRequiredApis,
    missingBuildSaRoles,
    isGrantingBuildRoles,
    handleGrantBuildSaRoles,
    automateGLB,
    setAutomateGLB,
    automateDNS,
    setAutomateDNS,
    dnsProjectId,
    setDnsProjectId,
    isDnsProjectIdValid,
    customDomain,
    setCustomDomain,
    isPrivateMode,
    setIsPrivateMode,
    vpcNetwork,
    setVpcNetwork,
    vpcSubnet,
    setVpcSubnet,
    autoAllocatePscIp,
    setAutoAllocatePscIp,
    customPscIp,
    setCustomPscIp,
    useVpcScBundle,
    setUseVpcScBundle,
    automatePrivateDns,
    setAutomatePrivateDns,
    networksList,
    subnetsList,
    selectedNetworkOption,
    setSelectedNetworkOption,
    selectedSubnetOption,
    setSelectedSubnetOption,
    isServiceNameValid,
    isCustomDomainValid,
    existingDomains,
    selectedDomainOption,
    setSelectedDomainOption,
    discoveryWarnings,
    clearDiscoveryWarnings,
    handleDeploy,
  } = useVanityUrlDeployment(engine, config, projectNumber, onBuildTriggered);

  const hasDisabledApiWarning = Boolean(
    discoveryWarnings?.some(
      (w) =>
        w.includes('SERVICE_DISABLED') ||
        w.toLowerCase().includes('has not been used in project') ||
        w.includes('compute.googleapis.com') ||
        w.includes('dns.googleapis.com')
    )
  );

  return (
    <div className="bg-gray-800 shadow-xl rounded-lg p-6 mb-6 border border-gray-700 animate-fade-in-up">
      <h2 className="text-xl font-bold text-white mb-2">Deploy Redirect & Private Routing URL</h2>
      <p className="text-gray-400 text-sm mb-6">
        Provision a branded redirect URL or private VPC-SC routing for your Gemini Enterprise Assistant.
      </p>

      {discoveryWarnings && discoveryWarnings.length > 0 && (
        <div
          data-testid="vanity-discovery-warning"
          role="alert"
          className="mb-4 p-3.5 bg-amber-950/40 border border-amber-700/80 rounded-md text-xs text-amber-200 flex items-start justify-between gap-3"
        >
          <div className="space-y-1 flex-1 min-w-0">
            <div className="font-semibold text-amber-100">
              Partial Cloud Networking Discovery Warning
            </div>
            <ul className="list-disc list-inside space-y-0.5 break-words">
              {discoveryWarnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {hasDisabledApiWarning && (
              <button
                type="button"
                onClick={() => handleEnableRequiredApis()}
                disabled={enablingApis || isDeploying}
                className="px-2.5 py-1 text-xs font-semibold rounded bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50"
              >
                {enablingApis ? 'Enabling APIs...' : 'Enable Networking & DNS APIs'}
              </button>
            )}
            <button
              type="button"
              onClick={clearDiscoveryWarnings}
              className="px-2 py-1 text-xs font-medium rounded bg-amber-900/60 hover:bg-amber-800 text-amber-100"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {missingBuildSaRoles && missingBuildSaRoles.length > 0 && (
        <div
          data-testid="vanity-build-sa-warning"
          role="alert"
          className="mb-6 p-3.5 bg-indigo-950/50 border border-indigo-700/80 rounded-md text-xs text-indigo-200 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="space-y-1 flex-1 min-w-0">
            <div className="font-semibold text-indigo-100">
              Cloud Build Service Account IAM Roles Needed
            </div>
            <p className="text-indigo-200/90 leading-relaxed">
              Cloud Build runs as{' '}
              <code className="bg-indigo-900/60 px-1 py-0.5 rounded font-mono">
                {numericProjectNumber || projectNumber}-compute@developer.gserviceaccount.com
              </code>{' '}
              and requires{' '}
              <code className="bg-indigo-900/60 px-1 py-0.5 rounded font-mono">
                {missingBuildSaRoles.join(', ')}
              </code>{' '}
              to provision Load Balancer and DNS resources. These roles will be granted automatically
              during pre-flight when you click Deploy, or you can grant them now:
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleGrantBuildSaRoles()}
            disabled={isGrantingBuildRoles || isDeploying}
            className="px-3 py-1.5 text-xs font-semibold rounded bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 shrink-0"
          >
            {isGrantingBuildRoles ? 'Granting IAM Roles...' : 'Grant Cloud Build IAM Roles'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Configuration Column */}
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Service Name
              <InfoTooltip text="The name for the underlying Load Balancer & DNS resources. Must start with a lowercase letter." />
            </label>
            <input
              type="text"
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              aria-invalid={!isServiceNameValid}
              className={`w-full bg-gray-700 rounded-md shadow-sm text-gray-200 py-2 px-3 border ${
                isServiceNameValid
                  ? 'border-gray-600 focus:ring-blue-500 focus:border-blue-500'
                  : 'border-red-500 focus:ring-red-500 focus:border-red-500'
              }`}
              disabled={isDeploying}
            />
            {!isServiceNameValid && (
              <p className="mt-1 text-xs text-red-400">
                Must start with a lowercase letter and contain only lowercase letters, numbers and
                hyphens (63 characters maximum).
              </p>
            )}
          </div>

          <div className="bg-gray-900/70 border border-gray-700 rounded-md p-3.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="portal-cid-input"
                className="block text-xs font-semibold text-gray-300 uppercase tracking-wider"
              >
                Target Portal CID (Web App Workspace)
                <InfoTooltip text="The Vertex AI Search / Gemini Enterprise Web App configuration ID (cid). Auto-discovered from default_search_widget_config or auto-initialized on deploy. You can also paste a full https://vertexaisearch.cloud.google.com/.../cid/... link." />
              </label>
              <div className="flex items-center gap-2">
                {isResolvingCid ? (
                  <span className="px-2 py-0.5 text-[11px] rounded bg-slate-800 text-slate-300 border border-slate-700">
                    Detecting CID...
                  </span>
                ) : portalCid ? (
                  <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-emerald-950/60 text-emerald-300 border border-emerald-700/60">
                    {webAppEnabled ? 'Web App Active' : 'CID Resolved'}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-amber-950/60 text-amber-300 border border-amber-700/60">
                    Will Auto-Initialize on Deploy
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleInitializeWebApp()}
                  disabled={isInitializingWebApp || isDeploying}
                  className="px-2.5 py-1 text-xs font-medium rounded bg-blue-600/80 hover:bg-blue-600 text-white disabled:opacity-50 transition-colors"
                >
                  {isInitializingWebApp
                    ? 'Initializing...'
                    : portalCid
                      ? 'Re-detect / Verify'
                      : 'Auto-Initialize Web App'}
                </button>
              </div>
            </div>
            <input
              id="portal-cid-input"
              type="text"
              value={portalCid}
              onChange={(e) => setPortalCid(e.target.value)}
              placeholder="Auto-detected from WidgetConfig (or paste Portal CID / Web App URL)"
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-xs font-mono text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              disabled={isDeploying}
            />
            {portalCid && (
              <p className="text-[11px] text-gray-400 font-mono truncate">
                Redirects to: https://vertexaisearch.cloud.google.com/u/0/home/cid/{portalCid}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Routing Mode
              <InfoTooltip text="Choose between public redirection or private enterprise deployment with PSC and DNS overrides." />
            </label>
            <div className="flex items-center space-x-6 mt-2">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="routingMode"
                  checked={!isPrivateMode}
                  onChange={() => setIsPrivateMode(false)}
                  className="form-radio h-4 w-4 text-blue-500 border-slate-600 bg-slate-800 focus:ring-blue-500"
                  disabled={isDeploying}
                />
                <span className="text-sm text-gray-300">Public Redirect (Global LB)</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="routingMode"
                  checked={isPrivateMode}
                  onChange={() => setIsPrivateMode(true)}
                  className="form-radio h-4 w-4 text-purple-500 border-slate-600 bg-slate-800 focus:ring-purple-500"
                  disabled={isDeploying}
                />
                <span className="text-sm text-purple-300 font-medium">
                  Private Enterprise (PSC & VPC)
                </span>
              </label>
            </div>
          </div>

          {!isPrivateMode ? (
            <PublicRoutingConfig
              automateGLB={automateGLB}
              setAutomateGLB={setAutomateGLB}
              automateDNS={automateDNS}
              setAutomateDNS={setAutomateDNS}
              dnsProjectId={dnsProjectId}
              setDnsProjectId={setDnsProjectId}
              isDnsProjectIdValid={isDnsProjectIdValid}
              currentProjectId={projectId}
              selectedDomainOption={selectedDomainOption}
              setSelectedDomainOption={setSelectedDomainOption}
              customDomain={customDomain}
              setCustomDomain={setCustomDomain}
              existingDomains={existingDomains}
              isCustomDomainValid={isCustomDomainValid}
              isDeploying={isDeploying}
            />
          ) : (
            <PrivateRoutingConfig
              isDeploying={isDeploying}
              selectedNetworkOption={selectedNetworkOption}
              setSelectedNetworkOption={setSelectedNetworkOption}
              vpcNetwork={vpcNetwork}
              setVpcNetwork={setVpcNetwork}
              networksList={networksList}
              selectedSubnetOption={selectedSubnetOption}
              setSelectedSubnetOption={setSelectedSubnetOption}
              vpcSubnet={vpcSubnet}
              setVpcSubnet={setVpcSubnet}
              subnetsList={subnetsList}
              autoAllocatePscIp={autoAllocatePscIp}
              setAutoAllocatePscIp={setAutoAllocatePscIp}
              customPscIp={customPscIp}
              setCustomPscIp={setCustomPscIp}
              useVpcScBundle={useVpcScBundle}
              setUseVpcScBundle={setUseVpcScBundle}
              automatePrivateDns={automatePrivateDns}
              setAutomatePrivateDns={setAutomatePrivateDns}
              dnsProjectId={dnsProjectId}
              setDnsProjectId={setDnsProjectId}
              isDnsProjectIdValid={isDnsProjectIdValid}
              currentProjectId={projectId}
              selectedDomainOption={selectedDomainOption}
              setSelectedDomainOption={setSelectedDomainOption}
              customDomain={customDomain}
              setCustomDomain={setCustomDomain}
              existingDomains={existingDomains}
              isCustomDomainValid={isCustomDomainValid}
            />
          )}

          <div className="pt-2">
            <button
              onClick={handleDeploy}
              disabled={
                isDeploying ||
                !serviceName ||
                !isServiceNameValid ||
                !isDnsProjectIdValid ||
                (isPrivateMode ? Boolean(customDomain) && !isCustomDomainValid : !customDomain || !isCustomDomainValid) ||
                (!isPrivateMode && !automateGLB)
              }
              className={`w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors ${
                isPrivateMode
                  ? 'bg-purple-600 hover:bg-purple-700 focus:ring-purple-500'
                  : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500'
              }`}
            >
              {isDeploying ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Deploying...
                </span>
              ) : isPrivateMode ? (
                'Deploy Private PSC & Redirect'
              ) : (
                'Deploy Redirect URL'
              )}
            </button>
          </div>

          {error && (
            <div className="p-3 bg-red-900/30 border border-red-800 rounded-md text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Logs Column */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Deployment Status
          </label>
          <div className="bg-gray-900 border border-gray-700 rounded-md p-4 h-64 overflow-y-auto font-mono text-xs text-gray-300">
            {logs.length === 0 ? (
              <span className="text-gray-500 italic">Ready to deploy. Logs will appear here.</span>
            ) : (
              <ul className="space-y-1">
                {logs.map((log, i) => (
                  <li key={i}>{log}</li>
                ))}
              </ul>
            )}
            {buildId && (
              <div className="mt-4 pt-4 border-t border-gray-700 text-blue-400">
                Build Triggered! You can track the progress in Cloud Build:
                <br />
                <strong className="break-all">{buildId}</strong>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VanityUrlDeploymentForm;
