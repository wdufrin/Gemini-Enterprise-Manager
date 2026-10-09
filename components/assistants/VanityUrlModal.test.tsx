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

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VanityUrlDeploymentForm } from './VanityUrlDeploymentForm';
import { ProvisionedRedirectList } from './vanity/ProvisionedRedirectList';
import * as api from '../../services/apiService';
import { AppEngine, Config } from '../../types';

vi.mock('../../services/apiService', () => ({
  getProject: vi.fn(),
  listGlobalForwardingRules: vi.fn(),
  listManagedSslCertificates: vi.fn(),
  listVpcNetworks: vi.fn(),
  listVpcSubnets: vi.fn(),
  listAggregatedForwardingRules: vi.fn(),
  listDnsZones: vi.fn(),
  deleteVanityUrl: vi.fn(),
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

describe('VanityUrlDeploymentForm & ProvisionedRedirectList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getProject).mockResolvedValue({
      projectId: 'glm-prod-project',
      projectNumber: '123456789012',
    });
  });

  it('renders VanityUrlDeploymentForm and surfaces vanity-discovery-warning when Compute Engine fails', async () => {
    vi.mocked(api.listGlobalForwardingRules).mockRejectedValue(
      new Error('403 PERMISSION_DENIED: compute.globalForwardingRules.list denied')
    );
    vi.mocked(api.listManagedSslCertificates).mockResolvedValue({ items: [] });
    vi.mocked(api.listVpcNetworks).mockResolvedValue({ items: [] });
    vi.mocked(api.listVpcSubnets).mockResolvedValue({ items: [] });

    render(
      <VanityUrlDeploymentForm
        engine={mockEngine}
        config={mockConfig}
        projectNumber="123456789012"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('vanity-discovery-warning')).toBeInTheDocument();
    });

    expect(screen.getByTestId('vanity-discovery-warning')).toHaveTextContent(
      /compute\.globalForwardingRules\.list denied/i
    );

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('vanity-discovery-warning')).not.toBeInTheDocument();
  });

  it('renders ProvisionedRedirectList and lists Global Forwarding Rules and SSL Certs', async () => {
    vi.mocked(api.listAggregatedForwardingRules).mockResolvedValue({
      items: {
        global: {
          forwardingRules: [
            {
              name: 'assistant-glm-assistant-fwd-rule',
              IPAddress: '34.120.55.10',
              target: 'projects/glm-prod-project/global/targetHttpsProxies/assistant-glm-assistant-https-proxy',
              creationTimestamp: '2026-04-15T12:00:00Z',
            },
          ],
        },
      },
    });
    vi.mocked(api.listManagedSslCertificates).mockResolvedValue({
      items: [
        {
          name: 'assistant-glm-assistant-cert',
          type: 'MANAGED',
          creationTimestamp: '2026-04-15T12:00:00Z',
          managed: {
            domains: ['assistant.glm.example.com'],
            status: 'ACTIVE',
          },
        },
      ],
    });
    vi.mocked(api.listDnsZones).mockResolvedValue({ managedZones: [] });

    render(
      <ProvisionedRedirectList
        engine={mockEngine}
        projectId="glm-prod-project"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('assistant.glm.example.com')).toBeInTheDocument();
      expect(screen.getByText('34.120.55.10')).toBeInTheDocument();
      expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    });
  });

  it('surfaces explicit alert in ProvisionedRedirectList when listAggregatedForwardingRules rejects', async () => {
    vi.mocked(api.listAggregatedForwardingRules).mockRejectedValue(
      new Error('403 PERMISSION_DENIED: Caller lacks compute.forwardingRules.aggregatedList')
    );
    vi.mocked(api.listManagedSslCertificates).mockResolvedValue({ items: [] });
    vi.mocked(api.listDnsZones).mockResolvedValue({ managedZones: [] });

    render(
      <ProvisionedRedirectList
        engine={mockEngine}
        projectId="glm-prod-project"
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /403 PERMISSION_DENIED: Caller lacks compute\.forwardingRules\.aggregatedList/i
      );
    });
  });
});
