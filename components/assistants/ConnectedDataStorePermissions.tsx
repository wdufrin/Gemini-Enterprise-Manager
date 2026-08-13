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

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AppEngine, Config, DataStore } from '../../types';
import * as api from '../../services/apiService';
import Spinner from '../Spinner';
import SetDataStoreIamPolicyModal, { ResourceType } from './SetDataStoreIamPolicyModal';
import DataStorePermissionsScriptModal from './DataStorePermissionsScriptModal';

interface ConnectedDataStorePermissionsProps {
  engine: AppEngine;
  config: Config;
  projectNumber: string;
}

interface ConnectorEntity {
  id: string;
  name: string;
  displayName?: string;
  policy?: any;
}

interface ConnectorResource {
  id: string;
  name: string;
  displayName?: string;
  policy?: any;
  entities: ConnectorEntity[];
  isAttached: boolean;
}

interface LegacyDataStoreResource {
  id: string;
  name: string;
  displayName?: string;
  policy?: any;
  isAttached: boolean;
}

interface PrincipalAccess {
  member: string;
  hasProjectRole: boolean;
  hasEngineAccess: boolean;
  resourceAccess: Record<string, boolean>; // resourceId -> boolean
}

export interface UserAccessDetails {
  member: string;
  type: 'user' | 'group' | 'serviceAccount' | 'domain' | 'other';
  projectRoles: string[];
  broadRoles: string[];
  hasBroadRoles: boolean;
  hasCustomRole: boolean;
  hasEngineAccess: boolean;
  accessibleDataStoreCount: number;
  totalDataStoreCount: number;
  accessibleDataStores: string[];
}

const AGENTSPACE_USER_ROLE = 'roles/discoveryengine.agentspaceUser';
const CUSTOM_ROLE_ID = 'customRestrictedEndUser';
const BROAD_PROJECT_ROLES = [
  'roles/viewer',
  'roles/editor',
  'roles/owner',
  'roles/discoveryengine.admin',
  'roles/discoveryengine.editor',
  'roles/discoveryengine.user',
  'roles/discoveryengine.agentspaceUser',
  'roles/discoveryengine.viewer',
];

const ConnectedDataStorePermissions: React.FC<ConnectedDataStorePermissionsProps> = ({
  engine,
  config,
  projectNumber,
}) => {
  const projectId = config.projectId || projectNumber;
  const appId = engine.name.split('/').pop() || '';

  // Discovery & IAM state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [customRoleExists, setCustomRoleExists] = useState<boolean | null>(null);
  const [isCreatingRole, setIsCreatingRole] = useState(false);

  const [projectPolicy, setProjectPolicy] = useState<any>(null);
  const [enginePolicy, setEnginePolicy] = useState<any>(null);

  const [connectors, setConnectors] = useState<ConnectorResource[]>([]);
  const [legacyDataStores, setLegacyDataStores] = useState<LegacyDataStoreResource[]>([]);

  // User Inspector & Isolation State
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userFilterType, setUserFilterType] = useState<'all' | 'needs_isolation' | 'isolated' | 'engine_access'>('all');
  const [selectedUsersForIsolation, setSelectedUsersForIsolation] = useState<Set<string>>(new Set());
  const [isIsolating, setIsIsolating] = useState(false);
  const [isolateModalTarget, setIsolateModalTarget] = useState<{ members: string[]; broadRoles: string[] } | null>(null);

  // Wizard State
  const [isWizardOpen, setIsWizardOpen] = useState(true);
  const [targetMembersInput, setTargetMembersInput] = useState('');
  const [wizardCheckCustomRole, setWizardCheckCustomRole] = useState(true);
  const [wizardGrantProjectRole, setWizardGrantProjectRole] = useState(true);
  const [wizardGrantEngineRole, setWizardGrantEngineRole] = useState(true);
  const [selectedResourcesForGrant, setSelectedResourcesForGrant] = useState<Record<string, boolean>>({});
  const [isDryRun, setIsDryRun] = useState(false);
  const [isExecutingWizard, setIsExecutingWizard] = useState(false);
  const [executionLogs, setExecutionLogs] = useState<string[]>([]);

  // Modal & Guide States
  const [showInstructionsGuide, setShowInstructionsGuide] = useState(false);
  const [editingResource, setEditingResource] = useState<{
    id: string;
    displayName: string;
    type: ResourceType;
    path: string;
    policy: any;
  } | null>(null);
  const [isScriptModalOpen, setIsScriptModalOpen] = useState(false);

  // Search & Filters for Matrix
  const [searchQuery, setSearchQuery] = useState('');

  const addLog = (msg: string) => {
    setExecutionLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  // 1. Fetch All Resources and Policies
  const refreshAll = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    setError(null);

    try {
      // 1.1 Check Custom Role
      let roleExists = false;
      try {
        const role = await api.getCustomRole(projectId, CUSTOM_ROLE_ID);
        roleExists = !!(role && role.name);
      } catch {
        roleExists = false;
      }
      setCustomRoleExists(roleExists);

      // 1.2 Get Project IAM Policy
      let pPolicy: any = null;
      try {
        pPolicy = await api.getProjectIamPolicy(projectId);
        setProjectPolicy(pPolicy);
      } catch (e: any) {
        console.warn("Could not fetch project IAM policy", e);
      }

      // 1.3 Get Engine IAM Policy
      let engPolicy: any = null;
      try {
        engPolicy = await api.getEngineIamPolicy(engine.name, config);
        setEnginePolicy(engPolicy);
      } catch (e: any) {
        console.warn("Could not fetch engine IAM policy", e);
      }

      // 1.4 List Collections & DataStores
      const attachedDataStoreIds = new Set(engine.dataStoreIds || []);

      let rawCollections: any[] = [];
      try {
        const collRes = await api.listCollections(config);
        rawCollections = collRes.collections || [];
      } catch (e: any) {
        console.warn("Could not list collections", e);
      }

      let rawDataStores: DataStore[] = [];
      try {
        const dsRes = await api.listResources('dataStores', config);
        rawDataStores = dsRes.dataStores || [];
      } catch (e: any) {
        console.warn("Could not list datastores", e);
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

      // Fetch connector collection policies
      await Promise.all(
        connList.map(async conn => {
          try {
            const p = await api.getCollectionIamPolicy(conn.id, config);
            conn.policy = p;
          } catch (e: any) {
            console.warn(`Could not get policy for connector ${conn.id}`, e);
          }
          // Fetch entity policies
          await Promise.all(
            conn.entities.map(async ent => {
              try {
                const ep = await api.getDataStoreIamPolicy(ent.id, config);
                ent.policy = ep;
              } catch (e: any) {
                console.warn(`Could not get policy for entity ${ent.id}`, e);
              }
            })
          );
        })
      );

      // Fetch legacy datastore policies
      await Promise.all(
        legacyDsList.map(async ds => {
          try {
            const p = await api.getDataStoreIamPolicy(ds.id, config);
            ds.policy = p;
          } catch (e: any) {
            console.warn(`Could not get policy for legacy datastore ${ds.id}`, e);
          }
        })
      );

      setConnectors(connList);
      setLegacyDataStores(legacyDsList);

      // Pre-select all attached resources in the wizard by default
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
      setSelectedResourcesForGrant(initialSelected);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch connected datastore permissions.');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, engine, config]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Handle 1-Click Custom Role Creation
  const handleCreateCustomRole = async () => {
    setIsCreatingRole(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await api.createCustomRole(projectId, CUSTOM_ROLE_ID, {
        title: 'Custom Gemini Enterprise Restricted End User',
        description: 'Base project-level permissions to view Gemini Enterprise config page.',
        stage: 'GA',
        includedPermissions: ['discoveryengine.locations.buildAuthorizationUrl'],
      });
      setCustomRoleExists(true);
      setSuccessMessage(`Custom role 'projects/${projectId}/roles/${CUSTOM_ROLE_ID}' created successfully!`);
    } catch (err: any) {
      setError(`Failed to create custom role: ${err.message}`);
    } finally {
      setIsCreatingRole(false);
    }
  };

  // Format Member string
  // Format Member string
  const formatMember = (m: string) => {
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

  // Helper for Read-Modify-Write Update (Add or Remove)
  const syncPolicyRMW = async (
    resourceDesc: string,
    getFn: () => Promise<any>,
    setFn: (policy: any) => Promise<any>,
    member: string,
    role: string = AGENTSPACE_USER_ROLE,
    shouldGrant: boolean
  ): Promise<boolean> => {
    addLog(`[RMW] Fetching IAM policy for ${resourceDesc}...`);
    let policy: any;
    try {
      policy = await getFn();
    } catch (err: any) {
      addLog(`[ERROR ❌] Failed to fetch policy for ${resourceDesc}: ${err.message}`);
      return false;
    }

    const etag = policy.etag || '';
    let bindings = policy.bindings || [];

    let targetBinding = bindings.find((b: any) => b.role === role);
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
        .map((b: any) => {
          if (b.role === role) {
            return {
              ...b,
              members: (b.members || []).filter((m: string) => m !== member),
            };
          }
          return b;
        })
        .filter((b: any) => b.members && b.members.length > 0);
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
        (b: any) => b.role === role && b.members?.includes(member)
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

  // Populate Wizard Checkboxes from Current Permissions of Member(s)
  const populateWizardForMember = useCallback((rawInput: string) => {
    if (!rawInput.trim()) return;

    const rawMembers = rawInput.split(/[\s,]+/).filter(m => m.trim() !== '');
    if (rawMembers.length === 0) return;

    const formattedMembers = rawMembers.map(formatMember);

    // 1. Step A1: Check if all target members have the custom role at project level
    const customRoleFullName = `projects/${projectId}/roles/${CUSTOM_ROLE_ID}`;
    const customRoleBinding = projectPolicy?.bindings?.find(
      (b: any) => b.role === customRoleFullName || b.role?.endsWith(`/${CUSTOM_ROLE_ID}`)
    );
    const hasProjectRole =
      formattedMembers.length > 0 && formattedMembers.every(m => customRoleBinding?.members?.includes(m));
    setWizardGrantProjectRole(hasProjectRole);

    // 2. Step A2: Check if all target members have App Engine access
    const engineBinding = enginePolicy?.bindings?.find(
      (b: any) => b.role === AGENTSPACE_USER_ROLE || b.role?.includes('agentspace')
    );
    const hasEngineRole =
      formattedMembers.length > 0 && formattedMembers.every(m => engineBinding?.members?.includes(m));
    setWizardGrantEngineRole(hasEngineRole);

    // 3. Steps A3 & A4: Check DataConnectors, Entities, and Legacy DataStores
    const newSelected: Record<string, boolean> = {};

    connectors.forEach(conn => {
      const connBinding = conn.policy?.bindings?.find((b: any) => b.role === AGENTSPACE_USER_ROLE);
      if (formattedMembers.length > 0 && formattedMembers.every(m => connBinding?.members?.includes(m))) {
        newSelected[`connector:${conn.id}`] = true;
      }

      conn.entities.forEach(ent => {
        const entBinding = ent.policy?.bindings?.find((b: any) => b.role === AGENTSPACE_USER_ROLE);
        if (formattedMembers.length > 0 && formattedMembers.every(m => entBinding?.members?.includes(m))) {
          newSelected[`entity:${ent.id}`] = true;
        }
      });
    });

    legacyDataStores.forEach(ds => {
      const dsBinding = ds.policy?.bindings?.find((b: any) => b.role === AGENTSPACE_USER_ROLE);
      if (formattedMembers.length > 0 && formattedMembers.every(m => dsBinding?.members?.includes(m))) {
        newSelected[`datastore:${ds.id}`] = true;
      }
    });

    setSelectedResourcesForGrant(newSelected);
  }, [projectId, projectPolicy, enginePolicy, connectors, legacyDataStores]);

  // Automatically populate checkboxes when target input changes (debounced)
  useEffect(() => {
    if (!targetMembersInput.trim()) return;
    const timer = setTimeout(() => {
      populateWizardForMember(targetMembersInput);
    }, 250);
    return () => clearTimeout(timer);
  }, [targetMembersInput, populateWizardForMember]);

  // Execute Guided Wizard (Two-Way Sync: Grant Checked, Revoke Unchecked)
  const handleExecuteWizard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetMembersInput.trim()) {
      setError('Please provide at least one target user or group email.');
      return;
    }

    const rawMembers = targetMembersInput.split(/[\s,]+/).filter(m => m.trim() !== '');
    const members = rawMembers.map(formatMember);

    setIsExecutingWizard(true);
    setError(null);
    setSuccessMessage(null);
    setExecutionLogs([]);

    addLog(`Starting DataStore ACL Two-Way Synchronization (${isDryRun ? 'DRY-RUN PREVIEW' : 'LIVE EXECUTION'})`);
    addLog(`Target Principals: ${members.join(', ')}`);
    addLog(`App Engine: ${appId} (Location: ${config.appLocation || 'global'})`);
    addLog(`Rule: Checked items will be GRANTED; unchecked items will be REVOKED.`);

    try {
      // Step Appendix A: Custom Role
      if (wizardCheckCustomRole && wizardGrantProjectRole) {
        addLog(`--- Appendix A: Checking project custom role '${CUSTOM_ROLE_ID}' ---`);
        let roleFound = customRoleExists;
        if (roleFound === null) {
          try {
            const r = await api.getCustomRole(projectId, CUSTOM_ROLE_ID);
            roleFound = !!(r && r.name);
          } catch {
            roleFound = false;
          }
        }

        if (roleFound) {
          addLog(`[VERIFIED ✓] Custom role 'projects/${projectId}/roles/${CUSTOM_ROLE_ID}' exists.`);
        } else {
          if (isDryRun) {
            addLog(`[DRY-RUN] Custom role not found. Would create custom role '${CUSTOM_ROLE_ID}'.`);
          } else {
            addLog(`[ACTION] Creating custom role '${CUSTOM_ROLE_ID}'...`);
            await api.createCustomRole(projectId, CUSTOM_ROLE_ID, {
              title: 'Custom Gemini Enterprise Restricted End User',
              description: 'Base project-level permissions to view Gemini Enterprise config page.',
              stage: 'GA',
              includedPermissions: ['discoveryengine.locations.buildAuthorizationUrl'],
            });
            setCustomRoleExists(true);
            addLog(`[VERIFIED ✓] Custom role '${CUSTOM_ROLE_ID}' created successfully.`);
          }
        }
      }

      // Loop for each target member
      for (const member of members) {
        addLog(`\n======================================================`);
        addLog(`Syncing Permissions for Member: ${member}`);
        addLog(`======================================================`);

        // Step A1: Project-level role binding
        addLog(`--- Step A1: ${wizardGrantProjectRole ? 'Granting' : 'Revoking'} project-level custom role ---`);
        const fullRole = `projects/${projectId}/roles/${CUSTOM_ROLE_ID}`;
        await syncPolicyRMW(
          `Project '${projectId}'`,
          () => api.getProjectIamPolicy(projectId),
          (p) => api.setProjectIamPolicy(projectId, p),
          member,
          fullRole,
          wizardGrantProjectRole
        );

        // Step A2: App Engine role binding
        addLog(`--- Step A2: ${wizardGrantEngineRole ? 'Granting' : 'Revoking'} access on App Engine '${appId}' ---`);
        await syncPolicyRMW(
          `App Engine '${appId}'`,
          () => api.getEngineIamPolicy(engine.name, config),
          (p) => api.setEngineIamPolicy(engine.name, p, config),
          member,
          AGENTSPACE_USER_ROLE,
          wizardGrantEngineRole
        );

        // Step A3: DataConnectors and Entities
        for (const conn of connectors) {
          const shouldGrantConn = !!selectedResourcesForGrant[`connector:${conn.id}`];
          addLog(`--- Step A3: ${shouldGrantConn ? 'Granting' : 'Revoking'} DataConnector Collection '${conn.id}' ---`);
          await syncPolicyRMW(
            `DataConnector Collection '${conn.id}'`,
            () => api.getCollectionIamPolicy(conn.id, config),
            (p) => api.setCollectionIamPolicy(conn.id, p, config),
            member,
            AGENTSPACE_USER_ROLE,
            shouldGrantConn
          );

          for (const ent of conn.entities) {
            const shouldGrantEnt = !!selectedResourcesForGrant[`entity:${ent.id}`];
            addLog(`  Sub-step: ${shouldGrantEnt ? 'Granting' : 'Revoking'} Entity DataStore '${ent.id}' under '${conn.id}'`);
            await syncPolicyRMW(
              `Entity DataStore '${ent.id}'`,
              () => api.getDataStoreIamPolicy(ent.id, config),
              (p) => api.setDataStoreIamPolicy(ent.id, p, config),
              member,
              AGENTSPACE_USER_ROLE,
              shouldGrantEnt
            );
          }
        }

        // Step A4: Legacy DataStores
        for (const ds of legacyDataStores) {
          const shouldGrantDs = !!selectedResourcesForGrant[`datastore:${ds.id}`];
          addLog(`--- Step A4: ${shouldGrantDs ? 'Granting' : 'Revoking'} Legacy DataStore '${ds.id}' ---`);
          await syncPolicyRMW(
            `Legacy DataStore '${ds.id}'`,
            () => api.getDataStoreIamPolicy(ds.id, config),
            (p) => api.setDataStoreIamPolicy(ds.id, p, config),
            member,
            AGENTSPACE_USER_ROLE,
            shouldGrantDs
          );
        }
      }

      addLog(`\n[COMPLETE ✓] All synchronization operations finished successfully!`);
      setSuccessMessage(
        isDryRun
          ? 'Dry-run preview completed successfully without making changes.'
          : `Successfully synchronized DataStore permissions for ${members.length} member(s)!`
      );

      if (!isDryRun) {
        refreshAll();
      }
    } catch (err: any) {
      addLog(`[ERROR ❌] Operation failed: ${err.message}`);
      setError(err.message || 'Workflow failed.');
    } finally {
      setIsExecutingWizard(false);
    }
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
    projectPolicy?.bindings?.forEach((b: any) => {
      b.members?.forEach((m: string) => {
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
    enginePolicy?.bindings?.forEach((b: any) => {
      if (b.role === AGENTSPACE_USER_ROLE || b.role?.includes('agentspace')) {
        b.members?.forEach((m: string) => {
          const u = getOrCreate(m);
          u.hasEngineAccess = true;
        });
      }
    });

    // 3. Count Total DataStores
    let totalDsCount = 0;
    connectors.forEach(c => {
      totalDsCount += 1;
      totalDsCount += c.entities.length;
    });
    totalDsCount += legacyDataStores.length;

    // 4. Process Connectors & DataStores
    connectors.forEach(conn => {
      const connMembers = conn.policy?.bindings?.find((b: any) => b.role === AGENTSPACE_USER_ROLE)?.members || [];
      connMembers.forEach((m: string) => {
        const u = getOrCreate(m);
        if (!u.accessibleDataStores.includes(conn.displayName || conn.id)) {
          u.accessibleDataStores.push(conn.displayName || conn.id);
        }
      });

      conn.entities.forEach(ent => {
        const entMembers = ent.policy?.bindings?.find((b: any) => b.role === AGENTSPACE_USER_ROLE)?.members || [];
        entMembers.forEach((m: string) => {
          const u = getOrCreate(m);
          if (!u.accessibleDataStores.includes(ent.displayName || ent.id)) {
            u.accessibleDataStores.push(ent.displayName || ent.id);
          }
        });
      });
    });

    legacyDataStores.forEach(ds => {
      const dsMembers = ds.policy?.bindings?.find((b: any) => b.role === AGENTSPACE_USER_ROLE)?.members || [];
      dsMembers.forEach((m: string) => {
        const u = getOrCreate(m);
        if (!u.accessibleDataStores.includes(ds.displayName || ds.id)) {
          u.accessibleDataStores.push(ds.displayName || ds.id);
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

  // Filtered Users List
  const filteredUsersList = useMemo(() => {
    return allUsersList.filter(u => {
      if (userFilterType === 'needs_isolation' && !u.hasBroadRoles) return false;
      if (userFilterType === 'isolated' && (!u.hasCustomRole || u.hasBroadRoles)) return false;
      if (userFilterType === 'engine_access' && !u.hasEngineAccess) return false;

      if (userSearchQuery.trim()) {
        const q = userSearchQuery.toLowerCase();
        const matchesMember = u.member.toLowerCase().includes(q);
        const matchesRole = u.projectRoles.some(r => r.toLowerCase().includes(q));
        const matchesDs = u.accessibleDataStores.some(d => d.toLowerCase().includes(q));
        if (!matchesMember && !matchesRole && !matchesDs) return false;
      }

      return true;
    });
  }, [allUsersList, userFilterType, userSearchQuery]);

  // Execute Isolation Action
  const handleExecuteIsolation = async (membersToIsolate: string[]) => {
    setIsIsolating(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const currentProjPolicy = await api.getProjectIamPolicy(projectId);
      const etag = currentProjPolicy.etag || '';
      const customRoleName = `projects/${projectId}/roles/${CUSTOM_ROLE_ID}`;

      // Ensure custom role exists
      if (!customRoleExists) {
        try {
          await api.createCustomRole(projectId, CUSTOM_ROLE_ID, {
            title: 'Custom Gemini Enterprise Restricted End User',
            description: 'Base project-level permissions to view Gemini Enterprise config page.',
            stage: 'GA',
            includedPermissions: ['discoveryengine.locations.buildAuthorizationUrl'],
          });
          setCustomRoleExists(true);
        } catch (e) {
          console.warn('Custom role may already exist', e);
        }
      }

      // Filter out broad roles for these members
      const updatedBindings = (currentProjPolicy.bindings || []).map((b: any) => {
        if (BROAD_PROJECT_ROLES.includes(b.role)) {
          return {
            ...b,
            members: (b.members || []).filter((m: string) => !membersToIsolate.includes(m)),
          };
        }
        return b;
      }).filter((b: any) => b.members && b.members.length > 0);

      // Add custom role binding for these members
      let customRoleBinding = updatedBindings.find((b: any) => b.role === customRoleName);
      if (!customRoleBinding) {
        customRoleBinding = { role: customRoleName, members: [] };
        updatedBindings.push(customRoleBinding);
      }
      membersToIsolate.forEach(m => {
        if (!customRoleBinding.members.includes(m)) {
          customRoleBinding.members.push(m);
        }
      });

      await api.setProjectIamPolicy(projectId, { etag, bindings: updatedBindings });
      setSuccessMessage(
        `Successfully isolated ${membersToIsolate.length} user(s)! Broad project-wide roles removed, and '${CUSTOM_ROLE_ID}' granted. Pre-filled into Provisioner below to assign App Engine and DataStore permissions.`
      );

      // Pre-fill wizard with these members
      const cleanedMembers = membersToIsolate.map(m => m.replace(/^(user|group|serviceAccount):/, '')).join(', ');
      setTargetMembersInput(cleanedMembers);
      setWizardGrantProjectRole(false); // already done!
      setWizardGrantEngineRole(true);
      setIsWizardOpen(true);
      setSelectedUsersForIsolation(new Set());

      // Refresh all policies
      await refreshAll();

      // Smooth scroll to wizard
      setTimeout(() => {
        document.getElementById('wizard-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err: any) {
      setError(`Failed to isolate user(s): ${err.message}`);
    } finally {
      setIsIsolating(false);
      setIsolateModalTarget(null);
    }
  };

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
    projectPolicy?.bindings?.forEach((b: any) => {
      if (b.role === targetProjectRole) {
        b.members?.forEach((m: string) => {
          getOrCreate(m).hasProjectRole = true;
        });
      }
    });

    // 2. Check Engine Policy
    enginePolicy?.bindings?.forEach((b: any) => {
      if (b.role === AGENTSPACE_USER_ROLE || b.role?.includes('agentspace')) {
        b.members?.forEach((m: string) => {
          getOrCreate(m).hasEngineAccess = true;
        });
      }
    });

    // 3. Check Connectors & Entities
    connectors.forEach(conn => {
      conn.policy?.bindings?.forEach((b: any) => {
        if (b.role === AGENTSPACE_USER_ROLE) {
          b.members?.forEach((m: string) => {
            getOrCreate(m).resourceAccess[`connector:${conn.id}`] = true;
          });
        }
      });
      conn.entities.forEach(ent => {
        ent.policy?.bindings?.forEach((b: any) => {
          if (b.role === AGENTSPACE_USER_ROLE) {
            b.members?.forEach((m: string) => {
              getOrCreate(m).resourceAccess[`entity:${ent.id}`] = true;
            });
          }
        });
      });
    });

    // 4. Check Legacy DataStores
    legacyDataStores.forEach(ds => {
      ds.policy?.bindings?.forEach((b: any) => {
        if (b.role === AGENTSPACE_USER_ROLE) {
          b.members?.forEach((m: string) => {
            getOrCreate(m).resourceAccess[`datastore:${ds.id}`] = true;
          });
        }
      });
    });

    return Object.values(principalMap);
  }, [projectId, projectPolicy, enginePolicy, connectors, legacyDataStores]);

  // Filtered Matrix
  const filteredMatrix = useMemo(() => {
    if (!searchQuery) return principalMatrix;
    const lower = searchQuery.toLowerCase();
    return principalMatrix.filter(p => p.member.toLowerCase().includes(lower));
  }, [principalMatrix, searchQuery]);

  // Export Matrix to CSV
  const exportToCsv = () => {
    if (filteredMatrix.length === 0) return;

    const headers = [
      'Member',
      'Project Custom Role',
      'App Engine Access',
      ...connectors.map(c => `Connector: ${c.id}`),
      ...connectors.flatMap(c => c.entities.map(e => `Entity: ${e.id}`)),
      ...legacyDataStores.map(ds => `DataStore: ${ds.id}`),
    ];

    const rows = [headers.join(',')];

    filteredMatrix.forEach(p => {
      const row = [
        `"${p.member}"`,
        p.hasProjectRole ? 'Granted' : 'Missing',
        p.hasEngineAccess ? 'Granted' : 'Missing',
        ...connectors.map(c => (p.resourceAccess[`connector:${c.id}`] ? 'Granted' : 'None')),
        ...connectors.flatMap(c =>
          c.entities.map(e => (p.resourceAccess[`entity:${e.id}`] ? 'Granted' : 'None'))
        ),
        ...legacyDataStores.map(ds =>
          p.resourceAccess[`datastore:${ds.id}`] ? 'Granted' : 'None'
        ),
      ];
      rows.push(row.join(','));
    });

    const csvBlob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(csvBlob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${appId}_datastore_permissions_audit.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Quick Revoke Member from a specific resource
  const handleRevoke = async (
    member: string,
    resourceType: ResourceType,
    resourceId: string,
    resourceDesc: string
  ) => {
    if (!confirm(`Are you sure you want to revoke '${member}' from ${resourceDesc}?`)) return;

    setIsLoading(true);
    setError(null);
    try {
      let getFn: () => Promise<any>;
      let setFn: (policy: any) => Promise<any>;

      if (resourceType === 'engine') {
        getFn = () => api.getEngineIamPolicy(engine.name, config);
        setFn = (p) => api.setEngineIamPolicy(engine.name, p, config);
      } else if (resourceType === 'connector') {
        getFn = () => api.getCollectionIamPolicy(resourceId, config);
        setFn = (p) => api.setCollectionIamPolicy(resourceId, p, config);
      } else {
        getFn = () => api.getDataStoreIamPolicy(resourceId, config);
        setFn = (p) => api.setDataStoreIamPolicy(resourceId, p, config);
      }

      const policy = await getFn();
      const etag = policy.etag || '';
      const bindings = (policy.bindings || []).map((b: any) => {
        if (b.role === AGENTSPACE_USER_ROLE) {
          return {
            ...b,
            members: (b.members || []).filter((m: string) => m !== member),
          };
        }
        return b;
      }).filter((b: any) => b.members && b.members.length > 0);

      await setFn({ etag, bindings });
      setSuccessMessage(`Revoked '${member}' from ${resourceDesc}.`);
      refreshAll();
    } catch (err: any) {
      setError(`Failed to revoke access: ${err.message}`);
      setIsLoading(false);
    }
  };

  const allConnectedResourcesCount =
    connectors.filter(c => c.isAttached).length +
    connectors.flatMap(c => c.entities).length +
    legacyDataStores.filter(ds => ds.isAttached).length;

  return (
    <div className="space-y-6">
      {/* 1. Header & Prerequisites Banner */}
      <div className="bg-gray-800 p-5 rounded-xl border border-gray-700 shadow-md">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold text-white">Connected DataStore Permissions</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-900/60 text-purple-300 border border-purple-600 animate-pulse">
                Beta
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-700 text-gray-300 border border-gray-600">
                Mendel Flag Controlled
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1.5 max-w-3xl leading-relaxed">
              Configure fine-grained App-level and DataStore-level permission controls for Gemini Enterprise end users without granting broad project-wide privileges.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
            <button
              onClick={() => setShowInstructionsGuide(!showInstructionsGuide)}
              className={`px-3.5 py-2 border text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm ${
                showInstructionsGuide
                  ? 'bg-purple-900/60 border-purple-500 text-purple-200'
                  : 'bg-gray-700 hover:bg-gray-600 border-gray-600 text-gray-200'
              }`}
            >
              <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              {showInstructionsGuide ? 'Hide Step-by-Step Guide' : '📘 Step-by-Step Guide'}
            </button>
            <button
              onClick={() => setIsScriptModalOpen(true)}
              className="px-3.5 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-200 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              View Scripts & cURL
            </button>
            <button
              onClick={refreshAll}
              disabled={isLoading}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
            >
              <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh Policies
            </button>
          </div>
        </div>

        {/* Custom Role Status Sub-Card */}
        <div className="mt-4 pt-4 border-t border-gray-700/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-gray-900/50 p-3 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-900/40 border border-blue-700/50 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-200">
                  Project Custom Role (Appendix A): <code className="text-blue-300">{CUSTOM_ROLE_ID}</code>
                </span>
                {customRoleExists === true ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-green-900/50 text-green-400 border border-green-700">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Active in Project
                  </span>
                ) : customRoleExists === false ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-yellow-900/50 text-yellow-300 border border-yellow-700">
                    Not Detected
                  </span>
                ) : (
                  <span className="text-xs text-gray-500">Checking...</span>
                )}
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Contains permission: <code className="text-purple-300">discoveryengine.locations.buildAuthorizationUrl</code>
              </p>
            </div>
          </div>

          {customRoleExists === false && (
            <button
              onClick={handleCreateCustomRole}
              disabled={isCreatingRole}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-semibold rounded-md shadow transition-colors disabled:opacity-50 flex items-center gap-1 whitespace-nowrap"
            >
              {isCreatingRole ? 'Creating...' : '+ Create Custom Role in Project'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-200 p-4 rounded-xl text-sm flex items-start gap-3">
          <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <div className="flex-1">{error}</div>
        </div>
      )}

      {successMessage && (
        <div className="bg-green-900/30 border border-green-800 text-green-200 p-4 rounded-xl text-sm flex items-start gap-3">
          <svg className="w-5 h-5 text-green-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <div className="flex-1">{successMessage}</div>
        </div>
      )}

      {/* Expandable Step-by-Step Instructions Banner */}
      {showInstructionsGuide && (
        <div className="bg-gray-800 rounded-xl border border-purple-700/60 shadow-lg p-6 space-y-5 animate-fade-in">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-purple-900/40 border border-purple-600/50 flex items-center justify-center text-purple-300 font-bold text-sm">
                📘
              </div>
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  Step-by-Step Guide: How to Restrict a DataStore in Gemini Enterprise
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-900/60 text-purple-300 border border-purple-600">Beta</span>
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Follow these 5 steps to grant an end user or group access to this Assistant while restricting them to only authorized DataStores.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowInstructionsGuide(false)}
              className="text-gray-400 hover:text-gray-200 text-xs px-2.5 py-1 bg-gray-750 hover:bg-gray-700 rounded border border-gray-600 transition-colors"
            >
              ✕ Close Guide
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Step 0 */}
            <div className="bg-gray-900/80 border border-gray-700/80 rounded-lg p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-white font-semibold">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">0</span>
                <span>Prerequisites: Allowlisting & User Isolation</span>
              </div>
              <ul className="list-disc pl-7 text-gray-300 space-y-1">
                <li>Project must be allowlisted under Mendel flag (<code className="text-purple-300">bogao@</code>).</li>
                <li><strong>Critical:</strong> Ensure target end users do <em>not</em> possess broad project-wide roles (<code className="text-red-300">roles/viewer</code>, <code className="text-red-300">roles/editor</code>, or <code className="text-red-300">roles/discoveryengine.admin</code>) as broad roles bypass datastore-level ACLs.</li>
              </ul>
            </div>

            {/* Step 1 */}
            <div className="bg-gray-900/80 border border-gray-700/80 rounded-lg p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-white font-semibold">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">1</span>
                <span>Create Project Custom Role (Appendix A)</span>
              </div>
              <p className="pl-7 text-gray-300">
                Ensure custom role <code className="text-blue-300">customRestrictedEndUser</code> exists with permission <code className="text-green-300">discoveryengine.locations.buildAuthorizationUrl</code>.
              </p>
              <p className="pl-7 text-gray-400 italic">
                👉 Click "+ Create Custom Role in Project" above if missing.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-gray-900/80 border border-gray-700/80 rounded-lg p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-white font-semibold">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">2</span>
                <span>Grant Custom Role at Project Level (Step A1)</span>
              </div>
              <p className="pl-7 text-gray-300">
                Grant <code className="text-blue-300">projects/{projectId}/roles/customRestrictedEndUser</code> to the target email (<code className="text-yellow-300">user:alice@example.com</code> or <code className="text-yellow-300">group:finance-team@example.com</code>).
              </p>
              <p className="pl-7 text-gray-400">
                Enables user to load the web app without viewing any backend data.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-gray-900/80 border border-gray-700/80 rounded-lg p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-white font-semibold">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">3</span>
                <span>Grant App Engine Access (Step A2)</span>
              </div>
              <p className="pl-7 text-gray-300">
                Grant <code className="text-blue-300">roles/discoveryengine.agentspaceUser</code> on App Engine <code className="text-purple-300">{appId}</code>.
              </p>
              <p className="pl-7 text-gray-400">
                Authorizes the user to interact with this specific Assistant.
              </p>
            </div>

            {/* Step 4 */}
            <div className="bg-gray-900/80 border border-gray-700/80 rounded-lg p-4 space-y-1.5 md:col-span-2">
              <div className="flex items-center gap-2 text-white font-semibold">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">4</span>
                <span>Grant Access ONLY to Authorized DataStores (Steps A3 & A4)</span>
              </div>
              <div className="pl-7 space-y-1.5 text-gray-300">
                <p>
                  Grant <code className="text-blue-300">roles/discoveryengine.agentspaceUser</code> strictly on the DataStores/Connectors this user is allowed to query:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-gray-300">
                  <li><strong>DataConnectors:</strong> Grant on both the collection resource and each entity datastore.</li>
                  <li><strong>Legacy DataStores:</strong> Grant on the datastore resource.</li>
                </ul>
                <div className="p-2.5 bg-yellow-950/40 border border-yellow-800/60 rounded text-yellow-300 mt-2">
                  🔒 <strong>How restriction works:</strong> Any connected DataStore where the user is <em>not</em> explicitly granted <code className="text-yellow-200">roles/discoveryengine.agentspaceUser</code> remains completely hidden and blocked from search/grounding.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Active Users & Access Inspector Box */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-md overflow-hidden">
        <div className="p-4 bg-gray-750 border-b border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-600/30 text-indigo-400 flex items-center justify-center font-bold text-xs">
                👥
              </div>
              <h3 className="text-base font-bold text-white">Active Users & Access Inspector</h3>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-700 text-gray-300 border border-gray-600">
                {allUsersList.length} Identit{allUsersList.length === 1 ? 'y' : 'ies'} Found
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Inspect current project & engine roles, identify broad roles that bypass DataStore ACLs, and isolate users with 1-click.
            </p>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            {selectedUsersForIsolation.size > 0 && (
              <button
                type="button"
                onClick={() =>
                  setIsolateModalTarget({
                    members: Array.from(selectedUsersForIsolation),
                    broadRoles: Array.from(
                      new Set(
                        allUsersList
                          .filter(u => selectedUsersForIsolation.has(u.member))
                          .flatMap(u => u.broadRoles)
                      )
                    ),
                  })
                }
                className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-1.5 animate-pulse"
              >
                <span>⚡ Isolate Selected ({selectedUsersForIsolation.size})</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="p-4 bg-gray-900/50 border-b border-gray-700/80 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {[
              { key: 'all', label: `All (${allUsersList.length})` },
              {
                key: 'needs_isolation',
                label: `⚠️ Broad Roles / Needs Isolation (${
                  allUsersList.filter(u => u.hasBroadRoles).length
                })`,
              },
              {
                key: 'isolated',
                label: `🟢 Isolated & Ready (${
                  allUsersList.filter(u => u.hasCustomRole && !u.hasBroadRoles).length
                })`,
              },
              {
                key: 'engine_access',
                label: `App Engine Members (${
                  allUsersList.filter(u => u.hasEngineAccess).length
                })`,
              },
            ].map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setUserFilterType(tab.key as any)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  userFilterType === tab.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200 border border-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-64">
            <input
              type="text"
              placeholder="Search user / role / datastore..."
              value={userSearchQuery}
              onChange={e => setUserSearchQuery(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            {userSearchQuery && (
              <button
                type="button"
                onClick={() => setUserSearchQuery('')}
                className="absolute right-2.5 top-1.5 text-gray-400 hover:text-white text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* User Table */}
        <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-700 text-left text-xs">
            <thead className="bg-gray-900 text-gray-400 font-semibold sticky top-0 z-10">
              <tr>
                <th className="p-3 w-10">
                  <input
                    type="checkbox"
                    checked={
                      filteredUsersList.length > 0 &&
                      filteredUsersList.every(u => selectedUsersForIsolation.has(u.member))
                    }
                    onChange={e => {
                      if (e.target.checked) {
                        const newSet = new Set(selectedUsersForIsolation);
                        filteredUsersList.forEach(u => newSet.add(u.member));
                        setSelectedUsersForIsolation(newSet);
                      } else {
                        const newSet = new Set(selectedUsersForIsolation);
                        filteredUsersList.forEach(u => newSet.delete(u.member));
                        setSelectedUsersForIsolation(newSet);
                      }
                    }}
                    className="rounded bg-gray-800 border-gray-600 text-blue-500 focus:ring-0"
                  />
                </th>
                <th className="p-3">Identity (User / Group)</th>
                <th className="p-3">Project Roles & Status</th>
                <th className="p-3">App Engine Access</th>
                <th className="p-3">DataStore Grants</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/60 bg-gray-800/40">
              {filteredUsersList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-gray-500 italic">
                    No users matching the current filter.
                  </td>
                </tr>
              ) : (
                filteredUsersList.map(u => {
                  const isSelected = selectedUsersForIsolation.has(u.member);
                  return (
                    <tr
                      key={u.member}
                      className={`hover:bg-gray-750 transition-colors ${
                        u.hasBroadRoles ? 'bg-yellow-950/10' : ''
                      }`}
                    >
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={e => {
                            const newSet = new Set(selectedUsersForIsolation);
                            if (e.target.checked) {
                              newSet.add(u.member);
                            } else {
                              newSet.delete(u.member);
                            }
                            setSelectedUsersForIsolation(newSet);
                          }}
                          className="rounded bg-gray-800 border-gray-600 text-blue-500 focus:ring-0"
                        />
                      </td>

                      <td className="p-3 font-mono text-gray-200">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-bold uppercase ${
                              u.type === 'user'
                                ? 'bg-blue-900/60 text-blue-300 border border-blue-700/60'
                                : u.type === 'group'
                                ? 'bg-purple-900/60 text-purple-300 border border-purple-700/60'
                                : 'bg-gray-700 text-gray-300'
                            }`}
                          >
                            {u.type}
                          </span>
                          <span className="truncate max-w-[200px]" title={u.member}>
                            {u.member.replace(/^(user|group|serviceAccount):/, '')}
                          </span>
                        </div>
                      </td>

                      <td className="p-3">
                        <div className="space-y-1">
                          {u.hasBroadRoles ? (
                            <div>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-900/50 text-red-300 border border-red-700">
                                ⚠️ Bypasses ACLs
                              </span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {u.broadRoles.map(r => (
                                  <span
                                    key={r}
                                    className="px-1.5 py-0.5 bg-gray-900 text-red-400 font-mono text-[10px] rounded border border-red-800/60"
                                  >
                                    {r.replace('roles/', '')}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : u.hasCustomRole ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-green-900/50 text-green-400 border border-green-700">
                              🟢 customRestrictedEndUser
                            </span>
                          ) : (
                            <span className="text-[11px] text-gray-500 italic">No Project Custom Role</span>
                          )}
                        </div>
                      </td>

                      <td className="p-3">
                        {u.hasEngineAccess ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-green-900/50 text-green-400 border border-green-700">
                            ✓ Granted ({appId})
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-500 italic">No Engine Access</span>
                        )}
                      </td>

                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold font-mono ${
                              u.accessibleDataStoreCount > 0
                                ? 'bg-blue-900/50 text-blue-300 border border-blue-700'
                                : 'bg-gray-800 text-gray-500 border border-gray-700'
                            }`}
                          >
                            {u.accessibleDataStoreCount} of {u.totalDataStoreCount}
                          </span>
                          {u.accessibleDataStores.length > 0 && (
                            <span className="text-[10px] text-gray-400 truncate max-w-[120px]" title={u.accessibleDataStores.join(', ')}>
                              ({u.accessibleDataStores.slice(0, 2).join(', ')}{u.accessibleDataStores.length > 2 ? '...' : ''})
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {u.hasBroadRoles || !u.hasCustomRole ? (
                            <button
                              type="button"
                              onClick={() =>
                                setIsolateModalTarget({
                                  members: [u.member],
                                  broadRoles: u.broadRoles,
                                })
                              }
                              className="px-2.5 py-1 bg-yellow-600 hover:bg-yellow-500 text-white text-[11px] font-semibold rounded shadow-sm transition-colors flex items-center gap-1 whitespace-nowrap"
                            >
                              <span>⚡ Isolate</span>
                            </button>
                          ) : null}

                          <button
                            type="button"
                            onClick={() => {
                              const cleaned = u.member.replace(/^(user|group|serviceAccount):/, '');
                              setTargetMembersInput(cleaned);
                              setWizardGrantProjectRole(!u.hasCustomRole);
                              setWizardGrantEngineRole(true);
                              setIsWizardOpen(true);
                              document.getElementById('wizard-section')?.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className="px-2.5 py-1 bg-blue-600/80 hover:bg-blue-600 text-white text-[11px] font-semibold rounded shadow-sm transition-colors whitespace-nowrap"
                          >
                            Configure DataStores ↓
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Interactive Permission Setup Wizard */}
      <div id="wizard-section" className="bg-gray-800 rounded-xl border border-gray-700 shadow-md overflow-hidden">
        <div
          onClick={() => setIsWizardOpen(!isWizardOpen)}
          className="p-4 bg-gray-750 border-b border-gray-700 flex justify-between items-center cursor-pointer hover:bg-gray-700/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600/30 text-blue-400 flex items-center justify-center font-bold text-xs">
              ⚡
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Interactive End-User Permission Provisioner</h3>
              <p className="text-xs text-gray-400">Automates Steps A1 - A4 in 1-Click with live post-audit verification</p>
            </div>
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-5 w-5 text-gray-400 transition-transform ${isWizardOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </div>

        {isWizardOpen && (
          <form onSubmit={handleExecuteWizard} className="p-6 space-y-6">
            {/* Input Principals */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-semibold text-gray-200">
                  Target User / Group Email(s)
                </label>
                {targetMembersInput.trim() && (
                  <button
                    type="button"
                    onClick={() => populateWizardForMember(targetMembersInput)}
                    className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
                  >
                    <span>🔄 Reload Current Config</span>
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400 mb-2">
                Enter single email or comma-separated list. Accepts standard emails (e.g. <code>userA@example.com</code>) or workforce pool identifiers (e.g. <code>principal://...</code>).
              </p>
              <input
                type="text"
                value={targetMembersInput}
                onChange={(e) => setTargetMembersInput(e.target.value)}
                placeholder="e.g., userA@example.com, principal://iam.googleapis.com/.../subject/user@domain.com"
                className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <div className="mt-2 text-[11px] text-blue-300 bg-blue-950/40 p-2.5 rounded-lg border border-blue-800/50 flex items-center gap-1.5">
                <span>⚡</span>
                <span>
                  <strong>Two-Way Synchronization Active:</strong> Checkboxes automatically load the principal's current permissions. Checking an item will <strong>grant</strong> access; unchecking an item will <strong>revoke</strong> access on save.
                </span>
              </div>
            </div>

            {/* Workflow Step Options */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Step 1 Checkbox */}
              <div className="bg-gray-900/60 p-3.5 rounded-lg border border-gray-700/80">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wizardCheckCustomRole}
                    onChange={(e) => setWizardCheckCustomRole(e.target.checked)}
                    className="mt-1 rounded bg-gray-800 border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-white block">Appendix A: Check Custom Role</span>
                    <span className="text-[11px] text-gray-400 block mt-0.5">
                      Verify or create <code>customRestrictedEndUser</code> role.
                    </span>
                  </div>
                </label>
              </div>

              {/* Step 2 Checkbox */}
              <div className="bg-gray-900/60 p-3.5 rounded-lg border border-gray-700/80">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wizardGrantProjectRole}
                    onChange={(e) => setWizardGrantProjectRole(e.target.checked)}
                    className="mt-1 rounded bg-gray-800 border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-white block">Step A1: Grant Project Custom Role</span>
                    <span className="text-[11px] text-gray-400 block mt-0.5">
                      {wizardGrantProjectRole ? 'Grant' : 'Revoke'} <code>customRestrictedEndUser</code> at project level.
                    </span>
                  </div>
                </label>
              </div>

              {/* Step 3 Checkbox */}
              <div className="bg-gray-900/60 p-3.5 rounded-lg border border-gray-700/80">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wizardGrantEngineRole}
                    onChange={(e) => setWizardGrantEngineRole(e.target.checked)}
                    className="mt-1 rounded bg-gray-800 border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-white block">Step A2: Grant on App Engine</span>
                    <span className="text-[11px] text-gray-400 block mt-0.5">
                      {wizardGrantEngineRole ? 'Grant' : 'Revoke'} <code>roles/discoveryengine.agentspaceUser</code> on {appId}.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Step A3 & A4: Target DataStores Selection */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-semibold text-gray-200">
                  Steps A3 & A4: Select Connected DataStores & Connectors to Grant Access
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const allSelected: Record<string, boolean> = {};
                      connectors.forEach(c => {
                        allSelected[`connector:${c.id}`] = true;
                        c.entities.forEach(e => {
                          allSelected[`entity:${e.id}`] = true;
                        });
                      });
                      legacyDataStores.forEach(ds => {
                        allSelected[`datastore:${ds.id}`] = true;
                      });
                      setSelectedResourcesForGrant(allSelected);
                    }}
                    className="text-xs text-blue-400 hover:text-blue-300 font-medium"
                  >
                    Select All
                  </button>
                  <span className="text-gray-600">|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedResourcesForGrant({})}
                    className="text-xs text-gray-400 hover:text-gray-300 font-medium"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              <div className="space-y-3 bg-gray-900/50 p-4 rounded-xl border border-gray-700 max-h-64 overflow-y-auto">
                {connectors.length === 0 && legacyDataStores.length === 0 && (
                  <p className="text-xs text-gray-500 italic py-2">No DataStores or Connectors found in this location.</p>
                )}

                {/* Connectors */}
                {connectors.map(conn => (
                  <div key={conn.id} className="bg-gray-800/80 p-3 rounded-lg border border-gray-700/80">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!selectedResourcesForGrant[`connector:${conn.id}`]}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setSelectedResourcesForGrant(prev => {
                            const updated = { ...prev, [`connector:${conn.id}`]: val };
                            conn.entities.forEach(ent => {
                              updated[`entity:${ent.id}`] = val;
                            });
                            return updated;
                          });
                        }}
                        className="rounded bg-gray-700 border-gray-600 text-purple-600 focus:ring-purple-500"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-purple-300 font-mono">{conn.id}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-950 text-purple-300 border border-purple-800">
                          DataConnector
                        </span>
                        {conn.isAttached && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-950 text-green-300 border border-green-800">
                            Attached to App
                          </span>
                        )}
                      </div>
                    </label>

                    {/* Connector Entities */}
                    {conn.entities.length > 0 && (
                      <div className="mt-2 pl-6 space-y-1.5 border-l-2 border-purple-900/50 ml-2">
                        {conn.entities.map(ent => (
                          <label key={ent.id} className="flex items-center gap-2 cursor-pointer text-xs">
                            <input
                              type="checkbox"
                              checked={!!selectedResourcesForGrant[`entity:${ent.id}`]}
                              onChange={(e) =>
                                setSelectedResourcesForGrant(prev => ({
                                  ...prev,
                                  [`entity:${ent.id}`]: e.target.checked,
                                }))
                              }
                              className="rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-gray-300 font-mono text-[11px]">{ent.id}</span>
                            <span className="text-[10px] text-gray-500">(Entity DataStore)</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {/* Legacy DataStores */}
                {legacyDataStores.map(ds => (
                  <div key={ds.id} className="bg-gray-800/80 p-3 rounded-lg border border-gray-700/80">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!selectedResourcesForGrant[`datastore:${ds.id}`]}
                        onChange={(e) =>
                          setSelectedResourcesForGrant(prev => ({
                            ...prev,
                            [`datastore:${ds.id}`]: e.target.checked,
                          }))
                        }
                        className="rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-200 font-mono">{ds.id}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-950 text-blue-300 border border-blue-800">
                          Legacy DataStore
                        </span>
                        {ds.isAttached && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-950 text-green-300 border border-green-800">
                            Attached to App
                          </span>
                        )}
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Execution Controls */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-4 border-t border-gray-700">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isDryRun}
                  onChange={(e) => setIsDryRun(e.target.checked)}
                  className="rounded bg-gray-800 border-gray-600 text-yellow-500 focus:ring-yellow-400"
                />
                <span className="text-xs font-semibold text-gray-300">
                  Dry-Run Preview Mode <span className="text-gray-500 font-normal">(simulate and verify without writing to live policies)</span>
                </span>
              </label>

              <button
                type="submit"
                disabled={isExecutingWizard || !targetMembersInput.trim()}
                className={`px-6 py-2.5 rounded-lg text-sm font-bold text-white shadow-lg transition-all flex items-center gap-2 ${
                  isDryRun
                    ? 'bg-yellow-600 hover:bg-yellow-500'
                    : 'bg-blue-600 hover:bg-blue-500'
                } disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed`}
              >
                {isExecutingWizard ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Syncing Permissions...
                  </>
                ) : isDryRun ? (
                  'Preview Synchronization (Dry Run)'
                ) : (
                  'Apply & Sync Permissions'
                )}
              </button>
            </div>

            {/* Execution Console Output */}
            {executionLogs.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-700">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">Live Execution Activity Log</h4>
                  <button
                    type="button"
                    onClick={() => setExecutionLogs([])}
                    className="text-[11px] text-gray-500 hover:text-gray-400"
                  >
                    Clear Log
                  </button>
                </div>
                <div className="p-3.5 bg-gray-950 rounded-lg border border-gray-800 font-mono text-xs text-gray-200 max-h-56 overflow-y-auto space-y-1 select-all">
                  {executionLogs.map((log, i) => (
                    <div
                      key={i}
                      className={
                        log.includes('[VERIFIED ✓]')
                          ? 'text-green-400 font-semibold'
                          : log.includes('[ACTION]')
                          ? 'text-blue-400'
                          : log.includes('[SKIP]')
                          ? 'text-yellow-400'
                          : log.includes('[ERROR')
                          ? 'text-red-400 font-bold'
                          : 'text-gray-300'
                      }
                    >
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </form>
        )}
      </div>

      {/* 3. Connected Resources Grid */}
      <div className="bg-gray-800 p-5 rounded-xl border border-gray-700 shadow-md space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-base font-bold text-white">Connected DataStores & Connectors Status</h3>
            <p className="text-xs text-gray-400">
              Attached to this App Engine ({engine.dataStoreIds?.length || 0} attached)
            </p>
          </div>
          <span className="text-xs text-gray-400 font-mono">
            Location: {config.appLocation || 'global'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* App Engine Card */}
          <div className="bg-gray-900/70 p-4 rounded-xl border border-blue-900/40 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start mb-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950 text-blue-300 border border-blue-800">
                  App Engine
                </span>
                <span className="text-xs text-gray-500 font-mono">
                  {enginePolicy?.bindings?.length || 0} bindings
                </span>
              </div>
              <h4 className="text-sm font-bold text-white truncate">{engine.displayName}</h4>
              <p className="text-xs text-gray-400 font-mono truncate">{appId}</p>

              <div className="mt-3">
                <span className="text-[11px] text-gray-400 block font-semibold mb-1">
                  Active Agentspace Users:
                </span>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {enginePolicy?.bindings?.find((b: any) => b.role === AGENTSPACE_USER_ROLE)?.members?.map((m: string) => (
                    <div key={m} className="text-[11px] font-mono text-gray-300 bg-gray-800 px-2 py-0.5 rounded truncate">
                      {m}
                    </div>
                  )) || <span className="text-xs text-gray-500 italic">None assigned</span>}
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-gray-800 flex justify-end">
              <button
                onClick={() =>
                  setEditingResource({
                    id: appId,
                    displayName: engine.displayName,
                    type: 'engine',
                    path: `projects/${projectId}/locations/${config.appLocation}/collections/default_collection/engines/${appId}`,
                    policy: enginePolicy,
                  })
                }
                className="px-3 py-1.5 bg-blue-600/80 hover:bg-blue-600 text-white text-xs font-semibold rounded-md transition-colors"
              >
                Edit Policy
              </button>
            </div>
          </div>

          {/* Connectors Cards */}
          {connectors.map(conn => {
            const agentspaceUsers = conn.policy?.bindings?.find(
              (b: any) => b.role === AGENTSPACE_USER_ROLE
            )?.members || [];

            return (
              <div
                key={conn.id}
                className={`bg-gray-900/70 p-4 rounded-xl border shadow-sm flex flex-col justify-between ${
                  conn.isAttached ? 'border-purple-900/50' : 'border-gray-800 opacity-80'
                }`}
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800">
                      DataConnector
                    </span>
                    {conn.isAttached ? (
                      <span className="text-[10px] font-semibold text-green-400">Attached ✓</span>
                    ) : (
                      <span className="text-[10px] text-gray-500">Unlinked</span>
                    )}
                  </div>
                  <h4 className="text-sm font-bold text-white font-mono truncate">{conn.id}</h4>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {conn.entities.length} Sub-Entit{conn.entities.length === 1 ? 'y' : 'ies'}
                  </p>

                  <div className="mt-3">
                    <span className="text-[11px] text-gray-400 block font-semibold mb-1">
                      Collection Level Users:
                    </span>
                    <div className="space-y-1 max-h-20 overflow-y-auto">
                      {agentspaceUsers.length > 0 ? (
                        agentspaceUsers.map((m: string) => (
                          <div key={m} className="text-[11px] font-mono text-gray-300 bg-gray-800 px-2 py-0.5 rounded truncate">
                            {m}
                          </div>
                        ))
                      ) : (
                        <span className="text-xs text-gray-500 italic">None assigned</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-800 flex justify-between items-center">
                  <span className="text-[11px] text-gray-500">
                    ETag: {conn.policy?.etag ? `${conn.policy.etag.slice(0, 8)}...` : 'None'}
                  </span>
                  <button
                    onClick={() =>
                      setEditingResource({
                        id: conn.id,
                        displayName: conn.displayName || conn.id,
                        type: 'connector',
                        path: `projects/${projectId}/locations/${config.appLocation}/collections/${conn.id}`,
                        policy: conn.policy,
                      })
                    }
                    className="px-3 py-1.5 bg-purple-600/80 hover:bg-purple-600 text-white text-xs font-semibold rounded-md transition-colors"
                  >
                    Edit Policy
                  </button>
                </div>
              </div>
            );
          })}

          {/* Legacy DataStores Cards */}
          {legacyDataStores.map(ds => {
            const agentspaceUsers = ds.policy?.bindings?.find(
              (b: any) => b.role === AGENTSPACE_USER_ROLE
            )?.members || [];

            return (
              <div
                key={ds.id}
                className={`bg-gray-900/70 p-4 rounded-xl border shadow-sm flex flex-col justify-between ${
                  ds.isAttached ? 'border-gray-700' : 'border-gray-800 opacity-80'
                }`}
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950 text-blue-300 border border-blue-800">
                      Legacy DataStore
                    </span>
                    {ds.isAttached ? (
                      <span className="text-[10px] font-semibold text-green-400">Attached ✓</span>
                    ) : (
                      <span className="text-[10px] text-gray-500">Unlinked</span>
                    )}
                  </div>
                  <h4 className="text-sm font-bold text-white font-mono truncate">{ds.id}</h4>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{ds.displayName || ds.id}</p>

                  <div className="mt-3">
                    <span className="text-[11px] text-gray-400 block font-semibold mb-1">
                      DataStore Users:
                    </span>
                    <div className="space-y-1 max-h-20 overflow-y-auto">
                      {agentspaceUsers.length > 0 ? (
                        agentspaceUsers.map((m: string) => (
                          <div key={m} className="text-[11px] font-mono text-gray-300 bg-gray-800 px-2 py-0.5 rounded truncate">
                            {m}
                          </div>
                        ))
                      ) : (
                        <span className="text-xs text-gray-500 italic">None assigned</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-800 flex justify-between items-center">
                  <span className="text-[11px] text-gray-500">
                    ETag: {ds.policy?.etag ? `${ds.policy.etag.slice(0, 8)}...` : 'None'}
                  </span>
                  <button
                    onClick={() =>
                      setEditingResource({
                        id: ds.id,
                        displayName: ds.displayName || ds.id,
                        type: 'datastore',
                        path: `projects/${projectId}/locations/${config.appLocation}/collections/default_collection/dataStores/${ds.id}`,
                        policy: ds.policy,
                      })
                    }
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs font-semibold rounded-md transition-colors"
                  >
                    Edit Policy
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Principals & Permissions Audit Matrix Table */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-md overflow-hidden">
        <div className="p-4 border-b border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-750">
          <div>
            <h3 className="text-base font-bold text-white">Active Permissions Matrix & Audit</h3>
            <p className="text-xs text-gray-400">
              Consolidated breakdown of principals with project roles, engine access, and datastore grants
            </p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <input
              type="text"
              placeholder="Filter by user / group email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-gray-900 border border-gray-600 text-xs text-gray-200 rounded-lg px-3 py-2 outline-none w-full sm:w-64"
            />
            <button
              onClick={exportToCsv}
              disabled={filteredMatrix.length === 0}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-200 text-xs font-medium rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700 text-left">
            <thead className="bg-gray-900/60 text-xs uppercase tracking-wider text-gray-400 font-semibold">
              <tr>
                <th className="px-6 py-3.5">Principal / Member</th>
                <th className="px-6 py-3.5">Project Custom Role</th>
                <th className="px-6 py-3.5">App Engine ({appId})</th>
                <th className="px-6 py-3.5">Connected DataStores & Connectors</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700 bg-gray-800/40 text-xs">
              {filteredMatrix.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500 italic">
                    No explicit member permissions discovered for this App or connected DataStores. Use the wizard above to grant access.
                  </td>
                </tr>
              ) : (
                filteredMatrix.map((p) => {
                  const displayMember = p.member.replace(/^(user:|group:|serviceAccount:)/, '');
                  const memberType = p.member.startsWith('group:')
                    ? 'Group'
                    : p.member.startsWith('serviceAccount:')
                    ? 'SA'
                    : 'User';

                  return (
                    <tr key={p.member} className="hover:bg-gray-700/40 transition-colors">
                      {/* Principal */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              memberType === 'Group'
                                ? 'bg-purple-900/50 text-purple-300 border border-purple-700'
                                : memberType === 'SA'
                                ? 'bg-yellow-900/50 text-yellow-300 border border-yellow-700'
                                : 'bg-blue-900/50 text-blue-300 border border-blue-700'
                            }`}
                          >
                            {memberType}
                          </span>
                          <span className="font-mono text-white text-xs">{displayMember}</span>
                        </div>
                      </td>

                      {/* Project Custom Role */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {p.hasProjectRole ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-green-900/40 text-green-300 border border-green-700">
                            ✓ customRestrictedEndUser
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] text-gray-500 bg-gray-900 border border-gray-700">
                            Missing
                          </span>
                        )}
                      </td>

                      {/* App Engine Access */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {p.hasEngineAccess ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-900/40 text-blue-300 border border-blue-700">
                            ✓ agentspaceUser
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] text-gray-500 bg-gray-900 border border-gray-700">
                            Not Granted
                          </span>
                        )}
                      </td>

                      {/* DataStores Breakdown */}
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1.5 max-w-md">
                          {/* Connectors */}
                          {connectors.map(c => {
                            const hasConn = p.resourceAccess[`connector:${c.id}`];
                            return (
                              <span
                                key={c.id}
                                className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                                  hasConn
                                    ? 'bg-purple-900/50 text-purple-200 border-purple-700 font-semibold'
                                    : 'bg-gray-900 text-gray-600 border-gray-800 line-through'
                                }`}
                                title={`Connector: ${c.id}`}
                              >
                                {c.id}
                              </span>
                            );
                          })}

                          {/* Entities */}
                          {connectors.flatMap(c =>
                            c.entities.map(e => {
                              const hasEnt = p.resourceAccess[`entity:${e.id}`];
                              return (
                                <span
                                  key={e.id}
                                  className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                                    hasEnt
                                      ? 'bg-blue-900/50 text-blue-200 border-blue-700 font-semibold'
                                      : 'bg-gray-900 text-gray-600 border-gray-800 line-through'
                                  }`}
                                  title={`Entity: ${e.id}`}
                                >
                                  {e.id}
                                </span>
                              );
                            })
                          )}

                          {/* Legacy DataStores */}
                          {legacyDataStores.map(ds => {
                            const hasDs = p.resourceAccess[`datastore:${ds.id}`];
                            return (
                              <span
                                key={ds.id}
                                className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                                  hasDs
                                    ? 'bg-green-900/50 text-green-200 border-green-700 font-semibold'
                                    : 'bg-gray-900 text-gray-600 border-gray-800 line-through'
                                }`}
                                title={`DataStore: ${ds.id}`}
                              >
                                {ds.id}
                              </span>
                            );
                          })}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 whitespace-nowrap text-right text-xs">
                        <button
                          onClick={() => handleRevoke(p.member, 'engine', appId, `App Engine '${appId}'`)}
                          className="text-red-400 hover:text-red-300 font-medium px-2 py-1 rounded hover:bg-red-900/30 transition-colors"
                        >
                          Revoke App
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* IAM Edit Modal */}
      {editingResource && (
        <SetDataStoreIamPolicyModal
          isOpen={!!editingResource}
          onClose={() => setEditingResource(null)}
          onSuccess={() => {
            setEditingResource(null);
            setSuccessMessage(`IAM policy updated successfully for ${editingResource.displayName}!`);
            refreshAll();
          }}
          resourceId={editingResource.id}
          resourceDisplayName={editingResource.displayName}
          resourceType={editingResource.type}
          resourcePath={editingResource.path}
          config={config}
          currentPolicy={editingResource.policy}
        />
      )}

      {/* Script & cURL Automation Modal */}
      {isScriptModalOpen && (
        <DataStorePermissionsScriptModal
          isOpen={isScriptModalOpen}
          onClose={() => setIsScriptModalOpen(false)}
          engine={engine}
          config={config}
          connectedConnectors={connectors.map(c => ({
            id: c.id,
            entities: c.entities.map(e => e.id),
          }))}
          connectedLegacyDataStores={legacyDataStores.map(ds => ds.id)}
          targetMember={targetMembersInput || 'userA@example.com'}
        />
      )}

      {/* User Isolation Confirmation Modal */}
      {isolateModalTarget && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4 animate-fade-in" aria-modal="true" role="dialog">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-yellow-900/50 text-yellow-300 border border-yellow-700 flex items-center justify-center font-bold text-lg">
                ⚠️
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Isolate User(s) for DataStore Control</h3>
                <p className="text-xs text-gray-400">Convert {isolateModalTarget.members.length} user(s) to the restricted access model</p>
              </div>
            </div>

            <div className="bg-gray-900/80 border border-gray-700 rounded-lg p-4 space-y-3 text-xs">
              <div>
                <span className="text-gray-400 font-semibold block mb-1">Target User(s):</span>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {isolateModalTarget.members.map(m => (
                    <span key={m} className="px-2 py-0.5 bg-gray-800 border border-gray-700 rounded text-blue-300 font-mono">
                      {m}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-gray-800 space-y-1.5">
                <div className="text-red-300 flex items-center gap-1.5 font-medium">
                  <span>🔻 Roles to be REMOVED from Project Level:</span>
                </div>
                <div className="text-gray-400 pl-4 space-y-1">
                  <p>Broad roles that bypass DataStore-level ACLs:</p>
                  <p className="font-mono text-[11px] text-red-400">
                    roles/viewer, roles/editor, roles/owner, roles/discoveryengine.admin, roles/discoveryengine.user, roles/discoveryengine.agentspaceUser
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-800 space-y-1.5">
                <div className="text-green-300 flex items-center gap-1.5 font-medium">
                  <span>🟢 Role to be GRANTED at Project Level:</span>
                </div>
                <p className="text-green-400 font-mono pl-4 text-[11px] break-all">
                  projects/{projectId}/roles/{CUSTOM_ROLE_ID}
                </p>
                <p className="text-[11px] text-gray-400 pl-4">
                  Permission: <code>discoveryengine.locations.buildAuthorizationUrl</code>
                </p>
              </div>

              <div className="pt-2 border-t border-gray-800 text-[11px] text-blue-300 bg-blue-950/30 p-2.5 rounded border border-blue-900/50">
                👉 <strong>Next Step:</strong> After clearing broad roles and applying the custom role, the provisioner wizard below will open automatically so you can grant access to the App Engine and pick specific DataStores!
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsolateModalTarget(null)}
                disabled={isIsolating}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-semibold rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleExecuteIsolation(isolateModalTarget.members)}
                disabled={isIsolating}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {isIsolating ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    <span>Isolating...</span>
                  </>
                ) : (
                  <span>Confirm & Isolate User(s)</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConnectedDataStorePermissions;
