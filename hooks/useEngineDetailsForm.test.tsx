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
import { setCachedProjectEnrollment, clearCachedProjectEnrollment } from '../services/api/project';

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

describe('useEngineDetailsForm hook — feature flags and custom flag management', () => {
  const mockEngine: AppEngine = {
    name: 'projects/test-project/locations/global/collections/default_collection/engines/cosmere-123',
    displayName: 'Cosmere Search',
    solutionType: 'SOLUTION_TYPE_SEARCH',
    features: {
      'custom-preexisting-flag': 'FEATURE_STATE_ON',
      'speech-to-text': 'FEATURE_STATE_ON',
    },
  };

  const mockConfig: Config = {
    projectId: 'test-project',
    appLocation: 'global',
    collectionId: 'default_collection',
    appId: 'cosmere-123',
  };

  const onUpdateSuccess = vi.fn();

  const mockWidget: WidgetConfig = {
    name: `${mockEngine.name}/widgetConfigs/default_search_widget_config`,
    displayName: 'default_search_widget_config',
    enableAutocomplete: true,
    enableSummarization: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listLicenseConfigs).mockResolvedValue({ licenseConfigs: [] });
    vi.mocked(api.getWidgetConfig).mockResolvedValue(mockWidget);
    vi.mocked(api.getAclConfig).mockResolvedValue({
      name: 'projects/test-project/locations/global/aclConfig',
      idpConfig: { idpType: 'GSUITE' },
    });
    vi.mocked(api.updateEngine).mockResolvedValue(mockEngine);
  });

  it('includes canonical flags and excludes duplicate/dead/invalid legacy keys from allDynamicFeatures', async () => {
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

    const featureKeys = result.current.allDynamicFeatures.map(f => f.key);
    expect(featureKeys).toContain('speech-to-text');
    expect(featureKeys).toContain('projects');
    expect(featureKeys).toContain('skill-sharing');
    expect(featureKeys).toContain('skill-sharing-without-admin-approval');
    expect(featureKeys).toContain('canvas-workspace');
    expect(featureKeys).toContain('canvas-app-builder');
    expect(featureKeys).toContain('single-agent-orchestration');
    expect(featureKeys).toContain('multi-agent-orchestration');
    expect(featureKeys).toContain('code-extraction');
    expect(featureKeys).toContain('remote-vm');
    expect(featureKeys).toContain('license-tier-badge');
    expect(featureKeys).toContain('agent-marketplace');
    expect(featureKeys).toContain('agent-scheduling');
    expect(featureKeys).toContain('preview-agents');
    expect(featureKeys).toContain('sobi');

    // Every catalog feature must have an explicit visibility tier ('GA' | 'PREVIEW' | 'INTERNAL')
    expect(result.current.allDynamicFeatures.find(f => f.key === 'agent-gallery')?.visibility).toBe('GA');
    expect(result.current.allDynamicFeatures.find(f => f.key === 'speech-to-text')?.visibility).toBe('PREVIEW');
    expect(result.current.allDynamicFeatures.find(f => f.key === 'sobi')?.visibility).toBe('INTERNAL');
    expect(result.current.allDynamicFeatures.find(f => f.key === 'preview-agents')?.visibility).toBe('INTERNAL');

    // Duplicate/dead/invalid keys must NOT appear in Feature Management
    expect(featureKeys).not.toContain('disable-projects');
    expect(featureKeys).not.toContain('disable-skills');
    expect(featureKeys).not.toContain('disable-canvas-workspace');
    expect(featureKeys).not.toContain('cross-domain-documents');
    expect(featureKeys).not.toContain('disable-mobile-app-access');
    expect(featureKeys).not.toContain('enable-qr-code-widget');

    // speech-to-text is initialized as true because it was in mockEngine.features,
    // and defaultOn features (code-extraction, license-tier-badge) default to true
    expect(result.current.features['speech-to-text']).toBe(true);
    expect(result.current.features['code-extraction']).toBe(true);
    expect(result.current.features['license-tier-badge']).toBe(true);
  });

  it('initializes canonical features from legacy disable-* keys without creating duplicate custom cards and synchronizes pairs on save', async () => {
    const engineWithLegacyFlags: AppEngine = {
      ...mockEngine,
      features: {
        'disable-projects': 'FEATURE_STATE_OFF',
        'disable-canvas-workspace': 'FEATURE_STATE_OFF',
        'disable-skills': 'FEATURE_STATE_ON',
        'cross-domain-documents': 'FEATURE_STATE_ON',
      },
    };

    const { result } = renderHook(() =>
      useEngineDetailsForm({
        engine: engineWithLegacyFlags,
        config: mockConfig,
        onUpdateSuccess,
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoadingIdp).toBe(false);
    });

    // Legacy disable-projects=OFF and disable-canvas-workspace=OFF initialize positive keys to true
    expect(result.current.features['projects']).toBe(true);
    expect(result.current.features['canvas-workspace']).toBe(true);
    expect(result.current.formData.includeCrossDomainDocuments).toBe(true);

    // None of the ignored legacy keys should appear as custom cards
    const customKeys = result.current.allDynamicFeatures.filter(f => f.isCustom).map(f => f.key);
    expect(customKeys).toEqual([]);

    // Toggle projects OFF and submit
    act(() => {
      result.current.handleFeatureChange('projects');
    });

    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} } as unknown as React.FormEvent);
    });

    // Both 'projects' and preexisting 'disable-projects' must be synchronized to non-conflicting states,
    // and obsolete keys ('disable-skills', 'disable-canvas-workspace', 'cross-domain-documents') must be removed
    const updateCall = vi.mocked(api.updateEngine).mock.calls[0];
    const submittedFeatures = updateCall[1].features as Record<string, string>;
    expect(submittedFeatures['projects']).toBe('FEATURE_STATE_OFF');
    expect(submittedFeatures['disable-projects']).toBe('FEATURE_STATE_ON');
    expect(submittedFeatures['canvas-workspace']).toBe('FEATURE_STATE_ON');
    expect(submittedFeatures['disable-canvas-workspace']).toBeUndefined();
    expect(submittedFeatures['disable-skills']).toBeUndefined();
    expect(submittedFeatures['cross-domain-documents']).toBeUndefined();
  });

  it('enforces one-way lock on Project Sobi (sobi) when already enabled on the engine', async () => {
    const sobiEnabledEngine: AppEngine = {
      ...mockEngine,
      features: {
        sobi: 'FEATURE_STATE_ON',
      },
    };

    const { result } = renderHook(() =>
      useEngineDetailsForm({
        engine: sobiEnabledEngine,
        config: mockConfig,
        onUpdateSuccess,
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoadingIdp).toBe(false);
    });

    expect(result.current.isSobiLocked).toBe(true);
    expect(result.current.features['sobi']).toBe(true);

    // Attempting to toggle sobi off must be rejected by the one-way lock guard
    act(() => {
      result.current.handleFeatureChange('sobi');
    });

    expect(result.current.features['sobi']).toBe(true);
  });

  it('persists includeCrossDomainDocuments as a top-level Engine field in updateMask', async () => {
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

    expect(result.current.formData.includeCrossDomainDocuments).toBe(false);

    act(() => {
      result.current.handleChange({
        target: { name: 'includeCrossDomainDocuments', type: 'checkbox', checked: true },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} } as unknown as React.FormEvent);
    });

    expect(api.updateEngine).toHaveBeenCalledWith(
      mockEngine.name,
      expect.objectContaining({
        includeCrossDomainDocuments: true,
      }),
      expect.arrayContaining(['includeCrossDomainDocuments']),
      mockConfig,
    );
  });

  it('populates preexisting custom flags from engine.features into allDynamicFeatures and features state', async () => {
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

    const customFeature = result.current.allDynamicFeatures.find(f => f.key === 'custom-preexisting-flag');
    expect(customFeature).toBeDefined();
    expect(customFeature?.isCustom).toBe(true);
    expect(result.current.features['custom-preexisting-flag']).toBe(true);
  });

  it('immediately renders a new feature card when handleAddCustomFeature is called and persists it on submit', async () => {
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

    // Initially, new custom flag is NOT in allDynamicFeatures
    expect(result.current.allDynamicFeatures.some(f => f.key === 'my-new-preview-flag')).toBe(false);

    // Add custom flag
    act(() => {
      result.current.handleAddCustomFeature('my-new-preview-flag');
    });

    // It MUST immediately appear in allDynamicFeatures so a card is rendered in the UI
    const addedFeature = result.current.allDynamicFeatures.find(f => f.key === 'my-new-preview-flag');
    expect(addedFeature).toBeDefined();
    expect(addedFeature?.isCustom).toBe(true);
    expect(result.current.features['my-new-preview-flag']).toBe(true);

    // When submitted, it MUST be serialized into payload.features and sent to updateEngine
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} } as unknown as React.FormEvent);
    });

    expect(api.updateEngine).toHaveBeenCalledWith(
      mockEngine.name,
      expect.objectContaining({
        features: expect.objectContaining({
          'my-new-preview-flag': 'FEATURE_STATE_ON',
        }),
      }),
      expect.arrayContaining(['features']),
      mockConfig,
    );
  });

  it('allows removing a custom feature and turns it FEATURE_STATE_OFF in payload on submit', async () => {
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

    expect(result.current.allDynamicFeatures.some(f => f.key === 'custom-preexisting-flag')).toBe(true);

    // Remove the custom flag
    act(() => {
      result.current.handleRemoveCustomFeature('custom-preexisting-flag');
    });

    expect(result.current.allDynamicFeatures.some(f => f.key === 'custom-preexisting-flag')).toBe(false);

    // Submit form
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} } as unknown as React.FormEvent);
    });

    expect(api.updateEngine).toHaveBeenCalledWith(
      mockEngine.name,
      expect.objectContaining({
        features: expect.objectContaining({
          'custom-preexisting-flag': 'FEATURE_STATE_OFF',
        }),
      }),
      expect.arrayContaining(['features']),
      mockConfig,
    );
  });

  it('immediately includes custom models in dynamicModels when handleAddCustomModel is called', async () => {
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

    act(() => {
      result.current.handleAddCustomModel('gemini-3.1-flash-lite');
    });

    const model = result.current.dynamicModels.find(m => m.id === 'gemini-3.1-flash-lite');
    expect(model).toBeDefined();
    expect(result.current.modelConfigs['gemini-3.1-flash-lite']).toBe(true);

    // Submit form
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} } as unknown as React.FormEvent);
    });

    expect(api.updateEngine).toHaveBeenCalledWith(
      mockEngine.name,
      expect.objectContaining({
        modelConfigs: expect.objectContaining({
          'gemini-3.1-flash-lite': 'MODEL_ENABLED',
        }),
      }),
      expect.arrayContaining(['modelConfigs']),
      mockConfig,
    );
  });
});

describe('useEngineDetailsForm hook — advanced GOOGLE_INTERNAL engine controls', () => {
  const mockEngine: AppEngine = {
    name: 'projects/adv-proj/locations/global/collections/default_collection/engines/adv-1',
    displayName: 'Adv',
    solutionType: 'SOLUTION_TYPE_SEARCH',
    globalFeatureToggleState: 'GENERAL',
    agentControlConfig: { personal: { creationEnabled: true }, coworker: { creationEnabled: false } },
  };
  const mockConfig: Config = { projectId: 'adv-proj', appLocation: 'global', collectionId: 'default_collection', appId: 'adv-1' };

  const seedEnrollment = (googleInternal: boolean) =>
    setCachedProjectEnrollment({
      projectId: 'adv-proj',
      checkedAt: new Date().toISOString(),
      googleInternal,
      trustedTester: false,
      notebookLmApiUser: false,
      agentRegistryEnabled: false,
      categories: [],
    });

  beforeEach(() => {
    vi.clearAllMocks();
    clearCachedProjectEnrollment();
    vi.mocked(api.listLicenseConfigs).mockResolvedValue({ licenseConfigs: [] });
    vi.mocked(api.getWidgetConfig).mockResolvedValue({ name: `${mockEngine.name}/widgetConfigs/w` } as WidgetConfig);
    vi.mocked(api.getAclConfig).mockResolvedValue({ name: 'acl', idpConfig: { idpType: 'GSUITE' } });
    vi.mocked(api.updateEngine).mockResolvedValue(mockEngine);
  });

  const render = async () => {
    const hook = renderHook(() => useEngineDetailsForm({ engine: mockEngine, config: mockConfig, onUpdateSuccess: vi.fn() }));
    await waitFor(() => expect(hook.result.current.isLoadingIdp).toBe(false));
    return hook;
  };

  const submit = async (result: { current: ReturnType<typeof useEngineDetailsForm> }) => {
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} } as unknown as React.FormEvent);
    });
  };

  it('loads existing control values from the engine', async () => {
    const { result } = await render();
    expect(result.current.engineControls.releaseChannel).toBe('GENERAL');
    expect(result.current.engineControls.coworkerCreationEnabled).toBe(false);
    expect(result.current.googleInternalEnrollment).toBeNull();
  });

  it('sends only the changed controls in the updateMask for an enrolled project', async () => {
    seedEnrollment(true);
    const { result } = await render();
    expect(result.current.googleInternalEnrollment).toBe(true);

    act(() => {
      result.current.handleEngineControlChange('releaseChannel', 'EARLY');
      result.current.handleEngineControlChange('digestFrequency', 'WEEKLY');
    });
    await submit(result);

    const [, payload, mask] = vi.mocked(api.updateEngine).mock.calls[0];
    expect(mask).toEqual(expect.arrayContaining(['globalFeatureToggleState', 'adminEmailNotificationsConfig']));
    expect(mask).not.toContain('agentControlConfig');
    expect(mask).not.toContain('agentCreationConfig');
    expect(mask).not.toContain('personalizationConfig');
    expect(payload.globalFeatureToggleState).toBe('EARLY');
    expect(payload.adminEmailNotificationsConfig).toEqual({ digestFrequency: 'WEEKLY' });
    expect(result.current.error).toBeNull();
  });

  it('fails loudly and performs no writes when the project is known NOT to be GOOGLE_INTERNAL', async () => {
    seedEnrollment(false);
    const { result } = await render();

    act(() => {
      result.current.handleEngineControlChange('coworkerCreationEnabled', true);
    });
    await submit(result);

    expect(api.updateEngine).not.toHaveBeenCalled();
    expect(api.updateAclConfig).not.toHaveBeenCalled();
    expect(api.updateWidgetConfig).not.toHaveBeenCalled();
    expect(result.current.error).toContain('not enrolled in GOOGLE_INTERNAL');
    expect(result.current.error).toContain('agentControlConfig');
    expect(result.current.success).toBeNull();
  });

  it('still saves public fields for a non-enrolled project when no GOOGLE_INTERNAL control changed', async () => {
    seedEnrollment(false);
    const { result } = await render();

    act(() => {
      result.current.handleChange({ target: { name: 'displayName', value: 'Renamed', type: 'text' } } as unknown as React.ChangeEvent<HTMLInputElement>);
    });
    await submit(result);

    const [, payload, mask] = vi.mocked(api.updateEngine).mock.calls[0];
    expect(mask).toContain('displayName');
    expect(payload.displayName).toBe('Renamed');
    expect(mask.some(f => ['agentControlConfig', 'globalFeatureToggleState'].includes(f))).toBe(false);
  });

  it('blocks save with a validation error for a malformed coworker principal', async () => {
    seedEnrollment(true);
    const { result } = await render();

    act(() => {
      result.current.handleEngineControlChange('coworkerAllowedPrincipals', 'alice@example.com');
    });
    expect(result.current.engineControlErrors.length).toBeGreaterThan(0);
    await submit(result);

    expect(api.updateEngine).not.toHaveBeenCalled();
    expect(result.current.error).toContain('Invalid coworker principal(s): alice@example.com');
  });
});


