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

import { useState, useEffect, useCallback, useMemo } from 'react';
import { AppEngine, Config, DataStore } from '../types';
import * as api from '../services/apiService';
import {
  AGENTSPACE_USER_ROLE,
  BROAD_PROJECT_ROLES,
  CUSTOM_ROLE_ID,
  ConnectorResource,
  IamPolicy,
  LegacyDataStoreResource,
  PrincipalAccess,
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

  const [projectPolicy, setProjectPolicy] = useState<IamPolicy | null>(null);
  const [enginePolicy, setEnginePolicy] = useState<IamPolicy | null>(null);

  const [connectors, setConnectors] = useState<ConnectorResource[]>([]);
  const [legacyDataStores, setLegacyDataStores] = useState<LegacyDataStoreResource[]>([]);
  const [selectedResourcesForGrant, setSelectedResourcesForGrant] = useState<Record<string, boolean>>({});

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
      let pPolicy: IamPolicy | null = null;
      try {
        pPolicy = await api.getProjectIamPolicy(projectId);
        setProjectPolicy(pPolicy);
      } catch (e: unknown) {
        console.warn('Could not fetch project IAM policy', e);
      }

      // 1.3 Get Engine IAM Policy
      let engPolicy: IamPolicy | null = null;
      try {
        engPolicy = await api.getEngineIamPolicy(engine.name, config);
        setEnginePolicy(engPolicy);
      } catch (e: unknown) {
        console.warn('Could not fetch engine IAM policy', e);
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
          } catch (e: unknown) {
            console.warn(`Could not get policy for connector ${conn.id}`, e);
          }
          await Promise.all(
            conn.entities.map(async ent => {
              try {
                const ep = await api.getDataStoreIamPolicy(ent.id, config);
                ent.policy = ep;
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
          } catch (e: unknown) {
            console.warn(`Could not get policy for legacy datastore ${ds.id}`, e);
          }
        })
      );

      setConnectors(connList);
      setLegacyDataStores(legacyDsList);

      // Pre-select all attached resources by default
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch connected datastore permissions.';
      setError(msg);
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to create custom role: ${msg}`);
    } finally {
      setIsCreatingRole(false);
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

    // 3. Count Total DataStores
    let totalDsCount = 0;
    connectors.forEach(c => {
      totalDsCount += 1;
      totalDsCount += c.entities.length;
    });
    totalDsCount += legacyDataStores.length;

    // 4. Process Connectors & DataStores
    connectors.forEach(conn => {
      const connMembers = conn.policy?.bindings?.find(b => b.role === AGENTSPACE_USER_ROLE)?.members || [];
      connMembers.forEach(m => {
        const u = getOrCreate(m);
        if (!u.accessibleDataStores.includes(conn.displayName || conn.id)) {
          u.accessibleDataStores.push(conn.displayName || conn.id);
        }
      });

      conn.entities.forEach(ent => {
        const entMembers = ent.policy?.bindings?.find(b => b.role === AGENTSPACE_USER_ROLE)?.members || [];
        entMembers.forEach(m => {
          const u = getOrCreate(m);
          if (!u.accessibleDataStores.includes(ent.displayName || ent.id)) {
            u.accessibleDataStores.push(ent.displayName || ent.id);
          }
        });
      });
    });

    legacyDataStores.forEach(ds => {
      const dsMembers = ds.policy?.bindings?.find(b => b.role === AGENTSPACE_USER_ROLE)?.members || [];
      dsMembers.forEach(m => {
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
  };
}
