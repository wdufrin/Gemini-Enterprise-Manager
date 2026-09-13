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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ProvisionedRedirectList, { matchesEngine } from './ProvisionedRedirectList';
import * as api from '../../../services/apiService';
import { AppEngine } from '../../../types';

vi.mock('../../../services/apiService', () => ({
  listAggregatedForwardingRules: vi.fn(),
  listManagedSslCertificates: vi.fn(),
  listDnsZones: vi.fn(),
  deleteVanityUrl: vi.fn(),
}));

const engine: AppEngine = {
  name: 'projects/123/locations/global/collections/default_collection/engines/test-engine',
  displayName: 'Test Engine',
};

const aggregatedRules = {
  items: {
    global: {
      forwardingRules: [
        {
          name: 'assistant-test-engine-fwd-rule',
          IPAddress: '34.1.2.3',
          target: 'projects/p/global/targetHttpsProxies/assistant-test-engine-https-proxy',
          creationTimestamp: '2024-05-01T00:00:00Z',
        },
        {
          name: 'assistant-other-engine-fwd-rule',
          IPAddress: '34.9.9.9',
          target: 'projects/p/global/targetHttpsProxies/assistant-other-engine-https-proxy',
          creationTimestamp: '2024-04-01T00:00:00Z',
        },
      ],
    },
  },
};

describe('matchesEngine', () => {
  const engineName = 'projects/p/locations/global/collections/c/engines/test-engine';

  it.each([
    ['assistant-test-engine', true],
    ['test-engine', true],
    ['cosmere-test-engine', true],
    ['assistant-other-engine', false],
    ['unrelated-service', false],
  ])('maps %s correctly', (serviceName, expected) => {
    expect(matchesEngine(serviceName, engineName)).toBe(expected);
  });
});

describe('ProvisionedRedirectList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listAggregatedForwardingRules).mockResolvedValue(aggregatedRules);
    vi.mocked(api.listManagedSslCertificates).mockResolvedValue({
      items: [
        {
          name: 'assistant-test-engine-cert',
          type: 'MANAGED',
          creationTimestamp: '2024-05-01T00:00:00Z',
          managed: { domains: ['ai.example.com'], status: 'ACTIVE' },
        },
      ],
    });
    vi.mocked(api.listDnsZones).mockResolvedValue({ managedZones: [] });
  });

  it('lists the redirect infrastructure provisioned for this assistant', async () => {
    render(<ProvisionedRedirectList engine={engine} projectId="test-project" />);

    expect(await screen.findByText('assistant-test-engine')).toBeInTheDocument();
    expect(screen.getByText('ai.example.com')).toBeInTheDocument();
    // Another assistant's redirect must not be shown by default...
    expect(screen.queryByText('assistant-other-engine')).not.toBeInTheDocument();
    // ...but it must remain reachable, otherwise it can never be torn down.
    expect(
      screen.getByText(/Show 1 redirect URL\(s\) from other assistants/i)
    ).toBeInTheDocument();
  });

  it('reveals other assistants redirects so none become orphaned', async () => {
    render(<ProvisionedRedirectList engine={engine} projectId="test-project" />);

    fireEvent.click(await screen.findByText(/Show 1 redirect URL/i));
    expect(screen.getByText('assistant-other-engine')).toBeInTheDocument();
  });

  // A listing failure that renders as "no redirect URLs" would tell an operator
  // they have nothing provisioned while they are still being billed for a
  // forwarding rule and a certificate.
  it('surfaces a listing failure instead of rendering an empty list', async () => {
    vi.mocked(api.listAggregatedForwardingRules).mockRejectedValue(
      new Error('PERMISSION_DENIED: compute.forwardingRules.list')
    );

    render(<ProvisionedRedirectList engine={engine} projectId="test-project" />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/PERMISSION_DENIED/);
  });

  it('offers a teardown action for a provisioned redirect', async () => {
    render(<ProvisionedRedirectList engine={engine} projectId="test-project" />);

    const teardown = await screen.findByRole('button', { name: /tear down/i });
    expect(teardown).toBeEnabled();

    fireEvent.click(teardown);

    await waitFor(() => {
      expect(
        screen.getByText(/Dismantle Redirect URL Infrastructure/i)
      ).toBeInTheDocument();
    });
    // Destructive action must still be behind the confirmation modal.
    expect(api.deleteVanityUrl).not.toHaveBeenCalled();
  });
});

// Reachability guard. The previous implementation of this UI lived in
// pages/VanityUrlsPage.tsx, which lost its route and was tree-shaken out of the
// bundle -- making api.deleteVanityUrl unreachable while the deployment form
// kept creating billable infrastructure. This asserts the teardown UI is still
// wired into a component that is actually rendered.
describe('teardown reachability', () => {
  it('is rendered by the Assistant detail view', () => {
    const source = readFileSync(
      resolve(__dirname, '../page/AssistantDetailView.tsx'),
      'utf-8'
    );
    expect(source).toContain('ProvisionedRedirectList');
    expect(source).toMatch(/<ProvisionedRedirectList/);
  });

  it('has no orphaned VanityUrlsPage left behind', () => {
    expect(() =>
      readFileSync(resolve(__dirname, '../../../pages/VanityUrlsPage.tsx'), 'utf-8')
    ).toThrow();
  });
});
