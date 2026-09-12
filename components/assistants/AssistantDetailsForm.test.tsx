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
