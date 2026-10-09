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
