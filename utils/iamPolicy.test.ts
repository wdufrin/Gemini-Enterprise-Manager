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

import { describe, it, expect, vi } from 'vitest';
import { GapiError } from '../services/api/core';
import { IamPolicy } from '../types';
import {
  addMemberToRoles,
  cloneIamPolicy,
  CUSTOM_RESTRICTED_ADMIN_PERMISSIONS,
  CUSTOM_RESTRICTED_ADMIN_ROLE_ID,
  CUSTOM_RESTRICTED_END_USER_CORE_PERMISSIONS,
  CUSTOM_RESTRICTED_END_USER_PERMISSIONS,
  CUSTOM_RESTRICTED_END_USER_ROLE_ID,
  ensureCustomRestrictedProjectRole,
  extractDataStoreAccessControlEnabled,
  inspectCustomRestrictedRole,
  isIamConcurrentModificationError,
  removeMemberFromRoles,
  retryIamReadModifyWrite,
} from './iamPolicy';

describe('iamPolicy Read-Modify-Write utilities', () => {
  describe('isIamConcurrentModificationError', () => {
    it('detects Cloud Resource Manager 409 ABORTED ETag mismatch errors', () => {
      const gapiConflict = new GapiError(
        "There were concurrent policy changes. Please retry the whole read-modify-write with exponential backoff. The request's ETag '\\007\\006^\\377\\016o\\245\\'' did not match the current policy's ETag '\\007\\006`)jE\\010\\330'.",
        409,
        'ABORTED',
      );
      expect(isIamConcurrentModificationError(gapiConflict)).toBe(true);
    });

    it('detects plain Error instances carrying GCP concurrent policy change messages', () => {
      const wrappedError = new Error(
        "There were concurrent policy changes. Please retry the whole read-modify-write with exponential backoff. The request's ETag 'etag-a' did not match the current policy's ETag 'etag-b'.",
      );
      expect(isIamConcurrentModificationError(wrappedError)).toBe(true);
    });

    it('rejects non-concurrency client/auth errors even with adversarial message payloads', () => {
      const forbiddenWithCraftedMsg = new GapiError(
        'Caller lacks resourcemanager.projects.setIamPolicy (concurrent policy changes note)',
        403,
        'PERMISSION_DENIED',
      );
      const invalidArgument = new GapiError(
        'Member user:bad is invalid',
        400,
        'INVALID_ARGUMENT',
      );
      const unauthenticated = new GapiError('Token expired', 401, 'UNAUTHENTICATED');
      const notFound = new GapiError('Resource not found', 404, 'NOT_FOUND');
      const plainForbidden = new Error('403 PERMISSION_DENIED: missing setIamPolicy');

      expect(isIamConcurrentModificationError(forbiddenWithCraftedMsg)).toBe(false);
      expect(isIamConcurrentModificationError(invalidArgument)).toBe(false);
      expect(isIamConcurrentModificationError(unauthenticated)).toBe(false);
      expect(isIamConcurrentModificationError(notFound)).toBe(false);
      expect(isIamConcurrentModificationError(plainForbidden)).toBe(false);
      expect(isIamConcurrentModificationError(null)).toBe(false);
      expect(isIamConcurrentModificationError(undefined)).toBe(false);
    });
  });

  describe('addMemberToRoles & removeMemberFromRoles', () => {
    it('preserves conditional bindings, auditConfigs, and version while adding unconditional bindings', () => {
      const original: IamPolicy = {
        version: 3,
        etag: 'etag-v1',
        auditConfigs: [{ service: 'allServices', auditLogConfigs: [{ logType: 'ADMIN_READ' }] }],
        bindings: [
          {
            role: 'roles/discoveryengine.agentspaceRestrictedUser',
            members: ['user:temp-contractor@example.com'],
            condition: {
              title: 'Expires 2026',
              expression: 'request.time < timestamp("2026-12-31T00:00:00Z")',
            },
          },
        ],
      };

      const { policy: updated, changed } = addMemberToRoles(
        original,
        [
          'roles/discoveryengine.agentspaceRestrictedUser',
          'roles/discoveryengine.notebookLmUser',
        ],
        'user:alice@example.com',
      );

      expect(changed).toBe(true);
      expect(updated.version).toBe(3);
      expect(updated.etag).toBe('etag-v1');
      expect(updated.auditConfigs).toEqual(original.auditConfigs);
      // Conditional binding must NOT be mutated
      expect(updated.bindings).toEqual([
        {
          role: 'roles/discoveryengine.agentspaceRestrictedUser',
          members: ['user:temp-contractor@example.com'],
          condition: {
            title: 'Expires 2026',
            expression: 'request.time < timestamp("2026-12-31T00:00:00Z")',
          },
        },
        {
          role: 'roles/discoveryengine.agentspaceRestrictedUser',
          members: ['user:alice@example.com'],
        },
        {
          role: 'roles/discoveryengine.notebookLmUser',
          members: ['user:alice@example.com'],
        },
      ]);

      // Idempotent second call returns changed: false
      const second = addMemberToRoles(
        updated,
        [
          'roles/discoveryengine.agentspaceRestrictedUser',
          'roles/discoveryengine.notebookLmUser',
        ],
        'user:alice@example.com',
      );
      expect(second.changed).toBe(false);
    });

    it('removes members cleanly from unconditional bindings and prunes empty bindings', () => {
      const policy: IamPolicy = {
        etag: 'etag-rem',
        bindings: [
          {
            role: 'roles/discoveryengine.agentspaceUser',
            members: ['user:alice@example.com'],
          },
          {
            role: 'roles/discoveryengine.agentspaceAdmin',
            members: ['user:admin@example.com'],
          },
        ],
      };

      const { policy: afterRemove, changed } = removeMemberFromRoles(
        policy,
        (r) => r === 'roles/discoveryengine.agentspaceUser',
        'user:alice@example.com',
      );

      expect(changed).toBe(true);
      expect(afterRemove.bindings).toEqual([
        {
          role: 'roles/discoveryengine.agentspaceAdmin',
          members: ['user:admin@example.com'],
        },
      ]);
    });
  });

  describe('retryIamReadModifyWrite', () => {
    it('retries the entire read-modify-write cycle with exponential backoff on concurrent ETag conflicts and preserves concurrent writes', async () => {
      let serverPolicy: IamPolicy = {
        version: 3,
        etag: 'etag-1',
        bindings: [
          {
            role: 'roles/viewer',
            members: ['user:existing@example.com'],
          },
        ],
      };

      let getCalls = 0;
      const getPolicy = vi.fn(async () => {
        getCalls++;
        return cloneIamPolicy(serverPolicy);
      });

      let setCalls = 0;
      const setPolicy = vi.fn(async (incoming: IamPolicy) => {
        setCalls++;
        // Simulate two consecutive concurrent writes by other services advancing server ETag
        if (setCalls === 1) {
          serverPolicy = {
            version: 3,
            etag: 'etag-2',
            bindings: [
              ...(serverPolicy.bindings || []),
              {
                role: 'roles/discoveryengine.serviceAgent',
                members: ['serviceAccount:service-123@gcp-sa-discoveryengine.iam.gserviceaccount.com'],
              },
            ],
          };
          throw new GapiError(
            "There were concurrent policy changes. Please retry the whole read-modify-write with exponential backoff. The request's ETag 'etag-1' did not match the current policy's ETag 'etag-2'.",
            409,
            'ABORTED',
          );
        }
        if (setCalls === 2) {
          serverPolicy = {
            ...serverPolicy,
            etag: 'etag-3',
            bindings: [
              ...(serverPolicy.bindings || []),
              {
                role: 'roles/logging.logWriter',
                members: ['serviceAccount:logger@example.iam.gserviceaccount.com'],
              },
            ],
          };
          throw new GapiError(
            "The request's ETag 'etag-2' did not match the current policy's ETag 'etag-3'.",
            409,
            'ABORTED',
          );
        }

        expect(incoming.etag).toBe('etag-3');
        serverPolicy = {
          ...incoming,
          etag: 'etag-4',
        };
        return cloneIamPolicy(serverPolicy);
      });

      const recordedDelays: number[] = [];
      const sleepFn = vi.fn(async (ms: number) => {
        recordedDelays.push(ms);
      });
      const onRetry = vi.fn();

      const result = await retryIamReadModifyWrite({
        getPolicy,
        setPolicy,
        modify: (current) =>
          addMemberToRoles(
            current,
            [
              'roles/discoveryengine.agentspaceRestrictedUser',
              'roles/discoveryengine.notebookLmUser',
            ],
            'user:newuser@example.com',
          ),
        baseDelayMs: 200,
        maxDelayMs: 2000,
        jitterRatio: 0,
        sleepFn,
        onRetry,
      });

      expect(getCalls).toBe(3);
      expect(setCalls).toBe(3);
      expect(recordedDelays).toEqual([200, 400]);
      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(result.etag).toBe('etag-4');
      // Must preserve both concurrent bindings added during attempts 1 & 2 AND our new bindings
      expect(result.bindings).toEqual([
        {
          role: 'roles/viewer',
          members: ['user:existing@example.com'],
        },
        {
          role: 'roles/discoveryengine.serviceAgent',
          members: ['serviceAccount:service-123@gcp-sa-discoveryengine.iam.gserviceaccount.com'],
        },
        {
          role: 'roles/logging.logWriter',
          members: ['serviceAccount:logger@example.iam.gserviceaccount.com'],
        },
        {
          role: 'roles/discoveryengine.agentspaceRestrictedUser',
          members: ['user:newuser@example.com'],
        },
        {
          role: 'roles/discoveryengine.notebookLmUser',
          members: ['user:newuser@example.com'],
        },
      ]);
    });

    it('skips setPolicy entirely when modify reports changed: false', async () => {
      const getPolicy = vi.fn(async (): Promise<IamPolicy> => ({
        etag: 'etag-unchanged',
        bindings: [
          {
            role: 'roles/discoveryengine.agentspaceRestrictedUser',
            members: ['user:already@example.com'],
          },
        ],
      }));
      const setPolicy = vi.fn();

      const result = await retryIamReadModifyWrite({
        getPolicy,
        setPolicy,
        modify: (current) =>
          addMemberToRoles(
            current,
            ['roles/discoveryengine.agentspaceRestrictedUser'],
            'user:already@example.com',
          ),
      });

      expect(getPolicy).toHaveBeenCalledTimes(1);
      expect(setPolicy).not.toHaveBeenCalled();
      expect(result.etag).toBe('etag-unchanged');
    });

    it('does NOT retry non-concurrency errors (403 PERMISSION_DENIED) and propagates the exact error', async () => {
      const getPolicy = vi.fn(async (): Promise<IamPolicy> => ({
        etag: 'etag-1',
        bindings: [],
      }));
      const permissionError = new GapiError(
        'Permission resourcemanager.projects.setIamPolicy denied on resource test-proj',
        403,
        'PERMISSION_DENIED',
      );
      const setPolicy = vi.fn(async () => {
        throw permissionError;
      });
      const sleepFn = vi.fn(async () => {});

      await expect(
        retryIamReadModifyWrite({
          getPolicy,
          setPolicy,
          modify: (current) =>
            addMemberToRoles(
              current,
              ['roles/discoveryengine.agentspaceRestrictedUser'],
              'user:bob@example.com',
            ),
          sleepFn,
        }),
      ).rejects.toThrow(permissionError);

      expect(getPolicy).toHaveBeenCalledTimes(1);
      expect(setPolicy).toHaveBeenCalledTimes(1);
      expect(sleepFn).not.toHaveBeenCalled();
    });

    it('exhausts maxRetries and rethrows the final 409 GapiError when conflicts persist indefinitely', async () => {
      const getPolicy = vi.fn(async (): Promise<IamPolicy> => ({
        etag: 'stale-etag',
        bindings: [],
      }));
      const persistentConflict = new GapiError(
        "There were concurrent policy changes. Please retry the whole read-modify-write with exponential backoff.",
        409,
        'ABORTED',
      );
      const setPolicy = vi.fn(async () => {
        throw persistentConflict;
      });
      const sleepFn = vi.fn(async () => {});

      await expect(
        retryIamReadModifyWrite({
          getPolicy,
          setPolicy,
          modify: (current) =>
            addMemberToRoles(
              current,
              ['roles/discoveryengine.agentspaceRestrictedUser'],
              'user:contended@example.com',
            ),
          maxRetries: 2,
          baseDelayMs: 10,
          sleepFn,
        }),
      ).rejects.toThrow(persistentConflict);

      // 1 initial attempt + 2 retries = 3 full RMW cycles
      expect(getPolicy).toHaveBeenCalledTimes(3);
      expect(setPolicy).toHaveBeenCalledTimes(3);
      expect(sleepFn).toHaveBeenCalledTimes(2);
    });

    it('rejects invalid retry parameters', async () => {
      const noopGet = async (): Promise<IamPolicy> => ({ bindings: [] });
      const noopSet = async (p: IamPolicy): Promise<IamPolicy> => p;
      const noopMod = (p: IamPolicy) => ({ policy: p, changed: false });

      await expect(
        retryIamReadModifyWrite({
          getPolicy: noopGet,
          setPolicy: noopSet,
          modify: noopMod,
          maxRetries: -1,
        }),
      ).rejects.toThrow(/Invalid maxRetries/);

      await expect(
        retryIamReadModifyWrite({
          getPolicy: noopGet,
          setPolicy: noopSet,
          modify: noopMod,
          baseDelayMs: -50,
        }),
      ).rejects.toThrow(/Backoff delays must be non-negative/);
    });
  });

  describe('GA Custom Restricted Roles & Project Config Extraction', () => {
    it('extractDataStoreAccessControlEnabled handles camelCase, snake_case, flat fallback, and malformed payloads', () => {
      expect(
        extractDataStoreAccessControlEnabled({
          customerProvidedConfig: {
            resourceAccessControlConfig: {
              dataStoreAccessControlEnabled: true,
            },
          },
        }),
      ).toBe(true);

      expect(
        extractDataStoreAccessControlEnabled({
          customer_provided_config: {
            resource_access_control_config: {
              data_store_access_control_enabled: true,
            },
          },
        }),
      ).toBe(true);

      expect(
        extractDataStoreAccessControlEnabled({
          dataStoreAccessControlEnabled: true,
        }),
      ).toBe(true);

      // Negative / malformed inputs
      expect(extractDataStoreAccessControlEnabled(null)).toBe(false);
      expect(extractDataStoreAccessControlEnabled(undefined)).toBe(false);
      expect(extractDataStoreAccessControlEnabled('invalid')).toBe(false);
      expect(
        extractDataStoreAccessControlEnabled({
          customerProvidedConfig: {
            resourceAccessControlConfig: {
              dataStoreAccessControlEnabled: 'true',
            },
          },
        }),
      ).toBe(false);
    });

    it('inspectCustomRestrictedRole rejects deleted roles, missing core perms, and adversarial DataStore bypass perms', () => {
      expect(inspectCustomRestrictedRole(null, 'endUser')).toEqual(
        expect.objectContaining({ valid: false, reason: 'MISSING' }),
      );

      expect(
        inspectCustomRestrictedRole(
          {
            name: 'projects/p/roles/customRestrictedEndUser',
            title: 'Test Role',
            deleted: true,
            includedPermissions: [...CUSTOM_RESTRICTED_END_USER_PERMISSIONS],
          },
          'endUser',
        ),
      ).toEqual(expect.objectContaining({ valid: false, reason: 'DELETED' }));

      expect(
        inspectCustomRestrictedRole(
          {
            name: 'projects/p/roles/customRestrictedEndUser',
            title: 'Test Role',
            includedPermissions: ['resourcemanager.projects.get'],
          },
          'endUser',
        ),
      ).toEqual(
        expect.objectContaining({
          valid: false,
          reason: 'MISSING_REQUIRED_PERMISSIONS',
          missingRequiredPermissions: [...CUSTOM_RESTRICTED_END_USER_CORE_PERMISSIONS],
        }),
      );

      // Adversarial check: role poisoned with App-Only collections.get & dataStores.get MUST be rejected
      expect(
        inspectCustomRestrictedRole(
          {
            name: 'projects/p/roles/customRestrictedEndUser',
            title: 'Test Role',
            includedPermissions: [
              ...CUSTOM_RESTRICTED_END_USER_PERMISSIONS,
              'discoveryengine.collections.get',
              'discoveryengine.dataStores.get',
            ],
          },
          'endUser',
        ),
      ).toEqual(
        expect.objectContaining({
          valid: false,
          reason: 'HAS_BYPASS_PERMISSIONS',
          forbiddenPermissions: [
            'discoveryengine.collections.get',
            'discoveryengine.dataStores.get',
          ],
        }),
      );

      expect(
        inspectCustomRestrictedRole(
          {
            name: 'projects/p/roles/customRestrictedEndUser',
            title: 'Test Role',
            includedPermissions: [...CUSTOM_RESTRICTED_END_USER_PERMISSIONS],
          },
          'endUser',
        ),
      ).toEqual(expect.objectContaining({ valid: true }));
    });

    it('ensureCustomRestrictedProjectRole creates on 404 (with 400 core-perm fallback), undeletes & strips bypass perms, and propagates 403 errors', async () => {
      // 1. 404 -> create rejects extended perms with 400 -> retries with core perms
      const get404 = vi.fn(async () => {
        throw new GapiError('Not found', 404, 'NOT_FOUND');
      });
      const createWithFallback = vi
        .fn()
        .mockRejectedValueOnce(
          new GapiError(
            'Permission discoveryengine.locations.fetchAgentCards is not valid for custom roles',
            400,
            'INVALID_ARGUMENT',
          ),
        )
        .mockResolvedValueOnce({
          name: 'projects/proj-1/roles/customRestrictedEndUser',
          title: 'Custom Restricted End User',
          includedPermissions: [...CUSTOM_RESTRICTED_END_USER_CORE_PERMISSIONS],
        });

      const createdRes = await ensureCustomRestrictedProjectRole({
        projectId: 'proj-1',
        persona: 'endUser',
        getCustomRole: get404,
        createCustomRole: createWithFallback,
      });
      expect(createdRes.action).toBe('created');
      expect(createdRes.roleName).toBe('projects/proj-1/roles/customRestrictedEndUser');
      expect(createWithFallback).toHaveBeenCalledTimes(2);
      expect(createWithFallback).toHaveBeenLastCalledWith(
        'proj-1',
        CUSTOM_RESTRICTED_END_USER_ROLE_ID,
        expect.objectContaining({
          stage: 'GA',
          includedPermissions: [...CUSTOM_RESTRICTED_END_USER_CORE_PERMISSIONS],
        }),
      );

      // 2. Soft-deleted role poisoned with dataStores.get -> undeletes AND strips bypass perms via updateCustomRole
      const getDeletedPoisoned = vi.fn(async () => ({
        name: 'projects/proj-1/roles/customRestrictedAdmin',
        title: 'Custom Restricted Admin',
        deleted: true,
        includedPermissions: [
          ...CUSTOM_RESTRICTED_ADMIN_PERMISSIONS,
          'discoveryengine.dataStores.get',
        ],
      }));
      const undeleteRole = vi.fn(async () => ({
        name: 'projects/proj-1/roles/customRestrictedAdmin',
        title: 'Custom Restricted Admin',
        deleted: false,
        includedPermissions: [
          ...CUSTOM_RESTRICTED_ADMIN_PERMISSIONS,
          'discoveryengine.dataStores.get',
        ],
      }));
      const updateRole = vi.fn(
        async (_p, _id, payload: { title: string; includedPermissions: string[] }) => ({
          name: 'projects/proj-1/roles/customRestrictedAdmin',
          title: payload.title,
          includedPermissions: payload.includedPermissions,
        }),
      );

      const remediated = await ensureCustomRestrictedProjectRole({
        projectId: 'proj-1',
        persona: 'admin',
        getCustomRole: getDeletedPoisoned,
        createCustomRole: vi.fn(),
        undeleteCustomRole: undeleteRole,
        updateCustomRole: updateRole,
      });
      expect(remediated.action).toBe('undeleted');
      expect(undeleteRole).toHaveBeenCalledWith('proj-1', CUSTOM_RESTRICTED_ADMIN_ROLE_ID);
      expect(updateRole).toHaveBeenCalledWith(
        'proj-1',
        CUSTOM_RESTRICTED_ADMIN_ROLE_ID,
        expect.objectContaining({
          includedPermissions: expect.not.arrayContaining(['discoveryengine.dataStores.get']),
        }),
      );

      // 3. Negative check: 403 PERMISSION_DENIED on getCustomRole must NOT be swallowed as 404
      const forbiddenErr = new GapiError('Caller lacks iam.roles.get', 403, 'PERMISSION_DENIED');
      await expect(
        ensureCustomRestrictedProjectRole({
          projectId: 'proj-1',
          persona: 'endUser',
          getCustomRole: async () => {
            throw forbiddenErr;
          },
          createCustomRole: vi.fn(),
        }),
      ).rejects.toThrow(forbiddenErr);
    });
  });
});
