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

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Agent, Config } from '../../types';
import * as api from '../../services/apiService';
import { useModalA11y } from '../../hooks/useModalA11y';
import { toErrorMessage } from '../../utils/errors';
import {
  DEFAULT_BACKGROUND_CONCURRENCY,
  mapWithQuotaLimit,
} from '../../utils/quotaGuard';

export interface ShadowEvalCase {
  id: string;
  prompt: string;
  expectedKeywordOrSubstring?: string;
  requireCitations?: boolean;
}

export interface ShadowEvalCaseResult {
  caseId: string;
  agentName: string;
  agentDisplayName: string;
  engineSourceLabel: string;
  prompt: string;
  expectedKeywordOrSubstring?: string;
  requireCitations: boolean;
  passed: boolean;
  keywordMatched: boolean;
  citationMatched: boolean;
  citationsCount: number;
  ttftMs: number;
  totalLatencyMs: number;
  answerText: string;
  skippedReason?: string;
  error?: string;
}

export interface ShadowEvalAgentSummary {
  agentName: string;
  agentDisplayName: string;
  engineSourceLabel: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  passRatePct: number;
  avgTtftMs: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
}

export interface ShadowEvalScorecard {
  evaluatedAt: string;
  projectId: string;
  overallPassed: boolean;
  passThresholdPct: number;
  overallPassRatePct: number;
  totalExecutions: number;
  passedExecutions: number;
  failedExecutions: number;
  avgTtftMs: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  agentSummaries: ShadowEvalAgentSummary[];
  results: ShadowEvalCaseResult[];
}

export interface ShadowEvalGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  agents: Agent[];
  initialSelectedAgentNames?: Set<string>;
  config: Config;
  accessToken?: string;
  zIndexClass?: string;
}

export function computeP95Latency(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(0.95 * sorted.length) - 1),
  );
  return sorted[idx];
}

export function resolveAgentStreamConfig(
  agent: Agent,
  fallbackConfig: Config,
): Config {
  const parts = (agent.name || '').split('/');
  const projIdx = parts.indexOf('projects');
  const locIdx = parts.indexOf('locations');
  const colIdx = parts.indexOf('collections');
  const engIdx = parts.indexOf('engines');
  const astIdx = parts.indexOf('assistants');

  const parsedLocation =
    locIdx >= 0 && parts[locIdx + 1] ? parts[locIdx + 1] : undefined;
  const parsedCollection =
    colIdx >= 0 && parts[colIdx + 1] ? parts[colIdx + 1] : undefined;
  const parsedEngine =
    engIdx >= 0 && parts[engIdx + 1] ? parts[engIdx + 1] : undefined;
  const parsedAssistant =
    astIdx >= 0 && parts[astIdx + 1] ? parts[astIdx + 1] : undefined;
  const parsedProject =
    projIdx >= 0 && parts[projIdx + 1] ? parts[projIdx + 1] : undefined;

  return {
    ...fallbackConfig,
    projectId: fallbackConfig.projectId || parsedProject || '',
    appLocation:
      parsedLocation ||
      (fallbackConfig.appLocation === 'all'
        ? 'global'
        : fallbackConfig.appLocation || 'global'),
    collectionId:
      parsedCollection || fallbackConfig.collectionId || 'default_collection',
    appId:
      parsedEngine ||
      (fallbackConfig.appId === '__ALL_ENGINES__' ? '' : fallbackConfig.appId),
    assistantId:
      parsedAssistant || fallbackConfig.assistantId || 'default_assistant',
  };
}

function formatEngineSourceLabel(agent: Agent, fallbackConfig: Config): string {
  const resolved = resolveAgentStreamConfig(agent, fallbackConfig);
  if (resolved.appLocation && resolved.appId) {
    return `${resolved.appLocation} / ${resolved.appId}`;
  }
  return resolved.appLocation || 'global';
}

function splitDatasetCsvLine(
  line: string,
): { cells: string[]; unclosedQuote: boolean } {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return { cells, unclosedQuote: inQuotes };
}

function parseBoolField(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  if (typeof raw === 'string') {
    const lower = raw.trim().toLowerCase();
    return lower === 'true' || lower === '1' || lower === 'yes' || lower === 'y';
  }
  return false;
}

/**
 * Parses a Golden Q&A evaluation dataset in JSONL, JSON array, or CSV format.
 * Explicitly reports malformed JSON lines, unclosed quotes, or missing prompts in `errors`.
 */
export function parseGoldenEvalDataset(
  rawText: string,
  format: 'auto' | 'jsonl' | 'csv' = 'auto',
): { cases: ShadowEvalCase[]; errors: string[] } {
  const trimmed = (rawText || '').trim();
  if (!trimmed) {
    return { cases: [], errors: ['Golden evaluation dataset input is empty.'] };
  }

  const cases: ShadowEvalCase[] = [];
  const errors: string[] = [];

  const nonCommentBody = trimmed
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith('#'))
    .join('\n')
    .trim();

  if (!nonCommentBody) {
    return { cases: [], errors: ['Golden evaluation dataset input is empty.'] };
  }

  const looksLikeJsonArray = nonCommentBody.startsWith('[');
  const looksLikeJsonl =
    format === 'jsonl' ||
    (format === 'auto' &&
      (nonCommentBody.startsWith('{') || looksLikeJsonArray));

  if (looksLikeJsonArray && format !== 'csv') {
    try {
      const parsed = JSON.parse(nonCommentBody);
      if (!Array.isArray(parsed)) {
        return {
          cases: [],
          errors: ['Expected a JSON array of Golden Q&A objects.'],
        };
      }
      parsed.forEach((entry, idx) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          errors.push(`Item ${idx + 1}: Expected a JSON object.`);
          return;
        }
        const obj = entry as Record<string, unknown>;
        const prompt = String(obj.prompt ?? obj.query ?? obj.question ?? '').trim();
        if (!prompt) {
          errors.push(`Item ${idx + 1}: Missing non-empty "prompt" field.`);
          return;
        }
        const expected = String(
          obj.expectedKeywordOrSubstring ?? obj.expected ?? obj.expectedSubstring ?? '',
        ).trim();
        cases.push({
          id: `case-${idx + 1}`,
          prompt,
          expectedKeywordOrSubstring: expected || undefined,
          requireCitations: parseBoolField(obj.requireCitations),
        });
      });
      return { cases, errors };
    } catch (err: unknown) {
      return {
        cases: [],
        errors: [`Invalid JSON array: ${toErrorMessage(err)}`],
      };
    }
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  if (looksLikeJsonl) {
    lines.forEach((line, idx) => {
      try {
        const parsed = JSON.parse(line);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          errors.push(`Line ${idx + 1}: Expected a JSON object.`);
          return;
        }
        const obj = parsed as Record<string, unknown>;
        const prompt = String(obj.prompt ?? obj.query ?? obj.question ?? '').trim();
        if (!prompt) {
          errors.push(`Line ${idx + 1}: Missing non-empty "prompt" field.`);
          return;
        }
        const expected = String(
          obj.expectedKeywordOrSubstring ?? obj.expected ?? obj.expectedSubstring ?? '',
        ).trim();
        cases.push({
          id: `case-${cases.length + 1}`,
          prompt,
          expectedKeywordOrSubstring: expected || undefined,
          requireCitations: parseBoolField(obj.requireCitations),
        });
      } catch (err: unknown) {
        errors.push(`Line ${idx + 1}: Invalid JSONL (${toErrorMessage(err)}).`);
      }
    });
    return { cases, errors };
  }

  // CSV mode
  let startIdx = 0;
  let promptCol = 0;
  let expectedCol = 1;
  let citationsCol = 2;

  const firstSplit = splitDatasetCsvLine(lines[0]);
  if (firstSplit.unclosedQuote) {
    return {
      cases: [],
      errors: ['Row 1: Unclosed double quote in CSV header/row.'],
    };
  }
  const normalizedHeaders = firstSplit.cells.map((c) =>
    c.toLowerCase().replace(/[\s-]+/g, '_'),
  );
  const detectedPromptIdx = normalizedHeaders.findIndex((h) =>
    ['prompt', 'query', 'question', 'input'].includes(h),
  );
  if (detectedPromptIdx >= 0) {
    startIdx = 1;
    promptCol = detectedPromptIdx;
    const detectedExpIdx = normalizedHeaders.findIndex((h) =>
      [
        'expectedkeywordorsubstring',
        'expected_keyword_or_substring',
        'expected_keyword',
        'expected_substring',
        'expected',
      ].includes(h),
    );
    const detectedCitIdx = normalizedHeaders.findIndex((h) =>
      ['requirecitations', 'require_citations', 'citations'].includes(h),
    );
    expectedCol = detectedExpIdx >= 0 ? detectedExpIdx : -1;
    citationsCol = detectedCitIdx >= 0 ? detectedCitIdx : -1;
  }

  for (let i = startIdx; i < lines.length; i++) {
    const rowNum = i + 1;
    const { cells, unclosedQuote } = splitDatasetCsvLine(lines[i]);
    if (unclosedQuote) {
      errors.push(`Row ${rowNum}: Unclosed double quote in CSV row.`);
      continue;
    }
    const prompt = (cells[promptCol] || '').trim();
    if (!prompt) {
      errors.push(`Row ${rowNum}: Missing non-empty prompt.`);
      continue;
    }
    const expected = expectedCol >= 0 ? (cells[expectedCol] || '').trim() : '';
    const requireCitations =
      citationsCol >= 0 ? parseBoolField(cells[citationsCol]) : false;
    cases.push({
      id: `case-${cases.length + 1}`,
      prompt,
      expectedKeywordOrSubstring: expected || undefined,
      requireCitations,
    });
  }

  return { cases, errors };
}

export interface RunShadowEvaluationParams {
  agents: Agent[];
  cases: ShadowEvalCase[];
  config: Config;
  accessToken?: string;
  passThresholdPct?: number;
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (
    completed: number,
    total: number,
    latest: ShadowEvalCaseResult,
  ) => void;
}

/**
 * Executes non-destructive Golden Q&A `:streamAssist` (`api.streamChat`) queries against each
 * selected agent in isolated ephemeral sessions (`sessionId = null`) with bounded concurrency (2).
 * Performs ZERO mutations on agent state, skills, or `ALL_USERS` sharing configurations.
 */
export async function runShadowEvaluationSuite({
  agents,
  cases,
  config,
  accessToken = '',
  passThresholdPct = 100,
  concurrency = DEFAULT_BACKGROUND_CONCURRENCY,
  signal,
  onProgress,
}: RunShadowEvaluationParams): Promise<ShadowEvalScorecard> {
  if (!agents || agents.length === 0) {
    throw new Error('Select at least one target agent to run Shadow Evaluation.');
  }
  const validCases = (cases || []).filter((c) => c.prompt && c.prompt.trim().length > 0);
  if (validCases.length === 0) {
    throw new Error(
      'Provide at least one Golden Q&A test case with a non-empty prompt.',
    );
  }

  const nowMs = (): number =>
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

  const workItems: Array<{ agent: Agent; evalCase: ShadowEvalCase }> = [];
  for (const agent of agents) {
    for (const evalCase of validCases) {
      workItems.push({ agent, evalCase });
    }
  }

  let completedCount = 0;

  const { outcomes } = await mapWithQuotaLimit(
    workItems,
    Math.max(1, Math.min(concurrency, DEFAULT_BACKGROUND_CONCURRENCY)),
    async ({ agent, evalCase }) => {
      const agentConfig = resolveAgentStreamConfig(agent, config);
      const engineSourceLabel = formatEngineSourceLabel(agent, config);
      const agentDisplayName =
        agent.displayName || agent.name.split('/').pop() || agent.name;

      if (!agentConfig.projectId || !agentConfig.appId) {
        const cfgErrResult: ShadowEvalCaseResult = {
          caseId: evalCase.id,
          agentName: agent.name,
          agentDisplayName,
          engineSourceLabel,
          prompt: evalCase.prompt.trim(),
          expectedKeywordOrSubstring: evalCase.expectedKeywordOrSubstring?.trim() || undefined,
          requireCitations: Boolean(evalCase.requireCitations),
          passed: false,
          keywordMatched: false,
          citationMatched: false,
          citationsCount: 0,
          ttftMs: 0,
          totalLatencyMs: 0,
          answerText: '',
          error: 'Missing target projectId or engine appId for agent :streamAssist call.',
        };
        completedCount += 1;
        onProgress?.(completedCount, workItems.length, cfgErrResult);
        return cfgErrResult;
      }

      const startMs = nowMs();
      let firstWireChunkMs: number | null = null;
      let firstTokenMs: number | null = null;
      let answerText = '';
      let citationsCount = 0;
      let skippedReason: string | undefined;
      let errorMessage: string | undefined;

      try {
        await api.streamChat(
          agent.name,
          evalCase.prompt.trim(),
          null, // Ephemeral session: zero cross-turn pollution, zero state mutation
          agentConfig,
          accessToken,
          (chunk) => {
            const elapsed = Math.max(1, Math.round(nowMs() - startMs));
            if (firstWireChunkMs === null) {
              firstWireChunkMs = elapsed;
            }
            const skipped = chunk.answer?.assistSkippedReasons;
            if (Array.isArray(skipped) && skipped.length > 0) {
              skippedReason = skipped.join(', ');
            }
            if (chunk.answer?.replies) {
              for (const reply of chunk.answer.replies) {
                const refs =
                  reply.groundedContent?.textGroundingMetadata?.references;
                if (Array.isArray(refs)) {
                  citationsCount += refs.length;
                }
                const content = reply.groundedContent?.content || reply.content;
                if (content) {
                  const tokenElapsed = Math.max(1, Math.round(nowMs() - startMs));
                  if (firstTokenMs === null && (content.text || content.thought)) {
                    firstTokenMs = tokenElapsed;
                  }
                  if (!content.thought && content.text) {
                    answerText += content.text;
                  }
                }
              }
            }
          },
        );
      } catch (err: unknown) {
        errorMessage = toErrorMessage(err, 'Shadow :streamAssist query failed.');
      }

      const totalLatencyMs = Math.max(1, Math.round(nowMs() - startMs));
      const ttftMs =
        firstTokenMs !== null
          ? Math.min(totalLatencyMs, firstTokenMs)
          : firstWireChunkMs !== null
            ? Math.min(totalLatencyMs, firstWireChunkMs)
            : totalLatencyMs;

      const cleanAnswer = answerText.trim();
      const expectedSub = (evalCase.expectedKeywordOrSubstring || '').trim();
      const keywordMatched = expectedSub
        ? cleanAnswer.toLowerCase().includes(expectedSub.toLowerCase())
        : true;
      const requireCitations = Boolean(evalCase.requireCitations);
      const citationMatched = !requireCitations || citationsCount > 0;

      const passed =
        !errorMessage &&
        !skippedReason &&
        cleanAnswer.length > 0 &&
        keywordMatched &&
        citationMatched;

      const caseResult: ShadowEvalCaseResult = {
        caseId: evalCase.id,
        agentName: agent.name,
        agentDisplayName,
        engineSourceLabel,
        prompt: evalCase.prompt.trim(),
        expectedKeywordOrSubstring: expectedSub || undefined,
        requireCitations,
        passed,
        keywordMatched,
        citationMatched,
        citationsCount,
        ttftMs,
        totalLatencyMs,
        answerText: cleanAnswer,
        ...(skippedReason ? { skippedReason } : {}),
        ...(errorMessage ? { error: errorMessage } : {}),
      };

      completedCount += 1;
      onProgress?.(completedCount, workItems.length, caseResult);
      return caseResult;
    },
    { signal, shouldShortCircuit: () => false },
  );

  const results: ShadowEvalCaseResult[] = outcomes.map((outcome, idx) => {
    if (outcome.status === 'fulfilled' && outcome.value) {
      return outcome.value;
    }
    const { agent, evalCase } = workItems[idx];
    const reasonMsg =
      outcome.status === 'skipped'
        ? 'Evaluation cancelled before dispatch.'
        : toErrorMessage(outcome.reason, 'Unexpected shadow evaluation error.');
    return {
      caseId: evalCase.id,
      agentName: agent.name,
      agentDisplayName:
        agent.displayName || agent.name.split('/').pop() || agent.name,
      engineSourceLabel: formatEngineSourceLabel(agent, config),
      prompt: evalCase.prompt.trim(),
      expectedKeywordOrSubstring:
        evalCase.expectedKeywordOrSubstring?.trim() || undefined,
      requireCitations: Boolean(evalCase.requireCitations),
      passed: false,
      keywordMatched: false,
      citationMatched: false,
      citationsCount: 0,
      ttftMs: 0,
      totalLatencyMs: 0,
      answerText: '',
      error: reasonMsg,
    };
  });

  const agentSummaries: ShadowEvalAgentSummary[] = agents.map((agent) => {
    const agentRows = results.filter((r) => r.agentName === agent.name);
    const passedCases = agentRows.filter((r) => r.passed).length;
    const totalCases = agentRows.length;
    const failedCases = totalCases - passedCases;
    const passRatePct =
      totalCases > 0 ? Math.round((passedCases / totalCases) * 100) : 0;
    const avgTtftMs =
      totalCases > 0
        ? Math.round(
            agentRows.reduce((s, r) => s + r.ttftMs, 0) / totalCases,
          )
        : 0;
    const avgLatencyMs =
      totalCases > 0
        ? Math.round(
            agentRows.reduce((s, r) => s + r.totalLatencyMs, 0) / totalCases,
          )
        : 0;
    const p95LatencyMs = computeP95Latency(
      agentRows.map((r) => r.totalLatencyMs),
    );
    return {
      agentName: agent.name,
      agentDisplayName:
        agent.displayName || agent.name.split('/').pop() || agent.name,
      engineSourceLabel: formatEngineSourceLabel(agent, config),
      totalCases,
      passedCases,
      failedCases,
      passRatePct,
      avgTtftMs,
      avgLatencyMs,
      p95LatencyMs,
    };
  });

  const totalExecutions = results.length;
  const passedExecutions = results.filter((r) => r.passed).length;
  const failedExecutions = totalExecutions - passedExecutions;
  const overallPassRatePct =
    totalExecutions > 0
      ? Math.round((passedExecutions / totalExecutions) * 100)
      : 0;
  const avgTtftMs =
    totalExecutions > 0
      ? Math.round(
          results.reduce((s, r) => s + r.ttftMs, 0) / totalExecutions,
        )
      : 0;
  const avgLatencyMs =
    totalExecutions > 0
      ? Math.round(
          results.reduce((s, r) => s + r.totalLatencyMs, 0) / totalExecutions,
        )
      : 0;
  const p95LatencyMs = computeP95Latency(results.map((r) => r.totalLatencyMs));

  return {
    evaluatedAt: new Date().toISOString(),
    projectId: config.projectId,
    overallPassed:
      totalExecutions > 0 && overallPassRatePct >= passThresholdPct,
    passThresholdPct,
    overallPassRatePct,
    totalExecutions,
    passedExecutions,
    failedExecutions,
    avgTtftMs,
    avgLatencyMs,
    p95LatencyMs,
    agentSummaries,
    results,
  };
}

export function serializeShadowEvalJson(scorecard: ShadowEvalScorecard): string {
  return JSON.stringify(scorecard, null, 2);
}

export function serializeShadowEvalMarkdown(
  scorecard: ShadowEvalScorecard,
): string {
  const gateBadge = scorecard.overallPassed ? 'PASS' : 'BLOCKED';
  const lines: string[] = [
    '# Shadow Evaluation & Regression Gate Scorecard',
    '',
    `- **Evaluated At**: ${scorecard.evaluatedAt}`,
    `- **Project**: \`${scorecard.projectId}\``,
    `- **Gate Verdict**: **${gateBadge}** (${scorecard.overallPassRatePct}% pass rate vs ${scorecard.passThresholdPct}% threshold)`,
    `- **Executions**: ${scorecard.passedExecutions}/${scorecard.totalExecutions} passed (${scorecard.failedExecutions} failed)`,
    `- **Latency**: Avg TTFT ${scorecard.avgTtftMs} ms | Avg Total ${scorecard.avgLatencyMs} ms | P95 ${scorecard.p95LatencyMs} ms`,
    '',
    '## Per-Agent Summary',
    '',
    '| Agent | Engine | Pass Rate | Passed / Total | Avg TTFT (ms) | Avg Latency (ms) | P95 (ms) |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...scorecard.agentSummaries.map(
      (s) =>
        `| ${s.agentDisplayName.replace(/\|/g, '\\|')} | \`${s.engineSourceLabel}\` | ${s.passRatePct}% | ${s.passedCases}/${s.totalCases} | ${s.avgTtftMs} | ${s.avgLatencyMs} | ${s.p95LatencyMs} |`,
    ),
    '',
    '## Detailed Case Outcomes',
    '',
    '| Status | Agent | Prompt | Expected Substring | Citations | TTFT (ms) | Total (ms) | Notes |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...scorecard.results.map((r) => {
      const status = r.passed ? 'PASS' : 'FAIL';
      const note = r.error
        ? `Error: ${r.error}`
        : r.skippedReason
          ? `Skipped: ${r.skippedReason}`
          : !r.keywordMatched
            ? 'Missing expected keyword/substring'
            : !r.citationMatched
              ? 'Missing required grounding citation'
              : 'OK';
      return `| ${status} | ${r.agentDisplayName.replace(/\|/g, '\\|')} | ${r.prompt.replace(/\|/g, '\\|')} | ${r.expectedKeywordOrSubstring ? `\`${r.expectedKeywordOrSubstring.replace(/\|/g, '\\|')}\`` : '—'} | ${r.citationsCount}${r.requireCitations ? ' (req)' : ''} | ${r.ttftMs} | ${r.totalLatencyMs} | ${note.replace(/\|/g, '\\|')} |`;
    }),
  ];
  return lines.join('\n');
}

const DEFAULT_GOLDEN_CASES: ShadowEvalCase[] = [
  {
    id: 'case-1',
    prompt: 'Summarize your core capabilities and the official policies or data sources you can help with.',
    expectedKeywordOrSubstring: '',
    requireCitations: false,
  },
];

const ShadowEvalGateModal: React.FC<ShadowEvalGateModalProps> = ({
  isOpen,
  onClose,
  agents,
  initialSelectedAgentNames,
  config,
  accessToken = '',
  zIndexClass = 'z-50',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const wasOpenRef = useRef(false);

  const eligibleAgents = useMemo(
    () => agents.filter((a) => a.agentType !== 'SKILL' && !a.skillAgentDefinition),
    [agents],
  );

  const [selectedAgentNames, setSelectedAgentNames] = useState<Set<string>>(
    new Set(),
  );
  const [cases, setCases] = useState<ShadowEvalCase[]>(DEFAULT_GOLDEN_CASES);
  const [passThresholdPct, setPassThresholdPct] = useState<number>(100);
  const [isPastePanelOpen, setIsPastePanelOpen] = useState<boolean>(false);
  const [rawDatasetText, setRawDatasetText] = useState<string>('');
  const [datasetFormat, setDatasetFormat] = useState<'auto' | 'jsonl' | 'csv'>(
    'auto',
  );

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [progress, setProgress] = useState<{
    completed: number;
    total: number;
    latestLabel: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scorecard, setScorecard] = useState<ShadowEvalScorecard | null>(null);

  useModalA11y({
    isOpen,
    onClose,
    containerRef,
    preventClose: isRunning,
  });

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;

    if (initialSelectedAgentNames && initialSelectedAgentNames.size > 0) {
      const matching = Array.from(initialSelectedAgentNames).filter((name) =>
        eligibleAgents.some((a) => a.name === name),
      );
      setSelectedAgentNames(
        matching.length > 0
          ? new Set(matching)
          : new Set(eligibleAgents.slice(0, 3).map((a) => a.name)),
      );
    } else {
      setSelectedAgentNames(
        new Set(eligibleAgents.slice(0, 3).map((a) => a.name)),
      );
    }
    setError(null);
    setScorecard(null);
    setProgress(null);
  }, [isOpen, initialSelectedAgentNames, eligibleAgents]);

  const targetAgents = useMemo(
    () => eligibleAgents.filter((a) => selectedAgentNames.has(a.name)),
    [eligibleAgents, selectedAgentNames],
  );

  const handleToggleAgent = (agentName: string) => {
    setSelectedAgentNames((prev) => {
      const next = new Set(prev);
      if (next.has(agentName)) next.delete(agentName);
      else next.add(agentName);
      return next;
    });
  };

  const handleAddCase = () => {
    setCases((prev) => [
      ...prev,
      {
        id: `case-${Date.now()}-${prev.length + 1}`,
        prompt: '',
        expectedKeywordOrSubstring: '',
        requireCitations: false,
      },
    ]);
  };

  const handleRemoveCase = (id: string) => {
    setCases((prev) => (prev.length <= 1 ? prev : prev.filter((c) => c.id !== id)));
  };

  const handleSeedFromStarterPrompts = () => {
    const seeded: ShadowEvalCase[] = [];
    for (const ag of targetAgents) {
      for (const sp of ag.starterPrompts || []) {
        const text = (sp.text || '').trim();
        if (text && !seeded.some((c) => c.prompt === text) && seeded.length < 8) {
          seeded.push({
            id: `starter-${seeded.length + 1}`,
            prompt: text,
            expectedKeywordOrSubstring: '',
            requireCitations: false,
          });
        }
      }
    }
    if (seeded.length === 0) {
      setError('Selected agent(s) do not define any starterPrompts to seed from.');
      return;
    }
    setError(null);
    setCases(seeded);
  };

  const handleImportDataset = () => {
    const parsed = parseGoldenEvalDataset(rawDatasetText, datasetFormat);
    if (parsed.errors.length > 0) {
      setError(parsed.errors.join(' '));
      if (parsed.cases.length === 0) return;
    } else {
      setError(null);
    }
    if (parsed.cases.length > 0) {
      setCases(parsed.cases);
      setIsPastePanelOpen(false);
    }
  };

  const handleRunShadowEval = async () => {
    if (targetAgents.length === 0) {
      setError('Please select at least one target agent to evaluate.');
      return;
    }
    const cleanCases = cases.filter((c) => c.prompt.trim().length > 0);
    if (cleanCases.length === 0) {
      setError('Please enter at least one non-empty Golden Q&A prompt.');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsRunning(true);
    setError(null);
    setScorecard(null);
    setProgress({
      completed: 0,
      total: targetAgents.length * cleanCases.length,
      latestLabel: 'Dispatching ephemeral :streamAssist queries (concurrency = 2)...',
    });

    try {
      const result = await runShadowEvaluationSuite({
        agents: targetAgents,
        cases: cleanCases,
        config,
        accessToken,
        passThresholdPct,
        concurrency: DEFAULT_BACKGROUND_CONCURRENCY,
        signal: controller.signal,
        onProgress: (completed, total, latest) => {
          setProgress({
            completed,
            total,
            latestLabel: `${latest.agentDisplayName}: "${latest.prompt.slice(0, 48)}"`,
          });
        },
      });
      setScorecard(result);
    } catch (err: unknown) {
      setError(toErrorMessage(err, 'Shadow evaluation failed.'));
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  };

  const triggerDownload = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 bg-black/75 flex justify-center items-center ${zIndexClass} p-4`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shadow-eval-gate-modal-title"
    >
      <div
        ref={containerRef}
        data-testid="shadow-eval-gate-modal"
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 border-b border-gray-800 bg-gray-900 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="shadow-eval-gate-modal-title"
                className="text-lg sm:text-xl font-bold text-gray-100"
              >
                Shadow Evaluation &amp; Pre-Upgrade Regression Gate
              </h2>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-900/70 text-emerald-300 border border-emerald-700/70">
                Non-Destructive · Ephemeral Sessions
              </span>
            </div>
            <p className="text-xs text-gray-400">
              Runs real <code className="text-gray-300">:streamAssist</code> queries against selected agents in isolated ephemeral sessions (bounded concurrency = 2) with zero live skill disabling and zero mutation of <code className="text-gray-300">ALL_USERS</code> state.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isRunning}
            aria-label="Close Shadow Eval Gate modal"
            className="text-gray-400 hover:text-white text-sm font-semibold px-2 py-1 rounded"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 min-h-0">
          {/* Section 1: Target Agents */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-200">
                1. Target Agents ({targetAgents.length} / {eligibleAgents.length} selected)
              </span>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedAgentNames(new Set(eligibleAgents.map((a) => a.name)))
                  }
                  disabled={isRunning}
                  className="text-blue-400 hover:text-blue-300 font-medium"
                >
                  Select All
                </button>
                <span className="text-gray-600">·</span>
                <button
                  type="button"
                  onClick={() => setSelectedAgentNames(new Set())}
                  disabled={isRunning}
                  className="text-gray-400 hover:text-gray-200 font-medium"
                >
                  Clear
                </button>
              </div>
            </div>
            {eligibleAgents.length === 0 ? (
              <p className="text-xs text-amber-300">
                No conversational agents available to evaluate in the current view.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-36 overflow-y-auto pr-1">
                {eligibleAgents.map((agent) => {
                  const checked = selectedAgentNames.has(agent.name);
                  const shortId = agent.name.split('/').pop() || agent.name;
                  const srcLabel = formatEngineSourceLabel(agent, config);
                  return (
                    <label
                      key={agent.name}
                      className={`flex items-start gap-2.5 p-2 rounded-md border text-xs cursor-pointer transition-colors ${
                        checked
                          ? 'bg-blue-950/50 border-blue-600/70 text-gray-100'
                          : 'bg-gray-900/60 border-gray-700 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isRunning}
                        onChange={() => handleToggleAgent(agent.name)}
                        aria-label={`Evaluate agent ${agent.displayName || shortId}`}
                        className="mt-0.5 h-3.5 w-3.5 rounded bg-gray-700 border-gray-600 text-blue-500"
                      />
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-100 truncate">
                          {agent.displayName || shortId}
                        </div>
                        <div className="text-[10px] font-mono text-gray-400 truncate">
                          [{srcLabel}] · {shortId}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 2: Golden Q&A Dataset */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-200">
                  2. Golden Q&amp;A Eval Dataset ({cases.length} case{cases.length === 1 ? '' : 's'})
                </span>
                <label className="flex items-center gap-1.5 text-xs text-gray-400">
                  <span>Gate Pass Threshold:</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={passThresholdPct}
                    disabled={isRunning}
                    aria-label="Pass threshold percentage"
                    onChange={(e) =>
                      setPassThresholdPct(
                        Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                      )
                    }
                    className="w-16 bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-xs text-gray-100 font-mono"
                  />
                  <span>%</span>
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSeedFromStarterPrompts}
                  disabled={isRunning}
                  className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-medium rounded"
                >
                  Seed Starter Prompts
                </button>
                <button
                  type="button"
                  data-testid="toggle-paste-dataset-btn"
                  onClick={() => setIsPastePanelOpen((prev) => !prev)}
                  disabled={isRunning}
                  className="px-2.5 py-1 bg-indigo-900/70 hover:bg-indigo-800 text-indigo-200 border border-indigo-600/60 text-xs font-medium rounded"
                >
                  {isPastePanelOpen ? 'Hide JSONL/CSV Import' : 'Paste JSONL / CSV'}
                </button>
                <button
                  type="button"
                  data-testid="add-golden-case-btn"
                  onClick={handleAddCase}
                  disabled={isRunning}
                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded"
                >
                  + Add Row
                </button>
              </div>
            </div>

            {isPastePanelOpen && (
              <div
                data-testid="golden-dataset-paste-panel"
                className="p-3 bg-gray-900 border border-gray-700 rounded-lg space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-gray-300 font-medium">
                    Paste JSONL (<code>{`{"prompt":"...","expectedKeywordOrSubstring":"...","requireCitations":true}`}</code>) or CSV (<code>prompt,expectedKeywordOrSubstring,requireCitations</code>)
                  </span>
                  <select
                    aria-label="Dataset format"
                    value={datasetFormat}
                    onChange={(e) =>
                      setDatasetFormat(e.target.value as 'auto' | 'jsonl' | 'csv')
                    }
                    className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200"
                  >
                    <option value="auto">Auto-Detect</option>
                    <option value="jsonl">JSONL / JSON</option>
                    <option value="csv">CSV</option>
                  </select>
                </div>
                <textarea
                  rows={4}
                  aria-label="Golden dataset JSONL or CSV input"
                  value={rawDatasetText}
                  onChange={(e) => setRawDatasetText(e.target.value)}
                  placeholder={`{"prompt": "What is our PTO rollover cap?", "expectedKeywordOrSubstring": "80 hours", "requireCitations": true}`}
                  className="w-full bg-gray-800 border border-gray-700 rounded-md p-2.5 text-xs text-gray-100 font-mono"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    data-testid="import-golden-dataset-btn"
                    onClick={handleImportDataset}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded"
                  >
                    Import Dataset Rows
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {cases.map((evalCase, idx) => (
                <div
                  key={evalCase.id}
                  className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-gray-900/70 border border-gray-700/80 rounded-lg p-2.5"
                >
                  <div className="md:col-span-6">
                    <input
                      type="text"
                      aria-label={`Golden prompt ${idx + 1}`}
                      placeholder={`Q${idx + 1}: Enter golden test prompt...`}
                      value={evalCase.prompt}
                      disabled={isRunning}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCases((prev) =>
                          prev.map((c) =>
                            c.id === evalCase.id ? { ...c, prompt: val } : c,
                          ),
                        );
                      }}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-gray-100"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <input
                      type="text"
                      aria-label={`Expected keyword ${idx + 1}`}
                      placeholder="Expected keyword/substring (optional)"
                      value={evalCase.expectedKeywordOrSubstring || ''}
                      disabled={isRunning}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCases((prev) =>
                          prev.map((c) =>
                            c.id === evalCase.id
                              ? { ...c, expectedKeywordOrSubstring: val }
                              : c,
                          ),
                        );
                      }}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-gray-100 font-mono"
                    />
                  </div>
                  <div className="md:col-span-2 flex items-center">
                    <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer whitespace-nowrap">
                      <input
                        type="checkbox"
                        aria-label={`Require citations ${idx + 1}`}
                        checked={Boolean(evalCase.requireCitations)}
                        disabled={isRunning}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setCases((prev) =>
                            prev.map((c) =>
                              c.id === evalCase.id
                                ? { ...c, requireCitations: checked }
                                : c,
                            ),
                          );
                        }}
                        className="h-3.5 w-3.5 rounded bg-gray-700 border-gray-600 text-blue-500"
                      />
                      <span>Require Citations</span>
                    </label>
                  </div>
                  <div className="md:col-span-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleRemoveCase(evalCase.id)}
                      disabled={isRunning || cases.length <= 1}
                      aria-label={`Remove case ${idx + 1}`}
                      className="text-gray-400 hover:text-red-400 disabled:opacity-30 text-xs px-2 py-1"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Progress Banner */}
          {isRunning && progress && (
            <div className="p-3.5 bg-blue-950/50 border border-blue-700 rounded-lg flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-400 shrink-0" />
                <div className="text-xs text-blue-100 truncate">
                  Running{' '}
                  <strong>
                    {progress.completed} / {progress.total}
                  </strong>{' '}
                  — <span className="font-mono">{progress.latestLabel}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="px-2.5 py-1 bg-red-800/80 hover:bg-red-700 text-red-100 text-xs font-semibold rounded shrink-0"
              >
                Stop
              </button>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div
              role="alert"
              className="p-3.5 bg-red-950/60 border border-red-700 rounded-lg text-xs text-red-200"
            >
              {error}
            </div>
          )}

          {/* Scorecard Results */}
          {scorecard && (
            <div
              data-testid="shadow-eval-scorecard"
              className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-700 pb-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span
                    data-testid="shadow-eval-gate-verdict"
                    className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                      scorecard.overallPassed
                        ? 'bg-green-900 text-green-300 border border-green-600'
                        : 'bg-red-900 text-red-300 border border-red-600'
                    }`}
                  >
                    {scorecard.overallPassed
                      ? `GATE PASSED (${scorecard.overallPassRatePct}%)`
                      : `GATE BLOCKED (${scorecard.overallPassRatePct}% < ${scorecard.passThresholdPct}%)`}
                  </span>
                  <span className="text-xs text-gray-300 font-mono">
                    {scorecard.passedExecutions}/{scorecard.totalExecutions} passed · Avg TTFT {scorecard.avgTtftMs} ms · Avg Total {scorecard.avgLatencyMs} ms · P95 {scorecard.p95LatencyMs} ms
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="export-shadow-eval-json-btn"
                    onClick={() =>
                      triggerDownload(
                        `shadow-eval-scorecard-${Date.now()}.json`,
                        serializeShadowEvalJson(scorecard),
                        'application/json;charset=utf-8',
                      )
                    }
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-100 text-xs font-semibold rounded border border-gray-600"
                  >
                    Export JSON
                  </button>
                  <button
                    type="button"
                    data-testid="export-shadow-eval-md-btn"
                    onClick={() =>
                      triggerDownload(
                        `shadow-eval-scorecard-${Date.now()}.md`,
                        serializeShadowEvalMarkdown(scorecard),
                        'text/markdown;charset=utf-8',
                      )
                    }
                    className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-semibold rounded"
                  >
                    Export Markdown
                  </button>
                </div>
              </div>

              {/* Per-Agent Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {scorecard.agentSummaries.map((summary) => (
                  <div
                    key={summary.agentName}
                    className="bg-gray-900/80 border border-gray-700 rounded-lg p-3 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-gray-100 truncate">
                        {summary.agentDisplayName}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                          summary.failedCases === 0
                            ? 'bg-green-900/80 text-green-300'
                            : 'bg-red-900/80 text-red-300'
                        }`}
                      >
                        {summary.passedCases}/{summary.totalCases} ({summary.passRatePct}%)
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-gray-400">
                      [{summary.engineSourceLabel}] · TTFT {summary.avgTtftMs} ms · Avg {summary.avgLatencyMs} ms · P95 {summary.p95LatencyMs} ms
                    </div>
                  </div>
                ))}
              </div>

              {/* Detailed Case Rows */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700 text-xs">
                  <thead className="bg-gray-900/70 text-gray-400 uppercase">
                    <tr>
                      <th className="px-3 py-2 text-left">Verdict</th>
                      <th className="px-3 py-2 text-left">Agent</th>
                      <th className="px-3 py-2 text-left">Prompt &amp; Answer Preview</th>
                      <th className="px-3 py-2 text-left">Checks</th>
                      <th className="px-3 py-2 text-right">Latency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700/70">
                    {scorecard.results.map((r, i) => (
                      <tr key={`${r.agentName}-${r.caseId}-${i}`}>
                        <td className="px-3 py-2 whitespace-nowrap align-top">
                          <span
                            className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                              r.passed
                                ? 'bg-green-900/80 text-green-300 border border-green-700'
                                : 'bg-red-900/80 text-red-300 border border-red-700'
                            }`}
                          >
                            {r.passed ? 'PASS' : 'FAIL'}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="font-semibold text-gray-100">
                            {r.agentDisplayName}
                          </div>
                          <div className="text-[10px] font-mono text-gray-500">
                            [{r.engineSourceLabel}]
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top max-w-md">
                          <div className="text-gray-200 font-medium">{r.prompt}</div>
                          {r.error ? (
                            <div className="text-red-300 font-mono mt-1">
                              Error: {r.error}
                            </div>
                          ) : r.skippedReason ? (
                            <div className="text-amber-300 font-mono mt-1">
                              Skipped: {r.skippedReason}
                            </div>
                          ) : (
                            <div className="text-gray-400 mt-1 line-clamp-2">
                              {r.answerText || 'Empty response'}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top whitespace-nowrap font-mono text-[11px]">
                          <div
                            className={
                              r.keywordMatched ? 'text-green-300' : 'text-red-300'
                            }
                          >
                            Keyword:{' '}
                            {r.expectedKeywordOrSubstring
                              ? r.keywordMatched
                                ? `✓ "${r.expectedKeywordOrSubstring}"`
                                : `✗ missing "${r.expectedKeywordOrSubstring}"`
                              : 'n/a'}
                          </div>
                          <div
                            className={
                              r.citationMatched ? 'text-green-300' : 'text-red-300'
                            }
                          >
                            Citations: {r.citationsCount}
                            {r.requireCitations
                              ? r.citationMatched
                                ? ' ✓'
                                : ' ✗ required'
                              : ''}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top text-right whitespace-nowrap font-mono text-gray-200">
                          <div>Total: {r.totalLatencyMs} ms</div>
                          <div className="text-[10px] text-gray-400">
                            TTFT: {r.ttftMs} ms
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 bg-gray-900 flex items-center justify-between gap-3">
          <span className="text-xs text-gray-400">
            {targetAgents.length} agent{targetAgents.length === 1 ? '' : 's'} × {cases.filter((c) => c.prompt.trim()).length} prompt{cases.filter((c) => c.prompt.trim()).length === 1 ? '' : 's'} = {targetAgents.length * cases.filter((c) => c.prompt.trim()).length} ephemeral <code className="text-gray-300">:streamAssist</code> run(s)
          </span>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isRunning}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 text-xs font-semibold rounded-lg"
            >
              Close
            </button>
            <button
              type="button"
              data-testid="run-shadow-eval-btn"
              onClick={() => void handleRunShadowEval()}
              disabled={isRunning || targetAgents.length === 0}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-400 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
            >
              {isRunning && (
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-b-2 border-white" />
              )}
              <span>{isRunning ? 'Running Shadow Eval...' : 'Run Shadow Eval Gate'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShadowEvalGateModal;
