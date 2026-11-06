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
import LatencyLabPage from './LatencyLabPage';
import * as api from '../services/apiService';
import * as evalService from '../services/assistantEvaluationService';
import { AssistantEvaluationReport } from '../services/assistantEvaluationService';

vi.mock('../services/apiService', () => ({
  listResources: vi.fn(),
  getAssistant: vi.fn(),
  createAgent: vi.fn(),
  updateAgent: vi.fn(),
  enableAgent: vi.fn(),
  disableAgent: vi.fn(),
  streamChat: vi.fn(),
}));

const MOCK_REPORT: AssistantEvaluationReport = {
  evaluatedAt: '2026-11-05T22:00:00.000Z',
  projectId: 'test-proj-123',
  location: 'global',
  engineId: 'eng-alpha',
  engineDisplayName: 'Enterprise Alpha Search',
  assistantId: 'default_assistant',
  assistantDisplayName: 'Default Assistant',
  overallScore: 84,
  grade: 'B',
  latencyRiskLevel: 'MODERATE',
  categoryScores: {
    LATENCY_AND_DATASTORES: {
      category: 'LATENCY_AND_DATASTORES',
      label: 'Latency & DataStore Fan-Out',
      score: 18,
      maxScore: 25,
      criticalCount: 0,
      warningCount: 1,
      passCount: 1,
    },
    SKILLS_AND_ROUTING: {
      category: 'SKILLS_AND_ROUTING',
      label: 'Skills & Query Routing',
      score: 20,
      maxScore: 25,
      criticalCount: 0,
      warningCount: 1,
      passCount: 1,
    },
    BYOMCP_ADVISOR: {
      category: 'BYOMCP_ADVISOR',
      label: 'BYOMCP Datastores & Tools',
      score: 16,
      maxScore: 20,
      criticalCount: 0,
      warningCount: 0,
      passCount: 1,
    },
    ASSISTANT_AND_ENGINE_CONFIG: {
      category: 'ASSISTANT_AND_ENGINE_CONFIG',
      label: 'Assistant & Engine Config',
      score: 15,
      maxScore: 15,
      criticalCount: 0,
      warningCount: 0,
      passCount: 1,
    },
    SECURITY_AND_GOVERNANCE: {
      category: 'SECURITY_AND_GOVERNANCE',
      label: 'Security & Guardrails',
      score: 15,
      maxScore: 15,
      criticalCount: 0,
      warningCount: 0,
      passCount: 1,
    },
  },
  metrics: {
    connectedDataStoresCount: 7,
    totalProjectDataStoresCount: 9,
    connectedConnectorsCount: 2,
    byomcpConnectorsCount: 1,
    enabledSkillsCount: 2,
    privateOrDisabledSkillsCount: 0,
    skillsMissingDescriptionCount: 0,
    conversationalAgentsCount: 1,
  },
  findings: [
    {
      id: 'datastore-moderate-fanout-latency',
      category: 'LATENCY_AND_DATASTORES',
      severity: 'WARNING',
      title: 'Elevated DataStore Fan-Out Risk (7 Connected Stores)',
      summary: 'Broad prompts may fan out across 7 stores simultaneously.',
      currentValue: '7 Connected DataStores',
      recommendedValue: 'Guided by Query Routing Skills or <= 5 DataStores',
      impact: 'Increased P95 latency on unscoped queries.',
      remediation: 'Deploy an Organizational Query-Routing Skill.',
      targetTab: 'skills',
      recommendedSkillId: 'skill-datastore-router',
    },
  ],
  byomcpEvaluations: [],
  recommendedSkills: [
    {
      id: 'skill-datastore-router',
      skillIdSuggestion: 'enterprise-datastore-query-optimizer',
      displayName: 'Enterprise DataStore Query Router and Optimizer',
      description:
        'Routes user queries to the single most authoritative DataStore (confluence_eng, jira_prod) to prevent multi-store fan-out latency.',
      instruction:
        '## Purpose\nRoute user questions to the single most authoritative DataStore (`confluence_eng` or `jira_prod`) first.',
      rationale: 'Prevents parallel fan-out across 7 connected stores.',
      targetSources: ['confluence_eng', 'jira_prod'],
      sampleQueries: [
        'Search confluence_eng for our production deployment architecture and runbooks.',
        'Find open P1 incident tickets in jira_prod.',
      ],
    },
  ],
  connectedDataStoreResourceNames: [
    'projects/test-proj-123/locations/global/collections/default_collection/dataStores/confluence_eng',
    'projects/test-proj-123/locations/global/collections/default_collection/dataStores/jira_prod',
  ],
  probeWarnings: [],
};

describe('LatencyLabPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listResources).mockImplementation(async (resourceType: string) => {
      if (resourceType === 'engines') {
        return {
          engines: [
            {
              name: 'projects/test-proj-123/locations/global/collections/default_collection/engines/eng-alpha',
              displayName: 'Enterprise Alpha Search',
              solutionType: 'SOLUTION_TYPE_SEARCH',
              appType: 'APP_TYPE_INTRANET',
              dataStoreIds: ['confluence_eng', 'jira_prod'],
            },
          ],
        };
      }
      if (resourceType === 'assistants') {
        return {
          assistants: [
            {
              name: 'projects/test-proj-123/locations/global/collections/default_collection/engines/eng-alpha/assistants/default_assistant',
              displayName: 'Default Assistant',
            },
          ],
        };
      }
      if (resourceType === 'agents') {
        return { agents: [] };
      }
      return {};
    });

    vi.spyOn(evalService, 'runLiveAssistantEvaluation').mockResolvedValue(MOCK_REPORT);
  });

  it('loads target engine, renders architecture telemetry, and executes a live :streamAssist latency benchmark suite', async () => {
    vi.spyOn(evalService, 'runSkillBenchmarkPhase').mockResolvedValue({
      ranAt: '2026-11-05T22:05:00.000Z',
      avgLatencyMs: 1450,
      avgTtfbMs: 420,
      avgTtftMs: 420,
      avgTtfaMs: 980,
      skillTriggerRate: 100,
      runs: [
        {
          query: 'Search confluence_eng for our production deployment architecture and runbooks.',
          totalLatencyMs: 1300,
          ttfbMs: 390,
          ttftMs: 390,
          ttfaMs: 910,
          answerPreview: 'Our production deployment follows blue/green canary stages.',
          thoughtSteps: ['Routing query to confluence_eng DataStore.'],
          citationsCount: 3,
          routedSources: ['confluence_eng'],
          skillTriggered: true,
        },
        {
          query: 'Find open P1 incident tickets in jira_prod.',
          totalLatencyMs: 1600,
          ttfbMs: 450,
          ttftMs: 450,
          ttfaMs: 1050,
          answerPreview: 'Found 2 active P1 incidents in jira_prod.',
          thoughtSteps: ['Querying jira_prod for priority P1 issues.'],
          citationsCount: 2,
          routedSources: ['jira_prod'],
          skillTriggered: true,
        },
      ],
    });

    render(
      <LatencyLabPage
        projectNumber="test-proj-123"
        setProjectNumber={vi.fn()}
        accessToken="mock-token"
        userProfile={null}
      />,
    );

    expect(
      await screen.findByText('Gemini Enterprise Latency Testing Lab'),
    ).toBeInTheDocument();
    expect(await screen.findByText('Grade B')).toBeInTheDocument();
    expect(screen.getByText('MODERATE')).toBeInTheDocument();

    const runBtn = screen.getByRole('button', {
      name: /Run Live :streamAssist Benchmark/i,
    });
    fireEvent.click(runBtn);

    const resultsRegion = await screen.findByTestId('suite-benchmark-results');
    expect(resultsRegion).toBeInTheDocument();
    expect(screen.getByText('1,450 ms')).toBeInTheDocument();
    expect(screen.getByText('420 ms')).toBeInTheDocument();
    expect(screen.getByText('5 citations')).toBeInTheDocument();

    // Expand planner trace on Q1
    const inspectBtns = screen.getAllByRole('button', { name: /Inspect Trace/i });
    fireEvent.click(inspectBtns[0]);
    expect(
      await screen.findByText('Routing query to confluence_eng DataStore.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Our production deployment follows blue/green canary stages.'),
    ).toBeInTheDocument();
  });

  it('runs Before vs. After Skill A/B comparison, computes latency delta, and applies diagnostic fixes', async () => {
    const phaseSpy = vi.spyOn(evalService, 'runSkillBenchmarkPhase');
    // Call 1: Baseline (1,900 ms)
    phaseSpy.mockResolvedValueOnce({
      ranAt: '2026-11-05T22:10:00.000Z',
      avgLatencyMs: 1900,
      avgTtfbMs: 610,
      skillTriggerRate: 50,
      runs: [
        {
          query: 'Search confluence_eng for our production deployment architecture and runbooks.',
          totalLatencyMs: 1900,
          ttfbMs: 610,
          answerPreview: 'Baseline response.',
          thoughtSteps: ['Searching across all connected stores...'],
          citationsCount: 2,
          routedSources: ['confluence_eng'],
          skillTriggered: true,
        },
      ],
    });
    // Call 2: Post-Skill (1,180 ms -> 720 ms faster)
    phaseSpy.mockResolvedValueOnce({
      ranAt: '2026-11-05T22:11:00.000Z',
      avgLatencyMs: 1180,
      avgTtfbMs: 340,
      skillTriggerRate: 100,
      runs: [
        {
          query: 'Search confluence_eng for our production deployment architecture and runbooks.',
          totalLatencyMs: 1180,
          ttfbMs: 340,
          answerPreview: 'Post-skill targeted response.',
          thoughtSteps: ['Directly querying confluence_eng.'],
          citationsCount: 3,
          routedSources: ['confluence_eng'],
          skillTriggered: true,
        },
      ],
    });

    vi.mocked(api.createAgent).mockResolvedValue({
      name: 'projects/test-proj-123/locations/global/collections/default_collection/engines/eng-alpha/assistants/default_assistant/agents/enterprise-datastore-query-optimizer',
      displayName: 'Enterprise DataStore Query Router and Optimizer',
      state: 'ENABLED',
    });

    render(
      <LatencyLabPage
        projectNumber="test-proj-123"
        setProjectNumber={vi.fn()}
        accessToken="mock-token"
        userProfile={null}
      />,
    );

    await screen.findByText('Grade B');

    // Switch to Tab 2: Before vs. After Skill A/B Lab
    fireEvent.click(
      screen.getByRole('button', { name: /2\. Before vs\. After Skill A\/B Lab/i }),
    );

    // Step 1: Run Baseline
    fireEvent.click(
      screen.getByRole('button', { name: /1\. Run Baseline \(Before Skill\)/i }),
    );
    expect(await screen.findByText(/^1,900 ms avg total$/i)).toBeInTheDocument();

    // Step 2: Deploy Skill
    fireEvent.click(
      screen.getByRole('button', { name: /2\. Deploy \/ Update Skill/i }),
    );
    await waitFor(() => {
      expect(api.createAgent).toHaveBeenCalledTimes(1);
    });

    // Step 3: Run After Skill & Diagnose
    fireEvent.click(
      screen.getByRole('button', { name: /3\. Run After Skill & Diagnose/i }),
    );
    expect(await screen.findByText(/^1,180 ms avg total$/i)).toBeInTheDocument();
    expect(screen.getByText(/⚡ 720 ms Faster \(-38%\)/i)).toBeInTheDocument();
  });

  it('rejects empty benchmark queries and missing skill fields with explicit error alerts (Negative/Adversarial)', async () => {
    render(
      <LatencyLabPage
        projectNumber="test-proj-123"
        setProjectNumber={vi.fn()}
        accessToken="mock-token"
        userProfile={null}
      />,
    );

    await screen.findByText('Grade B');

    // Clear all queries in Tab 1
    const q1Input = screen.getByLabelText('Benchmark Query 1');
    const q2Input = screen.getByLabelText('Benchmark Query 2');
    fireEvent.change(q1Input, { target: { value: '   ' } });
    fireEvent.change(q2Input, { target: { value: '' } });

    fireEvent.click(
      screen.getByRole('button', { name: /Run Live :streamAssist Benchmark/i }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Please enter at least one non-empty benchmark query before running.',
    );

    // Switch to Tab 2 and clear Trigger Description -> verify deployment is rejected
    fireEvent.click(
      screen.getByRole('button', { name: /2\. Before vs\. After Skill A\/B Lab/i }),
    );
    const descInput = screen.getByLabelText(
      /Skill Trigger Description \(Matched by Planner against User Prompts\)/i,
    );
    fireEvent.change(descInput, { target: { value: '   ' } });

    fireEvent.click(
      screen.getByRole('button', { name: /2\. Deploy \/ Update Skill/i }),
    );

    const statusAlert = await screen.findByRole('status');
    expect(statusAlert).toHaveTextContent(
      'Both Trigger Description and Markdown Instructions are required to deploy a Skill.',
    );
    expect(api.createAgent).not.toHaveBeenCalled();
  });

  it('surfaces engine discovery API errors without swallowing exceptions', async () => {
    vi.mocked(api.listResources).mockRejectedValueOnce(
      new Error('403 PERMISSION_DENIED: discoveryengine.engines.list denied'),
    );

    render(
      <LatencyLabPage
        projectNumber="test-proj-123"
        setProjectNumber={vi.fn()}
        accessToken="mock-token"
        userProfile={null}
      />,
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      '403 PERMISSION_DENIED: discoveryengine.engines.list denied',
    );
  });

  it('scopes DataStores/Connectors via the Advanced selector and renders client-observed TTFT and TTFA chunk telemetry', async () => {
    const phaseSpy = vi.spyOn(evalService, 'runSkillBenchmarkPhase').mockResolvedValue({
      ranAt: '2026-11-06T13:45:00.000Z',
      avgLatencyMs: 1280,
      avgTtfbMs: 190,
      avgTtftMs: 390,
      avgTtfaMs: 820,
      avgPlannerRetrievalMs: 430,
      scopedDataStoresCount: 1,
      skillTriggerRate: 100,
      runs: [
        {
          query: 'Search confluence_eng for our production deployment architecture and runbooks.',
          totalLatencyMs: 1280,
          ttfbMs: 190,
          ttftMs: 390,
          ttfaMs: 820,
          plannerAndRetrievalMs: 430,
          answerGenerationTailMs: 460,
          answerPreview: 'Direct 1-store deployment runbook summary.',
          thoughtSteps: ['Routing directly to confluence_eng DataStore.'],
          citationsCount: 4,
          routedSources: ['confluence_eng'],
          skillTriggered: true,
        },
      ],
    });

    render(
      <LatencyLabPage
        projectNumber="test-proj-123"
        setProjectNumber={vi.fn()}
        accessToken="mock-token"
        userProfile={null}
      />,
    );

    await screen.findByText('Grade B');

    // Open Advanced DataStores & Connectors panel
    const advBtn = screen.getByTestId('toggle-advanced-datastore-selector');
    expect(advBtn).toHaveTextContent('2/2');
    fireEvent.click(advBtn);

    const advPanel = await screen.findByTestId('advanced-datastore-selector-panel');
    expect(advPanel).toBeInTheDocument();

    // Uncheck jira_prod so only confluence_eng is included in the :streamAssist query
    const jiraCheckbox = screen.getByLabelText('Include DataStore jira_prod') as HTMLInputElement;
    expect(jiraCheckbox.checked).toBe(true);
    fireEvent.click(jiraCheckbox);
    expect(jiraCheckbox.checked).toBe(false);
    expect(advBtn).toHaveTextContent('1/2');

    // Run live :streamAssist benchmark
    fireEvent.click(
      screen.getByRole('button', { name: /Run Live :streamAssist Benchmark/i }),
    );

    await screen.findByTestId('suite-benchmark-results');

    // Verify runSkillBenchmarkPhase received only the selected DataStore resource URI
    expect(phaseSpy).toHaveBeenCalledTimes(1);
    expect(phaseSpy.mock.calls[0][3]).toEqual([
      'projects/test-proj-123/locations/global/collections/default_collection/dataStores/confluence_eng',
    ]);

    // Verify client-observed TTFT, TTFA, and Planner & Retrieval window telemetry are displayed
    expect(screen.getByText('Avg TTFT (1st Thought Chunk)')).toBeInTheDocument();
    expect(screen.getByText('Avg TTFA (1st Answer Chunk)')).toBeInTheDocument();
    expect(screen.getByText('820 ms')).toBeInTheDocument();
    expect(screen.getByText(/Planner & Retrieval: \+430 ms/i)).toBeInTheDocument();
    expect(screen.getByText('TTFT: 390 ms')).toBeInTheDocument();
    expect(screen.getByText('TTFA: 820 ms')).toBeInTheDocument();
  });

  it('automatically pauses an already-ENABLED Skill before Phase 1 Baseline and flags fast-failing Post-Skill runs as unverified errors (Adversarial)', async () => {
    const existingEnabledAgentName =
      'projects/test-proj-123/locations/global/collections/default_collection/engines/eng-alpha/assistants/default_assistant/agents/enterprise-datastore-query-optimizer';

    vi.mocked(api.listResources).mockImplementation(async (resourceType: string) => {
      if (resourceType === 'engines') {
        return {
          engines: [
            {
              name: 'projects/test-proj-123/locations/global/collections/default_collection/engines/eng-alpha',
              displayName: 'Enterprise Alpha Search',
              solutionType: 'SOLUTION_TYPE_SEARCH',
              appType: 'APP_TYPE_INTRANET',
              dataStoreIds: ['confluence_eng', 'jira_prod'],
            },
          ],
        };
      }
      if (resourceType === 'assistants') {
        return {
          assistants: [
            {
              name: 'projects/test-proj-123/locations/global/collections/default_collection/engines/eng-alpha/assistants/default_assistant',
              displayName: 'Default Assistant',
            },
          ],
        };
      }
      if (resourceType === 'agents') {
        return {
          agents: [
            {
              name: existingEnabledAgentName,
              displayName: 'Enterprise DataStore Query Router and Optimizer',
              state: 'ENABLED',
              skillAgentDefinition: {
                instruction: 'Existing instruction',
              },
            },
          ],
        };
      }
      return {};
    });

    vi.mocked(api.disableAgent).mockResolvedValue({
      name: existingEnabledAgentName,
      displayName: 'Enterprise DataStore Query Router and Optimizer',
      state: 'DISABLED',
    });

    const phaseSpy = vi.spyOn(evalService, 'runSkillBenchmarkPhase');
    // Baseline: 2,400 ms grounded
    phaseSpy.mockResolvedValueOnce({
      ranAt: '2026-11-06T14:00:00.000Z',
      avgLatencyMs: 2400,
      avgTtfbMs: 500,
      skillTriggerRate: 0,
      runs: [
        {
          query: 'Search confluence_eng for our production deployment architecture and runbooks.',
          totalLatencyMs: 2400,
          ttfbMs: 500,
          answerPreview: 'Grounded baseline answer.',
          thoughtSteps: ['Searching stores...'],
          citationsCount: 2,
          routedSources: ['confluence_eng'],
          skillTriggered: false,
        },
      ],
    });
    // Post-Skill: fast-failed / skipped in 150 ms with empty answer
    phaseSpy.mockResolvedValueOnce({
      ranAt: '2026-11-06T14:01:00.000Z',
      avgLatencyMs: 150,
      avgTtfbMs: 150,
      skillTriggerRate: 0,
      runs: [
        {
          query: 'Search confluence_eng for our production deployment architecture and runbooks.',
          totalLatencyMs: 150,
          ttfbMs: 150,
          answerPreview: '',
          thoughtSteps: [],
          citationsCount: 0,
          routedSources: [],
          skillTriggered: false,
          skippedReason: 'NON_ASSIST_SEEKING_QUERY_IGNORED',
        },
      ],
    });

    render(
      <LatencyLabPage
        projectNumber="test-proj-123"
        setProjectNumber={vi.fn()}
        accessToken="mock-token"
        userProfile={null}
      />,
    );

    await screen.findByText('Grade B');

    fireEvent.click(
      screen.getByRole('button', { name: /2\. Before vs\. After Skill A\/B Lab/i }),
    );

    // Step 1: Run Baseline -> must call api.disableAgent on the already-ENABLED skill first
    fireEvent.click(
      screen.getByRole('button', { name: /1\. Run Baseline \(Before Skill\)/i }),
    );

    await waitFor(() => {
      expect(api.disableAgent).toHaveBeenCalledWith(
        existingEnabledAgentName,
        expect.objectContaining({ appId: 'eng-alpha' }),
      );
    });
    expect(await screen.findByText(/^2,400 ms avg total$/i)).toBeInTheDocument();

    // Step 3: Run After Skill & Diagnose (when all queries skipped/failed in 150 ms)
    fireEvent.click(
      screen.getByRole('button', { name: /3\. Run After Skill & Diagnose/i }),
    );

    // Must NOT render "⚡ ... Faster", must render the unverified error warning badge
    expect(
      await screen.findByText(/Unverified — Check Errors/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/⚡ .* Faster/i)).not.toBeInTheDocument();
  });
});

