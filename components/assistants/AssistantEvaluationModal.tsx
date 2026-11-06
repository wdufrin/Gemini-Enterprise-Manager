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

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Agent, AppEngine, Assistant, Config } from '../../types';
import * as api from '../../services/apiService';
import {
  AssistantEvaluationReport,
  ByomcpConnectorEvaluation,
  EvaluationCategory,
  EvaluationSeverity,
  EvaluationTargetTab,
  RecommendedSkillTemplate,
  SkillDiagnosticMistake,
  SkillPerformanceBenchmarkPhase,
  SkillPerformanceComparisonReport,
  applyByomcpRecommendations,
  diagnoseSkillPerformanceAndMistakes,
  generateAssistantEvaluationMarkdown,
  generateDefaultBenchmarkQueriesForSkill,
  runLiveAssistantEvaluation,
  runSkillBenchmarkPhase,
  synthesizeByomcpWithGemini,
  synthesizeSkillWithGemini,
} from '../../services/assistantEvaluationService';
import { useModalA11y } from '../../hooks/useModalA11y';
import { toErrorMessage } from '../../utils/errors';
import {
  MAX_SKILL_DESCRIPTION_LENGTH,
  buildSkillMarkdownDocument,
  isSkillAgentResource,
  parseSkillMarkdown,
  sanitizeSkillDescription,
  sanitizeSkillDisplayName,
} from '../../utils/skillExportUtils';

export interface AssistantEvaluationModalProps {
  isOpen: boolean;
  onClose: () => void;
  engine: AppEngine;
  assistant: Assistant;
  agents: Agent[];
  config: Config;
  onNavigateToTab?: (tab: EvaluationTargetTab) => void;
  onRefreshAgents?: () => void | Promise<void>;
  onOpenLatencyLab?: () => void;
}

type ModalSectionTab = 'findings' | 'byomcp' | 'skills';

const CATEGORY_LABELS: Record<EvaluationCategory, string> = {
  LATENCY_AND_DATASTORES: 'Latency & DataStore Fan-Out',
  SKILLS_AND_ROUTING: 'Skills & Query Routing',
  BYOMCP_ADVISOR: 'BYOMCP Datastores & Tools',
  ASSISTANT_AND_ENGINE_CONFIG: 'Assistant & Engine Config',
  SECURITY_AND_GOVERNANCE: 'Security & Guardrails',
};

const SEVERITY_BADGE_STYLES: Record<EvaluationSeverity, string> = {
  CRITICAL: 'bg-red-950/80 text-red-300 border-red-700/80',
  WARNING: 'bg-amber-950/80 text-amber-300 border-amber-700/80',
  INFO: 'bg-blue-950/80 text-blue-300 border-blue-700/80',
  PASS: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/80',
};

const AssistantEvaluationModal: React.FC<AssistantEvaluationModalProps> = ({
  isOpen,
  onClose,
  engine,
  assistant,
  agents,
  config,
  onNavigateToTab,
  onRefreshAgents,
  onOpenLatencyLab,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const evalSeqRef = useRef(0);
  const sessionSkillTemplatesRef = useRef<Map<string, RecommendedSkillTemplate>>(new Map());

  const [isEvaluating, setIsEvaluating] = useState(false);
  const [progressStep, setProgressStep] = useState<string>('');
  const [report, setReport] = useState<AssistantEvaluationReport | null>(null);
  const [evalError, setEvalError] = useState<string | null>(null);

  const [activeModalTab, setActiveModalTab] = useState<ModalSectionTab>('findings');
  const [severityFilter, setSeverityFilter] = useState<
    'ALL' | Exclude<EvaluationSeverity, 'PASS'>
  >('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | EvaluationCategory>('ALL');

  // BYOMCP Advisor editable state keyed by collectionId
  const [byomcpEdits, setByomcpEdits] = useState<
    Record<string, { serverDescription: string; agentInstructions: string }>
  >({});
  const [savingByomcpId, setSavingByomcpId] = useState<string | null>(null);
  const [synthesizingByomcpId, setSynthesizingByomcpId] = useState<string | null>(null);
  const [isBatchSavingByomcp, setIsBatchSavingByomcp] = useState(false);
  const [byomcpStatusMsg, setByomcpStatusMsg] = useState<
    Record<string, { type: 'ok' | 'err'; text: string }>
  >({});
  const [showConfiguredByomcp, setShowConfiguredByomcp] = useState(false);

  // Skill Generator editable state keyed by template id
  const [skillEdits, setSkillEdits] = useState<
    Record<
      string,
      {
        skillId: string;
        displayName: string;
        description: string;
        instruction: string;
      }
    >
  >({});
  const [creatingSkillId, setCreatingSkillId] = useState<string | null>(null);
  const [synthesizingSkillId, setSynthesizingSkillId] = useState<string | null>(null);
  const [createdSkillIds, setCreatedSkillIds] = useState<Set<string>>(new Set());
  const [deployedSkillAgentNames, setDeployedSkillAgentNames] = useState<Record<string, string>>(
    {},
  );
  const [skillStatusMsg, setSkillStatusMsg] = useState<
    Record<string, { type: 'ok' | 'err'; text: string }>
  >({});

  // Skill Performance Benchmark (Before vs. After) state keyed by template id
  const [expandedBenchmarkSkills, setExpandedBenchmarkSkills] = useState<Set<string>>(new Set());
  const [benchmarkQueriesBySkill, setBenchmarkQueriesBySkill] = useState<Record<string, string[]>>(
    {},
  );
  const [runningBenchmarkSkillId, setRunningBenchmarkSkillId] = useState<string | null>(null);
  const [benchmarkProgressText, setBenchmarkProgressText] = useState<string>('');
  const [skillBenchmarkBaseline, setSkillBenchmarkBaseline] = useState<
    Record<string, SkillPerformanceBenchmarkPhase>
  >({});
  const [skillBenchmarkPost, setSkillBenchmarkPost] = useState<
    Record<string, SkillPerformanceBenchmarkPhase>
  >({});
  const [skillBenchmarkReports, setSkillBenchmarkReports] = useState<
    Record<string, SkillPerformanceComparisonReport>
  >({});
  const [expandedTraceKey, setExpandedTraceKey] = useState<string | null>(null);

  // 1-Click Private/Disabled Skill Promotion state
  const [isPromotingPrivateSkills, setIsPromotingPrivateSkills] = useState(false);
  const [promoteSkillsMsg, setPromoteSkillsMsg] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  const isBusy =
    isEvaluating ||
    Boolean(savingByomcpId) ||
    Boolean(synthesizingByomcpId) ||
    isBatchSavingByomcp ||
    Boolean(creatingSkillId) ||
    Boolean(synthesizingSkillId) ||
    Boolean(runningBenchmarkSkillId) ||
    isPromotingPrivateSkills;

  useModalA11y({
    isOpen,
    onClose,
    containerRef,
    preventClose: isBusy,
  });

  // Compute a stable fingerprint of agents (name + state + description + instruction)
  // so IAM-only enrichment passes do not trigger redundant live evaluations.
  const agentsFingerprint = useMemo(
    () =>
      agents
        .map(
          (a) =>
            `${a.name}:${a.state || ''}:${a.description || ''}:${
              a.skillAgentDefinition?.instruction?.length || 0
            }`,
        )
        .join('|'),
    [agents],
  );
  const agentsRef = useRef<Agent[]>(agents);
  agentsRef.current = agents;

  const executeEvaluation = useCallback(
    async (overrideAgents?: Agent[]) => {
      const seq = ++evalSeqRef.current;
      setIsEvaluating(true);
      setEvalError(null);
      setProgressStep('Initializing evaluation...');
      try {
        const result = await runLiveAssistantEvaluation(
          engine,
          assistant,
          overrideAgents ?? agentsRef.current,
          config,
          (step) => {
            if (seq === evalSeqRef.current) {
              setProgressStep(step);
            }
          },
        );
        if (seq !== evalSeqRef.current) return;
        setReport(result);

        // Cache recommended skill templates in sessionSkillTemplatesRef so cards don't vanish right after deployment
        result.recommendedSkills.forEach((sk) => {
          sessionSkillTemplatesRef.current.set(sk.id, sk);
        });

        // Initialize BYOMCP editable drafts:
        // Use recommended template when current description (< 30 chars) or instructions (< 50 chars) are missing/weak,
        // and preserve any unsaved edits the user already made in the modal.
        setByomcpEdits((prev) => {
          const next = { ...prev };
          result.byomcpEvaluations.forEach((mcp) => {
            if (!next[mcp.collectionId]) {
              next[mcp.collectionId] = {
                serverDescription:
                  mcp.currentServerDescription.length >= 30
                    ? mcp.currentServerDescription
                    : mcp.recommendedServerDescription,
                agentInstructions:
                  mcp.currentAgentInstructions.length >= 50
                    ? mcp.currentAgentInstructions
                    : mcp.recommendedAgentInstructions,
              };
            }
          });
          return next;
        });

        // Initialize Skill template drafts and default benchmark queries while preserving existing user edits
        setSkillEdits((prev) => {
          const next = { ...prev };
          result.recommendedSkills.forEach((sk) => {
            if (!next[sk.id]) {
              next[sk.id] = {
                skillId: sk.skillIdSuggestion,
                displayName: sk.displayName,
                description: sk.description,
                instruction: sk.instruction,
              };
            }
          });
          return next;
        });

        setBenchmarkQueriesBySkill((prev) => {
          const next = { ...prev };
          result.recommendedSkills.forEach((sk) => {
            if (!next[sk.id]) {
              next[sk.id] = generateDefaultBenchmarkQueriesForSkill(sk);
            }
          });
          return next;
        });
      } catch (err: unknown) {
        if (seq !== evalSeqRef.current) return;
        setEvalError(toErrorMessage(err, 'Failed to evaluate assistant configuration.'));
      } finally {
        if (seq === evalSeqRef.current) {
          setIsEvaluating(false);
          setProgressStep('');
        }
      }
    },
    [engine, assistant, config],
  );

  useEffect(() => {
    if (isOpen) {
      void executeEvaluation();
    }
  }, [isOpen, executeEvaluation, agentsFingerprint]);

  const counts = useMemo(() => {
    if (!report) {
      return { critical: 0, warning: 0, info: 0, pass: 0 };
    }
    return {
      critical: report.findings.filter((f) => f.severity === 'CRITICAL').length,
      warning: report.findings.filter((f) => f.severity === 'WARNING').length,
      info: report.findings.filter((f) => f.severity === 'INFO').length,
      pass: report.findings.filter((f) => f.severity === 'PASS').length,
    };
  }, [report]);

  // Reset severityFilter to 'ALL' if the currently selected severity (e.g. 'INFO') has 0 findings after re-evaluation
  useEffect(() => {
    if (severityFilter === 'INFO' && counts.info === 0) {
      setSeverityFilter('ALL');
    }
  }, [severityFilter, counts.info]);

  const actionableFindings = useMemo(() => {
    if (!report) return [];
    return report.findings.filter((f) => f.severity !== 'PASS');
  }, [report]);

  const actionableByomcpEvaluations = useMemo(() => {
    if (!report) return [];
    return report.byomcpEvaluations.filter((mcp) => mcp.status === 'NEEDS_ATTENTION');
  }, [report]);

  const configuredByomcpCount = useMemo(() => {
    if (!report) return 0;
    return report.byomcpEvaluations.filter((mcp) => mcp.status === 'OPTIMAL').length;
  }, [report]);

  const visibleByomcpEvaluations = useMemo(() => {
    if (!report) return [];
    return showConfiguredByomcp ? report.byomcpEvaluations : actionableByomcpEvaluations;
  }, [report, showConfiguredByomcp, actionableByomcpEvaluations]);

  const filteredFindings = useMemo(() => {
    return actionableFindings.filter((f) => {
      if (categoryFilter !== 'ALL' && f.category !== categoryFilter) {
        return false;
      }
      if (severityFilter !== 'ALL' && f.severity !== severityFilter) {
        return false;
      }
      return true;
    });
  }, [actionableFindings, categoryFilter, severityFilter]);

  if (!isOpen) return null;

  const handleApplyByomcp = async (
    mcpEval: ByomcpConnectorEvaluation,
    includeDefaultCitations = false,
  ) => {
    const draft = byomcpEdits[mcpEval.collectionId];
    if (!draft) return;

    setSavingByomcpId(mcpEval.collectionId);
    setByomcpStatusMsg((prev) => {
      const next = { ...prev };
      delete next[mcpEval.collectionId];
      return next;
    });

    try {
      await applyByomcpRecommendations(
        mcpEval,
        draft.serverDescription,
        draft.agentInstructions,
        config,
        includeDefaultCitations,
      );
      setByomcpStatusMsg((prev) => ({
        ...prev,
        [mcpEval.collectionId]: {
          type: 'ok',
          text: includeDefaultCitations
            ? 'Updated mcp_server_description, mcp_agent_instructions & default citation_mappings on connector!'
            : 'Updated mcp_server_description & mcp_agent_instructions on connector!',
        },
      }));
      await executeEvaluation();
    } catch (err: unknown) {
      setByomcpStatusMsg((prev) => ({
        ...prev,
        [mcpEval.collectionId]: {
          type: 'err',
          text: toErrorMessage(err, 'Failed to update BYOMCP connector.'),
        },
      }));
    } finally {
      setSavingByomcpId(null);
    }
  };

  const handleApplyAllByomcpFixes = async () => {
    if (actionableByomcpEvaluations.length === 0) return;
    setIsBatchSavingByomcp(true);
    try {
      for (const mcpEval of actionableByomcpEvaluations) {
        const draft = byomcpEdits[mcpEval.collectionId] || {
          serverDescription: mcpEval.recommendedServerDescription,
          agentInstructions: mcpEval.recommendedAgentInstructions,
        };
        try {
          await applyByomcpRecommendations(
            mcpEval,
            draft.serverDescription,
            draft.agentInstructions,
            config,
            false,
          );
          setByomcpStatusMsg((prev) => ({
            ...prev,
            [mcpEval.collectionId]: {
              type: 'ok',
              text: 'Applied recommended description & instructions!',
            },
          }));
        } catch (err: unknown) {
          setByomcpStatusMsg((prev) => ({
            ...prev,
            [mcpEval.collectionId]: {
              type: 'err',
              text: toErrorMessage(err, 'Failed to update connector.'),
            },
          }));
        }
      }
      await executeEvaluation();
    } finally {
      setIsBatchSavingByomcp(false);
    }
  };

  const handleTailorByomcpWithGemini = async (mcpEval: ByomcpConnectorEvaluation) => {
    setSynthesizingByomcpId(mcpEval.collectionId);
    setByomcpStatusMsg((prev) => {
      const next = { ...prev };
      delete next[mcpEval.collectionId];
      return next;
    });
    try {
      const assistantSysInst = [
        assistant?.generationConfig?.systemInstruction?.additionalSystemInstruction || '',
        assistant?.styleAndFormattingInstructions || '',
      ]
        .filter(Boolean)
        .join('\n')
        .trim();
      const synthesized = await synthesizeByomcpWithGemini(
        mcpEval,
        engine.dataStoreIds || [],
        config,
        {
          assistantSystemInstruction: assistantSysInst,
        },
      );
      setByomcpEdits((prev) => ({
        ...prev,
        [mcpEval.collectionId]: {
          serverDescription: synthesized.serverDescription,
          agentInstructions: synthesized.agentInstructions,
        },
      }));
      const companionId = mcpEval.recommendedCompanionSkill.id;
      setSkillEdits((prev) => ({
        ...prev,
        [companionId]: {
          skillId:
            prev[companionId]?.skillId ||
            mcpEval.recommendedCompanionSkill.skillIdSuggestion,
          displayName: synthesized.companionSkill.displayName,
          description: synthesized.companionSkill.description,
          instruction: synthesized.companionSkill.instruction,
        },
      }));
      setByomcpStatusMsg((prev) => ({
        ...prev,
        [mcpEval.collectionId]: {
          type: 'ok',
          text: '✨ Synthesized custom description, tool-chaining instructions & companion skill with Vertex AI Gemini! Review and click "Apply to Connector".',
        },
      }));
    } catch (err: unknown) {
      setByomcpStatusMsg((prev) => ({
        ...prev,
        [mcpEval.collectionId]: {
          type: 'err',
          text: toErrorMessage(err, 'Gemini synthesis failed. Using schema-driven template.'),
        },
      }));
    } finally {
      setSynthesizingByomcpId(null);
    }
  };

  const handleTailorSkillWithGemini = async (template: RecommendedSkillTemplate) => {
    setSynthesizingSkillId(template.id);
    setSkillStatusMsg((prev) => {
      const next = { ...prev };
      delete next[template.id];
      return next;
    });
    try {
      const assistantSysInst = [
        assistant?.generationConfig?.systemInstruction?.additionalSystemInstruction || '',
        assistant?.styleAndFormattingInstructions || '',
      ]
        .filter(Boolean)
        .join('\n')
        .trim();
      const synthesized = await synthesizeSkillWithGemini(
        template,
        report?.byomcpEvaluations || [],
        engine.dataStoreIds || [],
        config,
        {
          assistantSystemInstruction: assistantSysInst,
        },
      );
      setSkillEdits((prev) => ({
        ...prev,
        [template.id]: {
          skillId: prev[template.id]?.skillId || template.skillIdSuggestion,
          displayName: synthesized.displayName,
          description: synthesized.description,
          instruction: synthesized.instruction,
        },
      }));
      setSkillStatusMsg((prev) => ({
        ...prev,
        [template.id]: {
          type: 'ok',
          text: '✨ Tailored skill routing matrix & instructions with Vertex AI Gemini!',
        },
      }));
    } catch (err: unknown) {
      setSkillStatusMsg((prev) => ({
        ...prev,
        [template.id]: {
          type: 'err',
          text: toErrorMessage(err, 'Gemini synthesis failed.'),
        },
      }));
    } finally {
      setSynthesizingSkillId(null);
    }
  };

  const handlePromoteAllPrivateSkills = async () => {
    const disabledOrgSkills = agentsRef.current.filter(
      (a) =>
        isSkillAgentResource(a) &&
        a.sharingConfig?.scope === 'ALL_USERS' &&
        (a.state || '').toUpperCase() === 'DISABLED',
    );
    if (disabledOrgSkills.length === 0) return;

    setIsPromotingPrivateSkills(true);
    setPromoteSkillsMsg(null);
    try {
      let promotedCount = 0;
      const updatedMap = new Map<string, Agent>();
      for (const sk of disabledOrgSkills) {
        const promoted = await api.promoteSkillToOrg(sk, config);
        if (promoted) {
          updatedMap.set(sk.name, promoted);
          promotedCount += 1;
        }
      }
      setPromoteSkillsMsg({
        type: 'ok',
        text: `Enabled ${promotedCount} organizational skill(s)!`,
      });
      await onRefreshAgents?.();
      const nextAgents = agentsRef.current.map((a) => updatedMap.get(a.name) || a);
      await executeEvaluation(nextAgents);
    } catch (err: unknown) {
      setPromoteSkillsMsg({
        type: 'err',
        text: toErrorMessage(err, 'Failed to enable organizational skills.'),
      });
    } finally {
      setIsPromotingPrivateSkills(false);
    }
  };

  const displayedRecommendedSkills = (() => {
    if (!report) return [];
    const byId = new Map<string, RecommendedSkillTemplate>();
    report.recommendedSkills.forEach((sk) => byId.set(sk.id, sk));
    sessionSkillTemplatesRef.current.forEach((sk, id) => {
      if (
        !byId.has(id) &&
        (createdSkillIds.has(id) ||
          Boolean(skillBenchmarkBaseline[id]) ||
          Boolean(skillBenchmarkPost[id]))
      ) {
        byId.set(id, sk);
      }
    });
    // Also surface existing organizational / global skills with Markdown instructions so users can edit or benchmark them
    const coveredSkillIds = new Set(
      Array.from(byId.values()).map((s) => s.skillIdSuggestion.toLowerCase()),
    );
    agentsRef.current.forEach((ag) => {
      if (!isSkillAgentResource(ag)) return;
      const isGlobal =
        (ag.state || '').toUpperCase() === 'ENABLED' ||
        ag.sharingConfig?.scope === 'ALL_USERS';
      const inst = ag.skillAgentDefinition?.instruction?.trim();
      if (!isGlobal || !inst) return;
      const shortId = (ag.name.split('/').pop() || ag.id || 'skill').toLowerCase();
      if (coveredSkillIds.has(shortId)) return;
      const templateId = `existing-global-skill-${shortId}`;
      if (!byId.has(templateId)) {
        byId.set(templateId, {
          id: templateId,
          skillIdSuggestion: shortId,
          displayName: ag.displayName || shortId,
          description: ag.description || '',
          instruction: inst,
          targetSources: [ag.displayName || shortId],
          rationale: 'Active Global / Organizational Skill attached to this Assistant (SKILL.md).',
        });
      }
    });
    return Array.from(byId.values());
  })();

  const handleDeployRecommendedSkill = async (
    template: RecommendedSkillTemplate,
  ): Promise<Agent | null> => {
    const draft = skillEdits[template.id] || {
      skillId: template.skillIdSuggestion,
      displayName: template.displayName,
      description: template.description,
      instruction: template.instruction,
    };

    if (!draft.displayName.trim() || !draft.description.trim() || !draft.instruction.trim()) {
      setSkillStatusMsg((prev) => ({
        ...prev,
        [template.id]: {
          type: 'err',
          text: 'Display Name, Description, and Instructions are required.',
        },
      }));
      return null;
    }

    setCreatingSkillId(template.id);
    setSkillStatusMsg((prev) => {
      const next = { ...prev };
      delete next[template.id];
      return next;
    });

    try {
      const finalDisplayName =
        sanitizeSkillDisplayName(draft.displayName) || 'Enterprise Custom Skill';

      const cleanId =
        draft.skillId
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 63)
          .replace(/^-+|-+$/g, '') || `skill-${Date.now()}`;

      const rawDesc = draft.description.trim();
      let finalInstruction = draft.instruction.trim();
      if (
        Array.from(rawDesc).length > MAX_SKILL_DESCRIPTION_LENGTH &&
        !finalInstruction.includes(rawDesc.slice(0, 120))
      ) {
        finalInstruction = `${finalInstruction}\n\n## Extended Trigger & Scope Details\n${rawDesc}`;
      }
      const finalDescription = sanitizeSkillDescription(rawDesc);

      setSkillEdits((prev) => ({
        ...prev,
        [template.id]: {
          ...draft,
          displayName: finalDisplayName,
          description: finalDescription,
          instruction: finalInstruction,
        },
      }));

      const createdAgent = await api.createSkillAgent(
        {
          displayName: finalDisplayName,
          description: finalDescription,
          state: 'ENABLED',
          skillAgentDefinition: {
            instruction: finalInstruction,
          },
        },
        config,
        cleanId,
        true,
      );

      const promoWarn = (createdAgent as (Agent & { promotionWarning?: string }) | undefined)
        ?.promotionWarning;
      setCreatedSkillIds((prev) => new Set(prev).add(template.id));
      if (createdAgent?.name) {
        setDeployedSkillAgentNames((prev) => ({
          ...prev,
          [template.id]: createdAgent.name,
        }));
      }
      setSkillStatusMsg((prev) => ({
        ...prev,
        [template.id]: promoWarn
          ? {
              type: 'err',
              text: `Created skill "${finalDisplayName}" (${cleanId}), but org-wide promotion failed: ${promoWarn}`,
            }
          : {
              type: 'ok',
              text: `Deployed organizational skill "${finalDisplayName}" (${cleanId}) in ENABLED state!`,
            },
      }));
      await onRefreshAgents?.();
      const updatedAgents = createdAgent
        ? [...agentsRef.current, createdAgent]
        : agentsRef.current;
      await executeEvaluation(updatedAgents);
      return createdAgent || null;
    } catch (err: unknown) {
      setSkillStatusMsg((prev) => ({
        ...prev,
        [template.id]: {
          type: 'err',
          text: toErrorMessage(err, 'Failed to create organizational skill.'),
        },
      }));
      return null;
    } finally {
      setCreatingSkillId(null);
    }
  };

  const resolveExistingSkillAgentName = (
    template: RecommendedSkillTemplate,
    draftSkillId: string,
    draftDisplayName: string,
  ): string | undefined =>
    deployedSkillAgentNames[template.id] ||
    agentsRef.current.find(
      (a) =>
        isSkillAgentResource(a) &&
        ((a.name.split('/').pop() || '').toLowerCase() === draftSkillId.trim().toLowerCase() ||
          (a.displayName || '').trim().toLowerCase() ===
            sanitizeSkillDisplayName(draftDisplayName).toLowerCase()),
    )?.name;

  const getAssistantConflictContext = () => {
    const sysInst = [
      assistant?.generationConfig?.systemInstruction?.additionalSystemInstruction || '',
      assistant?.styleAndFormattingInstructions || '',
    ]
      .filter(Boolean)
      .join('\n')
      .trim();
    return {
      assistantSystemInstruction: sysInst,
    };
  };

  const handleRunSkillBenchmark = async (
    template: RecommendedSkillTemplate,
    phase: 'baseline' | 'post',
    draftOverride?: {
      skillId: string;
      displayName: string;
      description: string;
      instruction: string;
    },
  ) => {
    const draft = draftOverride ||
      skillEdits[template.id] || {
        skillId: template.skillIdSuggestion,
        displayName: template.displayName,
        description: template.description,
        instruction: template.instruction,
      };
    const queries =
      benchmarkQueriesBySkill[template.id] || generateDefaultBenchmarkQueriesForSkill(template);

    const existingAgentName = resolveExistingSkillAgentName(
      template,
      draft.skillId,
      draft.displayName,
    );

    setExpandedBenchmarkSkills((prev) => new Set(prev).add(template.id));
    setRunningBenchmarkSkillId(template.id);
    setBenchmarkProgressText(
      phase === 'baseline'
        ? existingAgentName
          ? 'Temporarily disabling skill to measure clean Baseline (Before Skill)...'
          : 'Running Baseline (Before Skill) queries against :streamAssist...'
        : 'Running Post-Skill (After Skill) queries against :streamAssist...',
    );

    let temporarilyDisabledForBaseline = false;
    try {
      if (phase === 'baseline' && existingAgentName) {
        await api.disableAgent(existingAgentName, config);
        temporarilyDisabledForBaseline = true;
      } else if (phase === 'post' && existingAgentName) {
        setBenchmarkProgressText('Ensuring skill is ENABLED before Post-Skill test...');
        await api.enableAgent(existingAgentName, config);
      }

      const phaseResult = await runSkillBenchmarkPhase(
        queries,
        config,
        {
          skillId: draft.skillId,
          displayName: draft.displayName,
          description: draft.description,
          instruction: draft.instruction,
          targetSources: template.targetSources,
        },
        report?.connectedDataStoreResourceNames || [],
        (step) => setBenchmarkProgressText(step),
      );

      if (temporarilyDisabledForBaseline && existingAgentName) {
        setBenchmarkProgressText('Re-enabling organizational skill after Baseline test...');
        await api.enableAgent(existingAgentName, config);
        temporarilyDisabledForBaseline = false;
      }

      const nextBaseline =
        phase === 'baseline' ? phaseResult : skillBenchmarkBaseline[template.id];
      const nextPost = phase === 'post' ? phaseResult : skillBenchmarkPost[template.id];

      if (phase === 'baseline') {
        setSkillBenchmarkBaseline((prev) => ({ ...prev, [template.id]: phaseResult }));
      } else {
        setSkillBenchmarkPost((prev) => ({ ...prev, [template.id]: phaseResult }));
      }

      const comparison = diagnoseSkillPerformanceAndMistakes(
        {
          skillId: draft.skillId,
          displayName: draft.displayName,
          description: draft.description,
          instruction: draft.instruction,
          targetSources: template.targetSources,
        },
        queries,
        nextBaseline,
        nextPost,
        getAssistantConflictContext(),
      );
      setSkillBenchmarkReports((prev) => ({ ...prev, [template.id]: comparison }));
    } catch (err: unknown) {
      setSkillStatusMsg((prev) => ({
        ...prev,
        [template.id]: {
          type: 'err',
          text: toErrorMessage(err, 'Failed to run performance benchmark.'),
        },
      }));
    } finally {
      if (temporarilyDisabledForBaseline && existingAgentName) {
        try {
          await api.enableAgent(existingAgentName, config);
        } catch {
          // Best-effort restore so the skill is not left disabled if the benchmark fails mid-flight
        }
      }
      setRunningBenchmarkSkillId(null);
      setBenchmarkProgressText('');
    }
  };

  const handleAutoBenchmarkAndDeploySkill = async (template: RecommendedSkillTemplate) => {
    const draft = skillEdits[template.id] || {
      skillId: template.skillIdSuggestion,
      displayName: template.displayName,
      description: template.description,
      instruction: template.instruction,
    };
    const queries =
      benchmarkQueriesBySkill[template.id] || generateDefaultBenchmarkQueriesForSkill(template);

    const existingAgentName = resolveExistingSkillAgentName(
      template,
      draft.skillId,
      draft.displayName,
    );

    setExpandedBenchmarkSkills((prev) => new Set(prev).add(template.id));
    setRunningBenchmarkSkillId(template.id);
    setBenchmarkProgressText(
      existingAgentName
        ? 'Step 1/4: Disabling skill to measure clean Baseline (Before Skill)...'
        : 'Step 1/3: Measuring Baseline (Before Skill) latency...',
    );

    let disabledSkillName: string | undefined;
    try {
      if (existingAgentName) {
        await api.disableAgent(existingAgentName, config);
        disabledSkillName = existingAgentName;
      }

      const baselineResult = await runSkillBenchmarkPhase(
        queries,
        config,
        {
          skillId: draft.skillId,
          displayName: draft.displayName,
          description: draft.description,
          instruction: draft.instruction,
          targetSources: template.targetSources,
        },
        report?.connectedDataStoreResourceNames || [],
        (step) => setBenchmarkProgressText(`Baseline (Skill Disabled): ${step}`),
      );
      setSkillBenchmarkBaseline((prev) => ({ ...prev, [template.id]: baselineResult }));

      if (existingAgentName) {
        setBenchmarkProgressText('Step 3/4: Re-enabling Organizational Skill (ENABLED)...');
        await api.enableAgent(existingAgentName, config);
        disabledSkillName = undefined;
      } else {
        setBenchmarkProgressText('Step 2/3: Deploying Organizational Skill (ENABLED)...');
        const created = await handleDeployRecommendedSkill(template);
        if (!created) {
          return;
        }
      }

      setBenchmarkProgressText(
        existingAgentName
          ? 'Step 4/4: Measuring Post-Skill (After Skill Enabled) latency...'
          : 'Step 3/3: Measuring Post-Skill (After Skill) latency...',
      );
      const postResult = await runSkillBenchmarkPhase(
        queries,
        config,
        {
          skillId: draft.skillId,
          displayName: draft.displayName,
          description: draft.description,
          instruction: draft.instruction,
          targetSources: template.targetSources,
        },
        report?.connectedDataStoreResourceNames || [],
        (step) => setBenchmarkProgressText(`Post-Skill (Skill Enabled): ${step}`),
      );
      setSkillBenchmarkPost((prev) => ({ ...prev, [template.id]: postResult }));

      const comparison = diagnoseSkillPerformanceAndMistakes(
        {
          skillId: draft.skillId,
          displayName: draft.displayName,
          description: draft.description,
          instruction: draft.instruction,
          targetSources: template.targetSources,
        },
        queries,
        baselineResult,
        postResult,
        getAssistantConflictContext(),
      );
      setSkillBenchmarkReports((prev) => ({ ...prev, [template.id]: comparison }));
    } catch (err: unknown) {
      setSkillStatusMsg((prev) => ({
        ...prev,
        [template.id]: {
          type: 'err',
          text: toErrorMessage(err, 'Failed to complete automated Before/After benchmark.'),
        },
      }));
    } finally {
      if (disabledSkillName) {
        try {
          await api.enableAgent(disabledSkillName, config);
        } catch {
          // Best-effort restore so the skill is never left disabled after a failed benchmark
        }
      }
      setRunningBenchmarkSkillId(null);
      setBenchmarkProgressText('');
    }
  };

  const handleUpdateAndRetestSkill = async (template: RecommendedSkillTemplate) => {
    const draft = skillEdits[template.id] || {
      skillId: template.skillIdSuggestion,
      displayName: template.displayName,
      description: template.description,
      instruction: template.instruction,
    };

    const existingAgentName = resolveExistingSkillAgentName(
      template,
      draft.skillId,
      draft.displayName,
    );

    if (!existingAgentName) {
      await handleAutoBenchmarkAndDeploySkill(template);
      return;
    }

    let finalDescription = draft.description.trim();
    let finalInstruction = draft.instruction.trim();
    if (finalInstruction.startsWith('---')) {
      try {
        const parsed = parseSkillMarkdown(finalInstruction);
        if (parsed.hasFrontmatter) {
          if (parsed.description) finalDescription = parsed.description.trim();
          finalInstruction = parsed.body.trim();
        }
      } catch (err) {
        setSkillStatusMsg((prev) => ({
          ...prev,
          [template.id]: {
            type: 'err',
            text: toErrorMessage(err, 'Invalid YAML frontmatter in SKILL.md.'),
          },
        }));
        return;
      }
    }
    finalDescription = sanitizeSkillDescription(finalDescription);
    const finalDisplayName =
      sanitizeSkillDisplayName(draft.displayName) || 'Enterprise Custom Skill';
    const updatedDraft = {
      ...draft,
      displayName: finalDisplayName,
      description: finalDescription,
      instruction: finalInstruction,
    };

    const queries =
      benchmarkQueriesBySkill[template.id] || generateDefaultBenchmarkQueriesForSkill(template);

    setCreatingSkillId(template.id);
    setExpandedBenchmarkSkills((prev) => new Set(prev).add(template.id));
    setRunningBenchmarkSkillId(template.id);
    let skillCurrentlyDisabled = false;

    try {
      setBenchmarkProgressText('Step 1/4: Updating Skill instructions & description...');
      await api.updateAgent(
        { name: existingAgentName, displayName: finalDisplayName },
        {
          displayName: finalDisplayName,
          description: finalDescription,
          sharingConfig: { scope: 'ALL_USERS' },
          skillAgentDefinition: {
            instruction: finalInstruction,
          },
        },
        config,
      );
      setSkillEdits((prev) => ({
        ...prev,
        [template.id]: updatedDraft,
      }));
      setCreatingSkillId(null);

      setBenchmarkProgressText(
        'Step 2/4: Disabling Skill to run clean Baseline (Before Skill) queries...',
      );
      await api.disableAgent(existingAgentName, config);
      skillCurrentlyDisabled = true;

      const baselineResult = await runSkillBenchmarkPhase(
        queries,
        config,
        {
          skillId: updatedDraft.skillId,
          displayName: updatedDraft.displayName,
          description: updatedDraft.description,
          instruction: updatedDraft.instruction,
          targetSources: template.targetSources,
        },
        report?.connectedDataStoreResourceNames || [],
        (step) => setBenchmarkProgressText(`Step 2/4 Baseline (Skill Disabled): ${step}`),
      );
      setSkillBenchmarkBaseline((prev) => ({ ...prev, [template.id]: baselineResult }));

      setBenchmarkProgressText(
        'Step 3/4: Re-enabling Skill to run Post-Skill (After Skill) queries...',
      );
      await api.enableAgent(existingAgentName, config);
      skillCurrentlyDisabled = false;

      const postResult = await runSkillBenchmarkPhase(
        queries,
        config,
        {
          skillId: updatedDraft.skillId,
          displayName: updatedDraft.displayName,
          description: updatedDraft.description,
          instruction: updatedDraft.instruction,
          targetSources: template.targetSources,
        },
        report?.connectedDataStoreResourceNames || [],
        (step) => setBenchmarkProgressText(`Step 4/4 Post-Skill (Skill Enabled): ${step}`),
      );
      setSkillBenchmarkPost((prev) => ({ ...prev, [template.id]: postResult }));

      const comparison = diagnoseSkillPerformanceAndMistakes(
        {
          skillId: updatedDraft.skillId,
          displayName: updatedDraft.displayName,
          description: updatedDraft.description,
          instruction: updatedDraft.instruction,
          targetSources: template.targetSources,
        },
        queries,
        baselineResult,
        postResult,
        getAssistantConflictContext(),
      );
      setSkillBenchmarkReports((prev) => ({ ...prev, [template.id]: comparison }));

      setSkillStatusMsg((prev) => ({
        ...prev,
        [template.id]: {
          type: 'ok',
          text: `Updated skill "${finalDisplayName}" and completed full A/B re-test (Disabled → Baseline → Enabled → Post-Skill)!`,
        },
      }));
      await onRefreshAgents?.();
    } catch (err: unknown) {
      setSkillStatusMsg((prev) => ({
        ...prev,
        [template.id]: {
          type: 'err',
          text: toErrorMessage(err, 'Failed to update and re-test deployed skill.'),
        },
      }));
    } finally {
      if (skillCurrentlyDisabled) {
        try {
          await api.enableAgent(existingAgentName, config);
        } catch {
          // Best-effort restore so the skill is not left disabled if a network error occurs
        }
      }
      setCreatingSkillId(null);
      setRunningBenchmarkSkillId(null);
      setBenchmarkProgressText('');
    }
  };

  const handleSaveGlobalSkillInstructionsOnly = async (template: RecommendedSkillTemplate) => {
    const draft = skillEdits[template.id] || {
      skillId: template.skillIdSuggestion,
      displayName: template.displayName,
      description: template.description,
      instruction: template.instruction,
    };

    const existingAgentName =
      deployedSkillAgentNames[template.id] ||
      agentsRef.current.find(
        (a) =>
          isSkillAgentResource(a) &&
          ((a.name.split('/').pop() || '').toLowerCase() === draft.skillId.trim().toLowerCase() ||
            (a.displayName || '').trim().toLowerCase() ===
              sanitizeSkillDisplayName(draft.displayName).toLowerCase()),
      )?.name;

    if (!existingAgentName) {
      await handleDeployRecommendedSkill(template);
      return;
    }

    let finalDescription = draft.description.trim();
    let finalInstruction = draft.instruction.trim();
    if (finalInstruction.startsWith('---')) {
      try {
        const parsed = parseSkillMarkdown(finalInstruction);
        if (parsed.hasFrontmatter) {
          if (parsed.description) finalDescription = parsed.description.trim();
          finalInstruction = parsed.body.trim();
        }
      } catch (err) {
        setSkillStatusMsg((prev) => ({
          ...prev,
          [template.id]: {
            type: 'err',
            text: toErrorMessage(err, 'Invalid YAML frontmatter in SKILL.md.'),
          },
        }));
        return;
      }
    }
    finalDescription = sanitizeSkillDescription(finalDescription);

    setCreatingSkillId(template.id);
    try {
      const finalDisplayName =
        sanitizeSkillDisplayName(draft.displayName) || 'Enterprise Custom Skill';
      await api.updateAgent(
        { name: existingAgentName, displayName: finalDisplayName },
        {
          displayName: finalDisplayName,
          description: finalDescription,
          sharingConfig: { scope: 'ALL_USERS' },
          skillAgentDefinition: {
            instruction: finalInstruction,
          },
        },
        config,
      );
      setSkillEdits((prev) => ({
        ...prev,
        [template.id]: {
          ...draft,
          displayName: finalDisplayName,
          description: finalDescription,
          instruction: finalInstruction,
        },
      }));
      setSkillStatusMsg((prev) => ({
        ...prev,
        [template.id]: {
          type: 'ok',
          text: `Saved updated SKILL.md Markdown instructions for "${finalDisplayName}"!`,
        },
      }));
      await onRefreshAgents?.();
    } catch (err: unknown) {
      setSkillStatusMsg((prev) => ({
        ...prev,
        [template.id]: {
          type: 'err',
          text: toErrorMessage(err, 'Failed to save SKILL.md instructions.'),
        },
      }));
    } finally {
      setCreatingSkillId(null);
    }
  };

  const handleImportSkillMarkdownIntoDraft = (
    template: RecommendedSkillTemplate,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const currentDraft = skillEdits[template.id] || {
      skillId: template.skillIdSuggestion,
      displayName: template.displayName,
      description: template.description,
      instruction: template.instruction,
    };

    const reader = new FileReader();
    reader.onload = (ev) => {
      const rawText = String(ev.target?.result || '');
      try {
        const parsed = parseSkillMarkdown(rawText);
        setSkillEdits((prev) => ({
          ...prev,
          [template.id]: {
            ...currentDraft,
            displayName: parsed.displayName
              ? sanitizeSkillDisplayName(parsed.displayName)
              : currentDraft.displayName,
            description: sanitizeSkillDescription(
              parsed.description !== undefined ? parsed.description : currentDraft.description,
            ),
            instruction: parsed.hasFrontmatter ? parsed.body : rawText,
          },
        }));
        setSkillStatusMsg((prev) => ({
          ...prev,
          [template.id]: {
            type: 'ok',
            text: `Loaded "${file.name}" into SKILL.md Markdown editor. Click Save / Create to apply.`,
          },
        }));
      } catch (err: unknown) {
        setSkillStatusMsg((prev) => ({
          ...prev,
          [template.id]: {
            type: 'err',
            text: toErrorMessage(err, 'Failed to parse imported SKILL.md file.'),
          },
        }));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDownloadSkillMarkdownFromDraft = (template: RecommendedSkillTemplate) => {
    const currentDraft = skillEdits[template.id] || {
      skillId: template.skillIdSuggestion,
      displayName: template.displayName,
      description: template.description,
      instruction: template.instruction,
    };
    const mdContent = buildSkillMarkdownDocument({
      name: currentDraft.skillId,
      description: currentDraft.description,
      body: currentDraft.instruction,
    });
    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentDraft.skillId || 'SKILL'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleApplySkillMistakeFix = (
    template: RecommendedSkillTemplate,
    mistake: SkillDiagnosticMistake,
  ) => {
    const currentDraft = skillEdits[template.id] || {
      skillId: template.skillIdSuggestion,
      displayName: template.displayName,
      description: template.description,
      instruction: template.instruction,
    };

    const nextDescription = mistake.recommendedDescriptionPatch
      ? mistake.recommendedDescriptionPatch
      : currentDraft.description;
    const nextInstruction =
      mistake.recommendedInstructionAppend &&
      !currentDraft.instruction.includes(mistake.recommendedInstructionAppend.trim())
        ? `${currentDraft.instruction.trim()}${mistake.recommendedInstructionAppend}`
        : currentDraft.instruction;

    setSkillEdits((prev) => ({
      ...prev,
      [template.id]: {
        ...currentDraft,
        description: nextDescription,
        instruction: nextInstruction,
      },
    }));

    const queries =
      benchmarkQueriesBySkill[template.id] || generateDefaultBenchmarkQueriesForSkill(template);
    const updatedComparison = diagnoseSkillPerformanceAndMistakes(
      {
        skillId: currentDraft.skillId,
        displayName: currentDraft.displayName,
        description: nextDescription,
        instruction: nextInstruction,
        targetSources: template.targetSources,
      },
      queries,
      skillBenchmarkBaseline[template.id],
      skillBenchmarkPost[template.id],
    );
    setSkillBenchmarkReports((prev) => ({ ...prev, [template.id]: updatedComparison }));
    setSkillStatusMsg((prev) => ({
      ...prev,
      [template.id]: {
        type: 'ok',
        text: `Applied suggested fix for "${mistake.title}". Click "Update Skill & Re-Test After" (or Create Skill) to verify latency!`,
      },
    }));
  };

  const handleExportMarkdown = () => {
    if (!report) return;
    const md = generateAssistantEvaluationMarkdown(report);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    try {
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `assistant-evaluation-${report.engineId}.md`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const handleExportJson = () => {
    if (!report) return;
    const sanitizedReport = {
      ...report,
      byomcpEvaluations: report.byomcpEvaluations.map((mcp) => {
        const copy: Partial<ByomcpConnectorEvaluation> = { ...mcp };
        delete copy.rawConnector;
        return copy;
      }),
    };
    const jsonStr = JSON.stringify(sanitizedReport, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    try {
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `assistant-evaluation-${report.engineId}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const scoreColorClass = !report
    ? 'text-gray-300 border-gray-700 bg-gray-800'
    : report.overallScore >= 82
    ? 'text-emerald-300 border-emerald-700/80 bg-emerald-950/60'
    : report.overallScore >= 62
    ? 'text-amber-300 border-amber-700/80 bg-amber-950/60'
    : 'text-red-300 border-red-700/80 bg-red-950/60';

  const latencyBadgeClass = !report
    ? 'bg-gray-800 text-gray-300 border-gray-700'
    : report.latencyRiskLevel === 'LOW'
    ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700/70'
    : report.latencyRiskLevel === 'MODERATE'
    ? 'bg-amber-950/70 text-amber-300 border-amber-700/70'
    : 'bg-red-950/80 text-red-300 border-red-700/80';

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/75 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assistant-eval-modal-title"
      data-testid="assistant-evaluation-modal"
      onClick={() => {
        if (!isBusy) {
          onClose();
        }
      }}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col text-gray-100 animate-fade-in-up"
      >
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-gray-800 bg-gray-800/80 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-900/50 text-purple-300 border border-purple-700/60 rounded-lg">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 id="assistant-eval-modal-title" className="text-lg font-bold text-white">
                  Assistant Configuration &amp; Best-Practices Evaluator
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-amber-950/90 text-amber-300 border border-amber-700/70">
                  Experimental
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-950/90 text-purple-300 border border-purple-700/70">
                  Latency &bull; Skills &bull; BYOMCP &bull; Guardrails
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Engine: <span className="font-mono text-gray-300">{engine.displayName}</span> (
                <span className="font-mono text-gray-400">{engine.name.split('/').pop()}</span>)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenLatencyLab && (
              <button
                type="button"
                onClick={onOpenLatencyLab}
                disabled={isBusy}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
                title="Open the dedicated full-screen Latency Testing Lab for this Engine"
              >
                <span>⚡ Open Latency Lab</span>
              </button>
            )}
            {report && (
              <>
                <button
                  type="button"
                  onClick={handleExportMarkdown}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium rounded-lg border border-gray-700 transition-colors"
                  title="Download Markdown Evaluation Report"
                >
                  Export .md
                </button>
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium rounded-lg border border-gray-700 transition-colors"
                  title="Download JSON Evaluation Report"
                >
                  Export .json
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => void executeEvaluation()}
              disabled={isEvaluating}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              {isEvaluating ? 'Evaluating...' : 'Re-Evaluate'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!isBusy) onClose();
              }}
              disabled={isBusy}
              aria-label="Close evaluation dialog"
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-50 rounded-lg transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isEvaluating && !report ? (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
              <div className="h-10 w-10 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
              <p className="text-sm font-semibold text-white">
                Evaluating Assistant, Connected DataStores, Skills &amp; BYOMCP Servers...
              </p>
              <p className="text-xs text-gray-400 font-mono">{progressStep}</p>
            </div>
          ) : evalError ? (
            <div
              role="alert"
              className="p-4 bg-red-950/40 border border-red-800 rounded-lg text-red-200 text-sm"
            >
              {evalError}
            </div>
          ) : report ? (
            <>
              {/* Probe Warnings Banner */}
              {report.probeWarnings.length > 0 && (
                <div className="p-3 bg-amber-950/30 border border-amber-800/70 rounded-lg text-xs text-amber-200 space-y-1">
                  {report.probeWarnings.map((w, i) => (
                    <p key={i}>• {w}</p>
                  ))}
                </div>
              )}

              {/* Top Scorecard Strip */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                {/* Score & Grade Card */}
                <div
                  data-testid="eval-overall-score"
                  className={`p-4 rounded-xl border flex items-center justify-between ${scoreColorClass}`}
                >
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider opacity-80">
                      Best-Practice Score
                    </div>
                    <div className="text-3xl font-extrabold mt-1">
                      {report.overallScore}
                      <span className="text-base font-normal opacity-75">/100</span>
                    </div>
                    <div className="text-xs mt-1 opacity-90">
                      {counts.critical} Critical &bull; {counts.warning} Warnings
                      {counts.info > 0 ? ` • ${counts.info} Info` : ''}
                    </div>
                  </div>
                  <div className="h-14 w-14 rounded-xl border border-current/40 flex items-center justify-center text-2xl font-black">
                    {report.grade}
                  </div>
                </div>

                {/* Latency & Fan-Out Risk Card */}
                <div
                  data-testid="eval-latency-risk-badge"
                  className={`p-4 rounded-xl border ${latencyBadgeClass}`}
                >
                  <div className="text-xs font-semibold uppercase tracking-wider opacity-80">
                    Retrieval Latency Risk
                  </div>
                  <div className="text-xl font-extrabold mt-1 flex items-center gap-2">
                    <span>{report.latencyRiskLevel}</span>
                  </div>
                  <div className="text-xs mt-1.5 opacity-90">
                    {report.metrics.connectedDataStoresCount} Connected DataStore(s) &bull;{' '}
                    {report.metrics.connectedConnectorsCount} Connector(s)
                  </div>
                </div>

                {/* Skills & Query Optimization Coverage */}
                <div className="p-4 rounded-xl border border-gray-800 bg-gray-800/70">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Query Optimization Skills
                  </div>
                  <div className="text-xl font-bold text-white mt-1">
                    {report.metrics.enabledSkillsCount} Enabled
                    {report.metrics.privateOrDisabledSkillsCount > 0 && (
                      <span className="ml-2 text-xs font-medium text-amber-400">
                        ({report.metrics.privateOrDisabledSkillsCount} Disabled Org)
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-1.5">
                    {report.recommendedSkills.length} recommended skill template(s) available
                  </div>
                </div>

                {/* BYOMCP Servers Evaluated */}
                <div className="p-4 rounded-xl border border-gray-800 bg-gray-800/70">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    BYOMCP Datastores
                  </div>
                  <div className="text-xl font-bold text-purple-300 mt-1">
                    {report.byomcpEvaluations.length} Discovered
                  </div>
                  <div className="text-xs text-gray-400 mt-1.5">
                    {actionableByomcpEvaluations.length > 0
                      ? `${actionableByomcpEvaluations.length} need description / instruction tuning`
                      : configuredByomcpCount > 0
                      ? `All ${configuredByomcpCount} configured (OPTIMAL)`
                      : '0 need description / instruction tuning'}
                  </div>
                </div>
              </div>

              {/* 5-Pillar Weighted Score Breakdown */}
              {report.categoryScores && (
                <div
                  data-testid="eval-pillar-breakdown"
                  className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 bg-gray-800/40 border border-gray-800 rounded-xl p-3"
                >
                  {Object.values(report.categoryScores).map((pillar) => {
                    const pct = Math.round((pillar.score / Math.max(1, pillar.maxScore)) * 100);
                    const barColor =
                      pct >= 80
                        ? 'bg-emerald-500'
                        : pct >= 55
                        ? 'bg-amber-500'
                        : 'bg-red-500';
                    const isSelected =
                      activeModalTab === 'findings' && categoryFilter === pillar.category;
                    return (
                      <button
                        key={pillar.category}
                        type="button"
                        onClick={() => {
                          setActiveModalTab('findings');
                          setCategoryFilter(
                            categoryFilter === pillar.category ? 'ALL' : pillar.category,
                          );
                        }}
                        title={`Filter findings by ${pillar.label}`}
                        className={`text-left p-2.5 rounded-lg border transition-colors ${
                          isSelected
                            ? 'bg-blue-950/40 border-blue-600/80'
                            : 'bg-gray-900/60 border-gray-800 hover:border-gray-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[11px] font-medium text-gray-300 truncate">
                            {pillar.label}
                          </span>
                          <span className="text-xs font-bold font-mono text-white shrink-0">
                            {pillar.score}
                            <span className="text-[10px] text-gray-400 font-normal">
                              /{pillar.maxScore}
                            </span>
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden mt-1.5">
                          <div
                            className={`h-full ${barColor} transition-all`}
                            style={{ width: `${Math.max(4, pct)}%` }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Navigation Sub-Tabs */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 pb-3">
                <div className="flex flex-wrap gap-2" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    data-testid="eval-tab-findings"
                    aria-selected={activeModalTab === 'findings'}
                    onClick={() => setActiveModalTab('findings')}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 ${
                      activeModalTab === 'findings'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
                    }`}
                  >
                    <span>Diagnostic Findings</span>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-black/30">
                      {actionableFindings.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    data-testid="eval-tab-byomcp"
                    aria-selected={activeModalTab === 'byomcp'}
                    onClick={() => setActiveModalTab('byomcp')}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 ${
                      activeModalTab === 'byomcp'
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
                    }`}
                  >
                    <span>BYOMCP Descriptions &amp; Instructions Advisor</span>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-black/30">
                      {actionableByomcpEvaluations.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    data-testid="eval-tab-skills"
                    aria-selected={activeModalTab === 'skills'}
                    onClick={() => setActiveModalTab('skills')}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 ${
                      activeModalTab === 'skills'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
                    }`}
                  >
                    <span>Recommended Query-Routing Skills</span>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-black/30">
                      {report.recommendedSkills.length}
                    </span>
                  </button>
                </div>

                {/* Filters for Findings Tab */}
                {activeModalTab === 'findings' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Filter by severity"
                      value={severityFilter}
                      onChange={(e) =>
                        setSeverityFilter(
                          e.target.value as 'ALL' | Exclude<EvaluationSeverity, 'PASS'>,
                        )
                      }
                      className="bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-200"
                    >
                      <option value="ALL">All Issues ({actionableFindings.length})</option>
                      <option value="CRITICAL">Critical ({counts.critical})</option>
                      <option value="WARNING">Warnings ({counts.warning})</option>
                      {counts.info > 0 && <option value="INFO">Info ({counts.info})</option>}
                    </select>

                    <select
                      aria-label="Filter by category"
                      value={categoryFilter}
                      onChange={(e) =>
                        setCategoryFilter(e.target.value as 'ALL' | EvaluationCategory)
                      }
                      className="bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-200"
                    >
                      <option value="ALL">All Categories</option>
                      {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* TAB 1: DIAGNOSTIC FINDINGS */}
              {activeModalTab === 'findings' && (
                <div className="space-y-3">
                  {filteredFindings.length === 0 ? (
                    <div className="p-8 text-center text-sm text-gray-400 bg-gray-800/40 rounded-xl border border-gray-800">
                      {actionableFindings.length === 0
                        ? 'No critical, warning, or informational issues detected.'
                        : 'No findings match the selected filters.'}
                    </div>
                  ) : (
                    filteredFindings.map((finding) => (
                      <div
                        key={finding.id}
                        className="p-4 rounded-xl bg-gray-800/70 border border-gray-700/80 space-y-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span
                              className={`px-2.5 py-0.5 rounded text-[11px] font-bold border ${
                                SEVERITY_BADGE_STYLES[finding.severity]
                              }`}
                            >
                              {finding.severity}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-900 text-gray-300 border border-gray-700">
                              {CATEGORY_LABELS[finding.category]}
                            </span>
                            <h3 className="text-sm font-bold text-white">{finding.title}</h3>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            {finding.id === 'skills-private-or-disabled-trap' && (
                              <button
                                type="button"
                                onClick={() => void handlePromoteAllPrivateSkills()}
                                disabled={isPromotingPrivateSkills}
                                className="px-2.5 py-1 bg-amber-900/70 hover:bg-amber-800/90 disabled:bg-gray-700 text-amber-100 text-xs font-semibold rounded border border-amber-700/80 transition-colors"
                              >
                                {isPromotingPrivateSkills
                                  ? 'Promoting Skills...'
                                  : 'Promote & Enable All (1-Click)'}
                              </button>
                            )}
                            {finding.byomcpCollectionId && (
                              <button
                                type="button"
                                onClick={() => setActiveModalTab('byomcp')}
                                className="px-2.5 py-1 bg-purple-900/60 hover:bg-purple-800/80 text-purple-200 text-xs font-semibold rounded border border-purple-700/70 transition-colors"
                              >
                                Fix in BYOMCP Advisor &rarr;
                              </button>
                            )}
                            {finding.recommendedSkillId && (
                              <button
                                type="button"
                                onClick={() => setActiveModalTab('skills')}
                                className="px-2.5 py-1 bg-emerald-900/60 hover:bg-emerald-800/80 text-emerald-200 text-xs font-semibold rounded border border-emerald-700/70 transition-colors"
                              >
                                Deploy Optimization Skill &rarr;
                              </button>
                            )}
                            {finding.targetTab && onNavigateToTab && (
                              <button
                                type="button"
                                onClick={() => {
                                  onNavigateToTab(finding.targetTab!);
                                  onClose();
                                }}
                                className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-medium rounded border border-gray-600 transition-colors capitalize"
                              >
                                Open {finding.targetTab} Tab &rarr;
                              </button>
                            )}
                          </div>
                        </div>

                        <p className="text-xs text-gray-300 leading-relaxed">{finding.summary}</p>

                        {finding.id === 'skills-private-or-disabled-trap' && promoteSkillsMsg && (
                          <div
                            className={`p-2.5 rounded-lg text-xs border ${
                              promoteSkillsMsg.type === 'ok'
                                ? 'bg-emerald-950/50 text-emerald-300 border-emerald-800'
                                : 'bg-red-950/50 text-red-300 border-red-800'
                            }`}
                          >
                            {promoteSkillsMsg.text}
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-gray-900/70 p-3 rounded-lg border border-gray-800">
                          <div>
                            <span className="text-gray-400 font-semibold block mb-0.5">
                              Current Configuration:
                            </span>
                            <span className="font-mono text-gray-200">{finding.currentValue}</span>
                          </div>
                          <div>
                            <span className="text-gray-400 font-semibold block mb-0.5">
                              Recommended Best Practice:
                            </span>
                            <span className="font-mono text-emerald-300">
                              {finding.recommendedValue}
                            </span>
                          </div>
                        </div>

                        {finding.severity !== 'PASS' && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
                            <div className="text-gray-400">
                              <strong className="text-gray-300">Customer Impact:</strong>{' '}
                              {finding.impact}
                            </div>
                            <div className="text-blue-200/90">
                              <strong className="text-blue-300">Actionable Remediation:</strong>{' '}
                              {finding.remediation}
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* TAB 2: BYOMCP DESCRIPTIONS & INSTRUCTIONS ADVISOR */}
              {activeModalTab === 'byomcp' && (
                <div className="space-y-5">
                  <div className="p-4 rounded-xl bg-purple-950/25 border border-purple-800/50 text-xs text-purple-200 flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1 max-w-3xl">
                      <div className="font-bold text-sm text-white">
                        BYOMCP DataStore Description &amp; Instruction Optimizer
                      </div>
                      <p>
                        Analyzes each BYOMCP connector&apos;s discovered tools, JSON-Schema input
                        parameters (required flags, types, enums), and endpoint metadata to infer its
                        operational domain and generate tailored{' '}
                        <code className="text-purple-300">mcp_server_description</code> and{' '}
                        <code className="text-purple-300">mcp_agent_instructions</code>. Use{' '}
                        <strong className="text-amber-300">✨ Tailor with Gemini</strong> to synthesize
                        bespoke guidance from the full tool JSON schemas via Vertex AI.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                      {actionableByomcpEvaluations.length > 1 && (
                        <button
                          type="button"
                          onClick={() => void handleApplyAllByomcpFixes()}
                          disabled={isBatchSavingByomcp || Boolean(savingByomcpId)}
                          className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
                        >
                          {isBatchSavingByomcp
                            ? 'Applying Batch Fixes...'
                            : `Apply All Fixes (${actionableByomcpEvaluations.length})`}
                        </button>
                      )}
                      {configuredByomcpCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowConfiguredByomcp((prev) => !prev)}
                          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium rounded-lg border border-gray-700 transition-colors"
                        >
                          {showConfiguredByomcp
                            ? `Hide ${configuredByomcpCount} already-configured MCP server(s)`
                            : `Show ${configuredByomcpCount} already-configured MCP server(s)`}
                        </button>
                      )}
                    </div>
                  </div>

                  {report.byomcpEvaluations.length === 0 ? (
                    <div className="p-8 text-center text-sm text-gray-400 bg-gray-800/40 rounded-xl border border-gray-800">
                      No BYOMCP (<code className="text-purple-300">custom_mcp</code>) connectors were
                      detected in this location.
                    </div>
                  ) : visibleByomcpEvaluations.length === 0 ? (
                    <div className="p-8 text-center text-sm text-emerald-300 bg-emerald-950/20 rounded-xl border border-emerald-800/50 space-y-2">
                      <p className="font-semibold">
                        All {configuredByomcpCount} BYOMCP connector(s) already have optimal server
                        descriptions, agent instructions, and enabled tools!
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowConfiguredByomcp(true)}
                        className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium rounded-lg border border-gray-700 transition-colors"
                      >
                        Inspect {configuredByomcpCount} Configured Connector(s)
                      </button>
                    </div>
                  ) : (
                    visibleByomcpEvaluations.map((mcp) => {
                      const draft = byomcpEdits[mcp.collectionId] || {
                        serverDescription: mcp.recommendedServerDescription,
                        agentInstructions: mcp.recommendedAgentInstructions,
                      };
                      const statusFeedback = byomcpStatusMsg[mcp.collectionId];
                      const isSavingThis = savingByomcpId === mcp.collectionId;
                      const isSynthesizingThis = synthesizingByomcpId === mcp.collectionId;

                      return (
                        <div
                          key={mcp.collectionId}
                          className="p-5 rounded-xl bg-gray-800/80 border border-gray-700 space-y-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-700 pb-3">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-base font-bold text-white">
                                  {mcp.displayName}
                                </h3>
                                <span className="font-mono text-xs text-gray-400">
                                  ({mcp.collectionId})
                                </span>
                                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-950 text-purple-300 border border-purple-700">
                                  {mcp.useCaseLabel}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                                    mcp.status === 'OPTIMAL'
                                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
                                      : 'bg-amber-950/80 text-amber-300 border-amber-700'
                                  }`}
                                >
                                  {mcp.status === 'OPTIMAL'
                                    ? 'Configured'
                                    : `${mcp.issues.length} Issue(s) Detected`}
                                </span>
                              </div>
                              <p className="text-xs text-gray-400 font-mono mt-1">
                                Endpoint: {mcp.instanceUri || 'Not set'} &bull; Tools:{' '}
                                {mcp.enabledToolsCount}/{mcp.totalToolsCount} enabled &bull; Citation
                                Rules: {mcp.citationRulesCount}
                              </p>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => void handleTailorByomcpWithGemini(mcp)}
                                disabled={Boolean(synthesizingByomcpId) || Boolean(savingByomcpId)}
                                title="Synthesize custom server description, agent instructions, and companion skill using Vertex AI Gemini over the full MCP tool JSON schemas"
                                className="px-3 py-1.5 bg-amber-900/60 hover:bg-amber-800/80 disabled:bg-gray-700 text-amber-200 text-xs font-semibold rounded-lg border border-amber-700/70 transition-colors"
                              >
                                {isSynthesizingThis
                                  ? '✨ Synthesizing...'
                                  : '✨ Tailor with Gemini'}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setByomcpEdits((prev) => ({
                                    ...prev,
                                    [mcp.collectionId]: {
                                      serverDescription: mcp.recommendedServerDescription,
                                      agentInstructions: mcp.recommendedAgentInstructions,
                                    },
                                  }))
                                }
                                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-medium rounded-lg border border-gray-600 transition-colors"
                              >
                                Load Recommended Template
                              </button>
                              {mcp.citationRulesCount === 0 && (
                                <button
                                  type="button"
                                  onClick={() => void handleApplyByomcp(mcp, true)}
                                  disabled={Boolean(savingByomcpId)}
                                  title="Also sets default RFC 6901 citation_mappings ({uri: '/url', title: '/title'}) if your MCP tools return document URLs"
                                  className="px-3 py-1.5 bg-blue-900/60 hover:bg-blue-800/80 disabled:bg-gray-700 text-blue-200 text-xs font-semibold rounded-lg border border-blue-700/70 transition-colors"
                                >
                                  {isSavingThis ? 'Applying...' : 'Apply + Default Citations'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => void handleApplyByomcp(mcp, false)}
                                disabled={Boolean(savingByomcpId)}
                                className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
                              >
                                {isSavingThis ? 'Applying...' : 'Apply to Connector'}
                              </button>
                            </div>
                          </div>

                          {/* Issues / Optional Enhancement List */}
                          {mcp.issues.length > 0 && (
                            <div
                              className={`p-3 rounded-lg border text-xs space-y-1 ${
                                mcp.status === 'OPTIMAL'
                                  ? 'bg-blue-950/30 border-blue-800/60 text-blue-200'
                                  : 'bg-amber-950/30 border-amber-800/60 text-amber-200'
                              }`}
                            >
                              {mcp.issues.map((iss, idx) => (
                                <p key={idx}>• {iss}</p>
                              ))}
                            </div>
                          )}

                          {/* Discovered Tools & Schema Pills */}
                          {mcp.tools.length > 0 && (
                            <div>
                              <span className="text-xs font-semibold text-gray-400 block mb-1.5">
                                Discovered MCP Tools &amp; JSON-Schema Input Parameters (* = required):
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {mcp.tools.map((t) => {
                                  const paramSignatures =
                                    t.parameterDetails && t.parameterDetails.length > 0
                                      ? t.parameterDetails.slice(0, 4).map((p) => {
                                          const reqMark = p.required ? '*' : '';
                                          const enumHint =
                                            p.enumValues && p.enumValues.length > 0
                                              ? `[${p.enumValues.slice(0, 2).join('|')}]`
                                              : p.type;
                                          return `${p.name}${reqMark}:${enumHint}`;
                                        })
                                      : t.parameterNames.slice(0, 4);

                                  return (
                                    <span
                                      key={t.name}
                                      className={`px-2 py-1 rounded text-[11px] font-mono border ${
                                        t.enabled
                                          ? 'bg-gray-900 text-purple-200 border-gray-700'
                                          : 'bg-gray-900/40 text-gray-500 border-gray-800 line-through'
                                      }`}
                                      title={t.description || 'No tool description'}
                                    >
                                      {t.name}
                                      {paramSignatures.length > 0 && (
                                        <span className="text-gray-400">
                                          ({paramSignatures.join(', ')})
                                        </span>
                                      )}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Editable Server Description */}
                          <div>
                            <label
                              htmlFor={`mcp-desc-${mcp.collectionId}`}
                              className="block text-xs font-semibold text-gray-300 mb-1"
                            >
                              Recommended MCP Server Description{' '}
                              <span className="font-mono text-purple-400">
                                (mcp_server_description)
                              </span>
                            </label>
                            <input
                              id={`mcp-desc-${mcp.collectionId}`}
                              type="text"
                              value={draft.serverDescription}
                              onChange={(e) =>
                                setByomcpEdits((prev) => ({
                                  ...prev,
                                  [mcp.collectionId]: {
                                    ...draft,
                                    serverDescription: e.target.value,
                                  },
                                }))
                              }
                              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white focus:border-purple-500 focus:outline-none"
                            />
                          </div>

                          {/* Editable Agent Instructions */}
                          <div>
                            <label
                              htmlFor={`mcp-inst-${mcp.collectionId}`}
                              className="block text-xs font-semibold text-gray-300 mb-1"
                            >
                              Recommended Agent Formatting &amp; Routing Instructions{' '}
                              <span className="font-mono text-purple-400">
                                (mcp_agent_instructions)
                              </span>
                            </label>
                            <textarea
                              id={`mcp-inst-${mcp.collectionId}`}
                              rows={8}
                              value={draft.agentInstructions}
                              onChange={(e) =>
                                setByomcpEdits((prev) => ({
                                  ...prev,
                                  [mcp.collectionId]: {
                                    ...draft,
                                    agentInstructions: e.target.value,
                                  },
                                }))
                              }
                              className="w-full bg-gray-950 border border-gray-700 rounded-lg p-3 text-xs text-gray-100 font-mono focus:border-purple-500 focus:outline-none leading-relaxed"
                            />
                          </div>

                          {statusFeedback && (
                            <div
                              className={`p-2.5 rounded-lg text-xs border ${
                                statusFeedback.type === 'ok'
                                  ? 'bg-emerald-950/50 text-emerald-300 border-emerald-800'
                                  : 'bg-red-950/50 text-red-300 border-red-800'
                              }`}
                            >
                              {statusFeedback.text}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* TAB 3: RECOMMENDED QUERY-ROUTING SKILLS */}
              {activeModalTab === 'skills' && (
                <div className="space-y-5">
                  <div className="p-4 rounded-xl bg-emerald-950/25 border border-emerald-800/50 text-xs text-emerald-200 space-y-1">
                    <div className="font-bold text-sm text-white">
                      1-Click Query Optimization &amp; DataStore Routing Skills
                    </div>
                    <p>
                      Deploy organizational Skills (<code className="text-emerald-300">ENABLED</code>{' '}
                      state) tailored to your connected DataStores and BYOMCP servers so the
                      Assistant routes queries to the right source without high-latency fan-out. Use{' '}
                      <strong className="text-amber-300">✨ Tailor with Gemini</strong> to generate
                      domain-specific trigger descriptions and routing instructions, and click{' '}
                      <strong className="text-cyan-300">⚡ Test Performance</strong> to benchmark
                      assistant latency before and after creating the skill (and automatically
                      diagnose any skill mistakes).
                    </p>
                  </div>

                  {displayedRecommendedSkills.length === 0 ? (
                    <div className="p-8 text-center text-sm text-gray-400 bg-gray-800/40 rounded-xl border border-gray-800">
                      No additional Skill templates needed right now.
                    </div>
                  ) : (
                    displayedRecommendedSkills.map((sk) => {
                      const draft = skillEdits[sk.id] || {
                        skillId: sk.skillIdSuggestion,
                        displayName: sk.displayName,
                        description: sk.description,
                        instruction: sk.instruction,
                      };
                      const isCreatingThis = creatingSkillId === sk.id;
                      const isSynthesizingSkillThis = synthesizingSkillId === sk.id;
                      const isRunningBenchThis = runningBenchmarkSkillId === sk.id;
                      const isAlreadyCreated =
                        createdSkillIds.has(sk.id) || sk.id.startsWith('existing-global-skill-');
                      const statusFeedback = skillStatusMsg[sk.id];
                      const isBenchOpen = expandedBenchmarkSkills.has(sk.id);
                      const queries =
                        benchmarkQueriesBySkill[sk.id] ||
                        generateDefaultBenchmarkQueriesForSkill(sk);
                      const baselinePhase = skillBenchmarkBaseline[sk.id];
                      const postPhase = skillBenchmarkPost[sk.id];
                      const comparisonReport = skillBenchmarkReports[sk.id];

                      return (
                        <div
                          key={sk.id}
                          className="p-5 rounded-xl bg-gray-800/80 border border-gray-700 space-y-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-700 pb-3">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-base font-bold text-white">
                                  {draft.displayName}
                                </h3>
                                {isAlreadyCreated && (
                                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700">
                                    Deployed (ENABLED)
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400 mt-0.5">{sk.rationale}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                data-testid={`test-skill-performance-btn-${sk.id}`}
                                onClick={() =>
                                  setExpandedBenchmarkSkills((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(sk.id)) next.delete(sk.id);
                                    else next.add(sk.id);
                                    return next;
                                  })
                                }
                                className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                                  isBenchOpen
                                    ? 'bg-cyan-700 text-white border-cyan-500'
                                    : 'bg-cyan-950/70 hover:bg-cyan-900/80 text-cyan-200 border-cyan-700/80'
                                }`}
                                title="Send test queries to the Assistant before and after creating this Skill to measure latency improvement and diagnose Skill routing mistakes"
                              >
                                ⚡ Test Performance
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleTailorSkillWithGemini(sk)}
                                disabled={
                                  Boolean(synthesizingSkillId) ||
                                  Boolean(creatingSkillId) ||
                                  Boolean(runningBenchmarkSkillId)
                                }
                                title="Synthesize custom trigger description and Markdown instructions using Vertex AI Gemini over your connected DataStores and MCP tools"
                                className="px-3 py-2 bg-amber-900/60 hover:bg-amber-800/80 disabled:bg-gray-700 text-amber-200 text-xs font-semibold rounded-lg border border-amber-700/70 transition-colors"
                              >
                                {isSynthesizingSkillThis
                                  ? '✨ Synthesizing...'
                                  : '✨ Tailor with Gemini'}
                              </button>
                              {isAlreadyCreated ? (
                                <button
                                  type="button"
                                  onClick={() => void handleUpdateAndRetestSkill(sk)}
                                  disabled={
                                    Boolean(creatingSkillId) || Boolean(runningBenchmarkSkillId)
                                  }
                                  title="Updates the skill, disables it to run clean Baseline (Before) queries, re-enables it, and runs Post-Skill (After) queries"
                                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
                                >
                                  {isCreatingThis
                                    ? 'Updating Skill...'
                                    : '🔄 Update Skill & Full A/B Re-Test'}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => void handleDeployRecommendedSkill(sk)}
                                  disabled={
                                    Boolean(creatingSkillId) || Boolean(runningBenchmarkSkillId)
                                  }
                                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
                                >
                                  {isCreatingThis
                                    ? 'Deploying Skill...'
                                    : 'Create Organizational Skill (1-Click)'}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* ⚡ PERFORMANCE & ROUTING BENCHMARK (BEFORE VS. AFTER) PANEL */}
                          {isBenchOpen && (
                            <div
                              data-testid={`skill-benchmark-panel-${sk.id}`}
                              className="p-4 rounded-xl bg-gray-900/90 border border-cyan-800/70 space-y-4"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 pb-3">
                                <div>
                                  <div className="text-xs font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-2">
                                    <span>⚡ Before vs. After Latency &amp; Skill Routing Benchmark</span>
                                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-gray-800 text-gray-300 border border-gray-700">
                                      POST :streamAssist
                                    </span>
                                  </div>
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    Disables the Skill to run clean Baseline (Before) queries, then
                                    enables the Skill and runs Post-Skill (After) queries to evaluate
                                    latency reduction, grounding citations, and instruction conflicts.
                                  </p>
                                </div>

                                <div className="flex items-center gap-2 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => void handleRunSkillBenchmark(sk, 'baseline')}
                                    disabled={
                                      Boolean(runningBenchmarkSkillId) || Boolean(creatingSkillId)
                                    }
                                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800/50 text-gray-200 text-xs font-semibold rounded-lg border border-gray-600 transition-colors"
                                  >
                                    {isRunningBenchThis && !postPhase
                                      ? 'Running...'
                                      : '1. Test Baseline (Skill Disabled)'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleRunSkillBenchmark(sk, 'post')}
                                    disabled={
                                      Boolean(runningBenchmarkSkillId) || Boolean(creatingSkillId)
                                    }
                                    className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 disabled:bg-gray-800/50 text-white text-xs font-semibold rounded-lg border border-cyan-500 transition-colors"
                                  >
                                    2. Test Post-Skill (Skill Enabled)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void (isAlreadyCreated
                                        ? handleUpdateAndRetestSkill(sk)
                                        : handleAutoBenchmarkAndDeploySkill(sk))
                                    }
                                    disabled={
                                      Boolean(runningBenchmarkSkillId) || Boolean(creatingSkillId)
                                    }
                                    title="Automatically disables/measures Baseline queries, deploys or enables this Organizational Skill, and runs Post-Skill queries to compare Before vs. After performance"
                                    className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:bg-gray-800/50 text-white text-xs font-semibold rounded-lg border border-emerald-500 transition-colors"
                                  >
                                    {isAlreadyCreated
                                      ? '🔄 Full A/B Re-Test (Disable → Before → Enable → After)'
                                      : '⚡ Auto-Benchmark (Before → Deploy → After)'}
                                  </button>
                                </div>
                              </div>

                              {/* Editable Benchmark Queries */}
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-semibold text-gray-300">
                                    Benchmark Test Queries ({queries.length}):
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setBenchmarkQueriesBySkill((prev) => ({
                                        ...prev,
                                        [sk.id]: [
                                          ...queries,
                                          `Search ${
                                            sk.targetSources[0] || draft.displayName
                                          } for recent updates and key guidelines.`,
                                        ],
                                      }))
                                    }
                                    disabled={queries.length >= 5}
                                    className="text-xs text-cyan-400 hover:text-cyan-300 disabled:opacity-40 font-semibold"
                                  >
                                    + Add Test Query
                                  </button>
                                </div>
                                {queries.map((qText, qIdx) => (
                                  <div key={qIdx} className="flex items-center gap-2">
                                    <span className="text-xs font-mono text-gray-400 w-6">
                                      Q{qIdx + 1}.
                                    </span>
                                    <input
                                      type="text"
                                      aria-label={`Benchmark Query ${qIdx + 1}`}
                                      value={qText}
                                      onChange={(e) => {
                                        const nextQ = [...queries];
                                        nextQ[qIdx] = e.target.value;
                                        setBenchmarkQueriesBySkill((prev) => ({
                                          ...prev,
                                          [sk.id]: nextQ,
                                        }));
                                      }}
                                      className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                                    />
                                    {queries.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const nextQ = queries.filter((_, idx) => idx !== qIdx);
                                          setBenchmarkQueriesBySkill((prev) => ({
                                            ...prev,
                                            [sk.id]: nextQ,
                                          }));
                                        }}
                                        className="px-2 py-1 text-xs text-gray-400 hover:text-red-400"
                                        title="Remove query"
                                      >
                                        ✕
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>

                              {/* Progress Spinner when running */}
                              {isRunningBenchThis && (
                                <div className="p-3 rounded-lg bg-cyan-950/40 border border-cyan-800/70 flex items-center gap-3 text-xs text-cyan-200">
                                  <div className="h-4 w-4 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin shrink-0" />
                                  <span>{benchmarkProgressText || 'Running benchmark...'}</span>
                                </div>
                              )}

                              {/* Before vs. After Summary Cards */}
                              {(baselinePhase || postPhase) && (
                                <div className="space-y-3 pt-1">
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div className="p-3 rounded-lg bg-gray-950/80 border border-gray-800">
                                      <div className="text-[11px] font-semibold uppercase text-gray-400">
                                        Baseline (Before Skill)
                                      </div>
                                      {baselinePhase ? (
                                        <>
                                          <div className="text-lg font-bold text-white mt-1">
                                            {baselinePhase.avgLatencyMs.toLocaleString()} ms{' '}
                                            <span className="text-xs font-normal text-gray-400">
                                              avg
                                            </span>
                                          </div>
                                          <div className="text-[11px] text-gray-400 mt-0.5">
                                            TTFB: {baselinePhase.avgTtfbMs.toLocaleString()} ms &bull;{' '}
                                            {baselinePhase.runs.length} query(s)
                                          </div>
                                        </>
                                      ) : (
                                        <div className="text-xs text-gray-500 mt-2">
                                          Not run yet
                                        </div>
                                      )}
                                    </div>

                                    <div className="p-3 rounded-lg bg-gray-950/80 border border-gray-800">
                                      <div className="text-[11px] font-semibold uppercase text-gray-400">
                                        Post-Skill (After Skill)
                                      </div>
                                      {postPhase ? (
                                        <>
                                          <div className="text-lg font-bold text-white mt-1">
                                            {postPhase.avgLatencyMs.toLocaleString()} ms{' '}
                                            <span className="text-xs font-normal text-gray-400">
                                              avg
                                            </span>
                                          </div>
                                          <div className="text-[11px] text-gray-400 mt-0.5">
                                            TTFB: {postPhase.avgTtfbMs.toLocaleString()} ms &bull;{' '}
                                            Routing Rate: {postPhase.skillTriggerRate}%
                                          </div>
                                        </>
                                      ) : (
                                        <div className="text-xs text-gray-500 mt-2">
                                          Deploy skill &amp; click &ldquo;2. Test Post-Skill&rdquo;
                                        </div>
                                      )}
                                    </div>

                                    <div
                                      className={`p-3 rounded-lg border ${
                                        comparisonReport?.latencyDeltaMs !== undefined
                                          ? comparisonReport.latencyDeltaMs < 0
                                            ? 'bg-emerald-950/50 border-emerald-700/80 text-emerald-200'
                                            : 'bg-amber-950/50 border-amber-700/80 text-amber-200'
                                          : 'bg-gray-950/80 border-gray-800 text-gray-300'
                                      }`}
                                    >
                                      <div className="text-[11px] font-semibold uppercase opacity-80">
                                        Latency Delta &amp; Verdict
                                      </div>
                                      {comparisonReport?.latencyDeltaMs !== undefined ? (
                                        <>
                                          <div className="text-lg font-extrabold mt-1">
                                            {comparisonReport.latencyDeltaMs <= 0 ? '' : '+'}
                                            {comparisonReport.latencyDeltaMs.toLocaleString()} ms (
                                            {comparisonReport.latencyDeltaPercent! <= 0 ? '' : '+'}
                                            {comparisonReport.latencyDeltaPercent}%)
                                          </div>
                                          <div className="text-[11px] mt-0.5 opacity-90">
                                            {comparisonReport.latencyDeltaMs < 0
                                              ? '✓ Faster after Skill creation'
                                              : '⚠️ No speedup — inspect diagnostics below'}
                                          </div>
                                        </>
                                      ) : (
                                        <div className="text-xs mt-1.5 opacity-90">
                                          {comparisonReport?.verdictSummary ||
                                            'Run both Baseline and Post-Skill to compare delta.'}
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {comparisonReport?.verdictSummary && (
                                    <div
                                      className={`p-2.5 rounded-lg text-xs border ${
                                        comparisonReport.improved
                                          ? 'bg-emerald-950/40 border-emerald-800/70 text-emerald-200'
                                          : 'bg-amber-950/40 border-amber-800/70 text-amber-200'
                                      }`}
                                    >
                                      <strong>Benchmark Summary:</strong>{' '}
                                      {comparisonReport.verdictSummary}
                                    </div>
                                  )}

                                  {/* Per-Query Latency & Planner Trace Table */}
                                  <div className="border border-gray-800 rounded-lg overflow-hidden">
                                    <table className="min-w-full divide-y divide-gray-800 text-xs">
                                      <thead className="bg-gray-950 text-gray-400">
                                        <tr>
                                          <th className="px-3 py-2 text-left font-semibold">
                                            Test Query
                                          </th>
                                          <th className="px-3 py-2 text-right font-semibold">
                                            Before (ms)
                                          </th>
                                          <th className="px-3 py-2 text-right font-semibold">
                                            After (ms)
                                          </th>
                                          <th className="px-3 py-2 text-center font-semibold">
                                            Routing / Grounding
                                          </th>
                                          <th className="px-3 py-2 text-right font-semibold">
                                            Trace
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-800 bg-gray-900/60">
                                        {queries.map((qText, qIdx) => {
                                          const baseRun = baselinePhase?.runs[qIdx];
                                          const postRun = postPhase?.runs[qIdx];
                                          const activeRun = postRun || baseRun;
                                          const traceId = `${sk.id}-${qIdx}`;
                                          const isTraceExpanded = expandedTraceKey === traceId;

                                          return (
                                            <React.Fragment key={qIdx}>
                                              <tr>
                                                <td className="px-3 py-2 text-gray-200 max-w-md truncate">
                                                  {qText}
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono text-gray-300">
                                                  {baseRun
                                                    ? `${baseRun.totalLatencyMs.toLocaleString()} ms`
                                                    : '—'}
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono text-cyan-300">
                                                  {postRun
                                                    ? `${postRun.totalLatencyMs.toLocaleString()} ms`
                                                    : '—'}
                                                </td>
                                                <td className="px-3 py-2 text-center">
                                                  {activeRun ? (
                                                    activeRun.errorMessage ? (
                                                      <span className="px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-800 text-[10px]">
                                                        API Error
                                                      </span>
                                                    ) : activeRun.skillTriggered ? (
                                                      <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px]">
                                                        ✓ Routed ({activeRun.citationsCount} cite)
                                                      </span>
                                                    ) : (
                                                      <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 text-[10px]">
                                                        ⚠️ Unguided ({activeRun.citationsCount} cite)
                                                      </span>
                                                    )
                                                  ) : (
                                                    '—'
                                                  )}
                                                </td>
                                                <td className="px-3 py-2 text-right">
                                                  {activeRun && (
                                                    <button
                                                      type="button"
                                                      onClick={() =>
                                                        setExpandedTraceKey(
                                                          isTraceExpanded ? null : traceId,
                                                        )
                                                      }
                                                      className="text-cyan-400 hover:text-cyan-300 font-semibold text-[11px]"
                                                    >
                                                      {isTraceExpanded ? 'Hide Trace' : 'Inspect'}
                                                    </button>
                                                  )}
                                                </td>
                                              </tr>
                                              {isTraceExpanded && activeRun && (
                                                <tr className="bg-gray-950/90">
                                                  <td colSpan={5} className="p-3 space-y-2 text-xs">
                                                    {activeRun.errorMessage && (
                                                      <div className="text-red-300 font-mono">
                                                        Error: {activeRun.errorMessage}
                                                      </div>
                                                    )}
                                                    <div>
                                                      <span className="font-semibold text-gray-400">
                                                        Planner Thought Steps (
                                                        {activeRun.thoughtSteps.length}):
                                                      </span>
                                                      {activeRun.thoughtSteps.length > 0 ? (
                                                        <pre className="mt-1 p-2 rounded bg-gray-900 border border-gray-800 text-[11px] text-gray-300 font-mono whitespace-pre-wrap max-h-36 overflow-y-auto">
                                                          {activeRun.thoughtSteps.join('\n---\n')}
                                                        </pre>
                                                      ) : (
                                                        <span className="ml-2 text-gray-500">
                                                          No thought chunks returned
                                                        </span>
                                                      )}
                                                    </div>
                                                    <div>
                                                      <span className="font-semibold text-gray-400">
                                                        Answer Preview:
                                                      </span>{' '}
                                                      <span className="text-gray-300">
                                                        {activeRun.answerPreview ||
                                                          '(Empty response)'}
                                                      </span>
                                                    </div>
                                                  </td>
                                                </tr>
                                              )}
                                            </React.Fragment>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>

                                  {/* Automated Skill Mistake Diagnostics & 1-Click Fixes */}
                                  {comparisonReport && comparisonReport.mistakes.length > 0 && (
                                    <div className="space-y-2.5 pt-1">
                                      <div className="text-xs font-bold uppercase tracking-wider text-amber-300">
                                        🔍 Identified Skill Mistakes &amp; Optimization Fixes (
                                        {comparisonReport.mistakes.length})
                                      </div>
                                      {comparisonReport.mistakes.map((mistake, mIdx) => (
                                        <div
                                          key={`${mistake.code}-${mIdx}`}
                                          className="p-3.5 rounded-lg bg-gray-950/90 border border-amber-800/70 space-y-2"
                                        >
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                              <span
                                                className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                                  mistake.severity === 'CRITICAL'
                                                    ? 'bg-red-950 text-red-300 border-red-700'
                                                    : 'bg-amber-950 text-amber-300 border-amber-700'
                                                }`}
                                              >
                                                {mistake.severity}
                                              </span>
                                              <span className="text-xs font-bold text-white">
                                                {mistake.title}
                                              </span>
                                            </div>
                                            {(mistake.recommendedDescriptionPatch ||
                                              mistake.recommendedInstructionAppend) && (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleApplySkillMistakeFix(sk, mistake)
                                                }
                                                className="px-2.5 py-1 bg-amber-700 hover:bg-amber-600 text-white text-[11px] font-semibold rounded border border-amber-500 transition-colors"
                                              >
                                                🔧 Apply Suggested Fix to Skill Draft
                                              </button>
                                            )}
                                          </div>
                                          <p className="text-xs text-gray-300">
                                            {mistake.explanation}
                                          </p>
                                          <p className="text-xs text-emerald-300">
                                            <strong>Recommended Fix:</strong> {mistake.suggestedFix}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label
                                htmlFor={`skill-name-${sk.id}`}
                                className="block text-xs font-semibold text-gray-300 mb-1"
                              >
                                Skill Display Name{' '}
                                <span className="text-[10px] font-normal text-gray-400">
                                  (letters, numbers, spaces, hyphens; max 64 chars)
                                </span>
                              </label>
                              <input
                                id={`skill-name-${sk.id}`}
                                type="text"
                                maxLength={64}
                                value={draft.displayName}
                                onChange={(e) =>
                                  setSkillEdits((prev) => ({
                                    ...prev,
                                    [sk.id]: { ...draft, displayName: e.target.value },
                                  }))
                                }
                                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white"
                              />
                            </div>
                            <div>
                              <label
                                htmlFor={`skill-id-${sk.id}`}
                                className="block text-xs font-semibold text-gray-300 mb-1"
                              >
                                Skill Resource ID
                              </label>
                              <input
                                id={`skill-id-${sk.id}`}
                                type="text"
                                value={draft.skillId}
                                onChange={(e) =>
                                  setSkillEdits((prev) => ({
                                    ...prev,
                                    [sk.id]: { ...draft, skillId: e.target.value },
                                  }))
                                }
                                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs font-mono text-gray-200"
                              />
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label
                                htmlFor={`skill-desc-${sk.id}`}
                                className="block text-xs font-semibold text-gray-300"
                              >
                                Trigger Description (Used by Planner for Routing){' '}
                                <span className="text-[10px] font-normal text-gray-400">
                                  (max {MAX_SKILL_DESCRIPTION_LENGTH} chars)
                                </span>
                              </label>
                              <span
                                className={`text-[10px] font-mono ${
                                  Array.from(draft.description).length >
                                  MAX_SKILL_DESCRIPTION_LENGTH
                                    ? 'text-amber-300 font-bold'
                                    : 'text-gray-400'
                                }`}
                              >
                                {Array.from(draft.description).length} /{' '}
                                {MAX_SKILL_DESCRIPTION_LENGTH}
                              </span>
                            </div>
                            <input
                              id={`skill-desc-${sk.id}`}
                              type="text"
                              maxLength={MAX_SKILL_DESCRIPTION_LENGTH}
                              value={draft.description}
                              onChange={(e) =>
                                setSkillEdits((prev) => ({
                                  ...prev,
                                  [sk.id]: { ...draft, description: e.target.value },
                                }))
                              }
                              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white"
                            />
                          </div>

                          <div>
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                              <label
                                htmlFor={`skill-inst-${sk.id}`}
                                className="block text-xs font-semibold text-gray-300"
                              >
                                Skill Markdown Instructions (<code className="font-mono text-emerald-300">SKILL.md</code>)
                              </label>
                              <div className="flex items-center gap-2">
                                <label
                                  htmlFor={`skill-md-upload-${sk.id}`}
                                  className="px-2.5 py-1 bg-gray-900 hover:bg-gray-700 text-gray-200 rounded text-[11px] font-semibold border border-gray-700 cursor-pointer transition-colors"
                                  title="Upload a local SKILL.md or .md file to replace instructions (parses YAML frontmatter automatically)"
                                >
                                  📂 Import `.md`
                                </label>
                                <input
                                  id={`skill-md-upload-${sk.id}`}
                                  type="file"
                                  accept=".md,.markdown,.txt"
                                  onChange={(e) => handleImportSkillMarkdownIntoDraft(sk, e)}
                                  className="hidden"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleDownloadSkillMarkdownFromDraft(sk)}
                                  className="px-2.5 py-1 bg-gray-900 hover:bg-gray-700 text-gray-200 rounded text-[11px] font-semibold border border-gray-700 transition-colors"
                                  title="Download this skill as a portable SKILL.md file with YAML frontmatter"
                                >
                                  ⬇️ Export `SKILL.md`
                                </button>
                                {isAlreadyCreated && (
                                  <button
                                    type="button"
                                    disabled={
                                      Boolean(creatingSkillId) || Boolean(runningBenchmarkSkillId)
                                    }
                                    onClick={() => void handleSaveGlobalSkillInstructionsOnly(sk)}
                                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white rounded text-[11px] font-bold transition-colors"
                                    title="Save updated SKILL.md Markdown instructions to this global skill"
                                  >
                                    {isCreatingThis ? 'Saving...' : '💾 Save SKILL.md'}
                                  </button>
                                )}
                              </div>
                            </div>
                            <textarea
                              id={`skill-inst-${sk.id}`}
                              rows={8}
                              value={draft.instruction}
                              onChange={(e) =>
                                setSkillEdits((prev) => ({
                                  ...prev,
                                  [sk.id]: { ...draft, instruction: e.target.value },
                                }))
                              }
                              className="w-full bg-gray-950 border border-gray-700 rounded-lg p-3 text-xs font-mono text-gray-100 leading-relaxed"
                            />
                          </div>

                          {statusFeedback && (
                            <div
                              className={`p-2.5 rounded-lg text-xs border ${
                                statusFeedback.type === 'ok'
                                  ? 'bg-emerald-950/50 text-emerald-300 border-emerald-800'
                                  : 'bg-red-950/50 text-red-300 border-red-800'
                              }`}
                            >
                              {statusFeedback.text}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default AssistantEvaluationModal;
