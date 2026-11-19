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

const mockEnrollmentState = {
  isGoogleInternal: false,
  isTrustedTester: false,
  isNotebookLmApiUser: false,
};

vi.mock('../../context/ProjectEnrollmentContext', () => ({
  useProjectEnrollment: () => mockEnrollmentState,
}));

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

describe('AssistantDetailsForm - Model Armor failure mode & Screening Scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnrollmentState.isGoogleInternal = false;
    mockEnrollmentState.isTrustedTester = false;
    mockEnrollmentState.isNotebookLmApiUser = false;
    mockedApi.fetchModelArmorTemplates.mockResolvedValue({ templates: [{ name: TEMPLATE_NAME }] });
    mockedApi.getEngine.mockResolvedValue({
      name: 'projects/test-project/locations/global/collections/default_collection/engines/test-engine',
      displayName: 'Test Engine',
      solutionType: 'SOLUTION_TYPE_CHAT',
    });
    mockedApi.getEngineIamPolicy.mockResolvedValue({ bindings: [] });
  });

  it('displays the Assistant Model Armor screening scope warning banner', async () => {
    renderForm();
    expect(await screen.findByText(/Assistant Model Armor Screening Scope:/i)).toBeInTheDocument();
    expect(screen.getByText(/Workflow Builder agents/i)).toBeInTheDocument();
    expect(screen.getByText(/Dialogflow/i)).toBeInTheDocument();
  });

  it('defaults to FAIL_CLOSED for an assistant with no Model Armor config', async () => {
    renderForm();
    const select = await screen.findByLabelText('Failure Mode') as HTMLSelectElement;
    expect(select.value).toBe('FAIL_CLOSED');
  });

  it('reports an unset failureMode as FAIL_CLOSED, matching the API default', async () => {
    renderForm({
      ...baseAssistant,
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
      expect(policy.modelArmorConfig?.failureMode).toBe('FAIL_CLOSED');
    });
  });

  it('does not silently downgrade an existing unset failureMode to FAIL_OPEN', async () => {
    renderForm({
      ...baseAssistant,
      customerPolicy: { modelArmorConfig: { userPromptTemplate: TEMPLATE_NAME } },
    } as Assistant);

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

describe('AssistantDetailsForm - Retention Presets, cURL Parity, GenerationConfig & Safety Policies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnrollmentState.isGoogleInternal = false;
    mockEnrollmentState.isTrustedTester = false;
    mockEnrollmentState.isNotebookLmApiUser = false;
    mockedApi.fetchModelArmorTemplates.mockResolvedValue({ templates: [] });
    mockedApi.getEngine.mockResolvedValue({
      name: 'projects/test-project-123/locations/global/collections/default_collection/engines/test-engine-id',
      displayName: 'Test Engine',
      solutionType: 'SOLUTION_TYPE_CHAT',
      sessionConfig: { sessionTtl: { days: 30 } },
    });
    mockedApi.getEngineIamPolicy.mockResolvedValue({ bindings: [] });
    mockedApi.updateAssistant.mockImplementation(async (_name, payload) => ({
      ...baseAssistant,
      ...payload,
    } as Assistant));
    mockedApi.updateEngine.mockResolvedValue({} as any);
  });

  it('maintains cURL preview parity with performUpdate for chat retention without mutating Assistant.customerPolicy', async () => {
    renderForm();

    // Wait for getEngine to populate retention = 30
    const retentionInput = (await screen.findByLabelText(/Chat History Retention/i)) as HTMLInputElement;
    await waitFor(() => expect(retentionInput.value).toBe('30'));

    // Click preset button 90 days
    fireEvent.click(screen.getByRole('button', { name: '90 days' }));
    expect(retentionInput.value).toBe('90');

    // cURL preview MUST contain Engine PATCH (sessionConfig.sessionTtl) and MUST NOT contain Update Assistant or chatHistoryRetentionDays
    const curlBlock = document.querySelector('pre')?.textContent || '';
    expect(curlBlock).toContain('updateMask=sessionConfig.sessionTtl');
    expect(curlBlock).toContain('"days": 90');
    expect(curlBlock).not.toContain('chatHistoryRetentionDays');
    expect(curlBlock).not.toContain('# Update Assistant');

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(mockedApi.updateAssistant).not.toHaveBeenCalled();
      expect(mockedApi.updateEngine).toHaveBeenCalledWith(
        'test-engine-id',
        { sessionConfig: { sessionTtl: { days: 90 } } },
        ['sessionConfig.sessionTtl'],
        mockConfig,
      );
    });
  });

  it('supports sessionTtl: { indefinite: true } when isGoogleInternal is true and hides it otherwise', async () => {
    const { unmount } = renderForm();
    await screen.findByLabelText(/Chat History Retention/i);
    expect(screen.queryByRole('button', { name: /Indefinite/i })).not.toBeInTheDocument();
    unmount();

    mockEnrollmentState.isGoogleInternal = true;
    renderForm();

    const indefiniteBtn = await screen.findByRole('button', { name: /Indefinite \(Google Internal\)/i });
    fireEvent.click(indefiniteBtn);

    const curlBlock = document.querySelector('pre')?.textContent || '';
    expect(curlBlock).toContain('"indefinite": true');

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => {
      expect(mockedApi.updateEngine).toHaveBeenCalledWith(
        'test-engine-id',
        { sessionConfig: { sessionTtl: { indefinite: true } } },
        ['sessionConfig.sessionTtl'],
        mockConfig,
      );
    });
  });

  it('persists generationConfig.defaultLanguage and defaultModelId via granular updateMask without wiping systemInstruction', async () => {
    renderForm({
      ...baseAssistant,
      generationConfig: {
        systemInstruction: { additionalSystemInstruction: 'Keep concise enterprise tone.' },
      },
    } as Assistant);

    const langInput = await screen.findByLabelText(/Default Language/i);
    const modelInput = screen.getByLabelText(/Default Model ID/i);

    fireEvent.change(langInput, { target: { name: 'defaultLanguage', value: 'fr-FR' } });
    fireEvent.change(modelInput, { target: { name: 'defaultModelId', value: 'gemini-2.5-pro' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(mockedApi.updateAssistant).toHaveBeenCalledWith(
        baseAssistant.name,
        {
          generationConfig: {
            defaultLanguage: 'fr-FR',
            defaultModelId: 'gemini-2.5-pro',
          },
        },
        ['generationConfig.defaultLanguage', 'generationConfig.defaultModelId'],
        mockConfig,
      );
    });
  });

  it('defaults knowledgeCatalogEnabled to true when undefined and includes knowledgeCatalogEnabled in updateMask when toggled', async () => {
    renderForm(baseAssistant);

    fireEvent.click(await screen.findByText('Feature Management'));
    const kcCheckbox = screen.getByRole('checkbox', {
      name: /Dataplex Knowledge Catalog Integration — Preview/i,
    }) as HTMLInputElement;
    expect(kcCheckbox.checked).toBe(true);

    fireEvent.click(kcCheckbox);
    expect(kcCheckbox.checked).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(mockedApi.updateAssistant).toHaveBeenCalledWith(
        baseAssistant.name,
        { knowledgeCatalogEnabled: false },
        ['knowledgeCatalogEnabled'],
        mockConfig,
      );
    });
  });

  it('syncs bannedPhrases bi-directionally with customerPolicy JSON and rejects empty/whitespace banned phrases', async () => {
    renderForm();

    const phraseInput = await screen.findByLabelText('Phrase to Block');
    const matchSelect = screen.getByLabelText('Match Type');
    const diacriticsCheckbox = screen.getByLabelText('Ignore Diacritics');
    const addBtn = screen.getByRole('button', { name: 'Add Phrase' });

    // Adversarial: empty and whitespace-only phrases must be rejected
    fireEvent.change(phraseInput, { target: { value: '    ' } });
    fireEvent.click(addBtn);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Banned phrase cannot be empty or whitespace only/i);
    expect(readPolicy()).toEqual({});

    // Valid phrase addition
    fireEvent.change(phraseInput, { target: { value: 'project-nightfall' } });
    fireEvent.change(matchSelect, { target: { value: 'WORD_BOUNDARY_STRING_MATCH' } });
    fireEvent.click(diacriticsCheckbox);
    fireEvent.click(addBtn);

    expect(screen.queryByText(/Banned phrase cannot be empty/i)).not.toBeInTheDocument();
    expect(readPolicy()).toEqual({
      bannedPhrases: [
        {
          phrase: 'project-nightfall',
          matchType: 'WORD_BOUNDARY_STRING_MATCH',
          ignoreDiacritics: true,
        },
      ],
    });
    expect(screen.getByText('project-nightfall')).toBeInTheDocument();

    // Bi-directional sync from raw JSON editor -> UI list
    const jsonEditor = screen.getByLabelText('Customer Policy (JSON Editor)');
    fireEvent.change(jsonEditor, {
      target: {
        name: 'customerPolicy',
        value: JSON.stringify({
          bannedPhrases: [{ phrase: 'confidential-omega', matchType: 'SIMPLE_STRING_MATCH' }],
        }),
      },
    });
    expect(await screen.findByText('confidential-omega')).toBeInTheDocument();

    // Remove phrase cleans customerPolicy back to {}
    fireEvent.click(screen.getByRole('button', { name: /Remove banned phrase confidential-omega/i }));
    expect(readPolicy()).toEqual({});

    // Adversarial: raw JSON injection of whitespace-only phrase is blocked on Save
    fireEvent.change(jsonEditor, {
      target: {
        name: 'customerPolicy',
        value: JSON.stringify({ bannedPhrases: [{ phrase: '   ' }] }),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(await screen.findByText(/Banned phrases cannot contain empty or whitespace-only entries/i)).toBeInTheDocument();
    expect(mockedApi.updateAssistant).not.toHaveBeenCalled();
  });

  it('validates SDP dataProtectionPolicy format and blocks malformed contentPolicies paths', async () => {
    renderForm();

    const sdpInput = await screen.findByLabelText(/Sensitive Data Protection \(SDP\) Content Policy/i);

    // Adversarial: malformed SDP resource path
    fireEvent.change(sdpInput, { target: { value: 'projects/test-project-123/templates/wrong-resource' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Expected: projects\/\{project\}\/locations\/\{location\}\/contentPolicies\/\{id\}/i,
    );
    expect(readPolicy()).toEqual({});

    // Attempting to save while SDP input is invalid must reject without calling updateAssistant
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => {
      expect(mockedApi.updateAssistant).not.toHaveBeenCalled();
    });

    // Valid SDP resource path syncs cleanly
    const validSdp = 'projects/test-project-123/locations/global/contentPolicies/enterprise-pii-policy';
    fireEvent.change(sdpInput, { target: { value: validSdp } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(readPolicy()).toEqual({
      dataProtectionPolicy: {
        sensitiveDataProtectionPolicy: {
          policy: validSdp,
        },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => {
      expect(mockedApi.updateAssistant).toHaveBeenCalledWith(
        baseAssistant.name,
        {
          customerPolicy: {
            dataProtectionPolicy: {
              sensitiveDataProtectionPolicy: {
                policy: validSdp,
              },
            },
          },
        },
        ['customerPolicy'],
        mockConfig,
      );
    });
  });

  it('exposes agentReasoningHidden, mapsGroundingType, and defaultMapsGroundingToggleOff for Trusted Tester projects', async () => {
    mockEnrollmentState.isTrustedTester = true;
    renderForm();

    // 1. agentReasoningHidden in Customer Policy
    const hideReasoningCheckbox = await screen.findByRole('checkbox', {
      name: /Hide Agent Reasoning \/ AI Thinking Traces/i,
    });
    fireEvent.click(hideReasoningCheckbox);
    expect(readPolicy()).toEqual({ agentReasoningHidden: true });

    // 2. Maps Grounding controls in Trusted Tester section
    fireEvent.click(screen.getByText('Advanced Configuration (Trusted Tester)'));
    const mapsSelect = screen.getByLabelText('Maps Grounding Type');
    fireEvent.change(mapsSelect, {
      target: { name: 'mapsGroundingType', value: 'MAPS_GROUNDING_TYPE_GOOGLE_MAPS' },
    });
    const defaultMapsOff = screen.getByRole('checkbox', {
      name: /Default Maps Grounding to Off/i,
    });
    fireEvent.click(defaultMapsOff);

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(mockedApi.updateAssistant).toHaveBeenCalledWith(
        baseAssistant.name,
        {
          mapsGroundingType: 'MAPS_GROUNDING_TYPE_GOOGLE_MAPS',
          defaultMapsGroundingToggleOff: true,
          customerPolicy: { agentReasoningHidden: true },
        },
        ['mapsGroundingType', 'defaultMapsGroundingToggleOff', 'customerPolicy'],
        mockConfig,
      );
    });
  });
});

describe('AssistantDetailsForm - App-level IAM Permissions (GA alignment)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnrollmentState.isGoogleInternal = false;
    mockEnrollmentState.isTrustedTester = false;
    mockEnrollmentState.isNotebookLmApiUser = false;
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
