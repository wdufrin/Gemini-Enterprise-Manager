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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AgentPermissionsPage from './AgentPermissionsPage';
import * as api from '../services/apiService';
import { ToastProvider } from '../context/ToastContext';

vi.mock('../services/apiService', () => ({
  getProjectIamPolicy: vi.fn(),
  listResources: vi.fn(),
  getAgentIamPolicy: vi.fn(),
}));

describe('AgentPermissionsPage (Systemic Honesty)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  const renderComponent = (projectNumber = '123456789') => {
    return render(
      <ToastProvider>
        <AgentPermissionsPage
          projectNumber={projectNumber}
          setProjectNumber={vi.fn()}
        />
      </ToastProvider>
    );
  };

  it('renders initial state when no scan has run', () => {
    renderComponent();
    expect(screen.getByText('Configuration')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Refetch All Locations/i })).toBeInTheDocument();
    expect(screen.getByText('No agent permissions found.')).toBeInTheDocument();
  });

  it('surfaces PartialResultsBanner when project IAM fetch fails (e.g. 403 Forbidden)', async () => {
    const error403 = new Error('Permission denied: Caller lacks resourcemanager.projects.getIamPolicy');
    (error403 as any).status = 403;
    vi.mocked(api.getProjectIamPolicy).mockRejectedValue(error403);
    vi.mocked(api.listResources).mockResolvedValue({ engines: [] });

    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: /Refetch All Locations/i }));

    await waitFor(() => {
      expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
    });

    // Verify banner explains the failure honestly
    expect(screen.getByText(/403/)).toBeInTheDocument();
    expect(screen.getByText(/Permissions Could Not Be Fully Retrieved/i)).toBeInTheDocument();
    expect(screen.queryByText(/Select a project and click refetch to globally scan all agent permissions/i)).toBeNull();
  });

  it('surfaces PartialResultsBanner when listing engines or agents fails with authorization error', async () => {
    vi.mocked(api.getProjectIamPolicy).mockResolvedValue({ bindings: [] });
    vi.mocked(api.listResources).mockImplementation((resourceType: string) => {
      if (resourceType === 'engines') {
        const error403 = new Error('403 Forbidden: Discovery Engine API not enabled or access denied');
        (error403 as any).status = 403;
        return Promise.reject(error403);
      }
      return Promise.resolve({});
    });

    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: /Refetch All Locations/i }));

    await waitFor(() => {
      expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Permissions Could Not Be Fully Retrieved/i)).toBeInTheDocument();
  });

  it('correctly displays agent permissions table and inherited project roles on successful scan', async () => {
    vi.mocked(api.getProjectIamPolicy).mockResolvedValue({
      bindings: [
        { role: 'roles/owner', members: ['user:admin@example.com'] }
      ]
    });

    vi.mocked(api.listResources).mockImplementation((resourceType: string) => {
      if (resourceType === 'engines') {
        return Promise.resolve({
          engines: [{ name: 'projects/123/locations/global/collections/default_collection/engines/engine-1', displayName: 'Support App' }]
        });
      }
      if (resourceType === 'assistants') {
        return Promise.resolve({
          assistants: [{ name: 'projects/123/locations/global/collections/default_collection/engines/engine-1/assistants/default_assistant', displayName: 'Default Assistant' }]
        });
      }
      if (resourceType === 'agents') {
        return Promise.resolve({
          agents: [{
            name: 'projects/123/locations/global/collections/default_collection/engines/engine-1/assistants/default_assistant/agents/billing-agent',
            displayName: 'Billing Agent',
            agentType: 'ADK'
          }]
        });
      }
      return Promise.resolve({});
    });

    vi.mocked(api.getAgentIamPolicy).mockResolvedValue({
      bindings: [
        { role: 'roles/discoveryengine.editor', members: ['user:agent-dev@example.com'] }
      ]
    });

    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: /Refetch All Locations/i }));

    await waitFor(() => {
      expect(screen.getAllByText('Support App').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Billing Agent').length).toBeGreaterThan(0);
      expect(screen.getAllByText('agent-dev@example.com').length).toBeGreaterThan(0);
      expect(screen.getAllByText('admin@example.com (Inherited)').length).toBeGreaterThan(0);
    });

    // Ensure no error banner is displayed on fully successful scan
    expect(screen.queryByText(/could not be loaded/i)).toBeNull();
  });
});
