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
  assertValidIpv4Address,
  isValidHostname,
  isValidGcpResourceName,
} from '../services/shellSafety';
import {
  generatePrivateModeScript,
  generatePublicModeScript,
} from '../components/assistants/vanity/vanityBuildScript';

export function extractPortalCid(rawInput?: string | null): string {
  if (!rawInput || typeof rawInput !== 'string') return '';
  const trimmed = rawInput.trim();
  if (!trimmed) return '';
  const cidMatch = trimmed.match(/\/cid\/([a-zA-Z0-9._-]+)/i);
  if (cidMatch && cidMatch[1]) {
    return cidMatch[1];
  }
  const queryMatch = trimmed.match(/[?&]cid=([a-zA-Z0-9._-]+)/i);
  if (queryMatch && queryMatch[1]) {
    return queryMatch[1];
  }
  return trimmed;
}

export function extractCidFromResources(engineObj?: any, widgetObj?: any): string {
  const fromWidget = extractPortalCid(widgetObj?.configId);
  if (fromWidget) return fromWidget;

  const fromEngineDirect = extractPortalCid(engineObj?.widgetConfigConfigId);
  if (fromEngineDirect) return fromEngineDirect;

  const fromRoutingUri = extractPortalCid(
    engineObj?.chatEngineConfig?.dialogflowAgentToStoreRouting?.defaultUri
  );
  if (fromRoutingUri) return fromRoutingUri;

  return '';
}

export function getRequiredVanityBuildRoles(
  isPrivateMode: boolean,
  automateDNS: boolean,
  automatePrivateDns: boolean,
  customDomain: string,
): string[] {
  const roles = ['roles/compute.loadBalancerAdmin', 'roles/compute.networkAdmin'];
  const needsDns =
    (!isPrivateMode && automateDNS) ||
    (isPrivateMode && (automatePrivateDns || Boolean(customDomain)));
  if (needsDns) {
    roles.push('roles/dns.admin');
  }
  return roles;
}

function hasRoleOrEquivalent(bindings: any[], saEmail: string, role: string): boolean {
  const memberKey = `serviceAccount:${saEmail}`.toLowerCase();
  const equivalentRoles = [role, 'roles/owner', 'roles/editor'];
  if (role === 'roles/compute.loadBalancerAdmin' || role === 'roles/compute.networkAdmin') {
    equivalentRoles.push('roles/compute.admin');
  }
  return bindings.some(
    (b) =>
      equivalentRoles.includes(b.role) &&
      (b.members || []).some((m: string) => m.toLowerCase() === memberKey),
  );
}

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
  const [numericProjectNumber, setNumericProjectNumber] = useState<string>(() => {
    if (/^\d+$/.test(projectNumber)) return projectNumber;
    const match = engine.name.match(/^projects\/(\d+)\//);
    return match ? match[1] : '';
  });
  const [serviceName, setServiceName] = useState(() => {
    const engineId = engine.name.split('/').pop() || 'assistant';
    return `assistant-${engineId}`.substring(0, 40).replace(/[^a-z0-9-]/g, '').toLowerCase();
  });
  const [automateGLB, setAutomateGLB] = useState(true);
  const [automateDNS, setAutomateDNS] = useState(false);
  const [customDomain, setCustomDomain] = useState('');
  const [dnsProjectId, setDnsProjectId] = useState('');

  // Portal Widget Config ID (CID) & Web App Initialization States
  const [portalCid, setPortalCidState] = useState<string>(() =>
    extractCidFromResources(engine, null)
  );
  const [isResolvingCid, setIsResolvingCid] = useState(false);
  const [isInitializingWebApp, setIsInitializingWebApp] = useState(false);
  const [webAppEnabled, setWebAppEnabled] = useState<boolean | null>(null);
  const [enablingApis, setEnablingApis] = useState(false);

  // Cloud Build & Compute SA IAM States
  const [missingBuildSaRoles, setMissingBuildSaRoles] = useState<string[]>([]);
  const [isGrantingBuildRoles, setIsGrantingBuildRoles] = useState(false);

  const setPortalCid = (val: string) => {
    setPortalCidState(extractPortalCid(val));
  };

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

  const trimmedDnsProjectId = dnsProjectId.trim();
  const isServiceNameValid = isValidGcpResourceName(serviceName);
  const isCustomDomainValid = Boolean(customDomain && isValidHostname(customDomain));
  const isDnsProjectIdValid =
    !trimmedDnsProjectId || isValidGcpResourceName(trimmedDnsProjectId);

  // Existing Redirect Domains States
  const [existingDomains, setExistingDomains] = useState<string[]>([]);
  const [selectedDomainOption, setSelectedDomainOption] = useState<string>('new');
  const [discoveryWarnings, setDiscoveryWarnings] = useState<string[]>([]);
  const [discoveryRefreshNonce, setDiscoveryRefreshNonce] = useState(0);

  const appendDiscoveryWarning = (msg: string) => {
    setDiscoveryWarnings((prev) => (prev.includes(msg) ? prev : [...prev, msg]));
  };
  const clearDiscoveryWarnings = () => setDiscoveryWarnings([]);

  useEffect(() => {
    const resolveProject = async () => {
      if (/^\d+$/.test(projectNumber)) {
        setNumericProjectNumber(projectNumber);
      }
      try {
        const p = await api.getProject(projectNumber);
        if (p?.projectId) setProjectId(p.projectId);
        if (p?.projectNumber) setNumericProjectNumber(p.projectNumber);
      } catch (e: any) {
        console.warn('Could not resolve Project ID string', e);
      }
    };
    resolveProject();
  }, [projectNumber]);

  // Check Cloud Build & Compute Service Account IAM permissions
  useEffect(() => {
    let cancelled = false;
    const checkBuildPermissions = async () => {
      if (
        !projectId ||
        !numericProjectNumber ||
        typeof api.getProjectIamPolicy !== 'function'
      ) {
        return;
      }
      try {
        const policy = await api.getProjectIamPolicy(projectId);
        if (cancelled || !policy) return;
        const bindings = policy.bindings || [];
        const cloudBuildSa = `${numericProjectNumber}@cloudbuild.gserviceaccount.com`;
        const computeSa = `${numericProjectNumber}-compute@developer.gserviceaccount.com`;
        const requiredRoles = getRequiredVanityBuildRoles(
          isPrivateMode,
          automateDNS,
          automatePrivateDns,
          customDomain,
        );
        const missing = new Set<string>();
        for (const role of requiredRoles) {
          if (role === 'roles/dns.admin' && trimmedDnsProjectId && trimmedDnsProjectId !== projectId) {
            if (isValidGcpResourceName(trimmedDnsProjectId)) {
              try {
                const dnsPolicy = await api.getProjectIamPolicy(trimmedDnsProjectId);
                const dnsBindings = dnsPolicy?.bindings || [];
                if (
                  !hasRoleOrEquivalent(dnsBindings, cloudBuildSa, role) ||
                  !hasRoleOrEquivalent(dnsBindings, computeSa, role)
                ) {
                  missing.add(`${role} (on ${trimmedDnsProjectId})`);
                }
              } catch {
                missing.add(`${role} (on ${trimmedDnsProjectId})`);
              }
            }
          } else if (
            !hasRoleOrEquivalent(bindings, cloudBuildSa, role) ||
            !hasRoleOrEquivalent(bindings, computeSa, role)
          ) {
            missing.add(role);
          }
        }
        if (!cancelled) {
          setMissingBuildSaRoles(Array.from(missing));
        }
      } catch {
        // Best-effort check on mount; pre-flight or explicit grant surfaces errors if any
      }
    };
    checkBuildPermissions();
    return () => {
      cancelled = true;
    };
  }, [
    projectId,
    numericProjectNumber,
    isPrivateMode,
    automateDNS,
    automatePrivateDns,
    customDomain,
    trimmedDnsProjectId,
    discoveryRefreshNonce,
  ]);

  // Eagerly resolve the Portal CID from WidgetConfig (`default_search_widget_config`) or Engine
  useEffect(() => {
    let cancelled = false;
    const discoverPortalCid = async () => {
      const initialCid = extractCidFromResources(engine, null);
      if (initialCid) {
        setPortalCidState(initialCid);
      }
      if (typeof api.getWidgetConfig !== 'function' && typeof api.getEngine !== 'function') {
        return;
      }
      setIsResolvingCid(true);
      try {
        let resolved = initialCid;
        if (typeof api.getWidgetConfig === 'function') {
          try {
            const widget = await api.getWidgetConfig(engine.name, config);
            if (!cancelled && widget) {
              setWebAppEnabled(Boolean(widget.accessSettings?.enableWebApp));
              const widgetCid = extractCidFromResources(engine, widget);
              if (widgetCid) {
                resolved = widgetCid;
                setPortalCidState(widgetCid);
              }
            }
          } catch {
            // Best-effort widget config discovery on mount; handleDeploy logs details if still missing
          }
        }
        if (!resolved && typeof api.getEngine === 'function') {
          try {
            const engineData = await api.getEngine(engine.name, config);
            if (!cancelled && engineData) {
              const engineCid = extractCidFromResources(engineData, null);
              if (engineCid) {
                setPortalCidState(engineCid);
              }
            }
          } catch {
            // Handled during deploy if still missing
          }
        }
      } finally {
        if (!cancelled) {
          setIsResolvingCid(false);
        }
      }
    };
    discoverPortalCid();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.name, engine.widgetConfigConfigId, engine.cid, config.projectId, config.appLocation]);

  useEffect(() => {
    const fetchExistingRedirects = async () => {
      if (!projectId) return;
      try {
        const [fwdRes, certRes] = await Promise.all([
          api.listGlobalForwardingRules(projectId).catch((err: any) => {
            appendDiscoveryWarning(
              `Global Forwarding Rules discovery failed: ${err?.message || String(err)}`
            );
            return { items: [] };
          }),
          api.listManagedSslCertificates(projectId).catch((err: any) => {
            appendDiscoveryWarning(
              `Managed SSL Certificates discovery failed: ${err?.message || String(err)}`
            );
            return { items: [] };
          }),
        ]);

        const rules = (fwdRes || {}).items || [];
        const certs = (certRes || {}).items || [];

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
      } catch (e: any) {
        console.warn('Could not load existing redirects', e);
        appendDiscoveryWarning(`Redirect discovery failed: ${e?.message || String(e)}`);
      }
    };
    fetchExistingRedirects();
  }, [projectId, engine.name, discoveryRefreshNonce]);

  useEffect(() => {
    const fetchNetworksAndSubnets = async () => {
      if (!projectId) return;
      try {
        const netRes = await api.listVpcNetworks(projectId).catch((err: any) => {
          appendDiscoveryWarning(
            `VPC Networks discovery failed: ${err?.message || String(err)}`
          );
          return { items: [] };
        });
        const networks = ((netRes || {}).items || []).map((n: any) => n.name);
        setNetworksList(networks);

        let targetNetwork = 'default';
        if (networks.includes('default')) {
          setSelectedNetworkOption('default');
          setVpcNetwork('default');
          targetNetwork = 'default';
        } else if (networks.length > 0) {
          setSelectedNetworkOption(networks[0]);
          setVpcNetwork(networks[0]);
          targetNetwork = networks[0];
        } else {
          setSelectedNetworkOption('custom');
        }

        const activeRegion = config.appLocation === 'global' ? 'us-central1' : config.appLocation;
        const subRes = await api.listVpcSubnets(projectId, activeRegion).catch((err: any) => {
          appendDiscoveryWarning(
            `VPC Subnets discovery failed (${activeRegion}): ${err?.message || String(err)}`
          );
          return { items: [] };
        });
        const subnets = ((subRes || {}).items || [])
          .filter((s: any) => !s.network || String(s.network).endsWith(`/networks/${targetNetwork}`) || s.network === targetNetwork)
          .map((s: any) => s.name);
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
      } catch (e: any) {
        console.warn('Could not load VPC networks or subnets', e);
        appendDiscoveryWarning(`VPC discovery failed: ${e?.message || String(e)}`);
      }
    };
    fetchNetworksAndSubnets();
  }, [projectId, config.appLocation, discoveryRefreshNonce]);

  const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  /**
   * Initializes the Gemini Enterprise Web App (`default_search_widget_config` with
   * `accessSettings.enableWebApp = true`) and resolves the Portal UUID (`configId`).
   */
  const handleInitializeWebApp = async (logFn: (msg: string) => void = addLog): Promise<string> => {
    setIsInitializingWebApp(true);
    setError(null);
    try {
      let existingWidget: any = null;
      if (typeof api.getWidgetConfig === 'function') {
        try {
          existingWidget = await api.getWidgetConfig(engine.name, config);
          const foundCid = extractCidFromResources(engine, existingWidget);
          if (foundCid && existingWidget?.accessSettings?.enableWebApp) {
            setPortalCidState(foundCid);
            setWebAppEnabled(true);
            logFn(`Verified active Web App Portal CID: ${foundCid}`);
            return foundCid;
          }
        } catch (err: any) {
          logFn(`Note: Initial widgetConfig lookup returned: ${err?.message || String(err)}`);
        }
      }

      if (typeof api.updateWidgetConfig === 'function') {
        logFn('Enabling Gemini Enterprise Web App (default_search_widget_config) to initialize Portal workspace...');
        const updatedWidget = await api.updateWidgetConfig(
          engine.name,
          {
            accessSettings: {
              ...(existingWidget?.accessSettings || {}),
              enableWebApp: true,
            },
          },
          ['accessSettings.enableWebApp'],
          config,
        );
        setWebAppEnabled(true);
        const updatedCid = extractCidFromResources(engine, updatedWidget);
        if (updatedCid) {
          setPortalCidState(updatedCid);
          logFn(`Initialized Web App and resolved Portal CID: ${updatedCid}`);
          return updatedCid;
        }
      }

      if (typeof api.getWidgetConfig === 'function') {
        const refreshedWidget = await api.getWidgetConfig(engine.name, config);
        setWebAppEnabled(Boolean(refreshedWidget?.accessSettings?.enableWebApp));
        const refreshedCid = extractCidFromResources(engine, refreshedWidget);
        if (refreshedCid) {
          setPortalCidState(refreshedCid);
          logFn(`Resolved Portal CID from WidgetConfig: ${refreshedCid}`);
          return refreshedCid;
        }
      }

      if (typeof api.getEngine === 'function') {
        const refreshedEngine = await api.getEngine(engine.name, config);
        const engineCid = extractCidFromResources(refreshedEngine, null);
        if (engineCid) {
          setPortalCidState(engineCid);
          logFn(`Resolved Portal CID from Engine metadata: ${engineCid}`);
          return engineCid;
        }
      }

      return '';
    } catch (err: any) {
      logFn(`Warning: Could not auto-initialize Web App widget config: ${err?.message || String(err)}`);
      return '';
    } finally {
      setIsInitializingWebApp(false);
    }
  };

  /**
   * 1-click helper to enable required Networking / Cloud Build / DNS APIs on the project.
   */
  const handleEnableRequiredApis = async (
    servicesToEnable: string[] = ['compute.googleapis.com', 'dns.googleapis.com', 'cloudbuild.googleapis.com']
  ) => {
    if (typeof api.enableService !== 'function') return;
    setEnablingApis(true);
    setError(null);
    try {
      let targetProject = projectId;
      if (/^\d+$/.test(targetProject) && typeof api.getProject === 'function') {
        try {
          const p = await api.getProject(targetProject);
          if (p?.projectId) {
            targetProject = p.projectId;
            setProjectId(targetProject);
          }
          if (p?.projectNumber) {
            setNumericProjectNumber(p.projectNumber);
          }
        } catch {
          // fallback to projectId
        }
      }
      for (const svc of servicesToEnable) {
        const target =
          svc === 'dns.googleapis.com' && trimmedDnsProjectId
            ? trimmedDnsProjectId
            : targetProject;
        addLog(`Enabling Google Cloud API: ${svc} (project: ${target})...`);
        await api.enableService(target, svc);
        addLog(`Enabled ${svc}.`);
      }
      clearDiscoveryWarnings();
      setDiscoveryRefreshNonce((n) => n + 1);
    } catch (err: any) {
      const msg = err?.message || String(err);
      setError(`Failed to enable required APIs: ${msg}`);
      addLog(`Error enabling APIs: ${msg}`);
    } finally {
      setEnablingApis(false);
    }
  };

  /**
   * Ensures both `{projectNumber}@cloudbuild.gserviceaccount.com` and
   * `{projectNumber}-compute@developer.gserviceaccount.com` have the required
   * Load Balancer, Networking, and (when enabled) Cloud DNS roles (including
   * on a separate Cloud DNS host project when `dnsProjectId` is specified).
   */
  const ensureBuildServiceAccountRoles = async (
    targetProjectId: string,
    targetProjectNumber: string,
    logFn: (msg: string) => void = addLog,
  ): Promise<boolean> => {
    if (
      typeof api.getProjectIamPolicy !== 'function' ||
      typeof api.setProjectIamPolicy !== 'function'
    ) {
      return false;
    }

    let resolvedNumber = targetProjectNumber;
    if (!resolvedNumber && typeof api.getProject === 'function') {
      try {
        const p = await api.getProject(targetProjectId);
        if (p?.projectNumber) {
          resolvedNumber = p.projectNumber;
          setNumericProjectNumber(resolvedNumber);
        }
      } catch {
        // Ignore
      }
    }
    if (!resolvedNumber) return false;

    const requiredRoles = getRequiredVanityBuildRoles(
      isPrivateMode,
      automateDNS,
      automatePrivateDns,
      customDomain,
    );
    const cloudBuildSa = `${resolvedNumber}@cloudbuild.gserviceaccount.com`;
    const computeSa = `${resolvedNumber}-compute@developer.gserviceaccount.com`;
    const cloudBuildMember = `serviceAccount:${cloudBuildSa}`;
    const computeMember = `serviceAccount:${computeSa}`;

    const isCrossProjectDns =
      Boolean(trimmedDnsProjectId) && trimmedDnsProjectId !== targetProjectId;
    const localRoles = isCrossProjectDns
      ? requiredRoles.filter((r) => r !== 'roles/dns.admin')
      : requiredRoles;

    const policy = await api.getProjectIamPolicy(targetProjectId);
    const bindings = [...(policy?.bindings || [])];

    let modified = false;
    const rolesGranted = new Set<string>();

    const ensureBindingOnList = (
      bindingList: any[],
      role: string,
      member: string,
      grantedSet: Set<string>,
    ): boolean => {
      const existing = bindingList.find((b) => b.role === role);
      if (existing) {
        if (!existing.members) existing.members = [];
        if (!existing.members.some((m: string) => m.toLowerCase() === member.toLowerCase())) {
          existing.members.push(member);
          grantedSet.add(role);
          return true;
        }
        return false;
      }
      bindingList.push({ role, members: [member] });
      grantedSet.add(role);
      return true;
    };

    for (const role of localRoles) {
      if (!hasRoleOrEquivalent(bindings, cloudBuildSa, role)) {
        if (ensureBindingOnList(bindings, role, cloudBuildMember, rolesGranted)) {
          modified = true;
        }
      }
      if (!hasRoleOrEquivalent(bindings, computeSa, role)) {
        if (ensureBindingOnList(bindings, role, computeMember, rolesGranted)) {
          modified = true;
        }
      }
    }

    if (modified) {
      logFn(
        `Granting Cloud Build & Compute Service Account IAM roles (${Array.from(rolesGranted).join(', ')}) on ${targetProjectId} to ${computeSa} and ${cloudBuildSa}...`,
      );
      await api.setProjectIamPolicy(targetProjectId, {
        ...policy,
        bindings,
      });
      logFn(`Successfully granted Cloud Build networking & load balancer IAM roles on ${targetProjectId}.`);
    }

    // Cross-project Cloud DNS host project IAM grant
    if (isCrossProjectDns && requiredRoles.includes('roles/dns.admin')) {
      assertValidGcpResourceName(trimmedDnsProjectId, 'Cloud DNS Project ID');
      const dnsPolicy = await api.getProjectIamPolicy(trimmedDnsProjectId);
      const dnsBindings = [...(dnsPolicy?.bindings || [])];
      const dnsGranted = new Set<string>();
      let dnsModified = false;

      if (!hasRoleOrEquivalent(dnsBindings, cloudBuildSa, 'roles/dns.admin')) {
        if (ensureBindingOnList(dnsBindings, 'roles/dns.admin', cloudBuildMember, dnsGranted)) {
          dnsModified = true;
        }
      }
      if (!hasRoleOrEquivalent(dnsBindings, computeSa, 'roles/dns.admin')) {
        if (ensureBindingOnList(dnsBindings, 'roles/dns.admin', computeMember, dnsGranted)) {
          dnsModified = true;
        }
      }

      if (dnsModified) {
        logFn(
          `Granting cross-project roles/dns.admin on DNS host project ${trimmedDnsProjectId} to ${computeSa} and ${cloudBuildSa}...`,
        );
        await api.setProjectIamPolicy(trimmedDnsProjectId, {
          ...dnsPolicy,
          bindings: dnsBindings,
        });
        logFn(`Successfully granted roles/dns.admin on DNS host project ${trimmedDnsProjectId}.`);
      }
    }

    setMissingBuildSaRoles([]);
    return true;
  };

  const handleGrantBuildSaRoles = async (): Promise<boolean> => {
    setIsGrantingBuildRoles(true);
    setError(null);
    try {
      const ok = await ensureBuildServiceAccountRoles(projectId, numericProjectNumber, addLog);
      return ok;
    } catch (err: any) {
      const msg = err?.message || String(err);
      setError(`Failed to grant Cloud Build IAM roles: ${msg}`);
      addLog(`Error granting Cloud Build IAM roles: ${msg}`);
      return false;
    } finally {
      setIsGrantingBuildRoles(false);
    }
  };

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
      let resolvedProjectNumber = numericProjectNumber;
      if (/^\d+$/.test(resolvedProjectId)) {
        resolvedProjectNumber = resolvedProjectId;
        addLog(`Resolving project string ID for Number: ${resolvedProjectId}...`);
        try {
          const p = await api.getProject(resolvedProjectId);
          resolvedProjectId = p.projectId;
          if (p.projectNumber) {
            resolvedProjectNumber = p.projectNumber;
            setNumericProjectNumber(p.projectNumber);
          }
          setProjectId(resolvedProjectId);
        } catch (e) {
          addLog('Warning: Could not resolve project string ID, using number fallback.');
        }
      }

      addLog(`Fetching Vertex AI Search Portal UUID (CID) for engine ${rawEngineId}...`);
      let widgetConfigId = extractPortalCid(portalCid) || extractCidFromResources(engine, null);

      // 1. Check WidgetConfig (`default_search_widget_config`), where Gemini Enterprise stores `configId`
      if (!widgetConfigId && typeof api.getWidgetConfig === 'function') {
        try {
          const widgetData = await api.getWidgetConfig(engine.name, config);
          if (widgetData) {
            setWebAppEnabled(Boolean(widgetData.accessSettings?.enableWebApp));
            widgetConfigId = extractCidFromResources(engine, widgetData);
          }
        } catch (e) {
          addLog('Note: Could not fetch default_search_widget_config directly, checking Engine resource...');
        }
      }

      // 2. Fallback to Engine resource metadata (`widgetConfigConfigId` / `defaultUri`)
      if (!widgetConfigId && typeof api.getEngine === 'function') {
        try {
          const engineData = await api.getEngine(engine.name, config);
          widgetConfigId = extractCidFromResources(engineData, null);
        } catch (e) {
          addLog('Warning: Could not fetch fresh engine details, trying auto-initialization.');
        }
      }

      // 3. Auto-initialize Web App on `default_search_widget_config` if still missing
      if (!widgetConfigId && typeof api.updateWidgetConfig === 'function') {
        addLog('Portal CID not yet present. Auto-initializing Gemini Enterprise Web App workspace...');
        widgetConfigId = await handleInitializeWebApp(addLog);
      }

      if (!widgetConfigId) {
        setError(
          'Failed to retrieve or auto-initialize the Portal Widget Config ID (CID) for this engine. Use "Auto-Initialize Web App" or paste the Portal CID / Web App URL manually.'
        );
        addLog(
          'ERROR: Could not resolve Portal CID automatically. Enable the Web App or paste your Portal CID above.'
        );
        setIsDeploying(false);
        return;
      }

      setPortalCidState(widgetConfigId);
      addLog(`Discovered Portal CID: ${widgetConfigId}`);

      assertValidGcpResourceName(serviceName, 'Service name');
      assertValidOpaqueId(widgetConfigId, 'Portal widget config ID');
      if (customDomain) {
        assertValidHostname(customDomain, 'Custom domain');
      }
      if (trimmedDnsProjectId) {
        assertValidGcpResourceName(trimmedDnsProjectId, 'Cloud DNS Project ID');
      }

      // SECURITY (CWE-78): every value below is spliced into a `bash -c` step
      // in the generated Cloud Build config, and several are interpolated
      // *unquoted* (e.g. `--network=${vpcNetwork}`). Cloud Build runs as the
      // project's @cloudbuild.gserviceaccount.com, which holds roles/editor by
      // default -- so an unvalidated value here is full project compromise.
      //
      // Allowlist rather than escape: a value matching these patterns cannot
      // contain a shell metacharacter, and unlike quoting it cannot silently
      // break a working deploy. See services/shellSafety.ts for the rationale.
      assertValidGcpResourceName(location, 'Region');
      if (isPrivateMode) {
        assertValidGcpResourceName(vpcNetwork, 'VPC network');
        assertValidGcpResourceName(vpcSubnet, 'VPC subnet');
        assertValidGcpResourceName(pscIpName, 'PSC IP name');
        assertValidGcpResourceName(pscRuleName, 'PSC forwarding rule name');
        if (!autoAllocatePscIp) {
          assertValidIpv4Address(customPscIp, 'PSC IP address');
        }
      }

      // Pre-flight 1: Auto-enable required APIs (Compute Engine, Cloud Build, and Cloud DNS if needed)
      const needsDnsApi =
        (!isPrivateMode && automateDNS) ||
        (isPrivateMode && (automatePrivateDns || Boolean(customDomain)));
      const hasDisabledApiWarning = discoveryWarnings.some(
        (w) =>
          w.includes('SERVICE_DISABLED') ||
          w.toLowerCase().includes('has not been used in project') ||
          w.includes('compute.googleapis.com') ||
          w.includes('dns.googleapis.com')
      );

      if (typeof api.enableService === 'function' && (needsDnsApi || hasDisabledApiWarning)) {
        const localApis = ['compute.googleapis.com', 'cloudbuild.googleapis.com'];
        const dnsTargetProject = trimmedDnsProjectId || resolvedProjectId;
        addLog(`Ensuring required GCP APIs are enabled...`);
        for (const svc of localApis) {
          try {
            await api.enableService(resolvedProjectId, svc);
          } catch (apiErr: any) {
            addLog(`Note: Pre-flight enable for ${svc} skipped: ${apiErr?.message || String(apiErr)}`);
          }
        }
        if (needsDnsApi) {
          try {
            await api.enableService(dnsTargetProject, 'dns.googleapis.com');
          } catch (apiErr: any) {
            addLog(
              `Note: Pre-flight enable for dns.googleapis.com on ${dnsTargetProject} skipped: ${apiErr?.message || String(apiErr)}`,
            );
          }
        }
      }

      // Pre-flight 2: Ensure Cloud Build & Compute Service Accounts have Load Balancer / Network / DNS roles
      if (
        typeof api.getProjectIamPolicy === 'function' &&
        typeof api.setProjectIamPolicy === 'function'
      ) {
        try {
          await ensureBuildServiceAccountRoles(resolvedProjectId, resolvedProjectNumber, addLog);
        } catch (iamErr: any) {
          addLog(
            `Warning: Could not auto-grant Cloud Build IAM roles (${iamErr?.message || String(iamErr)}). Ensure ${resolvedProjectNumber || 'PROJECT_NUMBER'}-compute@developer.gserviceaccount.com has roles/compute.loadBalancerAdmin and roles/compute.networkAdmin.`,
          );
        }
      }

      const steps: Record<string, unknown>[] = [];
      const effectiveDnsProject =
        trimmedDnsProjectId && trimmedDnsProjectId !== resolvedProjectId
          ? trimmedDnsProjectId
          : trimmedDnsProjectId || undefined;

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
          dnsProjectId: effectiveDnsProject,
        }));
      } else {
        if (automateGLB && customDomain) {
          steps.push(generatePublicModeScript({
            serviceName,
            customDomain,
            widgetConfigId,
            automateDNS,
            dnsProjectId: effectiveDnsProject,
          }));
        }
      }

      if (steps.length === 0) {
        throw new Error(
          isPrivateMode
            ? 'No deployment steps generated. Please configure Private Service Connect routing options.'
            : 'No deployment steps generated. Load Balancer provisioning is required for public redirect deployment. Please enable "Automate Global External Load Balancer Provisioning" and specify a valid domain.'
        );
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
  };
}

