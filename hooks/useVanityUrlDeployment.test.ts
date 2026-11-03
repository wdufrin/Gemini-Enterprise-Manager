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

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useVanityUrlDeployment } from './useVanityUrlDeployment';
import * as api from '../services/apiService';
import { AppEngine, Config } from '../types';

vi.mock('../services/apiService', () => ({
  getProject: vi.fn(),
  listGlobalForwardingRules: vi.fn(),
  listManagedSslCertificates: vi.fn(),
  listVpcNetworks: vi.fn(),
  listVpcSubnets: vi.fn(),
  getEngine: vi.fn(),
  getWidgetConfig: vi.fn(),
  updateWidgetConfig: vi.fn(),
  enableService: vi.fn(),
  getProjectIamPolicy: vi.fn(),
  setProjectIamPolicy: vi.fn(),
  createCloudBuild: vi.fn(),
}));

const mockEngine: AppEngine = {
  name: 'projects/123456789012/locations/global/collections/default_collection/engines/glm-assistant',
  displayName: 'GLM Enterprise Assistant',
  solutionType: 'SOLUTION_TYPE_CHAT',
};

const mockConfig: Config = {
  projectId: '123456789012',
  appLocation: 'global',
  collectionId: 'default_collection',
  appId: 'glm-assistant',
  assistantId: 'default_assistant',
};

describe('useVanityUrlDeployment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getProject).mockResolvedValue({
      projectId: 'glm-prod-project',
      projectNumber: '123456789012',
    });
    vi.mocked(api.getWidgetConfig).mockResolvedValue({
      name: `${mockEngine.name}/widgetConfigs/default_search_widget_config`,
    } as any);
    vi.mocked(api.getProjectIamPolicy).mockResolvedValue({
      bindings: [],
      etag: 'etag-1',
    } as any);
    vi.mocked(api.setProjectIamPolicy).mockResolvedValue({
      bindings: [],
      etag: 'etag-2',
    } as any);
  });

  it('discovers existing redirect domains and VPC networks/subnets', async () => {
    vi.mocked(api.listGlobalForwardingRules).mockResolvedValue({
      items: [
        {
          name: 'assistant-glm-assistant-fwd-rule',
          IPAddress: '34.120.1.10',
          target: 'projects/glm-prod-project/global/targetHttpsProxies/assistant-glm-assistant-https-proxy',
          creationTimestamp: '2026-04-15T12:00:00Z',
        },
      ],
    });
    vi.mocked(api.listManagedSslCertificates).mockResolvedValue({
      items: [
        {
          name: 'assistant-glm-assistant-cert',
          type: 'MANAGED',
          creationTimestamp: '2026-04-15T12:00:00Z',
          managed: { domains: ['assistant.glm.example.com'], status: 'ACTIVE' },
        },
      ],
    });
    vi.mocked(api.listVpcNetworks).mockResolvedValue({
      items: [{ name: 'default' }, { name: 'corp-vpc' }],
    });
    vi.mocked(api.listVpcSubnets).mockResolvedValue({
      items: [{ name: 'default', network: 'projects/glm-prod-project/global/networks/default' }],
    });

    const { result } = renderHook(() =>
      useVanityUrlDeployment(mockEngine, mockConfig, '123456789012')
    );

    await waitFor(() => {
      expect(result.current.existingDomains).toContain('assistant.glm.example.com');
      expect(result.current.networksList).toEqual(['default', 'corp-vpc']);
    });

    expect(result.current.discoveryWarnings).toEqual([]);
  });

  it('surfaces Compute Engine and VPC discovery errors in discoveryWarnings instead of swallowing them', async () => {
    vi.mocked(api.listGlobalForwardingRules).mockRejectedValue(
      new Error('403 PERMISSION_DENIED: compute.globalForwardingRules.list denied')
    );
    vi.mocked(api.listManagedSslCertificates).mockRejectedValue(
      new Error('403 PERMISSION_DENIED: compute.sslCertificates.list denied')
    );
    vi.mocked(api.listVpcNetworks).mockRejectedValue(
      new Error('403 PERMISSION_DENIED: compute.networks.list denied')
    );
    vi.mocked(api.listVpcSubnets).mockResolvedValue({ items: [] });

    const { result } = renderHook(() =>
      useVanityUrlDeployment(mockEngine, mockConfig, '123456789012')
    );

    await waitFor(() => {
      expect(result.current.discoveryWarnings.length).toBeGreaterThanOrEqual(3);
    });

    expect(result.current.discoveryWarnings.join(' ')).toContain(
      'compute.globalForwardingRules.list denied'
    );
    expect(result.current.discoveryWarnings.join(' ')).toContain(
      'compute.sslCertificates.list denied'
    );
    expect(result.current.discoveryWarnings.join(' ')).toContain(
      'compute.networks.list denied'
    );

    act(() => {
      result.current.clearDiscoveryWarnings();
    });
    expect(result.current.discoveryWarnings).toEqual([]);
  });

  it('resolves Portal CID from getWidgetConfig when Engine does not return widgetConfigConfigId', async () => {
    vi.mocked(api.listGlobalForwardingRules).mockResolvedValue({ items: [] });
    vi.mocked(api.listManagedSslCertificates).mockResolvedValue({ items: [] });
    vi.mocked(api.listVpcNetworks).mockResolvedValue({ items: [] });
    vi.mocked(api.listVpcSubnets).mockResolvedValue({ items: [] });
    vi.mocked(api.getWidgetConfig).mockResolvedValue({
      name: `${mockEngine.name}/widgetConfigs/default_search_widget_config`,
      configId: 'c2c50406-08aa-4e89-80a6-d498a3eb4a3c',
      accessSettings: { enableWebApp: true },
    });
    vi.mocked(api.createCloudBuild).mockResolvedValue({
      metadata: { build: { id: 'build-sobi-123' } },
    } as any);

    const { result } = renderHook(() =>
      useVanityUrlDeployment(mockEngine, mockConfig, '123456789012')
    );

    await waitFor(() => {
      expect(result.current.portalCid).toBe('c2c50406-08aa-4e89-80a6-d498a3eb4a3c');
    });

    act(() => {
      result.current.setCustomDomain('sobi.ge-dufrin.com');
      result.current.setAutomateDNS(true);
    });

    await act(async () => {
      await result.current.handleDeploy();
    });

    expect(result.current.error).toBeNull();
    expect(api.enableService).toHaveBeenCalledWith('glm-prod-project', 'dns.googleapis.com');
    expect(api.createCloudBuild).toHaveBeenCalledTimes(1);
    const buildPayload = vi.mocked(api.createCloudBuild).mock.calls[0][1] as any;
    expect(buildPayload.steps[0].args[1]).toContain(
      '/u/0/home/cid/c2c50406-08aa-4e89-80a6-d498a3eb4a3c'
    );
  });

  it('auto-initializes Web App via updateWidgetConfig when Portal CID is initially missing', async () => {
    vi.mocked(api.listGlobalForwardingRules).mockResolvedValue({ items: [] });
    vi.mocked(api.listManagedSslCertificates).mockResolvedValue({ items: [] });
    vi.mocked(api.listVpcNetworks).mockResolvedValue({ items: [] });
    vi.mocked(api.listVpcSubnets).mockResolvedValue({ items: [] });
    vi.mocked(api.getWidgetConfig).mockResolvedValue({
      name: `${mockEngine.name}/widgetConfigs/default_search_widget_config`,
      accessSettings: { enableWebApp: false },
    });
    vi.mocked(api.getEngine).mockResolvedValue({
      name: mockEngine.name,
    } as any);
    vi.mocked(api.updateWidgetConfig).mockResolvedValue({
      name: `${mockEngine.name}/widgetConfigs/default_search_widget_config`,
      configId: 'auto-init-cid-9876',
      accessSettings: { enableWebApp: true },
    });
    vi.mocked(api.createCloudBuild).mockResolvedValue({
      metadata: { build: { id: 'build-auto-init-1' } },
    } as any);

    const { result } = renderHook(() =>
      useVanityUrlDeployment(mockEngine, mockConfig, '123456789012')
    );

    act(() => {
      result.current.setCustomDomain('sobi.ge-dufrin.com');
    });

    await act(async () => {
      await result.current.handleDeploy();
    });

    expect(api.updateWidgetConfig).toHaveBeenCalledWith(
      mockEngine.name,
      { accessSettings: { enableWebApp: true } },
      ['accessSettings.enableWebApp'],
      mockConfig
    );
    expect(result.current.portalCid).toBe('auto-init-cid-9876');
    expect(api.createCloudBuild).toHaveBeenCalledTimes(1);
  });

  it('auto-grants Cloud Build & Compute Service Account roles and supports cross-project Cloud DNS host project', async () => {
    vi.mocked(api.listGlobalForwardingRules).mockResolvedValue({ items: [] });
    vi.mocked(api.listManagedSslCertificates).mockResolvedValue({ items: [] });
    vi.mocked(api.listVpcNetworks).mockResolvedValue({ items: [] });
    vi.mocked(api.listVpcSubnets).mockResolvedValue({ items: [] });
    vi.mocked(api.getWidgetConfig).mockResolvedValue({
      name: `${mockEngine.name}/widgetConfigs/default_search_widget_config`,
      configId: '6523891b-9d15-4904-bc9c-d550bd91b9d5',
      accessSettings: { enableWebApp: true },
    });
    vi.mocked(api.createCloudBuild).mockResolvedValue({
      metadata: { build: { id: 'build-cross-dns-1' } },
    } as any);

    const { result } = renderHook(() =>
      useVanityUrlDeployment(mockEngine, mockConfig, '123456789012')
    );

    await waitFor(() => {
      expect(result.current.missingBuildSaRoles).toContain('roles/compute.loadBalancerAdmin');
      expect(result.current.missingBuildSaRoles).toContain('roles/compute.networkAdmin');
    });

    act(() => {
      result.current.setCustomDomain('sobi.ge-dufrin.com');
      result.current.setAutomateDNS(true);
      result.current.setDnsProjectId('ge-dufrin-dns-host');
    });

    await act(async () => {
      await result.current.handleDeploy();
    });

    expect(result.current.error).toBeNull();
    // Should enable dns.googleapis.com on the cross-project DNS host project
    expect(api.enableService).toHaveBeenCalledWith('ge-dufrin-dns-host', 'dns.googleapis.com');
    // Should grant compute roles on glm-prod-project AND roles/dns.admin on ge-dufrin-dns-host
    expect(api.setProjectIamPolicy).toHaveBeenCalledWith(
      'glm-prod-project',
      expect.objectContaining({
        bindings: expect.arrayContaining([
          expect.objectContaining({
            role: 'roles/compute.loadBalancerAdmin',
            members: expect.arrayContaining([
              'serviceAccount:123456789012@cloudbuild.gserviceaccount.com',
              'serviceAccount:123456789012-compute@developer.gserviceaccount.com',
            ]),
          }),
          expect.objectContaining({
            role: 'roles/compute.networkAdmin',
            members: expect.arrayContaining([
              'serviceAccount:123456789012@cloudbuild.gserviceaccount.com',
              'serviceAccount:123456789012-compute@developer.gserviceaccount.com',
            ]),
          }),
        ]),
      })
    );
    expect(api.setProjectIamPolicy).toHaveBeenCalledWith(
      'ge-dufrin-dns-host',
      expect.objectContaining({
        bindings: expect.arrayContaining([
          expect.objectContaining({
            role: 'roles/dns.admin',
            members: expect.arrayContaining([
              'serviceAccount:123456789012@cloudbuild.gserviceaccount.com',
              'serviceAccount:123456789012-compute@developer.gserviceaccount.com',
            ]),
          }),
        ]),
      })
    );

    const buildPayload = vi.mocked(api.createCloudBuild).mock.calls[0][1] as any;
    expect(buildPayload.steps[0].args[1]).toContain('--project=ge-dufrin-dns-host');
  });

  it('rejects hostile shell metacharacters in dnsProjectId before triggering Cloud Build', async () => {
    vi.mocked(api.listGlobalForwardingRules).mockResolvedValue({ items: [] });
    vi.mocked(api.listManagedSslCertificates).mockResolvedValue({ items: [] });
    vi.mocked(api.listVpcNetworks).mockResolvedValue({ items: [] });
    vi.mocked(api.listVpcSubnets).mockResolvedValue({ items: [] });
    vi.mocked(api.getWidgetConfig).mockResolvedValue({
      name: `${mockEngine.name}/widgetConfigs/default_search_widget_config`,
      configId: '6523891b-9d15-4904-bc9c-d550bd91b9d5',
      accessSettings: { enableWebApp: true },
    });

    const { result } = renderHook(() =>
      useVanityUrlDeployment(mockEngine, mockConfig, '123456789012')
    );

    await waitFor(() => {
      expect(result.current.portalCid).toBe('6523891b-9d15-4904-bc9c-d550bd91b9d5');
    });

    act(() => {
      result.current.setCustomDomain('sobi.ge-dufrin.com');
      result.current.setAutomateDNS(true);
      result.current.setDnsProjectId('bad-proj; rm -rf /');
    });

    expect(result.current.isDnsProjectIdValid).toBe(false);

    await act(async () => {
      await result.current.handleDeploy();
    });

    expect(result.current.error).toMatch(/Cloud DNS Project ID/i);
    expect(api.createCloudBuild).not.toHaveBeenCalled();
  });

  it('extracts CID from pasted full Vertex AI Search URL and rejects hostile shell characters in portalCid', async () => {
    vi.mocked(api.listGlobalForwardingRules).mockResolvedValue({ items: [] });
    vi.mocked(api.listManagedSslCertificates).mockResolvedValue({ items: [] });
    vi.mocked(api.listVpcNetworks).mockResolvedValue({ items: [] });
    vi.mocked(api.listVpcSubnets).mockResolvedValue({ items: [] });

    const { result } = renderHook(() =>
      useVanityUrlDeployment(mockEngine, mockConfig, '123456789012')
    );

    act(() => {
      result.current.setPortalCid(
        'https://vertexaisearch.cloud.google.com/u/0/home/cid/a1b2c3d4-e5f6-7890?hl=en'
      );
    });
    expect(result.current.portalCid).toBe('a1b2c3d4-e5f6-7890');

    // Now inject hostile shell payload into portalCid and verify handleDeploy blocks it
    act(() => {
      result.current.setPortalCid('bad$(whoami)');
      result.current.setCustomDomain('sobi.ge-dufrin.com');
    });

    await act(async () => {
      await result.current.handleDeploy();
    });

    expect(result.current.error).toMatch(/Portal widget config ID/i);
    expect(api.createCloudBuild).not.toHaveBeenCalled();
  });

  it('rejects hostile shell metacharacters in customDomain during handleDeploy', async () => {
    vi.mocked(api.listGlobalForwardingRules).mockResolvedValue({ items: [] });
    vi.mocked(api.listManagedSslCertificates).mockResolvedValue({ items: [] });
    vi.mocked(api.listVpcNetworks).mockResolvedValue({ items: [] });
    vi.mocked(api.listVpcSubnets).mockResolvedValue({ items: [] });
    vi.mocked(api.getEngine).mockResolvedValue({
      widgetConfigConfigId: 'valid-cid-1234',
    } as any);

    const { result } = renderHook(() =>
      useVanityUrlDeployment(mockEngine, mockConfig, '123456789012')
    );

    act(() => {
      result.current.setCustomDomain('evil.example.com; rm -rf /');
    });

    expect(result.current.isCustomDomainValid).toBe(false);

    await act(async () => {
      await result.current.handleDeploy();
    });

    expect(result.current.error).toMatch(/Custom domain/i);
    expect(api.createCloudBuild).not.toHaveBeenCalled();
  });
});
