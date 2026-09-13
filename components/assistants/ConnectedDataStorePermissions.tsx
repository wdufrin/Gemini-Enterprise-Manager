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

import React, { useState, useEffect, useCallback } from 'react';
import * as api from '../../services/apiService';
import SetDataStoreIamPolicyModal, { ResourceType } from './SetDataStoreIamPolicyModal';
import DataStorePermissionsScriptModal from './DataStorePermissionsScriptModal';
import DestructiveConfirmModal from '../DestructiveConfirmModal';
import {
  AGENTSPACE_USER_ROLE,
  BROAD_PROJECT_ROLES,
  CUSTOM_ROLE_ID,
  ConnectedDataStorePermissionsProps,
  EditingResource,
  IsolateTarget,
  RevokeTarget,
  UserAccessDetails,
} from './datastore-permissions/types';
import { formatMember, useDataStorePermissions } from '../../hooks/useDataStorePermissions';
import { StepByStepGuide } from './datastore-permissions/StepByStepGuide';
import { UserAccessInspector } from './datastore-permissions/UserAccessInspector';
import { AccessGrantWizard } from './datastore-permissions/AccessGrantWizard';
import { ConnectedResourcesMatrix } from './datastore-permissions/ConnectedResourcesMatrix';
import { IsolateUserModal } from './datastore-permissions/IsolateUserModal';

export type { UserAccessDetails };

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
    projectPolicy,
    enginePolicy,
    connectors,
    legacyDataStores,
    selectedResourcesForGrant,
    setSelectedResourcesForGrant,
    refreshAll,
    handleCreateCustomRole,
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
  const [isDryRun, setIsDryRun] = useState(false);
  const [isExecutingWizard, setIsExecutingWizard] = useState(false);
  const [executionLogs, setExecutionLogs] = useState<string[]>([]);

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
  const populateWizardForMember = useCallback((rawInput: string) => {
    if (!rawInput.trim()) return;

    const rawMembers = rawInput.split(/[\s,]+/).filter(m => m.trim() !== '');
    if (rawMembers.length === 0) return;

    const formattedMembers = rawMembers.map(formatMember);

    // 1. Step A1: Check if all target members have the custom role at project level
    const customRoleFullName = `projects/${projectId}/roles/${CUSTOM_ROLE_ID}`;
    const customRoleBinding = projectPolicy?.bindings?.find(
      b => b.role === customRoleFullName || b.role?.endsWith(`/${CUSTOM_ROLE_ID}`)
    );
    const hasProjectRole =
      formattedMembers.length > 0 && formattedMembers.every(m => customRoleBinding?.members?.includes(m));
    setWizardGrantProjectRole(hasProjectRole);

    // 2. Step A2: Check if all target members have App Engine access
    const engineBinding = enginePolicy?.bindings?.find(
      b => b.role === AGENTSPACE_USER_ROLE || b.role?.includes('agentspace')
    );
    const hasEngineRole =
      formattedMembers.length > 0 && formattedMembers.every(m => engineBinding?.members?.includes(m));
    setWizardGrantEngineRole(hasEngineRole);

    // 3. Steps A3 & A4: Check DataConnectors, Entities, and Legacy DataStores
    const newSelected: Record<string, boolean> = {};

    connectors.forEach(conn => {
      const connBinding = conn.policy?.bindings?.find(b => b.role === AGENTSPACE_USER_ROLE);
      if (formattedMembers.length > 0 && formattedMembers.every(m => connBinding?.members?.includes(m))) {
        newSelected[`connector:${conn.id}`] = true;
      }

      conn.entities.forEach(ent => {
        const entBinding = ent.policy?.bindings?.find(b => b.role === AGENTSPACE_USER_ROLE);
        if (formattedMembers.length > 0 && formattedMembers.every(m => entBinding?.members?.includes(m))) {
          newSelected[`entity:${ent.id}`] = true;
        }
      });
    });

    legacyDataStores.forEach(ds => {
      const dsBinding = ds.policy?.bindings?.find(b => b.role === AGENTSPACE_USER_ROLE);
      if (formattedMembers.length > 0 && formattedMembers.every(m => dsBinding?.members?.includes(m))) {
        newSelected[`datastore:${ds.id}`] = true;
      }
    });

    setSelectedResourcesForGrant(newSelected);
  }, [projectId, projectPolicy, enginePolicy, connectors, legacyDataStores, setSelectedResourcesForGrant]);

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
          wizardGrantProjectRole,
          isDryRun,
          addLog
        );

        // Step A2: App Engine role binding
        addLog(`--- Step A2: ${wizardGrantEngineRole ? 'Granting' : 'Revoking'} access on App Engine '${appId}' ---`);
        await syncPolicyRMW(
          `App Engine '${appId}'`,
          () => api.getEngineIamPolicy(engine.name, config),
          (p) => api.setEngineIamPolicy(engine.name, p, config),
          member,
          AGENTSPACE_USER_ROLE,
          wizardGrantEngineRole,
          isDryRun,
          addLog
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
            shouldGrantConn,
            isDryRun,
            addLog
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
              shouldGrantEnt,
              isDryRun,
              addLog
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
        refreshAll();
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
      setRevokeTarget(null);
      refreshAll();
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
        <StepByStepGuide
          projectId={projectId}
          appId={appId}
          onClose={() => setShowInstructionsGuide(false)}
        />
      )}

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
        onConfigureDataStores={(member, hasCustomRole) => {
          setTargetMembersInput(member);
          setWizardGrantProjectRole(!hasCustomRole);
          setWizardGrantEngineRole(true);
          setIsWizardOpen(true);
          document.getElementById('wizard-section')?.scrollIntoView({ behavior: 'smooth' });
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
        selectedResourcesForGrant={selectedResourcesForGrant}
        onChangeSelectedResources={setSelectedResourcesForGrant}
        connectors={connectors}
        legacyDataStores={legacyDataStores}
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
