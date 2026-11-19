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

import React from 'react';
import { fireEvent, render, renderHook, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEngineDetailsForm } from './useEngineDetailsForm';
import { AppEngine, Config, WidgetConfig, WorkloadIdentityProvider } from '../types';
import * as api from '../services/apiService';
import { setCachedProjectEnrollment, clearCachedProjectEnrollment } from '../services/api/project';
import { ModelConfigurationSection } from '../components/assistants/engine-details/ModelConfigurationSection';
import { SearchEngineConfigSection } from '../components/assistants/engine-details/SearchEngineConfigSection';
import { WebAppUiSettingsSection } from '../components/assistants/engine-details/WebAppUiSettingsSection';
import { AdvancedEngineControlsSection } from '../components/assistants/engine-details/AdvancedEngineControlsSection';
import { engineToControlsState } from '../components/assistants/engine-details/engineControls';

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
    expect(featureKeys).toContain('skill-security-scan');
    expect(featureKeys).toContain('plugins');
    expect(featureKeys).toContain('canvas-workspace');
    expect(featureKeys).toContain('canvas-app-builder');
    expect(featureKeys).toContain('canvas-app-sharing');
    expect(featureKeys).toContain('single-agent-orchestration');
    expect(featureKeys).toContain('multi-agent-orchestration');
    expect(featureKeys).toContain('code-extraction');
    expect(featureKeys).toContain('remote-vm');
    expect(featureKeys).toContain('license-tier-badge');
    expect(featureKeys).toContain('in-app-notifications');
    expect(featureKeys).toContain('agent-marketplace');
    expect(featureKeys).toContain('agent-scheduling');
    expect(featureKeys).toContain('preview-agents');
    expect(featureKeys).toContain('music-generation');
    expect(featureKeys).toContain('speech-generation');
    expect(featureKeys).toContain('mcp-apps');
    expect(featureKeys).toContain('sobi');

    // Every catalog feature must have an explicit, accurate visibility tier ('GA' | 'PREVIEW' | 'INTERNAL')
    expect(result.current.allDynamicFeatures.find(f => f.key === 'agent-gallery')?.visibility).toBe('GA');
    expect(result.current.allDynamicFeatures.find(f => f.key === 'speech-to-text')?.visibility).toBe('GA');
    expect(result.current.allDynamicFeatures.find(f => f.key === 'license-tier-badge')?.visibility).toBe('GA');
    expect(result.current.allDynamicFeatures.find(f => f.key === 'in-app-notifications')?.visibility).toBe('GA');
    expect(result.current.allDynamicFeatures.find(f => f.key === 'canvas-app-builder')?.visibility).toBe('GA');
    expect(result.current.allDynamicFeatures.find(f => f.key === 'canvas-app-sharing')?.visibility).toBe('PREVIEW');
    expect(result.current.allDynamicFeatures.find(f => f.key === 'preview-agents')?.visibility).toBe('PREVIEW');
    expect(result.current.allDynamicFeatures.find(f => f.key === 'agent-marketplace')?.visibility).toBe('PREVIEW');
    expect(result.current.allDynamicFeatures.find(f => f.key === 'agent-scheduling')?.visibility).toBe('PREVIEW');
    expect(result.current.allDynamicFeatures.find(f => f.key === 'skill-security-scan')?.visibility).toBe('PREVIEW');
    expect(result.current.allDynamicFeatures.find(f => f.key === 'mcp-apps')?.visibility).toBe('INTERNAL');
    expect(result.current.allDynamicFeatures.find(f => f.key === 'canvas-workspace')?.visibility).toBe('INTERNAL');
    expect(result.current.allDynamicFeatures.find(f => f.key === 'personalization-suggested-highlights')?.visibility).toBe('INTERNAL');
    expect(result.current.allDynamicFeatures.find(f => f.key === 'single-agent-orchestration')?.visibility).toBe('INTERNAL');
    expect(result.current.allDynamicFeatures.find(f => f.key === 'multi-agent-orchestration')?.visibility).toBe('INTERNAL');
    expect(result.current.allDynamicFeatures.find(f => f.key === 'sobi')?.visibility).toBe('INTERNAL');

    // Duplicate/dead/invalid keys must NOT appear in Feature Management
    expect(featureKeys).not.toContain('disable-projects');
    expect(featureKeys).not.toContain('disable-skills');
    expect(featureKeys).not.toContain('disable-canvas-workspace');
    expect(featureKeys).not.toContain('cross-domain-documents');
    expect(featureKeys).not.toContain('disable-mobile-app-access');
    expect(featureKeys).not.toContain('enable-qr-code-widget');

    // speech-to-text is initialized as true because it was in mockEngine.features,
    // and defaultOn features default to true
    expect(result.current.features['speech-to-text']).toBe(true);
    expect(result.current.features['code-extraction']).toBe(true);
    expect(result.current.features['license-tier-badge']).toBe(true);
    expect(result.current.features['in-app-notifications']).toBe(true);
    expect(result.current.features['skill-security-scan']).toBe(true);
  });

  it('keeps GA image fallbacks active while isolating superseded -image-preview endpoints in legacyModels', async () => {
    const engineWithLegacyImageKeys: AppEngine = {
      ...mockEngine,
      modelConfigs: {
        'gemini-3-pro-image-preview': 'MODEL_ENABLED',
        'gemini-3.1-flash-image-preview': 'MODEL_ENABLED',
        'gemini-2.5-flash-image': 'MODEL_ENABLED',
        'gemini-4-carbon': 'MODEL_ENABLED',
      },
    };

    const { result } = renderHook(() =>
      useEngineDetailsForm({
        engine: engineWithLegacyImageKeys,
        config: mockConfig,
        onUpdateSuccess,
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoadingIdp).toBe(false);
    });

    const activeIds = result.current.dynamicModels.map(m => m.id);
    const legacyIds = result.current.legacyModels.map(m => m.id);

    expect(activeIds).toContain('gemini-4-carbon');
    expect(activeIds).toContain('claude-opus-5-5');
    expect(activeIds).toContain('claude-sonnet-5-5');
    expect(activeIds).toContain('gemini-3-pro-image');
    expect(activeIds).toContain('gemini-3.1-flash-image');
    expect(activeIds).toContain('gemini-2.5-flash-image');

    expect(activeIds).not.toContain('gemini-3-pro-image-preview');
    expect(activeIds).not.toContain('gemini-3.1-flash-image-preview');
    expect(legacyIds).toContain('gemini-3-pro-image-preview');
    expect(legacyIds).toContain('gemini-3.1-flash-image-preview');
    expect(legacyIds).not.toContain('gemini-2.5-flash-image');

    act(() => {
      result.current.setShowLegacyModels(true);
    });
    expect(result.current.dynamicModels.map(m => m.id)).toContain('gemini-3-pro-image-preview');
    expect(result.current.dynamicModels.map(m => m.id)).toContain('gemini-3.1-flash-image-preview');
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

  it('allows non-enrolled projects to save public globalFeatureToggleState and featurePolicies, while rejecting malformed policy members', async () => {
    seedEnrollment(false);
    const { result } = await render();

    // First test negative validation on malformed featurePolicies member
    act(() => {
      result.current.handleFeaturePolicyChange('canvas', {
        defaultAccess: 'DENY',
        allowedMembers: 'not-a-valid-member',
      });
    });
    expect(result.current.engineControlErrors.some(e => e.includes('Invalid allowed member(s) for canvas'))).toBe(true);
    await submit(result);
    expect(api.updateEngine).not.toHaveBeenCalled();
    expect(result.current.error).toContain('Invalid allowed member(s) for canvas');

    // Now fix member syntax and set releaseChannel on non-enrolled project
    act(() => {
      result.current.handleEngineControlChange('releaseChannel', 'SCHEDULED');
      result.current.handleFeaturePolicyChange('canvas', {
        defaultAccess: 'DENY',
        allowedMembers: 'USER:alice@example.com, group:designers@example.com',
        deniedMembers: 'user:contractor@example.com',
      });
    });
    expect(result.current.engineControlErrors).toEqual([]);
    await submit(result);

    expect(api.updateEngine).toHaveBeenCalledTimes(1);
    const [, rawPayload, mask] = vi.mocked(api.updateEngine).mock.calls[0];
    const payload = rawPayload as Partial<AppEngine>;
    expect(mask).toEqual(expect.arrayContaining(['globalFeatureToggleState', 'featurePolicies']));
    expect(payload.globalFeatureToggleState).toBe('SCHEDULED');
    expect(payload.featurePolicies?.canvas).toEqual({
      defaultAccess: 'DENY',
      allowedMembers: [
        { type: 'USER', id: 'alice@example.com' },
        { type: 'GROUP', id: 'designers@example.com' },
      ],
      deniedMembers: [{ type: 'USER', id: 'contractor@example.com' }],
    });
    expect(result.current.error).toBeNull();
  });
});

describe('useEngineDetailsForm hook — P0/P1 bug fixes, mutual exclusivity, gateway/procurement, and UI settings', () => {
  const freshEngine: AppEngine = {
    name: 'projects/test-project/locations/ca/collections/default_collection/engines/fresh-1',
    displayName: 'Fresh Enterprise App',
    solutionType: 'SOLUTION_TYPE_SEARCH',
    features: {},
  };

  const mockConfig: Config = {
    projectId: 'test-project',
    appLocation: 'ca',
    collectionId: 'default_collection',
    appId: 'fresh-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    clearCachedProjectEnrollment();
    vi.mocked(api.listLicenseConfigs).mockResolvedValue({ licenseConfigs: [] });
    vi.mocked(api.getWidgetConfig).mockResolvedValue({
      name: `${freshEngine.name}/widgetConfigs/default_search_widget_config`,
      accessSettings: { enableWebApp: true },
      uiSettings: {
        enableAutocomplete: true,
        modelConfigInfo: {
          resolvedModels: [
            {
              modelId: 'gemini-3.5-flash',
              displayName: 'Gemini 3.5 Flash',
              adminView: { enabledByDefault: true, adminOverridable: false, regions: ['ca'] },
            },
          ],
        },
      },
    });
    vi.mocked(api.getAclConfig).mockResolvedValue({
      name: 'projects/test-project/locations/ca/aclConfig',
      idpConfig: { idpType: 'GSUITE' },
    });
    vi.mocked(api.updateEngine).mockResolvedValue(freshEngine);
    vi.mocked(api.updateWidgetConfig).mockImplementation(async (_name, payload) => ({
      name: `${freshEngine.name}/widgetConfigs/default_search_widget_config`,
      ...(payload as Partial<WidgetConfig>),
    }));
  });

  it('Bug 1 & canvas-app-sharing guard: initializes disable-canvas to false via defaultOn on empty engine and does NOT cascade-mutate canvas-app-sharing', async () => {
    const { result } = renderHook(() =>
      useEngineDetailsForm({
        engine: freshEngine,
        config: mockConfig,
        onUpdateSuccess: vi.fn(),
      }),
    );
    await waitFor(() => expect(result.current.isLoadingIdp).toBe(false));

    // Bug 1 fix: disable-canvas has defaultOn: false, while other inverted keys have defaultOn: true
    expect(result.current.features['disable-canvas']).toBe(false);
    expect(result.current.features['disable-agent-sharing']).toBe(true);
    expect(result.current.features['disable-image-generation']).toBe(true);
    expect(result.current.features['disable-video-generation']).toBe(true);
    expect(result.current.features['canvas-app-sharing']).toBe(true);

    // Enable disable-canvas, then toggle it OFF again — canvas-app-sharing must remain untouched (true)
    act(() => {
      result.current.handleFeatureChange('disable-canvas');
    });
    expect(result.current.features['disable-canvas']).toBe(true);
    act(() => {
      result.current.handleFeatureChange('disable-canvas');
    });
    expect(result.current.features['disable-canvas']).toBe(false);
    expect(result.current.features['canvas-app-sharing']).toBe(true);
  });

  it('Bug 2 fix: enabling positive-keyed legacy feature (projects) on a fresh engine ALWAYS writes disable-projects=FEATURE_STATE_OFF', async () => {
    const { result } = renderHook(() =>
      useEngineDetailsForm({
        engine: freshEngine,
        config: mockConfig,
        onUpdateSuccess: vi.fn(),
      }),
    );
    await waitFor(() => expect(result.current.isLoadingIdp).toBe(false));

    expect(result.current.features['projects']).toBe(false);

    act(() => {
      result.current.handleFeatureChange('projects');
    });
    expect(result.current.features['projects']).toBe(true);

    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} } as unknown as React.FormEvent);
    });

    const [, payload, mask] = vi.mocked(api.updateEngine).mock.calls[0];
    expect(mask).toContain('features');
    const submitted = payload.features as Record<string, string>;
    expect(submitted['projects']).toBe('FEATURE_STATE_ON');
    expect(submitted['disable-projects']).toBe('FEATURE_STATE_OFF');
    expect(submitted['single-agent-orchestration']).toBe('FEATURE_STATE_OFF');
    expect(submitted['disable-single-agent-orchestration']).toBe('FEATURE_STATE_ON');
    expect(submitted['multi-agent-orchestration']).toBe('FEATURE_STATE_OFF');
    expect(submitted['disable-multi-agent-orchestration']).toBe('FEATURE_STATE_ON');
  });

  it('enforces single-select mutual exclusivity across Vision & Image models while allowing toggle-off, and blocks adminOverridable=false', async () => {
    const { result } = renderHook(() =>
      useEngineDetailsForm({
        engine: freshEngine,
        config: mockConfig,
        onUpdateSuccess: vi.fn(),
      }),
    );
    await waitFor(() => expect(result.current.isLoadingIdp).toBe(false));

    // Enable gemini-3.1-flash-image
    act(() => {
      result.current.handleModelChange('gemini-3.1-flash-image');
    });
    expect(result.current.modelConfigs['gemini-3.1-flash-image']).toBe(true);
    expect(result.current.modelConfigs['gemini-3-pro-image']).toBe(false);
    expect(result.current.modelConfigs['gemini-2.5-flash-image']).toBe(false);

    // Enable gemini-3-pro-image -> automatically disables gemini-3.1-flash-image
    act(() => {
      result.current.handleModelChange('gemini-3-pro-image');
    });
    expect(result.current.modelConfigs['gemini-3-pro-image']).toBe(true);
    expect(result.current.modelConfigs['gemini-3.1-flash-image']).toBe(false);
    expect(result.current.modelConfigs['gemini-2.5-flash-image']).toBe(false);

    // Toggling the active image model again turns it off cleanly
    act(() => {
      result.current.handleModelChange('gemini-3-pro-image');
    });
    expect(result.current.modelConfigs['gemini-3-pro-image']).toBe(false);

    // Attempting to toggle a model with adminOverridable=false must be a no-op
    expect(result.current.modelConfigs['gemini-3.5-flash']).toBe(true);
    act(() => {
      result.current.handleModelChange('gemini-3.5-flash');
    });
    expect(result.current.modelConfigs['gemini-3.5-flash']).toBe(true);
  });

  it('validates and patches procurementContactEmails, agentGatewaySetting, and WidgetConfig.uiSettings checkboxes', async () => {
    const { result } = renderHook(() =>
      useEngineDetailsForm({
        engine: freshEngine,
        config: mockConfig,
        onUpdateSuccess: vi.fn(),
      }),
    );
    await waitFor(() => expect(result.current.isLoadingIdp).toBe(false));

    // Negative test 1: malformed procurement email blocks save
    act(() => {
      result.current.handleChange({
        target: { name: 'procurementContactEmails', value: 'valid@example.com, not-an-email', type: 'text' },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} } as unknown as React.FormEvent);
    });
    expect(api.updateEngine).not.toHaveBeenCalled();
    expect(result.current.error).toContain('Invalid procurement contact email(s): not-an-email');

    // Negative test 2: malformed Agent Gateway resource blocks save
    act(() => {
      result.current.handleChange({
        target: { name: 'procurementContactEmails', value: 'valid@example.com, ops@example.com', type: 'text' },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
      result.current.handleChange({
        target: { name: 'defaultEgressAgentGateway', value: 'https://invalid-gateway-url', type: 'text' },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} } as unknown as React.FormEvent);
    });
    expect(api.updateEngine).not.toHaveBeenCalled();
    expect(result.current.error).toContain('Invalid Egress Agent Gateway resource name');

    // Positive save with valid procurement emails, valid Agent Gateway, and all 3 new uiSettings checkboxes
    act(() => {
      result.current.handleChange({
        target: {
          name: 'defaultEgressAgentGateway',
          value: 'projects/test-project/locations/us-central1/agentGateways/corp-egress-1',
          type: 'text',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
      result.current.handleChange({
        target: { name: 'sourceAdminDisplayNameEnabled', checked: true, type: 'checkbox' },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
      result.current.handleChange({
        target: { name: 'enablePeopleSearch', checked: true, type: 'checkbox' },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
      result.current.handleChange({
        target: { name: 'disableUserEventsCollection', checked: true, type: 'checkbox' },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} } as unknown as React.FormEvent);
    });

    expect(result.current.error).toBeNull();
    expect(api.updateEngine).toHaveBeenCalledWith(
      freshEngine.name,
      expect.objectContaining({
        procurementContactEmails: ['valid@example.com', 'ops@example.com'],
        agentGatewaySetting: {
          defaultEgressAgentGateway: {
            name: 'projects/test-project/locations/us-central1/agentGateways/corp-egress-1',
          },
        },
      }),
      expect.arrayContaining(['procurementContactEmails', 'agentGatewaySetting']),
      mockConfig,
    );

    expect(api.updateWidgetConfig).toHaveBeenCalledWith(
      freshEngine.name,
      expect.objectContaining({
        uiSettings: expect.objectContaining({
          sourceAdminDisplayNameEnabled: true,
          enablePeopleSearch: true,
          disableUserEventsCollection: true,
        }),
      }),
      expect.arrayContaining(['uiSettings']),
      mockConfig,
    );
  });

  it('evaluates isSubscriptionTierActive accurately for ENTERPRISE_EMERGING and EDU* tiers', async () => {
    vi.mocked(api.listLicenseConfigs).mockResolvedValue({
      licenseConfigs: [
        {
          name: 'projects/test-project/locations/global/licenseConfigs/sku-enterprise-emerging',
          displayName: 'Gemini Enterprise Emerging Markets',
          state: 'ACTIVE',
        },
        {
          name: 'projects/test-project/locations/global/licenseConfigs/sku-edu-pro',
          displayName: 'Gemini Education Plus',
          state: 'ACTIVE',
          subscriptionTier: 'SUBSCRIPTION_TIER_EDU_PRO',
        },
        {
          name: 'projects/test-project/locations/global/licenseConfigs/sku-edu-gov-emerging',
          displayName: 'Gemini Education Gov Emerging',
          state: 'ACTIVE',
        },
      ],
    });

    const { result } = renderHook(() =>
      useEngineDetailsForm({
        engine: freshEngine,
        config: mockConfig,
        onUpdateSuccess: vi.fn(),
      }),
    );
    await waitFor(() => expect(result.current.projectLicenseConfigs).toHaveLength(3));

    expect(result.current.isSubscriptionTierActive('SUBSCRIPTION_TIER_ENTERPRISE_EMERGING')).toBe(true);
    expect(result.current.isSubscriptionTierActive('SUBSCRIPTION_TIER_ENTERPRISE')).toBe(false);
    expect(result.current.isSubscriptionTierActive('SUBSCRIPTION_TIER_EDU_PRO')).toBe(true);
    expect(result.current.isSubscriptionTierActive('SUBSCRIPTION_TIER_EDU_GOV_EMERGING')).toBe(true);
    expect(result.current.isSubscriptionTierActive('SUBSCRIPTION_TIER_EDU')).toBe(false);
  });
});

describe('Engine section UI components — regional gcp.resourceLocations warnings and subscription tier labels', () => {
  it('renders regional gcp.resourceLocations warning badge when model is unsupported in appLocation and disables adminOverridable=false', () => {
    render(
      <ModelConfigurationSection
        modelConfigs={{ 'gemini-4-neon': false, 'gemini-3.8-flash': true }}
        onModelChange={vi.fn()}
        onAddCustomModel={vi.fn()}
        dynamicModels={[
          {
            id: 'gemini-4-neon',
            displayName: 'Gemini 4 Neon',
            description: 'Frontier reasoning model.',
            isPreview: false,
            category: 'Pro / Reasoning',
            visibility: 'GA',
          },
          {
            id: 'gemini-3.8-flash',
            displayName: 'Gemini 3.8 Flash',
            description: 'Fast model.',
            isPreview: false,
            category: 'Flash / Speed',
            visibility: 'GA',
            adminOverridable: false,
          },
        ]}
        legacyModels={[]}
        showLegacyModels={false}
        onToggleShowLegacyModels={vi.fn()}
        appLocation="ca"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Model Configuration/i }));

    // gemini-4-neon is only in global/us/eu -> must show regional warning in ca
    expect(screen.getByText(/Not in ca \(gcp\.resourceLocations\)/i)).toBeTruthy();
    // gemini-3.8-flash IS supported in ca, and has adminOverridable=false -> Locked badge + disabled checkbox
    expect(screen.getByText('Locked (Not Overridable)')).toBeTruthy();
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes[0].disabled).toBe(false);
    expect(checkboxes[1].disabled).toBe(true);
  });

  it('renders corrected Gemini Enterprise Plus / Standard labels and all GA Emerging/EDU options in SearchEngineConfigSection', () => {
    render(
      <SearchEngineConfigSection
        searchTier="SEARCH_TIER_ENTERPRISE"
        requiredSubscriptionTier="SUBSCRIPTION_TIER_SEARCH_AND_ASSISTANT"
        searchAddOnLlm={true}
        onChange={vi.fn()}
        projectLicenseConfigs={[]}
        isSubscriptionTierActive={() => true}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Search Engine Configuration/i }));

    expect(screen.getByRole('option', { name: 'Gemini Enterprise Plus (Search & Assistant) Tier' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Gemini Enterprise Standard Tier' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Gemini Enterprise Standard (Emerging Markets) Tier' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Gemini Education Standard Tier' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Gemini Education Plus (Pro) Tier' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Gemini Education Standard (Emerging Markets) Tier' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Gemini Education Plus (Emerging Markets) Tier' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Gemini Education Gov (Emerging Markets) Tier' })).toBeTruthy();
  });

  it('renders P1 WebAppUiSettingsSection checkboxes and keeps Release Channel & featurePolicies editable when googleInternal=false', () => {
    const onUiChange = vi.fn();
    render(
      <WebAppUiSettingsSection
        enableWebApp={true}
        enableAutocomplete={true}
        enableQualityFeedback={true}
        sourceAdminDisplayNameEnabled={true}
        enablePeopleSearch={false}
        disableUserEventsCollection={false}
        onChange={onUiChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Gemini Web App UI Settings/i }));
    expect(screen.getByLabelText(/Show Admin-Configured Source Display Names/i)).toBeTruthy();
    expect(screen.getByLabelText(/Enable People & Directory Search in Web App/i)).toBeTruthy();
    expect(screen.getByLabelText(/Disable User Events Collection/i)).toBeTruthy();

    const controls = engineToControlsState({
      name: 'projects/p/locations/global/collections/default_collection/engines/e1',
      displayName: 'E1',
    });
    const onFeaturePolicyChange = vi.fn();
    render(
      <AdvancedEngineControlsSection
        controls={controls}
        errors={[]}
        googleInternalEnrollment={false}
        onChange={vi.fn()}
        onFeaturePolicyChange={onFeaturePolicyChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Advanced Engine & Governance Controls/i }));

    // Release channel and per-feature RBAC controls remain enabled even when googleInternalEnrollment === false
    const releaseSelect = screen.getByLabelText(/Release Channel/i) as HTMLSelectElement;
    expect(releaseSelect.disabled).toBe(false);

    // Internal-only controls remain disabled when googleInternalEnrollment === false
    const maxUserInput = screen.getByLabelText(/Max agents per user/i) as HTMLInputElement;
    expect(maxUserInput.disabled).toBe(true);

    // All 4 policy-capable features are rendered and interactive
    expect(screen.getByText('no-code-agent-builder')).toBeTruthy();
    expect(screen.getByText('canvas')).toBeTruthy();
    expect(screen.getByText('skills')).toBeTruthy();
    expect(screen.getByText('workflow-agents')).toBeTruthy();
  });
});



