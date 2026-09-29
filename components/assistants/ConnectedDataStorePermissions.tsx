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

import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as api from '../../services/apiService';
import SetDataStoreIamPolicyModal from './SetDataStoreIamPolicyModal';
import DataStorePermissionsScriptModal from './DataStorePermissionsScriptModal';
import DestructiveConfirmModal from '../DestructiveConfirmModal';
import {
  AGENTSPACE_USER_ROLE,
  BROAD_PROJECT_ROLES,
  CUSTOM_ADMIN_ROLE_ID,
  CUSTOM_ROLE_ID,
  NOTEBOOK_LM_USER_ROLE,
  REQUIRED_CUSTOM_ADMIN_ROLE_PERMISSIONS,
  REQUIRED_CUSTOM_ROLE_PERMISSIONS,
  ConnectedDataStorePermissionsProps,
  ConnectorResource,
  EditingResource,
  IsolateTarget,
  LegacyDataStoreResource,
  ResourceLevelRole,
  RevokeTarget,
  UserAccessDetails,
} from './datastore-permissions/types';
import { formatMember, useDataStorePermissions } from '../../hooks/useDataStorePermissions';
import { EnvironmentReadinessWizard } from './datastore-permissions/EnvironmentReadinessWizard';
import { StepByStepGuide } from './datastore-permissions/StepByStepGuide';
import { UserAccessInspector } from './datastore-permissions/UserAccessInspector';
import { AccessGrantWizard } from './datastore-permissions/AccessGrantWizard';
import { ConnectedResourcesMatrix } from './datastore-permissions/ConnectedResourcesMatrix';
import { IsolateUserModal } from './datastore-permissions/IsolateUserModal';

export type { UserAccessDetails };

const getMembersKey = (rawInput: string): string => {
  const rawMembers = rawInput.split(/[\s,]+/).filter(m => m.trim() !== '');
  if (rawMembers.length === 0) return '';
  return rawMembers.map(formatMember).sort().join(',');
};

const ConnectedDataStorePermissions: React.FC<ConnectedDataStorePermissionsProps> = ({
  engine,
  config,
  projectNumber,
}) => {
  const projectId = config.projectId || projectNumber;
  const appId = engine.name.split('/').pop() || '';

  const {
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
  } = useDataStorePermissions(projectId, engine, config);

  // User Inspector & Isolation State
  const [selectedUsersForIsolation, setSelectedUsersForIsolation] = useState<Set<string>>(new Set());
  const [isIsolating, setIsIsolating] = useState(false);
  const [isolateModalTarget, setIsolateModalTarget] = useState<IsolateTarget | null>(null);

  // Wizard State
  const [isWizardOpen, setIsWizardOpen] = useState(true);
  const [targetMembersInput, setTargetMembersInput] = useState('');
  const [wizardCheckCustomRole, setWizardCheckCustomRole] = useState(true);
  const [wizardGrantProjectRole, setWizardGrantProjectRole] = useState(true);
  const [wizardGrantEngineRole, setWizardGrantEngineRole] = useState(true);
  const [wizardProjectCustomRoleId, setWizardProjectCustomRoleId] = useState<string>(CUSTOM_ROLE_ID);
  const [wizardResourceRole, setWizardResourceRole] = useState<ResourceLevelRole>(AGENTSPACE_USER_ROLE);
  const [wizardGrantNotebookLmRole, setWizardGrantNotebookLmRole] = useState(false);
  const [includeUnattachedInSync, setIncludeUnattachedInSync] = useState(false);
  const [isDryRun, setIsDryRun] = useState(false);
  const [isExecutingWizard, setIsExecutingWizard] = useState(false);
  const [executionLogs, setExecutionLogs] = useState<string[]>([]);
  const lastPopulatedMembersKeyRef = useRef<string>('');

  // Modal & Guide States
  const [showInstructionsGuide, setShowInstructionsGuide] = useState(false);
  const [editingResource, setEditingResource] = useState<EditingResource | null>(null);
  const [isScriptModalOpen, setIsScriptModalOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<RevokeTarget | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const addLog = (msg: string) => {
    setExecutionLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  // Populate Wizard Checkboxes from Current Permissions of Member(s)
  const populateWizardForMember = useCallback(
    (
      rawInput: string,
      options?: {
        connectorsOverride?: ConnectorResource[];
        legacyDataStoresOverride?: LegacyDataStoreResource[];
        fallbackToAttachedIfNoGrants?: boolean;
      }
    ) => {
      if (!rawInput.trim()) return;

      const rawMembers = rawInput.split(/[\s,]+/).filter(m => m.trim() !== '');
      if (rawMembers.length === 0) return;

      const formattedMembers = rawMembers.map(formatMember);
      const connList = options?.connectorsOverride ?? connectors;
      const dsList = options?.legacyDataStoresOverride ?? legacyDataStores;

      // 1. Steps A1 & A2: Default to true when provisioning/updating a user in Two-Way Sync
      // so we never inadvertently revoke their project custom role or App Engine access.
      setWizardGrantProjectRole(true);
      setWizardGrantEngineRole(true);

      // 2. Steps A3 & A4: Check DataConnectors, Entities, and Legacy DataStores
      const newSelected: Record<string, boolean> = {};
      let hasAnyExplicitAttachedGrant = false;

      connList.forEach(conn => {
        const connBinding = conn.policy?.bindings?.find(b => b.role === wizardResourceRole);
        const hasConnAccess =
          formattedMembers.length > 0 && formattedMembers.every(m => connBinding?.members?.includes(m));
        if (hasConnAccess) {
          newSelected[`connector:${conn.id}`] = true;
          if (conn.isAttached) hasAnyExplicitAttachedGrant = true;
        }

        conn.entities.forEach(ent => {
          const entBinding = ent.policy?.bindings?.find(b => b.role === wizardResourceRole);
          const hasEntAccess =
            formattedMembers.length > 0 && formattedMembers.every(m => entBinding?.members?.includes(m));
          if (hasEntAccess && (hasConnAccess || !conn.policy)) {
            newSelected[`entity:${ent.id}`] = true;
            if (conn.isAttached) hasAnyExplicitAttachedGrant = true;
          }
        });
      });

      dsList.forEach(ds => {
        const dsBinding = ds.policy?.bindings?.find(b => b.role === wizardResourceRole);
        const hasDsAccess =
          formattedMembers.length > 0 && formattedMembers.every(m => dsBinding?.members?.includes(m));
        if (hasDsAccess) {
          newSelected[`datastore:${ds.id}`] = true;
          if (ds.isAttached) hasAnyExplicitAttachedGrant = true;
        }
      });

      // If a newly isolated user had 0 explicit attached grants (because they previously relied on a broad project role),
      // pre-select the attached resources so the admin can uncheck whichever connector(s) they want to restrict.
      if (options?.fallbackToAttachedIfNoGrants && !hasAnyExplicitAttachedGrant) {
        connList.forEach(conn => {
          if (conn.isAttached) {
            newSelected[`connector:${conn.id}`] = true;
            conn.entities.forEach(ent => {
              newSelected[`entity:${ent.id}`] = true;
            });
          }
        });
        dsList.forEach(ds => {
          if (ds.isAttached) {
            newSelected[`datastore:${ds.id}`] = true;
          }
        });
      }

      lastPopulatedMembersKeyRef.current = formattedMembers.slice().sort().join(',');
      setSelectedResourcesForGrant(newSelected);
    },
    [connectors, legacyDataStores, setSelectedResourcesForGrant, wizardResourceRole]
  );

  // Automatically populate checkboxes ONLY when target member identity changes (do not clobber manual edits on refreshAll)
  useEffect(() => {
    const membersKey = getMembersKey(targetMembersInput);
    if (!membersKey) {
      lastPopulatedMembersKeyRef.current = '';
      return;
    }
    if (isLoading && connectors.length === 0 && legacyDataStores.length === 0) {
      return;
    }
    if (lastPopulatedMembersKeyRef.current === membersKey) {
      return;
    }
    const timer = setTimeout(() => {
      populateWizardForMember(targetMembersInput);
    }, 250);
    return () => clearTimeout(timer);
  }, [targetMembersInput, isLoading, connectors.length, legacyDataStores.length, populateWizardForMember]);

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

    const activeCustomRoleId = wizardProjectCustomRoleId || CUSTOM_ROLE_ID;
    const isDelegatedAdminRole = activeCustomRoleId === CUSTOM_ADMIN_ROLE_ID;
    const requiredCustomRolePerms = isDelegatedAdminRole
      ? REQUIRED_CUSTOM_ADMIN_ROLE_PERMISSIONS
      : REQUIRED_CUSTOM_ROLE_PERMISSIONS;
    const customRoleTitle = isDelegatedAdminRole
      ? 'Custom Gemini Enterprise Restricted Admin'
      : 'Custom Gemini Enterprise Restricted End User';
    const customRoleDesc = isDelegatedAdminRole
      ? 'Base project-level permissions for delegated resource-level Gemini Enterprise administrators.'
      : 'Base project-level permissions to view Gemini Enterprise config page and authorize end-user connectors.';

    addLog(`Starting DataStore ACL Two-Way Synchronization (${isDryRun ? 'DRY-RUN PREVIEW' : 'LIVE EXECUTION'})`);
    addLog(`Target Principals: ${members.join(', ')}`);
    addLog(`App Engine: ${appId} (Location: ${config.appLocation || 'global'})`);
    addLog(`Project Custom Role: ${activeCustomRoleId} | Resource Role: ${wizardResourceRole}`);
    addLog(`Rule: Checked items will be GRANTED; unchecked items will be REVOKED.`);

    try {
      // Step Appendix A: Custom Role
      if (wizardCheckCustomRole && wizardGrantProjectRole) {
        addLog(`--- Appendix A: Checking project custom role '${activeCustomRoleId}' ---`);
        let roleFound: boolean | null = activeCustomRoleId === CUSTOM_ROLE_ID ? customRoleExists : null;
        let rolePerms: string[] = [];
        if (roleFound === null) {
          try {
            const r = await api.getCustomRole(projectId, activeCustomRoleId);
            roleFound = !!(r && r.name && !r.deleted);
            rolePerms = r?.includedPermissions || [];
          } catch {
            roleFound = false;
          }
        } else {
          rolePerms = readiness.customRoleIncludedPermissions;
        }

        const missingPerms = requiredCustomRolePerms.filter(p => !rolePerms.includes(p));

        if (roleFound && missingPerms.length === 0) {
          addLog(`[VERIFIED ✓] Custom role 'projects/${projectId}/roles/${activeCustomRoleId}' exists with all required permissions.`);
        } else if (roleFound && missingPerms.length > 0) {
          if (isDryRun) {
            addLog(`[DRY-RUN] Custom role exists but is missing [${missingPerms.join(', ')}]. Would upgrade custom role '${activeCustomRoleId}'.`);
          } else {
            addLog(`[ACTION] Upgrading custom role '${activeCustomRoleId}' with missing permissions: ${missingPerms.join(', ')}...`);
            const mergedPerms = Array.from(new Set([...rolePerms, ...requiredCustomRolePerms]));
            await api.updateCustomRole(projectId, activeCustomRoleId, {
              title: customRoleTitle,
              description: customRoleDesc,
              stage: 'GA',
              includedPermissions: mergedPerms,
            });
            if (activeCustomRoleId === CUSTOM_ROLE_ID) setCustomRoleExists(true);
            addLog(`[VERIFIED ✓] Custom role '${activeCustomRoleId}' upgraded successfully.`);
          }
        } else {
          if (isDryRun) {
            addLog(`[DRY-RUN] Custom role not found. Would create custom role '${activeCustomRoleId}'.`);
          } else {
            addLog(`[ACTION] Creating custom role '${activeCustomRoleId}'...`);
            await api.createCustomRole(projectId, activeCustomRoleId, {
              title: customRoleTitle,
              description: customRoleDesc,
              stage: 'GA',
              includedPermissions: [...requiredCustomRolePerms],
            });
            if (activeCustomRoleId === CUSTOM_ROLE_ID) setCustomRoleExists(true);
            addLog(`[VERIFIED ✓] Custom role '${activeCustomRoleId}' created successfully.`);
          }
        }
      }

      const hasAnyAttached =
        connectors.some(c => c.isAttached) || legacyDataStores.some(ds => ds.isAttached);

      const connectorsToSync = connectors.filter(
        conn =>
          !hasAnyAttached ||
          conn.isAttached ||
          includeUnattachedInSync ||
          !!selectedResourcesForGrant[`connector:${conn.id}`] ||
          conn.entities.some(ent => !!selectedResourcesForGrant[`entity:${ent.id}`])
      );

      const legacyDataStoresToSync = legacyDataStores.filter(
        ds =>
          !hasAnyAttached ||
          ds.isAttached ||
          includeUnattachedInSync ||
          !!selectedResourcesForGrant[`datastore:${ds.id}`]
      );

      // Loop for each target member
      for (const member of members) {
        addLog(`\n======================================================`);
        addLog(`Syncing Permissions for Member: ${member}`);
        addLog(`======================================================`);

        // Step A1: Project-level role binding
        addLog(`--- Step A1: ${wizardGrantProjectRole ? 'Granting' : 'Revoking'} project-level custom role '${activeCustomRoleId}' ---`);
        const fullRole = `projects/${projectId}/roles/${activeCustomRoleId}`;
        await syncPolicyRMW(
          `Project '${projectId}'`,
          () => api.getProjectIamPolicy(projectId),
          (p) => api.setProjectIamPolicy(projectId, p),
          member,
          fullRole,
          wizardGrantProjectRole,
          isDryRun,
          addLog
        );

        // Optional Step A1b: Gemini Notebook Enterprise (notebookLmUser)
        if (wizardGrantNotebookLmRole) {
          addLog(`--- Step A1b: Granting optional '${NOTEBOOK_LM_USER_ROLE}' on Project '${projectId}' ---`);
          await syncPolicyRMW(
            `Project '${projectId}' (NotebookLM)`,
            () => api.getProjectIamPolicy(projectId),
            (p) => api.setProjectIamPolicy(projectId, p),
            member,
            NOTEBOOK_LM_USER_ROLE,
            true,
            isDryRun,
            addLog
          );
        }

        // Step A2: App Engine role binding
        addLog(`--- Step A2: ${wizardGrantEngineRole ? 'Granting' : 'Revoking'} '${wizardResourceRole}' on App Engine '${appId}' ---`);
        await syncPolicyRMW(
          `App Engine '${appId}'`,
          () => api.getEngineIamPolicy(engine.name, config),
          (p) => api.setEngineIamPolicy(engine.name, p, config),
          member,
          wizardResourceRole,
          wizardGrantEngineRole,
          isDryRun,
          addLog
        );

        // Step A3: DataConnectors and Entities
        for (const conn of connectorsToSync) {
          const shouldGrantConn = !!selectedResourcesForGrant[`connector:${conn.id}`];
          addLog(`--- Step A3: ${shouldGrantConn ? 'Granting' : 'Revoking'} '${wizardResourceRole}' on DataConnector Collection '${conn.id}' ---`);
          await syncPolicyRMW(
            `DataConnector Collection '${conn.id}'`,
            () => api.getCollectionIamPolicy(conn.id, config),
            (p) => api.setCollectionIamPolicy(conn.id, p, config),
            member,
            wizardResourceRole,
            shouldGrantConn,
            isDryRun,
            addLog
          );

          for (const ent of conn.entities) {
            const shouldGrantEnt = !!selectedResourcesForGrant[`entity:${ent.id}`];
            addLog(`  Sub-step: ${shouldGrantEnt ? 'Granting' : 'Revoking'} '${wizardResourceRole}' on Entity DataStore '${ent.id}' under '${conn.id}'`);
            await syncPolicyRMW(
              `Entity DataStore '${ent.id}'`,
              () => api.getDataStoreIamPolicy(ent.id, config),
              (p) => api.setDataStoreIamPolicy(ent.id, p, config),
              member,
              wizardResourceRole,
              shouldGrantEnt,
              isDryRun,
              addLog
            );
          }
        }

        // Step A4: Legacy DataStores
        for (const ds of legacyDataStoresToSync) {
          const shouldGrantDs = !!selectedResourcesForGrant[`datastore:${ds.id}`];
          addLog(`--- Step A4: ${shouldGrantDs ? 'Granting' : 'Revoking'} '${wizardResourceRole}' on Legacy DataStore '${ds.id}' ---`);
          await syncPolicyRMW(
            `Legacy DataStore '${ds.id}'`,
            () => api.getDataStoreIamPolicy(ds.id, config),
            (p) => api.setDataStoreIamPolicy(ds.id, p, config),
            member,
            wizardResourceRole,
            shouldGrantDs,
            isDryRun,
            addLog
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
        await refreshAll();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Workflow failed.';
      addLog(`[ERROR ❌] Operation failed: ${msg}`);
      setError(msg);
    } finally {
      setIsExecutingWizard(false);
    }
  };

  // Execute Isolation Action
  const handleExecuteIsolation = async (membersToIsolate: string[], grantNotebookLm?: boolean) => {
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
            description: 'Base project-level permissions to view Gemini Enterprise config page and authorize end-user connectors.',
            stage: 'GA',
            includedPermissions: [...REQUIRED_CUSTOM_ROLE_PERMISSIONS],
          });
          setCustomRoleExists(true);
        } catch (e) {
          console.warn('Custom role may already exist', e);
        }
      }

      // Filter out broad roles for these members
      const updatedBindings = (currentProjPolicy.bindings || []).map(b => {
        if (BROAD_PROJECT_ROLES.includes(b.role)) {
          return {
            ...b,
            members: (b.members || []).filter(m => !membersToIsolate.includes(m)),
          };
        }
        return b;
      }).filter(b => b.members && b.members.length > 0);

      // Add custom role binding for these members
      let customRoleBinding = updatedBindings.find(b => b.role === customRoleName);
      if (!customRoleBinding) {
        customRoleBinding = { role: customRoleName, members: [] };
        updatedBindings.push(customRoleBinding);
      }
      membersToIsolate.forEach(m => {
        if (!customRoleBinding!.members!.includes(m)) {
          customRoleBinding!.members!.push(m);
        }
      });

      // Optionally also grant roles/discoveryengine.notebookLmUser at project level
      if (grantNotebookLm) {
        let notebookBinding = updatedBindings.find(b => b.role === NOTEBOOK_LM_USER_ROLE);
        if (!notebookBinding) {
          notebookBinding = { role: NOTEBOOK_LM_USER_ROLE, members: [] };
          updatedBindings.push(notebookBinding);
        }
        membersToIsolate.forEach(m => {
          if (!notebookBinding!.members!.includes(m)) {
            notebookBinding!.members!.push(m);
          }
        });
      }

      await api.setProjectIamPolicy(projectId, { etag, bindings: updatedBindings });
      setSuccessMessage(
        `Successfully isolated ${membersToIsolate.length} user(s)! Broad project-wide roles removed, and '${CUSTOM_ROLE_ID}'${
          grantNotebookLm ? ` + '${NOTEBOOK_LM_USER_ROLE}'` : ''
        } granted. Pre-filled into Provisioner below to assign App Engine and DataStore permissions.`
      );

      // Close modal and refresh policies before populating the wizard so there is no background refresh race
      setIsolateModalTarget(null);
      setSelectedUsersForIsolation(new Set());
      const refreshed = await refreshAll();

      // Pre-fill wizard with these members and keep Step A1 (customRole) checked (true) so Two-Way Sync preserves it
      const cleanedMembers = membersToIsolate.map(m => m.replace(/^(user|group|serviceAccount):/, '')).join(', ');
      setTargetMembersInput(cleanedMembers);
      setWizardGrantProjectRole(true);
      setWizardGrantEngineRole(true);
      if (grantNotebookLm) setWizardGrantNotebookLmRole(true);
      setIsWizardOpen(true);
      populateWizardForMember(cleanedMembers, {
        connectorsOverride: refreshed?.connectors,
        legacyDataStoresOverride: refreshed?.legacyDataStores,
        fallbackToAttachedIfNoGrants: true,
      });

      // Smooth scroll to wizard
      setTimeout(() => {
        document.getElementById('wizard-section')?.scrollIntoView?.({ behavior: 'smooth' });
      }, 100);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to isolate user(s): ${msg}`);
    } finally {
      setIsIsolating(false);
      setIsolateModalTarget(null);
    }
  };

  const handleRevokeApp = (member: string) => {
    setRevokeTarget({
      member,
      resourceType: 'engine',
      resourceId: appId,
      resourceDesc: `App Engine '${appId}'`,
    });
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    const { member, resourceType, resourceId, resourceDesc } = revokeTarget;

    setIsRevoking(true);
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
        if (b.role === AGENTSPACE_USER_ROLE || b.role?.includes('agentspace')) {
          return {
            ...b,
            members: (b.members || []).filter((m: string) => m !== member),
          };
        }
        return b;
      }).filter((b: any) => b.members && b.members.length > 0);

      await setFn({ etag, bindings });

      // If revoking from a DataConnector Collection, also revoke from its child Entity DataStores
      if (resourceType === 'connector') {
        const targetConnector = connectors.find(c => c.id === resourceId);
        if (targetConnector && targetConnector.entities.length > 0) {
          for (const ent of targetConnector.entities) {
            const entPolicy = await api.getDataStoreIamPolicy(ent.id, config);
            const entBindings = (entPolicy.bindings || [])
              .map((b: any) => {
                if (b.role === AGENTSPACE_USER_ROLE || b.role?.includes('agentspace')) {
                  return {
                    ...b,
                    members: (b.members || []).filter((m: string) => m !== member),
                  };
                }
                return b;
              })
              .filter((b: any) => b.members && b.members.length > 0);
            await api.setDataStoreIamPolicy(ent.id, { etag: entPolicy.etag || '', bindings: entBindings }, config);
          }
        }
      }

      setSuccessMessage(`Revoked '${member}' from ${resourceDesc}.`);
      setRevokeTarget(null);
      await refreshAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to revoke access: ${msg}`);
    } finally {
      setIsRevoking(false);
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Prerequisites Banner */}
      <div className="bg-gray-800 p-5 rounded-xl border border-gray-700 shadow-md">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl font-bold text-white">Connected DataStore Permissions</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-900/60 text-green-300 border border-green-600">
                GA
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-700 text-gray-300 border border-gray-600">
                v1 API • Self-Service Opt-In
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1.5 max-w-3xl leading-relaxed">
              Configure fine-grained App-level and DataStore-level permission controls for Gemini Enterprise end users and delegated admins without granting broad project-wide privileges.
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
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-gray-200">
                  Project Custom Role (Appendix A): <code className="text-blue-300">{CUSTOM_ROLE_ID}</code>
                </span>
                {customRoleExists === true && readiness.customRoleStatus !== 'needs_upgrade' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-green-900/50 text-green-400 border border-green-700">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Active in Project
                  </span>
                ) : customRoleExists === true && readiness.customRoleStatus === 'needs_upgrade' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-yellow-900/50 text-yellow-300 border border-yellow-700">
                    Needs Permission Upgrade
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
                Contains permissions:{' '}
                <code className="text-purple-300">discoveryengine.locations.buildAuthorizationUrl</code>,{' '}
                <code className="text-purple-300">discoveryengine.devToolsConfigs.get</code>
              </p>
            </div>
          </div>

          {(customRoleExists === false || readiness.customRoleStatus === 'needs_upgrade') && (
            <button
              onClick={handleCreateCustomRole}
              disabled={isCreatingRole}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-semibold rounded-md shadow transition-colors disabled:opacity-50 flex items-center gap-1 whitespace-nowrap"
            >
              {isCreatingRole
                ? 'Updating...'
                : customRoleExists === true
                ? '↑ Upgrade Role Permissions'
                : '+ Create Custom Role in Project'}
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
        <StepByStepGuide
          projectId={projectId}
          appId={appId}
          onClose={() => setShowInstructionsGuide(false)}
        />
      )}

      {/* 1B. Live Environment Readiness Evaluator & Auto-Enablement Wizard */}
      <EnvironmentReadinessWizard
        projectId={projectId}
        location={config.appLocation || 'global'}
        appId={appId}
        readiness={readiness}
        allUsersList={allUsersList}
        inconsistentConnectorGrants={inconsistentConnectorGrants}
        isCreatingRole={isCreatingRole}
        isTogglingProjectOptIn={isTogglingProjectOptIn}
        isAutoEnablingEnvironment={isAutoEnablingEnvironment}
        isRepairingConnectors={isRepairingConnectors}
        onReEvaluate={refreshAll}
        onCreateOrUpgradeRole={handleCreateCustomRole}
        onToggleProjectOptIn={handleToggleProjectAccessControl}
        onAutoEnableEnvironment={handleAutoEnableEnvironment}
        onRepairConnectorInconsistencies={handleRepairConnectorInconsistencies}
      />

      {/* 2. Active Users & Access Inspector Box */}
      <UserAccessInspector
        allUsersList={allUsersList}
        appId={appId}
        selectedUsersForIsolation={selectedUsersForIsolation}
        onToggleSelectUser={(member) => {
          const newSet = new Set(selectedUsersForIsolation);
          if (newSet.has(member)) {
            newSet.delete(member);
          } else {
            newSet.add(member);
          }
          setSelectedUsersForIsolation(newSet);
        }}
        onSetSelectedUsers={setSelectedUsersForIsolation}
        onIsolateTarget={setIsolateModalTarget}
        onConfigureDataStores={(member) => {
          setTargetMembersInput(member);
          setWizardGrantProjectRole(true);
          setWizardGrantEngineRole(true);
          setIsWizardOpen(true);
          populateWizardForMember(member);
          document.getElementById('wizard-section')?.scrollIntoView?.({ behavior: 'smooth' });
        }}
      />

      {/* 3. Interactive Permission Setup Wizard */}
      <AccessGrantWizard
        isWizardOpen={isWizardOpen}
        onToggleOpen={() => setIsWizardOpen(!isWizardOpen)}
        targetMembersInput={targetMembersInput}
        onChangeTargetMembers={setTargetMembersInput}
        onReloadCurrentConfig={() => populateWizardForMember(targetMembersInput)}
        wizardCheckCustomRole={wizardCheckCustomRole}
        onChangeCheckCustomRole={setWizardCheckCustomRole}
        wizardGrantProjectRole={wizardGrantProjectRole}
        onChangeGrantProjectRole={setWizardGrantProjectRole}
        wizardGrantEngineRole={wizardGrantEngineRole}
        onChangeGrantEngineRole={setWizardGrantEngineRole}
        wizardProjectCustomRoleId={wizardProjectCustomRoleId}
        onChangeProjectCustomRoleId={setWizardProjectCustomRoleId}
        wizardResourceRole={wizardResourceRole}
        onChangeResourceRole={setWizardResourceRole}
        wizardGrantNotebookLmRole={wizardGrantNotebookLmRole}
        onChangeGrantNotebookLmRole={setWizardGrantNotebookLmRole}
        selectedResourcesForGrant={selectedResourcesForGrant}
        onChangeSelectedResources={setSelectedResourcesForGrant}
        connectors={connectors}
        legacyDataStores={legacyDataStores}
        includeUnattachedInSync={includeUnattachedInSync}
        onChangeIncludeUnattached={setIncludeUnattachedInSync}
        isDryRun={isDryRun}
        onChangeDryRun={setIsDryRun}
        isExecutingWizard={isExecutingWizard}
        onSubmit={handleExecuteWizard}
        executionLogs={executionLogs}
        onClearLogs={() => setExecutionLogs([])}
        appId={appId}
      />

      {/* 4. Connected Resources & Principals Matrix */}
      <ConnectedResourcesMatrix
        engine={engine}
        config={config}
        projectId={projectId}
        appId={appId}
        enginePolicy={enginePolicy}
        connectors={connectors}
        legacyDataStores={legacyDataStores}
        principalMatrix={principalMatrix}
        onEditResource={setEditingResource}
        onRevokeApp={handleRevokeApp}
      />

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
          childEntityIds={
            editingResource.type === 'connector'
              ? connectors.find(c => c.id === editingResource.id)?.entities.map(e => e.id)
              : undefined
          }
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
      <IsolateUserModal
        isolateModalTarget={isolateModalTarget}
        projectId={projectId}
        isIsolating={isIsolating}
        onClose={() => setIsolateModalTarget(null)}
        onConfirm={handleExecuteIsolation}
      />

      <DestructiveConfirmModal
        isOpen={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        onConfirm={confirmRevoke}
        title="Revoke Member Access"
        resourceType="IAM Binding"
        resources={revokeTarget ? [{ name: revokeTarget.member, details: revokeTarget.resourceDesc }] : []}
        confirmKeyword="REVOKE"
        confirmButtonText="Revoke Access"
        description={`You are about to revoke access for "${revokeTarget?.member}" from ${revokeTarget?.resourceDesc}.`}
        consequences={[
          `The principal "${revokeTarget?.member}" will immediately lose search and query access to this resource.`,
          "This updates the resource IAM policy bindings directly in Google Cloud."
        ]}
        isLoading={isRevoking}
      />
    </div>
  );
};

export default ConnectedDataStorePermissions;
