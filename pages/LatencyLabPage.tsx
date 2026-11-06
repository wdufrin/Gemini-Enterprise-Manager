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

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Agent, AppEngine, Assistant, Config, Page, UserProfile } from '../types';
import * as api from '../services/apiService';
import ProjectInput from '../components/ProjectInput';
import CloudConsoleButton from '../components/CloudConsoleButton';
import Spinner from '../components/Spinner';
import AssistantEvaluationModal from '../components/assistants/AssistantEvaluationModal';
import { usePersistedConfig } from '../hooks/usePersistedConfig';
import {
  AssistantEvaluationReport,
  ConnectedDataStoreOption,
  SkillDiagnosticMistake,
  SkillPerformanceBenchmarkPhase,
  SkillPerformanceComparisonReport,
  diagnoseSkillPerformanceAndMistakes,
  generateDefaultBenchmarkQueriesForSkill,
  runLiveAssistantEvaluation,
  runSkillBenchmarkPhase,
} from '../services/assistantEvaluationService';
import {
  isSkillAgentResource,
  sanitizeSkillDescription,
  sanitizeSkillDisplayName,
} from '../utils/skillExportUtils';
import { toErrorMessage } from '../utils/errors';

export interface LatencyLabPageProps {
  projectNumber: string;
  projectId?: string;
  setProjectNumber: (projectNumber: string) => void;
  accessToken: string;
  userProfile: UserProfile | null;
  onNavigate?: (page: Page, context?: { appEngineId?: string }) => void;
  context?: { appEngineId?: string } | null;
}

type LabTab = 'benchmark' | 'ab-skill' | 'fanout';

const DEFAULT_BENCHMARK_QUERIES = [
  'Summarize our primary architecture guidelines, standard operating procedures, and escalation policies.',
  'What are the key troubleshooting steps or recent incident runbooks in our knowledge base?',
];

function computePercentileLatency(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

const LatencyLabPage: React.FC<LatencyLabPageProps> = ({
  projectNumber,
  projectId,
  setProjectNumber,
  onNavigate,
  context,
}) => {
  const [config, setConfig] = usePersistedConfig<{ appLocation: string }>(
    'latencyLabPageConfig',
    { appLocation: 'global' },
    {
      migrate: (parsed) => ({
        appLocation: parsed?.appLocation || 'global',
      }),
    },
  );

  const [activeTab, setActiveTab] = useState<LabTab>('benchmark');
  const [engines, setEngines] = useState<AppEngine[]>([]);
  const [selectedEngineName, setSelectedEngineName] = useState<string>('');
  const [assistant, setAssistant] = useState<Assistant | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [report, setReport] = useState<AssistantEvaluationReport | null>(null);

  const [isLoadingEngines, setIsLoadingEngines] = useState(false);
  const [isEvaluatingEngine, setIsEvaluatingEngine] = useState(false);
  const [evalProgressText, setEvalProgressText] = useState<string>('');
  const [pageError, setPageError] = useState<string | null>(null);
  const [isEvalModalOpen, setIsEvalModalOpen] = useState(false);

  // Advanced DataStores & Connectors Scoping State for :streamAssist queries
  const [isAdvancedSourcesOpen, setIsAdvancedSourcesOpen] = useState(false);
  const [selectedDataStoreResources, setSelectedDataStoreResources] = useState<string[]>([]);

  // Tab 1: General :streamAssist Benchmark Suite state
  const [suiteQueries, setSuiteQueries] = useState<string[]>(DEFAULT_BENCHMARK_QUERIES);
  const [isRunningSuite, setIsRunningSuite] = useState(false);
  const [suiteProgressText, setSuiteProgressText] = useState<string>('');
  const [suiteError, setSuiteError] = useState<string | null>(null);
  const [suiteResult, setSuiteResult] = useState<SkillPerformanceBenchmarkPhase | null>(null);
  const [expandedRunIdx, setExpandedRunIdx] = useState<number | null>(null);

  // Tab 2: A/B Skill Latency Comparison state
  const [selectedSkillId, setSelectedSkillId] = useState<string>('');
  const [skillDraft, setSkillDraft] = useState<{
    skillId: string;
    displayName: string;
    description: string;
    instruction: string;
    targetSources: string[];
  }>({
    skillId: '',
    displayName: '',
    description: '',
    instruction: '',
    targetSources: [],
  });
  const [abQueries, setAbQueries] = useState<string[]>(DEFAULT_BENCHMARK_QUERIES);
  const [abBaseline, setAbBaseline] = useState<SkillPerformanceBenchmarkPhase | null>(null);
  const [abPostSkill, setAbPostSkill] = useState<SkillPerformanceBenchmarkPhase | null>(null);
  const [abComparison, setAbComparison] = useState<SkillPerformanceComparisonReport | null>(null);
  const [isRunningAb, setIsRunningAb] = useState(false);
  const [abProgressText, setAbProgressText] = useState<string>('');
  const [abStatusMessage, setAbStatusMessage] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  const handledContextEngineRef = useRef<string | null>(null);

  const baseApiConfig: Config = useMemo(
    () => ({
      projectId: projectId || projectNumber,
      appLocation: config.appLocation,
      collectionId: 'default_collection',
      appId: '',
      assistantId: 'default_assistant',
    }),
    [projectNumber, projectId, config.appLocation],
  );

  const selectedEngine = useMemo(
    () => engines.find((e) => e.name === selectedEngineName) || null,
    [engines, selectedEngineName],
  );

  const currentEngineConfig: Config = useMemo(() => {
    const engineShortId = selectedEngine?.name.split('/').pop() || '';
    const assistantShortId = assistant?.name?.split('/').pop() || 'default_assistant';
    return {
      ...baseApiConfig,
      appId: engineShortId,
      assistantId: assistantShortId,
    };
  }, [baseApiConfig, selectedEngine, assistant]);

  // Handle deep-link context from AssistantPage / AssistantDetailView / AssistantEvaluationModal
  useEffect(() => {
    const targetEngineName = context?.appEngineId;
    if (!targetEngineName || typeof targetEngineName !== 'string') return;

    const parts = targetEngineName.split('/');
    const targetLocation = parts.length >= 4 ? parts[3] : undefined;
    if (targetLocation && targetLocation !== config.appLocation) {
      setConfig((prev) => ({ ...prev, appLocation: targetLocation }));
      return;
    }

    if (handledContextEngineRef.current === targetEngineName || engines.length === 0) {
      return;
    }

    const targetShortId = parts.pop();
    const matched = engines.find(
      (e) =>
        e.name === targetEngineName ||
        (targetShortId && e.name.endsWith(`/${targetShortId}`)),
    );
    if (matched) {
      handledContextEngineRef.current = targetEngineName;
      setSelectedEngineName(matched.name);
    }
  }, [context, config.appLocation, setConfig, engines]);

  const fetchEnginesList = useCallback(async () => {
    if (!projectNumber) return;
    setIsLoadingEngines(true);
    setPageError(null);
    try {
      const response = await api.listResources('engines', baseApiConfig);
      const rawEngines: AppEngine[] = response.engines || [];
      const geEngines = rawEngines.filter((e) => e.appType === 'APP_TYPE_INTRANET' || !e.appType);
      setEngines(geEngines);

      if (geEngines.length > 0) {
        setSelectedEngineName((prev) => {
          if (prev && geEngines.some((e) => e.name === prev)) return prev;
          return geEngines[0].name;
        });
      } else {
        setSelectedEngineName('');
        setAssistant(null);
        setAgents([]);
        setReport(null);
      }
    } catch (err: unknown) {
      setPageError(toErrorMessage(err, 'Failed to load Gemini Enterprise engines.'));
    } finally {
      setIsLoadingEngines(false);
    }
  }, [projectNumber, baseApiConfig]);

  useEffect(() => {
    void fetchEnginesList();
  }, [fetchEnginesList]);

  const loadSelectedEngineContext = useCallback(
    async (engineObj: AppEngine) => {
      const engineId = engineObj.name.split('/').pop()!;
      const engineScopedConfig: Config = {
        ...baseApiConfig,
        appId: engineId,
        assistantId: 'default_assistant',
      };

      setIsEvaluatingEngine(true);
      setEvalProgressText('Loading Assistant, Skills, and Connected DataStores...');
      setPageError(null);

      try {
        let resolvedAssistant: Assistant = {
          name: `${engineObj.name}/assistants/default_assistant`,
          displayName: 'Default Assistant',
        };
        try {
          const assistantsRes = await api.listResources('assistants', engineScopedConfig);
          const list: Assistant[] = assistantsRes.assistants || [];
          resolvedAssistant =
            list.find((a) => a.name.endsWith('/default_assistant')) ||
            list[0] ||
            resolvedAssistant;
        } catch {
          resolvedAssistant = await api.getAssistant(
            `${engineObj.name}/assistants/default_assistant`,
            engineScopedConfig,
          );
        }

        const assistantShortId =
          resolvedAssistant.name?.split('/').pop() || 'default_assistant';
        const fullConfig: Config = {
          ...engineScopedConfig,
          assistantId: assistantShortId,
        };

        let fetchedAgents: Agent[] = [];
        let agentsFetchWarning: string | null = null;
        try {
          const agentsRes = await api.listResources('agents', fullConfig);
          fetchedAgents = agentsRes.agents || [];
        } catch (agentErr: unknown) {
          fetchedAgents = [];
          agentsFetchWarning = `Agents list probe warning: ${toErrorMessage(
            agentErr,
            'Could not list assistant agents/skills.',
          )}`;
        }

        setAssistant(resolvedAssistant);
        setAgents(fetchedAgents);

        const evalReport = await runLiveAssistantEvaluation(
          engineObj,
          resolvedAssistant,
          fetchedAgents,
          fullConfig,
          (step) => setEvalProgressText(step),
        );
        const mergedReport: AssistantEvaluationReport = agentsFetchWarning
          ? {
              ...evalReport,
              probeWarnings: [...(evalReport.probeWarnings || []), agentsFetchWarning],
            }
          : evalReport;
        setReport(mergedReport);

        const byomcpIds = new Set(
          (mergedReport.byomcpEvaluations || []).map((m) => m.collectionId),
        );
        const rawInitialResources =
          mergedReport.connectedDataStoreDetails &&
          mergedReport.connectedDataStoreDetails.length > 0
            ? mergedReport.connectedDataStoreDetails
                .filter((d) => !d.isByomcp)
                .map((d) => d.resourceName)
            : (
                mergedReport.connectedDataStoreResourceNames &&
                mergedReport.connectedDataStoreResourceNames.length > 0
                  ? mergedReport.connectedDataStoreResourceNames
                  : (engineObj.dataStoreIds || []).map(
                      (id) =>
                        `projects/${fullConfig.projectId}/locations/${
                          fullConfig.appLocation || 'global'
                        }/collections/default_collection/dataStores/${id}`,
                    )
              ).filter((uri) => {
                const shortId = uri.split('/').pop() || uri;
                return !byomcpIds.has(shortId);
              });
        setSelectedDataStoreResources(rawInitialResources);

        // Seed benchmark queries from the engine's recommended skills if user hasn't customized them
        if (mergedReport.recommendedSkills.length > 0) {
          const firstSkill = mergedReport.recommendedSkills[0];
          const generatedQueries = generateDefaultBenchmarkQueriesForSkill(firstSkill);
          setSuiteQueries((prev) =>
            prev === DEFAULT_BENCHMARK_QUERIES && generatedQueries.length > 0
              ? generatedQueries
              : prev,
          );
          setSelectedSkillId(firstSkill.id);
          setSkillDraft({
            skillId: firstSkill.skillIdSuggestion,
            displayName: firstSkill.displayName,
            description: firstSkill.description,
            instruction: firstSkill.instruction,
            targetSources: firstSkill.targetSources,
          });
          setAbQueries(generatedQueries);
        } else {
          const orgSkills = fetchedAgents.filter((a) => isSkillAgentResource(a));
          if (orgSkills.length > 0) {
            const firstOrg = orgSkills[0];
            const shortId = firstOrg.name.split('/').pop() || 'custom-skill';
            setSelectedSkillId(`deployed:${shortId}`);
            setSkillDraft({
              skillId: shortId,
              displayName: firstOrg.displayName || shortId,
              description: firstOrg.description || '',
              instruction: firstOrg.skillAgentDefinition?.instruction || '',
              targetSources: engineObj.dataStoreIds || [],
            });
          }
        }
      } catch (err: unknown) {
        setPageError(
          toErrorMessage(err, 'Failed to evaluate selected engine and assistant configuration.'),
        );
      } finally {
        setIsEvaluatingEngine(false);
        setEvalProgressText('');
      }
    },
    [baseApiConfig],
  );

  useEffect(() => {
    if (selectedEngine) {
      setSuiteResult(null);
      setAbBaseline(null);
      setAbPostSkill(null);
      setAbComparison(null);
      setAbStatusMessage(null);
      void loadSelectedEngineContext(selectedEngine);
    }
  }, [selectedEngine, loadSelectedEngineContext]);

  // Available DataStore / Connector options for Advanced Query Scoping
  const availableDataStoreOptions: ConnectedDataStoreOption[] = useMemo(() => {
    if (report?.connectedDataStoreDetails && report.connectedDataStoreDetails.length > 0) {
      return report.connectedDataStoreDetails;
    }
    const resourceUris =
      report?.connectedDataStoreResourceNames &&
      report.connectedDataStoreResourceNames.length > 0
        ? report.connectedDataStoreResourceNames
        : (selectedEngine?.dataStoreIds || []).map(
            (id) =>
              `projects/${currentEngineConfig.projectId}/locations/${
                currentEngineConfig.appLocation || 'global'
              }/collections/default_collection/dataStores/${id}`,
          );
    const byomcpSet = new Set((report?.byomcpEvaluations || []).map((m) => m.collectionId));
    return resourceUris.map((resourceName) => {
      const id = resourceName.split('/').pop() || resourceName;
      const parts = resourceName.split('/');
      const collIdx = parts.indexOf('collections');
      const collectionId =
        collIdx !== -1 && parts[collIdx + 1] ? parts[collIdx + 1] : 'default_collection';
      const isByomcp = byomcpSet.has(collectionId) || byomcpSet.has(id);
      return {
        id,
        resourceName,
        displayName: id,
        collectionId,
        sourceType: isByomcp ? 'BYOMCP' : 'DATA_STORE',
        isByomcp,
      };
    });
  }, [report, selectedEngine, currentEngineConfig.projectId, currentEngineConfig.appLocation]);

  const scoppableDataStoreOptions = useMemo(
    () => availableDataStoreOptions.filter((o) => !o.isByomcp),
    [availableDataStoreOptions],
  );

  const handleToggleDataStoreResource = (resourceName: string) => {
    setSelectedDataStoreResources((prev) =>
      prev.includes(resourceName)
        ? prev.filter((r) => r !== resourceName)
        : [...prev, resourceName],
    );
  };

  // Available skill options for Tab 2 (Recommended Skills + Deployed Organizational Skills)
  const availableSkillOptions = useMemo(() => {
    const list: Array<{
      id: string;
      label: string;
      badge: string;
      skillId: string;
      displayName: string;
      description: string;
      instruction: string;
      targetSources: string[];
      sampleQueries?: string[];
      deployedAgentName?: string;
    }> = [];

    const orgSkillAgents = agents.filter((a) => isSkillAgentResource(a));

    if (report?.recommendedSkills) {
      for (const tpl of report.recommendedSkills) {
        const matchingDeployed = orgSkillAgents.find(
          (a) =>
            (a.name.split('/').pop() || '').toLowerCase() ===
              tpl.skillIdSuggestion.toLowerCase() ||
            sanitizeSkillDisplayName(a.displayName || '').toLowerCase() ===
              sanitizeSkillDisplayName(tpl.displayName).toLowerCase(),
        );
        list.push({
          id: tpl.id,
          label: tpl.displayName,
          badge: matchingDeployed ? 'Deployed' : 'Recommended Template',
          skillId: tpl.skillIdSuggestion,
          displayName: tpl.displayName,
          description: tpl.description,
          instruction: tpl.instruction,
          targetSources: tpl.targetSources,
          sampleQueries: tpl.sampleQueries,
          deployedAgentName: matchingDeployed?.name || tpl.alreadyDeployedAgentName,
        });
      }
    }

    for (const sk of orgSkillAgents) {
      const shortId = sk.name.split('/').pop() || sk.name;
      const alreadyListed = list.some(
        (item) =>
          item.skillId.toLowerCase() === shortId.toLowerCase() ||
          item.deployedAgentName === sk.name,
      );
      if (!alreadyListed) {
        list.push({
          id: `deployed:${shortId}`,
          label: sk.displayName || shortId,
          badge: (sk.state || 'ENABLED').toUpperCase() === 'ENABLED' ? 'Active Skill' : 'Disabled Skill',
          skillId: shortId,
          displayName: sk.displayName || shortId,
          description: sk.description || '',
          instruction: sk.skillAgentDefinition?.instruction || '',
          targetSources: selectedEngine?.dataStoreIds || [],
          deployedAgentName: sk.name,
        });
      }
    }

    return list;
  }, [report, agents, selectedEngine]);

  const handleSelectSkillOption = (optionId: string) => {
    setSelectedSkillId(optionId);
    setAbBaseline(null);
    setAbPostSkill(null);
    setAbComparison(null);
    setAbStatusMessage(null);

    const found = availableSkillOptions.find((o) => o.id === optionId);
    if (!found) return;

    setSkillDraft({
      skillId: found.skillId,
      displayName: found.displayName,
      description: found.description,
      instruction: found.instruction,
      targetSources: found.targetSources,
    });

    const queries = generateDefaultBenchmarkQueriesForSkill({
      id: found.id,
      skillIdSuggestion: found.skillId,
      displayName: found.displayName,
      description: found.description,
      instruction: found.instruction,
      rationale: '',
      targetSources: found.targetSources,
      sampleQueries: found.sampleQueries,
    });
    setAbQueries(queries);
  };

  // Generate Suite Queries from Engine Sources
  const handlePopulateQueriesFromSources = () => {
    const generated: string[] = [];
    if (report?.recommendedSkills && report.recommendedSkills.length > 0) {
      for (const tpl of report.recommendedSkills) {
        const qs = generateDefaultBenchmarkQueriesForSkill(tpl);
        for (const q of qs) {
          if (!generated.includes(q) && generated.length < 5) {
            generated.push(q);
          }
        }
      }
    }
    if (generated.length === 0) {
      const dsIds = selectedEngine?.dataStoreIds || [];
      if (dsIds.length > 0) {
        generated.push(
          `Search ${dsIds[0]} for key standard operating procedures, policies, and reference architecture.`,
        );
        if (dsIds[1]) {
          generated.push(
            `Find recent updates, troubleshooting guides, or records in ${dsIds[1]}.`,
          );
        }
      } else {
        generated.push(...DEFAULT_BENCHMARK_QUERIES);
      }
    }
    setSuiteQueries(generated);
  };

  const handlePopulateFanoutProbeQueries = () => {
    const dsIds = selectedEngine?.dataStoreIds || [];
    const primarySource = dsIds[0] || 'our primary knowledge base';
    const secondarySource = dsIds[1] || 'our secondary connector';
    setSuiteQueries([
      `[Single-Source Probe] In ${primarySource}, what are the official architecture standards and escalation procedures?`,
      `[Single-Source Probe] In ${secondarySource}, list the latest operational runbooks and active status updates.`,
      `[Cross-Source Fan-Out Probe] Compare policies and recent operational records across both ${primarySource} and ${secondarySource}.`,
    ]);
  };

  // Execute Tab 1 Benchmark Suite
  const handleRunBenchmarkSuite = async () => {
    if (!selectedEngine) return;
    const cleanQueries = suiteQueries.map((q) => q.trim()).filter(Boolean);
    if (cleanQueries.length === 0) {
      setSuiteError('Please enter at least one non-empty benchmark query before running.');
      return;
    }

    setIsRunningSuite(true);
    setSuiteError(null);
    setSuiteProgressText('Initializing :streamAssist benchmark runner...');

    try {
      const byomcpUriSet = new Set(
        availableDataStoreOptions.filter((o) => o.isByomcp).map((o) => o.resourceName),
      );
      const validScopedDataStoreResources = selectedDataStoreResources.filter(
        (uri) => !byomcpUriSet.has(uri),
      );
      const targetSources = Array.from(
        new Set([
          ...validScopedDataStoreResources.map((r) => r.split('/').pop() || r),
          ...(selectedEngine.dataStoreIds || []),
          ...(report?.byomcpEvaluations.map((b) => b.collectionId) || []),
        ]),
      );

      const phaseResult = await runSkillBenchmarkPhase(
        cleanQueries,
        currentEngineConfig,
        {
          skillId: 'engine-latency-suite',
          displayName: selectedEngine.displayName || 'Engine Latency Suite',
          description: 'Engine-wide latency and source routing probe',
          instruction: '',
          targetSources,
        },
        validScopedDataStoreResources,
        (step) => setSuiteProgressText(step),
      );
      setSuiteResult(phaseResult);
    } catch (err: unknown) {
      setSuiteError(toErrorMessage(err, 'Failed to execute :streamAssist benchmark suite.'));
    } finally {
      setIsRunningSuite(false);
      setSuiteProgressText('');
    }
  };

  // Export Benchmark Suite Results
  const handleExportSuiteJson = () => {
    if (!suiteResult || !selectedEngine) return;
    const avgTtftMs = suiteResult.avgTtftMs ?? suiteResult.avgTtfbMs;
    const avgTtfaMs =
      suiteResult.avgTtfaMs ??
      Math.round(
        suiteResult.runs.reduce((s, r) => s + (r.ttfaMs ?? r.totalLatencyMs), 0) /
          Math.max(1, suiteResult.runs.length),
      );
    const payload = {
      exportedAt: new Date().toISOString(),
      projectId: currentEngineConfig.projectId,
      location: currentEngineConfig.appLocation,
      engineName: selectedEngine.name,
      engineDisplayName: selectedEngine.displayName,
      scopedDataStoreResources: selectedDataStoreResources,
      benchmarkSummary: {
        avgLatencyMs: suiteResult.avgLatencyMs,
        avgTtftMs,
        avgTtfaMs,
        avgPlannerRetrievalMs: Math.max(0, avgTtfaMs - avgTtftMs),
        avgTtfbMs: suiteResult.avgTtfbMs,
        p95LatencyMs: computePercentileLatency(
          suiteResult.runs.map((r) => r.totalLatencyMs),
          95,
        ),
        skillTriggerRate: suiteResult.skillTriggerRate,
      },
      runs: suiteResult.runs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `latency-benchmark-${selectedEngine.name.split('/').pop() || 'engine'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Tab 2: Run Baseline, Deploy Skill, Run Post-Skill, or Full Automated A/B
  const getConflictContext = useCallback(() => {
    const sysInst =
      assistant?.generationConfig?.systemInstruction?.additionalSystemInstruction || '';
    const styleInst = assistant?.styleAndFormattingInstructions || '';
    const combined =
      sysInst.trim() && styleInst.trim() && sysInst.trim() !== styleInst.trim()
        ? `${sysInst.trim()}\n\n${styleInst.trim()}`
        : sysInst || styleInst;
    return {
      assistantSystemInstruction: combined,
      byomcpEvaluations: report?.byomcpEvaluations || [],
    };
  }, [assistant, report]);

  const handleRunAbBaseline = async () => {
    const cleanQueries = abQueries.map((q) => q.trim()).filter(Boolean);
    if (cleanQueries.length === 0) {
      setAbStatusMessage({
        type: 'err',
        text: 'Please provide at least one non-empty query for the A/B benchmark.',
      });
      return;
    }

    setIsRunningAb(true);
    setAbStatusMessage(null);
    setAbProgressText('Running Phase 1: Baseline (Before Skill) against :streamAssist...');
    try {
      const cleanSkillId =
        skillDraft.skillId
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9-_]/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 63) || 'enterprise-routing-skill';
      const finalDisplayName =
        sanitizeSkillDisplayName(skillDraft.displayName) || 'Enterprise Routing Skill';
      const existingEnabledSkill = agents.find(
        (a) =>
          isSkillAgentResource(a) &&
          (a.state || 'ENABLED').toUpperCase() === 'ENABLED' &&
          ((a.name.split('/').pop() || '').toLowerCase() === cleanSkillId ||
            sanitizeSkillDisplayName(a.displayName || '').toLowerCase() ===
              finalDisplayName.toLowerCase()),
      );

      let pausedSkillNote = '';
      if (existingEnabledSkill && typeof api.disableAgent === 'function') {
        setAbProgressText(
          `Temporarily disabling deployed Skill "${existingEnabledSkill.displayName}" for clean Baseline...`,
        );
        await api.disableAgent(existingEnabledSkill.name, currentEngineConfig);
        setAgents((prev) =>
          prev.map((a) =>
            a.name === existingEnabledSkill.name ? { ...a, state: 'DISABLED' } : a,
          ),
        );
        pausedSkillNote = ` (Deployed Skill "${existingEnabledSkill.displayName}" was temporarily disabled for a clean Before-Skill baseline.)`;
      }

      const byomcpUriSet = new Set(
        availableDataStoreOptions.filter((o) => o.isByomcp).map((o) => o.resourceName),
      );
      const validScopedDataStoreResources = selectedDataStoreResources.filter(
        (uri) => !byomcpUriSet.has(uri),
      );

      const baseline = await runSkillBenchmarkPhase(
        cleanQueries,
        currentEngineConfig,
        skillDraft,
        validScopedDataStoreResources,
        (step) => setAbProgressText(`Baseline: ${step}`),
      );
      setAbBaseline(baseline);
      const comparison = diagnoseSkillPerformanceAndMistakes(
        skillDraft,
        cleanQueries,
        baseline,
        abPostSkill || undefined,
        getConflictContext(),
      );
      setAbComparison(comparison);
      const baseTtft = baseline.avgTtftMs ?? baseline.avgTtfbMs;
      const baseTtfa = baseline.avgTtfaMs ?? baseline.avgLatencyMs;
      setAbStatusMessage({
        type: 'ok',
        text: `Baseline complete: ${baseline.avgLatencyMs.toLocaleString()} ms avg total latency (1st Thought Chunk: ${baseTtft.toLocaleString()} ms, 1st Answer Chunk: ${baseTtfa.toLocaleString()} ms).${pausedSkillNote}`,
      });
    } catch (err: unknown) {
      setAbStatusMessage({
        type: 'err',
        text: toErrorMessage(err, 'Failed to run Baseline benchmark.'),
      });
    } finally {
      setIsRunningAb(false);
      setAbProgressText('');
    }
  };

  const handleDeployOrUpdateSkillInLab = async () => {
    if (!selectedEngine) return;
    const finalDisplayName =
      sanitizeSkillDisplayName(skillDraft.displayName) || 'Enterprise Routing Skill';
    const finalDescription = sanitizeSkillDescription(skillDraft.description.trim());
    const finalInstruction = skillDraft.instruction.trim();
    const cleanSkillId =
      skillDraft.skillId
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 63) || 'enterprise-routing-skill';

    if (!finalDescription || !finalInstruction) {
      setAbStatusMessage({
        type: 'err',
        text: 'Both Trigger Description and Markdown Instructions are required to deploy a Skill.',
      });
      return;
    }

    setIsRunningAb(true);
    setAbProgressText(`Deploying & enabling Skill "${finalDisplayName}" on Assistant...`);
    setAbStatusMessage(null);

    try {
      const existingAgent = agents.find(
        (a) =>
          isSkillAgentResource(a) &&
          ((a.name.split('/').pop() || '').toLowerCase() === cleanSkillId ||
            sanitizeSkillDisplayName(a.displayName || '').toLowerCase() ===
              finalDisplayName.toLowerCase()),
      );

      if (existingAgent) {
        await api.updateAgent(
          { name: existingAgent.name, displayName: finalDisplayName },
          {
            displayName: finalDisplayName,
            description: finalDescription,
            state: 'ENABLED',
            sharingConfig: { scope: 'ALL_USERS' },
            skillAgentDefinition: {
              instruction: finalInstruction,
            },
          },
          currentEngineConfig,
        );
        await api.enableAgent(existingAgent.name, currentEngineConfig);
      } else {
        await api.createAgent(
          {
            displayName: finalDisplayName,
            description: finalDescription,
            state: 'ENABLED',
            sharingConfig: { scope: 'ALL_USERS' },
            skillAgentDefinition: {
              instruction: finalInstruction,
            },
          },
          currentEngineConfig,
          cleanSkillId,
        );
      }

      const refreshedAgentsRes = await api.listResources('agents', currentEngineConfig);
      setAgents(refreshedAgentsRes.agents || []);

      setAbStatusMessage({
        type: 'ok',
        text: `Skill "${finalDisplayName}" is deployed and ENABLED on the Assistant! Now click "3. Run After Skill" to compare latency.`,
      });
    } catch (err: unknown) {
      setAbStatusMessage({
        type: 'err',
        text: toErrorMessage(err, 'Failed to deploy or update Skill on Assistant.'),
      });
    } finally {
      setIsRunningAb(false);
      setAbProgressText('');
    }
  };

  const handleRunAbPostSkill = async () => {
    const cleanQueries = abQueries.map((q) => q.trim()).filter(Boolean);
    if (cleanQueries.length === 0) {
      setAbStatusMessage({
        type: 'err',
        text: 'Please provide at least one non-empty query for the A/B benchmark.',
      });
      return;
    }

    setIsRunningAb(true);
    setAbStatusMessage(null);
    setAbProgressText('Running Phase 2: Post-Skill (After Skill) against :streamAssist...');
    try {
      const byomcpUriSet = new Set(
        availableDataStoreOptions.filter((o) => o.isByomcp).map((o) => o.resourceName),
      );
      const validScopedDataStoreResources = selectedDataStoreResources.filter(
        (uri) => !byomcpUriSet.has(uri),
      );

      const postResult = await runSkillBenchmarkPhase(
        cleanQueries,
        currentEngineConfig,
        skillDraft,
        validScopedDataStoreResources,
        (step) => setAbProgressText(`Post-Skill: ${step}`),
      );
      setAbPostSkill(postResult);
      const comparison = diagnoseSkillPerformanceAndMistakes(
        skillDraft,
        cleanQueries,
        abBaseline || undefined,
        postResult,
        getConflictContext(),
      );
      setAbComparison(comparison);
      const hasCriticalMistake = comparison.mistakes.some((m) => m.severity === 'CRITICAL');
      setAbStatusMessage({
        type: hasCriticalMistake ? 'err' : 'ok',
        text: comparison.verdictSummary,
      });
    } catch (err: unknown) {
      setAbStatusMessage({
        type: 'err',
        text: toErrorMessage(err, 'Failed to run Post-Skill benchmark.'),
      });
    } finally {
      setIsRunningAb(false);
      setAbProgressText('');
    }
  };

  const handleApplyMistakeFixToDraft = (mistake: SkillDiagnosticMistake) => {
    setSkillDraft((prev) => ({
      ...prev,
      description: mistake.recommendedDescriptionPatch
        ? sanitizeSkillDescription(mistake.recommendedDescriptionPatch)
        : prev.description,
      instruction: mistake.recommendedInstructionAppend
        ? `${prev.instruction.trim()}${mistake.recommendedInstructionAppend}`
        : prev.instruction,
    }));
    setAbStatusMessage({
      type: 'ok',
      text: `Applied recommended fix for "${mistake.title}". Click "2. Deploy / Update Skill" and re-run "3. Run After Skill" to verify!`,
    });
  };

  // Suite summary stats (client-observed 1st thought chunk & 1st answer chunk, no synthetic multipliers)
  const suiteSummary = useMemo(() => {
    if (!suiteResult || suiteResult.runs.length === 0) return null;
    const validRuns = suiteResult.runs.filter(
      (r) => !r.errorMessage && !r.skippedReason && r.answerPreview.trim().length > 0,
    );
    const metricRuns = validRuns.length > 0 ? validRuns : suiteResult.runs;
    const latencies = metricRuns.map((r) => r.totalLatencyMs);
    const minLatencyMs = Math.min(...latencies);
    const maxLatencyMs = Math.max(...latencies);
    const p95LatencyMs = computePercentileLatency(latencies, 95);
    const totalThoughts = suiteResult.runs.reduce((s, r) => s + r.thoughtSteps.length, 0);
    const avgThoughts = Number((totalThoughts / suiteResult.runs.length).toFixed(1));
    const totalCitations = suiteResult.runs.reduce((s, r) => s + r.citationsCount, 0);
    const uniqueRoutedSources = Array.from(
      new Set(suiteResult.runs.flatMap((r) => r.routedSources)),
    );

    const avgTtftMs =
      suiteResult.avgTtftMs ??
      Math.round(
        metricRuns.reduce((s, r) => s + (r.ttftMs ?? r.ttfbMs), 0) /
          Math.max(1, metricRuns.length),
      );
    const avgTtfaMs =
      suiteResult.avgTtfaMs ??
      Math.round(
        metricRuns.reduce((s, r) => {
          const runTtft = r.ttftMs ?? r.ttfbMs;
          const runTtfa =
            r.errorMessage || r.skippedReason
              ? runTtft
              : Math.min(r.totalLatencyMs, Math.max(runTtft, r.ttfaMs ?? runTtft));
          return s + runTtfa;
        }, 0) / Math.max(1, metricRuns.length),
      );
    const avgPlannerRetrievalMs =
      suiteResult.avgPlannerRetrievalMs ?? Math.max(0, avgTtfaMs - avgTtftMs);
    const avgAnswerTailMs = Math.max(0, suiteResult.avgLatencyMs - avgTtfaMs);

    return {
      minLatencyMs,
      maxLatencyMs,
      p95LatencyMs,
      avgTtftMs,
      avgTtfaMs,
      avgPlannerRetrievalMs,
      avgAnswerTailMs,
      avgThoughts,
      totalCitations,
      uniqueRoutedSources,
      sampleSize: metricRuns.length,
    };
  }, [suiteResult]);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Top Banner & Project / Engine Selector */}
      <div className="bg-gray-800 p-5 rounded-xl shadow-md border border-gray-700 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-900/50 text-indigo-300 border border-indigo-700/60 rounded-lg">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold text-white">
                  Gemini Enterprise Latency Testing Lab
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-indigo-950/90 text-indigo-300 border border-indigo-700/70">
                  :streamAssist Telemetry &bull; Skill A/B Lab &bull; Fan-Out Diagnostics
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Benchmark live Time-to-First-Byte (TTFB), total response latency, planner deliberation steps, grounded citations, and Before/After Skill routing speedups.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedEngine && assistant && (
              <button
                type="button"
                onClick={() => setIsEvalModalOpen(true)}
                className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg shadow transition-colors flex items-center gap-1.5"
              >
                <span>🛡️ Open Full Evaluation Studio</span>
              </button>
            )}
            {selectedEngine && onNavigate && (
              <button
                type="button"
                onClick={() =>
                  onNavigate(Page.ASSISTANT, { appEngineId: selectedEngine.name })
                }
                className="px-3.5 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-semibold rounded-lg border border-gray-600 transition-colors"
              >
                View in Engines &amp; Assistants
              </button>
            )}
            <CloudConsoleButton
              url={`https://console.cloud.google.com/gemini-enterprise/apps?project=${projectNumber}`}
            />
          </div>
        </div>

        {/* Project / Location / Engine Controls */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end pt-2 border-t border-gray-700/70">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Project ID / Number
            </label>
            <ProjectInput value={projectNumber} onChange={setProjectNumber} />
          </div>
          <div>
            <label
              htmlFor="latencyLabLocation"
              className="block text-xs font-medium text-gray-400 mb-1"
            >
              Location
            </label>
            <select
              id="latencyLabLocation"
              value={config.appLocation}
              onChange={(e) => setConfig({ appLocation: e.target.value })}
              className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 w-full h-[42px] focus:ring-indigo-500"
            >
              <option value="global">global</option>
              <option value="us">us</option>
              <option value="eu">eu</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label
              htmlFor="latencyLabEngineSelect"
              className="block text-xs font-medium text-gray-400 mb-1"
            >
              Target Gemini Enterprise App Engine
            </label>
            <div className="flex gap-2">
              <select
                id="latencyLabEngineSelect"
                value={selectedEngineName}
                onChange={(e) => setSelectedEngineName(e.target.value)}
                disabled={isLoadingEngines || engines.length === 0}
                className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-200 flex-1 h-[42px] focus:ring-indigo-500 disabled:opacity-50"
              >
                {engines.length === 0 ? (
                  <option value="">
                    {isLoadingEngines ? 'Loading engines...' : 'No engines found in location'}
                  </option>
                ) : (
                  engines.map((eng) => {
                    const shortId = eng.name.split('/').pop() || eng.name;
                    return (
                      <option key={eng.name} value={eng.name}>
                        {eng.displayName} ({shortId})
                      </option>
                    );
                  })
                )}
              </select>
              <button
                type="button"
                onClick={() => {
                  if (selectedEngine) {
                    void loadSelectedEngineContext(selectedEngine);
                  } else {
                    void fetchEnginesList();
                  }
                }}
                disabled={isLoadingEngines || isEvaluatingEngine}
                className="px-3.5 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 text-xs font-semibold rounded-md border border-gray-600 h-[42px] shrink-0"
              >
                {isEvaluatingEngine ? 'Syncing...' : 'Refresh'}
              </button>
            </div>
          </div>
        </div>

        {/* Engine Telemetry Pill Strip */}
        {report && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-3 border-t border-gray-700/70">
            <div className="bg-gray-900/70 border border-gray-700/80 rounded-lg p-3">
              <span className="text-[11px] uppercase tracking-wider text-gray-400 block">
                Architecture Grade
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-lg font-bold text-white">
                  Grade {report.grade}
                </span>
                <span className="text-xs text-gray-400 font-mono">
                  ({report.overallScore}/100)
                </span>
              </div>
            </div>
            <div className="bg-gray-900/70 border border-gray-700/80 rounded-lg p-3">
              <span className="text-[11px] uppercase tracking-wider text-gray-400 block">
                Fan-Out Latency Risk
              </span>
              <span
                className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-bold ${
                  report.latencyRiskLevel === 'LOW'
                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60'
                    : report.latencyRiskLevel === 'MODERATE'
                    ? 'bg-amber-950/80 text-amber-300 border border-amber-700/60'
                    : 'bg-red-950/80 text-red-300 border border-red-700/60'
                }`}
              >
                {report.latencyRiskLevel}
              </span>
            </div>
            <div className="bg-gray-900/70 border border-gray-700/80 rounded-lg p-3">
              <span className="text-[11px] uppercase tracking-wider text-gray-400 block">
                Connected DataStores
              </span>
              <span className="text-lg font-bold text-white mt-1 block">
                {report.metrics.connectedDataStoresCount}
              </span>
            </div>
            <div className="bg-gray-900/70 border border-gray-700/80 rounded-lg p-3">
              <span className="text-[11px] uppercase tracking-wider text-gray-400 block">
                BYOMCP Connectors
              </span>
              <span className="text-lg font-bold text-white mt-1 block">
                {report.metrics.byomcpConnectorsCount}
              </span>
            </div>
            <div className="bg-gray-900/70 border border-gray-700/80 rounded-lg p-3">
              <span className="text-[11px] uppercase tracking-wider text-gray-400 block">
                Active Org Skills
              </span>
              <span className="text-lg font-bold text-white mt-1 block">
                {report.metrics.enabledSkillsCount}
              </span>
            </div>
          </div>
        )}
      </div>

      {pageError && (
        <div
          role="alert"
          className="p-4 bg-red-950/50 border border-red-800 rounded-lg text-red-200 text-sm"
        >
          {pageError}
        </div>
      )}

      {isEvaluatingEngine && !report && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-10 flex flex-col items-center justify-center text-center space-y-3">
          <Spinner />
          <p className="text-sm font-semibold text-white">
            Inspecting Engine Topology, Skills &amp; Connected DataStores...
          </p>
          <p className="text-xs text-gray-400 font-mono">{evalProgressText}</p>
        </div>
      )}

      {/* Workspace Mode Tabs */}
      {selectedEngine && (
        <div className="border-b border-gray-700 flex flex-wrap gap-2">
          {[
            {
              id: 'benchmark' as LabTab,
              label: '1. :streamAssist Latency Benchmark',
              badge: suiteResult ? `${suiteResult.avgLatencyMs} ms avg` : 'Live Probe',
            },
            {
              id: 'ab-skill' as LabTab,
              label: '2. Before vs. After Skill A/B Lab',
              badge: `${availableSkillOptions.length} Skills`,
            },
            {
              id: 'fanout' as LabTab,
              label: '3. DataStore & Connector Fan-Out Inspector',
              badge: report ? `${report.metrics.connectedDataStoresCount} Stores` : undefined,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-300 bg-gray-800/60 rounded-t-lg'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600'
              }`}
            >
              <span>{tab.label}</span>
              {tab.badge && (
                <span className="px-2 py-0.5 text-[10px] font-mono rounded-full bg-gray-700 text-gray-200 border border-gray-600">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* =====================================================================
          TAB 1: :streamAssist LATENCY & ROUTING BENCHMARK SUITE
         ===================================================================== */}
      {selectedEngine && activeTab === 'benchmark' && (
        <div className="space-y-6">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-white">
                  :streamAssist Benchmark Prompt Suite
                </h2>
                <p className="text-xs text-gray-400">
                  Configure domain queries to run sequentially against{' '}
                  <code className="text-indigo-300 font-mono">
                    {selectedEngine.name.split('/').pop()}:streamAssist
                  </code>{' '}
                  and measure client-observed 1st Thought Chunk (TTFT), 1st Answer Chunk (TTFA), 1st Wire Chunk (TTFB), total latency, planner thought steps, and grounded citations.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAdvancedSourcesOpen((prev) => !prev)}
                  data-testid="toggle-advanced-datastore-selector"
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 ${
                    isAdvancedSourcesOpen
                      ? 'bg-indigo-900/70 border-indigo-500 text-indigo-200'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-600'
                  }`}
                >
                  <span>⚙️ Advanced: DataStores &amp; Connectors</span>
                  <span className="px-1.5 py-0.2 rounded bg-gray-900/80 text-indigo-300 font-mono text-[11px] border border-gray-700">
                    {selectedDataStoreResources.length}/{scoppableDataStoreOptions.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handlePopulateQueriesFromSources}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-medium rounded-lg border border-gray-600 transition-colors"
                >
                  Auto-Generate from Attached Sources
                </button>
                <button
                  type="button"
                  onClick={handlePopulateFanoutProbeQueries}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-medium rounded-lg border border-gray-600 transition-colors"
                >
                  Load Single-Source vs. Fan-Out Probes
                </button>
                <button
                  type="button"
                  onClick={() => setSuiteQueries((prev) => [...prev, ''])}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-medium rounded-lg border border-gray-600 transition-colors"
                >
                  + Add Query
                </button>
              </div>
            </div>

            {/* Collapsible Advanced DataStores & Connectors Scoping Panel */}
            {isAdvancedSourcesOpen && (
              <div
                data-testid="advanced-datastore-selector-panel"
                className="bg-gray-900/90 border border-indigo-800/60 rounded-xl p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                      Advanced Query Scope: DataStores &amp; Entity Connectors (toolsSpec.vertexAiSearchSpec.dataStoreSpecs)
                    </h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Select which attached Vertex AI Search DataStores (including federated 3P connector entity stores) to include in <code className="font-mono text-indigo-300">:streamAssist</code> queries to compare 1-Store direct routing vs. multi-store fan-out impact on client-observed TTFT and TTFA.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedDataStoreResources(
                          scoppableDataStoreOptions.map((o) => o.resourceName),
                        )
                      }
                      className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 text-[11px] font-medium rounded border border-gray-700 transition-colors"
                    >
                      Select All ({scoppableDataStoreOptions.length})
                    </button>
                    {scoppableDataStoreOptions.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedDataStoreResources([
                            scoppableDataStoreOptions[0].resourceName,
                          ])
                        }
                        className="px-2.5 py-1 bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 text-[11px] font-medium rounded border border-indigo-800/70 transition-colors"
                      >
                        1-Store Direct ({scoppableDataStoreOptions[0].id})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedDataStoreResources([])}
                      className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-[11px] font-medium rounded border border-gray-700 transition-colors"
                    >
                      Clear (Engine Default)
                    </button>
                  </div>
                </div>

                {scoppableDataStoreOptions.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">
                    No scoppable Vertex AI Search DataStores detected on this engine. Queries will execute using the engine&apos;s default grounding scope.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {scoppableDataStoreOptions.map((opt) => {
                      const isChecked = selectedDataStoreResources.includes(opt.resourceName);
                      return (
                        <label
                          key={opt.resourceName}
                          className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                            isChecked
                              ? 'bg-indigo-950/40 border-indigo-600/70 text-white'
                              : 'bg-gray-800/50 border-gray-700/80 text-gray-400 hover:text-gray-200'
                          }`}
                        >
                          <input
                            type="checkbox"
                            aria-label={`Include DataStore ${opt.id}`}
                            checked={isChecked}
                            onChange={() => handleToggleDataStoreResource(opt.resourceName)}
                            className="mt-0.5 rounded border-gray-600 bg-gray-900 text-indigo-600 focus:ring-indigo-500"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-semibold truncate">
                                {opt.displayName}
                              </span>
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-gray-900 text-gray-300 border border-gray-700">
                                {opt.sourceType}
                              </span>
                            </div>
                            <span className="block text-[11px] font-mono text-gray-400 truncate mt-0.5">
                              {opt.collectionId && opt.collectionId !== 'default_collection'
                                ? `${opt.collectionId}/${opt.id}`
                                : opt.id}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}

                {report && report.byomcpEvaluations.length > 0 && (
                  <div className="pt-2 border-t border-gray-800 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                    <span className="font-semibold text-purple-300">
                      Attached BYOMCP Tool Servers (Scoped via Routing Skills / Tool State, not dataStoreSpecs):
                    </span>
                    {report.byomcpEvaluations.map((mcp) => (
                      <span
                        key={mcp.collectionId}
                        className="px-2 py-0.5 rounded bg-purple-950/60 border border-purple-800/60 text-purple-200 font-mono"
                      >
                        {mcp.displayName} ({mcp.enabledToolsCount}/{mcp.totalToolsCount} tools)
                      </span>
                    ))}
                  </div>
                )}

                <div className="pt-2 border-t border-gray-800 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-gray-400">
                  <span>
                    Active <code className="text-indigo-300">dataStoreSpecs</code> payload:{' '}
                    {selectedDataStoreResources.length > 0
                      ? `${selectedDataStoreResources.length} DataStore(s) explicitly scoped`
                      : 'Unscoped (Engine Default — all attached stores)'}
                  </span>
                  {selectedDataStoreResources.length > 0 && (
                    <span className="text-indigo-300 truncate max-w-md">
                      [{selectedDataStoreResources.map((r) => r.split('/').pop()).join(', ')}]
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2.5">
              {suiteQueries.map((q, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-400 w-7 text-right">
                    Q{idx + 1}.
                  </span>
                  <input
                    type="text"
                    aria-label={`Benchmark Query ${idx + 1}`}
                    value={q}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSuiteQueries((prev) =>
                        prev.map((item, i) => (i === idx ? val : item)),
                      );
                    }}
                    placeholder="Enter a realistic enterprise user prompt..."
                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  {suiteQueries.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setSuiteQueries((prev) => prev.filter((_, i) => i !== idx))
                      }
                      aria-label={`Remove Query ${idx + 1}`}
                      className="px-2.5 py-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-950/40 rounded-lg transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>

            {suiteError && (
              <div
                role="alert"
                className="p-3 bg-red-950/50 border border-red-800 rounded-lg text-red-200 text-xs"
              >
                {suiteError}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="text-xs text-gray-400 font-mono">
                {isRunningSuite
                  ? suiteProgressText
                  : `${suiteQueries.filter((q) => q.trim()).length} active query(s) ready • ${
                      selectedDataStoreResources.length > 0
                        ? `${selectedDataStoreResources.length} DataStore(s) scoped`
                        : 'Engine default scope'
                    }`}
              </div>
              <div className="flex items-center gap-2">
                {suiteResult && (
                  <button
                    type="button"
                    onClick={handleExportSuiteJson}
                    className="px-3.5 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-semibold rounded-lg border border-gray-600 transition-colors"
                  >
                    Export Telemetry (.json)
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleRunBenchmarkSuite()}
                  disabled={isRunningSuite}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white text-xs font-semibold rounded-lg shadow transition-colors"
                >
                  {isRunningSuite ? 'Running :streamAssist Probes...' : '⚡ Run Live :streamAssist Benchmark'}
                </button>
              </div>
            </div>
          </div>

          {/* Suite Results & Visual Breakdown */}
          {suiteResult && suiteSummary && (
            <div className="space-y-5" data-testid="suite-benchmark-results">
              {/* Protocol Telemetry Note */}
              <div className="p-3 rounded-lg bg-indigo-950/30 border border-indigo-800/50 text-[11px] text-indigo-200 flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong>Client-Observed Stream Telemetry:</strong> Discovery Engine <code className="font-mono">:streamAssist</code> flushes buffered <code className="font-mono">StreamChatChunk</code> JSON objects rather than raw internal TPU tokens. Timings below reflect client-observed arrival of the 1st Wire Frame (<code className="font-mono">TTFB</code>), 1st Thought/Reply Chunk (<code className="font-mono">TTFT</code>), and 1st Grounded Answer Chunk (<code className="font-mono">TTFA</code>).
                </span>
                <span className="font-mono text-indigo-300">
                  Avg 1st Wire Frame (TTFB): {suiteResult.avgTtfbMs.toLocaleString()} ms &bull; n={suiteSummary.sampleSize}
                </span>
              </div>

              {/* Summary Telemetry Cards (Total, TTFT, TTFA, Planner Steps, Citations) */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                  <span className="text-xs text-gray-400 block">
                    Avg End-to-End Latency
                  </span>
                  <span className="text-2xl font-bold text-white font-mono mt-1 block">
                    {suiteResult.avgLatencyMs.toLocaleString()} ms
                  </span>
                  <span className="text-[11px] text-gray-400 font-mono mt-1 block">
                    {suiteSummary.sampleSize < 20 ? `Max (n=${suiteSummary.sampleSize})` : 'P95'}:{' '}
                    {suiteSummary.p95LatencyMs.toLocaleString()} ms &bull; Range:{' '}
                    {suiteSummary.minLatencyMs.toLocaleString()}–{suiteSummary.maxLatencyMs.toLocaleString()} ms
                  </span>
                </div>

                <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                  <span className="text-xs text-gray-400 block">
                    Avg TTFT (1st Thought Chunk)
                  </span>
                  <span className="text-2xl font-bold text-indigo-300 font-mono mt-1 block">
                    {suiteSummary.avgTtftMs.toLocaleString()} ms
                  </span>
                  <span className="text-[11px] text-gray-400 font-mono mt-1 block">
                    Client 1st thought/reply chunk (TTFC-Thought)
                  </span>
                </div>

                <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                  <span className="text-xs text-gray-400 block">
                    Avg TTFA (1st Answer Chunk)
                  </span>
                  <span className="text-2xl font-bold text-cyan-300 font-mono mt-1 block">
                    {suiteSummary.avgTtfaMs.toLocaleString()} ms
                  </span>
                  <span className="text-[11px] text-gray-400 font-mono mt-1 block">
                    Planner &amp; Retrieval: +{suiteSummary.avgPlannerRetrievalMs.toLocaleString()} ms
                  </span>
                </div>

                <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                  <span className="text-xs text-gray-400 block">
                    Avg Planner Thought Steps
                  </span>
                  <span className="text-2xl font-bold text-purple-300 font-mono mt-1 block">
                    {suiteSummary.avgThoughts} steps
                  </span>
                  <span className="text-[11px] text-gray-400 font-mono mt-1 block">
                    Answer Streaming Tail: {suiteSummary.avgAnswerTailMs.toLocaleString()} ms
                  </span>
                </div>

                <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                  <span className="text-xs text-gray-400 block">
                    Grounded Citations &amp; Routing
                  </span>
                  <span className="text-2xl font-bold text-emerald-300 font-mono mt-1 block">
                    {suiteSummary.totalCitations} citations
                  </span>
                  <span className="text-[11px] text-gray-400 font-mono mt-1 block">
                    {suiteResult.skillTriggerRate}% grounded &bull;{' '}
                    {suiteSummary.uniqueRoutedSources.length} matched source(s)
                  </span>
                </div>
              </div>

              {/* Per-Query Latency Breakdown Table */}
              <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-gray-700 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-white">
                    Per-Query :streamAssist Latency Waterfall (1st Thought Chunk &rarr; 1st Answer Chunk &rarr; Total)
                  </h3>
                  <div className="flex flex-wrap items-center gap-4 text-[11px] text-gray-400">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" />
                      TTFT (1st Thought Chunk)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500 inline-block" />
                      Planner &amp; Retrieval (TTFA &minus; TTFT)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
                      Answer Streaming Tail (Total &minus; TTFA)
                    </span>
                  </div>
                </div>

                <div className="divide-y divide-gray-700/70">
                  {suiteResult.runs.map((run, idx) => {
                    const maxScale = Math.max(suiteSummary.maxLatencyMs, 1000);
                    const runTtftMs = run.ttftMs ?? run.ttfbMs;
                    const hasFailedOrSkipped = Boolean(run.errorMessage || run.skippedReason);
                    const runTtfaMs = hasFailedOrSkipped
                      ? runTtftMs
                      : Math.min(
                          run.totalLatencyMs,
                          Math.max(runTtftMs, run.ttfaMs ?? run.totalLatencyMs),
                        );
                    const runPlannerMs =
                      run.plannerAndRetrievalMs ?? Math.max(0, runTtfaMs - runTtftMs);
                    const runAnswerTailMs =
                      run.answerGenerationTailMs ??
                      (hasFailedOrSkipped ? 0 : Math.max(0, run.totalLatencyMs - runTtfaMs));

                    const renderedTtftPct = Math.min(
                      100,
                      Math.max(3, Math.round((runTtftMs / maxScale) * 100)),
                    );
                    const renderedPlannerPct =
                      runPlannerMs > 0
                        ? Math.min(
                            100 - renderedTtftPct,
                            Math.max(2, Math.round((runPlannerMs / maxScale) * 100)),
                          )
                        : 0;
                    const renderedTailPct = Math.max(
                      0,
                      Math.min(
                        100 - renderedTtftPct - renderedPlannerPct,
                        Math.round((runAnswerTailMs / maxScale) * 100),
                      ),
                    );
                    const isExpanded = expandedRunIdx === idx;

                    return (
                      <div key={idx} className="p-4 space-y-3 hover:bg-gray-750/30">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1 flex-1 min-w-[260px]">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-gray-900 text-gray-300 border border-gray-700">
                                Q{idx + 1}
                              </span>
                              <span className="text-sm font-medium text-white">
                                {run.query}
                              </span>
                            </div>

                            {/* 3-Segment Visual Latency Waterfall Bar: TTFT -> Planner/Retrieval -> Answer Tail */}
                            <div className="w-full bg-gray-900 h-2.5 rounded-full overflow-hidden flex border border-gray-700/80 mt-2">
                              <div
                                className="bg-indigo-500 h-full"
                                style={{ width: `${renderedTtftPct}%` }}
                                title={`TTFT (1st Thought/Reply Chunk): ${runTtftMs} ms`}
                              />
                              {renderedPlannerPct > 0 && (
                                <div
                                  className="bg-cyan-500 h-full"
                                  style={{ width: `${renderedPlannerPct}%` }}
                                  title={`Planner & Retrieval (TTFA - TTFT): ${runPlannerMs} ms (TTFA @ ${runTtfaMs} ms)`}
                                />
                              )}
                              {renderedTailPct > 0 && (
                                <div
                                  className={`${
                                    run.totalLatencyMs > 8000
                                      ? 'bg-amber-500'
                                      : 'bg-emerald-500'
                                  } h-full`}
                                  style={{ width: `${renderedTailPct}%` }}
                                  title={`Answer Streaming Tail: ${runAnswerTailMs} ms`}
                                />
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <span className="px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-gray-900 text-white border border-gray-700">
                              Total: {run.totalLatencyMs.toLocaleString()} ms
                            </span>
                            <span
                              className="px-2.5 py-1 rounded-md text-xs font-mono bg-indigo-950/80 text-indigo-300 border border-indigo-800/70"
                              title="Client-Observed Time to 1st Thought / Reply Chunk (TTFC-Thought)"
                            >
                              TTFT: {runTtftMs.toLocaleString()} ms
                            </span>
                            <span
                              className="px-2.5 py-1 rounded-md text-xs font-mono bg-cyan-950/80 text-cyan-300 border border-cyan-800/70"
                              title="Client-Observed Time to 1st Grounded Answer Chunk (TTFC-Answer)"
                            >
                              TTFA: {hasFailedOrSkipped ? 'N/A' : `${runTtfaMs.toLocaleString()} ms`}
                            </span>
                            <span className="px-2.5 py-1 rounded-md text-xs font-mono bg-purple-950/80 text-purple-300 border border-purple-800/70">
                              {run.thoughtSteps.length} thoughts
                            </span>
                            <span className="px-2.5 py-1 rounded-md text-xs font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-800/70">
                              {run.citationsCount} citations
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedRunIdx(isExpanded ? null : idx)
                              }
                              className="px-2.5 py-1 rounded-md text-xs font-medium bg-gray-700 hover:bg-gray-600 text-gray-200"
                            >
                              {isExpanded ? 'Hide Trace' : 'Inspect Trace'}
                            </button>
                          </div>
                        </div>

                        {run.errorMessage && (
                          <div className="p-2.5 rounded bg-red-950/50 border border-red-800 text-xs text-red-200 font-mono">
                            Error: {run.errorMessage}
                          </div>
                        )}

                        {run.routedSources.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] text-gray-400">
                              Routed Sources:
                            </span>
                            {run.routedSources.map((src) => (
                              <span
                                key={src}
                                className="px-2 py-0.5 rounded text-[11px] font-mono bg-blue-950/80 text-blue-300 border border-blue-800/70"
                              >
                                {src}
                              </span>
                            ))}
                          </div>
                        )}

                        {isExpanded && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-700/70 text-xs">
                            <div className="bg-gray-900/90 border border-gray-700 rounded-lg p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <h4 className="font-semibold text-purple-300">
                                  Planner Reasoning Steps ({run.thoughtSteps.length})
                                </h4>
                                <span className="text-[11px] font-mono text-gray-400">
                                  Deliberation &amp; Retrieval: {runPlannerMs.toLocaleString()} ms
                                </span>
                              </div>
                              {run.thoughtSteps.length === 0 ? (
                                <p className="text-gray-500 italic">
                                  No intermediate thought chunks emitted on this turn.
                                </p>
                              ) : (
                                <ol className="list-decimal list-inside space-y-1.5 text-gray-300 font-mono text-[11px]">
                                  {run.thoughtSteps.map((step, sIdx) => (
                                    <li key={sIdx} className="leading-relaxed">
                                      {step}
                                    </li>
                                  ))}
                                </ol>
                              )}
                            </div>

                            <div className="bg-gray-900/90 border border-gray-700 rounded-lg p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <h4 className="font-semibold text-emerald-300">
                                  Grounded Answer Preview
                                </h4>
                                <span className="text-[11px] font-mono text-gray-400">
                                  Answer Stream: {runAnswerTailMs.toLocaleString()} ms
                                </span>
                              </div>
                              <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">
                                {run.answerPreview || 'No answer text returned.'}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 2: BEFORE VS. AFTER SKILL A/B LATENCY COMPARISON LAB
         ===================================================================== */}
      {selectedEngine && activeTab === 'ab-skill' && (
        <div className="space-y-6">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-white">
                  Before vs. After Skill A/B Latency Lab
                </h2>
                <p className="text-xs text-gray-400">
                  Measure the exact latency speedup (Total, 1st Thought Chunk TTFT, and 1st Answer Chunk TTFA) and citation impact of an Organizational Routing Skill by running identical `:streamAssist` prompts before and after deploying the Skill.
                </p>
              </div>
            </div>

            {/* Skill Selector */}
            <div>
              <label
                htmlFor="abSkillSelector"
                className="block text-xs font-medium text-gray-400 mb-1"
              >
                Select Recommended Skill Template or Deployed Organizational Skill
              </label>
              <select
                id="abSkillSelector"
                value={selectedSkillId}
                onChange={(e) => handleSelectSkillOption(e.target.value)}
                className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 w-full focus:ring-indigo-500"
              >
                {availableSkillOptions.length === 0 ? (
                  <option value="">Custom Routing Skill Draft</option>
                ) : (
                  availableSkillOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      [{opt.badge}] {opt.label} ({opt.skillId})
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Editable Skill Draft */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="abSkillDisplayName"
                  className="block text-xs font-medium text-gray-400 mb-1"
                >
                  Skill Display Name
                </label>
                <input
                  id="abSkillDisplayName"
                  type="text"
                  value={skillDraft.displayName}
                  onChange={(e) =>
                    setSkillDraft((prev) => ({ ...prev, displayName: e.target.value }))
                  }
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100"
                />
              </div>
              <div>
                <label
                  htmlFor="abSkillIdInput"
                  className="block text-xs font-medium text-gray-400 mb-1"
                >
                  Skill Resource ID
                </label>
                <input
                  id="abSkillIdInput"
                  type="text"
                  value={skillDraft.skillId}
                  onChange={(e) =>
                    setSkillDraft((prev) => ({ ...prev, skillId: e.target.value }))
                  }
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 font-mono"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="abSkillDescription"
                className="block text-xs font-medium text-gray-400 mb-1"
              >
                Skill Trigger Description (Matched by Planner against User Prompts)
              </label>
              <textarea
                id="abSkillDescription"
                rows={2}
                value={skillDraft.description}
                onChange={(e) =>
                  setSkillDraft((prev) => ({ ...prev, description: e.target.value }))
                }
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-100"
              />
            </div>

            <div>
              <label
                htmlFor="abSkillInstruction"
                className="block text-xs font-medium text-gray-400 mb-1"
              >
                Skill Markdown Instructions (SKILL.md Body)
              </label>
              <textarea
                id="abSkillInstruction"
                rows={6}
                value={skillDraft.instruction}
                onChange={(e) =>
                  setSkillDraft((prev) => ({ ...prev, instruction: e.target.value }))
                }
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-100 font-mono"
              />
            </div>

            {/* A/B Benchmark Queries */}
            <div className="space-y-2 pt-2 border-t border-gray-700/70">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-300">
                  A/B Benchmark Queries (Executed Identically in Baseline &amp; Post-Skill)
                </span>
                <button
                  type="button"
                  onClick={() => setAbQueries((prev) => [...prev, ''])}
                  className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded"
                >
                  + Add Query
                </button>
              </div>
              {abQueries.map((q, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-400 w-7 text-right">
                    Q{idx + 1}.
                  </span>
                  <input
                    type="text"
                    aria-label={`A/B Query ${idx + 1}`}
                    value={q}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAbQueries((prev) =>
                        prev.map((item, i) => (i === idx ? val : item)),
                      );
                    }}
                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-100"
                  />
                </div>
              ))}
            </div>

            {abStatusMessage && (
              <div
                role="status"
                className={`p-3 rounded-lg border text-xs ${
                  abStatusMessage.type === 'ok'
                    ? 'bg-emerald-950/50 border-emerald-800 text-emerald-200'
                    : 'bg-red-950/50 border-red-800 text-red-200'
                }`}
              >
                {abStatusMessage.text}
              </div>
            )}

            {/* 3-Step A/B Execution Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <span className="text-xs text-gray-400 font-mono">
                {isRunningAb ? abProgressText : 'Follow Steps 1 → 2 → 3 to measure Skill speedup'}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleRunAbBaseline()}
                  disabled={isRunningAb}
                  className="px-3.5 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg border border-gray-600 transition-colors"
                >
                  1. Run Baseline (Before Skill)
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeployOrUpdateSkillInLab()}
                  disabled={isRunningAb}
                  className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow transition-colors"
                >
                  2. Deploy / Update Skill
                </button>
                <button
                  type="button"
                  onClick={() => void handleRunAbPostSkill()}
                  disabled={isRunningAb}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow transition-colors"
                >
                  3. Run After Skill &amp; Diagnose
                </button>
              </div>
            </div>
          </div>

          {/* A/B Comparison Scorecard & Mistake Diagnostics */}
          {(abBaseline || abPostSkill || abComparison) && (
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-5" data-testid="ab-comparison-scorecard">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-bold text-white">
                  Before vs. After Skill Performance Comparison
                </h3>
                {abComparison?.latencyDeltaMs !== undefined && (
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold font-mono ${
                      abComparison.latencyDeltaMs < 0 && abComparison.improved
                        ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-700'
                        : abComparison.latencyDeltaMs === 0
                        ? 'bg-gray-700 text-gray-200'
                        : 'bg-amber-950/90 text-amber-300 border border-amber-700'
                    }`}
                  >
                    {abComparison.latencyDeltaMs < 0 && abComparison.improved
                      ? `⚡ ${Math.abs(abComparison.latencyDeltaMs).toLocaleString()} ms Faster (${abComparison.latencyDeltaPercent}%)`
                      : abComparison.latencyDeltaMs < 0
                      ? `⚠️ ${Math.abs(abComparison.latencyDeltaMs).toLocaleString()} ms Delta (Unverified — Check Errors)`
                      : abComparison.latencyDeltaMs === 0
                      ? '0 ms Delta'
                      : `+${abComparison.latencyDeltaMs.toLocaleString()} ms Slower (+${abComparison.latencyDeltaPercent}%)`}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-900/80 border border-gray-700 rounded-lg p-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Phase 1: Baseline (Before Skill)
                  </span>
                  {abBaseline ? (
                    <div className="mt-2 space-y-1 font-mono">
                      <div className="text-xl font-bold text-white">
                        {abBaseline.avgLatencyMs.toLocaleString()} ms avg total
                      </div>
                      <div className="text-xs text-gray-400">
                        TTFT: {(abBaseline.avgTtftMs ?? abBaseline.avgTtfbMs).toLocaleString()} ms &bull; TTFA:{' '}
                        {(abBaseline.avgTtfaMs ?? abBaseline.avgLatencyMs).toLocaleString()} ms
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 mt-2 italic">
                      Not run yet. Click &ldquo;1. Run Baseline (Before Skill)&rdquo;.
                    </p>
                  )}
                </div>

                <div className="bg-gray-900/80 border border-gray-700 rounded-lg p-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
                    Phase 2: Post-Skill (After Skill)
                  </span>
                  {abPostSkill ? (
                    <div className="mt-2 space-y-1 font-mono">
                      <div className="text-xl font-bold text-indigo-300">
                        {abPostSkill.avgLatencyMs.toLocaleString()} ms avg total
                      </div>
                      <div className="text-xs text-gray-400">
                        TTFT: {(abPostSkill.avgTtftMs ?? abPostSkill.avgTtfbMs).toLocaleString()} ms &bull; TTFA:{' '}
                        {(abPostSkill.avgTtfaMs ?? abPostSkill.avgLatencyMs).toLocaleString()} ms &bull; Trigger Rate:{' '}
                        {abPostSkill.skillTriggerRate}%
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 mt-2 italic">
                      Not run yet. Click &ldquo;3. Run After Skill &amp; Diagnose&rdquo;.
                    </p>
                  )}
                </div>
              </div>

              {/* Automated Skill Mistake & Conflict Diagnostics */}
              {abComparison && abComparison.mistakes.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-gray-700">
                  <h4 className="text-sm font-bold text-amber-300">
                    Automated Skill Routing &amp; Latency Diagnostics ({abComparison.mistakes.length})
                  </h4>
                  {abComparison.mistakes.map((mistake, mIdx) => (
                    <div
                      key={mIdx}
                      className="p-3.5 bg-gray-900/90 border border-amber-700/60 rounded-lg space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-950 text-amber-300 border border-amber-700">
                            {mistake.severity} &bull; {mistake.code}
                          </span>
                          <span className="text-xs font-bold text-white">
                            {mistake.title}
                          </span>
                        </div>
                        {(mistake.recommendedDescriptionPatch ||
                          mistake.recommendedInstructionAppend) && (
                          <button
                            type="button"
                            onClick={() => handleApplyMistakeFixToDraft(mistake)}
                            className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded transition-colors"
                          >
                            ✨ Apply Fix to Skill Draft
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-gray-300">{mistake.explanation}</p>
                      <p className="text-xs text-indigo-300">
                        <strong>Suggested Fix:</strong> {mistake.suggestedFix}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 3: DATASTORE & CONNECTOR FAN-OUT BOTTLENECK INSPECTOR
         ===================================================================== */}
      {selectedEngine && activeTab === 'fanout' && report && (
        <div className="space-y-6" data-testid="fanout-inspector-panel">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
            <h2 className="text-base font-bold text-white">
              Connected DataStores &amp; BYOMCP Fan-Out Topology
            </h2>
            <p className="text-xs text-gray-400">
              When more than 5–8 unscoped DataStores or BYOMCP servers are attached to a single engine without Organizational Routing Skills, unguided prompts fan out across all indexes in parallel, increasing P95 tail latency.
            </p>

            {/* Attached DataStores */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-300">
                Attached Engine DataStore IDs ({selectedEngine.dataStoreIds?.length || 0})
              </h3>
              {(selectedEngine.dataStoreIds || []).length === 0 ? (
                <p className="text-xs text-gray-500 italic">
                  No DataStores currently attached to this engine.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(selectedEngine.dataStoreIds || []).map((dsId) => (
                    <span
                      key={dsId}
                      className="px-2.5 py-1 rounded-md text-xs font-mono bg-gray-900 text-blue-300 border border-gray-700"
                    >
                      {dsId}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* BYOMCP Connectors Table */}
            {report.byomcpEvaluations.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-gray-700">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-300">
                  BYOMCP Connectors ({report.byomcpEvaluations.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {report.byomcpEvaluations.map((mcp) => (
                    <div
                      key={mcp.collectionId}
                      className="bg-gray-900/80 border border-gray-700 rounded-lg p-3.5 space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-white">
                          {mcp.displayName}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            mcp.status === 'OPTIMAL'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                              : 'bg-amber-950 text-amber-300 border border-amber-700'
                          }`}
                        >
                          {mcp.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 font-mono">
                        Collection: {mcp.collectionId} &bull; {mcp.enabledToolsCount}/{mcp.totalToolsCount} tools enabled
                      </p>
                      {mcp.issues.length > 0 && (
                        <ul className="list-disc list-inside text-xs text-amber-300 space-y-0.5">
                          {mcp.issues.map((iss, i) => (
                            <li key={i}>{iss}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Latency, Skills & BYOMCP Findings */}
            <div className="space-y-3 pt-3 border-t border-gray-700">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-300">
                Latency, Routing &amp; Connector Findings
              </h3>
              {report.findings
                .filter(
                  (f) =>
                    f.category === 'LATENCY_AND_DATASTORES' ||
                    f.category === 'SKILLS_AND_ROUTING' ||
                    f.category === 'BYOMCP_ADVISOR',
                )
                .map((finding) => (
                  <div
                    key={finding.id}
                    className="p-3.5 bg-gray-900/80 border border-gray-700 rounded-lg space-y-1.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-gray-800 text-gray-200 border border-gray-600">
                          {finding.severity}
                        </span>
                        <span className="text-xs font-bold text-white">
                          {finding.title}
                        </span>
                      </div>
                      {finding.recommendedSkillId && (
                        <button
                          type="button"
                          onClick={() => {
                            handleSelectSkillOption(finding.recommendedSkillId!);
                            setActiveTab('ab-skill');
                          }}
                          className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded"
                        >
                          Benchmark Skill in A/B Lab →
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-gray-300">{finding.summary}</p>
                    <p className="text-xs text-gray-400">
                      <strong>Remediation:</strong> {finding.remediation}
                    </p>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {selectedEngine && assistant && (
        <AssistantEvaluationModal
          isOpen={isEvalModalOpen}
          onClose={() => setIsEvalModalOpen(false)}
          engine={selectedEngine}
          assistant={assistant}
          agents={agents}
          config={currentEngineConfig}
          onRefreshAgents={async () => {
            await loadSelectedEngineContext(selectedEngine);
          }}
        />
      )}
    </div>
  );
};

export default LatencyLabPage;
