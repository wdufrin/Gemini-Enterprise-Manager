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
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AssistantDetailsForm from './AssistantDetailsForm';
import { Assistant, Config } from '../../types';
import * as api from '../../services/apiService';

vi.mock('../../services/apiService', () => ({
  fetchModelArmorTemplates: vi.fn(),
  getEngine: vi.fn(),
  getEngineIamPolicy: vi.fn(),
  setEngineIamPolicy: vi.fn(),
  getProjectIamPolicy: vi.fn(),
  setProjectIamPolicy: vi.fn(),
  getDiscoveryProjectConfig: vi.fn(),
  getCustomRole: vi.fn(),
  createCustomRole: vi.fn(),
  updateCustomRole: vi.fn(),
  undeleteCustomRole: vi.fn(),
  updateAssistant: vi.fn(),
  updateEngine: vi.fn(),
}));

vi.mock('../../context/GlobalDebugContext', () => ({
  useGlobalDebug: () => ({ showCurlPreview: false }),
}));

const mockConfig: Config = {
  projectId: 'test-project-123',
  appLocation: 'global',
  collectionId: 'default_collection',
  appId: 'test-engine-id',
  assistantId: 'default_assistant',
};

const TEMPLATE_NAME = 'projects/test-project-123/locations/global/templates/safe-input';

const baseAssistant: Assistant = {
  name: 'projects/test-project-123/locations/global/collections/default_collection/engines/test-engine-id/assistants/default_assistant',
  displayName: 'Default Assistant',
} as Assistant;

const mockedApi = vi.mocked(api);

const renderForm = (assistant: Assistant = baseAssistant) =>
  render(<AssistantDetailsForm assistant={assistant} config={mockConfig} onUpdateSuccess={() => {}} />);

const readPolicy = (): Record<string, unknown> => {
  const textarea = screen.getByLabelText('Customer Policy (JSON Editor)') as HTMLTextAreaElement;
  return JSON.parse(textarea.value);
};

describe('AssistantDetailsForm - Model Armor failure mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.fetchModelArmorTemplates.mockResolvedValue({ templates: [{ name: TEMPLATE_NAME }] });
    mockedApi.getEngine.mockResolvedValue({
      name: 'projects/test-project/locations/global/collections/default_collection/engines/test-engine',
      displayName: 'Test Engine',
      solutionType: 'SOLUTION_TYPE_CHAT',
    });
    mockedApi.getEngineIamPolicy.mockResolvedValue({ bindings: [] });
  });

  it('defaults to FAIL_CLOSED for an assistant with no Model Armor config', async () => {
    renderForm();
    const select = await screen.findByLabelText('Failure Mode') as HTMLSelectElement;
    expect(select.value).toBe('FAIL_CLOSED');
  });

  it('reports an unset failureMode as FAIL_CLOSED, matching the API default', async () => {
    renderForm({
      ...baseAssistant,
      // A real deployment that never set failureMode: the API treats this as
      // FAIL_CLOSED, so the UI must not display FAIL_OPEN.
      customerPolicy: { modelArmorConfig: { userPromptTemplate: TEMPLATE_NAME } },
    } as Assistant);

    const select = await screen.findByLabelText('Failure Mode') as HTMLSelectElement;
    expect(select.value).toBe('FAIL_CLOSED');
  });

  it('still shows a real FAIL_OPEN setting rather than overriding it', async () => {
    renderForm({
      ...baseAssistant,
      customerPolicy: { modelArmorConfig: { userPromptTemplate: TEMPLATE_NAME, failureMode: 'FAIL_OPEN' } },
    } as Assistant);

    const select = await screen.findByLabelText('Failure Mode') as HTMLSelectElement;
    expect(select.value).toBe('FAIL_OPEN');
    expect(screen.getByText(/disables your protection whenever Model Armor is unavailable/)).toBeInTheDocument();
  });

  it('writes FAIL_CLOSED into customerPolicy when a template is first attached', async () => {
    renderForm();

    const inputSelect = await screen.findByLabelText('Input Template (User Prompts)');
    await waitFor(() => expect(screen.getAllByRole('option', { name: /safe-input/ }).length).toBeGreaterThan(0));
    fireEvent.change(inputSelect, { target: { value: TEMPLATE_NAME } });

    await waitFor(() => {
      const policy = readPolicy() as { modelArmorConfig?: Record<string, string> };
      expect(policy.modelArmorConfig?.userPromptTemplate).toBe(TEMPLATE_NAME);
      // The regression this guards: it used to write FAIL_OPEN here.
      expect(policy.modelArmorConfig?.failureMode).toBe('FAIL_CLOSED');
    });
  });

  it('does not silently downgrade an existing unset failureMode to FAIL_OPEN', async () => {
    renderForm({
      ...baseAssistant,
      customerPolicy: { modelArmorConfig: { userPromptTemplate: TEMPLATE_NAME } },
    } as Assistant);

    // Touching an unrelated Model Armor control used to stamp FAIL_OPEN in.
    const outputSelect = await screen.findByLabelText('Output Template (Model Responses)');
    await waitFor(() => expect(screen.getAllByRole('option', { name: /safe-input/ }).length).toBeGreaterThan(0));
    fireEvent.change(outputSelect, { target: { value: TEMPLATE_NAME } });

    await waitFor(() => {
      const policy = readPolicy() as { modelArmorConfig?: Record<string, string> };
      expect(policy.modelArmorConfig?.failureMode).not.toBe('FAIL_OPEN');
      expect(policy.modelArmorConfig?.failureMode).toBe('FAIL_CLOSED');
    });
  });

  it('states the availability cost of fail-closed at the point of choice', async () => {
    renderForm({
      ...baseAssistant,
      customerPolicy: { modelArmorConfig: { userPromptTemplate: TEMPLATE_NAME } },
    } as Assistant);

    expect(await screen.findByText(/can break chat during a Model Armor outage/)).toBeInTheDocument();
  });

  it('hides both tradeoff notes while no template is attached', async () => {
    renderForm();
    await screen.findByLabelText('Failure Mode');

    expect(screen.queryByText(/can break chat during a Model Armor outage/)).not.toBeInTheDocument();
    expect(screen.queryByText(/disables your protection whenever Model Armor is unavailable/)).not.toBeInTheDocument();
  });
});

describe('AssistantDetailsForm - App-level IAM Permissions (GA alignment)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.fetchModelArmorTemplates.mockResolvedValue({ templates: [] });
    mockedApi.getEngine.mockResolvedValue({
      name: 'projects/test-project-123/locations/global/collections/default_collection/engines/test-engine-id',
      displayName: 'Test Engine',
      solutionType: 'SOLUTION_TYPE_CHAT',
    });
    mockedApi.getEngineIamPolicy.mockResolvedValue({ bindings: [] });
    mockedApi.setEngineIamPolicy.mockImplementation(async (_appId: string, policy: any) => policy);
    mockedApi.getProjectIamPolicy.mockResolvedValue({ bindings: [] });
    mockedApi.setProjectIamPolicy.mockImplementation(async (_projId: string, policy: any) => policy);
    mockedApi.getCustomRole.mockImplementation(async (_projId: string, roleId: string) => ({
      name: `projects/test-project-123/roles/${roleId}`,
      title: roleId,
      includedPermissions: [
        'discoveryengine.locations.buildAuthorizationUrl',
        'discoveryengine.devToolsConfigs.get',
        'discoveryengine.engines.list',
        'discoveryengine.collections.list',
        'discoveryengine.dataStores.list',
        'discoveryengine.assistants.list',
        'discoveryengine.agents.list',
        'discoveryengine.LicenseConfigs.list',
        'discoveryengine.userStores.get',
        'discoveryengine.widgetConfigs.get',
        'resourcemanager.projects.get',
      ],
    }));
  });

  it('Model A (App-Only mode, dataStoreAccessControlEnabled=false): grants predefined agentspaceRestrictedUser on Project without creating custom roles', async () => {
    mockedApi.getDiscoveryProjectConfig.mockResolvedValue({
      name: 'projects/test-project-123',
      customerProvidedConfig: {
        resourceAccessControlConfig: {
          dataStoreAccessControlEnabled: false,
        },
      },
    } as any);

    renderForm();

    fireEvent.click(await screen.findByText('App-level IAM Permissions'));
    await waitFor(() => {
      expect(screen.getByText(/App-Only Access Control/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('email or ID'), {
      target: { value: 'apponly@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(mockedApi.createCustomRole).not.toHaveBeenCalled();
      expect(mockedApi.setProjectIamPolicy).toHaveBeenCalledWith(
        'test-project-123',
        expect.objectContaining({
          bindings: [
            {
              role: 'roles/discoveryengine.agentspaceRestrictedUser',
              members: ['user:apponly@example.com'],
            },
          ],
        })
      );
      expect(screen.getByText('apponly@example.com')).toBeInTheDocument();
    });
  });

  it('Model B (Granular DataStore mode, nested dataStoreAccessControlEnabled=true): provisions & grants customRestrictedEndUser + notebookLmUser (and customRestrictedAdmin for Admin role) without granting agentspaceRestrictedUser', async () => {
    mockedApi.getDiscoveryProjectConfig.mockResolvedValue({
      name: 'projects/test-project-123',
      customerProvidedConfig: {
        resourceAccessControlConfig: {
          dataStoreAccessControlEnabled: true,
        },
      },
    } as any);

    // Simulate customRestrictedEndUser missing (404) so it gets auto-created
    mockedApi.getCustomRole.mockImplementationOnce(async () => {
      const notFound: any = new Error('Role not found');
      notFound.status = 404;
      throw notFound;
    });
    mockedApi.createCustomRole.mockResolvedValueOnce({
      name: 'projects/test-project-123/roles/customRestrictedEndUser',
      title: 'Custom Restricted End User',
      includedPermissions: [
        'discoveryengine.locations.buildAuthorizationUrl',
        'discoveryengine.devToolsConfigs.get',
      ],
    });

    renderForm();

    fireEvent.click(await screen.findByText('App-level IAM Permissions'));
    await waitFor(() => {
      expect(screen.getByText(/Granular App & DataStore Access Control/i)).toBeInTheDocument();
    });

    const emailInput = screen.getByPlaceholderText('email or ID');
    fireEvent.change(emailInput, { target: { value: 'alice@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(mockedApi.createCustomRole).toHaveBeenCalledWith(
        'test-project-123',
        'customRestrictedEndUser',
        expect.objectContaining({
          stage: 'GA',
          includedPermissions: expect.arrayContaining([
            'discoveryengine.locations.buildAuthorizationUrl',
            'discoveryengine.devToolsConfigs.get',
          ]),
        })
      );
      expect(mockedApi.setProjectIamPolicy).toHaveBeenCalledWith(
        'test-project-123',
        expect.objectContaining({
          bindings: [
            {
              role: 'projects/test-project-123/roles/customRestrictedEndUser',
              members: ['user:alice@example.com'],
            },
            {
              role: 'roles/discoveryengine.notebookLmUser',
              members: ['user:alice@example.com'],
            },
          ],
        })
      );
      expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    });

    // Switch App Role selector to Delegated Admin (agentspaceAdmin) and verify customRestrictedAdmin is granted
    fireEvent.change(screen.getByLabelText('App Role'), {
      target: { value: 'roles/discoveryengine.agentspaceAdmin' },
    });
    fireEvent.change(screen.getByPlaceholderText('email or ID'), {
      target: { value: 'appadmin@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(mockedApi.setEngineIamPolicy).toHaveBeenLastCalledWith(
        'test-engine-id',
        expect.objectContaining({
          bindings: expect.arrayContaining([
            {
              role: 'roles/discoveryengine.agentspaceAdmin',
              members: ['user:appadmin@example.com'],
            },
          ]),
        }),
        mockConfig
      );
      expect(mockedApi.setProjectIamPolicy).toHaveBeenLastCalledWith(
        'test-project-123',
        expect.objectContaining({
          bindings: [
            {
              role: 'projects/test-project-123/roles/customRestrictedAdmin',
              members: ['user:appadmin@example.com'],
            },
          ],
        })
      );
    });
  });

  it('surfaces project IAM error when setProjectIamPolicy rejects while keeping the Add form interactive', async () => {
    mockedApi.getDiscoveryProjectConfig.mockResolvedValue({
      name: 'projects/test-project-123',
      dataStoreAccessControlEnabled: false,
    } as any);
    mockedApi.setProjectIamPolicy.mockRejectedValueOnce(new Error('403 Permission Denied on cloudresourcemanager'));

    renderForm();

    fireEvent.click(await screen.findByText('App-level IAM Permissions'));
    fireEvent.change(screen.getByPlaceholderText('email or ID'), { target: { value: 'bob@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(
        screen.getByText(/Failed to grant mandatory project-level access \(roles\/discoveryengine\.agentspaceRestrictedUser\): 403 Permission Denied/i)
      ).toBeInTheDocument();
      expect(screen.getByPlaceholderText('email or ID')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    });
  });

  it('executes setEngineIamPolicy before reading Project IAM and retries full read-modify-write when concurrent project ETag changes occur', async () => {
    mockedApi.getDiscoveryProjectConfig.mockResolvedValue({
      name: 'projects/test-project-123',
      customerProvidedConfig: {
        resourceAccessControlConfig: {
          dataStoreAccessControlEnabled: true,
        },
      },
    } as any);

    let liveProjectPolicy: any = {
      version: 3,
      etag: 'etag-initial',
      bindings: [
        {
          role: 'roles/viewer',
          members: ['user:existing@example.com'],
        },
      ],
    };

    mockedApi.setEngineIamPolicy.mockImplementation(async (_appId: string, policy: any) => {
      liveProjectPolicy = {
        ...liveProjectPolicy,
        etag: "\\007\\006^\\377\\016o\\245'",
      };
      return { ...policy, etag: 'engine-etag-2' };
    });

    mockedApi.getProjectIamPolicy.mockImplementation(async () =>
      JSON.parse(JSON.stringify(liveProjectPolicy))
    );

    let projectSetAttempts = 0;
    mockedApi.setProjectIamPolicy.mockImplementation(async (_projId: string, incoming: any) => {
      projectSetAttempts++;
      if (projectSetAttempts === 1) {
        expect(incoming.etag).toBe("\\007\\006^\\377\\016o\\245'");
        liveProjectPolicy = {
          ...liveProjectPolicy,
          etag: '\\007\\006`)jE\\010\\330',
          bindings: [
            ...liveProjectPolicy.bindings,
            {
              role: 'roles/discoveryengine.serviceAgent',
              members: ['serviceAccount:sa@gcp-sa-discoveryengine.iam.gserviceaccount.com'],
            },
          ],
        };
        const conflictErr: any = new Error(
          "There were concurrent policy changes. Please retry the whole read-modify-write with exponential backoff. The request's ETag '\\007\\006^\\377\\016o\\245\\'' did not match the current policy's ETag '\\007\\006`)jE\\010\\330'."
        );
        conflictErr.status = 409;
        conflictErr.code = 'ABORTED';
        throw conflictErr;
      }

      expect(incoming.etag).toBe('\\007\\006`)jE\\010\\330');
      liveProjectPolicy = {
        ...incoming,
        etag: 'etag-final',
      };
      return liveProjectPolicy;
    });

    renderForm();

    fireEvent.click(await screen.findByText('App-level IAM Permissions'));
    fireEvent.change(screen.getByPlaceholderText('email or ID'), {
      target: { value: 'carol@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(
      () => {
        expect(projectSetAttempts).toBe(2);
        expect(screen.getByText('carol@example.com')).toBeInTheDocument();
        expect(
          screen.queryByText(/Failed to grant mandatory project-level access/i)
        ).not.toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    // Concurrent serviceAgent binding must be preserved alongside newly granted GA custom + NotebookLM roles
    expect(liveProjectPolicy.bindings).toEqual([
      {
        role: 'roles/viewer',
        members: ['user:existing@example.com'],
      },
      {
        role: 'roles/discoveryengine.serviceAgent',
        members: ['serviceAccount:sa@gcp-sa-discoveryengine.iam.gserviceaccount.com'],
      },
      {
        role: 'projects/test-project-123/roles/customRestrictedEndUser',
        members: ['user:carol@example.com'],
      },
      {
        role: 'roles/discoveryengine.notebookLmUser',
        members: ['user:carol@example.com'],
      },
    ]);
  });
});


