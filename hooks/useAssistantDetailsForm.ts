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
import { AssistantFormData } from '../components/assistants/form/types';
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

export function useAssistantDetailsForm(
  assistant: Assistant,
  config: Config,
  onUpdateSuccess: (updatedAssistant: Assistant) => void,
) {
  const [formData, setFormData] = useState<AssistantFormData>({
    displayName: '',
    styleAndFormattingInstructions: '',
    additionalSystemInstruction: '',
    webGroundingType: 'WEB_GROUNDING_TYPE_DISABLED',
    customerPolicy: '{}',
    enableEndUserAgentCreation: false,
    disableLocationContext: false,
    defaultWebGroundingToggleOff: false,
    vertexAiSearchToolConfig: '{}',
    chatHistoryRetentionDays: '',
  });

  const [agentConfigs, setAgentConfigs] = useState<VertexAiAgentConfig[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [availableEngines, setAvailableEngines] = useState<ReasoningEngine[]>([]);
  const [isLoadingEngines, setIsLoadingEngines] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);

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

  // Model Armor state variables
  const [templates, setTemplates] = useState<ModelArmorTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [selectedInputTemplate, setSelectedInputTemplate] = useState('');
  const [selectedOutputTemplate, setSelectedOutputTemplate] = useState('');
  const [failureMode, setFailureMode] = useState('FAIL_CLOSED');

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

    const sessionConfig = currentEngine?.sessionConfig as { sessionTtl?: { days?: number } } | undefined;
    const retention = sessionConfig?.sessionTtl?.days !== undefined
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
      webGroundingType: assistant.webGroundingType || 'WEB_GROUNDING_TYPE_DISABLED',
      customerPolicy: Object.keys(policyObj).length > 0 ? JSON.stringify(policyObj, null, 2) : '{}',
      enableEndUserAgentCreation: assistant.enableEndUserAgentCreation || false,
      disableLocationContext: assistant.disableLocationContext || false,
      defaultWebGroundingToggleOff: assistant.defaultWebGroundingToggleOff || false,
      vertexAiSearchToolConfig: assistant.vertexAiSearchToolConfig ? JSON.stringify(assistant.vertexAiSearchToolConfig, null, 2) : '{}',
      chatHistoryRetentionDays: retention,
    });
    setAgentConfigs(assistant.vertexAiAgentConfigs ? JSON.parse(JSON.stringify(assistant.vertexAiAgentConfigs)) : []);
  }, [assistant, currentEngine]);

  const updateArmorPolicy = (
    inputVal: string,
    outputVal: string,
    failModeVal: string,
  ) => {
    let currentPolicy: Record<string, unknown> = {};
    try {
      currentPolicy = JSON.parse(formData.customerPolicy || '{}');
    } catch {
      // Keep empty if invalid
    }

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

    setFormData(prev => ({
      ...prev,
      customerPolicy: JSON.stringify(currentPolicy, null, 2),
    }));
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

    // Align project-level baseline roles with Google Cloud GA standards:
    // - Model A (App-Only mode, dataStoreAccessControlEnabled = false):
    //   Predefined `roles/discoveryengine.agentspaceRestrictedUser` (includes NotebookLM, OAuth,
    //   and dataStores.get/collections.get for all DataStores attached to allowed Apps).
    //   (If delegating Admin/Viewer, uses `projects/{id}/roles/customRestrictedAdmin`).
    // - Model B (App + DataStore Granular mode, dataStoreAccessControlEnabled = true):
    //   Custom role `projects/{id}/roles/customRestrictedEndUser` + `roles/discoveryengine.notebookLmUser`
    //   (or `customRestrictedAdmin` for delegated Admin/Viewer), strictly avoiding
    //   `roles/discoveryengine.agentspaceRestrictedUser` so DataStore isolation is preserved.
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

      // Step 1: Grant app-level Engine IAM role FIRST via full Read-Modify-Write with backoff.
      // Discovery Engine `engines:setIamPolicy` can trigger backend updates to the GCP project's
      // IAM policy (advancing the project ETag). Completing the Engine write *before* reading the
      // Project IAM policy eliminates self-inflicted project ETag conflicts.
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

      // Step 2a: Ensure custom project role exists when required by GA DataStore / Delegated Admin standards
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

      // Step 2b: Grant mandatory project-level baseline roles using full Read-Modify-Write
      // with exponential backoff so concurrent project IAM changes automatically retry cleanly.
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

  const performUpdate = async () => {
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const payload: Partial<Assistant> = {};
      const updateMask: string[] = [];

      const origSys = assistant.generationConfig?.systemInstruction?.additionalSystemInstruction || '';
      const origStyle = assistant.styleAndFormattingInstructions || '';
      const origCombined =
        origSys && origStyle && origSys.trim() !== origStyle.trim()
          ? `${origSys}\n\n${origStyle}`
          : origSys || origStyle || '';
      if (formData.additionalSystemInstruction !== origCombined) {
        payload.generationConfig = {
          systemInstruction: {
            additionalSystemInstruction: formData.additionalSystemInstruction,
          },
        };
        updateMask.push('generationConfig.systemInstruction');

        payload.styleAndFormattingInstructions = formData.additionalSystemInstruction;
        updateMask.push('styleAndFormattingInstructions');
      }
      if (formData.webGroundingType !== (assistant.webGroundingType || 'WEB_GROUNDING_TYPE_DISABLED')) {
        payload.webGroundingType = formData.webGroundingType;
        updateMask.push('webGroundingType');
      }

      let policyObj: Record<string, unknown>;
      try {
        policyObj = JSON.parse(formData.customerPolicy);
      } catch {
        setError('Customer Policy is not valid JSON.');
        setIsSubmitting(false);
        return;
      }

      const originalPolicyString = assistant.customerPolicy ? JSON.stringify(assistant.customerPolicy) : '{}';
      const currentPolicyString = JSON.stringify(policyObj);

      if (currentPolicyString !== originalPolicyString) {
        payload.customerPolicy = policyObj;
        updateMask.push('customerPolicy');
      }

      let engineUpdatePayload: Partial<AppEngine> | null = null;
      const sessionConfig = currentEngine?.sessionConfig as { sessionTtl?: { days?: number } } | undefined;
      const currentDays = sessionConfig?.sessionTtl?.days;
      const newDays = formData.chatHistoryRetentionDays ? parseInt(formData.chatHistoryRetentionDays, 10) : undefined;

      if (newDays !== undefined && !isNaN(newDays)) {
        if (newDays !== currentDays) {
          engineUpdatePayload = {
            sessionConfig: {
              sessionTtl: {
                days: newDays,
              },
            },
          };
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

      if (formData.vertexAiSearchToolConfig !== (assistant.vertexAiSearchToolConfig ? JSON.stringify(assistant.vertexAiSearchToolConfig, null, 2) : '{}')) {
        try {
          payload.vertexAiSearchToolConfig = JSON.parse(formData.vertexAiSearchToolConfig);
          updateMask.push('vertexAiSearchToolConfig');
        } catch {
          setError('Vertex AI Search Tool Config is not valid JSON.');
          setIsSubmitting(false);
          return;
        }
      }

      const originalConfigs = assistant.vertexAiAgentConfigs || [];
      const configsChanged = JSON.stringify(agentConfigs) !== JSON.stringify(originalConfigs);
      if (configsChanged) {
        payload.vertexAiAgentConfigs = agentConfigs;
        updateMask.push('vertexAiAgentConfigs');
      }

      let assistantUpdated = false;
      let engineUpdated = false;
      let iamUpdated = false;

      if (updateMask.length > 0) {
        const updated = await api.updateAssistant(assistant.name, payload, updateMask, config);
        onUpdateSuccess(updated);
        assistantUpdated = true;
      }

      if (engineUpdatePayload && config.appId) {
        await api.updateEngine(config.appId, engineUpdatePayload, ['sessionConfig.sessionTtl.days'], config);
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
    const payload: Partial<Assistant> = {};
    const updateMask: string[] = [];

    const origSys = assistant.generationConfig?.systemInstruction?.additionalSystemInstruction || '';
    const origStyle = assistant.styleAndFormattingInstructions || '';
    const origCombined =
      origSys && origStyle && origSys.trim() !== origStyle.trim()
        ? `${origSys}\n\n${origStyle}`
        : origSys || origStyle || '';
    if (formData.additionalSystemInstruction !== origCombined) {
      payload.generationConfig = {
        systemInstruction: {
          additionalSystemInstruction: formData.additionalSystemInstruction,
        },
      };
      updateMask.push('generationConfig.systemInstruction');

      payload.styleAndFormattingInstructions = formData.additionalSystemInstruction;
      updateMask.push('styleAndFormattingInstructions');
    }
    if (formData.webGroundingType !== (assistant.webGroundingType || 'WEB_GROUNDING_TYPE_DISABLED')) {
      payload.webGroundingType = formData.webGroundingType;
      updateMask.push('webGroundingType');
    }

    let policyObj: Record<string, unknown> | null = null;
    try {
      policyObj = JSON.parse(formData.customerPolicy);
    } catch {
      // Ignore parse errors for preview
    }

    if (policyObj) {
      if (formData.chatHistoryRetentionDays) {
        const days = parseInt(formData.chatHistoryRetentionDays, 10);
        if (!isNaN(days)) {
          policyObj.chatHistoryRetentionDays = days;
        }
      }
    }

    const originalPolicyString = assistant.customerPolicy ? JSON.stringify(assistant.customerPolicy) : '{}';
    const currentPolicyString = JSON.stringify(policyObj);

    if (policyObj && currentPolicyString !== originalPolicyString) {
      payload.customerPolicy = policyObj;
      updateMask.push('customerPolicy');
    }

    let enginePayload: Partial<AppEngine> | null = null;
    const sessionConfig = currentEngine?.sessionConfig as { sessionTtl?: { days?: number } } | undefined;
    const currentDays = sessionConfig?.sessionTtl?.days;
    const newDays = formData.chatHistoryRetentionDays ? parseInt(formData.chatHistoryRetentionDays, 10) : undefined;

    if (newDays !== undefined && !isNaN(newDays) && newDays !== currentDays) {
      enginePayload = {
        sessionConfig: {
          sessionTtl: {
            days: newDays,
          },
        },
      };
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

    let searchToolConfigObj;
    try {
      searchToolConfigObj = JSON.parse(formData.vertexAiSearchToolConfig);
    } catch (e) {
      // Ignore
    }
    const originalSearchToolConfigString = assistant.vertexAiSearchToolConfig ? JSON.stringify(assistant.vertexAiSearchToolConfig) : '{}';
    const currentSearchToolConfigString = JSON.stringify(searchToolConfigObj);

    if (searchToolConfigObj && currentSearchToolConfigString !== originalSearchToolConfigString) {
      payload.vertexAiSearchToolConfig = searchToolConfigObj;
      updateMask.push('vertexAiSearchToolConfig');
    }

    const originalConfigsString = JSON.stringify(assistant.vertexAiAgentConfigs || []);
    const currentConfigsString = JSON.stringify(agentConfigs);

    if (originalConfigsString !== currentConfigsString) {
      payload.vertexAiAgentConfigs = agentConfigs;
      updateMask.push('vertexAiAgentConfigs');
    }

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
  }, [formData, agentConfigs, assistant, currentEngine, config]);

  return {
    formData,
    setFormData,
    handleChange,
    agentConfigs,
    handleRemoveAgentConfig,
    isSubmitting,
    error,
    success,
    templates,
    isLoadingTemplates,
    selectedInputTemplate,
    selectedOutputTemplate,
    failureMode,
    armorEnabled,
    handleInputTemplateChange,
    handleOutputTemplateChange,
    handleFailureModeChange,
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
