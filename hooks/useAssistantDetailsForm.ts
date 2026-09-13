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
  IamBinding,
} from '../types';
import * as api from '../services/apiService';
import { ModelArmorTemplate } from '../services/apiService';
import { AssistantFormData } from '../components/assistants/form/types';
import { toErrorMessage } from '../utils/errors';

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
  const [newMember, setNewMember] = useState('');
  const [memberType, setMemberType] = useState('user:');
  const [isLoadingIam, setIsLoadingIam] = useState(false);
  const [iamError, setIamError] = useState<string | null>(null);
  const [isIamDirty, setIsIamDirty] = useState(false);

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
  }, [config.appId, config]);

  useEffect(() => {
    const fetchIamPolicy = async () => {
      if (!config.appId) return;
      setIsLoadingIam(true);
      setIamError(null);
      try {
        const policy = await api.getEngineIamPolicy(config.appId, config);
        setIamPolicyLocal(policy);
      } catch (e: unknown) {
        setIamError(toErrorMessage(e) || 'Failed to fetch IAM policy.');
      } finally {
        setIsLoadingIam(false);
      }
    };
    fetchIamPolicy();
  }, [config.appId, config]);

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
    if (!newMember || !iamPolicy) return;
    let memberString = newMember;

    if (!memberString.includes(':') && !memberString.startsWith('principal://') && !memberString.startsWith('principalSet://')) {
      memberString = `${memberType}${memberString}`;
    }

    const updatedPolicy: IamPolicy = { ...iamPolicy };
    if (!updatedPolicy.bindings) updatedPolicy.bindings = [];

    let binding = updatedPolicy.bindings.find((b: IamBinding) => b.role === 'roles/discoveryengine.user');
    if (!binding) {
      binding = { role: 'roles/discoveryengine.user', members: [] };
      updatedPolicy.bindings.push(binding);
    }

    if (!binding.members) binding.members = [];

    if (!binding.members.includes(memberString)) {
      binding.members.push(memberString);
    }

    setIamPolicyLocal({ ...updatedPolicy });
    setIsIamDirty(true);
    setNewMember('');

    try {
      setIamError(null);
      setIsLoadingIam(true);
      const projectPolicy = await api.getProjectIamPolicy(config.projectId);
      let notebookBinding = projectPolicy.bindings?.find((b: IamBinding) => b.role === 'roles/discoveryengine.agentspaceRestrictedUser');
      if (!notebookBinding) {
        notebookBinding = { role: 'roles/discoveryengine.agentspaceRestrictedUser', members: [] };
        projectPolicy.bindings = projectPolicy.bindings || [];
        projectPolicy.bindings.push(notebookBinding);
      }
      if (!notebookBinding.members) notebookBinding.members = [];
      if (!notebookBinding.members.includes(memberString)) {
        notebookBinding.members.push(memberString);
      }
      await api.setProjectIamPolicy(config.projectId, projectPolicy);
      setSuccess('Granted local permissions and mandatory project-level Agentspace Restricted User access.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: unknown) {
      setIamError(`Failed to grant mandatory Agentspace Restricted User access: ${toErrorMessage(e)}`);
    } finally {
      setIsLoadingIam(false);
    }
  };

  const handleRemoveIamMember = (member: string) => {
    if (!iamPolicy) return;
    const updatedPolicy: IamPolicy = { ...iamPolicy };
    if (!updatedPolicy.bindings) return;

    const binding = updatedPolicy.bindings.find((b: IamBinding) => b.role === 'roles/discoveryengine.user');
    if (binding && binding.members) {
      binding.members = binding.members.filter((m: string) => m !== member);
    }

    setIamPolicyLocal({ ...updatedPolicy });
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
      if (formData.additionalSystemInstruction !== origSys || formData.additionalSystemInstruction !== origStyle) {
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
        await api.setEngineIamPolicy(config.appId, iamPolicy, config);
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
    if (formData.additionalSystemInstruction !== origSys || formData.additionalSystemInstruction !== origStyle) {
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
      const engineUrl = `${baseUrl}/v1alpha/projects/${config.projectId}/locations/global/collections/default_collection/engines/${config.appId}?updateMask=sessionConfig.sessionTtl`;
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
    isLoadingIam,
    iamError,
    handleAddIamMember,
    handleRemoveIamMember,
    handleSubmit,
    curlCommand,
  };
}
