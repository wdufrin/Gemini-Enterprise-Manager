/**
 * Copyright 2026 Google LLC
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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as core from './core';
import { getDevToolsConfig, updateDevToolsConfig } from './devTools';
import {
  getUserStore,
  updateUserStore,
  getProjectOverageConfig,
  updateProjectOverageConfig,
} from './licenses';
import { DevToolsConfig, ProjectOverageConfig, UserStore } from '../../types';

describe('services/api/devTools & licensing UserStore/Overage APIs', () => {
  const gapiSpy = vi.spyOn(core, 'gapiRequest');

  beforeEach(() => {
    gapiSpy.mockReset();
  });

  describe('getDevToolsConfig & updateDevToolsConfig', () => {
    it('fetches global singleton DevToolsConfig using unprefixed discoveryengine host', async () => {
      const mockConfig: DevToolsConfig = {
        name: 'projects/my-proj/locations/global/devToolsConfig',
        devToolsEnabled: true,
        agentConfig: {
          sandboxModeEnabled: true,
          outsideWorkspaceFileAccessPolicy: 'FILE_ACCESS_POLICY_DENY',
        },
      };
      gapiSpy.mockResolvedValueOnce(mockConfig);

      const res = await getDevToolsConfig({ projectId: '  my-proj  ', appLocation: 'GLOBAL' }, true);

      expect(res).toEqual(mockConfig);
      expect(gapiSpy).toHaveBeenCalledTimes(1);
      expect(gapiSpy).toHaveBeenCalledWith(
        'https://discoveryengine.googleapis.com/v1alpha/projects/my-proj/locations/global/devToolsConfig',
        'GET',
        'my-proj',
        undefined,
        undefined,
        undefined,
        true,
      );
    });

    it('routes regional DevToolsConfig GET and PATCH calls to regional discoveryengine host with encoded updateMask', async () => {
      const updatedConfig: DevToolsConfig = {
        name: 'projects/proj-eu/locations/europe-west2/devToolsConfig',
        devToolsEnabled: true,
        mcpConfig: { mcpEnabled: true, mcpAllowlist: { github: { url: 'https://mcp.github.com' } } },
      };
      gapiSpy.mockResolvedValueOnce(updatedConfig);

      const res = await updateDevToolsConfig(
        {
          devToolsEnabled: true,
          mcpConfig: { mcpEnabled: true, mcpAllowlist: { github: { url: 'https://mcp.github.com' } } },
        },
        ['devToolsEnabled', 'mcpConfig'],
        { projectId: 'proj-eu', appLocation: 'europe-west2' },
      );

      expect(res).toEqual(updatedConfig);
      expect(gapiSpy).toHaveBeenCalledWith(
        'https://europe-west2-discoveryengine.googleapis.com/v1alpha/projects/proj-eu/locations/europe-west2/devToolsConfig?updateMask=devToolsEnabled%2CmcpConfig',
        'PATCH',
        'proj-eu',
        undefined,
        {
          name: 'projects/proj-eu/locations/europe-west2/devToolsConfig',
          devToolsEnabled: true,
          mcpConfig: { mcpEnabled: true, mcpAllowlist: { github: { url: 'https://mcp.github.com' } } },
        },
      );
    });

    it('rejects missing/whitespace projectId, empty updateMask, and hostile location strings', async () => {
      await expect(
        getDevToolsConfig({ projectId: '   ', appLocation: 'global' }),
      ).rejects.toThrow(/Project ID is required to fetch DevToolsConfig/i);

      await expect(
        updateDevToolsConfig({ devToolsEnabled: true }, ['devToolsEnabled'], {
          projectId: '',
          appLocation: 'global',
        }),
      ).rejects.toThrow(/Project ID is required to update DevToolsConfig/i);

      await expect(
        updateDevToolsConfig({ devToolsEnabled: true }, [], {
          projectId: 'my-proj',
          appLocation: 'global',
        }),
      ).rejects.toThrow(/updateMask must contain at least one field/i);

      // Hostile path traversal / query injection in location
      await expect(
        getDevToolsConfig({ projectId: 'my-proj', appLocation: 'us/../../evil?x=1' }),
      ).rejects.toThrow(/Invalid Discovery Engine location/i);

      expect(gapiSpy).not.toHaveBeenCalled();
    });

    it('propagates upstream 403 PERMISSION_DENIED errors without swallowing', async () => {
      gapiSpy.mockRejectedValueOnce(
        new Error('403 PERMISSION_DENIED: Project not enrolled in GOOGLE_INTERNAL or TRUSTED_TESTER'),
      );

      await expect(
        getDevToolsConfig({ projectId: 'unlisted-proj', appLocation: 'global' }),
      ).rejects.toThrow(/403 PERMISSION_DENIED/);
    });
  });

  describe('UserStore & ProjectOverageConfig APIs', () => {
    it('fetches and updates UserStore with default_user_store and explicit updateMask', async () => {
      const mockStore: UserStore = {
        name: 'projects/12345/locations/us/userStores/default_user_store',
        enableLicenseAutoRegister: true,
        enableExpiredLicenseAutoUpdate: true,
      };
      gapiSpy.mockResolvedValueOnce(mockStore).mockResolvedValueOnce(mockStore);

      const fetched = await getUserStore({ projectId: '12345', appLocation: 'us' });
      expect(fetched).toEqual(mockStore);
      expect(gapiSpy).toHaveBeenNthCalledWith(
        1,
        'https://us-discoveryengine.googleapis.com/v1alpha/projects/12345/locations/us/userStores/default_user_store',
        'GET',
        '12345',
      );

      const patched = await updateUserStore(
        { enableLicenseAutoRegister: true, enableExpiredLicenseAutoUpdate: true },
        ['enableLicenseAutoRegister', 'enableExpiredLicenseAutoUpdate'],
        { projectId: '12345', appLocation: 'us' },
      );
      expect(patched).toEqual(mockStore);
      expect(gapiSpy).toHaveBeenNthCalledWith(
        2,
        'https://us-discoveryengine.googleapis.com/v1alpha/projects/12345/locations/us/userStores/default_user_store?updateMask=enableLicenseAutoRegister%2CenableExpiredLicenseAutoUpdate',
        'PATCH',
        '12345',
        undefined,
        {
          name: 'projects/12345/locations/us/userStores/default_user_store',
          enableLicenseAutoRegister: true,
          enableExpiredLicenseAutoUpdate: true,
        },
      );
    });

    it('fetches and updates ProjectOverageConfig with checkBillingAccountEligibility query param', async () => {
      const mockOverage: ProjectOverageConfig = {
        name: 'projects/12345/locations/global/projectOverageConfig',
        prepayWalletRequired: false,
        tierOverageConfigs: [
          { subscriptionTier: 'GEMINI_ENTERPRISE', priorityPaygEnabled: true },
        ],
      };
      gapiSpy.mockResolvedValueOnce(mockOverage).mockResolvedValueOnce(mockOverage);

      const res = await getProjectOverageConfig({ projectId: '12345', appLocation: 'global' });
      expect(res.prepayWalletRequired).toBe(false);
      expect(gapiSpy).toHaveBeenNthCalledWith(
        1,
        'https://discoveryengine.googleapis.com/v1alpha/projects/12345/locations/global/projectOverageConfig?checkBillingAccountEligibility=true',
        'GET',
        '12345',
      );

      await updateProjectOverageConfig(
        { tierOverageConfigs: mockOverage.tierOverageConfigs },
        ['tierOverageConfigs'],
        { projectId: '12345', appLocation: 'global' },
      );
      expect(gapiSpy).toHaveBeenNthCalledWith(
        2,
        'https://discoveryengine.googleapis.com/v1alpha/projects/12345/locations/global/projectOverageConfig?updateMask=tierOverageConfigs',
        'PATCH',
        '12345',
        undefined,
        {
          name: 'projects/12345/locations/global/projectOverageConfig',
          tierOverageConfigs: mockOverage.tierOverageConfigs,
        },
      );
    });

    it('rejects hostile userStoreId path traversal and empty updateMasks on UserStore & ProjectOverageConfig', async () => {
      await expect(
        getUserStore({ projectId: '12345', appLocation: 'global' }, '../admin_store'),
      ).rejects.toThrow(/Invalid userStoreId/i);

      await expect(
        updateUserStore({ enableLicenseAutoRegister: true }, [], {
          projectId: '12345',
          appLocation: 'global',
        }),
      ).rejects.toThrow(/updateMask must contain at least one field/i);

      await expect(
        updateProjectOverageConfig({ tierOverageConfigs: [] }, [], {
          projectId: '12345',
          appLocation: 'global',
        }),
      ).rejects.toThrow(/updateMask must contain at least one field/i);

      expect(gapiSpy).not.toHaveBeenCalled();
    });
  });
});
