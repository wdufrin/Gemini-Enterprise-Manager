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

import React, { useState, useEffect, useMemo } from 'react';
import {
  Assistant,
  VertexAiAgentConfig,
  Config,
  ReasoningEngine,
  AppEngine,
  IamPolicy,
} from '../types';
import * as api from '../services/apiService';
import { ModelArmorTemplate } from '../services/apiService';
import { getCachedProjectEnrollment } from '../services/api/project';
import { useProjectEnrollment } from '../context/ProjectEnrollmentContext';
import {
  AssistantFormData,
  BannedPhraseItem,
  BannedPhraseMatchType,
  SDP_CONTENT_POLICY_REGEX,
} from '../components/assistants/form/types';
import { toErrorMessage } from '../utils/errors';
import {
  addMemberToRoles,
  buildCustomRestrictedRoleName,
  cloneIamPolicy,
  ensureCustomRestrictedProjectRole,
  extractDataStoreAccessControlEnabled,
  removeMemberFromRoles,
  retryIamReadModifyWrite,
} from '../utils/iamPolicy';

const isAppLevelIamRole = (role: string): boolean =>
  role === 'roles/discoveryengine.agentspaceUser' ||
  role === 'roles/discoveryengine.agentspaceAdmin' ||
  role === 'roles/discoveryengine.agentspaceViewer' ||
  role === 'roles/discoveryengine.user';

const SDP_FORMAT_ERROR =
  'Invalid Sensitive Data Protection policy format. Expected: projects/{project}/locations/{location}/contentPolicies/{id}';

function parsePolicySafe(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function extractSdpPolicyFromObj(policyObj: Record<string, unknown> | null): string {
  if (!policyObj) return '';
  const dp = policyObj.dataProtectionPolicy as
    | { sensitiveDataProtectionPolicy?: { policy?: unknown } }
    | undefined;
  const pol = dp?.sensitiveDataProtectionPolicy?.policy;
  return typeof pol === 'string' ? pol : '';
}

export function useAssistantDetailsForm(
  assistant: Assistant,
  config: Config,
  onUpdateSuccess: (updatedAssistant: Assistant) => void,
) {
  const {
    isGoogleInternal: ctxGoogleInternal,
    isTrustedTester: ctxTrustedTester,
  } = useProjectEnrollment();
  const cachedEnrollment = config.projectId
    ? getCachedProjectEnrollment(config.projectId)
    : undefined;
  const isGoogleInternal = Boolean(
    ctxGoogleInternal || cachedEnrollment?.googleInternal,
  );
  const isTrustedTester = Boolean(
    ctxTrustedTester || cachedEnrollment?.trustedTester,
  );

  const [formData, setFormData] = useState<AssistantFormData>({
    displayName: '',
    styleAndFormattingInstructions: '',
    additionalSystemInstruction: '',
    defaultLanguage: '',
    defaultModelId: '',
    webGroundingType: 'WEB_GROUNDING_TYPE_DISABLED',
    mapsGroundingType: 'MAPS_GROUNDING_TYPE_DISABLED',
    customerPolicy: '{}',
    enableEndUserAgentCreation: false,
    disableLocationContext: false,
    defaultWebGroundingToggleOff: false,
    defaultMapsGroundingToggleOff: false,
    knowledgeCatalogEnabled: true,
    vertexAiSearchToolConfig: '{}',
    chatHistoryRetentionDays: '',
    chatHistoryRetentionIndefinite: false,
  });

  const [agentConfigs, setAgentConfigs] = useState<VertexAiAgentConfig[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [_availableEngines] = useState<ReasoningEngine[]>([]);
  const [_isLoadingEngines] = useState(false);
  const [_engineError] = useState<string | null>(null);

  const [currentEngine, setCurrentEngine] = useState<AppEngine | null>(null);
  const [iamPolicy, setIamPolicyLocal] = useState<IamPolicy | null>(null);
  const [pendingRemovedIamMembers, setPendingRemovedIamMembers] = useState<Set<string>>(new Set());
  const [newMember, setNewMember] = useState('');
  const [memberType, setMemberType] = useState('user:');
  const [appRole, setAppRole] = useState<string>('roles/discoveryengine.agentspaceUser');
  const [isLoadingIam, setIsLoadingIam] = useState(false);
  const [iamError, setIamError] = useState<string | null>(null);
  const [isIamDirty, setIsIamDirty] = useState(false);
  const [dataStoreAccessControlEnabled, setDataStoreAccessControlEnabled] = useState(false);

  // Model Armor & Customer Policy structured state variables
  const [templates, setTemplates] = useState<ModelArmorTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [selectedInputTemplate, setSelectedInputTemplate] = useState('');
  const [selectedOutputTemplate, setSelectedOutputTemplate] = useState('');
  const [failureMode, setFailureMode] = useState('FAIL_CLOSED');
  const [sdpPolicy, setSdpPolicy] = useState('');
  const [sdpPolicyError, setSdpPolicyError] = useState<string | null>(null);

  useEffect(() => {
    const loadTemplates = async () => {
      if (!config.projectId) return;
      setIsLoadingTemplates(true);
      try {
        const res = await api.fetchModelArmorTemplates({
          projectId: config.projectId,
          appLocation: 'global',
          collectionId: '',
          appId: '',
          assistantId: '',
        });
        setTemplates(res.templates || []);
      } catch (err) {
        console.warn('Failed to fetch Model Armor templates for assistant configuration', err);
      } finally {
        setIsLoadingTemplates(false);
      }
    };
    loadTemplates();
  }, [config.projectId]);

  useEffect(() => {
    const policyObj = (assistant.customerPolicy ? { ...assistant.customerPolicy } : {}) as Record<string, unknown>;
    const armorConfig = (policyObj.modelArmorConfig || {}) as Record<string, string>;

    setSelectedInputTemplate(armorConfig.userPromptTemplate || '');
    setSelectedOutputTemplate(armorConfig.responseTemplate || '');
    setFailureMode(armorConfig.failureMode || 'FAIL_CLOSED');

    const initialSdp = extractSdpPolicyFromObj(policyObj);
    setSdpPolicy(initialSdp);
    setSdpPolicyError(
      initialSdp.trim() && !SDP_CONTENT_POLICY_REGEX.test(initialSdp.trim())
        ? SDP_FORMAT_ERROR
        : null,
    );

    const sessionConfig = currentEngine?.sessionConfig as
      | { sessionTtl?: { days?: number; indefinite?: boolean } }
      | undefined;
    const isIndefinite = Boolean(sessionConfig?.sessionTtl?.indefinite);
    const retention =
      !isIndefinite && sessionConfig?.sessionTtl?.days !== undefined
        ? String(sessionConfig.sessionTtl.days)
        : '';

    const sysInstruction = assistant.generationConfig?.systemInstruction?.additionalSystemInstruction || '';
    const styleInstruction = assistant.styleAndFormattingInstructions || '';
    let combinedInstructions = '';
    if (sysInstruction && styleInstruction) {
      if (sysInstruction.trim() === styleInstruction.trim()) {
        combinedInstructions = sysInstruction;
      } else {
        combinedInstructions = `${sysInstruction}\n\n${styleInstruction}`;
      }
    } else {
      combinedInstructions = sysInstruction || styleInstruction || '';
    }

    setFormData({
      displayName: assistant.displayName || '',
      styleAndFormattingInstructions: combinedInstructions,
      additionalSystemInstruction: combinedInstructions,
      defaultLanguage: assistant.generationConfig?.defaultLanguage || '',
      defaultModelId: assistant.generationConfig?.defaultModelId || '',
      webGroundingType: assistant.webGroundingType || 'WEB_GROUNDING_TYPE_DISABLED',
      mapsGroundingType: assistant.mapsGroundingType || 'MAPS_GROUNDING_TYPE_DISABLED',
      customerPolicy: Object.keys(policyObj).length > 0 ? JSON.stringify(policyObj, null, 2) : '{}',
      enableEndUserAgentCreation: assistant.enableEndUserAgentCreation || false,
      disableLocationContext: assistant.disableLocationContext || false,
      defaultWebGroundingToggleOff: assistant.defaultWebGroundingToggleOff || false,
      defaultMapsGroundingToggleOff: assistant.defaultMapsGroundingToggleOff || false,
      knowledgeCatalogEnabled: assistant.knowledgeCatalogEnabled ?? true,
      vertexAiSearchToolConfig: assistant.vertexAiSearchToolConfig ? JSON.stringify(assistant.vertexAiSearchToolConfig, null, 2) : '{}',
      chatHistoryRetentionDays: retention,
      chatHistoryRetentionIndefinite: isIndefinite,
    });
    setAgentConfigs(assistant.vertexAiAgentConfigs ? JSON.parse(JSON.stringify(assistant.vertexAiAgentConfigs)) : []);
  }, [assistant, currentEngine]);

  const parsedCustomerPolicy = useMemo(
    () => parsePolicySafe(formData.customerPolicy),
    [formData.customerPolicy],
  );

  const bannedPhrases: BannedPhraseItem[] = useMemo(() => {
    const raw = parsedCustomerPolicy?.bannedPhrases;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item) => ({
        phrase: typeof item.phrase === 'string' ? item.phrase : '',
        matchType:
          item.matchType === 'WORD_BOUNDARY_STRING_MATCH' ||
          item.matchType === 'SIMPLE_STRING_MATCH'
            ? item.matchType
            : 'SIMPLE_STRING_MATCH',
        ignoreDiacritics: Boolean(item.ignoreDiacritics),
      }));
  }, [parsedCustomerPolicy]);

  const agentReasoningHidden = Boolean(parsedCustomerPolicy?.agentReasoningHidden);

  const mutateCustomerPolicy = (mutator: (draft: Record<string, unknown>) => void) => {
    const currentPolicy: Record<string, unknown> = parsePolicySafe(formData.customerPolicy)
      ? JSON.parse(formData.customerPolicy || '{}')
      : {};
    mutator(currentPolicy);
    setFormData((prev) => ({
      ...prev,
      customerPolicy: JSON.stringify(currentPolicy, null, 2),
    }));
  };

  const updateArmorPolicy = (
    inputVal: string,
    outputVal: string,
    failModeVal: string,
  ) => {
    mutateCustomerPolicy((currentPolicy) => {
      if (inputVal || outputVal) {
        const armorConfig: Record<string, string> = {
          ...((currentPolicy.modelArmorConfig as Record<string, string>) || {}),
        };
        if (inputVal) {
          armorConfig.userPromptTemplate = inputVal;
        } else {
          delete armorConfig.userPromptTemplate;
        }
        if (outputVal) {
          armorConfig.responseTemplate = outputVal;
        } else {
          delete armorConfig.responseTemplate;
        }
        armorConfig.failureMode = failModeVal;
        currentPolicy.modelArmorConfig = armorConfig;
      } else {
        delete currentPolicy.modelArmorConfig;
      }
    });
  };

  const handleInputTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedInputTemplate(val);
    updateArmorPolicy(val, selectedOutputTemplate, failureMode);
  };

  const handleOutputTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedOutputTemplate(val);
    updateArmorPolicy(selectedInputTemplate, val, failureMode);
  };

  const handleFailureModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setFailureMode(val);
    updateArmorPolicy(selectedInputTemplate, selectedOutputTemplate, val);
  };

  const handleAddBannedPhrase = (
    phrase: string,
    matchType: BannedPhraseMatchType,
    ignoreDiacritics: boolean,
  ): boolean => {
    const trimmed = phrase.trim();
    if (!trimmed) {
      return false;
    }
    mutateCustomerPolicy((currentPolicy) => {
      const existing = Array.isArray(currentPolicy.bannedPhrases)
        ? [...currentPolicy.bannedPhrases]
        : [];
      existing.push({
        phrase: trimmed,
        matchType,
        ignoreDiacritics,
      });
      currentPolicy.bannedPhrases = existing;
    });
    return true;
  };

  const handleRemoveBannedPhrase = (index: number) => {
    mutateCustomerPolicy((currentPolicy) => {
      if (!Array.isArray(currentPolicy.bannedPhrases)) return;
      const next = currentPolicy.bannedPhrases.filter((_, i) => i !== index);
      if (next.length > 0) {
        currentPolicy.bannedPhrases = next;
      } else {
        delete currentPolicy.bannedPhrases;
      }
    });
  };

  const handleSdpPolicyChange = (val: string) => {
    setSdpPolicy(val);
    const trimmed = val.trim();
    if (!trimmed) {
      setSdpPolicyError(null);
      mutateCustomerPolicy((currentPolicy) => {
        delete currentPolicy.dataProtectionPolicy;
      });
      return;
    }
    if (!SDP_CONTENT_POLICY_REGEX.test(trimmed)) {
      setSdpPolicyError(SDP_FORMAT_ERROR);
      return;
    }
    setSdpPolicyError(null);
    mutateCustomerPolicy((currentPolicy) => {
      currentPolicy.dataProtectionPolicy = {
        sensitiveDataProtectionPolicy: {
          policy: trimmed,
        },
      };
    });
  };

  const handleAgentReasoningHiddenChange = (hidden: boolean) => {
    mutateCustomerPolicy((currentPolicy) => {
      if (hidden) {
        currentPolicy.agentReasoningHidden = true;
      } else {
        delete currentPolicy.agentReasoningHidden;
      }
    });
  };

  const handleRetentionPresetSelect = (days: number) => {
    setFormData((prev) => ({
      ...prev,
      chatHistoryRetentionDays: String(days),
      chatHistoryRetentionIndefinite: false,
    }));
  };

  const handleRetentionIndefiniteSelect = () => {
    if (!isGoogleInternal) return;
    setFormData((prev) => ({
      ...prev,
      chatHistoryRetentionDays: '',
      chatHistoryRetentionIndefinite: true,
    }));
  };

  const armorEnabled = Boolean(selectedInputTemplate || selectedOutputTemplate);

  useEffect(() => {
    const fetchCurrentEngine = async () => {
      if (!config.appId) return;
      try {
        const engine = await api.getEngine(config.appId, config);
        setCurrentEngine(engine);
      } catch (e) {
        console.warn('Failed to fetch current engine', e);
      }
    };
    fetchCurrentEngine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.appId, config.projectId, config.appLocation, config.collectionId]);

  useEffect(() => {
    const fetchIamPolicy = async () => {
      if (!config.appId) return;
      setIsLoadingIam(true);
      setIamError(null);
      try {
        const policy = await api.getEngineIamPolicy(config.appId, config);
        setIamPolicyLocal(policy);
        setPendingRemovedIamMembers(new Set());
        if (config.projectId && typeof api.getDiscoveryProjectConfig === 'function') {
          try {
            const projConfig = await api.getDiscoveryProjectConfig(
              config.projectId,
              config.appLocation || 'global'
            );
            setDataStoreAccessControlEnabled(extractDataStoreAccessControlEnabled(projConfig));
          } catch {
            // Keep default false if project config cannot be fetched
          }
        }
      } catch (e: unknown) {
        setIamError(toErrorMessage(e) || 'Failed to fetch IAM policy.');
      } finally {
        setIsLoadingIam(false);
      }
    };
    fetchIamPolicy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.appId, config.projectId, config.appLocation, config.collectionId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    if (e.target.name === 'additionalSystemInstruction') {
      setFormData({
        ...formData,
        additionalSystemInstruction: value as string,
        styleAndFormattingInstructions: value as string,
      });
      return;
    }
    if (e.target.name === 'chatHistoryRetentionDays') {
      setFormData({
        ...formData,
        chatHistoryRetentionDays: value as string,
        chatHistoryRetentionIndefinite: false,
      });
      return;
    }
    if (e.target.name === 'customerPolicy') {
      const rawStr = value as string;
      setFormData({ ...formData, customerPolicy: rawStr });
      const parsed = parsePolicySafe(rawStr);
      if (parsed) {
        const armorConfig = (parsed.modelArmorConfig || {}) as Record<string, string>;
        setSelectedInputTemplate(armorConfig.userPromptTemplate || '');
        setSelectedOutputTemplate(armorConfig.responseTemplate || '');
        setFailureMode(armorConfig.failureMode || 'FAIL_CLOSED');
        const nextSdp = extractSdpPolicyFromObj(parsed);
        setSdpPolicy(nextSdp);
        setSdpPolicyError(
          nextSdp.trim() && !SDP_CONTENT_POLICY_REGEX.test(nextSdp.trim())
            ? SDP_FORMAT_ERROR
            : null,
        );
      }
      return;
    }
    setFormData({ ...formData, [e.target.name]: value });
  };

  const handleRemoveAgentConfig = (index: number) => {
    setAgentConfigs(agentConfigs.filter((_, i) => i !== index));
  };

  const handleAddIamMember = async () => {
    const trimmedMember = newMember.trim();
    if (!trimmedMember || !iamPolicy) return;
    let memberString = trimmedMember;

    if (!memberString.includes(':') && !memberString.startsWith('principal://') && !memberString.startsWith('principalSet://')) {
      memberString = `${memberType}${memberString}`;
    }

    const isDelegatedAdminOrViewer =
      appRole === 'roles/discoveryengine.agentspaceAdmin' ||
      appRole === 'roles/discoveryengine.agentspaceViewer';
    const customPersona = isDelegatedAdminOrViewer ? 'admin' : 'endUser';

    const targetProjectRoles = dataStoreAccessControlEnabled
      ? isDelegatedAdminOrViewer
        ? [buildCustomRestrictedRoleName(config.projectId, 'admin')]
        : [
            buildCustomRestrictedRoleName(config.projectId, 'endUser'),
            'roles/discoveryengine.notebookLmUser',
          ]
      : isDelegatedAdminOrViewer
        ? [buildCustomRestrictedRoleName(config.projectId, 'admin')]
        : ['roles/discoveryengine.agentspaceRestrictedUser'];

    const needsCustomProjectRole = dataStoreAccessControlEnabled || isDelegatedAdminOrViewer;
    let engineStepCompleted = !config.appId;

    try {
      setIamError(null);
      setIsLoadingIam(true);

      if (config.appId) {
        const removalsToApply = Array.from(pendingRemovedIamMembers).filter(
          (m) => m !== memberString,
        );
        const savedEnginePolicy = await retryIamReadModifyWrite({
          getPolicy: () => api.getEngineIamPolicy(config.appId, config),
          setPolicy: (p) => api.setEngineIamPolicy(config.appId, p, config),
          modify: (currentEnginePolicy) => {
            let working = currentEnginePolicy;
            let changed = false;
            for (const removed of removalsToApply) {
              const remRes = removeMemberFromRoles(
                working,
                isAppLevelIamRole,
                removed,
              );
              working = remRes.policy;
              if (remRes.changed) changed = true;
            }
            const addRes = addMemberToRoles(
              working,
              [appRole],
              memberString,
            );
            return {
              policy: addRes.policy,
              changed: changed || addRes.changed,
            };
          },
        });
        setIamPolicyLocal(savedEnginePolicy);
        setPendingRemovedIamMembers(new Set());
        setIsIamDirty(false);
        engineStepCompleted = true;
      } else {
        const { policy: updatedLocalPolicy } = addMemberToRoles(
          cloneIamPolicy(iamPolicy),
          [appRole],
          memberString,
        );
        setIamPolicyLocal(updatedLocalPolicy);
        setIsIamDirty(true);
      }

      if (
        needsCustomProjectRole &&
        config.projectId &&
        typeof api.getCustomRole === 'function' &&
        typeof api.createCustomRole === 'function'
      ) {
        await ensureCustomRestrictedProjectRole({
          projectId: config.projectId,
          persona: customPersona,
          getCustomRole: api.getCustomRole,
          createCustomRole: api.createCustomRole,
          updateCustomRole: api.updateCustomRole,
          undeleteCustomRole: api.undeleteCustomRole,
        });
      }

      await retryIamReadModifyWrite({
        getPolicy: () => api.getProjectIamPolicy(config.projectId),
        setPolicy: (p) => api.setProjectIamPolicy(config.projectId, p),
        modify: (currentProjectPolicy) =>
          addMemberToRoles(currentProjectPolicy, targetProjectRoles, memberString),
      });

      setNewMember('');
      setSuccess(
        dataStoreAccessControlEnabled
          ? `Granted ${appRole.replace('roles/discoveryengine.', '')} on this App and ${targetProjectRoles.join(' + ')} at the project level (Granular DataStore Access Control active — grant DataStore access in DataStore Permissions).`
          : `Granted ${appRole.replace('roles/discoveryengine.', '')} on this App and ${targetProjectRoles.join(' + ')} at the project level (App-Only Access Control).`
      );
      setTimeout(() => setSuccess(null), 4000);
    } catch (e: unknown) {
      if (!engineStepCompleted) {
        setIamError(
          `Failed to grant app-level access (${appRole}): ${toErrorMessage(e)}`
        );
      } else {
        setIamError(
          `Failed to grant mandatory project-level access (${targetProjectRoles.join(', ')}): ${toErrorMessage(e)}`
        );
      }
    } finally {
      setIsLoadingIam(false);
    }
  };

  const handleRemoveIamMember = (member: string) => {
    if (!iamPolicy) return;
    const { policy: updatedPolicy, changed } = removeMemberFromRoles(
      iamPolicy,
      isAppLevelIamRole,
      member,
    );
    if (!changed) return;

    setPendingRemovedIamMembers((prev) => {
      const next = new Set(prev);
      next.add(member);
      return next;
    });
    setIamPolicyLocal(updatedPolicy);
    setIsIamDirty(true);
  };

  const buildDiff = (): {
    payload: Partial<Assistant>;
    updateMask: string[];
    enginePayload: Partial<AppEngine> | null;
    validationError?: string;
  } => {
    const payload: Partial<Assistant> = {};
    const updateMask: string[] = [];

    const origSys = assistant.generationConfig?.systemInstruction?.additionalSystemInstruction || '';
    const origStyle = assistant.styleAndFormattingInstructions || '';
    const origCombined =
      origSys && origStyle && origSys.trim() !== origStyle.trim()
        ? `${origSys}\n\n${origStyle}`
        : origSys || origStyle || '';
    const origDefaultLang = assistant.generationConfig?.defaultLanguage || '';
    const origDefaultModel = assistant.generationConfig?.defaultModelId || '';

    const sysChanged = formData.additionalSystemInstruction !== origCombined;
    const langChanged = formData.defaultLanguage.trim() !== origDefaultLang;
    const modelChanged = formData.defaultModelId.trim() !== origDefaultModel;

    if (sysChanged || langChanged || modelChanged) {
      payload.generationConfig = {};
      if (sysChanged) {
        payload.generationConfig.systemInstruction = {
          additionalSystemInstruction: formData.additionalSystemInstruction,
        };
        updateMask.push('generationConfig.systemInstruction');

        payload.styleAndFormattingInstructions = formData.additionalSystemInstruction;
        updateMask.push('styleAndFormattingInstructions');
      }
      if (langChanged) {
        payload.generationConfig.defaultLanguage = formData.defaultLanguage.trim();
        updateMask.push('generationConfig.defaultLanguage');
      }
      if (modelChanged) {
        payload.generationConfig.defaultModelId = formData.defaultModelId.trim();
        updateMask.push('generationConfig.defaultModelId');
      }
    }

    if (formData.webGroundingType !== (assistant.webGroundingType || 'WEB_GROUNDING_TYPE_DISABLED')) {
      payload.webGroundingType = formData.webGroundingType;
      updateMask.push('webGroundingType');
    }

    if (isTrustedTester) {
      if (formData.mapsGroundingType !== (assistant.mapsGroundingType || 'MAPS_GROUNDING_TYPE_DISABLED')) {
        payload.mapsGroundingType = formData.mapsGroundingType as Assistant['mapsGroundingType'];
        updateMask.push('mapsGroundingType');
      }
      if (formData.defaultMapsGroundingToggleOff !== (assistant.defaultMapsGroundingToggleOff || false)) {
        payload.defaultMapsGroundingToggleOff = formData.defaultMapsGroundingToggleOff;
        updateMask.push('defaultMapsGroundingToggleOff');
      }
    }

    let policyObj: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse(formData.customerPolicy);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {
          payload,
          updateMask,
          enginePayload: null,
          validationError: 'Customer Policy must be a JSON object.',
        };
      }
      policyObj = parsed as Record<string, unknown>;
    } catch {
      return {
        payload,
        updateMask,
        enginePayload: null,
        validationError: 'Customer Policy is not valid JSON.',
      };
    }

    if (sdpPolicy.trim() && !SDP_CONTENT_POLICY_REGEX.test(sdpPolicy.trim())) {
      return {
        payload,
        updateMask,
        enginePayload: null,
        validationError: SDP_FORMAT_ERROR,
      };
    }

    if (policyObj.dataProtectionPolicy !== undefined) {
      const rawSdp = extractSdpPolicyFromObj(policyObj);
      if (!rawSdp.trim() || !SDP_CONTENT_POLICY_REGEX.test(rawSdp.trim())) {
        return {
          payload,
          updateMask,
          enginePayload: null,
          validationError: SDP_FORMAT_ERROR,
        };
      }
    }

    if (policyObj.bannedPhrases !== undefined) {
      if (
        !Array.isArray(policyObj.bannedPhrases) ||
        policyObj.bannedPhrases.some(
          (bp) =>
            !bp ||
            typeof bp !== 'object' ||
            typeof (bp as { phrase?: unknown }).phrase !== 'string' ||
            (bp as { phrase: string }).phrase.trim().length === 0,
        )
      ) {
        return {
          payload,
          updateMask,
          enginePayload: null,
          validationError: 'Banned phrases cannot contain empty or whitespace-only entries.',
        };
      }
    }

    const originalPolicyString = assistant.customerPolicy ? JSON.stringify(assistant.customerPolicy) : '{}';
    const currentPolicyString = JSON.stringify(policyObj);

    if (currentPolicyString !== originalPolicyString) {
      payload.customerPolicy = policyObj;
      updateMask.push('customerPolicy');
    }

    let enginePayload: Partial<AppEngine> | null = null;
    const sessionConfig = currentEngine?.sessionConfig as
      | { sessionTtl?: { days?: number; indefinite?: boolean } }
      | undefined;
    const currentDays = sessionConfig?.sessionTtl?.days;
    const currentIndefinite = Boolean(sessionConfig?.sessionTtl?.indefinite);

    if (isGoogleInternal && formData.chatHistoryRetentionIndefinite) {
      if (!currentIndefinite) {
        enginePayload = {
          sessionConfig: {
            sessionTtl: {
              indefinite: true,
            },
          },
        };
      }
    } else {
      const newDays = formData.chatHistoryRetentionDays
        ? parseInt(formData.chatHistoryRetentionDays, 10)
        : undefined;
      if (newDays !== undefined && !isNaN(newDays) && newDays >= 1) {
        if (currentIndefinite || newDays !== currentDays) {
          enginePayload = {
            sessionConfig: {
              sessionTtl: {
                days: newDays,
              },
            },
          };
        }
      }
    }

    if (formData.enableEndUserAgentCreation !== (assistant.enableEndUserAgentCreation || false)) {
      payload.enableEndUserAgentCreation = formData.enableEndUserAgentCreation;
      updateMask.push('enableEndUserAgentCreation');
    }
    if (formData.disableLocationContext !== (assistant.disableLocationContext || false)) {
      payload.disableLocationContext = formData.disableLocationContext;
      updateMask.push('disableLocationContext');
    }
    if (formData.defaultWebGroundingToggleOff !== (assistant.defaultWebGroundingToggleOff || false)) {
      payload.defaultWebGroundingToggleOff = formData.defaultWebGroundingToggleOff;
      updateMask.push('defaultWebGroundingToggleOff');
    }
    if (formData.knowledgeCatalogEnabled !== (assistant.knowledgeCatalogEnabled ?? true)) {
      payload.knowledgeCatalogEnabled = formData.knowledgeCatalogEnabled;
      updateMask.push('knowledgeCatalogEnabled');
    }

    const origSearchToolStr = assistant.vertexAiSearchToolConfig
      ? JSON.stringify(assistant.vertexAiSearchToolConfig, null, 2)
      : '{}';
    if (formData.vertexAiSearchToolConfig !== origSearchToolStr) {
      try {
        payload.vertexAiSearchToolConfig = JSON.parse(formData.vertexAiSearchToolConfig);
        updateMask.push('vertexAiSearchToolConfig');
      } catch {
        return {
          payload,
          updateMask,
          enginePayload,
          validationError: 'Vertex AI Search Tool Config is not valid JSON.',
        };
      }
    }

    const originalConfigs = assistant.vertexAiAgentConfigs || [];
    if (JSON.stringify(agentConfigs) !== JSON.stringify(originalConfigs)) {
      payload.vertexAiAgentConfigs = agentConfigs;
      updateMask.push('vertexAiAgentConfigs');
    }

    return { payload, updateMask, enginePayload };
  };

  const performUpdate = async () => {
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const { payload, updateMask, enginePayload, validationError } = buildDiff();
      if (validationError) {
        setError(validationError);
        setIsSubmitting(false);
        return;
      }

      let assistantUpdated = false;
      let engineUpdated = false;
      let iamUpdated = false;

      if (updateMask.length > 0) {
        const updated = await api.updateAssistant(assistant.name, payload, updateMask, config);
        onUpdateSuccess(updated);
        assistantUpdated = true;
      }

      if (enginePayload && config.appId) {
        await api.updateEngine(config.appId, enginePayload, ['sessionConfig.sessionTtl'], config);
        engineUpdated = true;
      }

      if (isIamDirty && iamPolicy && config.appId) {
        const removalsToApply = Array.from(pendingRemovedIamMembers);
        if (removalsToApply.length > 0) {
          const savedEnginePolicy = await retryIamReadModifyWrite({
            getPolicy: () => api.getEngineIamPolicy(config.appId, config),
            setPolicy: (p) => api.setEngineIamPolicy(config.appId, p, config),
            modify: (currentEnginePolicy) => {
              let working = currentEnginePolicy;
              let changed = false;
              for (const removed of removalsToApply) {
                const remRes = removeMemberFromRoles(
                  working,
                  isAppLevelIamRole,
                  removed,
                );
                working = remRes.policy;
                if (remRes.changed) changed = true;
              }
              return { policy: working, changed };
            },
          });
          setIamPolicyLocal(savedEnginePolicy);
          setPendingRemovedIamMembers(new Set());
        } else {
          const saved = await api.setEngineIamPolicy(config.appId, iamPolicy, config);
          if (saved && typeof saved === 'object') {
            setIamPolicyLocal(saved);
          }
        }
        setIsIamDirty(false);
        iamUpdated = true;
      }

      if (engineUpdated && config.appId) {
        try {
          const updatedEngine = await api.getEngine(config.appId, config);
          setCurrentEngine(updatedEngine);
        } catch (e) {
          console.warn('Failed to reload engine after update', e);
        }
      }

      if (assistantUpdated || engineUpdated || iamUpdated) {
        setSuccess('Updates applied successfully!');
      } else {
        setSuccess('No changes detected.');
      }
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      setError(toErrorMessage(err) || 'Failed to update assistant.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await performUpdate();
  };

  const curlCommand = useMemo(() => {
    const { payload, updateMask, enginePayload, validationError } = buildDiff();
    if (validationError) return null;
    if (updateMask.length === 0 && !enginePayload) return null;

    const baseUrl = config.appLocation === 'global'
      ? 'https://discoveryengine.googleapis.com'
      : `https://${config.appLocation}-discoveryengine.googleapis.com`;

    let result = '';
    if (updateMask.length > 0) {
      const assistantUrl = `${baseUrl}/v1alpha/${assistant.name}?updateMask=${updateMask.join(',')}`;
      result += `# Update Assistant\ncurl -X PATCH \\\n  "${assistantUrl}" \\\n  -H "Authorization: Bearer \\$(gcloud auth print-access-token)" \\\n  -H "Content-Type: application/json" \\\n  -H "X-Goog-User-Project: ${config.projectId}" \\\n  -d '${JSON.stringify(payload, null, 2)}'\n`;
    }

    if (enginePayload) {
      const engineLoc = config.appLocation || 'global';
      const engineCol = config.collectionId || 'default_collection';
      const engineUrl = `${baseUrl}/v1alpha/projects/${config.projectId}/locations/${engineLoc}/collections/${engineCol}/engines/${config.appId}?updateMask=sessionConfig.sessionTtl`;
      if (result) result += '\n';
      result += `# Update Engine (Chat Retention)\ncurl -X PATCH \\\n  "${engineUrl}" \\\n  -H "Authorization: Bearer \\$(gcloud auth print-access-token)" \\\n  -H "Content-Type: application/json" \\\n  -H "X-Goog-User-Project: ${config.projectId}" \\\n  -d '${JSON.stringify(enginePayload, null, 2)}'`;
    }

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    formData,
    agentConfigs,
    assistant,
    currentEngine,
    config,
    isGoogleInternal,
    isTrustedTester,
    sdpPolicy,
  ]);

  return {
    formData,
    setFormData,
    handleChange,
    agentConfigs,
    handleRemoveAgentConfig,
    isSubmitting,
    error,
    success,
    isGoogleInternal,
    isTrustedTester,
    templates,
    isLoadingTemplates,
    selectedInputTemplate,
    selectedOutputTemplate,
    failureMode,
    armorEnabled,
    handleInputTemplateChange,
    handleOutputTemplateChange,
    handleFailureModeChange,
    bannedPhrases,
    handleAddBannedPhrase,
    handleRemoveBannedPhrase,
    sdpPolicy,
    sdpPolicyError,
    handleSdpPolicyChange,
    agentReasoningHidden,
    handleAgentReasoningHiddenChange,
    handleRetentionPresetSelect,
    handleRetentionIndefiniteSelect,
    iamPolicy,
    newMember,
    setNewMember,
    memberType,
    setMemberType,
    appRole,
    setAppRole,
    isLoadingIam,
    iamError,
    dataStoreAccessControlEnabled,
    handleAddIamMember,
    handleRemoveIamMember,
    handleSubmit,
    curlCommand,
  };
}
