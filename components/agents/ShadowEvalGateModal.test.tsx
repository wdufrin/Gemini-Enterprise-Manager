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
import ShadowEvalGateModal, {
  computeP95Latency,
  parseGoldenEvalDataset,
  runShadowEvaluationSuite,
  serializeShadowEvalJson,
  serializeShadowEvalMarkdown,
} from './ShadowEvalGateModal';
import BulkEditSharePublishModal from './BulkEditSharePublishModal';
import { buildAgent30dAdoptionSql } from './AgentList';
import AgentsPage, { ALL_ENGINES_VALUE } from '../../pages/AgentsPage';
import AgentEnginesPage from '../../pages/AgentEnginesPage';
import { AgentEnginesModals } from '../agent-engines/AgentEnginesModals';
import LatencyLabPage from '../../pages/LatencyLabPage';
import {
  evaluateAssistantData,
  runSkillBenchmarkPhase,
} from '../../services/assistantEvaluationService';
import {
  parseAgentOwnerRemapCsv,
  parseAgentBulkFieldsCsv,
  bulkEditSharePublishAgents,
} from '../../services/api/discovery/agents';
import * as api from '../../services/apiService';
import * as bqApi from '../../services/api/bigquery';
import * as coreApi from '../../services/api/core';
import { ToastProvider } from '../../context/ToastContext';
import { Agent, AppEngine, Assistant, Config } from '../../types';

vi.mock('../../services/apiService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/apiService')>();
  return {
    ...actual,
    streamChat: vi.fn(),
    listResources: vi.fn(),
    getAgentView: vi.fn(),
    getAgentIamPolicy: vi.fn(),
    disableAgent: vi.fn(),
    enableAgent: vi.fn(),
    updateAgent: vi.fn(),
    getAssistant: vi.fn(),
    listAllReasoningEngines: vi.fn(),
    listReasoningEngines: vi.fn(),
    listAllReasoningEngineSessions: vi.fn(),
    listReasoningEngineSessions: vi.fn(),
    listCloudRunServices: vi.fn(),
  };
});

vi.mock('../../services/api/bigquery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api/bigquery')>();
  return {
    ...actual,
    runBigQueryQuery: vi.fn(),
  };
});

vi.mock('../../services/api/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api/core')>();
  return {
    ...actual,
    gapiRequest: vi.fn(),
  };
});

const baseConfig: Config = {
  projectId: 'proj-fleet-123',
  appLocation: 'global',
  collectionId: 'default_collection',
  appId: 'eng-global',
  assistantId: 'default_assistant',
};

const sampleHrAgent: Agent = {
  name: 'projects/proj-fleet-123/locations/global/collections/default_collection/engines/eng-global/assistants/default_assistant/agents/agent-hr',
  displayName: 'HR Benefits Concierge',
  description: 'Answers employee benefits and PTO questions.',
  state: 'ENABLED',
  sharingConfig: { scope: 'ALL_USERS' },
  adkAgentDefinition: {
    provisionedReasoningEngine: {
      reasoningEngine: 'projects/proj-fleet-123/locations/us-central1/reasoningEngines/re-1',
    },
  },
};

const sampleUsAgent: Agent = {
  name: 'projects/proj-fleet-123/locations/us/collections/default_collection/engines/eng-us-west/assistants/default_assistant/agents/agent-sec',
  displayName: 'Security Incident Responder',
  description: 'Handles SOC playbooks in US region.',
  state: 'ENABLED',
  sharingConfig: { scope: 'RESTRICTED' },
  adkAgentDefinition: {
    provisionedReasoningEngine: {
      reasoningEngine: 'projects/proj-fleet-123/locations/us-central1/reasoningEngines/re-2',
    },
  },
};

describe('Item #5: ShadowEvalGateModal & Non-Destructive Regression Gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses valid JSONL, JSON array, and RFC-4180 CSV Golden Q&A datasets accurately', () => {
    const jsonl = [
      '# Comment line ignored',
      '{"prompt": "What is our PTO rollover cap?", "expectedKeywordOrSubstring": "80 hours", "requireCitations": true}',
      '{"prompt": "Who approves international travel?", "expectedKeywordOrSubstring": "VP", "requireCitations": false}',
    ].join('\n');

    const resJsonl = parseGoldenEvalDataset(jsonl, 'auto');
    expect(resJsonl.errors).toEqual([]);
    expect(resJsonl.cases).toHaveLength(2);
    expect(resJsonl.cases[0]).toMatchObject({
      prompt: 'What is our PTO rollover cap?',
      expectedKeywordOrSubstring: '80 hours',
      requireCitations: true,
    });

    const csv = [
      'prompt,expectedKeywordOrSubstring,requireCitations',
      '"Explain policy ""Alpha, v2"" rules",Alpha,true',
      'List holiday dates,December,no',
    ].join('\n');

    const resCsv = parseGoldenEvalDataset(csv, 'csv');
    expect(resCsv.errors).toEqual([]);
    expect(resCsv.cases).toHaveLength(2);
    expect(resCsv.cases[0].prompt).toBe('Explain policy "Alpha, v2" rules');
    expect(resCsv.cases[0].expectedKeywordOrSubstring).toBe('Alpha');
    expect(resCsv.cases[0].requireCitations).toBe(true);
    expect(resCsv.cases[1].requireCitations).toBe(false);
  });

  it('rejects empty, malformed JSONL, unclosed CSV quotes, and missing prompts with explicit errors (Negative/Adversarial)', () => {
    expect(parseGoldenEvalDataset('   ').errors[0]).toMatch(/empty/i);

    const badJsonl = '{"prompt": "Valid"}\n{broken_json_here}\n{"expectedKeywordOrSubstring": "no prompt"}';
    const resBadJsonl = parseGoldenEvalDataset(badJsonl, 'jsonl');
    expect(resBadJsonl.cases).toHaveLength(1);
    expect(resBadJsonl.errors).toHaveLength(2);
    expect(resBadJsonl.errors[0]).toMatch(/Line 2: Invalid JSONL/i);
    expect(resBadJsonl.errors[1]).toMatch(/Line 3: Missing non-empty "prompt"/i);

    const unclosedCsv = 'prompt,expectedKeywordOrSubstring\n"Unclosed quote prompt,expected';
    const resUnclosed = parseGoldenEvalDataset(unclosedCsv, 'csv');
    expect(resUnclosed.cases).toHaveLength(0);
    expect(resUnclosed.errors[0]).toMatch(/Unclosed double quote/i);
  });

  it('executes ephemeral :streamAssist queries with bounded concurrency <= 2, zero live state mutations, and produces JSON/Markdown scorecards', async () => {
    let activeInFlight = 0;
    let maxObservedConcurrency = 0;

    vi.mocked(api.streamChat).mockImplementation(
      async (agentName, query, sessionId, cfg, _token, onChunk) => {
        // Must ALWAYS use isolated ephemeral session (null)
        expect(sessionId).toBeNull();
        activeInFlight += 1;
        maxObservedConcurrency = Math.max(maxObservedConcurrency, activeInFlight);
        await new Promise((r) => setTimeout(r, 15));
        onChunk({
          answer: {
            replies: [
              {
                groundedContent: {
                  content: { thought: true, text: `Planning for ${cfg.appLocation}` },
                },
              },
              {
                groundedContent: {
                  content: {
                    text:
                      query.includes('PTO')
                        ? `Employees may roll over up to 80 hours of PTO (${agentName}).`
                        : ' Escalation goes to SOC Tier-2.',
                  },
                  textGroundingMetadata: {
                    references: [{ uri: 'https://intranet.example.com/hr-pto' }],
                  },
                },
              },
            ],
          },
        });
        activeInFlight -= 1;
      },
    );

    const scorecard = await runShadowEvaluationSuite({
      agents: [sampleHrAgent, sampleUsAgent],
      cases: [
        {
          id: 'c1',
          prompt: 'What is our PTO rollover cap?',
          expectedKeywordOrSubstring: '80 hours',
          requireCitations: true,
        },
        {
          id: 'c2',
          prompt: 'How do we escalate an incident?',
          expectedKeywordOrSubstring: 'SOC Tier-2',
          requireCitations: true,
        },
      ],
      config: { ...baseConfig, appId: ALL_ENGINES_VALUE },
      accessToken: 'tok-test',
    });

    expect(maxObservedConcurrency).toBeLessThanOrEqual(2);
    expect(api.disableAgent).not.toHaveBeenCalled();
    expect(api.enableAgent).not.toHaveBeenCalled();
    expect(api.updateAgent).not.toHaveBeenCalled();

    expect(scorecard.totalExecutions).toBe(4);
    expect(scorecard.passedExecutions).toBe(4);
    expect(scorecard.overallPassed).toBe(true);
    expect(scorecard.overallPassRatePct).toBe(100);
    expect(computeP95Latency([10, 20, 30, 40, 100])).toBe(100);

    const md = serializeShadowEvalMarkdown(scorecard);
    expect(md).toContain('# Shadow Evaluation & Regression Gate Scorecard');
    expect(md).toContain('**PASS**');
    expect(md).toContain('`us / eng-us-west`');

    const parsedJson = JSON.parse(serializeShadowEvalJson(scorecard));
    expect(parsedJson.overallPassed).toBe(true);
    expect(parsedJson.agentSummaries).toHaveLength(2);
  });

  it('blocks the regression gate when citations are missing, expected keywords fail, or :streamAssist errors (Negative)', async () => {
    await expect(
      runShadowEvaluationSuite({
        agents: [],
        cases: [{ id: '1', prompt: 'Hello' }],
        config: baseConfig,
      }),
    ).rejects.toThrow(/Select at least one target agent/i);

    await expect(
      runShadowEvaluationSuite({
        agents: [sampleHrAgent],
        cases: [{ id: '1', prompt: '   ' }],
        config: baseConfig,
      }),
    ).rejects.toThrow(/non-empty prompt/i);

    vi.mocked(api.streamChat).mockImplementation(async (_ag, query, _sess, _cfg, _tok, onChunk) => {
      if (query.includes('timeout')) {
        throw new Error('504 DEADLINE_EXCEEDED');
      }
      onChunk({
        answer: {
          replies: [
            {
              groundedContent: {
                content: { text: 'Uncited generic answer without expected token.' },
                textGroundingMetadata: { references: [] },
              },
            },
          ],
        },
      });
    });

    render(
      <ShadowEvalGateModal
        isOpen={true}
        onClose={vi.fn()}
        agents={[sampleHrAgent]}
        config={baseConfig}
        accessToken="tok-1"
      />,
    );

    fireEvent.click(screen.getByTestId('toggle-paste-dataset-btn'));
    fireEvent.change(screen.getByLabelText(/Golden dataset JSONL or CSV input/i), {
      target: {
        value: [
          '{"prompt": "Policy check", "expectedKeywordOrSubstring": "80 hours", "requireCitations": true}',
          '{"prompt": "Simulate timeout", "expectedKeywordOrSubstring": "ok", "requireCitations": false}',
        ].join('\n'),
      },
    });
    fireEvent.click(screen.getByTestId('import-golden-dataset-btn'));

    fireEvent.click(screen.getByTestId('run-shadow-eval-btn'));

    const verdict = await screen.findByTestId('shadow-eval-gate-verdict');
    expect(verdict.textContent).toMatch(/GATE BLOCKED \(0% < 100%\)/i);
    expect(screen.getByText(/504 DEADLINE_EXCEEDED/i)).toBeInTheDocument();
  });

  it('opens ShadowEvalGateModal directly from inside BulkEditSharePublishModal without losing wizard state', async () => {
    render(
      <BulkEditSharePublishModal
        isOpen={true}
        onClose={vi.fn()}
        agents={[sampleHrAgent]}
        config={baseConfig}
        accessToken="tok-bulk"
        onComplete={vi.fn()}
      />,
    );

    const openGateBtn = screen.getByTestId('bulk-open-shadow-eval-gate-btn');
    expect(openGateBtn.textContent).toMatch(/Shadow Eval Gate \(1\)/i);
    fireEvent.click(openGateBtn);

    expect(await screen.findByTestId('shadow-eval-gate-modal')).toBeInTheDocument();
  });
});

describe('Item #7: Multi-Engine Cross-Region Fleet View, Metadata Cache & 30d BQ Adoption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enumerates global/us/eu engines when __ALL_ENGINES__ is selected, tags rows with [location / engineId], reuses metadata cache, and overlays 30d BQ adoption', async () => {
    const globalEngine: AppEngine = {
      name: 'projects/proj-fleet-123/locations/global/collections/default_collection/engines/eng-global',
      displayName: 'Global HQ App',
      solutionType: 'SOLUTION_TYPE_GENERATIVE_CHAT',
    };
    const usEngine: AppEngine = {
      name: 'projects/proj-fleet-123/locations/us/collections/default_collection/engines/eng-us-west',
      displayName: 'US West App',
      solutionType: 'SOLUTION_TYPE_GENERATIVE_CHAT',
    };

    vi.mocked(api.listResources).mockImplementation(async (resourceType: string, cfg: unknown) => {
      const c = cfg as Config;
      if (resourceType === 'engines') {
        if (c.appLocation === 'global') return { engines: [globalEngine] };
        if (c.appLocation === 'us') return { engines: [usEngine] };
        return { engines: [] };
      }
      if (resourceType === 'assistants') {
        return {
          assistants: [
            {
              name: `projects/${c.projectId}/locations/${c.appLocation}/collections/default_collection/engines/${c.appId}/assistants/default_assistant`,
              displayName: 'Default Assistant',
            },
          ],
        };
      }
      if (resourceType === 'agents') {
        if (c.appLocation === 'global' && c.appId === 'eng-global') {
          return { agents: [sampleHrAgent] };
        }
        if (c.appLocation === 'us' && c.appId === 'eng-us-west') {
          return { agents: [sampleUsAgent] };
        }
        return { agents: [] };
      }
      return {};
    });

    vi.mocked(api.getAgentView).mockResolvedValue({
      agentView: { agentType: 'ADK', agentOrigin: 'CUSTOMER' },
    });
    vi.mocked(api.getAgentIamPolicy).mockResolvedValue({
      bindings: [{ role: 'roles/discoveryengine.owner', members: ['user:fleet-admin@example.com'] }],
    });

    vi.mocked(bqApi.runBigQueryQuery).mockResolvedValue({
      jobComplete: true,
      rows: [
        {
          f: [
            { v: 'agent-hr' },
            { v: 'HR Benefits Concierge' },
            { v: '142' },
            { v: '19' },
          ],
        },
      ],
    });

    render(
      <ToastProvider>
        <AgentsPage
          projectNumber="proj-fleet-123"
          setProjectNumber={vi.fn()}
          accessToken="tok-fleet"
        />
      </ToastProvider>,
    );

    // Wait for initial single-engine auto-select load of HR Benefits Concierge
    await waitFor(() => {
      expect(screen.getByText('HR Benefits Concierge')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(api.getAgentIamPolicy).toHaveBeenCalledTimes(1);
    });

    // Switch Engine selector to __ALL_ENGINES__ (Unified Fleet View)
    const engineSelect = screen.getByLabelText(/Gemini Enterprise App/i);
    fireEvent.change(engineSelect, {
      target: { name: 'appId', value: ALL_ENGINES_VALUE },
    });

    // Both Global and US agents render with [location / engineId] fleet tags
    await waitFor(() => {
      expect(screen.getByText('HR Benefits Concierge')).toBeInTheDocument();
      expect(screen.getByText('Security Incident Responder')).toBeInTheDocument();
    });
    expect(screen.getByTestId('agent-fleet-source-agent-hr').textContent).toBe(
      '[global / eng-global]',
    );
    expect(screen.getByTestId('agent-fleet-source-agent-sec').textContent).toBe(
      '[us / eng-us-west]',
    );

    // Metadata cache check: sampleHrAgent already had its IAM policy cached on initial load,
    // so switching to __ALL_ENGINES__ only needed 1 additional :getIamPolicy call for sampleUsAgent (total = 2, not 3)
    await waitFor(() => {
      expect(api.getAgentIamPolicy).toHaveBeenCalledTimes(2);
    });

    // Open "Load 30d Adoption (BQ)" popover and overlay adoption badges
    fireEvent.click(screen.getByTestId('open-bq-adoption-popover-btn'));
    fireEvent.click(screen.getByTestId('run-bq-adoption-query-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('agent-adoption-badge-agent-hr').textContent).toContain(
        '142 queries · 19 users (30d)',
      );
      expect(screen.getByTestId('agent-adoption-badge-agent-sec').textContent).toContain(
        'Zombie · 0 queries (30d)',
      );
    });

    // Adversarial SQL injection check on buildAgent30dAdoptionSql
    expect(() =>
      buildAgent30dAdoptionSql('proj-fleet-123', 'bad_ds; DROP TABLE gem_accel_user_activity;--'),
    ).toThrow(/Invalid BigQuery dataset identifier/i);
    expect(() =>
      buildAgent30dAdoptionSql('proj`whoami`', 'valid_dataset'),
    ).toThrow(/Invalid BigQuery project identifier/i);
  });
});

describe('Critical Fleet, Evaluation & Runtime Pagination Bug Fixes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects duplicate displayName collisions in parseAgentOwnerRemapCsv and parseAgentBulkFieldsCsv instead of overwriting all matching agents', () => {
    const dupAgent1: Agent = {
      name: 'projects/p/locations/global/collections/default_collection/engines/e/assistants/default_assistant/agents/sales-bot-v1',
      displayName: 'Sales Assistant',
      state: 'ENABLED',
    };
    const dupAgent2: Agent = {
      name: 'projects/p/locations/global/collections/default_collection/engines/e/assistants/default_assistant/agents/sales-bot-v2',
      displayName: 'Sales Assistant',
      state: 'ENABLED',
    };

    const csvByAmbiguousName = [
      'agent_id,new_owner',
      '"Sales Assistant",alice@example.com',
      'sales-bot-v2,bob@example.com',
    ].join('\n');

    const res = parseAgentOwnerRemapCsv(csvByAmbiguousName, [dupAgent1, dupAgent2]);
    expect(res.validationErrors).toHaveLength(1);
    expect(res.validationErrors[0]).toContain(
      'Ambiguous displayName "Sales Assistant" matches 2 agents; use unique agent_id instead',
    );
    // dupAgent1 must NOT be overwritten; dupAgent2 matched by unique agent_id succeeds
    expect(res.matchedMap[dupAgent1.name]).toBeUndefined();
    expect(res.matchedMap[dupAgent2.name]).toBe('user:bob@example.com');

    const bulkRes = parseAgentBulkFieldsCsv(
      'agent_id,new_description\n"Sales Assistant","Updated description"',
      [dupAgent1, dupAgent2],
      'description',
    );
    expect(bulkRes.validationErrors[0]).toContain(
      'Ambiguous displayName "Sales Assistant" matches 2 agents; use unique agent_id instead',
    );
    expect(bulkRes.descriptionRemapByAgent).toEqual({});
  });

  it('preserves completedSteps in bulkEditSharePublishAgents when Step 4 (setAgentIamPolicy) fails after Steps 1-3 succeeded', async () => {
    const lowCodeAgent: Agent = {
      name: 'projects/proj-1/locations/global/collections/default_collection/engines/eng-1/assistants/default_assistant/agents/lc-1',
      displayName: 'Finance Low-Code Bot',
      description: 'Old description',
      state: 'ENABLED',
      sharingConfig: { scope: 'RESTRICTED' },
      lowCodeAgentDefinition: {
        rootAgentId: 'r1',
        nodes: [{ id: 'r1', llmAgentNode: { instruction: 'Help finance.', model: 'gemini-2.5-flash' } }],
      },
    };

    vi.mocked(coreApi.gapiRequest).mockImplementation(async (url, method, _proj, _params, body) => {
      const urlStr = String(url);
      if (method === 'GET' && urlStr.endsWith('/agents/lc-1')) {
        return lowCodeAgent;
      }
      if (method === 'PATCH') {
        return { ...lowCodeAgent, ...(body as Partial<Agent>) };
      }
      if (method === 'POST' && urlStr.endsWith(':deployLowCode')) {
        return {};
      }
      if (urlStr.endsWith(':getIamPolicy')) {
        return { bindings: [] };
      }
      if (urlStr.endsWith(':setIamPolicy')) {
        throw new Error('403 PERMISSION_DENIED on AgentService.SetIamPolicy');
      }
      return {};
    });

    const bulkResult = await bulkEditSharePublishAgents(
      [lowCodeAgent],
      {
        descriptionMode: 'REPLACE',
        descriptionText: 'New audited description',
        publishDrafts: true,
        sharingScope: 'ALL_USERS',
        sharedPrincipals: ['user:analyst@example.com'],
      },
      baseConfig,
    );

    expect(bulkResult.failed).toBe(1);
    const failedOutcome = bulkResult.outcomes[0];
    expect(failedOutcome.status).toBe('failed');
    expect(failedOutcome.error).toContain('403 PERMISSION_DENIED on AgentService.SetIamPolicy');
    // Steps 1-3 succeeded before Step 4 threw, so actionsApplied MUST preserve them
    expect(failedOutcome.actionsApplied).toEqual([
      'Updated description (replace)',
      'Deployed Low-Code draft (:deployLowCode)',
      'Set sharing scope to ALL_USERS',
    ]);
  });

  it('skips SEARCH_TIER_ENTERPRISE penalty for SOLUTION_TYPE_GENERATIVE_CHAT engines and separates citationMatched from skillTriggered', async () => {
    const genChatEngine: AppEngine = {
      name: 'projects/proj-1/locations/global/collections/default_collection/engines/eng-chat',
      displayName: 'GenChat App',
      solutionType: 'SOLUTION_TYPE_GENERATIVE_CHAT',
      observabilityConfig: { observabilityEnabled: true },
    };
    const assistant: Assistant = {
      name: `${genChatEngine.name}/assistants/default_assistant`,
      displayName: 'Default Assistant',
    };

    const report = evaluateAssistantData({
      engine: genChatEngine,
      assistant,
      agents: [],
      config: baseConfig,
    });
    const findingIds = report.findings.map((f) => f.id);
    expect(findingIds).not.toContain('config-search-tier-or-llm-addon');
    expect(findingIds).toContain('config-search-tier-optimal');

    // Verify runSkillBenchmarkPhase does NOT set skillTriggered=true merely because citation URI matched a general DataStore ID
    vi.mocked(api.streamChat).mockImplementationOnce(async (_ag, _q, _s, _c, _t, onChunk) => {
      onChunk({
        answer: {
          replies: [
            {
              groundedContent: {
                content: { text: 'General search answer without invoking skill.' },
                textGroundingMetadata: {
                  references: [{ uri: 'projects/p/locations/global/dataStores/confluence_eng/documents/1' }],
                },
              },
            },
          ],
        },
      });
    });

    const untriggeredPhase = await runSkillBenchmarkPhase(
      ['Find architecture doc'],
      baseConfig,
      {
        skillId: 'hr-benefits-router-skill',
        displayName: 'HR Benefits Router Skill',
        description: 'Routes HR queries',
        instruction: 'Use confluence_eng',
        targetSources: ['confluence_eng'],
      },
      [],
    );
    expect(untriggeredPhase.runs[0].routedSources).toEqual(['confluence_eng']);
    expect(untriggeredPhase.runs[0].citationMatched).toBe(true);
    expect(untriggeredPhase.runs[0].skillTriggered).toBe(false);

    // When diagnosticInfo / adkAuthor actually invokes the target skill ID, skillTriggered becomes true
    vi.mocked(api.streamChat).mockImplementationOnce(async (_ag, _q, _s, _c, _t, onChunk) => {
      onChunk({
        answer: {
          adkAuthor: 'projects/p/locations/global/engines/e/assistants/default_assistant/agents/hr-benefits-router-skill',
          replies: [
            {
              groundedContent: {
                content: { text: 'Routed via HR Benefits Router Skill.' },
                textGroundingMetadata: { references: [{ uri: 'https://hr.example.com/1' }] },
              },
            },
          ],
        },
      });
    });

    const triggeredPhase = await runSkillBenchmarkPhase(
      ['Find HR PTO policy'],
      baseConfig,
      {
        skillId: 'hr-benefits-router-skill',
        displayName: 'HR Benefits Router Skill',
        description: 'Routes HR queries',
        instruction: 'Use confluence_eng',
        targetSources: ['confluence_eng'],
      },
      [],
    );
    expect(triggeredPhase.runs[0].skillTriggered).toBe(true);
    expect(triggeredPhase.runs[0].citationMatched).toBe(true);
  });

  it('warns before live Skill A/B toggles when ALL_USERS skills exist in LatencyLabPage, lists new GCP regions, and shows Active Agent Dependency Warning in AgentEnginesModals', async () => {
    // 1. LatencyLabPage ALL_USERS warning banner
    const allUsersSkill: Agent = {
      name: 'projects/proj-1/locations/global/collections/default_collection/engines/eng-1/assistants/default_assistant/agents/org-routing-skill',
      displayName: 'Org Wide Router Skill',
      state: 'ENABLED',
      agentType: 'SKILL',
      sharingConfig: { scope: 'ALL_USERS' },
      skillAgentDefinition: { instruction: '# Route queries' },
    };

    vi.mocked(api.listResources).mockImplementation(async (resourceType: string) => {
      if (resourceType === 'engines') {
        return {
          engines: [
            {
              name: 'projects/proj-1/locations/global/collections/default_collection/engines/eng-1',
              displayName: 'Enterprise Engine',
              solutionType: 'SOLUTION_TYPE_GENERATIVE_CHAT',
            },
          ],
        };
      }
      if (resourceType === 'assistants') {
        return {
          assistants: [
            {
              name: 'projects/proj-1/locations/global/collections/default_collection/engines/eng-1/assistants/default_assistant',
              displayName: 'Default Assistant',
            },
          ],
        };
      }
      if (resourceType === 'agents') {
        return { agents: [allUsersSkill] };
      }
      return {};
    });

    const { unmount } = render(
      <LatencyLabPage
        projectNumber="proj-1"
        setProjectNumber={vi.fn()}
        accessToken="tok-lab"
        userProfile={null}
      />,
    );

    const abTabBtn = await screen.findByRole('tab', {
      name: /2\. Before vs\. After Skill A\/B Lab/i,
    });
    fireEvent.click(abTabBtn);

    const warningBanner = await screen.findByTestId('all-users-skill-ab-warning');
    expect(warningBanner.textContent).toContain('Org Wide Router Skill');
    expect(warningBanner.textContent).toContain('ALL_USERS');
    unmount();

    // 2. AgentEnginesPage new GCP regions & listAllReasoningEngines pagination
    vi.mocked(api.listAllReasoningEngines).mockResolvedValue([]);
    vi.mocked(api.listCloudRunServices).mockResolvedValue({ services: [] });

    const { unmount: unmountEngines } = render(
      <AgentEnginesPage
        projectNumber="proj-1"
        accessToken="tok-re"
        onDirectQuery={vi.fn()}
      />,
    );

    const locSelect = screen.getByLabelText(/GCP Region/i) as HTMLSelectElement;
    const optionValues = Array.from(locSelect.options).map((o) => o.value);
    expect(optionValues).toEqual(
      expect.arrayContaining([
        'europe-west3',
        'asia-northeast1',
        'australia-southeast1',
        'northamerica-northeast1',
        'us-south1',
      ]),
    );
    await waitFor(() => {
      expect(api.listAllReasoningEngines).toHaveBeenCalled();
    });
    unmountEngines();

    // 3. AgentEnginesModals Active Agent Dependency Warning
    const runtimeId = 'projects/proj-1/locations/us-central1/reasoningEngines/re-prod-1';
    render(
      <AgentEnginesModals
        isDeleteModalOpen={true}
        onCloseDeleteModal={vi.fn()}
        onConfirmDelete={vi.fn()}
        selectedIds={new Set([runtimeId])}
        resources={[
          {
            id: runtimeId,
            shortId: 're-prod-1',
            displayName: 'Prod_Benefits_ADK_Runtime',
            type: 'Agent Engine',
            location: 'us-central1',
            data: { name: runtimeId, displayName: 'Prod_Benefits_ADK_Runtime' },
          },
        ]}
        agentsByResource={{
          [runtimeId]: [sampleHrAgent],
        }}
        isDeleting={false}
        engineToClearSessions={null}
        onCloseClearSessions={vi.fn()}
        onConfirmClearSessions={vi.fn()}
        isClearingSessions={false}
        cloudRunQueryService={null}
        onCloseCloudRunQuery={vi.fn()}
        accessToken="tok"
        agentCardEngine={null}
        onCloseAgentCard={vi.fn()}
        apiConfig={baseConfig}
      />,
    );

    const depWarning = screen.getByTestId('active-agent-dependency-warning');
    expect(depWarning.textContent).toContain('Active Agent Dependency Warning');
    expect(depWarning.textContent).toContain('HR Benefits Concierge');
    expect(depWarning.textContent).toContain('global / eng-global');
  });
});
