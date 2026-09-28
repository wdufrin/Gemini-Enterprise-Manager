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

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AppEngine, Config, DataStore } from '../types';
import * as api from '../services/apiService';
import {
  AGENTSPACE_USER_ROLE,
  BROAD_PROJECT_ROLES,
  CUSTOM_ROLE_ID,
  ConnectorInconsistency,
  ConnectorResource,
  EnvironmentReadinessState,
  IamPolicy,
  LegacyDataStoreResource,
  PrincipalAccess,
  REQUIRED_ADMIN_PERMISSIONS,
  REQUIRED_CUSTOM_ROLE_PERMISSIONS,
  UserAccessDetails,
} from '../components/assistants/datastore-permissions/types';

export const formatMember = (m: string): string => {
  const trimmed = m.trim();
  if (
    trimmed.startsWith('principal://') ||
    trimmed.startsWith('principalSet://') ||
    trimmed.startsWith('user:') ||
    trimmed.startsWith('group:') ||
    trimmed.startsWith('serviceAccount:') ||
    trimmed.startsWith('domain:')
  ) {
    return trimmed;
  }
  if (trimmed.includes(':')) {
    return trimmed;
  }
  return `user:${trimmed}`;
};

export function useDataStorePermissions(
  projectId: string,
  engine: AppEngine,
  config: Config
) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [customRoleExists, setCustomRoleExists] = useState<boolean | null>(null);
  const [isCreatingRole, setIsCreatingRole] = useState(false);
  const [isTogglingProjectOptIn, setIsTogglingProjectOptIn] = useState(false);
  const [isAutoEnablingEnvironment, setIsAutoEnablingEnvironment] = useState(false);
  const [isRepairingConnectors, setIsRepairingConnectors] = useState(false);

  const [readiness, setReadiness] = useState<EnvironmentReadinessState>({
    isEvaluating: false,
    lastEvaluatedAt: null,
    dataStoreAccessControlEnabled: null,
    projectConfigError: null,
    v1IamApiSupported: null,
    v1IamApiError: null,
    customRoleStatus: 'checking',
    customRoleIncludedPermissions: [],
    customRoleMissingPermissions: [...REQUIRED_CUSTOM_ROLE_PERMISSIONS],
    adminPermissionsTested: false,
    grantedAdminPermissions: [],
    missingAdminPermissions: [],
  });

  const [projectPolicy, setProjectPolicy] = useState<IamPolicy | null>(null);
  const [enginePolicy, setEnginePolicy] = useState<IamPolicy | null>(null);

  const [connectors, setConnectors] = useState<ConnectorResource[]>([]);
  const [legacyDataStores, setLegacyDataStores] = useState<LegacyDataStoreResource[]>([]);
  const [selectedResourcesForGrant, setSelectedResourcesForGrant] = useState<Record<string, boolean>>({});
  const initializedEngineRef = useRef<string | null>(null);

  // 1. Fetch All Resources, Policies, and Environment Readiness
  const refreshAll = useCallback(async () => {
    if (!projectId) return undefined;
    setIsLoading(true);
    setError(null);
    setReadiness(prev => ({ ...prev, isEvaluating: true }));

    try {
      // 1.0 Check Discovery Engine Project Opt-In (CustomerProvidedConfig.resourceAccessControlConfig.dataStoreAccessControlEnabled)
      let optInEnabled: boolean | null = null;
      let projCfgErr: string | null = null;
      if (typeof api.getDiscoveryProjectConfig === 'function') {
        try {
          const projCfg = await api.getDiscoveryProjectConfig(projectId, config.appLocation || 'global');
          optInEnabled =
            projCfg?.customerProvidedConfig?.resourceAccessControlConfig?.dataStoreAccessControlEnabled === true;
        } catch (e: unknown) {
          projCfgErr = e instanceof Error ? e.message : String(e);
        }
      }

      // 1.0b Check Operator Admin Permissions (projects.testIamPermissions)
      let adminPermsTested = false;
      let grantedAdminPerms: string[] = [];
      let missingAdminPerms: string[] = [];
      if (typeof api.testProjectIamPermissions === 'function') {
        try {
          grantedAdminPerms = await api.testProjectIamPermissions(projectId, REQUIRED_ADMIN_PERMISSIONS);
          const grantedSet = new Set(grantedAdminPerms);
          missingAdminPerms = REQUIRED_ADMIN_PERMISSIONS.filter(p => !grantedSet.has(p));
          adminPermsTested = true;
        } catch {
          adminPermsTested = false;
        }
      }

      // 1.1 Check Custom Role & Required Permissions (buildAuthorizationUrl + devToolsConfigs.get)
      let roleExists = false;
      let roleStatus: EnvironmentReadinessState['customRoleStatus'] = 'missing';
      let roleIncludedPerms: string[] = [];
      let roleMissingPerms: string[] = [...REQUIRED_CUSTOM_ROLE_PERMISSIONS];
      try {
        const role = await api.getCustomRole(projectId, CUSTOM_ROLE_ID);
        if (role && role.name) {
          if (role.deleted) {
            roleExists = false;
            roleStatus = 'deleted';
          } else {
            roleExists = true;
            roleIncludedPerms = role.includedPermissions || [];
            const permSet = new Set(roleIncludedPerms);
            roleMissingPerms = REQUIRED_CUSTOM_ROLE_PERMISSIONS.filter(p => !permSet.has(p));
            roleStatus = roleMissingPerms.length === 0 ? 'ready' : 'needs_upgrade';
          }
        }
      } catch {
        roleExists = false;
        roleStatus = 'missing';
      }
      setCustomRoleExists(roleExists);

      // 1.2 Get Project IAM Policy
      let pPolicy: IamPolicy | null = null;
      try {
        pPolicy = await api.getProjectIamPolicy(projectId);
        setProjectPolicy(pPolicy);
      } catch (e: unknown) {
        console.warn('Could not fetch project IAM policy', e);
      }

      // 1.3 Get Engine IAM Policy (also probes v1 IAM API reachability)
      let engPolicy: IamPolicy | null = null;
      let v1IamSupported: boolean | null = null;
      let v1IamError: string | null = null;
      try {
        engPolicy = await api.getEngineIamPolicy(engine.name, config);
        setEnginePolicy(engPolicy);
        v1IamSupported = true;
      } catch (e: unknown) {
        console.warn('Could not fetch engine IAM policy', e);
        v1IamError = e instanceof Error ? e.message : String(e);
      }

      // 1.4 List Collections & DataStores
      const attachedDataStoreIds = new Set(engine.dataStoreIds || []);

      let rawCollections: { name: string; displayName?: string }[] = [];
      try {
        const collRes = await api.listCollections(config);
        rawCollections = collRes.collections || [];
      } catch (e: unknown) {
        console.warn('Could not list collections', e);
      }

      let rawDataStores: DataStore[] = [];
      try {
        const dsRes = await api.listResources('dataStores', config);
        rawDataStores = dsRes.dataStores || [];
      } catch (e: unknown) {
        console.warn('Could not list datastores', e);
      }

      // 1.5 Classify Connectors and Entities vs Legacy DataStores
      const connectorMap: Record<string, ConnectorResource> = {};

      rawCollections.forEach(c => {
        const cId = c.name.split('/').pop()!;
        if (cId && cId !== 'default_collection') {
          connectorMap[cId] = {
            id: cId,
            name: c.name,
            displayName: c.displayName || cId,
            entities: [],
            isAttached: false,
          };
        }
      });

      const legacyDsList: LegacyDataStoreResource[] = [];

      rawDataStores.forEach(ds => {
        const dsId = ds.name.split('/').pop()!;
        if (!dsId) return;

        let matchedConnectorId: string | null = null;
        for (const connId of Object.keys(connectorMap)) {
          if (dsId.startsWith(`${connId}_`) || dsId === connId) {
            matchedConnectorId = connId;
            break;
          }
        }

        if (matchedConnectorId) {
          connectorMap[matchedConnectorId].entities.push({
            id: dsId,
            name: ds.name,
            displayName: ds.displayName || dsId,
          });
          if (attachedDataStoreIds.has(dsId)) {
            connectorMap[matchedConnectorId].isAttached = true;
          }
        } else {
          legacyDsList.push({
            id: dsId,
            name: ds.name,
            displayName: ds.displayName || dsId,
            isAttached: attachedDataStoreIds.has(dsId),
          });
        }
      });

      // Also ensure any connector whose id is directly attached gets marked attached
      Object.keys(connectorMap).forEach(connId => {
        if (attachedDataStoreIds.has(connId)) {
          connectorMap[connId].isAttached = true;
        }
      });

      // 1.6 Fetch Policies for Connectors, Entities, and DataStores
      const connList = Object.values(connectorMap);

      await Promise.all(
        connList.map(async conn => {
          try {
            const p = await api.getCollectionIamPolicy(conn.id, config);
            conn.policy = p;
            v1IamSupported = true;
          } catch (e: unknown) {
            console.warn(`Could not get policy for connector ${conn.id}`, e);
            if (v1IamSupported === null) {
              v1IamError = e instanceof Error ? e.message : String(e);
            }
          }
          await Promise.all(
            conn.entities.map(async ent => {
              try {
                const ep = await api.getDataStoreIamPolicy(ent.id, config);
                ent.policy = ep;
                v1IamSupported = true;
              } catch (e: unknown) {
                console.warn(`Could not get policy for entity ${ent.id}`, e);
              }
            })
          );
        })
      );

      await Promise.all(
        legacyDsList.map(async ds => {
          try {
            const p = await api.getDataStoreIamPolicy(ds.id, config);
            ds.policy = p;
            v1IamSupported = true;
          } catch (e: unknown) {
            console.warn(`Could not get policy for legacy datastore ${ds.id}`, e);
            if (v1IamSupported === null) {
              v1IamError = e instanceof Error ? e.message : String(e);
            }
          }
        })
      );

      setConnectors(connList);
      setLegacyDataStores(legacyDsList);

      setReadiness({
        isEvaluating: false,
        lastEvaluatedAt: new Date().toLocaleTimeString(),
        dataStoreAccessControlEnabled: optInEnabled,
        projectConfigError: projCfgErr,
        v1IamApiSupported: v1IamSupported ?? false,
        v1IamApiError: v1IamSupported ? null : v1IamError,
        customRoleStatus: roleStatus,
        customRoleIncludedPermissions: roleIncludedPerms,
        customRoleMissingPermissions: roleMissingPerms,
        adminPermissionsTested: adminPermsTested,
        grantedAdminPermissions: grantedAdminPerms,
        missingAdminPermissions: missingAdminPerms,
      });

      // Pre-select all attached resources ONLY on the initial load for this engine
      if (initializedEngineRef.current !== engine.name) {
        initializedEngineRef.current = engine.name;
        const initialSelected: Record<string, boolean> = {};
        connList.forEach(c => {
          if (c.isAttached) {
            initialSelected[`connector:${c.id}`] = true;
            c.entities.forEach(e => {
              initialSelected[`entity:${e.id}`] = true;
            });
          }
        });
        legacyDsList.forEach(ds => {
          if (ds.isAttached) {
            initialSelected[`datastore:${ds.id}`] = true;
          }
        });
        setSelectedResourcesForGrant(prev => (Object.keys(prev).length > 0 ? prev : initialSelected));
      }

      return {
        connectors: connList,
        legacyDataStores: legacyDsList,
        projectPolicy: pPolicy,
        enginePolicy: engPolicy,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch connected datastore permissions.';
      setError(msg);
      setReadiness(prev => ({ ...prev, isEvaluating: false }));
      return undefined;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, engine, config]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Handle 1-Click Custom Role Creation or Upgrade
  const handleCreateCustomRole = async () => {
    setIsCreatingRole(true);
    setError(null);
    setSuccessMessage(null);
    try {
      if (readiness.customRoleStatus === 'deleted' && typeof api.undeleteCustomRole === 'function') {
        await api.undeleteCustomRole(projectId, CUSTOM_ROLE_ID);
      }

      const mergedPermissions = Array.from(
        new Set([...readiness.customRoleIncludedPermissions, ...REQUIRED_CUSTOM_ROLE_PERMISSIONS])
      );

      if (
        (readiness.customRoleStatus === 'needs_upgrade' || readiness.customRoleStatus === 'deleted') &&
        typeof api.updateCustomRole === 'function'
      ) {
        await api.updateCustomRole(projectId, CUSTOM_ROLE_ID, {
          title: 'Custom Gemini Enterprise Restricted End User',
          description: 'Base project-level permissions to use Gemini Enterprise end-user UI.',
          stage: 'GA',
          includedPermissions: mergedPermissions,
        });
        setCustomRoleExists(true);
        setReadiness(prev => ({
          ...prev,
          customRoleStatus: 'ready',
          customRoleIncludedPermissions: mergedPermissions,
          customRoleMissingPermissions: [],
        }));
        setSuccessMessage(
          `Custom role 'projects/${projectId}/roles/${CUSTOM_ROLE_ID}' upgraded with permissions: ${mergedPermissions.join(', ')}`
        );
      } else {
        await api.createCustomRole(projectId, CUSTOM_ROLE_ID, {
          title: 'Custom Gemini Enterprise Restricted End User',
          description: 'Base project-level permissions to use Gemini Enterprise end-user UI.',
          stage: 'GA',
          includedPermissions: REQUIRED_CUSTOM_ROLE_PERMISSIONS,
        });
        setCustomRoleExists(true);
        setReadiness(prev => ({
          ...prev,
          customRoleStatus: 'ready',
          customRoleIncludedPermissions: [...REQUIRED_CUSTOM_ROLE_PERMISSIONS],
          customRoleMissingPermissions: [],
        }));
        setSuccessMessage(`Custom role 'projects/${projectId}/roles/${CUSTOM_ROLE_ID}' created successfully!`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to configure custom role: ${msg}`);
    } finally {
      setIsCreatingRole(false);
    }
  };

  // Handle 1-Click Project DataStore Access Control Opt-In Toggle
  const handleToggleProjectAccessControl = async (enabled: boolean) => {
    if (typeof api.updateDataStoreAccessControlConfig !== 'function') return;
    setIsTogglingProjectOptIn(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await api.updateDataStoreAccessControlConfig(projectId, enabled, config.appLocation || 'global');
      setReadiness(prev => ({
        ...prev,
        dataStoreAccessControlEnabled: enabled,
        projectConfigError: null,
      }));
      setSuccessMessage(
        enabled
          ? `Enabled DataStore-level access control opt-in (dataStoreAccessControlEnabled=true) on project '${projectId}'. Note: Backend serving caches may take ~5 minutes to propagate.`
          : `Disabled DataStore-level access control opt-in (dataStoreAccessControlEnabled=false) on project '${projectId}'.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to update project resource access control setting: ${msg}`);
    } finally {
      setIsTogglingProjectOptIn(false);
    }
  };

  // Handle 1-Click Automated Environment Setup (Opt-In + Custom Role + Re-Verify)
  const handleAutoEnableEnvironment = async (onLog?: (msg: string) => void) => {
    setIsAutoEnablingEnvironment(true);
    setError(null);
    setSuccessMessage(null);
    const log = (m: string) => onLog?.(`[${new Date().toLocaleTimeString()}] ${m}`);

    try {
      log(`Starting Automated Environment Enablement for project '${projectId}'...`);

      // Step 1: Ensure Custom Role exists and has both required permissions
      if (readiness.customRoleStatus !== 'ready') {
        log(
          `[Step 1/2] Configuring custom role 'projects/${projectId}/roles/${CUSTOM_ROLE_ID}' with [${REQUIRED_CUSTOM_ROLE_PERMISSIONS.join(', ')}]...`
        );
        if (readiness.customRoleStatus === 'deleted' && typeof api.undeleteCustomRole === 'function') {
          await api.undeleteCustomRole(projectId, CUSTOM_ROLE_ID);
          log(`[ACTION] Undeleted soft-deleted custom role '${CUSTOM_ROLE_ID}'.`);
        }
        const mergedPermissions = Array.from(
          new Set([...readiness.customRoleIncludedPermissions, ...REQUIRED_CUSTOM_ROLE_PERMISSIONS])
        );
        if (
          (readiness.customRoleStatus === 'needs_upgrade' || readiness.customRoleStatus === 'deleted') &&
          typeof api.updateCustomRole === 'function'
        ) {
          await api.updateCustomRole(projectId, CUSTOM_ROLE_ID, {
            title: 'Custom Gemini Enterprise Restricted End User',
            description: 'Base project-level permissions to use Gemini Enterprise end-user UI.',
            stage: 'GA',
            includedPermissions: mergedPermissions,
          });
          log(`[VERIFIED ✓] Upgraded custom role '${CUSTOM_ROLE_ID}' permissions.`);
        } else {
          await api.createCustomRole(projectId, CUSTOM_ROLE_ID, {
            title: 'Custom Gemini Enterprise Restricted End User',
            description: 'Base project-level permissions to use Gemini Enterprise end-user UI.',
            stage: 'GA',
            includedPermissions: REQUIRED_CUSTOM_ROLE_PERMISSIONS,
          });
          log(`[VERIFIED ✓] Created custom role '${CUSTOM_ROLE_ID}'.`);
        }
      } else {
        log(`[Step 1/2] [VERIFIED ✓] Custom role '${CUSTOM_ROLE_ID}' is already active with all required permissions.`);
      }

      // Step 2: Enable Project-Level DataStore Access Control Opt-In
      if (readiness.dataStoreAccessControlEnabled !== true && typeof api.updateDataStoreAccessControlConfig === 'function') {
        log(
          `[Step 2/2] Enabling customerProvidedConfig.resourceAccessControlConfig.dataStoreAccessControlEnabled on project '${projectId}'...`
        );
        await api.updateDataStoreAccessControlConfig(projectId, true, config.appLocation || 'global');
        log(`[VERIFIED ✓] Project resource access control opt-in enabled.`);
      } else {
        log(`[Step 2/2] [VERIFIED ✓] Project resource access control opt-in is already enabled.`);
      }

      log(`Re-evaluating environment readiness checks...`);
      await refreshAll();
      log(`[COMPLETE ✓] Environment is ready for DataStore & Connector direct IAM entitlements! (Allow ~5 min for serving cache propagation).`);
      setSuccessMessage(
        `Environment automatically configured! Project opt-in (dataStoreAccessControlEnabled) is active and custom role '${CUSTOM_ROLE_ID}' is verified.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`[ERROR ❌] Automated environment setup failed: ${msg}`);
      setError(`Automated environment setup failed: ${msg}`);
    } finally {
      setIsAutoEnablingEnvironment(false);
    }
  };

  // Helper for Read-Modify-Write Update (Add or Remove)
  const syncPolicyRMW = async (
    resourceDesc: string,
    getFn: () => Promise<IamPolicy>,
    setFn: (policy: IamPolicy) => Promise<unknown>,
    member: string,
    role: string = AGENTSPACE_USER_ROLE,
    shouldGrant: boolean,
    isDryRun: boolean,
    addLog: (msg: string) => void
  ): Promise<boolean> => {
    addLog(`[RMW] Fetching IAM policy for ${resourceDesc}...`);
    let policy: IamPolicy;
    try {
      policy = await getFn();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`[ERROR ❌] Failed to fetch policy for ${resourceDesc}: ${msg}`);
      return false;
    }

    const etag = policy.etag || '';
    let bindings = policy.bindings || [];

    const targetBinding = bindings.find(b => b.role === role);
    const hasRole = targetBinding?.members?.includes(member);

    if (shouldGrant) {
      if (hasRole) {
        addLog(`[SKIP] '${member}' already has '${role}' on ${resourceDesc}.`);
        return true;
      }
      if (targetBinding) {
        targetBinding.members = [...(targetBinding.members || []), member];
      } else {
        bindings.push({
          role: role,
          members: [member],
        });
      }
    } else {
      // Revoke
      if (!hasRole) {
        addLog(`[SKIP] '${member}' does not have '${role}' on ${resourceDesc} (no removal needed).`);
        return true;
      }
      bindings = bindings
        .map(b => {
          if (b.role === role) {
            return {
              ...b,
              members: (b.members || []).filter(m => m !== member),
            };
          }
          return b;
        })
        .filter(b => b.members && b.members.length > 0);
    }

    const payload = {
      policy: {
        etag,
        bindings,
      },
    };

    if (isDryRun) {
      addLog(
        `[DRY-RUN] Would ${shouldGrant ? 'GRANT' : 'REVOKE'} '${role}' ${shouldGrant ? 'to' : 'from'} '${member}' on ${resourceDesc}.`
      );
      return true;
    }

    addLog(
      `[ACTION] ${shouldGrant ? 'Granting' : 'Revoking'} '${role}' ${shouldGrant ? 'to' : 'from'} '${member}' on ${resourceDesc}...`
    );
    await setFn(payload.policy);
    addLog(`[SUCCESS] ${shouldGrant ? 'Granted' : 'Revoked'} '${role}' on ${resourceDesc}.`);

    // Verification check
    try {
      const vPolicy = await getFn();
      const isStillPresent = vPolicy.bindings?.some(
        b => b.role === role && b.members?.includes(member)
      );
      if (shouldGrant && isStillPresent) {
        addLog(`[VERIFIED ✓] Confirmed '${role}' active for '${member}' on ${resourceDesc}.`);
      } else if (!shouldGrant && !isStillPresent) {
        addLog(`[VERIFIED ✓] Confirmed '${role}' removed for '${member}' on ${resourceDesc}.`);
      } else {
        addLog(`[VERIFY WARNING ⚠️] Policy verification check unexpected result for ${resourceDesc}.`);
      }
    } catch {
      // ignore verify fetch failure
    }
    return true;
  };

  // Compile All Users with Project, App, and DataStore Access
  const allUsersList: UserAccessDetails[] = useMemo(() => {
    const memberMap: Record<string, UserAccessDetails> = {};

    const getMemberType = (m: string): 'user' | 'group' | 'serviceAccount' | 'domain' | 'other' => {
      if (m.startsWith('user:')) return 'user';
      if (m.startsWith('group:')) return 'group';
      if (m.startsWith('serviceAccount:')) return 'serviceAccount';
      if (m.startsWith('domain:')) return 'domain';
      return 'other';
    };

    const getOrCreate = (mem: string): UserAccessDetails => {
      if (!memberMap[mem]) {
        memberMap[mem] = {
          member: mem,
          type: getMemberType(mem),
          projectRoles: [],
          broadRoles: [],
          hasBroadRoles: false,
          hasCustomRole: false,
          hasEngineAccess: false,
          accessibleDataStoreCount: 0,
          totalDataStoreCount: 0,
          accessibleDataStores: [],
        };
      }
      return memberMap[mem];
    };

    // 1. Process Project Policy
    const customRoleFullName = `projects/${projectId}/roles/${CUSTOM_ROLE_ID}`;
    projectPolicy?.bindings?.forEach(b => {
      b.members?.forEach(m => {
        const u = getOrCreate(m);
        if (!u.projectRoles.includes(b.role)) {
          u.projectRoles.push(b.role);
        }
        if (b.role === customRoleFullName || b.role?.endsWith(`/${CUSTOM_ROLE_ID}`)) {
          u.hasCustomRole = true;
        }
        if (BROAD_PROJECT_ROLES.includes(b.role)) {
          if (!u.broadRoles.includes(b.role)) {
            u.broadRoles.push(b.role);
          }
          u.hasBroadRoles = true;
        }
      });
    });

    // 2. Process App Engine Policy
    enginePolicy?.bindings?.forEach(b => {
      if (b.role === AGENTSPACE_USER_ROLE || b.role?.includes('agentspace')) {
        b.members?.forEach(m => {
          const u = getOrCreate(m);
          u.hasEngineAccess = true;
        });
      }
    });

    // 3. Count Attached DataStores & Connectors (or all if none are marked attached)
    const hasAttachedResources =
      connectors.some(c => c.isAttached) || legacyDataStores.some(ds => ds.isAttached);
    const relevantConnectors = hasAttachedResources
      ? connectors.filter(c => c.isAttached)
      : connectors;
    const relevantLegacyDs = hasAttachedResources
      ? legacyDataStores.filter(ds => ds.isAttached)
      : legacyDataStores;
    const totalDsCount = relevantConnectors.length + relevantLegacyDs.length;

    // 4. Process Connectors & DataStores
    connectors.forEach(conn => {
      const connMembers = conn.policy?.bindings?.find(b => b.role === AGENTSPACE_USER_ROLE)?.members || [];
      const isRelevant = !hasAttachedResources || conn.isAttached;
      connMembers.forEach(m => {
        const u = getOrCreate(m);
        const label = conn.displayName || conn.id;
        if (isRelevant && !u.accessibleDataStores.includes(label)) {
          u.accessibleDataStores.push(label);
        }
      });

      conn.entities.forEach(ent => {
        const entMembers = ent.policy?.bindings?.find(b => b.role === AGENTSPACE_USER_ROLE)?.members || [];
        entMembers.forEach(m => {
          getOrCreate(m);
        });
      });
    });

    legacyDataStores.forEach(ds => {
      const dsMembers = ds.policy?.bindings?.find(b => b.role === AGENTSPACE_USER_ROLE)?.members || [];
      const isRelevant = !hasAttachedResources || ds.isAttached;
      dsMembers.forEach(m => {
        const u = getOrCreate(m);
        const label = ds.displayName || ds.id;
        if (isRelevant && !u.accessibleDataStores.includes(label)) {
          u.accessibleDataStores.push(label);
        }
      });
    });

    Object.values(memberMap).forEach(u => {
      u.totalDataStoreCount = totalDsCount;
      u.accessibleDataStoreCount = u.accessibleDataStores.length;
    });

    // Sort: users with broad roles first, then users with app access, then alphabetical
    return Object.values(memberMap).sort((a, b) => {
      if (a.hasBroadRoles && !b.hasBroadRoles) return -1;
      if (!a.hasBroadRoles && b.hasBroadRoles) return 1;
      if (a.hasEngineAccess && !b.hasEngineAccess) return -1;
      if (!a.hasEngineAccess && b.hasEngineAccess) return 1;
      return a.member.localeCompare(b.member);
    });
  }, [projectId, projectPolicy, enginePolicy, connectors, legacyDataStores]);

  // Compile Principal Access Matrix
  const principalMatrix: PrincipalAccess[] = useMemo(() => {
    const principalMap: Record<string, PrincipalAccess> = {};

    const getOrCreate = (mem: string): PrincipalAccess => {
      if (!principalMap[mem]) {
        principalMap[mem] = {
          member: mem,
          hasProjectRole: false,
          hasEngineAccess: false,
          resourceAccess: {},
        };
      }
      return principalMap[mem];
    };

    // 1. Check Project Policy
    const targetProjectRole = `projects/${projectId}/roles/${CUSTOM_ROLE_ID}`;
    projectPolicy?.bindings?.forEach(b => {
      if (b.role === targetProjectRole) {
        b.members?.forEach(m => {
          getOrCreate(m).hasProjectRole = true;
        });
      }
    });

    // 2. Check Engine Policy
    enginePolicy?.bindings?.forEach(b => {
      if (b.role === AGENTSPACE_USER_ROLE || b.role?.includes('agentspace')) {
        b.members?.forEach(m => {
          getOrCreate(m).hasEngineAccess = true;
        });
      }
    });

    // 3. Check Connectors & Entities
    connectors.forEach(conn => {
      conn.policy?.bindings?.forEach(b => {
        if (b.role === AGENTSPACE_USER_ROLE) {
          b.members?.forEach(m => {
            getOrCreate(m).resourceAccess[`connector:${conn.id}`] = true;
          });
        }
      });
      conn.entities.forEach(ent => {
        ent.policy?.bindings?.forEach(b => {
          if (b.role === AGENTSPACE_USER_ROLE) {
            b.members?.forEach(m => {
              getOrCreate(m).resourceAccess[`entity:${ent.id}`] = true;
            });
          }
        });
      });
    });

    // 4. Check Legacy DataStores
    legacyDataStores.forEach(ds => {
      ds.policy?.bindings?.forEach(b => {
        if (b.role === AGENTSPACE_USER_ROLE) {
          b.members?.forEach(m => {
            getOrCreate(m).resourceAccess[`datastore:${ds.id}`] = true;
          });
        }
      });
    });

    return Object.values(principalMap);
  }, [projectId, projectPolicy, enginePolicy, connectors, legacyDataStores]);

  // Detect Connector vs. Child Entity DataStore Access Inconsistencies
  const inconsistentConnectorGrants: ConnectorInconsistency[] = useMemo(() => {
    const inconsistencies: ConnectorInconsistency[] = [];

    connectors.forEach(conn => {
      if (conn.entities.length === 0) return;

      const connMembers = new Set(
        conn.policy?.bindings?.find(b => b.role === AGENTSPACE_USER_ROLE)?.members || []
      );
      const entityMemberMap: Record<string, Set<string>> = {};
      const allRelevantMembers = new Set<string>(connMembers);

      conn.entities.forEach(ent => {
        const entMembers = new Set(
          ent.policy?.bindings?.find(b => b.role === AGENTSPACE_USER_ROLE)?.members || []
        );
        entityMemberMap[ent.id] = entMembers;
        entMembers.forEach(m => allRelevantMembers.add(m));
      });

      allRelevantMembers.forEach(member => {
        const hasCollectionAccess = connMembers.has(member);
        const grantedEntityIds: string[] = [];
        const missingEntityIds: string[] = [];

        conn.entities.forEach(ent => {
          if (entityMemberMap[ent.id]?.has(member)) {
            grantedEntityIds.push(ent.id);
          } else {
            missingEntityIds.push(ent.id);
          }
        });

        if (!hasCollectionAccess || missingEntityIds.length > 0) {
          inconsistencies.push({
            connectorId: conn.id,
            connectorDisplayName: conn.displayName || conn.id,
            member,
            hasCollectionAccess,
            missingEntityIds,
            grantedEntityIds,
          });
        }
      });
    });

    return inconsistencies;
  }, [connectors]);

  // Repair Connector vs. Child Entity DataStore Access Inconsistencies
  const handleRepairConnectorInconsistencies = async () => {
    if (inconsistentConnectorGrants.length === 0) return;
    setIsRepairingConnectors(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const nopLog = () => {};
      for (const item of inconsistentConnectorGrants) {
        if (!item.hasCollectionAccess) {
          await syncPolicyRMW(
            `DataConnector Collection '${item.connectorId}'`,
            () => api.getCollectionIamPolicy(item.connectorId, config),
            (p) => api.setCollectionIamPolicy(item.connectorId, p, config),
            item.member,
            AGENTSPACE_USER_ROLE,
            true,
            false,
            nopLog
          );
        }
        for (const entId of item.missingEntityIds) {
          await syncPolicyRMW(
            `Entity DataStore '${entId}'`,
            () => api.getDataStoreIamPolicy(entId, config),
            (p) => api.setDataStoreIamPolicy(entId, p, config),
            item.member,
            AGENTSPACE_USER_ROLE,
            true,
            false,
            nopLog
          );
        }
      }
      await refreshAll();
      setSuccessMessage(
        `Successfully synchronized ${inconsistentConnectorGrants.length} inconsistent DataConnector + Entity IAM binding(s)!`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to repair connector entity bindings: ${msg}`);
    } finally {
      setIsRepairingConnectors(false);
    }
  };

  return {
    isLoading,
    setIsLoading,
    error,
    setError,
    successMessage,
    setSuccessMessage,
    customRoleExists,
    setCustomRoleExists,
    isCreatingRole,
    isTogglingProjectOptIn,
    isAutoEnablingEnvironment,
    isRepairingConnectors,
    readiness,
    inconsistentConnectorGrants,
    projectPolicy,
    enginePolicy,
    connectors,
    legacyDataStores,
    selectedResourcesForGrant,
    setSelectedResourcesForGrant,
    refreshAll,
    handleCreateCustomRole,
    handleToggleProjectAccessControl,
    handleAutoEnableEnvironment,
    handleRepairConnectorInconsistencies,
    syncPolicyRMW,
    allUsersList,
    principalMatrix,
  };
}
