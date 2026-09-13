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

import { useState, useEffect } from 'react';
import { AppEngine, Config } from '../types';
import * as api from '../services/apiService';
import {
  assertValidHostname,
  assertValidGcpResourceName,
  assertValidOpaqueId,
  isValidHostname,
  isValidGcpResourceName,
} from '../services/shellSafety';
import {
  generatePrivateModeScript,
  generatePublicModeScript,
} from '../components/assistants/vanity/vanityBuildScript';

export function useVanityUrlDeployment(
  engine: AppEngine,
  config: Config,
  projectNumber: string,
  onBuildTriggered?: (buildId: string, projectId?: string) => void,
) {
  const [isDeploying, setIsDeploying] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [buildId, setBuildId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState(projectNumber);
  const [serviceName, setServiceName] = useState(() => {
    const engineId = engine.name.split('/').pop() || 'assistant';
    return `assistant-${engineId}`.substring(0, 40).replace(/[^a-z0-9-]/g, '').toLowerCase();
  });
  const [automateGLB, setAutomateGLB] = useState(false);
  const [automateDNS, setAutomateDNS] = useState(false);
  const [customDomain, setCustomDomain] = useState('');

  // Private Mode & PSC States
  const [isPrivateMode, setIsPrivateMode] = useState(false);
  const [vpcNetwork, setVpcNetwork] = useState('default');
  const [vpcSubnet, setVpcSubnet] = useState('default');
  const [autoAllocatePscIp, setAutoAllocatePscIp] = useState(false);
  const [customPscIp, setCustomPscIp] = useState('10.128.0.100');
  const [useVpcScBundle, setUseVpcScBundle] = useState(false);
  const [automatePrivateDns, setAutomatePrivateDns] = useState(true);

  // VPC Networks and Subnets List States
  const [networksList, setNetworksList] = useState<string[]>([]);
  const [subnetsList, setSubnetsList] = useState<string[]>([]);
  const [selectedNetworkOption, setSelectedNetworkOption] = useState<string>('default');
  const [selectedSubnetOption, setSelectedSubnetOption] = useState<string>('default');

  const isServiceNameValid = isValidGcpResourceName(serviceName);
  const isCustomDomainValid = !customDomain || isValidHostname(customDomain);

  // Existing Redirect Domains States
  const [existingDomains, setExistingDomains] = useState<string[]>([]);
  const [selectedDomainOption, setSelectedDomainOption] = useState<string>('new');

  useEffect(() => {
    const resolveProject = async () => {
      try {
        const p = await api.getProject(projectNumber);
        if (p.projectId) setProjectId(p.projectId);
      } catch (e) {
        console.warn('Could not resolve Project ID string');
      }
    };
    resolveProject();
  }, [projectNumber]);

  useEffect(() => {
    const fetchExistingRedirects = async () => {
      if (!projectId) return;
      try {
        const [fwdRes, certRes] = await Promise.all([
          api.listGlobalForwardingRules(projectId).catch(() => ({ items: [] })),
          api.listManagedSslCertificates(projectId).catch(() => ({ items: [] })),
        ]);

        const rules = fwdRes.items || [];
        const certs = certRes.items || [];

        const rawEngineId = engine.name.split('/').pop() || '';
        const cleanEngineId = rawEngineId.replace(/[^a-z0-9-]/g, '').toLowerCase();
        const defaultBaseName = `assistant-${cleanEngineId}`.substring(0, 40);

        const matchedRules = rules.filter(r => {
          const ruleName = r.name.toLowerCase();
          return ruleName.includes(defaultBaseName) ||
                 ruleName.includes(cleanEngineId.substring(0, 20));
        });

        const domainsSet = new Set<string>();
        matchedRules.forEach(rule => {
          const ruleBase = rule.name.replace('-fwd-rule', '');
          const cert = certs.find(c => c.name === `${ruleBase}-cert`);
          if (cert?.managed?.domains) {
            cert.managed.domains.forEach(d => domainsSet.add(d));
          }
        });

        const domainsList = Array.from(domainsSet);
        setExistingDomains(domainsList);
        if (domainsList.length > 0) {
          setSelectedDomainOption(domainsList[0]);
          setCustomDomain(domainsList[0]);
        } else {
          setSelectedDomainOption('new');
          setCustomDomain('');
        }
      } catch (e) {
        console.warn('Could not load existing redirects', e);
      }
    };
    fetchExistingRedirects();
  }, [projectId, engine.name]);

  useEffect(() => {
    const fetchNetworksAndSubnets = async () => {
      if (!projectId) return;
      try {
        const netRes = await api.listVpcNetworks(projectId).catch(() => ({ items: [] }));
        const networks = (netRes.items || []).map((n: any) => n.name);
        setNetworksList(networks);

        if (networks.includes('default')) {
          setSelectedNetworkOption('default');
          setVpcNetwork('default');
        } else if (networks.length > 0) {
          setSelectedNetworkOption(networks[0]);
          setVpcNetwork(networks[0]);
        } else {
          setSelectedNetworkOption('custom');
        }

        const activeRegion = config.appLocation === 'global' ? 'us-central1' : config.appLocation;
        const subRes = await api.listVpcSubnets(projectId, activeRegion).catch(() => ({ items: [] }));
        const subnets = (subRes.items || []).map((s: any) => s.name);
        setSubnetsList(subnets);

        if (subnets.includes('default')) {
          setSelectedSubnetOption('default');
          setVpcSubnet('default');
        } else if (subnets.length > 0) {
          setSelectedSubnetOption(subnets[0]);
          setVpcSubnet(subnets[0]);
        } else {
          setSelectedSubnetOption('custom');
        }
      } catch (e) {
        console.warn('Could not load VPC networks or subnets', e);
      }
    };
    fetchNetworksAndSubnets();
  }, [projectId, config.appLocation]);

  const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const handleDeploy = async () => {
    setIsDeploying(true);
    setError(null);
    setLogs([]);
    setBuildId(null);

    try {
      const rawEngineId = engine.name.split('/').pop() || '';
      const cleanEngineId = rawEngineId.replace(/[^a-z0-9-]/g, '').toLowerCase();
      const location = config.appLocation === 'global' ? 'us-central1' : config.appLocation;

      const pscCleanSuffix = cleanEngineId.substring(0, 12);
      const cleanNetworkName = vpcNetwork.toLowerCase().replace(/[^a-z0-9]/g, '');
      const pscIpName = `psc-ip-${cleanNetworkName.substring(0, 15)}-${pscCleanSuffix}`.substring(0, 60);

      const netSuffix = cleanNetworkName.substring(0, 4);
      const engineSuffix = cleanEngineId.replace(/[^a-z0-9]/g, '').substring(0, 10);
      const pscRuleName = `pscrl${netSuffix}${engineSuffix}`.substring(0, 20);

      let resolvedProjectId = projectId;
      if (/^\d+$/.test(resolvedProjectId)) {
        addLog(`Resolving project string ID for Number: ${resolvedProjectId}...`);
        try {
          const p = await api.getProject(resolvedProjectId);
          resolvedProjectId = p.projectId;
          setProjectId(resolvedProjectId);
        } catch (e) {
          addLog('Warning: Could not resolve project string ID, using number fallback.');
        }
      }

      addLog(`Fetching Vertex AI Search Portal UUID (CID) for engine ${rawEngineId}...`);
      let widgetConfigId = (engine as any).widgetConfigConfigId;
      if (!widgetConfigId) {
        try {
          const engineData = await api.getEngine(engine.name, config);
          widgetConfigId = (engineData as any).widgetConfigConfigId || (engineData as any)?.chatEngineConfig?.dialogflowAgentToStoreRouting?.defaultUri?.split('cid/')?.[1]?.replace(/\/$/, '') || null;
        } catch (e) {
          addLog('Warning: Could not fetch fresh engine details, trying to proceed with existing data.');
        }
      }

      if (!widgetConfigId) {
        setError('Failed to retrieve widgetConfigConfigId for the engine. Ensure the engine exists and is fully initialized.');
        addLog('ERROR: Redirect URLs require the No-Code Agent Builder to be initialized at least once to generate a workspace.');
        setIsDeploying(false);
        return;
      }

      addLog(`Discovered Portal CID: ${widgetConfigId}`);

      assertValidGcpResourceName(serviceName, 'Service name');
      assertValidOpaqueId(widgetConfigId, 'Portal widget config ID');
      if (customDomain) {
        assertValidHostname(customDomain, 'Custom domain');
      }

      const steps: Record<string, unknown>[] = [];

      if (isPrivateMode) {
        addLog('Preparing Cloud Build steps for Private PSC Endpoint & Internal Load Balancer...');
        steps.push(generatePrivateModeScript({
          pscIpName,
          pscRuleName,
          customPscIp,
          autoAllocatePscIp,
          vpcNetwork,
          useVpcScBundle,
          automatePrivateDns,
          customDomain,
          serviceName,
          location,
          widgetConfigId,
          vpcSubnet,
        }));
      } else {
        if (automateGLB && customDomain) {
          steps.push(generatePublicModeScript({
            serviceName,
            customDomain,
            widgetConfigId,
            automateDNS,
          }));
        }
      }

      const buildConfig: any = {
        steps,
        timeout: '1800s',
      };

      addLog('Triggering Cloud Build...');
      const buildOp = await api.createCloudBuild(projectId, buildConfig);
      const triggeredBuildId = buildOp.metadata?.build?.id || 'unknown';
      setBuildId(triggeredBuildId);

      if (onBuildTriggered && triggeredBuildId !== 'unknown') {
        onBuildTriggered(triggeredBuildId, projectId);
      }

      addLog(`Build triggered successfully! ID: ${triggeredBuildId}`);
      addLog('Once completed, the Redirect URL will be active.');

    } catch (err: any) {
      setError(err.message || 'Deployment failed.');
      addLog(`Error: ${err.message}`);
    } finally {
      setIsDeploying(false);
    }
  };

  return {
    isDeploying,
    logs,
    buildId,
    error,
    projectId,
    serviceName,
    setServiceName,
    automateGLB,
    setAutomateGLB,
    automateDNS,
    setAutomateDNS,
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
    handleDeploy,
  };
}
