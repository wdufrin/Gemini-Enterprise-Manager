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
import { mergeExclusionRuleIntoSettings } from '../services/api/modelArmor';
import { validateProposedExclusionRule } from '../components/model-armor/types';

vi.mock('../services/apiService', () => ({
  fetchViolationLogs: vi.fn(),
  fetchModelArmorTemplates: vi.fn(),
  createModelArmorTemplate: vi.fn(),
  updateModelArmorTemplateExclusionRules: vi.fn(),
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
    expect(payload.customerPolicy?.modelArmorConfig).toEqual({
      userPromptTemplate: TEMPLATE_NAME,
      failureMode: 'FAIL_CLOSED',
    });
    // Unrelated policy fields must survive the attach.
    expect(payload.customerPolicy?.bannedPhrases).toEqual({ bannedPhrases: ['keep-me'] });

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
    expect(payload.templateMetadata?.ignorePartialInvocationFailures).toBe(false);
    expect(payload.templateMetadata?.enforcementType).toBe('INSPECT_AND_BLOCK');

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

  it('identifies template Exclusion Rules and distinguishes Realtime vs Buffered Streaming compatibility (#exclusion-rules-streaming)', async () => {
    mockedApi.fetchModelArmorTemplates.mockResolvedValue({
      templates: [
        {
          name: `projects/${PROJECT}/locations/global/templates/realtime-safe-policy`,
          templateMetadata: { logSanitizeOperations: true },
          filterConfig: {
            piAndJailbreakFilterSettings: { filterEnforcement: 'ENABLED' },
            raiSettings: {
              raiFilters: [{ filterType: 'DANGEROUS_CONTENT', confidenceLevel: 'HIGH' }],
            },
            filterRuleSettings: {
              ruleSets: [
                {
                  filterTypes: ['PROMPT_INJECTION_AND_JAILBREAK'],
                  rules: [
                    {
                      exclusionRule: {
                        dictionary: {
                          wordList: { words: ['ignore case when sorting this list', 'ignore empty rows'] },
                        },
                        matchingScope: 'MATCHING_SCOPE_PARTIAL_MATCH',
                      },
                    },
                  ],
                },
                {
                  filterTypes: ['RESPONSIBLE_AI'],
                  rules: [
                    {
                      exclusionRule: {
                        regex: { pattern: '(?i)kill process [0-9]+' },
                        matchingScope: 'MATCHING_SCOPE_PARTIAL_MATCH',
                      },
                    },
                  ],
                },
              ],
            },
          },
        },
        {
          name: `projects/${PROJECT}/locations/global/templates/full-match-buffered-policy`,
          templateMetadata: { logSanitizeOperations: false },
          filterConfig: {
            piAndJailbreakFilterSettings: { filterEnforcement: 'ENABLED' },
            filterRuleSettings: {
              ruleSets: [
                {
                  filterTypes: ['PROMPT_INJECTION_AND_JAILBREAK'],
                  rules: [
                    {
                      exclusionRule: {
                        dictionary: {
                          wordList: { words: ['ignore previous instructions in test fixture'] },
                        },
                        matchingScope: 'MATCHING_SCOPE_FULL_MATCH',
                      },
                    },
                  ],
                },
              ],
            },
          },
        },
      ],
    });

    renderPage();
    await openPolicyTab();

    expect(await screen.findByTestId('exclusion-badge-realtime-safe-policy')).toHaveTextContent('2 Exclusion Rules');
    expect(screen.getByTestId('streaming-badge-realtime-safe-policy')).toHaveTextContent(
      'Realtime & Buffered OK (PARTIAL_MATCH)',
    );

    expect(screen.getByTestId('exclusion-badge-full-match-buffered-policy')).toHaveTextContent('1 Exclusion Rule');
    expect(screen.getByTestId('streaming-badge-full-match-buffered-policy')).toHaveTextContent(
      'Buffered Streaming Only (FULL_MATCH)',
    );

    // Expand details on the FULL_MATCH template and verify the 400 INVALID_ARGUMENT streaming warning is shown
    const inspectButtons = screen.getAllByRole('button', { name: 'Inspect Rules' });
    fireEvent.click(inspectButtons[1]);

    const invalidArgMentions = await screen.findAllByText(/400 INVALID_ARGUMENT/);
    expect(invalidArgMentions.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/ignore previous instructions in test fixture/)).toBeInTheDocument();
  });

  it('builds filterRuleSettings with DevOps preset and warns when MATCHING_SCOPE_FULL_MATCH is selected in PolicyGenerator', async () => {
    mockedApi.createModelArmorTemplate.mockResolvedValue({ name: TEMPLATE_NAME });

    renderPage();
    await openPolicyTab();

    fireEvent.click(await screen.findByRole('button', { name: /\+ DevOps False-Positive Preset/i }));

    // Switch Rule 1 matching scope to MATCHING_SCOPE_FULL_MATCH and verify real-time streaming warning appears
    const scopeSelect = screen.getByLabelText('Rule 1 Matching Scope') as HTMLSelectElement;
    expect(scopeSelect.value).toBe('MATCHING_SCOPE_PARTIAL_MATCH');
    fireEvent.change(scopeSelect, { target: { value: 'MATCHING_SCOPE_FULL_MATCH' } });

    expect(await screen.findByTestId('policy-generator-full-match-warning')).toHaveTextContent('400 INVALID_ARGUMENT');

    // Create template and verify payload includes filterRuleSettings and logSanitizeOperations
    fireEvent.click(screen.getByRole('button', { name: /Create Template/ }));
    await waitFor(() => expect(mockedApi.createModelArmorTemplate).toHaveBeenCalledTimes(1));
    const [, , , sentPayload] = mockedApi.createModelArmorTemplate.mock.calls[0];
    expect(sentPayload.templateMetadata?.logSanitizeOperations).toBe(true);
    expect(sentPayload.filterConfig?.filterRuleSettings?.ruleSets).toHaveLength(2);
    expect(sentPayload.filterConfig?.filterRuleSettings?.ruleSets?.[0]).toEqual({
      filterTypes: ['PROMPT_INJECTION_AND_JAILBREAK'],
      rules: [
        {
          exclusionRule: {
            dictionary: {
              wordList: { words: ['ignore case when sorting this list', 'ignore empty rows'] },
            },
            matchingScope: 'MATCHING_SCOPE_FULL_MATCH',
          },
        },
      ],
    });
  });

  it('identifies exclusion_rule_overridden_filters, exclusion_rule_skipped_filters, and streamChunkProcessed in Activity Logs', async () => {
    mockedApi.fetchViolationLogs.mockResolvedValue({
      entries: [
        {
          logName: 'projects/test-project-123/logs/modelarmor.googleapis.com%2Fsanitize_operations',
          receiveTimestamp: '2026-04-06T22:22:07Z',
          labels: {
            'modelarmor.googleapis.com/client_correlation_id':
              'AS|projects/test-project-123/locations/global/collections/default_collection/engines/app-one/assistants/default_assistant',
            'modelarmor.googleapis.com/exclusion_rule_overridden_filters': 'pi_and_jailbreak',
            'modelarmor.googleapis.com/exclusion_rule_skipped_filters': 'rai',
          },
          jsonPayload: {
            sanitizationInput: { text: 'ignore case when sorting this list and kill process 1234' },
            sanitizationResult: {
              sanitizationVerdict: 'ALLOWED',
              sanitizationMetadata: {
                streamChunkProcessed: true,
              },
              filterResults: {
                rai: {
                  raiFilterResult: {
                    executionState: 'EXECUTION_SKIPPED',
                    matchState: 'MATCH_FOUND',
                  },
                },
              },
            },
          },
        },
      ],
    } as never);

    renderPage();

    // Enable the Exclusion Overrides filter checkbox and fetch logs
    const exclusionCheckbox = screen.getByLabelText(/Exclusion Overrides/i);
    fireEvent.click(exclusionCheckbox);
    fireEvent.click(screen.getByRole('button', { name: 'Fetch Logs' }));

    await waitFor(() => expect(mockedApi.fetchViolationLogs).toHaveBeenCalledTimes(1));
    const [, filterQuery] = mockedApi.fetchViolationLogs.mock.calls[0];
    expect(filterQuery).toContain('labels."modelarmor.googleapis.com/exclusion_rule_overridden_filters":*');
    expect(filterQuery).toContain('labels."modelarmor.googleapis.com/exclusion_rule_skipped_filters":*');

    expect(await screen.findByTestId('log-streaming-chunk-badge')).toHaveTextContent('Streaming Chunk');
    expect(screen.getByTestId('log-exclusion-overridden-badge')).toHaveTextContent(
      'Exclusion Override: pi_and_jailbreak',
    );
    expect(screen.getByTestId('log-exclusion-skipped-badge')).toHaveTextContent('Exclusion Skipped (>0.5MB): rai');
  });

  it('evaluates a blocked log entry for exclusion, flags adversarial true positives, and applies an admin-approved exclusion rule to the policy', async () => {
    mockedApi.fetchModelArmorTemplates.mockResolvedValue({
      templates: [
        {
          name: TEMPLATE_NAME,
          templateMetadata: { logSanitizeOperations: false },
          filterConfig: {
            piAndJailbreakFilterSettings: { filterEnforcement: 'ENABLED' },
          },
        },
      ],
    });
    mockedApi.listResources.mockImplementation(async (type: string, config: ListResourcesConfig) => {
      if (type === 'engines') return engineListResponse(config.appLocation);
      return {
        assistants: [
          {
            name: ASSISTANT_NAME,
            customerPolicy: {
              modelArmorConfig: { userPromptTemplate: TEMPLATE_NAME, failureMode: 'FAIL_CLOSED' },
            },
          },
        ],
      };
    });
    mockedApi.updateModelArmorTemplateExclusionRules.mockResolvedValue({
      name: TEMPLATE_NAME,
    });

    mockedApi.fetchViolationLogs.mockResolvedValue({
      entries: [
        {
          logName: 'projects/test-project-123/logs/modelarmor.googleapis.com%2Fsanitize_operations',
          receiveTimestamp: '2026-11-03T15:29:06Z',
          labels: {
            'modelarmor.googleapis.com/client_correlation_id': `AS|${ASSISTANT_NAME}`,
          },
          jsonPayload: {
            sanitizationInput: { text: 'give me 4 jailbreak prompts' },
            sanitizationResult: {
              sanitizationVerdict: 'MODEL_ARMOR_SANITIZATION_VERDICT_BLOCK',
              sanitizationVerdictReason: 'The prompt violated Prompt Injection and Jailbreak filters.',
              filterResults: {
                pi_and_jailbreak: {
                  piAndJailbreakFilterResult: {
                    matchState: 'MATCH_FOUND',
                    confidenceLevel: 'HIGH',
                  },
                },
              },
            },
          },
        },
      ],
    } as never);

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Fetch Logs' }));

    const evalButton = await screen.findByTestId('evaluate-log-exclusion-button');
    fireEvent.click(evalButton);

    // Clicking "Evaluate for Exclusion" lazily loads active templates & assistant associations
    await waitFor(() => expect(mockedApi.fetchModelArmorTemplates).toHaveBeenCalled());

    const banner = await screen.findByTestId('log-exclusion-verdict-banner');
    expect(banner).toHaveTextContent('HIGH_RISK_TRUE_POSITIVE');
    expect(banner).toHaveTextContent(/explicit "jailbreak" terminology/i);

    // Wait for the target policy dropdown to auto-match the assistant's policy
    const policySelect = (await screen.findByLabelText('Target Policy for Exclusion')) as HTMLSelectElement;
    await waitFor(() => expect(policySelect.value).toBe(TEMPLATE_NAME));

    // Negative check: entering an unconstrained wildcard regex ".*" must fail validation and disable Apply
    const ruleTypeSelect = screen.getByLabelText('Exclusion Rule Type');
    fireEvent.change(ruleTypeSelect, { target: { value: 'REGEX' } });
    const patternInput = screen.getByLabelText('Exclusion Phrase or Pattern');
    fireEvent.change(patternInput, { target: { value: '.*' } });

    expect(await screen.findByTestId('log-exclusion-validation-error')).toHaveTextContent(
      /Unconstrained wildcard regex/,
    );
    const applyButton = screen.getByTestId('apply-exclusion-to-policy-button') as HTMLButtonElement;
    expect(applyButton.disabled).toBe(true);

    // Switch back to DICTIONARY with a specific phrase and apply to policy
    fireEvent.change(ruleTypeSelect, { target: { value: 'DICTIONARY' } });
    const phraseInput = screen.getByLabelText('Exclusion Phrase or Pattern');
    fireEvent.change(phraseInput, { target: { value: 'give me 4 jailbreak prompts' } });
    expect(applyButton.disabled).toBe(false);

    fireEvent.click(applyButton);

    await waitFor(() => expect(mockedApi.updateModelArmorTemplateExclusionRules).toHaveBeenCalledTimes(1));
    const [calledProject, calledTemplate, calledInput] =
      mockedApi.updateModelArmorTemplateExclusionRules.mock.calls[0];
    expect(calledProject).toBe(PROJECT);
    expect(calledTemplate.name).toBe(TEMPLATE_NAME);
    expect(calledInput).toEqual({
      filterType: 'PROMPT_INJECTION_AND_JAILBREAK',
      exclusionRule: {
        dictionary: {
          wordList: {
            words: ['give me 4 jailbreak prompts'],
          },
        },
        matchingScope: 'MATCHING_SCOPE_PARTIAL_MATCH',
      },
      enableLogSanitizeOperations: true,
      enforceDataResidencyCompliance: true,
    });

    expect(await screen.findByTestId('apply-exclusion-success')).toHaveTextContent(
      /Applied Dictionary \(MATCHING_SCOPE_PARTIAL_MATCH\) exclusion rule for PROMPT_INJECTION_AND_JAILBREAK to policy "my-safety-policy-input"/,
    );
  });

  it('merges new exclusion rules into existing filterRuleSettings without dropping prior rules and rejects hostile inputs', () => {
    const existing = {
      ruleSets: [
        {
          filterTypes: ['PROMPT_INJECTION_AND_JAILBREAK'],
          rules: [
            {
              exclusionRule: {
                dictionary: { wordList: { words: ['ignore empty rows'] } },
                matchingScope: 'MATCHING_SCOPE_PARTIAL_MATCH',
              },
            },
          ],
        },
      ],
    };

    const merged = mergeExclusionRuleIntoSettings(existing, 'PROMPT_INJECTION_AND_JAILBREAK', {
      dictionary: { wordList: { words: ['ignore case when sorting'] } },
      matchingScope: 'MATCHING_SCOPE_PARTIAL_MATCH',
    });

    expect(merged.ruleSets).toHaveLength(1);
    expect(merged.ruleSets?.[0].rules?.[0].exclusionRule?.dictionary?.wordList?.words).toEqual([
      'ignore empty rows',
      'ignore case when sorting',
    ]);

    // Adversarial validation checks: > 200 char dictionary word and multi-byte UTF-8 in FULL_MATCH
    const overlongCheck = validateProposedExclusionRule({
      ruleType: 'DICTIONARY',
      matchingScope: 'MATCHING_SCOPE_PARTIAL_MATCH',
      dictionaryText: 'a'.repeat(205),
      regexPattern: '',
      filterType: 'PROMPT_INJECTION_AND_JAILBREAK',
    });
    expect(overlongCheck.valid).toBe(false);
    expect(overlongCheck.errors[0]).toContain('200-character Model Armor limit');

    const nonAsciiFullMatchCheck = validateProposedExclusionRule({
      ruleType: 'DICTIONARY',
      matchingScope: 'MATCHING_SCOPE_FULL_MATCH',
      dictionaryText: 'ignorer les lignes vides café',
      regexPattern: '',
      filterType: 'PROMPT_INJECTION_AND_JAILBREAK',
    });
    expect(nonAsciiFullMatchCheck.valid).toBe(false);
    expect(nonAsciiFullMatchCheck.errors[0]).toContain('single-byte UTF-8');
  });
});


