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

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Agent,
  AgentBulkFieldCsvParseResult,
  BulkEditSharePublishAgentOutcome,
  BulkEditSharePublishOptions,
  BulkEditSharePublishResult,
  Config,
  PreviousOwnerDisposition,
} from '../../types';
import * as api from '../../services/apiService';
import { toErrorMessage } from '../../utils/errors';
import { useModalA11y } from '../../hooks/useModalA11y';
import {
  STANDARD_ENTERPRISE_MODELS,
  formatModelDisplayName,
} from '../assistants/engine-details/modelsCatalog';

export interface BulkEditSharePublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  agents: Agent[];
  initialSelectedAgentNames?: Set<string>;
  config: Config;
  onComplete: (result: BulkEditSharePublishResult) => void;
  onOpenBulkDatasources?: () => void;
}

type WizardStep = 1 | 2 | 3;

export type BulkEditModuleId =
  | 'owner'
  | 'sharing'
  | 'publish'
  | 'metadata'
  | 'model'
  | 'observability'
  | 'datasources';

interface BulkEditModuleOption {
  id: BulkEditModuleId;
  title: string;
  badge: string;
  description: string;
  accentColor: 'emerald' | 'cyan' | 'purple' | 'amber';
}

const BULK_EDIT_MODULES: BulkEditModuleOption[] = [
  {
    id: 'owner',
    title: 'Remap Agent Owners',
    badge: 'Per-Agent Table + CSV Upload',
    description:
      'View a side-by-side table of Agent, Current Owner, and New Owner. Manually enter new owners, apply a uniform owner, or upload a CSV to auto-fill.',
    accentColor: 'emerald',
  },
  {
    id: 'sharing',
    title: 'Sharing Scope & IAM Access',
    badge: 'All Users · Restricted · Private',
    description:
      'Change organization sharing scope (All Users, Restricted IAM, or Withdraw to Private) and grant or replace roles/discoveryengine.agentUser bindings.',
    accentColor: 'emerald',
  },
  {
    id: 'publish',
    title: 'Publish Drafts & Lifecycle Status',
    badge: ':deployLowCode · :publish · Enable/Disable',
    description:
      'Deploy/publish No-Code and Workflow agent drafts to live users and transition agents between ENABLED and DISABLED states.',
    accentColor: 'cyan',
  },
  {
    id: 'metadata',
    title: 'Edit Display Names & Descriptions',
    badge: 'Per-Agent Table + CSV or Prefix/Suffix',
    description:
      'Update agent descriptions and display names individually in a side-by-side table, auto-fill from a CSV upload, or apply a uniform prefix/suffix.',
    accentColor: 'purple',
  },
  {
    id: 'model',
    title: 'Remap No-Code / Workflow LLM Models',
    badge: 'Per-Agent Table + CSV or Uniform Model',
    description:
      'Assign Gemini Enterprise LLM models per agent, upload a CSV mapping agent to model ID, or apply a uniform model across selected agents.',
    accentColor: 'purple',
  },
  {
    id: 'observability',
    title: 'Observability & Sensitive Logging',
    badge: 'observabilityConfig',
    description:
      'Enable or disable Cloud Trace / BigQuery Agent Analytics telemetry and sensitive prompt/response logging across selected agents.',
    accentColor: 'cyan',
  },
  {
    id: 'datasources',
    title: 'Swap Datastores & VPC-SC Connectors',
    badge: 'Live Diff Preview',
    description:
      'Migrate, swap, add, or remove Data Connectors and Data Stores across Low-Code and Workflow agents.',
    accentColor: 'amber',
  },
];

const BulkEditSharePublishModal: React.FC<BulkEditSharePublishModalProps> = ({
  isOpen,
  onClose,
  agents,
  initialSelectedAgentNames,
  config,
  onComplete,
  onOpenBulkDatasources,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const ownerCsvInputRef = useRef<HTMLInputElement>(null);
  const metadataCsvInputRef = useRef<HTMLInputElement>(null);
  const modelCsvInputRef = useRef<HTMLInputElement>(null);

  // Eligible (non-Google-managed) agents
  const selectableAgents = useMemo(
    () => agents.filter((a) => !api.isGoogleManagedAgent(a)),
    [agents],
  );

  // Wizard step state: 1 = Select Agents, 2 = Choose What to Edit, 3 = Make Edits & Apply
  const [step, setStep] = useState<WizardStep>(1);
  const [step1Search, setStep1Search] = useState<string>('');
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [selectedModules, setSelectedModules] = useState<Set<BulkEditModuleId>>(
    new Set(['owner', 'sharing', 'publish']),
  );

  // 1. Publish & Lifecycle State
  const [publishDrafts, setPublishDrafts] = useState<boolean>(true);
  const [lifecycleAction, setLifecycleAction] = useState<
    'NONE' | 'ENABLE' | 'DISABLE'
  >('NONE');
  const [autoClaimOwnershipOn403, setAutoClaimOwnershipOn403] =
    useState<boolean>(true);
  const [deleteOriginalPrivateClone, setDeleteOriginalPrivateClone] =
    useState<boolean>(false);

  // 2. Sharing Scope & IAM Access
  const [sharingScope, setSharingScope] = useState<
    'UNCHANGED' | 'ALL_USERS' | 'RESTRICTED' | 'PRIVATE'
  >('UNCHANGED');
  const [sharedPrincipalsInput, setSharedPrincipalsInput] =
    useState<string>('');
  const [sharedPrincipalMode, setSharedPrincipalMode] = useState<
    'APPEND' | 'REPLACE'
  >('APPEND');

  // 3. Owner Remapping (Per-Agent Table + CSV + Uniform Default)
  const [ownerRemapByAgent, setOwnerRemapByAgent] = useState<
    Record<string, string>
  >({});
  const [defaultTargetOwner, setDefaultTargetOwner] = useState<string>('');
  const [previousOwnerDisposition, setPreviousOwnerDisposition] =
    useState<PreviousOwnerDisposition>('KEEP_AS_AGENT_USER');

  // 4. Metadata & Descriptions (Per-Agent Table + CSV + Uniform Mode)
  const [displayNameRemapByAgent, setDisplayNameRemapByAgent] = useState<
    Record<string, string>
  >({});
  const [descriptionRemapByAgent, setDescriptionRemapByAgent] = useState<
    Record<string, string>
  >({});
  const [descriptionMode, setDescriptionMode] = useState<
    'UNCHANGED' | 'PREFIX' | 'SUFFIX' | 'REPLACE'
  >('UNCHANGED');
  const [descriptionText, setDescriptionText] = useState<string>('');

  // 5. LLM Model Remapping (Per-Agent Table + CSV + Uniform Model)
  const [lowCodeModel, setLowCodeModel] = useState<string>('__UNCHANGED__');
  const [lowCodeModelRemapByAgent, setLowCodeModelRemapByAgent] = useState<
    Record<string, string>
  >({});

  // 6. Observability & Sensitive Logging
  const [observabilityEnabled, setObservabilityEnabled] = useState<
    'UNCHANGED' | 'ENABLE' | 'DISABLE'
  >('UNCHANGED');
  const [sensitiveLoggingEnabled, setSensitiveLoggingEnabled] = useState<
    'UNCHANGED' | 'ENABLE' | 'DISABLE'
  >('UNCHANGED');

  // CSV Parse feedback banner
  const [csvParseSummary, setCsvParseSummary] =
    useState<AgentBulkFieldCsvParseResult | null>(null);
  const [csvFileName, setCsvFileName] = useState<string>('');

  // Execution state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [progress, setProgress] = useState<{
    completed: number;
    total: number;
    latestName: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<BulkEditSharePublishResult | null>(null);

  useModalA11y({
    isOpen,
    onClose,
    containerRef,
    preventClose: isSubmitting,
  });

  useEffect(() => {
    if (!isOpen) return;
    if (initialSelectedAgentNames && initialSelectedAgentNames.size > 0) {
      const valid = new Set(
        Array.from(initialSelectedAgentNames).filter((name) =>
          selectableAgents.some((a) => a.name === name),
        ),
      );
      setSelectedNames(
        valid.size > 0
          ? valid
          : new Set(selectableAgents.map((a) => a.name)),
      );
    } else {
      setSelectedNames(new Set(selectableAgents.map((a) => a.name)));
    }
    setStep(1);
    setStep1Search('');
    setError(null);
    setReport(null);
    setProgress(null);
  }, [isOpen, initialSelectedAgentNames, selectableAgents]);

  const filteredStep1Agents = useMemo(() => {
    const q = step1Search.trim().toLowerCase();
    if (!q) return selectableAgents;
    return selectableAgents.filter((a) => {
      const shortId = (a.name.split('/').pop() || '').toLowerCase();
      const disp = (a.displayName || '').toLowerCase();
      const owner = (api.extractAgentOwnerHint(a) || '').toLowerCase();
      const desc = (a.description || '').toLowerCase();
      return (
        disp.includes(q) ||
        shortId.includes(q) ||
        owner.includes(q) ||
        desc.includes(q)
      );
    });
  }, [selectableAgents, step1Search]);

  const parsedPrincipals = useMemo(
    () =>
      sharedPrincipalsInput
        .split(/[\n,;]+/)
        .map((p) => p.trim())
        .filter(Boolean),
    [sharedPrincipalsInput],
  );

  const selectedAgentsList = useMemo(
    () => selectableAgents.filter((a) => selectedNames.has(a.name)),
    [selectableAgents, selectedNames],
  );

  const activeOwnerRemapCount = useMemo(() => {
    if (!selectedModules.has('owner')) return 0;
    let count = 0;
    for (const a of selectedAgentsList) {
      const mapped =
        (ownerRemapByAgent[a.name] || '').trim() ||
        defaultTargetOwner.trim();
      if (mapped) count++;
    }
    return count;
  }, [selectedModules, selectedAgentsList, ownerRemapByAgent, defaultTargetOwner]);

  const activeMetadataRemapCount = useMemo(() => {
    if (!selectedModules.has('metadata')) return 0;
    let count = 0;
    for (const a of selectedAgentsList) {
      const hasDisp = Boolean((displayNameRemapByAgent[a.name] || '').trim());
      const hasDesc = Boolean((descriptionRemapByAgent[a.name] || '').trim());
      const hasUniformDesc =
        descriptionMode !== 'UNCHANGED' && Boolean(descriptionText.trim());
      if (hasDisp || hasDesc || hasUniformDesc) count++;
    }
    return count;
  }, [
    selectedModules,
    selectedAgentsList,
    displayNameRemapByAgent,
    descriptionRemapByAgent,
    descriptionMode,
    descriptionText,
  ]);

  const activeModelRemapCount = useMemo(() => {
    if (!selectedModules.has('model')) return 0;
    let count = 0;
    for (const a of selectedAgentsList) {
      const hasPerAgent = Boolean(
        (lowCodeModelRemapByAgent[a.name] || '').trim(),
      );
      const hasUniform = lowCodeModel !== '__UNCHANGED__';
      if (hasPerAgent || hasUniform) count++;
    }
    return count;
  }, [
    selectedModules,
    selectedAgentsList,
    lowCodeModelRemapByAgent,
    lowCodeModel,
  ]);

  const hasAnyOperationSelected = useMemo(() => {
    const publishOp =
      selectedModules.has('publish') &&
      (publishDrafts || lifecycleAction !== 'NONE');
    const sharingOp =
      selectedModules.has('sharing') &&
      (sharingScope !== 'UNCHANGED' || parsedPrincipals.length > 0);
    const ownerOp = activeOwnerRemapCount > 0;
    const metadataOp =
      selectedModules.has('metadata') &&
      (activeMetadataRemapCount > 0 || descriptionMode !== 'UNCHANGED');
    const modelOp = activeModelRemapCount > 0;
    const obsOp =
      selectedModules.has('observability') &&
      (observabilityEnabled !== 'UNCHANGED' ||
        sensitiveLoggingEnabled !== 'UNCHANGED');

    return (
      publishOp ||
      sharingOp ||
      ownerOp ||
      metadataOp ||
      modelOp ||
      obsOp
    );
  }, [
    selectedModules,
    publishDrafts,
    lifecycleAction,
    sharingScope,
    parsedPrincipals.length,
    activeOwnerRemapCount,
    activeMetadataRemapCount,
    descriptionMode,
    activeModelRemapCount,
    observabilityEnabled,
    sensitiveLoggingEnabled,
  ]);

  const handleToggleAgent = (name: string) => {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedNames.size === selectableAgents.length) {
      setSelectedNames(new Set());
    } else {
      setSelectedNames(new Set(selectableAgents.map((a) => a.name)));
    }
  };

  const handleToggleModule = (moduleId: BulkEditModuleId) => {
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  };

  const handleAgentOwnerInputChange = (agentName: string, value: string) => {
    setOwnerRemapByAgent((prev) => {
      const next = { ...prev };
      if (!value.trim()) {
        delete next[agentName];
      } else {
        next[agentName] = value;
      }
      return next;
    });
    if (value.trim()) {
      setSelectedNames((prev) => {
        if (prev.has(agentName)) return prev;
        const next = new Set(prev);
        next.add(agentName);
        return next;
      });
    }
  };

  const handleAgentDisplayNameInputChange = (
    agentName: string,
    value: string,
  ) => {
    setDisplayNameRemapByAgent((prev) => {
      const next = { ...prev };
      if (!value.trim()) {
        delete next[agentName];
      } else {
        next[agentName] = value;
      }
      return next;
    });
    if (value.trim()) {
      setSelectedNames((prev) => {
        if (prev.has(agentName)) return prev;
        const next = new Set(prev);
        next.add(agentName);
        return next;
      });
    }
  };

  const handleAgentDescriptionInputChange = (
    agentName: string,
    value: string,
  ) => {
    setDescriptionRemapByAgent((prev) => {
      const next = { ...prev };
      if (!value.trim()) {
        delete next[agentName];
      } else {
        next[agentName] = value;
      }
      return next;
    });
    if (value.trim()) {
      setSelectedNames((prev) => {
        if (prev.has(agentName)) return prev;
        const next = new Set(prev);
        next.add(agentName);
        return next;
      });
    }
  };

  const handleAgentModelInputChange = (agentName: string, value: string) => {
    setLowCodeModelRemapByAgent((prev) => {
      const next = { ...prev };
      if (!value.trim()) {
        delete next[agentName];
      } else {
        next[agentName] = value;
      }
      return next;
    });
    if (value.trim()) {
      setSelectedNames((prev) => {
        if (prev.has(agentName)) return prev;
        const next = new Set(prev);
        next.add(agentName);
        return next;
      });
    }
  };

  const applyCsvBulkFieldsText = (
    csvText: string,
    sourceLabel: string,
    defaultField: 'owner' | 'description' | 'display_name' | 'model',
  ) => {
    setError(null);
    const parsed = api.parseAgentBulkFieldsCsv(
      csvText,
      selectableAgents,
      defaultField,
    );

    setCsvParseSummary(parsed);
    setCsvFileName(sourceLabel);

    if (Object.keys(parsed.ownerRemapByAgent).length > 0) {
      setOwnerRemapByAgent((prev) => ({
        ...prev,
        ...parsed.ownerRemapByAgent,
      }));
      setSelectedModules((prev) => new Set(prev).add('owner'));
    }
    if (Object.keys(parsed.displayNameRemapByAgent).length > 0) {
      setDisplayNameRemapByAgent((prev) => ({
        ...prev,
        ...parsed.displayNameRemapByAgent,
      }));
      setSelectedModules((prev) => new Set(prev).add('metadata'));
    }
    if (Object.keys(parsed.descriptionRemapByAgent).length > 0) {
      setDescriptionRemapByAgent((prev) => ({
        ...prev,
        ...parsed.descriptionRemapByAgent,
      }));
      setSelectedModules((prev) => new Set(prev).add('metadata'));
    }
    if (Object.keys(parsed.lowCodeModelRemapByAgent).length > 0) {
      setLowCodeModelRemapByAgent((prev) => ({
        ...prev,
        ...parsed.lowCodeModelRemapByAgent,
      }));
      setSelectedModules((prev) => new Set(prev).add('model'));
    }

    if (parsed.matchedAgentNames.length > 0) {
      setSelectedNames((prev) => {
        if (step === 1) {
          return new Set(parsed.matchedAgentNames);
        }
        const next = new Set(prev);
        for (const name of parsed.matchedAgentNames) {
          next.add(name);
        }
        return next;
      });
    }

    if (
      parsed.validationErrors.length > 0 &&
      parsed.matchedAgentNames.length === 0
    ) {
      setError(parsed.validationErrors.join(' '));
    }
  };

  const handleCsvUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    defaultField: 'owner' | 'description' | 'display_name' | 'model',
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text =
        typeof file.text === 'function'
          ? await file.text()
          : await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result || ''));
              reader.onerror = () =>
                reject(new Error('Failed to read CSV file.'));
              reader.readAsText(file);
            });
      applyCsvBulkFieldsText(text, file.name, defaultField);
    } catch (readErr: unknown) {
      setError(toErrorMessage(readErr, 'Failed to read uploaded CSV file.'));
    } finally {
      e.target.value = '';
    }
  };

  const handleDownloadCsvTemplate = (
    fieldType: 'owner' | 'description' | 'display_name' | 'model' | 'all',
  ) => {
    const targetList =
      selectedAgentsList.length > 0 ? selectedAgentsList : selectableAgents;
    const csvContent =
      fieldType === 'owner'
        ? api.generateAgentOwnerRemapTemplateCsv(targetList)
        : api.generateAgentBulkFieldsTemplateCsv(targetList, fieldType);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ge-agents-${fieldType}-remap-${config.appId || 'engine'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearOwnerRemaps = () => {
    setOwnerRemapByAgent({});
    setDefaultTargetOwner('');
    setCsvParseSummary(null);
    setCsvFileName('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (selectedAgentsList.length === 0) {
      setError('Select at least one agent in Step 1 to bulk update.');
      return;
    }

    if (!hasAnyOperationSelected) {
      setError(
        'Select at least one bulk Edit, Share, Owner Remap, or Publish change to apply.',
      );
      return;
    }

    const hasPerAgentDescriptions = Object.values(descriptionRemapByAgent).some(
      (v) => Boolean((v || '').trim()),
    );
    if (
      selectedModules.has('metadata') &&
      descriptionMode !== 'UNCHANGED' &&
      !descriptionText.trim() &&
      !hasPerAgentDescriptions
    ) {
      setError(
        'Enter description text when Description Update Mode is set to Prefix, Suffix, or Replace.',
      );
      return;
    }

    if (
      selectedModules.has('sharing') &&
      sharingScope !== 'PRIVATE' &&
      parsedPrincipals.length > 0
    ) {
      for (const raw of parsedPrincipals) {
        try {
          api.formatSharedIamPrincipal(raw);
        } catch (validationErr: unknown) {
          setError(toErrorMessage(validationErr));
          return;
        }
      }
    }

    if (selectedModules.has('owner')) {
      if (defaultTargetOwner.trim()) {
        try {
          api.formatTransferTargetPrincipal(defaultTargetOwner.trim());
        } catch (ownerErr: unknown) {
          setError(toErrorMessage(ownerErr));
          return;
        }
      }
      for (const agent of selectedAgentsList) {
        const individualOwner = (ownerRemapByAgent[agent.name] || '').trim();
        if (individualOwner) {
          try {
            api.formatTransferTargetPrincipal(individualOwner);
          } catch (ownerErr: unknown) {
            setError(`${agent.displayName}: ${toErrorMessage(ownerErr)}`);
            return;
          }
        }
      }
    }

    setIsSubmitting(true);
    setReport(null);
    setProgress({
      completed: 0,
      total: selectedAgentsList.length,
      latestName: selectedAgentsList[0].displayName,
    });

    try {
      const options: BulkEditSharePublishOptions = {
        publishDrafts: selectedModules.has('publish') ? publishDrafts : false,
        lifecycleAction: selectedModules.has('publish')
          ? lifecycleAction
          : 'NONE',
        autoClaimOwnershipOn403,
        deleteOriginalPrivateClone,
        sharingScope: selectedModules.has('sharing')
          ? sharingScope
          : 'UNCHANGED',
        sharedPrincipals:
          selectedModules.has('sharing') && sharingScope !== 'PRIVATE'
            ? parsedPrincipals
            : [],
        sharedPrincipalMode,
        ownerRemapByAgent: selectedModules.has('owner')
          ? ownerRemapByAgent
          : undefined,
        defaultTargetOwner:
          selectedModules.has('owner') && defaultTargetOwner.trim()
            ? defaultTargetOwner.trim()
            : undefined,
        previousOwnerDisposition,
        displayNameRemapByAgent: selectedModules.has('metadata')
          ? displayNameRemapByAgent
          : undefined,
        descriptionRemapByAgent: selectedModules.has('metadata')
          ? descriptionRemapByAgent
          : undefined,
        descriptionMode: selectedModules.has('metadata')
          ? descriptionMode
          : 'UNCHANGED',
        descriptionText: selectedModules.has('metadata')
          ? descriptionText.trim()
          : '',
        observabilityEnabled: selectedModules.has('observability')
          ? observabilityEnabled
          : 'UNCHANGED',
        sensitiveLoggingEnabled: selectedModules.has('observability')
          ? sensitiveLoggingEnabled
          : 'UNCHANGED',
        lowCodeModel: selectedModules.has('model')
          ? lowCodeModel
          : '__UNCHANGED__',
        lowCodeModelRemapByAgent: selectedModules.has('model')
          ? lowCodeModelRemapByAgent
          : undefined,
        onProgress: (
          completed: number,
          total: number,
          latest: BulkEditSharePublishAgentOutcome,
        ) => {
          setProgress({
            completed,
            total,
            latestName: latest.displayName,
          });
        },
      };

      const res = await api.bulkEditSharePublishAgents(
        selectedAgentsList,
        options,
        config,
      );
      setReport(res);
      onComplete(res);
    } catch (err: unknown) {
      setError(toErrorMessage(err, 'Bulk update failed.'));
    } finally {
      setIsSubmitting(false);
      setProgress(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/75 flex justify-center items-center z-50 p-4"
      aria-labelledby="bulk-edit-share-publish-modal-title"
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={containerRef}
        data-testid="bulk-edit-share-publish-modal"
        className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col border border-gray-700"
      >
        <form onSubmit={handleSubmit} className="flex flex-col h-full min-h-0">
          {/* Header & Stepper Navigation */}
          <div className="p-5 border-b border-gray-700 space-y-4 bg-gray-900/50">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3
                  id="bulk-edit-share-publish-modal-title"
                  className="text-xl font-bold text-white flex items-center gap-2"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6 text-indigo-400 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                  Bulk Edit, Share &amp; Publish Wizard
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  Follow the 3 guided steps below: select target agents, choose
                  which properties to edit, and configure or upload a CSV to
                  auto-fill changes.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="text-gray-400 hover:text-white text-sm font-medium"
                aria-label="Close modal"
              >
                &#10005;
              </button>
            </div>

            {/* Interactive 3-Step Wizard Stepper */}
            <div
              role="tablist"
              aria-label="Bulk Edit Wizard Steps"
              className="grid grid-cols-3 gap-2"
            >
              {(
                [
                  {
                    num: 1 as WizardStep,
                    title: 'Step 1: Select Agents',
                    subtitle: `${selectedAgentsList.length} of ${selectableAgents.length} selected`,
                    testId: 'wizard-step-1-btn',
                  },
                  {
                    num: 2 as WizardStep,
                    title: 'Step 2: Choose What to Edit',
                    subtitle: `${selectedModules.size} edit category(s) chosen`,
                    testId: 'wizard-step-2-btn',
                  },
                  {
                    num: 3 as WizardStep,
                    title: 'Step 3: Make Edits & Apply',
                    subtitle:
                      activeOwnerRemapCount > 0
                        ? `${activeOwnerRemapCount} owner remap(s) ready`
                        : 'Configure & execute changes',
                    testId: 'wizard-step-3-btn',
                  },
                ] as const
              ).map((s) => {
                const isActive = step === s.num;
                const isCompleted = step > s.num;
                return (
                  <button
                    key={s.num}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    data-testid={s.testId}
                    disabled={isSubmitting}
                    onClick={() => setStep(s.num)}
                    className={`flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all ${
                      isActive
                        ? 'bg-indigo-950/70 border-indigo-500 text-white shadow'
                        : isCompleted
                          ? 'bg-emerald-950/30 border-emerald-600/50 text-emerald-200 hover:bg-emerald-950/50'
                          : 'bg-gray-800/70 border-gray-700 text-gray-300 hover:bg-gray-800'
                    }`}
                  >
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        isActive
                          ? 'bg-indigo-500 text-white'
                          : isCompleted
                            ? 'bg-emerald-600 text-white'
                            : 'bg-gray-700 text-gray-300'
                      }`}
                    >
                      {isCompleted ? '✓' : s.num}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">{s.title}</div>
                      <div className="text-[11px] text-gray-400 truncate">
                        {s.subtitle}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scrollable Wizard Body */}
          <div className="p-5 space-y-5 overflow-y-auto flex-1">
            {/* Hidden file inputs so CSV upload works from any step */}
            <input
              ref={ownerCsvInputRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              data-testid="modal-owner-remap-csv-input"
              aria-label="Upload Owner Remap CSV"
              disabled={isSubmitting}
              onChange={(e) => handleCsvUpload(e, 'owner')}
              className="hidden"
            />
            <input
              ref={metadataCsvInputRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              data-testid="modal-metadata-remap-csv-input"
              aria-label="Upload Metadata Remap CSV"
              disabled={isSubmitting}
              onChange={(e) => handleCsvUpload(e, 'description')}
              className="hidden"
            />
            <input
              ref={modelCsvInputRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              data-testid="modal-model-remap-csv-input"
              aria-label="Upload Model Remap CSV"
              disabled={isSubmitting}
              onChange={(e) => handleCsvUpload(e, 'model')}
              className="hidden"
            />

            {/* ====================================================================
                STEP 1: SELECT AGENTS TO EDIT
               ==================================================================== */}
            {step === 1 && (
              <div
                data-testid="wizard-step-1-panel"
                className="bg-gray-900/60 border border-gray-700 rounded-lg p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      Step 1: Select the Agents You Want to Edit (
                      {selectedAgentsList.length} of {selectableAgents.length}{' '}
                      selected)
                    </h4>
                    <p className="text-xs text-gray-400">
                      Choose the custom agents to include, or upload an{' '}
                      <code className="font-mono text-emerald-300">
                        agent_id,new_owner
                      </code>{' '}
                      CSV to automatically select and map matching agents.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      data-testid="step1-upload-owner-csv-btn"
                      onClick={() => ownerCsvInputRef.current?.click()}
                      disabled={isSubmitting}
                      className="px-2.5 py-1.5 text-xs font-semibold rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-200 border border-emerald-500/40 transition-colors"
                    >
                      Upload CSV to Auto-Select &amp; Fill
                    </button>
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      disabled={isSubmitting || selectableAgents.length === 0}
                      className="px-2.5 py-1.5 text-xs font-semibold rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
                    >
                      {selectedNames.size === selectableAgents.length
                        ? 'Deselect All'
                        : 'Select All'}
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={step1Search}
                    onChange={(e) => setStep1Search(e.target.value)}
                    placeholder="Filter agents by display name, ID, or current owner..."
                    aria-label="Filter selectable agents"
                    className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div className="max-h-72 overflow-y-auto border border-gray-700 rounded-lg divide-y divide-gray-800">
                  {filteredStep1Agents.map((agent) => {
                    const checked = selectedNames.has(agent.name);
                    const shortId = agent.name.split('/').pop() || agent.name;
                    const stateLabel = agent.state || 'PRIVATE';
                    const scopeLabel =
                      agent.state === 'ENABLED' || agent.state === 'DISABLED'
                        ? agent.sharingConfig?.scope === 'ALL_USERS'
                          ? 'All Users'
                          : 'Restricted'
                        : 'Private';
                    const currentOwner =
                      api.extractAgentOwnerHint(agent) || 'Unassigned / Private';

                    return (
                      <label
                        key={agent.name}
                        className={`flex items-center justify-between gap-3 px-3 py-2 text-xs cursor-pointer transition-colors ${
                          checked
                            ? 'bg-indigo-950/40 text-white'
                            : 'bg-gray-800/40 text-gray-400 hover:bg-gray-800/80'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={isSubmitting}
                            onChange={() => handleToggleAgent(agent.name)}
                            className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-indigo-500 focus:ring-indigo-500 shrink-0"
                          />
                          <div className="min-w-0 truncate">
                            <span className="font-semibold text-white">
                              {agent.displayName}
                            </span>
                            <span className="ml-2 font-mono text-[11px] text-gray-400">
                              ({shortId})
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] font-mono text-cyan-300/90 hidden sm:inline">
                            Owner: {currentOwner}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-gray-900 text-gray-300 border border-gray-700">
                            {stateLabel} · {scopeLabel}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ====================================================================
                STEP 2: CHOOSE WHAT YOU WANT TO EDIT
               ==================================================================== */}
            {step === 2 && (
              <div
                data-testid="wizard-step-2-panel"
                className="bg-gray-900/60 border border-gray-700 rounded-lg p-4 space-y-4"
              >
                <div>
                  <h4 className="text-sm font-bold text-white">
                    Step 2: Choose What You Want to Edit (
                    {selectedModules.size} selected)
                  </h4>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Select one or more categories to configure in Step 3. Only
                    the categories you select here will be shown on the next
                    screen.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {BULK_EDIT_MODULES.map((mod) => {
                    const isChecked = selectedModules.has(mod.id);
                    return (
                      <label
                        key={mod.id}
                        data-testid={`wizard-module-card-${mod.id}`}
                        className={`flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-all ${
                          isChecked
                            ? 'bg-indigo-950/50 border-indigo-500 text-white shadow'
                            : 'bg-gray-800/60 border-gray-700 text-gray-300 hover:border-gray-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleModule(mod.id)}
                          className="mt-1 h-4 w-4 rounded bg-gray-700 border-gray-600 text-indigo-500 focus:ring-indigo-500 shrink-0"
                        />
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-white">
                              {mod.title}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-900 text-indigo-300 border border-gray-700">
                              {mod.badge}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-400 leading-relaxed">
                            {mod.description}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ====================================================================
                STEP 3: MAKE THE EDITS (FOCUSED ON CHOSEN MODULES)
               ==================================================================== */}
            {step === 3 && (
              <div data-testid="wizard-step-3-panel" className="space-y-5">
                {csvParseSummary && (
                  <div
                    data-testid="modal-csv-parse-summary"
                    className="p-3 bg-gray-950/80 border border-emerald-500/40 rounded-lg text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-emerald-300">
                        CSV Loaded ({csvFileName}): Matched{' '}
                        {csvParseSummary.matchedAgentNames.length} agent
                        {csvParseSummary.matchedAgentNames.length === 1
                          ? ''
                          : 's'}{' '}
                        and auto-populated below
                      </span>
                      <button
                        type="button"
                        onClick={() => setCsvParseSummary(null)}
                        className="text-gray-400 hover:text-white text-[11px]"
                      >
                        Dismiss
                      </button>
                    </div>
                    {csvParseSummary.unmatchedRows.length > 0 && (
                      <p className="text-amber-300 text-[11px]">
                        Unmatched CSV rows (
                        {csvParseSummary.unmatchedRows.length}):{' '}
                        {csvParseSummary.unmatchedRows.join('; ')}
                      </p>
                    )}
                    {csvParseSummary.validationErrors.length > 0 && (
                      <p className="text-red-300 text-[11px]">
                        Validation warnings:{' '}
                        {csvParseSummary.validationErrors.join(' ')}
                      </p>
                    )}
                  </div>
                )}

                {/* MODULE A: OWNER REMAPPING TABLE (Agent | Current Owner | New Owner) */}
                {selectedModules.has('owner') && (
                  <div
                    data-testid="wizard-editor-owner"
                    className="bg-gray-900/50 border border-emerald-500/30 rounded-lg p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 pb-2.5">
                      <div>
                        <h4 className="text-sm font-bold text-emerald-300 uppercase tracking-wider">
                          Owner Remapping (Agent &rarr; Current Owner &rarr; New
                          Owner)
                        </h4>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Manually enter the new owner per agent below, set a
                          uniform owner, or upload a CSV of{' '}
                          <code className="font-mono text-emerald-300">
                            agent_id,new_owner
                          </code>{' '}
                          to auto-fill.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {(Object.keys(ownerRemapByAgent).length > 0 ||
                          defaultTargetOwner.trim()) && (
                          <button
                            type="button"
                            onClick={handleClearOwnerRemaps}
                            disabled={isSubmitting}
                            className="px-2.5 py-1.5 text-xs font-semibold rounded bg-amber-900/40 hover:bg-amber-900/60 text-amber-200 border border-amber-700/50 transition-colors"
                          >
                            Clear Owner Edits
                          </button>
                        )}
                        <button
                          type="button"
                          data-testid="modal-upload-owner-csv-btn"
                          onClick={() => ownerCsvInputRef.current?.click()}
                          disabled={isSubmitting}
                          className="px-2.5 py-1.5 text-xs font-semibold rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-200 border border-emerald-500/40 transition-colors"
                        >
                          Upload Agent &rarr; Owner CSV
                        </button>
                        <button
                          type="button"
                          data-testid="modal-download-owner-csv-template-btn"
                          onClick={() => handleDownloadCsvTemplate('owner')}
                          disabled={isSubmitting}
                          className="px-2.5 py-1.5 text-xs font-semibold rounded bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-600 transition-colors"
                        >
                          Download Template CSV
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="md:col-span-2">
                        <label
                          htmlFor="bulk-default-target-owner"
                          className="block text-xs font-medium text-gray-300 mb-1"
                        >
                          Uniform New Owner for All Selected Agents (Optional —
                          overridden by per-agent rows below)
                        </label>
                        <input
                          id="bulk-default-target-owner"
                          type="text"
                          value={defaultTargetOwner}
                          disabled={isSubmitting}
                          onChange={(e) =>
                            setDefaultTargetOwner(e.target.value)
                          }
                          placeholder="e.g. new-owner@company.com or principal://iam.googleapis.com/locations/global/workforcePools/..."
                          className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-1.5 text-xs text-white font-mono placeholder-gray-500 focus:ring-emerald-500 focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="bulk-previous-owner-disposition"
                          className="block text-xs font-medium text-gray-300 mb-1"
                        >
                          Previous Owner Access
                        </label>
                        <select
                          id="bulk-previous-owner-disposition"
                          value={previousOwnerDisposition}
                          disabled={isSubmitting}
                          onChange={(e) =>
                            setPreviousOwnerDisposition(
                              e.target.value as PreviousOwnerDisposition,
                            )
                          }
                          className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-1.5 text-xs text-white focus:ring-emerald-500 focus:border-emerald-500"
                        >
                          <option value="KEEP_AS_AGENT_USER">
                            Keep previous owner as Agent User
                          </option>
                          <option value="REMOVE">
                            Revoke previous owner access (REMOVE)
                          </option>
                        </select>
                      </div>
                    </div>

                    {/* Side-by-side Table: Agent | Current Owner | New Owner */}
                    <div className="max-h-56 overflow-y-auto border border-gray-700 rounded-lg">
                      <table className="min-w-full divide-y divide-gray-800 text-xs">
                        <thead className="bg-gray-950/70 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-gray-300">
                              Agent
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-300">
                              Current Owner
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-300">
                              New Owner (Email or Workforce Principal)
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800 bg-gray-900/40">
                          {selectedAgentsList.map((agent) => {
                            const shortId =
                              agent.name.split('/').pop() || agent.name;
                            const currentOwner =
                              api.extractAgentOwnerHint(agent) || 'Unassigned';
                            const mappedOwnerValue =
                              ownerRemapByAgent[agent.name] || '';

                            return (
                              <tr key={agent.name}>
                                <td className="px-3 py-2 align-middle">
                                  <div className="font-semibold text-white">
                                    {agent.displayName}
                                  </div>
                                  <div className="text-[11px] font-mono text-gray-400">
                                    {shortId}
                                  </div>
                                </td>
                                <td className="px-3 py-2 align-middle font-mono text-cyan-300">
                                  {currentOwner}
                                </td>
                                <td className="px-3 py-2 align-middle">
                                  <input
                                    type="text"
                                    aria-label={`New owner for ${agent.displayName}`}
                                    data-testid={`modal-owner-remap-input-${shortId}`}
                                    value={mappedOwnerValue}
                                    disabled={isSubmitting}
                                    onChange={(e) =>
                                      handleAgentOwnerInputChange(
                                        agent.name,
                                        e.target.value,
                                      )
                                    }
                                    placeholder={
                                      defaultTargetOwner.trim()
                                        ? `Default: ${defaultTargetOwner.trim()}`
                                        : 'Enter new owner email / principal...'
                                    }
                                    className={`w-full bg-gray-900 border rounded px-2.5 py-1.5 text-xs font-mono text-white placeholder-gray-500 focus:ring-emerald-500 focus:border-emerald-500 ${
                                      mappedOwnerValue.trim()
                                        ? 'border-emerald-500 bg-emerald-950/30'
                                        : 'border-gray-700'
                                    }`}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* MODULE B: SHARING SCOPE & IAM ACCESS */}
                {selectedModules.has('sharing') && (
                  <div
                    data-testid="wizard-editor-sharing"
                    className="bg-gray-900/50 border border-gray-700 rounded-lg p-4 space-y-3"
                  >
                    <div className="text-sm font-bold text-emerald-300 uppercase tracking-wider border-b border-gray-800 pb-2">
                      Sharing Scope &amp; IAM Access
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                      {(
                        [
                          {
                            value: 'UNCHANGED',
                            title: 'Keep Current Scope',
                            desc: 'Do not change sharingConfig.scope',
                          },
                          {
                            value: 'ALL_USERS',
                            title: 'All Users in App',
                            desc: 'Share with everyone in this GE app (ALL_USERS)',
                          },
                          {
                            value: 'RESTRICTED',
                            title: 'Restricted IAM',
                            desc: 'Shared only with owner & IAM principals',
                          },
                          {
                            value: 'PRIVATE',
                            title: 'Withdraw to Private',
                            desc: 'Unshare via :withdrawAgent (Creator Only)',
                          },
                        ] as const
                      ).map((opt) => (
                        <label
                          key={opt.value}
                          className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                            sharingScope === opt.value
                              ? 'bg-emerald-950/30 border-emerald-500/80 text-white'
                              : 'bg-gray-900/50 border-gray-700 text-gray-300 hover:border-gray-600'
                          }`}
                        >
                          <input
                            type="radio"
                            name="bulkSharingScope"
                            value={opt.value}
                            checked={sharingScope === opt.value}
                            disabled={isSubmitting}
                            onChange={() => setSharingScope(opt.value)}
                            className="mt-1 text-emerald-500 focus:ring-emerald-500"
                          />
                          <div>
                            <div className="text-xs font-semibold">
                              {opt.title}
                            </div>
                            <div className="text-[11px] text-gray-400 mt-0.5">
                              {opt.desc}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>

                    {sharingScope !== 'PRIVATE' && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                        <div className="md:col-span-2">
                          <label
                            htmlFor="bulk-shared-principals"
                            className="block text-xs font-medium text-gray-300 mb-1"
                          >
                            Grant IAM Principals (
                            <code className="font-mono text-emerald-300">
                              roles/discoveryengine.agentUser
                            </code>
                            ) — Optional
                          </label>
                          <input
                            id="bulk-shared-principals"
                            type="text"
                            value={sharedPrincipalsInput}
                            disabled={isSubmitting}
                            onChange={(e) =>
                              setSharedPrincipalsInput(e.target.value)
                            }
                            placeholder="alice@company.com, group:eng@company.com, domain:company.com"
                            className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-xs text-white font-mono placeholder-gray-500 focus:ring-emerald-500 focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="bulk-principal-mode"
                            className="block text-xs font-medium text-gray-300 mb-1"
                          >
                            IAM Binding Mode
                          </label>
                          <select
                            id="bulk-principal-mode"
                            value={sharedPrincipalMode}
                            disabled={isSubmitting}
                            onChange={(e) =>
                              setSharedPrincipalMode(
                                e.target.value as 'APPEND' | 'REPLACE',
                              )
                            }
                            className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-xs text-white focus:ring-emerald-500 focus:border-emerald-500"
                          >
                            <option value="APPEND">
                              Append to existing agentUser bindings
                            </option>
                            <option value="REPLACE">
                              Replace existing agentUser bindings
                            </option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* MODULE C: PUBLISH DRAFTS & LIFECYCLE STATUS */}
                {selectedModules.has('publish') && (
                  <div
                    data-testid="wizard-editor-publish"
                    className="bg-gray-900/50 border border-gray-700 rounded-lg p-4 space-y-3"
                  >
                    <div className="text-sm font-bold text-cyan-300 uppercase tracking-wider border-b border-gray-800 pb-2">
                      Publish / Deploy Drafts &amp; Lifecycle Status
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2.5">
                        <label className="flex items-start gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={publishDrafts}
                            disabled={isSubmitting}
                            onChange={(e) => setPublishDrafts(e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded bg-gray-700 border-gray-600 text-indigo-500 focus:ring-indigo-500"
                          />
                          <div>
                            <span className="text-sm font-semibold text-white">
                              Publish / Deploy No-Code &amp; Workflow Drafts
                            </span>
                            <p className="text-xs text-gray-400 mt-0.5">
                              Calls{' '}
                              <code className="font-mono">:deployLowCode</code>{' '}
                              on Low-Code agents and{' '}
                              <code className="font-mono">:publish</code> on
                              Workflow / Skill agents.
                            </p>
                          </div>
                        </label>

                        <label className="flex items-start gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={autoClaimOwnershipOn403}
                            disabled={isSubmitting}
                            onChange={(e) =>
                              setAutoClaimOwnershipOn403(e.target.checked)
                            }
                            className="mt-0.5 h-4 w-4 rounded bg-gray-700 border-gray-600 text-indigo-500 focus:ring-indigo-500"
                          />
                          <div>
                            <span className="text-xs font-semibold text-gray-200">
                              Auto-recover 403 Ownership Restrictions (Admin)
                            </span>
                            <p className="text-[11px] text-gray-400">
                              Auto-claims ownership on shared agents or clones
                              locked private drafts when 403 occurs.
                            </p>
                          </div>
                        </label>

                        {autoClaimOwnershipOn403 && (
                          <label className="flex items-start gap-2.5 pl-6 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={deleteOriginalPrivateClone}
                              disabled={isSubmitting}
                              onChange={(e) =>
                                setDeleteOriginalPrivateClone(e.target.checked)
                              }
                              className="mt-0.5 h-3.5 w-3.5 rounded bg-gray-700 border-gray-600 text-amber-500 focus:ring-amber-500"
                            />
                            <span className="text-xs text-gray-300">
                              Delete original{' '}
                              <code className="font-mono">PRIVATE</code> draft
                              if an Admin clone is required
                            </span>
                          </label>
                        )}
                      </div>

                      <div>
                        <label
                          htmlFor="bulk-lifecycle-action"
                          className="block text-xs font-medium text-gray-300 mb-1"
                        >
                          Agent Status (Enable / Disable)
                        </label>
                        <select
                          id="bulk-lifecycle-action"
                          value={lifecycleAction}
                          disabled={isSubmitting}
                          onChange={(e) =>
                            setLifecycleAction(
                              e.target.value as 'NONE' | 'ENABLE' | 'DISABLE',
                            )
                          }
                          className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-sm text-white focus:ring-indigo-500 focus:border-indigo-500"
                        >
                          <option value="NONE">Keep Current Status</option>
                          <option value="ENABLE">
                            Enable All Selected (:enableAgent)
                          </option>
                          <option value="DISABLE">
                            Disable All Selected (:disableAgent)
                          </option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* MODULE D: METADATA & DESCRIPTIONS (Per-Agent Table + CSV + Uniform Prefix/Suffix) */}
                {selectedModules.has('metadata') && (
                  <div
                    data-testid="wizard-editor-metadata"
                    className="bg-gray-900/50 border border-purple-500/30 rounded-lg p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 pb-2">
                      <div>
                        <h4 className="text-sm font-bold text-purple-300 uppercase tracking-wider">
                          Display Names &amp; Descriptions (Per-Agent Table or
                          Uniform Rule)
                        </h4>
                        <p className="text-xs text-gray-400">
                          Edit display names and descriptions per agent, upload
                          a CSV, or apply a uniform description prefix/suffix.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => metadataCsvInputRef.current?.click()}
                          disabled={isSubmitting}
                          className="px-2.5 py-1.5 text-xs font-semibold rounded bg-purple-600/20 hover:bg-purple-600/30 text-purple-200 border border-purple-500/40"
                        >
                          Upload Metadata CSV
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleDownloadCsvTemplate('description')
                          }
                          disabled={isSubmitting}
                          className="px-2.5 py-1.5 text-xs font-semibold rounded bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-600"
                        >
                          Download Template CSV
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label
                          htmlFor="bulk-description-mode"
                          className="block text-xs font-medium text-gray-300 mb-1"
                        >
                          Description Update Mode
                        </label>
                        <select
                          id="bulk-description-mode"
                          value={descriptionMode}
                          disabled={isSubmitting}
                          onChange={(e) =>
                            setDescriptionMode(
                              e.target.value as
                                | 'UNCHANGED'
                                | 'PREFIX'
                                | 'SUFFIX'
                                | 'REPLACE',
                            )
                          }
                          className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-xs text-white focus:ring-purple-500 focus:border-purple-500"
                        >
                          <option value="UNCHANGED">
                            Keep Existing (or Use Per-Agent Table Below)
                          </option>
                          <option value="PREFIX">
                            Prepend Prefix to Description
                          </option>
                          <option value="SUFFIX">
                            Append Suffix to Description
                          </option>
                          <option value="REPLACE">
                            Replace Entire Description
                          </option>
                        </select>
                      </div>

                      <div className="md:col-span-2">
                        <label
                          htmlFor="bulk-description-text"
                          className="block text-xs font-medium text-gray-300 mb-1"
                        >
                          Description Text
                        </label>
                        <input
                          id="bulk-description-text"
                          type="text"
                          value={descriptionText}
                          disabled={
                            isSubmitting || descriptionMode === 'UNCHANGED'
                          }
                          onChange={(e) => setDescriptionText(e.target.value)}
                          placeholder={
                            descriptionMode === 'UNCHANGED'
                              ? 'Select Prefix, Suffix, or Replace, or edit individual rows below...'
                              : 'e.g. [Verified Enterprise Agent]'
                          }
                          className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-xs text-white placeholder-gray-500 disabled:opacity-50"
                        />
                      </div>
                    </div>

                    <div className="max-h-48 overflow-y-auto border border-gray-700 rounded-lg">
                      <table className="min-w-full divide-y divide-gray-800 text-xs">
                        <thead className="bg-gray-950/70 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-gray-300">
                              Agent (Current Name &amp; Description)
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-300">
                              New Display Name (Optional)
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-300">
                              New Description (Optional)
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800 bg-gray-900/40">
                          {selectedAgentsList.map((agent) => {
                            const shortId =
                              agent.name.split('/').pop() || agent.name;
                            const curDesc =
                              agent.description ||
                              agent.lowCodeAgentDefinition?.draftDescription ||
                              '';
                            return (
                              <tr key={agent.name}>
                                <td className="px-3 py-2 align-middle">
                                  <div className="font-semibold text-white">
                                    {agent.displayName}
                                  </div>
                                  <div className="text-[11px] text-gray-400 truncate max-w-xs">
                                    {curDesc || 'No description'}
                                  </div>
                                </td>
                                <td className="px-3 py-2 align-middle">
                                  <input
                                    type="text"
                                    aria-label={`New display name for ${agent.displayName}`}
                                    data-testid={`modal-display-name-remap-${shortId}`}
                                    value={
                                      displayNameRemapByAgent[agent.name] || ''
                                    }
                                    disabled={isSubmitting}
                                    onChange={(e) =>
                                      handleAgentDisplayNameInputChange(
                                        agent.name,
                                        e.target.value,
                                      )
                                    }
                                    placeholder={agent.displayName}
                                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white placeholder-gray-500"
                                  />
                                </td>
                                <td className="px-3 py-2 align-middle">
                                  <input
                                    type="text"
                                    aria-label={`New description for ${agent.displayName}`}
                                    data-testid={`modal-description-remap-${shortId}`}
                                    value={
                                      descriptionRemapByAgent[agent.name] || ''
                                    }
                                    disabled={isSubmitting}
                                    onChange={(e) =>
                                      handleAgentDescriptionInputChange(
                                        agent.name,
                                        e.target.value,
                                      )
                                    }
                                    placeholder={
                                      curDesc || 'Enter new description...'
                                    }
                                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white placeholder-gray-500"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* MODULE E: LLM MODEL OVERRIDE (Per-Agent Table + CSV + Uniform Model) */}
                {selectedModules.has('model') && (
                  <div
                    data-testid="wizard-editor-model"
                    className="bg-gray-900/50 border border-purple-500/30 rounded-lg p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 pb-2">
                      <div>
                        <h4 className="text-sm font-bold text-purple-300 uppercase tracking-wider">
                          No-Code / Workflow LLM Model Remapping
                        </h4>
                        <p className="text-xs text-gray-400">
                          Assign a uniform LLM model or override per agent row /
                          CSV.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => modelCsvInputRef.current?.click()}
                          disabled={isSubmitting}
                          className="px-2.5 py-1.5 text-xs font-semibold rounded bg-purple-600/20 hover:bg-purple-600/30 text-purple-200 border border-purple-500/40"
                        >
                          Upload Model CSV
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadCsvTemplate('model')}
                          disabled={isSubmitting}
                          className="px-2.5 py-1.5 text-xs font-semibold rounded bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-600"
                        >
                          Download Template CSV
                        </button>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="bulk-lowcode-model"
                        className="block text-xs font-medium text-gray-300 mb-1"
                      >
                        No-Code / Workflow LLM Model
                      </label>
                      <select
                        id="bulk-lowcode-model"
                        value={lowCodeModel}
                        disabled={isSubmitting}
                        onChange={(e) => setLowCodeModel(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-xs text-white"
                      >
                        <option value="__UNCHANGED__">
                          Keep Current Model (or Use Per-Agent Overrides Below)
                        </option>
                        <option value="">
                          Auto (Gemini Enterprise Default Model)
                        </option>
                        {STANDARD_ENTERPRISE_MODELS.map((m) => (
                          <option key={m.id} value={m.id}>
                            {formatModelDisplayName(m.id)} ({m.id})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="max-h-48 overflow-y-auto border border-gray-700 rounded-lg">
                      <table className="min-w-full divide-y divide-gray-800 text-xs">
                        <thead className="bg-gray-950/70 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-gray-300">
                              Agent
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-300">
                              Current Model
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-300">
                              New Target Model
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800 bg-gray-900/40">
                          {selectedAgentsList.map((agent) => {
                            const shortId =
                              agent.name.split('/').pop() || agent.name;
                            const curModel =
                              api.extractAgentCurrentModelHint(agent) ||
                              'Auto (Default)';
                            return (
                              <tr key={agent.name}>
                                <td className="px-3 py-2 align-middle font-semibold text-white">
                                  {agent.displayName}
                                </td>
                                <td className="px-3 py-2 align-middle font-mono text-gray-300">
                                  {curModel}
                                </td>
                                <td className="px-3 py-2 align-middle">
                                  <select
                                    aria-label={`New model for ${agent.displayName}`}
                                    data-testid={`modal-model-remap-${shortId}`}
                                    value={
                                      lowCodeModelRemapByAgent[agent.name] || ''
                                    }
                                    disabled={isSubmitting}
                                    onChange={(e) =>
                                      handleAgentModelInputChange(
                                        agent.name,
                                        e.target.value,
                                      )
                                    }
                                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white font-mono"
                                  >
                                    <option value="">
                                      Use Uniform Selection Above
                                    </option>
                                    <option value="__AUTO__">
                                      Auto (Engine Default)
                                    </option>
                                    {STANDARD_ENTERPRISE_MODELS.map((m) => (
                                      <option key={m.id} value={m.id}>
                                        {formatModelDisplayName(m.id)} ({m.id})
                                      </option>
                                    ))}
                                  </select>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* MODULE F: OBSERVABILITY & SENSITIVE LOGGING */}
                {selectedModules.has('observability') && (
                  <div
                    data-testid="wizard-editor-observability"
                    className="bg-gray-900/50 border border-cyan-500/30 rounded-lg p-4 space-y-3"
                  >
                    <div className="text-sm font-bold text-cyan-300 uppercase tracking-wider border-b border-gray-800 pb-2">
                      Observability &amp; Sensitive Logging
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="bulk-observability-enabled"
                          className="block text-xs font-medium text-gray-300 mb-1"
                        >
                          Observability Telemetry
                        </label>
                        <select
                          id="bulk-observability-enabled"
                          value={observabilityEnabled}
                          disabled={isSubmitting}
                          onChange={(e) =>
                            setObservabilityEnabled(
                              e.target.value as
                                | 'UNCHANGED'
                                | 'ENABLE'
                                | 'DISABLE',
                            )
                          }
                          className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-xs text-white"
                        >
                          <option value="UNCHANGED">
                            Keep Current Setting
                          </option>
                          <option value="ENABLE">Enable Observability</option>
                          <option value="DISABLE">Disable Observability</option>
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor="bulk-sensitive-logging"
                          className="block text-xs font-medium text-gray-300 mb-1"
                        >
                          Sensitive Prompt/Response Logging
                        </label>
                        <select
                          id="bulk-sensitive-logging"
                          value={sensitiveLoggingEnabled}
                          disabled={isSubmitting}
                          onChange={(e) =>
                            setSensitiveLoggingEnabled(
                              e.target.value as
                                | 'UNCHANGED'
                                | 'ENABLE'
                                | 'DISABLE',
                            )
                          }
                          className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-xs text-white"
                        >
                          <option value="UNCHANGED">
                            Keep Current Setting
                          </option>
                          <option value="ENABLE">
                            Enable Sensitive Logging
                          </option>
                          <option value="DISABLE">
                            Disable Sensitive Logging
                          </option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* MODULE G: DATASTORE & CONNECTOR SWAP */}
                {selectedModules.has('datasources') && (
                  <div className="bg-gray-900/50 border border-amber-500/30 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-amber-300 uppercase tracking-wider">
                        Datastore &amp; VPC-SC Connector Bulk Updates
                      </h4>
                      <p className="text-xs text-gray-400 mt-1">
                        Swap, migrate, add, or remove Data Connectors and Data
                        Stores across selected Low-Code &amp; Workflow agents
                        with live blast-radius diff preview.
                      </p>
                    </div>
                    {onOpenBulkDatasources && (
                      <button
                        type="button"
                        onClick={onOpenBulkDatasources}
                        disabled={isSubmitting}
                        data-testid="modal-open-bulk-datasources-btn"
                        className="px-3.5 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-200 border border-amber-500/40 text-xs font-semibold rounded-md transition-colors shrink-0 whitespace-nowrap"
                      >
                        Open Datastore &amp; Connector Bulk Updater &rarr;
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Progress Banner */}
            {isSubmitting && progress && (
              <div className="p-3.5 bg-indigo-950/60 border border-indigo-600 rounded-lg flex items-center gap-3">
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-indigo-400 shrink-0" />
                <div className="text-xs text-indigo-100">
                  Processing{' '}
                  <span className="font-bold">
                    {progress.completed} / {progress.total}
                  </span>
                  : <span className="font-mono">{progress.latestName}</span>
                </div>
              </div>
            )}

            {/* Validation / Runtime Error Banner */}
            {error && (
              <div
                role="alert"
                className="p-3.5 bg-red-950/60 border border-red-700 rounded-lg text-xs text-red-200"
              >
                {error}
              </div>
            )}

            {/* Execution Summary Report */}
            {report && (
              <div
                data-testid="bulk-edit-share-publish-report"
                className="bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 pb-2.5">
                  <span className="text-sm font-bold text-white">
                    Bulk Operation Summary
                  </span>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-2 py-0.5 rounded bg-emerald-900/50 text-emerald-300 border border-emerald-700/60 font-semibold">
                      {report.updated} Updated
                    </span>
                    <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700 font-semibold">
                      {report.skipped} Unchanged
                    </span>
                    {report.failed > 0 && (
                      <span className="px-2 py-0.5 rounded bg-red-900/50 text-red-300 border border-red-700/60 font-semibold">
                        {report.failed} Failed
                      </span>
                    )}
                  </div>
                </div>

                <div className="max-h-48 overflow-y-auto divide-y divide-gray-800 text-xs">
                  {report.outcomes.map((item) => (
                    <div
                      key={item.agentName}
                      className="py-2 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-white truncate">
                          {item.displayName}
                        </div>
                        {item.actionsApplied.length > 0 && (
                          <div className="text-gray-300 mt-0.5">
                            {item.actionsApplied.join(' • ')}
                          </div>
                        )}
                        {item.warning && (
                          <div className="text-amber-300 mt-0.5">
                            {item.warning}
                          </div>
                        )}
                        {item.error && (
                          <div className="text-red-300 mt-0.5">
                            {item.error}
                          </div>
                        )}
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                          item.status === 'updated'
                            ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700/60'
                            : item.status === 'failed'
                              ? 'bg-red-900/50 text-red-300 border border-red-700/60'
                              : 'bg-gray-800 text-gray-400 border border-gray-700'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Wizard Footer */}
          <div className="p-4 border-t border-gray-700 bg-gray-900/60 flex items-center justify-between gap-3">
            <div className="text-xs text-gray-400">
              Step {step} of 3 · {selectedAgentsList.length} agent
              {selectedAgentsList.length === 1 ? '' : 's'} targeted
            </div>
            <div className="flex items-center gap-2.5">
              {step > 1 && (
                <button
                  type="button"
                  data-testid="wizard-back-btn"
                  onClick={() =>
                    setStep((prev) => (prev === 3 ? 2 : 1) as WizardStep)
                  }
                  disabled={isSubmitting}
                  className="px-3.5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-600 text-xs font-semibold rounded-md transition-colors"
                >
                  &larr; Back
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-semibold rounded-md transition-colors"
              >
                {report ? 'Done' : 'Cancel'}
              </button>

              {step === 1 && (
                <button
                  type="button"
                  data-testid="wizard-next-to-step-2-btn"
                  disabled={selectedAgentsList.length === 0}
                  onClick={() => {
                    setError(null);
                    setStep(2);
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 text-white text-xs font-semibold rounded-md transition-colors"
                >
                  Next: Choose What to Edit &rarr;
                </button>
              )}

              {step === 2 && (
                <button
                  type="button"
                  data-testid="wizard-next-to-step-3-btn"
                  disabled={selectedModules.size === 0}
                  onClick={() => {
                    setError(null);
                    setStep(3);
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 text-white text-xs font-semibold rounded-md transition-colors"
                >
                  Next: Make Edits ({selectedModules.size}) &rarr;
                </button>
              )}

              {step === 3 && (
                <button
                  type="submit"
                  disabled={isSubmitting || selectedAgentsList.length === 0}
                  data-testid="execute-bulk-edit-share-publish-btn"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 text-white text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5"
                >
                  {isSubmitting && (
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-b-2 border-white" />
                  )}
                  <span>
                    {isSubmitting
                      ? 'Applying Bulk Changes...'
                      : `Apply to ${selectedAgentsList.length} Agent${selectedAgentsList.length === 1 ? '' : 's'}`}
                  </span>
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BulkEditSharePublishModal;
