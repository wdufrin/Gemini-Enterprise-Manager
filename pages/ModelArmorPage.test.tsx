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
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ModelArmorPage from './ModelArmorPage';
import * as api from '../services/apiService';

vi.mock('../services/apiService', () => ({
  fetchViolationLogs: vi.fn(),
  fetchModelArmorTemplates: vi.fn(),
  createModelArmorTemplate: vi.fn(),
  updateAssistant: vi.fn(),
  listResources: vi.fn(),
}));

vi.mock('../components/ProjectInput', () => ({ default: () => <div data-testid="project-input" /> }));
vi.mock('../components/CloudConsoleButton', () => ({ default: () => <div data-testid="console-button" /> }));

const PROJECT = 'test-project-123';
const TEMPLATE_NAME = `projects/${PROJECT}/locations/global/templates/my-safety-policy-input`;
const ENGINE_NAME = `projects/${PROJECT}/locations/global/collections/default_collection/engines/app-one`;
const ASSISTANT_NAME = `${ENGINE_NAME}/assistants/default_assistant`;

const mockedApi = vi.mocked(api);

/** Only the `global` location has an app; `us` and `eu` return nothing. */
const engineListResponse = (loc: string) =>
  loc === 'global' ? { engines: [{ name: ENGINE_NAME, displayName: 'App One' }] } : { engines: [] };

interface ListResourcesConfig {
  appLocation: string;
  collectionId: string;
  appId: string;
}

const openPolicyTab = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Policy Configuration' }));
  await waitFor(() => expect(mockedApi.fetchModelArmorTemplates).toHaveBeenCalled());
};

const renderPage = () =>
  render(<ModelArmorPage projectNumber={PROJECT} setProjectNumber={() => {}} />);

describe('ModelArmorPage - live attached state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.fetchModelArmorTemplates.mockResolvedValue({
      templates: [{ name: TEMPLATE_NAME, filterConfig: {} }],
    });
  });

  it('requests assistants under default_collection, not an empty collection path', async () => {
    mockedApi.listResources.mockImplementation(async (type: string, config: ListResourcesConfig) => {
      if (type === 'engines') return engineListResponse(config.appLocation);
      return { assistants: [] };
    });

    renderPage();
    await openPolicyTab();

    await waitFor(() => {
      const assistantCalls = mockedApi.listResources.mock.calls.filter(([type]) => type === 'assistants');
      expect(assistantCalls.length).toBeGreaterThan(0);
      for (const [, config] of assistantCalls) {
        // An empty collectionId produced `collections//engines/...` and a 404
        // on every assistant lookup, which silently emptied the whole panel.
        expect((config as ListResourcesConfig).collectionId).toBe('default_collection');
      }
    });
  });

  it('reports a template as Protected when an assistant really references it', async () => {
    mockedApi.listResources.mockImplementation(async (type: string, config: ListResourcesConfig) => {
      if (type === 'engines') return engineListResponse(config.appLocation);
      return {
        assistants: [{
          name: ASSISTANT_NAME,
          customerPolicy: {
            modelArmorConfig: { userPromptTemplate: TEMPLATE_NAME, failureMode: 'FAIL_CLOSED' },
          },
        }],
      };
    });

    renderPage();
    await openPolicyTab();

    expect(await screen.findByText('Protected')).toBeInTheDocument();
    expect(screen.queryByText('Unknown')).not.toBeInTheDocument();
    // The template row should name the app rather than claiming it is unused.
    expect(screen.getByText(/App One \(GLOBAL \/ Assistant: default_assistant\)/)).toBeInTheDocument();
  });

  it('says "Not attached" only when the scan actually completed', async () => {
    mockedApi.listResources.mockImplementation(async (type: string, config: ListResourcesConfig) => {
      if (type === 'engines') return engineListResponse(config.appLocation);
      return { assistants: [{ name: ASSISTANT_NAME, customerPolicy: {} }] };
    });

    renderPage();
    await openPolicyTab();

    expect(await screen.findByText('Not attached')).toBeInTheDocument();
    expect(screen.getByText('Not protected')).toBeInTheDocument();
  });

  it('says "Unknown" instead of "Not attached" when an assistant lookup fails', async () => {
    mockedApi.listResources.mockImplementation(async (type: string, config: ListResourcesConfig) => {
      if (type === 'engines') return engineListResponse(config.appLocation);
      throw new Error('PERMISSION_DENIED on untrusted.example.com');
    });

    renderPage();
    await openPolicyTab();

    // Both the template row and the per-app row must refuse to guess.
    await waitFor(() => expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0));
    expect(screen.queryByText('Not attached')).not.toBeInTheDocument();
    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
    // The underlying failure is surfaced, not swallowed into console.warn.
    expect(screen.getAllByText(/PERMISSION_DENIED on untrusted\.example\.com/).length).toBeGreaterThan(0);
  });
});

describe('ModelArmorPage - real attach', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.fetchModelArmorTemplates.mockResolvedValue({
      templates: [{ name: TEMPLATE_NAME, filterConfig: {} }],
    });
    mockedApi.listResources.mockImplementation(async (type: string, config: ListResourcesConfig) => {
      if (type === 'engines') return engineListResponse(config.appLocation);
      return {
        assistants: [{
          name: ASSISTANT_NAME,
          customerPolicy: { bannedPhrases: { bannedPhrases: ['keep-me'] } },
        }],
      };
    });
  });

  const selectTargetApp = async () => {
    const select = await screen.findByLabelText('Target App to Attach To');
    fireEvent.change(select, { target: { value: '0' } });
    return select;
  };

  it('defaults the attach failure mode to FAIL_CLOSED and warns before fail-open', async () => {
    renderPage();
    await openPolicyTab();
    await selectTargetApp();

    const failureSelect = screen.getByLabelText('If Model Armor cannot evaluate a request') as HTMLSelectElement;
    expect(failureSelect.value).toBe('FAIL_CLOSED');
    // The cost of the secure default is stated, not hidden.
    expect(screen.getByText(/reject chat requests and users will/)).toBeInTheDocument();

    fireEvent.change(failureSelect, { target: { value: 'FAIL_OPEN' } });
    expect(screen.getByText(/pass prompts/)).toBeInTheDocument();
  });

  it('performs a real PATCH that merges into the existing customerPolicy', async () => {
    mockedApi.updateAssistant.mockResolvedValue({
      name: ASSISTANT_NAME,
      customerPolicy: {
        bannedPhrases: { bannedPhrases: ['keep-me'] },
        modelArmorConfig: { userPromptTemplate: TEMPLATE_NAME, failureMode: 'FAIL_CLOSED' },
      },
    } as never);

    renderPage();
    await openPolicyTab();
    await selectTargetApp();

    fireEvent.click(screen.getByRole('button', { name: /Attach Now/ }));

    await waitFor(() => expect(mockedApi.updateAssistant).toHaveBeenCalledTimes(1));
    const [name, payload, updateMask, config] = mockedApi.updateAssistant.mock.calls[0];
    expect(name).toBe(ASSISTANT_NAME);
    expect(updateMask).toEqual(['customerPolicy']);
    expect(config.appLocation).toBe('global');
    expect(payload.customerPolicy.modelArmorConfig).toEqual({
      userPromptTemplate: TEMPLATE_NAME,
      failureMode: 'FAIL_CLOSED',
    });
    // Unrelated policy fields must survive the attach.
    expect(payload.customerPolicy.bannedPhrases).toEqual({ bannedPhrases: ['keep-me'] });

    expect(await screen.findByText(/Verified from the API response/)).toBeInTheDocument();
  });

  it('does not claim success when the API response omits the template', async () => {
    mockedApi.updateAssistant.mockResolvedValue({
      name: ASSISTANT_NAME,
      customerPolicy: {},
    } as never);

    renderPage();
    await openPolicyTab();
    await selectTargetApp();

    fireEvent.click(screen.getByRole('button', { name: /Attach Now/ }));

    expect(await screen.findByText(/does not show this template attached/)).toBeInTheDocument();
    expect(screen.queryByText(/Verified from the API response/)).not.toBeInTheDocument();
  });

  it('surfaces an attach failure instead of failing silently', async () => {
    mockedApi.updateAssistant.mockRejectedValue(new Error('403 caller lacks discoveryengine.assistants.update'));

    renderPage();
    await openPolicyTab();
    await selectTargetApp();

    fireEvent.click(screen.getByRole('button', { name: /Attach Now/ }));

    expect(await screen.findByText(/403 caller lacks discoveryengine\.assistants\.update/)).toBeInTheDocument();
    expect(screen.queryByText(/Verified from the API response/)).not.toBeInTheDocument();
  });
});

describe('ModelArmorPage - real template creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.fetchModelArmorTemplates.mockResolvedValue({ templates: [] });
    mockedApi.listResources.mockResolvedValue({ engines: [] });
  });

  it('creates the template through the API with a fail-closed template metadata', async () => {
    mockedApi.createModelArmorTemplate.mockResolvedValue({ name: TEMPLATE_NAME });

    renderPage();
    await openPolicyTab();

    fireEvent.click(await screen.findByRole('button', { name: /Create Template/ }));

    await waitFor(() => expect(mockedApi.createModelArmorTemplate).toHaveBeenCalledTimes(1));
    const [projectId, location, templateId, payload] = mockedApi.createModelArmorTemplate.mock.calls[0];
    expect(projectId).toBe(PROJECT);
    expect(location).toBe('global');
    expect(templateId).toBe('my-safety-policy-input');
    // A detector that cannot run must fail the invocation, not be skipped.
    expect(payload.templateMetadata.ignorePartialInvocationFailures).toBe(false);
    expect(payload.templateMetadata.enforcementType).toBe('INSPECT_AND_BLOCK');

    expect(await screen.findByText(new RegExp(`Created ${TEMPLATE_NAME}`))).toBeInTheDocument();
  });

  it('reports a creation failure rather than pretending it worked', async () => {
    mockedApi.createModelArmorTemplate.mockRejectedValue(new Error('ALREADY_EXISTS: template exists'));

    renderPage();
    await openPolicyTab();

    fireEvent.click(await screen.findByRole('button', { name: /Create Template/ }));

    expect(await screen.findByText(/ALREADY_EXISTS: template exists/)).toBeInTheDocument();
  });

  it('labels the copy buttons as commands the user must run themselves', async () => {
    renderPage();
    await openPolicyTab();

    const panel = await screen.findByText(/Copying this command does not create anything/);
    expect(panel).toBeInTheDocument();
    expect(within(panel).queryByText('attached')).not.toBeInTheDocument();
  });
});
