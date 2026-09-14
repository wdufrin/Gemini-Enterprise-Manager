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

import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEngineDetailsForm } from './useEngineDetailsForm';
import { AppEngine, Config, WidgetConfig, WorkloadIdentityProvider } from '../types';
import * as api from '../services/apiService';

vi.mock('../services/apiService', () => ({
  getIdpConfig: vi.fn(),
  updateIdpConfig: vi.fn(),
  getAclConfig: vi.fn(),
  updateAclConfig: vi.fn(),
  getWidgetConfig: vi.fn(),
  updateWidgetConfig: vi.fn(),
  updateEngine: vi.fn(),
  getWorkforcePoolProviders: vi.fn(),
  listLicenseConfigs: vi.fn(),
}));

describe('useEngineDetailsForm hook — IdP and WidgetConfig decoupling', () => {
  const mockEngine: AppEngine = {
    name: 'projects/test-project/locations/global/collections/default_collection/engines/cosmere-123',
    displayName: 'Cosmere Search',
    solutionType: 'SOLUTION_TYPE_SEARCH',
  };

  const mockConfig: Config = {
    projectId: 'test-project',
    appLocation: 'global',
    collectionId: 'default_collection',
    appId: 'cosmere-123',
  };

  const mockWidget: WidgetConfig = {
    name: `${mockEngine.name}/widgetConfigs/default_search_widget_config`,
    displayName: 'default_search_widget_config',
    enableAutocomplete: true,
    enableSummarization: true,
  };

  const onUpdateSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listLicenseConfigs).mockResolvedValue({ licenseConfigs: [] });
    vi.mocked(api.getWidgetConfig).mockResolvedValue(mockWidget);
    vi.mocked(api.getAclConfig).mockResolvedValue({
      name: 'projects/test-project/locations/global/aclConfig',
      idpConfig: { idpType: 'GSUITE' },
    });
    vi.mocked(api.getIdpConfig).mockResolvedValue({ idpType: 'GSUITE' });
  });

  /**
   * NEGATIVE CONTROL 1:
   * Under the old unfixed code, `getIdpConfig(engine.name)` threw a network/CORS error
   * because `.../engines/{id}/idpConfig` does not exist on Google Cloud Discovery Engine.
   * Because `getIdpConfig` and `getWidgetConfig` were sequentially awaited inside a single
   * try/catch, when IdP failed, `getWidgetConfig` was completely skipped!
   *
   * The fixed implementation decouples them via `Promise.allSettled` and uses the real
   * `getAclConfig` API.
   */
  it('loads widgetConfig even when IdP/AclConfig discovery fails with a network/CORS error', async () => {
    vi.mocked(api.getAclConfig).mockRejectedValue(
      new Error('A network error occurred and the request could not be completed.'),
    );
    vi.mocked(api.getIdpConfig).mockRejectedValue(
      new Error('A network error occurred and the request could not be completed.'),
    );

    const { result } = renderHook(() =>
      useEngineDetailsForm({
        engine: mockEngine,
        config: mockConfig,
        onUpdateSuccess,
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoadingIdp).toBe(false);
    });

    // The widget configuration MUST still be loaded. In the broken code,
    // widgetConfig remained null because the exception aborted the entire fetch sequence.
    expect(result.current.widgetConfig).not.toBeNull();
    expect(result.current.widgetConfig?.enableAutocomplete).toBe(true);
    expect(api.getWidgetConfig).toHaveBeenCalledWith(mockEngine.name, mockConfig);
  });

  /**
   * NEGATIVE CONTROL 2:
   * Discovery Engine has NO engine-level `idpConfig` endpoint (`.../engines/{id}/idpConfig`).
   * Identity Provider settings are defined on `projects/{project}/locations/{location}/aclConfig`.
   * The hook must query `api.getAclConfig(config)`, NOT `api.getIdpConfig(engine.name)`.
   */
  it('queries getAclConfig at the location level and populates idpData correctly', async () => {
    vi.mocked(api.getAclConfig).mockResolvedValue({
      name: 'projects/test-project/locations/global/aclConfig',
      idpConfig: {
        idpType: 'GSUITE',
      },
    });

    const { result } = renderHook(() =>
      useEngineDetailsForm({
        engine: mockEngine,
        config: mockConfig,
        onUpdateSuccess,
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoadingIdp).toBe(false);
    });

    expect(api.getAclConfig).toHaveBeenCalledWith(mockConfig);
    expect(result.current.idpData.idpType).toBe('GSUITE');
  });

  /**
   * NEGATIVE CONTROL 3:
   * Handles third-party IdP with externalIdpConfig workforcePoolName and fetches providers.
   */
  it('handles third-party IdP workforcePoolName and fetches providers', async () => {
    vi.mocked(api.getAclConfig).mockResolvedValue({
      name: 'projects/test-project/locations/global/aclConfig',
      idpConfig: {
        idpType: 'THIRD_PARTY',
        externalIdpConfig: {
          workforcePoolName: 'locations/global/workforcePools/test-pool',
        },
      },
    });
    const mockProvider: WorkloadIdentityProvider = {
      name: 'locations/global/workforcePools/test-pool/providers/okta-provider',
      displayName: 'Okta',
    };
    vi.mocked(api.getWorkforcePoolProviders).mockResolvedValue({
      workforcePoolProviders: [mockProvider],
    });

    const { result } = renderHook(() =>
      useEngineDetailsForm({
        engine: mockEngine,
        config: mockConfig,
        onUpdateSuccess,
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoadingIdp).toBe(false);
    });

    expect(result.current.idpData.idpType).toBe('THIRD_PARTY');
    expect(result.current.idpData.workforcePoolName).toBe(
      'locations/global/workforcePools/test-pool',
    );
    expect(api.getWorkforcePoolProviders).toHaveBeenCalledWith(
      'locations/global/workforcePools/test-pool',
      mockConfig,
    );
    expect(result.current.idpProviders).toHaveLength(1);
  });

  /**
   * NEGATIVE CONTROL 4:
   * When IdP is changed and form is saved, `updateAclConfig` is called with the
   * location-level payload, NOT a PATCH to the nonexistent `.../engines/{id}/idpConfig`.
   */
  it('saves IdP changes via updateAclConfig instead of the nonexistent engine idpConfig endpoint', async () => {
    vi.mocked(api.getAclConfig).mockResolvedValue({
      name: 'projects/test-project/locations/global/aclConfig',
      idpConfig: { idpType: 'GSUITE' },
    });
    vi.mocked(api.updateAclConfig).mockResolvedValue({
      name: 'projects/test-project/locations/global/aclConfig',
      idpConfig: {
        idpType: 'THIRD_PARTY',
        externalIdpConfig: { workforcePoolName: 'locations/global/workforcePools/new-pool' },
      },
    });

    const { result } = renderHook(() =>
      useEngineDetailsForm({
        engine: mockEngine,
        config: mockConfig,
        onUpdateSuccess,
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoadingIdp).toBe(false);
    });

    // Change IdP settings
    act(() => {
      result.current.handleIdpChange({
        target: { name: 'idpType', value: 'THIRD_PARTY' },
      } as unknown as React.ChangeEvent<HTMLSelectElement>);
      result.current.handleIdpChange({
        target: {
          name: 'workforcePoolName',
          value: 'locations/global/workforcePools/new-pool',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    // Submit form
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} } as unknown as React.FormEvent);
    });

    // updateAclConfig must be called with the regional IdP config
    expect(api.updateAclConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        idpConfig: expect.objectContaining({
          idpType: 'THIRD_PARTY',
          externalIdpConfig: {
            workforcePoolName: 'locations/global/workforcePools/new-pool',
          },
        }),
      }),
      mockConfig,
    );

    // updateIdpConfig (the broken engine-level call) must NOT have been called
    expect(api.updateIdpConfig).not.toHaveBeenCalled();
  });
});
